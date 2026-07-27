import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  PaintOwner,
  TeamId,
  applyDelta,
  cellIndex,
  createGrid,
  decodeGrid,
  worldToCol,
  worldToRow,
} from '@splat04/shared';
import { createGameServer, type GameServer } from './app.js';

/** Minimal client harness: connects, records every server message, exposes waiters. */
class TestClient {
  readonly received: any[] = [];
  private socket!: WebSocket;
  playerId = '';
  roomId = '';
  team: TeamId = TeamId.Cyan;
  grid = createGrid();

  constructor(private readonly port: number) {}

  async connect(guestId: string, displayName: string): Promise<void> {
    this.socket = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      this.received.push(message);
      if (message.t === 'welcome') {
        this.playerId = message.playerId;
        this.roomId = message.roomId;
        this.team = message.team;
        this.grid = decodeGrid(message.grid);
      }
      if (message.t === 'snap' && message.delta.length > 0) applyDelta(this.grid, message.delta);
      if (message.t === 'gridReset') this.grid = createGrid();
    });

    this.send({
      t: 'hello',
      v: 1,
      guestId,
      displayName,
      marker: 'compressor',
      matchesCompleted: 99,
      unlockAll: true,
    });
    await this.waitFor((m) => m.t === 'welcome');
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  sendInput(seq: number, patch: Record<string, unknown>): void {
    this.send({
      t: 'input',
      input: {
        seq,
        moveX: 0,
        moveZ: 0,
        aimX: 1,
        aimZ: 0,
        firing: false,
        boostPressed: false,
        selectedMarker: 'compressor',
        clientTime: Date.now(),
        ...patch,
      },
    });
  }

  waitFor(predicate: (m: any) => boolean, timeoutMs = 5000): Promise<any> {
    const existing = this.received.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timed out waiting for a server message')),
        timeoutMs,
      );
      const onMessage = (raw: unknown) => {
        const message = JSON.parse(String(raw));
        if (predicate(message)) {
          clearTimeout(timer);
          this.socket.off('message', onMessage);
          resolve(message);
        }
      };
      this.socket.on('message', onMessage);
    });
  }

  close(): void {
    this.socket.close();
  }
}

let server: GameServer;
let port: number;

beforeAll(async () => {
  server = createGameServer({ webDist: '/nonexistent-dist' });
  port = await server.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await server.close();
});

describe('server integration', () => {
  it('serves /api/health', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.arena).toBe('vice-estate-04');
  });

  it('runs a full room: two clients, a validated shot, a grid delta and a score update', async () => {
    // 1. Two simulated clients join.
    const alice = new TestClient(port);
    const bob = new TestClient(port);
    await alice.connect('g_alice', 'Alice');
    await bob.connect('g_bob', 'Bob');

    expect(alice.playerId).not.toBe(bob.playerId);
    // 2. Both land in the same continuous room, which is still full at eight.
    expect(alice.roomId).toBe(bob.roomId);

    const room = server.rooms.getRoom(alice.roomId)!;
    expect(room).toBeDefined();
    expect(room.players.size).toBe(8);
    expect(room.humanCount).toBe(2);

    // Each client sees the other in a snapshot.
    const snapshot = await alice.waitFor((m) => m.t === 'snap');
    expect(snapshot.players).toHaveLength(8);
    const ids = snapshot.players.map((p: any) => p.id);
    expect(ids).toContain(alice.playerId);
    expect(ids).toContain(bob.playerId);

    // 3. Park Alice on clear floor and freeze the bots so the shot is deterministic.
    const shooter = room.players.get(alice.playerId)!;
    for (const player of room.players.values()) {
      if (player.id === alice.playerId) continue;
      player.brain = null;
      player.alive = false;
      player.respawnAt = Number.MAX_SAFE_INTEGER;
    }
    shooter.x = -20;
    shooter.z = -24;
    shooter.alive = true;

    // Wipe the corridor she is about to paint, so anything found there afterwards
    // is unambiguously the result of this shot rather than earlier bot activity.
    const corridor: number[] = [];
    for (let z = -26; z <= -22; z += 0.5) {
      for (let x = -20; x <= 6; x += 0.5) {
        const col = worldToCol(x);
        const row = worldToRow(z);
        if (col < 0 || row < 0) continue;
        const index = cellIndex(col, row);
        room.grid[index] = PaintOwner.Neutral;
        corridor.push(index);
      }
    }

    const coverageBefore = room.coverage;
    const paintedBefore = shooter.round.cellsGained;

    // 4. Fire a validated shot eastward across the open floor.
    for (let seq = 1; seq <= 16; seq++) {
      alice.sendInput(seq, { firing: true, aimX: 1, aimZ: 0 });
      await delay(50);
    }
    await delay(400); // let the last paintballs land and a snapshot go out

    // 5. The score moved and the server credited the shooter.
    const teamOwner = shooter.team === TeamId.Cyan ? PaintOwner.Cyan : PaintOwner.Magenta;
    expect(shooter.round.cellsGained).toBeGreaterThan(paintedBefore);

    const share = (c: { cyan: number; magenta: number }) =>
      shooter.team === TeamId.Cyan ? c.cyan : c.magenta;
    expect(share(room.coverage)).toBeGreaterThan(share(coverageBefore));

    // The corridor is now painted in her colour on the server.
    const painted = [...new Set(corridor)].filter((index) => room.grid[index] === teamOwner);
    expect(painted.length).toBeGreaterThan(0);

    // 6. And the deltas converge the client onto the server's grid. Deltas are budgeted
    // per snapshot, so a large backlog can take a few frames to drain — poll rather than
    // assuming a single snapshot carried everything.
    let mismatches: number[] = [];
    const deadline = Date.now() + 4000;
    do {
      await delay(120);
      mismatches = painted.filter((index) => alice.grid[index] !== room.grid[index]);
    } while (mismatches.length > 0 && Date.now() < deadline);
    expect(mismatches).toHaveLength(0);

    alice.close();
    bob.close();
  }, 20_000);

  it('rejects a malformed message without dropping the connection', async () => {
    const client = new TestClient(port);
    await client.connect('g_fuzz', 'Fuzzer');

    client.send({ t: 'input', input: { seq: 'not-a-number' } });
    client.send({ t: 'nonsense' });
    client.send('plain text, not json');

    // Still alive and still receiving snapshots.
    const snapshot = await client.waitFor((m) => m.t === 'snap' && m.st > 0, 5000);
    expect(snapshot.players.length).toBe(8);
    client.close();
  }, 15_000);

  it('answers a ping with a pong', async () => {
    const client = new TestClient(port);
    await client.connect('g_ping', 'Pinger');
    client.send({ t: 'ping', time: 12345 });
    const pong = await client.waitFor((m) => m.t === 'pong');
    expect(pong.time).toBe(12345);
    expect(pong.serverTime).toBeGreaterThan(0);
    client.close();
  }, 15_000);

  it('places crew-link guests in the same room', async () => {
    const host = new TestClient(port);
    await host.connect('g_host', 'Host');

    const response = await fetch(`http://127.0.0.1:${port}/api/crew`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: host.roomId, team: TeamId.Magenta }),
    });
    const { crew } = await response.json();
    expect(crew.code).toMatch(/^[A-Z]+-[A-Z]+/);

    const friend = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => friend.once('open', () => resolve()));
    friend.send(
      JSON.stringify({
        t: 'hello',
        v: 1,
        guestId: 'g_friend',
        displayName: 'Friend',
        marker: 'compressor',
        matchesCompleted: 0,
        crewCode: crew.code,
      }),
    );
    const welcome = await new Promise<any>((resolve) => {
      friend.on('message', (raw) => {
        const message = JSON.parse(String(raw));
        if (message.t === 'welcome') resolve(message);
      });
    });

    expect(welcome.roomId).toBe(host.roomId);
    expect(welcome.crewCode).toBe(crew.code);
    // Placed on the crew's team where capacity allows.
    expect(welcome.team).toBe(TeamId.Magenta);
    // A guest with no completed matches only owns the starting marker.
    expect(welcome.markerUnlocked).toEqual(['compressor']);

    friend.close();
    host.close();
  }, 15_000);

  it('round-trips a challenge record', async () => {
    const created = await fetch(`http://127.0.0.1:${port}/api/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scoreToBeat: 61.5,
        createdByGuestId: 'g_challenger',
        createdByName: 'ChromeDog_87',
      }),
    }).then((r) => r.json());

    expect(created.challenge.id).toBeTruthy();
    expect(created.challenge.scoreToBeat).toBe(61.5);

    const fetched = await fetch(
      `http://127.0.0.1:${port}/api/challenge/${created.challenge.id}`,
    ).then((r) => r.json());
    expect(fetched.challenge.createdByName).toBe('ChromeDog_87');

    const missing = await fetch(`http://127.0.0.1:${port}/api/challenge/doesnotexist`);
    expect(missing.status).toBe(404);
  });

  it('serves the SPA fallback for deep links', async () => {
    // No client build in this test, so the server reports it honestly rather than 404ing.
    for (const path of ['/', '/play/vice-estate-04', '/c/NEON-RAT', '/challenge/abc']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('not built yet');
    }
  });

  it('refuses a websocket upgrade on any path but /ws', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/not-ws`);
    const failed = await new Promise<boolean>((resolve) => {
      socket.once('error', () => resolve(true));
      socket.once('open', () => resolve(false));
    });
    expect(failed).toBe(true);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

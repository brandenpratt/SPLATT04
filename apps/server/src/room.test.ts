import { beforeEach, describe, expect, it } from 'vitest';
import {
  INTERMISSION_SECONDS,
  PaintOwner,
  RESPAWN_SECONDS,
  ROOM_SIZE,
  ROUND_SECONDS,
  TeamId,
  computeCoverage,
  emptyInput,
} from '@splat04/shared';
import { Room, type ServerPlayer } from './room.js';
import { mulberry32 } from './bots.js';

/** Controllable clock so rounds can be advanced without waiting 90 real seconds. */
class Clock {
  constructor(public t = 1_000_000) {}
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

function runFor(room: Room, clock: Clock, seconds: number, tickHz = 20): void {
  const stepMs = 1000 / tickHz;
  const ticks = Math.round((seconds * 1000) / stepMs);
  for (let i = 0; i < ticks; i++) {
    clock.advance(stepMs);
    room.tick(stepMs / 1000);
  }
}

function joinHuman(room: Room, name: string, sink: unknown[] = []) {
  return room.joinHuman({
    guestId: `guest_${name}`,
    displayName: name,
    marker: 'compressor',
    unlockAll: true,
    matchesCompleted: 99,
    send: (message) => sink.push(message),
  });
}

let clock: Clock;
let room: Room;

beforeEach(() => {
  clock = new Clock();
  // Seeded clock *and* RNG: bot decisions and shot spread are the only sources of
  // randomness in the room, so fixing both makes every assertion below reproducible.
  room = new Room('test-room', clock.now, mulberry32(0xf00d));
});

describe('room population', () => {
  it('always reaches eight occupants using bots', () => {
    expect(room.players.size).toBe(ROOM_SIZE);
    expect(Array.from(room.players.values()).every((p) => p.isBot)).toBe(true);
    expect(room.teamCount(TeamId.Cyan)).toBe(ROOM_SIZE / 2);
    expect(room.teamCount(TeamId.Magenta)).toBe(ROOM_SIZE / 2);
  });

  it('gives bots the documented names', () => {
    const names = Array.from(room.players.values()).map((p) => p.name);
    expect(names).toContain('xX_DARKMOM_Xx');
    expect(names).toContain('DVD_MENU');
    expect(new Set(names).size).toBe(names.length);
  });

  it('stays at eight occupants after a human joins', () => {
    joinHuman(room, 'Guest1');
    expect(room.players.size).toBe(ROOM_SIZE);
    expect(room.humanCount).toBe(1);
  });
});

describe('team assignment and rebalance', () => {
  it('puts a joining player on the smaller team', () => {
    // Empty one side by hand so the next joiner has an obvious destination.
    const magenta = Array.from(room.players.values()).filter((p) => p.team === TeamId.Magenta);
    room.players.delete(magenta[0].id);
    room.players.delete(magenta[1].id);
    expect(room.teamCount(TeamId.Magenta)).toBe(2);

    expect(room.pickTeam()).toBe(TeamId.Magenta);
  });

  it('breaks ties deterministically from room state', () => {
    expect(room.teamCount(TeamId.Cyan)).toBe(room.teamCount(TeamId.Magenta));
    const first = room.pickTeam();
    const second = room.pickTeam();
    expect(first).toBe(second);
  });

  it('honours a crew team preference when that side has room', () => {
    const magenta = Array.from(room.players.values()).filter((p) => p.team === TeamId.Magenta);
    room.players.delete(magenta[0].id);
    expect(room.pickTeam(TeamId.Magenta)).toBe(TeamId.Magenta);
  });

  it('ignores a preference for a team that is already full', () => {
    const cyan = Array.from(room.players.values()).filter((p) => p.team === TeamId.Cyan);
    expect(cyan.length).toBe(4);
    room.players.delete(cyan[0].id);
    // Cyan now has 3, Magenta 4 — asking for Magenta must not make it 5.
    expect(room.pickTeam(TeamId.Magenta)).toBe(TeamId.Cyan);
  });

  it('only rebalances lopsided teams at an intermission boundary', () => {
    for (const player of room.players.values()) player.team = TeamId.Cyan;
    expect(room.teamCount(TeamId.Cyan)).toBe(8);

    // Mid-round: teams stay lopsided.
    runFor(room, clock, 2);
    expect(room.teamCount(TeamId.Cyan)).toBe(8);

    // Push through the round end and the following intermission.
    runFor(room, clock, ROUND_SECONDS + INTERMISSION_SECONDS + 1);
    expect(Math.abs(room.teamCount(TeamId.Cyan) - room.teamCount(TeamId.Magenta))).toBeLessThan(2);
  });
});

describe('join in progress', () => {
  it('seats a human mid-round by taking a bot slot', () => {
    const botsBefore = Array.from(room.players.values()).filter((p) => p.isBot).length;
    runFor(room, clock, 5);

    const player = joinHuman(room, 'Latecomer');
    expect(room.players.size).toBe(ROOM_SIZE);
    expect(room.humanCount).toBe(1);
    expect(Array.from(room.players.values()).filter((p) => p.isBot).length).toBe(botsBefore - 1);
    expect(room.players.get(player.id)).toBeDefined();
  });

  it('spawns a mid-round joiner within five seconds', () => {
    runFor(room, clock, 5);
    const player = joinHuman(room, 'Latecomer');

    // A bot displaced mid-round is popped, so the human waits at most one respawn.
    expect(player.respawnAt - clock.now()).toBeLessThanOrEqual(RESPAWN_SECONDS * 1000);
    runFor(room, clock, RESPAWN_SECONDS + 0.5);
    expect(room.players.get(player.id)!.alive).toBe(true);
  });

  it('seats a joiner immediately during intermission', () => {
    runFor(room, clock, ROUND_SECONDS + 0.5);
    expect(room.phase).toBe('intermission');

    const player = joinHuman(room, 'Intermission');
    expect(player.alive).toBe(true);
  });

  it('does not count a mid-round joiner as having completed the round', () => {
    runFor(room, clock, 5);
    const player = joinHuman(room, 'Latecomer');
    runFor(room, clock, ROUND_SECONDS);

    const summary = room.summaries.find((s) => s.playerId === player.id);
    expect(summary).toBeDefined();
    expect(summary!.xpGained).toBe(0);
  });
});

describe('disconnect and reconnect', () => {
  it('hands a disconnected slot to a bot without freeing it', () => {
    const player = joinHuman(room, 'Dropout');
    room.disconnect(player.id);

    const held = room.players.get(player.id)!;
    expect(held).toBeDefined();
    expect(held.send).toBeNull();
    expect(held.brain).not.toBeNull(); // a bot drives it in the meantime
    expect(room.players.size).toBe(ROOM_SIZE);
  });

  it('restores the same slot when the guest reconnects with their token', () => {
    const player = joinHuman(room, 'Dropout');
    const { id, reconnectToken, guestId } = player;
    room.disconnect(id);
    runFor(room, clock, 3);

    const resumed = room.joinHuman({
      guestId,
      displayName: 'Dropout',
      marker: 'compressor',
      unlockAll: true,
      matchesCompleted: 99,
      reconnectToken,
      send: () => {},
    });
    expect(resumed.id).toBe(id);
    expect(resumed.brain).toBeNull();
    expect(room.humanCount).toBe(1);
  });

  it('refuses to resume a slot without the matching token', () => {
    const player = joinHuman(room, 'Dropout');
    room.disconnect(player.id);

    const impostor = room.joinHuman({
      guestId: player.guestId,
      displayName: 'Impostor',
      marker: 'compressor',
      unlockAll: true,
      matchesCompleted: 99,
      reconnectToken: 'wrong-token',
      send: () => {},
    });
    expect(impostor.id).not.toBe(player.id);
  });

  it('releases the slot to a bot once the reconnect window lapses', () => {
    const player = joinHuman(room, 'Dropout');
    room.disconnect(player.id);
    runFor(room, clock, 21);

    expect(room.players.get(player.id)).toBeUndefined();
    expect(room.players.size).toBe(ROOM_SIZE);
    expect(room.humanCount).toBe(0);
  });
});

describe('round transitions', () => {
  it('runs a 90 second round then an 8 second intermission, then restarts', () => {
    expect(room.phase).toBe('active');

    runFor(room, clock, ROUND_SECONDS + 0.5);
    expect(room.phase).toBe('intermission');

    runFor(room, clock, INTERMISSION_SECONDS + 0.5);
    expect(room.phase).toBe('active');
  });

  it('declares a winner from the paint grid', () => {
    const sink: unknown[] = [];
    joinHuman(room, 'Watcher', sink);
    runFor(room, clock, ROUND_SECONDS + 0.5);

    const roundEnd = sink.find((m): m is any => (m as any)?.t === 'roundEnd');
    expect(roundEnd).toBeDefined();
    const coverage = roundEnd.coverage;
    if (coverage.cyan > coverage.magenta) expect(roundEnd.winner).toBe(TeamId.Cyan);
    else if (coverage.magenta > coverage.cyan) expect(roundEnd.winner).toBe(TeamId.Magenta);
    else expect(roundEnd.winner).toBeNull();
  });

  it('wipes the floor and resets stats for the next round', () => {
    runFor(room, clock, ROUND_SECONDS + 0.5);
    expect(computeCoverage(room.grid).neutral).toBeLessThan(100); // painted during the round

    // Sample the instant the new round begins — half a second later the bots have
    // already started repainting, which would mask a failed wipe.
    for (let i = 0; i < 400 && room.phase !== 'active'; i++) {
      clock.advance(50);
      room.tick(0.05);
    }
    expect(room.phase).toBe('active');
    expect(computeCoverage(room.grid).neutral).toBeCloseTo(100, 5);
    for (const player of room.players.values()) {
      expect(player.round.tags).toBe(0);
      expect(player.round.cellsGained).toBe(0);
      expect(player.alive).toBe(true);
    }
  });

  it('stops spawning projectiles during intermission', () => {
    runFor(room, clock, ROUND_SECONDS + 1);
    expect(room.phase).toBe('intermission');
    runFor(room, clock, 3);
    expect(room.projectiles.length).toBe(0);
  });
});

describe('bots actually play', () => {
  it('paints a meaningful share of the floor within a round', () => {
    runFor(room, clock, 45);
    const coverage = computeCoverage(room.grid);
    expect(coverage.cyan + coverage.magenta).toBeGreaterThan(8);
    expect(coverage.cyan).toBeGreaterThan(0);
    expect(coverage.magenta).toBeGreaterThan(0);
  });

  it('moves bots away from their spawn points', () => {
    const before = Array.from(room.players.values()).map((p) => ({ id: p.id, x: p.x, z: p.z }));
    runFor(room, clock, 12);
    const moved = before.filter((b) => {
      const now = room.players.get(b.id)!;
      return Math.hypot(now.x - b.x, now.z - b.z) > 4;
    });
    expect(moved.length).toBeGreaterThan(ROOM_SIZE / 2);
  });

  it('tags opponents over the course of a round', () => {
    runFor(room, clock, 60);
    const totalTags = Array.from(room.players.values()).reduce((sum, p) => sum + p.round.tags, 0);
    expect(totalTags).toBeGreaterThan(0);
  });

  it('never leaves a player stuck inside cover', () => {
    runFor(room, clock, 30);
    for (const player of room.players.values()) {
      expect(Math.abs(player.x)).toBeLessThanOrEqual(41);
      expect(Math.abs(player.z)).toBeLessThanOrEqual(27);
    }
  });
});

describe('tagging and respawn', () => {
  it('respawns a splatted player after two seconds', () => {
    const victim = Array.from(room.players.values())[0] as ServerPlayer;
    const tagger = Array.from(room.players.values()).find((p) => p.team !== victim.team)!;

    // Drive a paintball straight into the victim.
    victim.x = 0;
    victim.z = -24;
    tagger.x = -6;
    tagger.z = -24;
    tagger.aimX = 1;
    tagger.aimZ = 0;
    tagger.brain = null;
    tagger.lastInput = { ...emptyInput(tagger.marker), firing: true, aimX: 1, aimZ: 0 };
    victim.brain = null;
    victim.lastInput = emptyInput(victim.marker);

    let splattedAt = 0;
    for (let i = 0; i < 40 && !splattedAt; i++) {
      clock.advance(50);
      room.tick(0.05);
      if (!victim.alive) splattedAt = clock.now();
    }
    expect(splattedAt).toBeGreaterThan(0);
    expect(victim.respawnAt - splattedAt).toBeCloseTo(RESPAWN_SECONDS * 1000, -1);
    expect(tagger.round.tags).toBe(1);

    runFor(room, clock, RESPAWN_SECONDS + 0.3);
    expect(victim.alive).toBe(true);
  });

  it('bursts the victim into the tagging team colour', () => {
    const victim = Array.from(room.players.values())[0] as ServerPlayer;
    const tagger = Array.from(room.players.values()).find((p) => p.team !== victim.team)!;
    victim.x = 0;
    victim.z = -24;
    tagger.x = -6;
    tagger.z = -24;
    tagger.brain = null;
    tagger.aimX = 1;
    tagger.aimZ = 0;
    tagger.lastInput = { ...emptyInput(tagger.marker), firing: true, aimX: 1, aimZ: 0 };
    victim.brain = null;
    victim.lastInput = emptyInput(victim.marker);

    for (let i = 0; i < 40 && victim.alive; i++) {
      clock.advance(50);
      room.tick(0.05);
    }
    expect(victim.alive).toBe(false);
    const coverage = computeCoverage(room.grid);
    const taggerShare = tagger.team === TeamId.Cyan ? coverage.cyan : coverage.magenta;
    expect(taggerShare).toBeGreaterThan(0);
  });
});

describe('marker ownership', () => {
  it('refuses a sidegrade the player has not unlocked', () => {
    const player = room.joinHuman({
      guestId: 'g_new',
      displayName: 'Rookie',
      marker: 'brickshot',
      unlockAll: false,
      matchesCompleted: 0,
      send: () => {},
    });
    expect(player.marker).toBe('compressor');
  });

  it('accepts it once the player has three completed matches', () => {
    const player = room.joinHuman({
      guestId: 'g_vet',
      displayName: 'Veteran',
      marker: 'triple-tap',
      unlockAll: false,
      matchesCompleted: 3,
      send: () => {},
    });
    expect(player.marker).toBe('triple-tap');
  });

  it('ignores a marker swap smuggled in through an input packet', () => {
    const player = room.joinHuman({
      guestId: 'g_new2',
      displayName: 'Rookie2',
      marker: 'compressor',
      unlockAll: false,
      matchesCompleted: 0,
      send: () => {},
    });
    room.setInput(player.id, { ...emptyInput('brickshot'), seq: 5 });
    expect(player.marker).toBe('compressor');
  });
});

describe('input validation at the room boundary', () => {
  it('drops replayed and out-of-order input sequences', () => {
    const player = joinHuman(room, 'Seq');
    room.setInput(player.id, { ...emptyInput(), seq: 10, moveX: 1 });
    expect(player.lastAckSeq).toBe(10);

    room.setInput(player.id, { ...emptyInput(), seq: 4, moveX: -1 });
    expect(player.lastAckSeq).toBe(10);
    expect(player.lastInput.moveX).toBe(1);
  });

  it('ignores input aimed at a bot slot', () => {
    const bot = Array.from(room.players.values()).find((p) => p.isBot)!;
    const before = bot.lastAckSeq;
    room.setInput(bot.id, { ...emptyInput(), seq: 99, moveX: 1 });
    expect(bot.lastAckSeq).toBe(before);
  });
});

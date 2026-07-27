import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ARENA_SLUG,
  MARKERS,
  MarkerId,
  PROTOCOL_VERSION,
  TeamId,
  encodeGrid,
  markerUnlocked,
  parseClientMessage,
  safeJsonParse,
  sanitiseId,
} from '@splat04/shared';
import { config } from './config.js';
import { RoomManager } from './rooms.js';
import { EphemeralStore } from './stores.js';
import type { Room } from './room.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_WEB_DIST = config.webDist ? resolve(config.webDist) : resolve(here, '../../web/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export interface GameServerOptions {
  webDist?: string;
  tickRate?: number;
  snapshotRate?: number;
}

export interface GameServer {
  httpServer: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  rooms: RoomManager;
  store: EphemeralStore;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

/**
 * One service: static client, `/api/*`, and the authoritative `/ws` game socket
 * all on the same origin.
 */
export function createGameServer(options: GameServerOptions = {}): GameServer {
  const webDist = options.webDist ? resolve(options.webDist) : DEFAULT_WEB_DIST;
  const tickRate = options.tickRate ?? config.tickRate;
  const snapshotRate = options.snapshotRate ?? config.snapshotRate;

  const rooms = new RoomManager();
  const store = new EphemeralStore();
  rooms.start(tickRate, snapshotRate);

  function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  function serveStatic(res: ServerResponse, pathname: string): boolean {
    // normalize() plus a prefix check keeps `../` traversal out of the dist directory.
    const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(webDist, relative);
    if (!filePath.startsWith(webDist)) return false;
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

    const ext = extname(filePath);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      // Vite emits content-hashed asset filenames, so those are safe to cache hard.
      'cache-control': relative.includes('assets')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    createReadStream(filePath).pipe(res);
    return true;
  }

  async function serveIndex(res: ServerResponse): Promise<void> {
    const indexPath = join(webDist, 'index.html');
    if (!existsSync(indexPath)) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('SPLAT 04 client is not built yet. Run `pnpm build`, or use `pnpm dev`.');
      return;
    }
    const html = await readFile(indexPath);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    });
    res.end(html);
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 8192) rejectPromise(new Error('body_too_large'));
      });
      req.on('end', () => resolvePromise(body));
      req.on('error', rejectPromise);
    });
  }

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/health') {
      const roomList = rooms.all;
      sendJson(res, 200, {
        ok: true,
        arena: ARENA_SLUG,
        protocol: PROTOCOL_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        rooms: roomList.length,
        players: roomList.reduce((total, room) => total + room.connectedHumanCount, 0),
        ...store.sizes,
      });
      return;
    }

    if (pathname === '/api/crew' && req.method === 'POST') {
      readBody(req)
        .then((body) => {
          const payload = safeJsonParse(body) as Record<string, unknown> | null;
          const roomId = sanitiseId(payload?.roomId, 64);
          const room = roomId ? rooms.getRoom(roomId) : null;
          const target = room ?? rooms.findOrCreateRoom();
          const team = payload?.team === TeamId.Magenta ? TeamId.Magenta : TeamId.Cyan;
          sendJson(res, 200, { crew: store.createCrew(target.id, team) });
        })
        .catch(() => sendJson(res, 400, { error: 'bad_request' }));
      return;
    }

    if (pathname === '/api/challenge' && req.method === 'POST') {
      readBody(req)
        .then((body) => {
          const payload = safeJsonParse(body) as Record<string, unknown> | null;
          const challenge = store.createChallenge({
            scoreToBeat: typeof payload?.scoreToBeat === 'number' ? payload.scoreToBeat : 0,
            createdByGuestId: sanitiseId(payload?.createdByGuestId) ?? 'anonymous',
            createdByName:
              typeof payload?.createdByName === 'string'
                ? payload.createdByName.slice(0, 20)
                : 'A GUEST',
          });
          sendJson(res, 200, { challenge });
        })
        .catch(() => sendJson(res, 400, { error: 'bad_request' }));
      return;
    }

    if (pathname.startsWith('/api/challenge/') && req.method === 'GET') {
      const id = sanitiseId(pathname.slice('/api/challenge/'.length), 32);
      const challenge = id ? store.getChallenge(id) : null;
      sendJson(res, challenge ? 200 : 404, challenge ? { challenge } : { error: 'not_found' });
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    if (serveStatic(res, pathname)) return;
    // Everything else renders the SPA, so /play, /c and /challenge links load directly.
    void serveIndex(res);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  interface Session {
    room: Room | null;
    playerId: string | null;
    messageCount: number;
    windowStartedAt: number;
  }

  wss.on('connection', (ws: WebSocket) => {
    const session: Session = {
      room: null,
      playerId: null,
      messageCount: 0,
      windowStartedAt: Date.now(),
    };

    const send = (message: unknown): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };

    ws.on('message', (raw) => {
      const now = Date.now();
      // Flood guard: a well-behaved client sends 20 inputs/sec plus the odd ping.
      if (now - session.windowStartedAt > 1000) {
        session.windowStartedAt = now;
        session.messageCount = 0;
      }
      if (++session.messageCount > 80) return;

      const message = parseClientMessage(safeJsonParse(String(raw)));
      if (!message) return;

      switch (message.t) {
        case 'hello': {
          if (session.room) return; // one seat per socket
          const crew = message.crewCode ? store.getCrew(message.crewCode) : null;
          const challenge = message.challengeId ? store.getChallenge(message.challengeId) : null;
          const room = crew ? rooms.getOrCreateRoomById(crew.roomId) : rooms.findOrCreateRoom();

          const player = room.joinHuman({
            guestId: message.guestId,
            displayName: message.displayName,
            marker: message.marker,
            unlockAll: message.unlockAll === true,
            matchesCompleted: message.matchesCompleted,
            preferredTeam: crew?.team ?? challenge?.teamPreference,
            reconnectToken: message.reconnectToken,
            challengeId: challenge?.id,
            send,
          });

          session.room = room;
          session.playerId = player.id;

          send({
            t: 'welcome',
            v: PROTOCOL_VERSION,
            playerId: player.id,
            roomId: room.id,
            arenaSlug: room.arenaSlug,
            team: player.team,
            reconnectToken: player.reconnectToken,
            serverTime: Date.now(),
            grid: encodeGrid(room.grid),
            phase: room.phase,
            phaseEndsAt: room.phaseEndsAt,
            coverage: room.coverage,
            crewCode: crew?.code,
            challenge: challenge
              ? {
                  id: challenge.id,
                  scoreToBeat: challenge.scoreToBeat,
                  createdByName: challenge.createdByName,
                }
              : undefined,
            markerUnlocked: (Object.keys(MARKERS) as MarkerId[]).filter((id) =>
              markerUnlocked(id, message.matchesCompleted, message.unlockAll === true),
            ),
          });
          break;
        }
        case 'input':
          if (session.room && session.playerId) {
            session.room.setInput(session.playerId, message.input);
          }
          break;
        case 'ping':
          send({ t: 'pong', time: message.time, serverTime: Date.now() });
          break;
      }
    });

    const release = (): void => {
      if (session.room && session.playerId) session.room.disconnect(session.playerId);
    };
    ws.on('close', release);
    ws.on('error', release);
  });

  // Drop unresponsive sockets so their slot enters the reconnect grace window.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) if (client.readyState === client.OPEN) client.ping();
  }, 15_000);
  heartbeat.unref?.();

  return {
    httpServer,
    wss,
    rooms,
    store,
    listen: (port, host = '0.0.0.0') =>
      new Promise<number>((resolvePort) => {
        httpServer.listen(port, host, () => {
          const address = httpServer.address();
          resolvePort(typeof address === 'object' && address ? address.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolveClose) => {
        rooms.stop();
        clearInterval(heartbeat);
        for (const client of wss.clients) client.terminate();
        wss.close(() => httpServer.close(() => resolveClose()));
      }),
  };
}

export { DEFAULT_WEB_DIST };

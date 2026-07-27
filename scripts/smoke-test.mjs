#!/usr/bin/env node
/**
 * Production smoke test.
 *
 * Boots the built server exactly as `pnpm start` does, then verifies the three things
 * that must be true of a real deployment: health responds, the client index is served,
 * and the WebSocket endpoint accepts a connection and seats a player.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = process.env.SMOKE_PORT ?? '8899';
const BASE = `http://127.0.0.1:${PORT}`;

const serverEntry = join(root, 'apps', 'server', 'dist', 'index.js');
const clientIndex = join(root, 'apps', 'web', 'dist', 'index.html');

const checks = [];
function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

if (!existsSync(serverEntry)) {
  console.error('Server build missing. Run `pnpm build` first.');
  process.exit(1);
}
if (!existsSync(clientIndex)) {
  console.error('Client build missing. Run `pnpm build` first.');
  process.exit(1);
}

console.log('SPLAT 04 production smoke test');

const server = spawn(process.execPath, [serverEntry], {
  env: { ...process.env, PORT, HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', (chunk) => (serverOutput += chunk));
server.stderr.on('data', (chunk) => (serverOutput += chunk));

function shutdown(code) {
  server.kill('SIGTERM');
  setTimeout(() => {
    server.kill('SIGKILL');
    process.exit(code);
  }, 300).unref();
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

try {
  const up = await waitForServer();
  if (!up) {
    console.error('Server did not start in time.\n', serverOutput);
    shutdown(1);
  }

  // 1. Health endpoint.
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  record(
    '/api/health returns successfully',
    health.status === 200 && healthBody.ok === true,
    `status ${health.status}, arena ${healthBody.arena}`,
  );

  // 2. Client index is served, including on deep links.
  for (const path of ['/', '/play/vice-estate-04', '/c/NEON-RAT']) {
    const page = await fetch(`${BASE}${path}`);
    const html = await page.text();
    record(
      `client index is served at ${path}`,
      page.status === 200 && html.includes('<div id="root">'),
      `status ${page.status}, ${html.length} bytes`,
    );
  }

  // 3. Static assets and PWA files.
  const manifest = await fetch(`${BASE}/manifest.webmanifest`);
  record('manifest is served', manifest.status === 200 && (await manifest.json()).name === 'SPLAT 04');

  const icon = await fetch(`${BASE}/icons/icon-192.png`);
  record(
    'generated icon is served',
    icon.status === 200 && icon.headers.get('content-type') === 'image/png',
  );

  // 4. WebSocket endpoint accepts a connection and seats a player in a full room.
  const welcome = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('websocket timed out'));
    }, 8000);

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          t: 'hello',
          v: 1,
          guestId: 'g_smoketest',
          displayName: 'SmokeTest',
          marker: 'compressor',
          matchesCompleted: 0,
        }),
      );
    });
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.t === 'welcome') {
        clearTimeout(timer);
        socket.close();
        resolve(message);
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  record(
    'websocket endpoint accepts a connection',
    Boolean(welcome.playerId),
    `seated as ${welcome.playerId} on team ${welcome.team} in ${welcome.roomId}`,
  );
  record('welcome carries the arena paint grid', typeof welcome.grid === 'string' && welcome.grid.length > 0);

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  shutdown(failed.length === 0 ? 0 : 1);
} catch (error) {
  console.error('Smoke test failed:', error.message);
  console.error(serverOutput);
  shutdown(1);
}

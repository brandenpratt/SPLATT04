import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { DEFAULT_WEB_DIST, createGameServer } from './app.js';

const server = createGameServer();

void server.listen(config.port, config.host).then((port) => {
  const where = config.host === '0.0.0.0' ? 'localhost' : config.host;
  const clientReady = existsSync(join(DEFAULT_WEB_DIST, 'index.html'));
  console.log(`SPLAT 04 server listening on http://${where}:${port}`);
  console.log(`  health   http://${where}:${port}/api/health`);
  console.log(`  ws       ws://${where}:${port}/ws`);
  console.log(`  client   ${clientReady ? DEFAULT_WEB_DIST : '(not built — run pnpm build)'}`);
});

function shutdown(): void {
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

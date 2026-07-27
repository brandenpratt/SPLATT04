import { SNAPSHOT_RATE, TICK_RATE } from '@splat04/shared';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', 8787),
  host: process.env.HOST || '0.0.0.0',
  publicOrigin: process.env.PUBLIC_ORIGIN || '',
  webDist: process.env.WEB_DIST || '',
  tickRate: intFromEnv('TICK_RATE', TICK_RATE),
  snapshotRate: intFromEnv('SNAPSHOT_RATE', SNAPSHOT_RATE),
  /** Cells of paint delta allowed in a single snapshot before the rest waits a frame. */
  maxDeltaCellsPerSnapshot: 2400,
};

export type Config = typeof config;

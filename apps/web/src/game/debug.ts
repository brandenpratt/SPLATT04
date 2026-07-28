import { BotDifficulty, isBotDifficulty } from '@splat04/shared';
import { CameraMode } from './camera.js';

/**
 * Developer flags.
 *
 * `import.meta.env.DEV` is a compile-time constant, so in a production bundle every
 * branch below folds to `false` and the debug panel is tree-shaken out entirely. The
 * server independently ignores privileged requests unless it was started with
 * `SPLAT04_DEBUG=1` — a client can never grant itself god mode on someone else's room.
 */
const params =
  typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

let serverAllowsDebug = false;

/**
 * True in a development build, or once a server has told us it was started with
 * `SPLAT04_DEBUG=1`. Checked at call time rather than captured at module load, because
 * the server's answer only arrives with the welcome message.
 */
export function isDebugAllowed(): boolean {
  return import.meta.env.DEV || serverAllowsDebug;
}

export function setServerDebugAllowed(allowed: boolean): void {
  serverAllowsDebug = allowed;
}

export interface DebugFlags {
  enabled: boolean;
  god: boolean;
  bots: BotDifficulty | 'off' | null;
  camera: CameraMode | null;
}

/**
 * URL flags. `camera` is harmless and always honoured; the privileged flags are only
 * returned when debug is allowed, and the server independently ignores the commands
 * they would trigger.
 */
export function readDebugFlags(): DebugFlags {
  const cameraOnly = params.get('camera');
  const camera: CameraMode | null =
    cameraOnly === 'first' ? 'first' : cameraOnly === 'third' ? 'third' : null;
  if (!isDebugAllowed()) {
    return { enabled: false, god: false, bots: null, camera };
  }
  const botsRaw = params.get('bots');
  return {
    enabled: params.get('debug') === '1',
    god: params.get('god') === '1',
    bots: botsRaw === 'off' ? 'off' : isBotDifficulty(botsRaw) ? botsRaw : null,
    camera,
  };
}

export interface DebugState {
  panelOpen: boolean;
  god: boolean;
  botsFrozen: boolean;
  botsRemoved: boolean;
  difficulty: BotDifficulty;
  showBotAim: boolean;
  showBotLabels: boolean;
  showCollision: boolean;
  showWaypoints: boolean;
  showProjectileTraces: boolean;
  overheadCamera: boolean;
}

export const DEFAULT_DEBUG_STATE: DebugState = {
  panelOpen: false,
  god: false,
  botsFrozen: false,
  botsRemoved: false,
  difficulty: 'arcade',
  showBotAim: false,
  showBotLabels: false,
  showCollision: false,
  showWaypoints: false,
  showProjectileTraces: false,
  overheadCamera: false,
};

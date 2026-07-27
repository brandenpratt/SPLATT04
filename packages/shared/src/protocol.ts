import { MAX_CREW_CODE_LENGTH, MAX_DISPLAY_NAME_LENGTH } from './constants.js';
import { isMarkerId } from './markers.js';
import {
  Coverage,
  MarkerId,
  PlayerInput,
  PlayerRoundSummary,
  RoundPhase,
  TeamId,
} from './types.js';

export const PROTOCOL_VERSION = 1;

// --- Client -> Server ------------------------------------------------------

export interface HelloMessage {
  t: 'hello';
  v: number;
  guestId: string;
  displayName: string;
  marker: MarkerId;
  crewCode?: string;
  challengeId?: string;
  reconnectToken?: string;
  unlockAll?: boolean;
  /**
   * Self-reported progress, used only to gate the two marker sidegrades. Progression is
   * local-only in the prototype, so this is trusted; see README limitations.
   */
  matchesCompleted: number;
}

export interface InputMessage {
  t: 'input';
  input: PlayerInput;
}

export interface PingMessage {
  t: 'ping';
  time: number;
}

export type ClientMessage = HelloMessage | InputMessage | PingMessage;

// --- Server -> Client ------------------------------------------------------

export interface NetPlayer {
  id: string;
  n: string;
  tm: TeamId;
  b: 0 | 1;
  x: number;
  z: number;
  ax: number;
  az: number;
  /** alive */
  a: 0 | 1;
  /** boosting */
  bs: 0 | 1;
  mk: MarkerId;
  tg: number;
  /** connected */
  c: 0 | 1;
}

export interface NetProjectile {
  id: number;
  tm: TeamId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** normalised flight progress, for the visual arc */
  p: number;
  r: number;
}

export type GameEvent =
  | { e: 'tag'; by: string; on: string; x: number; z: number; tm: TeamId }
  | { e: 'cover'; x: number; z: number; tm: TeamId }
  | { e: 'spawn'; id: string; x: number; z: number }
  | { e: 'callout'; text: string }
  | { e: 'join'; name: string }
  | { e: 'leave'; name: string };

export interface WelcomeMessage {
  t: 'welcome';
  v: number;
  playerId: string;
  roomId: string;
  arenaSlug: string;
  team: TeamId;
  reconnectToken: string;
  serverTime: number;
  grid: string;
  phase: RoundPhase;
  phaseEndsAt: number;
  coverage: Coverage;
  crewCode?: string;
  challenge?: { id: string; scoreToBeat: number; createdByName: string };
  markerUnlocked: MarkerId[];
}

export interface SnapshotMessage {
  t: 'snap';
  /** server time in ms */
  st: number;
  /** last acknowledged input sequence for the receiving player */
  ack: number;
  players: NetPlayer[];
  projectiles: NetProjectile[];
  /** flat [cellIndex, owner, ...] */
  delta: number[];
  coverage: Coverage;
  phase: RoundPhase;
  phaseEndsAt: number;
  events: GameEvent[];
  /** authoritative local-player correction */
  self?: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    alive: 0 | 1;
    respawnAt: number;
    boostReadyAt: number;
    boostUntil: number;
  };
}

export interface RoundEndMessage {
  t: 'roundEnd';
  winner: TeamId | null;
  coverage: Coverage;
  summaries: PlayerRoundSummary[];
  nextRoundAt: number;
}

/** Sent at a round boundary: the grid is uniformly neutral again. */
export interface GridResetMessage {
  t: 'gridReset';
}

export interface PongMessage {
  t: 'pong';
  time: number;
  serverTime: number;
}

export interface ErrorMessage {
  t: 'error';
  code: string;
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | RoundEndMessage
  | GridResetMessage
  | PongMessage
  | ErrorMessage;

// --- Validation ------------------------------------------------------------
// Hand-rolled rather than pulling in a schema library: the surface is tiny, every
// field is a number/short string, and untrusted input must never reach the sim.

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitiseDisplayName(value: unknown): string | null {
  const raw = cleanString(value, MAX_DISPLAY_NAME_LENGTH);
  if (!raw) return null;
  // Printable ASCII only — this text is rendered into other players' HUDs.
  const cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH) : null;
}

export function sanitiseCrewCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_CREW_CODE_LENGTH);
  return /^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(cleaned) ? cleaned : null;
}

export function sanitiseId(value: unknown, maxLength = 64): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

export function parsePlayerInput(raw: unknown): PlayerInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.seq) || r.seq < 0 || r.seq > 1e9) return null;
  // Direction components are clamped, then re-normalised by the sim, so an
  // out-of-range vector cannot buy extra speed.
  return {
    seq: Math.floor(r.seq),
    moveX: clampNumber(r.moveX, -1, 1),
    moveZ: clampNumber(r.moveZ, -1, 1),
    aimX: clampNumber(r.aimX, -1, 1, 1),
    aimZ: clampNumber(r.aimZ, -1, 1),
    firing: r.firing === true,
    boostPressed: r.boostPressed === true,
    selectedMarker: isMarkerId(r.selectedMarker) ? r.selectedMarker : 'compressor',
    clientTime: clampNumber(r.clientTime, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  switch (r.t) {
    case 'hello': {
      const guestId = sanitiseId(r.guestId);
      const displayName = sanitiseDisplayName(r.displayName);
      if (!guestId || !displayName) return null;
      const message: HelloMessage = {
        t: 'hello',
        v: isFiniteNumber(r.v) ? r.v : 0,
        guestId,
        displayName,
        marker: isMarkerId(r.marker) ? r.marker : 'compressor',
        unlockAll: r.unlockAll === true,
        matchesCompleted: Math.floor(clampNumber(r.matchesCompleted, 0, 100_000)),
      };
      const crewCode = sanitiseCrewCode(r.crewCode);
      if (crewCode) message.crewCode = crewCode;
      const challengeId = sanitiseId(r.challengeId, 32);
      if (challengeId) message.challengeId = challengeId;
      const reconnectToken = sanitiseId(r.reconnectToken, 64);
      if (reconnectToken) message.reconnectToken = reconnectToken;
      return message;
    }
    case 'input': {
      const input = parsePlayerInput(r.input);
      return input ? { t: 'input', input } : null;
    }
    case 'ping':
      return { t: 'ping', time: clampNumber(r.time, 0, Number.MAX_SAFE_INTEGER) };
    default:
      return null;
  }
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

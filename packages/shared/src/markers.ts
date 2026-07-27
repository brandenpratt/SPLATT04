import { MarkerId } from './types.js';

export interface MarkerSpec {
  id: MarkerId;
  name: string;
  tagline: string;
  fireIntervalMs: number;
  splashRadius: number;
  projectileSpeed: number;
  spreadDegrees: number;
  movementMultiplier: number;
  burstCount: number;
  burstSpacingMs: number;
  /** Extra spread accumulated per shot while holding fire, in degrees. */
  spreadRampDegrees: number;
  /** Maximum accumulated ramp. */
  spreadRampMax: number;
  /** Effective range before the paintball fizzles out. */
  rangeUnits: number;
}

/**
 * Three sidegrades, not a power ladder. Total power budget is deliberately even:
 * Compressor trades splash for rate, Brickshot trades rate and mobility for area,
 * Triple Tap trades sustained output for burst accuracy.
 */
export const MARKERS: Record<MarkerId, MarkerSpec> = {
  compressor: {
    id: 'compressor',
    name: 'COMPRESSOR',
    tagline: 'Hose a lane. Ask questions later.',
    fireIntervalMs: 95,
    splashRadius: 0.95,
    projectileSpeed: 33,
    spreadDegrees: 4.5,
    movementMultiplier: 1.0,
    burstCount: 1,
    burstSpacingMs: 0,
    spreadRampDegrees: 0.55,
    spreadRampMax: 5.5,
    rangeUnits: 22,
  },
  brickshot: {
    id: 'brickshot',
    name: 'BRICKSHOT',
    tagline: 'One shot. One very wet rectangle.',
    fireIntervalMs: 310,
    splashRadius: 2.1,
    projectileSpeed: 27,
    spreadDegrees: 1.5,
    movementMultiplier: 0.94,
    burstCount: 1,
    burstSpacingMs: 0,
    spreadRampDegrees: 0,
    spreadRampMax: 0,
    rangeUnits: 14,
  },
  'triple-tap': {
    id: 'triple-tap',
    name: 'TRIPLE TAP',
    tagline: 'Three polite knocks.',
    fireIntervalMs: 460,
    splashRadius: 1.15,
    projectileSpeed: 38,
    spreadDegrees: 2,
    movementMultiplier: 0.98,
    burstCount: 3,
    burstSpacingMs: 70,
    spreadRampDegrees: 0,
    spreadRampMax: 0,
    rangeUnits: 26,
  },
};

export const MARKER_IDS: MarkerId[] = ['compressor', 'brickshot', 'triple-tap'];
export const STARTING_MARKER: MarkerId = 'compressor';

export function isMarkerId(value: unknown): value is MarkerId {
  return typeof value === 'string' && (MARKER_IDS as string[]).includes(value);
}

/** Compressor is always available; the other two unlock after the third completed match. */
export function markerUnlocked(
  marker: MarkerId,
  matchesCompleted: number,
  unlockAll = false,
): boolean {
  if (unlockAll) return true;
  if (marker === STARTING_MARKER) return true;
  return matchesCompleted >= 3;
}

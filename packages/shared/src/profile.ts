import { STARTING_MARKER, isMarkerId } from './markers.js';
import { generateGuestId, generateGuestName } from './names.js';
import { rankForXp } from './xp.js';
import { GuestProfile, MarkerId, PaintStyleId } from './types.js';

export const PROFILE_SCHEMA_VERSION = 2;
export const PROFILE_STORAGE_KEY = 'splat04.guest';

export interface Cosmetic {
  id: string;
  name: string;
  kind: 'visor' | 'armour' | 'trail' | 'burst';
  price: number;
  blurb: string;
  /** Granted for free at this match count instead of being bought. */
  freeAtMatch?: number;
}

/** Six cosmetics, credits only, no stat advantage, no loot boxes. */
export const COSMETICS: Cosmetic[] = [
  {
    id: 'bubble-trail',
    name: 'Bubble Paint Trail',
    kind: 'trail',
    price: 120,
    blurb: 'Leaves a wobbling trail of expensive-looking bubbles.',
    freeAtMatch: 1,
  },
  {
    id: 'lime-visor',
    name: 'Toxic-Lime Visor',
    kind: 'visor',
    price: 150,
    blurb: 'The exact green of a 2004 energy drink.',
    freeAtMatch: 2,
  },
  {
    id: 'chrome-visor',
    name: 'Chrome Visor',
    kind: 'visor',
    price: 220,
    blurb: 'You cannot see out. Everyone can see themselves.',
  },
  {
    id: 'shoulder-fins',
    name: 'Inflatable Shoulder Fins',
    kind: 'armour',
    price: 260,
    blurb: 'Aerodynamic in no measurable way.',
  },
  {
    id: 'vhs-burst',
    name: 'VHS Scanline Victory Burst',
    kind: 'burst',
    price: 300,
    blurb: 'Tracking error, but make it celebratory.',
  },
  {
    id: 'flamingo-trail',
    name: 'Flamingo Boost Trail',
    kind: 'trail',
    price: 340,
    blurb: 'Six flamingos. Legally distinct from taste.',
  },
];

export const PAINT_STYLES: Array<{ id: PaintStyleId; name: string; requires?: string }> = [
  { id: 'classic', name: 'Classic Gloss' },
  { id: 'bubble', name: 'Bubble', requires: 'bubble-trail' },
  { id: 'flamingo', name: 'Flamingo', requires: 'flamingo-trail' },
];

export function createGuestProfile(rng: () => number = Math.random): GuestProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    guestId: generateGuestId(rng),
    displayName: generateGuestName(rng),
    createdAt: Date.now(),
    matchesCompleted: 0,
    xp: 0,
    credits: 0,
    rank: 1,
    selectedMarker: STARTING_MARKER,
    selectedPaintStyle: 'classic',
    unlockedCosmetics: [],
    sessionsCompleted: 0,
  };
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Accepts anything previously written to localStorage — including the pre-versioned
 * v1 shape, which had no `schemaVersion`, no `sessionsCompleted` and no paint style.
 * Never throws; a hopeless record becomes a fresh profile.
 */
export function migrateProfile(raw: unknown, rng: () => number = Math.random): GuestProfile {
  if (typeof raw !== 'object' || raw === null) return createGuestProfile(rng);
  const r = raw as Record<string, unknown>;

  const guestId = typeof r.guestId === 'string' && r.guestId.length > 0 ? r.guestId : null;
  if (!guestId) return createGuestProfile(rng);

  const xp = Math.max(0, toNumber(r.xp, 0));
  const cosmetics = Array.isArray(r.unlockedCosmetics)
    ? r.unlockedCosmetics.filter((c): c is string => typeof c === 'string')
    : [];

  const marker: MarkerId = isMarkerId(r.selectedMarker) ? r.selectedMarker : STARTING_MARKER;
  const paintStyle = r.selectedPaintStyle;
  const validStyle = PAINT_STYLES.some((s) => s.id === paintStyle);

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    guestId,
    displayName:
      typeof r.displayName === 'string' && r.displayName.trim().length > 0
        ? r.displayName.trim().slice(0, 20)
        : generateGuestName(rng),
    createdAt: toNumber(r.createdAt, Date.now()),
    matchesCompleted: Math.max(0, Math.floor(toNumber(r.matchesCompleted, 0))),
    xp,
    credits: Math.max(0, Math.floor(toNumber(r.credits, 0))),
    // Rank is always recomputed: it is a pure function of XP, and older records stored it wrong.
    rank: rankForXp(xp),
    selectedMarker: marker,
    selectedPaintStyle: validStyle ? (paintStyle as PaintStyleId) : 'classic',
    unlockedCosmetics: cosmetics,
    sessionsCompleted: Math.max(0, Math.floor(toNumber(r.sessionsCompleted, 0))),
  };
}

export interface UnlockBeat {
  match: number;
  title: string;
  body: string;
  cosmeticId?: string;
  /** Prototype-only teaser with no working implementation behind it. */
  teaser?: boolean;
}

/** First-session pacing, one beat per completed match. */
export const UNLOCK_BEATS: UnlockBeat[] = [
  {
    match: 1,
    title: 'NEW PAINT TRAIL',
    body: 'Bubble Paint Trail unlocked.',
    cosmeticId: 'bubble-trail',
  },
  {
    match: 2,
    title: 'NEW VISOR TINT',
    body: 'Toxic-Lime Visor unlocked.',
    cosmeticId: 'lime-visor',
  },
  {
    match: 3,
    title: 'MARKER SIDEGRADE',
    body: 'Choose Brickshot or Triple Tap in the locker.',
  },
  {
    match: 4,
    title: 'CREATE TEAM',
    body: 'Team creation is coming later.',
    teaser: true,
  },
  {
    match: 5,
    title: 'ARENA PASS',
    body: 'Your first Arena Pass challenge is available.',
  },
];

export function beatForMatch(matchesCompleted: number): UnlockBeat | null {
  return UNLOCK_BEATS.find((b) => b.match === matchesCompleted) ?? null;
}

export function ownsCosmetic(profile: GuestProfile, id: string): boolean {
  return profile.unlockedCosmetics.includes(id);
}

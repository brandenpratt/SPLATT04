import {
  COSMETICS,
  GuestProfile,
  MarkerId,
  PROFILE_STORAGE_KEY,
  PaintStyleId,
  ProfileRepository,
  RewardLedger,
  beatForMatch,
  createGuestProfile,
  migrateProfile,
  rankForXp,
} from '@splat04/shared';

const SETTINGS_KEY = 'splat04.settings';

export interface Settings {
  quality: 'auto' | 'low' | 'high';
  sound: boolean;
  haptics: boolean;
  aimAssist: 'standard' | 'reduced';
  reducedMotion: boolean;
  highContrast: boolean;
  speech: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  sound: true,
  haptics: true,
  aimAssist: 'standard',
  reducedMotion: false,
  highContrast: false,
  // Browser speech synthesis is opt-in and off by default, per the brief.
  speech: false,
};

function readJson<T>(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private browsing, disabled storage, or corrupt JSON — never fatal.
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a nice-to-have; the game must remain playable without it.
  }
}

/**
 * localStorage implementation of the persistence seam. Swapping this for a
 * database-backed repository later requires no changes to game code.
 */
export class LocalProfileRepository implements ProfileRepository {
  async load(): Promise<GuestProfile | null> {
    const raw = readJson(PROFILE_STORAGE_KEY);
    return raw ? migrateProfile(raw) : null;
  }

  async save(profile: GuestProfile): Promise<void> {
    writeJson(PROFILE_STORAGE_KEY, profile);
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(PROFILE_STORAGE_KEY);
    } catch {
      // Nothing to do.
    }
  }
}

/** Local-only ledger. The interface is the seam; this implementation is deliberately dumb. */
export class LocalRewardLedger implements RewardLedger {
  async recordXp(): Promise<void> {}
  async recordCredits(): Promise<void> {}
}

export function loadProfileSync(): GuestProfile {
  const raw = readJson(PROFILE_STORAGE_KEY);
  const profile = raw ? migrateProfile(raw) : createGuestProfile();
  writeJson(PROFILE_STORAGE_KEY, profile);
  return profile;
}

export function saveProfile(profile: GuestProfile): void {
  writeJson(PROFILE_STORAGE_KEY, profile);
}

export function loadSettings(): Settings {
  const raw = readJson(SETTINGS_KEY) as Partial<Settings> | null;
  const prefersReducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    ...DEFAULT_SETTINGS,
    reducedMotion: prefersReducedMotion,
    ...(raw ?? {}),
  };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

export interface RoundOutcome {
  xpGained: number;
  creditsGained: number;
}

/** Apply an end-of-round result and return the freshly persisted profile plus any unlock beat. */
export function applyRoundResult(
  profile: GuestProfile,
  outcome: RoundOutcome,
): { profile: GuestProfile; unlocked: ReturnType<typeof beatForMatch> } {
  const next: GuestProfile = {
    ...profile,
    matchesCompleted: profile.matchesCompleted + 1,
    xp: profile.xp + outcome.xpGained,
    credits: profile.credits + outcome.creditsGained,
    unlockedCosmetics: [...profile.unlockedCosmetics],
  };
  next.rank = rankForXp(next.xp);

  const beat = beatForMatch(next.matchesCompleted);
  if (beat?.cosmeticId && !next.unlockedCosmetics.includes(beat.cosmeticId)) {
    next.unlockedCosmetics.push(beat.cosmeticId);
  }
  saveProfile(next);
  return { profile: next, unlocked: beat };
}

export function purchaseCosmetic(
  profile: GuestProfile,
  cosmeticId: string,
): { profile: GuestProfile; ok: boolean; reason?: string } {
  const cosmetic = COSMETICS.find((c) => c.id === cosmeticId);
  if (!cosmetic) return { profile, ok: false, reason: 'Unknown item.' };
  if (profile.unlockedCosmetics.includes(cosmeticId)) {
    return { profile, ok: false, reason: 'Already owned.' };
  }
  if (profile.credits < cosmetic.price) {
    return { profile, ok: false, reason: 'Not enough Credits.' };
  }
  const next: GuestProfile = {
    ...profile,
    credits: profile.credits - cosmetic.price,
    unlockedCosmetics: [...profile.unlockedCosmetics, cosmeticId],
  };
  saveProfile(next);
  return { profile: next, ok: true };
}

export function setMarker(profile: GuestProfile, marker: MarkerId): GuestProfile {
  const next = { ...profile, selectedMarker: marker };
  saveProfile(next);
  return next;
}

export function setPaintStyle(profile: GuestProfile, style: PaintStyleId): GuestProfile {
  const next = { ...profile, selectedPaintStyle: style };
  saveProfile(next);
  return next;
}

export function bumpSession(profile: GuestProfile): GuestProfile {
  const next = { ...profile, sessionsCompleted: profile.sessionsCompleted + 1 };
  saveProfile(next);
  return next;
}

export const TeamId = {
  Cyan: 1,
  Magenta: 2,
} as const;
export type TeamId = (typeof TeamId)[keyof typeof TeamId];

/** Paint ownership stored per grid cell. Matches TeamId for 1 and 2 on purpose. */
export enum PaintOwner {
  Neutral = 0,
  Cyan = 1,
  Magenta = 2,
}

export type MarkerId = 'compressor' | 'brickshot' | 'triple-tap';
export type PaintStyleId = 'classic' | 'bubble' | 'flamingo';

export type BotMode = 'paint-route' | 'hunt' | 'defend' | 'retreat' | 'boost-reposition';

export type RoundPhase = 'active' | 'intermission';

export interface PlayerInput {
  seq: number;
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  firing: boolean;
  boostPressed: boolean;
  selectedMarker: MarkerId;
  clientTime: number;
}

/** Mutable per-player simulation state. Owned by the server; mirrored for prediction. */
export interface PlayerState {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  aimX: number;
  aimZ: number;
  marker: MarkerId;
  alive: boolean;
  respawnAt: number;
  boostUntil: number;
  boostReadyAt: number;
  nextFireAt: number;
  burstRemaining: number;
  nextBurstAt: number;
  spreadHeat: number;
  tags: number;
  splatted: number;
  cellsPainted: number;
  connected: boolean;
}

export interface ProjectileState {
  id: number;
  ownerId: string;
  team: TeamId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  splashRadius: number;
  spawnedAt: number;
  travelled: number;
  /** Distance at which this paintball lands and splashes the floor. */
  range: number;
  /** Remaining aim-assist curve, in degrees. Spends down so aiming never feels automatic. */
  curveBudget: number;
  /** Travel distance of the next in-flight paint dribble. */
  nextDribbleAt: number;
}

export interface Coverage {
  cyan: number;
  magenta: number;
  neutral: number;
}

export interface GuestProfile {
  schemaVersion: number;
  guestId: string;
  displayName: string;
  createdAt: number;
  matchesCompleted: number;
  xp: number;
  credits: number;
  rank: number;
  selectedMarker: MarkerId;
  selectedPaintStyle: PaintStyleId;
  unlockedCosmetics: string[];
  sessionsCompleted: number;
}

export interface Challenge {
  id: string;
  arenaSlug: 'vice-estate-04';
  teamPreference?: TeamId;
  scoreToBeat: number;
  createdByGuestId: string;
  createdByName: string;
  expiresAt: number;
}

export interface Crew {
  code: string;
  roomId: string;
  team: TeamId;
  createdAt: number;
  expiresAt: number;
}

export interface RoundResult {
  winner: TeamId | null;
  coverage: Coverage;
  endedAt: number;
}

/** Personal end-of-round scoreboard line. */
export interface PlayerRoundSummary {
  playerId: string;
  name: string;
  team: TeamId;
  tags: number;
  splatted: number;
  areaPaintedPercent: number;
  assists: number;
  xpGained: number;
  creditsGained: number;
  won: boolean;
}

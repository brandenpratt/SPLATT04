/** Tuned gameplay constants. Shared verbatim by server sim, client prediction and practice mode. */

export const ROUND_SECONDS = 105;
export const INTERMISSION_SECONDS = 8;
export const RESPAWN_SECONDS = 2.2;

// 7.5 * 0.92 — movement energy is the good part; lethality is what needed slowing.
export const PLAYER_MOVE_SPEED = 6.9;
export const PLAYER_RADIUS = 0.62;
export const PLAYER_ACCEL = 62;

export const BOOST_MULTIPLIER = 1.7;
export const BOOST_DURATION_MS = 600;
export const BOOST_COOLDOWN_MS = 4000;

export const FRIENDLY_PAINT_SPEED_MULTIPLIER = 1.07;
export const ENEMY_PAINT_SPEED_MULTIPLIER = 0.93;

// 34 * 0.90
export const PROJECTILE_SPEED = 30.6;
export const PROJECTILE_RADIUS = 0.22;
export const PROJECTILE_LIFETIME_MS = 1400;
export const PROJECTILE_MAX_RANGE = 30;

export const DEFAULT_FIRE_INTERVAL_MS = 145;
export const DEFAULT_SPLASH_RADIUS = 1.35;

export const AIM_ASSIST_MAX_DEGREES = 6;
export const AIM_ASSIST_MAX_RANGE = 24;
export const AIM_ASSIST_TURN_RATE = 2.6; // deg of curve applied per simulated tick

export const ROOM_SIZE = 8;
export const TEAM_SIZE = ROOM_SIZE / 2;

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 10;
export const INPUT_SEND_RATE = 20;
export const INTERPOLATION_DELAY_MS = 120;

/** How long a disconnected human keeps their slot before a bot takes it for good. */
export const RECONNECT_GRACE_MS = 20_000;

/** Server-side leniency when validating client fire rate / movement. */
export const FIRE_RATE_TOLERANCE = 0.85;
export const MOVE_SPEED_TOLERANCE = 1.35;

export const MAX_DISPLAY_NAME_LENGTH = 20;
export const MAX_CREW_CODE_LENGTH = 24;

export const CREW_TTL_MS = 2 * 60 * 60 * 1000;
export const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;

/** XP awards. See `xp.ts` for the capped calculation. */
export const XP_ROUND_COMPLETE = 100;
export const XP_WINNING_TEAM = 50;
export const XP_PER_TAG = 10;
export const XP_PER_NET_AREA_PERCENT = 4;
export const XP_CHALLENGE_COMPLETE = 25;
export const XP_MAX_TAGS_COUNTED = 25;
export const XP_MAX_NET_AREA_PERCENT = 40;

export const CREDITS_PER_ROUND = 40;
export const CREDITS_PER_WIN = 25;

// ---------------------------------------------------------------------------
// Suit Saturation
// ---------------------------------------------------------------------------

/**
 * Casual Quick Splat replaces one-hit elimination with a short time-to-tag: a suit
 * saturates with paint and a player is only tagged once it is fully soaked.
 *
 * Every value is a constant so a future competitive mode can restore one-hit rules by
 * setting `SATURATION_DIRECT_HIT` to `SATURATION_MAX`.
 */
export const SATURATION_MAX = 100;
/** A clean projectile hit. 42 means three direct hits tag, with a little room to spare. */
export const SATURATION_DIRECT_HIT = 42;
/** Splash saturation falls off linearly from this maximum at the impact point... */
export const SATURATION_SPLASH_MAX = 20;
/** ...down to this at the very edge of the splash radius. */
export const SATURATION_SPLASH_MIN = 12;
/** Splash reaches a little past the paint radius, so near-misses still pressure. */
export const SATURATION_SPLASH_RADIUS_SCALE = 1.6;
/** Quiet period before a suit starts shedding paint again. */
export const SATURATION_RECOVERY_DELAY_MS = 2500;
/** Saturation shed per second once recovery begins. */
export const SATURATION_RECOVERY_PER_SECOND = 18;
/** Above this fraction the HUD warns and the edge paint intensifies. */
export const SATURATION_WARNING_FRACTION = 0.7;

/** Spawn protection: ends after this long, or the moment the player fires. */
export const SPAWN_SHIELD_MS = 2000;

export const ARENA_SLUG = 'vice-estate-04';
export const ARENA_NAME = 'VICE ESTATE 04';

// ---------------------------------------------------------------------------
// Bot difficulty
// ---------------------------------------------------------------------------

export type BotDifficulty = 'chill' | 'arcade' | 'pro';
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'arcade';

export interface BotDifficultySpec {
  /** Delay between first seeing a target and being able to shoot at it, in ms. */
  reactionMsMin: number;
  reactionMsMax: number;
  /** Aim error at medium range, in degrees. */
  aimErrorDegMin: number;
  aimErrorDegMax: number;
  /** Rounds fired per burst before the bot must pause. */
  burstMin: number;
  burstMax: number;
  /** Pause between bursts, in ms. */
  burstCooldownMsMin: number;
  burstCooldownMsMax: number;
  /** How eagerly the tier hunts humans instead of painting. 0..1. */
  hunting: number;
  /** Maximum turn rate while tracking a target, in degrees per second. */
  turnRateDegPerSecond: number;
}

export const BOT_DIFFICULTIES: Record<BotDifficulty, BotDifficultySpec> = {
  chill: {
    reactionMsMin: 850,
    reactionMsMax: 1200,
    aimErrorDegMin: 14,
    aimErrorDegMax: 20,
    burstMin: 2,
    burstMax: 3,
    burstCooldownMsMin: 550,
    burstCooldownMsMax: 900,
    hunting: 0.2,
    turnRateDegPerSecond: 130,
  },
  arcade: {
    reactionMsMin: 500,
    reactionMsMax: 850,
    aimErrorDegMin: 8,
    aimErrorDegMax: 14,
    burstMin: 3,
    burstMax: 5,
    burstCooldownMsMin: 250,
    burstCooldownMsMax: 650,
    hunting: 0.5,
    turnRateDegPerSecond: 200,
  },
  pro: {
    reactionMsMin: 250,
    reactionMsMax: 500,
    aimErrorDegMin: 3,
    aimErrorDegMax: 8,
    burstMin: 4,
    burstMax: 7,
    burstCooldownMsMin: 200,
    burstCooldownMsMax: 420,
    hunting: 0.85,
    turnRateDegPerSecond: 300,
  },
};

/** A target stays "confidently tracked" for this long after it breaks line of sight. */
export const BOT_TARGET_MEMORY_MS = 1200;
/** How far a bot can notice an opponent at all. */
export const BOT_SIGHT_RANGE = 30;
/** No more than this many bots deliberately focus one human, unless it holds the centre. */
export const BOT_MAX_FOCUS_PER_HUMAN = 2;
/** Radius around the arena centre that counts as "on the objective". */
export const OBJECTIVE_RADIUS = 12;

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === 'chill' || value === 'arcade' || value === 'pro';
}

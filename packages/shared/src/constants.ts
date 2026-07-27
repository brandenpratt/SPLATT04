/** Tuned gameplay constants. Shared verbatim by server sim, client prediction and practice mode. */

export const ROUND_SECONDS = 90;
export const INTERMISSION_SECONDS = 8;
export const RESPAWN_SECONDS = 2;

export const PLAYER_MOVE_SPEED = 7.5;
export const PLAYER_RADIUS = 0.62;
export const PLAYER_ACCEL = 62;

export const BOOST_MULTIPLIER = 1.85;
export const BOOST_DURATION_MS = 650;
export const BOOST_COOLDOWN_MS = 3500;

export const FRIENDLY_PAINT_SPEED_MULTIPLIER = 1.1;
export const ENEMY_PAINT_SPEED_MULTIPLIER = 0.9;

export const PROJECTILE_SPEED = 34;
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

export const ARENA_SLUG = 'vice-estate-04';
export const ARENA_NAME = 'VICE ESTATE 04';

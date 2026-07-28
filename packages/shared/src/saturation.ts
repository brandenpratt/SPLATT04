import {
  SATURATION_DIRECT_HIT,
  SATURATION_MAX,
  SATURATION_RECOVERY_DELAY_MS,
  SATURATION_RECOVERY_PER_SECOND,
  SATURATION_SPLASH_MAX,
  SATURATION_SPLASH_MIN,
  SATURATION_SPLASH_RADIUS_SCALE,
  SATURATION_WARNING_FRACTION,
  SPAWN_SHIELD_MS,
} from './constants.js';

/**
 * Suit Saturation — the casual Quick Splat damage model.
 *
 * A paintball no longer deletes a player outright. Their suit soaks up paint, and they
 * are only tagged once it is fully saturated. Three direct hits do it, or one direct hit
 * plus sustained splash pressure. Everything is driven by the constants above so a future
 * competitive mode can restore one-hit rules by raising `SATURATION_DIRECT_HIT`.
 */
export interface Saturable {
  saturation: number;
  /** Timestamp of the most recent saturation gain, for the recovery delay. */
  lastSaturatedAt: number;
  /** Spawn protection expiry. Zero once it has been consumed. */
  shieldUntil: number;
}

export function isShielded(player: Saturable, now: number): boolean {
  return player.shieldUntil > now;
}

/** Called the instant a player fires: spawn protection is a shield, not a free kill. */
export function dropSpawnShield(player: Saturable): void {
  player.shieldUntil = 0;
}

export function grantSpawnShield(player: Saturable, now: number): void {
  player.shieldUntil = now + SPAWN_SHIELD_MS;
  player.saturation = 0;
  player.lastSaturatedAt = 0;
}

/**
 * Saturation contributed by a splash landing `distance` away from the player.
 * Peaks at the impact point and falls off linearly to the edge of the splash reach.
 */
export function splashSaturation(distance: number, splashRadius: number): number {
  const reach = splashRadius * SATURATION_SPLASH_RADIUS_SCALE;
  if (distance >= reach) return 0;
  const t = Math.max(0, distance) / reach;
  return SATURATION_SPLASH_MAX - (SATURATION_SPLASH_MAX - SATURATION_SPLASH_MIN) * t;
}

export interface SaturationResult {
  /** Saturation actually applied, after shielding. */
  applied: number;
  /** True when this hit pushed the player to full saturation. */
  tagged: boolean;
}

/** Apply an amount of saturation, respecting spawn shields. */
export function saturate(player: Saturable, amount: number, now: number): SaturationResult {
  if (amount <= 0 || isShielded(player, now)) return { applied: 0, tagged: false };
  const before = player.saturation;
  player.saturation = Math.min(SATURATION_MAX, before + amount);
  player.lastSaturatedAt = now;
  return {
    applied: player.saturation - before,
    tagged: before < SATURATION_MAX && player.saturation >= SATURATION_MAX,
  };
}

export function applyDirectHit(player: Saturable, now: number): SaturationResult {
  return saturate(player, SATURATION_DIRECT_HIT, now);
}

export function applySplash(
  player: Saturable,
  distance: number,
  splashRadius: number,
  now: number,
): SaturationResult {
  return saturate(player, splashSaturation(distance, splashRadius), now);
}

/** Shed paint once the player has been left alone for the recovery delay. */
export function recoverSaturation(player: Saturable, now: number, dtSeconds: number): void {
  if (player.saturation <= 0) return;
  if (now - player.lastSaturatedAt < SATURATION_RECOVERY_DELAY_MS) return;
  player.saturation = Math.max(0, player.saturation - SATURATION_RECOVERY_PER_SECOND * dtSeconds);
}

export function saturationFraction(player: Saturable): number {
  return Math.max(0, Math.min(1, player.saturation / SATURATION_MAX));
}

export function isCritical(player: Saturable): boolean {
  return saturationFraction(player) >= SATURATION_WARNING_FRACTION;
}

/** How many clean direct hits it takes to tag from full health. Used by tests and UI copy. */
export function directHitsToTag(): number {
  return Math.ceil(SATURATION_MAX / SATURATION_DIRECT_HIT);
}

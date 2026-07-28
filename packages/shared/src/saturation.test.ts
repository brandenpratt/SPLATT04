import { describe, expect, it } from 'vitest';
import {
  SATURATION_DIRECT_HIT,
  SATURATION_MAX,
  SATURATION_RECOVERY_DELAY_MS,
  SATURATION_RECOVERY_PER_SECOND,
  SATURATION_SPLASH_MAX,
  SATURATION_SPLASH_MIN,
  SATURATION_SPLASH_RADIUS_SCALE,
  SPAWN_SHIELD_MS,
} from './constants.js';
import {
  applyDirectHit,
  applySplash,
  directHitsToTag,
  dropSpawnShield,
  grantSpawnShield,
  isCritical,
  isShielded,
  recoverSaturation,
  saturate,
  saturationFraction,
  splashSaturation,
  type Saturable,
} from './saturation.js';
import { createPlayerState, emptyInput, tryFire } from './sim.js';
import { TeamId } from './types.js';

const fresh = (): Saturable => ({ saturation: 0, lastSaturatedAt: 0, shieldUntil: 0 });

describe('direct hits', () => {
  it('takes three clean hits to tag a player', () => {
    const player = fresh();
    expect(directHitsToTag()).toBe(3);

    expect(applyDirectHit(player, 1000).tagged).toBe(false);
    expect(player.saturation).toBe(SATURATION_DIRECT_HIT);

    expect(applyDirectHit(player, 1200).tagged).toBe(false);
    expect(player.saturation).toBe(SATURATION_DIRECT_HIT * 2);

    const third = applyDirectHit(player, 1400);
    expect(third.tagged).toBe(true);
    expect(player.saturation).toBe(SATURATION_MAX);
  });

  it('does not re-tag an already saturated player', () => {
    const player = fresh();
    for (let i = 0; i < 3; i++) applyDirectHit(player, 1000 + i);
    expect(player.saturation).toBe(SATURATION_MAX);
    expect(applyDirectHit(player, 2000).tagged).toBe(false);
  });

  it('never exceeds the maximum', () => {
    const player = fresh();
    saturate(player, 10_000, 1000);
    expect(player.saturation).toBe(SATURATION_MAX);
    expect(saturationFraction(player)).toBe(1);
  });

  it('ignores zero and negative amounts', () => {
    const player = fresh();
    expect(saturate(player, 0, 1000).applied).toBe(0);
    expect(saturate(player, -50, 1000).applied).toBe(0);
    expect(player.saturation).toBe(0);
  });
});

describe('splash falloff', () => {
  it('peaks at the impact point and falls to the minimum at the edge', () => {
    const radius = 1.35;
    const reach = radius * SATURATION_SPLASH_RADIUS_SCALE;
    expect(splashSaturation(0, radius)).toBeCloseTo(SATURATION_SPLASH_MAX, 5);
    expect(splashSaturation(reach * 0.999, radius)).toBeCloseTo(SATURATION_SPLASH_MIN, 1);
  });

  it('falls off monotonically', () => {
    const radius = 2;
    let previous = Infinity;
    for (let d = 0; d < radius * SATURATION_SPLASH_RADIUS_SCALE; d += 0.25) {
      const value = splashSaturation(d, radius);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it('contributes nothing beyond the splash reach', () => {
    const radius = 1.35;
    expect(splashSaturation(radius * SATURATION_SPLASH_RADIUS_SCALE, radius)).toBe(0);
    expect(splashSaturation(50, radius)).toBe(0);
  });

  it('lets a direct hit plus splash pressure tag a player', () => {
    const player = fresh();
    applyDirectHit(player, 1000);
    let ticks = 0;
    while (player.saturation < SATURATION_MAX && ticks < 20) {
      applySplash(player, 0.4, 1.35, 1000 + ticks * 50);
      ticks++;
    }
    expect(player.saturation).toBe(SATURATION_MAX);
    // Fewer splashes than it would take from full health.
    expect(ticks).toBeLessThan(6);
  });
});

describe('recovery', () => {
  it('waits out the recovery delay before shedding paint', () => {
    const player = fresh();
    applyDirectHit(player, 1000);
    const soaked = player.saturation;

    recoverSaturation(player, 1000 + SATURATION_RECOVERY_DELAY_MS - 1, 1);
    expect(player.saturation).toBe(soaked);

    recoverSaturation(player, 1000 + SATURATION_RECOVERY_DELAY_MS + 1, 1);
    expect(player.saturation).toBeCloseTo(soaked - SATURATION_RECOVERY_PER_SECOND, 5);
  });

  it('recovers at the configured rate and stops at zero', () => {
    const player = fresh();
    applyDirectHit(player, 0);
    const now = SATURATION_RECOVERY_DELAY_MS + 10;
    for (let i = 0; i < 10; i++) recoverSaturation(player, now + i * 1000, 1);
    expect(player.saturation).toBe(0);
  });

  it('restarts the delay each time the player is hit again', () => {
    const player = fresh();
    applyDirectHit(player, 1000);
    applyDirectHit(player, 1000 + SATURATION_RECOVERY_DELAY_MS - 100);
    // The second hit reset the clock, so this is still inside the delay.
    const soaked = player.saturation;
    recoverSaturation(player, 1000 + SATURATION_RECOVERY_DELAY_MS + 50, 1);
    expect(player.saturation).toBe(soaked);
  });
});

describe('spawn shield', () => {
  it('blocks all saturation while active', () => {
    const player = fresh();
    grantSpawnShield(player, 1000);
    expect(isShielded(player, 1000)).toBe(true);

    expect(applyDirectHit(player, 1500).applied).toBe(0);
    expect(applySplash(player, 0, 2, 1500).applied).toBe(0);
    expect(player.saturation).toBe(0);
  });

  it('expires on its own after the shield duration', () => {
    const player = fresh();
    grantSpawnShield(player, 1000);
    expect(isShielded(player, 1000 + SPAWN_SHIELD_MS - 1)).toBe(true);
    expect(isShielded(player, 1000 + SPAWN_SHIELD_MS + 1)).toBe(false);

    applyDirectHit(player, 1000 + SPAWN_SHIELD_MS + 1);
    expect(player.saturation).toBe(SATURATION_DIRECT_HIT);
  });

  it('is forfeited the moment it is dropped', () => {
    const player = fresh();
    grantSpawnShield(player, 1000);
    dropSpawnShield(player);
    expect(isShielded(player, 1100)).toBe(false);
    expect(applyDirectHit(player, 1100).applied).toBe(SATURATION_DIRECT_HIT);
  });

  it('is forfeited by firing, through the shared fire path', () => {
    const player = createPlayerState('p1', 'Shielded', TeamId.Cyan, false, { x: 0, z: 0 });
    grantSpawnShield(player, 1000);
    expect(isShielded(player, 1000)).toBe(true);

    const shots = tryFire(player, { ...emptyInput(), firing: true }, 1000, () => 0.5);
    expect(shots.length).toBeGreaterThan(0);
    // Shooting from behind a shield is exactly what the rule exists to prevent.
    expect(isShielded(player, 1000)).toBe(false);
  });

  it('is not dropped by merely holding fire while on cooldown', () => {
    const player = createPlayerState('p1', 'Shielded', TeamId.Cyan, false, { x: 0, z: 0 });
    grantSpawnShield(player, 1000);
    // Nowhere near the fire interval, so no shot is emitted and the shield survives.
    player.nextFireAt = 5000;
    const shots = tryFire(player, { ...emptyInput(), firing: true }, 1000, () => 0.5);
    expect(shots).toHaveLength(0);
    expect(isShielded(player, 1000)).toBe(true);
  });
});

describe('warning threshold', () => {
  it('flags a critically saturated suit', () => {
    const player = fresh();
    expect(isCritical(player)).toBe(false);
    applyDirectHit(player, 1000);
    expect(isCritical(player)).toBe(false);
    applyDirectHit(player, 1100);
    expect(isCritical(player)).toBe(true);
  });
});

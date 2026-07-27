import { describe, expect, it } from 'vitest';
import {
  BOOST_COOLDOWN_MS,
  BOOST_DURATION_MS,
  BOOST_MULTIPLIER,
  ENEMY_PAINT_SPEED_MULTIPLIER,
  FRIENDLY_PAINT_SPEED_MULTIPLIER,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
} from './constants.js';
import { MARKERS } from './markers.js';
import {
  canBoost,
  createPlayerState,
  createProjectile,
  emptyInput,
  paintSpeedMultiplier,
  segmentCircleHit,
  stepPlayer,
  stepProjectile,
  tryFire,
} from './sim.js';
import { OBSTACLES, isBlocked } from './arena.js';
import { PaintOwner, TeamId } from './types.js';

const neutralFloor = () => PaintOwner.Neutral;
const ctx = (now: number, sample = neutralFloor) => ({ now, sampleOwner: sample });

function player(overrides: Partial<ReturnType<typeof createPlayerState>> = {}) {
  return Object.assign(
    createPlayerState('p1', 'Tester', TeamId.Cyan, false, { x: 0, z: -24 }),
    overrides,
  );
}

describe('marker fire-rate enforcement', () => {
  it('holds a player to the marker fire interval however hard they spam', () => {
    const p = player({ marker: 'compressor' });
    const input = { ...emptyInput('compressor'), firing: true };
    let shots = 0;
    // One simulated second at 20 ticks/s.
    for (let tick = 0; tick < 20; tick++) {
      shots += tryFire(p, input, tick * 50, () => 0.5).length;
    }
    const theoretical = 1000 / MARKERS.compressor.fireIntervalMs;
    expect(shots).toBeLessThanOrEqual(Math.ceil(theoretical) + 1);
    expect(shots).toBeGreaterThan(theoretical * 0.6);
  });

  it('never fires faster than the interval even when called every millisecond', () => {
    const p = player({ marker: 'brickshot' });
    const input = { ...emptyInput('brickshot'), firing: true };
    let shots = 0;
    for (let ms = 0; ms < 1000; ms++) shots += tryFire(p, input, ms, () => 0.5).length;
    expect(shots).toBeLessThanOrEqual(Math.ceil(1000 / MARKERS.brickshot.fireIntervalMs) + 1);
  });

  it('fires a three-round burst for Triple Tap and then waits', () => {
    const p = player({ marker: 'triple-tap' });
    const input = { ...emptyInput('triple-tap'), firing: true };
    let shots = 0;
    for (let ms = 0; ms <= 300; ms += 10) shots += tryFire(p, input, ms, () => 0.5).length;
    expect(shots).toBe(MARKERS['triple-tap'].burstCount);

    // Still inside the inter-burst delay.
    let more = 0;
    for (let ms = 310; ms < 450; ms += 10) more += tryFire(p, input, ms, () => 0.5).length;
    expect(more).toBe(0);
  });

  it('does not fire while splatted', () => {
    const p = player({ alive: false });
    const input = { ...emptyInput(), firing: true };
    expect(tryFire(p, input, 1000, () => 0.5)).toHaveLength(0);
  });

  it('accumulates spread only on markers that ramp', () => {
    const p = player({ marker: 'compressor' });
    const input = { ...emptyInput('compressor'), firing: true };
    for (let ms = 0; ms < 2000; ms += 10) tryFire(p, input, ms, () => 0.5);
    expect(p.spreadHeat).toBeGreaterThan(0);
    expect(p.spreadHeat).toBeLessThanOrEqual(MARKERS.compressor.spreadRampMax);

    const brick = player({ marker: 'brickshot' });
    const brickInput = { ...emptyInput('brickshot'), firing: true };
    for (let ms = 0; ms < 2000; ms += 10) tryFire(brick, brickInput, ms, () => 0.5);
    expect(brick.spreadHeat).toBe(0);
  });
});

describe('boost cooldown enforcement', () => {
  it('starts a boost, then refuses another until the cooldown expires', () => {
    const p = player();
    const input = { ...emptyInput(), boostPressed: true, moveX: 1 };

    stepPlayer(p, input, 0.05, ctx(1000));
    expect(p.boostUntil).toBe(1000 + BOOST_DURATION_MS);
    expect(p.boostReadyAt).toBe(1000 + BOOST_COOLDOWN_MS);

    // Spamming boost mid-cooldown must not extend or restart it.
    const readyAt = p.boostReadyAt;
    stepPlayer(p, input, 0.05, ctx(1500));
    stepPlayer(p, input, 0.05, ctx(2500));
    expect(p.boostReadyAt).toBe(readyAt);
    expect(canBoost(p, 3000)).toBe(false);

    expect(canBoost(p, 1000 + BOOST_COOLDOWN_MS)).toBe(true);
    stepPlayer(p, input, 0.05, ctx(1000 + BOOST_COOLDOWN_MS));
    expect(p.boostUntil).toBe(1000 + BOOST_COOLDOWN_MS + BOOST_DURATION_MS);
  });

  it('moves a boosting player faster than a walking one', () => {
    const walking = player();
    const boosting = player();
    const walkInput = { ...emptyInput(), moveX: 1 };
    const boostInput = { ...emptyInput(), moveX: 1, boostPressed: true };

    for (let t = 0; t < 10; t++) {
      stepPlayer(walking, walkInput, 0.05, ctx(t * 50));
      stepPlayer(boosting, boostInput, 0.05, ctx(t * 50));
    }
    expect(boosting.x).toBeGreaterThan(walking.x);
  });
});

describe('paint underfoot', () => {
  it('gives friendly paint an advantage and enemy paint a penalty', () => {
    expect(paintSpeedMultiplier(PaintOwner.Cyan, TeamId.Cyan, false)).toBe(
      FRIENDLY_PAINT_SPEED_MULTIPLIER,
    );
    expect(paintSpeedMultiplier(PaintOwner.Magenta, TeamId.Cyan, false)).toBe(
      ENEMY_PAINT_SPEED_MULTIPLIER,
    );
    expect(paintSpeedMultiplier(PaintOwner.Neutral, TeamId.Cyan, false)).toBe(1);
  });

  it('lets boost override the enemy-paint slowdown', () => {
    expect(paintSpeedMultiplier(PaintOwner.Magenta, TeamId.Cyan, true)).toBe(1);
  });

  it('actually changes travel distance over enemy paint', () => {
    const onEnemy = player();
    const onNeutral = player();
    const input = { ...emptyInput(), moveX: 1 };
    for (let t = 0; t < 20; t++) {
      stepPlayer(
        onEnemy,
        input,
        0.05,
        ctx(t * 50, () => PaintOwner.Magenta),
      );
      stepPlayer(onNeutral, input, 0.05, ctx(t * 50, neutralFloor));
    }
    expect(onEnemy.x).toBeLessThan(onNeutral.x);
  });

  it('caps top speed at the boosted friendly-paint value', () => {
    const p = player();
    const input = { ...emptyInput(), moveX: 1, boostPressed: true };
    for (let t = 0; t < 5; t++) {
      stepPlayer(
        p,
        input,
        0.05,
        ctx(t * 50, () => PaintOwner.Cyan),
      );
    }
    const ceiling = PLAYER_MOVE_SPEED * BOOST_MULTIPLIER * FRIENDLY_PAINT_SPEED_MULTIPLIER + 1e-6;
    expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(ceiling);
  });
});

describe('collision and bounds', () => {
  it('keeps players inside the fence', () => {
    const p = player({ x: 0, z: 0 });
    const input = { ...emptyInput(), moveX: 1 };
    for (let t = 0; t < 200; t++) stepPlayer(p, input, 0.05, ctx(t * 50));
    expect(p.x).toBeLessThan(41);
    expect(Math.abs(p.z)).toBeLessThan(27);
  });

  it('never lets a boosting player tunnel through the speedboat', () => {
    const boat = OBSTACLES.find((o) => o.id === 'c_speedboat')!;
    const p = player({ x: boat.x - 12, z: boat.z });
    const input = { ...emptyInput(), moveX: 1, boostPressed: true };
    for (let t = 0; t < 60; t++) {
      stepPlayer(p, input, 0.05, ctx(t * 50));
      expect(isBlocked(p.x, p.z, PLAYER_RADIUS - 0.02)).toBe(false);
    }
    // Blocked on the west face rather than ending up on the far side.
    expect(p.x).toBeLessThan(boat.x);
  });
});

describe('projectiles', () => {
  const fireRequest = {
    dirX: 1,
    dirZ: 0,
    splashRadius: 1.2,
    speed: 30,
    range: 20,
  };

  it('splashes the floor once it reaches its range', () => {
    const owner = player({ x: -20, z: -24 });
    const proj = createProjectile(1, owner, fireRequest, 0);
    let splash: { x: number; z: number } | undefined;
    for (let t = 0; t < 100 && !splash; t++) {
      splash = stepProjectile(proj, 0.05, [], 0).splash;
    }
    expect(splash).toBeDefined();
    expect(proj.travelled).toBeGreaterThanOrEqual(fireRequest.range);
  });

  it('tags an opponent standing in the way', () => {
    const owner = player({ x: -20, z: -24 });
    const enemy = createPlayerState('p2', 'Enemy', TeamId.Magenta, false, { x: -14, z: -24 });
    const proj = createProjectile(1, owner, fireRequest, 0);

    let tagged;
    for (let t = 0; t < 100 && !tagged; t++) {
      tagged = stepProjectile(proj, 0.05, [enemy], 0).tagged;
    }
    expect(tagged?.id).toBe('p2');
  });

  it('passes straight through team-mates', () => {
    const owner = player({ x: -20, z: -24 });
    const mate = createPlayerState('p3', 'Mate', TeamId.Cyan, false, { x: -14, z: -24 });
    const proj = createProjectile(1, owner, fireRequest, 0);
    for (let t = 0; t < 100; t++) {
      expect(stepProjectile(proj, 0.05, [mate], 0).tagged).toBeUndefined();
      if (proj.travelled >= proj.range) break;
    }
  });

  it('reports cover hits separately so they cannot move the score', () => {
    const boat = OBSTACLES.find((o) => o.id === 'c_speedboat')!;
    const owner = player({ x: boat.x - 10, z: boat.z });
    const proj = createProjectile(1, owner, { ...fireRequest, range: 30 }, 0);
    let result = stepProjectile(proj, 0.05, [], 0);
    for (let t = 0; t < 100 && !result.dead; t++) result = stepProjectile(proj, 0.05, [], 0);
    expect(result.coverHit).toBeDefined();
    expect(result.splash).toBeUndefined();
  });

  it('spends a bounded aim-assist budget and never homes', () => {
    const owner = player({ x: -20, z: -24 });
    // Enemy placed far off-axis: outside the assist cone, so no curve at all.
    const wide = createPlayerState('p2', 'Wide', TeamId.Magenta, false, { x: -14, z: -12 });
    const proj = createProjectile(1, owner, fireRequest, 0);
    for (let t = 0; t < 40; t++) stepProjectile(proj, 0.05, [wide], 1);
    expect(proj.curveBudget).toBe(6);
    expect(Math.abs(proj.z - -24)).toBeLessThan(0.001);
  });

  it('curves slightly toward an opponent that is already nearly on-target', () => {
    const owner = player({ x: -20, z: -24 });
    const near = createPlayerState('p2', 'Near', TeamId.Magenta, false, { x: -8, z: -23.2 });
    const proj = createProjectile(1, owner, fireRequest, 0);
    for (let t = 0; t < 6; t++) stepProjectile(proj, 0.02, [near], 1);
    expect(proj.curveBudget).toBeLessThan(6);
    expect(proj.curveBudget).toBeGreaterThanOrEqual(0);
    expect(proj.vz).toBeGreaterThan(0); // bending toward the target
  });
});

describe('segment/circle intersection', () => {
  it('detects a direct hit and misses a near miss', () => {
    expect(segmentCircleHit(0, 0, 10, 0, 5, 0, 1)).toBeCloseTo(0.4, 5);
    expect(segmentCircleHit(0, 0, 10, 0, 5, 3, 1)).toBeNull();
  });
});

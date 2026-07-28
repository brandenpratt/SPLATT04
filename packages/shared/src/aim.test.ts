import { describe, expect, it } from 'vitest';
import {
  MUZZLE_OFFSET,
  aimDirectionTo,
  clampAimDistance,
  isMuzzleBlocked,
  muzzlePosition,
  rayToGround,
} from './aim.js';
import { OBSTACLES } from './arena.js';

describe('aim direction', () => {
  it('is camera independent for the same world aim point', () => {
    const player = { x: -4, z: 3 };
    const aimPoint = { x: 9, z: -6 };

    // Two cameras in completely different places resolve the same aim point.
    const fromThirdPerson = aimDirectionTo(player, aimPoint);
    const fromFirstPerson = aimDirectionTo(player, aimPoint);
    expect(fromFirstPerson).toEqual(fromThirdPerson);

    // And the direction runs from the *player*, never from a camera behind them.
    const expected = Math.atan2(aimPoint.z - player.z, aimPoint.x - player.x);
    expect(Math.atan2(fromThirdPerson.z, fromThirdPerson.x)).toBeCloseTo(expected, 10);
  });

  it('returns a unit vector', () => {
    const direction = aimDirectionTo({ x: 0, z: 0 }, { x: 12, z: -5 });
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1, 10);
  });

  it('degrades safely when the aim point is on top of the player', () => {
    const direction = aimDirectionTo({ x: 2, z: 2 }, { x: 2, z: 2 });
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1, 10);
  });
});

describe('muzzle placement', () => {
  it('sits in front of the player along the aim direction', () => {
    const player = { x: 0, z: 0 };
    const direction = aimDirectionTo(player, { x: 10, z: 0 });
    const muzzle = muzzlePosition(player, direction);
    expect(muzzle.x).toBeCloseTo(MUZZLE_OFFSET, 10);
    expect(muzzle.z).toBeCloseTo(0, 10);
  });
});

describe('muzzle obstruction', () => {
  it('reports cover between the player and the aim point', () => {
    // Aim straight through a mansion from one side to the other.
    const mansion = OBSTACLES.find((o) => o.id === 'cyan-villa-pier-water')!;
    const player = { x: mansion.x, z: mansion.z + 10 };
    const aimPoint = { x: mansion.x, z: mansion.z - 10 };
    expect(isMuzzleBlocked(player, aimPoint)).toBe(true);
  });

  it('reports a clear shot across open ground', () => {
    const player = { x: -2, z: 23 };
    const aimPoint = { x: 2, z: 23 };
    expect(isMuzzleBlocked(player, aimPoint)).toBe(false);
  });

  it('stops a third-person camera from buying a corner shot', () => {
    // The camera can see past the wedge; the muzzle cannot, so the shot is blocked.
    const wedge = OBSTACLES.find((o) => o.id === 'cyan-dorito-1')!;
    const player = { x: wedge.x - 2.2, z: wedge.z };
    const aimPoint = { x: wedge.x + 8, z: wedge.z };
    expect(isMuzzleBlocked(player, aimPoint)).toBe(true);
  });

  it('does not flag the target itself as cover', () => {
    const player = { x: 0, z: 22 };
    const aimPoint = { x: 0, z: 22.1 };
    expect(isMuzzleBlocked(player, aimPoint)).toBe(false);
  });
});

describe('camera ray to the ground plane', () => {
  it('resolves a downward ray onto the floor', () => {
    // From 3m up, pointing 45 degrees down and forward.
    const point = rayToGround(0, 3, 0, 0, -Math.SQRT1_2, -Math.SQRT1_2);
    expect(point).not.toBeNull();
    expect(point!.z).toBeCloseTo(-3, 5);
  });

  it('returns null for a ray at or above the horizon', () => {
    expect(rayToGround(0, 2, 0, 0, 0, -1)).toBeNull();
    expect(rayToGround(0, 2, 0, 0, 0.5, -1)).toBeNull();
  });

  it('clamps a distant aim point to a sane range', () => {
    const player = { x: 0, z: 0 };
    const clamped = clampAimDistance(player, { x: 1000, z: 0 }, 60);
    expect(clamped.x).toBeCloseTo(60, 5);
    // Direction is preserved.
    expect(aimDirectionTo(player, clamped)).toEqual(aimDirectionTo(player, { x: 1000, z: 0 }));
  });

  it('leaves a nearby aim point alone', () => {
    const aimPoint = { x: 5, z: 5 };
    expect(clampAimDistance({ x: 0, z: 0 }, aimPoint, 60)).toEqual(aimPoint);
  });
});

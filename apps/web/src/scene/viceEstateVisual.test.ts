import { describe, expect, it, vi } from 'vitest';
import { VICE_ESTATE_ASSETS, VICE_ESTATE_LAYOUT, type ArenaLayout } from '@splat04/shared';
import {
  DEFAULT_VICE_ESTATE_RENDERER_MODE,
  resolveViceEstateRendererMode,
} from './viceEstateMode.js';
import {
  resolveViceEstateInitialYaw,
  shouldRenderViceEstatePlacement,
  validateViceEstateVisualInputs,
  VICE_ESTATE_INITIAL_AIM_TARGET,
} from './viceEstateVisual.js';
import { isAuthoredChromeMaterialName } from '../game/assets.js';

describe('Vice Estate renderer mode', () => {
  it('defaults to gltf and accepts only the two rollback values', () => {
    expect(DEFAULT_VICE_ESTATE_RENDERER_MODE).toBe('gltf');
    expect(resolveViceEstateRendererMode('')).toBe('gltf');
    expect(resolveViceEstateRendererMode('?renderer=gltf')).toBe('gltf');
    expect(resolveViceEstateRendererMode('?renderer=legacy')).toBe('legacy');
  });

  it('safely defaults an invalid rollback value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(resolveViceEstateRendererMode('?renderer=procedural')).toBe('gltf');
    error.mockRestore();
  });
});

describe('Vice Estate initial camera presentation', () => {
  const spawnViews = [
    {
      team: 'cyan',
      spawn: { x: -28, z: 4.5 },
      closeCan: { minX: -26.37, maxX: -23.63, minZ: 1.63, maxZ: 4.37 },
    },
    {
      team: 'magenta',
      spawn: { x: 28, z: -4.5 },
      closeCan: { minX: 22.63, maxX: 25.37, minZ: 1.63, maxZ: 4.37 },
    },
  ] as const;

  it.each(spawnViews)(
    'aims the $team spawn at the symmetric open-lane target',
    ({ spawn: { x, z } }) => {
      const yaw = resolveViceEstateInitialYaw(x, z);
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const distance = Math.hypot(
        VICE_ESTATE_INITIAL_AIM_TARGET.x - x,
        VICE_ESTATE_INITIAL_AIM_TARGET.z - z,
      );
      expect(forward.x).toBeCloseTo((VICE_ESTATE_INITIAL_AIM_TARGET.x - x) / distance);
      expect(forward.z).toBeCloseTo((VICE_ESTATE_INITIAL_AIM_TARGET.z - z) / distance);
    },
  );

  it.each(spawnViews)(
    'keeps the $team initial centre ray clear of its closest can',
    ({ spawn, closeCan }) => {
      expect(segmentIntersectsBox(spawn, VICE_ESTATE_INITIAL_AIM_TARGET, closeCan)).toBe(false);
    },
  );

  it.each(spawnViews)(
    'keeps the flamingo inside the $team normal field of view',
    ({ spawn: { x, z } }) => {
      const yaw = resolveViceEstateInitialYaw(x, z);
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const flamingo = normalize({ x: -x, z: 5.6 - z });
      const angle = Math.acos(
        Math.min(1, Math.max(-1, forward.x * flamingo.x + forward.z * flamingo.z)),
      );
      expect(angle).toBeLessThan((68 / 2) * (Math.PI / 180));
    },
  );
});

function normalize(vector: { x: number; z: number }): { x: number; z: number } {
  const length = Math.hypot(vector.x, vector.z);
  return { x: vector.x / length, z: vector.z / length };
}

function segmentIntersectsBox(
  from: { x: number; z: number },
  to: { x: number; z: number },
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  const direction = { x: to.x - from.x, z: to.z - from.z };
  let near = 0;
  let far = 1;

  for (const [origin, delta, min, max] of [
    [from.x, direction.x, box.minX, box.maxX],
    [from.z, direction.z, box.minZ, box.maxZ],
  ] as const) {
    if (delta === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }

  return true;
}

describe('authored chrome material convention', () => {
  it('matches chrome names without broad material restyling', () => {
    expect(isAuthoredChromeMaterialName('chrome')).toBe(true);
    expect(isAuthoredChromeMaterialName('MAT_Chrome')).toBe(true);
    expect(isAuthoredChromeMaterialName('Chrome.001')).toBe(true);
    expect(isAuthoredChromeMaterialName('graphite')).toBe(false);
    expect(isAuthoredChromeMaterialName('neon_cyan')).toBe(false);
  });
});

describe('Vice Estate visual filtering and validation', () => {
  it('keeps the GLB court in gameplay but excludes authored static splats', () => {
    const ground = VICE_ESTATE_LAYOUT.placements.find(
      (placement) => placement.asset === 'ground-court',
    )!;
    const splat = VICE_ESTATE_LAYOUT.placements.find((placement) =>
      placement.asset.startsWith('paint-splat'),
    )!;

    expect(shouldRenderViceEstatePlacement(ground, VICE_ESTATE_ASSETS, 'gameplay')).toBe(true);
    expect(shouldRenderViceEstatePlacement(splat, VICE_ESTATE_ASSETS, 'gameplay')).toBe(false);
    expect(shouldRenderViceEstatePlacement(splat, VICE_ESTATE_ASSETS, 'art-review')).toBe(true);
  });

  it('reports missing manifest IDs and unsafe transforms', () => {
    const source = VICE_ESTATE_LAYOUT.placements[0];
    const broken: ArenaLayout = {
      ...VICE_ESTATE_LAYOUT,
      placements: [
        {
          ...source,
          asset: 'missing-asset',
          transform: {
            ...source.transform,
            position: [Number.NaN, 0, 0],
            scale: [0, 1, 1],
          },
        },
      ],
    };

    expect(validateViceEstateVisualInputs(broken, VICE_ESTATE_ASSETS)).toEqual([
      expect.stringContaining('missing manifest entry'),
      expect.stringContaining('invalid non-finite or zero transform'),
    ]);
  });
});

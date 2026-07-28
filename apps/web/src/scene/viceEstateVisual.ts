import { type ArenaLayout, type AssetManifest, type Placement } from '@splat04/shared';
import { yawTowardWorldPoint } from '../game/camera.js';

/**
 * Centreline presentation target just beyond the flamingo.
 *
 * Aiming at the fountain origin sends the west-spawn view through can-0. This nearby
 * north-side target opens the sightline symmetrically without moving or hiding cover,
 * while the fountain/flamingo remains inside the normal gameplay field of view.
 */
export const VICE_ESTATE_INITIAL_AIM_TARGET = Object.freeze({ x: 0, z: 6.5 });

/** Resolve the one-time GLTF presentation yaw without changing camera mechanics. */
export function resolveViceEstateInitialYaw(fromX: number, fromZ: number): number {
  return yawTowardWorldPoint(
    fromX,
    fromZ,
    VICE_ESTATE_INITIAL_AIM_TARGET.x,
    VICE_ESTATE_INITIAL_AIM_TARGET.z,
  );
}

/** Gameplay paint owns authored splat visibility; every other GLB remains renderable. */
export function shouldRenderViceEstatePlacement(
  placement: Placement,
  manifest: AssetManifest,
  purpose: 'gameplay' | 'art-review',
): boolean {
  if (purpose === 'art-review') return true;
  const asset = manifest.assets.find((entry) => entry.id === placement.asset);
  return asset?.kind !== 'paint';
}

/**
 * Runtime-specific validation. Shared JSON validation already catches malformed schema;
 * these checks protect the imperative Three.js placement boundary too.
 */
export function validateViceEstateVisualInputs(
  layout: ArenaLayout,
  manifest: AssetManifest,
): string[] {
  const errors: string[] = [];
  const knownAssets = new Set(manifest.assets.map((asset) => asset.id));

  for (const placement of layout.placements) {
    if (!knownAssets.has(placement.asset)) {
      errors.push(`${placement.id}: missing manifest entry "${placement.asset}"`);
    }
    const { position, rotationY, scale } = placement.transform;
    if (
      position.length !== 3 ||
      scale.length !== 3 ||
      !position.every(Number.isFinite) ||
      !scale.every(Number.isFinite) ||
      !Number.isFinite(rotationY) ||
      scale.some((value) => value === 0)
    ) {
      errors.push(`${placement.id}: invalid non-finite or zero transform`);
    }
  }

  return errors;
}

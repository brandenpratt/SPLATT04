import layoutJson from './vice-estate-04.layout.json' with { type: 'json' };
import assetsJson from './vice-estate-04.assets.json' with { type: 'json' };
import { type AssetManifest, assertValidAssetManifest, assetIds } from './asset-manifest.js';
import {
  type ArenaLayout,
  type Collider,
  type NavAnchor,
  type Placement,
  assertValidLayout,
} from './layout-schema.js';

export * from './layout-schema.js';
export * from './asset-manifest.js';

/**
 * The approved asset manifest and reference-driven layout for VICE ESTATE 04.
 *
 * Both are validated at module load. A malformed layout is a build-time failure rather
 * than something that half-loads and produces a subtly wrong arena — Blender and the
 * browser must agree exactly or the kit is not shippable.
 */
export const VICE_ESTATE_ASSETS: AssetManifest = assertValidAssetManifest(assetsJson);
export const VICE_ESTATE_LAYOUT: ArenaLayout = assertValidLayout(
  layoutJson,
  assetIds(VICE_ESTATE_ASSETS),
);

/**
 * Whether this layout has cleared the Gate A composition review.
 *
 * While false, the layout is a blockout: proportions and camera are provisional, and the
 * live match route must keep using the legacy procedural arena.
 */
export function isLayoutApproved(layout: ArenaLayout = VICE_ESTATE_LAYOUT): boolean {
  return layout.status === 'gate-a-approved' && layout.referenceLocked;
}

export function findPlacement(id: string, layout: ArenaLayout = VICE_ESTATE_LAYOUT) {
  return layout.placements.find((p) => p.id === id);
}

export function placementsByAsset(
  assetId: string,
  layout: ArenaLayout = VICE_ESTATE_LAYOUT,
): Placement[] {
  return layout.placements.filter((p) => p.asset === assetId);
}

/** Landmarks are the silhouettes reviewed at Gate A. */
export function landmarks(layout: ArenaLayout = VICE_ESTATE_LAYOUT): Placement[] {
  return layout.placements.filter((p) => p.landmark === true);
}

/** Everything a player can collide with. Scenery is excluded by construction. */
export function gameplayColliders(layout: ArenaLayout = VICE_ESTATE_LAYOUT): Collider[] {
  const inaccessible = new Set(layout.placements.filter((p) => p.inaccessible).map((p) => p.id));
  return layout.colliders.filter((c) => !c.placement || !inaccessible.has(c.placement));
}

export function navAnchorsInLane(
  lane: NavAnchor['lane'],
  layout: ArenaLayout = VICE_ESTATE_LAYOUT,
): NavAnchor[] {
  return layout.navAnchors.filter((n) => n.lane === lane);
}

/** Point-in-collider test against the layout, mirroring the legacy `isBlocked`. */
export function layoutBlocks(
  x: number,
  z: number,
  radius = 0,
  layout: ArenaLayout = VICE_ESTATE_LAYOUT,
): boolean {
  for (const collider of gameplayColliders(layout)) {
    const shape = collider.shape;
    if (shape.kind === 'circle') {
      const dx = x - shape.x;
      const dz = z - shape.z;
      const reach = shape.r + radius;
      if (dx * dx + dz * dz < reach * reach) return true;
    } else if (
      Math.abs(x - shape.x) < shape.hx + radius &&
      Math.abs(z - shape.z) < shape.hz + radius
    ) {
      return true;
    }
  }
  return false;
}

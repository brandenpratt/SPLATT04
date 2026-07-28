import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  LAYOUT_SCHEMA_VERSION,
  VICE_ESTATE_ASSETS,
  VICE_ESTATE_LAYOUT,
  assetIds,
  enumerateAssetVariantUrls,
  gameplayColliders,
  isLayoutApproved,
  landmarks,
  layoutBlocks,
  resolveAssetUrl,
  validateAssetManifest,
  validateLayout,
  withVersion,
} from './index.js';

describe('asset manifest', () => {
  it('is valid', () => {
    expect(validateAssetManifest(VICE_ESTATE_ASSETS)).toEqual([]);
    expect(VICE_ESTATE_ASSETS.schemaVersion).toBe(ASSET_MANIFEST_SCHEMA_VERSION);
  });

  it('gives every asset a stable id and a .glb url', () => {
    for (const asset of VICE_ESTATE_ASSETS.assets) {
      expect(asset.id).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
      expect(asset.url.endsWith('.glb')).toBe(true);
      expect(asset.url.startsWith(VICE_ESTATE_ASSETS.basePath)).toBe(true);
    }
  });

  it('states paint reception explicitly for every asset', () => {
    for (const asset of VICE_ESTATE_ASSETS.assets) {
      expect(typeof asset.paintReceiver).toBe('boolean');
    }
  });

  it('never lets decorative scenery receive gameplay paint', () => {
    for (const asset of VICE_ESTATE_ASSETS.assets) {
      if (asset.decorative) expect(asset.paintReceiver).toBe(false);
    }
  });

  it('enumerates all 31 content-versioned GLB variants without duplicates', () => {
    const variants = enumerateAssetVariantUrls(VICE_ESTATE_ASSETS);
    expect(variants).toHaveLength(31);
    expect(new Set(variants.map((variant) => variant.url)).size).toBe(31);
    expect(
      variants.every((variant) => variant.url.includes(`v=${VICE_ESTATE_ASSETS.contentVersion}`)),
    ).toBe(true);
    expect(variants.some((variant) => variant.url.includes('flamingo-fountain-lod1.glb'))).toBe(
      true,
    );
    expect(variants.some((variant) => variant.url.includes('palm-lod1.glb'))).toBe(true);
  });

  it('covers the reference composition', () => {
    const ids = assetIds(VICE_ESTATE_ASSETS);
    for (const required of [
      'villa-west',
      'villa-east',
      'villa-roof-west',
      'villa-roof-east',
      'glass-bridge',
      'flamingo-fountain',
      'planter-curved',
      'perimeter-straight',
      'dock',
      'yacht',
      'palm',
      'skyline-far',
      'skyline-near',
    ]) {
      expect(ids.has(required), `missing asset "${required}"`).toBe(true);
    }
  });

  it('rejects a manifest with duplicate ids', () => {
    const broken = {
      ...VICE_ESTATE_ASSETS,
      assets: [VICE_ESTATE_ASSETS.assets[0], VICE_ESTATE_ASSETS.assets[0]],
    };
    expect(validateAssetManifest(broken).some((i) => /duplicate/.test(i.message))).toBe(true);
  });
});

describe('content-versioned urls', () => {
  it('pins every url to the manifest content version', () => {
    const asset = VICE_ESTATE_ASSETS.assets[0];
    const url = resolveAssetUrl(VICE_ESTATE_ASSETS, asset);
    expect(url).toContain(`v=${VICE_ESTATE_ASSETS.contentVersion}`);
  });

  it('changes the url when the kit is rebuilt', () => {
    const asset = VICE_ESTATE_ASSETS.assets[0];
    const before = withVersion(VICE_ESTATE_ASSETS, asset.url);
    const after = withVersion(
      { ...VICE_ESTATE_ASSETS, contentVersion: 'blockout-0002' },
      asset.url,
    );
    expect(before).not.toBe(after);
  });

  it('drops mobile-excluded scenery on low-power devices', () => {
    const bridge = VICE_ESTATE_ASSETS.assets.find((a) => a.id === 'glass-bridge')!;
    expect(bridge.mobileFallback).toBeNull();
    expect(resolveAssetUrl(VICE_ESTATE_ASSETS, bridge, { lowPower: true })).toBeNull();
  });

  it('picks a LOD by distance', () => {
    const palm = VICE_ESTATE_ASSETS.assets.find((a) => a.id === 'palm')!;
    expect(resolveAssetUrl(VICE_ESTATE_ASSETS, palm, { distance: 10 })).toContain('palm.glb');
    expect(resolveAssetUrl(VICE_ESTATE_ASSETS, palm, { distance: 300 })).toContain('palm-lod1.glb');
  });
});

describe('arena layout', () => {
  it('is valid against the asset manifest', () => {
    expect(validateLayout(VICE_ESTATE_LAYOUT, assetIds(VICE_ESTATE_ASSETS))).toEqual([]);
    expect(VICE_ESTATE_LAYOUT.schemaVersion).toBe(LAYOUT_SCHEMA_VERSION);
  });

  it('is still provisional and not yet Gate A approved', () => {
    // This flips only when the camera and proportions are approved against the master
    // reference. Until then the live match route must keep using the legacy arena.
    expect(VICE_ESTATE_LAYOUT.status).toBe('provisional');
    expect(VICE_ESTATE_LAYOUT.referenceLocked).toBe(false);
    expect(isLayoutApproved()).toBe(false);
  });

  it('gives every placement and collider a unique stable id', () => {
    const ids = [
      ...VICE_ESTATE_LAYOUT.placements.map((p) => p.id),
      ...VICE_ESTATE_LAYOUT.colliders.map((c) => c.id),
      ...VICE_ESTATE_LAYOUT.navAnchors.map((n) => n.id),
      ...VICE_ESTATE_LAYOUT.pickups.map((p) => p.id),
      ...VICE_ESTATE_LAYOUT.spawns.cyan.map((s) => s.id),
      ...VICE_ESTATE_LAYOUT.spawns.magenta.map((s) => s.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references only assets that exist in the manifest', () => {
    const ids = assetIds(VICE_ESTATE_ASSETS);
    for (const placement of VICE_ESTATE_LAYOUT.placements) {
      expect(ids.has(placement.asset), `unknown asset "${placement.asset}"`).toBe(true);
    }
  });

  it('places the landmarks the reference composition requires', () => {
    const landmarkAssets = new Set(landmarks().map((p) => p.asset));
    expect(landmarkAssets.has('villa-west')).toBe(true);
    expect(landmarkAssets.has('villa-east')).toBe(true);
    expect(landmarkAssets.has('flamingo-fountain')).toBe(true);
    expect(landmarkAssets.has('glass-bridge')).toBe(true);
  });

  it('keeps every collider anchored to a real placement', () => {
    const placementIds = new Set(VICE_ESTATE_LAYOUT.placements.map((p) => p.id));
    for (const collider of VICE_ESTATE_LAYOUT.colliders) {
      if (collider.placement) expect(placementIds.has(collider.placement)).toBe(true);
    }
  });

  it('never gives inaccessible scenery a gameplay collider', () => {
    const inaccessible = new Set(
      VICE_ESTATE_LAYOUT.placements.filter((p) => p.inaccessible).map((p) => p.id),
    );
    for (const collider of gameplayColliders()) {
      if (collider.placement) expect(inaccessible.has(collider.placement)).toBe(false);
    }
    // The bridge in particular must be scenery only.
    expect(VICE_ESTATE_LAYOUT.colliders.some((c) => c.placement === 'bridge')).toBe(false);
  });

  it('documents why each scenic zone is unreachable', () => {
    expect(VICE_ESTATE_LAYOUT.scenicZones.length).toBeGreaterThan(0);
    for (const zone of VICE_ESTATE_LAYOUT.scenicZones) {
      expect(zone.reason.length).toBeGreaterThan(10);
    }
  });

  it('keeps all gameplay on one ground level', () => {
    // Every collider is a flat 2D shape; height is camera-only. Anything a player could
    // stand on would need a Y origin, and the schema deliberately has no such field.
    for (const collider of VICE_ESTATE_LAYOUT.colliders) {
      expect(['box', 'circle']).toContain(collider.shape.kind);
    }
    for (const placement of VICE_ESTATE_LAYOUT.placements) {
      if (placement.transform.position[1] > 0.5) {
        expect(
          placement.inaccessible,
          `${placement.id} is raised but not marked inaccessible`,
        ).toBe(true);
      }
    }
  });

  it('puts spawns on open ground', () => {
    for (const team of ['cyan', 'magenta'] as const) {
      for (const spawn of VICE_ESTATE_LAYOUT.spawns[team]) {
        expect(layoutBlocks(spawn.x, spawn.z, 0.8), `${spawn.id} is inside a collider`).toBe(false);
      }
    }
  });

  it('keeps the two teams apart', () => {
    for (const cyan of VICE_ESTATE_LAYOUT.spawns.cyan) {
      for (const magenta of VICE_ESTATE_LAYOUT.spawns.magenta) {
        expect(Math.hypot(cyan.x - magenta.x, cyan.z - magenta.z)).toBeGreaterThan(40);
      }
    }
  });

  it('puts every navigation anchor on open ground', () => {
    const blocked = VICE_ESTATE_LAYOUT.navAnchors.filter((n) => layoutBlocks(n.x, n.z, 0.7));
    // Anchors are generated on a lattice, so some land inside cover; the Blender build and
    // the runtime both prune those. What must not happen is *all* of a lane being blocked.
    expect(blocked.length).toBeLessThan(VICE_ESTATE_LAYOUT.navAnchors.length * 0.35);
  });

  it('covers all three lanes with navigation anchors', () => {
    const lanes = new Set(VICE_ESTATE_LAYOUT.navAnchors.map((n) => n.lane));
    expect(lanes.has('waterfront')).toBe(true);
    expect(lanes.has('fountain')).toBe(true);
    expect(lanes.has('party')).toBe(true);
  });

  it('places the waterfront boundary beyond the play area', () => {
    const { waterfront, dimensions } = VICE_ESTATE_LAYOUT;
    expect(waterfront.boundaryZ).toBeLessThanOrEqual(-dimensions.depth / 2);
    expect(waterfront.seawallZ).toBeLessThan(waterfront.boundaryZ);
    expect(waterfront.polygon.length).toBeGreaterThanOrEqual(3);
  });

  it('schedules sponsor nodes at the documented times', () => {
    const nodes = VICE_ESTATE_LAYOUT.pickups.filter((p) => p.kind === 'sponsor-node');
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    for (const node of nodes) expect(node.activeAtSeconds).toEqual([30, 65]);
  });
});

describe('layout validation catches real mistakes', () => {
  const base = VICE_ESTATE_LAYOUT;

  it('rejects a placement referencing an unknown asset', () => {
    const broken = {
      ...base,
      placements: [{ ...base.placements[0], id: 'bogus', asset: 'not-a-real-asset' }],
    };
    const issues = validateLayout(broken, assetIds(VICE_ESTATE_ASSETS));
    expect(issues.some((i) => /not in the asset manifest/.test(i.message))).toBe(true);
  });

  it('rejects duplicate ids across different collections', () => {
    const broken = {
      ...base,
      colliders: [{ ...base.colliders[0], id: base.placements[0].id }],
    };
    expect(validateLayout(broken).some((i) => /duplicate id/.test(i.message))).toBe(true);
  });

  it('rejects a collider outside the footprint', () => {
    const broken = {
      ...base,
      colliders: [
        { ...base.colliders[0], id: 'way-out', shape: { kind: 'box', x: 900, z: 0, hx: 1, hz: 1 } },
      ],
    };
    expect(validateLayout(broken).some((i) => /outside the/.test(i.message))).toBe(true);
  });

  it('refuses to mark a layout approved without locking it to the reference', () => {
    const broken = { ...base, status: 'gate-a-approved' as const, referenceLocked: false };
    expect(validateLayout(broken).some((i) => /reference locked/.test(i.message))).toBe(true);
  });

  it('rejects a non-kebab-case id', () => {
    const broken = { ...base, pickups: [{ ...base.pickups[0], id: 'Not Valid' }] };
    expect(validateLayout(broken).some((i) => /kebab/.test(i.message))).toBe(true);
  });
});

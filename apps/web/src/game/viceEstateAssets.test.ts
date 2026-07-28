import { describe, expect, it } from 'vitest';
import { VICE_ESTATE_ASSETS, enumerateAssetVariantUrls } from '@splat04/shared';
import {
  createViceEstatePhaseGates,
  getSelectedViceEstateUrls,
  isMinimumPlayableViceEstateAsset,
  minimumAssetsAreRenderable,
  resolveViceEstateLoadStatus,
  type ViceEstateLoadEvent,
} from './viceEstateAssets.js';

describe('Vice Estate selected-path preload plan', () => {
  it('does not fetch both full-resolution and LOD variants', () => {
    const inventory = enumerateAssetVariantUrls(VICE_ESTATE_ASSETS);
    const desktop = getSelectedViceEstateUrls(false, 'gameplay');
    const mobile = getSelectedViceEstateUrls(true, 'gameplay');

    expect(inventory).toHaveLength(31);
    expect(desktop.length).toBeLessThan(inventory.length);
    expect(mobile.length).toBeLessThan(inventory.length);
    expect(new Set(desktop).size).toBe(desktop.length);
    expect(new Set(mobile).size).toBe(mobile.length);
    expect(mobile.some((url) => url.includes('palm-lod1.glb'))).toBe(true);
    expect(mobile.some((url) => url.includes('palm.glb?'))).toBe(false);
  });

  it('omits static paint for gameplay while art review remains complete', () => {
    const gameplay = getSelectedViceEstateUrls(false, 'gameplay');
    const review = getSelectedViceEstateUrls(false, 'art-review');
    expect(gameplay.some((url) => url.includes('paint-splat-'))).toBe(false);
    expect(review.some((url) => url.includes('paint-splat-cyan.glb'))).toBe(true);
    expect(review.some((url) => url.includes('paint-splat-magenta.glb'))).toBe(true);
    expect(review).toHaveLength(gameplay.length + 2);
  });

  it('does not mark the minimum playable set ready when a required GLB fails', () => {
    const events: ViceEstateLoadEvent[] = [
      {
        assetId: 'villa-west',
        url: '/villa-west.glb',
        phase: 'minimum',
        ok: true,
        at: 1,
        bytes: 10,
      },
      {
        assetId: 'flamingo-fountain',
        url: '/flamingo-fountain.glb',
        phase: 'minimum',
        ok: false,
        at: 2,
        bytes: 0,
      },
    ];
    expect(minimumAssetsAreRenderable(events, 2)).toBe(false);
    expect(minimumAssetsAreRenderable([{ ...events[1], ok: true }, events[0]], 2)).toBe(true);
    expect(resolveViceEstateLoadStatus(1, 20, false)).toBe('error');
  });

  it('exposes minimum completion before optional/full completion', async () => {
    const order: string[] = [];
    const minimum = { resolve: (_ready: boolean) => {} };
    const optional = { resolve: (_ready: boolean) => {} };
    const gates = createViceEstatePhaseGates(
      () =>
        new Promise<boolean>((resolve) => {
          order.push('minimum-start');
          minimum.resolve = resolve;
        }),
      () =>
        new Promise<boolean>((resolve) => {
          order.push('optional-start');
          optional.resolve = resolve;
        }),
    );

    expect(order).toEqual(['minimum-start']);
    minimum.resolve(true);
    await expect(gates.minimumReady).resolves.toBe(true);
    await Promise.resolve();
    expect(order).toEqual(['minimum-start', 'optional-start']);

    optional.resolve(true);
    await expect(gates.fullReady).resolves.toBe(true);
  });

  it('partitions critical landmarks from optional landscaping without overlap', () => {
    expect(isMinimumPlayableViceEstateAsset('flamingo-fountain')).toBe(true);
    expect(isMinimumPlayableViceEstateAsset('villa-west')).toBe(true);
    expect(isMinimumPlayableViceEstateAsset('yacht')).toBe(false);
    expect(isMinimumPlayableViceEstateAsset('palm')).toBe(false);
  });
});

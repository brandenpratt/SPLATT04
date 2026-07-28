import { VICE_ESTATE_ASSETS, enumerateAssetVariantUrls, type AssetEntry } from '@splat04/shared';
import { AssetLibrary } from './assets.js';

export type ViceEstateLoadStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'error';

export interface ViceEstateLoadSnapshot {
  status: ViceEstateLoadStatus;
  loaded: number;
  total: number;
  failed: number;
  urls: readonly string[];
}

const variantUrls = enumerateAssetVariantUrls(VICE_ESTATE_ASSETS);
const assetsById = new Map(VICE_ESTATE_ASSETS.assets.map((asset) => [asset.id, asset]));
const variants = variantUrls.flatMap(({ assetId, url }) => {
  const asset = assetsById.get(assetId);
  return asset ? [{ asset, url }] : [];
});
const library = new AssetLibrary(VICE_ESTATE_ASSETS);
const listeners = new Set<() => void>();

let snapshot: ViceEstateLoadSnapshot = {
  status: 'idle',
  loaded: 0,
  total: variants.length,
  failed: 0,
  urls: variantUrls.map((variant) => variant.url),
};
let preloadPromise: Promise<AssetLibrary> | null = null;

function publish(next: ViceEstateLoadSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();

  if (typeof window !== 'undefined') {
    const hook = ((window as unknown as Record<string, unknown>).__splat04 ?? {}) as Record<
      string,
      unknown
    >;
    hook.viceEstateAssets = next;
    (window as unknown as Record<string, unknown>).__splat04 = hook;
  }
}

export function getViceEstateAssetLibrary(): AssetLibrary {
  return library;
}

export function getViceEstateLoadSnapshot(): ViceEstateLoadSnapshot {
  return snapshot;
}

export function subscribeViceEstateLoad(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fetch and decode all current GLBs once per page, including the two explicit LOD files.
 *
 * Placement and the loading screen share this same promise and library, so the percentage
 * reflects completed GLTFLoader decodes and the scene does not decode a second copy.
 */
export function preloadViceEstateKit(): Promise<AssetLibrary> {
  if (preloadPromise) return preloadPromise;

  publish({ ...snapshot, status: 'loading' });
  preloadPromise = library
    .preloadUrls(variants, (loaded, total, failed) => {
      publish({
        status: 'loading',
        loaded,
        total,
        failed,
        urls: snapshot.urls,
      });
    })
    .then(() => {
      const failed = library.errors.length;
      publish({
        status: failed === 0 ? 'ready' : failed < variants.length ? 'degraded' : 'error',
        loaded: variants.length,
        total: variants.length,
        failed,
        urls: snapshot.urls,
      });
      return library;
    });

  return preloadPromise;
}

/** Resolve an entry without repeating linear manifest searches for every placement. */
export function findViceEstateAsset(assetId: string): AssetEntry | undefined {
  return assetsById.get(assetId);
}

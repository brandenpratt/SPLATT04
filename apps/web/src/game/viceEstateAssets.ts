import { VICE_ESTATE_ASSETS, resolveAssetUrl, type AssetEntry } from '@splat04/shared';
import { AssetLibrary } from './assets.js';

export type ViceEstateLoadStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'error';

export interface ViceEstateLoadSnapshot {
  status: ViceEstateLoadStatus;
  loaded: number;
  total: number;
  failed: number;
  urls: readonly string[];
  minimumLoaded: number;
  minimumTotal: number;
  minimumReady: boolean;
  bytesLoaded: number;
  startedAt: number | null;
  minimumReadyAt: number | null;
  fullReadyAt: number | null;
  readyAt: number | null;
  events: readonly ViceEstateLoadEvent[];
}

export interface ViceEstateLoadEvent {
  assetId: string;
  url: string;
  phase: 'minimum' | 'optional';
  ok: boolean;
  at: number;
  bytes: number;
}

export interface ViceEstatePreloadOptions {
  lowPower?: boolean;
  purpose?: 'gameplay' | 'art-review';
}

export interface ViceEstatePreloadHandle {
  library: AssetLibrary;
  lowPower: boolean;
  purpose: NonNullable<ViceEstatePreloadOptions['purpose']>;
  /** Resolves true only after every critical selected-path GLB decoded successfully. */
  minimumReady: Promise<boolean>;
  /** Resolves after optional loading, or false immediately when the critical phase fails. */
  fullReady: Promise<boolean>;
}

const MINIMUM_PLAYABLE_ASSET_IDS = new Set([
  'villa-west',
  'villa-east',
  'villa-roof-west',
  'villa-roof-east',
  'flamingo-fountain',
  'ground-court',
  'bunker-dome',
  'bunker-wedge',
  'bunker-block',
  'perimeter-straight',
  'perimeter-corner',
  'planter-curved',
]);
const assetsById = new Map(VICE_ESTATE_ASSETS.assets.map((asset) => [asset.id, asset]));
const library = new AssetLibrary(VICE_ESTATE_ASSETS);
const listeners = new Set<() => void>();

let snapshot: ViceEstateLoadSnapshot = {
  status: 'idle',
  loaded: 0,
  total: 0,
  failed: 0,
  urls: [],
  minimumLoaded: 0,
  minimumTotal: 0,
  minimumReady: false,
  bytesLoaded: 0,
  startedAt: null,
  minimumReadyAt: null,
  fullReadyAt: null,
  readyAt: null,
  events: [],
};
let preloadHandle: ViceEstatePreloadHandle | null = null;
let selectedLowPower: boolean | null = null;
let selectedPurpose: ViceEstatePreloadOptions['purpose'] | null = null;

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
 * Fetch and decode only the GLB URL selected for this device path.
 *
 * Placement and the loading screen share this same promise and library, so the percentage
 * reflects completed GLTFLoader decodes and the scene does not decode a second copy. Minimum
 * playable assets start first; decorative/secondary modules follow without fetching unused
 * full-resolution and LOD alternatives.
 */
export function preloadViceEstateKit(
  options: ViceEstatePreloadOptions = {},
): ViceEstatePreloadHandle {
  if (preloadHandle) return preloadHandle;

  selectedLowPower = options.lowPower === true;
  selectedPurpose = options.purpose ?? 'gameplay';
  const selected = getSelectedViceEstateAssets(selectedLowPower, selectedPurpose);
  const minimum = selected.filter(({ asset }) => MINIMUM_PLAYABLE_ASSET_IDS.has(asset.id));
  const optional = selected.filter(({ asset }) => !MINIMUM_PLAYABLE_ASSET_IDS.has(asset.id));
  const startedAt = now();

  publish({
    ...snapshot,
    status: 'loading',
    total: selected.length,
    urls: selected.map(({ url }) => url),
    minimumTotal: minimum.length,
    startedAt,
  });

  const gates = createViceEstatePhaseGates(
    async () => {
      await loadPhase(minimum, 'minimum');
      const minimumReady = minimumAssetsAreRenderable(snapshot.events, minimum.length);
      const completedAt = now();
      publish({
        ...snapshot,
        status: minimumReady ? 'loading' : 'error',
        minimumReady,
        minimumReadyAt: minimumReady ? completedAt : null,
        fullReadyAt: minimumReady ? null : completedAt,
        readyAt: minimumReady ? null : completedAt,
      });
      return minimumReady;
    },
    async () => {
      await loadPhase(optional, 'optional');
      const failed = snapshot.failed;
      const completedAt = now();
      const status = resolveViceEstateLoadStatus(failed, selected.length, snapshot.minimumReady);
      publish({
        ...snapshot,
        status,
        loaded: selected.length,
        failed,
        fullReadyAt: completedAt,
        readyAt: completedAt,
      });
      return status === 'ready' || status === 'degraded';
    },
  );

  preloadHandle = {
    library,
    lowPower: selectedLowPower,
    purpose: selectedPurpose,
    minimumReady: gates.minimumReady,
    fullReady: gates.fullReady,
  };
  return preloadHandle;
}

export function createViceEstatePhaseGates(
  loadMinimum: () => Promise<boolean>,
  loadOptional: () => Promise<boolean>,
): Pick<ViceEstatePreloadHandle, 'minimumReady' | 'fullReady'> {
  const minimumReady = loadMinimum();
  const fullReady = minimumReady.then(async (ready) => {
    if (!ready) return false;
    return loadOptional();
  });
  return { minimumReady, fullReady };
}

export function isMinimumPlayableViceEstateAsset(assetId: string): boolean {
  return MINIMUM_PLAYABLE_ASSET_IDS.has(assetId);
}

async function loadPhase(
  entries: readonly { asset: AssetEntry; url: string }[],
  phase: ViceEstateLoadEvent['phase'],
): Promise<void> {
  await Promise.all(
    entries.map(async ({ asset, url }) => {
      const scene = await library.loadUrl(asset, url);
      const bytes = resourceBytes(url);
      const event: ViceEstateLoadEvent = {
        assetId: asset.id,
        url,
        phase,
        ok: Boolean(scene),
        at: now(),
        bytes,
      };
      publish({
        ...snapshot,
        loaded: snapshot.loaded + 1,
        failed: snapshot.failed + (scene ? 0 : 1),
        minimumLoaded: snapshot.minimumLoaded + (phase === 'minimum' ? 1 : 0),
        bytesLoaded: snapshot.bytesLoaded + bytes,
        events: [...snapshot.events, event],
      });
    }),
  );
}

export function getSelectedViceEstateUrls(
  lowPower: boolean,
  purpose: NonNullable<ViceEstatePreloadOptions['purpose']> = 'gameplay',
): readonly string[] {
  return getSelectedViceEstateAssets(lowPower, purpose).map(({ url }) => url);
}

function getSelectedViceEstateAssets(
  lowPower: boolean,
  purpose: NonNullable<ViceEstatePreloadOptions['purpose']>,
): Array<{ asset: AssetEntry; url: string }> {
  const selected: Array<{ asset: AssetEntry; url: string }> = [];
  const seen = new Set<string>();
  for (const asset of VICE_ESTATE_ASSETS.assets) {
    if (purpose === 'gameplay' && asset.kind === 'paint') continue;
    const url = resolveAssetUrl(VICE_ESTATE_ASSETS, asset, { lowPower });
    if (!url || seen.has(url)) continue;
    seen.add(url);
    selected.push({ asset, url });
  }
  return selected;
}

export function minimumAssetsAreRenderable(
  events: readonly ViceEstateLoadEvent[],
  minimumTotal: number,
): boolean {
  const required = events.filter((event) => event.phase === 'minimum');
  return (
    minimumTotal > 0 && required.length === minimumTotal && required.every((event) => event.ok)
  );
}

export function resolveViceEstateLoadStatus(
  failed: number,
  total: number,
  minimumReady: boolean,
): ViceEstateLoadStatus {
  if (!minimumReady || failed >= total) return 'error';
  return failed === 0 ? 'ready' : 'degraded';
}

function resourceBytes(url: string): number {
  if (typeof performance === 'undefined' || typeof location === 'undefined') return 0;
  const absolute = new URL(url, location.href).href;
  const entries = performance.getEntriesByName(absolute);
  const timing = entries[entries.length - 1] as PerformanceResourceTiming | undefined;
  return timing?.encodedBodySize || timing?.transferSize || 0;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function getViceEstateSelectedDeviceTier(): 'low' | 'high' | 'unselected' {
  return selectedLowPower === null ? 'unselected' : selectedLowPower ? 'low' : 'high';
}

export function getViceEstateSelectedPurpose(): ViceEstatePreloadOptions['purpose'] | 'unselected' {
  return selectedPurpose ?? 'unselected';
}

/** Resolve an entry without repeating linear manifest searches for every placement. */
export function findViceEstateAsset(assetId: string): AssetEntry | undefined {
  return assetsById.get(assetId);
}

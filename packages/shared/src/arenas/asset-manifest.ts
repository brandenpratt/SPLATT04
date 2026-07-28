/**
 * Typed GLB asset manifest.
 *
 * Describes the modular kit itself — what each module is, where its GLB lives, what LODs
 * exist, whether it takes paint, and what a low-power device should load instead.
 * *Where* modules go is the layout's job, not this file's.
 *
 * The export script writes GLBs whose paths must match `url` here, and
 * `validate_vice_estate_kit.py` fails the build if the two ever disagree.
 */

export const ASSET_MANIFEST_SCHEMA_VERSION = 1;

/** Broad kind, used for grouping, draw-order hints and review reporting. */
export type AssetKind =
  | 'villa'
  | 'roof'
  | 'bridge'
  | 'fountain'
  | 'planter'
  | 'bunker'
  | 'perimeter'
  | 'ground'
  | 'dock'
  | 'vessel'
  | 'vegetation'
  | 'skyline'
  | 'scenery'
  | 'paint'
  | 'prop';

export interface AssetLod {
  /** 0 is the highest detail. */
  level: number;
  url: string;
  /** Swap to the next level beyond this distance, in metres. */
  maxDistance: number;
  /** Reported by the export script so the loader can budget. */
  triangles?: number;
}

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  /** Highest-detail GLB, relative to the site root. */
  url: string;
  lods?: AssetLod[];
  /**
   * Replacement used on low-power devices. Usually a cheaper LOD; `null` means the module
   * is dropped entirely on mobile (decorative-only geometry).
   */
  mobileFallback?: string | null;
  /** Whether the floor paint projection should write onto this module. */
  paintReceiver: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Local-space bounds in metres, written by the exporter. Used for culling and LOD. */
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Content hash of the GLB, so caching can be version-pinned rather than path-pinned. */
  hash?: string;
  /** Scenery that must never receive a collider. */
  decorative?: boolean;
  notes?: string;
}

export interface AssetManifest {
  schemaVersion: number;
  arena: string;
  /**
   * Bumped whenever any GLB changes. The service worker keys its asset cache on this, so
   * a new kit can never be served from a stale cache.
   */
  contentVersion: string;
  generatedAt?: string;
  basePath: string;
  assets: AssetEntry[];
}

export interface ManifestIssue {
  path: string;
  message: string;
}

export function validateAssetManifest(raw: unknown): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (typeof raw !== 'object' || raw === null) {
    return [{ path: '$', message: 'manifest must be an object' }];
  }
  const manifest = raw as Partial<AssetManifest>;

  if (manifest.schemaVersion !== ASSET_MANIFEST_SCHEMA_VERSION) {
    fail('schemaVersion', `expected ${ASSET_MANIFEST_SCHEMA_VERSION}`);
  }
  if (!manifest.arena) fail('arena', 'required');
  if (!manifest.contentVersion) fail('contentVersion', 'required for cache busting');
  if (!manifest.basePath || !manifest.basePath.startsWith('/')) {
    fail('basePath', 'must be an absolute path from the site root');
  }

  const assets = manifest.assets ?? [];
  if (assets.length === 0) fail('assets', 'at least one asset is required');

  const ids = new Set<string>();
  assets.forEach((asset, i) => {
    const path = `assets[${i}]`;
    if (!asset.id || !/^[a-z0-9][a-z0-9_-]*$/.test(asset.id)) {
      fail(`${path}.id`, 'a stable lowercase id is required');
    } else if (ids.has(asset.id)) {
      fail(`${path}.id`, `duplicate asset id "${asset.id}"`);
    } else {
      ids.add(asset.id);
    }

    if (!asset.url || !asset.url.endsWith('.glb')) {
      fail(`${path}.url`, 'must point at a .glb file');
    }
    if (typeof asset.paintReceiver !== 'boolean') {
      fail(`${path}.paintReceiver`, 'must be explicit — paint reception is a design decision');
    }
    if (asset.decorative && asset.paintReceiver) {
      fail(`${path}`, 'decorative scenery cannot receive gameplay paint');
    }

    (asset.lods ?? []).forEach((lod, l) => {
      const lodPath = `${path}.lods[${l}]`;
      if (!Number.isInteger(lod.level) || lod.level < 0) fail(`${lodPath}.level`, 'must be >= 0');
      if (!lod.url?.endsWith('.glb')) fail(`${lodPath}.url`, 'must point at a .glb file');
      if (!(lod.maxDistance > 0)) fail(`${lodPath}.maxDistance`, 'must be positive');
    });

    const levels = (asset.lods ?? []).map((l) => l.level);
    if (new Set(levels).size !== levels.length) fail(`${path}.lods`, 'duplicate LOD levels');
  });

  return issues;
}

export function assertValidAssetManifest(raw: unknown): AssetManifest {
  const issues = validateAssetManifest(raw);
  if (issues.length > 0) {
    throw new Error(
      `Asset manifest failed validation:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`,
    );
  }
  return raw as AssetManifest;
}

export function assetIds(manifest: AssetManifest): Set<string> {
  return new Set(manifest.assets.map((a) => a.id));
}

/** Resolve the URL to load for an asset, honouring device tier and distance. */
export function resolveAssetUrl(
  manifest: AssetManifest,
  asset: AssetEntry,
  options: { lowPower?: boolean; distance?: number } = {},
): string | null {
  if (options.lowPower && asset.mobileFallback === null) return null;
  if (options.lowPower && asset.mobileFallback) return withVersion(manifest, asset.mobileFallback);

  const distance = options.distance;
  if (distance !== undefined && asset.lods && asset.lods.length > 0) {
    const ordered = [...asset.lods].sort((a, b) => a.level - b.level);
    for (const lod of ordered) {
      if (distance <= lod.maxDistance) return withVersion(manifest, lod.url);
    }
    return withVersion(manifest, ordered[ordered.length - 1].url);
  }
  return withVersion(manifest, asset.url);
}

/**
 * Append the manifest's content version as a query parameter.
 *
 * This is what makes the service worker safe: the cache key changes whenever the kit is
 * rebuilt, so a stale GLB can never be served indefinitely, while unchanged kits still hit
 * the cache on every visit.
 */
export function withVersion(manifest: AssetManifest, url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${manifest.contentVersion}`;
}

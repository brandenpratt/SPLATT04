import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type AssetEntry, type AssetManifest, resolveAssetUrl } from '@splat04/shared';

/**
 * glTF asset loading for the modular arena kit.
 *
 * Every URL is content-versioned by the manifest, so the browser and service worker can
 * cache aggressively while a rebuilt kit still invalidates immediately. Loads are
 * de-duplicated, results are cached by resolved URL, and everything is disposable —
 * an art-review session that mounts and unmounts repeatedly must not leak GPU memory.
 */

export interface LoadOptions {
  lowPower?: boolean;
  distance?: number;
}

export interface AssetLoadFailure {
  assetId: string;
  url: string;
  error: string;
}

/** Exact authored chrome convention, tolerant of Blender's MAT_ prefix and numeric suffixes. */
export function isAuthoredChromeMaterialName(name: string): boolean {
  const normalised = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    normalised === 'chrome' ||
    normalised.startsWith('chrome0') ||
    normalised.startsWith('matchrome')
  );
}

export class AssetLibrary {
  private readonly loader = new GLTFLoader();
  /** Resolved URL -> the template scene, kept for cloning. */
  private readonly cache = new Map<string, THREE.Group>();
  private readonly inflight = new Map<string, Promise<THREE.Group>>();
  private readonly failures: AssetLoadFailure[] = [];
  private disposed = false;

  constructor(private readonly manifest: AssetManifest) {}

  get errors(): readonly AssetLoadFailure[] {
    return this.failures;
  }

  get loadedCount(): number {
    return this.cache.size;
  }

  urlFor(asset: AssetEntry, options: LoadOptions = {}): string | null {
    return resolveAssetUrl(this.manifest, asset, options);
  }

  /**
   * Load one asset. Concurrent requests for the same URL share a single fetch, and a
   * failure is recorded rather than thrown so one missing module cannot blank the scene.
   */
  async load(asset: AssetEntry, options: LoadOptions = {}): Promise<THREE.Group | null> {
    if (this.disposed) return null;
    const url = this.urlFor(asset, options);
    // A null URL is a deliberate decision — scenery excluded on low-power devices.
    if (url === null) return null;
    return this.loadUrl(asset, url);
  }

  /**
   * Load a specific content-versioned variant for an asset.
   *
   * Normal placement uses `load()`. Whole-kit preload uses this method so LOD files are
   * genuinely fetched and decoded too, rather than being counted without network work.
   */
  async loadUrl(asset: AssetEntry, url: string): Promise<THREE.Group | null> {
    if (this.disposed) return null;
    const cached = this.cache.get(url);
    if (cached) return cached;

    const pending = this.inflight.get(url);
    if (pending) return pending;

    const request = new Promise<THREE.Group>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (error) => reject(error),
      );
    })
      .then((scene) => {
        if (this.disposed) {
          disposeObject(scene);
          throw new Error('library disposed while loading');
        }
        applyAssetFlags(scene, asset);
        this.cache.set(url, scene);
        this.inflight.delete(url);
        return scene;
      })
      .catch((error: unknown) => {
        this.inflight.delete(url);
        this.failures.push({
          assetId: asset.id,
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });

    this.inflight.set(url, request);
    try {
      return await request;
    } catch {
      // Already recorded; the caller decides how to present a missing module.
      return null;
    }
  }

  /** Warm the cache for a whole kit before the first frame is drawn. */
  async preload(
    assets: readonly AssetEntry[],
    options: LoadOptions = {},
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    let loaded = 0;
    const total = assets.length;
    await Promise.all(
      assets.map(async (asset) => {
        await this.load(asset, options);
        loaded += 1;
        onProgress?.(loaded, total);
      }),
    );
  }

  /** Warm a concrete set of versioned URLs, reporting after each decode succeeds or fails. */
  async preloadUrls(
    variants: readonly { asset: AssetEntry; url: string }[],
    onProgress?: (loaded: number, total: number, failed: number) => void,
  ): Promise<void> {
    let loaded = 0;
    let failed = 0;
    const total = variants.length;
    await Promise.all(
      variants.map(async ({ asset, url }) => {
        const scene = await this.loadUrl(asset, url);
        loaded += 1;
        if (!scene) failed += 1;
        onProgress?.(loaded, total, failed);
      }),
    );
  }

  /**
   * An independent instance of a loaded asset.
   *
   * Geometries and materials are shared with the cached template — `clone()` copies the
   * node graph but keeps the underlying resources — so instancing a module many times
   * costs almost nothing on the GPU.
   */
  instance(asset: AssetEntry, options: LoadOptions = {}): THREE.Group | null {
    const url = this.urlFor(asset, options);
    if (url === null) return null;
    const template = this.cache.get(url);
    if (!template) return null;
    return template.clone(true);
  }

  /** Release every GPU resource this library owns. */
  dispose(): void {
    this.disposed = true;
    for (const scene of this.cache.values()) disposeObject(scene);
    this.cache.clear();
    this.inflight.clear();
  }
}

function applyAssetFlags(root: THREE.Object3D, asset: AssetEntry): void {
  root.name = asset.id;
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    mesh.castShadow = asset.castShadow;
    mesh.receiveShadow = asset.receiveShadow;
    // Scenery must never be picked up by gameplay raycasts.
    mesh.userData.decorative = asset.decorative === true;
    mesh.userData.paintReceiver = asset.paintReceiver;
    mesh.userData.assetId = asset.id;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial
      ) {
        if (isAuthoredChromeMaterialName(material.name)) {
          // Color.set interprets CSS hex as sRGB and converts it to Three's working space.
          // The current chrome has no texture; keep any future colour map explicit.
          material.color.set('#edf2f7');
          if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
          material.metalness = 1;
          material.roughness = 0.16;
          material.envMapIntensity = 2.4;
        } else {
          material.envMapIntensity = 1.1;
        }
        material.toneMapped = true;
        material.needsUpdate = true;
      }
    }
  });
}

/** Recursively free geometries, materials and any textures they reference. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
      }
      entry.dispose();
    }
  });
}

/** Rough device-tier check, matching the renderer's own low-power path. */
export function isLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && memory <= 4) return true;
  const coarse =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
  return coarse && (navigator.hardwareConcurrency ?? 8) <= 4;
}

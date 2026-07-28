export type ViceEstateRendererMode = 'legacy' | 'gltf';

/** Blender-authored GLBs are now the default visual renderer for Vice Estate. */
export const DEFAULT_VICE_ESTATE_RENDERER_MODE: ViceEstateRendererMode = 'gltf';

/**
 * One explicit rollback flag: `?renderer=legacy` or `?renderer=gltf`.
 *
 * Unknown values safely resolve to the GLB default and emit a development error so a
 * mistyped rollback request cannot silently select an unintended renderer.
 */
export function resolveViceEstateRendererMode(
  search = typeof location === 'undefined' ? '' : location.search,
): ViceEstateRendererMode {
  const value = new URLSearchParams(search).get('renderer');
  if (value === 'legacy' || value === 'gltf') return value;
  if (value && import.meta.env.DEV) {
    console.error(`[ViceEstate] Invalid renderer mode "${value}". Expected "legacy" or "gltf".`);
  }
  return DEFAULT_VICE_ESTATE_RENDERER_MODE;
}

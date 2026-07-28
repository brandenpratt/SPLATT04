# VICE ESTATE 04 — asset pipeline

Original modular assets authored in Blender, exported to GLB, and driven by one shared,
reference-driven layout that both Blender and the browser consume.

> **Status: provisional blockout.** The layout has **not** passed Gate A. Proportions and
> the review camera are first-pass estimates, not camera-matched to the master reference.
> The live match route still uses the legacy procedural arena.

---

## Source of truth

Everything derives from two committed documents:

| File                                                                                     | Role                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`vice-estate-04.layout.json`](../packages/shared/src/arenas/vice-estate-04.layout.json) | Dimensions, placements, colliders, spawns, nav anchors, pickups, paintable surfaces, scenic zones, waterfront, review camera. |
| [`vice-estate-04.assets.json`](../packages/shared/src/arenas/vice-estate-04.assets.json) | Per-module GLB URLs, LODs, mobile fallbacks, paint reception, bounds, content hashes.                                         |

Both are typed and validated by [`layout-schema.ts`](../packages/shared/src/arenas/layout-schema.ts)
and [`asset-manifest.ts`](../packages/shared/src/arenas/asset-manifest.ts), and validated at
module load — a malformed layout is a build failure, not a subtly wrong arena.

**There is exactly one collider table.** The legacy procedural layout in
[`arena.ts`](../packages/shared/src/arena.ts) is a separate, labelled fallback that still
drives the live match; it is not mirrored here and must not be kept in sync by hand.

### Coordinate spaces

The layout is authored in **game space** (three.js: +X right, +Y up, −Z forward/north).
`viceestate_common.game_to_blender` converts to Blender's Z-up space as `(x, −z, y)`.

That negation matters. The naive swap `(x, z, y)` is a reflection with determinant −1 and
mirrors the entire estate left-to-right — which silently invalidates any camera match. The
conversion is defined once, in one place, and nothing else may re-derive it.

---

## Scripts

All run headless; none require the Blender MCP connection.

```bash
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender

# Build the blockout in Blender (optionally save the .blend)
$BLENDER --background --python tools/blender/build_vice_estate_kit.py -- --save

# Export every module to public/assets/vice-estate/ and refresh the manifest
$BLENDER --background --python tools/blender/export_vice_estate_kit.py

# Render the Gate A review sheets
$BLENDER --background --python tools/blender/render_vice_estate_review.py -- --samples 64

# Validate the kit (also runs under plain python3, so it can gate CI)
python3 tools/blender/validate_vice_estate_kit.py
```

| Script                         | What it does                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build_vice_estate_kit.py`     | Constructs one original module per manifest asset from primitives, then instances them at every layout placement using linked duplicates.                                   |
| `export_vice_estate_kit.py`    | Rebuilds from source (never a hand-saved `.blend`), exports GLBs, and writes back derived metadata only: bounds, per-file hashes, `contentVersion`.                         |
| `render_vice_estate_review.py` | Golden Hour camera from `layout.reviewCamera`; renders `blockout.png`, plus `overlay.png` and `side-by-side.png` when the master reference exists.                          |
| `validate_vice_estate_kit.py`  | Cross-checks layout ↔ manifest ↔ GLBs on disk: stable unique IDs, real GLB containers, hash match, no collider on scenery, flat-world guarantee. Exits non-zero on failure. |

`contentVersion` is a hash of all GLB hashes, so rebuilding an unchanged kit produces an
unchanged version and any real change invalidates client caches automatically.

---

## Runtime

- [`assets.ts`](../apps/web/src/game/assets.ts) — `AssetLibrary`: de-duplicated loads,
  caching by resolved URL, `preload()` with progress, `instance()` cloning that shares
  geometry and materials, full `dispose()`, and per-asset error capture so one missing
  module cannot blank the scene.
- [`ArtReviewScene.tsx`](../apps/web/src/scene/ArtReviewScene.tsx) — the isolated review
  scene at **`/art-review/vice-estate`**. No gameplay, no networking, no procedural arena.
- Service worker — GLBs live in a separate `splat04-assets` cache keyed on the `?v=`
  content version, and older versions are swept on first fetch of a new one. A stale model
  can never be served indefinitely.
- Low-power devices resolve `mobileFallback`; `null` means the module is dropped entirely
  (the glass bridge, dock, yacht and floodlights are excluded on mobile).

WebGL2 remains the production renderer. No WebGPU work is in scope.

---

## Current kit

19 assets, 21 GLB URLs including LOD variants, **≈405 KB total**, 75 placements,
53 colliders.

Modules: `villa-west`, `villa-east`, `villa-roof-west`, `villa-roof-east`, `glass-bridge`,
`flamingo-fountain` (+LOD1), `planter-curved`, `bunker-dome`, `bunker-wedge`,
`bunker-block`, `perimeter-straight`, `perimeter-corner`, `ground-court`, `dock`, `yacht`,
`palm` (+LOD1), `floodlight`, `skyline-far`, `skyline-near`.

### Gameplay stays on one ground level

Upper storeys, the glass bridge and everything offshore are marked `inaccessible`, carry no
collider, and are listed as scenic zones with a stated reason. `validate_vice_estate_kit.py`
fails the build if a raised placement is not marked inaccessible, or if any collider is
attached to scenery.

---

## Assets still required before this is final art

The current kit is a **blockout built from primitives**. Everything below is outstanding:

**Blocked on the master references**

1. Camera match — `layout.reviewCamera` is an estimate; overlay and side-by-side cannot be produced.
2. Landmark proportions — villa mass, roof curvature, bridge span and fountain scale all need matching.
3. Skyline silhouette — `skyline-far` / `skyline-near` are procedural boxes pending `miami-skyline-master.png`.

**Modelling work after Gate A approves proportions** 4. Villa detailing: window mullions, balcony returns, entrance canopies, service doors. 5. Roof: true swept profile with proper fascia and gutter, rather than a flattened cylinder. 6. Fountain: sculpted flamingo silhouette; the current one is primitives on legs. 7. Perimeter: inflated vinyl seams, tension straps, corner tie-downs. 8. Bunkers: distinct dome/wedge/block families with seam detail and deformation-ready topology. 9. Dock and yacht: currently placeholder boxes. 10. Palms: proper frond cards with alpha, plus a genuine low-poly LOD1. 11. Ground: baked terrazzo/turf boundary and worn court markings instead of two flat slabs.

**Pipeline work** 12. UVs and lightmap/AO bake — modules are currently untextured flat colour. 13. Draco or Meshopt compression once geometry is final. 14. A real LOD chain (only the fountain and palm have LOD1). 15. Paint-projection surface tagging validated against `paintReceiver` per module. 16. Collision-vs-visual review pass: colliders are currently authored, not derived from final meshes.

---

## Gate A checklist

- [ ] `docs/references/vice-estate-master.png` present
- [ ] `docs/references/miami-skyline-master.png` present
- [ ] `reviewCamera` matched to the reference
- [ ] Overlay and side-by-side rendered and reviewed
- [ ] Proportions and major silhouettes approved
- [ ] `layout.json` → `status: "gate-a-approved"`, `referenceLocked: true`

Only after all six may detailed asset polishing begin, and only then should migrating the
live match route off the legacy procedural arena be considered.

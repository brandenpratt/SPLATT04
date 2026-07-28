# Milestone 1 Verification Report — PASS

**Checkpoint:** The production `/play/vice-estate-04` flow must load the current
versioned Vice Estate GLB kit, mount the shared `ViceEstateVisualLayer`, and
visibly show the authored estate landmarks during normal playable gameplay.

## Production identity

- Branch: `codex/runtime-integration`
- Base commit: `f71d340`
- Production URL: `http://localhost:8787`
- Production entry bundle: `/assets/index-C4P2Q4Bw.js`
- Service-worker version: `splat04-v2`
- Built Vice Estate kit: 31 GLB variants, 1,767,024 bytes
- Browser console: 0 errors, 0 warnings

Port 8787 served the current production entry and service worker. Browser cache
inspection found only `splat04-v2` and `splat04-v2-assets`; the prior v1 cache
was absent.

## Acceptance result

| Boundary | Status | Evidence |
| --- | --- | --- |
| Current production bundle and SW served | Pass | `index-C4P2Q4Bw.js`; `splat04-v2` |
| 31 versioned GLBs loaded | Pass | `network-glb-log.json`: 31 unique versioned URLs, all HTTP 200 |
| GLBs decoded | Pass | Runtime asset hook: 31 loaded, 0 failed, status `ready` |
| Shared gameplay visual layer mounted | Pass | `ViceEstateVisualLayer`, `purpose=gameplay`, `rendererMode=gltf` |
| Dynamic gameplay retained | Pass | Coverage HUD, players, live paint, timer, network latency and renderer frames were active |
| Static authored paint omitted from gameplay | Pass | 94 placements rendered; 34 paint placements intentionally omitted |
| Required art visible in normal gameplay | Pass | Villas/roofs, chrome flamingo and fountain, inflatable cover, planters, palms and landscaping are visible |
| Corrected centre sightline | Pass | Live centre-ray inventory reports no hit on `can-0`; nearest visible intersections are ground/ocean |
| Art-review reuse | Pass | Same layer reports 128 placements, 0 omissions, `purpose=art-review` |
| Mobile gameplay capture | Pass | 390×844 capture shows live paint, cover, fountain/flamingo edge, palms and planters |
| Browser errors | Pass | `console-errors.json`: 0 errors, 0 warnings |
| Live legacy rollback capture | Missing | Browser timebox ended before a separate `?renderer=legacy` runtime capture |

The legacy renderer path itself remains present and unit-tested:
`?renderer=legacy` and `?renderer=gltf` are the only accepted values, `gltf` is
the default, and a total GLB placement failure falls back to `legacy`. The
production browser proof set does not claim a live legacy-route capture.

## Runtime inventory

- Gameplay visual placements: 94
- Intentionally omitted authored paint placements: 34
- Gameplay asset IDs represented: 27
- Preloaded variants, including LODs and authored paint files: 31
- Required visible placements:
  - 2 villas and 2 villa roofs
  - 1 flamingo/fountain
  - 23 inflatable bunker placements across dome, block, wedge, ramp and can
  - 6 planter placements
  - 6 palms
- Procedural `Arena` and `Scenery` groups were absent in the default GLTF scene.
- `PaintFloor`, players, camera, authoritative collision and network simulation
  remained active.

The live centre-ray sample used camera
`[-29.3396, 2.5246, 4.9845]` and forward direction
`[0.9619, -0.2341, 0.1414]`. `can-0` remained visible as legitimate cover but
did not intersect the centre ray.

## Network and cache evidence

All 31 resource-timing rows use the current
`?v=kit-9d41bdf69d21` version and report HTTP 200. The production server
currently returns GLBs as `application/octet-stream`.

The captured reload was controlled by `/sw.js`; all rows matched
`splat04-v2-assets`, with zero transfer bytes and their complete encoded sizes
available from Cache Storage. This proves the current versioned kit was loaded
from the v2 asset cache during the recorded run. It does not claim an origin
transfer for that particular reload.

## Performance sample

- Draw calls: 329
- Triangles: 70,422
- Geometry objects: 82
- Texture objects: 5
- Shader programs: 19
- GLB bytes loaded: 1,767,024 (1.685 MiB)

Exact GPU texture memory is not measurable through the exposed Three.js
renderer statistics. `WebGLRenderer.info.memory.textures` reports object count,
not byte allocation. The GLBs contain no embedded texture images; the five
runtime texture objects include generated PMREM and paint/render targets.

## Visual evidence

- `gameplay-1600x900.png`: normal third-person production gameplay with the
  corrected open centre lane.
- `gameplay-390x844.png`: live mobile gameplay at the requested portrait size.
- `art-review-1600x900.png`: the shared layer at its authored review camera,
  with 128 placements.
- `runtime-vs-art-review.png`: gameplay on the left and art review on the right.

The browser connection rendered captures at a device-scaled backing size
(1280×720 for the nominal 1600×900 viewport and 312×675 for the nominal
390×844 viewport). Final evidence PNGs were resampled without cropping or
content changes to their requested pixel dimensions. The side-by-side is
3200×900.

## Tests and build

- Shared: 7 files, 136 tests passed.
- Web visual-layer suite: 1 file, 11 tests passed.
- Server: 3 files, 49 tests passed.
- Workspace TypeScript checks passed for shared, server and web.
- Fresh production build passed and emitted `index-C4P2Q4Bw.js`.
- Production output contains all 31 GLBs and `splat04-v2`.
- `node --check apps/web/public/sw.js` passed.
- `git diff --check` passed.
- All four evidence JSON files parsed successfully.
- Every evidence PNG/JPEG passed file-type inspection; the required captures are exactly
  1600×900, 390×844 and 3200×900 for the side-by-side.
- A final live check returned HTTP 200 for the entry bundle, service worker and all 31
  versioned GLB URLs in `network-glb-log.json`.

## Required caveats

This is an integration pass, not browser/Blender visual parity.

- Materials remain visibly basic and dark. The GLBs contain materials but no
  texture images, and the browser uses a generated PMREM rather than Blender's
  authored reflection/environment rig.
- The layout remains provisional while authoritative movement, muzzle and
  camera collision still use the legacy obstacle footprint. Visual and
  authoritative collider positions can diverge.
- Mobile currently preloads all 31 primary and LOD variants. The deterministic
  1.685 MiB preload is acceptable for this checkpoint but should be optimized
  after visual approval.
- No new Blender art or arena redesign was performed.

## Outcome

Milestone 1 passes its screenshot checkpoint. The production gameplay route now
renders the Vice Estate GLB kit through the same shared visual layer as art
review while retaining dynamic gameplay systems and the procedural rollback
path.

No application code was changed during final browser verification, and no
Milestone 2 work was started.

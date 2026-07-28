# Milestone 1 Legacy Rollback Evidence

- Capture time: `2026-07-28T02:22:39.670Z` (`2026-07-27 22:22:39 EDT`)
- Production URL: `http://localhost:8787/play/vice-estate-04?renderer=legacy`
- Production entry bundle: `/assets/index-C4P2Q4Bw.js`
- Runtime mode: `rendererMode=legacy`
- Live state: active Coverage match with timer, score, player, dynamic paint, HUD,
  and network latency visible
- Runtime scene check: `ViceEstateVisualLayer` absent, as expected for the
  preserved procedural path
- Console errors: `0`
- Console warnings: `0`

The main-world `window.__splat04` diagnostic hook was present with the renderer,
scene, world, client, input, and debug handles. The legacy path intentionally
does not mount `ViceEstateVisualLayer`, so it does not publish the GLTF-only
`visualLayer.rendererMode` field. The resolved live mode was verified from the
route selector and the absence of `ViceEstateVisualLayer`; the screenshot
visibly shows the procedural villas, cover, water, and skyline.

## Screenshot

- File: `legacy-gameplay-1600x900.png`
- Format: PNG, RGB, non-interlaced
- Dimensions: `1600x900`
- SHA-256:
  `bc13a9f0960613d4e1c393006b304096a67008bb7c80ebab43e00c0e45059e0d`
- Browser backing capture: `1434x693`, normalized without cropping to the
  requested evidence dimensions

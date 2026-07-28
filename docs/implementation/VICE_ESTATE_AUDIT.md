# VICE ESTATE 04 repository audit

Audit run: `SPLAT04-20260727-01`  
Audit date: 2026-07-27  
Checkout: `/Users/primecourts/Projects/splat04`  
Scope: repository audit and unchanged-runtime baseline only

## Audit boundary

The checkout was populated and already heavily dirty when this audit began. All pre-existing
tracked and untracked work was treated as user-owned. No gameplay, rendering, asset, networking,
or configuration code was changed during this phase. The only additions from this audit are this
document, the run record/index, and the generated baseline screenshot.

No repository-local `AGENTS.md`, `CLAUDE.md`, or contribution guide was found. The root `README.md`
and the master prompt's operating rules and repository-audit requirements were read.

## Current stack and resolved versions

The package manifests declare SPLAT 04 `0.1.0`, Node `>=20.11.0`, and pnpm `>=9`. Versions resolved
in the audited checkout are:

| Area | Confirmed implementation and resolved version |
| --- | --- |
| Runtime/tooling | Node `24.18.0`, pnpm `11.17.0`, TypeScript `5.9.3` |
| Web framework | Vite `6.4.3`, React `19.2.8`, React DOM `19.2.8` |
| 3D integration | `@react-three/fiber` `9.6.1`, `@react-three/drei` `10.7.7` |
| Renderer | Three.js `0.173.0` through React Three Fiber |
| Server | Node HTTP plus `ws` `8.21.1`; `tsx` `4.23.1` in development |
| Tests | Vitest `3.2.7` in shared and server packages |
| Workspace | pnpm monorepo: `apps/web`, `apps/server`, `packages/shared` |

## Rendering engine and renderer

- `apps/web/src/scene/GameScene.tsx` mounts a React Three Fiber `Canvas` backed by Three.js.
- The audited browser created a WebGL 2 context:
  `WebGL 2.0 (OpenGL ES 3.0 Chromium)` with GLSL ES 3.00.
- The Canvas requests antialiasing and `high-performance`; the high-quality path enables shadows.
- Device pixel ratio is capped at 2 on high quality and fixed at 1 on low quality.
- ACES filmic tone mapping, fog, a generated PMREM sunset environment, hemisphere/directional
  lighting, and procedural materials are active on the gameplay route.
- There is no WebGPU path or renderer-capability layer in the audited implementation.
- The live gameplay route still renders `Arena.tsx` and `Scenery.tsx` from procedural Three.js
  primitives. The GLB kit is isolated to the art-review route and is not connected to gameplay.

## Physics and collision

There is no third-party physics engine. Deterministic flat-world movement and projectile rules live
in `packages/shared` and are shared by the server, local prediction, and offline practice.

- Player movement resolves against authored 2D axis-aligned box and circle obstacles and clamps to
  the arena bounds.
- Projectile stepping uses segment/ray tests against the same obstacle table and player circles.
- The third-person camera has its own 2D ray/box and ray/sphere distance limit and ignores cover
  that is too low to reach the camera.
- The combat surface remains one ground level. Collider height is used for camera/cover behavior,
  not for multi-level traversal.

## Input, player controller, and cameras

- `InputController` merges keyboard/mouse and touch into one per-frame input snapshot.
- Desktop movement uses WASD or arrows, mouse-look uses pointer lock, left mouse fires, Space boosts,
  Escape opens settings, and V switches the playable camera.
- Touch uses separate move/aim sticks; the aim stick steers and fires, and a touch button boosts.
- Local movement is predicted with the shared `stepPlayer` implementation and later reconciled to
  authoritative server snapshots.
- Camera modes are close third person, first person, and a developer-only overhead camera.
- Third person uses shoulder offset, boost pullback, smoothing, collision pull-in, and an
  intermission attract view. First person uses visor height and optional motion bob.
- Aim is resolved from a camera crosshair to a world point, but shots originate at the player's
  muzzle; the server remains authoritative.

## Paint rendering and scoring

- Authoritative paint ownership is a `128 x 84` grid in shared simulation code.
- Cells beneath cover are excluded from the paintable mask.
- The gameplay client uploads ownership to one RGBA `DataTexture` only when `gridVersion` changes.
- A single custom-shader floor mesh samples the texture with linear filtering. Red represents Cyan
  ownership and green represents Magenta; procedural stripe/dot motifs provide a non-color cue.
- Cosmetic cover impacts are kept separately as transient splats and do not alter floor coverage.
- The current isolated GLB art-review scene does not render dynamic gameplay paint.

## Bots

- Online bots are server authoritative and emit the same `PlayerInput` shape as humans.
- `BotBrain` is a seeded finite-state machine with `paint-route`, `hunt`, `defend`, `retreat`, and
  `boost-reposition` states.
- It uses an obstacle-validated navigation graph and breadth-first search only when the goal changes,
  plus line of sight, reaction delay, burst discipline, target weighting, and difficulty/personality
  parameters.
- Offline practice has a separate, deliberately simpler local wandering-bot fallback.

## Multiplayer

- The production service combines static client serving, HTTP APIs, and a `/ws` WebSocket upgrade.
- The protocol is validated JSON. The client sends inputs; the server owns positions, movement
  validation, projectile simulation, hits, tags, respawns, paint, coverage, round timing, teams,
  bots, and rewards.
- Defaults are 20 Hz server simulation and 10 Hz snapshots.
- The client predicts its local player, replays unacknowledged inputs after reconciliation,
  interpolates remote players about 120 ms behind, and visually dead-reckons projectiles.
- Reconnect tokens preserve a slot temporarily; crews and challenges are in-memory records.
- Developer room commands are refused unless the server starts with `SPLAT04_DEBUG=1`.

## Assets and loading

Current authored/local formats and paths:

- 21 local `.glb` files under `apps/web/public/assets/vice-estate/`, totaling 414,360 bytes.
- A typed JSON asset manifest at
  `packages/shared/src/arenas/vice-estate-04.assets.json`.
- A typed placement/collider/layout document at
  `packages/shared/src/arenas/vice-estate-04.layout.json`.
- Blender source at
  `assets-source/blender/vice-estate/vice-estate-blockout.blend`.
- Deterministic Blender build/export/render/validation Python scripts under `tools/blender/`.

`AssetLibrary` uses Three.js `GLTFLoader`, de-duplicates in-flight loads, caches templates by a
content-versioned URL, clones scene graphs while sharing GPU resources, records non-fatal failures,
selects LOD/mobile fallbacks, and disposes geometry, materials, and textures.

The art-review route reported `ready`, kit `kit-b8fe5b68c391`, 75 placements, and no displayed asset
load errors. The layout is explicitly provisional and the UI labels it
`BLOCKOUT — NOT FINAL ART`. The gameplay route does not currently use this kit.

The canonical master reference files named by the prompt are not present at their expected repository
paths. This phase deliberately did not ingest or copy reference images.

## Routes

Client routes parsed in `packages/shared/src/routes.ts`:

| Route | Current purpose |
| --- | --- |
| `/` | Boot/target-range flow |
| `/play/vice-estate-04` | Arena route metadata |
| `/c/:crewCode` | Crew entry |
| `/challenge/:id` | Challenge entry |
| `/art-review/vice-estate` | Isolated GLB kit review, no gameplay/networking |

Server endpoints:

- `GET /api/health`
- `POST /api/crew`
- `POST /api/challenge`
- `GET /api/challenge/:id`
- WebSocket upgrade at `/ws`
- Static files plus SPA fallback for client routes

The current play route is `/play/vice-estate-04`, but the React application still initializes the
target range for every non-art-review route. It therefore does not actually provide immediate direct
arena entry.

## Existing performance instrumentation

- `FrameDriver` samples client FPS over two-second visible-document windows for automatic quality.
- The developer panel displays client FPS, ping, observed snapshot rate, server tick rate, input/ack
  sequence, and player count.
- `window.__splat04` exposes renderer, scene, world, network client, input, and safe debug handles for
  local inspection.
- Three.js `renderer.info` is available through the renderer handle.
- No built-in UI currently reports draw calls, visible triangles, texture count, loaded asset bytes,
  or renderer capability details.

## Build, lint, test, and screenshot commands

| Purpose | Existing command | Audit finding |
| --- | --- | --- |
| Development | `pnpm dev` | Builds shared, then starts shared watch, server watch, and Vite |
| Production build | `pnpm build` | Builds shared, web, then server |
| Production start | `pnpm start` | Runs `apps/server/dist/index.js` |
| Tests | `pnpm test` | Shared build/tests, then server tests |
| Type checking | `pnpm typecheck` | Recursive package type checking |
| Formatting | `pnpm format` | Prettier write |
| Format check | `pnpm format:check` | Prettier check |
| Smoke test | `pnpm smoke` | Boots/checks production health, index, and `/ws` |
| PWA icons | `pnpm icons` | Regenerates icons; also runs during web build |
| Lint | None | No lint script or linter configuration was found |
| Screenshot | None | README explicitly says no automated screenshot command exists |

Build, test, typecheck, format, and smoke commands were not run in this audit timebox. Starting the
existing project and browser verification were the required runtime checks performed before any
documentation edit.

## Baseline runtime measurements

Representative browser: Chromium WebGL2 session against Vite development server
`http://localhost:5173/play/vice-estate-04?unlockAll=1`.

| Metric | Baseline |
| --- | --- |
| Initial cold transfer | 4,586,050 encoded bytes (4.37 MiB), 75 requests, cache disabled |
| Transfer composition | 4,577,851 bytes JavaScript; 5,733 PNG; 1,502 HTML; 964 manifest |
| Time to first playable frame | **Unmeasurable reliably in this run** |
| Average FPS | 119.54 over 8.005 seconds / 957 frames |
| Worst one-second FPS | 118.99 |
| Worst sampled frame | 16.9 ms |
| 95th-percentile frame time | 9.2 ms |
| Visible triangles | 19,694 in the sampled gameplay frame |
| Draw calls | 149 in the sampled gameplay frame |
| Renderer memory counters | 24 geometries, 3 textures, 19 shader programs |
| Texture memory bytes | **Unmeasurable**: WebGL/Three exposes texture-object count, not allocated GPU bytes |
| CSS viewport | 1434 x 693 |
| Drawing buffer | 2294 x 1108 at DPR 1.6 |
| Maximum texture size | 16,384 |

The transfer measurement is a Vite development baseline, not an optimized production-bundle budget.
It intentionally used a cold cache and includes Vite/React-refresh development modules.

The boot overlay's source target is 2,600 ms with a 200 ms wall-clock backstop, but the controlled
browser repeatedly throttled the overlay's animation/timer progression during reload profiling. A
runtime value would therefore be misleading and is not reported as measured. A future production
profile should instrument an explicit application “input enabled” mark and collect it in a foreground
browser.

Screenshot:
`docs/implementation/baselines/vice-estate-gameplay-camera-baseline.png`

## Console warnings and errors

- No framework error overlay was present.
- No console error was captured.
- One repeatable warning was captured:
  `WARNING: Multiple instances of Three.js being imported.`
- The art-review route reached `ready` without a displayed asset error.

## Known bugs and audit findings

1. **Duplicate Three.js runtime warning.** The browser reports multiple Three.js instances. This can
   cause class identity mismatches, duplicate renderer-side state, and avoidable transfer cost.
2. **The documented direct play route is not direct.** `/play/vice-estate-04` still boots the target
   range because stage initialization does not branch on the parsed arena route.
3. **Unknown client routes fall through to the game.** `parseRoute` can return `unknown`, but `App`
   only special-cases `art-review`; unknown routes still mount `GameApp` rather than an error route.
4. **Development start had a port collision in this workstation state.** `pnpm dev` started shared
   watch and Vite successfully, but its server child failed with `EADDRINUSE` because an existing
   production server from this same checkout was already listening on 8787. That existing server's
   `/api/health` returned HTTP 200, so browser verification continued through Vite's proxy. This is
   an operational baseline condition, not evidence of a source regression.
5. **No reliable first-playable timing mark exists.** The app exposes FPS and renderer handles but
   does not publish a navigation-to-input-enabled measurement.

## Files likely to change in the full VICE ESTATE art pass

This is a forecast, not authorization to change them in the audit phase:

- `docs/references/vice-estate-master.png`
- `docs/references/miami-skyline-master.png`
- `docs/implementation/**`
- `assets-source/blender/vice-estate/**`
- `tools/blender/**`
- `apps/web/public/assets/vice-estate/**`
- `packages/shared/src/arenas/**`
- `apps/web/src/game/assets.ts`
- `apps/web/src/scene/ArtReviewScene.tsx`
- `apps/web/src/scene/Arena.tsx`
- `apps/web/src/scene/Scenery.tsx`
- `apps/web/src/scene/PaintFloor.tsx`
- `apps/web/src/scene/materials.ts`
- `apps/web/src/scene/GameScene.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/public/sw.js`
- relevant validation tests and project documentation

## Systems deliberately untouched during the art pass

Until an approved arena layout requires a narrowly documented integration change, the art pass should
leave these systems untouched:

- Authoritative server room lifecycle, scoring, hits, saturation, respawns, and rewards.
- WebSocket message validation, snapshot cadence, prediction, reconciliation, and reconnect behavior.
- Shared player/projectile simulation, input clamping, and paint coverage math.
- Bot decision-making and difficulty behavior.
- Profile/progression storage, crews, challenges, claim UI, and future wallet/token seams.
- Existing first-/third-person input and camera behavior.
- HUD, touch controls, accessibility settings, and audio/haptics.
- Production API routes and deployment configuration.

The GLB kit and art-review route should remain isolated until reference, visual, performance, and
gameplay gates authorize reconnection to the live arena.

# Milestone 2 production verification

Date: 2026-07-28

Origin: `http://localhost:8787`
Production build: `index-yhMuFr9A.js`, `index-qGlUiXZo.css`

SPLAT 04's production front door now loads the selected Vice Estate asset
path, presents a responsive DOM HomeMenu, routes direct players according to
onboarding state, and keeps art review outside the front-door flow.

## Outcome

Milestone 2 is substantially verified, with two explicit evidence gaps:

1. Browser automation reached the real first-time TargetRange but could not
   reliably complete its pointer-lock painting exercise. The reducer and web
   tests cover `ONBOARDING_COMPLETE -> arena`; this report does not claim a
   same-session browser proof of that final handoff.
2. The first seeded v1 service-worker client exposed an installed-to-waiting
   race: the verifier had to repeat the safe-activation message. The lifecycle
   now performs a bounded retry outside active matches and has a regression
   test; a second seeded browser migration was not run after that final fix.
   See `service-worker-upgrade.md`.

## Route and control matrix

| Check                                                  | Result       | Browser evidence                                                                                                     |
| ------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `/` loading to HomeMenu                                | Pass         | Clean root menu observed after loading                                                                               |
| First direct play loading to TargetRange               | Pass         | `direct-first-02-target-range-1600x900.png`                                                                          |
| First TargetRange to arena in the same browser session | Evidence gap | Pointer-lock target exercise was not reliably automatable; no pass claimed                                           |
| Returning direct play loading to arena                 | Pass         | Sequence observed `24% -> 99% Mounting estate + SKIP -> arena`; `direct-returning-02-arena-1600x900.png`             |
| Coverage selection reaches app/runtime state           | Pass         | `window.__splat04.selectedMode()` returned `coverage`; online HUD rendered                                           |
| Practice selection reaches local runtime               | Pass         | Local-only banner, local latency label, and `selectedMode() === practice`; `mode-practice-local-1600x900.png`        |
| Coreball                                               | Pass         | Visible and disabled with `Coming soon` at all seven viewports                                                       |
| Locker and Crew                                        | Pass         | Deliberately disabled on desktop with `Coming soon`; intentionally hidden in compact portrait navigation             |
| Settings                                               | Pass         | Enabled control opened and closed the real Settings dialog                                                           |
| Keyboard mode navigation                               | Pass         | ArrowRight selected Practice; Home returned focus/selection to Coverage                                              |
| Art review bypass                                      | Pass         | `/art-review/vice-estate` rendered its isolated 128-placement review with no LoadingSplash, HomeMenu, or TargetRange |
| Explicit legacy renderer                               | Pass         | `?renderer=legacy` released directly to gameplay; no `ViceEstateVisualLayer` was present                             |
| Root round-end isolation                               | Pass         | After the gating fix, background round results no longer rendered over HomeMenu                                      |

## Loading results

Cold throttled measurements disabled the HTTP cache and bypassed the service
worker. Conditions were 80 ms latency and 400,000 bytes/second download.

| Path                  | Selected GLBs | Decoded GLB bytes | Splash visible | Minimum playable | Full ready |
| --------------------- | ------------: | ----------------: | -------------: | ---------------: | ---------: |
| Desktop full path     |            27 |         1,557,868 |        22.3 ms |       6,682.0 ms | 6,682.0 ms |
| Mobile low-power path |            21 |         1,405,576 |        14.9 ms |       6,139.2 ms | 6,139.3 ms |

The mobile path loaded `palm-lod1.glb` and did not fetch the full palm in the
same run. The 31-source manifest is not equivalent to 31 gameplay requests:
gameplay excludes static paint GLBs and selects only one primary/LOD URL per
runtime path.

Cold runs did not expose a Skip interval because the loading-image decode
settled after optional GLBs. A separate warm returning run observed the real
`99% · Mounting estate` state with `SKIP`, immediately followed by the arena.
No artificial delay was added.

The original portrait evidence was captured on the first loading sample, before
the browser had selected an image source, and therefore showed the navy fallback.
The delivery path now preloads a 2.3 KB derivative of the approved master as the
immediate full-bleed background, selects a 225 KB responsive portrait source, and
serves both as `image/jpeg`. `loading-mobile-cold-first-frame-390x844.png` proves
approved art at the real 12% cold frame; the recaptured
`loading-mobile-390x844.png` proves the decoded responsive plate at 47%. Both
captures measured 390×844 with document dimensions 390×844.
Raw cold-frame state, response MIME, dimensions, and byte counts are in
`loading-splash-delivery.json`.

Detailed samples, decoded events, URLs, timings, bytes, and caveats are in:

- `loading-progress-events.json`
- `timing-bytes.json`

Those two timing files were captured on the immediate pre-hardening bundle
`index-J4J-T4rS.js`; the GLB selection/state machine is unchanged. Current final-bundle
portrait delivery evidence is isolated in `loading-splash-delivery.json`.

## Responsive and accessibility results

All required screenshots are exact requested pixel dimensions:

- `home-1672x941.png`
- `home-1600x900.png`
- `home-1440x900.png`
- `home-844x390.png`
- `home-768x1024.png`
- `home-430x932.png`
- `home-390x844.png`
- `loading-desktop-1600x900.png`
- `loading-mobile-cold-first-frame-390x844.png`
- `loading-mobile-390x844.png`

At every viewport:

- no document-level horizontal or vertical overflow was observed;
- every visible control stayed within the viewport;
- Coverage, disabled Coreball, and Practice remained visible;
- enabled controls met the 44 px target requirement within Chrome's
  sub-pixel rounding tolerance;
- no mode-card, crew-avatar, text, or primary-action overlap was observed.

Chrome reported an 80% profile zoom, so DOM `innerWidth` was 1.25 times the
requested outer viewport. Captures were clipped to the app viewport and
losslessly normalized to the exact requested dimensions. The automated web
tests separately exercise the declared viewport matrix. Raw dimensions and
control rectangles are in `accessibility-overflow.json`.

## Console and service worker

Captured root/responsive and final service-worker sessions contained zero
console errors and zero warnings. Route-flow tabs were closed before a
separate per-tab export, so `console.json` records that limitation rather than
inventing a complete log.

The first real v1-to-v3 browser exercise is documented in
`service-worker-upgrade.md`. Worker activation, claiming, reload, and cache
cleanup passed after a direct repeat of the safe activation message. That run
identified an installed-to-waiting race; the lifecycle now retries the safe
handoff and the regression suite simulates the delayed `registration.waiting`
transition.

## Automated tests and build

Results recorded by the implementation run:

- Web tests: 41/41 passed across 8 files
- Production service-worker test: passed
- Shared tests: 136/136 passed
- Server tests: 49/49 passed
- Workspace typecheck: passed
- Production build: passed; 113 modules transformed
- Production server confirmed the current JS and CSS bundles

The unchanged server rebalance timing test exceeded its 5-second ceiling once while the
live bot room and browser verifier were also active (5.43 seconds). After releasing those
verification loads, the same standalone suite passed 49/49 with that test at 4.26 seconds;
no server-simulation or test timeout was changed.

The build retains the pre-existing large-chunk warning. Bundle optimization is
outside this milestone.

## Exact implementation files changed

Modified:

- `apps/server/src/app.ts`
- `apps/web/package.json`
- `apps/web/public/sw.js`
- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/game/viceEstateAssets.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/scene/GameScene.tsx`
- `apps/web/src/scene/PaintFloor.tsx`
- `apps/web/src/scene/ViceEstateVisualLayer.tsx`

Added:

- `apps/web/public/ui/loading-screen-v3.jpg`
- `apps/web/public/ui/loading-screen-mobile-v3.jpg`
- `apps/web/public/ui/loading-screen-placeholder-v3.jpg`
- `apps/web/public/ui/vice-estate-home-v3.jpg`
- `apps/web/scripts/test-service-worker-upgrade.mjs`
- `apps/web/src/appFlow.ts`
- `apps/web/src/appFlow.test.ts`
- `apps/web/src/game/imagePreload.ts`
- `apps/web/src/game/imagePreload.test.ts`
- `apps/web/src/game/loadingMetrics.ts`
- `apps/web/src/game/loadingMetrics.test.ts`
- `apps/web/src/game/viceEstateAssets.test.ts`
- `apps/web/src/serviceWorkerLifecycle.ts`
- `apps/web/src/serviceWorkerLifecycle.test.ts`
- `apps/web/src/ui/FrontDoor.css`
- `apps/web/src/ui/HomeMenu.tsx`
- `apps/web/src/ui/HomeMenu.test.tsx`
- `apps/web/src/ui/LoadingSplash.tsx`
- `apps/web/src/ui/LoadingSplash.test.tsx`
- `docs/implementation/runs/SPLAT04-20260728-01.md`
- all files in this Milestone 2 evidence directory

Removed:

- `apps/web/public/ui/main-screen.jpg`
- `apps/web/public/ui/main-screen.png`
- `apps/web/src/ui/MainScreen.css`
- `apps/web/src/ui/MainScreen.tsx`

## Scope and remaining art gap

Milestone 1's renderer integration was frozen except for the approved
phase-aware loading boundary in exactly `ViceEstateVisualLayer.tsx` and
`GameScene.tsx`. That exception changes loading/readiness only, not placements,
materials, lighting, collision, or gameplay.

No clean transparent player/key-art asset exists. The HomeMenu therefore uses
the clean estate plate and does not fabricate or superimpose another player.
Coreball remains disabled because it has no gameplay implementation.

Browser/Blender material parity is not claimed. The GLBs still contain basic
materials without authored texture images or an external reflection
environment matching Blender.

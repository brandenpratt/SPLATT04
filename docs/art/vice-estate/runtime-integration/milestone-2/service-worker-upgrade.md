# Production service-worker upgrade evidence

Date: 2026-07-28

Origin: `http://localhost:8787`
Production build: `index-J4J-T4rS.js`, `index-D8cZ9BAJ.css`

## Procedure

1. Removed the existing localhost SPLAT 04 registration and only the
   `splat04-*` caches.
2. Served a temporary, byte-for-byte `f71d340` v1 worker as
   `/sw-v1-test.js`.
3. Registered it at scope `/`, reloaded the client, and confirmed:
   - controller: `/sw-v1-test.js`
   - active worker: `/sw-v1-test.js`
   - cache: `splat04-v1`
4. Registered the production `/sw.js` from the current build while the v1
   client remained open.
5. Confirmed the real waiting state:
   - controller and active worker remained `/sw-v1-test.js`
   - waiting worker was `/sw.js`
   - caches were `splat04-v1` and `splat04-v3`
6. Navigated the controlled client to the safe root HomeMenu.
7. The waiting worker remained waiting for more than eight seconds. For
   deterministic cleanup, the verifier sent the documented
   `splat04:activate-update` message directly to the waiting worker.
8. The production worker activated and claimed the client. The app's
   `controllerchange` listener then reloaded the page:
   - controller and active worker: `/sw.js`
   - waiting worker: none
   - navigation type after handoff: `reload`
   - remaining caches: `splat04-v3` and `splat04-v3-assets`
   - `splat04-v1` and the old shared `splat04-assets` cache were removed
9. Removed the temporary `apps/web/dist/sw-v1-test.js` fixture.

## Result

Partial pass with an explicit runtime evidence gap.

The real browser proved v1 control, v3 waiting, explicit safe activation,
`clients.claim()`, one controller-handoff reload, and old-cache deletion.
However, this seeded run required the verifier to repeat the safe activation
message after the root page did not release the waiting worker on its own.
The unit and production-worker tests cover the sender path, but this browser
run does not independently prove that the page always delivers that first
message.

No worker fixture or v1 registration was left behind. The final client is
controlled by the production v3 worker.

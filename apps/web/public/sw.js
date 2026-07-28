/*
 * SPLAT 04 service worker.
 *
 * Caches the app shell and Vite's content-hashed assets so a repeat visit starts fast and
 * an offline visit gets a useful page. Deliberately conservative:
 *   - it never caches /api or /ws;
 *   - updates activate only through the existing explicit intermission message (or after
 *     all old clients close); activation removes every older SPLAT 04 cache.
 */

const VERSION = 'splat04-v2';
/**
 * GLBs live in their own cache and are keyed by the `?v=` content version the asset
 * manifest stamps onto every URL. A rebuilt kit changes that version, so the old entries
 * become unreachable and are swept below — the service worker can never permanently serve
 * a stale model, which is the failure mode plain cache-first would create.
 */
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // A missing shell entry must not fail the whole install.
      Promise.allSettled(SHELL.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== VERSION && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

/** Drop any cached GLB whose content version is no longer the one being requested. */
async function sweepStaleAssets(currentVersion) {
  const cache = await caches.open(ASSET_CACHE);
  const requests = await cache.keys();
  await Promise.all(
    requests.map((request) => {
      const version = new URL(request.url).searchParams.get('v');
      return version && version !== currentVersion ? cache.delete(request) : Promise.resolve(false);
    }),
  );
}

self.addEventListener('message', (event) => {
  // The page asks for this explicitly, during intermission only.
  if (event.data === 'splat04:activate-update') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;

  // Navigations: network first so a fresh build is picked up, offline page as the fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? caches.match('/offline.html')),
    );
    return;
  }

  // Content-versioned GLBs: serve from cache when the version matches, otherwise fetch
  // and sweep every older version of the kit out of the cache.
  if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.glb')) {
    const version = url.searchParams.get('v');
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
          if (version) await sweepStaleAssets(version);
        }
        return response;
      }),
    );
    return;
  }

  // UI plates are not content-hashed. Network-first prevents an old loading/menu image
  // from surviving a release; the current version cache remains the offline fallback.
  if (url.pathname.startsWith('/ui/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(VERSION).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(async () => (await caches.open(VERSION)).match(request)),
    );
    return;
  }

  // Hashed assets are immutable: cache first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

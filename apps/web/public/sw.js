/*
 * SPLAT 04 service worker.
 *
 * Caches the app shell and Vite's content-hashed assets so a repeat visit starts fast and
 * an offline visit gets a useful page. Deliberately conservative:
 *   - it never caches /api or /ws;
 *   - it never takes over an open tab mid-round (no skipWaiting, no clients.claim), so a
 *     new version activates on the next navigation instead of reloading during play.
 */

const VERSION = 'splat04-v1';
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
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))),
  );
});

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

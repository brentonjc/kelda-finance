// Kelda Finance — Service Worker
// Network-first strategy: always fetches fresh code, falls back to cache if offline.

const CACHE = 'kelda-finance-v36';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.svg',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png',
];

// Install: cache app shell. Do NOT skipWaiting here — the new worker waits so
// the page can show an "update available" prompt and activate it on demand.
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL);
    })
  );
});

// Page asks the waiting worker to take over (via the update prompt's Reload button).
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Activate: clean up ALL old caches immediately
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: network-first for app shell files, so code changes are always picked up.
// Falls back to cache when offline.
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Skip cross-origin requests (CDN fonts, Chart.js)
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      // Update cache with fresh response
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Network failed — serve from cache (offline mode)
      return caches.match(e.request);
    })
  );
});

// Kelda Finance — Service Worker
// Network-first strategy: always fetches fresh code, falls back to cache if offline.

const CACHE = 'kelda-finance-v28';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/components.css',
  './css/layout.css',
  './js/storage.js',
  './js/data.js',
  './js/auth.js',
  './js/app.js',
  './js/pages/dashboard.js',
  './js/pages/transactions.js',
  './js/pages/bills.js',
  './js/pages/mortgage.js',
  './js/pages/cash.js',
  './js/pages/insurance.js',
  './js/pages/super.js',
  './js/pages/assets.js',
  './js/pages/export.js',
  './js/pages/autocategorise.js',
  './js/pages/categories.js',
  './js/pages/bva.js',
  './js/pages/forecast.js',
  './js/pages/transfers.js',
  './js/pages/equities.js',
  './js/pages/liabilities.js',
  './js/pages/goals.js',
  './js/pages/insights.js',
  './js/pages/quickstart.js',
  './js/wizard.js',
  './js/pages/settings.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
];

// Install: cache app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
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

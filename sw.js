// YarnCraft Companion - Service Worker (v4 Network-First Strategy)
const CACHE_NAME = 'yarncraft-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=4',
  './app.js?v=4',
  './db.js',
  './firebase-config.js',
  './manifest.json',
  './icon.svg',
  './icon.png',
  './icon-192.png',
  './icon-512.png'
];

// Install: pre-cache assets and activate immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: purge any old cached versions (v1, v2, v3, etc.)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch: NETWORK FIRST so fresh updates from GitHub appear immediately
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkRes;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(e.request).then((cachedRes) => {
          return cachedRes || caches.match('./index.html');
        });
      })
  );
});

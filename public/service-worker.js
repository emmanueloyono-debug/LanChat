// Service Worker — Minimal app-shell caching for PWA install support
const CACHE_NAME = 'lan-chat-v1';
const SHELL_ASSETS = [
  '/',
  '/css/styles.css',
  '/js/client.js',
  '/js/ai-assistant.js',
  '/favicon.svg',
  '/manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API/socket, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache socket.io, API calls, or uploads
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/upload') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // Offline fallback to cache

      return cached || networkFetch;
    })
  );
});

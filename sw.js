const VERSION = 'dark-v21';
const CACHE_STATIC = `schulden-manager-static-${VERSION}`;
const CACHE_RUNTIME = `schulden-manager-runtime-${VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/sw.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_STATIC).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => ![CACHE_STATIC, CACHE_RUNTIME].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request)) || (await caches.match('/index.html'));
      }
    })());
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return caches.match('/index.html');
      }
    })());
  }
});

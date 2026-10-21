/* Next's production build supplies the version and public static assets. */
const { version, cacheName, assets } = __PWA_CONFIG__;
const cachePrefix = 'memento-vivere-static-';
const staticPaths = new Set(assets.filter(path => path !== '/'));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets.map(url =>
    new Request(url, { cache: 'reload', credentials: 'omit' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') event.ports?.[0]?.postMessage({ version });
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Sessions, memories, photos and writes always use the server. Never cache RSC.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/api'
    || url.pathname.startsWith('/api/') || request.headers.get('RSC') === '1') return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      await caches.open(cacheName).then(cache => cache.match('/')) ?? Response.error()));
  } else if (staticPaths.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(url.pathname) ?? fetch(request)));
  }
});

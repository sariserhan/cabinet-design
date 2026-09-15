const CACHE = 'kitchen-field-shell-v2';
const ASSETS = [
  '/field/index.html',
  '/field/field.css',
  '/field/field.js',
  '/field/manifest.webmanifest',
  '/field/icon.svg',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('kitchen-field-shell-') && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !ASSETS.includes(url.pathname)
  )
    return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(url.pathname))
      .then((cached) => cached || fetch(event.request)),
  );
});
self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_READY')
    event.waitUntil(
      caches.open(CACHE).then(async (cache) => {
        const present = await Promise.all(
          ASSETS.map((asset) => cache.match(asset)),
        );
        event.ports[0]?.postMessage(present.every(Boolean));
      }),
    );
});

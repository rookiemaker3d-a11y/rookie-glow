/* Service worker Lunas — cache offline de la shell PWA */
const CACHE = 'rookie-glow-v11';
const ASSETS = [
  './',
  './index.html',
  './producto.html',
  './install-url.json',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/ble.js',
  './js/protocol.js',
  './js/preview.js',
  './js/storage.js',
  './js/color-wheel.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/qr-install.png',
  './icons/qr-producto.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

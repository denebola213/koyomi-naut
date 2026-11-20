/* Sky PWA service worker: ネットワーク優先・失敗時にキャッシュ (オフライン対応) */
const CACHE = 'skypwa-v64';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'astro.js',
  'planets.js',
  'constellations.js',
  'bright-stars.js',
  'milky-way.js',
  'app.js',
  'municipalities.js',
  'oaza.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(ASSETS.map(url => cache.add(url)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn('precache failed:', ASSETS[i], r.reason);
    });
    if (results.every(r => r.status === 'rejected')) throw new Error('precache: all failed');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});

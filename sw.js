// 一度開けばオフライン（ローカル通信のみ）でも起動できるようにキャッシュする
const CACHE = 'miruharau-v6';
const CORE = [
  './', './index.html', './style.css',
  './js/main.js', './js/game.js', './js/sim.js', './js/map.js', './js/world.js',
  './js/entities.js', './js/textures.js', './js/audio.js', './js/input.js', './js/net.js',
  './js/ghostmodel.js', './js/post.js', './assets/models/ghost.glb',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === location.origin;
  if (sameOrigin) {
    // 自サイト：ネット優先（更新をすぐ反映）、失敗時はキャッシュ
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
  } else {
    // CDN（three.js 等）：キャッシュ優先
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});

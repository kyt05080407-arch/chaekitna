// 책있나 서비스 워커: 앱 화면을 저장해 두고 오프라인에서도 열리게 한다.
// 대출 정보 조회(프록시)는 저장하지 않는다. 앱이 폰 저장소에 따로 캐시한다.

const VERSION = 'v0.1.0';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = 'data';
// 글꼴 파일은 거의 바뀌지 않으니 따로 오래 보관한다. Pretendard를 올리면 이름도 바꾼다.
const FONT_CACHE = 'fonts-pretendard-1.3.9';
const KEEP = new Set([SHELL_CACHE, DATA_CACHE, FONT_CACHE]);

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/fonts/pretendard/pretendard.css',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/demo.js',
  './js/libraries.js',
  './js/parse.js',
  './js/regions.js',
  './js/scan.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './js/views/home.js',
  './js/views/results.js',
  './js/views/detail.js',
  './js/views/mylibs.js',
  './js/views/watchlist.js',
  './js/views/settings.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return; // 프록시 등 다른 주소는 그대로 통과

  // 글꼴은 한 번 받으면 계속 쓴다. (화면에 나온 글자 조각만 그때그때 받는다)
  if (url.pathname.includes('/assets/fonts/')) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error()),
    );
    return;
  }
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  // 바코드 인식 모듈: 버전이 바뀔 때 새로 받도록 앱 화면 저장소에 함께 둔다.
  if (url.pathname.includes('/vendor/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

// 책있나 서비스 워커: 앱 화면을 저장해 두고 오프라인에서도 열리게 한다.
// 대출 정보 조회(프록시)는 저장하지 않는다. 앱이 폰 저장소에 따로 캐시한다.
// 아침 알림(웹 푸시)도 여기서 받아 보여 준다.

// 배포할 때 pages.yml이 이 값 뒤에 커밋 번호를 붙인다(예: v0.2.0-1a2b3c4). 그래야 새 버전이 나올 때마다
// 저장해 둔 화면 파일을 한 번에 새것으로 바꾼다.
const VERSION = 'v0.2.0';
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
  './js/hours.js',
  './js/opac.js',
  './js/nextsteps.js',
  './js/today.js',
  './js/libraries.js',
  './js/parse.js',
  './js/push.js',
  './js/reading.js',
  './js/events.js',
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
  './assets/icons/badge-96.png',
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

// 온라인이면 항상 새 파일을 쓰고(배포 직후에도 화면 파일끼리 버전이 섞이지 않게), 오프라인이면 저장본을 쓴다.
// 네트워크가 timeout(ms)보다 오래 걸리고 저장본이 있으면 저장본을 먼저 보여 준다.
async function networkFirst(request, cacheName, { timeout = 0 } = {}) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  network.catch(() => {}); // 저장본으로 먼저 답한 뒤 실패해도 경고를 남기지 않게
  try {
    if (!timeout) return await network;
    const cachedLater = new Promise((resolve) => {
      setTimeout(() => cache.match(request, { ignoreSearch: true }).then(resolve, () => resolve(undefined)), timeout);
    });
    return (await Promise.race([network, cachedLater])) || (await network);
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
      networkFirst(request, SHELL_CACHE, { timeout: 4000 }).catch(
        async () => (await caches.match('./index.html')) || Response.error(),
      ),
    );
    return;
  }
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request, DATA_CACHE, { timeout: 4000 }));
    return;
  }
  // 바코드 인식 모듈: 버전이 바뀔 때 새로 받도록 앱 화면 저장소에 함께 둔다.
  if (url.pathname.includes('/vendor/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  event.respondWith(networkFirst(request, SHELL_CACHE, { timeout: 4000 }));
});

// ---------- 아침 알림 ----------
// 보내는 쪽(scripts/send-alerts.mjs)이 { title, body, url, tag }를 JSON으로 보낸다.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : '책있나';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' && data.body ? data.body : '관심 도서 소식이 있어요.',
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/badge-96.png',
      tag: typeof data.tag === 'string' && data.tag ? data.tag : 'chaekitna',
      lang: 'ko',
      data: { hash: typeof data.url === 'string' && data.url.startsWith('#/') ? data.url : '#/watchlist' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.hash) || '#/watchlist';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open', hash });
        return;
      }
      await self.clients.openWindow(new URL(`./${hash}`, self.registration.scope).href);
    })(),
  );
});

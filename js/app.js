// 책있나 앱 시작점: 화면 전환(해시 라우터), 설정 적용, 오프라인용 서비스 워커 등록

import * as store from './store.js';
import { applySettings, toast } from './ui.js';

const ROUTES = [
  { pattern: /^\/$/, tab: 'home', load: () => import('./views/home.js') },
  { pattern: /^\/search$/, tab: 'home', load: () => import('./views/results.js') },
  { pattern: /^\/book\/(\d{13})$/, tab: 'home', keys: ['isbn'], load: () => import('./views/detail.js') },
  { pattern: /^\/libraries$/, tab: 'libraries', load: () => import('./views/mylibs.js') },
  { pattern: /^\/watchlist$/, tab: 'watchlist', load: () => import('./views/watchlist.js') },
  { pattern: /^\/settings$/, tab: 'settings', load: () => import('./views/settings.js') },
];

const main = document.getElementById('main');
let controller = null;
let visits = 0;

function parseHash() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  return { path: path || '/', query: new URLSearchParams(qs || '') };
}

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach((el) => {
    if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

async function route() {
  if (controller) controller.abort();
  controller = new AbortController();
  const { signal } = controller;
  const { path, query } = parseHash();
  const found = ROUTES.map((r) => ({ r, m: path.match(r.pattern) })).find((x) => x.m);
  if (!found) {
    navigate('#/');
    return;
  }
  visits += 1;
  const params = {};
  (found.r.keys || []).forEach((key, i) => {
    params[key] = found.m[i + 1];
  });
  setActiveTab(found.r.tab);
  try {
    const view = await found.r.load();
    if (signal.aborted) return;
    main.innerHTML = '';
    window.scrollTo(0, 0);
    await view.render({ main, params, query, navigate, signal });
    if (!signal.aborted) main.focus({ preventScroll: true });
  } catch (error) {
    if (signal.aborted || (error && error.name === 'AbortError')) return;
    console.error(error);
    main.innerHTML = '<div class="notice notice--warn" role="alert">화면을 여는 중에 문제가 생겼어요. 새로고침해 주세요.</div>';
  }
}

// 뒤로 버튼: 앱 안에서 이동해 왔으면 브라우저 뒤로가기(스크롤 위치 유지)
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-back]');
  if (link && visits > 1 && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});

// 표지 이미지를 못 불러오면 빈 표지로 바꾼다.
document.addEventListener(
  'error',
  (event) => {
    const img = event.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-cover')) {
      const span = document.createElement('span');
      span.className = img.className;
      span.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>';
      img.replaceWith(span);
    }
  },
  true,
);

// 안드로이드 크롬의 '앱 설치' 제안을 설정 화면에서 쓸 수 있게 보관
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__installPrompt = event;
});

window.addEventListener('online', () => toast('다시 연결됐어요'));
window.addEventListener('offline', () => toast('오프라인이에요. 저장된 정보만 보여요'));

applySettings(store.settings.get());
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applySettings(store.settings.get()));
store.pruneCache();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
  // 알림을 눌렀을 때 서비스 워커가 열어 달라는 화면으로 이동
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'open' && typeof data.hash === 'string' && data.hash.startsWith('#/')) navigate(data.hash);
  });
}

// 아침 알림을 켠 사람만: 관심 도서·내 도서관이 바뀌면, 그리고 앱을 열 때 한 번 알림 서버에 맞춰 둔다.
let pushTimer = null;
function schedulePushSync(wait) {
  if (!store.settings.get().push) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => import('./push.js').then((m) => m.syncPush()).catch(() => {}), wait);
}
window.addEventListener('chaekitna:change', () => schedulePushSync(1500));
schedulePushSync(4000);

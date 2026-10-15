// 책있나 앱 시작점: 화면 전환(해시 라우터), 설정 적용, 오프라인용 서비스 워커 등록

import * as store from './store.js';
import { applySettings, toast } from './ui.js';
import { IN_APP_NAMES, html, inAppBrowser, isStaleModuleError, toMarkup } from './util.js';
import { QUOTES, pick } from './reading.js';

// ---------- 처음 여는 화면(명언) ----------
// 첫 화면이 그려지면 닫는다. 이번에 처음 열었으면 문장을 읽을 수 있게 1.2초는 보여 준다(누르면 바로 닫힘).
const splash = document.getElementById('splash');
const splashStart = Date.now();
let splashMin = 0;
if (splash) {
  const quote = pick(QUOTES, Math.floor(Math.random() * QUOTES.length));
  document.getElementById('splash-text').textContent = quote.text;
  document.getElementById('splash-by').textContent = `${quote.who} · ${quote.where}`;
  try {
    if (!sessionStorage.getItem('chaekitna:splashed') && !navigator.webdriver) splashMin = 1200;
    sessionStorage.setItem('chaekitna:splashed', '1');
  } catch {
    /* 무시 */
  }
  splash.addEventListener('click', () => hideSplash(true));
}
let splashDone = false;
let splashTimer = null;
function closeSplash() {
  if (!splash || splashDone) return;
  splashDone = true;
  clearTimeout(splashTimer);
  splash.classList.add('is-done');
  setTimeout(() => splash.remove(), 400);
}
function hideSplash(now = false) {
  if (!splash || splashDone) return;
  if (now) return closeSplash();
  if (!splashTimer) splashTimer = setTimeout(closeSplash, Math.max(0, splashMin - (Date.now() - splashStart)));
}
setTimeout(() => hideSplash(true), 4000); // 무슨 일이 있어도 4초 뒤엔 닫는다

const RELOAD_FLAG = 'chaekitna:reloaded';

// 배포 직후처럼 화면 파일 버전이 섞여 불러오지 못하면 한 번만 새로 고친다(계속 반복되지 않게 표시를 남김).
function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

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
    // 화면이 바뀔 때 살짝 떠오르며 나타나게(첫 화면은 로딩 화면이 대신한다)
    main.classList.remove('is-entering');
    if (visits > 1) {
      void main.offsetWidth;
      main.classList.add('is-entering');
    }
    const rendering = view.render({ main, params, query, navigate, signal });
    // 첫 화면은 글자가 그려지는 즉시 로딩 화면을 닫는다(데이터는 화면 안에서 따로 기다린다)
    hideSplash();
    await rendering;
    // 화면이 다 그려지면 본문으로 초점을 옮긴다. 단, 그동안 사용자가 화면 안의 입력칸 등을 눌렀다면 빼앗지 않는다.
    const active = document.activeElement;
    const userIsInView = active && active !== main && main.contains(active);
    if (!signal.aborted && !userIsInView) main.focus({ preventScroll: true });
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* 무시 */
    }
  } catch (error) {
    if (signal.aborted || (error && error.name === 'AbortError')) return;
    if (isStaleModuleError(error) && reloadOnce()) return;
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

// 카카오톡 등 앱 안 브라우저로 열렸으면, 크롬·사파리로 여는 방법을 위에 알려 준다(닫으면 이번에는 다시 안 보임).
const INAPP_HIDDEN = 'chaekitna:inapp-hidden';
function showInAppNotice() {
  const kind = inAppBrowser();
  if (!kind) return;
  try {
    if (sessionStorage.getItem(INAPP_HIDDEN)) return;
  } catch {
    /* 무시 */
  }
  const box = document.createElement('div');
  box.className = 'inapp';
  box.setAttribute('role', 'note');
  box.innerHTML = toMarkup(html`
    <p><strong>${IN_APP_NAMES[kind]} 안에서 열렸어요.</strong> 크롬이나 사파리로 열어야 홈 화면 추가와 아침 알림을 쓸 수 있고, 고른 도서관도 그 브라우저에 저장돼요.</p>
    <p class="small">화면의 ⋮ 또는 ⋯ 메뉴에서 '다른 브라우저로 열기'(아이폰은 'Safari로 열기')를 눌러 주세요.</p>
    <div class="btn-row">
      ${kind === 'kakao' ? html`<button class="btn btn--small btn--primary" type="button" data-open-external>다른 브라우저로 열기</button>` : ''}
      <button class="btn btn--small" type="button" data-hide>닫기</button>
    </div>`);
  document.querySelector('.app').prepend(box);
  box.querySelector('[data-hide]').addEventListener('click', () => {
    try {
      sessionStorage.setItem(INAPP_HIDDEN, '1');
    } catch {
      /* 무시 */
    }
    box.remove();
  });
  // 카카오톡이 지원하는 외부 브라우저 열기 주소(공식 문서는 없지만 널리 쓰이는 방식이라 안내 문구도 함께 둔다)
  box.querySelector('[data-open-external]')?.addEventListener('click', () => {
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
  });
}

applySettings(store.settings.get());
showInAppNotice();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applySettings(store.settings.get()));
store.pruneCache();
window.addEventListener('hashchange', route);
route();

// https(배포)와 localhost(개발·자동 점검)에서만 서비스 워커를 쓴다.
if ('serviceWorker' in navigator && window.isSecureContext) {
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

// 아침 알림(웹 푸시)
// 관심 도서(최근에 담은 10권)가 내 도서관에서 반납돼 빌릴 수 있게 되면, 다음 날 아침 GitHub Actions가 알림을 보낸다.
// 알림을 켜면 프록시에 저장되는 것: 푸시 주소와 키, 내 도서관 코드, 관심 도서 ISBN과 제목. 이름·연락처는 없다.

import { CONFIG } from './config.js';
import * as store from './store.js';
import { isDemoMode, post } from './api.js';
import { urlBase64ToUint8Array } from './util.js';
import * as demo from './demo.js';

export const MAX_ALERT_BOOKS = 10;
// 프록시는 90일 동안 갱신이 없는 구독을 지운다. 앱을 열 때 일주일이 지났으면 다시 알려 준다.
const RESYNC_MS = 7 * 24 * 60 * 60 * 1000;

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// off: 기능 준비 전 · ios-install: 아이폰은 홈 화면 앱에서만 · unsupported · denied: 알림 차단됨
// ready: 켤 수 있음 · on: 켜져 있음
export function pushStatus() {
  if (!CONFIG.vapidPublicKey || isDemoMode()) return 'off';
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApi) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return store.settings.get().push ? 'on' : 'ready';
}

// 프록시에 보낼 내용: 내 도서관 코드와 최근에 담은 관심 도서 10권(예시 도서 제외)
export function alertPayload() {
  const libs = store.myLibraries.list();
  const items = store.watchlist
    .list()
    .filter((b) => !demo.isDemoIsbn(b.isbn13))
    .slice(0, MAX_ALERT_BOOKS)
    .map((b) => ({ isbn: b.isbn13, title: String(b.title || '').slice(0, 40) }));
  return { libs, items };
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

function signature(payload) {
  return JSON.stringify([payload.libs, payload.items.map((it) => it.isbn)]);
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  const payload = alertPayload();
  if (!payload.libs.length) throw new Error('내 도서관을 먼저 골라 주세요.');
  if (!payload.items.length) throw new Error('관심 도서를 먼저 담아 주세요.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림을 허용해야 받을 수 있어요.');
  let sub;
  try {
    // 서비스 워커 준비나 알림 서버(브라우저 회사의 푸시 서비스) 연결이 막히면 오래 기다리지 않고 멈춘다.
    sub = await withTimeout(
      (async () => {
        if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('./sw.js');
        const reg = await navigator.serviceWorker.ready;
        return (
          (await reg.pushManager.getSubscription()) ||
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(CONFIG.vapidPublicKey),
          })
        );
      })(),
      20000,
    );
  } catch {
    // 시크릿 창(크롬은 여기서 알림을 지원하지 않음)이나 알림 서비스 연결 문제
    throw new Error('알림을 켜지 못했어요. 시크릿 창이라면 일반 창에서 다시 해 보세요.');
  }
  await post({ op: 'subscribe', subscription: sub.toJSON(), ...payload });
  store.settings.set({ push: true, pushSig: signature(payload), pushSyncedAt: Date.now(), pushEndpoint: sub.endpoint });
  return payload.items.length;
}

export async function disablePush() {
  store.settings.set({ push: false, pushSig: null, pushSyncedAt: null, pushEndpoint: null });
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await post({ op: 'unsubscribe', subscription: { endpoint: sub.endpoint } }).catch(() => null);
    await sub.unsubscribe();
  } catch {
    /* 이미 해제된 경우 */
  }
}

// 관심 도서나 내 도서관이 바뀌었거나, 마지막으로 알린 지 일주일이 지났으면 프록시에 다시 보낸다.
export async function syncPush({ force = false } = {}) {
  const s = store.settings.get();
  if (!s.push || pushStatus() !== 'on') return 'skip';
  try {
    const sub = await currentSubscription();
    if (!sub) {
      store.settings.set({ push: false });
      return 'lost';
    }
    const payload = alertPayload();
    if (!payload.libs.length || !payload.items.length) {
      if (s.pushSig !== 'empty') {
        await post({ op: 'unsubscribe', subscription: { endpoint: sub.endpoint } });
        store.settings.set({ pushSig: 'empty', pushSyncedAt: Date.now() });
      }
      return 'empty';
    }
    const sig = signature(payload);
    const stale = !s.pushSyncedAt || Date.now() - s.pushSyncedAt > RESYNC_MS;
    if (!force && sig === s.pushSig && sub.endpoint === s.pushEndpoint && !stale) return 'fresh';
    await post({ op: 'subscribe', subscription: sub.toJSON(), ...payload });
    store.settings.set({ pushSig: sig, pushSyncedAt: Date.now(), pushEndpoint: sub.endpoint });
    return 'synced';
  } catch {
    return 'error';
  }
}

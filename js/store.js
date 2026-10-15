// 사용자 폰(브라우저)에만 저장하는 데이터. 서버로 보내지 않는다.
// localStorage를 못 쓰는 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않게 모든 접근을 try로 감싼다.

import { isLibCode } from './util.js';

const PREFIX = 'chaekitna:';
const memory = new Map(); // localStorage가 막혔을 때 임시 저장

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function get(key, fallback = null) {
  const s = storage();
  try {
    const rawValue = s ? s.getItem(PREFIX + key) : memory.get(key) ?? null;
    return rawValue === null || rawValue === undefined ? fallback : JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  const s = storage();
  const text = JSON.stringify(value);
  try {
    if (s) s.setItem(PREFIX + key, text);
    else memory.set(key, text);
    return true;
  } catch {
    // 용량이 꽉 찼으면 캐시를 비우고 한 번 더 시도
    try {
      pruneCache(0);
      if (s) s.setItem(PREFIX + key, text);
      return true;
    } catch {
      memory.set(key, text);
      return false;
    }
  }
}

export function remove(key) {
  const s = storage();
  try {
    if (s) s.removeItem(PREFIX + key);
  } catch {
    /* 무시 */
  }
  memory.delete(key);
}

// 관심 도서·내 도서관 목록이 바뀌면 앱에 알린다(아침 알림 구독을 맞추기 위해).
function notify(key) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('chaekitna:change', { detail: { key } }));
  }
}

// ---------- 만료 시간이 있는 캐시 ----------

const CACHE = 'c:';

export function cacheGet(key, now = Date.now()) {
  const entry = get(CACHE + key);
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.exp !== 'number' || now >= entry.exp) {
    remove(CACHE + key);
    return null;
  }
  return entry.v;
}

export function cacheSet(key, value, expiresAt) {
  return set(CACHE + key, { v: value, exp: expiresAt, at: Date.now() });
}

// 만료된 캐시를 지우고, maxEntries를 넘으면 오래된 것부터 지운다.
export function pruneCache(maxEntries = 400, now = Date.now()) {
  const s = storage();
  if (!s) return 0;
  const entries = [];
  try {
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX + CACHE)) {
        let at = 0;
        let exp = 0;
        try {
          const parsed = JSON.parse(s.getItem(k));
          at = parsed.at || 0;
          exp = parsed.exp || 0;
        } catch {
          /* 깨진 항목은 지운다 */
        }
        entries.push({ k, at, exp });
      }
    }
  } catch {
    return 0;
  }
  let removed = 0;
  const alive = [];
  for (const e of entries) {
    if (!e.exp || now >= e.exp) {
      s.removeItem(e.k);
      removed += 1;
    } else {
      alive.push(e);
    }
  }
  if (alive.length > maxEntries) {
    alive.sort((a, b) => a.at - b.at);
    for (const e of alive.slice(0, alive.length - maxEntries)) {
      s.removeItem(e.k);
      removed += 1;
    }
  }
  return removed;
}

// ---------- 설정 ----------

const SETTINGS_DEFAULT = { size: 'l', theme: 'auto', region: null, onboarded: false };

export const settings = {
  get() {
    return { ...SETTINGS_DEFAULT, ...(get('settings', {}) || {}) };
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    set('settings', next);
    return next;
  },
};

// ---------- 내 도서관 (도서관 코드 목록, 최대 5곳) ----------

export const myLibraries = {
  max: 5,
  list() {
    const value = get('myLibraries', []);
    return Array.isArray(value) ? value.filter((code) => isLibCode(code)).slice(0, this.max) : [];
  },
  has(code) {
    return this.list().includes(code);
  },
  add(code) {
    const list = this.list();
    if (list.includes(code)) return { ok: true, list };
    if (list.length >= this.max) return { ok: false, reason: 'full', list };
    const next = [...list, code];
    set('myLibraries', next);
    notify('myLibraries');
    return { ok: true, list: next };
  },
  remove(code) {
    const next = this.list().filter((c) => c !== code);
    set('myLibraries', next);
    notify('myLibraries');
    return next;
  },
};

// ---------- 관심 도서 ----------

export const watchlist = {
  list() {
    const value = get('watchlist', []);
    return Array.isArray(value) ? value.filter((b) => b && b.isbn13) : [];
  },
  has(isbn13) {
    return this.list().some((b) => b.isbn13 === isbn13);
  },
  add(book) {
    if (!book || !book.isbn13) return this.list();
    const list = this.list().filter((b) => b.isbn13 !== book.isbn13);
    const entry = {
      isbn13: book.isbn13,
      title: book.title || '',
      authors: book.authors || '',
      cover: book.cover || '',
      addedAt: Date.now(),
      last: null, // 마지막으로 본 도서관별 상태 { code: status }
    };
    const next = [entry, ...list].slice(0, 100);
    set('watchlist', next);
    notify('watchlist');
    return next;
  },
  remove(isbn13) {
    const next = this.list().filter((b) => b.isbn13 !== isbn13);
    set('watchlist', next);
    notify('watchlist');
    return next;
  },
  update(isbn13, patch) {
    const next = this.list().map((b) => (b.isbn13 === isbn13 ? { ...b, ...patch } : b));
    set('watchlist', next);
    return next;
  },
};

// ---------- 최근 검색어 ----------

export const recentSearches = {
  list() {
    const value = get('recent', []);
    return Array.isArray(value) ? value.filter((q) => typeof q === 'string').slice(0, 8) : [];
  },
  add(query) {
    const q = String(query || '').trim();
    if (!q) return this.list();
    const next = [q, ...this.list().filter((x) => x !== q)].slice(0, 8);
    set('recent', next);
    return next;
  },
  clear() {
    set('recent', []);
  },
};

export function clearAll() {
  const s = storage();
  if (!s) return;
  const keys = [];
  for (let i = 0; i < s.length; i += 1) {
    const k = s.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => s.removeItem(k));
  memory.clear();
}

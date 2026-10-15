// 데이터 조회. 프록시(Google Apps Script)를 거쳐 도서관 정보나루를 부른다.
// 프록시 주소가 없으면 예시 데이터를 돌려준다(데모 모드).
// 같은 조회를 반복하지 않도록 결과를 폰에 캐시한다: 하루 호출 한도를 아끼기 위해서다.

import { CONFIG } from './config.js';
import * as store from './store.js';
import { apiError, parseBookDetail, parseBooks, parseExist, parseLibraries } from './parse.js';
import { isLibCode, nextKstHour } from './util.js';
import * as demo from './demo.js';
import { librariesInRegion, loadLibraries } from './libraries.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function isDemoMode() {
  return !CONFIG.proxyUrl;
}

async function call(op, params = {}, { signal } = {}) {
  const url = new URL(CONFIG.proxyUrl);
  url.searchParams.set('op', op);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return send(url.href, { signal, redirect: 'follow' });
}

// 알림 구독처럼 내용을 보내는 요청. 브라우저의 사전 확인 요청(CORS preflight)이 생기지 않게 text/plain으로 보낸다.
export async function post(body, { signal } = {}) {
  if (isDemoMode()) throw new ApiError('demo', '예시 데이터 모드에서는 쓸 수 없어요.');
  return send(CONFIG.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
    signal,
  });
}

async function send(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new ApiError('network', '인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) throw new ApiError('http', `서버가 응답하지 않아요 (${res.status}).`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('format', '응답을 읽지 못했어요.');
  }
  if (data && typeof data.error === 'string') {
    if (data.error === 'budget') {
      throw new ApiError('budget', '오늘 조회 한도를 다 썼어요. 도서관 홈페이지에서 확인해 주세요.');
    }
    throw new ApiError(data.error, data.message || '조회 중 문제가 생겼어요.');
  }
  const upstream = apiError(data);
  if (upstream) throw new ApiError('upstream', '도서관 정보나루가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.');
  return data;
}

// ---------- 책 검색 ----------

export async function searchBooks(query, { page = 1, sort = 'loan', signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return { total: 0, books: [] };
  if (isDemoMode()) return { ...demo.searchBooks(q), demo: true };
  const key = `s:${sort}:${page}:${q}`;
  const cached = store.cacheGet(key);
  if (cached) return cached;
  const data = await call('search', { q, page, sort }, { signal });
  const result = parseBooks(data);
  store.cacheSet(key, result, Date.now() + 12 * HOUR);
  return result;
}

// ---------- 책 한 권 정보 ----------

export async function bookDetail(isbn13, { signal } = {}) {
  if (demo.isDemoIsbn(isbn13) || isDemoMode()) return demo.bookByIsbn(isbn13);
  const key = `d:${isbn13}`;
  const cached = store.cacheGet(key);
  if (cached) return cached;
  const data = await call('detail', { isbn: isbn13 }, { signal });
  const book = parseBookDetail(data);
  if (book) store.cacheSet(key, book, Date.now() + 7 * DAY);
  return book;
}

// ---------- 시·도 안에서 이 책을 가진 도서관 ----------

export async function holdings(isbn13, region, { signal } = {}) {
  if (demo.isDemoIsbn(isbn13)) {
    await loadLibraries();
    return { codes: demo.holdingsFor(isbn13, librariesInRegion(region)), demo: true };
  }
  if (isDemoMode()) return { codes: [], demo: true, unavailable: true };
  const key = `h:${region}:${isbn13}`;
  const cached = store.cacheGet(key);
  if (cached) return cached;
  const data = await call('holdings', { isbn: isbn13, region }, { signal });
  const { libraries } = parseLibraries(data);
  const result = { codes: libraries.map((lib) => lib.code), libraries };
  store.cacheSet(key, result, Date.now() + 3 * DAY);
  return result;
}

// ---------- 도서관별 소장·대출가능 (전날 기준) ----------

// codes: 도서관 코드 목록. 돌려주는 값: { [code]: { hasBook, loanAvailable } }
export async function availability(isbn13, codes, { signal, force = false } = {}) {
  const unique = [...new Set(codes)].filter((code) => isLibCode(code)).slice(0, 10);
  const result = {};
  const missing = [];
  for (const code of unique) {
    const cached = force ? null : store.cacheGet(`e:${code}:${isbn13}`);
    if (cached) result[code] = cached;
    else missing.push(code);
  }
  if (!missing.length) return result;

  if (demo.isDemoIsbn(isbn13)) {
    for (const code of missing) result[code] = { ...demo.existFor(isbn13, code), demo: true };
    return result;
  }
  if (isDemoMode()) {
    // 실제 ISBN에는 가짜 상태를 만들지 않는다.
    for (const code of missing) result[code] = { hasBook: null, loanAvailable: null, demo: true };
    return result;
  }

  // 프록시는 한 번에 최대 5곳까지 받는다.
  const expiresAt = Math.max(nextKstHour(new Date(), 9), Date.now() + HOUR);
  let budgetHit = false;
  for (let i = 0; i < missing.length; i += 5) {
    const batch = missing.slice(i, i + 5);
    const data = await call('exist', { isbn: isbn13, libs: batch.join(',') }, { signal });
    if (data && data.budget) budgetHit = true;
    const results = data && typeof data.results === 'object' && data.results ? data.results : {};
    for (const code of batch) {
      const entry = results[code];
      if (!entry || entry.error) {
        result[code] = { hasBook: null, loanAvailable: null };
        continue;
      }
      const parsed = parseExist(entry);
      result[code] = parsed;
      store.cacheSet(`e:${code}:${isbn13}`, parsed, expiresAt);
    }
  }
  // 오늘 한도를 다 써서 일부만 확인한 경우 화면에서 알려줄 수 있게 표시한다(목록에는 안 보이는 속성).
  if (budgetHit) Object.defineProperty(result, 'budget', { value: true });
  return result;
}

// ---------- 이번 주 인기 도서 (GitHub Actions가 만든 정적 파일) ----------

export async function popularBooks() {
  try {
    const res = await fetch(new URL('../data/popular.json', import.meta.url));
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    if (!json || !Array.isArray(json.items) || !json.items.length) return demo.popular();
    return json;
  } catch {
    return demo.popular();
  }
}

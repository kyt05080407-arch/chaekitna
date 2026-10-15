import test from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 localStorage 흉내
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}
globalThis.localStorage = new MemoryStorage();

const store = await import('../js/store.js');

test('내 도서관은 최대 5곳, 중복 없이', () => {
  store.clearAll();
  for (const code of ['111111', '222222', '333333', '444444', '555555']) assert.equal(store.myLibraries.add(code).ok, true);
  assert.deepEqual(store.myLibraries.add('666666'), { ok: false, reason: 'full', list: store.myLibraries.list() });
  assert.equal(store.myLibraries.add('111111').ok, true);
  assert.equal(store.myLibraries.list().length, 5);
  store.myLibraries.remove('333333');
  assert.deepEqual(store.myLibraries.list(), ['111111', '222222', '444444', '555555']);
});

test('관심 도서 담기·빼기·상태 저장', () => {
  store.clearAll();
  store.watchlist.add({ isbn13: '9788971998557', title: '역사의 역사' });
  store.watchlist.add({ isbn13: '9788937460449', title: '데미안' });
  assert.equal(store.watchlist.list()[0].title, '데미안');
  assert.equal(store.watchlist.has('9788971998557'), true);
  store.watchlist.update('9788971998557', { last: { 111111: 'available' } });
  assert.deepEqual(store.watchlist.list().find((b) => b.isbn13 === '9788971998557').last, { 111111: 'available' });
  store.watchlist.remove('9788971998557');
  assert.equal(store.watchlist.has('9788971998557'), false);
});

test('캐시는 만료되면 사라진다', () => {
  store.clearAll();
  const now = Date.now();
  store.cacheSet('k', { a: 1 }, now + 1000);
  assert.deepEqual(store.cacheGet('k', now), { a: 1 });
  assert.equal(store.cacheGet('k', now + 2000), null);
});

test('캐시 정리: 만료된 것과 넘치는 것', () => {
  store.clearAll();
  const now = Date.now();
  store.cacheSet('old', 1, now - 1);
  for (let i = 0; i < 5; i += 1) store.cacheSet(`k${i}`, i, now + 60000);
  const removed = store.pruneCache(3, now);
  assert.equal(removed, 3); // 만료 1 + 넘침 2
});

test('최근 검색어는 중복 없이 최신이 앞', () => {
  store.clearAll();
  store.recentSearches.add('데미안');
  store.recentSearches.add('어린 왕자');
  store.recentSearches.add('데미안');
  assert.deepEqual(store.recentSearches.list(), ['데미안', '어린 왕자']);
});

test('설정 기본값과 저장', () => {
  store.clearAll();
  assert.equal(store.settings.get().size, 'l');
  store.settings.set({ size: 'xl' });
  assert.equal(store.settings.get().size, 'xl');
  assert.equal(store.settings.get().theme, 'auto');
});

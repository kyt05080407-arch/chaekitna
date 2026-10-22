import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKSEA_APPLY, bookstoreLinks, nextStepsView, situation, stepOrder } from '../js/nextsteps.js';
import { toMarkup } from '../js/util.js';

test('상황 판단', () => {
  assert.equal(situation({ a: 'available', b: 'none' }), 'available');
  assert.equal(situation({ a: 'loaned', b: 'none' }), 'loaned');
  assert.equal(situation({ a: 'none', b: 'none' }), 'none');
  assert.equal(situation({ a: 'unknown', b: 'none' }), 'unknown');
  assert.equal(situation({}), 'unknown');
  assert.equal(situation(null), 'unknown');
});

test('상황별 방법 순서', () => {
  assert.deepEqual(stepOrder('loaned'), ['alert', 'reserve', 'wide', 'booksea', 'buy']);
  assert.deepEqual(stepOrder('none'), ['wide', 'booksea', 'request', 'buy']);
  assert.deepEqual(stepOrder('available'), []);
});

test('대출 중: 알림 → 예약 → 다른 도서관 → 책바다 → 사기, 번호가 차례로 붙는다', () => {
  const out = toMarkup(nextStepsView({ kind: 'loaned', isbn: '9788937460449', watched: false, reserveLink: '', requestLink: '' }));
  const titles = [...out.matchAll(/<span class="next__title">.*?<\/svg>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['반납되면 알림 받기', '도서관 홈페이지에서 예약하기', '같은 시·도 다른 도서관', '책바다로 다른 지역 책 받기', '사서 읽기']);
  assert.deepEqual([...out.matchAll(/class="next__n" aria-hidden="true">(\d)</g)].map((m) => m[1]), ['1', '2', '3', '4', '5']);
  assert.match(out, /지금은 모두 대출 중이에요/);
  assert.match(out, /data-next="watch"/);
  assert.ok(out.includes(`href="${BOOKSEA_APPLY}"`));
  assert.match(out, /data-copy-title="9788937460449"/);
  assert.match(out, /이용료 5,800원/);
});

test('없음: 다른 도서관 → 책바다 → 희망도서 → 사기, 담겨 있으면 알림 단계 없음', () => {
  const out = toMarkup(nextStepsView({ kind: 'none', isbn: '9788937460449', watched: true, reserveLink: '', requestLink: '' }));
  assert.match(out, /내 도서관에는 없어요/);
  assert.doesNotMatch(out, /반납되면 알림 받기/);
  assert.match(out, /희망도서로 신청하기/);
  assert.equal(toMarkup(nextStepsView({ kind: 'available', isbn: '1' })), '');
});

test('서점 검색 주소는 ISBN으로', () => {
  const links = bookstoreLinks('9788937460449');
  assert.deepEqual(links.map((l) => l.name), ['교보문고', '알라딘']);
  assert.ok(links.every((l) => l.href.startsWith('https://') && l.href.endsWith('9788937460449')));
});

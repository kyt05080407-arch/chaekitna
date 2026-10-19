import test from 'node:test';
import assert from 'node:assert/strict';
import { todayPlan, uncheckedCount } from '../js/today.js';

const LIBS = { A: { name: '가 도서관', closed: '월요일' }, B: { name: '나 도서관', closed: '' }, C: { name: '다 도서관', closed: '화요일' } };
const get = (code) => LIBS[code];
const books = [
  { isbn13: '1', title: '데미안', last: { A: 'available', B: 'available', C: 'available' } },
  { isbn13: '2', title: '모순', last: { A: 'available', B: 'loaned', C: 'available' } },
  { isbn13: '3', title: '혼모노', last: { A: 'none', B: 'loaned', C: 'available' } },
  { isbn13: '4', title: '아직 확인 전' },
];

test('오늘 어디 갈까: 문 여는 곳 먼저, 빌릴 수 있는 책 많은 순', () => {
  const plan = todayPlan(books, ['A', 'B', 'C'], get, (closed) => closed === '화요일');
  assert.deepEqual(plan.map((p) => [p.code, p.available.length, p.closed]), [
    ['A', 2, false],
    ['B', 1, false],
    ['C', 3, true],
  ]);
  assert.deepEqual(plan[0].available.map((b) => b.title), ['데미안', '모순']);
});

test('같은 권수면 내 도서관 순서대로, 정보 없는 도서관도 이름을 붙인다', () => {
  const plan = todayPlan([{ isbn13: '1', title: '책', last: { X: 'available', Y: 'available' } }], ['Y', 'X'], () => null, () => false);
  assert.deepEqual(plan.map((p) => p.code), ['Y', 'X']);
  assert.equal(plan[0].name, '도서관 Y');
});

test('아직 확인하지 않은 관심 도서 수', () => {
  assert.equal(uncheckedCount(books, ['A']), 1);
  assert.equal(uncheckedCount(books, ['Z']), 4);
});

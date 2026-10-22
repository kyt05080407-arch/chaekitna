// 탭 화면을 옆으로 밀어 넘기기
import test from 'node:test';
import assert from 'node:assert/strict';
import { TAB_ORDER, swipeTarget } from '../js/swipe.js';

const base = { dy: 5, ms: 250, startX: 200, width: 390 };

test('탭 순서는 아래 탭 막대와 같다: 홈 → 책장 → 관심 도서 → 내 도서관 → 설정', () => {
  assert.deepEqual(TAB_ORDER, ['/', '/shelves', '/watchlist', '/libraries', '/settings']);
});

test('왼쪽으로 밀면 다음 탭, 오른쪽으로 밀면 이전 탭', () => {
  assert.deepEqual(swipeTarget({ ...base, path: '/shelves', dx: -120 }), { hash: '#/watchlist', dir: 'next' });
  assert.deepEqual(swipeTarget({ ...base, path: '/watchlist', dx: 120 }), { hash: '#/shelves', dir: 'prev' });
  assert.deepEqual(swipeTarget({ ...base, path: '/', dx: -120 }), { hash: '#/shelves', dir: 'next' });
  assert.deepEqual(swipeTarget({ ...base, path: '/shelves', dx: 120 }), { hash: '#/', dir: 'prev' });
});

test('끝 탭에서 더 밀거나, 안쪽 화면이면 넘기지 않는다', () => {
  assert.equal(swipeTarget({ ...base, path: '/', dx: 120 }), null);
  assert.equal(swipeTarget({ ...base, path: '/settings', dx: -120 }), null);
  assert.equal(swipeTarget({ ...base, path: '/book/9788937460449', dx: -120 }), null);
  assert.equal(swipeTarget({ ...base, path: '/list/star-rm', dx: -120 }), null);
});

test('짧게, 비스듬히, 천천히, 가장자리에서 민 건 넘기기가 아니다', () => {
  assert.equal(swipeTarget({ ...base, path: '/shelves', dx: -40 }), null, '짧음');
  assert.equal(swipeTarget({ ...base, path: '/shelves', dx: -120, dy: 90 }), null, '위아래 스크롤에 가까움');
  assert.equal(swipeTarget({ ...base, path: '/shelves', dx: -120, ms: 1500 }), null, '천천히 끎');
  assert.equal(swipeTarget({ ...base, path: '/shelves', dx: 120, startX: 10 }), null, '왼쪽 가장자리(아이폰 뒤로 가기)');
  assert.equal(swipeTarget({ ...base, path: '/shelves', dx: -120, startX: 385 }), null, '오른쪽 가장자리');
});

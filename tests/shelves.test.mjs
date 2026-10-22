// 책장(학과별·사람별 추천 도서): 원본 자료 점검, 목록 만들기, 화면 계산
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KIND_LABEL, alsoOn, dailyPick, hueOf, initialOf, isShelf, majorShelves, starShelves, topLoaned } from '../js/lists.js';
import { resolveList } from '../scripts/lib/lists.mjs';
import { buildShelves, keysOf, subjectJosa } from '../scripts/shelves.mjs';

const shelves = buildShelves();

test('책장 원본: 학과별 13개·사람 30명 넘게, 번호는 1부터, id는 겹치지 않음', () => {
  const majors = shelves.filter((l) => l.group === 'major');
  const stars = shelves.filter((l) => l.group === 'star');
  assert.ok(majors.length >= 13, `학과별 ${majors.length}개`);
  assert.ok(stars.length >= 30, `사람별 ${stars.length}명`);
  assert.equal(new Set(shelves.map((l) => l.id)).size, shelves.length);
  for (const l of shelves) {
    assert.match(l.id, /^(major|star)-[\w-]{1,24}$/, l.id);
    assert.deepEqual(
      l.books.map((b) => b.no),
      Array.from({ length: l.books.length }, (_, i) => i + 1),
      l.id,
    );
  }
});

test('책장 원본: 책마다 출처(https 주소)와 "왜 이 책?"이 있고, 학과별 책장은 탐구 연결 아이디어까지', () => {
  for (const l of shelves) {
    for (const b of l.books) {
      const src = l.sources[b.src];
      assert.ok(src && src.name, `${l.id} ${b.title}: 출처 이름`);
      assert.match(src.url, /^https:\/\//, `${l.id} ${b.title}: 출처 주소`);
      assert.ok(b.from && b.from.length >= 8, `${l.id} ${b.title}: 왜 이 책?`);
      assert.ok(b.title && b.queries.length && Array.isArray(b.authorKeys), `${l.id} ${b.title}: 찾는 방법`);
      if (l.group === 'major') {
        assert.ok(b.note && b.note.length >= 30 && b.note.length <= 140, `${l.id} ${b.title}: 탐구 연결 아이디어 길이 ${b.note && b.note.length}`);
      }
    }
    // 쓰지 않는 출처는 붙이지 않는다
    for (const id of Object.keys(l.sources)) assert.ok(l.books.some((b) => b.src === id), `${l.id}: 안 쓰는 출처 ${id}`);
  }
});

test('책장 원본: 학과별 책장의 분야 칩은 책마다 있고, 사람은 분야 이름이 있다', () => {
  for (const l of shelves.filter((x) => x.fields)) {
    const ids = new Set(l.fields.map((f) => f.id));
    assert.ok(l.books.every((b) => ids.has(b.field)), l.id);
  }
  for (const l of shelves.filter((x) => x.group === 'star')) {
    assert.ok(KIND_LABEL[l.person.kind], `${l.id} 분야`);
    assert.ok(l.person.name && l.person.team, l.id);
    assert.equal(l.title, `${l.person.name}의 책장`);
  }
  // 메디컬 책장은 의예·약학·간호·수의를 모두 갖춘다
  const med = shelves.find((l) => l.id === 'major-med');
  for (const f of ['med', 'pharm', 'nurse', 'vet']) assert.ok(med.books.filter((b) => b.field === f).length >= 3, f);
});

test('저장소의 lists-src.json은 scripts/shelves.mjs와 같다(고치고 다시 만들지 않은 경우를 잡는다)', async () => {
  const src = JSON.parse(await readFile(new URL('../data/lists-src.json', import.meta.url), 'utf8'));
  const inFile = src.lists.filter((l) => l.group === 'major' || l.group === 'star');
  assert.deepEqual(inFile, JSON.parse(JSON.stringify(shelves)));
  // 서울대 권장도서는 그대로 맨 앞
  assert.equal(src.lists[0].id, 'snu100');
});

test('저자 열쇠·이름 뒤 조사', () => {
  assert.deepEqual(keysOf('레이첼 카슨'), ['카슨']);
  assert.deepEqual(keysOf('김승섭'), ['김승섭']);
  assert.deepEqual(keysOf('리처드 탈러, 캐스 선스타인'), ['탈러']);
  assert.deepEqual(keysOf('N.H. 클라인바움'), ['클라인바움']);
  assert.deepEqual(keysOf(''), []);
  assert.equal(subjectJosa('아이유'), '가');
  assert.equal(subjectJosa('장원영'), '이');
  assert.equal(subjectJosa('RM'), '이');
  assert.equal(subjectJosa('빌 게이츠'), '가');
});

test('목록 만들기: 다른 목록에서 이미 찾은 책은 다시 찾지 않고, 화면에 쓸 칸을 넘기고, 한도로 못 찾은 책은 준비 중', async () => {
  const calls = [];
  const search = async (params) => {
    calls.push(params);
    return [{ title: '데미안', authors: '헤르만 헤세', isbn13: '9788937460449', loanCount: 1234 }];
  };
  const book = { no: 1, title: '데미안', author: '헤르만 헤세', queries: ['데미안'], authorKeys: ['헤세'], src: 'x', from: '왜', note: '연결' };
  const shared = new Map();
  const a = await resolveList({ id: 'star-a', books: [book] }, new Map(), search, { budget: { left: 9 }, shared });
  const b = await resolveList({ id: 'star-b', books: [{ ...book, from: '다른 이유' }] }, new Map(), search, { budget: { left: 9 }, shared });
  assert.equal(calls.length, 1, '두 번째 목록은 검색하지 않는다');
  assert.equal(b.stats.reused, 1);
  assert.equal(a.list.books[0].match.loanCount, 1234);
  assert.equal(b.list.books[0].from, '다른 이유');
  assert.equal(a.list.books[0].src, 'x');
  assert.equal(a.list.books[0].note, '연결');
  assert.equal(a.list.books[0].queries, undefined, '찾는 방법은 화면에 넘기지 않는다');
  const waiting = await resolveList({ id: 'c', books: [{ ...book, queries: ['아몬드'] }] }, new Map(), search, { budget: { left: 0 } });
  assert.equal(waiting.list.books[0].waiting, true);
});

// 화면 계산용 시험 목록
const m = (isbn13, loanCount, cover = 'https://example.com/c.jpg') => ({ isbn13, title: isbn13, authors: '', cover, ...(loanCount ? { loanCount } : {}) });
const LISTS = [
  { id: 'snu100', books: [{ no: 1, match: m('9780000000009', 99999) }] },
  { id: 'star-rm', group: 'star', person: { name: 'RM', team: '방탄소년단', kind: 'idol' }, books: [{ no: 1, match: m('9780000000001', 500) }, { no: 2, match: m('9780000000002', 900) }] },
  { id: 'star-narin', group: 'star', person: { name: '나린', team: '미야오', kind: 'idol' }, books: [{ no: 1, match: m('9780000000001', 500) }, { no: 2, match: m('9780000000003') }] },
  { id: 'major-hum', group: 'major', short: '인문·어문', books: [{ no: 1, match: m('9780000000001', 500) }, { no: 2, title: '못 찾은 책' }] },
];

test('책장 고르기·이름 동그라미', () => {
  assert.deepEqual(starShelves(LISTS).map((l) => l.id), ['star-rm', 'star-narin']);
  assert.deepEqual(majorShelves(LISTS).map((l) => l.id), ['major-hum']);
  assert.ok(isShelf(LISTS[1]) && !isShelf(LISTS[0]));
  assert.equal(initialOf('RM'), 'RM');
  assert.equal(initialOf('아이유'), '아');
  assert.equal(initialOf('빌 게이츠'), '빌');
  assert.equal(hueOf('RM'), hueOf('RM'));
  assert.ok(hueOf('RM') >= 0 && hueOf('RM') < 360);
});

test('오늘의 한 권: 같은 날에는 같은 책, 날이 바뀌면 다음 책, 서울대 권장도서는 빼고', () => {
  const d1 = dailyPick(LISTS, new Date(2026, 9, 22));
  const again = dailyPick(LISTS, new Date(2026, 9, 22, 23, 59));
  const d2 = dailyPick(LISTS, new Date(2026, 9, 23));
  assert.equal(d1.book, again.book);
  assert.notEqual(d1.book, d2.book);
  for (let day = 1; day <= 10; day += 1) assert.notEqual(dailyPick(LISTS, new Date(2026, 9, day)).list.id, 'snu100');
  assert.equal(dailyPick([LISTS[0]]), null);
});

test('도서관에서 많이 빌린 추천 책: 사람별 책장만, 같은 책은 한 번(추천한 사람을 모아서), 대출 건수 없는 책은 빼고', () => {
  const top = topLoaned(LISTS, 5);
  assert.deepEqual(top.map((t) => t.book.match.isbn13), ['9780000000002', '9780000000001']);
  assert.deepEqual(top[1].people.map((p) => p.name), ['RM', '나린']);
  assert.equal(top[0].loanCount, 900);
});

test('이 책은 다른 책장에도 있어요', () => {
  assert.deepEqual(alsoOn(LISTS, '9780000000001', 'star-rm').map((a) => a.name), ['나린', '인문·어문']);
  assert.deepEqual(alsoOn(LISTS, '', 'star-rm'), []);
});

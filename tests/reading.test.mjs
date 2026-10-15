import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QUOTES, TIPS, nextReading, weeklyNote } from '../js/reading.js';
import { eventWhen, upcomingEvents } from '../js/events.js';

test('명언과 정보: 모두 출처나 제목이 있고 짧다', () => {
  for (const q of QUOTES) {
    assert.ok(q.text && q.who && q.where, q.text);
    assert.ok(q.text.length <= 60, `너무 긴 명언: ${q.text}`);
  }
  for (const t of TIPS) assert.ok(t.title && t.text.length <= 80, t.title);
});

test('이번 주 1위 소식은 실제 데이터일 때만', () => {
  assert.equal(weeklyNote({ demo: true, items: [{ title: 'x' }] }), null);
  const note = weeklyNote({ regionName: '경북', ageName: '고등학생', items: [{ title: '데미안', loanCount: 1234, isbn13: '9788937460449' }] });
  assert.equal(note.text, '이번 주 경북 고등학생이 가장 많이 빌린 책은 『데미안』, 1,234번 빌렸어요.');
  assert.equal(weeklyNote({ regionName: '서울', ageName: '20대', items: [{ title: '책' }] }).text, '이번 주 서울 20대가 가장 많이 빌린 책은 『책』이에요.');
});

test('읽을거리를 번갈아 고른다', () => {
  const kinds = new Set(Array.from({ length: 8 }, () => nextReading({ regionName: '경북', ageName: '고등학생', items: [{ title: '데미안' }] }).kind));
  assert.deepEqual([...kinds].sort(), ['quote', 'tip', 'weekly']);
});

test('강연 소식: 지난 행사는 빼고 내 지역 먼저, 날짜 순', async () => {
  const items = [
    { title: 'A', start: '2026-10-29T19:00:00+09:00', region: '32', url: 'https://x.kr/a' },
    { title: 'B', start: '2026-10-23T19:00:00+09:00', region: '11', url: 'https://x.kr/b' },
    { title: '지난', start: '2026-10-01T19:00:00+09:00', region: '37', url: 'https://x.kr/c' },
    { title: '주소 없음', start: '2026-11-01T19:00:00+09:00', region: '37', url: '' },
    { title: 'C', start: '2026-11-02T14:00:00+09:00', region: '37', url: 'https://x.kr/d' },
  ];
  const now = new Date('2026-10-15T22:00:00+09:00');
  assert.deepEqual(upcomingEvents(items, { now }).map((e) => e.title), ['B', 'A', 'C']);
  assert.deepEqual(upcomingEvents(items, { now, region: '37' }).map((e) => e.title), ['C', 'B', 'A']);
  assert.equal(eventWhen('2026-10-23T19:00:00+09:00'), '10월 23일(금) 저녁 7시');
  assert.equal(eventWhen('2026-10-31T14:00:00+09:00'), '10월 31일(토) 오후 2시');
  assert.equal(eventWhen('2026-10-17T13:30:00+09:00'), '10월 17일(토) 오후 1시 30분');
});

test('data/events.json: 모든 행사에 공식 출처 주소와 날짜가 있다', async () => {
  const data = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
  assert.ok(data.items.length >= 1);
  for (const e of data.items) {
    assert.match(e.url, /^https:\/\//);
    assert.ok(e.source && e.people && e.place && e.area, e.title);
    assert.ok(!Number.isNaN(new Date(e.start).getTime()), e.title);
  }
});

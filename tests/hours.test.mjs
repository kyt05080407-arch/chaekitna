// 휴관일 글 읽기: 정기 휴관(매주·매월 n째 요일)만 판단한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closedToday, parseRegularClosures } from '../js/hours.js';

// 한국 시간 정오 기준 날짜
const kst = (ymd) => new Date(`${ymd}T12:00:00+09:00`);

test('매주 휴관 요일 읽기', () => {
  assert.deepEqual(parseRegularClosures('매주 월요일 / 법정공휴일').weekly, [1]);
  assert.deepEqual(parseRegularClosures('매주 토요일, 일요일 / 관공서 공휴일').weekly, [0, 6]);
  assert.deepEqual(parseRegularClosures('매주 월요일 / 일요일을 제외한 법정공휴일').weekly, [1], '슬래시 뒤의 일요일은 정기 휴관이 아님');
  assert.deepEqual(parseRegularClosures('매주 월요일(단, 일요일과 공휴일이 겹치면 휴관)').weekly, [1], '괄호 속 예외는 무시');
  assert.deepEqual(parseRegularClosures('법정공휴일(일요일 포함)').weekly, [], '매주가 없으면 판단하지 않음');
});

test('매월 n째 요일 읽기', () => {
  assert.deepEqual(parseRegularClosures('매월 둘째주, 넷째주 월요일 / 법정공휴일').monthly, [{ nth: [2, 4], weekday: 1 }]);
  assert.deepEqual(parseRegularClosures('매월 첫 번째, 세 번째 월요일').monthly, [{ nth: [1, 3], weekday: 1 }]);
  assert.deepEqual(parseRegularClosures('매월 첫번째, 세번째 월요일 / 법정·임시공휴일').monthly, [{ nth: [1, 3], weekday: 1 }]);
  assert.deepEqual(parseRegularClosures('매월 두 번째, 네 번째 월요일').monthly, [{ nth: [2, 4], weekday: 1 }]);
  assert.deepEqual(parseRegularClosures('매월 마지막 주 수요일').monthly, [{ nth: ['last'], weekday: 3 }]);
});

test('오늘 정기 휴관인지', () => {
  // 2026-10-12는 월요일(둘째 월요일), 2026-10-05는 첫째 월요일, 2026-10-26은 넷째(마지막) 월요일
  assert.equal(closedToday('매주 월요일 / 법정공휴일', kst('2026-10-12')), true);
  assert.equal(closedToday('매주 월요일 / 법정공휴일', kst('2026-10-13')), false);
  assert.equal(closedToday('매월 첫째주, 셋째주 월요일', kst('2026-10-05')), true);
  assert.equal(closedToday('매월 첫째주, 셋째주 월요일', kst('2026-10-12')), false);
  assert.equal(closedToday('매월 둘째주, 넷째주 월요일', kst('2026-10-26')), true);
  assert.equal(closedToday('매월 마지막 주 월요일', kst('2026-10-26')), true);
  assert.equal(closedToday('매월 마지막 주 월요일', kst('2026-10-19')), false);
  assert.equal(closedToday('', kst('2026-10-12')), false);
  // 한국 시간으로 날짜를 본다: 2026-10-11 23:30 UTC = 10월 12일(월) 08:30 KST
  assert.equal(closedToday('매주 월요일', new Date('2026-10-11T23:30:00Z')), true);
});

test('실제 도서관 목록의 휴관일 글을 모두 읽어도 오류가 없고, 대부분 정기 휴관을 찾는다', async () => {
  const { libraries } = JSON.parse(await readFile(new URL('../data/libraries.json', import.meta.url), 'utf8'));
  const texts = libraries.map((l) => l.closed).filter(Boolean);
  let parsed = 0;
  for (const text of texts) {
    const r = parseRegularClosures(text);
    if (r.weekly.length || r.monthly.length) parsed += 1;
    for (const d of r.weekly) assert.ok(d >= 0 && d <= 6);
    for (const m of r.monthly) assert.ok(m.nth.every((n) => n === 'last' || (n >= 1 && n <= 5)));
  }
  assert.ok(parsed / texts.length > 0.8, `정기 휴관을 찾은 비율 ${Math.round((parsed / texts.length) * 100)}%`);
});

// 도서관 휴관일 글(정보나루 closed 항목)에서 '정기 휴관'만 읽어 오늘 쉬는 날인지 알려 준다.
// 예: "매주 월요일 / 법정공휴일", "매월 둘째주, 넷째주 월요일", "매월 첫 번째, 세 번째 월요일"
// 공휴일·임시 휴관은 날짜를 알 수 없어 판단하지 않는다(그래서 '아니다'라고 말하지 않고 '모름'으로 둔다).

import { kstParts } from './util.js';

const WEEKDAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const ORDINAL = { 첫: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5 };

// → { weekly: [요일번호…], monthly: [{ nth: [1,3] 또는 ['last'], weekday }] }
export function parseRegularClosures(text) {
  const weekly = new Set();
  const monthly = [];
  const segments = String(text || '')
    .replace(/\([^)]*\)/g, ' ') // 괄호 속 설명(예외 조항)은 빼고 읽는다
    .split(/[/\n]/);
  for (const raw of segments) {
    const segment = raw.trim();
    const week = segment.match(/매주\s*([월화수목금토일]요일(?:\s*[,·및와과]\s*[월화수목금토일]요일)*)/);
    if (week) {
      for (const m of week[1].matchAll(/([월화수목금토일])요일/g)) weekly.add(WEEKDAY[m[1]]);
    }
    const month = segment.match(
      /매월\s*((?:(?:첫|둘|두|셋|세|넷|네|다섯)\s*(?:번)?\s*째\s*(?:주)?|마지막\s*(?:주)?)(?:\s*[,·및]\s*(?:(?:첫|둘|두|셋|세|넷|네|다섯)\s*(?:번)?\s*째\s*(?:주)?|마지막\s*(?:주)?))*)\s*([월화수목금토일])요일/,
    );
    if (month) {
      const nth = [];
      for (const m of month[1].matchAll(/(첫|둘|두|셋|세|넷|네|다섯|마지막)/g)) nth.push(m[1] === '마지막' ? 'last' : ORDINAL[m[1]]);
      if (nth.length) monthly.push({ nth, weekday: WEEKDAY[month[2]] });
    }
  }
  return { weekly: [...weekly].sort(), monthly };
}

// 오늘(한국 시간) 정기 휴관일이면 true, 아니면 false(공휴일 휴관 여부는 모름)
export function closedToday(text, now = new Date()) {
  const { y: year, m: month, d: day } = kstParts(now);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const { weekly, monthly } = parseRegularClosures(text);
  if (weekly.includes(weekday)) return true;
  const nth = Math.ceil(day / 7);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isLast = day + 7 > daysInMonth;
  return monthly.some((rule) => rule.weekday === weekday && (rule.nth.includes(nth) || (isLast && rule.nth.includes('last'))));
}

// 작가 강연 소식(data/events.json): 지난 행사는 빼고, 내 지역 행사를 먼저, 날짜가 가까운 순서로
import { kstParts, safeHttpUrl } from './util.js';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function upcomingEvents(items, { now = new Date(), region = '' } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((e) => e && e.title && e.start && safeHttpUrl(e.url) && new Date(e.start).getTime() > now.getTime())
    .sort((a, b) => (b.region === region) - (a.region === region) || new Date(a.start) - new Date(b.start));
}

// "10월 23일(금) 저녁 7시"
export function eventWhen(iso) {
  const d = new Date(iso);
  const { m, d: day, h } = kstParts(d);
  const minutes = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', minute: '2-digit' }).format(d));
  const weekday = DAYS[new Date(Date.UTC(kstParts(d).y, m - 1, day)).getUTCDay()];
  const part = h < 12 ? '오전' : h < 18 ? '오후' : '저녁';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${m}월 ${day}일(${weekday}) ${part} ${hour12}시${minutes ? ` ${minutes}분` : ''}`;
}

let cached = null;
export async function loadEvents() {
  if (cached) return cached;
  try {
    const res = await fetch(new URL('../data/events.json', import.meta.url));
    cached = res.ok ? await res.json() : { items: [] };
  } catch {
    cached = { items: [] };
  }
  return cached;
}

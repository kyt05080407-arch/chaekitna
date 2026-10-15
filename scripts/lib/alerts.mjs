// 아침 알림 계산(네트워크 없이 테스트할 수 있는 부분)
// 상태(state): { "ISBN:도서관코드": true(대출 가능) | false(대출 중·없음) }

import { objectParticle } from '../../js/util.js';

export const pairKey = (isbn, lib) => `${isbn}:${lib}`;

// 구독 목록 → 오늘 확인할 (ISBN, 도서관) 쌍. 최근에 갱신한 구독부터 maxPairs 쌍까지만.
// 같은 쌍을 여러 사람이 구독해도 한 번만 확인한다.
export function planChecks(subscriptions, { maxPairs = 150 } = {}) {
  const sorted = [...subscriptions].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const byIsbn = new Map();
  let pairs = 0;
  let skipped = 0;
  for (const sub of sorted) {
    for (const item of sub.items || []) {
      for (const lib of sub.libs || []) {
        const libs = byIsbn.get(item.isbn) || new Set();
        if (libs.has(lib)) continue;
        if (pairs >= maxPairs) {
          skipped += 1;
          continue;
        }
        libs.add(lib);
        byIsbn.set(item.isbn, libs);
        pairs += 1;
      }
    }
  }
  return { byIsbn, pairs, skipped };
}

// 상태 값: 대출 가능 true, 대출 중이거나 소장하지 않음 false, 확인 못 함 null
export function availabilityValue(status) {
  if (status === 'available') return true;
  if (status === 'loaned' || status === 'none') return false;
  return null;
}

// 어제까지 false였다가 오늘 true가 된 책만 고른다. 처음 확인하는 쌍(이전 기록 없음)은 알리지 않는다.
export function newlyAvailable(subscription, prev, current) {
  const found = [];
  for (const item of subscription.items || []) {
    const libs = (subscription.libs || []).filter((lib) => {
      const key = pairKey(item.isbn, lib);
      return current[key] === true && prev[key] === false;
    });
    if (libs.length) found.push({ isbn: item.isbn, title: item.title || '', libs });
  }
  return found;
}

// 다음 상태: 오늘 확인한 값으로 바꾸고, 확인 못 한 쌍은 이전 값을 유지한다.
// 더 이상 아무도 구독하지 않는 쌍은 지워서 파일이 커지지 않게 한다.
export function nextState(subscriptions, prev, current) {
  const alive = new Set();
  for (const sub of subscriptions) {
    for (const item of sub.items || []) for (const lib of sub.libs || []) alive.add(pairKey(item.isbn, lib));
  }
  const next = {};
  for (const key of alive) {
    if (typeof current[key] === 'boolean') next[key] = current[key];
    else if (typeof prev[key] === 'boolean') next[key] = prev[key];
  }
  return next;
}

// 알림 문구. found: newlyAvailable 결과, libraryName: 코드 → 이름
export function buildMessage(found, libraryName = () => '') {
  const first = found[0];
  const name = first.title ? `'${first.title}'` : '관심 도서';
  let body;
  if (found.length === 1) {
    const names = first.libs.map((code) => libraryName(code)).filter(Boolean);
    let where = '내 도서관에서';
    if (names.length === 1) where = `${names[0]}에서`;
    else if (names.length > 1) where = `${names[0]} 등 ${names.length}곳에서`;
    body = `${name}${objectParticle(name)} ${where} 빌릴 수 있어요. (어제 기준)`;
  } else {
    body = `${name} 외 ${found.length - 1}권을 내 도서관에서 빌릴 수 있어요. (어제 기준)`;
  }
  return {
    title: '책있나 · 빌릴 수 있어요',
    body,
    url: found.length === 1 ? `#/book/${first.isbn}` : '#/watchlist',
    tag: 'availability',
  };
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

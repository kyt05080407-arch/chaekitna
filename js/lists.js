// 책 목록 한 번에 확인: 서울대 권장도서 100선, 중·고등학생이 요즘 많이 빌린 책, 직접 붙여 넣은 목록.
// - 목록과 ISBN은 GitHub Actions(scripts/build-lists.mjs)가 정보나루에서 찾아 data/lists.json에 저장한다.
// - '내 도서관에서 확인'은 책마다, 내 도서관이 있는 시·도의 소장 도서관 목록(holdings)을 한 번씩 받아
//   내 도서관과 겹치는지 본다. 내 도서관이 한 시·도에 몰려 있으면 책 한 권에 조회 1번이다.

import { normalizeText, toIsbn13 } from './util.js';

let loading = null;

export function loadLists(fetchImpl = globalThis.fetch) {
  if (!loading) {
    loading = Promise.resolve()
      .then(() => fetchImpl(new URL('../data/lists.json', import.meta.url)))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && Array.isArray(data.lists) ? data : { lists: [] }))
      .catch(() => {
        loading = null;
        return { lists: [] };
      });
  }
  return loading;
}

// ---------- 검색 결과에서 목록의 책 고르기 ----------

// 만화·어린이용·큰글자 같은 다른 판은 원래 책이 없을 때만 고른다(그래도 제목이 똑같아야 함)
const OTHER_EDITION = /(만화|어린이|초등|그림책|동화|큰\s?글자|큰\s?글씨|오디오|키즈|청소년을\s?위한|10대를\s?위한|학습)/;

// 제목이 같으면 3, 그 제목으로 시작하면 2(예: '토지 1'), 들어 있으면 1, 아니면 0
export function titleScore(title, query) {
  const t = normalizeText(title);
  const q = normalizeText(query);
  if (!t || !q) return 0;
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

// 저자 열쇠(성이나 이름 일부) 중 하나라도 저자 칸에 있으면 같은 저자로 본다. 열쇠가 없으면 따지지 않는다.
export function authorMatches(authors, keys) {
  const list = (keys || []).map(normalizeText).filter(Boolean);
  if (!list.length) return true;
  const a = normalizeText(authors);
  return list.some((k) => a.includes(k));
}

/**
 * 검색 결과(대출 많은 순)에서 목록의 책과 같은 책 한 권을 고른다. 없으면 null.
 * @param {{isbn13:string,title:string,authors:string}[]} books
 * @param {{query:string, authorKeys?:string[]}} want
 */
export function pickMatch(books, { query, authorKeys = [] } = {}) {
  let best = null;
  let bestScore = 0;
  for (const book of books || []) {
    if (!book || !/^\d{13}$/.test(book.isbn13 || '')) continue;
    let score = titleScore(book.title, query);
    if (!score || !authorMatches(book.authors, authorKeys)) continue;
    if (OTHER_EDITION.test(book.title)) score -= 2.5;
    // 점수가 같으면 먼저 나온 책(대출이 더 많은 책)
    if (score > bestScore) {
      best = book;
      bestScore = score;
    }
  }
  return best;
}

// ---------- 붙여 넣은 목록 읽기 ----------

export const MAX_PASTE = 30;

// "1. 데미안 - 헤르만 헤세", "『아몬드』(손원평)", "• 소년이 온다 / 한강", ISBN 한 줄 → { title, author, isbn }
export function parsePasted(text) {
  const out = [];
  const seen = new Set();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    let line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const isbn = toIsbn13(line);
    if (isbn) {
      if (!seen.has(isbn)) out.push({ title: '', author: '', isbn });
      seen.add(isbn);
      continue;
    }
    // 앞 번호·글머리표
    line = line.replace(/^(\(?\d{1,3}[.)\]]|\d{1,3}\s|[-*•·▶▷○●◦□■✓✔]+)\s*/, '').trim();
    let title = line;
    let author = '';
    const quoted = line.match(/[『「《〈<"“']([^』」》〉>"”']+)[』」》〉>"”']\s*(.*)$/);
    if (quoted) {
      title = quoted[1].trim();
      author = quoted[2];
    } else {
      const split = line.match(/^(.+?)\s+(?:[-–—/|]|by)\s+(.+)$/i) || line.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
      if (split) {
        title = split[1].trim();
        author = split[2];
      }
    }
    author = String(author || '')
      .replace(/^[\s\-–—/|,(]+|[\s)]+$/g, '')
      .replace(/\s*(지음|지은이|저|글|옮김|역|외)\s*$/u, '')
      .trim();
    title = title.replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (!title || title.length > 80) continue;
    const key = normalizeText(`${title}|${author}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, author, isbn: '' });
  }
  return out.slice(0, MAX_PASTE);
}

// 붙여 넣은 저자 이름에서 열쇠 만들기: '헤르만 헤세' → ['헤르만 헤세', '헤세']
export function authorKeysOf(author) {
  const a = String(author || '').trim();
  if (!a) return [];
  const parts = a.split(/[\s,·]+/).filter((p) => p.length >= 2);
  return [...new Set([a, parts[parts.length - 1]].filter(Boolean))];
}

// ---------- 내 도서관과 겹치는지 ----------

// 내 도서관을 시·도별로 묶는다: Map(시·도 코드 → 도서관 코드들)
export function groupByRegion(mine, getLib) {
  const map = new Map();
  for (const code of mine) {
    const lib = getLib(code);
    if (!lib || !lib.region) continue;
    if (!map.has(lib.region)) map.set(lib.region, []);
    map.get(lib.region).push(code);
  }
  return map;
}

/**
 * 시·도별 소장 도서관 목록과 내 도서관을 맞춰 본다.
 * @param {Map<string,string[]>} byRegion groupByRegion 결과
 * @param {(region:string)=>({codes:string[], total?:number}|null)} resultFor 시·도별 조회 결과(없으면 null)
 * @returns {{have:string[], unknown:string[]}|null} 아직 조회하지 않은 시·도가 있으면 null
 *   소장 도서관이 한 번에 받는 수보다 많아 목록이 잘렸으면, 목록에 없는 내 도서관은 unknown(눌러서 확인)
 */
export function overlap(byRegion, resultFor) {
  const have = [];
  const unknown = [];
  for (const [region, codes] of byRegion) {
    const res = resultFor(region);
    if (!res) return null;
    const held = new Set(res.codes || []);
    const truncated = Number(res.total) > (res.codes || []).length;
    for (const code of codes) {
      if (held.has(code)) have.push(code);
      else if (truncated) unknown.push(code);
    }
  }
  return { have, unknown };
}

// 목록 전체 요약: 확인한 책 수, 내 도서관에 있는 책 수
export function tally(results) {
  const done = results.filter(Boolean);
  return { checked: done.length, have: done.filter((r) => r.have.length).length, unknown: done.filter((r) => !r.have.length && r.unknown.length).length };
}

// 학생 책 목록 만들기의 핵심(호출 방법은 밖에서 받아서 시험하기 쉽게)
import { pickMatch } from '../../js/lists.js';

// 찾는 방법이 바뀌면(검색어·저자 열쇠) 다시 찾는다
export const lookupKey = (book) => `${(book.queries || []).join('|')}#${(book.authorKeys || []).join('|')}`;

// 한 검색어로 해 볼 조회들. 제목·저자 칸으로 먼저 찾고, 안 되면 키워드로.
export function attemptsFor(query, keys) {
  const list = [];
  if (keys.length) list.push({ title: query, author: keys[0] });
  else list.push({ title: query });
  list.push({ keyword: query });
  return list;
}

const slimMatch = (b) => ({
  isbn13: b.isbn13,
  title: b.title,
  authors: b.authors,
  publisher: b.publisher,
  year: b.year,
  cover: b.cover,
  // 도서 검색 결과의 대출 건수(정보나루 집계). 책장 화면에서 '도서관에서 많이 빌린 책' 순서에 쓴다.
  ...(Number(b.loanCount) > 0 ? { loanCount: Number(b.loanCount) } : {}),
});

// 원본 책에서 화면에 넘길 칸(찾는 데만 쓰는 queries·authorKeys는 뺀다)
const PASS = ['field', 'note', 'src', 'from'];

/**
 * 원본 목록의 책마다 ISBN을 찾는다.
 * @param {object} list data/lists-src.json의 목록 하나
 * @param {Map<string, object>} previous 지난번 결과(no → 책)
 * @param {(params:object)=>Promise<object[]>} search 정보나루 도서 검색(책 배열을 돌려줌)
 * @param {{budget:{left:number}, shared?:Map<string, object>}} o 이번 실행에서 남은 호출 수(여러 목록이 함께 씀),
 *   여러 목록에 같은 책이 있을 때 한 번만 찾도록 함께 쓰는 결과(찾는 방법 → 찾은 책)
 */
export async function resolveList(list, previous, search, { budget, shared = new Map() }) {
  const stats = { reused: 0, found: 0, missing: [], skipped: 0, byAttempt: {} };
  const books = [];
  for (const src of list.books) {
    const keys = src.authorKeys || [];
    const out = { no: src.no, title: src.title, author: src.author || '' };
    for (const key of PASS) if (src[key] !== undefined && src[key] !== '') out[key] = src[key];
    out.lookup = lookupKey(src);
    const prev = previous.get(src.no);
    // 지난번에 찾은 책은 그대로 쓴다(같은 방법으로 찾은 경우만)
    if (prev && prev.lookup === out.lookup && prev.match) {
      books.push({ ...out, match: prev.match });
      shared.set(out.lookup, prev.match);
      stats.reused += 1;
      continue;
    }
    // 다른 목록에서 같은 방법으로 이미 찾은 책
    if (shared.has(out.lookup)) {
      books.push({ ...out, match: shared.get(out.lookup) });
      stats.reused += 1;
      continue;
    }
    let match = null;
    let triedAll = true;
    search: for (const query of src.queries || [src.title]) {
      for (const params of attemptsFor(query, keys)) {
        if (budget.left <= 0) {
          triedAll = false;
          break search;
        }
        budget.left -= 1;
        let results = [];
        try {
          results = await search(params);
        } catch (error) {
          // 검색 칸 이름이 맞지 않는 등 한 방법이 실패해도 다음 방법으로
          if (error && error.fatal) throw error;
          results = [];
        }
        match = pickMatch(results, { query, authorKeys: keys });
        if (match) {
          const how = Object.keys(params).join('+');
          stats.byAttempt[how] = (stats.byAttempt[how] || 0) + 1;
          break search;
        }
      }
    }
    if (match) {
      const slim = slimMatch(match);
      books.push({ ...out, match: slim });
      shared.set(out.lookup, slim);
      stats.found += 1;
    } else {
      // 이번에 다 찾아보지 못했으면(호출 한도) 다음 실행에서 다시 찾는다. 화면에는 '준비 중'으로 보인다.
      if (triedAll) {
        books.push(out);
        stats.missing.push(src.title);
      } else {
        books.push({ ...out, waiting: true });
        stats.skipped += 1;
      }
    }
  }
  return { list: { ...list, books }, stats };
}

// 인기 대출 목록을 화면용으로 줄인다
export const slimPopular = (items) =>
  items.map((b, i) => ({
    no: b.rank || i + 1,
    title: b.title,
    author: b.authors,
    match: slimMatch(b),
    loanCount: b.loanCount,
  }));

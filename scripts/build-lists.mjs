// 책 목록 한 번에 확인용 data/lists.json을 만든다.
//  1) data/lists-src.json의 권장도서·학과별 책장·사람별 책장(scripts/shelves.mjs가 씀)의 책마다
//     정보나루 도서 검색(srchBooks)으로 ISBN·표지를 찾는다. 지난번에 찾은 책이나 다른 목록에서 이미 찾은 책은
//     다시 찾지 않아서, 처음 한 번만 호출이 많고 그다음 주부터는 거의 없다. 한 번에 다 못 찾으면 다음 실행에서 이어 찾는다.
//  2) 중·고등학생이 최근 30일 동안 많이 빌린 책(loanItemSrch, 연령 a14·a17) 20권씩. 호출 2번.
// LISTS_OFFLINE=1이면 API를 부르지 않고 원본과 지난 결과만으로 만든다(처음 커밋·시험용).
// LISTS_MAX_CALLS: 이번 실행에서 도서 검색을 부를 최대 횟수(기본 250)

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { callApi, kstDate, koreanRange } from './lib/d4l.mjs';
import { parseBooks } from '../js/parse.js';
import { resolveList, slimPopular } from './lib/lists.mjs';

const dataDir = process.env.OUT_DIR ? pathToFileURL(`${resolve(process.env.OUT_DIR)}/`) : new URL('../data/', import.meta.url);
const srcUrl = process.env.LISTS_SRC ? pathToFileURL(resolve(process.env.LISTS_SRC)) : new URL('../data/lists-src.json', import.meta.url);
const offline = process.env.LISTS_OFFLINE === '1';
const budget = { left: offline ? 0 : Math.max(0, Number(process.env.LISTS_MAX_CALLS || 250)) };

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

const src = await readJson(srcUrl);
if (!src || !Array.isArray(src.lists)) {
  console.error('data/lists-src.json을 읽지 못했어요.');
  process.exit(1);
}
const previous = (await readJson(new URL('lists.json', dataDir))) || { lists: [] };
const prevById = new Map(previous.lists.map((l) => [l.id, l]));

// 인증키 문제처럼 다시 해도 안 되는 오류면 멈춘다(지난 결과는 그대로 둔다)
const isFatal = (error) => /인증|활성화|한도|초과|authKey/i.test(String(error && error.message));

// 연달아 여러 번 실패하면(정보나루 장애 등) 남은 책을 계속 부르지 않고 멈춘다
let failures = 0;
async function search(params) {
  try {
    const data = await callApi('srchBooks', { ...params, pageNo: 1, pageSize: 50, sort: 'loan', order: 'desc' }, { retries: 1 });
    failures = 0;
    return parseBooks(data).books;
  } catch (error) {
    failures += 1;
    if (isFatal(error) || failures >= 6) error.fatal = true;
    throw error;
  }
}

const lists = [];

// 여러 목록에 같은 책이 있으면 한 번만 찾는다(지난번 결과도 함께)
const shared = new Map();
for (const l of previous.lists) for (const book of l.books || []) if (book.lookup && book.match) shared.set(book.lookup, book.match);

// 1) 권장도서·학과별 책장·사람별 책장
for (const list of src.lists) {
  const prevBooks = new Map(((prevById.get(list.id) || {}).books || []).map((b) => [b.no, b]));
  try {
    const { list: built, stats } = await resolveList(list, prevBooks, search, { budget, shared });
    lists.push(built);
    const total = list.books.length;
    const have = built.books.filter((b) => b.match).length;
    const how = Object.entries(stats.byAttempt)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    console.log(
      `::notice title=${list.short || list.id}::${total}권 중 ${have}권 찾음 (이번에 새로 ${stats.found}, 지난번 그대로 ${stats.reused}${how ? `; 찾은 방법 ${how}` : ''})`,
    );
    if (stats.missing.length) console.log(`::notice title=${list.short || list.id} 못 찾음::${stats.missing.join(', ')}`);
    if (stats.skipped) console.log(`::notice title=${list.short || list.id}::호출 한도 때문에 ${stats.skipped}권은 다음 실행에서 찾아요.`);
  } catch (error) {
    console.log(`::error title=${list.short || list.id}::${error.message}`);
    const prev = prevById.get(list.id);
    if (prev) lists.push(prev);
    if (error.fatal) break;
  }
}

// 2) 중·고등학생 인기 대출(최근 30일, 전국)
const endDt = kstDate(-1);
const startDt = kstDate(-30);
const TEEN = [
  { id: 'teen-high', age: 'a17', title: '고등학생이 요즘 많이 빌린 책', short: '고등학생 인기', who: '고등학생' },
  { id: 'teen-mid', age: 'a14', title: '중학생이 요즘 많이 빌린 책', short: '중학생 인기', who: '중학생' },
];
for (const t of TEEN) {
  if (offline) {
    if (prevById.get(t.id)) lists.push(prevById.get(t.id));
    continue;
  }
  try {
    const data = await callApi('loanItemSrch', { startDt, endDt, age: t.age, pageNo: 1, pageSize: 20 });
    const items = parseBooks(data).books.filter((b) => /^\d{13}$/.test(b.isbn13));
    if (items.length < 5) throw new Error(`${items.length}권만 나왔어요`);
    lists.push({
      id: t.id,
      title: t.title,
      short: t.short,
      kind: 'popular',
      description: `최근 30일(${koreanRange(startDt, endDt)}) 동안 전국 공공도서관에서 ${t.who}이 많이 빌린 책 ${items.length}권이에요.`,
      source: '도서관 정보나루 인기대출도서',
      sourceUrl: 'https://www.data4library.kr/',
      startDt,
      endDt,
      books: slimPopular(items),
    });
    console.log(`::notice title=${t.short}::${items.length}권 (${koreanRange(startDt, endDt)})`);
  } catch (error) {
    console.log(`::warning title=${t.short}::받지 못해서 지난 목록을 그대로 둬요: ${error.message}`);
    if (prevById.get(t.id)) lists.push(prevById.get(t.id));
  }
}

const out = { generatedAt: new Date().toISOString(), lists };
await writeFile(new URL('lists.json', dataDir), `${JSON.stringify(out, null, 1)}\n`);
console.log(`목록 ${lists.length}개 저장 (도서 검색 호출 남은 수 ${budget.left})`);

// 지난 7일 동안 많이 빌린 책(인기 대출 도서)을 받아 data/popular.json에 저장한다.
// 기본: 경북(37) · 고등학생(a17). 환경변수 POPULAR_REGION, POPULAR_AGE로 바꿀 수 있다.
// 매주 받은 결과는 data/history/에도 쌓아 두어 나중에 추이를 분석할 수 있게 한다.

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { callApi, kstDate, koreanRange } from './lib/d4l.mjs';
import { parseBooks } from '../js/parse.js';
import { isRegionCode, regionByCode } from '../js/regions.js';

// 정보나루 연령 코드 (a8·a10·a12는 초등 학년군)
const AGE_NAMES = {
  0: '영유아', 6: '유아', 8: '초등학생', 14: '청소년',
  20: '20대', 30: '30대', 40: '40대', 50: '50대', 60: '60대',
  a8: '초등 저학년', a10: '초등 중학년', a12: '초등 고학년', a14: '중학생', a17: '고등학생',
};

// 테스트할 때는 OUT_DIR로 저장 위치를 바꾼다.
const outDir = process.env.OUT_DIR ? pathToFileURL(`${resolve(process.env.OUT_DIR)}/`) : new URL('../data/', import.meta.url);
const region = process.env.POPULAR_REGION || '37';
const age = process.env.POPULAR_AGE || 'a17';
if (!isRegionCode(region) || !(age in AGE_NAMES)) {
  console.error(`POPULAR_REGION(${region}) 또는 POPULAR_AGE(${age}) 값이 올바르지 않아요. README의 표를 확인해 주세요.`);
  process.exit(1);
}
const endDt = kstDate(-1);
const startDt = kstDate(-7);

async function fetchList(params) {
  const data = await callApi('loanItemSrch', { startDt, endDt, pageNo: 1, pageSize: 10, ...params });
  return parseBooks(data).books.filter((b) => /^\d{13}$/.test(b.isbn13));
}

// 데이터가 적으면 범위를 넓힌다: 지역+연령 → 지역+청소년 → 전국+연령 (같은 조건은 한 번만)
const attempts = [{ region, age }, { region, age: '14' }, { age }].filter(
  (a, i, all) => all.findIndex((b) => b.region === a.region && b.age === a.age) === i,
);

let items = [];
let used = attempts[0];
for (const attempt of attempts) {
  items = await fetchList(attempt);
  used = attempt;
  if (items.length >= 5) break;
}
if (!items.length) {
  console.error('인기 도서를 받지 못했어요. 기존 파일을 그대로 둡니다.');
  process.exit(1);
}

const file = {
  demo: false,
  generatedAt: new Date().toISOString(),
  startDt,
  endDt,
  period: koreanRange(startDt, endDt),
  region: used.region || '',
  regionName: used.region ? regionByCode(used.region)?.short || '' : '전국',
  age: used.age,
  ageName: AGE_NAMES[used.age] || '',
  source: '도서관 정보나루 인기대출도서 (loanItemSrch)',
  items: items.map((b, i) => ({
    rank: b.rank || i + 1,
    isbn13: b.isbn13,
    title: b.title,
    authors: b.authors,
    publisher: b.publisher,
    year: b.year,
    cover: b.cover,
    loanCount: b.loanCount,
  })),
};

await writeFile(new URL('popular.json', outDir), `${JSON.stringify(file, null, 2)}\n`);
await mkdir(new URL('history/', outDir), { recursive: true });
await writeFile(new URL(`history/popular-${endDt}.json`, outDir), `${JSON.stringify(file, null, 2)}\n`);
console.log(`${file.regionName} ${file.ageName} 인기 도서 ${file.items.length}권 (${file.period}) 저장`);

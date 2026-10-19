// 지난 7일 동안 많이 빌린 책(인기 대출 도서)을 받아 저장한다.
// - data/popular.json: 기본은 전국 · 전체 연령(호출 1번). POPULAR_REGION(지역 코드), POPULAR_AGE(연령 코드)로 좁힐 수 있다.
//   매주 결과를 data/history/에도 쌓아 두어 나중에 추이를 보고, 인스타그램 카드도 이걸로 만든다.
// - data/popular/<지역코드>.json: 17개 시·도별 목록(앱 홈에서 내 지역 목록을 보여 줌).
//   POPULAR_ALL_REGIONS=1일 때만 만든다. 지역마다 1~2번, 모두 합쳐 최대 34번 호출.

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { callApi, kstDate, koreanRange } from './lib/d4l.mjs';
import { parseBooks } from '../js/parse.js';
import { REGIONS, isRegionCode, regionByCode } from '../js/regions.js';

// 정보나루 연령 코드 (a8·a10·a12는 초등 학년군)
const AGE_NAMES = {
  0: '영유아', 6: '유아', 8: '초등학생', 14: '청소년',
  20: '20대', 30: '30대', 40: '40대', 50: '50대', 60: '60대',
  a8: '초등 저학년', a10: '초등 중학년', a12: '초등 고학년', a14: '중학생', a17: '고등학생',
};

// 테스트할 때는 OUT_DIR로 저장 위치를 바꾼다.
const outDir = process.env.OUT_DIR ? pathToFileURL(`${resolve(process.env.OUT_DIR)}/`) : new URL('../data/', import.meta.url);
// 빈 값이면 조건 없음(전국, 전체 연령)
const region = (process.env.POPULAR_REGION || '').trim();
const age = (process.env.POPULAR_AGE || '').trim();
if ((region && !isRegionCode(region)) || (age && !(age in AGE_NAMES))) {
  console.error(`POPULAR_REGION(${region}) 또는 POPULAR_AGE(${age}) 값이 올바르지 않아요. README의 표를 확인해 주세요.`);
  process.exit(1);
}
const endDt = kstDate(-1);
const startDt = kstDate(-7);

async function fetchList(params) {
  const data = await callApi('loanItemSrch', { startDt, endDt, pageNo: 1, pageSize: 10, ...params });
  return parseBooks(data).books.filter((b) => /^\d{13}$/.test(b.isbn13));
}

// 조건을 차례로 넓혀 5권 이상 나오면 멈춘다(같은 조건은 한 번만)
async function firstEnough(attempts) {
  const unique = attempts.filter((a, i, all) => all.findIndex((b) => b.region === a.region && b.age === a.age) === i);
  let items = [];
  let used = unique[0];
  for (const attempt of unique) {
    items = await fetchList(attempt);
    used = attempt;
    if (items.length >= 5) break;
  }
  return { items, used };
}

function toFile({ items, used }) {
  return {
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
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// 조건을 넓히는 순서: 지역+연령 → 지역+청소년 → 전국+연령 → 전국 전체 (national=false면 그 지역 안에서만)
function attemptsFor(r, { national = true } = {}) {
  const list = [{ region: r, age }];
  if (age && age !== '14') list.push({ region: r, age: '14' });
  if (national && r) list.push({ region: '', age });
  if (national && (r || age)) list.push({ region: '', age: '' });
  return list;
}

// 1) 기본 목록
const main = await firstEnough(attemptsFor(region));
if (!main.items.length) {
  console.error('인기 도서를 받지 못했어요. 기존 파일을 그대로 둡니다.');
  process.exit(1);
}
const file = toFile(main);
await mkdir(new URL('history/', outDir), { recursive: true });
await writeFile(new URL(`history/popular-${endDt}.json`, outDir), json(file));

// 2) 시·도별 목록 (전국으로 넓히지는 않는다: 그 지역 목록이 아니게 되므로)
const saved = [];
if (process.env.POPULAR_ALL_REGIONS === '1') {
  await mkdir(new URL('popular/', outDir), { recursive: true });
  for (const r of REGIONS) {
    try {
      const result =
        r.code === region && main.used.region === region ? main : await firstEnough(attemptsFor(r.code, { national: false }));
      if (!result.items.length) continue;
      await writeFile(new URL(`popular/${r.code}.json`, outDir), json(toFile(result)));
      saved.push(r.code);
    } catch (error) {
      console.log(`::warning::${r.short} 인기 도서를 받지 못했어요: ${error.message}`);
    }
  }
  console.log(`시·도별 인기 도서 ${saved.length}/${REGIONS.length}곳 저장`);
}

// 기본 목록에는 어떤 지역 목록이 있는지 함께 적어 둔다(앱이 없는 파일을 찾지 않게)
await writeFile(new URL('popular.json', outDir), json({ ...file, regions: saved }));
console.log(`${[file.regionName, file.ageName].filter(Boolean).join(' ')} 인기 도서 ${file.items.length}권 (${file.period}) 저장`);

// 전국 공공도서관 목록(libSrch)을 받아 data/libraries.json을 새로 만든다. 매월 1번 실행.
// 받은 수가 기존보다 크게 줄면(일부 실패로 보고) 덮어쓰지 않는다.

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { callApi, kstDate } from './lib/d4l.mjs';
import { parseLibraries } from '../js/parse.js';
import { buildLibrariesFile } from './lib/library-format.mjs';

const outDir = process.env.OUT_DIR ? pathToFileURL(`${resolve(process.env.OUT_DIR)}/`) : new URL('../data/', import.meta.url);
const target = new URL('libraries.json', outDir);
const PAGE = 1000;

const raw = [];
for (let page = 1; page <= 10; page += 1) {
  const data = await callApi('libSrch', { pageNo: page, pageSize: PAGE });
  const { total, libraries } = parseLibraries(data);
  // parseLibraries가 화면용 모양(code/name/lat…)으로 바꿔 주므로 원래 이름으로 되돌려 넘긴다.
  raw.push(...libraries.map((l) => ({ libCode: l.code, libName: l.name, address: l.address, tel: l.tel, homepage: l.homepage, latitude: l.lat, longitude: l.lng, operatingTime: l.hours, closed: l.closed })));
  if (raw.length >= total || libraries.length < PAGE) break;
}

const file = buildLibrariesFile(raw, { source: '도서관 정보나루 정보공개 도서관 조회 (libSrch)', updatedAt: kstDate(0) });

let previous = 0;
try {
  previous = JSON.parse(await readFile(target, 'utf8')).libraries.length;
} catch {
  previous = 0;
}
if (file.count < 1000 || (previous && file.count < previous * 0.9)) {
  console.error(`도서관 수가 이상해요 (이번 ${file.count}곳, 이전 ${previous}곳). 덮어쓰지 않습니다.`);
  process.exit(1);
}
await writeFile(target, `${JSON.stringify(file)}\n`);
console.log(`도서관 ${file.count}곳 저장 (이전 ${previous}곳)`);

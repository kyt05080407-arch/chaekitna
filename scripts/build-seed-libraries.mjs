// 처음 한 번만 쓰는 스크립트: 오픈소스 도서관 목록(MIT)을 data/libraries.json 모양으로 바꾼다.
// 인증키가 생기면 GitHub Actions의 fetch-libraries.mjs가 정보나루에서 직접 받은 목록으로 덮어쓴다.
//
// 사용법: node scripts/build-seed-libraries.mjs <원본 libraries.json 경로>

import { readFile, writeFile } from 'node:fs/promises';
import { buildLibrariesFile } from './lib/library-format.mjs';

const input = process.argv[2];
if (!input) {
  console.error('원본 파일 경로를 넣어 주세요.');
  process.exit(1);
}

const raw = JSON.parse(await readFile(input, 'utf8'));
const file = buildLibrariesFile(raw, {
  source: 'seed: github.com/isnow890/data4library-mcp (MIT), 원자료 도서관 정보나루',
  updatedAt: '2026-10-15',
});
await writeFile(new URL('../data/libraries.json', import.meta.url), `${JSON.stringify(file)}\n`);
const noRegion = file.libraries.filter((l) => !l.region).length;
console.log(`도서관 ${file.count}곳 저장 (지역 미상 ${noRegion}곳)`);

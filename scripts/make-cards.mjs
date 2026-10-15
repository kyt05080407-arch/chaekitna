// 인스타그램 '이번 주 인기 도서' 카드 만들기 (1080×1350 PNG + 캡션)
// 입력: data/popular.json, data/history/popular-*.json(최근 8주)
// 출력: <폴더>/popular-<마지막날>.png, popular-<마지막날>.txt, latest.json
// 사용: node scripts/make-cards.mjs [출력 폴더, 기본 cards]
// GitHub Pages 배포 때 _site/cards에 만들어서, 카드 이미지를 저장소에 쌓지 않는다.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { caption, cardModel, cardSvg, escapeXml } from './lib/card.mjs';

const WEEKS = 8;
const require = createRequire(import.meta.url);
const fontDir = require.resolve('pretendard/package.json').replace(/package\.json$/, 'dist/public/static/');
const fontFiles = ['Regular', 'SemiBold', 'ExtraBold', 'Black'].map((w) => `${fontDir}Pretendard-${w}.otf`);
const fontOptions = { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Pretendard' };

const outDir = resolve(process.argv[2] || 'cards');
// 테스트할 때는 DATA_DIR로 입력 폴더를 바꾼다.
const dataDir = process.env.DATA_DIR ? pathToFileURL(`${resolve(process.env.DATA_DIR)}/`) : new URL('../data/', import.meta.url);

const widthCache = new Map();
function measure(text, { size, weight, letterSpacing = 0 }) {
  const key = `${size}|${weight}|${letterSpacing}|${text}`;
  if (widthCache.has(key)) return widthCache.get(key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${size * 2}"><text x="0" y="${size * 1.4}" font-family="Pretendard" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}">${escapeXml(text)}</text></svg>`;
  const box = new Resvg(svg, { font: fontOptions }).getBBox();
  const width = box ? box.x + box.width : 0;
  widthCache.set(key, width);
  return width;
}

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

async function sources() {
  const found = new Map();
  const latest = await readJson(new URL('popular.json', dataDir));
  if (latest && !latest.demo && latest.items?.length && latest.endDt) found.set(latest.endDt, latest);
  let files = [];
  try {
    files = (await readdir(new URL('history/', dataDir))).filter((f) => /^popular-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  } catch {
    /* 아직 기록 없음 */
  }
  for (const file of files.sort().reverse().slice(0, WEEKS)) {
    const data = await readJson(new URL(`history/${file}`, dataDir));
    if (data && data.items?.length && data.endDt && !found.has(data.endDt)) found.set(data.endDt, data);
  }
  return [...found.values()].sort((a, b) => b.endDt.localeCompare(a.endDt)).slice(0, WEEKS);
}

const list = await sources();
if (!list.length) {
  console.log('아직 실제 인기 도서 데이터가 없어서 카드를 만들지 않아요.');
  process.exit(0);
}

await mkdir(outDir, { recursive: true });
let latestInfo = null;
for (const popular of list) {
  const model = cardModel(popular);
  const png = new Resvg(cardSvg(model, measure), { font: fontOptions, fitTo: { mode: 'width', value: 1080 } }).render().asPng();
  const base = `popular-${model.endDt}`;
  const text = caption(model);
  await writeFile(join(outDir, `${base}.png`), png);
  await writeFile(join(outDir, `${base}.txt`), `${text}\n`);
  if (!latestInfo) {
    latestInfo = {
      image: `${base}.png`,
      caption: text,
      endDt: model.endDt,
      period: model.period,
      regionName: model.regionName,
      ageName: model.ageName,
      items: model.items,
      generatedAt: new Date().toISOString(),
    };
  }
}
await writeFile(join(outDir, 'latest.json'), `${JSON.stringify(latestInfo, null, 2)}\n`);
console.log(`카드 ${list.length}장을 만들었어요. 최신: ${latestInfo.image}`);

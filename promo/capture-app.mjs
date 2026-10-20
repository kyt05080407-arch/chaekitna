// 홍보 영상에 넣을 책있나 화면을 찍는다(휴대폰 390×844, 3배 해상도).
// - 대출 상태는 화면 점검용 가짜 프록시(tests/e2e/helpers.mjs)를 쓴다 → 영상에는 '예시 화면'이라고 적는다.
// - 인기 도서·책 목록은 저장소의 실제 데이터(data/*.json), 표지는 promo/.work/covers(Promo assets 작업으로 받은 것).
// 사용: node promo/capture-app.mjs  → promo/.work/shots/*.png, shots.json(요소 위치)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fakeProxy } from '../tests/e2e/helpers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORK = `${ROOT}promo/.work`;
const PORT = 4195;
const BASE = `http://127.0.0.1:${PORT}/`;

// 표지: 원래 주소 → 받아 둔 파일
const { index } = JSON.parse(await readFile(`${WORK}/covers/index.json`, 'utf8'));
const coverFile = new Map();
for (const entry of Object.values(index)) {
  if (!entry.file) continue;
  for (const u of [entry.original, entry.original.replace(/^http:/, 'https:'), entry.from]) coverFile.set(u, `${WORK}/covers/${entry.file}`);
}

// 내 도서관: 안동시립웅부도서관(대출 중), 경북도서관(대출 가능), 안동시립어린이도서관(소장 안 함)
const MINE = ['147030', '147168', '147163'];
// 목록 확인 결과를 책마다 다르게(ISBN으로 정해지는 값)
function holdingsFor(isbn) {
  const h = [...isbn].reduce((a, c) => (a * 31 + Number(c)) % 1000, 7);
  const codes = [];
  if (h % 10 < 5) codes.push('147168');
  if (h % 8 < 2) codes.push('147030');
  if (h % 10 === 3) codes.push('147163');
  return { codes: [...codes, '147001'] };
}

const server = spawn(process.execPath, [`${ROOT}scripts/serve.mjs`, String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ channel: 'chromium' });
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  serviceWorkers: 'block',
  reducedMotion: 'reduce',
});
// 바깥 요청: 표지는 받아 둔 파일로, 나머지는 막는다
await context.route(/^https?:\/\/(?!127\.0\.0\.1|proxy\.example)/, async (route) => {
  const file = coverFile.get(route.request().url());
  if (file) return route.fulfill({ path: file });
  return route.abort();
});
const proxy = await fakeProxy(context);
proxy.holdingsFor = (isbn) => holdingsFor(isbn);
// 작가 강연 배너는 영상에서 빼기(포스터를 받아 두지 않았음)
await context.route('**/data/events.json', (route) => route.fulfill({ json: { items: [] } }));

const page = await context.newPage();
await page.goto('#/');
const BOOK = (await readFile(`${ROOT}data/popular.json`, 'utf8').then(JSON.parse)).items.find((b) => b.isbn13 === '9788936434120');
await page.evaluate(
  ({ mine, book }) => {
    localStorage.setItem('chaekitna:myLibraries', JSON.stringify(mine));
    localStorage.setItem('chaekitna:settings', JSON.stringify({ size: 'l', theme: 'light', onboarded: true }));
    localStorage.setItem(`chaekitna:c:b:${book.isbn13}`, JSON.stringify({ v: book, exp: Date.now() + 864e5, at: Date.now() }));
  },
  { mine: MINE, book: BOOK },
);

await mkdir(`${WORK}/shots`, { recursive: true });
const boxes = {};
const settle = async () => {
  // 알림 문구(토스트)는 화면에서 뺀다
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.waitForTimeout(700);
};
// 지금 보이는 화면 그대로(위 막대·아래 탭이 제자리에 있게). selector가 있으면 그 요소가 위쪽에 오게 스크롤
async function view(name, selector) {
  if (selector) {
    await page.locator(selector).first().evaluate((node) => {
      const top = node.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo(0, Math.max(0, top));
    });
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await settle();
  await page.screenshot({ path: `${WORK}/shots/${name}.png` });
}
async function shot(name, { full = true } = {}) {
  await settle();
  await page.screenshot({ path: `${WORK}/shots/${name}.png`, fullPage: full });
}
async function box(name, selector) {
  const b = await page.locator(selector).first().boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  if (b) boxes[name] = { x: b.x, y: b.y + scrollY, w: b.width, h: b.height };
}
// 지금 보이는 화면 안에서의 위치(누르는 자리 표시용)
const rects = {};
async function rect(name, selector) {
  const r = await page.locator(selector).first().evaluate((node) => {
    const b = node.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  rects[name] = r;
}
async function el(name, selector) {
  // 위 막대가 요소 위에 겹쳐 찍히지 않게, 찍는 동안만 막대를 고정 해제
  const tag = await page.addStyleTag({ content: '#topbar,.topbar{position:static!important}' });
  await page.locator(selector).first().screenshot({ path: `${WORK}/shots/${name}.png` });
  await tag.evaluate((node) => node.remove());
}

// 1) 책 화면: 『소년이 온다』
await page.goto('#/book/9788936434120');
await page.locator('#summary .summary__big').filter({ hasText: '1곳' }).waitFor();
await page.locator('.hot').waitFor();
await page.locator('img.cover--lg').evaluate((img) => img.decode()).catch(() => {});
await shot('detail');
await view('detail.v1');
await view('detail.v2', '#mine');
await rect('detail.v2.available', '#mine [data-lib="147168"] [data-status]');
await rect('detail.v2.loaned', '#mine [data-lib="147030"] [data-status]');
await page.evaluate(() => window.scrollTo(0, 0));
await rect('detail.v1.summary', '#summary');
await rect('detail.v1.hot', '.hot');
for (const [n, s] of [['detail.head', '#head'], ['detail.hot', '.hot'], ['detail.summary', '#summary'], ['detail.mine', '#mine']]) {
  await box(n, s);
  await el(n, s);
}

// 2) 처음 화면
await page.goto('#/');
await page.locator('#pop-list .row').first().waitFor();
await page.locator('#lists .row, #lists a').first().waitFor();
await shot('home');
await view('home.v1');
await view('home.v2', 'section[aria-labelledby="lists-h"]');
await rect('home.v2.snu100', '#lists a[href="#/list/snu100"]');
await view('home.v3', 'section[aria-labelledby="pop-h"]');
for (const [n, s] of [['home.lists', 'section[aria-labelledby="lists-h"]'], ['home.popular', 'section[aria-labelledby="pop-h"]']]) {
  await box(n, s);
  await el(n, s);
}

// 3) 서울대 권장도서 100선 → 한 번에 확인
await page.goto('#/list/snu100');
await page.locator('#check').waitFor();
await view('list.v0');
await rect('list.v0.check', '#check');
await page.locator('#check').click();
await page.locator('.check__sum').waitFor();
await page.locator('#check').waitFor({ timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector('.check__progress'), null, { timeout: 30000 });
await page.evaluate(() => window.scrollTo(0, 0));
await shot('list');
await view('list.v1');
await rect('list.v1.sum', '.check__sum');
await view('list.v2', '#fields');
for (const [n, s] of [['list.check', '#check-box'], ['list.books', '#books']]) await box(n, s);
await el('list.check', '#check-box');
// 앞쪽 다섯 권만 따로
await page.evaluate(() => {
  document.querySelectorAll('#books > li').forEach((li, i) => {
    if (i >= 5) li.style.display = 'none';
  });
});
await el('list.top5', '#books');

// 4) 내 목록 붙여 넣기 화면
await page.goto('#/list/mine');
await page.locator('#paste').fill(['1. 광장 - 최인훈', '2. 구운몽 - 김만중', '3. 무정 - 이광수', '4. 삼대 - 염상섭', '5. 소나기 - 황순원', '6. 태평천하 - 채만식', '7. 토지 - 박경리'].join('\n'));
await page.locator('#paste').blur();
await view('paste.v1');
await el('paste.form', '#paste-form');

await writeFile(`${WORK}/shots/shots.json`, `${JSON.stringify({ viewport: { w: 390, h: 844, dpr: 3 }, boxes, rects }, null, 2)}\n`);
console.log('찍은 화면:', Object.keys(boxes).length, '요소');
await browser.close();
server.kill();

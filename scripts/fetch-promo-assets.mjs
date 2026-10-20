// 홍보 영상에 쓸 책 표지를 받아 둔다(직접 실행, GitHub Actions의 Promo assets 작업).
// - 이번 주 인기 도서 앞 10권, 나잇대별 앞 5권, 책 목록마다 앞 15권
// - 알라딘 표지는 큰 크기(cover500)부터, 네이버 표지는 원본 크기부터 시도하고 받아지는 것 중 가장 큰 것을 쓴다.
// 결과: <out>/covers/<ISBN>.<확장자>, <out>/covers/index.json  (사용: node scripts/fetch-promo-assets.mjs [out=promo-assets])
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'promo-assets';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const read = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const popular = await read('data/popular.json');
const lists = await read('data/lists.json').catch(() => ({ lists: [] }));

const wanted = new Map(); // isbn → cover url
const add = (isbn, cover) => {
  if (/^\d{13}$/.test(isbn || '') && /^https?:\/\//.test(cover || '') && !wanted.has(isbn)) wanted.set(isbn, cover);
};
for (const b of (popular.items || []).slice(0, 10)) add(b.isbn13, b.cover);
for (const g of popular.groups || []) for (const b of (g.items || []).slice(0, 5)) add(b.isbn13, b.cover);
for (const l of lists.lists || []) for (const b of (l.books || []).slice(0, 15)) add(b.match && b.match.isbn13, b.match && b.match.cover);

// 같은 표지의 더 큰 주소 후보(앞에서부터 시도)
function candidates(url) {
  const u = url.replace(/^http:\/\//i, 'https://');
  const out = [];
  const aladin = u.match(/^(https:\/\/image\.aladin\.co\.kr\/product\/\d+\/\d+\/)(cover\d*|coversum|letslook)\/(.+)$/);
  if (aladin) for (const size of ['cover500', 'cover200', aladin[2]]) out.push(`${aladin[1]}${size}/${aladin[3]}`);
  if (/pstatic\.net/.test(u)) {
    const base = u.split('?')[0];
    out.push(base, u.replace(/type=m\d+/, 'type=w300'), u);
  }
  out.push(u);
  return [...new Set(out)];
}

async function fetchImage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, referer: '' }, signal: AbortSignal.timeout(15000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) return null;
  const body = Buffer.from(await res.arrayBuffer());
  return body.length > 1500 ? { body, type } : null;
}

await mkdir(`${OUT}/covers`, { recursive: true });
const index = {};
let ok = 0;
for (const [isbn, cover] of wanted) {
  let got = null;
  let used = '';
  for (const c of candidates(cover)) {
    try {
      got = await fetchImage(c);
    } catch {
      got = null;
    }
    if (got) {
      used = c;
      break;
    }
    await sleep(150);
  }
  if (got) {
    const ext = got.type.includes('png') ? 'png' : got.type.includes('webp') ? 'webp' : 'jpg';
    await writeFile(`${OUT}/covers/${isbn}.${ext}`, got.body);
    index[isbn] = { file: `${isbn}.${ext}`, from: used, original: cover, bytes: got.body.length };
    ok += 1;
  } else {
    index[isbn] = { file: null, original: cover };
    console.log(`::warning::표지를 받지 못했어요: ${isbn} ${cover}`);
  }
  await sleep(250);
}
await writeFile(`${OUT}/covers/index.json`, `${JSON.stringify({ at: new Date().toISOString(), index }, null, 2)}\n`);
console.log(`표지 ${ok}/${wanted.size}개 받음`);

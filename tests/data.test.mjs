import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { regionFromAddress, REGIONS } from '../js/regions.js';
import { nearbyLibraries, searchLibraries, setLibraries, getLibrary } from '../js/libraries.js';
import { toLibraryEntry } from '../scripts/lib/library-format.mjs';
import * as demo from '../js/demo.js';

const root = new URL('../', import.meta.url);

test('주소로 시·도 코드 찾기', () => {
  assert.equal(regionFromAddress('경상북도 안동시 경동로 1'), '37');
  assert.equal(regionFromAddress('서울특별시 중구'), '11');
  assert.equal(regionFromAddress('전라북도 전주시'), '35');
  assert.equal(regionFromAddress('전북특별자치도 전주시'), '35');
  assert.equal(regionFromAddress('강원도 춘천시'), '32');
  assert.equal(regionFromAddress('-'), '');
  assert.equal(REGIONS.length, 17);
});

test('도서관 목록 파일 모양', async () => {
  const json = JSON.parse(await readFile(new URL('data/libraries.json', root), 'utf8'));
  assert.ok(json.libraries.length > 1000);
  const codes = new Set();
  for (const lib of json.libraries) {
    assert.match(lib.code, /^\d{4,10}$/);
    assert.ok(!codes.has(lib.code), `중복 코드 ${lib.code}`);
    codes.add(lib.code);
    assert.ok(lib.name);
    assert.ok(!/&middot;|&amp;/.test(lib.closed + lib.hours), 'HTML 엔티티가 남아 있음');
  }
});

test('도서관 검색과 근처 찾기', async () => {
  const json = JSON.parse(await readFile(new URL('data/libraries.json', root), 'utf8'));
  setLibraries(json);
  const found = searchLibraries('경북도서관', { region: '37' });
  assert.ok(found.length >= 1);
  assert.equal(found[0].name, '경북도서관');
  assert.equal(getLibrary(found[0].code).name, '경북도서관');
  const near = nearbyLibraries(36.5684, 128.7294, { limit: 5 }); // 안동시청 근처
  assert.equal(near.length, 5);
  assert.ok(near[0].km <= near[4].km);
});

test('정보나루 libSrch 항목 변환', () => {
  const entry = toLibraryEntry({ libCode: '147168', libName: '경북도서관', address: '경상북도 예천군 호명읍', latitude: '36.57', longitude: '128.48', operatingTime: '09:00~18:00', closed: '월요일&middot;공휴일' });
  assert.equal(entry.region, '37');
  assert.equal(entry.closed, '월요일·공휴일');
  assert.equal(toLibraryEntry({ libCode: 'x' }), null);
});

test('예시 데이터는 실제 ISBN과 겹치지 않는다', () => {
  const { books } = demo.searchBooks('');
  for (const b of books) {
    assert.ok(demo.isDemoIsbn(b.isbn13));
    assert.ok(!b.isbn13.startsWith('978') && !b.isbn13.startsWith('979'));
  }
  const e1 = demo.existFor(books[0].isbn13, '147168');
  assert.deepEqual(e1, demo.existFor(books[0].isbn13, '147168'), '같은 입력이면 같은 예시 결과');
});

test('서비스 워커가 미리 저장하는 파일이 모두 있다', async () => {
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  const list = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(list.length > 10);
  for (const file of list) await access(new URL(file, root));
});

test('배포 때 바꿔 넣는 미리보기 주소 자리표시가 index.html과 pages.yml에서 서로 맞다', async () => {
  const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  for (const tag of ['<meta property="og:url" content="./">', '<meta property="og:image" content="assets/og.png">']) {
    assert.ok(page.includes(tag), `index.html에 ${tag}`);
    assert.ok(workflow.includes(tag.replaceAll('"', '\\"')), `pages.yml이 ${tag}를 바꾼다`);
  }
  assert.ok(!page.includes('cdn.jsdelivr.net'), '글꼴은 직접 제공한다(바깥 CDN 요청 없음)');
});

test('배포 때 서비스 워커 버전에 커밋 번호를 붙이는 규칙이 sw.js와 맞다', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const lines = sw.split('\n').filter((line) => /^const VERSION = '[^']*';$/.test(line));
  assert.equal(lines.length, 1, 'sw.js에 VERSION 줄이 정확히 하나');
  assert.ok(workflow.includes(`sed -i "s/^const VERSION = '\\([^']*\\)';/const VERSION = '\\1-\${GITHUB_SHA::7}';/" _site/sw.js`));
  assert.ok(!sw.includes('staleWhileRevalidate'), '화면 파일은 온라인이면 항상 새로 받는다');
});

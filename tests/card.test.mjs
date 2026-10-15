// 인스타그램 카드: 내용 정리·글자 맞추기·캡션, 그리고 실제 PNG 만들기
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { caption, cardModel, cardSvg, firstAuthor, fitText, shortTitle } from '../scripts/lib/card.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

const SAMPLE = {
  demo: false,
  endDt: '2026-10-11',
  period: '10월 5일~11일',
  regionName: '경북',
  ageName: '고등학생',
  items: [
    { rank: 1, isbn13: '9788937460449', title: '데미안 :에밀 싱클레어의 젊은 날 이야기', authors: '헤르만 헤세, 전영애' },
    { rank: 2, isbn13: '9788932917245', title: '어린 왕자', authors: '앙투안 드 생텍쥐페리' },
    { rank: 3, isbn13: '9788970127248', title: 'A & B <특별판>', authors: '' },
    { rank: 4, isbn13: '9788900000004', title: '넷째 책', authors: '작가' },
    { rank: 5, isbn13: '9788900000005', title: '다섯째 책', authors: '작가' },
    { rank: 6, isbn13: '9788900000006', title: '여섯째 책', authors: '작가' },
  ],
};

test('제목·저자 줄이기', () => {
  assert.equal(shortTitle('데미안 :에밀 싱클레어의 젊은 날 이야기'), '데미안');
  assert.equal(shortTitle('총, 균, 쇠 = Guns, germs, and steel'), '총, 균, 쇠');
  assert.equal(shortTitle('어린 왕자'), '어린 왕자');
  assert.equal(firstAuthor('헤르만 헤세, 전영애'), '헤르만 헤세');
  assert.equal(firstAuthor(''), '');
});

test('넘치는 글자는 말줄임표로 자른다', () => {
  const measure = (t) => [...t].length * 10;
  assert.equal(fitText('짧은 제목', 100, measure), '짧은 제목');
  const cut = fitText('가나다라마바사아자차카타파하', 80, measure);
  assert.ok(cut.endsWith('…'));
  assert.ok(measure(cut) <= 80);
  assert.equal(cut, '가나다라마바사…');
});

test('카드 내용: 이/가, 다섯 권, 출처', () => {
  const model = cardModel(SAMPLE);
  assert.deepEqual(model.lines, ['이번 주 고등학생이', '가장 많이 빌린 책']);
  assert.equal(model.subtitle, '경북 공공도서관 · 10월 5일~11일');
  assert.equal(model.items.length, 5);
  assert.equal(model.items[0].title, '데미안');
  assert.equal(model.items[0].author, '헤르만 헤세');
  assert.equal(cardModel({ ...SAMPLE, ageName: '20대' }).lines[0], '이번 주 20대가');
  assert.equal(cardModel({ ...SAMPLE, regionName: '' }).subtitle.startsWith('전국'), true);
});

test('SVG는 특수문자를 안전하게 넣고, 캡션에 출처와 해시태그가 있다', () => {
  const model = cardModel(SAMPLE);
  const svg = cardSvg(model, (t) => [...t].length * 20);
  assert.ok(svg.includes('A &amp; B &lt;특별판&gt;'));
  assert.ok(!svg.includes('<특별판>'));
  assert.ok(svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
  const text = caption(model);
  assert.match(text, /^이번 주 고등학생이 가장 많이 빌린 책 TOP 5/);
  assert.match(text, /1\. 데미안 — 헤르만 헤세/);
  assert.match(text, /3\. A & B <특별판>\n/);
  assert.match(text, /출처: 도서관 정보나루/);
  assert.match(text, /#고등학생책추천 #경북도서관$/);
});

test('카드 만들기 스크립트: 기록 파일로 1080×1350 PNG와 latest.json을 만든다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-card-'));
  await mkdir(join(dir, 'data', 'history'), { recursive: true });
  await writeFile(join(dir, 'data', 'popular.json'), JSON.stringify({ demo: true, items: [] }));
  await writeFile(join(dir, 'data', 'history', 'popular-2026-10-11.json'), JSON.stringify(SAMPLE));
  await writeFile(join(dir, 'data', 'history', 'popular-2026-10-04.json'), JSON.stringify({ ...SAMPLE, endDt: '2026-10-04', period: '9월 28일~10월 4일' }));
  const out = join(dir, 'cards');
  const result = await run(process.execPath, [join(root, 'scripts', 'make-cards.mjs'), out], {
    cwd: root,
    env: { ...process.env, DATA_DIR: join(dir, 'data') },
  });
  assert.match(result.stdout, /카드 2장/);
  const latest = JSON.parse(await readFile(join(out, 'latest.json'), 'utf8'));
  assert.equal(latest.image, 'popular-2026-10-11.png');
  assert.equal(latest.items.length, 5);
  const png = await readFile(join(out, latest.image));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
  assert.match(await readFile(join(out, 'popular-2026-10-04.txt'), 'utf8'), /9월 28일~10월 4일/);
});

test('카드 만들기 스크립트: 실제 데이터가 없으면 아무것도 만들지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-card-'));
  await mkdir(join(dir, 'data'), { recursive: true });
  await writeFile(join(dir, 'data', 'popular.json'), JSON.stringify({ demo: true, items: [] }));
  const result = await run(process.execPath, [join(root, 'scripts', 'make-cards.mjs'), join(dir, 'cards')], {
    cwd: root,
    env: { ...process.env, DATA_DIR: join(dir, 'data') },
  });
  assert.match(result.stdout, /카드를 만들지 않아요/);
});

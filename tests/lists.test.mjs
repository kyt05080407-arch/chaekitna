// 책 목록 한 번에 확인: 책 고르기, 붙여 넣은 목록 읽기, 내 도서관과 맞추기, 목록 만들기 스크립트
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { authorKeysOf, authorMatches, groupByRegion, overlap, parsePasted, pickMatch, tally, titleScore } from '../js/lists.js';
import { attemptsFor, lookupKey, resolveList } from '../scripts/lib/lists.mjs';

const book = (title, authors, isbn13 = '9788900000001') => ({ title, authors, isbn13 });

test('제목 점수: 같음 3, 시작 2, 포함 1 (띄어쓰기·가운뎃점 무시)', () => {
  assert.equal(titleScore('카라마조프가의 형제들', '카라마조프가의형제들'), 3);
  assert.equal(titleScore('토지 1', '토지'), 2);
  assert.equal(titleScore('연암산문정독', '연암 산문'), 2);
  assert.equal(titleScore('정본 백석 시집', '백석 시집'), 1);
  assert.equal(titleScore('광장·구운몽', '구운몽'), 1);
  assert.equal(titleScore('데미안', '광장'), 0);
});

test('저자 열쇠: 하나라도 맞으면 같은 저자, 열쇠가 없으면 따지지 않음', () => {
  assert.ok(authorMatches('표도르 도스토옙스키, 김연경', ['도스토예프스키', '도스토옙스키']));
  assert.ok(!authorMatches('장 자크 루소', ['아우구스티누스']));
  assert.ok(authorMatches('아무개', []));
});

test('책 고르기: 저자가 다르면 빼고, 만화·어린이판은 원래 책이 있으면 뒤로', () => {
  const results = [
    book('만화 그리스 로마 신화 1', '홍은영', '9788900000001'),
    book('고백록', '장 자크 루소', '9788900000002'),
    book('고백록', '아우구스티누스, 김기찬', '9788900000003'),
  ];
  assert.equal(pickMatch(results, { query: '고백록', authorKeys: ['아우구스티누스'] }).isbn13, '9788900000003');
  assert.equal(pickMatch(results, { query: '국부론', authorKeys: ['스미스'] }), null);
  const myth = [
    book('그리스 로마 신화 1 : 신들의 왕 제우스 (만화)', '홍은영', '9788900000010'),
    book('그리스 로마 신화', '토머스 불핀치', '9788900000011'),
  ];
  assert.equal(pickMatch(myth, { query: '그리스 로마 신화' }).isbn13, '9788900000011');
  // 다른 판만 있고 제목이 정확히 같지 않으면 고르지 않는다(틀린 책보다 '못 찾음'이 낫다)
  assert.equal(pickMatch([book('만화 논어', '아무개')], { query: '논어' }), null);
  // 점수가 같으면 먼저 나온 책(대출 많은 책)
  assert.equal(pickMatch([book('변신', '카프카', '9788900000020'), book('변신', '카프카', '9788900000021')], { query: '변신', authorKeys: ['카프카'] }).isbn13, '9788900000020');
  // ISBN이 없는 결과는 고르지 않는다
  assert.equal(pickMatch([{ title: '논어', authors: '', isbn13: '' }], { query: '논어' }), null);
});

test('붙여 넣은 목록 읽기: 번호·글머리표·따옴표·저자 구분을 정리한다', () => {
  const text = [
    '1. 데미안 - 헤르만 헤세',
    '2) 아몬드 / 손원평',
    '• 『소년이 온다』 한강',
    '- 어린 왕자 (생텍쥐페리)',
    '',
    '82년생 김지영',
    '1984 by 조지 오웰',
    '9788937460449',
    '978-89-374-6044-9',
    '데미안 - 헤르만 헤세',
  ].join('\n');
  assert.deepEqual(parsePasted(text), [
    { title: '데미안', author: '헤르만 헤세', isbn: '' },
    { title: '아몬드', author: '손원평', isbn: '' },
    { title: '소년이 온다', author: '한강', isbn: '' },
    { title: '어린 왕자', author: '생텍쥐페리', isbn: '' },
    { title: '82년생 김지영', author: '', isbn: '' },
    { title: '1984', author: '조지 오웰', isbn: '' },
    { title: '', author: '', isbn: '9788937460449' },
  ]);
  assert.equal(parsePasted(Array.from({ length: 50 }, (_, i) => `책 ${i}`).join('\n')).length, 30, '최대 30권');
  assert.deepEqual(authorKeysOf('헤르만 헤세'), ['헤르만 헤세', '헤세']);
  assert.deepEqual(authorKeysOf('한강'), ['한강']);
  assert.deepEqual(authorKeysOf(''), []);
});

test('내 도서관과 맞추기: 시·도별로 묶고, 잘린 목록에 없는 곳은 모름', () => {
  const libs = { 1: { region: '37' }, 2: { region: '37' }, 3: { region: '11' }, 4: null };
  const byRegion = groupByRegion(['1', '2', '3', '4'], (c) => libs[c]);
  assert.deepEqual([...byRegion], [['37', ['1', '2']], ['11', ['3']]]);
  const res = { 37: { codes: ['2', '9'], total: 2 }, 11: { codes: ['8'], total: 150 } };
  assert.deepEqual(overlap(byRegion, (r) => res[r]), { have: ['2'], unknown: ['3'] });
  assert.equal(overlap(byRegion, (r) => (r === '37' ? res[r] : null)), null, '조회하지 않은 시·도가 있으면 결과 없음');
  assert.deepEqual(tally([{ have: ['2'], unknown: [] }, { have: [], unknown: ['3'] }, { have: [], unknown: [] }, undefined]), { checked: 3, have: 1, unknown: 1 });
});

test('조회 방법: 저자가 있으면 제목+저자 칸, 다음은 키워드', () => {
  assert.deepEqual(attemptsFor('국가', ['플라톤']), [{ title: '국가', author: '플라톤' }, { keyword: '국가' }]);
  assert.deepEqual(attemptsFor('논어', []), [{ title: '논어' }, { keyword: '논어' }]);
});

test('목록 만들기: 지난번에 찾은 책은 다시 찾지 않고, 찾는 방법이 바뀌면 다시 찾는다', async () => {
  const src = {
    id: 't',
    title: '시험 목록',
    books: [
      { no: 1, field: 'a', title: '국가', author: '플라톤', queries: ['국가'], authorKeys: ['플라톤'] },
      { no: 2, field: 'a', title: '논어', author: '', queries: ['논어'], authorKeys: [] },
      { no: 3, field: 'a', title: '없는 책', author: '', queries: ['없는 책', '없는 책 2'], authorKeys: [] },
    ],
  };
  const calls = [];
  const search = async (params) => {
    calls.push(params);
    const q = params.title || params.keyword;
    if (q.startsWith('없는')) return [];
    return [book(q, params.author || '아무개', q === '국가' ? '9788900000100' : '9788900000200')];
  };
  const budget = { left: 50 };
  const first = await resolveList(src, new Map(), search, { budget });
  assert.deepEqual(first.list.books.map((b) => b.match && b.match.isbn13), ['9788900000100', '9788900000200', undefined]);
  assert.deepEqual(first.stats.missing, ['없는 책']);
  assert.equal(calls.length, 1 + 1 + 4, '찾으면 멈추고, 못 찾으면 검색어마다 두 방법');
  assert.equal(budget.left, 44);
  assert.equal(first.list.title, '시험 목록');

  // 두 번째: 찾은 두 권은 그대로, 못 찾은 책만 다시
  calls.length = 0;
  const prev = new Map(first.list.books.map((b) => [b.no, b]));
  const second = await resolveList(src, prev, search, { budget: { left: 50 } });
  assert.equal(second.stats.reused, 2);
  assert.equal(calls.length, 4);

  // 찾는 방법이 바뀌면 다시 찾는다
  calls.length = 0;
  const changed = { ...src, books: [{ ...src.books[0], queries: ['국가', '플라톤 국가'] }] };
  await resolveList(changed, prev, search, { budget: { left: 50 } });
  assert.equal(calls.length, 1);
  assert.notEqual(lookupKey(changed.books[0]), lookupKey(src.books[0]));

  // 호출 한도를 다 쓰면 남은 책은 다음에(못 찾음으로 치지 않음)
  const limited = await resolveList(src, new Map(), search, { budget: { left: 1 } });
  assert.equal(limited.stats.found, 1);
  assert.equal(limited.stats.skipped, 2);
  assert.deepEqual(limited.stats.missing, []);
});

test('목록 만들기: 인증키 문제 같은 오류는 바로 멈춘다', async () => {
  const src = { id: 't', books: [{ no: 1, title: '국가', queries: ['국가'], authorKeys: [] }] };
  const fatal = Object.assign(new Error('정보나루 오류: 인증키'), { fatal: true });
  await assert.rejects(resolveList(src, new Map(), async () => { throw fatal; }, { budget: { left: 5 } }), /인증키/);
  // 다른 오류는 다음 방법으로 넘어간다
  let n = 0;
  const flaky = async (params) => {
    n += 1;
    if (params.title) throw new Error('검색 칸 오류');
    return [book('국가', '플라톤')];
  };
  const r = await resolveList(src, new Map(), flaky, { budget: { left: 5 } });
  assert.equal(r.stats.found, 1);
  assert.equal(n, 2);
});

// ---------- 스크립트를 가짜 정보나루로 실제 실행 ----------

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const mock = fileURLToPath(new URL('./helpers/mock-fetch.mjs', import.meta.url));

async function runBuild(dir, env = {}) {
  const result = await run(process.execPath, ['--import', mock, join(root, 'scripts', 'build-lists.mjs')], {
    cwd: root,
    env: { ...process.env, D4L_AUTH_KEY: 'fake-key', OUT_DIR: dir, LISTS_SRC: join(dir, 'src.json'), MOCK_LOG: '1', MOCK_SCENARIO: 'lists', ...env },
  }).catch((error) => error);
  const calls = JSON.parse((String(result.stdout).match(/MOCK_CALLS (.*)/) || [null, '[]'])[1]);
  return { result, calls };
}

test('목록 만들기 스크립트: 권장도서 ISBN 찾기 + 중·고등학생 인기, 두 번째 실행은 검색을 다시 하지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-lists-'));
  const src = {
    lists: [
      {
        id: 'snu100',
        title: '권장도서',
        fields: [{ id: 'ko', label: '한국문학' }],
        books: [
          { no: 1, field: 'ko', title: '광장', author: '최인훈', queries: ['광장'], authorKeys: ['최인훈'] },
          { no: 2, field: 'ko', title: '춘향전', author: '', queries: ['춘향전'], authorKeys: [] },
          { no: 3, field: 'ko', title: '없는책', author: '', queries: ['없는책'], authorKeys: [] },
        ],
      },
    ],
  };
  await writeFile(join(dir, 'src.json'), JSON.stringify(src));
  const first = await runBuild(dir);
  assert.equal(first.result.code ?? 0, 0, String(first.result.stderr));
  const file = JSON.parse(await readFile(join(dir, 'lists.json'), 'utf8'));
  assert.deepEqual(file.lists.map((l) => l.id), ['snu100', 'teen-high', 'teen-mid']);
  const snu = file.lists[0];
  assert.equal(snu.books[0].match.title, '광장', '부제는 떼고, 만화판이 아닌 책');
  assert.equal(snu.books[0].match.authors, '최인훈');
  assert.match(snu.books[0].match.cover, /^https:/);
  assert.ok(snu.books[1].match);
  assert.equal(snu.books[2].match, undefined);
  assert.deepEqual(snu.fields, src.lists[0].fields);
  assert.match(first.result.stdout, /3권 중 2권 찾음/);
  assert.match(first.result.stdout, /못 찾음::없는책/);
  const search = first.calls.filter((c) => c.includes('srchBooks'));
  assert.equal(search.length, 1 + 1 + 2);
  assert.match(search[0], /title=%EA%B4%91%EC%9E%A5/);
  assert.match(search[0], /author=/);
  assert.ok(search.every((c) => /sort=loan/.test(c) && /pageSize=50/.test(c)));
  // 중·고등학생 인기(최근 30일)
  const loans = first.calls.filter((c) => c.includes('loanItemSrch'));
  assert.equal(loans.length, 2);
  assert.match(loans[0], /age=a17/);
  assert.match(loans[1], /age=a14/);
  const high = file.lists[1];
  assert.equal(high.kind, 'popular');
  assert.equal(high.books.length, 10);
  assert.equal(high.books[0].match.isbn13, '9791100000000');
  assert.match(high.description, /고등학생이 많이 빌린 책 10권/);
  assert.ok(!first.result.stdout.includes('fake-key'), '인증키가 로그에 나오면 안 된다');

  // 두 번째 실행: 찾은 책은 그대로, 못 찾은 책만 다시 찾는다
  const second = await runBuild(dir);
  assert.equal(second.result.code ?? 0, 0, String(second.result.stderr));
  assert.equal(second.calls.filter((c) => c.includes('srchBooks')).length, 2);
  const again = JSON.parse(await readFile(join(dir, 'lists.json'), 'utf8'));
  assert.deepEqual(again.lists[0].books[0].match, snu.books[0].match);
});

test('목록 만들기 스크립트: 제목 칸 검색이 안 되면 키워드로 찾고, 오프라인이면 부르지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-lists-'));
  await writeFile(
    join(dir, 'src.json'),
    JSON.stringify({ lists: [{ id: 'snu100', title: '권장도서', books: [{ no: 1, field: 'ko', title: '춘향전', author: '', queries: ['춘향전'], authorKeys: [] }] }] }),
  );
  const fallback = await runBuild(dir, { MOCK_NO_TITLE: '1' });
  assert.equal(fallback.result.code ?? 0, 0, String(fallback.result.stderr));
  const file = JSON.parse(await readFile(join(dir, 'lists.json'), 'utf8'));
  assert.ok(file.lists[0].books[0].match);
  assert.match(fallback.result.stdout, /찾은 방법 keyword 1/);

  const dir2 = await mkdtemp(join(tmpdir(), 'chaekitna-lists-'));
  await writeFile(join(dir2, 'src.json'), await readFile(join(dir, 'src.json'), 'utf8'));
  const offline = await runBuild(dir2, { LISTS_OFFLINE: '1', D4L_AUTH_KEY: '' });
  assert.equal(offline.result.code ?? 0, 0, String(offline.result.stderr));
  assert.deepEqual(offline.calls, []);
  const off = JSON.parse(await readFile(join(dir2, 'lists.json'), 'utf8'));
  assert.equal(off.lists.length, 1);
  assert.equal(off.lists[0].books[0].match, undefined);
});

test('저장소의 권장도서 원본: 100권, 분야 다섯 개, 번호가 1~100', async () => {
  const src = JSON.parse(await readFile(new URL('../data/lists-src.json', import.meta.url), 'utf8'));
  const snu = src.lists.find((l) => l.id === 'snu100');
  assert.equal(snu.books.length, 100);
  assert.deepEqual(snu.books.map((b) => b.no), Array.from({ length: 100 }, (_, i) => i + 1));
  const fields = new Set(snu.fields.map((f) => f.id));
  assert.equal(fields.size, 5);
  assert.ok(snu.books.every((b) => fields.has(b.field) && b.title && Array.isArray(b.queries) && b.queries.length && Array.isArray(b.authorKeys)));
  const count = (f) => snu.books.filter((b) => b.field === f).length;
  assert.deepEqual(['ko', 'for', 'east', 'west', 'sci'].map(count), [17, 31, 13, 28, 11]);
});

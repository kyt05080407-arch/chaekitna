// GitHub Actions 스크립트를 가짜 정보나루 응답으로 실제 실행해 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { koreanRange, kstDate } from '../scripts/lib/d4l.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const mock = fileURLToPath(new URL('./helpers/mock-fetch.mjs', import.meta.url));

async function runScript(script, env) {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-'));
  const result = await run(process.execPath, ['--import', mock, join(root, 'scripts', script)], {
    cwd: root,
    env: { ...process.env, D4L_AUTH_KEY: 'fake-key', OUT_DIR: dir, MOCK_LOG: '1', ...env },
  }).catch((error) => error);
  return { dir, result };
}

test('기간 표시', () => {
  assert.equal(koreanRange('2026-10-05', '2026-10-11'), '10월 5일~11일');
  assert.equal(koreanRange('2026-09-28', '2026-10-04'), '9월 28일~10월 4일');
  assert.match(kstDate(0), /^\d{4}-\d{2}-\d{2}$/);
});

test('인기 도서: 경북 고등학생 TOP 10 저장 + 기록 쌓기', async () => {
  const { dir, result } = await runScript('fetch-popular.mjs', {});
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  const file = JSON.parse(await readFile(join(dir, 'popular.json'), 'utf8'));
  assert.equal(file.demo, false);
  assert.equal(file.region, '37');
  assert.equal(file.regionName, '경북');
  assert.equal(file.ageName, '고등학생');
  assert.equal(file.items.length, 10);
  assert.equal(file.items[0].authors, '저자1');
  const history = await readdir(join(dir, 'history'));
  assert.equal(history.length, 1);
  assert.ok(!result.stdout.includes('fake-key'), '인증키가 로그에 나오면 안 된다');
});

test('인기 도서: 데이터가 적으면 청소년으로 넓힌다', async () => {
  const { dir, result } = await runScript('fetch-popular.mjs', { MOCK_SCENARIO: 'sparse' });
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  const file = JSON.parse(await readFile(join(dir, 'popular.json'), 'utf8'));
  assert.equal(file.age, '14');
  assert.equal(file.ageName, '청소년');
});

test('도서관 목록: 여러 쪽을 받아 합친다', async () => {
  const { dir, result } = await runScript('fetch-libraries.mjs', {});
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  const file = JSON.parse(await readFile(join(dir, 'libraries.json'), 'utf8'));
  assert.equal(file.count, 1500);
  assert.equal(file.libraries.find((l) => l.code === '100001').region, '37');
  assert.equal(file.libraries[0].closed.includes('&middot;'), false);
});

test('도서관 목록: 너무 적게 오면 덮어쓰지 않는다', async () => {
  const dir0 = await mkdtemp(join(tmpdir(), 'chaekitna-'));
  await writeFile(join(dir0, 'libraries.json'), JSON.stringify({ libraries: new Array(1500).fill({}) }));
  const result = await run(process.execPath, ['--import', mock, join(root, 'scripts', 'fetch-libraries.mjs')], {
    cwd: root,
    env: { ...process.env, D4L_AUTH_KEY: 'fake-key', OUT_DIR: dir0, MOCK_SCENARIO: 'few-libs' },
  }).catch((error) => error);
  assert.equal(result.code, 1);
  const kept = JSON.parse(await readFile(join(dir0, 'libraries.json'), 'utf8'));
  assert.equal(kept.libraries.length, 1500);
});

test('인증키가 없으면 안내하고 끝낸다', async () => {
  const result = await run(process.execPath, [join(root, 'scripts', 'fetch-popular.mjs')], {
    cwd: root,
    env: { ...process.env, D4L_AUTH_KEY: '' },
  }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.match(String(result.stderr), /D4L_AUTH_KEY/);
});

test('프록시 점검: 정상이면 어제 사용량까지 보여준다', async () => {
  const { result } = await runScript('healthcheck.mjs', { PROXY_URL: 'https://proxy.example/exec' });
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  assert.match(result.stdout, /프록시 정상/);
  assert.match(result.stdout, /어제\(2026-10-14\) 호출 120\/450/);
  assert.match(result.stdout, /정보나루 연결 정상/);
  assert.match(result.stdout, /지난 7일: 정보나루 호출 120번 · 검색 35 · 대출 확인 70 · 넓게 찾기 0 · 책 소개 1 · 알림 구독 2/);
  assert.doesNotMatch(result.stdout, /::warning::/);
});

test('프록시 점검: 정보나루까지 닿지 않으면 실패(이슈 생성 단계로)', async () => {
  const upstream = await runScript('healthcheck.mjs', { PROXY_URL: 'https://proxy.example/exec', MOCK_SCENARIO: 'health-upstream' });
  assert.equal(upstream.result.code, 1);
  assert.match(upstream.result.stderr, /정보나루 조회 실패: upstream/);
  const empty = await runScript('healthcheck.mjs', { PROXY_URL: 'https://proxy.example/exec', MOCK_SCENARIO: 'health-empty' });
  assert.equal(empty.result.code, 1);
  assert.match(empty.result.stderr, /검색 결과가 비어/);
});

test('프록시 점검: 어제 한도의 90%를 넘으면 경고', async () => {
  const { result } = await runScript('healthcheck.mjs', { PROXY_URL: 'https://proxy.example/exec', MOCK_SCENARIO: 'health-busy' });
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  assert.match(result.stdout, /::warning::어제 호출 한도의 90%/);
});

test('프록시 점검: 인증키가 없으면 실패(이슈 생성 단계로)', async () => {
  const { result } = await runScript('healthcheck.mjs', { PROXY_URL: 'https://proxy.example/exec', MOCK_SCENARIO: 'health-nokey' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /인증키\(D4L_AUTH_KEY\)가 없어요/);
});

test('프록시 점검: 주소가 아직 없으면 건너뛴다', async () => {
  const { result } = await runScript('healthcheck.mjs', { PROXY_URL: '' });
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  assert.match(result.stdout, /건너뜁니다/);
});

test('인기 도서: 잘못된 지역·연령 코드는 저장하지 않고 멈춘다', async () => {
  const { result } = await runScript('fetch-popular.mjs', { POPULAR_REGION: '99' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /POPULAR_REGION\(99\)/);
  const bad = await runScript('fetch-popular.mjs', { POPULAR_AGE: 'teen' });
  assert.equal(bad.result.code, 1);
});

test('인기 도서: 연령이 이미 청소년이면 같은 조회를 두 번 하지 않는다', async () => {
  const { result } = await runScript('fetch-popular.mjs', { POPULAR_AGE: '14', MOCK_SCENARIO: 'sparse' });
  assert.equal(result.code ?? 0, 0, String(result.stderr));
  const calls = JSON.parse(result.stdout.match(/MOCK_CALLS (.*)/)[1]);
  assert.equal(calls.length, new Set(calls).size);
});

test('API 점검: 여섯 가지 응답을 앱 파서로 읽어 본다', async () => {
  const { result } = await runScript('check-api.mjs', {});
  assert.equal(result.code ?? 0, 0, String(result.stderr) + result.stdout);
  assert.equal((result.stdout.match(/^통과/gm) || []).length, 6);
  assert.match(result.stdout, /모두 통과했어요/);
  assert.ok(!result.stdout.includes('fake-key'));
  const calls = JSON.parse(result.stdout.match(/MOCK_CALLS (.*)/)[1]);
  assert.equal(calls.length, 6, '호출은 6번');
});

test('API 점검: 응답 모양이 다르면 실패로 끝난다', async () => {
  const { result } = await runScript('check-api.mjs', { MOCK_SCENARIO: 'exist-broken' });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /실패 · 대출 가능 bookExist/);
});

// 아침 알림: 계산 함수와 보내기 스크립트(가짜 프록시·가짜 web-push로 실제 실행)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildMessage, newlyAvailable, nextState, planChecks } from '../scripts/lib/alerts.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const mockFetch = fileURLToPath(new URL('./helpers/mock-fetch.mjs', import.meta.url));
const mockPush = fileURLToPath(new URL('./helpers/mock-web-push.mjs', import.meta.url));

const X = '9788937460449';
const Y = '9788932917245';

test('확인할 쌍: 같은 쌍은 한 번만, 최근 구독부터 상한까지', () => {
  const subs = [
    { updatedAt: '2026-10-01', libs: ['1', '2'], items: [{ isbn: X }, { isbn: Y }] },
    { updatedAt: '2026-10-10', libs: ['2', '3'], items: [{ isbn: X }] },
  ];
  const all = planChecks(subs);
  assert.equal(all.pairs, 5); // X:2 X:3 (최근 구독 먼저) + X:1 Y:1 Y:2
  assert.deepEqual([...all.byIsbn.get(X)].sort(), ['1', '2', '3']);
  const capped = planChecks(subs, { maxPairs: 2 });
  assert.equal(capped.pairs, 2);
  assert.deepEqual([...capped.byIsbn.get(X)], ['2', '3'], '최근에 갱신한 구독이 먼저');
  assert.equal(capped.skipped, 3);
});

test('새로 대출 가능: 어제 false → 오늘 true만, 처음 보는 쌍은 제외', () => {
  const sub = { libs: ['1', '2'], items: [{ isbn: X, title: '데미안' }, { isbn: Y, title: '어린 왕자' }] };
  const prev = { [`${X}:1`]: false, [`${X}:2`]: true };
  const current = { [`${X}:1`]: true, [`${X}:2`]: true, [`${Y}:1`]: true };
  assert.deepEqual(newlyAvailable(sub, prev, current), [{ isbn: X, title: '데미안', libs: ['1'] }]);
});

test('다음 상태: 확인 못 한 쌍은 이전 값 유지, 구독이 사라진 쌍은 지움', () => {
  const subs = [{ libs: ['1'], items: [{ isbn: X }, { isbn: Y }] }];
  const prev = { [`${X}:1`]: false, [`${Y}:1`]: true, 'old:9': false };
  const current = { [`${X}:1`]: true, [`${Y}:1`]: null };
  assert.deepEqual(nextState(subs, prev, current), { [`${X}:1`]: true, [`${Y}:1`]: true });
});

test('알림 문구', () => {
  const names = { 1: '안동시립도서관', 2: '경북도서관' };
  const one = buildMessage([{ isbn: X, title: '데미안', libs: ['1'] }], (c) => names[c]);
  assert.equal(one.body, "'데미안'을 안동시립도서관에서 빌릴 수 있어요. (어제 기준)");
  assert.equal(one.url, `#/book/${X}`);
  const twoLibs = buildMessage([{ isbn: X, title: '어린 왕자', libs: ['1', '2'] }], (c) => names[c]);
  assert.equal(twoLibs.body, "'어린 왕자'를 안동시립도서관 등 2곳에서 빌릴 수 있어요. (어제 기준)");
  const many = buildMessage([
    { isbn: X, title: '데미안', libs: ['1'] },
    { isbn: Y, title: '어린 왕자', libs: ['2'] },
  ]);
  assert.equal(many.body, "'데미안' 외 1권을 내 도서관에서 빌릴 수 있어요. (어제 기준)");
  assert.equal(many.url, '#/watchlist');
  assert.equal(buildMessage([{ isbn: X, title: '', libs: ['9'] }]).body, '관심 도서를 내 도서관에서 빌릴 수 있어요. (어제 기준)');
});

// ---------- 스크립트 실제 실행 ----------

const SUBS = [
  { endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' }, libs: ['147168', '147030'], items: [{ isbn: X, title: '데미안' }, { isbn: Y, title: '어린 왕자' }], updatedAt: '2026-10-14T00:00:00Z' },
  { endpoint: 'https://push.example/gone', keys: { p256dh: 'p', auth: 'a' }, libs: ['147168'], items: [{ isbn: X, title: '데미안' }], updatedAt: '2026-10-13T00:00:00Z' },
];

async function sendAlerts(dir, { avail = {}, env = {} } = {}) {
  const result = await run(process.execPath, ['--import', mockFetch, join(root, 'scripts', 'send-alerts.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      PROXY_URL: 'https://proxy.example/exec',
      ADMIN_TOKEN: 'admin-secret',
      VAPID_PUBLIC_KEY: 'test-public',
      VAPID_PRIVATE_KEY: 'test-private',
      WEB_PUSH_MODULE: mockPush,
      STATE_FILE: join(dir, 'state.json'),
      MOCK_SUBS: JSON.stringify(SUBS),
      MOCK_AVAIL: JSON.stringify(avail),
      MOCK_LOG: '1',
      ...env,
    },
  }).catch((error) => error);
  const pushes = JSON.parse((result.stdout.match(/MOCK_PUSH (.*)/) || [null, '[]'])[1]);
  const calls = JSON.parse((result.stdout.match(/MOCK_CALLS (.*)/) || [null, '[]'])[1]);
  return { result, pushes, calls };
}

test('보내기: 첫날은 기록만, 다음 날 새로 빌릴 수 있게 된 책만 알린다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-alerts-'));
  const libraries = JSON.parse(await readFile(join(root, 'data', 'libraries.json'), 'utf8')).libraries;
  const name147030 = libraries.find((l) => l.code === '147030').name;

  // 1일차: 모두 대출 중 → 보낼 것 없음, 상태 4쌍 저장
  const day1 = await sendAlerts(dir);
  assert.equal(day1.result.code ?? 0, 0, String(day1.result.stderr));
  assert.equal(day1.pushes.length, 0);
  const state1 = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).pairs;
  assert.equal(Object.keys(state1).length, 4);
  assert.ok(Object.values(state1).every((v) => v === false));
  assert.ok(!day1.result.stdout.includes('admin-secret'), '토큰이 로그에 나오면 안 된다');

  // 2일차: 데미안이 147030에서 반납됨 → a에게만 알림
  const day2 = await sendAlerts(dir, { avail: { [`${X}:147030`]: 'Y' } });
  assert.equal(day2.result.code ?? 0, 0, String(day2.result.stderr));
  assert.equal(day2.pushes.length, 1);
  assert.equal(day2.pushes[0].endpoint, 'https://push.example/a');
  assert.equal(day2.pushes[0].payload.body, `'데미안'을 ${name147030}에서 빌릴 수 있어요. (어제 기준)`);
  assert.equal(day2.pushes[0].payload.url, `#/book/${X}`);
  assert.equal(day2.pushes[0].ttl, 43200);

  // 3일차: 147168에서도 반납 → a, gone 둘 다 대상. gone은 410이라 프록시에서 구독을 지운다
  const day3 = await sendAlerts(dir, { avail: { [`${X}:147030`]: 'Y', [`${X}:147168`]: 'Y' } });
  assert.equal(day3.result.code ?? 0, 0, String(day3.result.stderr));
  assert.equal(day3.pushes.length, 1, '어제도 가능했던 147030은 다시 알리지 않는다');
  assert.ok(day3.calls.includes('POST unsubscribe https://push.example/gone'));
  assert.match(day3.result.stdout, /보냄 1 · 만료 정리 1 · 실패 0/);
});

test('보내기: 시험 실행은 보내지 않고, 한도에 걸리면 이전 상태를 지킨다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-alerts-'));
  await sendAlerts(dir);
  const dry = await sendAlerts(dir, { avail: { [`${X}:147030`]: 'Y' }, env: { ALERTS_DRY_RUN: '1', VAPID_PRIVATE_KEY: '' } });
  assert.equal(dry.result.code ?? 0, 0, String(dry.result.stderr));
  assert.equal(dry.pushes.length, 0);
  assert.match(dry.result.stdout, /알릴 대상 1명/);

  const budget = await sendAlerts(dir, { env: { MOCK_SCENARIO: 'budget' } });
  assert.equal(budget.result.code ?? 0, 0, String(budget.result.stderr));
  assert.match(budget.result.stdout, /::warning::오늘 호출 한도/);
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).pairs;
  assert.equal(state[`${X}:147030`], true, '한도에 걸린 날은 어제(시험 실행) 값을 그대로 둔다');
});

test('보내기: 준비가 안 됐거나 하나도 못 보내면 실패로 끝난다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chaekitna-alerts-'));
  const noToken = await sendAlerts(dir, { env: { ADMIN_TOKEN: '' } });
  assert.equal(noToken.result.code, 1);
  assert.match(noToken.result.stderr, /Secret ADMIN_TOKEN/);

  const wrongToken = await sendAlerts(dir, { env: { ADMIN_TOKEN: 'nope' } });
  assert.equal(wrongToken.result.code, 1);
  assert.match(wrongToken.result.stderr, /forbidden/);

  const broken = [{ ...SUBS[0], endpoint: 'https://push.example/broken' }];
  await sendAlerts(dir, { env: { MOCK_SUBS: JSON.stringify(broken) } });
  const fail = await sendAlerts(dir, { avail: { [`${X}:147030`]: 'Y' }, env: { MOCK_SUBS: JSON.stringify(broken) } });
  assert.equal(fail.result.code, 1);
  assert.match(fail.result.stderr, /VAPID 키/);
});

test('실제 web-push로 요청을 만들 수 있다(암호화·VAPID 서명·헤더)', async () => {
  const { default: webpush } = await import('web-push');
  const { createECDH, randomBytes } = await import('node:crypto');
  const { urlBase64ToUint8Array } = await import('../js/util.js');
  const keys = webpush.generateVAPIDKeys();
  const appKey = urlBase64ToUint8Array(keys.publicKey);
  assert.equal(appKey.length, 65, '앱이 PushManager에 넘기는 공개 키는 65바이트');
  assert.equal(appKey[0], 4);
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
  const message = buildMessage([{ isbn: X, title: '데미안', libs: ['1'] }], () => '경북도서관');
  const req = webpush.generateRequestDetails(subscription, JSON.stringify(message), {
    TTL: 12 * 60 * 60,
    urgency: 'normal',
    topic: 'availability',
    vapidDetails: { subject: 'https://github.com/example/chaekitna', publicKey: keys.publicKey, privateKey: keys.privateKey },
  });
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.TTL, 43200);
  assert.equal(req.headers.Topic, 'availability');
  assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
  assert.match(String(req.headers.Authorization), /^vapid t=.+, k=/);
  assert.ok(req.body.length > 0 && req.body.length < 4096, '푸시 본문은 4KB 안쪽');
});

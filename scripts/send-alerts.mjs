// 아침 알림 보내기 (GitHub Actions에서 매일 09:07 한국 시간에 실행)
// 1) 프록시에서 알림 구독 목록을 받는다(ADMIN_TOKEN 필요).
// 2) 구독한 책·도서관의 대출 가능 여부를 프록시로 확인한다(하루 호출 상한을 함께 쓴다).
// 3) 어제는 못 빌렸는데 오늘 빌릴 수 있게 된 책이 있는 사람에게만 웹 푸시를 보낸다.
// 4) 오늘 상태를 STATE_FILE에 저장한다(Actions 캐시로 다음 날에 넘긴다). 저장소에는 올리지 않는다.
//
// 환경변수: ADMIN_TOKEN, VAPID_PRIVATE_KEY (필수, Secret)
//          PROXY_URL, VAPID_PUBLIC_KEY (없으면 js/config.js 값), VAPID_SUBJECT (https 주소나 mailto:)
//          ALERT_MAX_PAIRS (기본 150), STATE_FILE (기본 .alerts-state/state.json), ALERTS_DRY_RUN=1 (보내지 않고 확인만)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../js/config.js';
import { parseExist, statusOf } from '../js/parse.js';
import { availabilityValue, buildMessage, chunk, newlyAvailable, nextState, pairKey, planChecks } from './lib/alerts.mjs';

const env = process.env;
const proxy = env.PROXY_URL || CONFIG.proxyUrl;
const publicKey = env.VAPID_PUBLIC_KEY || CONFIG.vapidPublicKey;
const privateKey = env.VAPID_PRIVATE_KEY || '';
const token = env.ADMIN_TOKEN || '';
const subject = env.VAPID_SUBJECT || 'https://github.com/';
const maxPairs = Number(env.ALERT_MAX_PAIRS) > 0 ? Number(env.ALERT_MAX_PAIRS) : 150;
const stateFile = resolve(env.STATE_FILE || '.alerts-state/state.json');
const dryRun = env.ALERTS_DRY_RUN === '1' || env.ALERTS_DRY_RUN === 'true';

const missing = [
  [!proxy, '프록시 주소(js/config.js의 proxyUrl)'],
  [!publicKey, '공개 키(js/config.js의 vapidPublicKey)'],
  [!privateKey && !dryRun, 'Secret VAPID_PRIVATE_KEY'],
  [!token, 'Secret ADMIN_TOKEN'],
].filter(([cond]) => cond);
if (missing.length) {
  console.error(`알림을 보낼 준비가 안 됐어요: ${missing.map(([, what]) => what).join(', ')}`);
  process.exit(1);
}

async function getJson(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJson(body) {
  const res = await fetch(proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
    signal: AbortSignal.timeout(60000),
  });
  return res.ok ? res.json() : null;
}

async function loadState() {
  try {
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    return saved && typeof saved.pairs === 'object' && saved.pairs ? saved.pairs : {};
  } catch {
    return {};
  }
}

async function libraryNames() {
  try {
    const file = JSON.parse(await readFile(new URL('../data/libraries.json', import.meta.url), 'utf8'));
    return new Map(file.libraries.map((lib) => [lib.code, lib.name]));
  } catch {
    return new Map();
  }
}

// ---------- 1) 구독 목록 ----------
const exported = await getJson(`${proxy}?op=export&token=${encodeURIComponent(token)}`);
if (exported.error) {
  console.error(`구독 목록을 받지 못했어요: ${exported.error}`);
  process.exit(1);
}
const subscriptions = Array.isArray(exported.subscriptions) ? exported.subscriptions.filter((s) => s && s.endpoint) : [];
const prev = await loadState();

// ---------- 2) 대출 가능 여부 확인 ----------
const plan = planChecks(subscriptions, { maxPairs });
const current = {};
let calls = 0;
let budgetHit = false;
outer: for (const [isbn, libs] of plan.byIsbn) {
  for (const batch of chunk([...libs], 5)) {
    const data = await getJson(`${proxy}?op=exist&isbn=${isbn}&libs=${batch.join(',')}`);
    calls += 1;
    if (data.error === 'budget') {
      budgetHit = true;
      break outer;
    }
    if (data.budget) budgetHit = true;
    const results = data.results || {};
    for (const lib of batch) {
      const entry = results[lib];
      current[pairKey(isbn, lib)] = !entry || entry.error ? null : availabilityValue(statusOf(parseExist(entry)));
    }
  }
}

// ---------- 3) 알림 보내기 ----------
const names = await libraryNames();
let webpush = null;
if (!dryRun) {
  const mod = env.WEB_PUSH_MODULE ? await import(pathToFileURL(resolve(env.WEB_PUSH_MODULE)).href) : await import('web-push');
  webpush = mod.default || mod;
}

let sent = 0;
let expired = 0;
let failed = 0;
let candidates = 0;
for (const sub of subscriptions) {
  const found = newlyAvailable(sub, prev, current);
  if (!found.length) continue;
  candidates += 1;
  const message = buildMessage(found, (code) => names.get(code) || '');
  if (dryRun) continue;
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(message), {
      TTL: 12 * 60 * 60,
      urgency: 'normal',
      topic: 'availability',
      vapidDetails: { subject, publicKey, privateKey },
    });
    sent += 1;
  } catch (error) {
    if (error && (error.statusCode === 404 || error.statusCode === 410)) {
      // 사용자가 알림을 끄거나 앱을 지워서 없어진 구독: 프록시에서도 지운다.
      expired += 1;
      await postJson({ op: 'unsubscribe', subscription: { endpoint: sub.endpoint } }).catch(() => null);
    } else {
      failed += 1;
    }
  }
}

// ---------- 4) 오늘 상태 저장 ----------
await mkdir(dirname(stateFile), { recursive: true });
await writeFile(
  stateFile,
  `${JSON.stringify({ savedAt: new Date().toISOString(), pairs: nextState(subscriptions, prev, current) })}\n`,
);

const checked = Object.values(current).filter((v) => typeof v === 'boolean').length;
console.log(
  [
    `구독 ${subscriptions.length}명`,
    `확인 ${checked}/${plan.pairs}쌍(호출 ${calls}번${plan.skipped ? `, 상한으로 ${plan.skipped}쌍 건너뜀` : ''})`,
    `알릴 대상 ${candidates}명`,
    dryRun ? '시험 실행이라 보내지 않음' : `보냄 ${sent} · 만료 정리 ${expired} · 실패 ${failed}`,
  ].join(' · '),
);
if (budgetHit) console.log('::warning::오늘 호출 한도에 걸려 일부만 확인했어요.');
if (failed && !sent) {
  // 하나도 못 보냈다면 키가 바뀌었거나 설정이 잘못된 것일 수 있다: 작업을 실패로 표시해 알아차리게 한다.
  console.error('알림을 하나도 보내지 못했어요. VAPID 키(공개·비공개 짝)를 확인해 주세요.');
  process.exitCode = 1;
} else if (failed) {
  console.log(`::warning::알림 ${failed}건을 보내지 못했어요(일시적인 오류일 수 있어요).`);
}

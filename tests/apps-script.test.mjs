// Apps Script 프록시(apps-script/Code.gs)를 Node에서 가짜 Google 서비스로 돌려 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const code = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function createEnv({ key = 'TEST_KEY', limit = '', upstream } = {}) {
  const props = new Map();
  if (key) props.set('D4L_AUTH_KEY', key);
  if (limit) props.set('DAILY_LIMIT', limit);
  const cache = new Map();
  const fetched = [];
  const triggers = [];

  const respond = (url) => {
    fetched.push(url);
    const body = upstream ? upstream(url) : { response: { result: { hasBook: 'Y', loanAvailable: 'N' } } };
    return {
      getResponseCode: () => (body === 500 ? 500 : 200),
      getContentText: () => JSON.stringify(body),
    };
  };

  const env = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: {
      fetch: (url) => respond(url),
      fetchAll: (reqs) => reqs.map((r) => respond(r.url)),
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => [...createHash(alg).update(text, 'utf8').digest()],
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
      formatDate: (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    Logger: { log() {} },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => {
        const spec = { fn };
        const builder = {
          timeBased: () => builder,
          everyDays: (n) => ((spec.everyDays = n), builder),
          atHour: (h) => ((spec.atHour = h), builder),
          create: () => {
            const t = { ...spec, getHandlerFunction: () => fn };
            triggers.push(t);
            return t;
          },
        };
        return builder;
      },
    },
  };
  vm.createContext(env);
  vm.runInContext(code, env);
  const get = (parameter) => JSON.parse(env.doGet({ parameter }).text);
  const post = (body) => JSON.parse(env.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { env, get, post, props, cache, fetched, triggers };
}

test('health는 키 설정 여부와 사용량을 알려준다', () => {
  const { get } = createEnv();
  const h = get({ op: 'health' });
  assert.equal(h.ok, true);
  assert.equal(h.keyConfigured, true);
  assert.equal(h.used, 0);
  assert.equal(h.limit, 450);
  assert.equal(h.yesterday.used, 0);
  assert.match(h.yesterday.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(h.yesterday.date, h.date);
});

test('검색: 키워드는 keyword, 13자리 숫자는 isbn13으로 보낸다', () => {
  const { get, fetched } = createEnv({ upstream: () => ({ response: { numFound: 0, docs: [] } }) });
  get({ op: 'search', q: '데미안', sort: 'loan' });
  assert.match(fetched[0], /srchBooks\?authKey=TEST_KEY&format=json/);
  assert.match(fetched[0], /keyword=%EB%8D%B0%EB%AF%B8%EC%95%88/);
  assert.match(fetched[0], /sort=loan&order=desc/);
  get({ op: 'search', q: '978-89-7199-855-7' });
  assert.match(fetched[1], /isbn13=9788971998557/);
});

test('같은 검색은 캐시에서 돌려주고 예산을 쓰지 않는다', () => {
  const { get, props, fetched } = createEnv({ upstream: () => ({ response: { docs: [] } }) });
  get({ op: 'search', q: '어린 왕자' });
  get({ op: 'search', q: '어린 왕자' });
  assert.equal(fetched.length, 1);
  const today = [...props.keys()].find((k) => k.startsWith('usage:'));
  assert.equal(props.get(today), '1');
});

test('잘못된 입력은 bad_request', () => {
  const { get } = createEnv();
  assert.equal(get({ op: 'search', q: '' }).error, 'bad_request');
  assert.equal(get({ op: 'exist', isbn: '123', libs: '147168' }).error, 'bad_request');
  assert.equal(get({ op: 'holdings', isbn: '9788971998557', region: '99' }).error, 'bad_request');
  assert.equal(get({ op: 'nope' }).error, 'bad_request');
});

test('exist: 여러 도서관을 한 번에, 캐시된 곳은 다시 부르지 않는다', () => {
  const { get, fetched } = createEnv();
  const r1 = get({ op: 'exist', isbn: '9788971998557', libs: '147168,147001,147168,abc' });
  assert.deepEqual(Object.keys(r1.results).sort(), ['147001', '147168']);
  assert.deepEqual(r1.results['147168'], { response: { result: { hasBook: 'Y', loanAvailable: 'N' } } });
  assert.equal(fetched.length, 2);
  get({ op: 'exist', isbn: '9788971998557', libs: '147168,50001' });
  assert.equal(fetched.length, 3, '147168은 캐시, 50001만 새로 호출');
  assert.match(fetched[2], /libCode=50001/);
});

test('하루 한도를 넘으면 budget 오류', () => {
  const { get } = createEnv({ limit: '2', upstream: () => ({ response: { docs: [] } }) });
  get({ op: 'search', q: 'a' });
  get({ op: 'search', q: 'b' });
  assert.equal(get({ op: 'search', q: 'c' }).error, 'budget');
  assert.equal(get({ op: 'search', q: 'a' }).error, undefined, '캐시된 검색은 한도와 상관없이 된다');
});

test('인증키가 없으면 not_configured', () => {
  const { get } = createEnv({ key: '' });
  assert.equal(get({ op: 'search', q: 'a' }).error, 'not_configured');
  assert.equal(get({ op: 'health' }).keyConfigured, false);
});

test('정보나루 오류 응답은 upstream으로 바꾸고 캐시하지 않는다', () => {
  const { get, cache } = createEnv({ upstream: () => ({ response: { error: '인증키 오류' } }) });
  assert.equal(get({ op: 'detail', isbn: '9788971998557' }).error, 'upstream');
  assert.equal(cache.size, 0);
});

test('알림 구독 저장과 관리자 내보내기', () => {
  const { get, post, props } = createEnv();
  props.set('ADMIN_TOKEN', 'secret-token');
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };
  const r = post({ op: 'subscribe', subscription: sub, items: [{ isbn: '9788971998557', libs: ['147168', 'x'] }] });
  assert.deepEqual(r, { ok: true, items: 1 });
  assert.equal(get({ op: 'export', token: 'wrong' }).error, 'forbidden');
  const exported = get({ op: 'export', token: 'secret-token' });
  assert.equal(exported.subscriptions.length, 1);
  assert.deepEqual(exported.subscriptions[0].items, [{ isbn: '9788971998557', libs: ['147168'] }]);
  post({ op: 'unsubscribe', subscription: sub });
  assert.equal(get({ op: 'export', token: 'secret-token' }).subscriptions.length, 0);
  assert.equal(post({ op: 'subscribe', subscription: { endpoint: 'http://insecure' } }).error, 'bad_request');
});

test('exist: 한도를 다 써도 캐시에 있던 도서관 결과는 돌려준다', () => {
  const { get, fetched } = createEnv({ limit: '1' });
  get({ op: 'exist', isbn: '9788971998557', libs: '147168' });
  const r = get({ op: 'exist', isbn: '9788971998557', libs: '147168,147001' });
  assert.equal(r.budget, true);
  assert.ok(r.results['147168'].response, '캐시된 결과');
  assert.deepEqual(r.results['147001'], { error: 'budget' });
  assert.equal(fetched.length, 1, '한도를 넘긴 뒤에는 정보나루를 부르지 않는다');
  assert.equal(get({ op: 'exist', isbn: '9788971998557', libs: '147002' }).error, 'budget', '캐시가 하나도 없으면 오류');
});

test('installTriggers는 여러 번 실행해도 정리 트리거를 하나만 남긴다', () => {
  const { env, triggers } = createEnv();
  env.installTriggers();
  env.installTriggers();
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].fn, 'cleanupOldCounters');
  assert.equal(triggers[0].atHour, 4);
});

test('cleanupOldCounters는 31일 지난 기록과 90일 지난 구독만 지운다', () => {
  const { env, props } = createEnv();
  const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() - n * 86400000));
  props.set(`usage:${day(40)}`, '10');
  props.set(`stats:${day(40)}`, '{}');
  props.set(`usage:${day(2)}`, '5');
  props.set('sub:old', JSON.stringify({ updatedAt: new Date(Date.now() - 100 * 86400000).toISOString() }));
  props.set('sub:new', JSON.stringify({ updatedAt: new Date().toISOString() }));
  props.set('sub:broken', '{');
  env.cleanupOldCounters();
  assert.equal(props.has(`usage:${day(40)}`), false);
  assert.equal(props.has(`stats:${day(40)}`), false);
  assert.equal(props.get(`usage:${day(2)}`), '5');
  assert.equal(props.has('sub:old'), false);
  assert.equal(props.has('sub:broken'), false);
  assert.equal(props.has('sub:new'), true);
  assert.equal(props.get('D4L_AUTH_KEY'), 'TEST_KEY', '설정값은 건드리지 않는다');
});

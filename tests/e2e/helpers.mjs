// 화면 점검 공용 도구: 콘솔 오류·바깥 요청 기록, 도서관 고르기, 가짜 프록시
import { expect } from '@playwright/test';

// 콘솔 오류/경고, 페이지 오류, 이 사이트 밖으로 나간 요청을 모은다(바깥 요청은 막는다).
export async function watchProblems(page, { allowHosts = [] } = {}) {
  const problems = { console: [], errors: [], external: [] };
  page.on('console', (msg) => {
    const text = msg.text();
    // 점검 도구가 서비스 워커를 막을 때 남기는 안내는 앱 문제가 아니다
    if (/registration blocked by Playwright/i.test(text)) return;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.console.push(text);
  });
  page.on('pageerror', (error) => problems.errors.push(String(error)));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:' || allowHosts.includes(url.hostname)) {
      return route.fallback();
    }
    problems.external.push(url.href.slice(0, 120));
    return route.abort();
  });
  return problems;
}

export function expectNoProblems(problems) {
  expect(problems.errors, '페이지 오류').toEqual([]);
  expect(problems.console, '콘솔 오류·경고').toEqual([]);
  expect(problems.external, '바깥 요청').toEqual([]);
}

// 경북 · 안동 두 곳 + 경북도서관 (147163, 147030, 147168)
export async function pickLibraries(page) {
  await page.goto('#/libraries');
  await page.locator('#lib-region').selectOption('37');
  const add = page.locator('#found [data-add]:not([disabled])');
  await page.locator('#lib-q').fill('안동');
  // 검색은 입력을 잠깐 기다렸다가 바뀌므로, 목록이 '안동'으로 바뀐 걸 확인하고 누른다
  await expect(page.locator('#found [data-add]').first()).toHaveAttribute('data-add', '147163');
  await add.first().click();
  await expect(page.locator('[data-add="147163"]')).toBeDisabled();
  await page.locator('[data-add="147030"]').click();
  await page.locator('#lib-q').fill('경북도서관');
  await expect(page.locator('#found [data-add]').first()).toHaveAttribute('data-add', '147168');
  await page.locator('[data-add="147168"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('chaekitna:myLibraries')))).toEqual(['147163', '147030', '147168']);
}

// ---------- 실제 모드용 가짜 프록시 ----------

export const BOOKS = [
  {
    bookname: '데미안',
    authors: '지은이: 헤르만 헤세 ; 옮긴이: 전영애',
    publisher: '민음사',
    publication_year: '2000',
    isbn13: '9788937460449',
    bookImageURL: '',
    loan_count: '1,234',
  },
  { bookname: '데미안 (큰글자책)', authors: '헤르만 헤세 지음', publisher: '더스토리', publication_year: '2021', isbn13: '9791164455221', bookImageURL: '', loan_count: '56' },
];

// 책 소개는 상세 조회(srchDtlList)에만 온다(검색 결과에는 없음)
export const DESCRIPTIONS = {
  9788937460449: '“새는 알에서 나오려고 투쟁한다.” 싱클레어가 자기 자신을 찾아가는 성장 이야기.<br>헤세의 대표작 &amp; 고전.',
};

// 도서관별 [소장, 대출 가능]
export const EXIST = { 147168: ['Y', 'Y'], 147030: ['Y', 'N'], 147163: ['N', 'N'] };

// 시험용으로 새로 만든 공개 키(짝이 되는 비공개 키는 버렸다)
export const TEST_VAPID_PUBLIC_KEY = 'BFOevrEIybrv8YLSt5GSvjdJ48_z1M3j3cjF_61tfsRqoBYCydngk2akLIPDD11wC4HjtADsyDb2358mZ_p1T2A';

// config.js를 바꿔 끼우고 proxy.example을 흉내 낸다. 반환값으로 호출 기록과 상태를 조절할 수 있다.
// target: page 또는 context (서비스 워커를 켠 시험은 context여야 워커가 보내는 요청도 바꿔 끼운다)
export async function fakeProxy(target) {
  const state = { budget: false, calls: [], posts: [] };
  await target.route('**/js/config.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text())
      .replace("proxyUrl: '',", "proxyUrl: 'https://proxy.example/exec',")
      .replace("vapidPublicKey: '',", `vapidPublicKey: '${TEST_VAPID_PUBLIC_KEY}',`);
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/javascript; charset=utf-8' } });
  });
  await target.route('https://proxy.example/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      state.posts.push(body);
      state.calls.push(`POST ${body.op}`);
      return route.fulfill({ json: { ok: true, items: (body.items || []).length, libs: (body.libs || []).length } });
    }
    const q = Object.fromEntries(new URL(req.url()).searchParams);
    state.calls.push(q.op);
    let data;
    if (q.op === 'search') data = { response: { numFound: BOOKS.length, docs: BOOKS.map((doc) => ({ doc })) } };
    else if (q.op === 'detail') {
      const book = BOOKS.find((b) => b.isbn13 === q.isbn) || BOOKS[0];
      data = { response: { detail: [{ book: { ...book, description: DESCRIPTIONS[book.isbn13] || '' } }] } };
    }
    else if (q.op === 'exist') {
      data = state.budget
        ? { error: 'budget', message: '오늘 조회 한도를 다 썼어요.' }
        : {
            results: Object.fromEntries(
              (q.libs || '').split(',').map((code) => {
                const [hasBook, loanAvailable] = EXIST[code] || ['N', 'N'];
                return [code, { response: { result: { hasBook, loanAvailable } } }];
              }),
            ),
          };
    } else if (q.op === 'holdings') {
      data = {
        response: {
          numFound: 2,
          libs: [
            { lib: { libCode: '147001', libName: '경산시립도서관', address: '경상북도 경산시' } },
            { lib: { libCode: '147168', libName: '경북도서관', address: '' } },
          ],
        },
      };
    } else data = { error: 'bad_request', message: '알 수 없는 요청이에요.' };
    return route.fulfill({ json: data });
  });
  return state;
}

// 이 환경에서는 브라우저 푸시 서비스에 연결할 수 없어서 구독 객체만 가짜로 만든다.
export async function fakePushManager(context) {
  await context.addInitScript(() => {
    PushManager.prototype.subscribe = async function subscribe() {
      window.__fakeSub = {
        endpoint: 'https://push.example/fake',
        unsubscribe: async () => {
          window.__fakeSub = null;
          return true;
        },
        toJSON() {
          return { endpoint: this.endpoint, keys: { p256dh: 'BPfake', auth: 'authfake' } };
        },
      };
      return window.__fakeSub;
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      return window.__fakeSub || null;
    };
  });
}

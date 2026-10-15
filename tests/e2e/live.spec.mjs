// 실제 데이터 모드: 가짜 프록시로 검색 → 상세 → 휴관일 → 책 소개 → 아침 알림 → 한도 초과까지
import { test, expect } from '@playwright/test';
import { expectNoProblems, fakeProxy, fakePushManager, pickLibraries, watchProblems } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

let problems;
let proxy;
test.beforeEach(async ({ page, context, baseURL }) => {
  problems = await watchProblems(page, { allowHosts: ['proxy.example'] });
  // 서비스 워커를 켠 시험은 워커가 보내는 요청도 바꿔 끼우도록 context에 건다
  proxy = await fakeProxy(test.info().project.use.serviceWorkers === 'allow' || /아침 알림/.test(test.info().title) ? context : page);
  await fakePushManager(context);
  await context.grantPermissions(['notifications'], { origin: baseURL.replace(/\/$/, '') });
});
test.afterEach(() => expectNoProblems(problems));

async function openFirstResult(page) {
  await page.locator('a.tab[data-tab=home]').click();
  await page.locator('#q').fill('데미안');
  await page.locator('#q').press('Enter');
  await expect(page.locator('#results .row')).toHaveCount(2);
  await page.locator('#results .row').first().click();
  await expect(page.locator('#mine .card')).toHaveCount(3);
  await expect(page.locator('#mine [data-status] .badge--unknown')).toHaveCount(0);
}

test('검색 결과와 도서관별 상태(예시 표시 없음)', async ({ page }) => {
  await pickLibraries(page);
  await expect(page.locator('.notice--demo')).toHaveCount(0);
  await openFirstResult(page);
  await expect(page.locator('#mine .card [data-status]')).toHaveText(['소장 안 함', '대출 중', '대출 가능']);
  await expect(page.locator('#summary .summary__main')).toHaveText('내 도서관 3곳 중 1곳에서 빌릴 수 있어요');
  await expect(page.locator('.badge--demo')).toHaveCount(0);
  await page.locator('#find-wide').click();
  await expect(page.locator('#wide .row')).toHaveCount(1); // 내 도서관(경북도서관)은 빼고 보여 준다
});

test('정기 휴관일인 날은 도서관 카드에 알려 준다', async ({ page }) => {
  // 2026-10-19는 셋째 월요일: 세 도서관 모두 '매월 첫번째, 세번째 월요일' 휴관
  await page.clock.setFixedTime(new Date('2026-10-19T10:00:00+09:00'));
  await pickLibraries(page);
  await openFirstResult(page);
  await expect(page.locator('#mine .card__alert')).toHaveCount(3);
  await expect(page.locator('#mine .card__alert').first()).toHaveText('오늘은 정기 휴관일이에요');
});

test('평일에는 휴관 알림이 없다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T10:00:00+09:00'));
  await pickLibraries(page);
  await openFirstResult(page);
  await expect(page.locator('#mine .card__alert')).toHaveCount(0);
});

test('책 소개는 눌렀을 때만 불러온다', async ({ page }) => {
  await pickLibraries(page);
  await openFirstResult(page);
  expect(proxy.calls).not.toContain('detail');
  await page.locator('#intro').click();
  await expect(page.locator('.book-desc[open] p')).toContainText('새는 알에서 나오려고 투쟁한다');
  await expect(page.locator('.book-desc p')).toContainText('헤세의 대표작 & 고전');
  await expect(page.locator('.book-desc p')).not.toContainText('<br>');
  expect(proxy.calls.filter((c) => c === 'detail')).toHaveLength(1);
});

test.describe('서비스 워커 사용', () => {
  test.use({ serviceWorkers: 'allow' });

test('아침 알림: 켜기 → 관심 도서 추가 시 자동 갱신 → 끄기', async ({ page }) => {
  await pickLibraries(page);
  await openFirstResult(page);
  await page.locator('#watch').click();
  await page.locator('a.tab[data-tab=watchlist]').click();
  await page.evaluate(() => {
    document.getElementById('toast').textContent = '';
  });
  await page.locator('#push-on').click();
  await expect(page.locator('#toast')).toHaveText('관심 도서 1권 알림을 켰어요', { timeout: 25000 });
  await expect(page.locator('#push-off')).toBeVisible();
  expect(proxy.posts[0]).toMatchObject({
    op: 'subscribe',
    libs: ['147163', '147030', '147168'],
    items: [{ isbn: '9788937460449', title: '데미안' }],
  });

  await page.goto('#/book/9791164455221');
  await page.locator('#watch').click();
  await expect.poll(() => proxy.posts.length, { timeout: 8000 }).toBe(2);
  expect(proxy.posts[1].items.map((i) => i.isbn)).toEqual(['9791164455221', '9788937460449']);

  await page.goto('#/watchlist');
  await page.locator('#push-off').click();
  await expect(page.locator('#push-on')).toBeVisible();
  expect(proxy.posts.at(-1)).toMatchObject({ op: 'unsubscribe', subscription: { endpoint: 'https://push.example/fake' } });
});
});

test('하루 조회 한도를 넘으면 안내하고 확인 못 함으로 표시', async ({ page }) => {
  await pickLibraries(page);
  proxy.budget = true;
  await page.goto('#/book/9791164455221');
  await expect(page.locator('#mine .notice--warn')).toContainText('오늘 조회 한도를 다 썼어요');
  await expect(page.locator('#mine [data-status] .badge--unknown')).toHaveCount(3);
  await expect(page.locator('#mine [data-status]').first()).toHaveText('확인 못 함');
});

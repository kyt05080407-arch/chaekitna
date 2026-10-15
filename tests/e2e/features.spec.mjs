// 로딩 화면 명언, 작가 강연 배너, '이번 주 N번 빌렸어요'
import { test, expect } from '@playwright/test';
import { expectNoProblems, fakeProxy, pickLibraries, watchProblems } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

const POPULAR = {
  demo: false,
  period: '10월 8일~14일',
  region: '37',
  regionName: '경북',
  ageName: '고등학생',
  regions: [],
  items: [
    { rank: 1, isbn13: '9788937460449', title: '데미안', authors: '헤르만 헤세', loanCount: 1284 },
    { rank: 2, isbn13: '9788932917245', title: '어린 왕자', authors: '앙투안 드 생텍쥐페리', loanCount: 1107 },
  ],
};

let problems;
let proxy;
test.beforeEach(async ({ page }) => {
  problems = await watchProblems(page, { allowHosts: ['proxy.example'] });
  proxy = await fakeProxy(page);
  await page.route('**/data/popular.json', (route) => route.fulfill({ json: POPULAR }));
});
test.afterEach(() => expectNoProblems(problems));

test('처음 열면 명언이 있는 로딩 화면이 잠깐 보이고, 누르면 바로 닫힌다', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await page.goto('#/');
  await expect(page.locator('#splash')).toBeVisible();
  await expect(page.locator('#splash-text')).not.toBeEmpty();
  await expect(page.locator('#splash-by')).toContainText('·');
  await page.locator('#splash').click();
  await expect(page.locator('#splash')).toHaveCount(0);
  // 같은 세션에서 다시 열면 기다리지 않는다
  await page.reload();
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 3000 });
});

test('홈 위쪽에 다가오는 작가 강연이 날짜순으로 나오고, 지난 행사는 숨긴다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T10:00:00+09:00'));
  await page.goto('#/');
  const items = page.locator('#promo .promo__item');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('괜찮다고 말해주는 문장들');
  await expect(items.first()).toContainText('10월 23일(금) 저녁 7시');
  await expect(items.first()).toHaveAttribute('href', /munhaknanum\.kr/);
  await expect(items.first()).toHaveAttribute('target', '_blank');

  await page.clock.setFixedTime(new Date('2026-11-05T10:00:00+09:00'));
  await page.reload();
  await expect(page.locator('#pop-list .row').first()).toBeVisible();
  await expect(page.locator('#promo')).toBeHidden();
});

test('인기 도서·검색 결과·책 화면에 이번 주 대출 횟수와 순위를 보여 준다', async ({ page }) => {
  await pickLibraries(page);
  await page.goto('#/');
  const first = page.locator('#pop-list .row').first();
  await expect(first.locator('.row__figure')).toHaveText('1,284번');
  await expect(first.locator('.row__figure-label')).toHaveText('이번 주 대출');

  await page.locator('#q').fill('데미안');
  await page.locator('#q').press('Enter');
  await expect(page.locator('#results .row').first().locator('.badge--hot')).toHaveText('이번 주 1위');

  await page.locator('#results .row').first().click();
  await expect(page.locator('.hot')).toContainText('이번 주 경북 고등학생 1위');
  await expect(page.locator('.hot')).toContainText('1,284번');
  await expect(page.locator('.summary__big')).toHaveText('1곳');
});

test('불러오는 동안 독서 정보나 명언을 보여 준다', async ({ page }) => {
  await pickLibraries(page);
  await page.route('https://proxy.example/**', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await page.goto('#/search?q=어린');
  await expect(page.locator('#results .reading')).toBeVisible();
  await expect(page.locator('#results .reading__text')).not.toBeEmpty();
  await expect(page.locator('#results .row').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#results .reading')).toHaveCount(0);
});

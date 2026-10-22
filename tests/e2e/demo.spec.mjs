// 예시 데이터 모드(프록시 주소가 없을 때) 화면 점검
import { test, expect } from '@playwright/test';
import { expectNoProblems, pickLibraries, watchProblems } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

let problems;
test.beforeEach(async ({ page }) => {
  problems = await watchProblems(page);
});
test.afterEach(() => expectNoProblems(problems));

test('첫 화면: 예시 안내, 인기 도서, 도서관 고르기 안내', async ({ page }) => {
  await page.goto('#/');
  await expect(page.locator('.notice--demo')).toContainText('예시 모드');
  await expect(page.locator('#pop-list .row')).toHaveCount(10);
  await expect(page.getByRole('link', { name: '자주 가는 도서관 고르기' })).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
  });
  expect(fonts).toContain('Pretendard Variable');
});

test('도서관 고르기 → 검색 → 상세 → 관심 도서', async ({ page }) => {
  await pickLibraries(page);
  await page.locator('a.tab[data-tab=home]').click();
  await page.locator('#q').fill('데미안');
  await page.locator('#q').press('Enter');
  await expect(page.locator('#results .row').first()).toBeVisible();
  await expect(page.locator('#results .badge--demo').first()).toBeVisible();

  await page.locator('#results .row').first().click();
  await expect(page.locator('#mine .card')).toHaveCount(3);
  await expect(page.locator('#mine [data-status] .badge--unknown')).toHaveCount(0);
  await expect(page.locator('#mine .badge--demo')).toHaveCount(3);
  await expect(page.locator('#summary .summary__main')).toContainText('내 도서관 3곳 중');
  await expect(page.locator('#mine .card').first().getByRole('link', { name: '지도' })).toHaveAttribute('href', /^https:\/\/map\.kakao\.com\/link\/map\//);
  await expect(page.locator('#mine .card').first()).toContainText('휴관 · 매월 첫번째, 세번째 월요일');

  await page.locator('#watch').click();
  await page.locator('#find-wide').click();
  await expect(page.locator('#wide .row').first()).toBeVisible();
  await page.locator('#wide [data-check]').first().click();
  await expect(page.locator('#wide .row').first().locator('.badge--demo')).toBeVisible();

  await page.locator('a.tab[data-tab=watchlist]').click();
  await expect(page.locator('#books .card')).toHaveCount(1);
  await expect(page.locator('#books .card [data-state] .badge').first()).not.toHaveText('확인 중');
  await expect(page.locator('#alerts')).toContainText('준비 중');
});

test('설정: 글자 크기와 어두운 화면이 바로 바뀐다', async ({ page }) => {
  await page.goto('#/settings');
  await page.locator('[data-size=xl]').click();
  await page.locator('[data-theme=dark]').click();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'xl');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(16, 18, 22)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'xl');
  await expect(page.locator('#font-px')).toHaveValue('22');
});

test('설정: 글자 크기 막대를 좌우로 끌면 바로 바뀌고, 단계 버튼과 맞춰진다', async ({ page }) => {
  await page.goto('#/settings');
  const rootPx = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  const slider = page.locator('#font-px');
  await expect(slider).toHaveValue('19');
  await expect(page.locator('button[data-size=l]')).toHaveAttribute('aria-pressed', 'true');
  await slider.fill('24');
  expect(await rootPx()).toBe('24px');
  await expect(page.locator('button[data-size][aria-pressed=true]')).toHaveCount(0);
  await expect(slider).toHaveAttribute('aria-valuetext', '24픽셀');
  // 키보드(왼쪽 화살표)로도 줄일 수 있다
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await rootPx()).toBe('22px');
  await expect(page.locator('button[data-size=xl]')).toHaveAttribute('aria-pressed', 'true');
  // 다른 화면과 다시 열었을 때도 그대로
  await page.reload();
  expect(await rootPx()).toBe('22px');
  await page.locator('button[data-size=m]').click();
  expect(await rootPx()).toBe('17px');
  await expect(slider).toHaveValue('17');
});

test('설정: 모두 지우기는 두 번 눌러야 지워진다', async ({ page }) => {
  await pickLibraries(page);
  await page.goto('#/settings');
  const clear = page.locator('#clear');
  await clear.click();
  await expect(clear).toContainText('한 번 더 누르면');
  expect(await page.evaluate(() => localStorage.getItem('chaekitna:myLibraries'))).not.toBeNull();
  await clear.click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(() => localStorage.getItem('chaekitna:myLibraries'))).toBeNull();
});

test('바코드 화면: 카메라가 없으면 ISBN을 직접 입력한다', async ({ page }) => {
  await pickLibraries(page);
  await page.goto('#/');
  await page.locator('#scan').click();
  await expect(page.locator('.scanner')).toBeVisible();
  await page.locator('#manual-isbn').fill('9788971998557');
  await page.locator('.scanner [type=submit]').click();
  await expect(page).toHaveURL(/#\/book\/9788971998557$/);
  // 예시 모드에서 실제 책은 지어낸 상태를 보여 주지 않는다
  await expect(page.locator('#summary .summary__main')).toContainText('예시 모드라');
  await expect(page.locator('#mine .badge--available')).toHaveCount(0);
});

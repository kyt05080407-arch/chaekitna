// 카카오톡 안 브라우저로 열었을 때 안내
import { test, expect } from '@playwright/test';
import { expectNoProblems, watchProblems } from './helpers.mjs';

test.use({
  serviceWorkers: 'block',
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36;KAKAOTALK 2410560',
});

let problems;
test.beforeEach(async ({ page }) => {
  problems = await watchProblems(page);
});
test.afterEach(() => expectNoProblems(problems));

test('카카오톡 안에서 열면 다른 브라우저로 여는 방법을 알려 주고, 닫으면 다시 안 보인다', async ({ page }) => {
  await page.goto('#/');
  const notice = page.locator('.inapp');
  await expect(notice).toContainText('카카오톡 안에서 열렸어요');
  await expect(notice.locator('[data-open-external]')).toBeVisible();
  await notice.locator('[data-hide]').click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#pop-list .row').first()).toBeVisible();
  await expect(page.locator('.inapp')).toHaveCount(0);
});

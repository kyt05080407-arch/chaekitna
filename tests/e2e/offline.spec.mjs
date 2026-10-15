// 서비스 워커: 한 번 연 뒤에는 인터넷이 끊겨도 앱 화면이 열린다
import { test, expect } from '@playwright/test';

test('오프라인에서도 앱 화면과 저장해 둔 내용이 열린다', async ({ page, context }) => {
  await page.goto('#/');
  await expect(page.locator('#pop-list .row')).toHaveCount(10);
  // 서비스 워커가 이 화면을 맡을 때까지 기다린다
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
  await page.goto('#/settings');
  await expect(page.locator('#clear')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#clear')).toBeVisible(); // 새로고침해도 설정 화면이 그대로 열린다
  await page.locator('a.tab[data-tab=home]').click();
  await expect(page.locator('#pop-list .row')).toHaveCount(10);
  await page.locator('a.tab[data-tab=libraries]').click();
  await expect(page.locator('#lib-q')).toBeVisible();
  await page.locator('#lib-q').fill('안동');
  await expect(page.locator('#found [data-add]').first()).toBeVisible();
  await context.setOffline(false);
});

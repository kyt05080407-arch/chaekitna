// 바코드 스캔: 가짜 카메라에 ISBN 바코드를 비춰 실제 인식 모듈(zxing-wasm)로 읽는다
import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBarcodeY4m } from './fake-camera.mjs';
import { expectNoProblems, watchProblems } from './helpers.mjs';

const ISBN = '9788937460449';
const video = writeBarcodeY4m(join(tmpdir(), `chaekitna-isbn-${ISBN}.y4m`), ISBN);

test.use({
  serviceWorkers: 'block',
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  },
});

let problems;
test.beforeEach(async ({ page }) => {
  problems = await watchProblems(page);
});
test.afterEach(() => expectNoProblems(problems));

test('책 뒷면 바코드를 비추면 그 책 화면으로 간다', async ({ page }) => {
  await page.goto('#/');
  // 리눅스 크롬에는 기본 바코드 인식기가 없어서, 함께 넣어 둔 인식 모듈(wasm)을 불러와야 한다
  const wasm = page.waitForRequest(/vendor\/zxing_reader\.wasm$/);
  await page.locator('#scan').click();
  await expect(page.locator('.scanner')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/book/${ISBN}$`), { timeout: 20000 });
  await expect(page.locator('.scanner')).toHaveCount(0);
  expect((await wasm).url()).toContain('/vendor/zxing_reader.wasm');
});

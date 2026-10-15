// 휴대폰 크기 화면 자동 점검 (npm run test:e2e)
// 저장소 폴더를 작은 서버(scripts/serve.mjs)로 띄우고, 크롬으로 실제 사용 흐름을 눌러 본다.
import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    // 새 headless 크롬: 알림 권한 등이 실제 크롬과 같게 동작한다
    channel: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});

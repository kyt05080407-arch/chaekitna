// 접근성 자동 점검(axe-core): 주요 화면을 밝은·어두운 화면에서 WCAG 2.1 AA 기준으로 본다
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pickLibraries } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

const SCREENS = [
  { name: '홈', hash: '#/', ready: '#pop-list .row' },
  { name: '검색 결과', hash: '#/search?q=데미안', ready: '#results .row' },
  { name: '책 상세', hash: '#/book/0000000000002', ready: '#mine .card [data-status] .badge:not(.badge--unknown)' },
  { name: '내 도서관', hash: '#/libraries', ready: '#picked .card' },
  { name: '관심 도서', hash: '#/watchlist', ready: '#books .card' },
  { name: '책 목록', hash: '#/list/snu100', ready: '#books li' },
  { name: '내 목록', hash: '#/list/mine', ready: '#paste' },
  { name: '책장', hash: '#/shelves', ready: '#people .person' },
  { name: '사람별 책장', hash: '#/list/star-rm?open=1', ready: '[data-row="1"] .shelf-panel' },
  { name: '학과별 책장', hash: '#/list/major-med?open=1', ready: '[data-row="1"] .shelf-panel' },
  { name: '설정', hash: '#/settings', ready: '#clear' },
];

function describe(violations) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `   - ${n.target.join(' ')} ${n.failureSummary.split('\n').slice(1, 2).join('')}`).join('\n')}`)
    .join('\n');
}

for (const theme of ['light', 'dark']) {
  test(`접근성: 주요 화면 (${theme === 'light' ? '밝은' : '어두운'} 화면)`, async ({ page }) => {
    await pickLibraries(page);
    await page.evaluate((t) => {
      const s = JSON.parse(localStorage.getItem('chaekitna:settings') || '{}');
      localStorage.setItem('chaekitna:settings', JSON.stringify({ ...s, theme: t }));
      // 관심 도서 화면을 보려고 예시 책 하나를 담아 둔다
      localStorage.setItem('chaekitna:watchlist', JSON.stringify([{ isbn13: '0000000000002', title: '데미안', authors: '헤르만 헤세', cover: '', addedAt: Date.now(), last: null }]));
    }, theme);
    await page.reload();
    const problems = [];
    for (const screen of SCREENS) {
      await page.goto(screen.hash);
      await expect(page.locator(screen.ready).first()).toBeVisible();
      await page.waitForTimeout(300); // 토스트·전환이 끝나길 기다림
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#toast').analyze();
      expect(result.passes.length, `${screen.name}: 실제로 검사가 돌았는지`).toBeGreaterThan(10);
      if (result.violations.length) problems.push(`[${screen.name}]\n${describe(result.violations)}`);
    }
    expect(problems.join('\n\n'), '접근성 위반').toBe('');
  });
}

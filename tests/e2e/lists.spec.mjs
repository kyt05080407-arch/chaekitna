// 책 목록 한 번에 확인: 처음 화면 → 목록 → 분야 → 내 도서관에서 확인 → 내 목록 붙여 넣기
import { test, expect } from '@playwright/test';
import { expectNoProblems, fakeProxy, pickLibraries, watchProblems } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

// 시험용 목록(실제 data/lists.json은 매주 바뀌어서 고정한 목록으로 바꿔 끼운다)
const A = '9788932900001';
const B = '9788932900002';
const C = '9788932900003';
const D = '9788932900004';
const m = (isbn13, title, authors) => ({ isbn13, title, authors, publisher: '출판사', year: '2010', cover: '' });
const LISTS = {
  generatedAt: '2026-10-19T00:00:00Z',
  lists: [
    {
      id: 'snu100',
      title: '서울대 권장도서 100선',
      short: '서울대 권장도서',
      description: '시험용 권장도서 목록',
      source: '서울대학교 기초교육원',
      sourceUrl: 'http://book100.snu.ac.kr/book/book/',
      fields: [
        { id: 'ko', label: '한국문학' },
        { id: 'for', label: '외국문학' },
      ],
      books: [
        { no: 1, field: 'ko', title: '광장', author: '최인훈', match: m(A, '광장', '최인훈') },
        { no: 2, field: 'ko', title: '토지', author: '박경리', note: '여러 권으로 된 소설이에요', match: m(B, '토지 1', '박경리') },
        { no: 3, field: 'ko', title: '고전시가선집', author: '' },
        { no: 4, field: 'for', title: '변신', author: '카프카', match: m(C, '변신', '프란츠 카프카') },
        { no: 5, field: 'for', title: '주홍글씨', author: '호손', match: m(D, '주홍 글자', '너새니얼 호손') },
      ],
    },
    {
      id: 'teen-high',
      title: '고등학생이 요즘 많이 빌린 책',
      kind: 'popular',
      description: '시험용',
      books: [{ no: 1, title: '소년이 온다', author: '한강', loanCount: 321, match: m('9788936434120', '소년이 온다', '한강') }],
    },
  ],
};

let problems;
test.beforeEach(async ({ page }) => {
  problems = await watchProblems(page, { allowHosts: ['proxy.example'] });
  await page.route('**/data/lists.json', (route) => route.fulfill({ json: LISTS }));
});
test.afterEach(() => expectNoProblems(problems));

test('처음 화면에서 목록으로: 분야별로 보고, 도서관을 고르기 전에는 고르기 안내', async ({ page }) => {
  await page.goto('#/');
  await expect(page.locator('#lists .row')).toHaveCount(3);
  await expect(page.locator('#lists .row').first()).toContainText('서울대 권장도서 100선');
  await expect(page.locator('#lists .row').first()).toContainText('5권 · 2개 분야');
  await expect(page.locator('#lists .row').nth(1)).toContainText('최근 30일 전국');
  await expect(page.locator('#lists .row').nth(2)).toContainText('선생님이 준 목록');
  await page.locator('#lists .row').first().click();
  await expect(page).toHaveURL(/#\/list\/snu100$/);
  await expect(page.locator('h1.h1')).toHaveText('서울대 권장도서 100선');
  await expect(page.locator('#books li')).toHaveCount(5);
  // 다른 판 제목으로 찾은 책은 어떤 책인지 보여 준다
  await expect(page.locator('[data-row="5"]')).toContainText('찾은 책: 『주홍 글자』 출판사');
  await expect(page.locator('[data-row="2"]')).toContainText('여러 권으로 된 소설이에요');
  // 못 찾은 책은 제목 검색으로
  await expect(page.locator('[data-row="3"] a')).toHaveAttribute('href', `#/search?q=${encodeURIComponent('고전시가선집')}`);
  await expect(page.locator('[data-row="1"] a')).toHaveAttribute('href', `#/book/${A}`);
  await page.locator('[data-field="for"]').click();
  await expect(page.locator('#books li')).toHaveCount(2);
  await expect(page.locator('[data-field="for"]')).toHaveAttribute('aria-pressed', 'true');
  const pick = page.locator('#check-box a', { hasText: '내 도서관 고르기' });
  await expect(pick).toHaveAttribute('href', `#/libraries?back=${encodeURIComponent('#/list/snu100')}`);
});

test('예시 데이터 모드에서는 확인 버튼 대신 안내', async ({ page }) => {
  await pickLibraries(page);
  await page.goto('#/list/snu100');
  await expect(page.locator('#check-box .notice--demo')).toBeVisible();
  await expect(page.locator('#check')).toHaveCount(0);
});

test('내 도서관에서 한 번에 확인: 책마다 소장 도서관을 한 번씩 보고, 다시 열면 저장해 둔 결과', async ({ page }) => {
  const proxy = await fakeProxy(page);
  // 내 도서관: 147163, 147030, 147168 (모두 경북)
  proxy.holdingsFor = (isbn) =>
    ({
      [A]: { codes: ['147168', '147001'] },
      [B]: { codes: ['147030', '147163'] },
      [C]: { codes: [] },
      [D]: { codes: ['147001'], total: 150 }, // 소장 도서관이 많아 목록이 잘린 경우
    })[isbn];
  await pickLibraries(page);
  await page.goto('#/list/snu100');
  await expect(page.locator('#check')).toHaveText('4권 확인하기');
  await page.locator('#check').click();
  await expect(page.locator('#check-box .check__sum')).toHaveText('2권 / 4권이 내 도서관에 있어요 (1권은 눌러서 확인)');
  expect(proxy.calls.filter((c) => c === 'holdings')).toHaveLength(4);
  await expect(page.locator('[data-row="1"] [data-end]')).toHaveText('내 도서관 1곳에 있어요');
  await expect(page.locator('[data-row="1"] [data-libs]')).toHaveText('경북도서관');
  await expect(page.locator('[data-row="2"] [data-end]')).toHaveText('내 도서관 2곳에 있어요');
  await expect(page.locator('[data-row="4"] [data-end]')).toHaveText('내 도서관에 없어요');
  await expect(page.locator('[data-row="5"] [data-end]')).toHaveText('눌러서 확인');
  await expect(page.locator('[data-row="3"] [data-end]')).toHaveText('');
  await expect(page.locator('#check-box')).toContainText('모두 확인했어요');
  await expect(page.locator('#check-box')).toContainText('1권은 정보나루에서 책을 찾지 못해');
  // 있는 책만
  await page.locator('#only-have').click();
  await expect(page.locator('#books li')).toHaveCount(2);
  // 다시 열면 조회하지 않고 바로 보인다
  await page.goto('#/');
  await page.goto('#/list/snu100');
  await expect(page.locator('[data-row="2"] [data-end]')).toHaveText('내 도서관 2곳에 있어요');
  await expect(page.locator('#check')).toHaveCount(0);
  expect(proxy.calls.filter((c) => c === 'holdings')).toHaveLength(4);
  // 책을 누르면 책 화면(책 정보는 목록에 있던 것으로 바로)
  await page.locator('[data-row="1"] a').click();
  await expect(page).toHaveURL(new RegExp(`#/book/${A}$`));
  await expect(page.locator('.book-head__title')).toHaveText('광장');
});

test('인기 목록은 대출 횟수를 보여 준다', async ({ page }) => {
  await page.goto('#/list/teen-high');
  await expect(page.locator('[data-row="1"] .row__end')).toContainText('321번');
});

test('내 목록: 붙여 넣으면 책을 찾고, 고쳐도 찾은 책은 다시 찾지 않는다', async ({ page }) => {
  const proxy = await fakeProxy(page);
  await pickLibraries(page);
  await page.goto('#/list/mine');
  await page.locator('#paste').fill('1. 데미안 - 헤르만 헤세\n없는 책 하나');
  await page.getByRole('button', { name: '목록 만들기' }).click();
  await expect(page.locator('#books li')).toHaveCount(2);
  await expect(page.locator('[data-row="1"] a')).toHaveAttribute('href', '#/book/9788937460449');
  await expect(page.locator('[data-row="2"]')).toContainText('찾지 못했어요');
  expect(proxy.calls.filter((c) => c === 'search')).toHaveLength(2);
  await page.locator('#check').click();
  await expect(page.locator('#check-box .check__sum')).toHaveText('1권 / 1권이 내 도서관에 있어요');
  // 처음 화면에도 내 목록 권수가 보인다
  await page.goto('#/');
  await expect(page.locator('#lists .row').last()).toContainText('2권 · 직접 만든 목록');
  await page.goto('#/list/mine');
  await page.locator('#edit-mine').click();
  await expect(page.locator('#paste')).toHaveValue('데미안 - 헤르만 헤세\n없는 책 하나');
  await page.locator('#paste').fill('데미안 - 헤르만 헤세\n없는 책 하나\n아몬드');
  await page.getByRole('button', { name: '목록 만들기' }).click();
  await expect(page.locator('#books li')).toHaveCount(3);
  await expect(page.locator('[data-row="3"]')).toContainText('찾지 못했어요');
  expect(proxy.calls.filter((c) => c === 'search')).toHaveLength(3);
  await expect(page.locator('[data-row="1"] [data-end]')).toHaveText('내 도서관 1곳에 있어요');
  await page.locator('#clear-mine').click();
  await expect(page.locator('#paste')).toHaveValue('');
});

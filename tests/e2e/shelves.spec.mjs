// 책장: 탭 → 사람별·학과별 책장 → 책을 누르면 펼쳐져 '왜 이 책?'·탐구 연결 아이디어·출처 → 내 도서관에서 확인·관심 도서 담기
import { test, expect } from '@playwright/test';
import { expectNoProblems, watchProblems } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

const m = (isbn13, title, authors, loanCount) => ({ isbn13, title, authors, publisher: '출판사', year: '2010', cover: '', ...(loanCount ? { loanCount } : {}) });
const person = (id, name, team, kind, books) => ({
  id: `star-${id}`,
  group: 'star',
  title: `${name}의 책장`,
  short: name,
  person: { name, team, kind },
  description: `${name}이 추천한 책`,
  sources: { a: { name: '시험 기사', url: 'https://news.example/a' } },
  books,
});
const PEOPLE = [
  person('rm', 'RM', '방탄소년단', 'idol', [
    { no: 1, title: '데미안', author: '헤르만 헤세', src: 'a', from: '인터뷰에서 추천', match: m('9788937460449', '데미안', '헤르만 헤세', 3000) },
    { no: 2, title: '아직 못 찾은 책', author: '', src: 'a', from: '라이브에서 추천', waiting: true },
  ]),
  person('narin', '나린', '미야오', 'idol', [{ no: 1, title: '데미안', author: '헤르만 헤세', src: 'a', from: '세 번 읽은 책', match: m('9788937460449', '데미안', '헤르만 헤세', 3000) }]),
  person('faker', '페이커', 'T1', 'gamer', [{ no: 1, title: '월든', author: '소로', src: 'a', from: '사진 속 책', match: m('9788932900011', '월든', '소로', 100) }]),
  ...Array.from({ length: 9 }, (_, i) => person(`p${i}`, `가수${i}`, '그룹', 'idol', [{ no: 1, title: `책${i}`, author: '', src: 'a', from: '팬 커뮤니티' }])),
];
const LISTS = {
  generatedAt: '2026-10-22T00:00:00Z',
  lists: [
    { id: 'snu100', title: '서울대 권장도서 100선', description: '시험용', books: [{ no: 1, title: '광장', author: '최인훈', match: m('9788932900001', '광장', '최인훈') }] },
    {
      id: 'major-med',
      group: 'major',
      title: '의학·약학·간호·수의 책장',
      short: '메디컬',
      icon: 'medical',
      description: '시험용 학과별 책장',
      fields: [
        { id: 'med', label: '의예·치의' },
        { id: 'nurse', label: '간호' },
      ],
      sources: { arori: { name: '서울대 아로리', url: 'https://snuarori.example/2022' } },
      books: [
        { no: 1, field: 'med', title: '숨결이 바람 될 때', author: '폴 칼라니티', src: 'arori', from: '서울대 의과대학 지원자가 가장 많이 읽은 책 1위', note: '환자의 입장에서 본 의사의 역할을 의료 윤리와 연결해 정리해 보세요.', match: m('9791155810003', '숨결이 바람 될 때', '폴 칼라니티') },
        { no: 2, field: 'nurse', title: '데미안', author: '헤르만 헤세', src: 'arori', from: '간호대학 지원자가 읽은 책', note: '자기 자신을 찾아가는 성장소설. 나의 경험과 비교해 보세요.', match: m('9788937460449', '데미안', '헤르만 헤세', 3000) },
      ],
    },
    ...PEOPLE,
  ],
};

let problems;
test.beforeEach(async ({ page }) => {
  problems = await watchProblems(page);
  await page.route('**/data/lists.json', (route) => route.fulfill({ json: LISTS }));
});
test.afterEach(() => expectNoProblems(problems));

test('책장 탭: 사람별 책장(분야 칩·모두 보기), 많이 빌린 추천 책, 학과별 책장', async ({ page }) => {
  await page.goto('#/');
  // 처음 화면: 책장 카드(책이 많은 사람부터)와 학과 칩, 그 아래 서울대 권장도서 + 내 목록
  await expect(page.locator('#shelf-sec')).toBeVisible();
  await expect(page.locator('#shelf-people .shelf-card')).toHaveCount(10);
  await expect(page.locator('#shelf-people .shelf-card').first()).toContainText('RM');
  await expect(page.locator('#shelf-people .shelf-card').first()).toContainText('방탄소년단 · 2권');
  await expect(page.locator('#shelf-majors a')).toHaveText(['메디컬']);
  await expect(page.locator('#lists .row')).toHaveCount(2);
  await page.locator('a.tab[data-tab=shelves]').click();
  await expect(page).toHaveURL(/#\/shelves$/);
  await expect(page.locator('a.tab[data-tab=shelves]')).toHaveAttribute('aria-current', 'page');
  // 12명 중 6명만 먼저
  await expect(page.locator('#people .shelf-card')).toHaveCount(6);
  await page.locator('#people-more').click();
  await expect(page.locator('#people .shelf-card')).toHaveCount(12);
  await expect(page.locator('#people-more')).toBeHidden();
  await page.locator('[data-kind="gamer"]').click();
  await expect(page.locator('#people .shelf-card')).toHaveCount(1);
  await expect(page.locator('#people .shelf-card')).toContainText('페이커');
  await expect(page.locator('#people .avatar')).toHaveText('페');
  // 같은 책을 추천한 사람은 한 칸에 모은다, 대출 건수 순
  const loaned = page.locator('#loaned .rail__item');
  await expect(loaned).toHaveCount(2);
  await expect(loaned.first()).toContainText('RM·나린 추천');
  await expect(loaned.first()).toContainText('3,000번');
  await expect(page.locator('.major')).toHaveCount(1);
  await expect(page.locator('.major')).toContainText('2권');
  await expect(page.locator('.major .fan .cover')).toHaveCount(2);
  // 오늘의 한 권은 책장 속 책(표지가 없으면 고르지 않음 → 이 시험 자료에는 없음)
  await expect(page.locator('#pick-h')).toHaveCount(0);
});

test('사람별 책장: 책을 누르면 펼쳐져 어디서 추천했는지·출처, 다른 책장 연결, 관심 도서 담기', async ({ page }) => {
  await page.goto('#/shelves');
  await page.locator('#people .shelf-card', { hasText: 'RM' }).click();
  await expect(page).toHaveURL(/#\/list\/star-rm$/);
  await expect(page.locator('h1.h1')).toHaveText('RM의 책장');
  await expect(page.locator('.hero .avatar')).toHaveText('RM');
  await expect(page.locator('a.tab[data-tab=shelves]')).toHaveAttribute('aria-current', 'page');
  const row = page.locator('[data-row="1"]');
  const btn = row.locator('.row--btn');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(row.locator('.shelf-panel')).toBeHidden();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const panel = row.locator('.shelf-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('어디서 추천했나');
  await expect(panel).toContainText('인터뷰에서 추천');
  await expect(panel.locator('a', { hasText: '시험 기사' })).toHaveAttribute('href', 'https://news.example/a');
  await expect(panel).toContainText('메디컬, 나린의 책장에도 있어요');
  await expect(panel.locator('a', { hasText: '내 도서관에서 확인' })).toHaveAttribute('href', '#/book/9788937460449');
  // 아직 못 찾은 책은 '준비 중', 확인 버튼은 제목 검색으로
  await page.locator('[data-row="2"] .row--btn').click();
  await expect(page.locator('[data-row="2"]')).toContainText('책 정보 준비 중');
  await expect(page.locator('[data-row="2"] a', { hasText: '내 도서관에서 확인' })).toHaveAttribute('href', `#/search?q=${encodeURIComponent('아직 못 찾은 책')}`);
  await expect(page.locator('[data-row="2"] [data-watch]')).toHaveCount(0);
  // 관심 도서 담기 → 관심 도서 탭에 보인다
  await panel.locator('[data-watch]').click();
  await expect(panel.locator('[data-watch]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('[data-watch]')).toHaveText('담았어요');
  // 접기
  await btn.click();
  await expect(row.locator('.shelf-panel')).toBeHidden();
  await page.locator('a.tab[data-tab=watchlist]').click();
  await expect(page.locator('#books')).toContainText('데미안');
  // 출처 칸
  await page.goto('#/list/star-rm');
  await expect(page.locator('.src-list a')).toHaveAttribute('href', 'https://news.example/a');
  await expect(page.locator('#topbar [data-back]')).toHaveAttribute('href', '#/shelves');
});

test('학과별 책장: 분야 칩, 탐구 연결 아이디어(예시), open으로 펼친 채 열기', async ({ page }) => {
  await page.goto('#/list/major-med?open=2');
  await expect(page.locator('h1.h1')).toHaveText('의학·약학·간호·수의 책장');
  await expect(page.locator('[data-row="2"] .shelf-panel')).toBeVisible();
  await expect(page.locator('[data-row="1"] .shelf-panel')).toBeHidden();
  // 책장 모양 줄의 표지를 누르면 그 책이 펼쳐진다
  await expect(page.locator('.strip__book')).toHaveCount(2);
  await page.locator('.strip__book[data-jump="1"]').click();
  await expect(page.locator('[data-row="1"] .row--btn')).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('[data-row="1"] .shelf-panel');
  await expect(panel).toContainText('왜 이 책?');
  await expect(panel).toContainText('서울대 의과대학 지원자가 가장 많이 읽은 책 1위');
  await expect(panel.locator('.shelf-panel__note')).toContainText('탐구 연결 아이디어');
  await expect(panel.locator('.shelf-panel__note')).toContainText('예시');
  await expect(panel.locator('.shelf-panel__note')).toContainText('의료 윤리');
  await page.locator('[data-field="nurse"]').click();
  await expect(page.locator('#books li')).toHaveCount(1);
  // 펼쳐 둔 책은 다시 그려도 펼친 채로
  await expect(page.locator('[data-row="2"] .shelf-panel')).toBeVisible();
  await expect(page.locator('#src-h')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="src-h"]')).toContainText('책있나가 쓴 예시');
});

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

// 손가락으로 미는 것처럼(크롬 개발자 도구의 터치 입력). release=false면 손을 떼지 않는다.
async function swipe(page, from, to, { steps = 6, wait = 0, release = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    if (wait) await page.waitForTimeout(wait);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  if (release) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return cdp;
}

test('탭 화면을 옆으로 밀면 손가락을 따라 넘어간다: 미리 보기 → 반 넘게 밀면 다음 탭, 조금 밀면 제자리', async ({ page }) => {
  // 관심 도서를 한 번 봐 두면 미리 보기에 그 모습이 나온다
  await page.goto('#/watchlist');
  await expect(page.locator('#main h1, #main .empty').first()).toBeVisible();
  await page.goto('#/shelves');
  await expect(page.locator('#people .shelf-card').first()).toBeVisible();
  // 손을 떼지 않고 밀고 있으면: 지금 화면이 따라 움직이고 밑에 관심 도서가 보인다
  const cdp = await swipe(page, { x: 330, y: 420 }, { x: 160, y: 425 }, { release: false, wait: 30 });
  await expect(page.locator('.swipe-peek--next')).toHaveCount(1);
  await expect(page.locator('.swipe-peek--next .topbar')).toContainText('관심 도서');
  const moved = await page.locator('.app').evaluate((el) => el.style.transform);
  expect(moved).toMatch(/translate3d\(-1\d\dpx/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page).toHaveURL(/#\/watchlist$/);
  await expect(page.locator('a.tab[data-tab=watchlist]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.swipe-peek')).toHaveCount(0);
  await expect(page.locator('.app')).not.toHaveClass(/is-swiping/);
  await expect.poll(() => page.locator('.app').evaluate((el) => el.style.transform)).toBe('');
  // 오른쪽으로 밀면 이전 탭(책장)이 왼쪽에서 덮어 온다
  await swipe(page, { x: 90, y: 420 }, { x: 330, y: 425 });
  await expect(page).toHaveURL(/#\/shelves$/);
  await expect(page.locator('.swipe-peek')).toHaveCount(0);
  // 조금만 천천히 밀고 떼면 제자리로 돌아온다
  await swipe(page, { x: 300, y: 420 }, { x: 240, y: 422 }, { wait: 60 });
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/#\/shelves$/);
  await expect(page.locator('.swipe-peek')).toHaveCount(0);
  await expect(page.locator('.app')).not.toHaveClass(/is-swiping/);
  // 위아래로 스크롤한 건 넘기기가 아니다
  await swipe(page, { x: 200, y: 600 }, { x: 160, y: 250 });
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/#\/shelves$/);
  // 끝 탭(홈)에서 오른쪽으로 밀면 고무줄처럼 돌아온다
  await page.goto('#/');
  await expect(page.locator('#shelf-people .shelf-card').first()).toBeVisible();
  const hero = await page.locator('#main .hero').boundingBox();
  await swipe(page, { x: 90, y: hero.y + hero.height / 2 }, { x: 330, y: hero.y + hero.height / 2 + 5 });
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.app')).not.toHaveClass(/is-swiping/);
  // 옆으로 넘기는 줄의 맨 앞에서 오른쪽으로 밀어도 브라우저 '뒤로 가기'가 되지 않는다
  const promo = page.locator('.promo__track');
  if (await promo.count()) {
    const pb = await promo.boundingBox();
    await swipe(page, { x: 90, y: pb.y + pb.height / 2 }, { x: 330, y: pb.y + pb.height / 2 + 5 });
    await page.waitForTimeout(450);
    await expect(page).toHaveURL(/#\/$/);
  }
  // 처음 화면의 책장 카드 줄(옆으로 넘기는 줄) 위에서 민 건 그 줄을 넘긴다
  const cards = page.locator('#shelf-people');
  await cards.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const box = await cards.boundingBox();
  await swipe(page, { x: 330, y: box.y + box.height / 2 }, { x: 80, y: box.y + box.height / 2 }, { wait: 20 });
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/#\/$/);
  expect(await cards.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
  // 안쪽 화면(사람별 책장)에서는 탭을 바꾸지 않는다
  await page.goto('#/list/star-rm');
  await expect(page.locator('h1.h1')).toHaveText('RM의 책장');
  await swipe(page, { x: 320, y: 600 }, { x: 80, y: 605 });
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/#\/list\/star-rm$/);
});

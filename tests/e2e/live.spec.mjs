// 실제 데이터 모드: 가짜 프록시로 검색 → 상세 → 휴관일 → 책 소개 → 아침 알림 → 한도 초과까지
import { test, expect } from '@playwright/test';
import { expectNoProblems, fakeProxy, fakePushManager, pickLibraries, watchProblems } from './helpers.mjs';

test.use({ serviceWorkers: 'block' });

let problems;
let proxy;
test.beforeEach(async ({ page, context, baseURL }) => {
  problems = await watchProblems(page, { allowHosts: ['proxy.example'] });
  // 서비스 워커를 켠 시험은 워커가 보내는 요청도 바꿔 끼우도록 context에 건다
  proxy = await fakeProxy(test.info().project.use.serviceWorkers === 'allow' || /아침 알림/.test(test.info().title) ? context : page);
  await fakePushManager(context);
  await context.grantPermissions(['notifications'], { origin: baseURL.replace(/\/$/, '') });
});
test.afterEach(() => expectNoProblems(problems));

async function openFirstResult(page) {
  await page.locator('a.tab[data-tab=home]').click();
  await page.locator('#q').fill('데미안');
  await page.locator('#q').press('Enter');
  await expect(page.locator('#results .row')).toHaveCount(2);
  await page.locator('#results .row').first().click();
  await expect(page.locator('#mine .card')).toHaveCount(3);
  await expect(page.locator('#mine [data-status] .badge--unknown')).toHaveCount(0);
}

test('검색 결과와 도서관별 상태(예시 표시 없음)', async ({ page }) => {
  await pickLibraries(page);
  await expect(page.locator('.notice--demo')).toHaveCount(0);
  await openFirstResult(page);
  await expect(page.locator('#mine .card [data-status]')).toHaveText(['소장 안 함', '대출 중', '대출 가능']);
  await expect(page.locator('#summary .summary__main')).toHaveText('내 도서관 3곳 중 1곳에서 빌릴 수 있어요');
  await expect(page.locator('.badge--demo')).toHaveCount(0);
  await page.locator('#find-wide').click();
  await expect(page.locator('#wide .row')).toHaveCount(1); // 내 도서관(경북도서관)은 빼고 보여 준다
});

test('정기 휴관일인 날은 도서관 카드에 알려 준다', async ({ page }) => {
  // 2026-10-19는 셋째 월요일: 세 도서관 모두 '매월 첫번째, 세번째 월요일' 휴관
  await page.clock.setFixedTime(new Date('2026-10-19T10:00:00+09:00'));
  await pickLibraries(page);
  await openFirstResult(page);
  await expect(page.locator('#mine .card__alert')).toHaveCount(3);
  await expect(page.locator('#mine .card__alert').first()).toHaveText('오늘은 정기 휴관일이에요');
});

test('평일에는 휴관 알림이 없다', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T10:00:00+09:00'));
  await pickLibraries(page);
  await openFirstResult(page);
  await expect(page.locator('#mine .card__alert')).toHaveCount(0);
});

test('책 소개는 눌렀을 때만 불러온다', async ({ page }) => {
  await pickLibraries(page);
  await openFirstResult(page);
  expect(proxy.calls).not.toContain('detail');
  await page.locator('#intro').click();
  await expect(page.locator('.book-desc[open] p')).toContainText('새는 알에서 나오려고 투쟁한다');
  await expect(page.locator('.book-desc p')).toContainText('헤세의 대표작 & 고전');
  await expect(page.locator('.book-desc p')).not.toContainText('<br>');
  expect(proxy.calls.filter((c) => c === 'detail')).toHaveLength(1);
});

test.describe('서비스 워커 사용', () => {
  test.use({ serviceWorkers: 'allow' });

test('아침 알림: 켜기 → 관심 도서 추가 시 자동 갱신 → 끄기', async ({ page }) => {
  await pickLibraries(page);
  await openFirstResult(page);
  await page.locator('#watch').click();
  await page.locator('a.tab[data-tab=watchlist]').click();
  await page.evaluate(() => {
    document.getElementById('toast').textContent = '';
  });
  await page.locator('#push-on').click();
  await expect(page.locator('#toast')).toHaveText('관심 도서 1권 알림을 켰어요', { timeout: 25000 });
  await expect(page.locator('#push-off')).toBeVisible();
  expect(proxy.posts[0]).toMatchObject({
    op: 'subscribe',
    libs: ['147163', '147030', '147168'],
    items: [{ isbn: '9788937460449', title: '데미안' }],
  });

  await page.goto('#/book/9791164455221');
  await page.locator('#watch').click();
  await expect.poll(() => proxy.posts.length, { timeout: 8000 }).toBe(2);
  expect(proxy.posts[1].items.map((i) => i.isbn)).toEqual(['9791164455221', '9788937460449']);

  await page.goto('#/watchlist');
  await page.locator('#push-off').click();
  await expect(page.locator('#push-on')).toBeVisible();
  expect(proxy.posts.at(-1)).toMatchObject({ op: 'unsubscribe', subscription: { endpoint: 'https://push.example/fake' } });
});
});

test('하루 조회 한도를 넘으면 안내하고 확인 못 함으로 표시', async ({ page }) => {
  await pickLibraries(page);
  proxy.budget = true;
  await page.goto('#/book/9791164455221');
  await expect(page.locator('#mine .notice--warn')).toContainText('오늘 조회 한도를 다 썼어요');
  await expect(page.locator('#mine [data-status] .badge--unknown')).toHaveCount(3);
  await expect(page.locator('#mine [data-status]').first()).toHaveText('확인 못 함');
});

test('인기 도서나 관심 도서에서 들어가면 책 정보를 다시 조회하지 않는다', async ({ page }) => {
  await page.route('**/data/popular.json', (route) =>
    route.fulfill({
      json: {
        demo: false,
        period: '10월 5일~11일',
        regionName: '경북',
        ageName: '고등학생',
        items: [{ rank: 1, isbn13: '9788937460449', title: '데미안', authors: '헤르만 헤세', publisher: '민음사', year: '2000', cover: '' }],
      },
    }),
  );
  await pickLibraries(page);
  await page.goto('#/');
  await page.locator('#pop-list .row').first().click();
  await expect(page.locator('.book-head__title')).toHaveText('데미안');
  await expect(page.locator('#mine .card [data-status]')).toHaveText(['소장 안 함', '대출 중', '대출 가능']);
  await page.locator('#watch').click();
  // 폰에 저장한 책 정보 캐시를 지워도 관심 도서 정보로 연다
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('chaekitna:c:b:')).forEach((k) => localStorage.removeItem(k)));
  await page.goto('#/watchlist');
  await page.locator('#books .card a.row').first().click();
  await expect(page.locator('.book-head__title')).toHaveText('데미안');
  expect(proxy.calls).not.toContain('detail');
});

test('처음 화면의 인기 도서는 내 지역 목록을 보여 준다', async ({ page }) => {
  const asked = [];
  const list = (region, regionName, title) => ({
    demo: false, period: '10월 5일~11일', region, regionName, ageName: '고등학생',
    items: [{ rank: 1, isbn13: '9788932917245', title, authors: '작가' }],
  });
  await page.route('**/data/popular.json', (route) => route.fulfill({ json: { ...list('37', '경북', '경북 1위 책'), regions: ['11', '37'] } }));
  await page.route('**/data/popular/*.json', (route) => {
    const code = route.request().url().match(/popular\/(\d{2})\.json$/)[1];
    asked.push(code);
    return route.fulfill({ json: list(code, code === '11' ? '서울' : '?', `${code} 1위 책`) });
  });
  // 1) 내 도서관이 경북이면 기본 목록(경북)을 그대로 쓰고 따로 요청하지 않는다
  await pickLibraries(page);
  await page.goto('#/');
  await expect(page.locator('#pop-sub')).toContainText('경북 고등학생');
  expect(asked).toEqual([]);
  // 2) 설정에서 기본 지역을 서울로 바꾸면 서울 목록
  await page.goto('#/settings');
  await page.locator('#region').selectOption('11');
  await page.goto('#/');
  await expect(page.locator('#pop-sub')).toContainText('서울 고등학생');
  await expect(page.locator('#pop-list .row__title')).toHaveText(['11 1위 책']);
  // 3) 목록에 없는 지역(부산)은 요청하지 않고 기본 목록
  await page.goto('#/settings');
  await page.locator('#region').selectOption('21');
  await page.goto('#/');
  await expect(page.locator('#pop-sub')).toContainText('경북 고등학생');
  expect(asked).toEqual(['11']);
});

test('도서관마다 홈페이지에서 이 책을 바로 찾는 링크(모르는 곳은 제목 복사 후 홈페이지)', async ({ page }) => {
  await page.route('**/data/opac.json', (route) =>
    route.fulfill({ json: { hosts: { 'lib.andong.go.kr': 'https://lib.andong.go.kr/search/result?kw={q}&lib=ALL' } } }),
  );
  await pickLibraries(page);
  await openFirstResult(page);
  const andong = page.locator('#mine [data-lib="147163"] [data-site] a');
  await expect(andong).toHaveText('홈페이지에서 바로 찾기');
  await expect(andong).toHaveAttribute('href', `https://lib.andong.go.kr/search/result?kw=${encodeURIComponent('데미안')}&lib=ALL`);
  await expect(andong).toHaveAttribute('target', '_blank');
  const gb = page.locator('#mine [data-lib="147168"] [data-site] a');
  await expect(gb).toHaveText('홈페이지 (제목 복사)');
  await expect(gb).toHaveAttribute('href', 'https://www.gb.go.kr/lib');
  await expect(gb).toHaveAttribute('data-copy-title', '데미안');

  // 책 정보를 처음 받아 오는 경우(바로 이 주소로 들어옴)에도 제목이 들어간다
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':c:')).forEach((k) => localStorage.removeItem(k)));
  await page.goto('#/book/9788937460449');
  await page.reload();
  await expect(page.locator('#mine [data-lib="147030"] [data-site] a')).toHaveAttribute('href', /kw=%EB%8D%B0%EB%AF%B8%EC%95%88/);
});

test('요청서(POST) 방식 도서관: 바로 찾기를 누르면 제목을 채워 새 창으로 검색을 보낸다', async ({ page, context }) => {
  await page.route('**/data/opac.json', (route) =>
    route.fulfill({
      json: { hosts: { 'lib.andong.go.kr': { method: 'post', action: 'https://proxy.example/opac-search.do', fields: { mode: 'simple', searchWord: '{q}' }, charset: 'UTF-8' } } },
    }),
  );
  const sent = [];
  await context.route('https://proxy.example/opac-search.do', (route) => {
    sent.push({ method: route.request().method(), body: route.request().postData() });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>검색 결과</p>' });
  });
  await pickLibraries(page);
  await openFirstResult(page);
  const button = page.locator('#mine [data-lib="147163"] [data-site] button');
  await expect(button).toHaveText('홈페이지에서 바로 찾기');
  const [popup] = await Promise.all([page.waitForEvent('popup'), button.click()]);
  await popup.waitForLoadState();
  expect(sent).toEqual([{ method: 'POST', body: `mode=simple&searchWord=${encodeURIComponent('데미안')}` }]);
  await expect(popup.locator('p')).toHaveText('검색 결과');
  await popup.close();
  // 폼은 보낸 뒤 바로 치운다
  await expect(page.locator('body > form')).toHaveCount(0);
});

test('모두 대출 중이면 알림 → 예약 → 다른 도서관 → 책바다 → 사기 순서로 다음 방법을 보여 준다', async ({ page }) => {
  await pickLibraries(page);
  // 대출 중(147030)과 소장 안 함(147163)만 남긴다
  await page.evaluate(() => localStorage.setItem('chaekitna:myLibraries', JSON.stringify(['147030', '147163'])));
  await page.goto('#/book/9788937460449');
  const next = page.locator('#next');
  await expect(next.locator('h2')).toHaveText('지금은 모두 대출 중이에요. 이렇게 해 보세요');
  await expect(next.locator('.next__title')).toHaveText(['반납되면 알림 받기', '도서관 홈페이지에서 예약하기', '같은 시·도 다른 도서관', '책바다로 다른 지역 책 받기', '사서 읽기']);
  // 예약 단계는 대출 중인 도서관(안동시립웅부도서관) 홈페이지로
  await expect(next.locator('.next__step').nth(1).locator('a')).toHaveAttribute('href', 'https://lib.andong.go.kr/');
  // 관심 도서에 담으면 그 단계가 '담겨 있어요'로 바뀐다
  await next.getByRole('button', { name: '관심 도서에 담기' }).click();
  await expect(next.locator('.next__done')).toHaveText('관심 도서에 담겨 있어요');
  await expect(page.locator('#watch')).toContainText('관심 도서에 담겼어요');
  // 다른 도서관 찾아보기는 더 넓게 찾기를 실행한다
  await next.getByRole('button', { name: '다른 도서관 찾아보기' }).click();
  await expect(page.locator('#wide .row')).toHaveCount(2);
});

test('책 화면을 여러 번 옮겨 다녀도 버튼이 한 번만 동작한다(지난 책 화면의 처리기가 남지 않음)', async ({ page, context }) => {
  await page.route('**/data/opac.json', (route) =>
    route.fulfill({
      json: { hosts: { 'lib.andong.go.kr': { method: 'post', action: 'https://proxy.example/opac-search.do', fields: { searchWord: '{q}' }, charset: 'UTF-8' } } },
    }),
  );
  const sent = [];
  await context.route('https://proxy.example/opac-search.do', (route) => {
    sent.push(route.request().postData());
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>검색 결과</p>' });
  });
  await pickLibraries(page);
  // 다른 책 화면을 두 번 거친 뒤
  await page.goto('#/book/9791164455221');
  await expect(page.locator('#mine .card')).toHaveCount(3);
  await page.goto('#/watchlist');
  await openFirstResult(page);
  const popups = [];
  context.on('page', (p) => popups.push(p));
  await page.locator('#mine [data-lib="147163"] [data-site] button').click();
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(500);
  expect(sent, '검색 요청은 한 번만').toHaveLength(1);
  expect(popups, '새 창은 하나만').toHaveLength(1);
});

test('내 도서관에 없으면 다른 도서관 → 책바다 → 희망도서 → 사기, 빌릴 수 있으면 안내하지 않는다', async ({ page }) => {
  await pickLibraries(page);
  await page.evaluate(() => localStorage.setItem('chaekitna:myLibraries', JSON.stringify(['147163'])));
  await page.goto('#/book/9788937460449');
  await expect(page.locator('#next .next__title')).toHaveText(['같은 시·도 다른 도서관', '책바다로 다른 지역 책 받기', '희망도서로 신청하기', '사서 읽기']);
  await expect(page.locator('#next a', { hasText: '책바다에서 신청' })).toHaveAttribute('href', 'https://books.nl.go.kr/nill/contents/NI2010000000.do');
  await expect(page.locator('#next a', { hasText: '교보문고' })).toHaveAttribute('href', 'https://search.kyobobook.co.kr/search?keyword=9788937460449');

  await page.evaluate(() => localStorage.setItem('chaekitna:myLibraries', JSON.stringify(['147168', '147163'])));
  await page.reload();
  await expect(page.locator('#summary .summary__big')).toHaveText('1곳');
  await expect(page.locator('#next')).toHaveCount(0);
});

test('관심 도서: 오늘 어디 갈까 - 빌릴 수 있는 관심 도서가 많은 내 도서관부터', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+09:00')); // 수요일
  await pickLibraries(page);
  await page.evaluate(() =>
    localStorage.setItem(
      'chaekitna:watchlist',
      JSON.stringify([
        { isbn13: '9788937460449', title: '데미안', authors: '헤르만 헤세', addedAt: 1 },
        { isbn13: '9791164455221', title: '데미안 (큰글자책)', authors: '헤르만 헤세', addedAt: 2 },
      ]),
    ),
  );
  await page.goto('#/watchlist');
  const today = page.locator('#today');
  await expect(today.locator('h2')).toHaveText('오늘 어디 갈까');
  // 가짜 프록시: 경북도서관(147168)만 대출 가능
  await expect(today.locator('.today__row').first().locator('.row__title')).toHaveText('경북도서관');
  await expect(today.locator('.today__row').first().locator('.row__figure')).toHaveText('2권');
  await expect(today.locator('.section__sub')).toContainText('경북도서관에 가면 관심 도서 2권을 빌릴 수 있어요');
  await expect(today.locator('.today__row').first().locator('.row__sub')).toHaveText('데미안, 데미안 (큰글자책)');
  await expect(today.locator('.today__row')).toHaveCount(3);
});

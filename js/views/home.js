import { html, toIsbn13, toMarkup } from '../util.js';
import { brandMark, demoBadge, demoNotice, icon, setTopbar, skeletonRows } from '../ui.js';
import * as store from '../store.js';
import { isDemoMode, popularBooks } from '../api.js';
import { getLibrary, loadLibraries } from '../libraries.js';
import { openScanner } from '../scan.js';

function popularSubtitle(data) {
  if (data.demo) return '예시 목록이에요. 매주 월요일 도서관 정보나루 데이터로 바뀌어요.';
  const parts = [data.regionName, data.ageName].filter(Boolean).join(' ');
  return `${parts ? `${parts} · ` : ''}${data.period || ''} · 출처 도서관 정보나루`;
}

export async function render({ main, navigate, signal }) {
  document.title = '책있나 — 내 도서관에 그 책 있나?';
  setTopbar(html`
    <a class="brand" href="#/" aria-label="책있나 처음 화면">${brandMark(30)}<span class="brand__name">책있나</span></a>
    <a class="icon-btn" href="#/settings" aria-label="설정">${icon('menu')}</a>`);

  const mine = store.myLibraries.list();
  const recent = store.recentSearches.list();

  main.innerHTML = toMarkup(html`
    <section class="section">
      <h1 class="h1">어떤 책 찾아요?</h1>
      <form class="stack" id="search-form" role="search">
        <label class="field__label" for="q">책 제목, 저자, ISBN</label>
        <div class="searchbox">${icon('search')}<input id="q" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="예: 데미안"></div>
        <div class="btn-row">
          <button class="btn btn--primary" type="submit">검색</button>
          <button class="btn" type="button" id="scan" aria-label="바코드로 찾기">${icon('barcode')}바코드</button>
        </div>
      </form>
      ${recent.length
        ? html`<div class="chips" aria-label="최근 검색어">${recent.map((q) => html`<a class="chip" href="#/search?q=${encodeURIComponent(q)}">${q}</a>`)}</div>`
        : ''}
    </section>

    ${isDemoMode() ? demoNotice() : ''}

    <section class="section" aria-labelledby="mylibs-h">
      <div class="section__head">
        <h2 class="h2" id="mylibs-h">내 도서관 ${mine.length}곳</h2>
        <a href="#/libraries">${mine.length ? '편집' : '고르기'}</a>
      </div>
      <div class="chips" id="mylibs">
        ${mine.length
          ? mine.map(() => html`<span class="chip skeleton" style="width:7rem" aria-hidden="true"></span>`)
          : html`<a class="chip chip--add" href="#/libraries">${icon('plus')}자주 가는 도서관 고르기</a>`}
      </div>
    </section>

    <section class="section" aria-labelledby="pop-h">
      <h2 class="h2" id="pop-h">이번 주 인기 도서</h2>
      <p class="small muted" id="pop-sub">불러오는 중</p>
      <ol class="list" id="pop-list">${skeletonRows(3, '3.2rem')}</ol>
    </section>`);

  const form = main.querySelector('#search-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = form.q.value.trim();
    if (!q) {
      form.q.focus();
      return;
    }
    const isbn = toIsbn13(q);
    if (isbn) {
      navigate(`#/book/${isbn}`);
      return;
    }
    store.recentSearches.add(q);
    navigate(`#/search?q=${encodeURIComponent(q)}`);
  });

  main.querySelector('#scan').addEventListener('click', async () => {
    const isbn = await openScanner();
    if (isbn) navigate(`#/book/${isbn}`);
  });

  // 내 도서관 이름 채우기
  if (mine.length) {
    loadLibraries()
      .then(() => {
        if (signal.aborted) return;
        const box = main.querySelector('#mylibs');
        box.innerHTML = toMarkup(
          mine.map((code) => {
            const lib = getLibrary(code);
            return html`<span class="chip">${lib ? lib.name : `도서관 ${code}`}</span>`;
          }),
        );
      })
      .catch(() => {
        if (!signal.aborted) main.querySelector('#mylibs').textContent = '도서관 목록을 불러오지 못했어요.';
      });
  }

  // 이번 주 인기 도서
  const data = await popularBooks();
  if (signal.aborted) return;
  main.querySelector('#pop-sub').textContent = popularSubtitle(data);
  const items = data.items.slice(0, 10);
  // 인기 도서의 제목·저자는 이미 있으니, 눌러서 상세로 갈 때 책 정보를 다시 조회하지 않게 저장해 둔다.
  if (!data.demo) {
    const until = Date.now() + 7 * 24 * 3600 * 1000;
    for (const book of items) {
      if (/^\d{13}$/.test(book.isbn13 || '') && !store.cacheGet(`b:${book.isbn13}`)) store.cacheSet(`b:${book.isbn13}`, book, until);
    }
  }
  main.querySelector('#pop-list').innerHTML = toMarkup(
    items.map(
      (book, i) => html`<li><a class="row" href="#/book/${book.isbn13}">
        <span class="rank">${book.rank || i + 1}</span>
        <span class="row__body">
          <span class="row__title">${book.title}</span>
          <span class="row__sub">${book.authors}</span>
        </span>
        ${data.demo ? demoBadge() : ''}
        ${icon('chevron', { cls: 'row__chev' })}
      </a></li>`,
    ),
  );
}

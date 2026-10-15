import { html, toIsbn13, toMarkup } from '../util.js';
import { backButton, cover, demoBadge, demoNotice, errorNotice, icon, setTopbar, skeletonRows } from '../ui.js';
import * as store from '../store.js';
import { isDemoMode, searchBooks } from '../api.js';

const SORTS = [
  { id: 'loan', label: '대출 많은 순' },
  { id: 'pubYear', label: '최신순' },
  { id: 'title', label: '제목순' },
];

function bookRow(book, demo) {
  const meta = [book.publisher, book.year].filter(Boolean).join(' · ');
  return html`<li><a class="row" href="#/book/${book.isbn13}">
    ${cover(book)}
    <span class="row__body">
      <span class="row__title">${book.title}</span>
      <span class="row__sub">${book.authors}</span>
      ${meta ? html`<span class="row__sub">${meta}</span>` : ''}
    </span>
    ${demo ? demoBadge() : ''}
    ${icon('chevron', { cls: 'row__chev' })}
  </a></li>`;
}

export async function render({ main, query, navigate, signal }) {
  const q = (query.get('q') || '').trim();
  const sort = SORTS.some((s) => s.id === query.get('sort')) ? query.get('sort') : 'loan';
  document.title = `${q || '검색'} — 책있나`;
  setTopbar(html`${backButton('#/')}<h1 class="topbar__title">검색 결과</h1>`);

  main.innerHTML = toMarkup(html`
    <form class="stack" id="search-form" role="search">
      <label class="sr-only" for="q">검색어</label>
      <div class="searchbox searchbox--soft">${icon('search')}<input id="q" name="q" type="search" enterkeyhint="search" autocomplete="off" value="${q}"></div>
    </form>
    <div class="chips" role="group" aria-label="정렬">
      ${SORTS.map((s) => html`<button class="chip" type="button" data-sort="${s.id}" aria-pressed="${s.id === sort ? 'true' : 'false'}">${s.label}</button>`)}
    </div>
    ${isDemoMode() ? demoNotice() : ''}
    <div id="results" aria-live="polite">${skeletonRows(4, '5.6rem')}</div>
    <p class="footer-note">책 정보 출처: 도서관 정보나루</p>`);

  const form = main.querySelector('#search-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = form.q.value.trim();
    if (!next) return;
    const isbn = toIsbn13(next);
    if (isbn) {
      navigate(`#/book/${isbn}`);
      return;
    }
    store.recentSearches.add(next);
    navigate(`#/search?q=${encodeURIComponent(next)}&sort=${sort}`);
  });
  main.querySelectorAll('[data-sort]').forEach((btn) =>
    btn.addEventListener('click', () => navigate(`#/search?q=${encodeURIComponent(q)}&sort=${btn.dataset.sort}`)),
  );

  if (!q) {
    main.querySelector('#results').innerHTML = toMarkup(html`<div class="empty">${icon('search')}<p>검색어를 입력해 주세요.</p></div>`);
    return;
  }

  const box = main.querySelector('#results');
  let page = 1;
  let shown = [];

  const load = async () => {
    try {
      const result = await searchBooks(q, { page, sort, signal });
      if (signal.aborted) return;
      // 상세 화면이 바로 제목을 보여줄 수 있게 잠깐 저장
      for (const book of result.books) store.cacheSet(`b:${book.isbn13}`, book, Date.now() + 7 * 24 * 3600 * 1000);
      shown = shown.concat(result.books);
      if (!shown.length) {
        box.innerHTML = toMarkup(html`<div class="empty">${icon('book')}
          <p><strong>"${q}"</strong> 검색 결과가 없어요.</p>
          <p class="small">띄어쓰기를 바꾸거나 저자 이름으로 찾아보세요.</p></div>`);
        return;
      }
      const more = !result.demo && shown.length < result.total && result.books.length > 0;
      box.innerHTML = toMarkup(html`
        ${result.demo && result.matched === false ? html`<p class="small muted">예시 데이터에는 "${q}"가 없어서 예시 도서를 보여드려요.</p>` : ''}
        <p class="small muted">${result.demo ? '예시 결과' : `${result.total.toLocaleString('ko-KR')}권 중 ${shown.length}권`}</p>
        <ul class="list">${shown.map((book) => bookRow(book, result.demo))}</ul>
        ${more ? html`<button class="btn btn--block" type="button" id="more">더 보기</button>` : ''}`);
      const moreBtn = box.querySelector('#more');
      if (moreBtn) {
        moreBtn.addEventListener('click', () => {
          moreBtn.disabled = true;
          moreBtn.textContent = '불러오는 중';
          page += 1;
          load();
        });
      }
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) return;
      box.innerHTML = toMarkup(errorNotice(error, 'retry'));
      box.querySelector('#retry')?.addEventListener('click', () => {
        box.innerHTML = toMarkup(skeletonRows(4, '5.6rem'));
        load();
      });
    }
  };
  load();
}

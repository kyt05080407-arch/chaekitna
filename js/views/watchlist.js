import { basisLabel, html, toMarkup } from '../util.js';
import { cover, demoBadge, errorNotice, icon, setTopbar, statusBadge, toast } from '../ui.js';
import * as store from '../store.js';
import { availability } from '../api.js';
import { statusOf } from '../parse.js';
import * as demo from '../demo.js';

// 하루 호출 한도를 아끼려고 화면을 열 때 자동으로 확인하는 책은 앞의 10권까지만
const AUTO_CHECK = 10;

function summarize(statuses) {
  const values = Object.values(statuses || {});
  if (!values.length) return { status: 'unknown', text: '아직 확인 전' };
  const available = values.filter((s) => s === 'available').length;
  if (available) return { status: 'available', text: `${available}곳 대출 가능` };
  if (values.some((s) => s === 'loaned')) return { status: 'loaned', text: '모두 대출 중' };
  if (values.every((s) => s === 'none')) return { status: 'none', text: '내 도서관에 없음' };
  return { status: 'unknown', text: '확인 못 함' };
}

function wasAvailable(statuses) {
  return Object.values(statuses || {}).some((s) => s === 'available');
}

export async function render({ main, signal }) {
  document.title = '관심 도서 — 책있나';
  setTopbar(html`<h1 class="topbar__title" style="padding-left:0.45rem">관심 도서</h1>`);

  const books = store.watchlist.list();
  const mine = store.myLibraries.list();

  if (!books.length) {
    main.innerHTML = toMarkup(html`<div class="empty">${icon('star')}
      <p><strong>아직 담은 책이 없어요</strong></p>
      <p class="small">책 상세 화면에서 별표를 누르면 여기 모여요.</p>
      <a class="btn btn--primary" href="#/">책 찾으러 가기</a></div>`);
    return;
  }

  main.innerHTML = toMarkup(html`
    <p class="small muted">내 도서관 ${mine.length}곳 기준 · ${basisLabel()}</p>
    <div id="news" aria-live="polite"></div>
    ${!mine.length ? html`<div class="notice">${icon('info')}<span>내 도서관을 고르면 담은 책의 대출 상태를 한눈에 볼 수 있어요. <a href="#/libraries?back=%23%2Fwatchlist">고르기</a></span></div>` : ''}
    <div class="stack" id="books">
      ${books.map((b, i) => {
        const s = summarize(b.last);
        return html`<div class="card" data-isbn="${b.isbn13}">
          <a class="row" href="#/book/${b.isbn13}" style="border:0;padding:0">
            ${cover(b)}
            <span class="row__body">
              <span class="row__title">${b.title}</span>
              <span class="row__sub">${b.authors}</span>
              <span style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;margin-top:0.3rem" data-state>
                ${b.last ? statusBadge(s.status) : html`<span class="badge badge--unknown">${i < AUTO_CHECK && mine.length ? '확인 중' : '확인 전'}</span>`}
                ${demo.isDemoIsbn(b.isbn13) ? demoBadge() : ''}
                ${b.last ? html`<span class="small muted">${s.text}</span>` : ''}
              </span>
            </span>
          </a>
          <div class="card__links">
            ${i >= AUTO_CHECK && mine.length ? html`<button class="btn btn--small" type="button" data-check="${b.isbn13}">${icon('refresh')}상태 확인</button>` : ''}
            <button class="btn btn--small" type="button" data-remove="${b.isbn13}">${icon('trash')}빼기</button>
          </div>
        </div>`;
      })}
    </div>
    <p class="footer-note">대출 가능 알림(아침 푸시)은 다음 업데이트에서 열려요.</p>`);

  main.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.watchlist.remove(btn.dataset.remove);
      btn.closest('.card')?.remove();
      toast('관심 도서에서 뺐어요');
    }),
  );

  if (!mine.length) return;

  let newlyAvailable = 0;
  const check = async (book) => {
    const card = main.querySelector(`[data-isbn="${book.isbn13}"]`);
    const slot = card && card.querySelector('[data-state]');
    try {
      const res = await availability(book.isbn13, mine, { signal });
      if (signal.aborted) return;
      const statuses = {};
      for (const code of mine) statuses[code] = statusOf(res[code]);
      const s = summarize(statuses);
      if (book.last && !wasAvailable(book.last) && wasAvailable(statuses)) newlyAvailable += 1;
      store.watchlist.update(book.isbn13, { last: statuses, checkedAt: Date.now() });
      if (slot) {
        slot.innerHTML = toMarkup(html`${statusBadge(s.status)}${demo.isDemoIsbn(book.isbn13) ? demoBadge() : ''}<span class="small muted">${s.text}</span>`);
      }
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) return;
      if (slot) slot.innerHTML = toMarkup(errorNotice(error));
    }
  };

  main.querySelectorAll('[data-check]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const book = store.watchlist.list().find((b) => b.isbn13 === btn.dataset.check);
      if (book) await check(book);
      btn.remove();
    }),
  );

  for (const book of books.slice(0, AUTO_CHECK)) {
    await check(book);
    if (signal.aborted) return;
  }
  if (newlyAvailable) {
    main.querySelector('#news').innerHTML = toMarkup(html`<div class="notice notice--demo">${icon('bell')}<span><strong>새로 빌릴 수 있게 된 책 ${newlyAvailable}권</strong></span></div>`);
  }
}

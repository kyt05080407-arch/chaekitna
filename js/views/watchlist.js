import { basisLabel, html, toMarkup } from '../util.js';
import { cover, demoBadge, errorNotice, icon, setTopbar, statusBadge, toast } from '../ui.js';
import * as store from '../store.js';
import { availability } from '../api.js';
import { statusOf } from '../parse.js';
import * as demo from '../demo.js';
import { MAX_ALERT_BOOKS, disablePush, enablePush, pushStatus } from '../push.js';

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

// 아침 알림 안내·켜기/끄기
function alertsBox(status) {
  const what = `최근에 담은 ${MAX_ALERT_BOOKS}권이 내 도서관에서 반납돼 빌릴 수 있게 되면 다음 날 아침 9시쯤 알려 드려요.`;
  const stored = '알림을 켜면 알림 주소, 관심 도서 ISBN·제목, 도서관 코드가 알림 서버에 저장되고, 끄면 바로 지워요.';
  switch (status) {
    case 'off':
      return html`<p class="footer-note">대출 가능 알림(아침 푸시)은 다음 업데이트에서 열려요.</p>`;
    case 'ios-install':
      return html`<div class="card card--soft stack">
        <p class="alert-head">${icon('bell')}<strong>아침 알림</strong></p>
        <p class="small">아이폰은 책있나를 홈 화면에 추가한 뒤, 그 앱에서 알림을 켤 수 있어요. 방법은 <a href="#/settings">설정</a>에 있어요.</p></div>`;
    case 'unsupported':
      return html`<p class="footer-note">이 브라우저에서는 알림을 받을 수 없어요. 크롬이나 홈 화면에 추가한 앱에서 열어 주세요.</p>`;
    case 'denied':
      return html`<div class="card card--soft stack">
        <p class="alert-head">${icon('bell')}<strong>알림이 막혀 있어요</strong></p>
        <p class="small">브라우저 설정의 사이트 설정에서 이 사이트 알림을 허용하면 아침 알림을 켤 수 있어요.</p></div>`;
    case 'on':
      return html`<div class="card card--soft stack">
        <p class="alert-head">${icon('bell', { filled: true })}<strong>아침 알림을 받고 있어요</strong></p>
        <p class="small">${what}</p>
        <button class="btn btn--small btn--outline" type="button" id="push-off">알림 끄기</button></div>`;
    default:
      return html`<div class="card card--soft stack">
        <p class="alert-head">${icon('bell')}<strong>반납되면 아침에 알려 드릴까요?</strong></p>
        <p class="small">${what}</p>
        <button class="btn btn--primary" type="button" id="push-on">${icon('bell')}아침 알림 받기</button>
        <p class="small muted">${stored}</p></div>`;
  }
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
    <section class="section" id="alerts" aria-live="polite">${alertsBox(pushStatus())}</section>`);

  // ---------- 아침 알림 ----------
  const alerts = main.querySelector('#alerts');
  const renderAlerts = () => {
    alerts.innerHTML = toMarkup(alertsBox(pushStatus()));
    alerts.querySelector('#push-on')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.lastChild.textContent = '켜는 중…';
      try {
        const count = await enablePush();
        toast(`관심 도서 ${count}권 알림을 켰어요`);
      } catch (error) {
        toast((error && error.message) || '알림을 켜지 못했어요');
      }
      renderAlerts();
    });
    alerts.querySelector('#push-off')?.addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      await disablePush();
      toast('아침 알림을 껐어요');
      renderAlerts();
    });
  };
  renderAlerts();

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

import { basisLabel, html, safeHttpUrl, telHref, toMarkup } from '../util.js';
import { backButton, cover, demoBadge, demoNotice, errorNotice, icon, setTopbar, skeletonRows, statusBadge, toast } from '../ui.js';
import * as store from '../store.js';
import { availability, bookDetail, holdings, isDemoMode } from '../api.js';
import { getLibrary, loadLibraries } from '../libraries.js';
import { REGIONS, regionByCode } from '../regions.js';
import { statusOf } from '../parse.js';
import { CONFIG } from '../config.js';
import * as demo from '../demo.js';

function bookHead(book, isbn) {
  if (!book) {
    return html`<div class="book-head">${cover(null, 'lg')}<div class="book-head__body">
      <p class="book-head__title">ISBN ${isbn}</p>
      <p class="book-head__meta">책 정보를 찾지 못했어요. 소장 여부는 아래에서 확인할 수 있어요.</p></div></div>`;
  }
  const meta = [book.publisher, book.year].filter(Boolean).join(' · ');
  return html`<div class="book-head">${cover(book, 'lg')}<div class="book-head__body">
    <h1 class="book-head__title">${book.title}</h1>
    ${book.authors ? html`<p class="lead">${book.authors}</p>` : ''}
    ${meta ? html`<p class="book-head__meta">${meta}</p>` : ''}
    <p class="book-head__meta">ISBN ${isbn}</p>
  </div></div>`;
}

// 예시 도서의 대출 상태는 지어낸 값이라 '예시' 표시를 꼭 붙인다.
function badges(status, isDemo) {
  return html`${statusBadge(status)}${isDemo ? demoBadge() : ''}`;
}

function libraryCard(lib, code, status) {
  const name = lib ? lib.name : `도서관 ${code}`;
  const home = lib ? safeHttpUrl(lib.homepage) : '';
  const tel = lib ? telHref(lib.tel) : '';
  return html`<div class="card" data-lib="${code}">
    <div class="card__top"><span class="card__name">${name}</span><span class="badges" data-status>${status ? statusBadge(status) : html`<span class="badge badge--unknown">확인 중</span>`}</span></div>
    ${lib && lib.hours ? html`<p class="card__meta">${lib.hours.length > 60 ? `${lib.hours.slice(0, 60)}…` : lib.hours}</p>` : ''}
    <div class="card__links">
      ${home ? html`<a href="${home}" target="_blank" rel="noopener noreferrer">${icon('external')}홈페이지에서 확인</a>` : ''}
      ${tel ? html`<a href="${tel}">${icon('phone')}전화</a>` : ''}
    </div>
  </div>`;
}

function summaryText(statuses, total) {
  const values = Object.values(statuses);
  if (values.length && values.every((s) => s === 'unknown') && isDemoMode()) return '예시 데이터 모드라 실제 대출 정보를 볼 수 없어요';
  const available = values.filter((s) => s === 'available').length;
  const loaned = values.filter((s) => s === 'loaned').length;
  const none = values.filter((s) => s === 'none').length;
  if (available > 0) return `내 도서관 ${total}곳 중 ${available}곳에서 빌릴 수 있어요`;
  if (loaned > 0) return `내 도서관에 있지만 지금은 모두 대출 중이에요`;
  if (none === total) return '내 도서관에는 이 책이 없어요';
  return '일부 도서관은 확인하지 못했어요';
}

export async function render({ main, params, signal }) {
  const isbn = params.isbn;
  let book = demo.isDemoIsbn(isbn) ? demo.bookByIsbn(isbn) : store.cacheGet(`b:${isbn}`);
  const watched = () => store.watchlist.has(isbn);

  const renderTopbar = () =>
    setTopbar(html`${backButton('#/')}<span class="topbar__title"></span>
      ${navigator.share ? html`<button class="icon-btn" type="button" id="share" aria-label="공유">${icon('share')}</button>` : ''}
      <button class="icon-btn" type="button" id="star" aria-pressed="${watched() ? 'true' : 'false'}" aria-label="관심 도서">${icon('star', { filled: watched() })}</button>`);
  renderTopbar();

  const mine = store.myLibraries.list();
  const settings = store.settings.get();

  main.innerHTML = toMarkup(html`
    <section id="head">${book ? bookHead(book, isbn) : skeletonRows(1, '6.3rem')}</section>
    ${isDemoMode() || demo.isDemoIsbn(isbn) ? demoNotice() : ''}
    <section class="summary" id="summary" aria-live="polite">
      <p class="summary__main">${mine.length ? '내 도서관을 확인하는 중이에요' : '내 도서관을 먼저 골라 주세요'}</p>
      <p class="summary__sub">${basisLabel()} · 대출 정보는 하루 늦게 반영돼요</p>
    </section>
    <section class="section" aria-label="내 도서관별 현황">
      <div class="stack" id="mine">
        ${mine.length
          ? skeletonRows(mine.length, '5.2rem')
          : html`<a class="btn btn--primary btn--block" href="#/libraries?back=${encodeURIComponent(`#/book/${isbn}`)}">${icon('library')}자주 가는 도서관 고르기</a>`}
      </div>
    </section>
    <section class="section">
      <button class="btn btn--block ${watched() ? 'btn--outline' : 'btn--primary'}" type="button" id="watch">${icon('star')}<span>${watched() ? '관심 도서에 담겼어요' : '관심 도서에 담기'}</span></button>
      <p class="small muted">대출 가능해지면 아침에 알려주는 기능은 다음 업데이트에서 열려요. 지금은 관심 도서 탭에서 상태를 한눈에 볼 수 있어요.</p>
    </section>
    <section class="section" aria-labelledby="wide-h">
      <h2 class="h2" id="wide-h">더 넓게 찾기</h2>
      <div class="btn-row">
        <label class="sr-only" for="region">지역</label>
        <select class="input" id="region">${REGIONS.map((r) => html`<option value="${r.code}">${r.name}</option>`)}</select>
        <button class="btn" type="button" id="find-wide">찾기</button>
      </div>
      <div id="wide" class="stack" aria-live="polite"></div>
    </section>
    <p class="footer-note">출처: 도서관 정보나루 · 방문 전 도서관 홈페이지에서 한 번 더 확인하세요</p>`);

  // ---------- 관심 도서 ----------
  const toggleWatch = () => {
    if (watched()) {
      store.watchlist.remove(isbn);
      toast('관심 도서에서 뺐어요');
    } else {
      store.watchlist.add(book || { isbn13: isbn, title: `ISBN ${isbn}` });
      toast('관심 도서에 담았어요');
    }
    renderTopbar();
    bindTopbar();
    const btn = main.querySelector('#watch');
    btn.className = `btn btn--block ${watched() ? 'btn--outline' : 'btn--primary'}`;
    btn.querySelector('span').textContent = watched() ? '관심 도서에 담겼어요' : '관심 도서에 담기';
  };
  function bindTopbar() {
    document.getElementById('star')?.addEventListener('click', toggleWatch);
    document.getElementById('share')?.addEventListener('click', async () => {
      try {
        await navigator.share({ title: book ? book.title : '책있나', text: '내 도서관에 이 책 있나 확인해 봐요', url: location.href });
      } catch {
        /* 공유 취소 */
      }
    });
  }
  bindTopbar();
  main.querySelector('#watch').addEventListener('click', toggleWatch);

  // ---------- 책 정보 ----------
  if (!book) {
    bookDetail(isbn, { signal })
      .then((found) => {
        if (signal.aborted) return;
        book = found;
        main.querySelector('#head').innerHTML = toMarkup(bookHead(found, isbn));
        if (found) document.title = `${found.title} — 책있나`;
      })
      .catch(() => {
        if (!signal.aborted) main.querySelector('#head').innerHTML = toMarkup(bookHead(null, isbn));
      });
  } else {
    document.title = `${book.title} — 책있나`;
  }

  // ---------- 지역 선택 기본값 ----------
  await loadLibraries().catch(() => null);
  if (signal.aborted) return;
  const firstLib = mine.length ? getLibrary(mine[0]) : null;
  const regionSelect = main.querySelector('#region');
  regionSelect.value = (firstLib && firstLib.region) || settings.region || CONFIG.defaultRegion;

  // ---------- 내 도서관 현황 ----------
  const mineBox = main.querySelector('#mine');
  const loadMine = async (force = false) => {
    mineBox.innerHTML = toMarkup(mine.map((code) => libraryCard(getLibrary(code), code, null)));
    try {
      const result = await availability(isbn, mine, { signal, force });
      if (signal.aborted) return;
      const statuses = {};
      for (const code of mine) {
        statuses[code] = statusOf(result[code]);
        const slot = mineBox.querySelector(`[data-lib="${code}"] [data-status]`);
        if (slot) slot.innerHTML = toMarkup(badges(statuses[code], demo.isDemoIsbn(isbn)));
      }
      main.querySelector('#summary .summary__main').textContent = summaryText(statuses, mine.length);
      if (result.budget) toast('오늘 조회 한도를 다 써서 일부 도서관은 확인하지 못했어요');
      if (watched()) store.watchlist.update(isbn, { last: statuses, checkedAt: Date.now() });
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) return;
      main.querySelector('#summary .summary__main').textContent = '현황을 불러오지 못했어요';
      mineBox.insertAdjacentHTML('afterbegin', toMarkup(errorNotice(error, 'retry-mine')));
      mineBox.querySelector('#retry-mine')?.addEventListener('click', () => loadMine(true));
    }
  };
  if (mine.length) loadMine();

  // ---------- 더 넓게 찾기 ----------
  const wide = main.querySelector('#wide');
  main.querySelector('#find-wide').addEventListener('click', async () => {
    const region = regionSelect.value;
    const regionName = regionByCode(region)?.name || '';
    wide.innerHTML = toMarkup(skeletonRows(3, '3.6rem'));
    try {
      const found = await holdings(isbn, region, { signal });
      if (signal.aborted) return;
      const codes = found.codes.filter((code) => !mine.includes(code)).slice(0, 20);
      if (found.unavailable) {
        wide.innerHTML = toMarkup(html`<p class="muted">지금은 예시 데이터 모드라 실제 책은 찾을 수 없어요.</p>`);
        return;
      }
      if (!codes.length) {
        wide.innerHTML = toMarkup(html`<p class="muted">${regionName}에서 내 도서관 말고 이 책을 가진 도서관을 찾지 못했어요.</p>`);
        return;
      }
      wide.innerHTML = toMarkup(html`
        <p class="small muted">${regionName}에서 이 책을 가진 도서관 ${codes.length}곳${found.demo ? ' (예시)' : ''}</p>
        <ul class="list">${codes.map((code) => {
          const lib = getLibrary(code) || (found.libraries || []).find((l) => l.code === code);
          return html`<li class="row" data-wide="${code}">
            <span class="row__body"><span class="row__title">${lib ? lib.name : code}</span><span class="row__sub">${lib ? lib.address : ''}</span></span>
            <span class="badges" data-status><button class="btn btn--small" type="button" data-check="${code}">대출 확인</button></span>
          </li>`;
        })}</ul>`);
      wide.querySelectorAll('[data-check]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          const code = btn.dataset.check;
          btn.disabled = true;
          btn.textContent = '확인 중';
          try {
            const res = await availability(isbn, [code], { signal });
            const slot = wide.querySelector(`[data-wide="${code}"] [data-status]`);
            if (slot) slot.innerHTML = toMarkup(badges(statusOf(res[code]), demo.isDemoIsbn(isbn)));
          } catch (error) {
            btn.disabled = false;
            btn.textContent = '대출 확인';
            toast(error.message || '확인하지 못했어요');
          }
        }),
      );
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) return;
      wide.innerHTML = toMarkup(errorNotice(error));
    }
  });
}

import { html, toIsbn13, toMarkup } from '../util.js';
import { brandMark, demoBadge, demoNotice, icon, readingCard, setTopbar, skeletonRows } from '../ui.js';
import * as store from '../store.js';
import { isDemoMode, myRegion, popularBooks } from '../api.js';
import { getLibrary, loadLibraries } from '../libraries.js';
import { openScanner } from '../scan.js';
import { closedToday } from '../hours.js';
import { eventWhen, loadEvents, upcomingEvents } from '../events.js';
import { nextReading } from '../reading.js';

function popularSubtitle(data, tab) {
  if (data.demo) return '예시 목록이에요. 매주 월요일 도서관 정보나루 데이터로 바뀌어요.';
  const who = tab && tab.age ? `${tab.label}${tab.basis ? `(${tab.basis})` : ''}` : data.ageName || (data.groups && data.groups.length ? '모든 나이' : '');
  const parts = [data.regionName, who].filter(Boolean).join(' ');
  return `${parts ? `${parts} · ` : ''}${data.period || ''} · 출처 도서관 정보나루`;
}

// 나잇대 탭: 전체(기본 목록 앞 10권) + 정보나루 나잇대별 TOP 10
function popularTabs(data) {
  const all = { age: '', label: '전체', items: data.items.slice(0, 10) };
  const groups = Array.isArray(data.groups) ? data.groups.filter((g) => g && g.label && Array.isArray(g.items) && g.items.length) : [];
  return [all, ...groups];
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 작가 강연 배너 한 장
function promoItem(event) {
  const d = new Date(event.start);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const dow = DAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)];
  return html`<a class="promo__item" href="${event.url}" target="_blank" rel="noopener noreferrer" aria-label="${event.kind} ${event.title}, ${eventWhen(event.start)}, ${event.area} (새 창)">
    <span class="promo__date" aria-hidden="true"><span class="promo__month">${parts.month}월</span><span class="promo__day">${parts.day}</span><span class="promo__dow">${dow}요일</span></span>
    <span class="promo__body">
      <span class="promo__kind">${event.kind} · ${event.area}</span>
      <span class="promo__title">${event.title}</span>
      <span class="promo__meta">${event.people}</span>
      <span class="promo__meta">${eventWhen(event.start)} · ${event.status}</span>
    </span>
  </a>`;
}

export async function render({ main, navigate, signal }) {
  document.title = '책있나 — 내 도서관에 그 책 있나?';
  setTopbar(html`
    <a class="brand" href="#/" aria-label="책있나 처음 화면">${brandMark(28)}<span class="brand__name">책있나</span></a>
    <a class="icon-btn" href="#/settings" aria-label="설정">${icon('menu')}</a>`);

  const mine = store.myLibraries.list();
  const recent = store.recentSearches.list();

  main.innerHTML = toMarkup(html`
    <div class="hero">
      <h1 class="h1">어떤 책 찾아요?</h1>
    </div>

    <section class="section" aria-label="책 찾기">
      <form id="search-form" role="search">
        <label class="sr-only" for="q">책 제목, 저자, ISBN</label>
        <div class="searchbox">
          <button class="searchbox__icon" type="submit" aria-label="검색">${icon('search')}</button>
          <input id="q" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="제목·저자·ISBN">
          <button class="searchbox__btn" type="button" id="scan" aria-label="바코드로 찾기">${icon('barcode')}바코드</button>
        </div>
      </form>
      ${recent.length
        ? html`<div class="chips" aria-label="최근 검색어">${recent.map((q) => html`<a class="chip" href="#/search?q=${encodeURIComponent(q)}">${q}</a>`)}</div>`
        : ''}
    </section>

    <div class="promo" id="promo" aria-label="작가 강연 소식" hidden></div>

    ${isDemoMode() ? demoNotice() : ''}

    <section class="section" aria-labelledby="mylibs-h">
      <div class="section__head">
        <h2 class="h2" id="mylibs-h">내 도서관 ${mine.length}곳</h2>
        <a href="#/libraries">${mine.length ? '편집' : '고르기'}</a>
      </div>
      <div id="mylibs">
        ${mine.length
          ? skeletonRows(Math.min(mine.length, 3), '2.6rem')
          : html`<a class="chip chip--add" href="#/libraries">${icon('plus')}자주 가는 도서관 고르기</a>`}
      </div>
    </section>

    <section class="section" aria-labelledby="pop-h">
      <div class="section__head"><h2 class="h2" id="pop-h">이번 주 인기 도서</h2></div>
      <div class="chips chips--scroll" id="pop-tabs" role="group" aria-label="나잇대" hidden></div>
      <p class="section__sub" id="pop-sub">불러오는 중</p>
      <ol class="list" id="pop-list">${skeletonRows(3, '3.2rem')}</ol>
    </section>

    <div id="reading"></div>`);

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

  // ---------- 작가 강연 배너 ----------
  const region = await myRegion();
  if (signal.aborted) return;
  loadEvents().then((data) => {
    if (signal.aborted) return;
    const events = upcomingEvents(data.items, { region }).slice(0, 5);
    const box = main.querySelector('#promo');
    if (!events.length || !box) return;
    box.hidden = false;
    box.innerHTML = toMarkup(html`
      <div class="promo__track" id="promo-track" tabindex="0">${events.map(promoItem)}</div>
      <div class="promo__foot">
        <span class="small muted">작가 강연 · 출처 문학나눔</span>
        ${events.length > 1 ? html`<span class="promo__dots" aria-hidden="true">${events.map((_, i) => html`<span class="promo__dot" aria-current="${i === 0 ? 'true' : 'false'}"></span>`)}</span>` : ''}
      </div>`);
    const track = box.querySelector('#promo-track');
    const dots = [...box.querySelectorAll('.promo__dot')];
    const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    track.addEventListener('scroll', () => dots.forEach((d, i) => d.setAttribute('aria-current', String(i === current()))), { passive: true });
    // 몇 초마다 다음 소식으로 넘긴다(만지면 멈춤, 동작 줄이기 설정이면 넘기지 않음)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (events.length > 1 && !reduce) {
      let touched = false;
      ['pointerdown', 'focusin', 'wheel'].forEach((type) => track.addEventListener(type, () => (touched = true), { passive: true }));
      const timer = setInterval(() => {
        if (signal.aborted || !track.isConnected) return clearInterval(timer);
        if (touched || document.hidden) return;
        const next = (current() + 1) % events.length;
        track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
      }, 5000);
      signal.addEventListener('abort', () => clearInterval(timer));
    }
  });

  // ---------- 내 도서관 ----------
  const librariesReady = mine.length ? loadLibraries().then(() => true, () => false) : Promise.resolve(false);
  if (mine.length) {
    librariesReady.then((ok) => {
      if (signal.aborted) return;
      const box = main.querySelector('#mylibs');
      if (!ok) {
        box.textContent = '도서관 목록을 불러오지 못했어요.';
        return;
      }
      box.innerHTML = toMarkup(html`<ul class="list">${mine.map((code) => {
        const lib = getLibrary(code);
        const closed = lib && lib.closed && closedToday(lib.closed);
        return html`<li class="row">
          <span class="row__body"><span class="row__title">${lib ? lib.name : `도서관 ${code}`}</span>${lib && lib.address ? html`<span class="row__sub">${lib.address}</span>` : ''}</span>
          ${closed ? html`<span class="badge badge--loaned">오늘 휴관</span>` : ''}
        </li>`;
      })}</ul>`);
    });
  }

  // ---------- 이번 주 인기 도서 (거래 내역처럼 오른쪽에 대출 횟수, 나잇대 탭) ----------
  const data = await popularBooks(region);
  if (signal.aborted) return;
  const tabs = popularTabs(data);
  // 인기 도서의 제목·저자는 이미 있으니, 눌러서 상세로 갈 때 책 정보를 다시 조회하지 않게 저장해 둔다.
  if (!data.demo) {
    const until = Date.now() + 7 * 24 * 3600 * 1000;
    for (const book of tabs.flatMap((t) => t.items)) {
      if (/^\d{13}$/.test(book.isbn13 || '') && !store.cacheGet(`b:${book.isbn13}`)) store.cacheSet(`b:${book.isbn13}`, book, until);
    }
  }
  const tabsEl = main.querySelector('#pop-tabs');
  const saved = store.settings.get().popularAge;
  let current = tabs.find((t) => t.age === saved) || tabs[0];

  const drawList = () => {
    main.querySelector('#pop-sub').textContent = popularSubtitle(data, current);
    main.querySelector('#pop-list').innerHTML = toMarkup(
      current.items.slice(0, 10).map((book, i) => {
        const rank = book.rank || i + 1;
        return html`<li><a class="row" href="#/book/${book.isbn13}">
          <span class="rank ${rank <= 3 ? 'rank--top' : ''}">${rank}</span>
          <span class="row__body">
            <span class="row__title">${book.title}</span>
            <span class="row__sub">${book.authors}</span>
          </span>
          ${book.loanCount
            ? html`<span class="row__end"><span class="row__figure">${Number(book.loanCount).toLocaleString('ko-KR')}번</span><span class="row__figure-label">${data.demo ? '예시' : '이번 주 대출'}</span></span>`
            : data.demo
              ? demoBadge()
              : ''}
        </a></li>`;
      }),
    );
  };

  if (tabs.length > 1) {
    tabsEl.hidden = false;
    tabsEl.innerHTML = toMarkup(
      tabs.map((t) => html`<button class="chip" type="button" data-age="${t.age}" aria-pressed="${t === current ? 'true' : 'false'}">${t.label}</button>`),
    );
    tabsEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-age]');
      if (!button) return;
      current = tabs.find((t) => t.age === button.dataset.age) || tabs[0];
      store.settings.set({ popularAge: current.age });
      tabsEl.querySelectorAll('[data-age]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      drawList();
    });
  }
  drawList();

  // ---------- 오늘의 문장·정보 ----------
  main.querySelector('#reading').innerHTML = toMarkup(readingCard(nextReading(data)));
}

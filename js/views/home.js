import { html, safeImageUrl, toIsbn13, toMarkup } from '../util.js';
import { brandMark, cover, demoBadge, demoNotice, icon, readingCard, setTopbar, skeletonRows } from '../ui.js';
import * as store from '../store.js';
import { isDemoMode, myRegion, popularBooks } from '../api.js';
import { getLibrary, loadLibraries } from '../libraries.js';
import { openScanner } from '../scan.js';
import { closedToday } from '../hours.js';
import { eventWhen, loadEvents, upcomingEvents } from '../events.js';
import { nextReading } from '../reading.js';
import { isShelf, loadLists, majorShelves, starShelves } from '../lists.js';

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

// 작가 강연 배너 한 장: 공식 포스터가 있으면 왼쪽에 포스터(날짜 표시를 얹어서), 없으면 날짜 칸
function promoItem(event) {
  const d = new Date(event.start);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const dow = DAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)];
  const poster = safeImageUrl(event.image);
  const visual = poster
    ? html`<span class="promo__poster"><img src="${poster}" alt="" loading="lazy" referrerpolicy="no-referrer" data-poster><span class="promo__chip" aria-hidden="true">${parts.month}.${parts.day} ${dow}</span></span>`
    : html`<span class="promo__date" aria-hidden="true"><span class="promo__month">${parts.month}월</span><span class="promo__day">${parts.day}</span><span class="promo__dow">${dow}요일</span></span>`;
  return html`<a class="promo__item${poster ? ' promo__item--poster' : ''}" href="${event.url}" target="_blank" rel="noopener noreferrer" aria-label="${event.kind} ${event.title}, ${eventWhen(event.start)}, ${event.area} (새 창)">
    ${visual}
    <span class="promo__body">
      <span class="promo__kind">${event.kind} · ${event.area}</span>
      <span class="promo__title">${event.title}</span>
      <span class="promo__meta">${event.people}</span>
      <span class="promo__meta">${eventWhen(event.start)}</span>
      <span class="promo__status">${event.status}</span>
    </span>
  </a>`;
}

// 책 목록 바로 가기(책장 2줄 + 서울대 권장도서·중고생 인기·내 목록)
const LIST_ICON = { popular: 'trend', mine: 'edit' };
function listRows(all) {
  const saved = store.get('myList', null);
  const mineCount = saved && Array.isArray(saved.books) ? saved.books.length : 0;
  const people = starShelves(all);
  const majors = majorShelves(all);
  const lists = all.filter((l) => !isShelf(l));
  const sample = (items, n) => items.slice(0, n).join('·');
  const rows = [
    ...(people.length
      ? [{ href: '#/shelves', ico: 'shelf', title: '사람별 책장', sub: `${sample(people.map((l) => l.person.name), 3)} 등 ${people.length}명이 추천한 책` }]
      : []),
    ...(majors.length
      ? [{ href: '#/shelves?at=majors', ico: 'gear', title: '학과별 책장 · 생기부 추천도서', sub: `${sample(majors.map((l) => l.short), 3)} 등 ${majors.length}개 분야` }]
      : []),
    ...lists.map((l) => ({
      href: `#/list/${l.id}`,
      ico: LIST_ICON[l.kind] || 'book',
      title: l.title,
      sub: l.kind === 'popular' ? `${l.books.length}권 · 최근 30일 전국` : `${l.books.length}권${Array.isArray(l.fields) && l.fields.length ? ` · ${l.fields.length}개 분야` : ''}`,
    })),
    {
      href: '#/list/mine',
      ico: 'edit',
      title: '내 목록',
      sub: mineCount ? `${mineCount}권 · 직접 만든 목록` : '선생님이 준 목록을 붙여 넣어 확인',
    },
  ];
  return rows.map(
    (r) => html`<li><a class="row" href="${r.href}">
      <span class="list-icon">${icon(r.ico)}</span>
      <span class="row__body"><span class="row__title">${r.title}</span><span class="row__sub">${r.sub}</span></span>
      ${icon('chevron', { cls: 'row__chev' })}
    </a></li>`,
  );
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

    <section class="section" aria-labelledby="lists-h">
      <div class="section__head"><h2 class="h2" id="lists-h">책장 · 책 목록</h2></div>
      <p class="section__sub">추천 책과 권장도서가 내 도서관에 있는지 한 번에 봐요</p>
      <ul class="list" id="lists">${listRows([])}</ul>
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
        <span class="small muted">작가 강연 · 정보와 포스터 출처 문학나눔</span>
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

  // ---------- 책 목록 바로 가기 ----------
  loadLists().then((lists) => {
    const el = main.querySelector('#lists');
    if (!signal.aborted && el && lists.lists.length) el.innerHTML = toMarkup(listRows(lists.lists));
  });

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
        // 1위는 큰 표지로 눈에 띄게, 나머지는 작은 표지
        const top = i === 0;
        return html`<li><a class="row${top ? ' row--top' : ''}" href="#/book/${book.isbn13}">
          <span class="rank ${rank <= 3 ? 'rank--top' : ''}">${rank}</span>
          ${cover(book, top ? 'lg' : 'sm')}
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

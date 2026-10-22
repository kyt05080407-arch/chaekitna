import { basisLabel, html, mapUrl, safeHttpUrl, telHref, toMarkup } from '../util.js';
import { backButton, cover, demoBadge, demoNotice, errorNotice, hotLine, icon, readingCard, setTopbar, skeletonRows, statusBadge, toast } from '../ui.js';
import * as store from '../store.js';
import { availability, bookDetail, holdings, isDemoMode, popularInfo } from '../api.js';
import { loadOpac, searchTarget, submitSearch } from '../opac.js';
import { nextStepsView, situation } from '../nextsteps.js';
import { getLibrary, loadLibraries } from '../libraries.js';
import { REGIONS, regionByCode } from '../regions.js';
import { statusOf } from '../parse.js';
import { CONFIG } from '../config.js';
import * as demo from '../demo.js';
import { pushStatus } from '../push.js';
import { closedToday } from '../hours.js';
import { nextReading } from '../reading.js';

function bookHead(book, isbn) {
  if (!book) {
    return html`<div class="book-head">${cover(null, 'lg')}<div class="book-head__body">
      <p class="book-head__title">ISBN ${isbn}</p>
      <p class="book-head__meta">책 정보를 못 찾았어요. 소장 여부는 아래에서 봐요.</p></div></div>`;
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

const clip = (text, max = 60) => (text.length > max ? `${text.slice(0, max)}…` : text);

// 도서관 홈페이지 링크: 바로 검색 주소를 알면 그 책 검색 결과로, 모르면 제목을 복사해 두고 홈페이지로
function siteLink(lib, title, templates) {
  const target = searchTarget(templates, lib, title);
  if (target && target.kind === 'get') {
    return html`<a class="is-go" href="${target.href}" target="_blank" rel="noopener noreferrer">${icon('search')}홈페이지에서 바로 찾기</a>`;
  }
  if (target && target.kind === 'post') {
    return html`<button class="is-go" type="button" data-post-search="${JSON.stringify(target)}">${icon('search')}홈페이지에서 바로 찾기</button>`;
  }
  const home = lib ? safeHttpUrl(lib.homepage) : '';
  if (!home) return '';
  return html`<a href="${home}" target="_blank" rel="noopener noreferrer" data-copy-title="${title || ''}">${icon('external')}${title ? '홈페이지 (제목 복사)' : '홈페이지'}</a>`;
}

function libraryCard(lib, code, status, { title = '', templates = {} } = {}) {
  const name = lib ? lib.name : `도서관 ${code}`;
  const tel = lib ? telHref(lib.tel) : '';
  const closedNow = Boolean(lib && lib.closed && closedToday(lib.closed));
  return html`<div class="card" data-lib="${code}">
    <div class="card__top"><span class="card__name">${name}</span><span class="badges" data-status>${status ? statusBadge(status) : html`<span class="badge badge--unknown">확인 중</span>`}</span></div>
    ${closedNow ? html`<p class="card__alert">${icon('clock')}오늘은 정기 휴관일이에요</p>` : ''}
    ${lib && lib.hours ? html`<p class="card__meta">${clip(lib.hours)}</p>` : ''}
    ${lib && lib.closed ? html`<p class="card__meta">휴관 · ${clip(lib.closed)}</p>` : ''}
    <div class="card__links">
      <span class="site-link" data-site>${siteLink(lib, title, templates)}</span>
      ${tel ? html`<a href="${tel}">${icon('phone')}전화</a>` : ''}
      ${lib ? html`<a href="${mapUrl(lib.name, lib.lat, lib.lng)}" target="_blank" rel="noopener noreferrer">${icon('pin')}지도</a>` : ''}
    </div>
  </div>`;
}

// 책 소개: 이미 받아 둔 글이 있으면 바로 보여 주고, 없으면 눌렀을 때만 받아 온다(하루 조회 한도를 아끼려고).
function bookIntro(book, isbn) {
  if (book && book.description) {
    return html`<details class="book-desc"><summary>책 소개</summary><p>${book.description}</p></details>`;
  }
  if (isDemoMode() || demo.isDemoIsbn(isbn)) return '';
  return html`<button class="btn btn--small" type="button" id="intro">${icon('book')}책 소개 보기</button>`;
}

function alertNote(status) {
  if (status === 'on') return '아침 알림이 켜져 있어요. 관심 도서에 담으면 반납된 다음 날 아침에 알려 줘요.';
  if (status === 'off') return '반납 알림은 준비 중이에요. 지금은 관심 도서 탭에서 상태를 볼 수 있어요.';
  return '관심 도서 탭에서 알림을 켜면 반납된 다음 날 아침에 알려 줘요.';
}

// 잔액처럼 큰 글씨로 보여 줄 요약: big(큰 글씨), main(문장), ok(빌릴 수 있음)
function summaryView(statuses, total) {
  const values = Object.values(statuses);
  if (values.length && values.every((s) => s === 'unknown') && isDemoMode()) {
    return { big: '확인 못 함', main: '예시 모드라 실제 대출 정보는 안 보여요' };
  }
  const available = values.filter((s) => s === 'available').length;
  const loaned = values.filter((s) => s === 'loaned').length;
  const none = values.filter((s) => s === 'none').length;
  if (available > 0) return { big: `${available}곳`, main: `내 도서관 ${total}곳 중 ${available}곳에서 빌릴 수 있어요`, ok: true };
  if (loaned > 0) return { big: '모두 대출 중', main: '내 도서관에 있지만 모두 대출 중이에요' };
  if (none === total) return { big: '없어요', main: '내 도서관에는 이 책이 없어요' };
  return { big: '일부 확인 못 함', main: '일부 도서관은 확인 못 했어요' };
}

function setSummary(main, view) {
  const big = main.querySelector('#summary .summary__big');
  big.textContent = view.big;
  big.classList.toggle('summary__big--ok', Boolean(view.ok));
  main.querySelector('#summary .summary__label').textContent = '지금 빌릴 수 있는 곳';
  main.querySelector('#summary .summary__main').textContent = view.main;
  main.querySelector('#sum-reading').innerHTML = '';
}

export async function render({ main, params, signal }) {
  const isbn = params.isbn;
  // 이미 아는 책 정보(검색·인기 도서·상세 조회·관심 도서)가 있으면 다시 조회하지 않는다.
  let book = demo.isDemoIsbn(isbn)
    ? demo.bookByIsbn(isbn)
    : store.cacheGet(`b:${isbn}`) || store.cacheGet(`d:${isbn}`) || store.watchlist.list().find((b) => b.isbn13 === isbn) || null;
  const watched = () => store.watchlist.has(isbn);

  const renderTopbar = () =>
    setTopbar(html`${backButton('#/')}<span class="topbar__title"></span>
      ${navigator.share ? html`<button class="icon-btn" type="button" id="share" aria-label="공유">${icon('share')}</button>` : ''}
      <button class="icon-btn" type="button" id="star" aria-pressed="${watched() ? 'true' : 'false'}" aria-label="관심 도서">${icon('star', { filled: watched() })}</button>`);
  renderTopbar();

  const mine = store.myLibraries.list();
  const settings = store.settings.get();

  main.innerHTML = toMarkup(html`
    <section class="section" aria-label="책 정보">
      <div id="head">${book ? bookHead(book, isbn) : skeletonRows(1, '7.2rem')}</div>
      <div id="hot"></div>
      <div id="intro-box">${book ? bookIntro(book, isbn) : ''}</div>
    </section>
    ${isDemoMode() || demo.isDemoIsbn(isbn) ? demoNotice() : ''}
    <section class="summary" id="summary" aria-live="polite">
      <p class="summary__label">${mine.length ? '내 도서관을 확인하는 중' : '내 도서관'}</p>
      <span class="summary__big" aria-hidden="true">${mine.length ? '' : '0곳'}</span>
      <p class="summary__main">${mine.length ? '내 도서관을 확인하는 중이에요' : '내 도서관을 먼저 골라 주세요'}</p>
      <p class="summary__sub">${basisLabel()} · 대출 정보는 하루 늦게 반영돼요</p>
      <div id="sum-reading">${mine.length ? readingCard(nextReading()) : ''}</div>
    </section>
    <div id="next-box"></div>
    <section class="section" aria-labelledby="mine-h">
      <div class="section__head"><h2 class="h2" id="mine-h">내 도서관</h2>${mine.length ? html`<a href="#/libraries?back=${encodeURIComponent(`#/book/${isbn}`)}">편집</a>` : ''}</div>
      <div id="mine">
        ${mine.length
          ? skeletonRows(mine.length, '4.4rem')
          : html`<a class="btn btn--primary btn--block" href="#/libraries?back=${encodeURIComponent(`#/book/${isbn}`)}">${icon('library')}자주 가는 도서관 고르기</a>`}
      </div>
    </section>
    <section class="section">
      <button class="btn btn--block ${watched() ? 'btn--outline' : 'btn--primary'}" type="button" id="watch">${icon('star')}<span>${watched() ? '관심 도서에 담겼어요' : '관심 도서에 담기'}</span></button>
      <p class="small muted">${alertNote(pushStatus())}</p>
    </section>
    <section class="section" aria-labelledby="wide-h">
      <div class="section__head"><h2 class="h2" id="wide-h">더 넓게 찾기</h2></div>
      <p class="section__sub">같은 시·도에서 이 책을 가진 다른 도서관</p>
      <div class="btn-row">
        <label class="sr-only" for="region">지역</label>
        <select class="input" id="region">${REGIONS.map((r) => html`<option value="${r.code}">${r.name}</option>`)}</select>
        <button class="btn btn--outline" type="button" id="find-wide">찾기</button>
      </div>
      <div id="wide" class="stack" aria-live="polite"></div>
    </section>
    <p class="footer-note">출처: 도서관 정보나루 · 가기 전에 홈페이지에서 한 번 더 확인해요</p>`);

  // ---------- 도서관 홈페이지 바로 찾기 ----------
  const opacReady = loadOpac();
  const searchTitle = () => (book && book.title) || '';
  // 책 정보가 늦게 오면(제목을 몰랐다가 알게 되면) 홈페이지 링크를 제목 검색으로 바꾼다
  const refreshSiteLinks = async () => {
    const templates = await opacReady;
    if (signal.aborted) return;
    main.querySelectorAll('#mine [data-lib]').forEach((card) => {
      const slot = card.querySelector('[data-site]');
      if (slot) slot.innerHTML = toMarkup(siteLink(getLibrary(card.dataset.lib), searchTitle(), templates));
    });
  };

  // 이번 주 인기 목록에 있는 책이면 순위와 대출 횟수
  popularInfo(isbn)
    .then((info) => {
      if (!signal.aborted && info) main.querySelector('#hot').innerHTML = toMarkup(hotLine(info));
    })
    .catch(() => {});

  // ---------- 관심 도서 ----------
  // ---------- 없을 때 다음 방법 ----------
  let lastStatuses = null;
  const renderNext = async () => {
    const box = main.querySelector('#next-box');
    const kind = situation(lastStatuses);
    if (!box || (kind !== 'loaned' && kind !== 'none')) {
      if (box) box.innerHTML = '';
      return;
    }
    const templates = await opacReady;
    if (signal.aborted) return;
    const title = searchTitle();
    const loanedCode = mine.find((code) => lastStatuses[code] === 'loaned');
    box.innerHTML = toMarkup(
      nextStepsView({
        kind,
        isbn,
        watched: watched(),
        reserveLink: loanedCode ? siteLink(getLibrary(loanedCode), title, templates) : '',
        requestLink: mine.length ? siteLink(getLibrary(mine[0]), title, templates) : '',
      }),
    );
  };

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
  const introBox = main.querySelector('#intro-box');
  const bindIntro = () => {
    introBox.querySelector('#intro')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      try {
        const found = await bookDetail(isbn, { signal });
        if (signal.aborted) return;
        if (found && found.description) {
          book = { ...(book || {}), ...found, description: found.description };
          introBox.innerHTML = toMarkup(html`<details class="book-desc" open><summary>책 소개</summary><p>${found.description}</p></details>`);
        } else {
          introBox.innerHTML = toMarkup(html`<p class="small muted">이 책은 소개 글이 없어요.</p>`);
        }
      } catch (error) {
        if (signal.aborted) return;
        btn.disabled = false;
        toast((error && error.message) || '소개 글을 못 불러왔어요');
      }
    });
  };
  if (!book) {
    bookDetail(isbn, { signal })
      .then((found) => {
        if (signal.aborted) return;
        book = found;
        main.querySelector('#head').innerHTML = toMarkup(bookHead(found, isbn));
        refreshSiteLinks();
        introBox.innerHTML = toMarkup(found && found.description ? bookIntro(found, isbn) : '');
        if (found) document.title = `${found.title} — 책있나`;
      })
      .catch(() => {
        if (!signal.aborted) main.querySelector('#head').innerHTML = toMarkup(bookHead(null, isbn));
      });
  } else {
    document.title = `${book.title} — 책있나`;
    bindIntro();
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
    const templates = await opacReady;
    if (signal.aborted) return;
    mineBox.innerHTML = toMarkup(mine.map((code) => libraryCard(getLibrary(code), code, null, { title: searchTitle(), templates })));
    try {
      const result = await availability(isbn, mine, { signal, force });
      if (signal.aborted) return;
      const statuses = {};
      for (const code of mine) {
        statuses[code] = statusOf(result[code]);
        const slot = mineBox.querySelector(`[data-lib="${code}"] [data-status]`);
        if (slot) slot.innerHTML = toMarkup(badges(statuses[code], demo.isDemoIsbn(isbn)));
      }
      setSummary(main, summaryView(statuses, mine.length));
      lastStatuses = statuses;
      renderNext();
      if (result.budget) toast('오늘 조회 한도를 다 써서 일부만 확인했어요');
      if (watched()) store.watchlist.update(isbn, { last: statuses, checkedAt: Date.now() });
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) return;
      setSummary(main, { big: '확인 못 함', main: '대출 현황을 못 불러왔어요' });
      mineBox.querySelectorAll('[data-status]').forEach((slot) => {
        slot.innerHTML = toMarkup(statusBadge('unknown'));
      });
      mineBox.insertAdjacentHTML('afterbegin', toMarkup(errorNotice(error, 'retry-mine')));
      mineBox.querySelector('#retry-mine')?.addEventListener('click', () => loadMine(true));
    }
  };
  if (mine.length) loadMine();

  // 바로 검색 주소가 없는 도서관: 홈페이지를 열면서 제목을 복사해 둔다(검색창에 붙여 넣기)
  main.addEventListener('click', (event) => {
    // POST 방식 도서관: 검색 요청서를 채워 새 창으로 보낸다
    const post = event.target.closest('[data-post-search]');
    if (post) {
      try {
        submitSearch(JSON.parse(post.dataset.postSearch));
      } catch {
        toast('도서관 홈페이지를 못 열었어요');
      }
      return;
    }
    // 다음 방법 안내의 버튼
    const next = event.target.closest('[data-next]');
    if (next) {
      if (next.dataset.next === 'watch') {
        if (!watched()) main.querySelector('#watch').click();
        renderNext();
      } else if (next.dataset.next === 'wide') {
        main.querySelector('#find-wide').click();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        main.querySelector('#wide-h').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
      return;
    }
    const link = event.target.closest('[data-copy-title]');
    const title = link && link.dataset.copyTitle;
    if (!title || !navigator.clipboard) return;
    navigator.clipboard.writeText(title).then(
      () => toast(link.dataset.copyHint || `'${title}' 제목을 복사했어요. 홈페이지 검색창에 붙여 넣으세요`),
      () => {},
    );
    // 다른 화면으로 가면 이 처리기를 뗀다(본문 칸은 화면이 바뀌어도 그대로라, 안 떼면 다음 책 화면에서 두 번 실행된다)
  }, { signal });

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
        wide.innerHTML = toMarkup(html`<p class="muted">예시 모드라 실제 책은 못 찾아요.</p>`);
        return;
      }
      if (!codes.length) {
        wide.innerHTML = toMarkup(html`<p class="muted">${regionName}에는 이 책을 가진 다른 도서관이 없어요.</p>`);
        return;
      }
      const templates = await opacReady;
      wide.innerHTML = toMarkup(html`
        <p class="small muted">${regionName}에서 이 책을 가진 도서관 ${codes.length}곳${found.demo ? ' (예시)' : ''}</p>
        <ul class="list">${codes.map((code) => {
          const lib = getLibrary(code) || (found.libraries || []).find((l) => l.code === code);
          const link = siteLink(lib, searchTitle(), templates);
          return html`<li class="row" data-wide="${code}">
            <span class="row__body"><span class="row__title">${lib ? lib.name : code}</span><span class="row__sub">${lib ? lib.address : ''}</span>${link ? html`<span class="card__links card__links--row">${link}</span>` : ''}</span>
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
            toast(error.message || '확인 못 했어요');
          }
        }),
      );
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) return;
      wide.innerHTML = toMarkup(errorNotice(error));
    }
  });
}

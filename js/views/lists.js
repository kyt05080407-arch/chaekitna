// 책 목록 한 번에 확인: 목록 속 책이 내 도서관에 있는지 한 번에 본다.
//  #/list/snu100     서울대 권장도서 100선 (분야별)
//  #/list/teen-high  고등학생이 요즘 많이 빌린 책 · #/list/teen-mid 중학생
//  #/list/mine       직접 붙여 넣은 목록(선생님이 준 목록 등, 폰에만 저장)
//  #/list/major-…    학과별 책장(생기부 추천도서) · #/list/star-… 사람별 책장(연예인 등이 추천한 책)
// 책을 누르면 책 화면에서 도서관별 대출 가능 여부(어제 기준)를 볼 수 있다.
// 책장 목록은 책을 누르면 그 자리에서 펼쳐져 '왜 이 책?'·탐구 연결 아이디어·출처와 '내 도서관에서 확인' 버튼이 보인다.
//  #/list/star-rm?open=3 처럼 open을 주면 그 책을 펼친 채로 연다(오늘의 한 권).

import { html, safeHttpUrl, toMarkup } from '../util.js';
import { avatar, backButton, cover, demoNotice, errorNotice, icon, setTopbar, skeletonRows, toast } from '../ui.js';
import * as store from '../store.js';
import { bookDetail, holdings, holdingsCached, isDemoMode, searchBooks } from '../api.js';
import { getLibrary, loadLibraries } from '../libraries.js';
import { KIND_LABEL, MAX_PASTE, alsoOn, authorKeysOf, groupByRegion, isShelf, loadLists, overlap, parsePasted, pickMatch, tally } from '../lists.js';

// 한 번 누를 때 확인하는 최대 권수(모두가 함께 쓰는 하루 조회 한도를 아끼려고)
const BATCH = 40;
const PARALLEL = 3;
const MINE = 'myList';
const DAY = 24 * 3600 * 1000;

// 동시에 몇 개씩만 실행
async function runLimited(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

const isbnOf = (book) => (book.match && book.match.isbn13) || '';

// 책 화면으로 갈 때 책 정보를 다시 조회하지 않게 저장
function rememberBooks(books) {
  const until = Date.now() + 7 * DAY;
  for (const b of books) {
    const isbn = isbnOf(b);
    if (isbn && !store.cacheGet(`b:${isbn}`)) store.cacheSet(`b:${isbn}`, b.match, until);
  }
}

// ---------- 직접 만든 목록(폰에만 저장) ----------

const myList = {
  get() {
    const value = store.get(MINE, null);
    return value && Array.isArray(value.books) ? value : null;
  },
  save(value) {
    store.set(MINE, value);
  },
  clear() {
    store.remove(MINE);
  },
};

function mineAsList(saved) {
  return {
    id: 'mine',
    title: saved.title || '내 목록',
    kind: 'mine',
    description: `직접 붙여 넣은 목록이에요(${saved.books.length}권). 이 폰에만 저장돼요.`,
    books: saved.books,
  };
}

// ---------- 한 줄 ----------

function bookRow(list, book, fieldLabel, result) {
  const isbn = isbnOf(book);
  const m = book.match || {};
  const shownTitle = book.title || m.title || '';
  const author = book.author || m.authors || '';
  // 목록에 적힌 제목과 찾은 책 제목이 다르면 어떤 책으로 찾았는지 보여 준다
  const foundOther = isbn && m.title && m.title.replace(/\s/g, '') !== shownTitle.replace(/\s/g, '');
  const sub = [author, fieldLabel].filter(Boolean).join(' · ');
  // 좁은 화면에서 제목이 눌리지 않게, 확인 결과는 제목 아래 줄에 둔다
  const body = html`<span class="row__body">
      <span class="row__title">${shownTitle}</span>
      ${sub ? html`<span class="row__sub">${sub}</span>` : ''}
      ${foundOther ? html`<span class="row__sub">찾은 책: 『${m.title}』${m.publisher ? ` ${m.publisher}` : ''}</span>` : ''}
      ${book.note ? html`<span class="row__sub">${book.note}</span>` : ''}
      ${!isbn && !book.pending ? html`<span class="row__sub">${notFoundText(book)}</span>` : ''}
      <span class="row__status" data-end>${statusBadge(book, result)}</span>
      <span class="row__sub row__libs" data-libs>${libNames(result)}</span>
    </span>`;
  const href = isbn ? `#/book/${isbn}` : `#/search?q=${encodeURIComponent(shownTitle)}`;
  const loans = list.kind === 'popular' && book.loanCount;
  return html`<li data-row="${book.no}" data-isbn="${isbn}"><a class="row list-row" href="${href}">
    <span class="rank">${book.no}</span>
    ${cover(m, 'sm')}
    ${body}
    ${loans ? html`<span class="row__end"><span class="row__figure">${Number(book.loanCount).toLocaleString('ko-KR')}번</span><span class="row__figure-label">30일 대출</span></span>` : ''}
  </a></li>`;
}

const notFoundText = (book) => (book.waiting ? '책 정보를 준비하고 있어요 · 눌러서 제목으로 찾기' : '정보나루에서 이 책을 찾지 못했어요 · 눌러서 제목으로 찾기');

// 책장 목록의 한 줄: 누르면 그 자리에서 펼쳐진다
function shelfRow(ctx, book, fieldLabel, result, open) {
  const { list } = ctx;
  const isbn = isbnOf(book);
  const m = book.match || {};
  const shownTitle = book.title || m.title || '';
  const sub = [book.author || m.authors || '', fieldLabel].filter(Boolean).join(' · ');
  const panelId = `p-${book.no}`;
  const src = (list.sources || {})[book.src];
  const srcUrl = src && safeHttpUrl(src.url);
  const also = alsoOn(ctx.all, isbn, list.id);
  const watched = isbn && store.watchlist.has(isbn);
  const check = isbn ? `#/book/${isbn}` : `#/search?q=${encodeURIComponent(shownTitle)}`;
  return html`<li data-row="${book.no}" data-isbn="${isbn}" class="shelf-item${open ? ' is-open' : ''}">
    <button class="row list-row row--btn" type="button" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panelId}">
      <span class="rank">${book.no}</span>
      ${cover(m, 'sm')}
      <span class="row__body">
        <span class="row__title">${shownTitle}</span>
        ${sub ? html`<span class="row__sub">${sub}</span>` : ''}
        ${!isbn ? html`<span class="row__sub">${book.waiting ? '책 정보를 준비하고 있어요' : '정보나루에서 이 책을 찾지 못했어요'}</span>` : ''}
        <span class="row__status" data-end>${statusBadge(book, result)}</span>
        <span class="row__sub row__libs" data-libs>${libNames(result)}</span>
      </span>
      ${icon('chevron', { cls: 'row__chev shelf-item__chev' })}
    </button>
    <div class="shelf-panel" id="${panelId}"${open ? '' : ' hidden'}>
      ${book.from ? html`<p class="shelf-panel__why"><span class="shelf-panel__label">${list.group === 'star' ? '어디서 추천했나' : '왜 이 책?'}</span>${book.from}</p>` : ''}
      ${book.note ? html`<p class="shelf-panel__note"><span class="shelf-panel__label">${icon('edit')}탐구 연결 아이디어 <span class="muted">예시</span></span>${book.note}</p>` : ''}
      ${also.length ? html`<p class="small muted">이 책은 ${also.map((a, i) => html`${i ? ', ' : ''}<a href="#/list/${a.id}">${a.name}</a>`)}의 책장에도 있어요</p>` : ''}
      <div class="btn-row">
        <a class="btn btn--primary btn--small" href="${check}">${icon('library')}내 도서관에서 확인</a>
        ${isbn ? html`<button class="btn btn--small" type="button" data-watch="${isbn}" aria-pressed="${watched ? 'true' : 'false'}" aria-label="관심 도서에 ${watched ? '담았어요' : '담기'}">${icon('star', { filled: watched })}${watched ? '담았어요' : '담기'}</button>` : ''}
      </div>
      ${src ? html`<p class="small muted shelf-panel__src">출처 ${srcUrl ? html`<a href="${srcUrl}" target="_blank" rel="noopener noreferrer">${src.name}</a>` : src.name}</p>` : ''}
    </div>
  </li>`;
}

// 책장 목록 위쪽: 사람은 이름 동그라미, 학과는 아이콘
function shelfHero(list) {
  if (list.group === 'star' && list.person) {
    const p = list.person;
    return html`<div class="hero hero--shelf">
      ${avatar(p.name, 'xl')}
      <div class="hero__text">
        <p class="small muted">${KIND_LABEL[p.kind] || ''} · ${p.team}</p>
        <h1 class="h1">${list.title}</h1>
      </div>
      <p class="lead">${list.description}</p>
    </div>`;
  }
  return html`<div class="hero hero--shelf">
    <span class="list-icon list-icon--lg">${icon(list.icon || 'book')}</span>
    <div class="hero__text"><p class="small muted">학과별 책장 · 생기부 추천도서</p><h1 class="h1">${list.title}</h1></div>
    <p class="lead">${list.description}</p>
  </div>`;
}

function shelfSources(list) {
  const entries = Object.values(list.sources || {});
  return html`<section class="section" aria-labelledby="src-h">
    <h2 class="h2" id="src-h">출처</h2>
    ${list.group === 'major' ? html`<p class="small muted">탐구 연결 아이디어는 책있나가 쓴 예시예요. 책을 읽고 내 경험과 생각으로 바꿔 쓰세요. 대학 자료에 실렸다고 입시에 유리한 책이 되는 건 아니에요.</p>` : html`<p class="small muted">기사에 실린 내용만 옮겼어요. 사진은 쓰지 않았어요.</p>`}
    <ul class="src-list">${entries.map((s) => {
      const url = safeHttpUrl(s.url);
      return html`<li>${url ? html`<a href="${url}" target="_blank" rel="noopener noreferrer">${s.name}${icon('external')}</a>` : s.name}</li>`;
    })}</ul>
  </section>`;
}

function libNames(result) {
  if (!result || !result.have.length) return '';
  const names = result.have.map((code) => {
    const lib = getLibrary(code);
    return lib ? lib.name : `도서관 ${code}`;
  });
  return html`${icon('library')}${names.join(' · ')}`;
}

function statusBadge(book, result) {
  if (book.pending) return html`<span class="badge badge--unknown">찾는 중</span>`;
  if (!result) return '';
  if (result.have.length) return html`<span class="badge badge--available">${icon('check')}내 도서관 ${result.have.length}곳에 있어요</span>`;
  if (result.unknown.length) return html`<span class="badge badge--unknown">${icon('info')}눌러서 확인</span>`;
  return html`<span class="badge badge--none">${icon('minus')}내 도서관에 없어요</span>`;
}

// ---------- 붙여 넣기 화면 ----------

function pasteForm(saved) {
  const text = saved ? saved.books.map((b) => (b.isbnOnly ? b.isbnOnly : [b.title, b.author].filter(Boolean).join(' - '))).join('\n') : '';
  return html`<section class="section" aria-labelledby="paste-h">
    <h2 class="h2" id="paste-h">${saved ? '목록 고치기' : '목록 붙여 넣기'}</h2>
    <p class="small muted">한 줄에 한 권씩, 최대 ${MAX_PASTE}권까지예요. 저자를 함께 적으면 더 정확하게 찾아요. 목록은 이 폰에만 저장돼요.</p>
    <form id="paste-form" class="stack">
      <label class="sr-only" for="paste">책 목록</label>
      <textarea id="paste" class="input textarea" rows="8" placeholder="${'예)\n데미안 - 헤르만 헤세\n아몬드 / 손원평\n『소년이 온다』 한강'}">${text}</textarea>
      <div class="btn-row">
        <button class="btn btn--primary" type="submit">${icon('check')}목록 만들기</button>
        ${saved ? html`<button class="btn" type="button" id="paste-cancel">취소</button>` : ''}
      </div>
    </form>
  </section>`;
}

// ---------- 화면 ----------

// 같은 주소 안에서 다시 그릴 때(목록 고치기 등) 지난번 화면의 이벤트·조회를 멈추기 위한 신호
let viewCtl = null;
function freshSignal(routeSignal) {
  if (viewCtl) viewCtl.abort();
  const ctl = new AbortController();
  viewCtl = ctl;
  if (routeSignal.aborted) ctl.abort();
  else routeSignal.addEventListener('abort', () => ctl.abort(), { once: true });
  return ctl.signal;
}

export async function render({ main, params, query, signal: routeSignal }) {
  const signal = freshSignal(routeSignal);
  const id = params.id;
  const shelfId = /^(star|major)-/.test(id);
  setTopbar(html`${backButton(shelfId ? '#/shelves' : '#/')}<h1 class="topbar__title">${shelfId ? '책장' : '책 목록'}</h1>`);
  main.innerHTML = toMarkup(html`<div class="stack">${skeletonRows(4, '3.6rem')}</div>`);

  let list;
  let all = [];
  if (id === 'mine') {
    const saved = myList.get();
    if (!saved) {
      drawPaste(main, null, routeSignal);
      return;
    }
    list = mineAsList(saved);
  } else {
    const data = await loadLists();
    if (signal.aborted) return;
    all = data.lists;
    list = data.lists.find((l) => l.id === id);
    if (!list) {
      main.innerHTML = toMarkup(html`<section class="section"><p>목록을 찾지 못했어요.</p><a class="btn btn--outline" href="#/">처음 화면으로</a></section>`);
      return;
    }
  }
  document.title = `${list.title} — 책있나`;

  const mine = store.myLibraries.list();
  let librariesOk = true;
  try {
    await loadLibraries();
  } catch {
    librariesOk = false;
  }
  if (signal.aborted) return;
  const byRegion = groupByRegion(mine, getLibrary);
  const fields = Array.isArray(list.fields) ? list.fields : [];
  const fieldLabel = (fid) => (fields.find((f) => f.id === fid) || {}).label || '';
  let field = '';
  let onlyHave = false;
  // 책마다 확인 결과 (no → {have, unknown})
  const results = new Map();
  rememberBooks(list.books);

  // 폰에 저장해 둔 조회 결과가 있으면 바로 보여 준다(새로 조회하지 않음)
  const fromCache = (book) => {
    const isbn = isbnOf(book);
    if (!isbn || !byRegion.size) return null;
    return overlap(byRegion, (region) => holdingsCached(isbn, region));
  };
  for (const book of list.books) {
    const r = fromCache(book);
    if (r) results.set(book.no, r);
  }

  const visible = () => list.books.filter((b) => (!field || b.field === field) && (!onlyHave || (results.get(b.no) && results.get(b.no).have.length)));
  const scope = () => list.books.filter((b) => !field || b.field === field);
  const unchecked = () => scope().filter((b) => isbnOf(b) && !results.has(b.no));

  const source = safeHttpUrl(list.sourceUrl);
  const shelf = isShelf(list);
  // 책장 목록에서 펼쳐 둔 책(다시 그려도 그대로)
  const opened = new Set();
  const openNo = Number(query && query.get('open'));
  if (shelf && list.books.some((b) => b.no === openNo)) opened.add(openNo);
  const checkSection = html`<section class="section" aria-labelledby="check-h">
      <h2 class="h2" id="check-h">내 도서관에 있을까?</h2>
      <div id="check-box"></div>
    </section>`;
  main.innerHTML = toMarkup(html`
    ${shelf
      ? shelfHero(list)
      : html`<div class="hero">
          <h1 class="h1">${list.title}</h1>
          ${list.description ? html`<p class="lead">${list.description}</p>` : ''}
          ${list.source ? html`<p class="small muted">출처 ${source ? html`<a href="${source}" target="_blank" rel="noopener noreferrer">${list.source}</a>` : list.source}</p>` : ''}
        </div>`}

    ${shelf ? '' : checkSection}

    <section class="section" aria-label="책 목록">
      ${fields.length
        ? html`<div class="chips chips--scroll" id="fields" role="group" aria-label="분야">
            <button class="chip" type="button" data-field="" aria-pressed="true">전체</button>
            ${fields.map((f) => html`<button class="chip" type="button" data-field="${f.id}" aria-pressed="false">${f.label}</button>`)}
          </div>`
        : ''}
      <div class="chips" id="filters" hidden>
        <button class="chip" type="button" id="only-have" aria-pressed="false">${icon('check')}내 도서관에 있는 책만</button>
      </div>
      <ol class="list" id="books"></ol>
      ${list.kind === 'mine'
        ? html`<div class="btn-row"><button class="btn" type="button" id="edit-mine">${icon('edit')}목록 고치기</button><button class="btn btn--danger" type="button" id="clear-mine">${icon('trash')}목록 지우기</button></div>`
        : ''}
    </section>

    ${shelf ? checkSection : ''}
    ${shelf ? shelfSources(list) : ''}`);

  const box = main.querySelector('#check-box');
  const listEl = main.querySelector('#books');
  let busy = false;
  let error = null;
  let progress = null;

  const drawList = () => {
    const books = visible();
    listEl.innerHTML = books.length
      ? toMarkup(
          books.map((b) =>
            shelf
              ? shelfRow({ list, all }, b, field ? '' : fieldLabel(b.field), results.get(b.no), opened.has(b.no))
              : bookRow(list, b, field ? '' : fieldLabel(b.field), results.get(b.no)),
          ),
        )
      : toMarkup(html`<li class="muted small" style="padding:0.6rem 0">${onlyHave ? '확인한 책 중에는 내 도서관에 있는 책이 없어요.' : '책이 없어요.'}</li>`);
    main.querySelector('#filters').hidden = !scope().some((b) => results.has(b.no));
  };

  const drawCheck = () => {
    if (!mine.length) {
      box.innerHTML = toMarkup(html`<p class="small">자주 가는 도서관을 고르면, 목록 속 책이 그 도서관에 있는지 한 번에 확인해 드려요.</p>
        <a class="btn btn--primary btn--block" href="#/libraries?back=${encodeURIComponent(location.hash)}">${icon('plus')}내 도서관 고르기</a>`);
      return;
    }
    if (!librariesOk || !byRegion.size) {
      box.innerHTML = toMarkup(errorNotice({ message: '도서관 목록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' }));
      return;
    }
    if (isDemoMode()) {
      box.innerHTML = toMarkup(html`${demoNotice()}<p class="small muted">예시 데이터 모드에서는 실제 소장 여부를 확인할 수 없어요. 책을 누르면 책 화면으로 가요.</p>`);
      return;
    }
    const sc = scope();
    const withIsbn = sc.filter((b) => isbnOf(b));
    const t = tally(sc.map((b) => results.get(b.no)));
    const left = unchecked();
    const next = Math.min(left.length, BATCH);
    const names = mine.map((code) => (getLibrary(code) || {}).name).filter(Boolean);
    box.innerHTML = toMarkup(html`
      ${t.checked
        ? html`<p class="check__sum"><strong class="num">${t.have}권</strong> / ${t.checked}권이 내 도서관에 있어요${t.unknown ? html` <span class="small muted">(${t.unknown}권은 눌러서 확인)</span>` : ''}</p>`
        : html`<p class="small">${names.join(' · ')}에 이 목록의 책이 있는지 한 번에 확인해요.</p>`}
      ${progress ? html`<div class="check__progress" role="status"><progress max="${progress.total}" value="${progress.done}"></progress><span class="small num">${progress.done}/${progress.total}권 확인 중</span></div>` : ''}
      ${error ? errorNotice(error) : ''}
      ${!busy && next
        ? html`<button class="btn btn--primary btn--block" type="button" id="check">${icon('search')}${t.checked ? `남은 ${left.length}권 중 ${next}권 더 확인하기` : `${next}권 확인하기${left.length > next ? ` (전체 ${left.length}권)` : ''}`}</button>`
        : ''}
      ${!busy && !next && t.checked ? html`<p class="small muted">${icon('check')} 보이는 책을 모두 확인했어요. 대출 가능 여부는 책을 눌러 보세요(어제 기준).</p>` : ''}
      ${withIsbn.length < sc.length && !progress ? html`<p class="small muted">${sc.length - withIsbn.length}권은 정보나루에서 책을 찾지 못해 확인할 수 없어요.</p>` : ''}
      <p class="small muted">소장 정보는 도서관 정보나루 기준이라 실제와 조금 다를 수 있어요.</p>`);
  };

  const check = async () => {
    if (busy) return;
    const targets = unchecked().slice(0, BATCH);
    if (!targets.length) return;
    busy = true;
    error = null;
    progress = { done: 0, total: targets.length };
    drawCheck();
    let stop = null;
    await runLimited(targets, PARALLEL, async (book) => {
      if (stop || signal.aborted) return;
      const isbn = isbnOf(book);
      try {
        const got = new Map();
        for (const region of byRegion.keys()) got.set(region, await holdings(isbn, region, { signal }));
        const r = overlap(byRegion, (region) => got.get(region));
        if (r) results.set(book.no, r);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        stop = err;
      }
      progress.done += 1;
      if (signal.aborted) return;
      // 그 줄만 바꾼다(목록 전체를 다시 그리지 않게)
      const li = listEl.querySelector(`[data-row="${CSS.escape(String(book.no))}"]`);
      if (li) {
        li.querySelector('[data-end]').innerHTML = toMarkup(statusBadge(book, results.get(book.no)));
        li.querySelector('[data-libs]').innerHTML = toMarkup(libNames(results.get(book.no)));
      }
      drawCheck();
    });
    if (signal.aborted) return;
    busy = false;
    progress = null;
    if (stop) error = stop.code === 'budget' ? { message: '오늘 조회 한도를 다 썼어요. 확인한 책까지만 보여 드려요. 내일 다시 확인해 주세요.' } : stop;
    drawCheck();
    drawList();
    const t = tally(scope().map((b) => results.get(b.no)));
    if (!stop) toast(`${t.checked}권 중 ${t.have}권이 내 도서관에 있어요`);
  };

  main.addEventListener('click', (event) => {
    if (event.target.closest('#check')) {
      check();
      return;
    }
    // 책장: 책을 누르면 그 자리에서 펼치기/접기
    const rowBtn = event.target.closest('.row--btn');
    if (rowBtn) {
      const li = rowBtn.closest('[data-row]');
      const no = Number(li.dataset.row);
      const open = !opened.has(no);
      if (open) opened.add(no);
      else opened.delete(no);
      rowBtn.setAttribute('aria-expanded', String(open));
      li.classList.toggle('is-open', open);
      li.querySelector('.shelf-panel').hidden = !open;
      return;
    }
    const watchBtn = event.target.closest('[data-watch]');
    if (watchBtn) {
      const isbn = watchBtn.dataset.watch;
      const book = list.books.find((b) => isbnOf(b) === isbn);
      const m = (book && book.match) || {};
      const on = !store.watchlist.has(isbn);
      if (on) store.watchlist.add({ isbn13: isbn, title: m.title || (book && book.title) || '', authors: m.authors || '', cover: m.cover || '' });
      else store.watchlist.remove(isbn);
      // 같은 책이 목록에 두 번 있을 수 있어서 모두 바꾼다
      main.querySelectorAll(`[data-watch="${CSS.escape(isbn)}"]`).forEach((b) => {
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', `관심 도서에 ${on ? '담았어요' : '담기'}`);
        b.innerHTML = toMarkup(html`${icon('star', { filled: on })}${on ? '담았어요' : '담기'}`);
      });
      toast(on ? '관심 도서에 담았어요' : '관심 도서에서 뺐어요');
      return;
    }
    const fieldBtn = event.target.closest('[data-field]');
    if (fieldBtn) {
      field = fieldBtn.dataset.field;
      main.querySelectorAll('[data-field]').forEach((b) => b.setAttribute('aria-pressed', String(b === fieldBtn)));
      drawList();
      if (!busy) drawCheck();
      return;
    }
    const only = event.target.closest('#only-have');
    if (only) {
      onlyHave = !onlyHave;
      only.setAttribute('aria-pressed', String(onlyHave));
      drawList();
      return;
    }
    if (event.target.closest('#edit-mine')) {
      viewCtl.abort();
      drawPaste(main, myList.get(), routeSignal);
      return;
    }
    if (event.target.closest('#clear-mine')) {
      viewCtl.abort();
      myList.clear();
      toast('목록을 지웠어요');
      drawPaste(main, null, routeSignal);
    }
  }, { signal });

  drawList();
  drawCheck();
  // 오늘의 한 권 등에서 특정 책을 펼친 채로 왔으면 그 책으로 스크롤
  if (opened.size) {
    const li = listEl.querySelector(`[data-row="${CSS.escape(String(openNo))}"]`);
    if (li) requestAnimationFrame(() => li.scrollIntoView({ block: 'center' }));
  }

  // 직접 만든 목록에서 아직 찾지 못한 책이 있으면 이어서 찾는다
  if (list.kind === 'mine' && list.books.some((b) => b.pending)) {
    resolveMine(list, {
      signal,
      onUpdate: () => {
        rememberBooks(list.books);
        drawList();
        if (!busy) drawCheck();
      },
    });
  }
}

// ---------- 직접 만든 목록: 붙여 넣기 → 책 찾기 ----------

function drawPaste(main, saved, routeSignal) {
  document.title = '내 목록 — 책있나';
  main.innerHTML = toMarkup(html`<div class="hero"><h1 class="h1">내 목록</h1><p class="lead">읽고 싶은 책이나 선생님이 준 권장도서 목록을 붙여 넣으면, 내 도서관에 있는지 한 번에 확인해요.</p></div>${pasteForm(saved)}`);
  const form = main.querySelector('#paste-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const items = parsePasted(form.querySelector('#paste').value);
    if (!items.length) {
      toast('책 제목을 한 줄에 한 권씩 적어 주세요');
      form.querySelector('#paste').focus();
      return;
    }
    // 고친 목록이라도 제목·저자가 같은 책은 지난번에 찾은 결과를 그대로 쓴다
    const keyOf = (title, author, isbn) => (isbn ? `isbn:${isbn}` : `${title}|${author}`);
    const before = new Map(((saved && saved.books) || []).filter((b) => !b.pending).map((b) => [keyOf(b.title, b.author, b.isbnOnly), b]));
    const books = items.map((item, i) => {
      const old = before.get(keyOf(item.title, item.author, item.isbn));
      if (old) return { ...old, no: i + 1 };
      return { no: i + 1, title: item.title, author: item.author, ...(item.isbn ? { isbnOnly: item.isbn } : {}), pending: true };
    });
    myList.save({ title: '내 목록', createdAt: Date.now(), books });
    // 같은 주소에서 다시 그린다
    render({ main, params: { id: 'mine' }, signal: routeSignal });
  });
  const cancel = main.querySelector('#paste-cancel');
  if (cancel) cancel.addEventListener('click', () => render({ main, params: { id: 'mine' }, signal: routeSignal }));
}

async function resolveMine(list, { signal, onUpdate }) {
  const pending = list.books.filter((b) => b.pending);
  await runLimited(pending, 2, async (book) => {
    if (signal.aborted) return;
    try {
      let match = null;
      if (book.isbnOnly) {
        const found = await bookDetail(book.isbnOnly, { signal });
        match = found ? { ...found, isbn13: book.isbnOnly } : { isbn13: book.isbnOnly, title: '', authors: '' };
        if (!book.title && found) book.title = found.title;
        if (!book.title) book.title = `ISBN ${book.isbnOnly}`;
      } else {
        const result = await searchBooks(book.title, { signal });
        match = pickMatch(result.books, { query: book.title, authorKeys: authorKeysOf(book.author) });
        // 저자가 달라 못 찾았으면, 제목이 같은 책이라도 고른다(저자 표기가 다를 수 있음)
        if (!match && book.author) match = pickMatch(result.books, { query: book.title });
      }
      if (match) book.match = { isbn13: match.isbn13, title: match.title, authors: match.authors, publisher: match.publisher, year: match.year, cover: match.cover };
      delete book.pending;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // 이번에는 못 찾았으면 다음에 다시 열 때 이어서 찾는다
      return;
    }
    if (signal.aborted) return;
    const saved = myList.get();
    if (saved) {
      saved.books = saved.books.map((b) => (b.no === book.no ? { ...book } : b));
      myList.save(saved);
    }
    onUpdate();
  });
}

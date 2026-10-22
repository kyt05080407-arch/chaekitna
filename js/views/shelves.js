// 책장: 사람별 책장(연예인·프로게이머 등이 추천한 책)과 학과별 책장(생기부 추천도서)을 둘러보는 화면.
//  - 오늘의 한 권: 날짜마다 책장 속 책 한 권
//  - 사람별 책장: 이름 첫 글자 동그라미(사진은 쓰지 않음), 분야 칩으로 거르기
//  - 도서관에서 많이 빌린 추천 책: 정보나루 도서 검색의 대출 건수 순(숫자를 지어내지 않는다)
//  - 학과별 책장: 대학 자료에 실린 책 + 탐구 연결 아이디어(예시)
//  - 학교에서 쓰는 목록: 서울대 권장도서, 중·고등학생 인기, 내 목록

import { html, toMarkup } from '../util.js';
import { avatar, cover, icon, setTopbar, skeletonRows } from '../ui.js';
import * as store from '../store.js';
import { KIND_LABEL, KIND_ORDER, dailyPick, isShelf, majorShelves, loadLists, starShelves, topLoaned } from '../lists.js';

// 사람별 책장은 처음에 두 줄(8명)만 보이고, '모두 보기'로 펼친다
const PEOPLE_FOLD = 8;
// 서울대 입학본부: "대학 입학에 유리한 책은 없다"(아로리 6호, 2018)
const NO_MAGIC_BOOK = 'https://www.wikitree.co.kr/articles/342221';

const bookCount = (list) => `${list.books.length}권`;

function pickCard(pick) {
  if (!pick) return '';
  const { list, book } = pick;
  const m = book.match || {};
  const owner = list.person ? html`${avatar(list.person.name, 'xs')}${list.person.name}의 책장` : html`<span class="pick__ico">${icon(list.icon || 'book')}</span>${list.title}`;
  return html`<section class="section" aria-labelledby="pick-h">
    <div class="section__head"><h2 class="h2" id="pick-h">오늘의 한 권</h2></div>
    <a class="pick" href="#/list/${list.id}?open=${book.no}">
      ${cover(m, 'lg')}
      <span class="pick__body">
        <span class="pick__owner">${owner}</span>
        <span class="pick__title">${book.title || m.title}</span>
        <span class="row__sub">${book.author || m.authors || ''}</span>
        ${book.from ? html`<span class="pick__why">${book.from}</span>` : ''}
      </span>
    </a>
  </section>`;
}

function personItem(list) {
  const p = list.person;
  return html`<li><a class="person" href="#/list/${list.id}" aria-label="${p.name}의 책장, ${p.team}, ${bookCount(list)}">
    ${avatar(p.name, 'lg')}
    <span class="person__name">${p.name}</span>
    <span class="person__team">${p.team}</span>
  </a></li>`;
}

function majorItem(list) {
  return html`<li><a class="major" href="#/list/${list.id}">
    <span class="list-icon">${icon(list.icon || 'book')}</span>
    <span class="major__body"><span class="major__name">${list.short.replace(/·/g, '·\u200b')}</span><span class="row__sub">${bookCount(list)}</span></span>
  </a></li>`;
}

function loanedRow(item, i) {
  const { book } = item;
  const m = book.match;
  const who = item.people.map((p) => p.name).join('·');
  return html`<li><a class="row" href="#/book/${m.isbn13}">
    <span class="rank${i < 3 ? ' rank--top' : ''}">${i + 1}</span>
    ${cover(m, 'sm')}
    <span class="row__body"><span class="row__title">${book.title || m.title}</span><span class="row__sub">${who} 추천</span></span>
    <span class="row__end"><span class="row__figure">${Number(item.loanCount).toLocaleString('ko-KR')}번</span><span class="row__figure-label">도서관 대출</span></span>
  </a></li>`;
}

const LIST_ICON = { popular: 'trend' };
function schoolRows(lists) {
  const saved = store.get('myList', null);
  const mineCount = saved && Array.isArray(saved.books) ? saved.books.length : 0;
  const rows = [
    ...lists.map((l) => ({
      href: `#/list/${l.id}`,
      ico: LIST_ICON[l.kind] || 'book',
      title: l.title,
      sub: l.kind === 'popular' ? `${l.books.length}권 · 최근 30일 전국` : `${l.books.length}권${Array.isArray(l.fields) && l.fields.length ? ` · ${l.fields.length}개 분야` : ''}`,
    })),
    { href: '#/list/mine', ico: 'edit', title: '내 목록', sub: mineCount ? `${mineCount}권 · 직접 만든 목록` : '선생님이 준 목록을 붙여 넣어 확인' },
  ];
  return rows.map(
    (r) => html`<li><a class="row" href="${r.href}">
      <span class="list-icon">${icon(r.ico)}</span>
      <span class="row__body"><span class="row__title">${r.title}</span><span class="row__sub">${r.sub}</span></span>
      ${icon('chevron', { cls: 'row__chev' })}
    </a></li>`,
  );
}

export async function render({ main, query, signal }) {
  setTopbar(html`<h1 class="topbar__title">책장</h1>`);
  document.title = '책장 — 책있나';
  main.innerHTML = toMarkup(html`<div class="stack">${skeletonRows(4, '4rem')}</div>`);

  const data = await loadLists();
  if (signal.aborted) return;
  const people = starShelves(data.lists);
  const majors = majorShelves(data.lists);
  const school = data.lists.filter((l) => !isShelf(l));
  const loaned = topLoaned(data.lists, 5);
  const kinds = KIND_ORDER.filter((k) => people.some((l) => l.person.kind === k));
  let kind = '';
  let unfolded = false;

  main.innerHTML = toMarkup(html`
    <div class="hero">
      <h1 class="h1">책장</h1>
      <p class="lead">좋아하는 사람이 읽은 책, 가고 싶은 학과에서 권한 책을 구경하고 내 도서관에 있는지 바로 확인해요.</p>
    </div>

    ${pickCard(dailyPick(data.lists))}

    ${people.length
      ? html`<section class="section" aria-labelledby="people-h">
          <div class="section__head"><h2 class="h2" id="people-h">사람별 책장</h2><span class="small muted num">${people.length}명</span></div>
          <p class="section__sub">기사로 확인된 추천만 모았어요. 책마다 출처를 달았어요.</p>
          <div class="chips chips--scroll" id="kinds" role="group" aria-label="분야">
            <button class="chip" type="button" data-kind="" aria-pressed="true">전체</button>
            ${kinds.map((k) => html`<button class="chip" type="button" data-kind="${k}" aria-pressed="false">${KIND_LABEL[k]}</button>`)}
          </div>
          <ul class="people" id="people"></ul>
          <button class="btn btn--block" type="button" id="people-more" hidden></button>
        </section>`
      : ''}

    ${loaned.length
      ? html`<section class="section" aria-labelledby="loaned-h">
          <div class="section__head"><h2 class="h2" id="loaned-h">도서관에서 많이 빌린 추천 책</h2></div>
          <p class="section__sub">사람별 책장 속 책을 도서관 정보나루 대출 건수 순서로 모았어요</p>
          <ol class="list">${loaned.map(loanedRow)}</ol>
        </section>`
      : ''}

    ${majors.length
      ? html`<section class="section" aria-labelledby="majors-h">
          <div class="section__head"><h2 class="h2" id="majors-h">학과별 책장</h2><span class="small muted">생기부 추천도서</span></div>
          <p class="section__sub">대학이 권한 책과 서울대 지원자가 많이 읽은 책이에요. 책을 누르면 탐구 연결 아이디어가 보여요.</p>
          <ul class="majors">${majors.map(majorItem)}</ul>
          <p class="small muted">서울대 입학본부는 <a href="${NO_MAGIC_BOOK}" target="_blank" rel="noopener noreferrer">대학 입학에 유리한 책은 따로 없다</a>고 해요. 정말 궁금한 책을 골라 끝까지 읽고 내 생각을 남기는 게 먼저예요.</p>
        </section>`
      : ''}

    <section class="section" aria-labelledby="school-h">
      <div class="section__head"><h2 class="h2" id="school-h">학교에서 쓰는 목록</h2></div>
      <p class="section__sub">목록 속 책이 내 도서관에 있는지 한 번에 봐요</p>
      <ul class="list">${schoolRows(school)}</ul>
    </section>`);

  const peopleEl = main.querySelector('#people');
  const more = main.querySelector('#people-more');
  const drawPeople = () => {
    if (!peopleEl) return;
    const shown = people.filter((l) => !kind || l.person.kind === kind);
    const fold = !unfolded && shown.length > PEOPLE_FOLD + 2;
    peopleEl.innerHTML = toMarkup((fold ? shown.slice(0, PEOPLE_FOLD) : shown).map(personItem));
    more.hidden = !fold;
    if (fold) more.innerHTML = toMarkup(html`${shown.length}명 모두 보기`);
  };
  drawPeople();
  // 처음 화면의 '학과별 책장'으로 왔으면 그 칸으로
  if (query && query.get('at') === 'majors') {
    const target = main.querySelector('#majors-h');
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  main.addEventListener(
    'click',
    (event) => {
      const chip = event.target.closest('[data-kind]');
      if (chip) {
        kind = chip.dataset.kind;
        main.querySelectorAll('[data-kind]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        drawPeople();
        return;
      }
      if (event.target.closest('#people-more')) {
        unfolded = true;
        drawPeople();
        const first = peopleEl.querySelectorAll('a')[PEOPLE_FOLD];
        if (first) first.focus();
      }
    },
    { signal },
  );
}


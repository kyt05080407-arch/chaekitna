// 책장: 사람별 책장(연예인·프로게이머 등이 추천한 책)과 학과별 책장(생기부 추천도서)을 둘러보는 화면.
//  - 오늘의 한 권: 날짜마다 책장 속 책 한 권(강조 카드)
//  - 사람별 책장: 표지 부채 + 이름 첫 글자 동그라미(사진은 쓰지 않음), 분야 칩으로 거르기
//  - 도서관에서 많이 빌린 추천 책: 표지를 옆으로 넘겨 보는 줄. 정보나루 도서 검색의 대출 건수 순(숫자를 지어내지 않는다)
//  - 학과별 책장: 대학 자료에 실린 책 + 탐구 연결 아이디어(예시)
//  - 학교에서 쓰는 목록: 서울대 권장도서, 중·고등학생 인기, 내 목록

import { html, toMarkup } from '../util.js';
import { avatar, cover, coverFan, icon, setTopbar, shelfCard, skeletonRows } from '../ui.js';
import * as store from '../store.js';
import { KIND_LABEL, KIND_ORDER, dailyPick, isShelf, majorShelves, loadLists, starShelves, topLoaned } from '../lists.js';

// 사람별 책장은 처음에 세 줄(6명)만 보이고, '모두 보기'로 펼친다
const PEOPLE_FOLD = 6;
// 서울대 입학본부: "대학 입학에 유리한 책은 없다"(아로리 6호, 2018)
const NO_MAGIC_BOOK = 'https://www.wikitree.co.kr/articles/342221';

function pickCard(pick) {
  if (!pick) return '';
  const { list, book } = pick;
  const m = book.match || {};
  const owner = list.person ? html`${avatar(list.person.name, 'xs')}${list.person.name}의 책장` : html`<span class="pick__ico">${icon(list.icon || 'book')}</span>${list.title}`;
  return html`<section class="section section--pick" aria-labelledby="pick-h">
    <h2 class="pick__label" id="pick-h">${icon('star', { filled: true })}오늘의 한 권</h2>
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

function majorItem(list) {
  return html`<li><a class="major" href="#/list/${list.id}">
    <span class="major__top"><span class="list-icon">${icon(list.icon || 'book')}</span><span class="major__text"><span class="major__name">${list.short.replace(/·/g, '·\u200b')}</span><span class="row__sub">${list.books.length}권</span></span></span>
    ${coverFan(list.books, 3, 'xs')}
  </a></li>`;
}

// 많이 빌린 추천 책: 표지 줄
function loanedItem(item, i) {
  const { book } = item;
  const m = book.match;
  const who = item.people.map((p) => p.name).join('·');
  return html`<li><a class="rail__item" href="#/book/${m.isbn13}">
    <span class="rail__cover">${cover(m, 'rail')}<span class="rail__rank${i < 3 ? ' rail__rank--top' : ''}">${i + 1}</span></span>
    <span class="rail__title">${book.title || m.title}</span>
    <span class="rail__sub">${who} 추천</span>
    <span class="rail__num num">${Number(item.loanCount).toLocaleString('ko-KR')}번 대출</span>
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
    { href: '#/list/mine', ico: 'edit', title: '내 목록', sub: mineCount ? `${mineCount}권 · 직접 만든 목록` : '선생님이 준 목록 붙여 넣기' },
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
  const loaned = topLoaned(data.lists, 10);
  const kinds = KIND_ORDER.filter((k) => people.some((l) => l.person.kind === k));
  let kind = '';
  let unfolded = false;

  main.innerHTML = toMarkup(html`
    <div class="hero">
      <h1 class="h1">책장</h1>
      <p class="lead">좋아하는 사람이 읽은 책, 가고 싶은 학과 추천 책을 둘러봐요.</p>
    </div>

    ${pickCard(dailyPick(data.lists))}

    ${people.length
      ? html`<section class="section" aria-labelledby="people-h">
          <div class="section__head"><h2 class="h2" id="people-h">사람별 책장</h2><span class="small muted num">${people.length}명</span></div>
          <p class="section__sub">기사로 확인된 추천만 모았어요</p>
          <div class="chips chips--scroll" id="kinds" role="group" aria-label="분야">
            <button class="chip" type="button" data-kind="" aria-pressed="true">전체</button>
            ${kinds.map((k) => html`<button class="chip" type="button" data-kind="${k}" aria-pressed="false">${KIND_LABEL[k]}</button>`)}
          </div>
          <ul class="shelf-cards shelf-cards--grid" id="people"></ul>
          <button class="btn btn--block" type="button" id="people-more" hidden></button>
        </section>`
      : ''}

    ${loaned.length
      ? html`<section class="section" aria-labelledby="loaned-h">
          <div class="section__head"><h2 class="h2" id="loaned-h">도서관에서 많이 빌린 추천 책</h2></div>
          <p class="section__sub">사람별 책장 속 책, 정보나루 대출 건수 순</p>
          <ol class="rail" id="loaned">${loaned.map(loanedItem)}</ol>
        </section>`
      : ''}

    ${majors.length
      ? html`<section class="section" aria-labelledby="majors-h">
          <div class="section__head"><h2 class="h2" id="majors-h">학과별 책장</h2><span class="small muted">생기부 추천도서</span></div>
          <p class="section__sub">대학이 권한 책과 서울대 지원자가 많이 읽은 책. 책마다 탐구 연결 아이디어가 있어요.</p>
          <ul class="majors">${majors.map(majorItem)}</ul>
          <p class="small muted">서울대 입학본부는 <a href="${NO_MAGIC_BOOK}" target="_blank" rel="noopener noreferrer">입학에 유리한 책은 따로 없다</a>고 해요. 궁금한 책을 끝까지 읽고 내 생각을 남기는 게 먼저예요.</p>
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
    peopleEl.innerHTML = toMarkup((fold ? shown.slice(0, PEOPLE_FOLD) : shown).map(shelfCard));
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

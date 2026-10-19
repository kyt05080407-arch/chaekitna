// 내 도서관에 없거나 모두 대출 중일 때 '다음 방법'을 상황에 맞는 순서로 보여 준다.
// 사실 정보 출처
//  - 책바다 이용안내(이용료 5,800원, 지역 지원 따라 달라짐, 14일·3책): https://books.nl.go.kr/nill/contents/NI3010000000.do
//  - 책바다 신청: https://books.nl.go.kr/nill/contents/NI2010000000.do
import { html } from './util.js';
import { icon } from './ui.js';

export const BOOKSEA_APPLY = 'https://books.nl.go.kr/nill/contents/NI2010000000.do';
export const BOOKSEA_GUIDE = 'https://books.nl.go.kr/nill/contents/NI3010000000.do';

export function bookstoreLinks(isbn) {
  const q = encodeURIComponent(isbn);
  return [
    { name: '교보문고', href: `https://search.kyobobook.co.kr/search?keyword=${q}` },
    { name: '알라딘', href: `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=${q}` },
  ];
}

// 상태 모음 → 'available' | 'loaned' | 'none' | 'unknown'
export function situation(statuses) {
  const values = Object.values(statuses || {});
  if (!values.length) return 'unknown';
  if (values.includes('available')) return 'available';
  if (values.includes('loaned')) return 'loaned';
  if (values.every((s) => s === 'none')) return 'none';
  return 'unknown';
}

// 상황별 방법 순서(id 목록)
export function stepOrder(kind) {
  if (kind === 'loaned') return ['alert', 'reserve', 'wide', 'booksea', 'buy'];
  if (kind === 'none') return ['wide', 'booksea', 'request', 'buy'];
  return [];
}

const step = (n, ico, title, sub, action) => html`<li class="next__step">
  <span class="next__n" aria-hidden="true">${n}</span>
  <span class="next__body">
    <span class="next__title">${icon(ico)}${title}</span>
    <span class="next__sub">${sub}</span>
    <span class="card__links">${action}</span>
  </span>
</li>`;

/**
 * @param {{ kind:string, isbn:string, watched:boolean, reserveLink:any, requestLink:any }} o
 *   reserveLink: 대출 중인 내 도서관 홈페이지 링크(바로 찾기 또는 제목 복사), requestLink: 첫 내 도서관 홈페이지 링크
 */
export function nextStepsView(o) {
  const order = stepOrder(o.kind);
  if (!order.length) return '';
  const head =
    o.kind === 'loaned' ? '지금은 모두 대출 중이에요. 이렇게 해 보세요' : '내 도서관에는 없어요. 이렇게 구할 수 있어요';
  const items = {
    alert: (n) =>
      step(
        n,
        'bell',
        '반납되면 알림 받기',
        '관심 도서에 담아 두면, 내 도서관에서 반납돼 빌릴 수 있게 된 다음 날 아침에 알려 드려요.',
        o.watched
          ? html`<span class="next__done">${icon('check')}관심 도서에 담겨 있어요</span>`
          : html`<button class="is-go" type="button" data-next="watch">${icon('star')}관심 도서에 담기</button>`,
      ),
    reserve: (n) =>
      step(
        n,
        'clock',
        '도서관 홈페이지에서 예약하기',
        '대출 중인 책은 예약해 두면 반납될 때 차례로 빌릴 수 있어요. 예약 가능 여부와 권수는 도서관마다 달라요.',
        o.reserveLink || '',
      ),
    wide: (n) =>
      step(
        n,
        'library',
        '같은 시·도 다른 도서관',
        '내 도서관 말고 가까운 다른 도서관에 있는지 찾아봐요.',
        html`<button type="button" data-next="wide">${icon('search')}다른 도서관 찾아보기</button>`,
      ),
    booksea: (n) =>
      step(
        n,
        'truck',
        '책바다로 다른 지역 책 받기',
        '전국 협약 도서관의 책을 내 도서관으로 택배로 받아 14일 동안 빌려요(1인 3책). 이용료는 5,800원이고 지역 지원이 있으면 더 적게 내요. 책바다 가입과 소속 도서관 승인이 먼저 필요해요.',
        html`<a href="${BOOKSEA_APPLY}" target="_blank" rel="noopener noreferrer" data-copy-title="${o.isbn}" data-copy-hint="ISBN ${o.isbn}을 복사했어요. 책바다 상세검색의 표준부호(ISBN)에 붙여 넣으세요">${icon('external')}책바다에서 신청 (ISBN 복사)</a><a href="${BOOKSEA_GUIDE}" target="_blank" rel="noopener noreferrer">${icon('info')}이용안내</a>`,
      ),
    request: (n) =>
      step(
        n,
        'edit',
        '희망도서로 신청하기',
        '내 도서관에 이 책을 사 달라고 신청할 수 있어요. 도서관 홈페이지의 희망도서 신청 메뉴에서 해요. 동네 서점에서 바로 빌려 주는 지역도 있어요(희망도서 바로대출).',
        o.requestLink || '',
      ),
    buy: (n) =>
      step(
        n,
        'cart',
        '사서 읽기',
        '빨리 읽어야 한다면 서점에서 찾아봐요.',
        bookstoreLinks(o.isbn).map((b) => html`<a href="${b.href}" target="_blank" rel="noopener noreferrer">${icon('external')}${b.name}</a>`),
      ),
  };
  return html`<section class="section next" id="next" aria-labelledby="next-h">
    <h2 class="h2" id="next-h">${head}</h2>
    <ol class="next__list">${order.map((id, i) => items[id](i + 1))}</ol>
  </section>`;
}

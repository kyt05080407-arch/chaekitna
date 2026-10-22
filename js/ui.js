// 여러 화면이 함께 쓰는 아이콘·배지·안내 상자·토스트

import { escapeHtml, html, raw, safeImageUrl } from './util.js';
import { STATUS_LABEL } from './parse.js';
import { hueOf, initialOf } from './lists.js';

const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  barcode: '<path d="M4 6v12M7.5 6v12M10.5 6v12M14 6v12M17 6v12M20 6v12"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  library: '<path d="M3 21h18"/><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10"/><path d="M2 10l10-6 10 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  minus: '<path d="M6 12h12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  warning: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>',
  share: '<path d="M12 3v12"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  cart: '<path d="M3 4h2l2.2 11h10.6L20 8H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  // 책장 탭·학과별 책장
  shelf: '<path d="M3 21h18"/><path d="M5 21V6h3.5v15M10.5 21V4H14v17"/><path d="M15.6 7.2l3.3-.9 3.1 13.9-3.3.8z"/>',
  gear: '<path d="M9.8 5.1L10.3 2.5L13.7 2.5L14.2 5.1L15.3 5.6L17.5 4.0L20.0 6.5L18.4 8.7L18.9 9.8L21.5 10.3L21.5 13.7L18.9 14.2L18.4 15.3L20.0 17.5L17.5 20.0L15.3 18.4L14.2 18.9L13.7 21.5L10.3 21.5L9.8 18.9L8.7 18.4L6.5 20.0L4.0 17.5L5.6 15.3L5.1 14.2L2.5 13.7L2.5 10.3L5.1 9.8L5.6 8.7L4.0 6.5L6.5 4.0L8.7 5.6Z"/><circle cx="12" cy="12" r="3"/>',
  robot: '<rect x="4.5" y="8" width="15" height="11.5" rx="3"/><path d="M12 4.5V8M9.5 13.2h.01M14.5 13.2h.01M9.5 16.5h5M2.5 12.5v3M21.5 12.5v3"/><circle cx="12" cy="3.6" r="1.1"/>',
  settings: '<path d="M9.8 5.1L10.3 2.5L13.7 2.5L14.2 5.1L15.3 5.6L17.5 4.0L20.0 6.5L18.4 8.7L18.9 9.8L21.5 10.3L21.5 13.7L18.9 14.2L18.4 15.3L20.0 17.5L17.5 20.0L15.3 18.4L14.2 18.9L13.7 21.5L10.3 21.5L9.8 18.9L8.7 18.4L6.5 20.0L4.0 17.5L5.6 15.3L5.1 14.2L2.5 13.7L2.5 10.3L5.1 9.8L5.6 8.7L4.0 6.5L6.5 4.0L8.7 5.6Z"/><circle cx="12" cy="12" r="3"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/>',
  flask: '<path d="M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3"/><path d="M7.2 15h9.6"/>',
  dna: '<path d="M7 3c0 5.5 10 6.5 10 12 0 2.6-1.4 4.6-3 6M17 3c0 5.5-10 6.5-10 12 0 2.6 1.4 4.6 3 6"/><path d="M8.6 7.5h6.8M8.6 16.5h6.8"/>',
  medical: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/>',
  leaf: '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/><path d="M5 19l8-8"/>',
  chart: '<path d="M3 20.5h18"/><path d="M6.5 17v-5M12 17V7M17.5 17V4"/>',
  scale: '<path d="M12 3v17.5M7 20.5h10M4.5 7h15"/><path d="M4.5 7L2 13a2.5 2.5 0 0 0 5 0zM19.5 7L17 13a2.5 2.5 0 0 0 5 0z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.3a4 4 0 0 0 7 0"/><path d="M9 9.6h.01M15 9.6h.01"/>',
  feather: '<path d="M20 4c-8.5 0-14 5.5-14 14v2.5"/><path d="M20 4c0 7.5-5 12.5-12.5 12.5"/><path d="M4 20.5l7-7"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9s-1-1.6-1-2.6 1-1.5 2-1.5h2a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  quote: '<path d="M10 7H6.5A2.5 2.5 0 0 0 4 9.5V12h4v4.5H4M20 7h-3.5A2.5 2.5 0 0 0 14 9.5V12h4v4.5h-4"/>',
};

export function icon(name, { label = '', filled = false, cls = '' } = {}) {
  const body = PATHS[name] || '';
  const a11y = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  const fill = filled ? 'currentColor' : 'none';
  const klass = cls ? ` class="${escapeHtml(cls)}"` : '';
  return raw(
    `<svg${klass} viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y} focusable="false">${body}</svg>`,
  );
}

// 사람별 책장의 이름 동그라미(사진 대신 첫 글자, 이름마다 같은 색)
export function avatar(name, size = '') {
  return html`<span class="avatar${size ? ` avatar--${size}` : ''}" style="--h:${hueOf(name)}" aria-hidden="true">${initialOf(name)}</span>`;
}

export function brandMark(size = 28) {
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h12v18l-6-4-6 4z" fill="#FFD43B" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  );
}

const STATUS_ICON = { available: 'check', loaned: 'clock', none: 'minus', unknown: 'info' };

export function statusBadge(status) {
  const s = STATUS_LABEL[status] ? status : 'unknown';
  return html`<span class="badge badge--${s}">${icon(STATUS_ICON[s])}${STATUS_LABEL[s]}</span>`;
}

export function demoBadge() {
  return html`<span class="badge badge--demo">예시</span>`;
}

export function cover(book, size = '') {
  const src = safeImageUrl(book && book.cover);
  const cls = size ? `cover cover--${size}` : 'cover';
  if (src) {
    // 표지를 못 불러오면 app.js의 오류 처리기가 빈 표지로 바꾼다.
    return html`<img class="${cls}" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cover>`;
  }
  return html`<span class="${cls}">${icon('book')}</span>`;
}

// 책장 미리보기: 표지 몇 장을 겹쳐 보여 준다(표지가 있는 책부터)
export function coverFan(books, count = 3, size = 'xs') {
  const withCover = (books || []).map((b) => b.match || b).filter((m) => m && m.cover);
  const rest = (books || []).map((b) => b.match || b).filter((m) => m && !m.cover);
  const picked = [...withCover, ...rest].slice(0, count);
  return html`<span class="fan fan--${size}" aria-hidden="true">${picked.map((m) => cover(m, size))}</span>`;
}

// 책장 카드: 표지 부채 + 이름(사람은 이름 동그라미, 학과는 아이콘)
export function shelfCard(list) {
  const who = list.person
    ? html`${avatar(list.person.name, 'xs')}<span class="shelf-card__name">${list.person.name}</span>`
    : html`<span class="shelf-card__ico">${icon(list.icon || 'book')}</span><span class="shelf-card__name">${list.short}</span>`;
  const sub = list.person ? `${list.person.team} · ${list.books.length}권` : `${list.books.length}권`;
  const label = list.person ? `${list.person.name}의 책장, ${sub}` : `${list.title}, ${sub}`;
  return html`<li><a class="shelf-card" href="#/list/${list.id}" aria-label="${label}">
    ${coverFan(list.books, 3, 'xs')}
    <span class="shelf-card__who">${who}</span>
    <span class="shelf-card__sub">${sub}</span>
  </a></li>`;
}

export function demoNotice() {
  return html`<div class="notice notice--demo" role="note">${icon('info')}<span><strong>예시 모드</strong> · '예시'가 붙은 대출 상태는 실제와 달라요.</span></div>`;
}

export function errorNotice(error, retryId = '') {
  const message = (error && error.message) || '문제가 생겼어요.';
  return html`<div class="notice notice--warn" role="alert">${icon('warning')}<span>${message}${retryId ? html` <button class="btn btn--small" type="button" id="${retryId}">다시 시도</button>` : ''}</span></div>`;
}

export function skeletonRows(count = 3, height = '4.6rem') {
  return html`${Array.from({ length: count }, () => html`<div class="skeleton" style="height:${height}" aria-hidden="true"></div>`)}<span class="sr-only">불러오는 중</span>`;
}

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

export function setTopbar(markup) {
  const bar = document.getElementById('topbar');
  if (bar) bar.innerHTML = String(markup.value ?? markup);
}

// 글자 크기: 단계(보통·크게·아주 크게) 또는 막대로 고른 픽셀 값
export const FONT_PX = { min: 15, max: 26, presets: { m: 17, l: 19, xl: 22 } };

export function fontPxOf(settings) {
  const px = Number(settings && settings.fontPx);
  if (Number.isFinite(px) && px >= FONT_PX.min && px <= FONT_PX.max) return Math.round(px);
  return FONT_PX.presets[settings && settings.size] || FONT_PX.presets.l;
}

// 막대 값에 가장 가까운 단계(단계 버튼 표시와 예전 설정 호환용)
export function nearestSize(px) {
  return Object.entries(FONT_PX.presets).reduce((best, [id, v]) => (Math.abs(v - px) < Math.abs(FONT_PX.presets[best] - px) ? id : best), 'l');
}

// 글자 크기·화면 밝기 설정을 문서에 적용
export function applySettings(settings) {
  const root = document.documentElement;
  const px = fontPxOf(settings);
  root.dataset.size = nearestSize(px);
  // 모든 크기를 rem으로 써서, 문서 기본 글자 크기만 바꾸면 화면 전체가 같이 바뀐다
  root.style.fontSize = `${px}px`;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark = settings.theme === 'dark' || (settings.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#101216' : '#f2f4f6');
  }
}

export function backButton(href = '#/') {
  return html`<a class="icon-btn" href="${href}" data-back aria-label="뒤로">${icon('back')}</a>`;
}

// 로딩 중에 보여 주는 읽을거리 카드 (js/reading.js의 항목)
const READING_KIND = { quote: '오늘의 문장', tip: '알아 두면 좋아요', weekly: '이번 주 1위' };
export function readingCard(item, { live = false } = {}) {
  if (!item) return '';
  return html`<div class="reading" ${live ? raw('aria-live="polite"') : ''}>
    <span class="reading__kind">${READING_KIND[item.kind] || ''}</span>
    ${item.kind === 'tip' ? html`<p class="reading__text"><strong>${item.title}</strong><br>${item.text}</p>` : html`<p class="reading__text">${item.text}</p>`}
    ${item.kind === 'quote' ? html`<p class="reading__by">${item.who} · ${item.where}</p>` : ''}
  </div>`;
}

// 이번 주 인기 표시: "이번 주 전국 3위 · 모든 나이 합쳐 512번 빌렸어요"
export function hotLine(info) {
  if (!info) return '';
  const count = info.loanCount
    ? html` · ${info.allAges ? '모든 나이 합쳐 ' : ''}<strong>${Number(info.loanCount).toLocaleString('ko-KR')}번</strong> 빌렸어요`
    : '';
  return html`<p class="hot">${icon('trend')}<span>이번 주 ${info.who ? `${info.who} ` : ''}<strong>${info.rank}위</strong>${count}</span>${info.demo ? html`<span class="badge badge--demo">예시</span>` : ''}</p>`;
}

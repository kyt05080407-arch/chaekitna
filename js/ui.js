// 여러 화면이 함께 쓰는 아이콘·배지·안내 상자·토스트

import { escapeHtml, html, raw, safeImageUrl } from './util.js';
import { STATUS_LABEL } from './parse.js';

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
  const cls = size === 'lg' ? 'cover cover--lg' : size === 'sm' ? 'cover cover--sm' : 'cover';
  if (src) {
    // 표지를 못 불러오면 app.js의 오류 처리기가 빈 표지로 바꾼다.
    return html`<img class="${cls}" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cover>`;
  }
  return html`<span class="${cls}">${icon('book')}</span>`;
}

export function demoNotice() {
  return html`<div class="notice notice--demo" role="note">${icon('info')}<span><strong>예시 데이터 모드</strong> · '예시' 표시가 붙은 대출 상태는 실제와 달라요.</span></div>`;
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

// 글자 크기·화면 밝기 설정을 문서에 적용
export function applySettings(settings) {
  const root = document.documentElement;
  root.dataset.size = settings.size || 'l';
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

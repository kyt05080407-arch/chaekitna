// 홍보 영상 공통: 준비 완료 신호, 로고, 아이콘
export const LOGO = `<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#2E6BFF"/><path d="M150 96 H362 V420 L256 350 L150 420 Z" fill="#FFD43B" stroke="#111827" stroke-width="16" stroke-linejoin="round"/><circle cx="318" cy="318" r="62" fill="#FFFFFF" stroke="#111827" stroke-width="16"/><path d="M362 362 L420 420" stroke="#111827" stroke-width="26" stroke-linecap="round"/></svg>`;

export const MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" fill="#FFD43B" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const ICONS = {
  library: '<path d="M3 21h18"/><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10"/><path d="M2 10l10-6 10 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  minus: '<path d="M6 12h12"/>',
  arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
};
export function icon(name, size = 40) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// 글꼴과 이미지가 모두 준비되면 make-reel.mjs가 찍기 시작한다.
export function ready(duration, cover) {
  window.REEL = { duration, cover };
  window.reelReady = (async () => {
    const text = document.body.innerText;
    await Promise.all([700, 800, 850, 900, 600].map((w) => document.fonts.load(`${w} 80px "Pretendard Variable"`, text)));
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.decode().catch(() => {
          throw new Error(`이미지를 불러오지 못했어요: ${img.src}`);
        }),
      ),
    );
  })();
}

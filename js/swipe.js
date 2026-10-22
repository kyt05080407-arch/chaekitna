// 탭 화면을 옆으로 밀어 넘기기: 홈 ↔ 책장 ↔ 관심 도서 ↔ 내 도서관 ↔ 설정
// - 왼쪽으로 밀면 다음 탭, 오른쪽으로 밀면 이전 탭(아래 탭 막대 순서와 같음)
// - 탭 화면에서만. 책 화면·목록 화면처럼 안쪽 화면에서는 넘기지 않는다.
// - 옆으로 넘기는 줄(칩·표지 줄 등), 입력칸, 글자 크기 막대 위에서 민 건 그 줄을 넘기는 것이라 탭을 바꾸지 않는다.
// - 화면 가장자리에서 시작한 밀기는 아이폰 '뒤로 가기' 몸짓이라 건드리지 않는다.

export const TAB_ORDER = ['/', '/shelves', '/watchlist', '/libraries', '/settings'];

const MIN_DX = 70; // 이만큼은 옆으로 밀어야
const RATIO = 1.8; // 위아래보다 옆으로 훨씬 많이
const MAX_MS = 700; // 천천히 끄는 건 넘기기가 아님
const EDGE = 24; // 화면 가장자리(px)

/**
 * 밀기 한 번이 어느 탭으로 넘기는지. 넘기지 않으면 null.
 * @param {{path:string, dx:number, dy:number, ms:number, startX:number, width:number}} s
 */
export function swipeTarget({ path, dx, dy, ms, startX, width }) {
  const at = TAB_ORDER.indexOf(path);
  if (at < 0) return null;
  if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO || ms > MAX_MS) return null;
  if (startX < EDGE || startX > width - EDGE) return null;
  const next = at + (dx < 0 ? 1 : -1);
  if (next < 0 || next >= TAB_ORDER.length) return null;
  return { hash: `#${TAB_ORDER[next]}`, dir: dx < 0 ? 'next' : 'prev' };
}

// 이 요소(또는 그 위 요소)가 옆으로 넘기는 줄이거나 입력칸이면 탭 넘기기를 하지 않는다
export function insideHorizontal(el, stop) {
  for (let node = el; node && node !== stop && node.nodeType === 1; node = node.parentElement) {
    if (node.matches('input, textarea, select, [contenteditable="true"], [data-noswipe]')) return true;
    if (node.scrollWidth > node.clientWidth + 2) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}

/**
 * 화면에 밀기 처리기를 단다.
 * @param {{root:HTMLElement, currentPath:()=>string, go:(hash:string, dir:string)=>void, blocked?:()=>boolean}} o
 */
export function installTabSwipe({ root, currentPath, go, blocked = () => false }) {
  let start = null;
  root.addEventListener(
    'touchstart',
    (event) => {
      start = null;
      if (event.touches.length !== 1 || blocked()) return;
      if (insideHorizontal(event.target, root)) return;
      const t = event.touches[0];
      start = { x: t.clientX, y: t.clientY, at: Date.now() };
    },
    { passive: true },
  );
  root.addEventListener(
    'touchend',
    (event) => {
      if (!start) return;
      const t = event.changedTouches[0];
      const hit = swipeTarget({
        path: currentPath(),
        dx: t.clientX - start.x,
        dy: t.clientY - start.y,
        ms: Date.now() - start.at,
        startX: start.x,
        width: window.innerWidth,
      });
      start = null;
      // 글자를 고르는 중이었으면 넘기지 않는다
      const sel = window.getSelection && window.getSelection();
      if (hit && !(sel && String(sel).trim())) go(hit.hash, hit.dir);
    },
    { passive: true },
  );
  root.addEventListener('touchcancel', () => {
    start = null;
  });
}

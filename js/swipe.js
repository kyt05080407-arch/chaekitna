// 탭 화면을 옆으로 밀어 넘기기: 홈 ↔ 책장 ↔ 관심 도서 ↔ 내 도서관 ↔ 설정
// 책장을 넘기듯이 손가락을 따라 화면이 움직인다.
// - 왼쪽으로 밀면(다음 탭) 지금 화면이 손가락을 따라 왼쪽으로 넘어가고, 그 밑에 다음 탭이 미리 보인다.
// - 오른쪽으로 밀면(이전 탭) 이전 탭이 왼쪽에서 손가락을 따라 덮어 온다(책장을 앞으로 되넘기듯).
// - 반쯤(30%) 넘기거나 빠르게 휙 밀면 넘어가고, 아니면 제자리로 돌아간다.
// - 미리 보이는 화면은 그 탭을 마지막으로 봤을 때 모습(처음이면 빈 틀). 넘어간 뒤 진짜 화면으로 바뀐다.
// - 탭 화면에서만. 옆으로 넘기는 줄(칩·표지 줄), 입력칸, 글자 크기 막대 위, 화면 가장자리(아이폰 뒤로 가기)는 건드리지 않는다.
// - '동작 줄이기'를 켠 폰에서는 따라 움직이지 않고 손을 뗄 때 바로 넘긴다.

export const TAB_ORDER = ['/', '/shelves', '/watchlist', '/libraries', '/settings'];
export const TAB_LABEL = { '/': '홈', '/shelves': '책장', '/watchlist': '관심 도서', '/libraries': '내 도서관', '/settings': '설정' };

const LOCK = 10; // 이만큼 움직이면 옆으로 미는지 위아래로 스크롤하는지 정한다
const EDGE = 24; // 화면 가장자리(px)
const COMMIT = 0.3; // 이만큼 넘기면 넘어간다
const FLING = 0.45; // px/ms, 이보다 빠르게 휙 밀면 짧아도 넘어간다
const DURATION = 280; // 손을 뗀 뒤 마저 넘기는 시간(ms)

/** 지금 탭에서 dx 방향으로 밀었을 때 갈 탭. 없으면 null. dx<0 = 왼쪽으로 밂 = 다음 탭 */
export function neighborTab(path, dx) {
  const at = TAB_ORDER.indexOf(path);
  if (at < 0 || !dx) return null;
  const next = at + (dx < 0 ? 1 : -1);
  if (next < 0 || next >= TAB_ORDER.length) return null;
  return { path: TAB_ORDER[next], hash: `#${TAB_ORDER[next]}`, dir: dx < 0 ? 'next' : 'prev' };
}

/** 손을 뗐을 때 넘어갈지: 30% 넘게 넘겼거나, 40px 넘게 빠르게 휙 밀었을 때(같은 방향으로) */
export function shouldCommit({ dx, width, vx }) {
  const p = Math.abs(dx) / Math.max(1, width);
  if (p >= COMMIT) return true;
  return Math.abs(dx) > 40 && Math.abs(vx) >= FLING && Math.sign(vx) === Math.sign(dx);
}

/** 손가락을 처음 댄 곳이 가장자리면(아이폰 뒤로 가기 몸짓) 넘기지 않는다 */
export const fromEdge = (x, width) => x < EDGE || x > width - EDGE;

/** 손을 뗐을 때 넘어갈 탭(동작 줄이기·시험용): 넘기지 않으면 null */
export function swipeTarget({ path, dx, dy, ms, startX, width }) {
  if (fromEdge(startX, width)) return null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || ms > 700) return null;
  const n = neighborTab(path, dx);
  return n ? { hash: n.hash, dir: n.dir } : null;
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

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = 'cubic-bezier(0.22, 0.8, 0.25, 1)';

// 미리 보일 화면: 마지막으로 본 모습. 없으면 제목과 빈 틀.
function peekMarkup(snapshot, path) {
  const wrap = document.createElement('div');
  wrap.className = 'swipe-peek__page';
  if (snapshot) {
    wrap.innerHTML = `<header class="topbar">${snapshot.topbar}</header><div class="view">${snapshot.main}</div>`;
  } else {
    wrap.innerHTML = `<header class="topbar"><h1 class="topbar__title"></h1></header><div class="view"><div class="hero"><h1 class="h1"></h1></div>${'<div class="skeleton" style="height:7rem"></div>'.repeat(3)}</div>`;
    wrap.querySelectorAll('h1').forEach((h) => {
      h.textContent = TAB_LABEL[path] || '';
    });
  }
  // 미리 보기는 그림일 뿐: 같은 id가 두 번 생기지 않게, 누르거나 읽히지 않게
  wrap.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  return wrap;
}

/**
 * 화면에 밀기 처리기를 단다.
 * @param {{
 *   root: HTMLElement,          // 손가락을 받는 곳(본문)
 *   page: HTMLElement,          // 손가락을 따라 움직일 지금 화면(.app)
 *   currentPath: () => string,
 *   snapshot: (path:string) => ({topbar:string, main:string}|null),
 *   go: (hash:string, dir:string) => Promise<void>|void,  // 탭을 바꾸고, 새 화면이 그려지면 끝나는 약속
 *   blocked?: () => boolean,
 * }} o
 */
export function installTabSwipe({ root, page, currentPath, snapshot, go, blocked = () => false }) {
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let g = null; // 지금 밀고 있는 몸짓
  let busy = false; // 넘기는 애니메이션 중

  const width = () => page.getBoundingClientRect().width || window.innerWidth;

  function build(n) {
    const W = width();
    const L = page.getBoundingClientRect().left;
    const layer = document.createElement('div');
    layer.className = `swipe-peek swipe-peek--${n.dir}`;
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    const sheet = peekMarkup(snapshot(n.path), n.path);
    sheet.style.left = `${L}px`;
    sheet.style.width = `${W}px`;
    layer.append(sheet);
    const shade = document.createElement('div');
    shade.className = `swipe-shade swipe-shade--${n.dir}`;
    const edge = document.createElement('div');
    edge.className = `swipe-edge swipe-edge--${n.dir}`;
    document.body.append(shade, layer, edge);
    page.classList.add('is-swiping', `is-swiping--${n.dir}`);
    // 넘어가는 종이는 왼쪽(책등)을 축으로 살짝 들리고, 밑에 깔린 화면은 가운데를 기준으로 작아진다(아래로 스크롤해 있어도 화면 가운데)
    const midY = window.scrollY + window.innerHeight / 2;
    page.style.transformOrigin = n.dir === 'next' ? `0 ${midY}px` : `50% ${midY}px`;
    sheet.style.transformOrigin = n.dir === 'next' ? '50% 50%' : '0 50%';
    return { layer, sheet, shade, edge, W, L };
  }

  // 넘기는 중간에 종이가 가장 많이 들린다(최대 14도)
  const lift = (p) => (14 * Math.sin(Math.PI * clamp(p, 0, 1))).toFixed(2);

  // p: 0(안 넘김) ~ 1(다 넘김)
  function paint(v, p) {
    const { W, L } = v.layers;
    if (v.n.dir === 'next') {
      // 지금 화면이 위에서 왼쪽으로 넘어가고(책장처럼 살짝 들리며), 밑에 다음 화면이 드러난다
      page.style.transform = `perspective(1600px) translate3d(${-p * W}px,0,0) rotateY(-${lift(p)}deg)`;
      v.layers.sheet.style.transform = `scale(${0.94 + 0.06 * p})`;
      v.layers.shade.style.opacity = String(0.32 * (1 - p));
      v.layers.edge.style.transform = `translate3d(${L + W - p * W}px,0,0)`;
      v.layers.edge.style.opacity = String(p < 0.98 ? 1 : 0);
    } else {
      // 이전 화면이 왼쪽에서 덮어 오고, 지금 화면은 밑에서 살짝 작아지며 어두워진다
      v.layers.sheet.style.transform = `perspective(1600px) translate3d(${(p - 1) * W}px,0,0) rotateY(-${lift(p)}deg)`;
      page.style.transform = `scale(${1 - 0.06 * p})`;
      v.layers.shade.style.opacity = String(0.32 * p);
      v.layers.edge.style.transform = `translate3d(${L + p * W}px,0,0)`;
      v.layers.edge.style.opacity = String(p > 0.02 && p < 0.98 ? 1 : 0);
    }
  }

  function animate(v, to) {
    const els = [page, v.layers.sheet, v.layers.shade, v.layers.edge];
    els.forEach((el) => {
      el.style.transition = `transform ${DURATION}ms ${ease}, opacity ${DURATION}ms ${ease}`;
    });
    paint(v, to);
    return new Promise((resolve) => setTimeout(resolve, DURATION + 20));
  }

  function cleanup(v) {
    page.classList.remove('is-swiping', 'is-swiping--next', 'is-swiping--prev');
    page.style.transition = '';
    page.style.transform = '';
    page.style.transformOrigin = '';
    if (v && v.layers) {
      v.layers.layer.remove();
      v.layers.shade.remove();
      v.layers.edge.remove();
    }
  }

  // 끝 탭에서 더 밀면 고무줄처럼 조금만 따라오다 돌아온다
  function rubber(dx) {
    page.style.transform = `translate3d(${dx * 0.18}px,0,0)`;
  }

  root.addEventListener(
    'touchstart',
    (event) => {
      g = null;
      if (busy || event.touches.length !== 1 || blocked()) return;
      if (TAB_ORDER.indexOf(currentPath()) < 0) return;
      if (insideHorizontal(event.target, root)) return;
      const t = event.touches[0];
      if (fromEdge(t.clientX, window.innerWidth)) return;
      g = { x: t.clientX, y: t.clientY, at: Date.now(), mode: '', dx: 0, vx: 0, lastX: t.clientX, lastAt: Date.now(), n: null, layers: null };
    },
    { passive: true },
  );

  root.addEventListener(
    'touchmove',
    (event) => {
      if (!g || g.mode === 'scroll') return;
      const t = event.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.mode) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          g.mode = reduced() ? 'plain' : 'drag';
        } else {
          g.mode = 'scroll';
          return;
        }
      }
      if (event.cancelable) event.preventDefault();
      const now = Date.now();
      if (now > g.lastAt) {
        g.vx = (t.clientX - g.lastX) / (now - g.lastAt);
        g.lastX = t.clientX;
        g.lastAt = now;
      }
      g.dx = dx;
      if (g.mode !== 'drag') return;
      const n = neighborTab(currentPath(), dx);
      // 방향이 바뀌면(왼쪽 → 오른쪽) 미리 보기를 다시 만든다
      if (!g.n || !n || n.dir !== g.n.dir) {
        if (g.layers) cleanup(g);
        g.layers = null;
        g.n = n;
        if (n) g.layers = build(n);
      }
      if (!g.n) {
        rubber(dx);
        return;
      }
      paint(g, clamp(Math.abs(dx) / g.layers.W, 0, 1));
    },
    { passive: false },
  );

  const finish = async () => {
    const v = g;
    g = null;
    if (!v || !v.mode || v.mode === 'scroll') return;
    if (v.mode === 'plain') {
      const n = neighborTab(currentPath(), v.dx);
      if (n && shouldCommit({ dx: v.dx, width: width(), vx: v.vx })) go(n.hash, n.dir);
      return;
    }
    if (!v.n || !v.layers) {
      // 고무줄 되돌리기
      page.style.transition = `transform ${DURATION}ms ${ease}`;
      page.style.transform = '';
      setTimeout(() => cleanup(null), DURATION + 20);
      return;
    }
    busy = true;
    try {
      if (shouldCommit({ dx: v.dx, width: v.layers.W, vx: v.vx })) {
        await animate(v, 1);
        // 새 화면이 그려질 때까지 미리 보기를 그대로 두었다가 바꾼다(뚝 끊기지 않게)
        await Promise.race([Promise.resolve(go(v.n.hash, 'none')), new Promise((r) => setTimeout(r, 900))]);
        cleanup(v);
      } else {
        await animate(v, 0);
        cleanup(v);
      }
    } finally {
      busy = false;
    }
  };
  root.addEventListener('touchend', finish, { passive: true });
  root.addEventListener('touchcancel', finish, { passive: true });
}

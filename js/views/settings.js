import { html, toMarkup } from '../util.js';
import { applySettings, icon, setTopbar, toast } from '../ui.js';
import * as store from '../store.js';
import { REGIONS } from '../regions.js';
import { CONFIG } from '../config.js';
import { isDemoMode } from '../api.js';
import { librariesMeta, loadLibraries } from '../libraries.js';

const SIZES = [
  { id: 'm', label: '보통' },
  { id: 'l', label: '크게' },
  { id: 'xl', label: '아주 크게' },
];
const THEMES = [
  { id: 'auto', label: '자동' },
  { id: 'light', label: '밝게' },
  { id: 'dark', label: '어둡게' },
];

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export async function render({ main }) {
  document.title = '설정 — 책있나';
  setTopbar(html`<h1 class="topbar__title" style="padding-left:0.45rem">설정</h1>`);
  const s = store.settings.get();

  main.innerHTML = toMarkup(html`
    <section class="section" aria-labelledby="size-h">
      <h2 class="h2" id="size-h">글자 크기</h2>
      <div class="seg" role="group" aria-labelledby="size-h">
        ${SIZES.map((x) => html`<button type="button" data-size="${x.id}" aria-pressed="${s.size === x.id ? 'true' : 'false'}">${x.label}</button>`)}
      </div>
      <p class="small muted">이 크기로 책 제목과 도서관 이름이 보여요.</p>
    </section>

    <section class="section" aria-labelledby="theme-h">
      <h2 class="h2" id="theme-h">화면 밝기</h2>
      <div class="seg" role="group" aria-labelledby="theme-h">
        ${THEMES.map((x) => html`<button type="button" data-theme="${x.id}" aria-pressed="${s.theme === x.id ? 'true' : 'false'}">${x.label}</button>`)}
      </div>
    </section>

    <section class="section" aria-labelledby="region-h">
      <h2 class="h2" id="region-h">기본 지역</h2>
      <label class="sr-only" for="region">기본 지역</label>
      <select class="input" id="region">${REGIONS.map((r) => html`<option value="${r.code}">${r.name}</option>`)}</select>
      <p class="small muted">도서관 찾기와 '더 넓게 찾기'의 처음 지역이에요.</p>
    </section>

    ${!isStandalone()
      ? html`<section class="section" aria-labelledby="install-h">
          <h2 class="h2" id="install-h">홈 화면에 추가하기</h2>
          <div class="card card--soft stack">
            <p><strong>아이폰</strong>: 사파리 아래쪽 공유 버튼 → '홈 화면에 추가'</p>
            <p><strong>안드로이드</strong>: 크롬 오른쪽 위 메뉴(⋮) → '홈 화면에 추가' 또는 '앱 설치'</p>
            <button class="btn btn--primary" type="button" id="install" hidden>${icon('plus')}바로 설치하기</button>
          </div>
        </section>`
      : ''}

    <section class="section" aria-labelledby="privacy-h">
      <h2 class="h2" id="privacy-h">개인정보와 데이터</h2>
      <div class="stack">
        <p>이름, 연락처, 위치 기록을 받지 않아요. 내 도서관과 관심 도서는 이 폰에만 저장돼요.</p>
        <p>책·도서관 정보는 <a href="https://www.data4library.kr/" target="_blank" rel="noopener noreferrer">도서관 정보나루</a> 공공데이터예요. 대출 정보는 하루 늦게 반영돼요.</p>
        <p class="small muted" id="data-meta"></p>
        <button class="btn" type="button" id="clear">${icon('trash')}이 폰에 저장한 정보 모두 지우기</button>
      </div>
    </section>

    <section class="section">
      <p class="footer-note">책있나 ${CONFIG.appVersion}${isDemoMode() ? ' · 예시 데이터 모드' : ''}${CONFIG.feedbackUrl ? html` · <a href="${CONFIG.feedbackUrl}" target="_blank" rel="noopener noreferrer">의견 보내기</a>` : ''}</p>
    </section>`);

  const update = (patch) => {
    const next = store.settings.set(patch);
    applySettings(next);
    return next;
  };

  main.querySelectorAll('[data-size]').forEach((btn) =>
    btn.addEventListener('click', () => {
      update({ size: btn.dataset.size });
      main.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    }),
  );
  main.querySelectorAll('[data-theme]').forEach((btn) =>
    btn.addEventListener('click', () => {
      update({ theme: btn.dataset.theme });
      main.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    }),
  );

  const regionSel = main.querySelector('#region');
  regionSel.value = s.region || CONFIG.defaultRegion;
  regionSel.addEventListener('change', () => {
    update({ region: regionSel.value });
    toast('기본 지역을 바꿨어요');
  });

  main.querySelector('#clear').addEventListener('click', () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('내 도서관, 관심 도서, 설정을 모두 지울까요?')) return;
    store.clearAll();
    applySettings(store.settings.get());
    toast('모두 지웠어요');
    location.hash = '#/';
  });

  const installBtn = main.querySelector('#install');
  const deferred = window.__installPrompt;
  if (installBtn && deferred) {
    installBtn.hidden = false;
    installBtn.addEventListener('click', async () => {
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      window.__installPrompt = null;
      installBtn.hidden = true;
    });
  }

  loadLibraries()
    .then(() => {
      const meta = librariesMeta();
      const el = main.querySelector('#data-meta');
      if (el && meta.updatedAt) el.textContent = `도서관 목록 ${meta.updatedAt} 기준`;
    })
    .catch(() => {});
}

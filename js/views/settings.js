import { html, toMarkup } from '../util.js';
import { FONT_PX, applySettings, fontPxOf, icon, setTopbar, toast } from '../ui.js';
import * as store from '../store.js';
import { REGIONS } from '../regions.js';
import { CONFIG } from '../config.js';
import { isDemoMode } from '../api.js';
import { librariesMeta, loadLibraries } from '../libraries.js';
import { disablePush, pushStatus } from '../push.js';

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
        ${SIZES.map((x) => html`<button type="button" data-size="${x.id}" aria-pressed="${fontPxOf(s) === FONT_PX.presets[x.id] ? 'true' : 'false'}">${x.label}</button>`)}
      </div>
      <div class="size-slider">
        <span class="size-slider__a size-slider__a--s" aria-hidden="true">가</span>
        <label class="sr-only" for="font-px">글자 크기 직접 조절</label>
        <input type="range" id="font-px" min="${FONT_PX.min}" max="${FONT_PX.max}" step="1" value="${fontPxOf(s)}" aria-valuetext="${fontPxOf(s)}픽셀">
        <span class="size-slider__a size-slider__a--l" aria-hidden="true">가</span>
      </div>
      <p class="small muted">막대를 좌우로 끌면 바로 바뀌어요.</p>
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
      <p class="small muted">도서관 찾기, 더 넓게 찾기, 인기 도서에 써요.</p>
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
        ${pushStatus() !== 'off'
          ? html`<p>아침 알림을 켜면 알림 주소, 관심 도서 ISBN·제목, 도서관 코드가 알림 서버(Google Apps Script)에 저장돼요. 알림을 끄거나 모두 지우면 같이 지워지고, 90일 동안 안 열어도 지워져요.</p>`
          : ''}
        <p>책·도서관 정보는 <a href="https://www.data4library.kr/" target="_blank" rel="noopener noreferrer">도서관 정보나루</a> 공공데이터예요. 대출 정보는 하루 늦게 반영돼요.</p>
        <p class="small muted" id="data-meta"></p>
        <button class="btn" type="button" id="clear">${icon('trash')}<span>이 폰에 저장한 정보 모두 지우기</span></button>
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

  // 글자 크기: 단계 버튼과 막대가 서로 맞춰 움직인다
  const slider = main.querySelector('#font-px');
  const syncSize = (px) => {
    slider.value = String(px);
    slider.setAttribute('aria-valuetext', `${px}픽셀`);
    main.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(FONT_PX.presets[b.dataset.size] === px)));
  };
  main.querySelectorAll('[data-size]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const px = FONT_PX.presets[btn.dataset.size];
      update({ size: btn.dataset.size, fontPx: px });
      syncSize(px);
    }),
  );
  slider.addEventListener('input', () => {
    const px = Number(slider.value);
    update({ fontPx: px });
    syncSize(px);
  });
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

  // 실수로 지우지 않게 한 번 더 누르게 한다(브라우저 확인 창은 앱 안에서 막히는 곳이 있어 쓰지 않음).
  const clearBtn = main.querySelector('#clear');
  let armed = null;
  clearBtn.addEventListener('click', async () => {
    if (!armed) {
      clearBtn.classList.add('btn--danger');
      clearBtn.querySelector('span').textContent = '한 번 더 누르면 모두 지워요';
      armed = setTimeout(() => {
        armed = null;
        clearBtn.classList.remove('btn--danger');
        clearBtn.querySelector('span').textContent = '이 폰에 저장한 정보 모두 지우기';
      }, 5000);
      return;
    }
    clearTimeout(armed);
    clearBtn.disabled = true;
    if (store.settings.get().push) await disablePush();
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

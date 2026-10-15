import { debounce, formatDistance, html, objectParticle, toMarkup } from '../util.js';
import { backButton, errorNotice, icon, setTopbar, skeletonRows, toast } from '../ui.js';
import * as store from '../store.js';
import { getLibrary, librariesMeta, loadLibraries, nearbyLibraries, searchLibraries } from '../libraries.js';
import { REGIONS } from '../regions.js';
import { CONFIG } from '../config.js';

function safeBack(value) {
  return typeof value === 'string' && /^#\/[\w/?=&%.-]*$/.test(value) ? value : '';
}

export async function render({ main, query, signal }) {
  document.title = '내 도서관 — 책있나';
  const back = safeBack(query.get('back'));
  const max = store.myLibraries.max;

  const renderTopbar = () =>
    setTopbar(html`${backButton(back || '#/')}<h1 class="topbar__title">내 도서관</h1><span class="muted" style="font-weight:800;padding-right:0.6rem">${store.myLibraries.list().length}/${max}</span>`);
  renderTopbar();

  main.innerHTML = toMarkup(html`
    <p class="lead">자주 가는 도서관을 최대 ${max}곳까지 골라요. 이 목록은 내 폰에만 저장돼요.</p>
    ${back ? html`<a class="btn btn--primary btn--block" href="${back}" id="go-back">${icon('back')}고른 도서관으로 책 확인하기</a>` : ''}
    <section class="section" aria-labelledby="picked-h">
      <h2 class="h2" id="picked-h">고른 도서관</h2>
      <div class="stack" id="picked">${skeletonRows(1, '3.6rem')}</div>
    </section>
    <section class="section" aria-labelledby="add-h">
      <h2 class="h2" id="add-h">도서관 추가</h2>
      <button class="btn btn--outline btn--block" type="button" id="nearby">${icon('pin')}내 위치로 근처 도서관 찾기</button>
      <div class="field">
        <label class="field__label" for="lib-region">지역</label>
        <select class="input" id="lib-region"><option value="">전국</option>${REGIONS.map((r) => html`<option value="${r.code}">${r.name}</option>`)}</select>
      </div>
      <div class="field">
        <label class="field__label" for="lib-q">도서관 이름이나 동네</label>
        <input class="input" id="lib-q" type="search" autocomplete="off" placeholder="예: 중앙도서관, 안동">
      </div>
      <div id="found" aria-live="polite"></div>
    </section>
    <p class="footer-note" id="lib-meta"></p>`);

  const picked = main.querySelector('#picked');
  const found = main.querySelector('#found');
  const regionSel = main.querySelector('#lib-region');
  const input = main.querySelector('#lib-q');

  try {
    await loadLibraries();
  } catch (error) {
    if (!signal.aborted) picked.innerHTML = toMarkup(errorNotice(error));
    return;
  }
  if (signal.aborted) return;

  const meta = librariesMeta();
  main.querySelector('#lib-meta').textContent = `도서관 목록 출처: 도서관 정보나루${meta.updatedAt ? ` · ${meta.updatedAt} 기준` : ''}`;

  const settings = store.settings.get();
  regionSel.value = settings.region || CONFIG.defaultRegion;

  const renderPicked = () => {
    const list = store.myLibraries.list();
    picked.innerHTML = toMarkup(
      list.length
        ? list.map((code) => {
            const lib = getLibrary(code);
            return html`<div class="card card--soft" style="display:flex;align-items:center;gap:0.6rem;padding-right:0.3rem">
              <span class="row__body"><span class="row__title">${lib ? lib.name : code}</span><span class="row__sub">${lib ? lib.address : ''}</span></span>
              <button class="icon-btn" type="button" data-remove="${code}" aria-label="${lib ? lib.name : code} 빼기">${icon('close')}</button>
            </div>`;
          })
        : html`<p class="muted">아직 고른 도서관이 없어요. 아래에서 추가해 주세요.</p>`,
    );
    picked.querySelectorAll('[data-remove]').forEach((btn) =>
      btn.addEventListener('click', () => {
        store.myLibraries.remove(btn.dataset.remove);
        renderPicked();
        renderTopbar();
        refreshFoundButtons();
      }),
    );
  };

  const addButton = (code) => {
    const has = store.myLibraries.has(code);
    return html`<button class="btn btn--small" type="button" data-add="${code}" ${has ? 'disabled' : ''}>${has ? '추가됨' : '추가'}</button>`;
  };

  function refreshFoundButtons() {
    found.querySelectorAll('[data-add]').forEach((btn) => {
      const has = store.myLibraries.has(btn.dataset.add);
      btn.disabled = has;
      btn.textContent = has ? '추가됨' : '추가';
    });
  }

  const bindAdd = () =>
    found.querySelectorAll('[data-add]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const res = store.myLibraries.add(btn.dataset.add);
        if (!res.ok) {
          toast(`최대 ${max}곳까지 고를 수 있어요`);
          return;
        }
        const lib = getLibrary(btn.dataset.add);
        if (lib && lib.region && !store.settings.get().region) store.settings.set({ region: lib.region });
        toast(lib ? `${lib.name}${objectParticle(lib.name)} 추가했어요` : '도서관을 추가했어요');
        renderPicked();
        renderTopbar();
        refreshFoundButtons();
      }),
    );

  const showResults = (items, emptyText) => {
    found.innerHTML = toMarkup(
      items.length
        ? html`<ul class="list">${items.map(({ lib, km }) => html`<li class="row">
            <span class="row__body"><span class="row__title">${lib.name}</span><span class="row__sub">${lib.address}${Number.isFinite(km) ? ` · ${formatDistance(km)}` : ''}</span></span>
            ${addButton(lib.code)}
          </li>`)}</ul>`
        : html`<p class="muted">${emptyText}</p>`,
    );
    bindAdd();
  };

  const runSearch = () => {
    const q = input.value.trim();
    const results = searchLibraries(q, { region: regionSel.value, limit: 30 }).map((lib) => ({ lib }));
    showResults(results, '맞는 도서관이 없어요. 다른 이름으로 찾아보세요.');
  };
  input.addEventListener('input', debounce(runSearch, 200));
  regionSel.addEventListener('change', () => {
    store.settings.set({ region: regionSel.value || null });
    runSearch();
  });

  main.querySelector('#nearby').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('이 브라우저는 위치를 쓸 수 없어요');
      return;
    }
    found.innerHTML = toMarkup(skeletonRows(3, '3.6rem'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (signal.aborted) return;
        // 위치는 이 폰 안에서만 거리 계산에 쓰고 어디에도 보내거나 저장하지 않는다.
        const near = nearbyLibraries(pos.coords.latitude, pos.coords.longitude, { limit: 10 });
        showResults(near, '30km 안에 등록된 도서관이 없어요.');
      },
      () => {
        if (!signal.aborted) found.innerHTML = toMarkup(html`<p class="muted">위치를 가져오지 못했어요. 이름이나 지역으로 찾아 주세요.</p>`);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });

  renderPicked();
  runSearch();
}

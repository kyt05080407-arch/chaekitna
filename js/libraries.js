// 전국 도서관 목록(data/libraries.json)을 불러와 이름·지역 검색과 근처 찾기를 한다.
// 목록은 GitHub Actions가 매월 도서관 정보나루에서 새로 받아 저장한다.

import { haversineKm, isLibCode, normalizeText } from './util.js';

let loading = null;
let list = [];
let byCode = new Map();
let meta = { updatedAt: '', source: '' };

export function loadLibraries(fetchImpl = globalThis.fetch) {
  if (!loading) {
    loading = fetchImpl(new URL('../data/libraries.json', import.meta.url))
      .then((res) => {
        if (!res.ok) throw new Error(`도서관 목록을 불러오지 못했어요 (${res.status})`);
        return res.json();
      })
      .then((json) => {
        setLibraries(json);
        return list;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

// 테스트와 스크립트에서 직접 목록을 넣을 때도 쓴다.
export function setLibraries(json) {
  const items = Array.isArray(json) ? json : json && Array.isArray(json.libraries) ? json.libraries : [];
  list = items.filter((lib) => lib && isLibCode(lib.code));
  byCode = new Map(list.map((lib) => [lib.code, lib]));
  meta = { updatedAt: json?.updatedAt || '', source: json?.source || '' };
  list.forEach((lib) => {
    lib._key = normalizeText(lib.name);
    lib._addr = normalizeText(lib.address);
  });
  return list;
}

export function librariesMeta() {
  return meta;
}

export function getLibrary(code) {
  return byCode.get(code) || null;
}

export function librariesInRegion(region) {
  return list.filter((lib) => lib.region === region);
}

// 이름이 앞에서 맞는 것 > 이름에 포함 > 주소에 포함 순서
export function searchLibraries(query, { region = '', limit = 30 } = {}) {
  const q = normalizeText(query);
  const pool = region ? librariesInRegion(region) : list;
  if (!q) return pool.slice(0, limit);
  const scored = [];
  for (const lib of pool) {
    let score = 0;
    if (lib._key.startsWith(q)) score = 3;
    else if (lib._key.includes(q)) score = 2;
    else if (lib._addr.includes(q)) score = 1;
    if (score) scored.push({ lib, score });
  }
  scored.sort((a, b) => b.score - a.score || a.lib.name.localeCompare(b.lib.name, 'ko'));
  return scored.slice(0, limit).map((s) => s.lib);
}

export function nearbyLibraries(lat, lng, { limit = 10, maxKm = 30 } = {}) {
  return list
    .filter((lib) => Number.isFinite(lib.lat) && Number.isFinite(lib.lng))
    .map((lib) => ({ lib, km: haversineKm(lat, lng, lib.lat, lib.lng) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

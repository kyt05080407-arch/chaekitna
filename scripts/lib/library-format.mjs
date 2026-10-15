// data/libraries.json 한 항목의 모양을 맞춘다.
// 시드 데이터(오픈소스 목록)와 정보나루 libSrch 응답을 같은 모양으로 바꾼다.

import { regionFromAddress } from '../../js/regions.js';
import { decodeEntities, isLibCode } from '../../js/util.js';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 1e6) / 1e6 : null;
}

function text(value, max = 200) {
  const s = decodeEntities(value)
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s === '-' || s.toLowerCase() === 'null') return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function toLibraryEntry(raw) {
  const code = String(raw.libCode ?? raw.code ?? '').trim();
  if (!isLibCode(code)) return null;
  const address = text(raw.address, 120);
  return {
    code,
    name: text(raw.libName ?? raw.name, 60),
    region: regionFromAddress(address),
    address,
    tel: text(raw.tel, 20),
    homepage: text(raw.homepage, 160),
    lat: num(raw.latitude ?? raw.lat),
    lng: num(raw.longitude ?? raw.lng),
    hours: text(raw.operatingTime ?? raw.open_hours ?? raw.hours, 160),
    closed: text(raw.closed ?? raw.closed_info, 160),
  };
}

export function buildLibrariesFile(entries, { source, updatedAt }) {
  const seen = new Set();
  const libraries = [];
  for (const raw of entries) {
    const entry = toLibraryEntry(raw);
    if (!entry || !entry.name || seen.has(entry.code)) continue;
    seen.add(entry.code);
    libraries.push(entry);
  }
  libraries.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name, 'ko'));
  return { version: 1, source, updatedAt, count: libraries.length, libraries };
}

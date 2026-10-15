// 화면과 Node 스크립트가 함께 쓰는 작은 도구 모음 (순수 함수)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// html`...` 템플릿: 끼워 넣는 값은 모두 이스케이프한다.
// 이미 안전한 HTML 조각은 raw()로 감싸서 넘긴다.
const RAW = Symbol('raw');

export function raw(markup) {
  return { [RAW]: true, value: String(markup ?? '') };
}

function renderValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (typeof value === 'object' && value[RAW]) return value.value;
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((chunk, i) => {
    out += chunk;
    if (i < values.length) out += renderValue(values[i]);
  });
  return raw(out);
}

export function toMarkup(fragment) {
  return renderValue(fragment);
}

// ---------- ISBN ----------

export function cleanIsbn(input) {
  return String(input ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn13(isbn) {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

export function isValidIsbn10(isbn) {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const v = isbn[i] === 'X' ? 10 : Number(isbn[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isbn10To13(isbn10) {
  const core = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

// 사람이 입력한 값이 ISBN이면 13자리로 바꿔 돌려주고, 아니면 null
export function toIsbn13(input) {
  const v = cleanIsbn(input);
  if (isValidIsbn13(v)) return v;
  if (isValidIsbn10(v)) return isbn10To13(v);
  return null;
}

// 정보나루 도서관 코드는 대부분 6자리지만 5자리·8자리도 있다.
export function isLibCode(code) {
  return typeof code === 'string' && /^\d{4,10}$/.test(code);
}

// ---------- 날짜 (한국 시간 기준) ----------

const KST_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
});

export function kstParts(date = new Date()) {
  const parts = Object.fromEntries(KST_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), h: Number(parts.hour) % 24 };
}

export function kstDateString(date = new Date()) {
  const { y, m, d } = kstParts(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 정보나루 대출가능 정보는 전날 기준이다. "10월 14일 기준" 같은 문구를 만든다.
export function basisLabel(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { m, d } = kstParts(yesterday);
  return `${m}월 ${d}일 기준`;
}

// 다음 한국 시간 오전 hour시의 시각(ms). 대출가능 캐시 만료에 쓴다.
export function nextKstHour(now = new Date(), hour = 9) {
  const { y, m, d, h } = kstParts(now);
  // KST = UTC+9, 서머타임 없음
  let target = Date.UTC(y, m - 1, d, hour - 9, 0, 0);
  if (h >= hour) target += 24 * 60 * 60 * 1000;
  return target;
}

// ---------- 거리 ----------

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)}km`;
}

// ---------- 텍스트 ----------

// 검색 비교용: 소문자, 공백·가운뎃점·특수문자 제거
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\s·.,()\-_/]+/g, '');
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// http 표지 주소를 https로 바꾸고, 이상한 주소는 버린다.
export function safeImageUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const u = new URL(url.replace(/^http:\/\//i, 'https://'));
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function safeHttpUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  let candidate = url.trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function telHref(tel) {
  const digits = String(tel ?? '').replace(/[^0-9+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : '';
}

// 웹 푸시 공개 키(base64url)를 PushManager가 받는 바이트 배열로
export function urlBase64ToUint8Array(base64url) {
  const padded = String(base64url || '').replace(/-/g, '+').replace(/_/g, '/');
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 받침에 따라 을/를을 고른다. 판단할 수 없으면 '을(를)'.
const DIGIT_HAS_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
export function objectParticle(word) {
  const text = String(word ?? '').replace(/[\s'"’”」』)\]>.,!?·~-]+$/u, '');
  const last = text.slice(-1);
  if (!last) return '을(를)';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? '을' : '를';
  if (/\d/.test(last)) return DIGIT_HAS_BATCHIM[last] ? '을' : '를';
  return '을(를)';
}

// 받침에 따라 이/가를 고른다. 판단할 수 없으면 '이(가)'.
export function subjectParticle(word) {
  const p = objectParticle(word);
  if (p === '을') return '이';
  if (p === '를') return '가';
  return '이(가)';
}

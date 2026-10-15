// 도서관 정보나루 응답(JSON)을 화면에서 쓰기 좋은 모양으로 바꾼다.
// 응답은 { response: { docs: [{ doc: {...} }] } } 처럼 한 겹 더 싸여 오기도 하고
// 바로 객체로 오기도 해서, 두 경우를 모두 받아준다.

import { isLibCode } from './util.js';

function body(resp) {
  if (resp && typeof resp === 'object' && resp.response && typeof resp.response === 'object') {
    return resp.response;
  }
  return resp && typeof resp === 'object' ? resp : {};
}

export function apiError(resp) {
  const b = body(resp);
  if (typeof b.error === 'string' && b.error) return b.error;
  if (b.error && typeof b.error === 'object') return b.error.message || 'error';
  return null;
}

function unwrap(list, key) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (item && typeof item === 'object' && item[key] && typeof item[key] === 'object' ? item[key] : item))
    .filter((item) => item && typeof item === 'object');
}

export function yn(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    if (v === 'Y' || v === 'TRUE') return true;
    if (v === 'N' || v === 'FALSE') return false;
  }
  return null;
}

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "지은이: 홍길동 ; 옮긴이: 김철수" → "홍길동, 김철수"
export function cleanAuthors(value) {
  if (typeof value !== 'string') return '';
  return value
    .split(/[;|]/)
    .map((part) => part.replace(/^[^:]{1,12}:\s*/, '').replace(/\s*\[?(지은이|지음|저|글|그림|옮긴이|옮김|역|엮음|편저|편)\]?\s*$/u, '').trim())
    .filter(Boolean)
    .join(', ');
}

export function cleanTitle(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeBook(doc) {
  const isbn13 = String(doc.isbn13 ?? '').replace(/[^0-9]/g, '');
  return {
    isbn13,
    title: cleanTitle(doc.bookname ?? doc.title ?? ''),
    authors: cleanAuthors(doc.authors ?? doc.author ?? ''),
    publisher: String(doc.publisher ?? '').trim(),
    year: String(doc.publication_year ?? doc.publicationYear ?? '').trim(),
    cover: String(doc.bookImageURL ?? doc.bookImageUrl ?? '').trim(),
    loanCount: toNumber(doc.loan_count ?? doc.loanCnt),
    rank: toNumber(doc.ranking ?? doc.no),
    description: String(doc.description ?? '').trim(),
  };
}

export function parseBooks(resp) {
  const b = body(resp);
  const docs = unwrap(b.docs, 'doc');
  const books = docs.map(normalizeBook).filter((book) => book.title);
  const total = toNumber(b.numFound ?? b.resultNum ?? b.total) ?? books.length;
  return { total, books };
}

export function parseBookDetail(resp) {
  const b = body(resp);
  const detail = Array.isArray(b.detail) ? unwrap(b.detail, 'book')[0] : (b.detail && b.detail.book) || b.book || null;
  return detail ? normalizeBook(detail) : null;
}

function normalizeLibrary(lib) {
  const lat = toNumber(lib.latitude);
  const lng = toNumber(lib.longitude);
  return {
    code: String(lib.libCode ?? lib.code ?? '').trim(),
    name: String(lib.libName ?? lib.name ?? '').trim(),
    address: String(lib.address ?? '').trim(),
    tel: String(lib.tel ?? '').trim(),
    homepage: String(lib.homepage ?? '').trim(),
    lat: lat && lat !== 0 ? lat : null,
    lng: lng && lng !== 0 ? lng : null,
    hours: String(lib.operatingTime ?? lib.open_hours ?? '').trim(),
    closed: String(lib.closed ?? lib.closed_info ?? '').trim(),
  };
}

export function parseLibraries(resp) {
  const b = body(resp);
  const libs = unwrap(b.libs, 'lib').map(normalizeLibrary).filter((lib) => isLibCode(lib.code));
  const total = toNumber(b.numFound ?? b.resultNum) ?? libs.length;
  return { total, libraries: libs };
}

export function parseExist(resp) {
  const b = body(resp);
  const result = b.result && typeof b.result === 'object' ? b.result : b;
  return {
    hasBook: yn(result.hasBook),
    loanAvailable: yn(result.loanAvailable),
  };
}

// 한 도서관의 상태를 화면용 한 단어로
export function statusOf(exist) {
  if (!exist || exist.hasBook === null) return 'unknown';
  if (exist.hasBook === false) return 'none';
  if (exist.loanAvailable === true) return 'available';
  if (exist.loanAvailable === false) return 'loaned';
  return 'unknown';
}

export const STATUS_LABEL = {
  available: '대출 가능',
  loaned: '대출 중',
  none: '소장 안 함',
  unknown: '확인 못 함',
};

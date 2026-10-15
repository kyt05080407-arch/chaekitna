// 데모 모드용 예시 데이터. 프록시가 연결되기 전에도 화면 흐름을 확인할 수 있게 한다.
// 화면에는 항상 "예시 데이터" 표시가 함께 나온다. 대출 상태는 실제가 아니다.

const BOOKS = [
  ['어린 왕자', '앙투안 드 생텍쥐페리'],
  ['데미안', '헤르만 헤세'],
  ['노인과 바다', '어니스트 헤밍웨이'],
  ['동물농장', '조지 오웰'],
  ['변신', '프란츠 카프카'],
  ['오만과 편견', '제인 오스틴'],
  ['운수 좋은 날', '현진건'],
  ['메밀꽃 필 무렵', '이효석'],
  ['진달래꽃', '김소월'],
  ['1984', '조지 오웰'],
].map(([title, authors], i) => ({
  // 000으로 시작하는 13자리: 실제 ISBN(978/979)과 절대 겹치지 않는 예시 번호
  isbn13: `000000000${String(i + 1).padStart(4, '0')}`,
  title,
  authors,
  publisher: '예시 출판사',
  year: '',
  cover: '',
  loanCount: null,
  rank: i + 1,
  description: '',
}));

export function isDemoIsbn(isbn13) {
  return typeof isbn13 === 'string' && isbn13.startsWith('000000000');
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function searchBooks(query) {
  const q = String(query || '').replace(/\s+/g, '');
  const books = q ? BOOKS.filter((b) => (b.title + b.authors).replace(/\s+/g, '').includes(q)) : BOOKS;
  return { total: books.length, books: books.length ? books : BOOKS.slice(0, 5), matched: books.length > 0 };
}

export function bookByIsbn(isbn13) {
  return BOOKS.find((b) => b.isbn13 === isbn13) || null;
}

export function existFor(isbn13, libCode) {
  const h = hash(`${isbn13}:${libCode}`);
  const hasBook = h % 10 < 8;
  return { hasBook, loanAvailable: hasBook ? h % 3 !== 0 : null };
}

// 지역 안에서 이 책을 가진 도서관 코드 목록(예시)
export function holdingsFor(isbn13, libraries) {
  return libraries.filter((lib) => existFor(isbn13, lib.code).hasBook).slice(0, 12).map((lib) => lib.code);
}

export function popular() {
  return {
    demo: true,
    title: '예시 인기 도서',
    period: '',
    items: BOOKS.slice(0, 10),
  };
}

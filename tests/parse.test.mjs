import test from 'node:test';
import assert from 'node:assert/strict';
import { apiError, cleanAuthors, parseBookDetail, parseBooks, parseExist, parseLibraries, statusOf, yn } from '../js/parse.js';

test('책 검색 응답: doc으로 한 겹 싸인 목록', () => {
  const resp = {
    response: {
      numFound: 2,
      docs: [
        { doc: { bookname: '역사의 역사', authors: '지은이: 유시민', publisher: '돌베개', publication_year: '2018', isbn13: '9788971998557', loan_count: '1,234' } },
        { doc: { bookname: '  두   번째 ', authors: '', isbn13: '9788971998558' } },
      ],
    },
  };
  const { total, books } = parseBooks(resp);
  assert.equal(total, 2);
  assert.equal(books[0].title, '역사의 역사');
  assert.equal(books[0].authors, '유시민');
  assert.equal(books[0].loanCount, 1234);
  assert.equal(books[1].title, '두 번째');
});

test('책 검색 응답: resultNum과 감싸지 않은 목록도 받는다', () => {
  const { total, books } = parseBooks({ response: { resultNum: 1, docs: [{ bookname: 'A', isbn13: '1' }] } });
  assert.equal(total, 1);
  assert.equal(books[0].title, 'A');
});

test('빈 응답과 오류 응답', () => {
  assert.deepEqual(parseBooks({}), { total: 0, books: [] });
  assert.equal(apiError({ response: { error: '인증키 오류' } }), '인증키 오류');
  assert.equal(apiError({ response: { docs: [] } }), null);
});

test('저자 표기 정리', () => {
  assert.equal(cleanAuthors('지은이: 헤르만 헤세 ; 옮긴이: 전영애'), '헤르만 헤세, 전영애');
  assert.equal(cleanAuthors('김소월 지음'), '김소월');
});

test('소장·대출가능 응답 (Y/N)', () => {
  assert.deepEqual(parseExist({ response: { result: { hasBook: 'Y', loanAvailable: 'N' } } }), { hasBook: true, loanAvailable: false });
  assert.deepEqual(parseExist({ response: { result: { hasBook: 'N', loanAvailable: 'N' } } }), { hasBook: false, loanAvailable: false });
  assert.deepEqual(parseExist({}), { hasBook: null, loanAvailable: null });
  assert.equal(yn('y'), true);
  assert.equal(yn(''), null);
});

test('상태 한 단어로', () => {
  assert.equal(statusOf({ hasBook: true, loanAvailable: true }), 'available');
  assert.equal(statusOf({ hasBook: true, loanAvailable: false }), 'loaned');
  assert.equal(statusOf({ hasBook: false, loanAvailable: false }), 'none');
  assert.equal(statusOf({ hasBook: null, loanAvailable: null }), 'unknown');
  assert.equal(statusOf(undefined), 'unknown');
});

test('소장 도서관 응답', () => {
  const resp = {
    response: {
      numFound: 2,
      libs: [
        { lib: { libCode: '147168', libName: '경북도서관', address: '경상북도 예천군', tel: '054-650-3900', latitude: '36.57', longitude: '128.48' } },
        { lib: { libCode: 'bad', libName: '잘못된 코드' } },
      ],
    },
  };
  const { libraries } = parseLibraries(resp);
  assert.equal(libraries.length, 1);
  assert.equal(libraries[0].code, '147168');
  assert.equal(libraries[0].lat, 36.57);
});

test('책 상세 응답', () => {
  const book = parseBookDetail({ response: { detail: [{ book: { bookname: '데미안', authors: '헤르만 헤세 지음', isbn13: '9788937460449' } }] } });
  assert.equal(book.title, '데미안');
  assert.equal(book.authors, '헤르만 헤세');
  assert.equal(parseBookDetail({ response: {} }), null);
});

// 정보나루 실제 응답이 앱이 기대하는 모양인지 한 번에 확인한다 (인증키 승인 직후 한 번 돌려 보기)
// 사용: D4L_AUTH_KEY=인증키 npm run check:api   또는 GitHub Actions의 'API check'를 직접 실행
// 호출 수: 6번 (검색, 상세, 도서관 목록, 소장 도서관, 대출 가능 여부, 인기 대출)

import { callApi, kstDate } from './lib/d4l.mjs';
import { parseBookDetail, parseBooks, parseExist, parseLibraries } from '../js/parse.js';
import { isLibCode } from '../js/util.js';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '통과' : '실패'} · ${name}${detail ? ` · ${detail}` : ''}`);
}

async function step(name, fn) {
  try {
    return await fn();
  } catch (error) {
    check(name, false, error.message);
    return null;
  }
}

const REGION = process.env.CHECK_REGION || '37';

// 1) 책 검색 (대출 많은 순)
const search = await step('책 검색 srchBooks', async () => {
  const data = await callApi('srchBooks', { keyword: '데미안', pageNo: 1, pageSize: 5, sort: 'loan', order: 'desc' });
  const { total, books } = parseBooks(data);
  const good = books.filter((b) => b.title && /^\d{13}$/.test(b.isbn13));
  check('책 검색 srchBooks', good.length > 0, `전체 ${total}권 중 ${books.length}권 받음, 첫 책: ${books[0] ? books[0].title : '없음'}`);
  return good[0] || null;
});

const isbn = search ? search.isbn13 : '9788937460449';

// 2) 책 상세
await step('책 상세 srchDtlList', async () => {
  const book = parseBookDetail(await callApi('srchDtlList', { isbn13: isbn, loaninfoYN: 'N' }));
  check('책 상세 srchDtlList', book && book.title, book ? `${book.title} · 소개 ${book.description ? `${book.description.length}자` : '없음'}` : '없음');
});

// 3) 도서관 목록
await step('도서관 목록 libSrch', async () => {
  const { total, libraries } = parseLibraries(await callApi('libSrch', { region: REGION, pageNo: 1, pageSize: 3 }));
  check('도서관 목록 libSrch', libraries.length && libraries.every((l) => isLibCode(l.code) && l.name), `지역 ${REGION} 전체 ${total}곳, 예: ${libraries[0] ? libraries[0].name : '없음'}`);
});

// 4) 이 책을 가진 도서관
const holder = await step('소장 도서관 libSrchByBook', async () => {
  const { libraries } = parseLibraries(await callApi('libSrchByBook', { isbn, region: REGION, pageNo: 1, pageSize: 10 }));
  check('소장 도서관 libSrchByBook', libraries.length > 0, `${libraries.length}곳, 예: ${libraries[0] ? libraries[0].name : '없음'}`);
  return libraries[0] || null;
});

// 5) 대출 가능 여부
if (holder) {
  await step('대출 가능 bookExist', async () => {
    const exist = parseExist(await callApi('bookExist', { libCode: holder.code, isbn13: isbn }));
    check('대출 가능 bookExist', exist.hasBook !== null, `${holder.name}: 소장 ${exist.hasBook ? '예' : '아니오'}, 대출 가능 ${exist.loanAvailable === null ? '모름' : exist.loanAvailable ? '예' : '아니오'}`);
  });
} else {
  check('대출 가능 bookExist', false, '소장 도서관을 못 찾아 건너뜀');
}

// 6) 인기 대출 도서
await step('인기 대출 loanItemSrch', async () => {
  const { books } = parseBooks(await callApi('loanItemSrch', { startDt: kstDate(-7), endDt: kstDate(-1), region: REGION, age: 'a17', pageNo: 1, pageSize: 5 }));
  check('인기 대출 loanItemSrch', books.length > 0, `${books.length}권, 1위: ${books[0] ? books[0].title : '없음'}`);
});

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length}개 실패. 위 내용을 Claude에게 알려 주세요.` : '\n모두 통과했어요. 앱이 실제 데이터로 동작할 준비가 됐어요.');
process.exitCode = failed.length ? 1 : 0;

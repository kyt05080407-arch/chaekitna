// node --import 로 먼저 불러 globalThis.fetch를 가짜로 바꾼다. 스크립트 테스트용.
// MOCK_SCENARIO 환경변수로 응답 모양을 고른다.

const scenario = process.env.MOCK_SCENARIO || 'ok';
const calls = [];

function popularDocs(count) {
  return Array.from({ length: count }, (_, i) => ({
    doc: {
      no: i + 1,
      ranking: String(i + 1),
      bookname: `테스트 책 ${i + 1}`,
      authors: `지은이: 저자${i + 1}`,
      publisher: '테스트 출판사',
      publication_year: '2025',
      isbn13: `97911000000${String(i).padStart(2, '0')}`,
      loan_count: String(100 - i),
      bookImageURL: 'http://image.example.com/c.jpg',
    },
  }));
}

function libs(page, size, total) {
  const start = (page - 1) * size;
  const n = Math.max(0, Math.min(size, total - start));
  return Array.from({ length: n }, (_, i) => ({
    lib: {
      libCode: String(100000 + start + i),
      libName: `테스트 도서관 ${start + i}`,
      address: i % 2 ? '경상북도 안동시 어딘가' : '서울특별시 중구 어딘가',
      tel: '054-000-0000',
      latitude: '36.5',
      longitude: '128.7',
      operatingTime: '09:00~18:00',
      closed: '월요일&middot;공휴일',
    },
  }));
}

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  calls.push(url.pathname + url.search.replace(/authKey=[^&]*/, 'authKey=***'));
  const ep = url.pathname.split('/').pop();
  let body;
  if (url.searchParams.get('op') === 'health') {
    // 프록시 점검(healthcheck.mjs)용 응답
    body = {
      ok: true,
      date: '2026-10-15',
      keyConfigured: scenario !== 'health-nokey',
      used: 12,
      limit: 450,
      stats: {},
      yesterday: { date: '2026-10-14', used: scenario === 'health-busy' ? 430 : 120, stats: { search: 40, exist: 70 } },
      subscriptions: 0,
    };
  } else if (ep === 'loanItemSrch') {
    const age = url.searchParams.get('age');
    const region = url.searchParams.get('region');
    if (scenario === 'sparse' && region && age === 'a17') body = { response: { docs: popularDocs(2) } };
    else body = { response: { numFound: 10, docs: popularDocs(10) } };
  } else if (ep === 'libSrch') {
    const page = Number(url.searchParams.get('pageNo'));
    const size = Number(url.searchParams.get('pageSize'));
    const total = scenario === 'few-libs' ? 300 : 1500;
    body = { response: { numFound: total, libs: libs(page, size, total) } };
  } else {
    body = { response: { error: 'unknown endpoint' } };
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

process.on('exit', () => {
  if (process.env.MOCK_LOG) console.log(`MOCK_CALLS ${JSON.stringify(calls)}`);
});

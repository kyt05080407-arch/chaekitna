import test from 'node:test';
import assert from 'node:assert/strict';
import { opacKeys, searchUrl } from '../js/opac.js';

const T = {
  'lib.junggu.ulsan.kr': 'https://lib.junggu.ulsan.kr/lib/unit/search/list.do?mId=1&search_txt={q}',
  'lib.ice.go.kr/gyeyang': 'https://lib.ice.go.kr/gyeyang/intro/search/index.do?search_text={q}',
  'library.gyeongju.go.kr': 'http://library.gyeongju.go.kr/?page_id=search_booklist&search_txt={q}',
  'bad.example': 'javascript:alert(1){q}',
};

test('홈페이지 주소로 찾는 열쇠: 호스트/첫 경로 → 호스트', () => {
  assert.deepEqual(opacKeys('https://lib.ice.go.kr/bupyeong/'), ['lib.ice.go.kr/bupyeong', 'lib.ice.go.kr']);
  assert.deepEqual(opacKeys('http://www.Library.gyeongju.go.kr'), ['library.gyeongju.go.kr']);
  assert.deepEqual(opacKeys('http://library.daegu.go.kr/228lib/index.do'), ['library.daegu.go.kr/228lib', 'library.daegu.go.kr']);
  assert.deepEqual(opacKeys('https://lib.gimhae.go.kr/01293/01298/00116.web'), ['lib.gimhae.go.kr/01293', 'lib.gimhae.go.kr']);
  assert.deepEqual(opacKeys('https://x.kr/index.do'), ['x.kr']);
  assert.deepEqual(opacKeys(''), []);
});

test('바로 찾기 주소: 제목을 넣고, 같은 호스트의 다른 사이트에는 쓰지 않는다', () => {
  assert.equal(searchUrl(T, { homepage: 'https://lib.junggu.ulsan.kr' }, '데미안'), `https://lib.junggu.ulsan.kr/lib/unit/search/list.do?mId=1&search_txt=${encodeURIComponent('데미안')}`);
  assert.match(searchUrl(T, { homepage: 'https://lib.ice.go.kr/gyeyang/index.do' }, '모순'), /^https:\/\/lib\.ice\.go\.kr\/gyeyang\/.*search_text=%EB%AA%A8%EC%88%9C$/);
  assert.equal(searchUrl(T, { homepage: 'https://lib.ice.go.kr/bupyeong/' }, '모순'), '', '계양 주소를 부평에 쓰지 않는다');
  assert.match(searchUrl(T, { homepage: 'http://library.gyeongju.go.kr' }, '혼모노 & 기타'), /^http:\/\/library\.gyeongju\.go\.kr\/.*search_txt=%ED%98%BC%EB%AA%A8%EB%85%B8%20%26%20%EA%B8%B0%ED%83%80$/);
  assert.equal(searchUrl(T, { homepage: 'https://bad.example' }, '책'), '', 'http(s)가 아닌 주소는 쓰지 않는다');
  assert.equal(searchUrl(T, { homepage: 'https://unknown.kr' }, '책'), '');
  assert.equal(searchUrl(T, { homepage: 'https://lib.junggu.ulsan.kr' }, ''), '');
  assert.equal(searchUrl(T, null, '책'), '');
});

test('요청서(POST) 방식: 제목을 채운 검색 요청서를 만든다', async () => {
  const { searchTarget } = await import('../js/opac.js');
  const T2 = {
    'lib.example.kr': { method: 'post', action: 'https://lib.example.kr/search/result.do', fields: { mode: 'simple', searchWord: '{q}' }, charset: 'EUC-KR' },
    'nofield.kr': { method: 'post', action: 'https://nofield.kr/s', fields: { a: 'b' } },
    'js.kr': { method: 'post', action: 'javascript:void(0)', fields: { q: '{q}' } },
    'get.kr': 'https://get.kr/s?q={q}',
  };
  assert.deepEqual(searchTarget(T2, { homepage: 'https://www.lib.example.kr/' }, '모순'), {
    kind: 'post',
    action: 'https://lib.example.kr/search/result.do',
    fields: { mode: 'simple', searchWord: '모순' },
    charset: 'EUC-KR',
  });
  assert.equal(searchTarget(T2, { homepage: 'https://nofield.kr' }, '모순'), null, '검색어 칸이 없으면 쓰지 않는다');
  assert.equal(searchTarget(T2, { homepage: 'https://js.kr' }, '모순'), null);
  assert.deepEqual(searchTarget(T2, { homepage: 'https://get.kr' }, '모순'), { kind: 'get', href: `https://get.kr/s?q=${encodeURIComponent('모순')}` });
});

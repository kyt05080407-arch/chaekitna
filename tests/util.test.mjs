import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basisLabel,
  escapeHtml,
  formatDistance,
  haversineKm,
  html,
  isLibCode,
  isValidIsbn10,
  isValidIsbn13,
  nextKstHour,
  normalizeText,
  safeHttpUrl,
  safeImageUrl,
  telHref,
  toIsbn13,
  toMarkup,
} from '../js/util.js';

test('html 템플릿은 끼워 넣는 값을 이스케이프한다', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const out = toMarkup(html`<p>${evil}</p>`);
  assert.equal(out, '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});

test('html 템플릿 안에 html 조각과 배열을 넣을 수 있다', () => {
  const items = ['a', '<b>'];
  const out = toMarkup(html`<ul>${items.map((x) => html`<li>${x}</li>`)}</ul>`);
  assert.equal(out, '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
});

test('ISBN 검사와 변환', () => {
  assert.equal(isValidIsbn13('9788971998557'), true);
  assert.equal(isValidIsbn13('9788971998558'), false);
  assert.equal(isValidIsbn10('8971998555'), true);
  assert.equal(toIsbn13('89-7199-855-5'), '9788971998557');
  assert.equal(toIsbn13('978-89-7199-855-7'), '9788971998557');
  assert.equal(toIsbn13('데미안'), null);
});

test('도서관 코드는 4~10자리 숫자', () => {
  assert.equal(isLibCode('147168'), true);
  assert.equal(isLibCode('50001'), true);
  assert.equal(isLibCode('11134706'), true);
  assert.equal(isLibCode('12'), false);
  assert.equal(isLibCode('12a456'), false);
  assert.equal(isLibCode(147168), false);
});

test('기준 날짜는 한국 시간으로 하루 전', () => {
  // 2026-10-15 00:30 KST = 2026-10-14 15:30 UTC
  assert.equal(basisLabel(new Date('2026-10-14T15:30:00Z')), '10월 14일 기준');
  // 2026-10-15 23:59 KST
  assert.equal(basisLabel(new Date('2026-10-15T14:59:00Z')), '10월 14일 기준');
});

test('다음 오전 9시(한국 시간) 계산', () => {
  // 10/15 08:00 KST → 같은 날 09:00 KST
  assert.equal(nextKstHour(new Date('2026-10-14T23:00:00Z'), 9), Date.parse('2026-10-15T00:00:00Z'));
  // 10/15 10:00 KST → 다음 날 09:00 KST
  assert.equal(nextKstHour(new Date('2026-10-15T01:00:00Z'), 9), Date.parse('2026-10-16T00:00:00Z'));
});

test('거리 계산과 표시', () => {
  const km = haversineKm(37.5665, 126.978, 35.1796, 129.0756); // 서울-부산
  assert.ok(km > 320 && km < 330, `서울-부산 ${km}`);
  assert.equal(formatDistance(0.45), '450m');
  assert.equal(formatDistance(3.24), '3.2km');
  assert.equal(formatDistance(14.6), '15km');
});

test('검색용 텍스트 정규화', () => {
  assert.equal(normalizeText(' 경북 도서관 '), '경북도서관');
  assert.equal(normalizeText('안동·중앙(분관)'), '안동중앙분관');
});

test('주소 안전 처리', () => {
  assert.equal(safeImageUrl('http://image.aladin.co.kr/a.jpg'), 'https://image.aladin.co.kr/a.jpg');
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('lib.example.kr'), 'http://lib.example.kr/');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(telHref('054-650-3900'), 'tel:0546503900');
  assert.equal(telHref('-'), '');
});

test('웹 푸시 공개 키 변환', async () => {
  const { urlBase64ToUint8Array } = await import('../js/util.js');
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255]);
  assert.equal(urlBase64ToUint8Array('').length, 0);
});

test('을/를 고르기', async () => {
  const { objectParticle } = await import('../js/util.js');
  assert.equal(objectParticle('데미안'), '을');
  assert.equal(objectParticle('어린 왕자'), '를');
  assert.equal(objectParticle("'데미안'"), '을');
  assert.equal(objectParticle('해리 포터 2'), '를');
  assert.equal(objectParticle('1984'), '를');
  assert.equal(objectParticle('총, 균, 쇠 (개정판)'), '을');
  assert.equal(objectParticle('Harry Potter'), '을(를)');
  assert.equal(objectParticle(''), '을(를)');
});

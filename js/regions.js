// 도서관 정보나루 시·도 지역 코드 (region 파라미터)
// 브라우저와 Node 스크립트가 함께 쓰는 순수 모듈이다.

export const REGIONS = [
  { code: '11', name: '서울특별시', short: '서울' },
  { code: '21', name: '부산광역시', short: '부산' },
  { code: '22', name: '대구광역시', short: '대구' },
  { code: '23', name: '인천광역시', short: '인천' },
  { code: '24', name: '광주광역시', short: '광주' },
  { code: '25', name: '대전광역시', short: '대전' },
  { code: '26', name: '울산광역시', short: '울산' },
  { code: '29', name: '세종특별자치시', short: '세종' },
  { code: '31', name: '경기도', short: '경기' },
  { code: '32', name: '강원특별자치도', short: '강원', aliases: ['강원도'] },
  { code: '33', name: '충청북도', short: '충북' },
  { code: '34', name: '충청남도', short: '충남' },
  { code: '35', name: '전북특별자치도', short: '전북', aliases: ['전라북도'] },
  { code: '36', name: '전라남도', short: '전남' },
  { code: '37', name: '경상북도', short: '경북' },
  { code: '38', name: '경상남도', short: '경남' },
  { code: '39', name: '제주특별자치도', short: '제주', aliases: ['제주도'] },
];

const BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));

export function regionByCode(code) {
  return BY_CODE.get(String(code)) || null;
}

export function isRegionCode(code) {
  return BY_CODE.has(String(code));
}

// 주소의 첫 단어(시·도 이름)로 지역 코드를 찾는다. 못 찾으면 ''.
export function regionFromAddress(address) {
  if (typeof address !== 'string') return '';
  const first = address.trim().split(/\s+/)[0] || '';
  if (!first) return '';
  for (const r of REGIONS) {
    if (first === r.name || first === r.short) return r.code;
    if (r.aliases && r.aliases.includes(first)) return r.code;
  }
  // "서울시", "경북" 같은 줄임 표기
  for (const r of REGIONS) {
    if (first.startsWith(r.short)) return r.code;
  }
  return '';
}

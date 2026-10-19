// 오늘 어디 갈까: 관심 도서 상태(어제 기준)로 내 도서관마다 빌릴 수 있는 책을 세어 순서를 정한다.
// 순서: 오늘 문을 여는 곳 먼저 → 빌릴 수 있는 책이 많은 곳 → 내 도서관 순서

/**
 * @param {{isbn13:string,title:string,last?:Record<string,string>}[]} books 관심 도서
 * @param {string[]} mine 내 도서관 코드
 * @param {(code:string)=>any} getLib 도서관 정보 찾기
 * @param {(closed:string)=>boolean} isClosedToday 오늘 정기 휴관인지
 */
export function todayPlan(books, mine, getLib, isClosedToday) {
  const plan = mine.map((code, order) => {
    const lib = getLib(code);
    const available = books.filter((b) => b.last && b.last[code] === 'available');
    return {
      code,
      order,
      name: lib ? lib.name : `도서관 ${code}`,
      lib,
      available,
      closed: Boolean(lib && lib.closed && isClosedToday(lib.closed)),
    };
  });
  return plan.sort((a, b) => a.closed - b.closed || b.available.length - a.available.length || a.order - b.order);
}

// 아직 한 번도 확인하지 않은 관심 도서 수
export function uncheckedCount(books, mine) {
  return books.filter((b) => !b.last || !mine.some((code) => code in b.last)).length;
}

// 로딩 화면과 화면을 불러오는 동안 보여 주는 읽을거리: 책 명언, 독서·도서관 정보, 이번 주 1위 책
// 명언은 저작권 보호 기간이 끝난 글만 골라 직접 옮겼다(번역도 이 앱에서 새로 함).

import { objectParticle, subjectParticle } from './util.js';

export const QUOTES = [
  { text: '하루라도 책을 읽지 않으면 입안에 가시가 돋는다.', who: '안중근', where: '1910년 옥중 유묵 「一日不讀書 口中生荊棘」' },
  { text: '좋은 책을 읽는 것은 지난 시대의 가장 훌륭한 사람들과 이야기를 나누는 것과 같다.', who: '르네 데카르트', where: '『방법서설』(1637)' },
  { text: '독서는 충실한 사람을, 대화는 준비된 사람을, 글쓰기는 정확한 사람을 만든다.', who: '프랜시스 베이컨', where: '「학문에 대하여」(1625)' },
  { text: '어떤 책은 맛만 보고, 어떤 책은 삼키고, 몇몇 책은 꼭꼭 씹어 소화해야 한다.', who: '프랜시스 베이컨', where: '「학문에 대하여」(1625)' },
  { text: '만 권의 책을 읽으면 붓을 들 때 신이 들린 듯하다.', who: '두보', where: '「위좌승 어른께 드리는 시」' },
  { text: '배우기만 하고 생각하지 않으면 어둡고, 생각만 하고 배우지 않으면 위태롭다.', who: '공자', where: '『논어』 위정편' },
  { text: '책만 한 배는 없다. 우리를 먼 나라로 데려가는.', who: '에밀리 디킨슨', where: '「책만 한 배는 없다」' },
  { text: '책을 읽을 때는 마음과 눈과 입이 함께 가야 한다.', who: '주희', where: '독서삼도(讀書三到)' },
];

export const TIPS = [
  { title: '대출 정보는 하루 늦게 와요', text: '정보나루는 도서관 데이터를 하루 단위로 모아요. 가기 전에 도서관 홈페이지에서 한 번 더 확인하면 헛걸음을 줄여요.' },
  { title: '월요일엔 쉬는 도서관이 많아요', text: '책 화면의 도서관 카드에서 휴관일을 보고, 정기 휴관일인 날엔 따로 알려 드려요.' },
  { title: '회원증 하나로 여러 도서관', text: '국립중앙도서관 책이음 서비스에 가입하면 참여 도서관을 회원증 하나로 이용할 수 있어요.' },
  { title: '없는 책은 신청해 보세요', text: '내 도서관에 없는 책은 희망도서로 신청할 수 있어요. 방법은 도서관 홈페이지에서 확인해요.' },
  { title: '하루 20쪽의 힘', text: '하루 20쪽씩 읽으면 한 달에 600쪽, 보통 책 두세 권이에요.' },
  { title: '바코드로 바로 찾기', text: '서점이나 친구 책의 뒷면 바코드를 찍으면 내 도서관에 있는지 바로 보여 줘요.' },
  { title: '관심 도서에 담아 두기', text: '대출 중인 책은 관심 도서에 담아 두면 한눈에 상태를 볼 수 있어요.' },
  { title: '책만 보는 바보', text: '조선 실학자 이덕무는 스스로를 간서치(看書痴), 곧 책만 보는 바보라고 불렀어요.' },
];

// 이번 주 인기 도서 1위 소식 (실제 데이터가 있을 때만)
export function weeklyNote(popular) {
  if (!popular || popular.demo || !Array.isArray(popular.items) || !popular.items.length) return null;
  const top = popular.items[0];
  const who = [popular.regionName, popular.ageName].filter(Boolean).join(' ');
  const subject = who ? `${who}${subjectParticle(who)}` : '사람들이';
  const title = `『${top.title}』`;
  return {
    title: '이번 주 1위',
    text: `이번 주 ${subject} 가장 많이 빌린 책은 ${title}${top.loanCount ? `, ${Number(top.loanCount).toLocaleString('ko-KR')}번 빌렸어요` : '이에요'}.`,
    isbn13: top.isbn13,
  };
}

// 날짜와 순번으로 고르기(같은 날 같은 순서면 같은 글이 나와 테스트하기 쉽다)
export function pick(list, seed = Date.now()) {
  if (!list.length) return null;
  const n = Math.abs(Math.floor(seed)) % list.length;
  return list[n];
}

// 로딩 중에 보여 줄 한 가지: 명언 또는 정보(이번 주 1위가 있으면 가끔 섞는다)
let counter = Math.floor(Math.random() * 1000);
export function nextReading(popular = null) {
  counter += 1;
  const weekly = weeklyNote(popular);
  if (weekly && counter % 4 === 0) return { kind: 'weekly', ...weekly };
  if (counter % 2 === 0) return { kind: 'quote', ...pick(QUOTES, counter / 2) };
  return { kind: 'tip', ...pick(TIPS, (counter - 1) / 2) };
}

export { objectParticle };

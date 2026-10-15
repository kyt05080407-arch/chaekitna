// 앱 설정. proxyUrl이 비어 있으면 예시 데이터(데모 모드)로 동작한다.
// Google Apps Script 프록시를 배포한 뒤 웹 앱 주소(…/exec)를 여기에 넣는다.
// 이 주소는 공개돼도 괜찮다. 인증키는 프록시 안에만 있다.

export const CONFIG = {
  proxyUrl: '',
  maxLibraries: 5,
  // 첫 화면 '이번 주 인기 도서'의 기본 지역(시·도 코드). 사용자가 설정에서 바꿀 수 있다.
  defaultRegion: '37',
  appVersion: '0.2.0',
  feedbackUrl: '',
  // 아침 알림(웹 푸시)용 공개 키. 비어 있으면 알림 기능을 숨긴다.
  // 짝이 되는 비공개 키는 GitHub 저장소 Secret(VAPID_PRIVATE_KEY)에만 둔다.
  vapidPublicKey: '',
};

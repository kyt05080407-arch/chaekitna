# 책있나

책 한 권을 검색하면 내가 고른 도서관 최대 5곳에 그 책이 있는지, 지금 빌릴 수 있는지를 한 화면에 보여주는 무료 웹앱이에요. 로그인도, 앱스토어 설치도 필요 없어요.

![책있나 미리보기](assets/og.png)

| 항목 | 내용 |
|---|---|
| 하는 일 | 책 검색 → 내 도서관 여러 곳의 소장·대출 가능 여부를 한 번에 |
| 데이터 | [도서관 정보나루](https://www.data4library.kr/) Open API (대출 정보는 전날 기준) |
| 운영 비용 | 0원 (GitHub Pages + Google Apps Script + GitHub Actions) |
| 개인정보 | 회원가입 없음. 설정과 관심 도서는 내 폰에만 저장 |

## 왜 만들었나

공공도서관 앱 리뷰를 모아 보면 별점이 1~2점대인 경우가 많고, 가장 자주 나오는 불만이 "책마다 하나씩 들어가 봐야 대출 가능한지 알 수 있다"는 거였어요. 도서관 여러 곳을 다니는 사람이라면 같은 검색을 도서관마다 반복해야 하고요.

도서관 정보나루는 도서관별 소장 여부와 대출 가능 여부를 알려 주는 공개 API가 있어서, 자주 가는 도서관 몇 곳을 한 화면에 모아 보여 주는 것만으로 이 불편을 꽤 줄일 수 있어요.

## 기능

- 책 검색: 제목·저자·ISBN, 책 뒷면 바코드 스캔
- 내 도서관 최대 5곳: 이름 검색, 시·도별 목록, 내 위치 근처 도서관
- 책 상세: 도서관별 `대출 가능` / `대출 중` / `소장 안 함` 배지, 홈페이지·전화·지도 바로가기, 휴관일과 "오늘은 정기 휴관일" 안내, 책 소개(누를 때만 불러옴)
- 더 넓게 찾기: 같은 시·도에서 이 책을 가진 다른 도서관
- 관심 도서: 담아 두고 상태를 한눈에 보기, 새로 빌릴 수 있게 된 책 표시
- 아침 알림: 최근에 담은 관심 도서 10권이 내 도서관에서 반납되면 다음 날 아침 9시쯤 푸시 알림 (설정해야 켜짐, 아래 참고)
- 이번 주 인기 도서: 매주 월요일 자동 갱신 (기본: 경북 고등학생)
- 글자 크기 3단계, 어두운 화면, 홈 화면에 설치, 오프라인에서도 앱 화면 열림

## 알아 둘 점

- 대출 정보는 전날 기준이에요. 정보나루가 도서관 데이터를 하루 단위로 모으기 때문이에요. 가기 전에 도서관 홈페이지에서 한 번 더 확인하세요.
- 프록시 주소(`js/config.js`의 `proxyUrl`)가 비어 있으면 예시 데이터 모드로 동작해요. 예시 도서(ISBN이 `000000000`으로 시작)의 대출 상태는 지어낸 값이라 `예시` 표시가 붙고, 실제 책은 "확인 못 함"으로 보여요.

## 구조

```
폰 브라우저 / 설치한 앱 ──(화면 파일)── GitHub Pages
        │
        └─(조회)─▶ Google Apps Script 프록시 ─▶ 도서관 정보나루 API
                    · 인증키 보관
                    · 같은 조회 6시간 캐시
                    · 하루 호출 상한

GitHub Actions: 매주 인기 도서 · 매월 도서관 목록 · 매일 프록시 점검
```

빌드 과정이 없어요. `index.html`과 `js/` 아래 ES 모듈을 그대로 배포해요.

| 폴더 | 내용 |
|---|---|
| `js/` | 앱 코드 (`views/`에 화면별 코드) |
| `css/` | 스타일 (밝은/어두운 화면, 글자 크기) |
| `data/` | 전국 도서관 목록, 이번 주 인기 도서 (Actions가 갱신) |
| `apps-script/` | 프록시 코드와 [배포 안내](apps-script/README.md) |
| `scripts/` | 데이터 갱신·점검·아이콘 생성 스크립트 |
| `vendor/` | 바코드 인식 모듈 (barcode-detector, zxing-wasm) |
| `tests/` | Node 기본 테스트 러너용 테스트 |

## 직접 배포하기

1. 이 저장소를 GitHub에 올리고 **Settings → Pages → Source**를 `GitHub Actions`로 바꿔요. ([GitHub 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site))
2. [도서관 정보나루](https://www.data4library.kr/)에 가입하고 인증키를 신청해요. 발급 신청 후 승인이 나야 쓸 수 있어요. ([Open API 활용방법](https://www.data4library.kr/apiUtilization))
3. 프록시를 배포해요: [apps-script/README.md](apps-script/README.md)
4. 프록시 주소(`…/exec`)를 `js/config.js`의 `proxyUrl`에 넣고 커밋해요.
5. 저장소 **Settings → Secrets and variables → Actions**에서 Secret `D4L_AUTH_KEY`를 추가해요. 인기 도서·도서관 목록 자동 갱신에 써요. ([GitHub 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets))
6. (선택) 같은 화면의 Variables에서 인기 도서 기준을 바꿀 수 있어요.

| Variable | 기본값 | 예 |
|---|---|---|
| `POPULAR_REGION` | `37` (경북) | `11` 서울, `21` 부산, `31` 경기 |
| `POPULAR_AGE` | `a17` (고등학생) | `a14` 중학생, `14` 청소년, `8` 초등학생, `20`~`60` 연령대 |

인기 도서는 데이터가 적으면 "지역+연령 → 지역+청소년 → 전국" 순서로 넓혀서 채워요.

### 아침 알림 켜기 (선택)

1. 웹 푸시 키 한 쌍(VAPID)을 만들어요: `npx web-push generate-vapid-keys`
   - 공개 키 → `js/config.js`의 `vapidPublicKey`
   - 비공개 키 → 저장소 Secret `VAPID_PRIVATE_KEY` (어디에도 붙여 넣거나 커밋하지 마세요)
2. 남이 맞힐 수 없는 긴 문자열 하나를 만들어 **두 곳에 똑같이** 넣어요.
   - 저장소 Secret `ADMIN_TOKEN`
   - Apps Script 스크립트 속성 `ADMIN_TOKEN`
3. **Actions → Morning alerts → Run workflow**에서 "보내지 않고 확인만 하기"를 켜고 한 번 돌려 봐요.

알아 둘 점

- 아이폰은 iOS 16.4 이상에서, 책있나를 홈 화면에 추가한 뒤 그 앱에서만 알림을 켤 수 있어요. 안드로이드 크롬은 브라우저에서도 돼요.
- 처음 확인한 날은 기록만 하고, 다음 날부터 "어제는 못 빌렸는데 오늘 빌릴 수 있게 된 책"만 알려요.
- 알림 확인도 프록시의 하루 호출 수를 함께 써요. 그래서 하루 최대 150쌍(책×도서관)까지만 확인하고, 구독은 150명까지 받아요.

## 자동으로 돌아가는 일

| 작업 | 언제 (한국 시간) | 하는 일 |
|---|---|---|
| Test | 코드를 올릴 때 | 단위 테스트 |
| Deploy site | 코드를 올릴 때, 데이터 갱신이 끝났을 때 | GitHub Pages 배포, 링크 미리보기 주소를 절대 주소로 바꿈, 인스타그램 카드 생성 |
| Weekly popular books | 매주 월요일 06:00 | 지난 7일 인기 대출 도서 TOP 10 저장 |
| Monthly library list | 매월 2일 03:00 | 전국 도서관 목록 갱신 (개수가 갑자기 줄면 덮어쓰지 않음) |
| Daily health check | 매일 07:00 | 프록시 상태와 어제 호출 수 확인, 실패하면 이슈 생성 |
| Morning alerts | 매일 09:07 | 관심 도서가 새로 대출 가능해진 사람에게 푸시 알림 (설정 전에는 건너뜀) |

## 인스타그램 카드

배포할 때마다 최근 8주 인기 도서로 1080×1350 카드와 캡션을 새로 만들어 `사이트주소/cards/`에 올려요. 책 표지 이미지는 쓰지 않아요.

- 최신 카드 정보: `cards/latest.json` (이미지 파일 이름, 캡션, 기간, 순위)
- 카드 이미지: `cards/popular-마지막날.png`, 캡션: `cards/popular-마지막날.txt`
- 직접 만들기: `npm run cards -- 출력폴더`

## 개발

```bash
npm install
npm test           # 단위 테스트
npm run serve      # http://127.0.0.1:8080 에서 확인
npm run test:e2e   # 휴대폰 크기 화면 자동 점검 (처음 한 번: npx playwright install chromium)
```

화면 자동 점검(`tests/e2e/`)은 세 가지를 확인해요.

- 예시 데이터 모드: 도서관 고르기 → 검색 → 상세 → 관심 도서, 설정, 바코드 직접 입력
- 실제 데이터 모드(가짜 프록시): 도서관별 상태, 정기 휴관일 안내, 책 소개, 아침 알림 켜기·끄기, 조회 한도 초과
- 오프라인: 한 번 연 뒤 인터넷이 끊겨도 앱 화면이 열리는지
- 바코드: 가짜 카메라에 ISBN 바코드를 비춰 실제 인식 모듈(zxing-wasm)로 읽히는지
- 카카오톡 안 브라우저: 다른 브라우저로 여는 안내가 뜨고 닫히는지

- 아이콘·미리보기 이미지 다시 만들기: `npm run icons`
- 데이터 직접 받기: `D4L_AUTH_KEY=인증키 npm run data:popular` / `npm run data:libraries`
- 프록시 점검: `PROXY_URL=https://script.google.com/macros/s/…/exec npm run health`
- 알림 시험 실행: `ADMIN_TOKEN=… ALERTS_DRY_RUN=1 npm run alerts`

서비스 워커는 https와 localhost에서 동작해요. 온라인일 때는 늘 새 파일을 받아서 고친 내용이 바로 보이고, 배포할 때마다 버전에 커밋 번호가 붙어 저장된 화면 파일이 한 번에 바뀌어요.

## 개인정보

- 회원가입·로그인이 없고, 이름이나 연락처를 받지 않아요.
- 내 도서관, 관심 도서, 최근 검색어는 내 폰의 브라우저 저장소에만 있어요. **설정 → 모든 데이터 지우기**로 한 번에 지울 수 있어요.
- 위치는 "근처 도서관"을 누를 때만 쓰고, 거리 계산도 폰 안에서 해요. 서버로 보내지 않아요.
- 아침 알림을 켠 경우에만 알림 주소(브라우저가 만든 주소와 키), 관심 도서 ISBN·제목(최대 10권), 도서관 코드가 프록시에 저장돼요. 알림을 끄면 바로 지우고, 90일 동안 앱을 열지 않아도 지워요.
- 프록시는 날짜별 호출 수와 기능별 사용 횟수만 세요. 누가 무엇을 찾았는지는 남기지 않아요.
- 글꼴까지 모두 이 사이트에서 직접 제공해서, 앱을 쓰는 동안 다른 회사 서버로 요청이 가지 않아요. (책 표지 이미지와 프록시 조회는 예외)

## 출처와 라이선스

- 도서·도서관·대출 정보: [도서관 정보나루](https://www.data4library.kr/) (국립중앙도서관 운영)
- 처음 넣어 둔 도서관 목록: [data4library-mcp](https://github.com/isnow890/data4library-mcp) (MIT)에서 가져온 정보나루 자료. 매월 정보나루에서 새로 받아요.
- 코드: [MIT](LICENSE)
- 글꼴·바코드 모듈 라이선스: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

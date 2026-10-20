# 책있나 홍보 영상

인스타그램 릴스·유튜브 쇼츠·틱톡용 세로 영상(1080×1920, 30fps, H.264)을 만드는 도구예요. 장면은 HTML·CSS 애니메이션으로 만들고, 한 프레임씩 멈춰 찍어 MP4로 묶어요.

| 영상 | 파일 | 길이 | 내용 |
|---|---|---|---|
| 1편 | `reels/v1-pain.html` | 약 17초 | 도서관마다 따로 검색하던 불편 → 책 화면 한 장에 도서관 여러 곳 |
| 2편 | `reels/v2-top5.html` | 약 20초 | 지난주 인기 대출 TOP 5. `data/popular.json`으로 매주 새로 만들어요 |
| 2편 청소년판 | `reels/v2-top5.html?group=14` | 약 20초 | 청소년 인기 TOP 5 (`group`에 20·30·40·50·60을 넣으면 그 나잇대) |
| 3편 | `reels/v3-lists.html` | 약 18초 | 권장도서 목록을 내 도서관에서 한 번에 확인 |

## 만드는 순서

```bash
# 1) 책 표지 받기: GitHub Actions → Promo assets → Run workflow (promo-assets 브랜치에 저장)
git fetch origin promo-assets && mkdir -p promo/.work && git archive FETCH_HEAD covers | tar -x -C promo/.work

# 2) 앱 화면 찍기 (가짜 프록시로 대출 상태를 보여 줌)
node promo/capture-app.mjs

# 3) 영상 만들기 → promo/.work/out/*.mp4, 표지 이미지 *-cover.jpg
node promo/make-reel.mjs v1-pain
node promo/make-reel.mjs v2-top5
node promo/make-reel.mjs v2-top5 --query=group=14 --suffix=teen
node promo/make-reel.mjs v3-lists
node promo/make-reel.mjs v1-pain --frames=1.6,9.5    # 그 시각 장면만 PNG로 확인

# 4) 올릴 글 만들기 → promo/.work/out/captions.md
node promo/captions.mjs
```

매주 월요일 인기 도서가 바뀌면 1)·3)의 2편과 4)만 다시 하면 돼요.

## 알아 둘 점

- 1편·3편의 대출·소장 결과는 화면 점검용 예시 데이터라서 영상에 "예시 화면"이라고 적었어요. 책 정보·인기 순위·목록은 실제 데이터예요.
- 영상에는 소리가 없어요. 음악은 인스타그램 앱의 오디오 목록에서 고르면 저작권 걱정이 없어요.
- 인스타그램 릴스 화면은 위쪽 약 200px, 아래쪽 약 400px, 오른쪽 버튼 자리가 가려져서 중요한 글은 그 안쪽에 두었어요.
- 책 표지는 출판사의 저작물이에요. 책을 소개하는 용도로만 쓰고, 표지 파일은 `promo-assets` 브랜치에만 두고 사이트에는 올리지 않아요.
- 출처: 인기 대출·책 정보는 [도서관 정보나루](https://www.data4library.kr/), 권장도서 목록은 [서울대학교 기초교육원](http://book100.snu.ac.kr/book/book/).

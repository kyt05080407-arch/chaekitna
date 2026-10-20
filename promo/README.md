# 책있나 홍보 영상

인스타그램 릴스·유튜브 쇼츠·틱톡용 세로 영상(1080×1920, 30fps, H.264)을 만드는 도구예요. 장면은 HTML·CSS 애니메이션으로 만들고, 한 프레임씩 멈춰 찍어 MP4로 묶어요.

| 영상 | 파일 | 길이 | 내용 |
|---|---|---|---|
| 1편 | `reels/v1-pain.html` | 약 17초 | 도서관마다 따로 검색하던 불편 → 책 화면 한 장에 도서관 여러 곳 |
| 2편 | `reels/v2-top5.html` | 약 20초 | 지난주 인기 대출 TOP 5. `data/popular.json`으로 매주 새로 만들어요 |
| 2편 청소년판 | `reels/v2-top5.html?group=14` | 약 20초 | 청소년 인기 TOP 5 (`group`에 20·30·40·50·60을 넣으면 그 나잇대) |
| 3편 | `reels/v3-lists.html` | 약 18초 | 권장도서 목록을 내 도서관에서 한 번에 확인 |

## 썰 영상 (AI 목소리, '밤티' 스타일)

| 영상 | 파일 | 길이 | 내용 |
|---|---|---|---|
| 썰 1 | `reels/s1-maker.html` + `stories/s1-maker.json` | 약 42초 | 코딩 잘 모르는 고딩이 AI랑 도서관 앱 만든 썰 |

검은 바탕에 위쪽 고정 제목, 가운데 짤·앱 화면, 아래 굵은 자막. 대본 한 줄마다 AI 목소리를 따로 만들어 그 길이에 맞춰 장면과 자막이 바뀌어요.

```bash
# 1) 대본 고치기: promo/stories/s1-maker.json (say=읽는 글, sub=자막, *노란 글씨*, |=줄바꿈, pause=쉬는 시간)
# 2) AI 목소리: GitHub Actions → Promo TTS → 대본 이름(s1-maker) 넣고 실행 → promo-tts 브랜치
git fetch origin promo-tts && rm -rf promo/.work/tts && git archive FETCH_HEAD tts | tar -x -C promo/.work
node promo/story-prep.mjs s1-maker          # 앞뒤 빈 소리 자르기, 줄별 시각(timeline.json)
# 3) 글꼴(처음 한 번): 제목 Black Han Sans, 자막 도현. 이모지는 시스템 글꼴(fonts-noto-color-emoji)
mkdir -p promo/.work/fonts && cd promo/.work/fonts && for p in black-han-sans do-hyeon; do mkdir -p $p && npm pack @fontsource/$p@5.3.0 --silent | xargs -I{} tar -xzf {} -C $p --strip-components=1; done; cd -
# 4) 영상
node promo/make-reel.mjs s1-maker
```

- 목소리는 [edge-tts](https://github.com/rany2/edge-tts)로 마이크로소프트 엣지의 '소리 내어 읽기' 음성(ko-KR-SunHiNeural)을 써요. 개인 SNS 영상에 널리 쓰이지만, 상업적으로 써도 되는지는 확인하지 못했어요. 수익을 내는 계정이라면 캡컷 등 사용 조건이 분명한 TTS로 바꾸는 게 안전해요.
- 영상 속 별점(1.3·1.8·1.9·2.4)은 2026년 10월에 구글플레이·앱스토어에서 확인한 도서관 앱 별점, '도움돼요 201'은 같은 불만을 담은 실제 리뷰의 수치예요. 앱 이름은 넣지 않았어요.

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
- 소리: 직접 합성한 배경음악(116BPM, C–G–Am–F)과 장면에 맞춘 효과음(전환 휙, 카드 톡, 누르기 딸깍, 숫자 띵, 1위 반짝)이 들어 있어요(`make-audio.mjs`). 외부 음원을 쓰지 않아 저작권 걱정이 없어요. 음량은 SNS 기준(약 −14 LUFS)에 맞췄어요.
- 인스타그램 음악을 쓰고 싶으면 `--silent`로 소리 없이 만들거나, 앱 편집 화면에서 원본 소리 음량을 낮추면 돼요. 화면은 그대로 두고 소리만 바꿀 때는 `--audio-only`.
- 인스타그램 릴스 화면은 위쪽 약 200px, 아래쪽 약 400px, 오른쪽 버튼 자리가 가려져서 중요한 글은 그 안쪽에 두었어요.
- 책 표지는 출판사의 저작물이에요. 책을 소개하는 용도로만 쓰고, 표지 파일은 `promo-assets` 브랜치에만 두고 사이트에는 올리지 않아요.
- 출처: 인기 대출·책 정보는 [도서관 정보나루](https://www.data4library.kr/), 권장도서 목록은 [서울대학교 기초교육원](http://book100.snu.ac.kr/book/book/).

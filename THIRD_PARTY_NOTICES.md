# 함께 배포하는 외부 자료

책있나 코드는 [MIT](LICENSE)이고, 아래 자료는 각자의 라이선스를 따라요.

| 자료 | 버전 | 라이선스 | 위치 | 원본 |
|---|---|---|---|---|
| Pretendard 글꼴 (가변, 동적 서브셋) | 1.3.9 | SIL Open Font License 1.1 | `assets/fonts/pretendard/` | [orioncactus/pretendard](https://github.com/orioncactus/pretendard) |
| barcode-detector (BarcodeDetector 대체 구현) | 3.2.2 | MIT | `vendor/barcode-detector.mjs` | [Sec-ant/barcode-detector](https://github.com/Sec-ant/barcode-detector) |
| zxing-wasm (JS 부분) | 3.1.3 | MIT | `vendor/barcode-detector.mjs`에 묶음 | [Sec-ant/zxing-wasm](https://github.com/Sec-ant/zxing-wasm) |
| zxing-cpp (바코드 인식 엔진, WebAssembly로 빌드됨) | zxing-wasm 3.1.3에 포함된 버전 | Apache License 2.0 | `vendor/zxing_reader.wasm` | [zxing-cpp/zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) |
| 처음 넣어 둔 전국 도서관 목록 | 2026-10-15 가져옴 | MIT (저장소), 원자료는 도서관 정보나루 | `data/libraries.json` | [isnow890/data4library-mcp](https://github.com/isnow890/data4library-mcp) |

라이선스 원문

- Pretendard: [`assets/fonts/pretendard/LICENSE.txt`](assets/fonts/pretendard/LICENSE.txt)
- barcode-detector: [`vendor/LICENSE-barcode-detector.txt`](vendor/LICENSE-barcode-detector.txt)
- zxing-wasm: [`vendor/LICENSE-zxing-wasm.txt`](vendor/LICENSE-zxing-wasm.txt)
- zxing-cpp, zxing-wasm의 C++ 연결 코드: [`vendor/LICENSE-zxing-cpp-Apache-2.0.txt`](vendor/LICENSE-zxing-cpp-Apache-2.0.txt)

참고

- `vendor/barcode-detector.mjs`는 barcode-detector의 ponyfill 진입점을 esbuild로 한 파일로 묶은 거예요. 소스 코드는 고치지 않았고, 앱에서 `locateFile`로 wasm 위치만 이 사이트의 파일로 바꿔요.
- zxing-wasm이 바코드 "만들기"에 쓰는 zint(BSD-3-Clause)는 쓰기용 빌드에만 들어 있어서, 여기서 쓰는 읽기 전용 `zxing_reader.wasm`과는 관계가 없는 것으로 보고 있어요.
- Pretendard 글꼴 파일은 고치지 않았어요. 아이콘과 미리보기 이미지(`assets/icons/`, `assets/og.png`)에 들어간 글자도 이 글꼴로 그렸어요.

## 데이터

- 도서·도서관·대출 정보는 [도서관 정보나루](https://www.data4library.kr/)(국립중앙도서관 운영) Open API에서 받아요. 앱 화면 아래에 출처를 표시해요.
- 책 표지 이미지는 정보나루가 알려 주는 주소에서 바로 불러오고, 이 저장소에 저장하지 않아요.

// 책 뒷면의 ISBN 바코드(EAN-13)를 카메라로 읽는다.
// 브라우저에 BarcodeDetector가 있으면 그것을 쓰고, 없으면(아이폰 사파리 등)
// 저장소에 함께 넣어둔 바코드 인식 모듈(vendor/)을 불러와 쓴다.

import { toIsbn13 } from './util.js';

async function createDetector() {
  if ('BarcodeDetector' in globalThis) {
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats();
      if (formats.includes('ean_13')) return new globalThis.BarcodeDetector({ formats: ['ean_13'] });
    } catch {
      /* 아래 대체 모듈로 */
    }
  }
  const mod = await import('../vendor/barcode-detector.mjs');
  mod.setZXingModuleOverrides({
    locateFile: (path, prefix) =>
      path.endsWith('.wasm') ? new URL('../vendor/zxing_reader.wasm', import.meta.url).href : prefix + path,
  });
  return new mod.BarcodeDetector({ formats: ['ean_13'] });
}

export function cameraAvailable() {
  return Boolean(globalThis.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function isBookIsbn(value) {
  const isbn = toIsbn13(value);
  return isbn && (isbn.startsWith('978') || isbn.startsWith('979')) ? isbn : null;
}

// 찾은 ISBN-13을 돌려주고, 닫으면 null을 돌려준다.
export function openScanner() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scanner';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '바코드 스캔');
    overlay.innerHTML = `
      <video playsinline muted></video>
      <div class="scanner__frame" aria-hidden="true"></div>
      <div class="scanner__bar">
        <p class="scanner__msg" aria-live="polite">책 뒷면 바코드를 노란 틀 안에 맞춰 주세요</p>
        <form class="btn-row" data-manual>
          <label class="sr-only" for="manual-isbn">ISBN 직접 입력</label>
          <input class="input" id="manual-isbn" inputmode="numeric" autocomplete="off" placeholder="ISBN 13자리" style="background:#fff;color:#111827">
          <button class="btn" type="submit">찾기</button>
        </form>
        <button class="btn btn--block" type="button" data-close>닫기</button>
      </div>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('video');
    const msg = overlay.querySelector('.scanner__msg');
    const closeBtn = overlay.querySelector('[data-close]');
    let stream = null;
    let timer = null;
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') finish(null);
    };
    document.addEventListener('keydown', onKey);
    closeBtn.addEventListener('click', () => finish(null));
    overlay.querySelector('[data-manual]').addEventListener('submit', (event) => {
      event.preventDefault();
      const isbn = isBookIsbn(overlay.querySelector('#manual-isbn').value);
      if (isbn) finish(isbn);
      else msg.textContent = 'ISBN 13자리(978 또는 979로 시작)를 확인해 주세요';
    });
    closeBtn.focus();

    if (!cameraAvailable()) {
      msg.textContent = '이 브라우저는 카메라를 쓸 수 없어요. ISBN을 직접 입력해 주세요';
      return;
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (done) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();
        const tick = async () => {
          if (done) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              for (const code of found) {
                const isbn = isBookIsbn(code.rawValue);
                if (isbn) {
                  if (navigator.vibrate) navigator.vibrate(60);
                  finish(isbn);
                  return;
                }
              }
            }
          } catch {
            /* 한 번 실패해도 계속 시도 */
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (error) {
        const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
        msg.textContent = denied
          ? '카메라 권한이 꺼져 있어요. 설정에서 허용하거나 ISBN을 직접 입력해 주세요'
          : '카메라를 켜지 못했어요. ISBN을 직접 입력해 주세요';
      }
    })();
  });
}

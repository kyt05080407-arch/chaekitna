// 앱 아이콘과 공유 미리보기 이미지를 SVG로 그려 PNG로 저장한다.
// 사용법: npm run icons   (devDependencies: @resvg/resvg-js, pretendard)

import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const fontDir = require.resolve('pretendard/package.json').replace(/package\.json$/, 'dist/public/static/');
const FONTS = ['Pretendard-Black.otf', 'Pretendard-Bold.otf', 'Pretendard-Regular.otf'].map((f) => fontDir + f);

const BLUE = '#2E6BFF';
const YELLOW = '#FFD43B';
const INK = '#111827';

// 512 기준 그림: 노란 책갈피 + 흰 돋보기
function mark({ scale = 1, offset = 0 } = {}) {
  const t = (v) => offset + v * scale;
  const s = (v) => v * scale;
  return `
    <path d="M${t(150)} ${t(96)} H${t(362)} V${t(420)} L${t(256)} ${t(350)} L${t(150)} ${t(420)} Z"
          fill="${YELLOW}" stroke="${INK}" stroke-width="${s(16)}" stroke-linejoin="round"/>
    <circle cx="${t(318)}" cy="${t(318)}" r="${s(62)}" fill="#FFFFFF" stroke="${INK}" stroke-width="${s(16)}"/>
    <path d="M${t(362)} ${t(362)} L${t(420)} ${t(420)}" stroke="${INK}" stroke-width="${s(26)}" stroke-linecap="round"/>`;
}

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${BLUE}"/>${mark()}</svg>`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BLUE}"/>${mark({ scale: 0.72, offset: 72 })}</svg>`;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFFFFF"/>
  <rect x="0" y="0" width="1200" height="18" fill="${BLUE}"/>
  <g transform="translate(96 139) scale(0.68)"><rect width="512" height="512" rx="112" fill="${BLUE}"/>${mark()}</g>
  <text x="510" y="285" font-family="Pretendard" font-weight="900" font-size="128" fill="${INK}" letter-spacing="-4">책있나</text>
  <text x="514" y="370" font-family="Pretendard" font-weight="700" font-size="52" fill="${INK}">내 도서관에 그 책 있나?</text>
  <text x="514" y="440" font-family="Pretendard" font-weight="400" font-size="31" fill="#374151">책 한 권, 도서관 여러 곳의 대출 가능 여부를 한 번에</text>
</svg>`;

function png(svg, width) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Pretendard' },
  });
  return r.render().asPng();
}

const dir = new URL('../assets/icons/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('icon.svg', dir), iconSvg);
await writeFile(new URL('icon-192.png', dir), png(iconSvg, 192));
await writeFile(new URL('icon-512.png', dir), png(iconSvg, 512));
await writeFile(new URL('icon-maskable-512.png', dir), png(maskableSvg, 512));
await writeFile(new URL('apple-touch-icon.png', dir), png(maskableSvg, 180));
await writeFile(new URL('../og.png', dir), png(ogSvg, 1200));
console.log('아이콘과 공유 이미지를 만들었어요.');

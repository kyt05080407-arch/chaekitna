// 시험용 가짜 카메라 영상: ISBN 바코드(EAN-13)를 그린 Y4M 파일을 만든다.
// 크롬의 --use-file-for-fake-video-capture로 넣으면 카메라 대신 이 그림이 보인다.
import { writeFileSync } from 'node:fs';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLG', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

// 13자리 → 95칸짜리 0/1 막대 무늬
export function ean13Modules(code) {
  const d = String(code).split('').map(Number);
  if (d.length !== 13 || d.some(Number.isNaN)) throw new Error('13자리 숫자가 필요해요');
  let bits = '101';
  for (let i = 1; i <= 6; i += 1) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i += 1) bits += R[d[i]];
  return `${bits}101`;
}

export function writeBarcodeY4m(path, code, { width = 640, height = 480, module = 5, frames = 3 } = {}) {
  const bits = ean13Modules(code);
  const y = Buffer.alloc(width * height, 235); // 흰 바탕
  const barWidth = bits.length * module;
  const x0 = Math.floor((width - barWidth) / 2);
  const top = Math.floor(height * 0.2);
  const bottom = Math.floor(height * 0.8);
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] !== '1') continue;
    for (let row = top; row < bottom; row += 1) y.fill(16, row * width + x0 + i * module, row * width + x0 + (i + 1) * module);
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128); // U, V 회색
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F5:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma]);
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]));
  return path;
}

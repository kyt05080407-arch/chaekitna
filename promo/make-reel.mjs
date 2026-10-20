// 홍보 영상 만들기: promo/reels/<이름>.html 의 CSS 애니메이션을 한 프레임씩 멈춰 찍어 MP4(1080×1920, 30fps)로 묶는다.
// 사용:
//   node promo/make-reel.mjs v1-pain                     → promo/.work/out/v1-pain.mp4 (+ 표지 이미지 .jpg)
//   node promo/make-reel.mjs v2-top5 --query=group=14    → 10대 인기 TOP 5
//   node promo/make-reel.mjs v1-pain --frames=1,5,9.5    → 그 시각의 장면만 PNG로(확인용)
// 먼저 promo/capture-app.mjs로 앱 화면을, Promo assets 작업으로 표지를 받아 둔다.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const [name, ...rest] = process.argv.slice(2);
if (!name) {
  console.error('사용: node promo/make-reel.mjs <영상 이름> [--query=...] [--frames=초,초] [--out=폴더] [--fps=30] [--suffix=이름 뒤에 붙일 말]');
  process.exit(1);
}
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const FPS = Number(opt.fps || 30);
const OUT = opt.out || `${ROOT}promo/.work/out`;
const PORT = 4196 + Math.floor(Math.random() * 300);
const base = `${name}${opt.suffix ? `-${opt.suffix}` : ''}`;

const server = spawn(process.execPath, [`${ROOT}scripts/serve.mjs`, String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('requestfailed', (r) => problems.push(`불러오지 못함: ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/promo/reels/${name}.html${opt.query ? `?${opt.query}` : ''}`);
  await page.waitForFunction(() => window.reelReady instanceof Promise, null, { timeout: 15000 });
  await page.evaluate(() => window.reelReady);
  const { duration, cover } = await page.evaluate(() => window.REEL);
  if (problems.length) throw new Error(problems.join('\n'));
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const seek = (sec) => page.evaluate((ms) => document.getAnimations().forEach((a) => (a.currentTime = ms)), sec * 1000);
  await mkdir(OUT, { recursive: true });

  if (opt.frames) {
    for (const s of opt.frames.split(',').map(Number)) {
      await seek(s);
      await page.screenshot({ path: `${OUT}/${base}@${s}s.png` });
    }
    console.log(`확인용 장면 ${opt.frames.split(',').length}장 저장`);
  } else {
    const file = `${OUT}/${base}.mp4`;
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v', '-map', '1:a', '-shortest',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))));
    const frames = Math.round(duration * FPS);
    for (let i = 0; i < frames; i += 1) {
      await seek(i / FPS);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    // 인스타그램 표지로 쓸 한 장
    await seek(cover ?? 1.5);
    await writeFile(`${OUT}/${base}-cover.jpg`, await page.screenshot({ type: 'jpeg', quality: 95 }));
    console.log(`${file} (${duration}초, ${frames}프레임)`);
  }
} finally {
  await browser.close();
  server.kill();
}

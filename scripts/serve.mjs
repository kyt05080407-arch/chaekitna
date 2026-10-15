// 개발용 작은 정적 파일 서버 (빌드 과정이 없어서 저장소 폴더를 그대로 보여 준다)
// 사용: node scripts/serve.mjs [포트, 기본 8080]  → http://localhost:8080
// 화면 자동 점검(Playwright)도 이 서버를 쓴다.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let info = await stat(path).catch(() => null);
    if (info && info.isDirectory()) {
      path = join(path, 'index.html');
      info = await stat(path).catch(() => null);
    }
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('없는 파일이에요');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path).pipe(res);
  } catch {
    res.writeHead(500).end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`책있나 개발 서버: http://127.0.0.1:${port}/`);
});

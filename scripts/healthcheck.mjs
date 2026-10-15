// 프록시가 살아 있는지, 인증키가 들어 있는지, 오늘 얼마나 썼는지 확인한다. 매일 실행.
// 실패하면 종료 코드 1 → 워크플로가 GitHub 이슈를 만든다.

import { readFile } from 'node:fs/promises';

async function proxyUrl() {
  if (process.env.PROXY_URL) return process.env.PROXY_URL;
  const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
  const m = config.match(/proxyUrl:\s*'([^']*)'/);
  return m ? m[1] : '';
}

const url = await proxyUrl();
if (!url) {
  console.log('아직 프록시 주소가 없어요 (js/config.js의 proxyUrl). 점검을 건너뜁니다.');
  process.exit(0);
}

try {
  const res = await fetch(`${url}?op=health`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const data = await res.json();
  if (!data.ok) throw new Error(`응답 이상: ${JSON.stringify(data)}`);
  if (!data.keyConfigured) throw new Error('프록시에 인증키(D4L_AUTH_KEY)가 없어요.');
  const ratio = data.limit ? Math.round((data.used / data.limit) * 100) : 0;
  console.log(`프록시 정상 · ${data.date} 호출 ${data.used}/${data.limit} (${ratio}%) · 알림 구독 ${data.subscriptions}`);
  const y = data.yesterday;
  if (y) {
    const yRatio = data.limit ? Math.round((y.used / data.limit) * 100) : 0;
    console.log(`어제(${y.date}) 호출 ${y.used}/${data.limit} (${yRatio}%) · 기능별 ${JSON.stringify(y.stats)}`);
    if (yRatio >= 90) console.log('::warning::어제 호출 한도의 90%를 넘었어요. 한도를 늘리거나 캐시 시간을 늘릴 때예요.');
  }
  if (ratio >= 90) console.log('::warning::오늘 호출 한도의 90%를 넘었어요.');
} catch (error) {
  console.error(`프록시 점검 실패: ${error.message}`);
  process.exit(1);
}

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

  // 정보나루까지 실제로 닿는지: 검색 한 번(프록시가 6시간 캐시하므로 하루 1번 정도만 실제 호출)
  const probe = await fetch(`${url}?op=search&q=${encodeURIComponent('어린 왕자')}&page=1&sort=loan`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  }).then((r) => r.json());
  if (probe.error === 'budget') {
    console.log('::warning::오늘 호출 한도를 다 써서 정보나루 연결은 확인하지 못했어요.');
  } else if (probe.error) {
    throw new Error(`정보나루 조회 실패: ${probe.error} ${probe.message || ''}`.trim());
  } else {
    const docs = (probe.response && probe.response.docs) || [];
    if (!docs.length) throw new Error('정보나루 검색 결과가 비어 있어요. 인증키 상태를 확인해 주세요.');
    console.log(`정보나루 연결 정상 · 시험 검색 결과 ${docs.length}건`);
  }

  // 지난 7일 사용량 요약
  const stats = await fetch(`${url}?op=stats&days=7`, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
    .then((r) => r.json())
    .catch(() => null);
  if (stats && Array.isArray(stats.days)) {
    const total = (key) => stats.days.reduce((sum, d) => sum + Number((d.stats || {})[key] || 0), 0);
    const used = stats.days.reduce((sum, d) => sum + Number(d.used || 0), 0);
    console.log(
      `지난 7일: 정보나루 호출 ${used}번 · 검색 ${total('srchBooks')} · 대출 확인 ${total('exist')} · 넓게 찾기 ${total('libSrchByBook')} · 책 소개 ${total('srchDtlList')} · 알림 구독 ${stats.subscriptions}`,
    );
  }
} catch (error) {
  console.error(`프록시 점검 실패: ${error.message}`);
  process.exit(1);
}

// GitHub Actions에서 도서관 정보나루 API를 부르는 작은 도우미 (Node 20+, 외부 패키지 없음)

export const API_BASE = 'https://data4library.kr/api/';

export function authKey() {
  const key = process.env.D4L_AUTH_KEY;
  if (!key) {
    console.error('D4L_AUTH_KEY가 없어요. GitHub 저장소 Settings → Secrets and variables → Actions에 넣어 주세요.');
    process.exit(1);
  }
  return key;
}

export async function callApi(endpoint, params, { key = authKey(), retries = 2 } = {}) {
  const url = new URL(endpoint, API_BASE);
  url.searchParams.set('authKey', key);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.response && data.response.error) {
        // 인증키 상태 같은 정보나루 쪽 오류는 다시 불러도 같은 답이라 바로 멈춘다.
        const apiError = new Error(`정보나루 오류: ${data.response.error}`);
        apiError.final = true;
        throw apiError;
      }
      return data;
    } catch (error) {
      lastError = error;
      if (error.final) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  // 오류 메시지에 인증키가 섞이지 않게 엔드포인트 이름만 남긴다.
  throw new Error(`${endpoint} 호출 실패: ${lastError && lastError.message}`);
}

// 한국 시간 기준 날짜 문자열 (offsetDays: 오늘에서 며칠 전/후)
export function kstDate(offsetDays = 0, now = new Date()) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

export function koreanRange(startDt, endDt) {
  const fmt = (s) => `${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;
  const sameMonth = startDt.slice(0, 7) === endDt.slice(0, 7);
  return sameMonth ? `${fmt(startDt)}~${Number(endDt.slice(8, 10))}일` : `${fmt(startDt)}~${fmt(endDt)}`;
}

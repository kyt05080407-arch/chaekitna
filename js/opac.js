// 도서관 홈페이지에서 이 책을 바로 찾아보는 주소.
// data/opac.json에는 GitHub Actions 점검(scripts/probe-opac.mjs)에서 '데미안'을 실제로 검색해 결과가 나온
// 홈페이지별 검색 주소 모양만 들어 있다. ({q} 자리에 책 제목)
// 목록에 없는 홈페이지는 제목을 복사해 두고 홈페이지를 연다.

let loading = null;

export function loadOpac() {
  if (!loading) {
    loading = fetch(new URL('../data/opac.json', import.meta.url))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && data.hosts && typeof data.hosts === 'object' ? data.hosts : {}))
      .catch(() => ({}));
  }
  return loading;
}

export function hostOf(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `http://${url.trim()}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// 한 주소 아래 도서관마다 따로 사이트가 있는 경우(예: lib.ice.go.kr/gyeyang)를 위해 '호스트/첫 경로'를 먼저 본다.
export function opacKeys(homepage) {
  const host = hostOf(homepage);
  if (!host) return [];
  let first = '';
  try {
    const u = new URL(/^https?:\/\//i.test(homepage.trim()) ? homepage.trim() : `http://${homepage.trim()}`);
    first = u.pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    /* 호스트만 */
  }
  return first && !/\.(do|html?|jsp|php|asp|aspx|web)$/i.test(first) ? [`${host}/${first.toLowerCase()}`, host] : [host];
}

// 이 도서관 홈페이지에서 제목으로 바로 검색하는 주소. 모르면 ''.
export function searchUrl(templates, lib, title) {
  if (!lib || !title || !templates) return '';
  const key = opacKeys(lib.homepage).find((k) => typeof templates[k] === 'string');
  const template = key ? templates[key] : '';
  // 새 창으로 여는 링크라 http 사이트도 그대로 둔다(일부 도서관은 https를 지원하지 않는다)
  if (typeof template !== 'string' || !/^https?:\/\/\S+\{q\}/i.test(template)) return '';
  try {
    const url = new URL(template.replace('{q}', encodeURIComponent(title)));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// 도서관 홈페이지에서 이 책을 바로 찾아보는 방법.
// data/opac.json에는 GitHub Actions 점검(scripts/probe-opac.mjs)에서 '데미안'을 실제로 검색해 결과가 나온 것만 들어 있다.
//  - 문자열: 검색 결과 주소 모양 ({q} 자리에 책 제목)
//  - { method: 'post', action, fields, charset }: 검색창에 치고 엔터를 누를 때 보내는 요청서. 우리가 채워서 새 창으로 보낸다.
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

const isHttp = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// 바로 찾기 방법: { kind: 'get', href } 또는 { kind: 'post', action, fields, charset }. 모르면 null.
export function searchTarget(templates, lib, title) {
  if (!lib || !title || !templates) return null;
  const key = opacKeys(lib.homepage).find((k) => templates[k]);
  const entry = key ? templates[key] : null;
  if (typeof entry === 'string') {
    const href = searchUrl(templates, lib, title);
    return href ? { kind: 'get', href } : null;
  }
  if (!entry || typeof entry !== 'object' || String(entry.method).toLowerCase() !== 'post' || !isHttp(entry.action)) return null;
  const pairs = Object.entries(entry.fields || {}).filter(([k, v]) => typeof k === 'string' && typeof v === 'string');
  if (!pairs.some(([, v]) => v === '{q}')) return null;
  return {
    kind: 'post',
    action: new URL(entry.action).href,
    fields: Object.fromEntries(pairs.map(([k, v]) => [k, v === '{q}' ? title : v])),
    charset: typeof entry.charset === 'string' ? entry.charset : 'UTF-8',
  };
}

// POST 방식: 검색 요청서를 만들어 새 창으로 보낸다(눌렀을 때만 호출)
export function submitSearch(target, doc = document) {
  if (!target || target.kind !== 'post') return false;
  const form = doc.createElement('form');
  form.method = 'post';
  form.action = target.action;
  form.target = '_blank';
  form.setAttribute('rel', 'noopener noreferrer');
  if (target.charset && !/^utf-?8$/i.test(target.charset)) form.acceptCharset = target.charset;
  for (const [name, value] of Object.entries(target.fields)) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  doc.body.append(form);
  form.submit();
  form.remove();
  return true;
}

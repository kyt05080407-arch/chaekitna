// 도서관 홈페이지마다 '이 책 바로 검색' 주소를 찾는다(한 번씩 직접 실행하는 점검용).
// 1) 홈페이지의 검색 폼(GET)을 찾아 '데미안'으로 시험 검색
// 2) 폼이 없으면 흔히 쓰는 도서관 검색 주소 모양을 차례로 시험
// 결과 페이지에 '데미안'과 '헤세'가 실제로 나오는 주소만 '확인됨'으로 남긴다.
// 사용: node scripts/probe-opac.mjs [최대 호스트 수=80]  → opac-probe.json
// 사이트에 부담을 주지 않게 한 번에 한 곳씩, 요청 사이에 쉬어 가며 부른다.
import { readFile, writeFile } from 'node:fs/promises';

const LIMIT = Number(process.argv[2] || 80);
const TITLE = '데미안';
const AUTHOR = '헤세';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 한국 도서관 홈페이지에서 자주 보이는 검색 결과 주소 모양 ({q}=검색어)
const PATTERNS = [
  '/kolaseek/plus/search/plusSearchResultList.do?searchType=SIMPLE&searchKey=ALL&searchKeyword={q}',
  '/plus/search/plusSearchResultList.do?searchType=SIMPLE&searchKey=ALL&searchKeyword={q}',
  '/search/tot/result?st=KWRD&si=TOTAL&q={q}',
  '/intro/search/index.do?search_text={q}',
  '/search/searchList.do?searchKeyword={q}',
  '/search/search.do?searchKeyword={q}',
  '/data/search.do?searchKeyword={q}',
  '/book/search.do?searchKeyword={q}',
  '/search?q={q}',
];

function hostOf(url) {
  try {
    return new URL(/^https?:/i.test(url) ? url : `http://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// EUC-KR 사이트에 보낼 폼 값 인코딩(있으면 iconv-lite 사용, 없으면 UTF-8)
let iconv = null;
try {
  iconv = (await import('iconv-lite')).default;
} catch {
  iconv = null;
}
const isEucKr = (charset) => /euc-?kr|ks_c_5601|cp949/i.test(charset || '');
const SAFE = /[A-Za-z0-9\-._*]/;
function encodeValue(value, charset) {
  if (!isEucKr(charset) || !iconv) return encodeURIComponent(value).replace(/%20/g, '+');
  return [...iconv.encode(value, 'euc-kr')]
    .map((b) => (SAFE.test(String.fromCharCode(b)) && b < 0x80 ? String.fromCharCode(b) : b === 0x20 ? '+' : `%${b.toString(16).toUpperCase().padStart(2, '0')}`))
    .join('');
}
function encodeForm(fields, charset) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeValue(k, charset)}=${encodeValue(v, charset)}`)
    .join('&');
}

async function get(url, { method = 'GET', body, charset: sendCharset } = {}) {
  const headers = { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' };
  if (body) headers['content-type'] = `application/x-www-form-urlencoded${isEucKr(sendCharset) ? '; charset=EUC-KR' : ''}`;
  // 쿠키 없이 보낸다: 우리 사이트에서 새 창으로 처음 보내는 요청도 쿠키가 없기 때문
  const res = await fetch(url, { method, body, headers, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 4000).toString('latin1');
  const charset = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] || head.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
  let text;
  try {
    text = new TextDecoder(/euc-?kr|ks_c_5601|cp949/i.test(charset) ? 'euc-kr' : 'utf-8').decode(buf);
  } catch {
    text = buf.toString('utf8');
  }
  return { status: res.status, url: res.url, text, charset };
}

const count = (text, word) => text.split(word).length - 1;

// 아주 단순한 폼 찾기: 검색어 입력칸이 있는 GET 폼
function searchForms(html, baseUrl) {
  const forms = [];
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1];
    const method = (attrs.match(/method\s*=\s*["']?(\w+)/i)?.[1] || 'get').toLowerCase();
    const action = attrs.match(/action\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    const inputs = [...m[2].matchAll(/<input\b([^>]*)>/gi)].map((i) => ({
      type: (i[1].match(/type\s*=\s*["']?(\w+)/i)?.[1] || 'text').toLowerCase(),
      name: i[1].match(/name\s*=\s*["']([^"']+)["']/i)?.[1] || '',
      value: i[1].match(/value\s*=\s*["']([^"']*)["']/i)?.[1] || '',
    }));
    const text = inputs.find((i) => (i.type === 'text' || i.type === 'search') && /search|keyword|kwd|query|word|srch|^q$|text/i.test(i.name));
    if (!text) continue;
    let target;
    try {
      target = new URL(action || baseUrl, baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(target.protocol) || /javascript/i.test(action)) continue;
    const hidden = inputs.filter((i) => i.type === 'hidden' && i.name && i.value.length < 60);
    forms.push({ method, base: `${target.origin}${target.pathname}`, field: text.name, hidden });
  }
  return forms;
}

function scriptSearchUrls(html, baseUrl) {
  const out = new Set();
  const re = /["'](\/?[\w./-]*(?:search|Search|srch)[\w./-]*\.(?:do|jsp|php|asp|aspx)?\??[^"'\s<>]*?(?:searchKeyword|keyword|searchWord|search_text|search_txt|searchTxt|kwd|query|sw)=)["']/g;
  for (const m of html.matchAll(re)) {
    try {
      const url = new URL(m[1], baseUrl);
      if (/^https?:$/.test(url.protocol)) out.add(`${url.href}{q}`);
    } catch {
      /* 무시 */
    }
    if (out.size >= 4) break;
  }
  return [...out];
}

function formTemplate(f) {
  const params = new URLSearchParams();
  for (const h of f.hidden) params.set(h.name, h.value);
  params.set(f.field, '__Q__');
  return `${f.base}?${params.toString().replace('__Q__', '{q}')}`;
}

async function verifyPost(post, homeCount) {
  const fields = Object.fromEntries(Object.entries(post.fields).map(([k, v]) => [k, v === '{q}' ? TITLE : v]));
  const r = await get(post.action, { method: 'POST', body: encodeForm(fields, post.charset), charset: post.charset });
  const hits = count(r.text, TITLE);
  const ok = r.status === 200 && hits > homeCount + 1 && r.text.includes(AUTHOR);
  return { ok, status: r.status, hits };
}

async function verify(template, homeCount) {
  const url = template.replace('{q}', encodeURIComponent(TITLE));
  const r = await get(url);
  const hits = count(r.text, TITLE);
  const ok = r.status === 200 && hits > homeCount + 1 && r.text.includes(AUTHOR);
  return { ok, status: r.status, hits, finalUrl: r.url };
}

const { libraries } = JSON.parse(await readFile(new URL('../data/libraries.json', import.meta.url), 'utf8'));
const groups = new Map();
for (const lib of libraries) {
  const host = hostOf(lib.homepage || '');
  if (!host) continue;
  if (!groups.has(host)) groups.set(host, { host, homepage: lib.homepage, count: 0, regions: new Set() });
  const g = groups.get(host);
  g.count += 1;
  g.regions.add(lib.region);
}
// 많이 쓰는 홈페이지부터. 경북(37) 홈페이지는 모두 포함.
const ordered = [...groups.values()].sort((a, b) => b.count - a.count);
const targets = [...ordered.slice(0, LIMIT), ...ordered.slice(LIMIT).filter((g) => g.regions.has('37'))];

const results = [];
for (const g of targets) {
  const out = { host: g.host, libraries: g.count, homepage: g.homepage, template: null, post: null, via: null, tried: [] };
  try {
    const home = await get(/^https?:/i.test(g.homepage) ? g.homepage : `http://${g.homepage}`);
    out.charset = home.charset;
    const homeCount = count(home.text, TITLE);
    const forms = searchForms(home.text, home.url);
    const candidates = [
      // GET 폼은 주소로, POST 폼은 같은 요청서를 그대로 보내 보고(사이트 글자 인코딩 맞춤), 안 되면 주소로도 시도
      ...forms.filter((f) => f.method === 'get').map((f) => ({ via: 'form', template: formTemplate(f) })),
      ...forms
        .filter((f) => f.method === 'post')
        .map((f) => ({
          via: 'form-post',
          post: {
            action: f.base,
            fields: { ...Object.fromEntries(f.hidden.map((h) => [h.name, h.value])), [f.field]: '{q}' },
            charset: isEucKr(home.charset) ? 'EUC-KR' : 'UTF-8',
          },
        })),
      ...forms.filter((f) => f.method === 'post').map((f) => ({ via: 'form-post-as-get', template: formTemplate(f) })),
      // 스크립트 안에 들어 있는 검색 주소(예: location.href='/search/list.do?searchKeyword='+값)
      ...scriptSearchUrls(home.text, home.url).map((t) => ({ via: 'script', template: t })),
      ...PATTERNS.map((p) => ({ via: 'pattern', template: new URL(home.url).origin + p })),
    ];
    for (const c of candidates.slice(0, 16)) {
      await sleep(400);
      try {
        const v = c.post ? await verifyPost(c.post, homeCount) : await verify(c.template, homeCount);
        out.tried.push({ template: c.template, post: c.post, status: v.status, hits: v.hits });
        if (v.ok) {
          if (c.post) out.post = c.post;
          else out.template = c.template;
          out.via = c.via;
          break;
        }
      } catch (error) {
        out.tried.push({ template: c.template, post: c.post, error: String(error.message || error).slice(0, 80) });
      }
    }
  } catch (error) {
    out.error = String(error.message || error).slice(0, 120);
  }
  results.push(out);
  console.log(`${out.via ? '확인' : '못 찾음'} · ${g.host} (${g.count}곳)${out.via ? ` · ${out.via}` : ''}`);
  await sleep(500);
}

const found = results.filter((r) => r.template || r.post);
await writeFile('opac-probe.json', `${JSON.stringify({ checkedAt: new Date().toISOString(), title: TITLE, results }, null, 2)}\n`);
console.log(`\n바로 검색 주소 확인: ${found.length}/${results.length}개 홈페이지, 도서관 ${found.reduce((s, r) => s + r.libraries, 0)}곳`);

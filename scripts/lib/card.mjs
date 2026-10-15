// 인스타그램 '이번 주 인기 도서' 카드: 내용 정리, SVG 그리기, 캡션 (네트워크·파일 없이 테스트할 수 있는 부분)
// 디자인: 1080×1350, 흰 바탕, 노란 순위 칸, 파란 알약 표시. 책 표지 이미지는 넣지 않는다.

import { subjectParticle } from '../../js/util.js';

export const CARD = { width: 1080, height: 1350, pad: 88, accent: '#2E6BFF', yellow: '#FFD43B', ink: '#111827', ink2: '#374151', muted: '#4B5563' };

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// "데미안 :에밀 싱클레어의 젊은 날 이야기" → "데미안"
export function shortTitle(title) {
  const main = String(title || '').split(/\s*[:=]\s*|\s+-\s+|\s*\/\s*/)[0].trim();
  return main || String(title || '').trim();
}

// "헤르만 헤세, 전영애" → "헤르만 헤세"
export function firstAuthor(authors) {
  return String(authors || '').split(/\s*[,;]\s*/)[0].trim();
}

// measure(text) → 픽셀 너비. 넘치면 뒤를 잘라 '…'를 붙인다.
export function fitText(text, maxWidth, measure) {
  const full = String(text || '');
  if (!full || measure(full) <= maxWidth) return full;
  const chars = [...full];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join('').trimEnd()}…`) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

export function cardModel(popular) {
  const ageName = popular.ageName || '';
  const regionName = popular.regionName || '전국';
  const who = ageName ? `${ageName}${subjectParticle(ageName)}` : '사람들이';
  const items = (popular.items || []).slice(0, 5).map((b, i) => ({
    rank: Number(b.rank) || i + 1,
    title: shortTitle(b.title),
    author: firstAuthor(b.authors),
    isbn13: b.isbn13,
  }));
  return {
    endDt: popular.endDt,
    period: popular.period || '',
    regionName,
    ageName,
    lines: [`이번 주 ${who}`, '가장 많이 빌린 책'],
    subtitle: `${regionName} 공공도서관 · ${popular.period || ''}`.trim(),
    items,
    source: `출처: 도서관 정보나루 인기 대출 도서, 지난 7일${ageName ? ` · ${ageName}` : ''}`,
  };
}

function bookmark(x, y, size) {
  const s = size / 24;
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M6 3h12v18l-6-4-6 4z" fill="${CARD.yellow}" stroke="${CARD.ink}" stroke-width="1.4" stroke-linejoin="round"/>`;
}

// measure(text, {size, weight}) → 너비(px)
export function cardSvg(model, measure) {
  const { width, height, pad, accent, yellow, ink, ink2, muted } = CARD;
  const right = width - pad;
  const font = 'font-family="Pretendard"';
  const pillText = '이번 주 데이터';
  const pillW = Math.ceil(measure(pillText, { size: 32, weight: 800 })) + 56;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  out.push(`<rect width="${width}" height="${height}" fill="#FFFFFF"/>`);
  // 머리줄
  out.push(bookmark(pad - 4, 84, 58));
  out.push(`<text x="${pad + 64}" y="128" ${font} font-size="46" font-weight="800" letter-spacing="-1" fill="${ink}">책있나</text>`);
  out.push(`<rect x="${right - pillW}" y="78" width="${pillW}" height="66" rx="33" fill="${accent}"/>`);
  out.push(`<text x="${right - pillW / 2}" y="122" ${font} font-size="32" font-weight="800" fill="#FFFFFF" text-anchor="middle">${escapeXml(pillText)}</text>`);
  // 제목 두 줄
  model.lines.forEach((line, i) => {
    out.push(`<text x="${pad}" y="${262 + i * 97}" ${font} font-size="84" font-weight="900" letter-spacing="-2.5" fill="${ink}">${escapeXml(line)}</text>`);
  });
  out.push(`<text x="${pad}" y="428" ${font} font-size="34" font-weight="600" fill="${ink2}">${escapeXml(model.subtitle)}</text>`);
  // 순위 목록
  const textX = pad + 84 + 30;
  const maxTitle = right - textX;
  model.items.forEach((item, i) => {
    const top = 492 + i * 112;
    out.push(`<rect x="${pad}" y="${top}" width="84" height="84" rx="22" fill="${yellow}"/>`);
    out.push(`<text x="${pad + 42}" y="${top + 58}" ${font} font-size="46" font-weight="900" fill="${ink}" text-anchor="middle">${item.rank}</text>`);
    const title = fitText(item.title, maxTitle, (t) => measure(t, { size: 46, weight: 800, letterSpacing: -1 }));
    const author = fitText(item.author, maxTitle, (t) => measure(t, { size: 30, weight: 400 }));
    if (author) {
      out.push(`<text x="${textX}" y="${top + 40}" ${font} font-size="46" font-weight="800" letter-spacing="-1" fill="${ink}">${escapeXml(title)}</text>`);
      out.push(`<text x="${textX}" y="${top + 80}" ${font} font-size="30" font-weight="400" fill="${muted}">${escapeXml(author)}</text>`);
    } else {
      out.push(`<text x="${textX}" y="${top + 58}" ${font} font-size="46" font-weight="800" letter-spacing="-1" fill="${ink}">${escapeXml(title)}</text>`);
    }
  });
  // 아래 안내
  out.push(`<rect x="${pad}" y="1146" width="${width - pad * 2}" height="3" fill="${ink}"/>`);
  out.push(`<text x="${pad}" y="1212" ${font} font-size="34" font-weight="800" fill="${ink}">내 도서관에 있는지 한 번에 확인 · 프로필 링크</text>`);
  out.push(`<text x="${pad}" y="1258" ${font} font-size="24" font-weight="400" fill="${muted}">${escapeXml(model.source)}</text>`);
  out.push('</svg>');
  return out.join('\n');
}

export function caption(model) {
  const list = model.items.map((b) => `${b.rank}. ${b.title}${b.author ? ` — ${b.author}` : ''}`).join('\n');
  const tags = ['#책추천', '#이번주인기도서', '#도서관', '#책있나'];
  if (model.ageName) tags.push(`#${model.ageName.replace(/\s+/g, '')}책추천`);
  if (model.regionName && model.regionName !== '전국') tags.push(`#${model.regionName}도서관`);
  return [
    `${model.lines.join(' ')} TOP ${model.items.length}`,
    '',
    list,
    '',
    '내 도서관에 이 책이 있는지, 지금 빌릴 수 있는지 책있나에서 한 번에 확인해 보세요. 링크는 프로필에 있어요.',
    '',
    `${model.source} (${model.period}, ${model.regionName})`,
    '',
    tags.join(' '),
  ].join('\n');
}

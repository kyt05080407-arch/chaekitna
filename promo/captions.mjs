// 영상과 함께 올릴 글(캡션)·해시태그를 만든다. TOP 5 글은 data/popular.json에서 그때그때 만든다.
// 사용: node promo/captions.mjs → promo/.work/out/captions.md
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const popular = JSON.parse(await readFile(`${ROOT}data/popular.json`, 'utf8'));

// 저자 칸에 옮긴이까지 붙어 오면 첫 저자만
const firstAuthor = (a) => String(a).split(/\s*[,;]\s*/)[0];
const top5 = (items) => items.slice(0, 5).map((b, i) => `${i + 1}. ${b.title}${b.authors ? ` · ${firstAuthor(b.authors)}` : ''}${b.loanCount ? ` (${Number(b.loanCount).toLocaleString('ko-KR')}번)` : ''}`).join('\n');
const teen = (popular.groups || []).find((g) => g.age === '14');

const CAPTIONS = [
  {
    file: 'v1-pain.mp4',
    title: '1편 · 도서관마다 따로따로',
    text: `도서관 세 군데 다니면 검색도 세 번 했잖아요.

책있나는 책 한 권만 검색하면
내가 고른 도서관(최대 5곳)에 그 책이 있는지,
지금 빌릴 수 있는지 한 화면에 보여 줘요.

가입도 설치도 없어요. 프로필 링크에서 바로 써 보세요.

대출 정보는 도서관 정보나루 기준, 하루 전 정보예요.

#책있나 #도서관 #도서관대출 #공공도서관 #책추천 #독서 #북스타그램 #책읽기`,
  },
  {
    file: 'v2-top5.mp4',
    title: `2편 · 지난주 ${popular.regionName || '전국'} 인기 TOP 5 (매주 새로)`,
    text: `지난주(${popular.period}) ${popular.regionName || '전국'} 공공도서관에서 가장 많이 빌린 책 TOP 5

${top5(popular.items || [])}

우리 동네 도서관에 있는지는 프로필 링크(책있나)에서 확인해 보세요.

출처: 도서관 정보나루 인기대출도서

#도서관인기도서 #책추천 #베스트셀러 #요즘책 #독서 #북스타그램 #도서관 #책있나`,
  },
  teen && {
    file: 'v2-top5-teen.mp4',
    title: '2편 청소년판 · 청소년 인기 TOP 5 (매주 새로)',
    text: `지난주(${popular.period}) 청소년이 도서관에서 가장 많이 빌린 책 TOP 5

${top5(teen.items || [])}

우리 학교 근처 도서관에 있는지는 프로필 링크(책있나)에서 확인해 보세요.

출처: 도서관 정보나루 인기대출도서(청소년)

#청소년추천도서 #고등학생책추천 #중학생책추천 #책추천 #독서 #도서관 #북스타그램 #책있나`,
  },
  {
    file: 'v3-lists.mp4',
    title: '3편 · 권장도서 목록 한 번에',
    text: `수행평가 권장도서, 도서관에 있는지 한 권씩 찾고 있었다면

책있나에서 목록을 고르면 내 도서관에 있는 책이 한 번에 나와요.
어느 도서관에 있는지까지요.

· 서울대 권장도서 100선
· 고등학생·중학생이 요즘 많이 빌린 책
· 선생님이 준 목록은 붙여 넣기(최대 30권)

목록은 내 폰에만 저장돼요. 프로필 링크에서 써 보세요.

#수행평가 #권장도서 #서울대권장도서 #독서기록 #고등학생 #중학생 #도서관 #책있나`,
  },
].filter(Boolean);

const md = `# 책있나 홍보 영상 글

영상마다 아래 글을 그대로 붙여 넣으면 돼요. 영상에는 직접 만든 배경음악·효과음이 들어 있어요. 인스타그램 음악으로 바꾸고 싶으면 편집 화면에서 원본 소리를 낮추고 음악을 고르세요.

${CAPTIONS.map((c) => `## ${c.title}\n영상: ${c.file}\n\n\`\`\`\n${c.text}\n\`\`\``).join('\n\n')}
`;
await mkdir(`${ROOT}promo/.work/out`, { recursive: true });
await writeFile(`${ROOT}promo/.work/out/captions.md`, md);
console.log(`글 ${CAPTIONS.length}개 → promo/.work/out/captions.md`);

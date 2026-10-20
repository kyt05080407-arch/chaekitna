// 썰 영상 준비: AI 목소리(mp3) 앞뒤 빈 소리를 잘라 WAV로 바꾸고, 줄마다 시작 시각(timeline.json)을 정한다.
// 사용: node promo/story-prep.mjs s1-maker   (먼저 Promo TTS 작업 결과를 promo/.work/tts/<대본>에 받아 둔다)
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const id = process.argv[2];
if (!id) {
  console.error('사용: node promo/story-prep.mjs <대본 이름>');
  process.exit(1);
}
const story = JSON.parse(await readFile(`${ROOT}promo/stories/${id}.json`, 'utf8'));
const dir = `${ROOT}promo/.work/tts/${id}`;
const START = 0.35; // 영상 시작 후 첫 목소리까지
const TAIL = 0.9; // 마지막 목소리 뒤 여유

const trim =
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,' +
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,aresample=44100';

let t = START;
const lines = [];
for (const line of story.lines) {
  const wav = `${dir}/${line.id}.wav`;
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/${line.id}.mp3`, '-af', trim, '-ac', '2', '-c:a', 'pcm_s16le', wav]);
  if (r.status !== 0) throw new Error(`${line.id}: ${r.stderr}`);
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).stdout.toString().trim());
  lines.push({ id: line.id, t: Number(t.toFixed(3)), dur: Number(dur.toFixed(3)) });
  t += dur + (line.pause ?? 0.2);
}
const last = lines[lines.length - 1];
const total = Number((last.t + last.dur + TAIL).toFixed(2));
await writeFile(`${dir}/timeline.json`, `${JSON.stringify({ story: id, total, lines }, null, 2)}\n`);
console.log(`${id}: ${lines.length}줄, ${total}초`);
for (const l of lines) console.log(`  ${l.id} ${l.t.toFixed(2)}s +${l.dur.toFixed(2)}s`);

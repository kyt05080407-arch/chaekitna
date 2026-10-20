// 홍보 영상 소리 만들기(외부 음원 없이 직접 합성 → 저작권 걱정 없음)
// - 배경음악: 116BPM, C–G–Am–F 진행의 밝은 팝 비트(킥·클랩·하이햇·베이스·패드·플럭)
// - 효과음: 장면 전환(휙), 카드 등장(톡), 누르기(딸깍), 숫자 다 올라감(띵), 1위 공개(반짝)
// renderAudio({ duration, cues }) → 16비트 스테레오 WAV(Buffer)
// cues: [{ t: 초, type: 'whoosh'|'swoosh'|'pop'|'pop-big'|'tap'|'ding'|'sting'|'tick' }]

const SR = 44100;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const lpAlpha = (cut) => 1 - Math.exp((-2 * Math.PI * cut) / SR);

class Bus {
  constructor(n) {
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
    this.n = n;
  }
  // pan: -1(왼쪽) ~ 1(오른쪽)
  put(i, v, pan = 0) {
    if (i < 0 || i >= this.n) return;
    this.L[i] += v * Math.min(1, 1 - pan);
    this.R[i] += v * Math.min(1, 1 + pan);
  }
}

// ---------- 악기 ----------

function kick(bus, t0, amp = 0.45) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let i = 0; i < 0.45 * SR; i += 1) {
    const t = i / SR;
    const f = 48 + 110 * Math.exp(-t / 0.035);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t / 0.12) * Math.min(1, i / 40);
    // 폰에서도 '쿵'이 들리게 짧은 타격음
    const click = i < 160 ? Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-i / 35) * 0.22 : 0;
    bus.put(s0 + i, (Math.sin(ph) * env + click) * amp);
  }
}

function clap(bus, t0, rnd, amp = 0.2) {
  const s0 = Math.round(t0 * SR);
  let lp = 0;
  let prev = 0;
  for (let i = 0; i < 0.22 * SR; i += 1) {
    const t = i / SR;
    // 손뼉 세 번이 겹친 느낌
    const burst = t < 0.03 ? Math.exp(-((t % 0.01) / 0.0025)) : 0;
    const env = Math.max(burst, Math.exp(-(t - 0.02) / 0.07) * (t > 0.02 ? 1 : 0));
    const x = rnd() * 2 - 1;
    lp += lpAlpha(2400) * (x - lp);
    const hp = lp - prev;
    prev = lp;
    bus.put(s0 + i, hp * env * amp * 2.2, 0.08);
  }
}

function hat(bus, t0, rnd, amp = 0.05, pan = 0.25) {
  const s0 = Math.round(t0 * SR);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < 0.06 * SR; i += 1) {
    const x = rnd() * 2 - 1;
    const h1 = x - p1;
    p1 = x;
    const h2 = h1 - p2;
    p2 = h1;
    bus.put(s0 + i, h2 * Math.exp(-i / SR / 0.018) * amp, pan);
  }
}

// 폰 스피커에서도 들리게 배음(2·3·4배)을 섞고 900Hz 위는 깎는다
function bass(bus, t0, midi, len, amp = 0.26) {
  const s0 = Math.round(t0 * SR);
  const f = hz(midi);
  let ph = 0;
  let lp = 0;
  const a = lpAlpha(900);
  for (let i = 0; i < len * SR; i += 1) {
    const t = i / SR;
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, i / 120) * Math.exp(-t / 0.35) * Math.min(1, (len - t) / 0.02);
    const v = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.33 * Math.sin(3 * ph) + 0.2 * Math.sin(4 * ph);
    lp += a * (v - lp);
    bus.put(s0 + i, lp * env * amp);
  }
}

function pluck(bus, t0, midi, amp = 0.11, pan = 0) {
  const s0 = Math.round(t0 * SR);
  const f = hz(midi);
  let lp = 0;
  const a = lpAlpha(4500);
  for (let i = 0; i < 0.32 * SR; i += 1) {
    const t = i / SR;
    let v = 0;
    for (let k = 1; k <= 5; k += 1) v += Math.sin(2 * Math.PI * f * k * t) / k;
    lp += a * (v - lp);
    const env = Math.min(1, i / 60) * Math.exp(-t / 0.11);
    bus.put(s0 + i, lp * env * amp, pan);
  }
}

function pad(bus, t0, notes, len, amp = 0.17) {
  const s0 = Math.round(t0 * SR);
  for (let i = 0; i < (len + 0.3) * SR; i += 1) {
    const t = i / SR;
    const env = Math.min(1, t / 0.3) * (t > len ? Math.exp(-(t - len) / 0.12) : 1);
    let v = 0;
    notes.forEach((m, j) => {
      const f = hz(m);
      v += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t + j);
    });
    bus.put(s0 + i, (v / notes.length) * env * amp, Math.sin(t * 1.3) * 0.3);
  }
}

// ---------- 효과음 ----------

function whoosh(bus, t0, rnd, dur = 0.5, amp = 0.42) {
  const s0 = Math.round((t0 - dur * 0.45) * SR);
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < dur * SR; i += 1) {
    const p = i / (dur * SR);
    const cut = 250 + 2600 * Math.sin(Math.PI * p) ** 2;
    const x = rnd() * 2 - 1;
    lp += lpAlpha(cut) * (x - lp);
    lp2 += lpAlpha(cut * 1.4) * (lp - lp2);
    const env = Math.sin(Math.PI * p) ** 1.5;
    bus.put(s0 + i, lp2 * env * amp * 2.4, -0.7 + 1.4 * p);
  }
}

function pop(bus, t0, rnd, big = false) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  const amp = big ? 0.42 : 0.26;
  for (let i = 0; i < 0.14 * SR; i += 1) {
    const t = i / SR;
    const f = (big ? 380 : 560) + (big ? 520 : 420) * Math.min(1, t / 0.045);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, i / 30) * Math.exp(-t / (big ? 0.07 : 0.045));
    bus.put(s0 + i, (Math.sin(ph) + (i < 90 ? (rnd() * 2 - 1) * 0.15 : 0)) * env * amp);
  }
}

function tap(bus, t0, rnd) {
  const s0 = Math.round(t0 * SR);
  for (let i = 0; i < 0.06 * SR; i += 1) {
    const t = i / SR;
    const click = i < 180 ? (rnd() * 2 - 1) * Math.exp(-i / 40) * 0.5 : 0;
    bus.put(s0 + i, (click + Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t / 0.018) * 0.3) * 0.8);
  }
}

function bell(bus, t0, midi, amp, decay = 0.5, pan = 0) {
  const s0 = Math.round(t0 * SR);
  const f = hz(midi);
  for (let i = 0; i < (decay * 3) * SR; i += 1) {
    const t = i / SR;
    const env = Math.min(1, i / 40) * Math.exp(-t / decay);
    const v = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.08);
    bus.put(s0 + i, v * env * amp, pan);
  }
}

function ding(bus, t0) {
  bell(bus, t0, 88, 0.2, 0.35, -0.1); // E6
  bell(bus, t0 + 0.06, 95, 0.16, 0.45, 0.1); // B6
}

function sting(bus, t0, rnd) {
  [84, 88, 91, 96].forEach((m, k) => bell(bus, t0 + k * 0.07, m, 0.17, 0.5, -0.3 + k * 0.2)); // C6 E6 G6 C7
  // 반짝이는 소리
  let p = 0;
  for (let i = 0; i < 1.2 * SR; i += 1) {
    const t = i / SR;
    const x = rnd() * 2 - 1;
    const h = x - p;
    p = x;
    bus.put(Math.round(t0 * SR) + i, h * Math.min(1, t / 0.25) * Math.exp(-t / 0.35) * 0.05, Math.sin(t * 9) * 0.6);
  }
}

function tick(bus, t0) {
  const s0 = Math.round(t0 * SR);
  for (let i = 0; i < 0.04 * SR; i += 1) {
    const t = i / SR;
    bus.put(s0 + i, Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t / 0.012) * 0.07);
  }
}

// 띠용(만화 같은 '실패' 소리)
function boing(bus, t0) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let i = 0; i < 0.55 * SR; i += 1) {
    const t = i / SR;
    const f = 520 * Math.exp(-t / 0.35) + 140 + 30 * Math.sin(2 * Math.PI * 14 * t);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, i / 60) * Math.exp(-t / 0.22);
    bus.put(s0 + i, (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * env * 0.32);
  }
}

// 쾅(묵직하게 내려꽂힘)
function slam(bus, t0, rnd) {
  const s0 = Math.round(t0 * SR);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < 0.4 * SR; i += 1) {
    const t = i / SR;
    ph += (2 * Math.PI * (70 + 90 * Math.exp(-t / 0.04))) / SR;
    lp += lpAlpha(1800) * (rnd() * 2 - 1 - lp);
    const v = Math.sin(ph) * Math.exp(-t / 0.12) * 0.7 + lp * Math.exp(-t / 0.05) * 0.9;
    bus.put(s0 + i, v * 0.5);
  }
}

// 타자 소리(dur초 동안)
function typing(bus, t0, dur, rnd) {
  let t = t0;
  while (t < t0 + dur) {
    const s0 = Math.round(t * SR);
    const tone = 1800 + rnd() * 1400;
    for (let i = 0; i < 0.025 * SR; i += 1) {
      const x = (rnd() * 2 - 1) * Math.exp(-i / 50) * 0.35 + Math.sin((2 * Math.PI * tone * i) / SR) * Math.exp(-i / 90) * 0.12;
      bus.put(s0 + i, x * 0.7, rnd() * 0.6 - 0.3);
    }
    t += 0.06 + rnd() * 0.07;
  }
}

// ---------- 합치기 ----------

const CHORDS = [
  { root: 36, notes: [60, 64, 67] }, // C
  { root: 43, notes: [59, 62, 67] }, // G
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [57, 60, 65] }, // F
];

// style: 'pop'(116BPM, 기본) 또는 'hype'(140BPM, 박마다 킥, 16분 하이햇, 엇박 베이스 — 릴스용)
function music(bus, duration, rnd, { bpm, style = 'pop' } = {}) {
  const hype = style === 'hype';
  const beat = 60 / (bpm || (hype ? 140 : 116));
  const bar = beat * 4;
  for (let b = 0; b * bar < duration; b += 1) {
    const t = b * bar;
    const ch = CHORDS[b % 4];
    pad(bus, t, ch.notes, bar);
    for (let q = 0; q < 4; q += 1) {
      const tq = t + q * beat;
      if (hype || q === 0 || q === 2) kick(bus, tq, hype ? 0.55 : 0.45);
      if (!hype && q === 2 && b % 2 === 1) kick(bus, tq + beat * 0.5, 0.6);
      if (q === 1 || q === 3) clap(bus, tq, rnd);
      if (hype) {
        bass(bus, tq + beat / 2, ch.root + 12, beat * 0.45);
        for (let k = 0; k < 4; k += 1) hat(bus, tq + (k * beat) / 4, rnd, k === 2 ? 0.04 : 0.018);
      } else {
        bass(bus, tq, ch.root + 12, beat * 0.9);
        hat(bus, tq, rnd, 0.022);
        hat(bus, tq + beat / 2, rnd, 0.04);
      }
    }
    // 위로 올라가는 플럭 8분음표
    const arp = [0, 1, 2, 1, 0, 1, 2, 1];
    arp.forEach((k, j) => pluck(bus, t + j * (beat / 2), ch.notes[k] + 12, j % 2 ? 0.24 : 0.32, j % 2 ? 0.35 : -0.35));
  }
}

function effects(bus, cues, rnd) {
  for (const c of cues) {
    if (c.type === 'whoosh') whoosh(bus, c.t, rnd);
    else if (c.type === 'swoosh') whoosh(bus, c.t, rnd, 0.32, 0.3);
    else if (c.type === 'pop') pop(bus, c.t, rnd);
    else if (c.type === 'pop-big') pop(bus, c.t, rnd, true);
    else if (c.type === 'tap') tap(bus, c.t, rnd);
    else if (c.type === 'ding') ding(bus, c.t);
    else if (c.type === 'sting') sting(bus, c.t, rnd);
    else if (c.type === 'tick') tick(bus, c.t);
    else if (c.type === 'boing') boing(bus, c.t);
    else if (c.type === 'slam') slam(bus, c.t, rnd);
    else if (c.type === 'typing') typing(bus, c.t, c.dur || 1.5, rnd);
    else if (c.type === 'impact') {
      slam(bus, c.t, rnd);
      kick(bus, c.t, 0.9);
      whoosh(bus, c.t + 0.18, rnd, 0.4, 0.3);
    }
  }
}

// 비슷한 시각에 겹친 효과음은 하나로(0.1초 안의 같은 종류)
export function tidyCues(cues) {
  const out = [];
  for (const c of [...cues].filter((c) => Number.isFinite(c.t) && c.t >= 0).sort((a, b) => a.t - b.t)) {
    const last = out.findLast((o) => o.type === c.type);
    if (last && c.t - last.t < 0.1) continue;
    out.push(c);
  }
  return out;
}

// 16비트 PCM WAV 읽기 → { L, R } (44.1kHz 가정)
export function readWav(buf) {
  let p = 12;
  let ch = 2;
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') ch = buf.readUInt16LE(p + 10);
    if (id === 'data') {
      const frames = Math.floor(size / (2 * ch));
      const L = new Float32Array(frames);
      const R = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) {
        L[i] = buf.readInt16LE(p + 8 + i * 2 * ch) / 32768;
        R[i] = ch > 1 ? buf.readInt16LE(p + 10 + i * 2 * ch) / 32768 : L[i];
      }
      return { L, R };
    }
    p += 8 + size + (size % 2);
  }
  throw new Error('WAV data 없음');
}

/**
 * @param {{duration:number, cues?:object[], seed?:number, voice?:{t:number, L:Float32Array, R:Float32Array}[], bgm?:number}} o
 *   voice가 있으면 목소리를 가장 크게, 배경음악은 작게(목소리가 나올 때 더 작게) 섞는다. bgm: 배경음악 크기(기본 0.11, 목소리 영상은 0.045)
 */
export function renderAudio({ duration, cues = [], seed = 7, voice = [], bgm: bgmLevel, music: musicOpt = {} }) {
  const n = Math.ceil(duration * SR);
  const rnd = rng(seed);
  const bgm = new Bus(n);
  const sfx = new Bus(n);
  const vox = new Bus(n);
  music(bgm, duration, rnd, musicOpt);
  effects(sfx, tidyCues(cues), rnd);

  // 목소리: 크기를 맞춰 제자리에
  if (voice.length) {
    let vs = 0;
    let vn = 0;
    for (const v of voice) for (let i = 0; i < v.L.length; i += 1) (vs += v.L[i] ** 2 + v.R[i] ** 2), (vn += 2);
    const vg = 0.12 / (Math.sqrt(vs / (vn || 1)) || 1);
    for (const v of voice) {
      const s0 = Math.round(v.t * SR);
      for (let i = 0; i < v.L.length && s0 + i < n; i += 1) {
        vox.L[s0 + i] += v.L[i] * vg;
        vox.R[s0 + i] += v.R[i] * vg;
      }
    }
  }
  // 목소리가 나오는 동안 배경음악을 줄인다(빨리 줄이고 천천히 돌아옴)
  const duck = new Float32Array(n).fill(1);
  if (voice.length) {
    let env = 0;
    for (let i = 0; i < n; i += 1) {
      const a = Math.abs(vox.L[i]) + Math.abs(vox.R[i]);
      env = a > env ? env + (a - env) * 0.01 : env * 0.99993;
      duck[i] = 1 - 0.55 * Math.min(1, env / 0.06);
    }
  }

  // 배경음악 크기를 고르게 맞춘 뒤(효과음이 잘 들리게 조금 낮게) 섞는다
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += bgm.L[i] ** 2 + bgm.R[i] ** 2;
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const g = (bgmLevel ?? (voice.length ? 0.045 : 0.11)) / rms;
  const sfxGain = voice.length ? 0.7 : 1;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.04) * Math.min(1, (duration - t) / 1.2);
    L[i] = Math.tanh((bgm.L[i] * g * fade * duck[i] + sfx.L[i] * sfxGain + vox.L[i]) * 1.1);
    R[i] = Math.tanh((bgm.R[i] * g * fade * duck[i] + sfx.R[i] * sfxGain + vox.R[i]) * 1.1);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  // 높은 소리 살짝 깎기(10kHz 위를 부드럽게)
  const a = lpAlpha(10000);
  for (const ch of [L, R]) {
    for (let pass = 0; pass < 2; pass += 1) {
      let y = 0;
      for (let i = 0; i < n; i += 1) {
        y += a * (ch[i] - y);
        ch[i] = y;
      }
    }
  }
  peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = 0.85 / (peak || 1);

  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
  }
  return buf;
}

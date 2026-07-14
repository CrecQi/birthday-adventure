// ============================================================
// 音效 — Web Audio API 合成（无需外部音频文件）
// ============================================================

let audioCtx = null;

// ---- 背景音乐（循环播放）----
let bgm = null;

function startBGM() {
  if (!bgm) {
    bgm = new Audio("assets/audio/bgm.mp3");
    bgm.loop = true;
    bgm.volume = 0.35;
  }
  bgm.play().catch(() => {});
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone({ freq = 440, type = "sine", duration = 0.15, volume = 0.2, slideTo = null, delay = 0 }) {
  const ctx = ensureAudio();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playNoise({ duration = 0.12, volume = 0.15, filterFreq = 1200, delay = 0 }) {
  const ctx = ensureAudio();
  const t0 = ctx.currentTime + delay;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(t0);
  source.stop(t0 + duration + 0.02);
}

const SFX = {
  // 撞击箱子：短促木块敲击感
  boxHit() {
    playNoise({ duration: 0.08, volume: 0.22, filterFreq: 800 });
    playTone({ freq: 220, type: "triangle", duration: 0.12, volume: 0.18, slideTo: 140 });
    playTone({ freq: 440, type: "square", duration: 0.06, volume: 0.08 });
  },

  // 金币/爱心迸溅：一串轻快叮叮
  coinBurst() {
    [660, 880, 1100, 1320].forEach((f, i) => {
      playTone({ freq: f, type: "sine", duration: 0.1, volume: 0.1, delay: i * 0.04 });
    });
  },

  // 金币落地：清脆叮
  coinLand() {
    playTone({ freq: 880, type: "sine", duration: 0.07, volume: 0.1 });
    playTone({ freq: 1175, type: "triangle", duration: 0.09, volume: 0.07, delay: 0.02 });
  },

  // 捡起金币：可爱上行叮咚
  coinCollect() {
    [784, 988, 1175].forEach((f, i) => {
      playTone({ freq: f, type: "sine", duration: 0.09, volume: 0.11, delay: i * 0.045 });
    });
    playTone({ freq: 1568, type: "triangle", duration: 0.12, volume: 0.06, delay: 0.14 });
  },

  // 投币口：清脆叮当
  coinInsert() {
    playTone({ freq: 523, type: "sine", duration: 0.08, volume: 0.13 });
    playTone({ freq: 784, type: "triangle", duration: 0.1, volume: 0.1, delay: 0.04 });
    playTone({ freq: 1046, type: "sine", duration: 0.07, volume: 0.08, delay: 0.08 });
  },

  // 返回关卡：轻柔下行
  returnGame() {
    playTone({ freq: 440, type: "sine", duration: 0.18, volume: 0.1, slideTo: 330 });
    playTone({ freq: 330, type: "triangle", duration: 0.22, volume: 0.08, delay: 0.1, slideTo: 262 });
  },

  // 回去搜集：鼓励式双音
  warningDismiss() {
    playTone({ freq: 587, type: "sine", duration: 0.12, volume: 0.11 });
    playTone({ freq: 698, type: "triangle", duration: 0.15, volume: 0.09, delay: 0.07 });
    playTone({ freq: 880, type: "sine", duration: 0.1, volume: 0.07, delay: 0.14 });
  },

  // 进入神秘门
  doorEnter() {
    playTone({ freq: 330, type: "sine", duration: 0.3, volume: 0.12, slideTo: 660 });
    playTone({ freq: 440, type: "triangle", duration: 0.25, volume: 0.1, delay: 0.08, slideTo: 880 });
    playTone({ freq: 550, type: "sine", duration: 0.35, volume: 0.08, delay: 0.15, slideTo: 1100 });
  },

  // 摇手柄：机械咔哒 + 下滑音
  lever() {
    playNoise({ duration: 0.1, volume: 0.18, filterFreq: 400 });
    playTone({ freq: 180, type: "sawtooth", duration: 0.2, volume: 0.12, slideTo: 90 });
    playTone({ freq: 320, type: "square", duration: 0.08, volume: 0.08, delay: 0.12 });
  },

  // 转轮转动循环音（短促）
  reelTick() {
    playTone({ freq: 300 + Math.random() * 80, type: "square", duration: 0.03, volume: 0.04 });
  },

  // JACKPOT：欢快上行和弦
  jackpot() {
    [523, 659, 784, 1046].forEach((f, i) => {
      playTone({ freq: f, type: "triangle", duration: 0.35, volume: 0.16, delay: i * 0.12 });
      playTone({ freq: f * 2, type: "sine", duration: 0.25, volume: 0.06, delay: i * 0.12 + 0.05 });
    });
    playNoise({ duration: 0.25, volume: 0.1, filterFreq: 2000, delay: 0.45 });
  },
};

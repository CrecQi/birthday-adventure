// ============================================================
// 音效 — Web Audio API 合成（无需外部音频文件）
// 背景音乐 — Web Audio 无缝循环（10% 音量）
// ============================================================

const BGM_URL = "assets/audio/bgm.mp3";
const BGM_VOLUME = 0.15;

let audioCtx = null;
let bgmBuffer = null;
let bgmGain = null;
let bgmSource = null;
let bgmPlaying = false;

function setBgmDucked(duck) {
  if (!bgmGain) return;
  bgmGain.gain.value = duck ? BGM_VOLUME * 0.55 : BGM_VOLUME;
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

// 裁掉首尾静音，让循环更无缝
function trimBufferSilence(buffer, threshold = 0.008) {
  const data = buffer.getChannelData(0);
  let start = 0;
  let end = data.length - 1;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  const len = end - start + 1;
  if (len <= buffer.sampleRate * 0.5) return buffer;

  const trimmed = audioCtx.createBuffer(1, len, buffer.sampleRate);
  trimmed.getChannelData(0).set(data.subarray(start, end + 1));
  return trimmed;
}

function playBGMLoop() {
  if (!bgmBuffer) return;
  const ctx = ensureAudio();

  if (!bgmGain) {
    bgmGain = ctx.createGain();
    bgmGain.gain.value = BGM_VOLUME;
    bgmGain.connect(ctx.destination);
  }

  if (bgmSource) {
    try { bgmSource.stop(); } catch (_) { /* already stopped */ }
    bgmSource.disconnect();
  }

  bgmSource = ctx.createBufferSource();
  bgmSource.buffer = bgmBuffer;
  bgmSource.loop = true;
  bgmSource.connect(bgmGain);
  bgmSource.start(0);
  bgmPlaying = true;
}

function tryStartBGM() {
  if (!bgmBuffer) return Promise.resolve(false);
  const ctx = ensureAudio();

  const resumeWithTimeout = Promise.race([
    ctx.resume(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("resume timeout")), 1200)),
  ]);

  return resumeWithTimeout
    .then(() => {
      if (ctx.state !== "running") return false;
      playBGMLoop();
      return true;
    })
    .catch(() => false);
}

function startBGM() {
  return tryStartBGM();
}

// 带进度的预加载：下载 → 解码 → 尝试播放
function preloadBGM(onProgress) {
  return fetch(BGM_URL)
    .then((response) => {
      if (!response.ok) throw new Error("BGM fetch failed");
      const total = Number(response.headers.get("Content-Length")) || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      function pump() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            const merged = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
              merged.set(chunk, offset);
              offset += chunk.length;
            }
            onProgress(0.92);
            return merged.buffer;
          }
          chunks.push(value);
          loaded += value.length;
          if (total > 0) onProgress(Math.min(loaded / total, 0.88));
          return pump();
        });
      }
      return pump();
    })
    .then((arrayBuffer) => {
      const ctx = ensureAudio();
      return ctx.decodeAudioData(arrayBuffer);
    })
    .then((buffer) => {
      bgmBuffer = trimBufferSilence(buffer);
      onProgress(0.98);
      return tryStartBGM();
    });
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
  boxHit() {
    playNoise({ duration: 0.08, volume: 0.22, filterFreq: 800 });
    playTone({ freq: 220, type: "triangle", duration: 0.12, volume: 0.18, slideTo: 140 });
    playTone({ freq: 440, type: "square", duration: 0.06, volume: 0.08 });
  },

  coinBurst() {
    [660, 880, 1100, 1320].forEach((f, i) => {
      playTone({ freq: f, type: "sine", duration: 0.1, volume: 0.1, delay: i * 0.04 });
    });
  },

  coinLand() {
    playTone({ freq: 880, type: "sine", duration: 0.07, volume: 0.1 });
    playTone({ freq: 1175, type: "triangle", duration: 0.09, volume: 0.07, delay: 0.02 });
  },

  coinCollect() {
    [784, 988, 1175].forEach((f, i) => {
      playTone({ freq: f, type: "sine", duration: 0.09, volume: 0.11, delay: i * 0.045 });
    });
    playTone({ freq: 1568, type: "triangle", duration: 0.12, volume: 0.06, delay: 0.14 });
  },

  coinInsert() {
    playTone({ freq: 523, type: "sine", duration: 0.08, volume: 0.13 });
    playTone({ freq: 784, type: "triangle", duration: 0.1, volume: 0.1, delay: 0.04 });
    playTone({ freq: 1046, type: "sine", duration: 0.07, volume: 0.08, delay: 0.08 });
  },

  returnGame() {
    playTone({ freq: 440, type: "sine", duration: 0.18, volume: 0.1, slideTo: 330 });
    playTone({ freq: 330, type: "triangle", duration: 0.22, volume: 0.08, delay: 0.1, slideTo: 262 });
  },

  warningDismiss() {
    playTone({ freq: 587, type: "sine", duration: 0.12, volume: 0.11 });
    playTone({ freq: 698, type: "triangle", duration: 0.15, volume: 0.09, delay: 0.07 });
    playTone({ freq: 880, type: "sine", duration: 0.1, volume: 0.07, delay: 0.14 });
  },

  doorEnter() {
    playTone({ freq: 330, type: "sine", duration: 0.3, volume: 0.12, slideTo: 660 });
    playTone({ freq: 440, type: "triangle", duration: 0.25, volume: 0.1, delay: 0.08, slideTo: 880 });
    playTone({ freq: 550, type: "sine", duration: 0.35, volume: 0.08, delay: 0.15, slideTo: 1100 });
  },

  // 从管道另一端弹出：嗖～啵！
  pipeExit() {
    playNoise({ duration: 0.1, volume: 0.1, filterFreq: 500 });
    playTone({ freq: 200, type: "sine", duration: 0.18, volume: 0.12, slideTo: 720 });
    playTone({ freq: 880, type: "triangle", duration: 0.12, volume: 0.1, delay: 0.1 });
    playTone({ freq: 1175, type: "sine", duration: 0.08, volume: 0.07, delay: 0.16 });
  },

  lever() {
    playNoise({ duration: 0.1, volume: 0.18, filterFreq: 400 });
    playTone({ freq: 180, type: "sawtooth", duration: 0.2, volume: 0.12, slideTo: 90 });
    playTone({ freq: 320, type: "square", duration: 0.08, volume: 0.08, delay: 0.12 });
  },

  reelTick() {
    playTone({ freq: 300 + Math.random() * 80, type: "square", duration: 0.03, volume: 0.04 });
  },

  jackpot() {
    [523, 659, 784, 1046].forEach((f, i) => {
      playTone({ freq: f, type: "triangle", duration: 0.35, volume: 0.16, delay: i * 0.12 });
      playTone({ freq: f * 2, type: "sine", duration: 0.25, volume: 0.06, delay: i * 0.12 + 0.05 });
    });
    playNoise({ duration: 0.25, volume: 0.1, filterFreq: 2000, delay: 0.45 });
  },
};

// ============================================================
// PP生日大冒险 — 游戏主逻辑
//
// 箱子类型（全部悬空，必须跳起从下方顶开）：
//   layer 1          ：悬在低空，从地面起跳即可顶到
//   layer 2–4        ：侧面台面逐级起跳，走到悬空箱下方再顶开（箱子不接触台面，
//                      每层台面比上一层高 2.5 格，箱底距台面顶 2.5 格）
//   onPipe = true    ：悬在管道口正上方，只能站在管道口上起跳顶开；
//                      顶开后人物被弹进下方管道，从附近另一根管道跳出，再显示回忆
// ============================================================

const GRAVITY = 0.41;
const FRICTION = 0.85;
const MOVE_SPEED = 4.3;
const JUMP_FORCE = -10.5; // 起跳/落地更慢，高度仍约 3.5 格
const PHYSICS_FPS = 60;
const FIXED_DT = 1000 / PHYSICS_FPS;
const MAX_FRAME_DELTA = 100;
let TILE = 40;
const SHADOW = 4;
const HEART_BURST_DELAY = 900; // 先看爱心迸溅，再弹回忆
const MEMORY_REVEAL_TIMEOUT = 3500; // 超时后仍弹出回忆，避免一直等金币落地
const PIPE_WAIT_FRAMES = 22; // 管道内传送等待帧数

// 明亮香芋紫 + 奶油粉（高级感，不暗沉）
const C = {
  purple: "#C4B5FD",
  purpleLight: "#E9D5FF",
  purplePale: "#F5F0FF",
  purpleDark: "#A78BFA",
  cream: "#FFFBFE",
  blush: "#FCE7F3",
  black: "#3D3558",
  white: "#ffffff",
  bgSky: "#FFFBFE",
  grass: "#DDD6FE",
  ground: "#EDE9FE",
  gold: "#FFE08A",
  coinHeart: "#E53935",
  pipe: "#86EFAC",
  pipeDark: "#6EE7A0",
  heart: "#E9D5FF",
  door: "#DDD6FE",
  doorGlow: "#F0ABFC",
};

let canvas, ctx;
let gameWidth, gameHeight;
let player, platforms, boxes, coins, heartBubbles, pipes;
let keys = {};
let touchInput = { left: false, right: false, jump: false };
let totalCoins = 0;
let openedBoxes = 0;
let gamePaused = false;
let levelComplete = false;
let jumpHeld = false;
let camera = { x: 0, y: 0 };
let levelWidth = 0;
let groundTopY = 0;
let endDoor = null;
let animationId = null;
let lastFrameTime = 0;
let physicsAccumulator = 0;

// 开箱 / 管道流程状态
let boxOpeningAnim = false;
let pendingMemory = null;
let pendingMemoryIsReopen = false;
let pendingMemoryRevealStart = 0;
let pendingPipeMemory = null; // 管道传送结束后再弹回忆
let boxRehitCooldown = 0;
const VIDEO_VOLUME = 0.1;

const screens = {
  start: document.getElementById("start-screen"),
  game: document.getElementById("game-screen"),
  machine: document.getElementById("machine-screen"),
};
const coinCountEl = document.getElementById("coin-count");
const boxCountEl = document.getElementById("box-count");
const boxTotalEl = document.getElementById("box-total");
const memoryModal = document.getElementById("memory-modal");
const giftModal = document.getElementById("gift-modal");
const coinWarningModal = document.getElementById("coin-warning-modal");

// ---- 初始化 ----
function init() {
  canvas = document.getElementById("game-canvas");
  ctx = canvas.getContext("2d");
  boxTotalEl.textContent = BOX_CONFIG.length;
  document.querySelectorAll("[data-min-coins]").forEach((el) => {
    el.textContent = MIN_COINS_TO_ENTER_MACHINE;
  });
  document.querySelectorAll("[data-jackpot-coins]").forEach((el) => {
    el.textContent = MACHINE_JACKPOT_COINS;
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resizeCanvas);
  }

  document.getElementById("btn-start").addEventListener("click", startGame);
  memoryModal.addEventListener("click", (e) => {
    if (memoryModal.classList.contains("hidden")) return;
    if (e.target.closest("video")) return;
    closeMemory();
  });
  document.getElementById("coin-slot").addEventListener("click", insertCoin);
  document.getElementById("btn-lever").addEventListener("click", pullLever);
  document.getElementById("btn-return-game").addEventListener("click", returnToGame);
  document.getElementById("btn-warning-back").addEventListener("click", () => {
    SFX.warningDismiss();
    coinWarningModal.classList.add("hidden");
    returnToGame();
  });
  document.getElementById("btn-replay").addEventListener("click", replay);
  setupButtonSounds();
  setupControls();
  setupStartScreen();
}

const UI_SOUND_SKIP = new Set(["coin-slot", "btn-lever", "btn-warning-back", "btn-return-game"]);

function setupButtonSounds() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled || btn.classList.contains("touch-btn")) return;
    if (UI_SOUND_SKIP.has(btn.id)) return;
    ensureAudio();
    SFX.buttonClick();
  });
}

function setupStartScreen() {
  const loading = document.getElementById("start-loading");
  const ready = document.getElementById("start-ready");
  const fill = document.getElementById("load-fill");
  const cat = document.getElementById("load-cat");
  const percent = document.getElementById("load-percent");
  const loadLabel = loading.querySelector(".load-label");
  const screen = document.getElementById("start-screen");

  function updateProgress(p) {
    const pct = Math.round(p * 100);
    fill.style.width = `${pct}%`;
    cat.style.left = `calc(${pct}% - 0.7rem)`;
    percent.textContent = `${pct}%`;
  }

  function revealStartButton() {
    loading.classList.add("hidden");
    ready.classList.remove("hidden");
  }

  function showTapToPlay() {
    updateProgress(1);
    loadLabel.textContent = "音乐已准备好 🎵";
    percent.textContent = "轻触屏幕任意处播放音乐";
    loading.classList.add("tap-waiting");
  }

  function unlockAndPlay() {
    return ensureAudio().resume().then(() => tryStartBGM()).then((played) => {
      if (played) {
        loading.classList.remove("tap-waiting");
        revealStartButton();
        return true;
      }
      percent.textContent = "再点一次试试～";
      return false;
    });
  }

  function bindTapUnlock() {
    showTapToPlay();
    const handler = (e) => {
      e.preventDefault();
      unlockAndPlay().then((ok) => {
        if (ok) screen.removeEventListener("pointerdown", handler);
      });
    };
    screen.addEventListener("pointerdown", handler);
  }

  preloadBGM(updateProgress)
    .then((played) => {
      if (played) {
        updateProgress(1);
        revealStartButton();
      } else {
        bindTapUnlock();
      }
    })
    .catch(() => {
      loadLabel.textContent = "音乐加载失败";
      percent.textContent = "轻触屏幕重试";
      screen.addEventListener("pointerdown", () => setupStartScreen(), { once: true });
    });
}

function resizeCanvas() {
  const hud = document.querySelector(".hud");
  const controls = document.querySelector(".touch-controls");
  const hudH = hud ? hud.offsetHeight : 40;
  const isMobile = window.innerWidth < 768;
  const ctrlH = controls && isMobile ? controls.offsetHeight : 0;

  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;

  gameWidth = vw;
  gameHeight = Math.max(280, vh - hudH - ctrlH);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(gameWidth * dpr);
  canvas.height = Math.floor(gameHeight * dpr);
  canvas.style.width = `${gameWidth}px`;
  canvas.style.height = `${gameHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function computeTile() {
  return Math.round(Math.max(32, Math.min(44, gameHeight / 12.5)));
}

function setupControls() {
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space" || e.code === "ArrowUp") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  const bindTouch = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener("touchstart", (e) => { e.preventDefault(); touchInput[key] = true; });
    el.addEventListener("touchend", (e) => { e.preventDefault(); touchInput[key] = false; });
    el.addEventListener("mousedown", () => { touchInput[key] = true; });
    el.addEventListener("mouseup", () => { touchInput[key] = false; });
    el.addEventListener("mouseleave", () => { touchInput[key] = false; });
  };
  bindTouch("btn-left", "left");
  bindTouch("btn-right", "right");
  bindTouch("btn-jump", "jump");
}

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ---- 关卡构建 ----
function layerPlatformY(layer, groundY) {
  return groundY - TILE * (2.5 + (layer - 2) * 2.5);
}

/** #16 等高层箱：错落阶梯（无贴地低层平面，从地面可跳上 L2） */
function addClimbStaircase(bx, topLayer, groundY) {
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    if (p.type === "platform" && p.boxX === bx && (p.role === "step" || p.role === "main")) {
      platforms.splice(i, 1);
    }
  }

  // L2 … L(top-1)：逐级变短、向右错开（不再放最贴地那一层）
  for (let L = 2; L < topLayer; L++) {
    const idx = L - 2;
    const w = TILE * (2.4 - idx * 0.45);
    platforms.push({
      x: bx - TILE * (3.9 - idx * 0.95),
      y: layerPlatformY(L, groundY),
      w: Math.max(w, TILE * 1.5),
      h: TILE * 0.5,
      type: "platform",
      role: "step",
      boxX: bx,
    });
  }

  return addMainPlatform(bx, topLayer, groundY);
}

/** 去掉 #15 与 #16 之间最接近地面的那块平面（仅贴地低层，不动 L2 及以上） */
function removeLowestPlatformBetweenBoxes(boxA, boxB, groundY) {
  if (!boxA || !boxB) return;
  const left = Math.min(boxA.x, boxB.x) - TILE;
  const right = Math.max(boxA.x + boxA.w, boxB.x + boxB.w) + TILE;
  const belowL2 = layerPlatformY(2, groundY) + 4;
  let lowest = null;
  let lowestIdx = -1;
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.type !== "platform") continue;
    if (p.y >= groundY - 4) continue; // 地面
    if (p.y <= belowL2) continue; // 保留 L2 及以上
    const mid = p.x + p.w / 2;
    if (mid < left || mid > right) continue;
    if (!lowest || p.y > lowest.y) {
      lowest = p;
      lowestIdx = i;
    }
  }
  if (lowestIdx >= 0) platforms.splice(lowestIdx, 1);
}

/** 在箱子正下方放一块平面，高度与一层悬空箱（#17）距地面高度一致（3 格） */
function addUnderBoxPlatformAtBox17Height(bx, groundY) {
  const platY = groundY - TILE * 3; // 与 layer 1 箱子箱底同高
  const platW = TILE * 3;
  // 先清掉该箱同高度、正下方的旧平面，避免重复
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    if (p.type !== "platform" || p.boxX !== bx) continue;
    if (Math.abs(p.y - platY) < 2 && p.role !== "main") {
      platforms.splice(i, 1);
    }
  }
  platforms.push({
    x: bx - (platW - TILE) / 2,
    y: platY,
    w: platW,
    h: TILE * 0.5,
    type: "platform",
    role: "step",
    boxX: bx,
    underBox: true,
  });
}

/** 把 #16 正下方平面左侧的 L2 台阶左移，留出起跳间距以便跳上该平面 */
function shiftApproachStepLeftOfUnderBox(box, groundY) {
  if (!box) return;
  const under = platforms.find((p) =>
    p.type === "platform" && p.underBox && p.boxX === box.x
  );
  if (!under) return;

  const step2Y = layerPlatformY(2, groundY);
  const approach = platforms.find((p) =>
    p.type === "platform" &&
    p.role === "step" &&
    p.boxX === box.x &&
    !p.underBox &&
    Math.abs(p.y - step2Y) < 2
  );
  if (!approach) return;

  // 放到 under 平面左侧，间距约 2 格，方便助跑跳上
  approach.x = under.x - approach.w - TILE * 2.0;
}

/** 去掉某箱子正下方的其它平面（不含地面） */
function clearPlatformsDirectlyBelow(box, groundY) {
  const left = box.x - TILE * 0.35;
  const right = box.x + box.w + TILE * 0.35;
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    if (p.type !== "platform") continue;
    if (p.boxX === box.x) continue; // 本箱自己的台面保留
    const mid = p.x + p.w / 2;
    if (mid < left || mid > right) continue;
    if (p.y <= box.y + box.h - 4) continue; // 只删箱子下方
    if (p.y >= groundY - 4) continue; // 不删地面
    platforms.splice(i, 1);
  }
}

function addSideStepPlatform(bx, layer, groundY, opts = {}) {
  platforms.push({
    x: bx - TILE * 3.8,
    y: layerPlatformY(layer, groundY),
    w: TILE * 2.2,
    h: TILE * 0.5,
    type: "platform",
    role: "step",
    boxX: bx,
    pipeAvoidExempt: !!opts.pipeAvoidExempt,
  });
}

function addMainPlatform(bx, layer, groundY, opts = {}) {
  const platY = layerPlatformY(layer, groundY);
  const platW = TILE * 3;
  platforms.push({
    x: bx - (platW - TILE) / 2,
    y: platY,
    w: platW,
    h: TILE * 0.5,
    type: "platform",
    role: "main",
    boxX: bx,
    pipeAvoidExempt: !!opts.pipeAvoidExempt,
  });
  return platY - TILE * 3.5;
}

/** 高处箱子：低层左侧窄台阶逐级上升，顶层仅在箱正下方放主台面 */
function addHighBoxPlatforms(bx, layer, groundY, opts = {}) {
  for (let L = 2; L < layer; L++) {
    addSideStepPlatform(bx, L, groundY, opts);
  }
  return addMainPlatform(bx, layer, groundY, opts);
}

function platformCoversBox(pl, bx) {
  return pl.x <= bx + TILE * 0.15 && pl.x + pl.w >= bx + TILE * 0.85;
}

function ensureMainPlatformCoversBox(pl, bx) {
  if (pl.x > bx) pl.x = bx - TILE * 0.25;
  if (pl.x + pl.w < bx + TILE) pl.w = bx + TILE - pl.x + TILE * 0.25;
  pl.w = Math.max(pl.w, TILE * 2.5);
}

function canMergePlatforms(a, b) {
  if (a.role === "main" && b.role === "step") return false;
  if (a.role === "step" && b.role === "main") return false;
  return true;
}

function mergeAdjacentPlatforms() {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < platforms.length; i++) {
      const a = platforms[i];
      if (a.type !== "platform") continue;
      for (let j = i + 1; j < platforms.length; j++) {
        const b = platforms[j];
        if (b.type !== "platform") continue;
        if (!canMergePlatforms(a, b)) continue;
        if (Math.abs(a.y - b.y) > 2) continue;
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
        if (overlap >= -TILE * 0.5 || (gap >= 0 && gap <= TILE * 0.75)) {
          const left = Math.min(a.x, b.x);
          const right = Math.max(a.x + a.w, b.x + b.w);
          a.x = left;
          a.w = right - left;
          if (a.boxX == null && b.boxX != null) a.boxX = b.boxX;
          if (a.role === "step" || b.role === "step") a.role = "step";
          platforms.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
}

function mergeVerticalStepStacks() {
  const steps = platforms.filter((p) => p.type === "platform" && p.role === "step");
  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const a = steps[i];
      const b = steps[j];
      if (a.lowEntry || b.lowEntry) continue;
      if (a.boxX !== b.boxX) continue;
      if (Math.abs(a.x - b.x) > 2 || Math.abs(a.w - b.w) > 2) continue;
      if (Math.abs(a.y - b.y) <= TILE * 0.6) {
        const idx = platforms.indexOf(b);
        if (idx >= 0) platforms.splice(idx, 1);
        steps.splice(j, 1);
        j--;
      }
    }
  }
}

function resolvePlatformPipeOverlap() {
  const pipeSolids = platforms.filter((p) => p.type === "pipe");
  const gap = TILE * 1.2;

  for (const pl of platforms) {
    if (pl.type !== "platform") continue;
    // 管道避让例外：低层台阶 / 标记豁免的箱子附近台面不挤走
    if (pl.lowEntry || pl.pipeAvoidExempt) continue;

    for (const pp of pipeSolids) {
      if (pl.x + pl.w <= pp.x - gap || pl.x >= pp.x + pp.w + gap) continue;

      if (pl.role === "main" && pl.boxX != null) {
        const bx = pl.boxX;
        const pipeMid = pp.x + pp.w / 2;
        if (pipeMid <= bx) {
          const trimEnd = pp.x + pp.w + gap;
          if (pl.x < trimEnd) {
            const delta = trimEnd - pl.x;
            pl.x += delta;
            pl.w -= delta;
          }
        } else {
          const trimStart = pp.x - gap;
          if (pl.x + pl.w > trimStart) {
            pl.w = trimStart - pl.x;
          }
        }
        ensureMainPlatformCoversBox(pl, bx);
      } else {
        pl.x = pp.x - pl.w - gap;
      }
    }

    if (pl.x < TILE * 0.5) pl.x = TILE * 0.5;
  }
}

function ensureAllBoxesReachable(boxes, groundY) {
  for (const box of boxes) {
    if (box.layer < 2) continue;
    const platOpts = { pipeAvoidExempt: !!box.config?.pipeAvoidExempt };

    if (box.onPipe) {
      if (box.layer >= 2) {
        const hasStep = platforms.some((p) =>
          p.type === "platform" && p.role === "step" && p.boxX === box.x
        );
        if (!hasStep) addSideStepPlatform(box.x, 2, groundY, platOpts);
      }
      continue;
    }

    // 专用阶梯箱：整段重建，保证错落可爬
    if (box.config?.extraLowStep) {
      addClimbStaircase(box.x, box.layer, groundY);
      continue;
    }

    const needY = layerPlatformY(box.layer, groundY);
    let mainPlat = platforms.find((p) =>
      p.type === "platform" &&
      p.role === "main" &&
      p.boxX === box.x &&
      Math.abs(p.y - needY) < 2
    );

    if (!mainPlat || !platformCoversBox(mainPlat, box.x)) {
      if (mainPlat) {
        ensureMainPlatformCoversBox(mainPlat, box.x);
      } else {
        addMainPlatform(box.x, box.layer, groundY, platOpts);
      }
    }

    for (let L = 2; L < box.layer; L++) {
      const stepY = layerPlatformY(L, groundY);
      const hasLocalStep = platforms.some((p) =>
        p.type === "platform" &&
        p.role === "step" &&
        p.boxX === box.x &&
        !p.lowEntry &&
        Math.abs(p.y - stepY) < 2 &&
        p.x + p.w > box.x - TILE * 5.5
      );
      if (!hasLocalStep) {
        for (let i = platforms.length - 1; i >= 0; i--) {
          const p = platforms[i];
          if (
            p.type === "platform" &&
            p.role === "step" &&
            p.boxX === box.x &&
            !p.lowEntry &&
            Math.abs(p.y - stepY) < 2 &&
            p.x + p.w <= box.x - TILE * 5.5
          ) {
            platforms.splice(i, 1);
          }
        }
        addSideStepPlatform(box.x, L, groundY, platOpts);
      }
    }
  }
}

function buildLevel() {
  platforms = [];
  boxes = [];
  coins = [];
  heartBubbles = [];
  pipes = [];

  const groundY = gameHeight - TILE * 2;
  groundTopY = groundY;
  levelWidth = (BOX_CONFIG.length + 5) * TILE * 5;

  for (let x = 0; x < levelWidth; x += TILE) {
    platforms.push({ x, y: groundY, w: TILE, h: TILE, type: "ground" });
  }

  const spacing = Math.floor(levelWidth / (BOX_CONFIG.length + 1));

  BOX_CONFIG.forEach((cfg, i) => {
    let bx = spacing * (i + 1);
    if (cfg.shiftX) bx += cfg.shiftX * TILE;
    let boxY;
    let pipeRef = null;

    if (cfg.onPipe) {
      // ---- 管道口悬空箱 ----
      const pipeW = TILE * 1.4;
      const px = bx + (TILE - pipeW) / 2;
      const mouthY = groundY - TILE * 2.2;
      boxY = mouthY - TILE * 2.5;

      // 管道口箱子：仅保留一层侧面台面辅助上台（避免多层台面连成一片）
      if (cfg.layer >= 2) {
        addSideStepPlatform(bx, 2, groundY);
      }

      // 出口管道默认在右侧；若会撞到终点门则放到左侧
      let exitX = bx + TILE * 3.2;
      if (exitX + pipeW > levelWidth - TILE * 4.5) exitX = bx - TILE * 3.2;
      const exitMouthY = groundY - TILE * 2.2;
      pipeRef = { x: px, w: pipeW, mouthY, exitX, exitW: pipeW, exitMouthY };

      pipes.push({ x: px, w: pipeW, mouthY, h: groundY - mouthY });
      pipes.push({ x: exitX, w: pipeW, mouthY: exitMouthY, h: groundY - exitMouthY });
      platforms.push({ x: px, y: mouthY, w: pipeW, h: groundY - mouthY, type: "pipe" });
      platforms.push({ x: exitX, y: exitMouthY, w: pipeW, h: groundY - exitMouthY, type: "pipe" });
    } else if (cfg.floatHeight != null) {
      boxY = groundY - cfg.floatHeight * TILE;
    } else if (cfg.layer >= 2) {
      if (cfg.extraLowStep) {
        boxY = addClimbStaircase(bx, cfg.layer, groundY);
      } else {
        const platOpts = { pipeAvoidExempt: !!cfg.pipeAvoidExempt };
        boxY = addHighBoxPlatforms(bx, cfg.layer, groundY, platOpts);
      }
    } else {
      // ---- 第一层悬空箱：地面起跳即可顶到 ----
      boxY = groundY - TILE * 3;
    }

    boxes.push({
      x: bx, y: boxY, w: TILE, h: TILE,
      config: cfg,
      opened: false,
      bounceY: 0,
      bounceVel: 0,
      layer: cfg.layer,
      onPipe: cfg.onPipe,
      pipeRef,
    });
  });

  resolvePlatformPipeOverlap();
  mergeAdjacentPlatforms();
  mergeVerticalStepStacks();
  ensureAllBoxesReachable(boxes, groundY);
  resolvePlatformPipeOverlap();

  for (const box of boxes) {
    if (box.config?.clearPlatformBelow) {
      clearPlatformsDirectlyBelow(box, groundY);
    }
  }

  const box15 = boxes.find((b) => b.config?.id === 15);
  const box16 = boxes.find((b) => b.config?.id === 16);
  removeLowestPlatformBetweenBoxes(box15, box16, groundY);
  if (box16) {
    addUnderBoxPlatformAtBox17Height(box16.x, groundY);
    shiftApproachStepLeftOfUnderBox(box16, groundY);
  }

  const flagX = levelWidth - TILE * 3;
  // 终点神秘门（替代旗帜，需主动按跳跃进入）
  endDoor = {
    x: levelWidth - TILE * 3.2,
    y: groundY - TILE * 3.6,
    w: TILE * 2.6,
    h: TILE * 3.6,
  };

  player = {
    x: TILE * 2,
    y: groundY - TILE * 1.5,
    w: TILE * 0.7,
    h: TILE * 0.9,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    animFrame: 0,
    inPipe: null,       // null | falling_in | sinking | waiting
    pipeRef: null,
    pipeEscapeTimer: 0,
    pipeWait: 0,
  };

  camera.x = 0;
  camera.y = 0;
  totalCoins = 0;
  openedBoxes = 0;
  levelComplete = false;
  jumpHeld = false;
  boxOpeningAnim = false;
  pendingMemory = null;
  pendingMemoryIsReopen = false;
  pendingMemoryRevealStart = 0;
  pendingPipeMemory = null;
  boxRehitCooldown = 0;
  updateHUD();
}

// ---- 游戏循环 ----
function startGame() {
  ensureAudio();
  showScreen("game");
  resizeCanvas();
  TILE = computeTile();
  buildLevel();
  preloadBoxMedia();
  gamePaused = false;
  lastFrameTime = 0;
  physicsAccumulator = 0;
  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp = performance.now()) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const frameDelta = Math.min(timestamp - lastFrameTime, MAX_FRAME_DELTA);
  lastFrameTime = timestamp;

  try {
    if (!gamePaused) {
      physicsAccumulator += frameDelta;
      while (physicsAccumulator >= FIXED_DT) {
        update();
        physicsAccumulator -= FIXED_DT;
      }
    } else {
      physicsAccumulator = 0;
    }
    render();
  } catch (err) {
    console.error("游戏循环错误:", err);
    gamePaused = true;
  }
  animationId = requestAnimationFrame(gameLoop);
}

function update() {
  updateBubbles();
  updateCoins();
  updateBoxBounce();

  if (player.inPipe) {
    updatePipeState();
    updateCamera();
    tryRevealMemory();
    return;
  }

  const left = keys["ArrowLeft"] || keys["KeyA"] || touchInput.left;
  const right = keys["ArrowRight"] || keys["KeyD"] || touchInput.right;
  const jump = keys["Space"] || keys["ArrowUp"] || keys["KeyW"] || touchInput.jump;

  if (left) { player.vx = -MOVE_SPEED; player.facing = -1; }
  else if (right) { player.vx = MOVE_SPEED; player.facing = 1; }
  else { player.vx *= FRICTION; }

  if (jump && !jumpHeld && player.onGround) {
    if (tryEnterDoor()) {
      jumpHeld = true;
    } else {
      player.vy = JUMP_FORCE;
      player.onGround = false;
      jumpHeld = true;
    }
  }
  if (!jump) jumpHeld = false;

  player.vy += GRAVITY;
  player.x += player.vx;
  player.y += player.vy;
  player.onGround = false;
  player.animFrame++;

  for (const p of platforms) {
    if (!collides(player, p)) continue;
    if (player.vy > 0 && player.y + player.h - player.vy <= p.y + 6) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && player.y - player.vy >= p.y + p.h - 6) {
      player.y = p.y + p.h;
      player.vy = 0;
    } else {
      if (player.x + player.w / 2 < p.x + p.w / 2) player.x = p.x - player.w;
      else player.x = p.x + p.w;
      player.vx = 0;
    }
  }

  // 顶箱子：未开的走完整流程；已开的可再次顶开看回忆
  if (!boxOpeningAnim) {
    if (boxRehitCooldown > 0) boxRehitCooldown--;
    for (const box of boxes) {
      if (!isHittingBoxFromBelow(box)) continue;
      if (box.opened) {
        if (boxRehitCooldown === 0 && !gamePaused) {
          reopenBox(box);
          boxRehitCooldown = 28;
          player.vy = 2;
        }
      } else {
        openBox(box);
      }
      break;
    }
  }

  if (player.x < 0) player.x = 0;
  if (player.x > levelWidth - player.w) player.x = levelWidth - player.w;
  if (player.y > gameHeight + 100) {
    player.x = TILE * 2;
    player.y = groundTopY - TILE * 1.5;
    player.vy = 0;
  }

  updateCamera();
  tryRevealMemory();
}

// 爱心迸溅 → 小人落地 → 金币落地 → 再弹回忆
function tryRevealMemory() {
  if (!pendingMemory) return;
  if (player.inPipe) return; // 管道传送中不弹窗

  const elapsed = performance.now() - pendingMemoryRevealStart;
  if (elapsed < HEART_BURST_DELAY) return;

  const timedOut = elapsed >= MEMORY_REVEAL_TIMEOUT;
  if (!timedOut) {
    if (!player.onGround || Math.abs(player.vy) > 0.5) return;
    if (!pendingMemoryIsReopen && coins.some((c) => !c.settled)) return;
  }

  const cfg = pendingMemory;
  pendingMemory = null;
  pendingMemoryIsReopen = false;
  boxOpeningAnim = false;
  showMemory(cfg);
}

// 主动进入神秘门（需集齐全部金币）
function tryEnterDoor() {
  if (levelComplete || pendingMemory || player.inPipe) return false;
  if (openedBoxes < BOX_CONFIG.length) return false;
  if (totalCoins < MACHINE_JACKPOT_COINS) return false;
  if (!endDoor) return false;

  const atDoor = collides(player, endDoor);
  if (!atDoor) return false;

  levelComplete = true;
  SFX.doorEnter();
  goToMachine();
  return true;
}

function isNearDoor() {
  if (!endDoor || levelComplete) return false;
  const zone = { x: endDoor.x - TILE, y: endDoor.y - TILE * 0.5, w: endDoor.w + TILE * 2, h: endDoor.h + TILE };
  return collides(player, zone);
}

function updateCamera() {
  camera.x = player.x - gameWidth * 0.35;
  if (camera.x < 0) camera.x = 0;
  if (camera.x > levelWidth - gameWidth) camera.x = levelWidth - gameWidth;

  // 垂直跟随：登到第 3 层附近时画面上移，下来时回落
  // camera.y < 0 表示视角上移（看到更高的平台）
  const screenY = player.y - camera.y;
  let desiredY = camera.y;
  const topBand = gameHeight * 0.24;
  const bottomBand = gameHeight * 0.72;
  if (screenY < topBand) desiredY = player.y - topBand;
  else if (screenY > bottomBand) desiredY = player.y - bottomBand;

  // 地面默认视角为 0；只允许上移（负值），平滑跟随
  desiredY = Math.min(0, desiredY);
  const minCamY = -TILE * 10;
  desiredY = Math.max(minCamY, desiredY);
  camera.y += (desiredY - camera.y) * 0.14;
  if (Math.abs(desiredY - camera.y) < 0.35) camera.y = desiredY;
}

function updateBoxBounce() {
  for (const box of boxes) {
    if (box.bounceVel !== 0 || box.bounceY !== 0) {
      box.bounceVel += 0.8;
      box.bounceY += box.bounceVel;
      if (box.bounceY > 0) { box.bounceY = 0; box.bounceVel = -box.bounceVel * 0.5; }
      if (Math.abs(box.bounceVel) < 0.3 && box.bounceY === 0) box.bounceVel = 0;
    }
  }
}

// 金币有重力：从高处箱子撒下后落到地面，永不消失，直到被捡走
let lastCoinLandSound = 0;
function updateCoins() {
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (!c.settled) {
      c.vy += 0.35;
      c.x += c.vx;
      c.y += c.vy;
      if (c.y >= groundTopY - 12) {
        c.y = groundTopY - 12;
        c.settled = true;
        const now = performance.now();
        if (now - lastCoinLandSound > 40) {
          SFX.coinLand();
          lastCoinLandSound = now;
        }
        for (const pipe of pipes) {
          if (c.x > pipe.x - 8 && c.x < pipe.x + pipe.w + 8) {
            c.x = c.x < pipe.x + pipe.w / 2 ? pipe.x - 14 : pipe.x + pipe.w + 14;
          }
        }
      }
    }
    c.bob += 0.08;
    if (collides(player, { x: c.x - 10, y: c.y - 10, w: 20, h: 20 })) {
      totalCoins += c.value;
      SFX.coinCollect();
      spawnHeartBurst(c.x, c.y, 0.3);
      coins.splice(i, 1);
      updateHUD();
    }
  }
}

// ---- 管道流程：顶开后弹进管道 → 出口弹出 → 再显示回忆 ----
function beginPipeFallIn(pipeRef) {
  const targetX = pipeRef.x + (pipeRef.w - player.w) / 2;
  player.vx = (targetX - player.x) * 0.18;
  player.vy = Math.max(player.vy, 5);
  player.onGround = false;
  player.inPipe = "falling_in";
  player.pipeRef = pipeRef;
}

function updatePipeState() {
  const pipe = player.pipeRef;
  if (!pipe) {
    player.inPipe = null;
    return;
  }

  if (player.inPipe === "falling_in") {
    const targetX = pipe.x + (pipe.w - player.w) / 2;
    player.vx += (targetX - player.x) * 0.12;
    player.vx *= 0.9;
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;
    if (player.y + player.h >= pipe.mouthY - 2) {
      player.x = targetX;
      player.y = pipe.mouthY - player.h;
      player.vx = 0;
      player.vy = 0;
      player.inPipe = "sinking";
    }
    return;
  }

  if (player.inPipe === "sinking") {
    player.y += 4;
    if (player.y > pipe.mouthY + TILE * 1.6) {
      player.inPipe = "waiting";
      player.pipeWait = PIPE_WAIT_FRAMES;
    }
    return;
  }

  if (player.inPipe === "waiting") {
    player.pipeWait--;
    if (player.pipeWait <= 0) {
      ensureAudio();
      SFX.pipeExit();
      player.x = pipe.exitX + (pipe.exitW - player.w) / 2;
      player.y = pipe.exitMouthY - player.h - 2;
      player.vy = -11;
      player.vx = 2.5;
      player.facing = 1;
      spawnHeartBurst(player.x + player.w / 2, player.y, 0.4);
      player.inPipe = null;
      player.pipeRef = null;
      if (pendingPipeMemory) {
        startMemoryReveal(pendingPipeMemory, false);
        pendingPipeMemory = null;
      }
    }
  }
}

function updateBubbles() {
  for (let i = heartBubbles.length - 1; i >= 0; i--) {
    const h = heartBubbles[i];
    h.x += h.vx; h.y += h.vy;
    h.vy += 0.08;
    h.vx *= 0.98;
    h.rotation += h.rotSpeed;
    h.life--;
    if (h.life <= 0) heartBubbles.splice(i, 1);
  }
}

function collides(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---- 爱心迸溅（永久保留的设计）----
function spawnHeartBurst(x, y, scale = 1) {
  const colors = [C.heart, C.purpleLight, C.purple, "#E9D5FF", "#F0ABFC", "#FDA4AF"];
  const count = Math.max(6, Math.floor(24 * scale));
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 3 + Math.random() * 7;
    heartBubbles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: 45 + Math.random() * 35,
      size: (5 + Math.random() * 9) * Math.max(scale, 0.6),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.25,
      isHeart: Math.random() > 0.3,
    });
  }
}

function isHittingBoxFromBelow(box) {
  return (
    player.vy < 0 &&
    player.x + player.w > box.x &&
    player.x < box.x + box.w &&
    player.y <= box.y + box.h &&
    player.y + player.h > box.y + box.h * 0.5
  );
}

function triggerBoxOpenPresentation(box) {
  box.bounceVel = -6;
  SFX.boxHit();
  SFX.coinBurst();
  spawnHeartBurst(box.x + box.w / 2, box.y + box.h / 2, 1.2);
}

function startMemoryReveal(cfg, isReopen = false) {
  boxOpeningAnim = true;
  pendingMemory = cfg;
  pendingMemoryIsReopen = isReopen;
  pendingMemoryRevealStart = performance.now();
}

function openBox(box) {
  if (box.opened || boxOpeningAnim) return;
  box.opened = true;
  openedBoxes++;

  const cfg = box.config;
  for (let i = 0; i < cfg.coins; i++) {
    coins.push({
      x: box.x + box.w / 2,
      y: box.y - 8,
      vx: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 3),
      vy: -(2 + Math.random() * 4),
      value: 1,
      bob: Math.random() * Math.PI * 2,
      settled: false,
    });
  }

  triggerBoxOpenPresentation(box);
  updateHUD();
  preloadMemoryImage(cfg);

  if (box.onPipe && box.pipeRef) {
    // 顶开后立刻弹进管道；回忆等出口弹出后再显示
    boxOpeningAnim = true;
    pendingPipeMemory = cfg;
    pendingMemory = null;
    beginPipeFallIn(box.pipeRef);
  } else {
    startMemoryReveal(cfg, false);
  }
}

function reopenBox(box) {
  if (boxOpeningAnim || gamePaused) return;
  triggerBoxOpenPresentation(box);
  preloadMemoryImage(box.config);
  startMemoryReveal(box.config, true);
}

function updateHUD() {
  coinCountEl.textContent = totalCoins;
  boxCountEl.textContent = openedBoxes;
}

// ---- 绘图工具 ----
function drawDoodleRect(x, y, w, h, fill, opts = {}) {
  const { radius = 6, shadow = true, border = 3 } = opts;
  if (shadow) {
    ctx.fillStyle = C.black;
    roundRect(ctx, x + SHADOW, y + SHADOW, w, h, radius);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = C.black;
  ctx.lineWidth = border;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawFlower(cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.fillStyle = C.purpleLight;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.7, size * 0.45, size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = C.purple;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPipe(pipe) {
  const rimH = TILE * 0.55;
  // 管身（加宽实心，避免下沉时角色从两侧露出来）
  drawDoodleRect(pipe.x, pipe.mouthY + rimH * 0.35, pipe.w, pipe.h - rimH * 0.35, C.pipe, { radius: 3, shadow: false });
  // 再铺一层不带描边的实心，盖住管底/缝隙
  ctx.fillStyle = C.pipe;
  ctx.fillRect(pipe.x + 2, pipe.mouthY + rimH * 0.5, pipe.w - 4, pipe.h - rimH * 0.5 + 2);
  // 管口（略宽）
  drawDoodleRect(pipe.x - 4, pipe.mouthY, pipe.w + 8, rimH, C.pipeDark, { radius: 6, shadow: false });
  // 管口内侧阴影，强化“吞进去”的感觉
  ctx.fillStyle = "rgba(61, 53, 88, 0.22)";
  ctx.fillRect(pipe.x + 2, pipe.mouthY + rimH * 0.55, pipe.w - 4, rimH * 0.35);
}

function drawCoinHeart(cx, cy) {
  const s = 7;
  // 爱心几何中心约在 y = 0.35s，上移后与金币圆心对齐
  const centerY = s * 0.35;
  ctx.save();
  ctx.translate(cx, cy - centerY);
  ctx.fillStyle = C.coinHeart;
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.3);
  ctx.bezierCurveTo(-s, -s * 0.3, -s, s * 0.5, 0, s);
  ctx.bezierCurveTo(s, s * 0.5, s, -s * 0.3, 0, s * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHeartBubble(h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rotation);
  ctx.globalAlpha = Math.min(1, h.life / 30);
  ctx.fillStyle = h.color;
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 1.5;
  if (h.isHeart) {
    const s = h.size;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(-s, -s * 0.3, -s, s * 0.5, 0, s);
    ctx.bezierCurveTo(s, s * 0.5, s, -s * 0.3, 0, s * 0.3);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, h.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.arc(-h.size * 0.15, -h.size * 0.15, h.size * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- 渲染 ----
function render() {
  ctx.clearRect(0, 0, gameWidth, gameHeight);
  ctx.fillStyle = C.bgSky;
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  ctx.fillStyle = C.purplePale;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(0, gameHeight * 0.7, gameWidth, gameHeight * 0.3);
  ctx.globalAlpha = 1;

  drawClouds();

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // 平台（管道实体由 drawPipe 单独画）
  for (const p of platforms) {
    if (p.type === "pipe") continue;
    if (p.type === "ground") {
      drawDoodleRect(p.x, p.y, p.w, p.h, C.ground, { radius: 4, shadow: false });
      ctx.fillStyle = C.grass;
      roundRect(ctx, p.x + 2, p.y, p.w - 4, 10, 3);
      ctx.fill();
      ctx.strokeStyle = C.black;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + 2, p.y + 10);
      ctx.lineTo(p.x + p.w - 2, p.y + 10);
      ctx.stroke();
    } else {
      drawDoodleRect(p.x, p.y, p.w, p.h, C.white, { radius: 8 });
    }
  }

  // 箱子（全部悬空）
  for (const box of boxes) {
    const by = box.y + box.bounceY;
    if (box.opened) {
      drawDoodleRect(box.x, by + box.h * 0.65, box.w, box.h * 0.35, C.purpleDark, { radius: 4 });
    } else {
      const boxColor = box.layer >= 3 ? C.purpleDark : box.layer === 2 ? C.purple : C.purpleLight;
      drawDoodleRect(box.x, by, box.w, box.h, boxColor, { radius: 8 });
      ctx.fillStyle = C.white;
      ctx.font = `900 ${TILE * 0.55}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", box.x + box.w / 2, by + box.h / 2 + 2);
      ctx.strokeStyle = C.black;
      ctx.lineWidth = 1.5;
      ctx.strokeText("?", box.x + box.w / 2, by + box.h / 2 + 2);
    }
  }

  // 金币
  for (const c of coins) {
    const bobY = c.settled ? Math.sin(c.bob) * 3 : 0;
    const cy = c.y + bobY;
    ctx.beginPath();
    ctx.arc(c.x + 2, cy + 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.black;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.strokeStyle = C.black;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    drawCoinHeart(c.x, cy);
  }

  // 终点神秘门
  if (endDoor) drawEndDoor(endDoor);

  drawPlayer();

  // 管道画在角色之后：下沉/钻出时角色被管道遮住，效果自然
  for (const pipe of pipes) drawPipe(pipe);

  // 门前提示
  if (isNearDoor()) {
    if (totalCoins >= MACHINE_JACKPOT_COINS && openedBoxes >= BOX_CONFIG.length) {
      drawHintText("按空格进入神秘门 🚪", player.x + player.w / 2, player.y - 18);
    } else {
      drawHintText("🪙 小宝要搜集到所有金币才能来敲门儿哦！", player.x + player.w / 2, player.y - 18, {
        maxWidth: Math.min(gameWidth * 0.9, 340),
        fontSize: 13,
      });
    }
  }

  for (const h of heartBubbles) drawHeartBubble(h);

  ctx.restore();
}

function drawPlayer() {
  // 已完全进入管道：不绘制，避免在管底露馅
  if (player.inPipe === "sinking" || player.inPipe === "waiting") return;

  const { x, y, w, h, facing } = player;
  const bounce = player.onGround && !player.inPipe ? Math.abs(Math.sin(player.animFrame * 0.3)) * 2 : 0;

  ctx.save();
  // 正在掉入管道：裁剪到管口以上，只露出尚未吞进的部分
  if (player.inPipe === "falling_in" && player.pipeRef) {
    const mouth = player.pipeRef.mouthY + TILE * 0.12;
    ctx.beginPath();
    ctx.rect(x - TILE, -TILE * 20, w + TILE * 2, mouth + TILE * 20);
    ctx.clip();
  }

  if (facing < 0) {
    ctx.translate(x + w, 0);
    ctx.scale(-1, 1);
    drawMarioSprite(0, y - bounce, w, h);
  } else {
    drawMarioSprite(x, y - bounce, w, h);
  }
  ctx.restore();
}

function drawMarioSprite(x, y, w, h) {
  ctx.fillStyle = C.black;
  ctx.fillRect(x + SHADOW, y + SHADOW, w, h);
  ctx.fillStyle = C.purple;
  ctx.fillRect(x, y, w, h * 0.3);
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h * 0.3);
  ctx.fillStyle = "#FFE0BD";
  ctx.fillRect(x + w * 0.1, y + h * 0.25, w * 0.8, h * 0.25);
  ctx.strokeRect(x + w * 0.1, y + h * 0.25, w * 0.8, h * 0.25);
  ctx.fillStyle = C.purple;
  ctx.fillRect(x + w * 0.05, y + h * 0.5, w * 0.9, h * 0.3);
  ctx.strokeRect(x + w * 0.05, y + h * 0.5, w * 0.9, h * 0.3);
  ctx.fillStyle = C.white;
  ctx.fillRect(x + w * 0.05, y + h * 0.65, w * 0.9, h * 0.35);
  ctx.strokeRect(x + w * 0.05, y + h * 0.65, w * 0.9, h * 0.35);
  ctx.fillStyle = C.purpleDark;
  ctx.font = `bold ${w * 0.18}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("♥", x + w * 0.3, y + h * 0.76);
  ctx.fillText("♥", x + w * 0.7, y + h * 0.76);
  ctx.fillStyle = C.black;
  ctx.fillRect(x, y + h * 0.88, w * 0.45, h * 0.12);
  ctx.fillRect(x + w * 0.55, y + h * 0.88, w * 0.45, h * 0.12);
}

function drawHintText(text, x, y, opts = {}) {
  const fontSize = opts.fontSize || 15;
  const maxWidth = opts.maxWidth || 0;
  ctx.font = `900 ${fontSize}px ZCOOL KuaiLe, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 4;
  ctx.fillStyle = C.purpleDark;

  const lines = [];
  if (maxWidth > 0 && ctx.measureText(text).width > maxWidth) {
    // 尽量在标点或中间断开
    const mid = Math.ceil(text.length / 2);
    let split = mid;
    for (let i = mid; i < text.length - 2; i++) {
      if ("，。！？、,.!?".includes(text[i])) { split = i + 1; break; }
    }
    if (split === mid) {
      for (let i = mid; i > 2; i--) {
        if ("，。！？、,.!?".includes(text[i])) { split = i + 1; break; }
      }
    }
    lines.push(text.slice(0, split), text.slice(split));
  } else {
    lines.push(text);
  }

  const lineH = fontSize + 4;
  lines.forEach((line, i) => {
    const ly = y - (lines.length - 1 - i) * lineH;
    ctx.strokeText(line, x, ly);
    ctx.fillText(line, x, ly);
  });
}

// 神秘门 — 替代终点旗帜
function drawEndDoor(door) {
  const { x, y, w, h } = door;
  const ready = openedBoxes >= BOX_CONFIG.length;
  const glow = ready && Math.sin(Date.now() / 400) * 0.15 + 0.85;

  // 门框
  drawDoodleRect(x - 6, y - 8, w + 12, h + 8, ready ? C.door : C.purplePale, { radius: 10 });

  // 门拱（挖空效果）
  ctx.fillStyle = C.bgSky;
  roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 8);
  ctx.fill();

  // 门内光晕（箱子全开时发光）
  if (ready) {
    ctx.fillStyle = `rgba(240, 171, 252, ${0.25 * glow})`;
    roundRect(ctx, x + 8, y + 10, w - 16, h - 18, 6);
    ctx.fill();
  }

  // 门把手
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(x + w - 16, y + h * 0.55, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 门上标记
  ctx.fillStyle = ready ? C.purpleDark : C.purpleLight;
  ctx.font = `bold ${TILE * 0.35}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ready ? "🎰" : "🔒", x + w / 2, y + h * 0.45);

  // 门槛
  ctx.fillStyle = C.ground;
  ctx.fillRect(x - 4, y + h - 6, w + 8, 8);
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y + h - 6, w + 8, 8);
}

function drawClouds() {
  const cloudLayouts = [
    [80, 55, 1], [320, 85, 0.85], [560, 45, 1.15], [820, 75, 0.95], [1050, 60, 0.75],
  ];
  cloudLayouts.forEach(([cx, cy, scale]) => {
    const sx = ((cx - camera.x * 0.2) % (gameWidth + 260) + gameWidth + 260) % (gameWidth + 260) - 120;
    drawDoodleCloud(sx, cy, scale);
  });
}

// 简笔画云朵：三弧蓬松外形，无五官
function drawDoodleCloud(x, y, scale) {
  const s = scale;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const drawShape = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(x + 6 * s + ox, y + 24 * s + oy);
    ctx.arc(x + 18 * s + ox, y + 24 * s + oy, 11 * s, Math.PI, 0);
    ctx.arc(x + 36 * s + ox, y + 22 * s + oy, 14 * s, Math.PI, 0);
    ctx.arc(x + 52 * s + ox, y + 24 * s + oy, 9 * s, Math.PI, 0);
    ctx.lineTo(x + 61 * s + ox, y + 30 * s + oy);
    ctx.lineTo(x + 6 * s + ox, y + 30 * s + oy);
    ctx.closePath();
  };

  drawShape(3, 3);
  ctx.fillStyle = "rgba(61, 53, 88, 0.08)";
  ctx.fill();

  drawShape(0, 0);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.strokeStyle = C.black;
  ctx.lineWidth = 2.5 * Math.min(s, 1.1);
  ctx.stroke();
  ctx.restore();
}

// ---- 回忆弹窗 ----
const mediaPreloadCache = new Map();

function preloadBoxMedia() {
  const items = [...BOX_CONFIG].sort((a, b) => {
    if (a.type === "video" && b.type !== "video") return -1;
    if (b.type === "video" && a.type !== "video") return 1;
    return 0;
  });
  items.forEach((cfg) => {
    if (mediaPreloadCache.has(cfg.src)) return;
    if (cfg.type === "video") {
      getMemoryVideo(cfg);
    } else if (cfg.type === "image" && !cfg.src.endsWith(".svg")) {
      preloadMemoryImage(cfg);
    }
  });
}

function preloadMemoryImage(cfg) {
  if (mediaPreloadCache.has(cfg.src)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = cfg.src;
  mediaPreloadCache.set(cfg.src, img);
}

function applyMediaOrientation(mediaEl, width, height) {
  const modalContent = mediaEl.closest(".modal-content");
  const portrait = height > width;
  mediaEl.classList.toggle("is-portrait", portrait);
  modalContent?.classList.toggle("is-portrait", portrait);
}

function resetMediaOrientation() {
  const mediaEl = document.getElementById("memory-media");
  const modalContent = mediaEl?.closest(".modal-content");
  mediaEl?.classList.remove("is-portrait");
  modalContent?.classList.remove("is-portrait");
}

function showMemoryLoading(mediaEl, kind = "image") {
  const icon = kind === "video" ? "🎬" : "📷";
  const text = kind === "video" ? "视频加载中…" : "照片加载中…";
  mediaEl.innerHTML = `<div class="memory-loading"><span>${icon}</span><p>${text}</p></div>`;
}

function getMemoryVideo(cfg) {
  let video = mediaPreloadCache.get(cfg.src);
  if (!(video instanceof HTMLVideoElement)) {
    video = document.createElement("video");
    video.preload = "auto";
    video.playsInline = true;
    video.muted = false;
    video.src = cfg.src;
    if (cfg.poster) {
      video.poster = cfg.poster;
      const poster = new Image();
      poster.decoding = "async";
      poster.src = cfg.poster;
    }
    video.load();
    mediaPreloadCache.set(cfg.src, video);
  }
  return video;
}

function mountMemoryVideo(cfg, mediaEl) {
  const video = getMemoryVideo(cfg);
  video.controls = true;
  video.playsInline = true;
  video.preload = "auto";
  video.muted = false;
  video.volume = VIDEO_VOLUME;
  if (cfg.poster) video.poster = cfg.poster;
  video.onerror = () => showPlaceholder(mediaEl, cfg);

  mediaEl.innerHTML = "";
  mediaEl.appendChild(video);
  mediaEl.classList.toggle("is-loading", video.readyState < 2);

  const startPlayback = () => {
    mediaEl.classList.remove("is-loading");
    if (video.videoWidth && video.videoHeight) {
      applyMediaOrientation(mediaEl, video.videoWidth, video.videoHeight);
    }
    setBgmDucked(true);
    video.play().catch(() => {});
  };

  video.addEventListener("ended", () => ensureBgmPlaying(), { once: true });
  video.addEventListener("pause", () => {
    if (video.ended || memoryModal.classList.contains("hidden")) ensureBgmPlaying();
  });

  if (video.readyState >= 2) {
    startPlayback();
  } else {
    video.addEventListener("canplay", startPlayback, { once: true });
    video.addEventListener("error", () => showPlaceholder(mediaEl, cfg), { once: true });
    video.load();
  }
}

function showMemoryImage(cfg, mediaEl) {
  showMemoryLoading(mediaEl);
  ensureBgmPlaying();

  let img = mediaPreloadCache.get(cfg.src);
  if (!(img instanceof HTMLImageElement)) {
    img = new Image();
    img.decoding = "async";
    mediaPreloadCache.set(cfg.src, img);
  }

  const reveal = () => {
    if (!img.naturalWidth) {
      showPlaceholder(mediaEl, cfg);
      return;
    }
    mediaEl.innerHTML = "";
    const display = img.cloneNode(false);
    display.alt = cfg.title;
    mediaEl.appendChild(display);
    applyMediaOrientation(mediaEl, img.naturalWidth, img.naturalHeight);
  };

  img.onload = reveal;
  img.onerror = () => showPlaceholder(mediaEl, cfg);
  img.src = cfg.src;
  if (img.complete) reveal();
}

function showMemory(cfg) {
  gamePaused = true;
  resetMediaOrientation();
  const captionEl = document.getElementById("memory-caption");
  if (cfg.captionHtml) {
    captionEl.innerHTML = `💜 ${cfg.captionHtml}`;
  } else {
    captionEl.textContent = `💜 ${cfg.caption}`;
  }
  const mediaEl = document.getElementById("memory-media");
  mediaEl.innerHTML = "";

  if (cfg.type === "video") {
    mountMemoryVideo(cfg, mediaEl);
  } else {
    showMemoryImage(cfg, mediaEl);
  }
  memoryModal.classList.remove("hidden");
}

function showPlaceholder(el, cfg) {
  el.innerHTML = `
    <div style="padding:2rem;text-align:center;color:#555;">
      <div style="font-size:3rem;margin-bottom:0.5rem;">📷</div>
      <p style="font-weight:700;">请将照片/视频放入：</p>
      <code style="color:#A78BFA;font-size:0.85rem;font-weight:800;">${cfg.src}</code>
    </div>`;
}

function closeMemory() {
  memoryModal.classList.add("hidden");
  resetMediaOrientation();
  const video = memoryModal.querySelector("video");
  if (video) {
    video.pause();
    video.remove();
  }
  ensureBgmPlaying();
  gamePaused = false;
}

// ---- 老虎机 ----
let insertedCoins = 0;
let slotSpinning = false;
let reelTickTimer = null;
const SLOT_SYMBOLS = ["🎂", "💜", "🎁", "✨", "🌟", "💖", "🎈", "🦄"];

function buildReelStrip(el, highlight = "💜") {
  // 重复多圈符号，配合 CSS 滚动动画产生真实转轮感
  const loop = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS, ...SLOT_SYMBOLS];
  el.innerHTML = loop.map((s) => `<div class="reel-symbol">${s}</div>`).join("");
  el.dataset.final = highlight;
  el.style.transform = "translateY(0)";
  el.style.transition = "none";
}

function goToMachine() {
  gamePaused = true;
  insertedCoins = 0;
  slotSpinning = false;
  document.getElementById("machine-coin-display").textContent = "0";
  document.getElementById("machine-coin-total").textContent = MACHINE_JACKPOT_COINS;
  document.getElementById("remaining-coins").textContent = totalCoins;
  document.getElementById("btn-lever").disabled = true;
  updateCoinSlotState();
  document.getElementById("jackpot-banner").classList.add("hidden");
  coinWarningModal.classList.add("hidden");
  resetReels();
  showScreen("machine");
}

function updateCoinSlotState() {
  const slot = document.getElementById("coin-slot");
  const disabled = totalCoins <= 0 || slotSpinning;
  slot.disabled = disabled;
  slot.classList.toggle("disabled", disabled);
}

function resetReels() {
  ["reel-1", "reel-2", "reel-3"].forEach((id, i) => {
    const el = document.getElementById(id);
    el.parentElement.classList.remove("spinning");
    buildReelStrip(el, SLOT_SYMBOLS[i % SLOT_SYMBOLS.length]);
  });
}

function setReelFinal(el, symbol) {
  el.parentElement.classList.remove("spinning");
  el.style.transition = "none";
  el.style.transform = "translateY(0)";
  el.innerHTML = `<div class="reel-symbol">${symbol}</div>`;
}

function insertCoin() {
  if (totalCoins <= 0 || slotSpinning) return;
  ensureAudio();
  SFX.coinInsert();
  totalCoins--;
  insertedCoins++;
  document.getElementById("machine-coin-display").textContent = insertedCoins;
  document.getElementById("remaining-coins").textContent = totalCoins;

  const slot = document.getElementById("coin-slot");
  slot.classList.add("inserted");
  setTimeout(() => slot.classList.remove("inserted"), 200);

  updateCoinSlotState();
  if (insertedCoins >= MIN_COINS_TO_ENTER_MACHINE) {
    document.getElementById("btn-lever").disabled = false;
  }
}

function pullLever() {
  if (insertedCoins < MIN_COINS_TO_ENTER_MACHINE || slotSpinning) return;

  ensureAudio();
  SFX.lever();

  const lever = document.getElementById("btn-lever");
  lever.classList.add("pulling");
  setTimeout(() => lever.classList.remove("pulling"), 400);

  // 30~68 枚：可以摇，但提示不够，不进入 JACKPOT
  if (insertedCoins < MACHINE_JACKPOT_COINS) {
    coinWarningModal.classList.remove("hidden");
    return;
  }

  slotSpinning = true;
  document.getElementById("btn-lever").disabled = true;
  updateCoinSlotState();

  const reels = ["reel-1", "reel-2", "reel-3"].map((id) => document.getElementById(id));

  // 重建长条并开启动画滚动
  reels.forEach((el) => {
    buildReelStrip(el);
    // 强制重绘后再加 spinning，确保动画重启
    void el.offsetWidth;
    el.parentElement.classList.add("spinning");
  });

  if (reelTickTimer) clearInterval(reelTickTimer);
  reelTickTimer = setInterval(() => SFX.reelTick(), 90);

  const stopDelays = [1200, 1800, 2500];
  reels.forEach((el, i) => {
    setTimeout(() => {
      setReelFinal(el, "💜");
    }, stopDelays[i]);
  });

  setTimeout(() => {
    if (reelTickTimer) { clearInterval(reelTickTimer); reelTickTimer = null; }
    document.getElementById("jackpot-banner").classList.remove("hidden");
    reels.forEach((el) => setReelFinal(el, "🎁"));
    SFX.jackpot();
  }, 2900);

  setTimeout(() => {
    giftModal.classList.remove("hidden");
    slotSpinning = false;
  }, 3900);
}

function returnToGame() {
  ensureAudio();
  SFX.returnGame();
  totalCoins += insertedCoins;
  insertedCoins = 0;
  coinWarningModal.classList.add("hidden");
  levelComplete = false;
  // 把小人放回门前较远处，方便继续捡附近掉落的金币
  player.x = levelWidth - TILE * 16;
  player.y = groundTopY - player.h;
  player.vx = 0;
  player.vy = 0;
  player.facing = -1;
  gamePaused = false;
  showScreen("game");
  updateHUD();
}

function replay() {
  giftModal.classList.add("hidden");
  document.getElementById("jackpot-banner").classList.add("hidden");
  insertedCoins = 0;
  showScreen("start");
  if (bgmBuffer) {
    document.getElementById("start-loading").classList.add("hidden");
    document.getElementById("start-ready").classList.remove("hidden");
    if (!bgmPlaying) startBGM();
  }
}

init();

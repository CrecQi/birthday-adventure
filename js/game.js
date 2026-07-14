// ============================================================
// PP生日大冒险 — 游戏主逻辑
//
// 箱子三种类型（全部悬空，必须跳起从下方顶开）：
//   layer 1          ：悬在低空，从地面起跳即可顶到
//   layer 2          ：侧面台面起跳，走到悬空箱下方再顶开（箱子不接触台面）
//   onPipe = true    ：悬在管道口正上方，只能站在管道口上起跳顶开；
//                      顶开后会掉进管道（及时按 ←/→ 可逃离），
//                      从附近另一根管道掉出来
// ============================================================

const GRAVITY = 0.44;
const FRICTION = 0.85;
const MOVE_SPEED = 5;
const JUMP_FORCE = -11.1; // 起跳/落地更慢，高度仍约 3.5 格
let TILE = 40;
const SHADOW = 4;
const HEART_BURST_DELAY = 900; // 先看爱心迸溅，再弹回忆
const PIPE_ESCAPE_FRAMES = 55; // 掉管道前的逃离窗口（约 0.9 秒）

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
let camera = { x: 0 };
let levelWidth = 0;
let groundTopY = 0;
let endDoor = null;
let animationId = null;

// 开箱 / 管道流程状态
let boxOpeningAnim = false;
let pendingMemory = null;
let pendingMemoryIsReopen = false;
let pendingMemoryRevealStart = 0;
let pendingPipe = null;
let boxRehitCooldown = 0;
const VIDEO_VOLUME = 0.05;

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

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resizeCanvas);
  }

  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-close-memory").addEventListener("click", closeMemory);
  document.getElementById("btn-continue").addEventListener("click", closeMemory);
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
    const bx = spacing * (i + 1);
    let boxY;
    let pipeRef = null;

    if (cfg.onPipe) {
      // ---- 管道口悬空箱 ----
      const pipeW = TILE * 1.4;
      const px = bx + (TILE - pipeW) / 2;
      const mouthY = groundY - TILE * 2.2;
      boxY = mouthY - TILE * 2.5;

      // 第二层：侧面放台面辅助上台，台面不压在管道上方
      if (cfg.layer === 2) {
        platforms.push({
          x: bx - TILE * 3.8, y: groundY - TILE * 2.5,
          w: TILE * 2.2, h: TILE * 0.5, type: "platform",
        });
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
    } else if (cfg.layer === 2) {
      // ---- 第二层悬空箱：台面在箱子正下方，箱子悬空 2.5 格，
      //      站上台面后跳一次即可顶到 ----
      const platY = groundY - TILE * 2.5;
      const platW = TILE * 3;
      platforms.push({
        x: bx - (platW - TILE) / 2, y: platY,
        w: platW, h: TILE * 0.5, type: "platform",
      });
      boxY = platY - TILE * 3.5;
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

  // 保障：台面绝不出现在管道上方（水平重叠则左移错开）
  const pipeSolids = platforms.filter((p) => p.type === "pipe");
  for (const pl of platforms) {
    if (pl.type !== "platform") continue;
    for (const pp of pipeSolids) {
      if (pl.x < pp.x + pp.w && pl.x + pl.w > pp.x) {
        pl.x = pp.x - pl.w - TILE * 0.5;
      }
    }
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
    inPipe: null,       // null | escape_window | sinking | waiting
    pipeRef: null,
    pipeEscapeTimer: 0,
    pipeWait: 0,
  };

  camera.x = 0;
  totalCoins = 0;
  openedBoxes = 0;
  levelComplete = false;
  jumpHeld = false;
  boxOpeningAnim = false;
  pendingMemory = null;
  pendingMemoryIsReopen = false;
  pendingMemoryRevealStart = 0;
  pendingPipe = null;
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
  if (animationId) cancelAnimationFrame(animationId);
  gameLoop();
}

function gameLoop() {
  try {
    if (!gamePaused) update();
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

  const elapsed = performance.now() - pendingMemoryRevealStart;
  if (elapsed < HEART_BURST_DELAY) return;
  if (!player.onGround || Math.abs(player.vy) > 0.5) return;
  if (!pendingMemoryIsReopen && coins.some((c) => !c.settled)) return;

  const cfg = pendingMemory;
  pendingMemory = null;
  pendingMemoryIsReopen = false;
  boxOpeningAnim = false;
  showMemory(cfg);
}

// 主动进入神秘门（不再靠走近就自动进老虎机）
function tryEnterDoor() {
  if (levelComplete || pendingMemory || player.inPipe) return false;
  if (openedBoxes < BOX_CONFIG.length) return false;
  if (totalCoins < MIN_COINS_TO_ENTER_MACHINE) return false;
  if (!endDoor) return false;

  const atDoor = collides(player, endDoor);
  if (!atDoor) return false;

  levelComplete = true;
  SFX.doorEnter();
  goToMachine();
  return true;
}

function isNearDoor() {
  if (!endDoor || openedBoxes < BOX_CONFIG.length) return false;
  const zone = { x: endDoor.x - TILE, y: endDoor.y - TILE * 0.5, w: endDoor.w + TILE * 2, h: endDoor.h + TILE };
  return collides(player, zone);
}

function updateCamera() {
  camera.x = player.x - gameWidth * 0.35;
  if (camera.x < 0) camera.x = 0;
  if (camera.x > levelWidth - gameWidth) camera.x = levelWidth - gameWidth;
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

// ---- 管道流程 ----
function updatePipeState() {
  const pipe = player.pipeRef;
  const left = keys["ArrowLeft"] || keys["KeyA"] || touchInput.left;
  const right = keys["ArrowRight"] || keys["KeyD"] || touchInput.right;

  if (player.inPipe === "escape_window") {
    player.pipeEscapeTimer--;
    if (left || right) {
      // 及时逃离：向侧面跳开
      player.inPipe = null;
      player.pipeRef = null;
      player.vx = left ? -7 : 7;
      player.vy = -8;
      player.facing = left ? -1 : 1;
      return;
    }
    if (player.pipeEscapeTimer <= 0) {
      player.inPipe = "sinking";
      player.x = pipe.x + (pipe.w - player.w) / 2;
    }
    return;
  }

  if (player.inPipe === "sinking") {
    player.y += 4;
    if (player.y > pipe.mouthY + TILE * 1.6) {
      player.inPipe = "waiting";
      player.pipeWait = 25;
    }
    return;
  }

  if (player.inPipe === "waiting") {
    player.pipeWait--;
    if (player.pipeWait <= 0) {
      // 从出口管道弹出
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

  if (box.onPipe && box.pipeRef) {
    pendingPipe = box.pipeRef;
  }

  startMemoryReveal(cfg, false);
}

function reopenBox(box) {
  if (boxOpeningAnim || gamePaused) return;
  triggerBoxOpenPresentation(box);
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
  // 管身
  drawDoodleRect(pipe.x + 3, pipe.mouthY + rimH * 0.5, pipe.w - 6, pipe.h - rimH * 0.5, C.pipe, { radius: 3, shadow: false });
  // 管口（略宽）
  drawDoodleRect(pipe.x - 4, pipe.mouthY, pipe.w + 8, rimH, C.pipeDark, { radius: 6, shadow: false });
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
  ctx.translate(-camera.x, 0);

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
      const boxColor = box.layer === 2 ? C.purple : C.purpleLight;
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

  // 逃离提示
  if (player.inPipe === "escape_window" && Math.floor(player.pipeEscapeTimer / 8) % 2 === 0) {
    drawHintText("快按 ← / → 逃离！", player.x + player.w / 2, player.y - 12);
  }

  // 门前提示
  if (isNearDoor() && totalCoins >= MIN_COINS_TO_ENTER_MACHINE && !levelComplete) {
    drawHintText("按空格进入神秘门 🚪", player.x + player.w / 2, player.y - 18);
  } else if (isNearDoor() && totalCoins < MIN_COINS_TO_ENTER_MACHINE) {
    drawHintText("金币还不够哦～", player.x + player.w / 2, player.y - 18);
  }

  for (const h of heartBubbles) drawHeartBubble(h);

  ctx.restore();
}

function drawPlayer() {
  const { x, y, w, h, facing } = player;
  const bounce = player.onGround && !player.inPipe ? Math.abs(Math.sin(player.animFrame * 0.3)) * 2 : 0;
  ctx.save();
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

function drawHintText(text, x, y) {
  ctx.font = "900 15px ZCOOL KuaiLe, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 4;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = C.purpleDark;
  ctx.fillText(text, x, y);
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
      const img = new Image();
      img.decoding = "async";
      img.src = cfg.src;
      mediaPreloadCache.set(cfg.src, img);
    }
  });
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
  video.volume = VIDEO_VOLUME;
  if (cfg.poster) video.poster = cfg.poster;
  video.onerror = () => showPlaceholder(mediaEl, cfg);

  mediaEl.innerHTML = "";
  mediaEl.appendChild(video);
  mediaEl.classList.toggle("is-loading", video.readyState < 2);

  const startPlayback = () => {
    mediaEl.classList.remove("is-loading");
    setBgmDucked(true);
    video.play().catch(() => {});
  };

  if (video.readyState >= 2) {
    startPlayback();
  } else {
    video.addEventListener("canplay", startPlayback, { once: true });
    video.addEventListener("error", () => showPlaceholder(mediaEl, cfg), { once: true });
    video.load();
  }
}

function createMemoryPicture(cfg) {
  const picture = document.createElement("picture");
  const baseUrl = cfg.src.split("?")[0];
  const query = cfg.src.includes("?") ? "?" + cfg.src.split("?").slice(1).join("?") : "";
  if (/\.jpe?g$/i.test(baseUrl)) {
    const source = document.createElement("source");
    source.type = "image/webp";
    source.srcset = baseUrl.replace(/\.jpe?g$/i, ".webp") + query;
    picture.appendChild(source);
  }
  const img = document.createElement("img");
  img.alt = cfg.title;
  img.decoding = "async";
  img.src = cfg.src;
  picture.appendChild(img);
  return { picture, img };
}

function showMemory(cfg) {
  gamePaused = true;
  document.getElementById("memory-title").textContent = cfg.title;
  document.getElementById("memory-caption").textContent = cfg.caption;
  const mediaEl = document.getElementById("memory-media");
  mediaEl.innerHTML = "";

  if (cfg.type === "video") {
    mountMemoryVideo(cfg, mediaEl);
  } else {
    showMemoryLoading(mediaEl);
    setBgmDucked(false);
    const cached = mediaPreloadCache.get(cfg.src);
    const { picture, img } = createMemoryPicture(cfg);
    const reveal = () => {
      if (!img.naturalWidth) return showPlaceholder(mediaEl, cfg);
      mediaEl.innerHTML = "";
      mediaEl.appendChild(picture);
    };
    img.onerror = () => showPlaceholder(mediaEl, cfg);
    if (cached instanceof HTMLImageElement && cached.complete && cached.naturalWidth > 0) {
      reveal();
    } else {
      img.onload = reveal;
    }
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
  const video = memoryModal.querySelector("video");
  if (video) {
    video.pause();
    video.remove();
  }
  setBgmDucked(false);
  gamePaused = false;

  // 管道口箱子：关闭回忆后站上管道口，进入逃离倒计时
  if (pendingPipe) {
    player.x = pendingPipe.x + (pendingPipe.w - player.w) / 2;
    player.y = pendingPipe.mouthY - player.h;
    player.vx = 0;
    player.vy = 0;
    player.inPipe = "escape_window";
    player.pipeRef = pendingPipe;
    player.pipeEscapeTimer = PIPE_ESCAPE_FRAMES;
    pendingPipe = null;
  }
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

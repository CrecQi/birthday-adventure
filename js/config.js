// ============================================================
// 箱子配置 — 替换照片/视频时只需修改这里
// layer: 1 = 第一层悬空（地面跳起可顶到）
//        2 = 第二层悬空（跳上台面，走到箱下再顶；箱子不接触台面）
// onPipe: true = 放在管道口上（顶开后可能掉进管道）
// ============================================================
const BOX_CONFIG = [
  {
    id: 1,
    title: "回忆 #1 — 第一次相遇",
    caption: "还记得我们第一次见面吗？那一刻，世界都亮了 ✨",
    type: "image",
    src: "assets/media/box1.svg",
    coins: 6,
    layer: 1,
    onPipe: false,
  },
  {
    id: 2,
    title: "回忆 #2 — 第一次约会",
    caption: "那天的阳光，和你一样温暖 🌞",
    type: "image",
    src: "assets/media/box2.svg",
    coins: 7,
    layer: 2,
    onPipe: false,
  },
  {
    id: 3,
    title: "回忆 #3 — 一起旅行",
    caption: "手牵手，走过最美的风景 🗺️",
    type: "image",
    src: "assets/media/box3.svg",
    coins: 7,
    layer: 1,
    onPipe: true,
  },
  {
    id: 4,
    title: "猫咪和小p",
    caption: "和小宝逛了家具展，然后去码头的咖啡店撸猫，拍到小猫的头和卡姿兰小宝",
    type: "image",
    src: "assets/media/box4.jpg?v=4",
    coins: 7,
    layer: 2,
    onPipe: false,
  },
  {
    id: 5,
    title: "电🐔恶宝",
    caption: "每次和小宝开电🐔都好开心呀！",
    type: "video",
    src: "assets/media/box5.mp4?v=2",
    poster: "assets/media/box5_poster.jpg?v=1",
    coins: 8,
    layer: 1,
    onPipe: false,
  },
  {
    id: 6,
    title: "回忆 #6 — 一起大笑",
    caption: "你的笑声，是我听过最美的音乐 🎵",
    type: "image",
    src: "assets/media/box6.svg",
    coins: 8,
    layer: 2,
    onPipe: true,
  },
  {
    id: 7,
    title: "回忆 #7 — 浪漫时刻",
    caption: "每一个瞬间，都想和你分享 🌹",
    type: "image",
    src: "assets/media/box7.svg",
    coins: 7,
    layer: 1,
    onPipe: false,
  },
  {
    id: 8,
    title: "回忆 #8 — 我们的故事",
    caption: "故事还在继续，未来还有更多精彩 📖",
    type: "video",
    src: "assets/media/box8.mp4",
    coins: 9,
    layer: 2,
    onPipe: false,
  },
  {
    id: 9,
    title: "回忆 #9 — 最好的我们",
    caption: "谢谢你，让我的生活变得如此美好 💕",
    type: "image",
    src: "assets/media/box9.svg",
    coins: 10,
    layer: 1,
    onPipe: true,
  },
];

// 金币总数 = 6+7+7+7+8+8+7+9+10 = 69
// 收集 ≥ 30 枚可进入老虎机并摇手柄；投入全部 69 枚才能 JACKPOT
const MIN_COINS_TO_ENTER_MACHINE = 30;
const MACHINE_JACKPOT_COINS = 69;

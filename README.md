# 🎂 生日大冒险

一个轻量级的马里奥风格网页小游戏，为女朋友生日准备的特别礼物。

## 游戏玩法

1. **开始游戏** — 控制小勇士在关卡中冒险
2. **顶箱子** — 从下方跳跃顶开 `?` 箱子，解锁你们的照片/视频回忆
3. **收集金币** — 每个箱子会掉落金币
4. **到达终点** — 打开所有箱子后，走到关卡尽头
5. **唱歌机** — 把所有金币投入机器，按下按钮领取神秘礼物

## 操作方式

| 平台 | 移动 | 跳跃 |
|------|------|------|
| 电脑 | ← → 方向键 | 空格键 |
| 手机 | 屏幕左/右按钮 | 屏幕中间跳跃按钮 |

## 如何添加你的照片和视频

共 **20** 个回忆盒子，顺序如下：

| 盒子 | 你的文件命名 | 说明 |
|------|-------------|------|
| #1–#9 | `box1.jpg` … `box9.jpg` | 你按顺序命名的第 1–9 张 |
| **#10** | `box10.jpg` | 已有「猫咪和小p」照片（已就位） |
| **#11** | `box11.mp4` | 已有「电🐔恶宝」视频（已就位，需 `box11_poster.jpg` 封面） |
| #12–#20 | `box12.jpg` … `box20.jpg` | 你按顺序命名的第 10–18 张 |

1. 把原始照片/视频放进任意临时目录
2. 运行压缩脚本（保证手机即开即看、无需高清）：

```bash
# 单张示例
./scripts/compress-media.sh photo 原始/01.jpg assets/media/box1.jpg
./scripts/compress-media.sh video 原始/clip.mp4 assets/media/box11.mp4

# 或批量压缩 assets/media 里偏大的文件
./scripts/compress-media.sh
```

3. 压缩策略：**照片** JPEG 长边 ≤960px、约 40–80 KB；**视频** MP4 H.264 长边 ≤720px、约 200–400 KB
4. 若某条是视频，把 `js/config.js` 里对应项的 `type` 改为 `"video"`，并加上 `poster`
5. 上传后在 `src` 后加 `?v=2` 等版本号破缓存
6. 标题和描述在 `js/config.js` 的 `title` / `caption` 字段

### 当前箱子配置（20 个）

| 箱子 | 类型 | 文件 | 层 | 金币 |
|------|------|------|-----|------|
| #1–#20 | 见 config.js | box1.jpg … box20.jpg（#11 为 mp4） | 1–4 层 | 自动合计 **143** 枚 |

收集 ≥ **61** 枚可进入老虎机；投入全部 **143** 枚才能 JACKPOT。

## 本地运行

```bash
cd birthday-adventure
python3 -m http.server 8080
```

然后在浏览器打开 http://localhost:8080

> 注意：直接双击 `index.html` 可能因浏览器安全策略无法加载本地视频，建议用上面的本地服务器方式运行。

## 部署到 GitHub Pages（推荐，发链接给她手机玩）

### 第一步：上传照片和视频（可选但建议先做）

把真实回忆放进 `assets/media/`，文件名与 `js/config.js` 一致，再执行下面的 git 命令。

### 第二步：在 GitHub 创建仓库

1. 登录 [github.com](https://github.com)
2. 右上角 **+** → **New repository**
3. 仓库名例如：`birthday-adventure`（随意）
4. 选 **Private**（私人照片建议私有仓库，Pages 照样能用）
5. **不要**勾选 "Add a README"（本地已有代码）
6. 点 **Create repository**

### 第三步：本地推送代码

在 Mac 终端执行（把 `你的用户名` 换成你的 GitHub 用户名）：

```bash
cd /Users/a1111/Projects/birthday-adventure

git init -b main
git add -A
git commit -m "PP生日大冒险"

git remote add origin https://github.com/你的用户名/birthday-adventure.git
git push -u origin main
```

第一次 `git push` 会要求登录 GitHub（浏览器或 Personal Access Token）。

### 第四步：开启 GitHub Pages

1. 打开仓库 → **Settings** → 左侧 **Pages**
2. **Build and deployment** → Source 选 **Deploy from a branch**
3. Branch 选 **main**，文件夹选 **/ (root)**，点 **Save**
4. 等 1～2 分钟，页面上会出现地址，形如：

   `https://你的用户名.github.io/birthday-adventure/`

把这个链接微信发给她，手机浏览器打开即可玩。

### 第五步：加到主屏幕（可选）

- **iPhone**：Safari 打开链接 → 分享 → **添加到主屏幕**
- **Android**：Chrome → 菜单 → **添加到主屏幕**

### 以后更新游戏

改完代码后执行：

```bash
cd /Users/a1111/Projects/birthday-adventure
git add -A
git commit -m "更新内容"
git push
```

等一两分钟，她刷新链接就能看到新版本。

### 常见问题

| 问题 | 处理 |
|------|------|
| 视频播不了 | 确认已 `git push` 上传了 `.mp4` 文件；GitHub 单文件建议 < 50MB |
| 页面 404 | 确认 Pages 分支是 `main`、目录是 `/ (root)`；`index.html` 在仓库根目录 |
| 想换域名 | Pages 设置里可填自定义域名 |
| 仓库太大 | 照片可先压缩；超大视频可改用外链（需改 `config.js` 里的路径） |

## 自定义祝福语

编辑 `index.html` 中 `#gift-modal` 部分的文字，改成你想对她说的生日祝福。

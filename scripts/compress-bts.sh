#!/usr/bin/env bash
# 压缩花絮原片 → assets/media/bts.mp4 + bts_poster.jpg
#
# 将原片放到 assets/media/ 下（任一名称均可）：
#   Behind the Scenes.mp4 / .mov / .webm
#   Behind_the_Scenes.mp4
#   behind-the-scenes.mp4
#
# 用法：./scripts/compress-bts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIA="$ROOT/assets/media"
OUT="$MEDIA/bts.mp4"

find_src() {
  local candidates=(
    "$MEDIA/Behind the Scenes.mp4"
    "$MEDIA/Behind the Scenes.mov"
    "$MEDIA/Behind the Scenes.webm"
    "$MEDIA/Behind_the_Scenes.mp4"
    "$MEDIA/Behind_the_Scenes.mov"
    "$MEDIA/behind-the-scenes.mp4"
    "$MEDIA/behind-the-scenes.mov"
    "$MEDIA/BehindTheScenes.mp4"
  )
  local c
  for c in "${candidates[@]}"; do
    [[ -f "$c" ]] && { echo "$c"; return 0; }
  done
  # 任意 Behind* / behind* 视频
  shopt -s nullglob nocaseglob
  for c in "$MEDIA"/Behind*.{mp4,mov,webm,MP4,MOV} "$MEDIA"/behind*.{mp4,mov,webm}; do
    [[ -f "$c" && "$c" != "$OUT" ]] && { echo "$c"; return 0; }
  done
  return 1
}

SRC="$(find_src)" || {
  echo "未找到花絮原片。请将视频放到 assets/media/，例如：" >&2
  echo "  assets/media/Behind the Scenes.mp4" >&2
  exit 1
}

echo "源文件: $SRC ($(du -h "$SRC" | cut -f1))"
bash "$ROOT/scripts/compress-media.sh" video "$SRC" "$OUT"
echo "完成 → $OUT ($(du -h "$OUT" | cut -f1))"

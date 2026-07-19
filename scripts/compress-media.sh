#!/usr/bin/env bash
# 批量压缩 assets/media 下的照片和视频，适配手机即开即看（无需高清）
#
# 照片策略：JPEG，长边 ≤960px，质量约 75，目标单张 ~40–80 KB
# 视频策略：H.264 MP4，长边 ≤720px，CRF 28，音频 AAC 64k，目标单条 ~200–400 KB
#
# 用法：
#   ./scripts/compress-media.sh                 # 处理 assets/media 下所有待压缩文件
#   ./scripts/compress-media.sh photo raw/1.jpg assets/media/box1.jpg
#   ./scripts/compress-media.sh video raw/clip.mp4 assets/media/box11.mp4
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIA="$ROOT/assets/media"
TMP="$ROOT/.media-tmp"
mkdir -p "$TMP"

compress_photo() {
  local src="$1" dst="$2"
  if command -v magick >/dev/null 2>&1; then
    magick "$src" -auto-orient -strip \
      -resize '960x960>' -quality 75 -sampling-factor 4:2:0 \
      "$dst"
  elif command -v convert >/dev/null 2>&1; then
    convert "$src" -auto-orient -strip \
      -resize '960x960>' -quality 75 \
      "$dst"
  elif command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -y -i "$src" -vf "scale='min(960,iw)':-2" -q:v 4 "$dst" 2>/dev/null
  else
    echo "错误：需要 ImageMagick 或 ffmpeg 来压缩照片" >&2
    exit 1
  fi
  echo "照片 → $dst ($(du -h "$dst" | cut -f1))"
}

compress_video() {
  local src="$1" dst="$2"
  local poster="${dst%.mp4}_poster.jpg"
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "错误：需要 ffmpeg 来压缩视频" >&2
    exit 1
  fi
  ffmpeg -y -i "$src" \
    -vf "scale='min(720,iw)':-2" \
    -c:v libx264 -preset slow -crf 28 -profile:v baseline -level 3.0 \
    -pix_fmt yuv420p -movflags +faststart \
    -c:a aac -b:a 64k -ac 1 \
    "$dst" 2>/dev/null
  ffmpeg -y -i "$dst" -ss 00:00:00.5 -vframes 1 -q:v 4 "$poster" 2>/dev/null
  echo "视频 → $dst ($(du -h "$dst" | cut -f1))"
  echo "封面 → $poster ($(du -h "$poster" | cut -f1))"
}

if [[ $# -ge 3 ]]; then
  case "$1" in
    photo) compress_photo "$2" "$3" ;;
    video) compress_video "$2" "$3" ;;
    *) echo "用法: $0 photo|video <源> <目标>" >&2; exit 1 ;;
  esac
  exit 0
fi

echo "=== 压缩 assets/media 中的 JPG/PNG/MP4（跳过已压缩的小文件与 SVG）==="
shopt -s nullglob
for src in "$MEDIA"/*.{jpg,jpeg,png,JPG,JPEG,PNG}; do
  [[ -f "$src" ]] || continue
  base="$(basename "$src")"
  [[ "$base" == *_poster.jpg ]] && continue
  size=$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src")
  if [[ "$size" -lt 120000 ]]; then
    echo "跳过（已够小）: $base"
    continue
  fi
  tmp="$TMP/$base"
  compress_photo "$src" "$tmp"
  mv "$tmp" "$src"
done

for src in "$MEDIA"/*.mp4; do
  [[ -f "$src" ]] || continue
  base="$(basename "$src")"
  size=$(stat -c%s "$src" 2>/dev/null || stat -f%z "$src")
  if [[ "$size" -lt 500000 ]]; then
    echo "跳过（已够小）: $base"
    continue
  fi
  tmp="$TMP/$base"
  compress_video "$src" "$tmp"
  mv "$tmp" "$src"
done

echo "完成。上传前请在 js/config.js 里给对应 src 加上 ?v= 版本号以破缓存。"

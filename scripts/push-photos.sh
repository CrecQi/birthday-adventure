#!/usr/bin/env bash
# 在 Mac 项目根目录运行：./scripts/push-photos.sh
set -euo pipefail
cd "$(dirname "$0")/.."

need=(box1 box2 box5 box6 box12 box13 box15 box16 box17 box18 box20)
missing=()
for b in "${need[@]}"; do
  [[ -f "assets/media/${b}.jpg" ]] || missing+=("${b}.jpg")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "缺少文件，请先放进 assets/media/："
  printf '  %s\n' "${missing[@]}"
  exit 1
fi

git checkout main
git pull origin main
git add assets/media/box{1,2,5,6,12,13,15,16,17,18,20}.jpg
git commit -m "上传回忆照片"
git push origin main
echo ""
echo "✅ 已推送。等 1～2 分钟后打开："
echo "   https://crecqi.github.io/birthday-adventure/"

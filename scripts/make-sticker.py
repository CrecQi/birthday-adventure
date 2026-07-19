#!/usr/bin/env python3
"""
把人物照片做成《APT》MV 风格贴纸：
  人头 + 白色描边 + 透明背景 PNG。

用法：
  python3 scripts/make-sticker.py 输入.jpg 输出.png

处理流程：
  1. rembg 去除背景（保留人物）
  2. OpenCV 检测人脸，定位头部范围（含帽子/头发）
  3. 椭圆头部蒙版与 alpha 相交，把伸出脸部轮廓的头发剪除
  4. 形态学平滑轮廓，去掉细碎发丝
  5. 蒙版膨胀出白色描边
  6. 裁剪并输出透明 PNG（保持原始像素，不做生成式修改）
"""

import sys
import numpy as np
import cv2
from PIL import Image
from rembg import remove


def main():
    if len(sys.argv) < 3:
        print("用法: python3 scripts/make-sticker.py 输入.jpg 输出.png")
        sys.exit(1)

    src_path, dst_path = sys.argv[1], sys.argv[2]

    # ---- 1. 去背景 ----
    src = Image.open(src_path).convert("RGBA")
    cut = remove(src)  # RGBA，背景透明
    rgba = np.array(cut)
    alpha = rgba[:, :, 3]

    # ---- 2. 人脸检测 ----
    bgr = cv2.cvtColor(np.array(src.convert("RGB")), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    if len(faces) == 0:
        print("未检测到人脸，改用 alpha 顶部区域估计头部")
        ys, xs = np.where(alpha > 128)
        top = ys.min()
        fx = xs.mean()
        fw = (xs.max() - xs.min()) * 0.4
        fy, fh = top + fw * 0.6, fw
        fx -= fw / 2
    else:
        # 取最大的人脸
        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])

    cx = fx + fw / 2
    cy = fy + fh / 2

    # ---- 3. 头部椭圆蒙版（含帽子/头发，But 剪掉横向伸出的发丝） ----
    h, w = alpha.shape
    head_mask = np.zeros((h, w), np.uint8)
    # 椭圆：宽 ~1.9 倍脸宽，高 ~2.6 倍脸高；中心略上移盖住帽子
    axes = (int(fw * 0.95), int(fh * 1.3))
    center = (int(cx), int(cy - fh * 0.15))
    cv2.ellipse(head_mask, center, axes, 0, 0, 360, 255, -1)

    mask = cv2.bitwise_and(alpha, head_mask)

    # 底部裁到下巴略下，避免带上肩膀
    chin_y = int(fy + fh * 1.18)
    mask[chin_y:, :] = 0

    # ---- 4. 平滑轮廓、去发丝 ----
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.GaussianBlur(mask, (7, 7), 0)
    _, mask = cv2.threshold(mask, 100, 255, cv2.THRESH_BINARY)

    # 只保留最大连通块
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    if n > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        mask = np.where(labels == largest, 255, 0).astype(np.uint8)

    # ---- 5. 白色描边 ----
    stroke_px = max(8, int(fw * 0.12))
    dil = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (stroke_px * 2 + 1, stroke_px * 2 + 1)
    )
    outline = cv2.dilate(mask, dil)
    outline = cv2.GaussianBlur(outline, (5, 5), 0)
    _, outline = cv2.threshold(outline, 100, 255, cv2.THRESH_BINARY)

    out = np.zeros((h, w, 4), np.uint8)
    # 白底
    out[outline > 0] = (255, 255, 255, 255)
    # 头部照片像素
    head_px = mask > 0
    out[head_px, :3] = rgba[head_px, :3]
    out[head_px, 3] = 255

    # ---- 6. 裁剪到内容 ----
    ys, xs = np.where(out[:, :, 3] > 0)
    pad = 6
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, h)
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, w)
    out = out[y0:y1, x0:x1]

    Image.fromarray(out).save(dst_path)
    print(f"完成 → {dst_path}  ({out.shape[1]}x{out.shape[0]})")


if __name__ == "__main__":
    main()

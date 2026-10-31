# -*- coding: utf-8 -*-
"""
阵营配色重映射：蓝方 -> 红方

为什么不用重新生图：
  1. 两队同一个兵种必须**体型完全一致**，只在颜色上分敌我。重绘一定跑偏。
  2. 省 16 次生成。

原理：
  蓝方阵营色集中在 PIL 色相 128~160（≈180°~225°），和肤色（0~32）、绿色（96~128）
  分得很开，所以只对"蓝区"做色相旋转，其余像素完全不动。

  映射：newH = 250 + (H - 140) * 0.40
    140 -> 250（≈352°，正红偏品）
    160 -> 258 % 256 = 2（正红）
  蓝区的明暗层次（h 在 128~160 内的细微变化）被压缩保留，所以不是一块死红。

用法：
  python dev/recolor_team.py art/v9                     # 目录下所有 *_blue_*.png
  python dev/recolor_team.py art/v9 unit_dragon_blue_idle.png
"""
import os
import sys

from PIL import Image

BLUE_CENTER = 140      # 蓝方阵营色的色相中心（PIL 0~255 量纲）
FULL_W = 18            # 离中心 ±18 之内 100% 转换
FADE_W = 34            # ±34 之外完全不转换（中间平滑衰减）


def circ_dist(h, c):
    """色相环上的最短距离（0~128）。"""
    d = (h - c) % 256
    return min(d, 256 - d)


def recolor(img):
    img = img.convert('RGBA')
    alpha = img.getchannel('A')
    hsv = img.convert('HSV')
    H, S, V = hsv.split()

    import numpy as np
    h = np.asarray(H, dtype=np.float32)
    s = np.asarray(S, dtype=np.float32)
    v = np.asarray(V, dtype=np.float32)

    dd = np.minimum((h - BLUE_CENTER) % 256, 256 - ((h - BLUE_CENTER) % 256))
    # 权重：中心满权重，FADE_W 外为 0
    w = np.clip((FADE_W - dd) / float(FADE_W - FULL_W), 0.0, 1.0)
    w = w * w * (3 - 2 * w)          # smoothstep，边界不生硬

    # 压缩式色相映射：保留蓝区内部的层次差
    nh = (250.0 + (h - BLUE_CENTER) * 0.40) % 256.0
    h2 = h * (1 - w) + nh * w
    s2 = s * (1 - 0.05 * w)          # 红方略降饱和，偏厚重
    v2 = np.clip(v * (1 + 0.03 * w), 0, 255)   # 略提亮，深红不至于发黑

    out = Image.merge('HSV', (
        Image.fromarray(h2.astype(np.uint8), 'L'),
        Image.fromarray(s2.astype(np.uint8), 'L'),
        Image.fromarray(v2.astype(np.uint8), 'L'),
    )).convert('RGBA')
    out.putalpha(alpha)
    return out


def main():
    art = sys.argv[1] if len(sys.argv) > 1 else 'art/v9'
    names = sys.argv[2:]
    if not names:
        names = sorted(f for f in os.listdir(art)
                       if f.endswith('.png') and '_blue_' in f)
    made = []
    for f in names:
        src = os.path.join(art, f)
        dst = src.replace('_blue_', '_red_')
        im = Image.open(src)
        recolor(im).save(dst)
        made.append(os.path.basename(dst))
    print('转换 %d 张：' % len(made))
    for m in made:
        print('  ' + m)


if __name__ == '__main__':
    main()

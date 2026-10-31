# -*- coding: utf-8 -*-
"""
兵种帧归一化：统一身高 + 统一脚底基准线

为什么需要：
  `key_ai_asset.py --fit` 是按**最长边**缩放的。
  正面像 179×149、侧视像 115×179 —— 按最长边归一后，侧视会被放大 20%，
  在棋盘上一转身人就"胖了一圈"。

  所以这里改用**身高**（alpha 包围盒高度）做归一，并以同一阵营的 idle 帧为基准，
  保证同一兵种所有姿态、所有帧的脚底都在同一条线上、头顶一样高。

用法：
  python dev/normalize_unit_frames.py unit_infantry_blue
  （会自动找 unit_infantry_blue_idle.png 作基准，处理同前缀的 walk / 其他帧）
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

ART = 'art/v9'


def bbox_of(im):
    a = np.array(im.getchannel('A'))
    ys, xs = np.where(a > 8)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def normalize(prefix, canvas=None, margin_bottom=None, target_h=None):
    ref_path = os.path.join(ART, prefix + '_idle.png')
    ref = Image.open(ref_path).convert('RGBA')
    # 画幅必须跟基准图一致：walk 帧如果按 256 落盘、基准是 512，
    # 后面按身高算出的缩放会被画幅宽度上限二次压缩，结果又小一圈。
    if canvas is None:
        canvas = ref.width
    rb = bbox_of(ref)
    if rb is None:
        print('基准图没有内容：', ref_path)
        return
    H = target_h or (rb[3] - rb[1])
    BOTTOM = margin_bottom if margin_bottom is not None else rb[3]
    print('基准 %s：画幅 %d，身高 %dpx，脚底 y=%d' % (os.path.basename(ref_path), canvas, H, BOTTOM))

    files = sorted(glob.glob(os.path.join(ART, prefix + '_*.png')))
    for f in files:
        if f.endswith('_idle.png'):
            continue
        im = Image.open(f).convert('RGBA')
        b = bbox_of(im)
        if b is None:
            continue
        crop = im.crop((b[0], b[1], b[2] + 1, b[3] + 1))
        h = crop.height
        r = H / float(h)
        nw, nh = max(1, round(crop.width * r)), max(1, round(crop.height * r))
        # 太宽就再压回来（避免侧视/盾牌撑出画幅）
        maxw = canvas * 0.92
        if nw > maxw:
            r2 = maxw / nw
            nw, nh = round(nw * r2), max(1, round(nh * r2))
        crop = crop.resize((nw, nh), Image.LANCZOS)
        out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
        px = int(round((canvas - nw) / 2))
        py = int(round(BOTTOM - nh))
        out.alpha_composite(crop, (px, py))
        out.save(f)
        print('  %-42s %dx%d → 身高 %d' % (os.path.basename(f), b[2] - b[0] + 1, h, nh))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        normalize(p)

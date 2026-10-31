# -*- coding: utf-8 -*-
"""对比不同贴图缩放倍数下的草地质感，挑「看起来像草」而不是「像砂纸」的档位。

背景：贴图 512 原尺寸铺 440px 棋盘时，草叶只有 1~3px → 读成磨砂噪点。
放大到 2× 后草叶 2~6px，且 512*2=1024 > 棋盘宽，仍然不会平铺重复（无万花筒）。
"""
import numpy as np
from PIL import Image, ImageDraw

BASE = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\art\v9"
OUT = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\dev\_gen\grass_scale_cmp.png"

CELL, N = 44, 10
W = H = CELL * N
WARM, COOL = (0x6E, 0xA9, 0x4D), (0x4C, 0x7F, 0x4E)


def overlay(b, s):
    return np.where(b <= 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))


def soft_light(b, s):
    return np.where(s <= 0.5, b - (1 - 2 * s) * b * (1 - b),
                    b + (2 * s - 1) * (np.sqrt(np.clip(b, 0, 1)) - b))


tex = Image.open(f"{BASE}\\tex_grass.png").convert("L")


def compose(scale, a3=0.34, a4=0.22):
    base = np.zeros((H, W, 3), np.float32)
    for r in range(N):
        for c in range(N):
            base[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = WARM if (r + c) % 2 == 0 else COOL
    base /= 255.0

    size = int(max(W, H) * scale) + 4
    big = tex.resize((size, size), Image.LANCZOS)
    l3 = np.array(big)[:H, :W].astype(np.float32) / 255.0
    rot = tex.resize((int(size * 1.63), int(size * 1.63)), Image.LANCZOS).rotate(17, resample=Image.BICUBIC)
    l4 = np.array(rot)[:H, :W].astype(np.float32) / 255.0
    if l4.shape[:2] != (H, W):
        pad = np.full((H, W), 0.5, np.float32)
        pad[:l4.shape[0], :l4.shape[1]] = l4
        l4 = pad

    out = overlay(base, l3[..., None]) * a3 + base * (1 - a3)
    out = soft_light(out, l4[..., None]) * a4 + out * (1 - a4)
    img = np.clip(out * 255, 0, 255).astype(np.uint8)
    for i in range(N + 1):
        y, x = i * CELL, i * CELL
        if y < H:
            img[y:y + 1, :] = (img[y:y + 1, :] * 0.62).astype(np.uint8)
            if y + 1 < H:
                img[y + 1:y + 2, :] = np.clip(img[y + 1:y + 2, :].astype(np.int16) + 22, 0, 255).astype(np.uint8)
        if x < W:
            img[:, x:x + 1] = (img[:, x:x + 1] * 0.62).astype(np.uint8)
            if x + 1 < W:
                img[:, x + 1:x + 2] = np.clip(img[:, x + 1:x + 2].astype(np.int16) + 22, 0, 255).astype(np.uint8)
    return Image.fromarray(img, "RGB")


variants = [(1.0, 0.34, "A scale1.0 a.34"), (1.8, 0.42, "B scale1.8 a.42"), (2.6, 0.46, "C scale2.6 a.46")]
sheet = Image.new("RGB", (W * 3 + 40, H + 40), (18, 22, 31))
for i, (sc, a3, label) in enumerate(variants):
    im = compose(sc, a3)
    sheet.paste(im, (10 + i * (W + 10), 30))
sheet.save(OUT)
print("saved", OUT, sheet.size, "| variants:", [v[2] for v in variants])

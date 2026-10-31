# -*- coding: utf-8 -*-
"""模拟棋盘草地合成效果（L0 双色底 + L3 overlay 主贴图 + L4 soft-light 次贴图），
用来判断「四象限镜像贴图」在真实棋盘尺寸下会不会露出对称万花筒感。
"""
import numpy as np
from PIL import Image

BASE = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\art\v9"
OUT = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\dev\_gen\grass_sim.png"

CELL, N = 44, 10
W = H = CELL * N

# ---- L0: 双色底（暖/冷 + 轻微抖动）
WARM, COOL = (0x6E, 0xA9, 0x4D), (0x4C, 0x7F, 0x4E)
base = np.zeros((H, W, 3), np.float32)
for r in range(N):
    for c in range(N):
        col = WARM if (r + c) % 2 == 0 else COOL
        base[r*CELL:(r+1)*CELL, c*CELL:(c+1)*CELL] = col
base /= 255.0

def overlay(b, s):
    return np.where(b <= 0.5, 2*b*s, 1 - 2*(1-b)*(1-s))

def soft_light(b, s):
    return np.where(s <= 0.5, b - (1-2*s)*b*(1-b), b + (2*s-1)*(b*(1-b)*0 + (np.sqrt(b)-b)))

tex = Image.open(f"{BASE}\\tex_grass.png").convert("L")

def tile_like(arr_img, size, scale=1.0, angle=0.0):
    """按 scale/rotate 变换后取左上 size，越界处 wrap（模拟 canvas pattern 平铺）。"""
    t = arr_img.resize((int(size*scale), int(size*scale)), Image.BICUBIC)
    if angle:
        t = t.rotate(angle, resample=Image.BICUBIC, expand=False)
    a = np.array(t)[:size, :size].astype(np.float32) / 255.0
    if a.shape[0] < size or a.shape[1] < size:   # 旋转后变小时居中补
        pad = np.full((size, size), 0.5, np.float32)
        pad[:a.shape[0], :a.shape[1]] = a
        a = pad
    return a

l3 = tile_like(tex, max(W, H), 1.0, 0.0)[:H, :W]
l4 = tile_like(tex, max(W, H), 1.63, 17.0)[:H, :W]

out = overlay(base, l3[..., None]) * 0.34 + base * 0.66      # overlay α.34
out = soft_light(out, l4[..., None]) * 0.22 + out * 0.78     # soft-light α.22

# 格线（暗槽 + 亮棱错开 1px）
img = np.clip(out * 255, 0, 255).astype(np.uint8)
for i in range(N + 1):
    y = i * CELL
    if y < H:
        img[y:y+1, :] = (img[y:y+1, :] * 0.62).astype(np.uint8)
        if y + 1 < H:
            img[y+1:y+2, :] = np.clip(img[y+1:y+2, :].astype(np.int16) + 22, 0, 255).astype(np.uint8)
    x = i * CELL
    if x < W:
        img[:, x:x+1] = (img[:, x:x+1] * 0.62).astype(np.uint8)
        if x + 1 < W:
            img[:, x+1:x+2] = np.clip(img[:, x+1:x+2].astype(np.int16) + 22, 0, 255).astype(np.uint8)

Image.fromarray(img, "RGB").save(OUT)
print("saved", OUT, (W, H))

# 对称性检测：以中心为轴，左右/上下镜像后的像素差异（越小 = 越像万花筒）
g = np.array(img.convert("L")).astype(np.int16)
lr = np.abs(g[:, :W//2].astype(np.int16) - g[:, ::-1][:, :W//2].astype(np.int16)).mean()
print("horizontal mirror diff:", round(float(lr), 2), "(越小越像对称万花筒)")

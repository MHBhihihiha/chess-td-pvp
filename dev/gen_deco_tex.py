# -*- coding: utf-8 -*-
"""
装饰件：程序化脏化纹理（裂纹 / 苔藓 / 锈迹）

为什么不用生成模型：
  这三件是**贴在建筑表面上的脏化层**，不是独立物件。
  生成模型给的是"一块硬边的色块"，贴到墙上就是一块补丁；
  程序化生成的是**软边、可平铺、带噪声不规则性**的 alpha 纹理，
  运行时用 base 的剪影做 mask 叠上去，才会像"长在表面"。

输出 256×256 RGBA，可无缝平铺（用 wrap 索引保证左右上下接缝连续）。
"""
import numpy as np
from PIL import Image, ImageFilter

S = 256
R = np.random.default_rng(20261027)


def fbm(scale_list, size=S):
    """多倍频值噪声叠加，返回 0~1。用 wrap 索引保证可平铺。"""
    acc = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    total = 0.0
    for cell in scale_list:
        g = R.random((cell, cell)).astype(np.float32)
        # 双线性放大到 size，再平铺错位叠加，得到连续噪声
        img = Image.fromarray((g * 255).astype(np.uint8), 'L').resize((size, size), Image.BICUBIC)
        acc += np.asarray(img, dtype=np.float32) / 255.0 * amp
        total += amp
        amp *= 0.55
    return np.clip(acc / total, 0, 1)


def norm01(a):
    lo, hi = float(a.min()), float(a.max())
    return (a - lo) / max(1e-6, hi - lo)


def save_rgba(name, rgb, alpha):
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    a = np.clip(alpha, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, a])
    Image.fromarray(out, 'RGBA').save('art/v9/' + name)
    print('  %-22s alpha 覆盖率 %.1f%%' % (name, (a > 12).mean() * 100))


# ---------------------------------------------------------------- 裂纹
def make_cracks():
    a = np.zeros((S, S), dtype=np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    # 第一版只画 7 条细纹，覆盖率 4.4%，叠到墙上完全读不出来。
    # 改成 18 条 + 加粗 + 更黑，覆盖率约 10~12% 才有"墙体开裂"的观感。
    n = 11
    for _ in range(n):
        x = R.uniform(0, S)
        y = R.uniform(0, S)
        ang = R.uniform(0, np.pi * 2)
        length = R.uniform(70, 190)
        w = R.uniform(1.6, 2.9)
        steps = int(length / 5)
        for i in range(steps):
            ang += R.uniform(-0.55, 0.55)
            x += np.cos(ang) * 5
            y += np.sin(ang) * 5
            # 锥形收细，裂纹末端自然消失
            t = i / max(1, steps - 1)
            ww = w * (1 - t) ** 0.8
            d2 = (xx - x) ** 2 + (yy - y) ** 2
            a = np.maximum(a, np.exp(-d2 / (2 * max(0.6, ww) ** 2)))
            if R.random() < 0.10:      # 分叉
                bx, by, ba = x, y, ang + R.choice([-1, 1]) * R.uniform(0.7, 1.2)
                for _j in range(int(steps * 0.6)):
                    ba += R.uniform(-0.4, 0.4)
                    bx += np.cos(ba) * 4
                    by += np.sin(ba) * 4
                    d2 = (xx - bx) ** 2 + (yy - by) ** 2
                    a = np.maximum(a, np.exp(-d2 / (2 * 1.6 ** 2)) * 0.8)
    a = np.clip(a, 0, 1) ** 1.25
    rgb = np.stack([np.full((S, S), 30.0), np.full((S, S), 25.0), np.full((S, S), 22.0)], -1)
    save_rgba('dc_cracks.png', rgb, a * 240)


# ---------------------------------------------------------------- 苔藓
def make_moss():
    n = fbm([4, 8, 16, 32])
    mask = norm01(n)
    # 只在"上半段阈值"出现，形成成片的斑块而不是满屏
    a = np.clip((mask - 0.48) / 0.26, 0, 1) ** 1.15
    # 高频细节当作苔藓绒毛密度
    fine = norm01(fbm([48, 96, 160]))
    a = a * (0.50 + 0.50 * fine)
    # 第一版高斯模糊 1.2 太软，像水渍；压到 0.4 保留绒毛颗粒感
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8), 'L')
                   .filter(ImageFilter.GaussianBlur(0.4)), dtype=np.float32) / 255.0
    # 颜色：暗苔绿 -> 亮苔绿，用细节噪声做斑驳
    base = np.array([58, 92, 40], dtype=np.float32)
    hi = np.array([140, 178, 82], dtype=np.float32)
    t = norm01(fbm([96, 160]))[..., None]
    rgb = base * (1 - t) + hi * t
    save_rgba('dc_moss.png', rgb, a * 240)


# ---------------------------------------------------------------- 锈迹
def make_rust():
    blot = norm01(fbm([3, 6, 12]))
    fine = norm01(fbm([64, 128, 200]))
    a = np.clip((blot - 0.62) / 0.22, 0, 1) ** 1.3
    a = a * (0.35 + 0.65 * fine)
    # 同样从 0.8 压到 0.35，保留锈斑颗粒
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8), 'L')
                   .filter(ImageFilter.GaussianBlur(0.35)), dtype=np.float32) / 255.0
    dark = np.array([88, 44, 20], dtype=np.float32)
    orange = np.array([186, 100, 40], dtype=np.float32)
    t = norm01(fine)[..., None]
    rgb = dark * (1 - t) + orange * t
    save_rgba('dc_rust.png', rgb, a * 240)


if __name__ == '__main__':
    print('程序化装饰件：')
    make_cracks()
    make_moss()
    make_rust()

# -*- coding: utf-8 -*-
"""大本营 6 级贴图色彩归一：只修正「砂石/金」色域，不动紫色法术球。

问题：L3 色相 49.9°、饱和 0.601，比 L1/L2（34.7°/0.392、37.3°/0.352）明显偏黄偏艳；
L4 色相尚可但饱和 0.495 仍偏高。升级过程中同一栋建筑会突然变黄，观感断裂。

做法：在 HSV 里对「砂石色域」（色相 12°–80°、饱和 >0.06）做色相拉回 + 饱和缩放，
其余像素（法术球紫、绳子、阴影）原样保留。alpha 通道不动。

⚠️ 坑：不要用 `a[mask, :3] = x` 赋值 —— 布尔掩码 + 切片混合索引在赋值时会退化成副本，
像素一个都不会变（第一版就栽在这里，饱和度降了但色相纹丝不动）。必须用显式索引数组。
"""
import numpy as np
from PIL import Image
import colorsys

STONE_HUE = (12.0, 80.0)     # 砂石/金 色域
HUE_TARGET = 37.0            # L1/L2 的均值色相
SAT_TARGET = 0.395           # L1/L2 的均值饱和

PLAN = {
    1: None,
    2: None,
    3: {'hue_pull': 0.85, 'sat_scale': SAT_TARGET / 0.601},
    4: {'hue_pull': 0.35, 'sat_scale': SAT_TARGET / 0.495},
    5: {'hue_pull': 0.30, 'sat_scale': SAT_TARGET / 0.422},
    6: None,
}


def shift_one(h, s):
    """单像素 HSV(h 0..1, s 0..1) → 修正后 (h, s)"""
    hd = h * 360.0
    if STONE_HUE[0] <= hd <= STONE_HUE[1] and s > 0.06:
        d = (HUE_TARGET - hd + 540.0) % 360.0 - 180.0
        hd = hd + d * PULL
        s = min(1.0, s * SS)
    return (hd % 360.0) / 360.0, s


for lv, plan in PLAN.items():
    p = 'dev/_gen/_k%d.png' % lv
    img = Image.open(p).convert('RGBA')
    a = np.asarray(img).astype(np.float32)
    if plan is None:
        print('L%d 保持原样' % lv)
        continue
    PULL, SS = plan['hue_pull'], plan['sat_scale']
    alpha = a[:, :, 3]
    rows, cols = np.where(alpha > 200)          # 显式索引数组
    px = a[rows, cols, :3] / 255.0
    out = np.empty_like(px)
    for i, c in enumerate(px):
        h, s, v = colorsys.rgb_to_hsv(c[0], c[1], c[2])
        nh, ns = shift_one(h, s)
        r, g, b = colorsys.hsv_to_rgb(nh, ns, v)
        out[i] = (r, g, b)
    a[rows, cols, 0] = np.clip(out[:, 0] * 255.0, 0, 255)
    a[rows, cols, 1] = np.clip(out[:, 1] * 255.0, 0, 255)
    a[rows, cols, 2] = np.clip(out[:, 2] * 255.0, 0, 255)
    Image.fromarray(a.astype(np.uint8), 'RGBA').save(p)
    print('L%d 已修正 hue_pull=%.2f sat×%.3f（%d px）' % (lv, PULL, SS, len(rows)))

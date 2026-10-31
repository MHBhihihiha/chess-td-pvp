# -*- coding: utf-8 -*-
"""大本营顶部改造：擦除木杆/旗杆/尖塔，粘贴法师球攻击装置。

流程（每级）：
  1. 读 _archive/keep_orig/base_L{n}.png（原件备份，可反复重跑）
  2. 在中央擦除带内把「杆状物」的像素清零（天空区域自然留空）
  3. 修复：擦除行若左右两侧都有实体 → 用两侧颜色水平插值补一条台面
     （带轻微噪点，避免塑料感）；只有单侧或都没有 → 留空（那是天空）
  4. 把对应纪元的法师球装置贴到正上方：按装置自己的 alpha bbox 定位，
     盘底坐在台基面上并下沉 6px（坐实，不浮空）

几何数据来自 _archive/keep_orig 的逐行 run 分析（2026-10-27）。
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v9')
SRC = os.path.join(ROOT, '_archive', 'keep_orig')

# n: (orb_file, band_x0, band_x1, erase_to_y, seat_y, orb_width_frac)
#   seat_y = 盘底要坐到的台面高度（球图底边 = seat_y + SINK）
CFG = {
    1: ('keep_orb_e1.png', 195, 318, 132, 128, 0.44),   # 木井架：连根擦，修平顶
    2: ('keep_orb_e1.png', 195, 318, 131, 127, 0.44),
    3: ('keep_orb_e2.png', 196, 320, 112, 116, 0.44),   # 旗杆：只擦杆和旗，留石座
    4: ('keep_orb_e2.png', 225, 290, 116, 112, 0.44),   # 尖塔：连根擦
    5: ('keep_orb_e3.png', 215, 332, 143, 137, 0.44),   # 中央塔冠：切平台
    6: ('keep_orb_e3.png', 215, 332, 152, 146, 0.44),
}
SINK = 6   # 盘底下沉量（坐进台面，消除浮空感）

rng = np.random.default_rng(20261027)


def repair_row(a, y, x0, x1):
    """把第 y 行 [x0,x1) 里被擦掉的像素用左右两侧颜色补回来。"""
    row = a[y]
    alpha = row[:, 3]
    xl = None
    for x in range(x0 - 1, -1, -1):
        if alpha[x] > 20:
            xl = x
            break
    xr = None
    for x in range(x1, a.shape[1]):
        if alpha[x] > 20:
            xr = x
            break
    if xl is None or xr is None:
        return  # 至少一侧是天空：中间本来就没有东西，留空
    cl = row[xl, :3].astype(float)
    cr = row[xr, :3].astype(float)
    span = max(1, xr - xl)
    for x in range(x0, x1):
        t = (x - xl) / span
        c = cl * (1 - t) + cr * t
        noise = rng.normal(0, 5.0, 3)
        a[y, x, :3] = np.clip(c + noise, 0, 255)
        a[y, x, 3] = 255


def load_orb(fname, target_w):
    """读装置图 → 裁到 alpha bbox → 缩放到目标宽。返回 (img, bbox_bottom_frac)。"""
    orb = Image.open(os.path.join(ROOT, fname)).convert('RGBA')
    bbox = orb.getbbox()
    orb = orb.crop(bbox)
    tw = target_w
    th = int(orb.height * tw / orb.width)
    return orb.resize((tw, th), Image.LANCZOS)


def build(n, orb_file, x0, x1, ey, seat_y, orb_w):
    src = Image.open(os.path.join(SRC, 'base_L%d.png' % n)).convert('RGBA')
    W, H = src.size
    a = np.array(src)

    # 1+2+3. 擦除 + 修复
    region = a[:ey, x0:x1, :]
    was_solid = region[:, :, 3] > 20
    for y in range(ey):
        if not was_solid[y].any():
            continue
        repair_row(a, y, x0, x1)
    a[:ey, x0:x1, :][was_solid] = 0

    # 4. 粘贴法师球（按 bbox 底边定位，下沉 SINK）
    orb = load_orb(orb_file, int(W * orb_w))
    ox = (W - orb.width) // 2
    oy = seat_y + SINK - orb.height
    base = Image.fromarray(a)
    base.alpha_composite(orb, (ox, oy))
    out = os.path.join(ROOT, 'base_L%d.png' % n)
    base.save(out)
    print('L%d: erase x[%d,%d) y[0,%d) | orb %s %dx%d bottom@%d -> %s'
          % (n, x0, x1, ey, orb_file, orb.width, orb.height, oy + orb.height, out))


def main():
    for n in sorted(CFG):
        build(n, *CFG[n])


if __name__ == '__main__':
    main()

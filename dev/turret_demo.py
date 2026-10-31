# -*- coding: utf-8 -*-
"""炮口转向演示图：按游戏内 canvas 的效果模拟绘制

游戏里建筑 = 圆角方块 + 汉字，炮口 = 从中心伸出的旋转炮管。
这里用 PIL 复刻同一套画法，展示 8 个方向 + 追踪移动敌人的过程。
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v6')
os.makedirs(OUT, exist_ok=True)

BG = (20, 25, 36)
BLUE_HALF = (27, 58, 107)
RED_HALF = (92, 36, 52)

TURRET = {
    'cannon': dict(col='#39476b', hi='#8ea6d4', tip='#1c2436', L=0.40, W=0.17),
    'arrow': dict(col='#2f5c3c', hi='#8ec98c', tip='#d8ffb0', L=0.46, W=0.11),
    'mage': dict(col='#4a3a70', hi='#a98ce0', tip='#e0c4ff', L=0.40, W=0.12),
    'mortar': dict(col='#5c3a52', hi='#c08cb4', tip='#1c1424', L=0.30, W=0.24),
    'tesla': dict(col='#2c5c50', hi='#8ff0e0', tip='#d8fff8', L=0.34, W=0.16),
}
BUILDING = {
    'cannon': ('#6f8fd6', '炮'),
    'arrow': ('#5aab6a', '箭'),
    'mage': ('#9a6fd0', '法'),
    'mortar': ('#a86a9c', '迫'),
    'tesla': ('#59b39a', '电'),
}


def font(sz):
    for c in (r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf'):
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def rr(d, box, r, fill, outline=None, width=0):
    d.rounded_rectangle(box, radius=r, fill=fill)
    if outline:
        d.rounded_rectangle(box, radius=r, outline=outline, width=width)


def draw_tower(d, key, cx, cy, s, ang_deg, show_label=None):
    """复刻游戏内建筑的画法"""
    color, glyph = BUILDING[key]
    st = TURRET[key]
    half = s / 2

    # 圆角方块
    rr(d, [cx - half + 1, cy - half + 1, cx + half - 1, cy + half - 1], 3, color)

    # 汉字（缩小并下移，把中央让给旋转炮口）
    f = font(int(s * 0.27))
    d.text((cx, cy + s * 0.29), glyph, font=f, fill=(0, 0, 0, 100), anchor='mm')

    # 旋转炮管
    a = math.radians(ang_deg)
    L = s * st['L']
    W = s * st['W']
    ux, uy = math.cos(a), math.sin(a)
    px, py = -uy, ux

    def quad(l0, l1, w0, w1):
        return [(cx + ux * l0 + px * w0, cy + uy * l0 + py * w0),
                (cx + ux * l1 + px * w0, cy + uy * l1 + py * w0),
                (cx + ux * l1 - px * w1, cy + uy * l1 - py * w1),
                (cx + ux * l0 - px * w1, cy + uy * l0 - py * w1)]

    # 外轮廓
    d.polygon(quad(-W * 0.28, L + W * 0.02, W * 0.62, W * 0.62), fill=(16, 21, 31))
    # 主体
    d.polygon(quad(-W * 0.20, L, W * 0.50, W * 0.50), fill=st['col'])
    # 上缘高光
    d.polygon(quad(-W * 0.10, L * 0.92, W * 0.42, W * 0.12), fill=st['hi'])
    # 炮口
    d.polygon(quad(L - W * 0.30, L + W * 0.32, W * 0.60, W * 0.60), fill=st['tip'])
    # 炮口内孔
    d.polygon(quad(L - W * 0.20, L + W * 0.10, W * 0.30, W * 0.30), fill=(8, 10, 16))

    if key == 'tesla':
        for sgn in (-1, 1):
            d.line([(cx + ux * L * 0.55 + px * sgn * W * 0.85, cy + uy * L * 0.55 + py * sgn * W * 0.85),
                    (cx + ux * L * 0.98 + px * sgn * W * 0.45, cy + uy * L * 0.98 + py * sgn * W * 0.45)],
                   fill=st['hi'], width=max(1, int(s * 0.035)))
    if key == 'arrow':
        tx = cx + ux * (L + W * 0.72)
        ty = cy + uy * (L + W * 0.72)
        d.polygon([(tx, ty),
                   (cx + ux * (L - W * 0.10) + px * W * 0.62, cy + uy * (L - W * 0.10) + py * W * 0.62),
                   (cx + ux * (L - W * 0.10) - px * W * 0.62, cy + uy * (L - W * 0.10) - py * W * 0.62)],
                  fill=st['tip'])

    # 转轴
    rr_ = max(2, int(s * 0.085))
    d.ellipse([cx - rr_, cy - rr_, cx + rr_, cy + rr_], fill=(26, 33, 48),
              outline=st['hi'], width=max(1, int(s * 0.022)))
    d.ellipse([cx - rr_ * 0.45, cy - rr_ * 0.55, cx + rr_ * 0.35, cy + rr_ * 0.25],
              fill=(210, 220, 240))

    if show_label:
        d.text((cx, cy + half + s * 0.22), show_label, font=font(int(s * 0.20)),
               fill=(170, 195, 225), anchor='mm')


def demo_angles():
    """同一座炮塔的 8 个朝向"""
    s = 76
    pad = 30
    cols = 8
    W = int(pad * 2 + cols * (s * 1.62))
    H = int(235 + pad * 2)
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 20), '炮口跟随目标转向  ·  8 个方向', font=font(23), fill=(228, 240, 255))
    d.text((pad, 50), '建筑中心是旋转轴；炮管在两个角度之间走最短路径平滑插值（不会绕远路甩头）',
           font=font(13), fill=(140, 164, 194))

    angles = [0, 45, 90, 135, 180, -135, -90, -45]
    for i, a in enumerate(angles):
        cx = int(pad + i * (s * 1.62) + s * 0.62)
        cy = int(125)
        d.ellipse([cx - s * 0.66, cy - s * 0.66, cx + s * 0.66, cy + s * 0.66],
                  outline=(50, 68, 94), width=1)
        draw_tower(d, 'cannon', cx, cy, s, a)
        # 方向小箭头
        rad = s * 0.90
        ax = cx + math.cos(math.radians(a)) * rad
        ay = cy + math.sin(math.radians(a)) * rad
        d.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], fill=(110, 200, 255))
        d.text((cx, cy + s * 0.90), f'{a}°', font=font(int(s * 0.22)),
               fill=(160, 200, 240), anchor='mm')
    img.save(os.path.join(OUT, 'demo_turret_angles.png'))
    print('saved demo_turret_angles.png')


def demo_tracking():
    """一个炮塔追踪一个绕圈的敌人"""
    s = 76
    n = 6
    pad = 30
    cell = int(s * 2.6)
    W = int(pad * 2 + n * cell)
    H = int(255 + pad * 2)
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 20), '炮口追踪移动中的敌人', font=font(23), fill=(228, 240, 255))
    d.text((pad, 50), '敌人沿弧线移动 → 瞄准点每帧更新 → 炮管平滑跟随（不是瞬间甩头）',
           font=font(13), fill=(140, 164, 194))

    # 模拟敌人从右上绕到右下的轨迹
    traj = [(-40, -95), (-5, -100), (35, -85), (70, -45), (85, 5), (70, 55)]

    for i in range(n):
        cx = pad + i * cell + cell // 2
        cy = int(105 + cell * 0.42)
        draw_tower(d, 'cannon', cx, cy, s, 0)   # 先占位，下面重画

    # 重画（带正确的角度）
    img2 = Image.new('RGB', (W, H), BG)
    d2 = ImageDraw.Draw(img2)
    d2.text((pad, 20), '炮口追踪移动中的敌人', font=font(23), fill=(228, 240, 255))
    d2.text((pad, 50), '敌人沿弧线移动 → 瞄准点每帧更新 → 炮管平滑跟随（不是瞬间甩头）',
           font=font(13), fill=(140, 164, 194))

    for i in range(n):
        cx = pad + i * cell + cell // 2
        cy = int(150 + s * 0.55)
        ex = cx + traj[i][0] * 0.62
        ey = cy + traj[i][1] * 0.62
        ang = math.degrees(math.atan2(ey - cy, ex - cx))
        # 网格底
        d2.ellipse([cx - s * 0.78, cy - s * 0.78, cx + s * 0.78, cy + s * 0.78],
                   outline=(46, 62, 86), width=1)
        draw_tower(d2, 'cannon', cx, cy, s, ang)
        # 敌人
        er = s * 0.20
        d2.ellipse([ex - er, ey - er, ex + er, ey + er], fill=(214, 74, 66),
                   outline=(255, 160, 150), width=2)
        d2.ellipse([ex - er * 0.35, ey - er * 0.42, ex + er * 0.05, ey + er * 0.02],
                   fill=(255, 220, 215))
        # 瞄准虚线
        for k in range(1, 5):
            t0 = k / 5.0
            t1 = t0 + 0.09
            d2.line([(cx + (ex - cx) * t0, cy + (ey - cy) * t0),
                     (cx + (ex - cx) * t1, cy + (ey - cy) * t1)],
                    fill=(110, 200, 255, 120), width=2)
        d2.text((cx, cy + s * 0.95), f'{ang:.0f}°', font=font(int(s * 0.22)),
                fill=(150, 200, 240), anchor='mm')

    img2.save(os.path.join(OUT, 'demo_turret_tracking.png'))
    print('saved demo_turret_tracking.png')


def demo_types():
    """五种塔的炮口样式"""
    s = 90
    keys = ['cannon', 'arrow', 'mage', 'mortar', 'tesla']
    pad = 32
    cell = int(s * 1.9)
    W = int(pad * 2 + len(keys) * cell)
    H = int(230 + pad * 2)
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 20), '五种塔的炮口样式各不相同', font=font(23), fill=(228, 240, 255))
    d.text((pad, 50), '粗短炮管 / 细长箭管 / 法杖光球 / 超短粗管 / 双叉电极',
           font=font(13), fill=(140, 164, 194))
    names = {'cannon': '炮塔', 'arrow': '箭塔', 'mage': '法师塔',
             'mortar': '迫击炮', 'tesla': '特斯拉'}
    for i, k in enumerate(keys):
        cx = pad + i * cell + cell // 2
        cy = 150
        draw_tower(d, k, cx, cy, s, -28)
        d.text((cx, cy + s * 0.98), names[k], font=font(int(s * 0.22)),
               fill=(180, 205, 235), anchor='mm')
    img.save(os.path.join(OUT, 'demo_turret_types.png'))
    print('saved demo_turret_types.png')


if __name__ == '__main__':
    demo_angles()
    demo_tracking()
    demo_types()

# -*- coding: utf-8 -*-
"""法术图标（6 种）—— 卡牌图标风格，深色底，易抠图"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import art_v8_lib as L

SS = L.SS
OUT = L.OUT
OL = L.OL
hx, sh, R = L.hx, L.sh, L.R
canvas, bl, mp, me, rad, lgr, ps = L.canvas, L.bl, L.mp, L.me, L.rad, L.lgr, L.ps
grain = L.grain
C_LINE = L.C_LINE


def frame(img, W, color):
    """图标外圈的阵营/法术色环"""
    d = ImageDraw.Draw(img)
    cx = cy = W * 0.5
    r = W * 0.455
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=R(L.sh(color, 0.42), 238),
              width=int(W * 0.036))
    d.ellipse([cx - r + W * 0.016, cy - r + W * 0.016,
               cx + r - W * 0.016, cy + r - W * 0.016],
              outline=R(L.sh(color, 1.40), 185), width=int(W * 0.014))
    return img


def sp_arrow_rain(size=256):
    """箭雨：漫天箭矢从天而降（范围最大、伤害最低）"""
    W = size * SS
    S = W
    img = canvas(W)
    cx = cy = W * 0.5
    img = L.glow(img, cx, cy, S * 0.20, '#8fd3f4', layers=4, a0=30, b=2.6)
    d = ImageDraw.Draw(img)
    # 云（淡淡的）
    for (ox, oy, rw) in [(-0.14, -0.26, 0.13), (0.02, -0.30, 0.15), (0.17, -0.25, 0.12)]:
        ps(img, rad(W, cx + S * ox, cy + S * oy, S * rw * 1.6,
                    [(0.0, 'rgba'.replace('rgba', '#c8e4f8')), (0.5, '#7aa8c8'), (1.0, '#3a5a78')]),
           me(W, cx + S * ox, cy + S * oy, S * rw, S * rw * 0.62))
    # 多支箭（不同角度落下）
    arrows = [(-0.19, -0.05, -72), (-0.08, 0.02, -78), (0.04, -0.08, -68),
              (0.14, 0.00, -80), (-0.13, 0.12, -74), (0.00, 0.13, -84),
              (0.11, 0.13, -70), (-0.02, -0.17, -76)]
    for (ox, oy, ang) in arrows:
        a = math.radians(ang)
        ux, uy = math.cos(a), math.sin(a)
        px, py = -uy, ux
        bx, by = cx + S * ox, cy + S * oy
        ex, ey = bx + ux * S * 0.145, by + uy * S * 0.145
        d.line([(bx, by), (ex, ey)], fill=R('#c8a870'), width=int(S * 0.013))
        # 箭头
        d.polygon([(ex + ux * S * 0.022, ey + uy * S * 0.022),
                   (ex - ux * S * 0.012 + px * S * 0.016, ey - uy * S * 0.012 + py * S * 0.016),
                   (ex - ux * S * 0.012 - px * S * 0.016, ey - uy * S * 0.012 - py * S * 0.016)],
                  fill=R('#eafbd8'))
        # 尾羽
        for fw in (-1, 1):
            d.line([(bx, by), (bx + ux * S * 0.030 + px * fw * S * 0.017,
                               by + uy * S * 0.030 + py * fw * S * 0.017)],
                   fill=R('#8fd3f4'), width=int(S * 0.010))
        # 落点涟漪
        d.ellipse([ex - S * 0.020, ey + S * 0.008, ex + S * 0.020, ey + S * 0.026],
                  outline=R('#8fd3f4', 120), width=int(1.6 * SS))
    return frame(grain(img, 2).resize((size, size), Image.LANCZOS), size * SS, '#8fd3f4').resize((size, size), Image.LANCZOS)


def sp_fireball(size=256):
    """火球：燃烧的球体 + 尾焰"""
    W = size * SS
    S = W
    img = canvas(W)
    cx = cy = W * 0.5
    d = ImageDraw.Draw(img)
    # 尾焰（左下拖尾，用圆形遮罩裁掉出框部分）
    trail = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    for i, (t, rr, al) in enumerate([(0.24, 0.14, 80), (0.40, 0.105, 110), (0.56, 0.075, 150)]):
        tx = cx - S * t * 0.86
        ty = cy + S * t * 0.72
        ImageDraw.Draw(trail).ellipse([tx - S * rr, ty - S * rr, tx + S * rr, ty + S * rr],
                                      fill=R('#ff7a2a', al))
    trail = bl(trail, 2.6 * SS)
    clip = Image.new('L', (W, W), 0)
    cr = W * 0.438
    ImageDraw.Draw(clip).ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=255)
    trail.putalpha(Image.composite(trail.getchannel('A'), Image.new('L', (W, W), 0), clip))
    img.alpha_composite(trail)
    img = L.glow(img, cx + S * 0.03, cy - S * 0.03, S * 0.165, '#ff9a4a', layers=5, a0=42, b=3.2)
    d = ImageDraw.Draw(img)
    # 球体
    ps(img, rad(W, cx + S * 0.03, cy - S * 0.03, S * 0.24,
                [(0.0, '#fffbe8'), (0.22, '#ffd766'), (0.50, '#ff9a2a'),
                 (0.80, '#e04a18'), (1.0, '#7a1c08')]),
       me(W, cx + S * 0.03, cy - S * 0.03, S * 0.132, S * 0.132))
    d.ellipse([cx + S * 0.03 - S * 0.132, cy - S * 0.03 - S * 0.132,
               cx + S * 0.03 + S * 0.132, cy - S * 0.03 + S * 0.132],
              outline=R('#5a1604', 200), width=int(OL * 0.9))
    # 火焰边缘跳动
    for i in range(9):
        a = i * 2 * math.pi / 9 + 0.3
        r0 = S * 0.132
        r1 = S * (0.175 + 0.020 * ((i * 7) % 3))
        d.polygon([(cx + S * 0.03 + math.cos(a - 0.16) * r0,
                    cy - S * 0.03 + math.sin(a - 0.16) * r0),
                   (cx + S * 0.03 + math.cos(a) * r1,
                    cy - S * 0.03 + math.sin(a) * r1),
                   (cx + S * 0.03 + math.cos(a + 0.16) * r0,
                    cy - S * 0.03 + math.sin(a + 0.16) * r0)],
                  fill=R('#ffb04a', 175))
    # 核心高光
    d.ellipse([cx - S * 0.020, cy - S * 0.100, cx + S * 0.062, cy - S * 0.020],
              fill=(255, 255, 240, 230))
    return frame(grain(img, 2).resize((size, size), Image.LANCZOS), size * SS, '#ff9a4a').resize((size, size), Image.LANCZOS)


def sp_rocket(size=256):
    """火箭：单发高伤，垂直俯冲"""
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.5, W * 0.5
    d = ImageDraw.Draw(img)
    # 尾焰（向下）
    for i, (t, rr, al) in enumerate([(0.00, 0.085, 190), (0.10, 0.070, 160), (0.20, 0.052, 120)]):
        ty = cy + S * (0.16 + t)
        g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([cx - S * rr, ty - S * rr * 1.4,
                                   cx + S * rr, ty + S * rr * 1.4],
                                  fill=R('#ff6a2a' if i == 0 else '#ffb04a', al))
        img.alpha_composite(bl(g, 2.4 * SS))
    img = L.glow(img, cx, cy - S * 0.04, S * 0.145, '#ff6a6a', layers=4, a0=34, b=2.8)
    d = ImageDraw.Draw(img)
    # 弹体（细长，朝上）
    body = [(cx - S * 0.048, cy + S * 0.130), (cx - S * 0.048, cy - S * 0.075),
            (cx, cy - S * 0.185), (cx + S * 0.048, cy - S * 0.075),
            (cx + S * 0.048, cy + S * 0.130)]
    ps(img, lgr(W, (cx - S * 0.05, 0), (cx + S * 0.05, 0),
                [(0.0, '#3a5a8a'), (0.32, '#d8e4f4'), (0.56, '#8ea4c4'), (1.0, '#2a3450')]),
       mp(W, body))
    d.polygon(body, outline=R(C_LINE), width=int(OL * 0.9))
    # 红头
    d.polygon([(cx - S * 0.048, cy - S * 0.075), (cx, cy - S * 0.185), (cx + S * 0.048, cy - S * 0.075)],
              fill=R('#e8483c'), outline=R(C_LINE), width=int(OL * 0.8))
    # 尾翼
    for s in (-1, 1):
        d.polygon([(cx + s * S * 0.048, cy + S * 0.056),
                   (cx + s * S * 0.100, cy + S * 0.140),
                   (cx + s * S * 0.048, cy + S * 0.140)],
                  fill=R('#c8382c'), outline=R(C_LINE), width=int(OL * 0.7))
    # 舷窗
    d.ellipse([cx - S * 0.020, cy - S * 0.040, cx + S * 0.020, cy + S * 0.000],
              fill=R('#7fe8ff'), outline=R(C_LINE), width=int(OL * 0.6))
    d.ellipse([cx - S * 0.010, cy - S * 0.032, cx + S * 0.004, cy - S * 0.018],
              fill=(255, 255, 255, 220))
    return frame(grain(img, 2).resize((size, size), Image.LANCZOS), size * SS, '#ff6a6a').resize((size, size), Image.LANCZOS)


def sp_rage(size=256):
    """狂暴：金色光环 + 怒火（己方攻速翻倍）"""
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.5, W * 0.5
    d = ImageDraw.Draw(img)
    # 底部光环
    img = L.glow(img, cx, cy, S * 0.20, '#ffd479', layers=5, a0=40, b=3.0, sy=0.55)
    d = ImageDraw.Draw(img)
    for k in range(3):
        rr = S * (0.19 + k * 0.055)
        d.ellipse([cx - rr, cy + S * 0.10 - rr * 0.42, cx + rr, cy + S * 0.10 + rr * 0.42],
                  outline=R('#ffd479', 150 - k * 40), width=int(2.4 * SS))
    # 上升的火焰舌
    for i in range(7):
        a = -math.pi / 2 + (i - 3) * 0.36
        r0 = S * 0.115
        r1 = S * (0.215 + 0.030 * ((i * 5) % 3))
        bx0 = cx + math.cos(a) * r0
        by0 = cy + S * 0.06 + math.sin(a) * r0 * 0.7
        d.polygon([(bx0 - S * 0.024, by0 + S * 0.030),
                   (cx + math.cos(a) * r1, cy + S * 0.06 + math.sin(a) * r1 * 0.7),
                   (bx0 + S * 0.024, by0 + S * 0.030)],
                  fill=R('#ffb640' if i % 2 == 0 else '#ffe08a', 170))
    # 中央「怒」形：一个握拳/怒面剪影
    ps(img, rad(W, cx, cy + S * 0.030, S * 0.185,
                [(0.0, '#ffeaa8'), (0.34, '#e8a83c'), (0.72, '#a86a18'), (1.0, '#5a3408')]),
       me(W, cx, cy + S * 0.030, S * 0.100, S * 0.100))
    d.ellipse([cx - S * 0.100, cy + S * 0.030 - S * 0.100,
               cx + S * 0.100, cy + S * 0.030 + S * 0.100],
              outline=R('#4a2808', 210), width=int(OL * 0.9))
    # 怒目
    for s in (-1, 1):
        d.polygon([(cx + s * S * 0.018, cy - S * 0.030), (cx + s * S * 0.062, cy - S * 0.012),
                   (cx + s * S * 0.020, cy + S * 0.006)],
                  fill=R('#3a1a04'))
    # 怒吼口
    d.ellipse([cx - S * 0.036, cy + S * 0.030, cx + S * 0.036, cy + S * 0.094],
              fill=R('#3a1a04'))
    d.ellipse([cx - S * 0.024, cy + S * 0.048, cx + S * 0.024, cy + S * 0.084],
              fill=R('#8a2a10'))
    return frame(grain(img, 2).resize((size, size), Image.LANCZOS), size * SS, '#ffd479').resize((size, size), Image.LANCZOS)


def sp_freeze(size=256):
    """冰冻：敌人与建筑停止 4 秒"""
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.5, W * 0.5
    img = L.glow(img, cx, cy, S * 0.20, '#9fe8ff', layers=5, a0=36, b=3.0)
    d = ImageDraw.Draw(img)
    # 中央冰晶（六角）
    r = S * 0.135
    pts = [(cx + math.cos(-math.pi / 2 + i * math.pi / 3) * r,
            cy + math.sin(-math.pi / 2 + i * math.pi / 3) * r * 1.16) for i in range(6)]
    ps(img, rad(W, cx, cy - S * 0.02, S * 0.26,
                [(0.0, '#ffffff'), (0.22, '#e4fbff'), (0.52, '#8fe0ff'),
                 (0.82, '#2aa8e0'), (1.0, '#0a5a88')]), mp(W, pts))
    d.polygon(pts, outline=R('#0a4a70', 200), width=int(OL * 0.9))
    # 晶面
    for i in range(6):
        a = -math.pi / 2 + i * math.pi / 3
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 1.06)],
               fill=R('#ffffff', 120), width=int(1.8 * SS))
    d.ellipse([cx - S * 0.048, cy - S * 0.098, cx + S * 0.010, cy - S * 0.034],
              fill=(255, 255, 255, 235))
    # 六角雪花（周围）
    for i in range(6):
        a = i * math.pi / 3 + 0.26
        sx = cx + math.cos(a) * S * 0.255
        sy = cy + math.sin(a) * S * 0.245
        d.line([(sx - math.cos(a) * S * 0.042, sy - math.sin(a) * S * 0.042),
                (sx + math.cos(a) * S * 0.042, sy + math.sin(a) * S * 0.042)],
               fill=R('#c8f4ff', 210), width=int(2.2 * SS))
        for k in (-1, 1):
            bb = a + k * 0.9
            d.line([(sx, sy), (sx + math.cos(bb) * S * 0.030, sy + math.sin(bb) * S * 0.030)],
                   fill=R('#c8f4ff', 180), width=int(1.8 * SS))
    # 霜花碎点
    rng = np.random.default_rng(9)
    for _ in range(26):
        px2 = cx + rng.uniform(-0.36, 0.36) * S
        py2 = cy + rng.uniform(-0.36, 0.36) * S
        rr = rng.uniform(0.004, 0.011) * S
        d.ellipse([px2 - rr, py2 - rr, px2 + rr, py2 + rr], fill=R('#dff8ff', 170))
    return frame(grain(img, 2).resize((size, size), Image.LANCZOS), size * SS, '#9fe8ff').resize((size, size), Image.LANCZOS)


def sp_weaken(size=256):
    """弱化：敌人伤害 -80%，5 秒"""
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.5, W * 0.5
    img = L.glow(img, cx, cy, S * 0.20, '#c9a0d8', layers=5, a0=34, b=3.0)
    d = ImageDraw.Draw(img)
    # 缠绕雾气（多层半透明环）
    for k in range(4):
        rr = S * (0.13 + k * 0.055)
        g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        ImageDraw.Draw(g).arc([cx - rr, cy - rr * 0.60, cx + rr, cy + rr * 0.60],
                              200 + k * 40, 340 + k * 40,
                              fill=R('#c9a0d8', 120 - k * 22), width=int(3.0 * SS))
        img.alpha_composite(bl(g, 2.2 * SS))
    d = ImageDraw.Draw(img)
    # 中央：向下的箭头（力量流失）
    for i, (yy, ww, al) in enumerate([(-0.02, 0.075, 235), (0.075, 0.058, 190), (0.150, 0.042, 145)]):
        y0 = cy + S * yy
        d.polygon([(cx - S * ww, y0 - S * 0.032), (cx + S * ww, y0 - S * 0.032),
                   (cx, y0 + S * 0.052)],
                  fill=R('#9a72b0', al), outline=R('#3a2050', 200),
                  width=int(OL * 0.6))
    # 裂开的护符
    ps(img, rad(W, cx, cy - S * 0.055, S * 0.16,
                [(0.0, '#e8d8f4'), (0.36, '#a884c4'), (0.72, '#6a4a86'), (1.0, '#33204a')]),
       me(W, cx, cy - S * 0.055, S * 0.088, S * 0.088))
    d.ellipse([cx - S * 0.088, cy - S * 0.143, cx + S * 0.088, cy + S * 0.033],
              outline=R('#2a1840', 210), width=int(OL * 0.9))
    # 裂纹
    d.line([(cx - S * 0.030, cy - S * 0.132), (cx + S * 0.006, cy - S * 0.070),
            (cx - S * 0.026, cy - S * 0.030), (cx + S * 0.020, cy + S * 0.020)],
           fill=R('#241434', 230), width=int(2.6 * SS))
    # 紫雾粒子
    rng = np.random.default_rng(4)
    for _ in range(20):
        px2 = cx + rng.uniform(-0.34, 0.34) * S
        py2 = cy + rng.uniform(-0.34, 0.34) * S
        rr = rng.uniform(0.005, 0.013) * S
        d.ellipse([px2 - rr, py2 - rr, px2 + rr, py2 + rr], fill=R('#d8b8e8', 150))
    return frame(grain(img, 2).resize((size, size), Image.LANCZOS), size * SS, '#c9a0d8').resize((size, size), Image.LANCZOS)


SPELL_FN = {
    'arrowRain': sp_arrow_rain, 'fireball': sp_fireball, 'rocket': sp_rocket,
    'rage': sp_rage, 'freeze': sp_freeze, 'weaken': sp_weaken,
}


def export_all(size=256):
    import art_v8_units as U
    for k, fn in U.UNIT_FN.items():
        fn(size, 'blue').save(os.path.join(OUT, f'unit_{k}_blue.png'))
    # 红方版本（主要 3 个）
    for k in ('infantry', 'archer', 'dragon'):
        U.UNIT_FN[k](size, 'red').save(os.path.join(OUT, f'unit_{k}_red.png'))
    # 气球兵沿用 v7 版，复制过来
    import shutil
    src = os.path.join(os.path.dirname(OUT), 'v6')
    for fr in ('idle', 'throw', 'wind'):
        p = os.path.join(src, f'balloon_blue_{fr}.png')
        if os.path.exists(p):
            shutil.copy(p, os.path.join(OUT, f'unit_balloon_blue_{fr}.png'))
    p = os.path.join(src, 'balloon_red_throw.png')
    if os.path.exists(p):
        shutil.copy(p, os.path.join(OUT, 'unit_balloon_red_throw.png'))

    for k, fn in SPELL_FN.items():
        fn(size).save(os.path.join(OUT, f'spell_{k}.png'))
    print('exported units + spells')


if __name__ == '__main__':
    export_all()

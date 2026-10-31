# -*- coding: utf-8 -*-
"""
美术参考图生成器 v2
风格：皇室战争 / 部落冲突 / 王国保卫战
  - 厚重描边（2~3px 深色外轮廓）
  - 45° 斜俯视（顶面 + 正面厚度）
  - 高饱和色块分层（亮/中/暗三档，不做写实渐变）
  - 明显的"可读轮廓"：远处也能认出是什么
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')
os.makedirs(OUT, exist_ok=True)
SS = 4


# ----------------------------------------------------------------- 工具
def canvas(w, h):
    return Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))


def finish(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def _s(pts):
    return [(x * SS, y * SS) for x, y in pts]


def poly(d, pts, fill, outline=None, w=0):
    p = _s(pts)
    d.polygon(p, fill=fill)
    if outline is not None:
        d.line(p + [p[0]], fill=outline, width=int(w * SS), joint='curve')


def ell(d, box, fill, outline=None, w=0):
    b = [v * SS for v in box]
    d.ellipse(b, fill=fill)
    if outline is not None:
        d.ellipse(b, outline=outline, width=int(w * SS))


def rr(d, box, r, fill, outline=None, w=0):
    b = [v * SS for v in box]
    d.rounded_rectangle(b, radius=r * SS, fill=fill)
    if outline is not None:
        d.rounded_rectangle(b, outline=outline, width=int(w * SS), radius=r * SS)


def ln(d, pts, fill, w):
    d.line(_s(pts), fill=fill, width=int(w * SS), joint='curve')


def sh(hexc, f):
    hexc = hexc.lstrip('#')
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    if f <= 1:
        r, g, b = r * f, g * f, b * f
    else:
        t = f - 1
        r, g, b = r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t
    return (int(max(0, min(255, r))), int(max(0, min(255, g))), int(max(0, min(255, b))), 255)


def glow_layer(img, cx, cy, r, color, layers=4, strength=45, blur=2.4, squash=0.9, ss=SS):
    g = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for k in range(layers):
        rr_ = r * (2.5 - k * 0.45)
        gd.ellipse([(cx - rr_) * ss, (cy - rr_ * squash) * ss,
                    (cx + rr_) * ss, (cy + rr_ * squash) * ss],
                   fill=sh(color, 1.0)[:3] + (strength + k * 32,))
    g = g.filter(ImageFilter.GaussianBlur(blur * ss))
    return Image.alpha_composite(img, g)


def octagon(cx, cy, r, squash=1.0, rot=math.pi / 8):
    return [(cx + math.cos(rot + i * math.pi / 4) * r,
             cy + math.sin(rot + i * math.pi / 4) * r * squash) for i in range(8)]


# ================================================================ 炮塔
def draw_cannon(level=1, branch=None, size=128, team='blue'):
    """
    等级演进策略（Lv1 → Lv10）：
      Lv1-2  简陋：小石台 + 细炮管，无装饰
      Lv3-4  加固：底座出现铆钉/护甲带，炮管加粗
      Lv5-6  分支成型：出现能量核心，炮塔明显变大
      Lv7-9  精工：加装饰环、双色金属、炮口制退器
      Lv10   传说：金色镶边 + 外光环 + 能量溢出
    """
    S = size
    img = canvas(S, S)
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2

    if team == 'blue':
        main, steel, dark = '#6f8fd6', '#aec3e6', '#1d2740'
        stone, stone_lt, stone_dk = '#5a6478', '#808b9e', '#3a4252'
    else:
        main, steel, dark = '#d67a6f', '#e6c0b8', '#40201d'
        stone, stone_lt, stone_dk = '#78645a', '#9e8b80', '#52423a'

    t = (level - 1) / 9.0
    base_r = 0.315 + 0.085 * t
    turret_r = 0.155 + 0.062 * t
    barrel_len = 0.30 + 0.155 * t
    barrel_w = 0.105 + 0.070 * t        # 明显加粗
    squash = 0.60

    # ① 投影
    ell(d, (cx - base_r * S * 1.00, cy + base_r * S * squash * 0.10,
            cx + base_r * S * 1.00, cy + base_r * S * squash * 1.30),
        fill=(0, 0, 0, 62))

    # ② 基座：侧面 + 顶面
    rb = base_r * S
    poly(d, octagon(cx, cy + rb * squash * 0.20, rb * 0.985, squash),
         sh(stone_dk, 1.0), outline=sh(dark, 1.0), w=2.0)
    poly(d, octagon(cx, cy, rb, squash), sh(stone, 1.0), outline=sh(dark, 1.0), w=2.0)
    poly(d, octagon(cx, cy - rb * squash * 0.045, rb * 0.80, squash), sh(stone_lt, 1.0))

    # 石砖缝
    n = 5 + min(5, level)
    for i in range(n):
        a = i * (2 * math.pi / n) + 0.22
        ln(d, [(cx + math.cos(a) * rb * 0.24, cy + math.sin(a) * rb * 0.24 * squash),
               (cx + math.cos(a) * rb * 0.92, cy + math.sin(a) * rb * 0.92 * squash)],
           sh(stone, 0.62), 1.0)

    # Lv3+ 铆钉
    if level >= 3:
        for i in range(8):
            a = math.pi / 8 + i * math.pi / 4
            rx = cx + math.cos(a) * rb * 0.88
            ry = cy + math.sin(a) * rb * 0.88 * squash
            rad = S * 0.018
            ell(d, (rx - rad, ry - rad, rx + rad, ry + rad), sh(steel, 0.95),
                outline=sh(dark, 1.0), w=0.8)

    # Lv6+ 金属护甲带
    if level >= 6:
        band = octagon(cx, cy - rb * squash * 0.02, rb * 1.02, squash)
        d.line(_s(band) + [_s([band[0]])[0]], fill=sh(main, 1.0),
               width=int(2.4 * SS), joint='curve')

    # Lv9+ 金色装饰点
    if level >= 9:
        for i in range(4):
            a = math.pi / 4 + i * math.pi / 2
            rx, ry = cx + math.cos(a) * rb * 0.72, cy + math.sin(a) * rb * 0.72 * squash
            rad = S * 0.022
            ell(d, (rx - rad, ry - rad, rx + rad, ry + rad), sh('#e8b84a', 1.0),
                outline=sh(dark, 1.0), w=1.0)

    # ③ 转塔
    rt = turret_r * S
    ell(d, (cx - rt, cy - rt * 0.30, cx + rt, cy + rt * 1.20),
        sh(main, 0.62), outline=sh(dark, 1.0), w=2.0)
    ell(d, (cx - rt, cy - rt * 0.95, cx + rt, cy + rt * 0.80),
        sh(main, 1.0), outline=sh(dark, 1.0), w=2.0)
    ell(d, (cx - rt * 0.94, cy - rt * 0.92, cx + rt * 0.94, cy + rt * 0.74), sh(main, 1.12))
    # 顶面高光
    ell(d, (cx - rt * 0.66, cy - rt * 0.80, cx + rt * 0.22, cy - rt * 0.06), sh(main, 1.42))
    # Lv4+ 转塔装甲板
    if level >= 4:
        for i in range(6):
            a = i * math.pi / 3 + 0.4
            x1 = cx + math.cos(a) * rt * 0.42
            y1 = cy - rt * 0.10 + math.sin(a) * rt * 0.42
            x2 = cx + math.cos(a) * rt * 0.90
            y2 = cy - rt * 0.10 + math.sin(a) * rt * 0.90
            ln(d, [(x1, y1), (x2, y2)], sh(main, 0.74), 1.3)

    # ④ 炮管（朝右上 32°）
    ang = math.radians(-32)
    bl = barrel_len * S
    bw = barrel_w * S
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux

    if branch == 'twin':
        offsets = [-bw * 0.58, bw * 0.58]
    else:
        offsets = [0]

    for off in offsets:
        wmul = 1.75 if branch == 'bigcannon' else 1.0
        hw = bw * 0.5 * wmul
        ox, oy = px * off, py * off
        base_pt = (cx + ox * 0.6, cy + oy * 0.6)
        tip_pt = (cx + ux * bl + ox, cy + uy * bl + oy)

        # 炮管投影
        quad_s = [
            (base_pt[0] + px * hw + S * 0.010, base_pt[1] + py * hw + S * 0.014),
            (tip_pt[0] + px * hw + S * 0.010, tip_pt[1] + py * hw + S * 0.014),
            (tip_pt[0] - px * hw + S * 0.010, tip_pt[1] - py * hw + S * 0.014),
            (base_pt[0] - px * hw + S * 0.010, base_pt[1] - py * hw + S * 0.014),
        ]
        poly(d, quad_s, (0, 0, 0, 42))

        # 管身（下暗上亮两块，制造圆柱感）
        body_dn = [
            (base_pt[0] + px * hw, base_pt[1] + py * hw),
            (tip_pt[0] + px * hw, tip_pt[1] + py * hw),
            (tip_pt[0] + px * hw * 0.10, tip_pt[1] + py * hw * 0.10),
            (base_pt[0] + px * hw * 0.10, base_pt[1] + py * hw * 0.10),
        ]
        body_up = [
            (base_pt[0] + px * hw * 0.10, base_pt[1] + py * hw * 0.10),
            (tip_pt[0] + px * hw * 0.10, tip_pt[1] + py * hw * 0.10),
            (tip_pt[0] - px * hw, tip_pt[1] - py * hw),
            (base_pt[0] - px * hw, base_pt[1] - py * hw),
        ]
        poly(d, body_dn, sh(steel, 0.72))
        poly(d, body_up, sh(steel, 1.0))
        # 高光棱线
        ln(d, [(base_pt[0] - px * hw * 0.62, base_pt[1] - py * hw * 0.62),
               (tip_pt[0] - px * hw * 0.62, tip_pt[1] - py * hw * 0.62)], sh(steel, 1.40), 1.6)
        # 整体轮廓
        outline_q = [
            (base_pt[0] + px * hw, base_pt[1] + py * hw),
            (tip_pt[0] + px * hw, tip_pt[1] + py * hw),
            (tip_pt[0] - px * hw, tip_pt[1] - py * hw),
            (base_pt[0] - px * hw, base_pt[1] - py * hw),
        ]
        d.line(_s(outline_q) + [_s(outline_q)[0]], fill=sh(dark, 1.0),
               width=int(2.0 * SS), joint='curve')

        # 炮口制退器（等级越高越明显）
        mo = hw * (1.32 if level >= 7 else 1.18)
        ml = hw * (0.60 if level >= 7 else 0.46)
        mcol = sh(steel, 0.52)
        mq = [
            (tip_pt[0] + px * mo, tip_pt[1] + py * mo),
            (tip_pt[0] + ux * ml + px * mo, tip_pt[1] + uy * ml + py * mo),
            (tip_pt[0] + ux * ml - px * mo, tip_pt[1] + uy * ml - py * mo),
            (tip_pt[0] - px * mo, tip_pt[1] - py * mo),
        ]
        poly(d, mq, mcol, outline=sh(dark, 1.0), w=1.8)
        # 制退器上的两道箍
        for gk in (0.28, 0.62):
            gx = tip_pt[0] + ux * ml * gk
            gy = tip_pt[1] + uy * ml * gk
            ln(d, [(gx + px * mo, gy + py * mo), (gx - px * mo, gy - py * mo)],
               sh(steel, 0.86), 1.2)
        # 炮口内孔
        hole = [
            (tip_pt[0] + ux * ml * 1.02 + px * mo * 0.58, tip_pt[1] + uy * ml * 1.02 + py * mo * 0.58),
            (tip_pt[0] + ux * ml * 1.02 - px * mo * 0.58, tip_pt[1] + uy * ml * 1.02 - py * mo * 0.58),
            (tip_pt[0] + ux * ml * 0.80 - px * mo * 0.58, tip_pt[1] + uy * ml * 0.80 - py * mo * 0.58),
            (tip_pt[0] + ux * ml * 0.80 + px * mo * 0.58, tip_pt[1] + uy * ml * 0.80 + py * mo * 0.58),
        ]
        poly(d, hole, (16, 16, 24, 255))

    # ⑤ 能量核心（Lv5+）
    if level >= 5:
        cg = '#5ad0ff' if branch != 'bigcannon' else '#ffb45a'
        cr = rt * (0.34 + 0.10 * ((level - 5) / 5.0))
        img = glow_layer(img, cx, cy + rt * 0.08, cr, cg, layers=4, strength=55, blur=2.6)
        d = ImageDraw.Draw(img)
        ell(d, (cx - cr, cy + rt * 0.08 - cr * 0.92, cx + cr, cy + rt * 0.08 + cr * 0.92),
            sh(cg, 1.0), outline=(255, 255, 255, 220), w=1.3)
        ell(d, (cx - cr * 0.44, cy + rt * 0.08 - cr * 0.54,
                cx + cr * 0.10, cy + rt * 0.08 + cr * 0.06), (255, 255, 255, 235))

    # ⑥ Lv10 金环
    if level >= 10:
        g = Image.new('RGBA', img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        for k in range(4):
            kk = 1.10 + k * 0.11
            gd.ellipse([(cx - rb * kk) * SS, (cy - rb * kk * squash) * SS,
                        (cx + rb * kk) * SS, (cy + rb * kk * squash) * SS],
                       outline=(255, 216, 120, 130 - k * 26), width=int(2.2 * SS))
        g = g.filter(ImageFilter.GaussianBlur(1.8 * SS))
        img = Image.alpha_composite(img, g)

    return finish(img, S, S)


# ================================================================ 气球兵
def draw_balloon(size=128, team='blue', frame='idle'):
    S = size
    img = canvas(S, S)
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2

    if team == 'blue':
        pink, cloth, dark = '#e08cc8', '#3f74c8', '#231a2c'
    else:
        pink, cloth, dark = '#e6a06a', '#c8443a', '#2c1a14'
    pink_dk = sh(pink, 0.64)
    pink_lt = sh(pink, 1.34)
    basket = '#b98650'
    wood = '#7e5a30'
    skin = '#f4cdA4'.lower()
    skin_dk = sh(skin, 0.86)

    # 地面阴影（悬浮感）
    ell(d, (cx - S * 0.215, cy + S * 0.315, cx + S * 0.215, cy + S * 0.395),
        fill=(0, 0, 0, 68))

    # ① 气球
    by = cy - S * 0.125
    br = S * 0.265
    ell(d, (cx - br, by - br * 1.04, cx + br, by + br * 1.10),
        pink_dk, outline=sh(dark, 1.0), w=2.2)
    ell(d, (cx - br * 0.96, by - br * 1.02, cx + br * 0.96, by + br * 1.02), sh(pink, 1.0))
    # 受光面（左上）
    ell(d, (cx - br * 0.72, by - br * 0.94, cx + br * 0.20, by + br * 0.22), pink_lt)
    # 高光点
    ell(d, (cx - br * 0.60, by - br * 0.80, cx - br * 0.26, by - br * 0.42),
        (255, 255, 255, 205))
    # 缝线
    for k in (-1, 0, 1):
        xo = k * br * 0.54
        ln(d, [(cx + xo, by - br * 0.90), (cx + xo * 1.30, by), (cx + xo, by + br * 0.90)],
           sh(pink, 0.84), 1.2)
    # 底部收口
    ell(d, (cx - br * 0.19, by + br * 0.92, cx + br * 0.19, by + br * 1.18),
        pink_dk, outline=sh(dark, 1.0), w=1.6)

    # ② 绳索
    rope_top = by + br * 1.12
    bk_y = cy + S * 0.150
    bk_hw = S * 0.120
    for sx in (-1, 1):
        ln(d, [(cx + sx * br * 0.12, rope_top), (cx + sx * bk_hw * 0.94, bk_y)],
           '#efe4c8', 1.8)

    # ③ 吊篮
    ell(d, (cx - bk_hw, bk_y - S * 0.035, cx + bk_hw, bk_y + S * 0.048),
        basket, outline=sh(dark, 1.0), w=2.0)
    for k in range(3):
        yy = bk_y - S * 0.008 + k * S * 0.020
        ln(d, [(cx - bk_hw * 0.86, yy), (cx + bk_hw * 0.86, yy)], wood, 1.0)
    ell(d, (cx - bk_hw * 1.08, bk_y - S * 0.046, cx + bk_hw * 1.08, bk_y + S * 0.008),
        sh(basket, 1.20), outline=sh(dark, 1.0), w=1.6)

    # ④ 士兵
    hy = bk_y - S * 0.052
    hr = S * 0.052
    ell(d, (cx - hr * 1.20, hy - hr * 0.10, cx + hr * 1.20, hy + hr * 1.85),
        cloth, outline=sh(dark, 1.0), w=1.7)
    ell(d, (cx - hr, hy - hr * 1.28, cx + hr, hy + hr * 0.66),
        skin, outline=sh(dark, 1.0), w=1.7)
    # 脸颊暗面
    ell(d, (cx + hr * 0.06, hy - hr * 0.34, cx + hr * 0.96, hy + hr * 0.60), skin_dk)
    # 头盔
    ell(d, (cx - hr * 1.10, hy - hr * 1.46, cx + hr * 1.10, hy + hr * 0.14),
        sh(cloth, 1.16), outline=sh(dark, 1.0), w=1.5)
    ell(d, (cx - hr * 0.86, hy - hr * 1.34, cx + hr * 0.10, hy - hr * 0.50), sh(cloth, 1.45))
    # 眼睛
    for sx in (-1, 1):
        ell(d, (cx + sx * hr * 0.40 - S * 0.009, hy - hr * 0.34,
                cx + sx * hr * 0.40 + S * 0.009, hy - hr * 0.10), (36, 26, 38))

    # ⑤ 帧差异
    if frame == 'throw':
        bx, byy = cx + S * 0.185, cy + S * 0.095
        ell(d, (bx - S * 0.045, byy - S * 0.045, bx + S * 0.045, byy + S * 0.045),
            '#3a3a4a', outline=sh('#14141c', 1.0), w=1.6)
        ell(d, (bx - S * 0.028, byy - S * 0.032, bx - S * 0.004, byy - S * 0.008),
            (110, 110, 130, 220))
        ln(d, [(bx + S * 0.030, byy - S * 0.038), (bx + S * 0.058, byy - S * 0.075)], '#d8bc6c', 1.6)
        ell(d, (bx + S * 0.046, byy - S * 0.092, bx + S * 0.078, byy - S * 0.060), '#ffd24a')
    elif frame == 'wind':
        for k in range(3):
            yy = cy - S * 0.13 + (k - 1) * S * 0.115
            x0 = cx - S * 0.375 - k * S * 0.022
            ln(d, [(x0, yy), (x0 + S * 0.115, yy)], (255, 255, 255, 135), 1.8)

    return finish(img, S, S)


# ================================================================ 大本营
def draw_base(level=1, size=256, team='blue'):
    """
    升级演进：
      Lv1 简陋：石台 + 中央小塔 + 木栅栏，无屋顶（或木棚）
      Lv2 木质屋顶出现
      Lv3 四角塔加屋顶
      Lv4 屋顶金属+金饰，中央塔加高
      Lv5 角塔插旗
      Lv6 金色镶边 + 外光环 + 塔尖大旗
    """
    S = size
    img = canvas(S, S)
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2

    if team == 'blue':
        main, trim, flagc = '#4a9eff', '#9fd4ff', '#4a9eff'
        stone, stone_lt, stone_dk = '#6d7788', '#949eae', '#454d5c'
        dark = '#161c28'
    else:
        main, trim, flagc = '#ff5a5a', '#ffa8a8', '#ff5a5a'
        stone, stone_lt, stone_dk = '#7d6a64', '#a3938c', '#514340'
        dark = '#281414'
    wood, gold = '#8a6234', '#e8b84a'

    t = (level - 1) / 5.0

    # 投影
    ell(d, (cx - S * 0.41, cy + S * 0.13, cx + S * 0.41, cy + S * 0.42), fill=(0, 0, 0, 66))

    # ① 外城墙
    wall_hw = 0.330 + 0.022 * t
    sq = 0.58
    wx1, wx2 = cx - S * wall_hw, cx + S * wall_hw
    wy1, wy2 = cy - S * wall_hw * sq, cy + S * wall_hw * sq

    # 侧面厚度
    poly(d, [(wx1, wy1), (wx2, wy1), (wx2, wy2 + S * 0.042), (wx1, wy2 + S * 0.042)],
         sh(stone_dk, 1.0), outline=sh(dark, 1.0), w=2.4)
    # 顶面
    poly(d, [(wx1, wy1), (wx2, wy1), (wx2, wy2), (wx1, wy2)],
         sh(stone, 1.0), outline=sh(dark, 1.0), w=2.4)
    # 顶面亮区
    ins = 0.11
    poly(d, [(wx1 + (wx2 - wx1) * ins, wy1 + (wy2 - wy1) * ins * 1.4),
             (wx2 - (wx2 - wx1) * ins, wy1 + (wy2 - wy1) * ins * 1.4),
             (wx2 - (wx2 - wx1) * ins, wy2 - (wy2 - wy1) * ins * 1.4),
             (wx1 + (wx2 - wx1) * ins, wy2 - (wy2 - wy1) * ins * 1.4)], sh(stone_lt, 1.0))

    # 砖缝
    nb = 5 + level
    for i in range(1, nb):
        fx = wx1 + (wx2 - wx1) * i / nb
        ln(d, [(fx, wy1), (fx, wy2)], sh(stone, 0.70), 1.0)
    for i in range(1, 4):
        fy = wy1 + (wy2 - wy1) * i / 4.0
        ln(d, [(wx1, fy), (wx2, fy)], sh(stone, 0.70), 1.0)

    # ② 四角塔（带城垛）
    tr = 0.050 + 0.013 * t
    # 角塔内移到城墙内侧，避免出框
    iw = (wx2 - wx1) * 0.150
    ih = (wy2 - wy1) * 0.150
    corners = [(wx1 + iw, wy1 + ih), (wx2 - iw, wy1 + ih),
               (wx2 - iw, wy2 - ih), (wx1 + iw, wy2 - ih)]
    for i, (px, py) in enumerate(corners):
        R = S * tr
        # 塔身侧面（圆柱，下缘暗）
        ell(d, (px - R, py - R * 0.50, px + R, py + R * 1.30),
            sh(stone_dk, 1.0), outline=sh(dark, 1.0), w=2.0)
        # 塔身正面（亮面）
        ell(d, (px - R * 0.96, py - R * 0.80, px + R * 0.96, py + R * 0.80),
            sh(stone, 1.0), outline=sh(dark, 1.0), w=1.6)
        # 顶部平台（更亮，制造"从上往下看"的圆台感）
        ell(d, (px - R * 0.78, py - R * 0.92, px + R * 0.78, py + R * 0.10),
            sh(stone_lt, 1.0), outline=sh(dark, 1.0), w=1.2)
        # 城垛（3 个小方块立在平台边缘）
        for k in range(3):
            mx = px - R * 0.56 + k * R * 0.42
            rr(d, (mx, py - R * 0.98, mx + R * 0.28, py - R * 0.62),
               R * 0.05, sh(stone_lt, 1.10), outline=sh(dark, 1.0), w=1.0)
        # Lv3+ 屋顶（圆锥顶，盖在城垛之上）
        if level >= 3:
            rw, rh = R * 1.08, R * (0.80 + 0.28 * t)
            poly(d, [(px - rw, py - R * 0.90), (px, py - R * 0.90 - rh), (px + rw, py - R * 0.90)],
                 sh(main, 1.0), outline=sh(dark, 1.0), w=1.8)
            poly(d, [(px - rw, py - R * 0.90), (px - rw * 0.04, py - R * 0.90),
                     (px, py - R * 0.90 - rh)], sh(main, 1.36))
            if level >= 4:
                ln(d, [(px - rw * 0.9, py - R * 0.96), (px, py - R * 0.90 - rh * 1.02)], gold, 1.5)
        # Lv5+ 旗
        if level >= 5 and i in (0, 2):
            top = py - R * 0.90 - (R * 1.08 if level >= 3 else R * 0.70)
            ln(d, [(px, top), (px, top - R * 1.05)], sh(wood, 0.88), 1.6)
            fw, fh = R * 0.92, R * 0.58
            poly(d, [(px, top - R * 1.04), (px + fw, top - R * 0.80), (px, top - R * 0.52)],
                 sh(flagc, 1.0), outline=sh(dark, 1.0), w=1.4)
            poly(d, [(px, top - R * 1.04), (px + fw * 0.52, top - R * 0.92), (px, top - R * 0.72)],
                 sh(flagc, 1.36))

    # ③ 中央主塔
    mh = 0.155 + 0.062 * t
    mw = 0.115 + 0.032 * t
    mx1, mx2 = cx - S * mw, cx + S * mw
    my1, my2 = cy - S * mh, cy + S * mh * 0.60

    # 塔侧面（右侧暗）
    poly(d, [(mx1, my1), (mx2, my1), (mx2, my2 + S * 0.045), (mx1, my2 + S * 0.045)],
         sh(stone_dk, 1.0), outline=sh(dark, 1.0), w=2.4)
    # 塔正面
    poly(d, [(mx1, my1), (mx2, my1), (mx2, my2), (mx1, my2)],
         sh(stone, 1.0), outline=sh(dark, 1.0), w=2.4)
    # 正面受光
    poly(d, [(mx1 + (mx2 - mx1) * 0.10, my1 + (my2 - my1) * 0.10),
             (mx2 - (mx2 - mx1) * 0.24, my1 + (my2 - my1) * 0.10),
             (mx2 - (mx2 - mx1) * 0.24, my2 - (my2 - my1) * 0.12),
             (mx1 + (mx2 - mx1) * 0.10, my2 - (my2 - my1) * 0.12)], sh(stone_lt, 1.0))

    # 能量核心
    core_r = S * (0.040 + 0.026 * t)
    ccx, ccy = cx, cy + S * 0.010
    img = glow_layer(img, ccx, ccy, core_r, trim, layers=4, strength=52, blur=2.8)
    d = ImageDraw.Draw(img)
    ell(d, (ccx - core_r, ccy - core_r, ccx + core_r, ccy + core_r),
        sh(trim, 1.0), outline=(255, 255, 255, 225), w=1.4)
    ell(d, (ccx - core_r * 0.48, ccy - core_r * 0.56, ccx + core_r * 0.04, ccy + core_r * 0.02),
        (255, 255, 255, 235))

    # 主塔门（Lv2+）
    if level >= 2:
        dw = (mx2 - mx1) * 0.26
        dh = (my2 - my1) * 0.32
        rr(d, (cx - dw, my2 - dh, cx + dw, my2 + S * 0.004), dw * 0.45,
           sh(wood, 0.62), outline=sh(dark, 1.0), w=1.7)
        # 门钉
        for k in (-1, 1):
            ell(d, (cx + k * dw * 0.42 - S * 0.008, my2 - dh * 0.62 - S * 0.008,
                    cx + k * dw * 0.42 + S * 0.008, my2 - dh * 0.62 + S * 0.008), sh(gold, 1.0))

    # ④ 主塔屋顶
    if level >= 2:
        rw = S * (mw + 0.020 + 0.014 * t)
        rh = S * (0.070 + 0.060 * t)
        ry = my1 + S * 0.008
        poly(d, [(cx - rw, ry), (cx, ry - rh), (cx + rw, ry)],
             sh(main, 1.0), outline=sh(dark, 1.0), w=2.4)
        # 受光面
        poly(d, [(cx - rw, ry), (cx - rw * 0.06, ry), (cx, ry - rh)], sh(main, 1.36))
        # 瓦楞
        for k in range(1, 4):
            f = k / 4.0
            ln(d, [(cx - rw * (1 - f), ry - rh * f * 0.98),
                   (cx - rw * 0.10 + rw * 0.0, ry - rh * f * 0.98)],
               sh(main, 0.80), 1.0)
        # Lv4+ 金色屋脊
        if level >= 4:
            ln(d, [(cx - rw, ry), (cx, ry - rh)], gold, 2.0)
            ln(d, [(cx, ry - rh), (cx + rw, ry)], gold, 2.0)
        # Lv5+ 屋顶宝珠
        if level >= 5:
            ell(d, (cx - S * 0.026, ry - rh - S * 0.030, cx + S * 0.026, ry - rh + S * 0.022),
                sh(gold, 1.0), outline=sh(dark, 1.0), w=1.4)

    # ⑤ 中央旗杆 + 大旗
    pole_top = my1 - S * (0.115 + 0.115 * t) - (S * 0.090 if level >= 2 else 0)
    ln(d, [(cx, my1 - S * 0.005), (cx, pole_top)], sh(wood, 0.85), 2.2)
    fw = S * (0.070 + 0.045 * t)
    fh = S * (0.058 + 0.040 * t)
    poly(d, [(cx, pole_top), (cx + fw, pole_top + fh * 0.46), (cx, pole_top + fh)],
         sh(flagc, 1.0), outline=sh(dark, 1.0), w=1.6)
    poly(d, [(cx, pole_top), (cx + fw * 0.52, pole_top + fh * 0.30), (cx, pole_top + fh * 0.66)],
         sh(flagc, 1.36))
    ell(d, (cx - S * 0.016, pole_top - S * 0.028, cx + S * 0.016, pole_top + S * 0.004),
        sh(gold, 1.0), outline=sh(dark, 1.0), w=1.2)

    # ⑥ Lv6 金色镶边 + 外光环
    if level >= 6:
        g = Image.new('RGBA', img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        for k in range(4):
            kk = 1.02 + k * 0.085
            gd.ellipse([(cx - S * wall_hw * kk) * SS, (cy - S * wall_hw * sq * kk) * SS,
                        (cx + S * wall_hw * kk) * SS, (cy + S * wall_hw * sq * kk) * SS],
                       outline=(255, 216, 120, 140 - k * 26), width=int(2.4 * SS))
        g = g.filter(ImageFilter.GaussianBlur(2.0 * SS))
        img = Image.alpha_composite(img, g)
        d = ImageDraw.Draw(img)
        d.line(_s([(wx1, wy1), (wx2, wy1), (wx2, wy2), (wx1, wy2), (wx1, wy1)]),
               fill=sh(gold, 1.0), width=int(2.2 * SS), joint='curve')

    return finish(img, S, S)


# ================================================================ 导出
def export_all():
    for lv in range(1, 11):
        draw_cannon(lv).save(os.path.join(OUT, f'cannon_blue_lv{lv:02d}.png'))
    for lv in (5, 7, 10):
        draw_cannon(lv, 'twin').save(os.path.join(OUT, f'cannon_twin_lv{lv:02d}.png'))
        draw_cannon(lv, 'bigcannon').save(os.path.join(OUT, f'cannon_big_lv{lv:02d}.png'))
    draw_cannon(10, team='red').save(os.path.join(OUT, 'cannon_red_lv10.png'))
    for fr in ('idle', 'throw', 'wind'):
        draw_balloon(frame=fr).save(os.path.join(OUT, f'balloon_blue_{fr}.png'))
    draw_balloon(frame='throw', team='red').save(os.path.join(OUT, 'balloon_red_throw.png'))
    for lv in range(1, 7):
        draw_base(lv, team='blue').save(os.path.join(OUT, f'base_blue_lv{lv}.png'))
        draw_base(lv, team='red').save(os.path.join(OUT, f'base_red_lv{lv}.png'))
    print('exported to', os.path.abspath(OUT))


if __name__ == '__main__':
    export_all()

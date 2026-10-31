# -*- coding: utf-8 -*-
"""
气球兵 + 大本营 v5（与炮塔同一套材质/光影语言）
复用 art_v5 的渐变、阴影、AO、纹理工具，保证三件风格统一。
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import art_v5 as V

SS = V.SS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v5')
os.makedirs(OUT, exist_ok=True)

hx, shade, R = V.hx, V.shade, V.R
canvas, blur = V.canvas, V.blur
m_poly, m_ell = V.m_poly, V.m_ell
radial, lin, paste = V.radial, V.lin, V.paste
ellipse_shadow, grain = V.ellipse_shadow, V.grain


# ================================================================= 气球兵
def draw_balloon(size=256, team='blue', frame='idle'):
    W = size * SS
    img = canvas(W)
    d = ImageDraw.Draw(img)

    if team == 'blue':
        skin_balloon = ['#f8c8e8', '#e08cc8', '#b85a9e', '#7a2e62']
        cloth, cloth_lt = '#3f74c8', '#6f9ce0'
        trim = '#2a4f8e'
    else:
        skin_balloon = ['#f8dcb8', '#e6a06a', '#b8703a', '#7a3e1e']
        cloth, cloth_lt = '#c8443a', '#e0786f'
        trim = '#8e2a24'

    cx = W * 0.50
    cy = W * 0.50

    # ① 地面投影（悬浮感）
    img = ellipse_shadow(img, cx, cy + W * 0.345, W * 0.185, W * 0.042, 3.0 * SS, 110)

    # ② 气球本体
    br = W * 0.245
    by = cy - W * 0.095

    # 气球体积（径向渐变球）
    m = m_ell(W, cx, by, br, br * 1.04)
    paste(img, radial(W, cx, by, br * 1.55,
                      [(0.0, skin_balloon[0]), (0.28, skin_balloon[1]),
                       (0.68, skin_balloon[2]), (1.0, skin_balloon[3])],
                      lx=-0.34, ly=-0.36, spread=1.85), m)
    d.ellipse([cx - br, by - br * 1.04, cx + br, by + br * 1.04],
              outline=R(V.P.line), width=int(3.0 * SS))

    # 边缘反光（rim light，右上）
    rl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rl)
    rd.arc([cx - br * 0.95, by - br * 0.99, cx + br * 0.95, by + br * 0.99],
           285, 25, fill=(255, 255, 255, 130), width=int(br * 0.10))
    img.alpha_composite(blur(rl, 2.2 * SS))

    # 竖向缝线
    d = ImageDraw.Draw(img)
    for k in (-1, 0, 1):
        xo = k * br * 0.52
        pts = []
        for i in range(24):
            t = i / 23.0
            ang = -math.pi / 2 + t * math.pi
            pts.append((cx + xo * math.sin(ang) * 1.30,
                        by + br * 1.02 * math.cos(ang) * -1 + 0))
        # 简单三次贝塞尔近似
        d.line([(cx + xo, by - br * 0.92),
                (cx + xo * 1.30, by - br * 0.20),
                (cx + xo * 1.30, by + br * 0.20),
                (cx + xo, by + br * 0.92)],
               fill=R(shade(hx(skin_balloon[2]), 0.82), 150), width=int(1.8 * SS))

    # 主高光（左上）
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([cx - br * 0.64, by - br * 0.80, cx - br * 0.10, by - br * 0.20],
               fill=(255, 255, 255, 165))
    hd.ellipse([cx - br * 0.50, by - br * 0.66, cx - br * 0.26, by - br * 0.42],
               fill=(255, 255, 255, 235))
    img.alpha_composite(blur(hl, 1.6 * SS))

    # 底部收口
    d = ImageDraw.Draw(img)
    d.ellipse([cx - br * 0.20, by + br * 0.88, cx + br * 0.20, by + br * 1.14],
              fill=R(shade(hx(skin_balloon[2]), 0.72)), outline=R(V.P.line), width=int(1.8 * SS))

    # ③ 绳索
    rope_top = by + br * 1.06
    bk_y = cy + W * 0.150
    bk_hw = W * 0.112
    for s in (-1, 1):
        d.line([(cx + s * br * 0.13, rope_top), (cx + s * bk_hw * 0.94, bk_y)],
               fill=R(hx('#efe4c8')), width=int(2.2 * SS))
        d.line([(cx + s * br * 0.13, rope_top), (cx + s * bk_hw * 0.94, bk_y)],
               fill=R(hx('#b8a888'), 160), width=int(0.9 * SS))

    # ④ 吊篮（木质，带编纹）
    basket_top = bk_y - W * 0.040
    basket_bot = bk_y + W * 0.050
    m = m_ell(W, cx, bk_y + W * 0.006, bk_hw, W * 0.062)
    paste(img, radial(W, cx, bk_y, bk_hw * 1.9,
                      [(0.0, '#d8a86a'), (0.42, '#b0803e'), (1.0, '#6a4418')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - bk_hw, bk_y - W * 0.056, cx + bk_hw, bk_y + W * 0.068],
              outline=R(V.P.line), width=int(2.4 * SS))
    # 编纹
    for i in range(3):
        yy = bk_y - W * 0.010 + i * W * 0.022
        d.line([(cx - bk_hw * 0.86, yy), (cx + bk_hw * 0.86, yy)],
               fill=R(hx('#5e3810'), 150), width=int(1.4 * SS))
    # 篮沿
    m = m_ell(W, cx, bk_y - W * 0.044, bk_hw * 1.10, W * 0.024)
    paste(img, radial(W, cx, bk_y - W * 0.044, bk_hw * 1.4,
                      [(0.0, '#efc890'), (0.45, '#c9985a'), (1.0, '#8a6028')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - bk_hw * 1.10, bk_y - W * 0.068, cx + bk_hw * 1.10, bk_y - W * 0.020],
              outline=R(V.P.line), width=int(2.2 * SS))

    # ⑤ 士兵（上半身）
    hy = bk_y - W * 0.062
    hr = W * 0.056
    # 身体
    m = m_ell(W, cx, hy + hr * 0.95, hr * 1.30, hr * 1.10)
    paste(img, radial(W, cx, hy + hr * 0.95, hr * 2.0,
                      [(0.0, cloth_lt), (0.5, cloth), (1.0, trim)]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - hr * 1.30, hy - hr * 0.15, cx + hr * 1.30, hy + hr * 2.05],
              outline=R(V.P.line), width=int(2.2 * SS))
    # 头
    m = m_ell(W, cx, hy, hr, hr * 1.02)
    paste(img, radial(W, cx, hy, hr * 1.6,
                      [(0.0, '#ffe8d0'), (0.42, '#f4cda4'), (1.0, '#b88450')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - hr, hy - hr * 1.02, cx + hr, hy + hr * 1.02],
              outline=R(V.P.line), width=int(2.2 * SS))
    # 头盔
    m = m_ell(W, cx, hy - hr * 0.52, hr * 1.14, hr * 0.72)
    paste(img, radial(W, cx, hy - hr * 0.52, hr * 1.7,
                      [(0.0, shade(hx(cloth_lt), 1.25)), (0.45, hx(cloth_lt)),
                       (0.85, hx(cloth)), (1.0, hx(trim))]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - hr * 1.14, hy - hr * 1.24, cx + hr * 1.14, hy + hr * 0.20],
              outline=R(V.P.line), width=int(2.2 * SS))
    # 头盔高光
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - hr * 0.86, hy - hr * 1.10,
                                cx - hr * 0.06, hy - hr * 0.62],
                               fill=(255, 255, 255, 190))
    img.alpha_composite(blur(hl, 1.4 * SS))
    # 眼睛
    d = ImageDraw.Draw(img)
    for s in (-1, 1):
        d.ellipse([cx + s * hr * 0.40 - hr * 0.13, hy - hr * 0.30,
                   cx + s * hr * 0.40 + hr * 0.13, hy + hr * 0.02],
                  fill=R(hx('#241a24')))
        d.ellipse([cx + s * hr * 0.40 - hr * 0.08, hy - hr * 0.26,
                   cx + s * hr * 0.40 + hr * 0.02, hy - hr * 0.14],
                  fill=(255, 255, 255, 220))
    # 嘴
    d.arc([cx - hr * 0.24, hy + hr * 0.16, cx + hr * 0.24, hy + hr * 0.52],
          20, 160, fill=R(hx('#8a4a3a')), width=int(1.8 * SS))

    # ⑥ 帧差异
    if frame == 'throw':
        bx, byy = cx + W * 0.175, cy + W * 0.100
        # 炸弹
        m = m_ell(W, bx, byy, W * 0.042, W * 0.042)
        paste(img, radial(W, bx, byy, W * 0.085,
                          [(0.0, '#8a8a9e'), (0.35, '#4a4a5c'), (1.0, '#18181f')]), m)
        d = ImageDraw.Draw(img)
        d.ellipse([bx - W * 0.042, byy - W * 0.042, bx + W * 0.042, byy + W * 0.042],
                  outline=R(hx('#0a0a10')), width=int(2.0 * SS))
        d.ellipse([bx - W * 0.026, byy - W * 0.030, bx - W * 0.004, byy - W * 0.006],
                  fill=(200, 200, 220, 150))
        # 引线 + 火花
        d.line([(bx + W * 0.028, byy - W * 0.034), (bx + W * 0.056, byy - W * 0.072)],
               fill=R(hx('#c8a860')), width=int(2.0 * SS))
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(3):
            rr = W * (0.030 - k * 0.008)
            gd.ellipse([bx + W * 0.052 - rr, byy - W * 0.086 - rr,
                        bx + W * 0.052 + rr, byy - W * 0.086 + rr],
                       fill=(255, 214, 90, 90 + k * 50))
        img.alpha_composite(blur(gl, 2.0 * SS))
    elif frame == 'wind':
        d = ImageDraw.Draw(img)
        for k in range(3):
            yy = cy - W * 0.10 + (k - 1) * W * 0.105
            x0 = cx - W * 0.360 - k * W * 0.020
            ln = W * (0.105 - k * 0.014)
            ov = Image.new('RGBA', (W, W), (0, 0, 0, 0))
            od = ImageDraw.Draw(ov)
            od.line([(x0, yy), (x0 + ln, yy)], fill=(255, 255, 255, 120),
                    width=int(2.6 * SS))
            ov = od and ov.filter(ImageFilter.GaussianBlur(0.8 * SS))
            img.alpha_composite(ov)
            d = ImageDraw.Draw(img)

    img = grain(img, 3)
    return img.resize((size, size), Image.LANCZOS)


# ================================================================= 大本营
def draw_base(level=1, size=256, team='blue'):
    W = size * SS
    img = canvas(W)
    t = (level - 1) / 5.0

    if team == 'blue':
        main, main_lt, main_dk = hx('#4a9eff'), hx('#9fd4ff'), hx('#1e4a86')
        stone = ['#b6bed0', '#767e90', '#3e4655', '#1e242e']
    else:
        # 先重置炮塔的红色（避免串色）
        main, main_lt, main_dk = hx('#ff5a5a'), hx('#ffa8a8'), hx('#8e2020')
        stone = ['#c2b0a8', '#8a746c', '#4e3e38', '#241a16']

    cx = W * 0.50
    cy = W * 0.56

    wall_hw = W * (0.300 + 0.024 * t)
    sq = 0.60
    th = W * 0.070

    # ① 地面阴影
    img = ellipse_shadow(img, cx, cy + wall_hw * sq + th * 0.9,
                         wall_hw * 1.06, wall_hw * sq * 0.42, 5 * SS, 120)

    d = ImageDraw.Draw(img)

    def rect_pts(x0, x1, y0, y1):
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    x0, x1 = cx - wall_hw, cx + wall_hw
    y0, y1 = cy - wall_hw * sq, cy + wall_hw * sq

    # ② 城墙侧壁（厚度）
    side = [(x0, y1), (x1, y1), (x1, y1 + th), (x0, y1 + th)]
    paste(img, lin(W, (0, y1), (0, y1 + th),
                   [(0.0, stone[1]), (0.55, stone[2]), (1.0, '#10151c')]), m_poly(W, side))
    d.polygon(side, outline=R(V.P.line), width=int(3.0 * SS))

    # ③ 城墙顶面
    top = rect_pts(x0, x1, y0, y1)
    paste(img, radial(W, cx, cy - wall_hw * sq * 0.2, wall_hw * 1.5,
                      [(0.0, stone[0]), (0.42, stone[1]), (0.78, stone[2]), (1.0, stone[3])]),
          m_poly(W, top))
    d.polygon(top, outline=R(V.P.line), width=int(3.0 * SS))

    # ④ 石砖纹理
    nb = 5 + level
    for i in range(1, nb):
        fx = x0 + (x1 - x0) * i / nb
        d.line([(fx, y0), (fx, y1)], fill=R(hx('#1a2028'), 150), width=int(1.8 * SS))
    for i in range(1, 4):
        fy = y0 + (y1 - y0) * i / 4.0
        d.line([(x0, fy), (x1, fy)], fill=R(hx('#1a2028'), 150), width=int(1.8 * SS))
        d.line([(x0 + 2 * SS, fy + 2 * SS), (x1 - 2 * SS, fy + 2 * SS)],
               fill=R(hx(stone[0]), 55), width=int(1.4 * SS))

    # ⑤ 内圈（让城墙看起来有厚度）
    ins = W * 0.030
    inner = rect_pts(x0 + ins, x1 - ins, y0 + ins * 0.8, y1 - ins * 0.8)
    d.polygon(inner, fill=R(shade(hx(stone[2]), 1.05)))
    d.line(inner + [inner[0]], fill=R(hx('#1a2028'), 120), width=int(2.0 * SS), joint='curve')

    # ⑥ 四角塔
    tr = W * (0.058 + 0.014 * t)
    iw = (x1 - x0) * 0.135
    ih = (y1 - y0) * 0.135
    corners = [(x0 + iw, y0 + ih), (x1 - iw, y0 + ih),
               (x1 - iw, y1 - ih), (x0 + iw, y1 - ih)]
    for i, (px, py) in enumerate(corners):
        # 塔身侧面（圆柱，下暗上亮）
        m = m_ell(W, px, py + tr * 0.34, tr, tr * 0.98)
        paste(img, radial(W, px, py + tr * 0.34, tr * 1.8,
                          [(0.0, shade(hx(stone[1]), 0.95)), (0.5, stone[2]), (1.0, stone[3])]), m)
        d.ellipse([px - tr, py + tr * 0.34 - tr * 0.98,
                   px + tr, py + tr * 0.34 + tr * 0.98],
                  outline=R(V.P.line), width=int(2.8 * SS))
        # 塔顶平台（明显更亮，制造圆台感）
        m = m_ell(W, px, py - tr * 0.06, tr * 0.94, tr * 0.70)
        paste(img, radial(W, px, py - tr * 0.06, tr * 1.5,
                          [(0.0, shade(hx(stone[0]), 1.12)), (0.40, stone[0]),
                           (0.80, stone[1]), (1.0, stone[2])]), m)
        d.ellipse([px - tr * 0.94, py - tr * 0.06 - tr * 0.70,
                   px + tr * 0.94, py - tr * 0.06 + tr * 0.70],
                  outline=R(V.P.line), width=int(2.4 * SS))
        # 城垛（只在没有锥顶的 Lv1~2 显示，否则会被屋顶挡住）
        if level < 3:
            for k in range(3):
                mx = px - tr * 0.60 + k * tr * 0.46
                mbtm = py - tr * 0.50
                mtop = py - tr * 0.94
                mc = shade(hx(stone[0]), 1.18)
                d.polygon([(mx, mbtm), (mx + tr * 0.30, mbtm),
                           (mx + tr * 0.30, mtop), (mx, mtop)],
                          fill=R(mc), outline=R(V.P.line))
                d.line([(mx + 1 * SS, mtop + 1 * SS), (mx + 1 * SS, mbtm - 1 * SS)],
                       fill=R(shade(mc, 1.35), 200), width=int(1.4 * SS))
        # Lv3+ 锥顶
        if level >= 3:
            rw = tr * 1.10
            rh = tr * (0.78 + 0.30 * t)
            m = m_poly(W, [(px - rw, py - tr * 0.80), (px, py - tr * 0.80 - rh),
                           (px + rw, py - tr * 0.80)])
            paste(img, radial(W, px, py - tr * 0.80 - rh * 0.3, rw * 1.6,
                              [(0.0, main_lt), (0.42, main), (1.0, main_dk)]), m)
            d = ImageDraw.Draw(img)
            d.polygon([(px - rw, py - tr * 0.80), (px, py - tr * 0.80 - rh),
                       (px + rw, py - tr * 0.80)],
                      outline=R(V.P.line), width=int(2.4 * SS))
            if level >= 4:
                d.line([(px - rw * 0.90, py - tr * 0.86),
                        (px, py - tr * 0.80 - rh * 1.02)], fill=R(V.P.gold),
                       width=int(2.0 * SS))
        # Lv5+ 旗
        if level >= 5 and i in (0, 2):
            top_y = py - tr * 0.80 - (tr * (0.78 + 0.30 * t) if level >= 3 else 0)
            d = ImageDraw.Draw(img)
            d.line([(px, top_y), (px, top_y - tr * 1.05)], fill=R(hx('#7a5a30')),
                   width=int(2.2 * SS))
            fw, fh = tr * 0.92, tr * 0.58
            m = m_poly(W, [(px, top_y - tr * 1.04), (px + fw, top_y - tr * 0.80),
                           (px, top_y - tr * 0.52)])
            paste(img, radial(W, px + fw * 0.3, top_y - tr * 0.8, fw * 1.6,
                              [(0.0, main_lt), (0.5, main), (1.0, main_dk)]), m)
            d = ImageDraw.Draw(img)
            d.polygon([(px, top_y - tr * 1.04), (px + fw, top_y - tr * 0.80),
                       (px, top_y - tr * 0.52)], outline=R(V.P.line), width=int(2.0 * SS))

    # ⑦ 中央主塔
    mw = W * (0.108 + 0.030 * t)
    mh = W * (0.145 + 0.058 * t)
    mx0, mx1 = cx - mw, cx + mw
    my0, my1 = cy - mh, cy + mh * 0.58

    # 侧壁
    mside = [(mx0, my1), (mx1, my1), (mx1, my1 + W * 0.036), (mx0, my1 + W * 0.036)]
    paste(img, lin(W, (0, my1), (0, my1 + W * 0.036),
                   [(0.0, stone[1]), (0.6, stone[2]), (1.0, '#10151c')]), m_poly(W, mside))
    d.polygon(mside, outline=R(V.P.line), width=int(2.8 * SS))

    # 正面
    mfront = rect_pts(mx0, mx1, my0, my1)
    paste(img, radial(W, cx - mw * 0.2, cy - mh * 0.3, mw * 2.0,
                      [(0.0, stone[0]), (0.40, stone[1]), (0.80, stone[2]), (1.0, stone[3])]),
          m_poly(W, mfront))
    d.polygon(mfront, outline=R(V.P.line), width=int(2.8 * SS))

    # 主塔砖纹
    for i in range(1, 3):
        fx = mx0 + (mx1 - mx0) * i / 3.0
        d.line([(fx, my0), (fx, my1)], fill=R(hx('#1a2028'), 130), width=int(1.6 * SS))
    for i in range(1, 3):
        fy = my0 + (my1 - my0) * i / 3.0
        d.line([(mx0, fy), (mx1, fy)], fill=R(hx('#1a2028'), 130), width=int(1.6 * SS))

    # ⑧ 能量核心
    core_r = W * (0.040 + 0.024 * t)
    ccx, ccy = cx, cy + W * 0.012
    # 光晕
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for k in range(5):
        rr = core_r * (2.9 - k * 0.46)
        gd.ellipse([ccx - rr, ccy - rr, ccx + rr, ccy + rr],
                   fill=R(main_lt, 30 + k * 26))
    img.alpha_composite(blur(gl, 3.4 * SS))
    d = ImageDraw.Draw(img)
    # 核体外圈（金属环）
    d.ellipse([ccx - core_r * 1.34, ccy - core_r * 1.34,
               ccx + core_r * 1.34, ccy + core_r * 1.34],
              fill=R(shade(main_dk, 1.2)), outline=R(V.P.line), width=int(2.2 * SS))
    d.ellipse([ccx - core_r * 1.16, ccy - core_r * 1.16,
               ccx + core_r * 1.16, ccy + core_r * 1.16],
              fill=R(shade(main_dk, 1.6)))
    # 核体
    m = m_ell(W, ccx, ccy, core_r, core_r)
    paste(img, radial(W, ccx, ccy, core_r * 1.8,
                      [(0.0, '#ffffff'), (0.30, main_lt), (0.72, main), (1.0, main_dk)]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([ccx - core_r, ccy - core_r, ccx + core_r, ccy + core_r],
              outline=R(V.P.line), width=int(2.0 * SS))
    d.ellipse([ccx - core_r * 0.42, ccy - core_r * 0.50,
               ccx + core_r * 0.06, ccy + core_r * 0.02],
              fill=(255, 255, 255, 235))

    # ⑨ 门（Lv2+）
    if level >= 2:
        dw = (mx1 - mx0) * 0.26
        dh = (my1 - my0) * 0.30
        door_box = [cx - dw, my1 - dh, cx + dw, my1]
        # 门洞（深色拱）
        d.rectangle([door_box[0], door_box[1] + dh * 0.30, door_box[2], door_box[3]],
                    fill=R(hx('#3a2410')))
        d.ellipse([door_box[0], door_box[1], door_box[2], door_box[1] + dh * 0.62],
                  fill=R(hx('#3a2410')))
        # 门板
        d.rectangle([door_box[0] + 2 * SS, door_box[1] + dh * 0.34,
                     door_box[2] - 2 * SS, door_box[3] - 2 * SS],
                    fill=R(hx('#5e3e1c')))
        d.ellipse([door_box[0] + 2 * SS, door_box[1] + 3 * SS,
                   door_box[2] - 2 * SS, door_box[1] + dh * 0.60],
                  fill=R(hx('#5e3e1c')))
        # 门板高光 + 铁钉
        d.line([(cx - dw * 0.55, door_box[1] + dh * 0.44),
                (cx - dw * 0.55, door_box[3] - dh * 0.10)],
               fill=R(hx('#7e5a2e'), 200), width=int(1.6 * SS))
        for k in (-1, 1):
            d.ellipse([cx + k * dw * 0.40 - W * 0.008, my1 - dh * 0.52 - W * 0.008,
                       cx + k * dw * 0.40 + W * 0.008, my1 - dh * 0.52 + W * 0.008],
                      fill=R(V.P.gold_lt))

    # ⑩ 主塔屋顶（Lv2+）
    if level >= 2:
        rw = W * (mw / W + 0.036 + 0.020 * t)
        rh = W * (0.072 + 0.062 * t)
        ry = my0 + W * 0.008
        # 阴影
        img = ellipse_shadow(img, cx, ry + rh * 0.2, rw * 0.9, rh * 0.22, 2.4 * SS, 90)
        d = ImageDraw.Draw(img)
        roof_pts = [(cx - rw, ry), (cx, ry - rh), (cx + rw, ry)]
        m = m_poly(W, roof_pts)
        paste(img, radial(W, cx - rw * 0.2, ry - rh * 0.5, rw * 1.7,
                          [(0.0, main_lt), (0.34, main), (0.78, main_dk), (1.0, shade(main_dk, 0.7))]), m)
        d = ImageDraw.Draw(img)
        d.polygon(roof_pts, outline=R(V.P.line), width=int(2.8 * SS))
        # 瓦楞
        for k in range(1, 4):
            f = k / 4.0
            d.line([(cx - rw * (1 - f), ry - rh * f * 0.96),
                    (cx + rw * (1 - f), ry - rh * f * 0.96)],
                   fill=R(shade(main_dk, 0.85), 120), width=int(1.6 * SS))
        # 金脊（Lv4+）
        if level >= 4:
            d.line([(cx - rw, ry), (cx, ry - rh)], fill=R(V.P.gold), width=int(2.4 * SS))
            d.line([(cx, ry - rh), (cx + rw, ry)], fill=R(V.P.gold), width=int(2.4 * SS))
        # 宝珠（Lv5+）
        if level >= 5:
            br2 = W * 0.024
            m = m_ell(W, cx, ry - rh - br2 * 0.5, br2, br2)
            paste(img, radial(W, cx, ry - rh - br2 * 0.5, br2 * 2.0,
                              [(0.0, '#fff4c8'), (0.45, V.P.gold), (1.0, V.P.gold_dk)]), m)
            d = ImageDraw.Draw(img)
            d.ellipse([cx - br2, ry - rh - br2 * 1.5, cx + br2, ry - rh + br2 * 0.5],
                      outline=R(V.P.line), width=int(1.8 * SS))

    # ⑪ 中央旗
    pole_top = my0 - W * (0.100 + 0.100 * t) - (W * 0.075 if level >= 2 else 0)
    d.line([(cx, my0 - W * 0.004), (cx, pole_top)], fill=R(hx('#7a5a30')), width=int(2.6 * SS))
    fw = W * (0.068 + 0.042 * t)
    fh = W * (0.052 + 0.036 * t)
    flag_pts = [(cx, pole_top), (cx + fw, pole_top + fh * 0.46), (cx, pole_top + fh)]
    m = m_poly(W, flag_pts)
    paste(img, radial(W, cx + fw * 0.3, pole_top + fh * 0.3, fw * 1.8,
                      [(0.0, main_lt), (0.42, main), (1.0, main_dk)]), m)
    d = ImageDraw.Draw(img)
    d.polygon(flag_pts, outline=R(V.P.line), width=int(2.2 * SS))
    # 旗杆顶金珠
    d.ellipse([cx - W * 0.014, pole_top - W * 0.026, cx + W * 0.014, pole_top + W * 0.002],
              fill=R(V.P.gold), outline=R(V.P.line), width=int(1.6 * SS))
    d.ellipse([cx - W * 0.008, pole_top - W * 0.021, cx + W * 0.000, pole_top - W * 0.012],
              fill=(255, 255, 255, 230))

    # ⑫ Lv6 金边 + 光环
    if level >= 6:
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(4):
            kk = 1.02 + k * 0.075
            gd.ellipse([cx - wall_hw * kk, cy - wall_hw * sq * kk,
                        cx + wall_hw * kk, cy + wall_hw * sq * kk],
                       outline=R(V.P.gold, 120 - k * 26), width=int(2.4 * SS))
        img.alpha_composite(blur(gl, 2.4 * SS))
        d = ImageDraw.Draw(img)
        d.line([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)],
               fill=R(V.P.gold), width=int(2.6 * SS), joint='curve')
        # 城墙铆钉
        for i in range(6):
            bx = x0 + (x1 - x0) * (i + 0.5) / 6
            for by2 in (y0, y1):
                d.ellipse([bx - W * 0.009, by2 - W * 0.009,
                           bx + W * 0.009, by2 + W * 0.009], fill=R(V.P.gold))

    img = grain(img, 3)
    return img.resize((size, size), Image.LANCZOS)


# ================================================================= 导出
def export():
    for fr in ('idle', 'throw', 'wind'):
        draw_balloon(frame=fr).save(os.path.join(OUT, f'balloon_blue_{fr}.png'))
    draw_balloon(frame='throw', team='red').save(os.path.join(OUT, 'balloon_red_throw.png'))
    for lv in range(1, 7):
        draw_base(lv, team='blue').save(os.path.join(OUT, f'base_blue_lv{lv}.png'))
        draw_base(lv, team='red').save(os.path.join(OUT, f'base_red_lv{lv}.png'))
    print('exported balloon + base')


if __name__ == '__main__':
    export()

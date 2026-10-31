# -*- coding: utf-8 -*-
"""气球兵 v7 —— 配合同一套更细的线条规范（描边 1.85px）"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import art_v7 as V

SS = V.SS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v6')
os.makedirs(OUT, exist_ok=True)

OL = V.OL
hx, sh, R = V.hx, V.sh, V.R
canvas, bl = V.canvas, V.bl
mp, me, rad, lgr, ps = V.mp, V.me, V.rad, V.lgr, V.ps
shadow, grain = V.shadow, V.grain


def render_balloon(size=256, team='blue', frame='idle'):
    W = size * SS
    img = canvas(W)
    S = W
    cx = W * 0.50
    cy = W * 0.50

    if team == 'blue':
        bal = ['#fce0f2', '#e896cc', '#bc5fa0', '#7c2f64']
        cloth_lt, cloth, cloth_dk = '#7aa2e2', '#3e68b0', '#1d3459'
    else:
        bal = ['#fce6c8', '#e8a874', '#bc7442', '#7c4220']
        cloth_lt, cloth, cloth_dk = '#e89084', '#c0453a', '#7c1e18'

    # ① 地面投影
    img = shadow(img, cx, cy + S * 0.330, S * 0.150, S * 0.032, 2.6 * SS, 105)

    # ② 气球
    br = S * 0.180
    by = cy - S * 0.088
    ps(img, rad(W, cx, by, br * 1.55,
                [(0.0, bal[0]), (0.30, bal[1]), (0.70, bal[2]), (1.0, bal[3])],
                lx=-0.36, ly=-0.40, sp=1.90), me(W, cx, by, br, br * 1.05))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - br, by - br * 1.05, cx + br, by + br * 1.05],
              outline=R(V.C_LINE), width=int(OL))

    # 边缘反光（右上）
    rl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(rl).arc([cx - br * 0.94, by - br * 0.99, cx + br * 0.94, by + br * 0.99],
                           292, 22, fill=(255, 255, 255, 125), width=int(br * 0.085))
    img.alpha_composite(bl(rl, 1.8 * SS))

    # 竖向缝线（弧线，用多段贝塞尔近似）
    d = ImageDraw.Draw(img)
    for k in (-1, 0, 1):
        xo = k * br * 0.50
        pts = []
        for i in range(16):
            u = i / 15.0
            yy = by - br * 0.95 + u * br * 1.90
            # 椭圆上的横向偏移
            rel = (yy - by) / (br * 1.05)
            rel = max(-1.0, min(1.0, rel))
            wfac = math.sqrt(max(0.0, 1 - rel * rel))
            pts.append((cx + xo * (0.45 + 0.55 * wfac) * 1.55, yy))
        d.line(pts, fill=R(sh(bal[2], 0.88), 75), width=int(1.2 * SS))

    # 主高光
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([cx - br * 0.62, by - br * 0.86, cx - br * 0.14, by - br * 0.30],
               fill=(255, 255, 255, 150))
    hd.ellipse([cx - br * 0.50, by - br * 0.74, cx - br * 0.30, by - br * 0.52],
               fill=(255, 255, 255, 235))
    img.alpha_composite(bl(hl, 1.4 * SS))

    # 底部收口
    d = ImageDraw.Draw(img)
    d.ellipse([cx - br * 0.17, by + br * 0.90, cx + br * 0.17, by + br * 1.14],
              fill=R(sh(bal[2], 0.74)), outline=R(V.C_LINE), width=int(OL * 0.85))

    # ③ 绳索
    rope_top = by + br * 1.06
    bk_y = cy + S * 0.148
    bk_hw = S * 0.114
    for s in (-1, 1):
        d.line([(cx + s * br * 0.11, rope_top), (cx + s * bk_hw * 0.86, bk_y - S * 0.030)],
               fill=R(hx('#f0e6cc')), width=int(1.9 * SS))
        d.line([(cx + s * br * 0.11, rope_top), (cx + s * bk_hw * 0.86, bk_y - S * 0.030)],
               fill=R(hx('#c0b094'), 140), width=int(0.8 * SS))

    # ④ 吊篮
    ps(img, rad(W, cx, bk_y + S * 0.006, bk_hw * 1.85,
                [(0.0, '#dcac70'), (0.42, '#b4823e'), (1.0, '#6a4418')]),
       me(W, cx, bk_y + S * 0.006, bk_hw, S * 0.056))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - bk_hw, bk_y - S * 0.050, cx + bk_hw, bk_y + S * 0.062],
              outline=R(V.C_LINE), width=int(OL))
    # 编纹
    for i in range(4):
        yy = bk_y - S * 0.012 + i * S * 0.018
        d.line([(cx - bk_hw * 0.84, yy), (cx + bk_hw * 0.84, yy)],
               fill=R(hx('#5e3810'), 130), width=int(1.2 * SS))
    # 篮沿
    ps(img, rad(W, cx, bk_y - S * 0.040, bk_hw * 1.35,
                [(0.0, '#f2d0a0'), (0.45, '#cc9c60'), (1.0, '#8a6028')]),
       me(W, cx, bk_y - S * 0.040, bk_hw * 1.08, S * 0.022))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - bk_hw * 1.08, bk_y - S * 0.062, cx + bk_hw * 1.08, bk_y - S * 0.018],
              outline=R(V.C_LINE), width=int(OL * 0.9))

    # ⑤ 士兵
    hy = bk_y - S * 0.058
    hr = S * 0.055
    # 身体
    ps(img, rad(W, cx, hy + hr * 0.90, hr * 1.95,
                [(0.0, cloth_lt), (0.52, cloth), (1.0, cloth_dk)]),
       me(W, cx, hy + hr * 0.90, hr * 1.22, hr * 1.05))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - hr * 1.22, hy - hr * 0.15, cx + hr * 1.22, hy + hr * 1.95],
              outline=R(V.C_LINE), width=int(OL * 0.9))
    # 头
    ps(img, rad(W, cx, hy, hr * 1.55,
                [(0.0, '#fff0e0'), (0.42, '#f6cfa6'), (1.0, '#b88450')]), me(W, cx, hy, hr, hr * 1.02))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - hr, hy - hr * 1.02, cx + hr, hy + hr * 1.02],
              outline=R(V.C_LINE), width=int(OL * 0.9))
    # 头盔
    ps(img, rad(W, cx, hy - hr * 0.50, hr * 1.65,
                [(0.0, sh(cloth_lt, 1.30)), (0.40, cloth_lt), (0.80, cloth), (1.0, cloth_dk)]),
       me(W, cx, hy - hr * 0.50, hr * 1.10, hr * 0.70))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - hr * 1.10, hy - hr * 1.20, cx + hr * 1.10, hy + hr * 0.20],
              outline=R(V.C_LINE), width=int(OL * 0.9))
    # 头盔高光
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - hr * 0.82, hy - hr * 1.06, cx - hr * 0.06, hy - hr * 0.60],
                               fill=(255, 255, 255, 185))
    img.alpha_composite(bl(hl, 1.2 * SS))
    # 眼睛
    d = ImageDraw.Draw(img)
    for s in (-1, 1):
        ex = cx + s * hr * 0.38
        d.ellipse([ex - hr * 0.115, hy - hr * 0.30, ex + hr * 0.115, hy + hr * 0.02],
                  fill=R(hx('#221a24')))
        d.ellipse([ex - hr * 0.075, hy - hr * 0.26, ex + hr * 0.01, hy - hr * 0.15],
                  fill=(255, 255, 255, 225))
    # 嘴
    d.arc([cx - hr * 0.22, hy + hr * 0.16, cx + hr * 0.22, hy + hr * 0.52],
          20, 160, fill=R(hx('#8a4a3a')), width=int(1.6 * SS))

    # ⑥ 帧差异
    if frame == 'throw':
        bx, byy = cx + S * 0.168, cy + S * 0.098
        ps(img, rad(W, bx, byy, S * 0.078,
                    [(0.0, '#9a9aae'), (0.34, '#4e4e60'), (1.0, '#18181f')]),
           me(W, bx, byy, S * 0.040, S * 0.040))
        d = ImageDraw.Draw(img)
        d.ellipse([bx - S * 0.040, byy - S * 0.040, bx + S * 0.040, byy + S * 0.040],
                  outline=R(hx('#0a0a10')), width=int(OL * 0.9))
        d.ellipse([bx - S * 0.024, byy - S * 0.028, bx - S * 0.006, byy - S * 0.010],
                  fill=(205, 205, 225, 140))
        d.line([(bx + S * 0.026, byy - S * 0.032), (bx + S * 0.052, byy - S * 0.068)],
               fill=R(hx('#c8a860')), width=int(1.8 * SS))
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(3):
            rr = S * (0.026 - k * 0.007)
            gd.ellipse([bx + S * 0.048 - rr, byy - S * 0.080 - rr,
                        bx + S * 0.048 + rr, byy - S * 0.080 + rr],
                       fill=(255, 214, 90, 95 + k * 55))
        img.alpha_composite(bl(gl, 1.8 * SS))
    elif frame == 'wind':
        for k in range(3):
            yy = cy - S * 0.095 + (k - 1) * S * 0.098
            x0 = cx - S * 0.320 - k * S * 0.018
            ln = S * (0.098 - k * 0.013)
            ov = Image.new('RGBA', (W, W), (0, 0, 0, 0))
            ImageDraw.Draw(ov).line([(x0, yy), (x0 + ln, yy)],
                                    fill=(255, 255, 255, 115), width=int(2.4 * SS))
            img.alpha_composite(bl(ov, 0.7 * SS))

    img = grain(img, 2)
    return img.resize((size, size), Image.LANCZOS)


def export():
    for fr in ('idle', 'throw', 'wind'):
        render_balloon(frame=fr).save(os.path.join(OUT, f'balloon_blue_{fr}.png'))
    render_balloon(frame='throw', team='red').save(os.path.join(OUT, 'balloon_red_throw.png'))
    print('exported balloon')


if __name__ == '__main__':
    export()

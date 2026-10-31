# -*- coding: utf-8 -*-
"""兵种（8 种）+ 法术（6 种）美术 v8

兵种：正俯视，圆润卡通，能看出武器与阵营
法术：卡牌图标风格，单色背景易抠图
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import art_v8_lib as L

SS = L.SS
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v8')
os.makedirs(OUT, exist_ok=True)

OL = L.OL
hx, sh, R = L.hx, L.sh, L.R
canvas, bl, mp, me, rad, lgr, ps = L.canvas, L.bl, L.mp, L.me, L.rad, L.lgr, L.ps
shadow, glow, grain = L.shadow, L.glow, L.grain
C_LINE = L.C_LINE


def fit(img, size, margin=0.06):
    """按 alpha 包围盒裁切并铺满画布（画的东西再小也能填满图标）"""
    bbox = img.getchannel('A').getbbox()
    if not bbox:
        return img.resize((size, size), Image.LANCZOS)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    side = int(max(w, h) * (1 + margin * 2))
    cx = (bbox[0] + bbox[2]) // 2
    cy = (bbox[1] + bbox[3]) // 2
    box = (cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)
    return img.crop(box).resize((size, size), Image.LANCZOS)


def team_pal(team):
    if team == 'blue':
        return dict(cloth='#3e68b0', cloth_lt='#7aa2e2', cloth_dk='#1d3459',
                    trim='#dcac3c', ring=(90, 169, 255))
    return dict(cloth='#c0453a', cloth_lt='#e89084', cloth_dk='#7c1e18',
                trim='#dcac3c', ring=(255, 107, 107))


def disc(img, W, cx, cy, r, c_hi, c_mid, c_dk):
    ps(img, rad(W, cx, cy, r * 1.5, [(0.0, c_hi), (0.42, c_mid), (1.0, c_dk)]),
       me(W, cx, cy, r, r))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=R(C_LINE), width=int(OL * 0.9))
    return img


def metal_bar(img, W, cx, cy, ang, ln, wd, stops, cap=True):
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = wd * 0.5
    q = [(cx + px * hw, cy + py * hw), (cx + ux * ln + px * hw, cy + uy * ln + py * hw),
         (cx + ux * ln - px * hw, cy + uy * ln - py * hw), (cx - px * hw, cy - py * hw)]
    ps(img, lgr(W, q[0], q[3], stops), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL * 0.85))
    if cap:
        for t in (0.5, 1.0):
            bx, by = cx + ux * ln * t, cy + uy * ln * t
            d.line([(bx + px * hw * 1.1, by + py * hw * 1.1),
                    (bx - px * hw * 1.1, by - py * hw * 1.1)],
                   fill=R(C_LINE, 120), width=int(wd * 0.16))
    return img


# ================================================================= 兵种
def u_infantry(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    P = team_pal(team)
    cx, cy = W * 0.50, W * 0.52
    img = shadow(img, cx, cy + S * 0.15, S * 0.17, S * 0.05, 2.6 * SS, 105)
    # 剑（先画，位于身体右侧）
    a = math.radians(-58)
    metal_bar(img, W, cx + S * 0.10, cy + S * 0.02, a, S * 0.20, S * 0.040,
              [(0.0, '#8a94a6'), (0.42, '#e2e8f2'), (1.0, '#5a6472')])
    # 盾（左）
    d = ImageDraw.Draw(img)
    ps(img, rad(W, cx - S * 0.095, cy + S * 0.02, S * 0.095,
                [(0.0, '#d8e4f4'), (0.45, '#7e8ea6'), (1.0, '#39465c')]),
       me(W, cx - S * 0.095, cy + S * 0.02, S * 0.072, S * 0.078))
    d.ellipse([cx - S * 0.167, cy - S * 0.058, cx - S * 0.023, cy + S * 0.098],
              outline=R(C_LINE), width=int(OL * 0.85))
    # 身体
    img = disc(img, W, cx, cy + S * 0.045, S * 0.088, sh(P['cloth_lt'], 1.2), P['cloth'], P['cloth_dk'])
    # 肩甲
    d = ImageDraw.Draw(img)
    for s in (-1, 1):
        ps(img, rad(W, cx + s * S * 0.072, cy + S * 0.020, S * 0.055,
                    [(0.0, '#cfd8e6'), (0.45, '#818b9a'), (1.0, '#48505c')]),
           me(W, cx + s * S * 0.072, cy + S * 0.020, S * 0.040, S * 0.036))
        d.ellipse([cx + s * S * 0.072 - S * 0.040, cy + S * 0.020 - S * 0.036,
                   cx + s * S * 0.072 + S * 0.040, cy + S * 0.020 + S * 0.036],
                  outline=R(C_LINE), width=int(OL * 0.7))
    # 头盔（正俯视看头顶）
    img = disc(img, W, cx, cy - S * 0.038, S * 0.062, sh(P['cloth_lt'], 1.28), P['cloth_lt'], P['cloth_dk'])
    d = ImageDraw.Draw(img)
    d.arc([cx - S * 0.050, cy - S * 0.088, cx + S * 0.050, cy + S * 0.012],
          200, 340, fill=R('#e8f0ff', 200), width=int(2.2 * SS))
    return fit(grain(img, 2), size)


def u_heavy(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    P = team_pal(team)
    cx, cy = W * 0.50, W * 0.52
    img = shadow(img, cx, cy + S * 0.17, S * 0.21, S * 0.06, 2.8 * SS, 108)
    # 巨盾（左侧，占很大面积）
    d = ImageDraw.Draw(img)
    sx, sy = cx - S * 0.100, cy + S * 0.020
    ps(img, rad(W, sx, sy, S * 0.135,
                [(0.0, '#dfe8f6'), (0.38, '#8e9ab0'), (1.0, '#3a4356')]),
       me(W, sx, sy, S * 0.108, S * 0.120))
    d.ellipse([sx - S * 0.108, sy - S * 0.120, sx + S * 0.108, sy + S * 0.120],
              outline=R(C_LINE), width=int(OL))
    d.ellipse([sx - S * 0.052, sy - S * 0.058, sx + S * 0.052, sy + S * 0.058],
              outline=R(P['cloth'], 200), width=int(2.4 * SS))
    # 锤（右）
    a = math.radians(-62)
    metal_bar(img, W, cx + S * 0.075, cy + S * 0.040, a, S * 0.185, S * 0.034,
              [(0.0, '#5a3a18'), (0.45, '#a8763e'), (1.0, '#3e2810')])
    d = ImageDraw.Draw(img)
    hx0 = cx + S * 0.075 + math.cos(a) * S * 0.195
    hy0 = cy + S * 0.040 + math.sin(a) * S * 0.195
    ps(img, rad(W, hx0, hy0, S * 0.070,
                [(0.0, '#cfd8e6'), (0.42, '#818b9a'), (1.0, '#3a4356')]),
       me(W, hx0, hy0, S * 0.052, S * 0.046))
    d.ellipse([hx0 - S * 0.052, hy0 - S * 0.046, hx0 + S * 0.052, hy0 + S * 0.046],
              outline=R(C_LINE), width=int(OL * 0.85))
    # 身体（宽肩重甲）
    img = disc(img, W, cx, cy + S * 0.055, S * 0.108, sh('#9aa6bc', 1.1), '#6b7f9e', '#39445a')
    d = ImageDraw.Draw(img)
    for s in (-1, 1):
        ps(img, rad(W, cx + s * S * 0.088, cy + S * 0.018, S * 0.062,
                    [(0.0, '#d4dcea'), (0.44, '#8a94a6'), (1.0, '#48505c')]),
           me(W, cx + s * S * 0.088, cy + S * 0.018, S * 0.048, S * 0.042))
        d.ellipse([cx + s * S * 0.088 - S * 0.048, cy + S * 0.018 - S * 0.042,
                   cx + s * S * 0.088 + S * 0.048, cy + S * 0.018 + S * 0.042],
                  outline=R(C_LINE), width=int(OL * 0.75))
    # 全覆式头盔
    img = disc(img, W, cx, cy - S * 0.040, S * 0.070, '#e0e8f4', '#98a4b8', '#3c4658')
    d = ImageDraw.Draw(img)
    d.line([(cx - S * 0.040, cy - S * 0.048), (cx + S * 0.040, cy - S * 0.048)],
           fill=R('#1a2028'), width=int(S * 0.016))
    return fit(grain(img, 2), size)


def u_siege(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.50, W * 0.52
    img = shadow(img, cx, cy + S * 0.16, S * 0.18, S * 0.05, 2.6 * SS, 105)
    # 大锤（右上）
    a = math.radians(-50)
    metal_bar(img, W, cx + S * 0.045, cy + S * 0.045, a, S * 0.215, S * 0.036,
              [(0.0, '#5a3a18'), (0.42, '#b8894e'), (1.0, '#3e2810')])
    d = ImageDraw.Draw(img)
    hx0 = cx + S * 0.045 + math.cos(a) * S * 0.225
    hy0 = cy + S * 0.045 + math.sin(a) * S * 0.225
    ps(img, rad(W, hx0, hy0, S * 0.078,
                [(0.0, '#d8e0ec'), (0.42, '#8894a8'), (1.0, '#3a4356')]),
       me(W, hx0, hy0, S * 0.058, S * 0.050))
    d.ellipse([hx0 - S * 0.058, hy0 - S * 0.050, hx0 + S * 0.058, hy0 + S * 0.050],
              outline=R(C_LINE), width=int(OL * 0.85))
    # 背包炸弹
    for i, (bx, by) in enumerate([(-0.078, 0.062), (-0.052, 0.098)]):
        ps(img, rad(W, cx + S * bx, cy + S * by, S * 0.048,
                    [(0.0, '#8a8a9e'), (0.36, '#4a4a5c'), (1.0, '#18181f')]),
           me(W, cx + S * bx, cy + S * by, S * 0.032, S * 0.032))
        d.ellipse([cx + S * bx - S * 0.032, cy + S * by - S * 0.032,
                   cx + S * bx + S * 0.032, cy + S * by + S * 0.032],
                  outline=R(C_LINE), width=int(OL * 0.7))
    # 身体（橙工装）
    img = disc(img, W, cx, cy + S * 0.020, S * 0.086, '#e8a878', '#c2703c', '#7a4020')
    # 护目镜头盔
    img = disc(img, W, cx, cy - S * 0.048, S * 0.058, '#f0c090', '#c2703c', '#6e3a18')
    d = ImageDraw.Draw(img)
    d.arc([cx - S * 0.046, cy - S * 0.092, cx + S * 0.046, cy - S * 0.004],
          195, 345, fill=R('#7fe8ff', 210), width=int(2.6 * SS))
    return fit(grain(img, 2), size)


def u_archer(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.50, W * 0.52
    img = shadow(img, cx, cy + S * 0.15, S * 0.16, S * 0.05, 2.4 * SS, 102)
    # 长弓（左侧弧，缩小让身体可见）
    d = ImageDraw.Draw(img)
    bow = []
    for i in range(15):
        t = i / 14.0
        aa = math.pi * (0.30 + t * 1.40)
        bow.append((cx - S * 0.050 + math.cos(aa) * S * 0.032,
                    cy + S * 0.014 + math.sin(aa) * S * 0.094))
    d.line(bow, fill=R('#4a3014'), width=int(S * 0.019), joint='curve')
    d.line(bow, fill=R('#a8763e'), width=int(S * 0.010), joint='curve')
    d.line([bow[0], bow[-1]], fill=R('#efe4c8', 230), width=int(S * 0.007))
    # 箭
    d.line([(cx - S * 0.065, cy + S * 0.010), (cx + S * 0.105, cy + S * 0.010)],
           fill=R('#c8a870'), width=int(S * 0.017))
    d.polygon([(cx + S * 0.122, cy + S * 0.010),
               (cx + S * 0.092, cy - S * 0.018), (cx + S * 0.092, cy + S * 0.038)],
              fill=R('#c8f0a0'))
    # 身体（绿斗篷）
    img = disc(img, W, cx, cy + S * 0.030, S * 0.082, '#9ad89a', '#5aab6a', '#2e6e3c')
    # 兜帽
    img = disc(img, W, cx, cy - S * 0.040, S * 0.060, '#a8e0a8', '#5aab6a', '#2a6436')
    d = ImageDraw.Draw(img)
    # 兜帽阴影里露出的脸
    d.ellipse([cx - S * 0.026, cy - S * 0.058, cx + S * 0.026, cy - S * 0.008],
              fill=R('#f4cda4'))
    for s in (-1, 1):
        d.ellipse([cx + s * S * 0.011 - S * 0.005, cy - S * 0.040,
                   cx + s * S * 0.011 + S * 0.005, cy - S * 0.028], fill=R('#241a24'))
    # 箭袋
    d.polygon([(cx + S * 0.052, cy + S * 0.078), (cx + S * 0.090, cy + S * 0.070),
               (cx + S * 0.078, cy + S * 0.016), (cx + S * 0.044, cy + S * 0.024)],
              fill=R('#6e4a24'), outline=R(C_LINE), width=int(OL * 0.7))
    for k in (-1, 0, 1):
        d.line([(cx + S * (0.066 + k * 0.010), cy + S * 0.022),
                (cx + S * (0.072 + k * 0.012), cy - S * 0.014)],
               fill=R('#c8f0a0'), width=int(1.8 * SS))
    return fit(grain(img, 2), size)


def u_ram(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.50, W * 0.53
    img = shadow(img, cx, cy + S * 0.175, S * 0.235, S * 0.060, 3.0 * SS, 110)
    d = ImageDraw.Draw(img)
    # 车体（木质长箱）
    body = [(cx - S * 0.150, cy - S * 0.040), (cx + S * 0.130, cy - S * 0.040),
            (cx + S * 0.150, cy + S * 0.048), (cx + S * 0.130, cy + S * 0.130),
            (cx - S * 0.150, cy + S * 0.130), (cx - S * 0.168, cy + S * 0.048)]
    ps(img, lgr(W, (0, cy - S * 0.06), (0, cy + S * 0.14),
                [(0.0, '#b8894e'), (0.42, '#8a6234'), (1.0, '#4a3014')]), mp(W, body))
    d.polygon(body, outline=R(C_LINE), width=int(OL))
    # 木板纹
    for i in range(3):
        yy = cy - S * 0.010 + i * S * 0.048
        d.line([(cx - S * 0.140, yy), (cx + S * 0.130, yy)],
               fill=R('#3e2810', 120), width=int(1.6 * SS))
    # 撞锤（从车头伸出）
    ru = (S * 0.175, 0)
    ps(img, lgr(W, (cx + S * 0.120, cy - S * 0.032), (cx + S * 0.120, cy + S * 0.032),
                [(0.0, '#3a4356'), (0.40, '#a8b2c4'), (1.0, '#2a3240')]),
       mp(W, [(cx + S * 0.110, cy - S * 0.032), (cx + S * 0.235, cy - S * 0.032),
              (cx + S * 0.235, cy + S * 0.032), (cx + S * 0.110, cy + S * 0.032)]))
    d.polygon([(cx + S * 0.110, cy - S * 0.032), (cx + S * 0.235, cy - S * 0.032),
               (cx + S * 0.235, cy + S * 0.032), (cx + S * 0.110, cy + S * 0.032)],
              outline=R(C_LINE), width=int(OL))
    # 撞头（金属尖）
    d.polygon([(cx + S * 0.235, cy - S * 0.050), (cx + S * 0.285, cy),
               (cx + S * 0.235, cy + S * 0.050)],
              fill=R('#cfd8e6'), outline=R(C_LINE), width=int(OL * 0.85))
    # 车轮（左右）
    for s in (-1, 1):
        wx = cx + s * S * 0.108
        wy = cy + S * 0.128
        ps(img, rad(W, wx, wy, S * 0.062,
                    [(0.0, '#7a5228'), (0.45, '#523414'), (1.0, '#241608')]),
           me(W, wx, wy, S * 0.048, S * 0.032))
        d.ellipse([wx - S * 0.048, wy - S * 0.032, wx + S * 0.048, wy + S * 0.032],
                  outline=R(C_LINE), width=int(OL * 0.8))
        d.ellipse([wx - S * 0.016, wy - S * 0.011, wx + S * 0.016, wy + S * 0.011],
                  fill=R('#8e9aae'))
    # 加固铁箍
    for xx in (cx - S * 0.095, cx + S * 0.070):
        d.line([(xx, cy - S * 0.040), (xx, cy + S * 0.130)],
               fill=R('#6a7488'), width=int(S * 0.014))
    return fit(grain(img, 2), size)


def u_airship(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.50, W * 0.50
    img = shadow(img, cx, cy + S * 0.235, S * 0.195, S * 0.042, 2.8 * SS, 105)
    # 气囊（椭圆）
    ax, ay = S * 0.190, S * 0.088
    ps(img, rad(W, cx - S * 0.030, cy - S * 0.030, S * 0.26,
                [(0.0, '#d8d0f0'), (0.34, '#a898d8'), (0.72, '#7a6caa'), (1.0, '#3e3466')]),
       me(W, cx, cy - S * 0.040, ax, ay))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - ax, cy - S * 0.040 - ay, cx + ax, cy - S * 0.040 + ay],
              outline=R(C_LINE), width=int(OL * 1.1))
    # 气囊分节线
    for k in (-0.55, 0, 0.55):
        d.line([(cx + k * ax, cy - S * 0.040 - ay * 0.98),
                (cx + k * ax, cy - S * 0.040 + ay * 0.98)],
               fill=R('#5a4e8a', 120), width=int(1.8 * SS))
    # 吊舱
    ps(img, rad(W, cx, cy + S * 0.045, S * 0.115,
                [(0.0, '#c8a878'), (0.42, '#9a7440'), (1.0, '#4e3818')]),
       me(W, cx, cy + S * 0.045, S * 0.082, S * 0.046))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - S * 0.082, cy + S * 0.045 - S * 0.046,
               cx + S * 0.082, cy + S * 0.045 + S * 0.046],
              outline=R(C_LINE), width=int(OL * 0.9))
    # 连接索
    for s in (-1, 1):
        d.line([(cx + s * S * 0.045, cy + S * 0.040),
                (cx + s * S * 0.060, cy + S * 0.006)],
               fill=R('#efe4c8'), width=int(1.7 * SS))
    # 炸弹（舱下）
    for s in (-1, 0, 1):
        bx = cx + s * S * 0.044
        by = cy + S * 0.098
        ps(img, rad(W, bx, by, S * 0.040,
                    [(0.0, '#8a8a9e'), (0.36, '#4a4a5c'), (1.0, '#18181f')]),
           me(W, bx, by, S * 0.026, S * 0.026))
        d.ellipse([bx - S * 0.026, by - S * 0.026, bx + S * 0.026, by + S * 0.026],
                  outline=R(C_LINE), width=int(OL * 0.65))
    # 尾翼
    d.polygon([(cx - ax * 0.96, cy - S * 0.040), (cx - ax * 1.22, cy - S * 0.096),
               (cx - ax * 1.10, cy - S * 0.040), (cx - ax * 1.22, cy + S * 0.020)],
              fill=R('#8a7fb8'), outline=R(C_LINE), width=int(OL * 0.75))
    return fit(grain(img, 2), size)


def u_dragon(size=256, team='blue'):
    W = size * SS
    S = W
    img = canvas(W)
    cx, cy = W * 0.50, W * 0.50
    img = shadow(img, cx, cy + S * 0.225, S * 0.185, S * 0.042, 3.0 * SS, 108)
    d = ImageDraw.Draw(img)
    # 双翼（展翼）
    for s in (-1, 1):
        wing = [(cx + s * S * 0.020, cy - S * 0.030),
                (cx + s * S * 0.215, cy - S * 0.145),
                (cx + s * S * 0.185, cy - S * 0.010),
                (cx + s * S * 0.130, cy + S * 0.060),
                (cx + s * S * 0.045, cy + S * 0.035)]
        ps(img, lgr(W, (cx, cy - S * 0.06), (cx + s * S * 0.20, cy + S * 0.04),
                    [(0.0, '#e0a078'), (0.40, '#b0613a'), (1.0, '#6a3018')]), mp(W, wing))
        d.polygon(wing, outline=R(C_LINE), width=int(OL))
        # 翼膜分骨
        for k in (0.42, 0.72):
            d.line([(cx + s * S * 0.020, cy - S * 0.030),
                    (cx + s * S * (0.215 * k), cy - S * (0.145 * k - 0.02))],
                   fill=R('#7a3a1c', 165), width=int(2.2 * SS))
    # 身体（长条）
    ps(img, rad(W, cx, cy + S * 0.020, S * 0.16,
                [(0.0, '#f0b890'), (0.40, '#c2703c'), (1.0, '#6a3018')]),
       me(W, cx, cy + S * 0.020, S * 0.062, S * 0.115))
    d.ellipse([cx - S * 0.062, cy + S * 0.020 - S * 0.115,
               cx + S * 0.062, cy + S * 0.020 + S * 0.115],
              outline=R(C_LINE), width=int(OL * 0.95))
    # 尾
    d.polygon([(cx - S * 0.036, cy + S * 0.120), (cx + S * 0.036, cy + S * 0.120),
               (cx + S * 0.010, cy + S * 0.215), (cx - S * 0.010, cy + S * 0.215)],
              fill=R('#8a4422'), outline=R(C_LINE), width=int(OL * 0.8))
    # 头（朝上前方）
    ps(img, rad(W, cx, cy - S * 0.098, S * 0.105,
                [(0.0, '#ffd0a8'), (0.38, '#c2703c'), (1.0, '#6a3018')]),
       me(W, cx, cy - S * 0.098, S * 0.052, S * 0.062))
    d.ellipse([cx - S * 0.052, cy - S * 0.160, cx + S * 0.052, cy - S * 0.036],
              outline=R(C_LINE), width=int(OL * 0.95))
    # 双角
    for s in (-1, 1):
        d.polygon([(cx + s * S * 0.030, cy - S * 0.140),
                   (cx + s * S * 0.058, cy - S * 0.205),
                   (cx + s * S * 0.012, cy - S * 0.156)],
                  fill=R('#e8dcc0'), outline=R(C_LINE), width=int(OL * 0.6))
    # 眼睛（发红光）
    for s in (-1, 1):
        d.ellipse([cx + s * S * 0.022 - S * 0.010, cy - S * 0.104,
                   cx + s * S * 0.022 + S * 0.010, cy - S * 0.084],
                  fill=R('#ffe04a'))
        d.ellipse([cx + s * S * 0.022 - S * 0.009, cy - S * 0.102,
                   cx + s * S * 0.022 + S * 0.001, cy - S * 0.093], fill=(255, 255, 255, 235))
    return fit(grain(img, 2), size)


UNIT_FN = {
    'infantry': u_infantry, 'heavy': u_heavy, 'siege': u_siege,
    'archer': u_archer, 'ram': u_ram, 'airship': u_airship, 'dragon': u_dragon,
}

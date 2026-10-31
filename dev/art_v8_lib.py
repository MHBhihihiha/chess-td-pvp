# -*- coding: utf-8 -*-
"""
建筑美术 v8 —— 全部 7 种建筑

风格调整（按你的反馈）：
  · 更简明：去掉齿轮、辐射砖缝、密集铆钉等碎细节
  · 保留体积：径向渐变 + 软阴影 + AO
  · 描边 1.9px（细但不软）
  · 每级结构仍然不同

组件化设计：
  底座 base：wood_tripod / wood_cart / sandbag / stone1 / stone2 / stone3
             / gold3 / iron_disc / iron_well / hex / stone_wall
  炮口 top ：dome / cyl / hexdome / golddome
  武器 weap：barrel / bow / crossbow / staff / mortar / coil / none
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 6
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v8')
os.makedirs(OUT, exist_ok=True)

OL = 1.9 * SS
SQ = 0.62


# ------------------------------------------------------------------ 工具
def hx(h):
    if isinstance(h, (tuple, list)):
        return tuple(int(v) for v in h[:3])
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def sh(c, f):
    c = hx(c)
    if f <= 1:
        return tuple(int(max(0, c[i] * f)) for i in range(3))
    t = f - 1
    return tuple(int(min(255, c[i] + (255 - c[i]) * t)) for i in range(3))


def R(c, a=255):
    c = hx(c)
    return (c[0], c[1], c[2], a)


def canvas(W):
    return Image.new('RGBA', (W, W), (0, 0, 0, 0))


def bl(img, r):
    return img.filter(ImageFilter.GaussianBlur(r))


def mp(W, pts):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m


def me(W, cx, cy, rx, ry):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return m


def rad(W, cx, cy, radius, stops, lx=-0.34, ly=-0.38, sp=1.85):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    px, py = cx + lx * radius, cy + ly * radius
    d = np.clip(np.sqrt((xx - px) ** 2 + (yy - py) ** 2) / (radius * sp), 0, 1)
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([hx(s[1]) for s in stops], dtype=np.float32)
    o = np.zeros((W, W, 4), dtype=np.uint8)
    for ch in range(3):
        o[..., ch] = np.interp(d, pos, cols[:, ch]).astype(np.uint8)
    o[..., 3] = 255
    return Image.fromarray(o, 'RGBA')


def lgr(W, p1, p2, stops):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    d = np.clip(((xx - p1[0]) * dx + (yy - p1[1]) * dy) / (L * L), 0, 1)
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([hx(s[1]) for s in stops], dtype=np.float32)
    o = np.zeros((W, W, 4), dtype=np.uint8)
    for ch in range(3):
        o[..., ch] = np.interp(d, pos, cols[:, ch]).astype(np.uint8)
    o[..., 3] = 255
    return Image.fromarray(o, 'RGBA')


def ps(img, g, m):
    img.paste(g, (0, 0), m)
    return img


def shadow(img, cx, cy, rx, ry, b, a=118):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(8, 12, 22, a))
    img.alpha_composite(bl(l, b))
    return img


def glow(img, cx, cy, r, c, layers=4, a0=34, b=2.4, sy=0.96):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(l)
    for k in range(layers):
        rr = r * (2.1 - k * 0.42)
        d.ellipse([cx - rr, cy - rr * sy, cx + rr, cy + rr * sy], fill=R(c, a0 + k * 26))
    img.alpha_composite(bl(l, b))
    return img


def grain(img, s=2):
    W = img.size[0]
    rng = np.random.default_rng(5)
    n = rng.normal(0, s, (W, W, 1)).repeat(3, axis=2)
    a = np.clip(np.array(img, dtype=np.int16)[:, :, :3] + n.astype(np.int16), 0, 255).astype(np.uint8)
    o = Image.fromarray(a, 'RGB').convert('RGBA')
    o.putalpha(img.getchannel('A'))
    return o


def ng(cx, cy, r, n=8, sq=SQ, rot=math.pi / 8, dy=0.0):
    return [(cx + math.cos(rot + i * 2 * math.pi / n) * r,
             cy + dy + math.sin(rot + i * 2 * math.pi / n) * r * sq) for i in range(n)]


# ------------------------------------------------------------------ 配色
C_LINE = '#12161f'
C_STEEL_LT, C_STEEL, C_STEEL_DK = '#d4dce8', '#909cb0', '#495568'
C_STONE_LT, C_STONE, C_STONE_DK = '#d4dbe6', '#9099a8', '#545d6b'
C_WOOD_LT, C_WOOD, C_WOOD_DK = '#d2a066', '#9c6c3a', '#5a3a18'
C_GOLD_LT, C_GOLD, C_GOLD_DK = '#ffe9a0', '#dcac3c', '#8a6018'
C_CRYSTAL = '#5ad0ff'
C_RED = '#d84038'
C_RED_LT = '#ff8c7c'

PAL = {
    'stone': dict(side=[(0.0, '#5e6878'), (0.55, '#454d5b'), (1.0, '#242b36')],
                  top=[(0.0, '#d2d9e4'), (0.42, '#9099a8'), (1.0, '#565f6d')]),
    'wood': dict(side=[(0.0, '#5e4018'), (0.55, '#452c10'), (1.0, '#241608')],
                 top=[(0.0, '#dcab6c'), (0.44, '#a8763e'), (1.0, '#6b4520')]),
    'gold': dict(side=[(0.0, '#a87a20'), (0.55, '#7a5814'), (1.0, '#3e2c08')],
                 top=[(0.0, '#fff2c0'), (0.40, '#dcac3c'), (1.0, '#8a6018')]),
    'iron': dict(side=[(0.0, '#5a646f'), (0.55, '#3c444f'), (1.0, '#1a2028')],
                 top=[(0.0, '#c2ccdb'), (0.42, '#818b9a'), (1.0, '#404a58')]),
    'sand': dict(side=[(0.0, '#9a8256'), (0.55, '#786340'), (1.0, '#463823')],
                 top=[(0.0, '#dccb9e'), (0.44, '#b8a271'), (1.0, '#7a6a44')]),
}


# ------------------------------------------------------------------ 底座
def oct_plinth(img, W, cx, cy, r, th, pal):
    d = ImageDraw.Draw(img)
    top = ng(cx, cy, r, 8)
    bot = ng(cx, cy + th, r * 0.99, 8)
    side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
    ps(img, lgr(W, (0, cy - r * SQ), (0, cy + r * SQ + th), pal['side']), mp(W, side))
    d.polygon(side, outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - r * SQ * 0.18, r * 1.42, pal['top']), mp(W, top))
    d.polygon(top, outline=R(C_LINE), width=int(OL))
    # 一格简单的倒角高光（不画辐射砖缝，保持简明）
    bv = ng(cx, cy, r * 0.90, 8)
    d.line(bv + [bv[0]], fill=R(sh(pal['top'][0][1], 1.10), 150), width=int(1.3 * SS), joint='curve')
    return img


def disc_base(img, W, cx, cy, r, th, pal):
    d = ImageDraw.Draw(img)
    ps(img, lgr(W, (0, cy - r * SQ), (0, cy + r * SQ + th), pal['side']), me(W, cx, cy + th * 0.5, r, r * SQ))
    d.ellipse([cx - r, cy - r * SQ, cx + r, cy + r * SQ + th * 0.9], outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - r * SQ * 0.18, r * 1.42, pal['top']), me(W, cx, cy, r, r * SQ))
    d.ellipse([cx - r, cy - r * SQ, cx + r, cy + r * SQ], outline=R(C_LINE), width=int(OL))
    return img


def hex_base(img, W, cx, cy, r, th, pal):
    d = ImageDraw.Draw(img)
    top = ng(cx, cy, r, 6, rot=0)
    bot = ng(cx, cy + th, r * 0.99, 6, rot=0)
    side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
    ps(img, lgr(W, (0, cy - r * SQ), (0, cy + r * SQ + th), pal['side']), mp(W, side))
    d.polygon(side, outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - r * SQ * 0.18, r * 1.42, pal['top']), mp(W, top))
    d.polygon(top, outline=R(C_LINE), width=int(OL))
    return img


def wood_beam(img, W, p1, p2, w):
    d = ImageDraw.Draw(img)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    px, py = -dy / L * w * 0.5, dx / L * w * 0.5
    q = [(p1[0] + px, p1[1] + py), (p2[0] + px, p2[1] + py),
         (p2[0] - px, p2[1] - py), (p1[0] - px, p1[1] - py)]
    ps(img, lgr(W, q[0], q[3], [(0.0, '#a8763e'), (0.42, '#7a5228'), (1.0, '#42280e')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL * 0.85))
    return img


def wheel(img, W, cx, cy, r):
    d = ImageDraw.Draw(img)
    ps(img, rad(W, cx, cy, r * 1.5, [(0.0, '#7a5228'), (0.45, '#523414'), (1.0, '#241608')]),
       me(W, cx, cy, r, r * 0.94))
    d.ellipse([cx - r, cy - r * 0.94, cx + r, cy + r * 0.94], outline=R(C_LINE), width=int(OL))
    d.ellipse([cx - r * 0.62, cy - r * 0.58, cx + r * 0.62, cy + r * 0.58],
              fill=R('#c49a5e'), outline=R(C_LINE), width=int(OL * 0.75))
    for i in range(8):
        a = i * math.pi / 4 + 0.2
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.58, cy + math.sin(a) * r * 0.54)],
               fill=R('#8a6234'), width=int(r * 0.10))
    d.ellipse([cx - r * 0.17, cy - r * 0.16, cx + r * 0.17, cy + r * 0.16],
              fill=R(C_STEEL_DK), outline=R(C_LINE), width=int(OL * 0.6))
    return img


def rivets(img, W, pts, r, c=None, n=6):
    d = ImageDraw.Draw(img)
    c = c or C_STEEL_LT
    for (x, y) in pts[:n]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=R(sh(c, 0.55)))
        d.ellipse([x - r * 0.84, y - r * 0.84, x + r * 0.84, y + r * 0.84], fill=R(c))
        d.ellipse([x - r * 0.34, y - r * 0.36, x + r * 0.30, y + r * 0.26], fill=R(sh(c, 1.5)))
    return img


def band(img, W, cx, cy, r, c, n=8, w=2.0):
    d = ImageDraw.Draw(img)
    b = ng(cx, cy, r * 1.006, n)
    d.line(b + [b[0]], fill=R(sh(c, 0.70)), width=int((w + 0.9) * SS), joint='curve')
    d.line(b + [b[0]], fill=R(c), width=int(w * SS), joint='curve')
    return img


# ------------------------------------------------------------------ 炮口
def dome(img, W, cx, cy, rt, kind='blue'):
    d = ImageDraw.Draw(img)
    if kind == 'blue':
        sc = [(0.0, '#4a76be'), (0.45, '#27477c'), (1.0, '#101f38')]
        tc = [(0.0, '#e0eefc'), (0.26, '#96bcf4'), (0.62, '#3d68b2'), (1.0, '#16294a')]
    elif kind == 'iron':
        sc = [(0.0, '#4a5a74'), (0.45, '#2a3648'), (1.0, '#101722')]
        tc = [(0.0, '#ccd8e8'), (0.26, '#8e9cb0'), (0.64, '#4a5665'), (1.0, '#1c2430')]
    else:  # gold
        sc = [(0.0, '#b88a28'), (0.45, '#7e5c14'), (1.0, '#3a2808')]
        tc = [(0.0, '#fff6d4'), (0.24, '#f0d074'), (0.60, '#c99a28'), (1.0, '#6e4c10')]
    img = shadow(img, cx, cy + rt * 0.64, rt * 1.10, rt * 0.28, 2.6 * SS, 128)
    d = ImageDraw.Draw(img)
    ps(img, rad(W, cx, cy + rt * 0.20, rt * 1.20, sc), me(W, cx, cy + rt * 0.20, rt, rt * 0.76))
    d.ellipse([cx - rt, cy + rt * 0.20 - rt * 0.76, cx + rt, cy + rt * 0.20 + rt * 0.76],
              outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - rt * 0.12, rt * 1.28, tc), me(W, cx, cy - rt * 0.12, rt, rt * 0.74))
    d.ellipse([cx - rt, cy - rt * 0.12 - rt * 0.74, cx + rt, cy - rt * 0.12 + rt * 0.74],
              outline=R(C_LINE), width=int(OL))
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - rt * 0.60, cy - rt * 0.66, cx - rt * 0.02, cy - rt * 0.14],
                               fill=(255, 255, 255, 175))
    img.alpha_composite(bl(hl, 2.0 * SS))
    return img


def hexdome(img, W, cx, cy, rt):
    d = ImageDraw.Draw(img)
    hp = ng(cx, cy + rt * 0.14, rt * 1.04, 6, sq=0.78, rot=0)
    ps(img, rad(W, cx, cy, rt * 1.55,
                [(0.0, '#e6f2ff'), (0.22, '#9cc0f2'), (0.58, '#3e68b2'), (1.0, '#14263c')]),
       mp(W, hp))
    d.polygon(hp, outline=R(C_LINE), width=int(OL))
    d.polygon([hp[4], hp[5], (cx, cy + rt * 0.08)], fill=R('#a8c8f5', 180))
    d.polygon([hp[5], hp[0], (cx, cy + rt * 0.08)], fill=R('#7aa2e2', 140))
    for i in range(6):
        d.line([(cx, cy + rt * 0.12), hp[i]], fill=R('#1d3459', 105), width=int(1.4 * SS))
    return img


# ------------------------------------------------------------------ 武器
def w_barrel(img, W, cx, cy, ang, blen, bw, muzzle=1, bands=2, col='blue'):
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = bw * 0.5
    if col == 'blue':
        st = [(0.0, '#101e33'), (0.20, '#4a76be'), (0.40, '#bcd4f8'),
              (0.60, '#7aa4e4'), (0.82, '#3560a8'), (1.0, '#0d1a2c')]
    elif col == 'wood':
        st = [(0.0, '#241608'), (0.22, '#6e4a24'), (0.44, '#c49a5e'),
              (0.66, '#9c6c3a'), (1.0, '#2e1c08')]
    else:
        st = [(0.0, '#141c28'), (0.22, '#6a7488'), (0.44, '#d4dce8'),
              (0.66, '#818b9a'), (1.0, '#1a2028')]

    s = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(s).line([(cx + hw * 0.3, cy + hw * 0.8),
                            (cx + ux * blen + hw * 0.3, cy + uy * blen + hw * 0.8)],
                           fill=(6, 10, 20, 75), width=int(hw * 1.8))
    img.alpha_composite(bl(s, 2.2 * SS))
    d = ImageDraw.Draw(img)

    q = [(cx + px * hw, cy + py * hw),
         (cx + ux * blen + px * hw, cy + uy * blen + py * hw),
         (cx + ux * blen - px * hw, cy + uy * blen - py * hw),
         (cx - px * hw, cy - py * hw)]
    ps(img, lgr(W, q[0], q[3], st), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL))

    for i in range(bands):
        t = (i + 1) / (bands + 1)
        bx, by = cx + ux * blen * t, cy + uy * blen * t
        bww = hw * 1.12
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(C_STEEL_DK), width=int(hw * 0.26))
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(C_STEEL), width=int(hw * 0.15))

    if muzzle:
        tx, ty = cx + ux * blen, cy + uy * blen
        ml = hw * 0.80
        mo = hw * 1.24
        q2 = [(tx + px * mo, ty + py * mo),
              (tx + ux * ml + px * mo, ty + uy * ml + py * mo),
              (tx + ux * ml - px * mo, ty + uy * ml - py * mo),
              (tx - px * mo, ty - py * mo)]
        ps(img, lgr(W, q2[0], q2[3],
                    [(0.0, '#0d131c'), (0.22, '#525c70'), (0.44, '#d4dce8'),
                     (0.68, '#6a7488'), (1.0, '#151b26')]), mp(W, q2))
        d.polygon(q2, outline=R(C_LINE), width=int(OL))
        mx0, my0 = tx + ux * ml * 0.92, ty + uy * ml * 0.92
        hr = hw * 0.70
        d.ellipse([mx0 - hr, my0 - hr * 0.92, mx0 + hr, my0 + hr * 0.92], fill=R(hx('#0b0f15')))
        d.arc([mx0 - hr, my0 - hr * 0.92, mx0 + hr, my0 + hr * 0.92],
              195, 335, fill=R(C_STEEL_LT, 200), width=int(hw * 0.12))
    return img


def w_bow(img, W, cx, cy, ang, size, col='green'):
    """弓（箭塔用）—— 弓臂要粗、弧度要大，64px 下才看得出来"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    wood = '#5e4018' if col == 'green' else '#4a3014'
    R0 = size * 0.52
    pts = []
    for i in range(17):
        t = i / 16.0
        a = math.pi * (0.30 + t * 1.40)
        lx = math.cos(a) * R0 * 0.26
        ly = math.sin(a) * R0
        pts.append((cx + ux * lx + px * ly, cy + uy * lx + py * ly))
    # 深色外轮廓
    d.line(pts, fill=R(wood), width=int(size * 0.17), joint='curve')
    # 亮面
    d.line(pts, fill=R('#a8763e'), width=int(size * 0.09), joint='curve')
    # 弓弦
    d.line([pts[0], pts[-1]], fill=R('#efe4c8'), width=int(size * 0.045))
    # 箭杆（沿炮管方向）
    ax = cx + ux * size * 0.44
    ay = cy + uy * size * 0.44
    d.line([(cx - ux * size * 0.14, cy - uy * size * 0.14), (ax, ay)],
           fill=R('#c8a870'), width=int(size * 0.060))
    # 箭头
    d.polygon([(ax + ux * size * 0.13, ay + uy * size * 0.13),
               (ax - ux * size * 0.01 + px * size * 0.085,
                ay - uy * size * 0.01 + py * size * 0.085),
               (ax - ux * size * 0.01 - px * size * 0.085,
                ay - uy * size * 0.01 - py * size * 0.085)], fill=R('#c8f0a0'))
    d.polygon([(ax + ux * size * 0.13, ay + uy * size * 0.13),
               (ax - ux * size * 0.01 + px * size * 0.085,
                ay - uy * size * 0.01 + py * size * 0.085),
               (ax - ux * size * 0.01 - px * size * 0.085,
                ay - uy * size * 0.01 - py * size * 0.085)],
              outline=R('#2a3a20', 180), width=int(OL * 0.5))
    return img


def w_crossbow(img, W, cx, cy, ang, size):
    """重弩（箭塔高等级）"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    # 弩身
    q = [(cx - ux * size * 0.10 + px * size * 0.10, cy - uy * size * 0.10 + py * size * 0.10),
         (cx + ux * size * 0.55 + px * size * 0.07, cy + uy * size * 0.55 + py * size * 0.07),
         (cx + ux * size * 0.55 - px * size * 0.07, cy + uy * size * 0.55 - py * size * 0.07),
         (cx - ux * size * 0.10 - px * size * 0.10, cy - uy * size * 0.10 - py * size * 0.10)]
    ps(img, lgr(W, q[0], q[3], [(0.0, '#2e1c08'), (0.45, '#8a6234'), (1.0, '#3e2810')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL * 0.9))
    # 弩臂（横向）
    for s in (-1, 1):
        d.line([(cx + px * s * size * 0.04, cy + py * s * size * 0.04),
                (cx + ux * size * 0.22 + px * s * size * 0.42,
                 cy + uy * size * 0.22 + py * s * size * 0.42)],
               fill=R('#6e4a24'), width=int(size * 0.10))
        d.line([(cx + px * s * size * 0.04, cy + py * s * size * 0.04),
                (cx + ux * size * 0.22 + px * s * size * 0.42,
                 cy + uy * size * 0.22 + py * s * size * 0.42)],
               fill=R('#a8763e', 170), width=int(size * 0.04))
    # 弦
    d.line([(cx + ux * size * 0.22 + px * size * 0.42, cy + uy * size * 0.22 + py * size * 0.42),
            (cx + ux * size * 0.22 - px * size * 0.42, cy + uy * size * 0.22 - py * size * 0.42)],
           fill=R('#e8dcc0', 210), width=int(size * 0.028))
    return img


def w_staff(img, W, cx, cy, ang, size, col='#c79bff'):
    """法师杖 + 光球"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    # 杖身
    q = [(cx - ux * size * 0.12 + px * size * 0.055, cy - uy * size * 0.12 + py * size * 0.055),
         (cx + ux * size * 0.40 + px * size * 0.040, cy + uy * size * 0.40 + py * size * 0.040),
         (cx + ux * size * 0.40 - px * size * 0.040, cy + uy * size * 0.40 - py * size * 0.040),
         (cx - ux * size * 0.12 - px * size * 0.055, cy - uy * size * 0.12 - py * size * 0.055)]
    ps(img, lgr(W, q[0], q[3], [(0.0, '#2a2038'), (0.45, '#6a5488'), (1.0, '#3a2a50')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL * 0.9))
    # 顶端叉
    for s in (-1, 1):
        d.line([(cx + ux * size * 0.40, cy + uy * size * 0.40),
                (cx + ux * size * 0.52 + px * s * size * 0.13,
                 cy + uy * size * 0.52 + py * s * size * 0.13)],
               fill=R(C_GOLD), width=int(size * 0.045))
    # 光球（缩小，紧贴杖尖）
    ox = cx + ux * size * 0.50
    oy = cy + uy * size * 0.50
    img2 = glow(img, ox, oy, size * 0.11, col, layers=4, a0=45, b=2.2)
    d = ImageDraw.Draw(img2)
    ps(img2, rad(W, ox, oy, size * 0.14,
                 [(0.0, '#ffffff'), (0.30, '#ecdcff'), (0.66, col), (1.0, '#5a3a9a')]),
       me(W, ox, oy, size * 0.100, size * 0.100))
    d = ImageDraw.Draw(img2)
    d.ellipse([ox - size * 0.100, oy - size * 0.100, ox + size * 0.100, oy + size * 0.100],
              outline=R('#2a1e40', 200), width=int(OL * 0.7))
    return img2


def w_mortar(img, W, cx, cy, ang, size, col='mixed'):
    """迫击炮：短而粗的炮管，大仰角，炮口不要太大"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = size * 0.22
    blen = size * 0.30

    # 管身
    q = [(cx - px * hw, cy - py * hw),
         (cx + ux * blen - px * hw * 0.90, cy + uy * blen - py * hw * 0.90),
         (cx + ux * blen + px * hw * 0.90, cy + uy * blen + py * hw * 0.90),
         (cx + px * hw, cy + py * hw)]
    ps(img, lgr(W, q[0], q[2],
                [(0.0, '#2a1c28'), (0.26, '#6e4c66'), (0.50, '#c8a0bc'), (1.0, '#1e1420')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL))

    # 炮口环（加粗但不要黑成一团）
    tx, ty = cx + ux * blen, cy + uy * blen
    mo = hw * 1.10
    q2 = [(tx - px * mo, ty - py * mo),
          (tx + ux * hw * 0.28 - px * mo, ty + uy * hw * 0.28 - py * mo),
          (tx + ux * hw * 0.28 + px * mo, ty + uy * hw * 0.28 + py * mo),
          (tx + px * mo, ty + py * mo)]
    ps(img, lgr(W, q2[0], q2[2],
                [(0.0, '#141018'), (0.28, '#6a5470'), (0.52, '#ded4e4'), (1.0, '#1a141e')]), mp(W, q2))
    d.polygon(q2, outline=R(C_LINE), width=int(OL))

    # 内孔（缩小到 0.46，之前 0.78 是个大黑洞）
    ox = tx + ux * hw * 0.26
    oy = ty + uy * hw * 0.26
    d.ellipse([ox - hw * 0.46, oy - hw * 0.42, ox + hw * 0.46, oy + hw * 0.42],
              fill=R('#0a0810'))
    d.arc([ox - hw * 0.46, oy - hw * 0.42, ox + hw * 0.46, oy + hw * 0.42],
          190, 340, fill=R('#8a7a92', 170), width=int(hw * 0.10))

    # 管身两道加强箍
    for t in (0.30, 0.62):
        bx = cx + ux * blen * t
        by = cy + uy * blen * t
        bww = hw * 1.06
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(C_STEEL_DK), width=int(hw * 0.24))
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(C_STEEL), width=int(hw * 0.13))
    return img


def w_coil(img, W, cx, cy, size, level):
    size = size * 0.60   # 之前太大，超出底座
    """特斯拉线圈：中心柱 + 环形电极 + 电光"""
    d = ImageDraw.Draw(img)
    # 中心柱
    q = [(cx - size * 0.07, cy - size * 0.34), (cx + size * 0.07, cy - size * 0.34),
         (cx + size * 0.09, cy + size * 0.10), (cx - size * 0.09, cy + size * 0.10)]
    ps(img, lgr(W, q[0], q[1],
                [(0.0, '#1a3a34'), (0.40, '#3c7a6c'), (0.70, '#8ff0e0'), (1.0, '#1e3a34')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL * 0.9))
    # 环（等级越高越多）
    nring = 2 + min(3, level // 3)
    for i in range(nring):
        ry = cy - size * 0.16 + i * size * 0.085
        rw = size * (0.26 + 0.03 * i)
        d.ellipse([cx - rw, ry - rw * 0.32, cx + rw, ry + rw * 0.32],
                  outline=R(C_STEEL_DK), width=int(size * 0.030))
        d.ellipse([cx - rw, ry - rw * 0.32, cx + rw, ry + rw * 0.32],
                  outline=R('#8ff0e0'), width=int(size * 0.014))
    # 顶部球
    img2 = glow(img, cx, cy - size * 0.38, size * 0.12, '#8ff0e0', layers=4, a0=40, b=2.2)
    d = ImageDraw.Draw(img2)
    ps(img2, rad(W, cx, cy - size * 0.38, size * 0.22,
                 [(0.0, '#ffffff'), (0.34, '#d8fff8'), (0.70, '#5ad0c0'), (1.0, '#1e6a5e')]),
       me(W, cx, cy - size * 0.38, size * 0.105, size * 0.105))
    d = ImageDraw.Draw(img2)
    d.ellipse([cx - size * 0.105, cy - size * 0.485, cx + size * 0.105, cy - size * 0.275],
              outline=R('#103a34', 190), width=int(OL * 0.7))
    # 电光
    d.line([(cx - size * 0.10, cy - size * 0.40), (cx + size * 0.04, cy - size * 0.30),
            (cx - size * 0.02, cy - size * 0.20)], fill=R('#d8fff8', 200), width=int(size * 0.018))
    return img2


def mount(img, W, cx, cy, r, col='stone'):
    """低矮的武器基座：给「还没有炮室」的低等级用，避免武器悬空"""
    d = ImageDraw.Draw(img)
    if col == 'stone':
        sc = [(0.0, '#5e6878'), (0.55, '#454d5b'), (1.0, '#242b36')]
        tc = [(0.0, '#d2d9e4'), (0.42, '#9099a8'), (1.0, '#565f6d')]
    elif col == 'wood':
        sc = [(0.0, '#5e4018'), (0.55, '#452c10'), (1.0, '#241608')]
        tc = [(0.0, '#dcab6c'), (0.44, '#a8763e'), (1.0, '#6b4520')]
    else:
        sc = [(0.0, '#5a646f'), (0.55, '#3c444f'), (1.0, '#1a2028')]
        tc = [(0.0, '#c2ccdb'), (0.42, '#818b9a'), (1.0, '#404a58')]
    th = r * 0.34
    ps(img, lgr(W, (0, cy - r * SQ), (0, cy + r * SQ + th), sc),
       me(W, cx, cy + th * 0.5, r, r * SQ))
    d.ellipse([cx - r, cy - r * SQ, cx + r, cy + r * SQ + th * 0.9],
              outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - r * SQ * 0.18, r * 1.4, tc), me(W, cx, cy, r, r * SQ))
    d.ellipse([cx - r, cy - r * SQ, cx + r, cy + r * SQ], outline=R(C_LINE), width=int(OL))
    return img


def crystal(img, W, cx, cy, r, c=None, bloom=True):
    d = ImageDraw.Draw(img)
    c = c or C_CRYSTAL
    if bloom:
        img = glow(img, cx, cy, r, c, layers=4, a0=32, b=2.2)
        d = ImageDraw.Draw(img)
    n = 6
    pts = [(cx + math.cos(-math.pi / 2 + i * 2 * math.pi / n) * r,
            cy + math.sin(-math.pi / 2 + i * 2 * math.pi / n) * r * 0.96) for i in range(n)]
    ps(img, rad(W, cx, cy, r * 1.55,
                [(0.0, '#ffffff'), (0.18, '#eafbff'), (0.42, '#9ce6ff'),
                 (0.70, '#34b8ec'), (1.0, '#0a5e88')]), mp(W, pts))
    d.polygon(pts, outline=R(sh(c, 0.42)), width=int(OL * 0.75))
    d.ellipse([cx - r * 0.38, cy - r * 0.58, cx + r * 0.02, cy - r * 0.18],
              fill=(255, 255, 255, 238))
    return img


def crown(img, W, cx, cy, r):
    d = ImageDraw.Draw(img)
    body = [(cx - r, cy + r * 0.30), (cx - r * 0.86, cy - r * 0.48),
            (cx - r * 0.42, cy + r * 0.04), (cx, cy - r * 0.78),
            (cx + r * 0.42, cy + r * 0.04), (cx + r * 0.86, cy - r * 0.48),
            (cx + r, cy + r * 0.30)]
    d.polygon(body, fill=R(C_GOLD))
    d.polygon(body, outline=R(C_LINE), width=int(OL * 0.85))
    d.polygon([(cx - r, cy + r * 0.30), (cx - r * 0.86, cy - r * 0.48),
               (cx - r * 0.34, cy + r * 0.10)], fill=R(C_GOLD_LT))
    d.line([(cx - r * 1.04, cy + r * 0.32), (cx + r * 1.04, cy + r * 0.32)],
           fill=R(C_GOLD_DK), width=int(r * 0.34))
    for gx2, gy2 in [(-r * 0.86, -r * 0.58), (0, -r * 0.90), (r * 0.86, -r * 0.58)]:
        d.ellipse([cx + gx2 - r * 0.11, cy + gy2 - r * 0.11,
                   cx + gx2 + r * 0.11, cy + gy2 + r * 0.11], fill=R(C_GOLD_LT))
    d.ellipse([cx - r * 0.15, cy + r * 0.02, cx + r * 0.15, cy + r * 0.32], fill=R(C_RED_LT))
    return img


def aura(img, W, cx, cy, r, c=C_GOLD, rings=4):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(l)
    for k in range(rings):
        rr = r * (1.06 + k * 0.095)
        d.ellipse([cx - rr, cy - rr * SQ, cx + rr, cy + rr * SQ],
                  outline=R(c, 120 - k * 24), width=int(2.0 * SS))
    img.alpha_composite(bl(l, 2.2 * SS))
    return img

# -*- coding: utf-8 -*-
"""
炮塔 v7 —— 十级十种结构

修正 v5/v6：
  ① 描边 1.9px（v5 是 2.6~3.0，太粗显粗糙）
  ② 炮管只 +25%（v5 是 +56%，后期大得离谱）
  ③ 十级十种**结构**，不是同一个东西放大
  ④ 统一渲染顺序：阴影 → 底座结构 → 炮管 → 炮室(盖住炮根) → 装饰
     避免 v6 里炮室画两遍导致的破图

十级结构一览：
  1 木质三角支架      —— 临时拼装
  2 木轮炮车          —— 可移动
  3 八角石台          —— 固定工事
  4 石台 + 城垛矮墙    —— 加固炮位
  5 双层石台 + 能量水晶 —— 能量化
  6 铸铁圆筒底座       —— 金属化
  7 铸铁底座 + 复进臂   —— 专业重炮
  8 六角装甲底座 + 侧裙 —— 重装
  9 三层石台 + 红色束带 —— 精英
  10 黄金三层台 + 皇冠  —— 传说
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 6
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v6')
os.makedirs(OUT, exist_ok=True)

OL = 1.85 * SS     # 描边
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


def rad(W, cx, cy, radius, stops, lx=-0.34, ly=-0.38, sp=1.8):
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


def shadow(img, cx, cy, rx, ry, b, a=115):
    """原地叠一层柔影（必须原地！返回新对象会让调用方的画布丢掉这一层）"""
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(8, 12, 22, a))
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


# ------------------------------------------------------------------ 调色
C_METAL_HI = '#cadcf8'
C_METAL_LT = '#7aa2e2'
C_METAL = '#3e68b0'
C_METAL_DK = '#1d3459'
C_STEEL_LT = '#d2dae6'
C_STEEL = '#8e9aae'
C_STEEL_DK = '#47536a'
C_STONE_LT = '#aeb6c4'
C_STONE = '#727a8a'
C_STONE_DK = '#3e4552'
C_WOOD_LT = '#d2a066'
C_WOOD = '#9c6c3a'
C_WOOD_DK = '#5a3a18'
C_GOLD_LT = '#ffe9a0'
C_GOLD = '#dcac3c'
C_GOLD_DK = '#8a6018'
C_CRYSTAL = '#5ad0ff'
C_RED = '#d84038'
C_RED_LT = '#ff8c7c'
C_LINE = '#12161f'


# ------------------------------------------------------------------ 基础件
def oct_plinth(img, W, cx, cy, r, th, pal):
    """一层八角台"""
    d = ImageDraw.Draw(img)
    top = ng(cx, cy, r, 8)
    bot = ng(cx, cy + th, r * 0.99, 8)
    side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
    ps(img, lgr(W, (0, cy - r * SQ), (0, cy + r * SQ + th), pal['side']), mp(W, side))
    d.polygon(side, outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - r * SQ * 0.18, r * 1.45, pal['top']), mp(W, top))
    d.polygon(top, outline=R(C_LINE), width=int(OL))
    # 砖缝
    for i in range(8):
        a = i * 2 * math.pi / 8 + 0.20
        d.line([(cx + math.cos(a) * r * 0.26, cy + math.sin(a) * r * 0.26 * SQ),
                (cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92 * SQ)],
               fill=R(pal['crack'], 120), width=int(1.3 * SS))
    # 倒角
    bv = ng(cx, cy, r * 0.90, 8)
    d.line(bv + [bv[0]], fill=R(pal['bevel'], 165), width=int(1.2 * SS), joint='curve')
    return img


PAL_STONE = dict(side=[(0.0, '#5e6878'), (0.55, '#454d5b'), (1.0, '#242b36')],
                 top=[(0.0, '#d2d9e4'), (0.38, '#8e97a6'), (1.0, '#525b69')],
                 crack='#1e2530', bevel='#e2e8f2')
PAL_WOOD = dict(side=[(0.0, '#5e4018'), (0.55, '#452c10'), (1.0, '#241608')],
                top=[(0.0, '#dcab6c'), (0.42, '#a8763e'), (1.0, '#6b4520')],
                crack='#2e1c08', bevel='#e8bc84')
PAL_GOLD = dict(side=[(0.0, '#a87a20'), (0.55, '#7a5814'), (1.0, '#3e2c08')],
                top=[(0.0, '#fff2c0'), (0.38, '#dcac3c'), (1.0, '#8a6018')],
                crack='#6a4a10', bevel='#fff2c0')
PAL_IRON = dict(side=[(0.0, '#5a646f'), (0.55, '#3c444f'), (1.0, '#1a2028')],
                top=[(0.0, '#b8c2d0'), (0.40, '#78828f'), (1.0, '#3a424d')],
                crack='#1a2028', bevel='#c8d2e0')


def wood_beam(img, W, p1, p2, w):
    d = ImageDraw.Draw(img)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    px, py = -dy / L * w * 0.5, dx / L * w * 0.5
    q = [(p1[0] + px, p1[1] + py), (p2[0] + px, p2[1] + py),
         (p2[0] - px, p2[1] - py), (p1[0] - px, p1[1] - py)]
    ps(img, lgr(W, q[0], q[3], [(0.0, '#9c6c3a'), (0.40, '#7a5228'), (1.0, '#42280e')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL * 0.9))
    return img


def wood_wheel(img, W, cx, cy, r):
    d = ImageDraw.Draw(img)
    ps(img, rad(W, cx, cy, r * 1.55,
                [(0.0, '#7a5228'), (0.45, '#523414'), (1.0, '#241608')]), me(W, cx, cy, r, r * 0.94))
    d.ellipse([cx - r, cy - r * 0.94, cx + r, cy + r * 0.94], outline=R(C_LINE), width=int(OL))
    d.ellipse([cx - r * 0.66, cy - r * 0.62, cx + r * 0.66, cy + r * 0.62],
              fill=R('#c49a5e'), outline=R(C_LINE), width=int(OL * 0.8))
    for i in range(8):
        a = i * math.pi / 4 + 0.2
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r * 0.58)],
               fill=R('#8a6234'), width=int(r * 0.11))
    d.ellipse([cx - r * 0.19, cy - r * 0.18, cx + r * 0.19, cy + r * 0.18],
              fill=R(C_STEEL_DK), outline=R(C_LINE), width=int(OL * 0.7))
    d.ellipse([cx - r * 0.09, cy - r * 0.09, cx + r * 0.02, cy + r * 0.01],
              fill=R(C_STEEL_LT, 205))
    return img


def rivets(img, W, pts, r, c=None):
    d = ImageDraw.Draw(img)
    c = c or C_STEEL_LT
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=R(sh(c, 0.55)))
        d.ellipse([x - r * 0.88, y - r * 0.88, x + r * 0.88, y + r * 0.88], fill=R(c))
        d.ellipse([x - r * 0.40, y - r * 0.42, x + r * 0.36, y + r * 0.30], fill=R(sh(c, 1.5)))
        d.ellipse([x - r, y - r, x + r, y + r], outline=R(C_LINE, 130), width=int(0.7 * SS))
    return img


def gear(img, W, cx, cy, r, teeth, c=None):
    d = ImageDraw.Draw(img)
    c = c or C_STEEL
    pts = []
    n = teeth * 2
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r if i % 2 == 0 else r * 0.72
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.92))
    d.polygon(pts, fill=R(sh(c, 0.80)))
    d.line(pts + [pts[0]], fill=R(C_LINE, 185), width=int(OL * 0.7), joint='curve')
    d.ellipse([cx - r * 0.60, cy - r * 0.55, cx + r * 0.60, cy + r * 0.55], fill=R(c))
    d.ellipse([cx - r * 0.46, cy - r * 0.42, cx + r * 0.20, cy + r * 0.12], fill=R(sh(c, 1.45), 160))
    d.ellipse([cx - r * 0.22, cy - r * 0.20, cx + r * 0.22, cy + r * 0.20], fill=R(hx('#0e1218')))
    return img


def crystal(img, W, cx, cy, r, c=None, bloom=True):
    d = ImageDraw.Draw(img)
    c = c or C_CRYSTAL
    if bloom:
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(4):
            rr = r * (2.0 - k * 0.40)
            gd.ellipse([cx - rr, cy - rr * 0.96, cx + rr, cy + rr * 0.96], fill=R(c, 32 + k * 26))
        img.alpha_composite(bl(gl, 2.2 * SS))
        d = ImageDraw.Draw(img)
    n = 6
    pts = [(cx + math.cos(-math.pi / 2 + i * 2 * math.pi / n) * r,
            cy + math.sin(-math.pi / 2 + i * 2 * math.pi / n) * r * 0.96) for i in range(n)]
    ps(img, rad(W, cx, cy, r * 1.55,
                [(0.0, '#ffffff'), (0.16, '#eafbff'), (0.40, '#9ce6ff'),
                 (0.68, '#34b8ec'), (1.0, '#0a5e88')]), mp(W, pts))
    d.polygon(pts, outline=R(sh(c, 0.42)), width=int(OL * 0.75))
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92 * 0.96)],
               fill=R(sh(c, 1.5), 95), width=int(1.0 * SS))
    d.ellipse([cx - r * 0.40, cy - r * 0.60, cx + r * 0.02, cy - r * 0.18], fill=(255, 255, 255, 240))
    d.ellipse([cx - r * 0.24, cy - r * 0.46, cx - r * 0.06, cy - r * 0.28], fill=(255, 255, 255, 255))
    return img


def barrel(img, W, cx, cy, ang, blen, bw, muzzle=0, bands=2):
    """炮管。从 (cx,cy) 沿 ang 伸出"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = bw * 0.5

    s = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(s).line([(cx + hw * 0.3, cy + hw * 0.85),
                            (cx + ux * blen + hw * 0.3, cy + uy * blen + hw * 0.85)],
                           fill=(6, 10, 20, 78), width=int(hw * 1.85))
    img.alpha_composite(bl(s, 2.4 * SS))
    d = ImageDraw.Draw(img)

    q = [(cx + px * hw, cy + py * hw),
         (cx + ux * blen + px * hw, cy + uy * blen + py * hw),
         (cx + ux * blen - px * hw, cy + uy * blen - py * hw),
         (cx - px * hw, cy - py * hw)]
    ps(img, lgr(W, q[0], q[3],
                [(0.0, '#101e33'), (0.18, '#4a76be'), (0.38, '#bcd4f8'),
                 (0.58, '#7aa4e4'), (0.80, '#3560a8'), (1.0, '#0d1a2c')]), mp(W, q))
    d.polygon(q, outline=R(C_LINE), width=int(OL))

    for i in range(bands):
        t = (i + 1) / (bands + 1)
        bx, by = cx + ux * blen * t, cy + uy * blen * t
        bww = hw * 1.13
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(C_STEEL_DK), width=int(hw * 0.28))
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(C_STEEL), width=int(hw * 0.18))
        d.line([(bx - px * bww * 0.56, by - py * bww * 0.56),
                (bx - px * bww * 0.12, by - py * bww * 0.12)],
               fill=R(C_STEEL_LT, 195), width=int(hw * 0.06))

    if muzzle > 0:
        tx, ty = cx + ux * blen, cy + uy * blen
        ml = hw * (0.78 if muzzle == 1 else 0.96)
        mo = hw * (1.20 if muzzle == 1 else 1.34)
        q2 = [(tx + px * mo, ty + py * mo),
              (tx + ux * ml + px * mo, ty + uy * ml + py * mo),
              (tx + ux * ml - px * mo, ty + uy * ml - py * mo),
              (tx - px * mo, ty - py * mo)]
        ps(img, lgr(W, q2[0], q2[3],
                    [(0.0, '#0d131c'), (0.20, '#525c70'), (0.42, '#d2dae6'),
                     (0.66, '#6a7488'), (1.0, '#151b26')]), mp(W, q2))
        d.polygon(q2, outline=R(C_LINE), width=int(OL))
        for gk in (0.30, 0.68):
            gx, gy = tx + ux * ml * gk, ty + uy * ml * gk
            d.line([(gx + px * mo * 0.96, gy + py * mo * 0.96),
                    (gx - px * mo * 0.96, gy - py * mo * 0.96)],
                   fill=R(C_STEEL_DK, 185), width=int(hw * 0.085))
        mx0, my0 = tx + ux * ml * 0.92, ty + uy * ml * 0.92
        hr = hw * 0.78
        d.ellipse([mx0 - hr * 1.00, my0 - hr * 0.92, mx0 + hr * 1.00, my0 + hr * 0.92],
                  fill=R(hx('#0b0f15')))
        d.ellipse([mx0 - hr * 0.72, my0 - hr * 0.66, mx0 + hr * 0.72, my0 + hr * 0.66],
                  fill=R(hx('#04060a')))
        d.arc([mx0 - hr * 1.00, my0 - hr * 0.92, mx0 + hr * 1.00, my0 + hr * 0.92],
              195, 335, fill=R(C_STEEL_LT, 205), width=int(hw * 0.12))

    hi = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hi).line([(cx + px * hw * 0.50, cy + py * hw * 0.50),
                             (cx + ux * blen * 0.90 + px * hw * 0.50,
                              cy + uy * blen * 0.90 + py * hw * 0.50)],
                            fill=(255, 255, 255, 130), width=int(hw * 0.20))
    img.alpha_composite(bl(hi, 1.0 * SS))
    return img


def dome(img, W, cx, cy, rt, pal=None, lid=True):
    """半球形炮室（会盖住炮管根部）"""
    d = ImageDraw.Draw(img)
    pal = pal or 'blue'
    if pal == 'blue':
        side_c = [(0.0, '#4772bc'), (0.45, '#27477c'), (1.0, '#101f38')]
        top_c = [(0.0, '#dbeafc'), (0.24, '#8fb4f0'), (0.60, '#3d68b2'), (1.0, '#16294a')]
        hi_c = (255, 255, 255, 170)
    elif pal == 'iron':
        side_c = [(0.0, '#4a5a74'), (0.45, '#2a3648'), (1.0, '#101722')]
        top_c = [(0.0, '#c8d4e4'), (0.26, '#8a96a8'), (0.64, '#48525f'), (1.0, '#1c222c')]
        hi_c = (255, 255, 255, 165)
    else:   # gold-trim
        side_c = [(0.0, '#4a76be'), (0.45, '#27477c'), (1.0, '#101f38')]
        top_c = [(0.0, '#f0f6ff'), (0.22, '#a8c2ec'), (0.58, '#3e64ac'), (1.0, '#152540')]
        hi_c = (255, 255, 255, 190)

    # AO
    img = shadow(img, cx, cy + rt * 0.66, rt * 1.14, rt * 0.30, 2.8 * SS, 130)
    d = ImageDraw.Draw(img)

    ps(img, rad(W, cx, cy + rt * 0.22, rt * 1.20, side_c), me(W, cx, cy + rt * 0.22, rt, rt * 0.78))
    d.ellipse([cx - rt, cy + rt * 0.22 - rt * 0.78, cx + rt, cy + rt * 0.22 + rt * 0.78],
              outline=R(C_LINE), width=int(OL))

    ps(img, rad(W, cx, cy - rt * 0.14, rt * 1.28, top_c), me(W, cx, cy - rt * 0.14, rt, rt * 0.76))
    d.ellipse([cx - rt, cy - rt * 0.14 - rt * 0.76, cx + rt, cy - rt * 0.14 + rt * 0.76],
              outline=R(C_LINE), width=int(OL))

    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - rt * 0.64, cy - rt * 0.70,
                                cx - rt * 0.02, cy - rt * 0.18], fill=hi_c)
    img.alpha_composite(bl(hl, 2.2 * SS))
    return img


def crown_icon(img, W, cx, cy, r):
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


# ------------------------------------------------------------------ 十级底座
def base_lv1(img, W, cx, cy, S):
    """木质三角支架"""
    rb = S * 0.215
    img = shadow(img, cx, cy + rb * 0.80, rb * 1.22, rb * 0.34, 3.4 * SS, 110)
    # 三腿
    wood_beam(img, W, (cx - rb * 0.94, cy + rb * 0.62), (cx - rb * 0.42, cy - rb * 0.30), W * 0.030)
    wood_beam(img, W, (cx + rb * 0.94, cy + rb * 0.62), (cx + rb * 0.42, cy - rb * 0.30), W * 0.030)
    wood_beam(img, W, (cx, cy + rb * 0.74), (cx, cy - rb * 0.30), W * 0.026)
    # 横梁
    wood_beam(img, W, (cx - rb * 0.56, cy - rb * 0.32), (cx + rb * 0.56, cy - rb * 0.32), W * 0.032)
    # 绳索
    d = ImageDraw.Draw(img)
    for sx in (-0.34, 0.34):
        for k in range(2):
            d.line([(cx + rb * sx - W * 0.012, cy - rb * 0.40 + k * W * 0.010),
                    (cx + rb * sx + W * 0.012, cy - rb * 0.26 + k * W * 0.010)],
                   fill=R(hx('#d8c088')), width=int(1.6 * SS))
    return cx, cy - rb * 0.44, rb


def base_lv2(img, W, cx, cy, S):
    """木轮炮车"""
    rb = S * 0.235
    img = shadow(img, cx, cy + rb * 0.78, rb * 1.30, rb * 0.34, 3.6 * SS, 110)
    # 车板
    oct_plinth(img, W, cx, cy - rb * 0.10, rb * 0.90, W * 0.052, PAL_WOOD)
    # 轮子
    wood_wheel(img, W, cx - rb * 0.92, cy + rb * 0.34, S * 0.072)
    wood_wheel(img, W, cx + rb * 0.92, cy + rb * 0.34, S * 0.072)
    # 车辕
    d = ImageDraw.Draw(img)
    d.line([(cx - rb * 0.44, cy + rb * 0.22), (cx - rb * 1.10, cy + rb * 0.30)],
           fill=R(hx('#5e4018')), width=int(W * 0.013))
    return cx, cy - rb * 0.44, rb


def base_lv3(img, W, cx, cy, S):
    """单层八角石台"""
    rb = S * 0.275
    img = shadow(img, cx, cy + rb * SQ * 0.86, rb * 1.04, rb * SQ * 0.38, 4.0 * SS, 115)
    oct_plinth(img, W, cx, cy, rb, W * 0.078, PAL_STONE)
    return cx, cy - rb * SQ * 0.92, rb


def base_lv4(img, W, cx, cy, S):
    """石台 + 三面城垛矮墙"""
    rb = S * 0.290
    img = shadow(img, cx, cy + rb * SQ * 0.86, rb * 1.06, rb * SQ * 0.38, 4.0 * SS, 115)
    oct_plinth(img, W, cx, cy, rb, W * 0.078, PAL_STONE)

    d = ImageDraw.Draw(img)
    wh = S * 0.070
    wy = cy - rb * SQ * 0.84
    for sx in (-1, 0, 1):
        wx = cx + sx * rb * 0.60
        ww = rb * 0.40
        y0 = wy - (wh * 0.46 if sx == 0 else 0) + (wh * 0.10 if sx else 0)
        box = [(wx - ww * 0.5, y0), (wx + ww * 0.5, y0),
               (wx + ww * 0.5, y0 + wh * 1.5), (wx - ww * 0.5, y0 + wh * 1.5)]
        ps(img, rad(W, wx, y0, ww * 0.85,
                    [(0.0, '#bcc4d2'), (0.40, '#78808f'), (1.0, '#404855')]), mp(W, box))
        d.polygon(box, outline=R(C_LINE), width=int(OL))
        for k2 in range(3):
            tx = box[0][0] + (box[1][0] - box[0][0]) * (k2 + 0.5) / 3
            d.rectangle([tx - ww * 0.075, y0 - wh * 0.42, tx + ww * 0.075, y0 + wh * 0.04],
                        fill=R('#98a0b0'), outline=R(C_LINE), width=int(OL * 0.65))
    return cx, cy - rb * SQ * 0.94, rb


def base_lv5(img, W, cx, cy, S):
    """双层石台 + 金饰带"""
    rb = S * 0.290
    img = shadow(img, cx, cy + rb * SQ * 0.88, rb * 1.06, rb * SQ * 0.40, 4.2 * SS, 115)
    oct_plinth(img, W, cx, cy, rb, W * 0.076, PAL_STONE)
    r2 = rb * 0.845
    cy2 = cy - W * 0.022
    oct_plinth(img, W, cx, cy2, r2, W * 0.048, PAL_STONE)
    d = ImageDraw.Draw(img)
    b = ng(cx, cy2 + W * 0.004, r2 * 1.008, 8)
    d.line(b + [b[0]], fill=R(C_GOLD_DK), width=int(2.4 * SS), joint='curve')
    d.line(b + [b[0]], fill=R(C_GOLD), width=int(1.6 * SS), joint='curve')
    return cx, cy2 - r2 * SQ * 0.94, r2


def base_lv6(img, W, cx, cy, S):
    """铸铁圆盘底座"""
    rb = S * 0.290
    img = shadow(img, cx, cy + rb * SQ * 0.92, rb * 1.06, rb * SQ * 0.40, 4.2 * SS, 115)
    d = ImageDraw.Draw(img)
    th = W * 0.072
    ps(img, lgr(W, (0, cy - rb * SQ), (0, cy + rb * SQ + th), PAL_IRON['side']),
       me(W, cx, cy + th * 0.5, rb, rb * SQ))
    d.ellipse([cx - rb, cy - rb * SQ, cx + rb, cy + rb * SQ + th * 0.9],
              outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - rb * SQ * 0.18, rb * 1.42, PAL_IRON['top']),
       me(W, cx, cy, rb, rb * SQ))
    d.ellipse([cx - rb, cy - rb * SQ, cx + rb, cy + rb * SQ],
              outline=R(C_LINE), width=int(OL))
    # 环形加强筋
    for rr in (0.52, 0.80):
        d.ellipse([cx - rb * rr, cy - rb * rr * SQ, cx + rb * rr, cy + rb * rr * SQ],
                  outline=R(hx('#1a2028'), 130), width=int(1.4 * SS))
    pts = []
    for i in range(12):
        a = i * math.pi / 6 + 0.15
        pts.append((cx + math.cos(a) * rb * 0.90, cy + math.sin(a) * rb * 0.90 * SQ))
    rivets(img, W, pts, S * 0.0110)
    return cx, cy - rb * SQ * 0.96, rb


def base_lv7(img, W, cx, cy, S):
    """铸铁底座 + 双侧复进臂"""
    ax, ay, rb = base_lv6(img, W, cx, cy, S)
    # 复进臂在半高处，由 render 在处理炮管后再画（见 draw_arms）
    return ax, ay, rb


def base_lv8(img, W, cx, cy, S):
    """六角装甲底座 + 侧裙板"""
    rb = S * 0.300
    img = shadow(img, cx, cy + rb * SQ * 0.94, rb * 1.08, rb * SQ * 0.42, 4.4 * SS, 120)
    d = ImageDraw.Draw(img)
    th = W * 0.080
    top = ng(cx, cy, rb, 6, rot=0)
    bot = ng(cx, cy + th, rb * 0.99, 6, rot=0)
    side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
    ps(img, lgr(W, (0, cy - rb * SQ), (0, cy + rb * SQ + th), PAL_IRON['side']), mp(W, side))
    d.polygon(side, outline=R(C_LINE), width=int(OL))
    ps(img, rad(W, cx, cy - rb * SQ * 0.18, rb * 1.45, PAL_IRON['top']), mp(W, top))
    d.polygon(top, outline=R(C_LINE), width=int(OL))

    # 侧裙板
    for s in (-1, 1):
        sx = cx + s * rb * 0.94
        q = [(sx, cy - rb * SQ * 0.62),
             (sx + s * S * 0.068, cy - rb * SQ * 0.30),
             (sx + s * S * 0.068, cy + rb * SQ * 0.56),
             (sx, cy + rb * SQ * 0.66)]
        ps(img, lgr(W, q[0], q[1],
                    [(0.0, '#9aa4b6'), (0.45, '#5a6474'), (1.0, '#262e3a')]), mp(W, q))
        d.polygon(q, outline=R(C_LINE), width=int(OL))
        for k in (0.28, 0.64):
            bx = q[0][0] + (q[3][0] - q[0][0]) * k
            by = q[0][1] + (q[3][1] - q[0][1]) * k
            d.ellipse([bx - S * 0.009, by - S * 0.009, bx + S * 0.009, by + S * 0.009],
                      fill=R(C_GOLD))
    pts = []
    for i in range(6):
        a = -math.pi / 2 + i * math.pi / 3
        pts.append((cx + math.cos(a) * rb * 0.78, cy + math.sin(a) * rb * 0.78 * SQ))
    rivets(img, W, pts, S * 0.0105)
    return cx, cy - rb * SQ * 0.96, rb


def base_lv9(img, W, cx, cy, S):
    """三层石台 + 两道红色束带"""
    rb = S * 0.300
    img = shadow(img, cx, cy + rb * SQ * 0.92, rb * 1.10, rb * SQ * 0.42, 4.6 * SS, 120)
    oct_plinth(img, W, cx, cy, rb, W * 0.074, PAL_STONE)
    d = ImageDraw.Draw(img)
    b1 = ng(cx, cy + W * 0.004, rb * 1.006, 8)
    d.line(b1 + [b1[0]], fill=R(sh(C_RED, 0.70)), width=int(2.8 * SS), joint='curve')
    d.line(b1 + [b1[0]], fill=R(C_RED), width=int(2.0 * SS), joint='curve')

    r2 = rb * 0.845
    cy2 = cy - W * 0.021
    oct_plinth(img, W, cx, cy2, r2, W * 0.046, PAL_STONE)
    d = ImageDraw.Draw(img)
    b2 = ng(cx, cy2 + W * 0.003, r2 * 1.008, 8)
    d.line(b2 + [b2[0]], fill=R(sh(C_RED, 0.70)), width=int(2.4 * SS), joint='curve')
    d.line(b2 + [b2[0]], fill=R(C_RED), width=int(1.7 * SS), joint='curve')
    return cx, cy2 - r2 * SQ * 0.94, r2


def base_lv10(img, W, cx, cy, S):
    """黄金三层台 + 外光环"""
    rb = S * 0.310
    # 光环
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for k in range(4):
        kk = 1.08 + k * 0.10
        gd.ellipse([cx - rb * kk, cy + rb * SQ * 0.30 - rb * SQ * kk,
                    cx + rb * kk, cy + rb * SQ * 0.30 + rb * SQ * kk],
                   outline=R(C_GOLD, 125 - k * 26), width=int(2.0 * SS))
    img.alpha_composite(bl(gl, 2.2 * SS))

    img = shadow(img, cx, cy + rb * SQ * 0.96, rb * 1.12, rb * SQ * 0.44, 4.8 * SS, 125)
    oct_plinth(img, W, cx, cy, rb, W * 0.068, PAL_GOLD)
    r2 = rb * 0.845
    cy2 = cy - W * 0.019
    oct_plinth(img, W, cx, cy2, r2, W * 0.044, PAL_GOLD)
    r3 = r2 * 0.845
    cy3 = cy2 - W * 0.014
    oct_plinth(img, W, cx, cy3, r3, W * 0.030, PAL_GOLD)
    return cx, cy3 - r3 * SQ * 0.96, r3


BASES = [base_lv1, base_lv2, base_lv3, base_lv4, base_lv5,
         base_lv6, base_lv7, base_lv8, base_lv9, base_lv10]


# ------------------------------------------------------------------ 炮室规格
# (炮室半径系数, 炮管长系数, 炮管粗系数, 制退器, 铁箍数, 炮室材质)
TURRET_SPEC = [
    (0.085, 0.190, 0.052, 0, 1, 'iron'),    # 1 小
    (0.098, 0.215, 0.058, 1, 2, 'iron'),    # 2
    (0.115, 0.245, 0.066, 1, 2, 'iron'),    # 3
    (0.122, 0.255, 0.070, 1, 2, 'blue'),    # 4
    (0.130, 0.262, 0.072, 1, 2, 'blue'),    # 5
    (0.136, 0.268, 0.074, 1, 3, 'iron'),    # 6
    (0.140, 0.276, 0.076, 2, 3, 'iron'),    # 7
    (0.144, 0.280, 0.078, 2, 3, 'blue'),    # 8
    (0.150, 0.286, 0.080, 2, 3, 'blue'),    # 9
    (0.156, 0.292, 0.082, 2, 3, 'gold'),    # 10
]


def render(level, size=256, variant=None):
    """variant: None | 'twin' | 'big'"""
    W = size * SS
    img = canvas(W)
    S = W
    cx = W * 0.50
    cy = W * 0.615

    # ① 底座结构 → 得到炮管根锚点
    ax, ay, rb = BASES[level - 1](img, W, cx, cy, S)

    rt_k, bl_k, bw_k, muzzle, bands, mat = TURRET_SPEC[level - 1]
    rt = S * rt_k
    blen = S * bl_k
    bw = S * bw_k
    ang = math.radians(-31)

    # ② 复进臂（Lv7，画在炮管下面）—— 做成明显的液压缸
    if level == 7:
        d = ImageDraw.Draw(img)
        ux, uy = math.cos(ang), math.sin(ang)
        px, py = -uy, ux
        for s in (-1, 1):
            x1 = ax + px * s * rt * 1.10
            y1 = ay + py * s * rt * 1.10 + rt * 0.20
            x2 = x1 + ux * S * 0.140
            y2 = y1 + uy * S * 0.140
            aw = S * 0.022
            # 缸筒（圆头矩形）
            q = [(x1 + px * aw, y1 + py * aw), (x2 + px * aw, y2 + py * aw),
                 (x2 - px * aw, y2 - py * aw), (x1 - px * aw, y1 - py * aw)]
            ps(img, lgr(W, q[0], q[3],
                        [(0.0, '#1a2634'), (0.24, '#66748a'), (0.48, '#c8d4e6'),
                         (0.72, '#4a5568'), (1.0, '#1d2530')]), mp(W, q))
            d.polygon(q, outline=R(C_LINE), width=int(OL * 0.85))
            # 两端圆头
            for (ex, ey) in ((x1, y1), (x2, y2)):
                d.ellipse([ex - aw, ey - aw, ex + aw, ey + aw],
                          fill=R(sh(C_STEEL, 0.92)), outline=R(C_LINE),
                          width=int(OL * 0.7))
            # 液压杆
            d.line([(x1, y1), (x2, y2)], fill=R(C_STEEL_LT, 215), width=int(aw * 0.50))
            # 活塞环
            for tk in (0.20, 0.46, 0.72):
                gx = x1 + (x2 - x1) * tk
                gy = y1 + (y2 - y1) * tk
                d.line([(gx + px * aw * 1.06, gy + py * aw * 1.06),
                        (gx - px * aw * 1.06, gy - py * aw * 1.06)],
                       fill=R(C_STEEL_DK), width=int(aw * 0.22))

    # ③ 炮管
    bx0 = ax + math.cos(ang) * rt * 0.24
    by0 = ay + math.sin(ang) * rt * 0.24
    if variant == 'twin':
        off = bw * 0.62
        for s in (-1, 1):
            ox = -math.sin(ang) * off * s
            oy = math.cos(ang) * off * s
            barrel(img, W, bx0 + ox * 1.6, by0 + oy * 1.6, ang, blen * 0.90,
                   bw * 0.78, 1, 2)
    elif variant == 'big':
        barrel(img, W, bx0, by0, ang, blen * 0.94, bw * 1.35, 2, 3)
    else:
        barrel(img, W, bx0, by0, ang, blen, bw, muzzle, bands)

    # ④ 炮室（盖住炮管根部）
    if level == 8:
        # 六角装甲炮塔（带明显切面）
        d0 = ImageDraw.Draw(img)
        hexr = rt * 1.06
        hp = ng(ax, ay + rt * 0.16, hexr, 6, sq=0.78, rot=0)
        ps(img, rad(W, ax, ay, hexr * 1.55,
                    [(0.0, '#e2f0ff'), (0.22, '#96baee'), (0.58, '#3c66ac'), (1.0, '#14263c')]),
           mp(W, hp))
        d0.polygon(hp, outline=R(C_LINE), width=int(OL))
        # 顶面切面高光（左上两块）
        d0.polygon([hp[4], hp[5], (ax, ay + rt * 0.10)], fill=R(sh(C_METAL_LT, 1.30), 190))
        d0.polygon([hp[5], hp[0], (ax, ay + rt * 0.10)], fill=R(sh(C_METAL_LT, 1.10), 150))
        # 侧面切面阴影（右下两块）
        d0.polygon([hp[1], hp[2], (ax, ay + rt * 0.16)], fill=R(sh(C_METAL_DK, 1.05), 130))
        # 棱线
        for idx in range(6):
            d0.line([(ax, ay + rt * 0.14), hp[idx]], fill=R(C_METAL_DK, 110),
                    width=int(1.5 * SS))
        pts = []
        for i in range(6):
            a = -math.pi / 2 + i * math.pi / 3
            pts.append((ax + math.cos(a) * hexr * 0.70, ay + rt * 0.08 + math.sin(a) * hexr * 0.56))
        rivets(img, W, pts, S * 0.0100)
    else:
        img = dome(img, W, ax, ay, rt, mat)

    # ⑤ 装饰
    d = ImageDraw.Draw(img)
    if level >= 3:
        # 炮室铆钉
        n = 5 if level < 6 else (7 if level < 9 else 9)
        pts = []
        for i in range(n):
            a = math.pi * (1.06 + i * 0.88 / n)
            pts.append((ax + math.cos(a) * rt * 0.80, ay + math.sin(a) * rt * 0.80 * 0.74))
        rivets(img, W, pts, S * 0.0098, C_GOLD if level >= 10 else C_STEEL_LT)

    if level >= 4:
        gear(img, W, cx - rb * 0.66, cy + rb * SQ * 0.44, S * 0.032, 7,
             C_GOLD if level >= 9 else C_STEEL)
        gear(img, W, cx + rb * 0.66, cy + rb * SQ * 0.44, S * 0.027, 6,
             C_GOLD if level >= 9 else C_STEEL)

    if level >= 5:
        cr = rt * 0.40
        cc = C_GOLD_LT if level >= 10 else C_CRYSTAL
        crystal(img, W, ax - rt * 0.10, ay + rt * 0.46, cr, cc)

    if level >= 9:
        crystal(img, W, ax - rt * 0.72, ay - rt * 0.44, S * 0.017, C_RED, bloom=False)
        crystal(img, W, ax + rt * 0.72, ay - rt * 0.44, S * 0.017, C_RED, bloom=False)

    if level >= 10:
        crown_icon(img, W, ax, ay - rt * 1.32, S * 0.050)

    img = grain(img, 2)
    return img.resize((size, size), Image.LANCZOS)


def export_all(size=256):
    for lv in range(1, 11):
        render(lv, size).save(os.path.join(OUT, f'cannon_lv{lv:02d}.png'))
    for lv in (5, 8, 10):
        render(lv, size, 'twin').save(os.path.join(OUT, f'cannon_twin_lv{lv:02d}.png'))
        render(lv, size, 'big').save(os.path.join(OUT, f'cannon_big_lv{lv:02d}.png'))
    print('exported', os.path.abspath(OUT))


if __name__ == '__main__':
    export_all()

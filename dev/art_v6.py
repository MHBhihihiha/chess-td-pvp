# -*- coding: utf-8 -*-
"""
炮塔 / 气球兵 v6 —— 十级各自不同的结构造型

修正 v5 的三个问题：
  ① 线条太粗（v5 用 2.6~3.0px 描边 → 现在 1.7~2.0px，更精致）
  ② 炮管越升越大（v5 炮管粗细 +56% → 现在只 +25%，靠**结构**体现升级）
  ③ 十级只有几种造型（v5 只是"同一个东西放大" → 现在十级十种结构）

十级结构：
  Lv1  木质三角支架小炮        —— 临时拼装
  Lv2  木轮炮车                —— 可以推着走
  Lv3  八角石台炮座            —— 固定工事
  Lv4  石台 + 三面矮墙城垛      —— 加固炮位
  Lv5  石台 + 蓝色能量水晶      —— 能量化
  Lv6  铸铁圆筒转塔            —— 从石造升级为金属造
  Lv7  转塔 + 双侧液压复进臂    —— 专业重炮
  Lv8  六角斜面装甲塔 + 侧裙板   —— 重装
  Lv9  攻城炮垒 + 红色束带      —— 精英
  Lv10 传说王炮 + 皇冠 + 光环   —— 满级
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 6                      # 更高超采样 → 线条更细腻
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v6')
os.makedirs(OUT, exist_ok=True)

OUTLINE = 1.9 * SS          # 统一描边粗细（v5 是 2.6~3.0，现在更细）
SQ = 0.62


# ================================================================= 基础工具
def hx(h):
    if isinstance(h, (tuple, list)):
        return tuple(int(v) for v in h[:3])
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, f):
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


def blur(img, r):
    return img.filter(ImageFilter.GaussianBlur(r))


def m_poly(W, pts):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m


def m_ell(W, cx, cy, rx, ry):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return m


def radial(W, cx, cy, radius, stops, lx=-0.34, ly=-0.38, spread=1.8):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    px, py = cx + lx * radius, cy + ly * radius
    d = np.clip(np.sqrt((xx - px) ** 2 + (yy - py) ** 2) / (radius * spread), 0, 1)
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([hx(s[1]) for s in stops], dtype=np.float32)
    out = np.zeros((W, W, 4), dtype=np.uint8)
    for ch in range(3):
        out[..., ch] = np.interp(d, pos, cols[:, ch]).astype(np.uint8)
    out[..., 3] = 255
    return Image.fromarray(out, 'RGBA')


def lin(W, p1, p2, stops):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    d = np.clip(((xx - p1[0]) * dx + (yy - p1[1]) * dy) / (L * L), 0, 1)
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([hx(s[1]) for s in stops], dtype=np.float32)
    out = np.zeros((W, W, 4), dtype=np.uint8)
    for ch in range(3):
        out[..., ch] = np.interp(d, pos, cols[:, ch]).astype(np.uint8)
    out[..., 3] = 255
    return Image.fromarray(out, 'RGBA')


def paste(img, g, mask):
    img.paste(g, (0, 0), mask)
    return img


def shadow(img, cx, cy, rx, ry, bl, alpha=115):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(8, 12, 22, alpha))
    return Image.alpha_composite(img, blur(l, bl))


def grain(img, s=2):
    """非常轻的噪点（v5 是 4，太重）"""
    W = img.size[0]
    rng = np.random.default_rng(5)
    n = rng.normal(0, s, (W, W, 1)).repeat(3, axis=2)
    a = np.clip(np.array(img, dtype=np.int16)[:, :, :3] + n.astype(np.int16), 0, 255).astype(np.uint8)
    out = Image.fromarray(a, 'RGB').convert('RGBA')
    out.putalpha(img.getchannel('A'))
    return out


def ngon(cx, cy, r, n=8, sq=SQ, rot=math.pi / 8, dy=0.0):
    return [(cx + math.cos(rot + i * 2 * math.pi / n) * r,
             cy + dy + math.sin(rot + i * 2 * math.pi / n) * r * sq) for i in range(n)]


# ================================================================= 调色
class P:
    metal_hi = hx('#c8dcf8')
    metal_lt = hx('#7aa2e2')
    metal = hx('#3e68b0')
    metal_dk = hx('#1d3459')
    steel_lt = hx('#d2dae6')
    steel = hx('#8e9aae')
    steel_dk = hx('#47536a')
    stone_lt = hx('#a8b0be')
    stone = hx('#6e7686')
    stone_dk = hx('#3c4350')
    wood_lt = hx('#d2a066')
    wood = hx('#9c6c3a')
    wood_dk = hx('#5a3a18')
    gold_lt = hx('#ffe9a0')
    gold = hx('#dcac3c')
    gold_dk = hx('#8a6018')
    leather = hx('#5e381e')
    leather_lt = hx('#8e5a34')
    crystal = hx('#5ad0ff')
    fire = hx('#ff934a')
    red = hx('#d84038')
    red_lt = hx('#ff8c7c')
    line = hx('#12161f')


# ================================================================= 部件
def stone_plinth(img, W, cx, cy, rb, tiers=2, th_scale=1.0):
    """八角石台（单层或双层），返回上层半径与上层中心"""
    d = ImageDraw.Draw(img)
    cur_r = rb
    cur_y = cy
    for t in range(tiers):
        th = W * 0.082 * th_scale * (1.0 if t == 0 else 0.60)
        top = ngon(cx, cur_y, cur_r, 8)
        bot = ngon(cx, cur_y + th, cur_r * 0.99, 8)
        side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
        paste(img, lin(W, (0, cur_y - cur_r * SQ), (0, cur_y + cur_r * SQ + th),
                       [(0.0, '#4e5665'), (0.55, '#3a414d'), (1.0, '#1c222b')]), m_poly(W, side))
        d.polygon(side, outline=R(P.line), width=int(OUTLINE))

        paste(img, radial(W, cx, cur_y - cur_r * SQ * 0.2, cur_r * 1.45,
                          [(0.0, '#b8c0ce'), (0.40, '#787f90'), (1.0, '#414956')]),
              m_poly(W, top))
        d.polygon(top, outline=R(P.line), width=int(OUTLINE))

        # 砖缝（辐射）
        nseg = 8
        for i in range(nseg):
            a0 = i * 2 * math.pi / nseg + 0.20
            d.line([(cx + math.cos(a0) * cur_r * 0.26, cur_y + math.sin(a0) * cur_r * 0.26 * SQ),
                    (cx + math.cos(a0) * cur_r * 0.93, cur_y + math.sin(a0) * cur_r * 0.93 * SQ)],
                   fill=R(hx('#1a2028'), 120), width=int(1.4 * SS))

        # 倒角亮线
        bv = ngon(cx, cur_y, cur_r * 0.90, 8)
        d.line(bv + [bv[0]], fill=R(shade(P.stone_lt, 1.10), 170),
               width=int(1.3 * SS), joint='curve')

        cur_r *= 0.845
        cur_y -= th * 0.30
    return cur_r, cur_y


def wood_deck(img, W, cx, cy, rb):
    """木台（Lv1~2 用）"""
    d = ImageDraw.Draw(img)
    th = W * 0.062
    top = ngon(cx, cy, rb, 8)
    bot = ngon(cx, cy + th, rb * 0.99, 8)
    side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
    paste(img, lin(W, (0, cy - rb * SQ), (0, cy + rb * SQ + th),
                   [(0.0, '#5e4018'), (0.55, '#452c10'), (1.0, '#241608')]), m_poly(W, side))
    d.polygon(side, outline=R(P.line), width=int(OUTLINE))

    paste(img, radial(W, cx, cy - rb * SQ * 0.2, rb * 1.45,
                      [(0.0, '#dcab6c'), (0.42, '#a8763e'), (1.0, '#6b4520')]), m_poly(W, top))
    d.polygon(top, outline=R(P.line), width=int(OUTLINE))

    # 木板：横向板缝 + 每块板一条高光
    tw = 4
    for i in range(tw):
        y0 = cy - rb * SQ * 0.66 + i * (rb * SQ * 1.32 / tw)
        d.line([(cx - rb * 0.72, y0), (cx + rb * 0.72, y0)],
               fill=R(hx('#2e1c08'), 175), width=int(1.6 * SS))
        d.line([(cx - rb * 0.68, y0 + 2.4 * SS), (cx + rb * 0.68, y0 + 2.4 * SS)],
               fill=R(hx('#e8bc84'), 80), width=int(1.2 * SS))
    # 竖缝
    for i in (-1, 1):
        xx = cx + i * rb * 0.34
        d.line([(xx, cy - rb * SQ * 0.64), (xx, cy + rb * SQ * 0.64)],
               fill=R(hx('#2e1c08'), 155), width=int(1.8 * SS))
    return img


def wood_beam(img, W, p1, p2, w, dark=False):
    """木梁"""
    d = ImageDraw.Draw(img)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    px, py = -dy / L * w * 0.5, dx / L * w * 0.5
    q = [(p1[0] + px, p1[1] + py), (p2[0] + px, p2[1] + py),
         (p2[0] - px, p2[1] - py), (p1[0] - px, p1[1] - py)]
    g = lin(W, (p1[0] + px, p1[1] + py), (p1[0] - px, p1[1] - py),
            [(0.0, '#8e6234'), (0.40, '#6e4a24'), (1.0, '#3e2810')])
    paste(img, g, m_poly(W, q))
    d.polygon(q, outline=R(P.line), width=int(OUTLINE))
    return img


def wheel(img, W, cx, cy, r, spokes=8):
    """木轮"""
    d = ImageDraw.Draw(img)
    # 轮胎外圈
    m = m_ell(W, cx, cy, r, r * 0.94)
    paste(img, radial(W, cx, cy, r * 1.6,
                      [(0.0, '#6e4a24'), (0.45, '#4a3014'), (1.0, '#241608')]), m)
    d.ellipse([cx - r, cy - r * 0.94, cx + r, cy + r * 0.94],
              outline=R(P.line), width=int(OUTLINE))
    # 内圈
    d.ellipse([cx - r * 0.68, cy - r * 0.64, cx + r * 0.68, cy + r * 0.64],
              fill=R(hx('#c49a5e')))
    d.ellipse([cx - r * 0.68, cy - r * 0.64, cx + r * 0.68, cy + r * 0.64],
              outline=R(P.line), width=int(OUTLINE * 0.85))
    # 辐条
    for i in range(spokes):
        a = i * 2 * math.pi / spokes + 0.2
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.64, cy + math.sin(a) * r * 0.60)],
               fill=R(hx('#8a6234')), width=int(r * 0.10))
    # 轴心
    d.ellipse([cx - r * 0.20, cy - r * 0.19, cx + r * 0.20, cy + r * 0.19],
              fill=R(P.steel_dk), outline=R(P.line), width=int(OUTLINE * 0.7))
    d.ellipse([cx - r * 0.10, cy - r * 0.10, cx + r * 0.02, cy + r * 0.02],
              fill=R(P.steel_lt, 210))
    return img


def rivets(img, W, pts, r, c=None, outline=True):
    d = ImageDraw.Draw(img)
    c = c or P.steel_lt
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=R(shade(c, 0.55)))
        d.ellipse([x - r * 0.88, y - r * 0.88, x + r * 0.88, y + r * 0.88], fill=R(c))
        d.ellipse([x - r * 0.40, y - r * 0.42, x + r * 0.36, y + r * 0.30],
                  fill=R(shade(c, 1.5)))
        if outline:
            d.ellipse([x - r, y - r, x + r, y + r], outline=R(P.line, 140),
                      width=int(0.7 * SS))
    return img


def gear(img, W, cx, cy, r, teeth, c=None):
    d = ImageDraw.Draw(img)
    c = c or P.steel
    pts = []
    n = teeth * 2
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r if i % 2 == 0 else r * 0.72
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.92))
    d.polygon(pts, fill=R(shade(c, 0.80)))
    d.line(pts + [pts[0]], fill=R(P.line, 190), width=int(OUTLINE * 0.75), joint='curve')
    d.ellipse([cx - r * 0.60, cy - r * 0.55, cx + r * 0.60, cy + r * 0.55], fill=R(c))
    d.ellipse([cx - r * 0.46, cy - r * 0.42, cx + r * 0.20, cy + r * 0.12],
              fill=R(shade(c, 1.45), 165))
    d.ellipse([cx - r * 0.22, cy - r * 0.20, cx + r * 0.22, cy + r * 0.20],
              fill=R(hx('#0e1218')))
    return img


def crystal(img, W, cx, cy, r, c=None, bloom=True):
    d = ImageDraw.Draw(img)
    c = c or P.crystal
    if bloom:
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(4):
            rr = r * (2.0 - k * 0.40)
            gd.ellipse([cx - rr, cy - rr * 0.96, cx + rr, cy + rr * 0.96],
                       fill=R(c, 32 + k * 26))
        img.alpha_composite(blur(gl, 2.4 * SS))
        d = ImageDraw.Draw(img)
    n = 6
    pts = [(cx + math.cos(-math.pi / 2 + i * 2 * math.pi / n) * r,
            cy + math.sin(-math.pi / 2 + i * 2 * math.pi / n) * r * 0.96) for i in range(n)]
    paste(img, radial(W, cx, cy, r * 1.6,
                      [(0.0, '#ffffff'), (0.16, '#eafbff'), (0.40, '#9ce6ff'),
                       (0.68, '#34b8ec'), (1.0, '#0a5e88')]), m_poly(W, pts))
    d.polygon(pts, outline=R(shade(c, 0.42)), width=int(OUTLINE * 0.8))
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92 * 0.96)],
               fill=R(shade(c, 1.5), 100), width=int(1.0 * SS))
    d.ellipse([cx - r * 0.40, cy - r * 0.60, cx + r * 0.02, cy - r * 0.18],
              fill=(255, 255, 255, 240))
    d.ellipse([cx - r * 0.24, cy - r * 0.46, cx - r * 0.06, cy - r * 0.28],
              fill=(255, 255, 255, 255))
    return img


# ================================================================= 炮管
def barrel(img, W, cx, cy, ang, blen, bw, muzzle=0, bands=2):
    """炮管。muzzle: 0=无, 1=简单制退器, 2=加厚制退器"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = bw * 0.5

    # 投影
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).line([(cx + hw * 0.3, cy + hw * 0.8),
                             (cx + ux * blen + hw * 0.3, cy + uy * blen + hw * 0.8)],
                            fill=(6, 10, 20, 80), width=int(hw * 1.9))
    img.alpha_composite(blur(sh, 2.6 * SS))
    d = ImageDraw.Draw(img)

    q = [(cx + px * hw, cy + py * hw),
         (cx + ux * blen + px * hw, cy + uy * blen + py * hw),
         (cx + ux * blen - px * hw, cy + uy * blen - py * hw),
         (cx - px * hw, cy - py * hw)]
    paste(img, lin(W, q[0], q[3],
                   [(0.0, '#101e33'), (0.18, '#4a76be'), (0.38, '#bcd4f8'),
                    (0.58, '#7aa4e4'), (0.80, '#3560a8'), (1.0, '#0d1a2c')]),
          m_poly(W, q))
    d.polygon(q, outline=R(P.line), width=int(OUTLINE))

    # 铁箍
    for i in range(bands):
        t = (i + 1) / (bands + 1)
        bx, by = cx + ux * blen * t, cy + uy * blen * t
        bww = hw * 1.14
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(P.steel_dk), width=int(hw * 0.30))
        d.line([(bx + px * bww, by + py * bww), (bx - px * bww, by - py * bww)],
               fill=R(P.steel), width=int(hw * 0.19))
        d.line([(bx - px * bww * 0.58, by - py * bww * 0.58),
                (bx - px * bww * 0.12, by - py * bww * 0.12)],
               fill=R(P.steel_lt, 200), width=int(hw * 0.06))

    # 制退器
    if muzzle > 0:
        tx, ty = cx + ux * blen, cy + uy * blen
        ml = hw * (0.80 if muzzle == 1 else 1.00)
        mo = hw * (1.24 if muzzle == 1 else 1.40)
        q2 = [(tx + px * mo, ty + py * mo),
              (tx + ux * ml + px * mo, ty + uy * ml + py * mo),
              (tx + ux * ml - px * mo, ty + uy * ml - py * mo),
              (tx - px * mo, ty - py * mo)]
        paste(img, lin(W, q2[0], q2[3],
                       [(0.0, '#0d131c'), (0.20, '#525c70'), (0.42, '#d2dae6'),
                        (0.66, '#6a7488'), (1.0, '#151b26')]), m_poly(W, q2))
        d.polygon(q2, outline=R(P.line), width=int(OUTLINE))
        for gk in (0.30, 0.68):
            gx, gy = tx + ux * ml * gk, ty + uy * ml * gk
            d.line([(gx + px * mo * 0.97, gy + py * mo * 0.97),
                    (gx - px * mo * 0.97, gy - py * mo * 0.97)],
                   fill=R(P.steel_dk, 190), width=int(hw * 0.09))
        mx0, my0 = tx + ux * ml * 0.93, ty + uy * ml * 0.93
        hr = hw * 0.80
        d.ellipse([mx0 - hr * 1.02, my0 - hr * 0.94, mx0 + hr * 1.02, my0 + hr * 0.94],
                  fill=R(hx('#0b0f15')))
        d.ellipse([mx0 - hr * 0.74, my0 - hr * 0.68, mx0 + hr * 0.74, my0 + hr * 0.68],
                  fill=R(hx('#04060a')))
        d.arc([mx0 - hr * 1.02, my0 - hr * 0.94, mx0 + hr * 1.02, my0 + hr * 0.94],
              195, 335, fill=R(P.steel_lt, 210), width=int(hw * 0.13))

    # 顶部高光
    hi = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hi).line([(cx + px * hw * 0.52, cy + py * hw * 0.52),
                             (cx + ux * blen * 0.92 + px * hw * 0.52,
                              cy + uy * blen * 0.92 + py * hw * 0.52)],
                            fill=(255, 255, 255, 135), width=int(hw * 0.22))
    img.alpha_composite(blur(hi, 1.1 * SS))
    return img


# ================================================================= 十级造型
def lv01(img, W, cx, cy, S):
    """Lv1 木质三角支架小炮 —— 临时拼装"""
    d = ImageDraw.Draw(img)
    k = W / 256.0
    rb = S * 0.24
    img = shadow(img, cx, cy + rb * 0.62, rb * 1.02, rb * 0.30, 3.6 * SS, 110)

    # 三条木腿
    wood_beam(img, W, (cx - rb * 0.72, cy + rb * 0.34), (cx - rb * 0.30, cy - rb * 0.48), W * 0.036)
    wood_beam(img, W, (cx + rb * 0.72, cy + rb * 0.34), (cx + rb * 0.30, cy - rb * 0.48), W * 0.036)
    wood_beam(img, W, (cx, cy + rb * 0.60), (cx, cy - rb * 0.48), W * 0.030)
    # 顶部横梁
    wood_beam(img, W, (cx - rb * 0.44, cy - rb * 0.50), (cx + rb * 0.44, cy - rb * 0.50), W * 0.038)
    # 绳索捆绑
    d = ImageDraw.Draw(img)
    for sx in (-0.30, 0.30):
        d.line([(cx + rb * sx - W * 0.014, cy - rb * 0.56),
                (cx + rb * sx + W * 0.014, cy - rb * 0.42)],
               fill=R(hx('#d8c088')), width=int(2.0 * SS))
    # 小炮
    img = barrel(img, W, cx - rb * 0.10, cy - rb * 0.58, math.radians(-30),
                 S * 0.20, S * 0.056, 0, 1)
    return img


def lv02(img, W, cx, cy, S):
    """Lv2 木轮炮车 —— 可以推着走"""
    d = ImageDraw.Draw(img)
    rb = S * 0.27
    img = shadow(img, cx, cy + rb * 0.56, rb * 1.06, rb * 0.30, 3.8 * SS, 110)

    # 车板（木台，稍扁）
    img = wood_deck(img, W, cx, cy - rb * 0.14, rb * 0.86)
    # 两侧轮子
    wheel(img, W, cx - rb * 0.78, cy + rb * 0.30, S * 0.082, 8)
    wheel(img, W, cx + rb * 0.78, cy + rb * 0.30, S * 0.082, 8)
    # 车辕（前伸）
    d = ImageDraw.Draw(img)
    d.line([(cx - rb * 0.30, cy + rb * 0.10), (cx - rb * 0.96, cy + rb * 0.10)],
           fill=R(hx('#5e4018')), width=int(W * 0.016))
    # 炮身（铸铁圆筒 + 炮管）
    m = m_ell(W, cx, cy - rb * 0.30, S * 0.108, S * 0.086)
    paste(img, radial(W, cx, cy - rb * 0.32, S * 0.20,
                      [(0.0, '#7c8aa0'), (0.42, '#4e5a70'), (1.0, '#222a38')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - S * 0.108, cy - rb * 0.30 - S * 0.086,
               cx + S * 0.108, cy - rb * 0.30 + S * 0.086],
              outline=R(P.line), width=int(OUTLINE))
    # 炮管
    img = barrel(img, W, cx - S * 0.02, cy - rb * 0.34, math.radians(-30),
                 S * 0.24, S * 0.066, 1, 2)
    # 加固铁箍
    d = ImageDraw.Draw(img)
    for t in (-0.5, 0, 0.5):
        d.arc([cx - S * 0.115, cy - rb * 0.30 - S * 0.092,
               cx + S * 0.115, cy - rb * 0.30 + S * 0.092],
              math.pi * (1.0 + t * 0.28), math.pi * (1.22 + t * 0.28),
              fill=R(P.steel_dk), width=int(2.2 * SS))
    return img


def lv03(img, W, cx, cy, S):
    """Lv3 八角石台炮座 —— 固定工事"""
    d = ImageDraw.Draw(img)
    rb = S * 0.30
    img = shadow(img, cx, cy + rb * SQ * 0.80, rb * 1.02, rb * SQ * 0.36, 4.2 * SS, 115)
    r_up, cy_up = stone_plinth(img, W, cx, cy, rb, tiers=1)

    # 铸铁炮室
    rt = S * 0.128
    m = m_ell(W, cx, cy_up + rt * 0.22, rt, rt * 0.80)
    paste(img, radial(W, cx, cy_up + rt * 0.22, rt * 1.3,
                      [(0.0, '#6a7690'), (0.5, '#3e4a60'), (1.0, '#1a2130')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - rt, cy_up + rt * 0.22 - rt * 0.80,
               cx + rt, cy_up + rt * 0.22 + rt * 0.80],
              outline=R(P.line), width=int(OUTLINE))
    m = m_ell(W, cx, cy_up - rt * 0.14, rt * 0.98, rt * 0.76)
    paste(img, radial(W, cx, cy_up - rt * 0.14, rt * 1.35,
                      [(0.0, '#c2d0e2'), (0.32, '#7e8ea6'), (0.72, '#3e4a60'), (1.0, '#1c2432')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - rt * 0.98, cy_up - rt * 0.14 - rt * 0.76,
               cx + rt * 0.98, cy_up - rt * 0.14 + rt * 0.76],
              outline=R(P.line), width=int(OUTLINE))

    # 炮管
    turret_cy = cy_up - rt * 0.28
    ang = math.radians(-31)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.30, turret_cy + math.sin(ang) * rt * 0.30,
                 ang, S * 0.285, S * 0.072, 1, 2)
    # 炮室盖回（遮住炮管根部）
    d = ImageDraw.Draw(img)
    m = m_ell(W, cx, turret_cy, rt * 0.98, rt * 0.76)
    paste(img, radial(W, cx, turret_cy, rt * 1.35,
                      [(0.0, '#d0dcee'), (0.28, '#8e9eb6'), (0.66, '#45527000'[:7]), (1.0, '#1c2432')]),
          m)
    # 只重新画上半部分，避免重复描边
    d.line([(cx - rt * 0.98, turret_cy), (cx - rt * 0.72, turret_cy - rt * 0.62),
            (cx, turret_cy - rt * 0.78), (cx + rt * 0.72, turret_cy - rt * 0.62),
            (cx + rt * 0.98, turret_cy)],
           fill=R(P.line), width=int(OUTLINE), joint='curve')
    # 铆钉
    pts = []
    for i in range(6):
        a = math.pi * (1.08 + i * 0.84 / 6)
        pts.append((cx + math.cos(a) * rt * 0.80, turret_cy + math.sin(a) * rt * 0.80 * 0.74))
    rivets(img, W, pts, S * 0.011)
    return img


def lv04(img, W, cx, cy, S):
    """Lv4 石台 + 三面矮墙城垛 —— 加固炮位"""
    d = ImageDraw.Draw(img)
    rb = S * 0.315
    img = shadow(img, cx, cy + rb * SQ * 0.80, rb * 1.04, rb * SQ * 0.36, 4.2 * SS, 115)
    r_up, cy_up = stone_plinth(img, W, cx, cy, rb, tiers=1)

    # 三面矮墙（左、右、后），前面留口
    wh = S * 0.052
    ww = rb * 0.92
    wall_y = cy_up - rb * SQ * 0.72
    for sx in (-1, 0, 1):
        wx = cx + sx * ww * 0.80
        if sx == 0:
            top_y = wall_y - wh * 0.5
        else:
            top_y = wall_y + wh * 0.2
        box = [wx - ww * 0.24, top_y - wh, wx + ww * 0.24, top_y + wh * 1.6]
        m = m_poly(W, [(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])])
        paste(img, radial(W, wx, top_y, ww * 0.6,
                          [(0.0, '#b4bcCA'[:7]), (0.40, '#767e90'), (1.0, '#3a414d')]), m)
        d = ImageDraw.Draw(img)
        d.polygon([(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])],
                  outline=R(P.line), width=int(OUTLINE))
        # 城垛齿
        for k2 in range(3):
            tx = box[0] + (box[2] - box[0]) * (k2 + 0.5) / 3
            d.rectangle([tx - ww * 0.055, box[1] - wh * 0.46, tx + ww * 0.055, box[1] + wh * 0.06],
                        fill=R(hx('#8a92a4')), outline=R(P.line), width=int(OUTLINE * 0.7))

    # 炮室
    rt = S * 0.132
    turret_cy = cy_up - rt * 0.24
    ang = math.radians(-31)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.28, turret_cy + math.sin(ang) * rt * 0.28,
                 ang, S * 0.295, S * 0.076, 1, 2)
    d = ImageDraw.Draw(img)
    m = m_ell(W, cx, turret_cy, rt * 0.98, rt * 0.76)
    paste(img, radial(W, cx, turret_cy, rt * 1.35,
                      [(0.0, '#d0dcee'), (0.28, '#8e9eb6'), (0.66, '#455270'), (1.0, '#1c2432')]), m)
    d.ellipse([cx - rt * 0.98, turret_cy - rt * 0.76, cx + rt * 0.98, turret_cy + rt * 0.76],
              outline=R(P.line), width=int(OUTLINE))
    pts = []
    for i in range(7):
        a = math.pi * (1.06 + i * 0.88 / 7)
        pts.append((cx + math.cos(a) * rt * 0.80, turret_cy + math.sin(a) * rt * 0.80 * 0.74))
    rivets(img, W, pts, S * 0.011)
    # 齿轮
    gear(img, W, cx - r_up * 0.70, cy_up + r_up * SQ * 0.36, S * 0.036, 7, P.steel)
    gear(img, W, cx + r_up * 0.70, cy_up + r_up * SQ * 0.36, S * 0.031, 6, P.steel)
    return img


def lv05(img, W, cx, cy, S):
    """Lv5 石台 + 蓝色能量水晶 —— 能量化"""
    d = ImageDraw.Draw(img)
    rb = S * 0.325
    img = shadow(img, cx, cy + rb * SQ * 0.80, rb * 1.06, rb * SQ * 0.36, 4.4 * SS, 115)
    r_up, cy_up = stone_plinth(img, W, cx, cy, rb, tiers=2)

    # 底座金饰带
    band = ngon(cx, cy_up + S * 0.006, r_up * 1.005, 8)
    d = ImageDraw.Draw(img)
    d.line(band + [band[0]], fill=R(P.gold_dk), width=int(2.6 * SS), joint='curve')
    d.line(band + [band[0]], fill=R(P.gold), width=int(1.8 * SS), joint='curve')

    # 炮室（更高更圆）
    rt = S * 0.145
    turret_cy = cy_up - rt * 0.26
    ang = math.radians(-32)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.28, turret_cy + math.sin(ang) * rt * 0.28,
                 ang, S * 0.305, S * 0.078, 1, 2)
    d = ImageDraw.Draw(img)
    m = m_ell(W, cx, turret_cy, rt, rt * 0.80)
    paste(img, radial(W, cx, turret_cy, rt * 1.4,
                      [(0.0, '#d8e6f8'), (0.26, '#8eaee0'), (0.62, '#3e68b0'), (1.0, '#18293f')]), m)
    d.ellipse([cx - rt, turret_cy - rt * 0.80, cx + rt, turret_cy + rt * 0.80],
              outline=R(P.line), width=int(OUTLINE))
    # 炮室螺栓
    pts = []
    for i in range(8):
        a = math.pi * (1.04 + i * 0.92 / 8)
        pts.append((cx + math.cos(a) * rt * 0.82, turret_cy + math.sin(a) * rt * 0.82 * 0.76))
    rivets(img, W, pts, S * 0.010)
    # 能量水晶（炮室前方）
    crystal(img, W, cx - rt * 0.10, turret_cy + rt * 0.42, rt * 0.34, P.crystal)
    # 炮口能量环
    ux, uy = math.cos(ang), math.sin(ang)
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    mx = cx + math.cos(ang) * rt * 0.28 + ux * S * 0.305
    my = turret_cy + math.sin(ang) * rt * 0.28 + uy * S * 0.305
    gd = ImageDraw.Draw(gl)
    for k in range(3):
        rr = S * (0.030 - k * 0.008)
        gd.ellipse([mx - rr, my - rr, mx + rr, my + rr], fill=R(P.crystal, 70 + k * 50))
    img.alpha_composite(blur(gl, 2.4 * SS))
    return img


def lv06(img, W, cx, cy, S):
    """Lv6 铸铁圆筒转塔 —— 从石造变金属造"""
    d = ImageDraw.Draw(img)
    rb = S * 0.315
    img = shadow(img, cx, cy + rb * SQ * 0.86, rb * 1.05, rb * SQ * 0.38, 4.4 * SS, 115)

    # 圆形铸铁底盘（不是八边形了，明显区别于 Lv3~5）
    base_r = rb * 0.92
    th = W * 0.075
    m = m_ell(W, cx, cy + th * 0.5, base_r, base_r * SQ)
    paste(img, lin(W, (0, cy - base_r * SQ), (0, cy + base_r * SQ + th),
                   [(0.0, '#5a646f'), (0.5, '#3c444f'), (1.0, '#1a2028')]), m)
    d.ellipse([cx - base_r, cy - base_r * SQ, cx + base_r, cy + base_r * SQ + th * 0.9],
              outline=R(P.line), width=int(OUTLINE))
    m = m_ell(W, cx, cy, base_r, base_r * SQ)
    paste(img, radial(W, cx, cy - base_r * SQ * 0.2, base_r * 1.4,
                      [(0.0, '#b8c2d0'), (0.40, '#78828f'), (1.0, '#3a424d')]), m)
    d.ellipse([cx - base_r, cy - base_r * SQ, cx + base_r, cy + base_r * SQ],
              outline=R(P.line), width=int(OUTLINE))
    # 放射状螺栓
    pts = []
    for i in range(10):
        a = i * 2 * math.pi / 10 + 0.2
        pts.append((cx + math.cos(a) * base_r * 0.86, cy + math.sin(a) * base_r * 0.86 * SQ))
    rivets(img, W, pts, S * 0.012)

    # 圆筒炮室（比之前矮而宽 —— 铸铁铸造感）
    rt = S * 0.150
    turret_cy = cy - rt * 0.42
    ang = math.radians(-33)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.26, turret_cy + math.sin(ang) * rt * 0.26,
                 ang, S * 0.315, S * 0.080, 1, 3)
    d = ImageDraw.Draw(img)
    # 炮室侧壁
    m = m_ell(W, cx, turret_cy + rt * 0.24, rt, rt * 0.74)
    paste(img, radial(W, cx, turret_cy + rt * 0.24, rt * 1.3,
                      [(0.0, '#4a5a74'), (0.5, '#2a3648'), (1.0, '#101722')]), m)
    d.ellipse([cx - rt, turret_cy + rt * 0.24 - rt * 0.74,
               cx + rt, turret_cy + rt * 0.24 + rt * 0.74],
              outline=R(P.line), width=int(OUTLINE))
    # 顶盖
    m = m_ell(W, cx, turret_cy - rt * 0.12, rt * 0.98, rt * 0.72)
    paste(img, radial(W, cx, turret_cy - rt * 0.12, rt * 1.35,
                      [(0.0, '#c8d4e4'), (0.28, '#8a96a8'), (0.66, '#48525f'), (1.0, '#1c222c')]), m)
    d.ellipse([cx - rt * 0.98, turret_cy - rt * 0.12 - rt * 0.72,
               cx + rt * 0.98, turret_cy - rt * 0.12 + rt * 0.72],
              outline=R(P.line), width=int(OUTLINE))
    # 顶盖铆钉
    pts = []
    for i in range(8):
        a = i * 2 * math.pi / 8 + 0.4
        pts.append((cx + math.cos(a) * rt * 0.74, turret_cy - rt * 0.12 + math.sin(a) * rt * 0.74 * 0.70))
    rivets(img, W, pts, S * 0.010)
    return img


def lv07(img, W, cx, cy, S):
    """Lv7 转塔 + 双侧液压复进臂 —— 专业重炮"""
    img = lv06(img, W, cx, cy, S)   # 复用转塔底盘
    d = ImageDraw.Draw(img)
    rt = S * 0.150
    turret_cy = cy - rt * 0.42
    ang = math.radians(-33)

    # 双侧复进臂（两根短粗液压缸，沿炮管方向）
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    for s in (-1, 1):
        ax = cx + px * s * rt * 1.02
        ay = turret_cy + py * s * rt * 1.02 + rt * 0.12
        bx = ax + ux * S * 0.185
        by = ay + uy * S * 0.185
        aw = S * 0.028
        q = [(ax + px * aw, ay + py * aw), (bx + px * aw * 0.82, by + py * aw * 0.82),
             (bx - px * aw * 0.82, by - py * aw * 0.82), (ax - px * aw, ay - py * aw)]
        paste(img, lin(W, q[0], q[3],
                       [(0.0, '#1a2838'), (0.28, '#6e7c90'), (0.52, '#c8d4e4'), (1.0, '#2a3442')]),
              m_poly(W, q))
        d.polygon(q, outline=R(P.line), width=int(OUTLINE * 0.9))
        # 液压杆
        d.line([(ax, ay), (bx, by)], fill=R(P.steel_lt, 210), width=int(aw * 0.42))

    # 加厚的炮口制退器
    ang2 = ang
    bx0 = cx + math.cos(ang2) * rt * 0.26
    by0 = turret_cy + math.sin(ang2) * rt * 0.26
    img = barrel(img, W, bx0, by0, ang2, S * 0.330, S * 0.084, 2, 3)
    # 炮室顶盖重新盖住炮根
    m = m_ell(W, cx, turret_cy - rt * 0.12, rt * 0.98, rt * 0.72)
    paste(img, radial(W, cx, turret_cy - rt * 0.12, rt * 1.35,
                      [(0.0, '#c8d4e4'), (0.28, '#8a96a8'), (0.66, '#48525f'), (1.0, '#1c222c')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - rt * 0.98, turret_cy - rt * 0.12 - rt * 0.72,
               cx + rt * 0.98, turret_cy - rt * 0.12 + rt * 0.72],
              outline=R(P.line), width=int(OUTLINE))
    # 顶盖金饰环
    d.ellipse([cx - rt * 0.42, turret_cy - rt * 0.12 - rt * 0.40,
               cx + rt * 0.42, turret_cy - rt * 0.12 + rt * 0.40],
              outline=R(P.gold), width=int(2.2 * SS))
    return img


def lv08(img, W, cx, cy, S):
    """Lv8 六角斜面装甲塔 + 侧裙板 —— 重装"""
    d = ImageDraw.Draw(img)
    rb = S * 0.325
    img = shadow(img, cx, cy + rb * SQ * 0.86, rb * 1.08, rb * SQ * 0.40, 4.6 * SS, 120)

    # 六角厚底座
    base_r = rb * 0.94
    th = W * 0.082
    top = ngon(cx, cy, base_r, 6, rot=0)
    bot = ngon(cx, cy + th, base_r * 0.99, 6, rot=0)
    side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
    paste(img, lin(W, (0, cy - base_r * SQ), (0, cy + base_r * SQ + th),
                   [(0.0, '#4e5866'), (0.5, '#363e4a'), (1.0, '#171d25')]), m_poly(W, side))
    d.polygon(side, outline=R(P.line), width=int(OUTLINE))
    paste(img, radial(W, cx, cy - base_r * SQ * 0.2, base_r * 1.45,
                      [(0.0, '#bcc4d2'), (0.40, '#767e90'), (1.0, '#3e4653')]), m_poly(W, top))
    d.polygon(top, outline=R(P.line), width=int(OUTLINE))

    # 侧裙板（左右两片斜板，明显区别于 Lv7）
    for s in (-1, 1):
        sx = cx + s * base_r * 0.92
        q = [(sx, cy - base_r * SQ * 0.66),
             (sx + s * S * 0.070, cy - base_r * SQ * 0.36),
             (sx + s * S * 0.070, cy + base_r * SQ * 0.58),
             (sx, cy + base_r * SQ * 0.68)]
        paste(img, lin(W, q[0], q[1],
                       [(0.0, '#8a94a6'), (0.45, '#525c6c'), (1.0, '#242c38')]), m_poly(W, q))
        d.polygon(q, outline=R(P.line), width=int(OUTLINE))
        for k in (0.28, 0.62):
            bxx = q[0][0] + (q[3][0] - q[0][0]) * k
            byy = q[0][1] + (q[3][1] - q[0][1]) * k
            d.ellipse([bxx - S * 0.010, byy - S * 0.010,
                       bxx + S * 0.010, byy + S * 0.010], fill=R(P.gold))

    # 六角形炮塔（斜切装甲）
    rt = S * 0.152
    turret_cy = cy - rt * 0.48
    ang = math.radians(-33)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.26, turret_cy + math.sin(ang) * rt * 0.26,
                 ang, S * 0.330, S * 0.086, 2, 3)
    d = ImageDraw.Draw(img)
    # 六角塔身
    hexr = rt * 1.02
    hexp = ngon(cx, turret_cy + rt * 0.16, hexr, 6, sq=0.78, rot=0)
    paste(img, radial(W, cx, turret_cy, hexr * 1.6,
                      [(0.0, '#d4e0f0'), (0.26, '#8eaee0'), (0.62, '#3a5f9e'), (1.0, '#152640')]),
          m_poly(W, hexp))
    d.polygon(hexp, outline=R(P.line), width=int(OUTLINE))
    # 斜面高光
    d.line([hexp[4], hexp[5], hexp[0]], fill=R(P.metal_hi, 190), width=int(2.0 * SS), joint='curve')
    # 炮塔螺栓
    pts = []
    for i in range(6):
        a = -math.pi / 2 + i * 2 * math.pi / 6
        pts.append((cx + math.cos(a) * hexr * 0.74, turret_cy + rt * 0.10 + math.sin(a) * hexr * 0.60))
    rivets(img, W, pts, S * 0.011, P.steel_lt)
    return img


def lv09(img, W, cx, cy, S):
    """Lv9 攻城炮垒 + 红色束带 —— 精英"""
    d = ImageDraw.Draw(img)
    rb = S * 0.335
    img = shadow(img, cx, cy + rb * SQ * 0.88, rb * 1.10, rb * SQ * 0.40, 4.8 * SS, 120)

    # 三层台阶
    r_up, cy_up = stone_plinth(img, W, cx, cy, rb, tiers=2, th_scale=1.05)

    # 红色束带 ×2
    d = ImageDraw.Draw(img)
    for t, dy in ((0, cy), (1, cy_up)):
        rr = rb if t == 0 else r_up
        b = ngon(cx, dy + S * 0.004, rr * 1.008, 8)
        d.line(b + [b[0]], fill=R(shade(P.red, 0.72)), width=int(3.0 * SS), joint='curve')
        d.line(b + [b[0]], fill=R(P.red), width=int(2.2 * SS), joint='curve')
        d.line(b + [b[0]], fill=R(P.red_lt, 150), width=int(0.8 * SS), joint='curve')

    # 炮室（大）
    rt = S * 0.162
    turret_cy = cy_up - rt * 0.30
    ang = math.radians(-34)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.26, turret_cy + math.sin(ang) * rt * 0.26,
                 ang, S * 0.345, S * 0.090, 2, 3)
    d = ImageDraw.Draw(img)
    m = m_ell(W, cx, turret_cy, rt, rt * 0.80)
    paste(img, radial(W, cx, turret_cy, rt * 1.42,
                      [(0.0, '#e2ecfa'), (0.24, '#9cb6e4'), (0.60, '#3c62a8'), (1.0, '#152540')]), m)
    d.ellipse([cx - rt, turret_cy - rt * 0.80, cx + rt, turret_cy + rt * 0.80],
              outline=R(P.line), width=int(OUTLINE))
    # 炮室金铆钉
    pts = []
    for i in range(10):
        a = math.pi * (1.02 + i * 0.96 / 10)
        pts.append((cx + math.cos(a) * rt * 0.84, turret_cy + math.sin(a) * rt * 0.84 * 0.76))
    rivets(img, W, pts, S * 0.0105, P.gold)
    # 前方大水晶
    crystal(img, W, cx - rt * 0.12, turret_cy + rt * 0.44, rt * 0.36, P.crystal)
    # 红宝石点缀
    crystal(img, W, cx - rt * 0.66, turret_cy - rt * 0.46, S * 0.019, P.red, bloom=False)
    crystal(img, W, cx + rt * 0.66, turret_cy - rt * 0.46, S * 0.019, P.red, bloom=False)
    return img


def lv10(img, W, cx, cy, S):
    """Lv10 传说王炮 + 皇冠 + 光环"""
    d = ImageDraw.Draw(img)
    rb = S * 0.345
    # 外光环
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for k in range(4):
        kk = 1.08 + k * 0.10
        gd.ellipse([cx - rb * kk, cy + rb * SQ * 0.22 - rb * SQ * kk,
                    cx + rb * kk, cy + rb * SQ * 0.22 + rb * SQ * kk],
                   outline=R(P.gold, 130 - k * 28), width=int(2.2 * SS))
    img.alpha_composite(blur(gl, 2.4 * SS))

    img = shadow(img, cx, cy + rb * SQ * 0.92, rb * 1.12, rb * SQ * 0.42, 5.0 * SS, 125)

    # 黄金三层台阶
    d = ImageDraw.Draw(img)
    cur_r, cur_y = rb, cy
    for t in range(3):
        th = W * 0.070 * (1.0 if t == 0 else 0.66)
        top = ngon(cx, cur_y, cur_r, 8)
        bot = ngon(cx, cur_y + th, cur_r * 0.99, 8)
        side = [top[3], top[2], top[1], top[0], bot[0], bot[1], bot[2], bot[3]]
        paste(img, lin(W, (0, cur_y - cur_r * SQ), (0, cur_y + cur_r * SQ + th),
                       [(0.0, '#a87a20'), (0.5, '#7a5814'), (1.0, '#3e2c08')]), m_poly(W, side))
        d.polygon(side, outline=R(P.line), width=int(OUTLINE))
        paste(img, radial(W, cx, cur_y - cur_r * SQ * 0.2, cur_r * 1.45,
                          [(0.0, '#fff2c0'), (0.38, '#dcac3c'), (1.0, '#8a6018')]), m_poly(W, top))
        d.polygon(top, outline=R(P.line), width=int(OUTLINE))
        # 金砖缝
        for i in range(8):
            a0 = i * 2 * math.pi / 8 + 0.20
            d.line([(cx + math.cos(a0) * cur_r * 0.26, cur_y + math.sin(a0) * cur_r * 0.26 * SQ),
                    (cx + math.cos(a0) * cur_r * 0.93, cur_y + math.sin(a0) * cur_r * 0.93 * SQ)],
                   fill=R(hx('#6a4a10'), 110), width=int(1.4 * SS))
        cur_r *= 0.845
        cur_y -= th * 0.30

    r_up, cy_up = cur_r, cur_y

    # 炮室（最大最华丽）
    rt = S * 0.170
    turret_cy = cy_up - rt * 0.30
    ang = math.radians(-34)
    img = barrel(img, W, cx + math.cos(ang) * rt * 0.26, turret_cy + math.sin(ang) * rt * 0.26,
                 ang, S * 0.350, S * 0.094, 2, 3)
    # 炮管上的金箍
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    for t in (0.36, 0.66):
        gx = cx + math.cos(ang) * rt * 0.26 + ux * S * 0.350 * t
        gy = turret_cy + math.sin(ang) * rt * 0.26 + uy * S * 0.350 * t
        hw = S * 0.094 * 0.5 * 1.12
        d.line([(gx + px * hw, gy + py * hw), (gx - px * hw, gy - py * hw)],
               fill=R(P.gold_dk), width=int(S * 0.012))
        d.line([(gx + px * hw, gy + py * hw), (gx - px * hw, gy - py * hw)],
               fill=R(P.gold), width=int(S * 0.008))

    # 炮室
    m = m_ell(W, cx, turret_cy, rt, rt * 0.80)
    paste(img, radial(W, cx, turret_cy, rt * 1.45,
                      [(0.0, '#f0f6ff'), (0.22, '#a8c2ec'), (0.58, '#3e64ac'), (1.0, '#152540')]), m)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - rt, turret_cy - rt * 0.80, cx + rt, turret_cy + rt * 0.80],
              outline=R(P.line), width=int(OUTLINE))
    # 金色装甲棱线
    for i in range(4):
        a = math.pi * (1.10 + i * 0.52 / 3)
        d.line([(cx + math.cos(a) * rt * 0.30, turret_cy + math.sin(a) * rt * 0.30 * 0.76),
                (cx + math.cos(a) * rt * 0.94, turret_cy + math.sin(a) * rt * 0.94 * 0.76)],
               fill=R(P.gold, 190), width=int(1.8 * SS))
    # 金铆钉
    pts = []
    for i in range(12):
        a = math.pi * (1.00 + i * 0.98 / 12)
        pts.append((cx + math.cos(a) * rt * 0.86, turret_cy + math.sin(a) * rt * 0.86 * 0.76))
    rivets(img, W, pts, S * 0.0105, P.gold)
    # 大水晶
    crystal(img, W, cx - rt * 0.14, turret_cy + rt * 0.44, rt * 0.40, P.gold_lt)
    # 红宝石
    crystal(img, W, cx - rt * 0.70, turret_cy - rt * 0.44, S * 0.021, P.red, bloom=False)
    crystal(img, W, cx + rt * 0.70, turret_cy - rt * 0.44, S * 0.021, P.red, bloom=False)

    # 皇冠
    d = ImageDraw.Draw(img)
    cr_y = turret_cy - rt * 1.34
    cr_w = S * 0.058
    body = [(cx - cr_w, cr_y + cr_w * 0.30), (cx - cr_w * 0.86, cr_y - cr_w * 0.48),
            (cx - cr_w * 0.42, cr_y + cr_w * 0.04), (cx, cr_y - cr_w * 0.78),
            (cx + cr_w * 0.42, cr_y + cr_w * 0.04), (cx + cr_w * 0.86, cr_y - cr_w * 0.48),
            (cx + cr_w, cr_y + cr_w * 0.30)]
    d.polygon(body, fill=R(P.gold))
    d.polygon(body, outline=R(P.line), width=int(OUTLINE * 0.9))
    d.polygon([(cx - cr_w, cr_y + cr_w * 0.30), (cx - cr_w * 0.86, cr_y - cr_w * 0.48),
               (cx - cr_w * 0.34, cr_y + cr_w * 0.10)], fill=R(P.gold_lt))
    d.line([(cx - cr_w * 1.04, cr_y + cr_w * 0.32), (cx + cr_w * 1.04, cr_y + cr_w * 0.32)],
           fill=R(P.gold_dk), width=int(cr_w * 0.36))
    for gx2, gy2 in [(-cr_w * 0.86, -cr_w * 0.58), (0, -cr_w * 0.90), (cr_w * 0.86, -cr_w * 0.58)]:
        d.ellipse([cx + gx2 - cr_w * 0.11, cr_y + gy2 - cr_w * 0.11,
                   cx + gx2 + cr_w * 0.11, cr_y + gy2 + cr_w * 0.11], fill=R(P.gold_lt))
    d.ellipse([cx - cr_w * 0.15, cr_y + cr_w * 0.02, cx + cr_w * 0.15, cr_y + cr_w * 0.32],
              fill=R(P.red_lt))
    return img


LEVELS = [lv01, lv02, lv03, lv04, lv05, lv06, lv07, lv08, lv09, lv10]


# ================================================================= 分支
def render_branch(base_lv, branch, size=256):
    """在某个基础等级上改出分支造型"""
    W = size * SS
    img = canvas(W)
    S = W
    cx, cy = W * 0.50, W * 0.60
    fn = LEVELS[base_lv - 1]
    img = fn(img, W, cx, cy, S)

    if branch == 'twin':
        # 在现有炮管旁再画一根（略小），并加双管底座
        d = ImageDraw.Draw(img)
        rb = S * (0.30 + 0.005 * base_lv)
        if base_lv <= 2:
            tcy = cy - rb * 0.58
        elif base_lv <= 5:
            tcy = cy - S * 0.13
        else:
            tcy = cy - S * 0.155
        ang = math.radians(-31)
        off = S * 0.040
        bx = cx - math.sin(ang) * off - S * 0.02
        by = tcy + math.cos(ang) * off
        img = barrel(img, W, bx, by, ang, S * 0.26, S * 0.062, 1, 2)
        # 双管连接桥
        d = ImageDraw.Draw(img)
        mx = cx + math.cos(ang) * S * 0.09
        my = tcy + math.sin(ang) * S * 0.09
        px, py = -math.sin(ang), math.cos(ang)
        d.line([(mx + px * off, my + py * off), (mx - px * off, my - py * off)],
               fill=R(P.steel), width=int(S * 0.016))
    elif branch == 'bigcannon':
        d = ImageDraw.Draw(img)
        rb = S * (0.30 + 0.005 * base_lv)
        if base_lv <= 2:
            tcy = cy - rb * 0.58
        elif base_lv <= 5:
            tcy = cy - S * 0.13
        else:
            tcy = cy - S * 0.155
        ang = math.radians(-31)
        img = barrel(img, W, cx - S * 0.02, tcy, ang, S * 0.30, S * 0.128, 2, 3)
    return img


# ================================================================= 导出
def render(level, size=256):
    W = size * SS
    img = canvas(W)
    S = W
    cx, cy = W * 0.50, W * 0.60
    img = LEVELS[level - 1](img, W, cx, cy, S)
    img = grain(img, 2)
    return img.resize((size, size), Image.LANCZOS)


def export_all(size=256):
    for lv in range(1, 11):
        render(lv, size).save(os.path.join(OUT, f'cannon_lv{lv:02d}.png'))
    for lv in (5, 8, 10):
        render_branch(lv, 'twin', size).save(os.path.join(OUT, f'cannon_twin_lv{lv:02d}.png'))
        render_branch(lv, 'bigcannon', size).save(os.path.join(OUT, f'cannon_big_lv{lv:02d}.png'))
    print('exported', OUT)


if __name__ == '__main__':
    export_all()

# -*- coding: utf-8 -*-
"""
炮塔升级序列图标生成器 v5
风格：皇室战争 / 部落冲突 式欧美卡通策略 UI 资产

相比 v4 的改进：
  ① 底座改为**双层台阶**（下宽上窄），加厚侧壁 → 体积感扎实
  ② 炮管根部加**防盾（mantlet）**，遮住炮管与炮室的接缝
  ③ 炮管改短粗（玩具炮比例），更符合"圆润夸张"的要求
  ④ 水晶加大并放到炮室正前方
  ⑤ 整体放大，撑满画面
  ⑥ 视角抬高到 0.62，更接近"略微倾斜的等距"
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 5
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v5')
os.makedirs(OUT, exist_ok=True)

SQ = 0.62          # 视角压缩比（越大越接近平视）


# ================================================================= 工具
def hx(h):
    """#rrggbb 字符串 → (r,g,b)；已经是元组则直接返回（方便 shade() 的结果复用）"""
    if isinstance(h, (tuple, list)):
        return tuple(int(v) for v in h[:3])
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, f):
    if f <= 1:
        return tuple(int(max(0, c[i] * f)) for i in range(3))
    t = f - 1
    return tuple(int(min(255, c[i] + (255 - c[i]) * t)) for i in range(3))


def R(c, a=255):
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


def radial(W, cx, cy, radius, stops, lx=-0.30, ly=-0.34, spread=1.7):
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


def ellipse_shadow(img, cx, cy, rx, ry, bl, alpha=120):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                              fill=(8, 12, 22, alpha))
    return Image.alpha_composite(img, blur(l, bl))


def grain(img, s=4):
    W = img.size[0]
    rng = np.random.default_rng(3)
    n = rng.normal(0, s, (W, W, 1)).repeat(3, axis=2)
    a = np.clip(np.array(img, dtype=np.int16)[:, :, :3] + n.astype(np.int16), 0, 255).astype(np.uint8)
    out = Image.fromarray(a, 'RGB').convert('RGBA')
    out.putalpha(img.getchannel('A'))
    return out


def ngon(cx, cy, r, n=8, sq=SQ, rot=math.pi / 8, dy=0.0):
    return [(cx + math.cos(rot + i * 2 * math.pi / n) * r,
             cy + dy + math.sin(rot + i * 2 * math.pi / n) * r * sq) for i in range(n)]


# ================================================================= 配色
class P:
    metal_dk = hx('#152a4a')
    metal = hx('#3560a8')
    metal_lt = hx('#6f9ce0')
    metal_hi = hx('#c0d8fa')
    steel_dk = hx('#3c4860')
    steel = hx('#8b98ad')
    steel_lt = hx('#ccd6e6')
    stone_dk = hx('#2c3340')
    stone = hx('#5e6674')
    stone_lt = hx('#8b93a3')
    wood_dk = hx('#43300f')
    wood = hx('#8e6a2e')
    wood_lt = hx('#c9a05c')
    gold_dk = hx('#7e5a12')
    gold = hx('#dcac3c')
    gold_lt = hx('#ffe89a')
    leather = hx('#58331a')
    leather_lt = hx('#8a5430')
    crystal = hx('#5ad0ff')
    fire = hx('#ff8a3a')
    red = hx('#d63c32')
    red_lt = hx('#ff8878')
    line = hx('#11151d')


# ================================================================= 底座（双层台阶）
def draw_base(img, W, cx, cy, rb, style):
    d = ImageDraw.Draw(img)

    th1 = W * 0.085           # 下层厚度
    th2 = W * 0.048           # 上层厚度
    r2 = rb * 0.845           # 上层半径

    # ---- 下层侧壁（正面条带：底边 4 个点 + 对应的下移点）
    top1 = ngon(cx, cy, rb, 8)
    bot1 = ngon(cx, cy + th1, rb * 0.99, 8)
    side1 = [top1[3], top1[2], top1[1], top1[0],
             bot1[0], bot1[1], bot1[2], bot1[3]]
    c_dk = {'wood': '#3a2610', 'gold': '#4a3410'}.get(style, '#1e2530')
    c_md = {'wood': '#5e4018', 'gold': '#7a5a14'}.get(style, '#333b48')
    paste(img, lin(W, (0, cy - rb * SQ), (0, cy + rb * SQ + th1),
                   [(0.0, c_md), (0.55, c_dk), (1.0, '#0e1118')]), m_poly(W, side1))
    d.line(side1 + [side1[0]], fill=R(P.line), width=int(2.8 * SS), joint='curve')

    # ---- 下层顶面
    if style == 'wood':
        g = radial(W, cx, cy - rb * SQ * 0.2, rb * 1.4,
                   [(0.0, '#dcab6c'), (0.42, '#ab7c46'), (1.0, '#6b4520')])
    elif style == 'gold':
        g = radial(W, cx, cy - rb * SQ * 0.2, rb * 1.4,
                   [(0.0, '#ffefb4'), (0.40, '#dcac3c'), (1.0, '#7e5a12')])
    else:
        g = radial(W, cx, cy - rb * SQ * 0.2, rb * 1.4,
                   [(0.0, '#bcc4d2'), (0.42, '#737b8c'), (1.0, '#3e4653')])
    paste(img, g, m_poly(W, top1))
    d.line(top1 + [top1[0]], fill=R(P.line), width=int(2.8 * SS), joint='curve')

    # ---- 上层（台阶）
    ao = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(ao).ellipse([cx - r2 * 1.12, cy - r2 * SQ * 1.05,
                                cx + r2 * 1.12, cy + r2 * SQ * 0.30],
                               fill=(6, 10, 20, 90))
    img.alpha_composite(blur(ao, 3.0 * SS))
    d = ImageDraw.Draw(img)

    top2 = ngon(cx, cy - th2 * 0.30, r2, 8)
    bot2 = ngon(cx, cy - th2 * 0.30 + th2, r2 * 0.99, 8)
    side2 = [top2[3], top2[2], top2[1], top2[0],
             bot2[0], bot2[1], bot2[2], bot2[3]]
    if style == 'wood':
        s2 = [(0.0, '#8a6634'), (0.6, '#63441c'), (1.0, '#3a2610')]
    elif style == 'gold':
        s2 = [(0.0, '#a87c20'), (0.6, '#7a5a14'), (1.0, '#4a3410')]
    else:
        s2 = [(0.0, '#5a6270'), (0.6, '#3e4653'), (1.0, '#242b36')]
    paste(img, lin(W, (0, cy - th2 * 0.30 - r2 * SQ), (0, cy - th2 * 0.30 + r2 * SQ + th2), s2),
          m_poly(W, side2))
    d.line(side2 + [side2[0]], fill=R(P.line), width=int(2.6 * SS), joint='curve')

    if style == 'wood':
        g2 = radial(W, cx, cy - th2 * 0.30 - r2 * SQ * 0.2, r2 * 1.4,
                    [(0.0, '#e0b478'), (0.42, '#b8894e'), (1.0, '#7a5524')])
    elif style == 'gold':
        g2 = radial(W, cx, cy - th2 * 0.30 - r2 * SQ * 0.2, r2 * 1.4,
                    [(0.0, '#fff4c8'), (0.40, '#dcac3c'), (1.0, '#8a6018')])
    else:
        g2 = radial(W, cx, cy - th2 * 0.30 - r2 * SQ * 0.2, r2 * 1.4,
                    [(0.0, '#c6cedb'), (0.42, '#7d8596'), (1.0, '#48505e')])
    paste(img, g2, m_poly(W, top2))
    d.line(top2 + [top2[0]], fill=R(P.line), width=int(2.6 * SS), joint='curve')

    # ---- 倒角亮线
    bv = ngon(cx, cy - th2 * 0.30, r2 * 0.90, 8)
    d.line(bv + [bv[0]],
           fill=R(shade(P.stone_lt if style == 'stone' else P.wood_lt, 1.10), 210),
           width=int(1.6 * SS), joint='curve')

    # ---- 纹理
    if style == 'wood':
        # 木板：深色缝隙 + 每块板一条高光
        tw = 5
        for i in range(tw):
            y0 = cy - th2 * 0.30 - r2 * SQ * 0.68 + i * (r2 * SQ * 1.36 / tw)
            y1 = y0 + r2 * SQ * 1.36 / tw
            # 缝
            d.line([(cx - r2 * 0.70, y0), (cx + r2 * 0.70, y0)],
                   fill=R(hx('#2e1c08'), 190), width=int(2.0 * SS))
            # 板面高光
            d.line([(cx - r2 * 0.66, y0 + 3 * SS), (cx + r2 * 0.66, y0 + 3 * SS)],
                   fill=R(hx('#e0b478'), 90), width=int(1.4 * SS))
        # 竖向拼缝
        for i in (-1, 1):
            xx = cx + i * r2 * 0.34
            d.line([(xx, cy - th2 * 0.30 - r2 * SQ * 0.66),
                    (xx, cy - th2 * 0.30 + r2 * SQ * 0.66)],
                   fill=R(hx('#2e1c08'), 170), width=int(2.2 * SS))
        # 木结
        for kx, ky in [(-0.44, -0.18), (0.40, 0.26)]:
            ex = cx + r2 * kx
            ey = cy - th2 * 0.30 + r2 * SQ * ky
            d.ellipse([ex - r2 * 0.045, ey - r2 * 0.030,
                       ex + r2 * 0.045, ey + r2 * 0.030],
                      outline=R(hx('#3e2810'), 150), width=int(1.4 * SS))
    else:
        # 石板：每块砖一个亮面 + 深缝
        nseg = 8
        for i in range(nseg):
            a0 = i * 2 * math.pi / nseg + 0.20
            a1 = a0 + 2 * math.pi / nseg
            # 辐射缝
            d.line([(cx + math.cos(a0) * r2 * 0.26, cy - th2 * 0.30 + math.sin(a0) * r2 * 0.26 * SQ),
                    (cx + math.cos(a0) * r2 * 0.94, cy - th2 * 0.30 + math.sin(a0) * r2 * 0.94 * SQ)],
                   fill=R(hx('#1a202c'), 170), width=int(2.2 * SS))
            # 同心缝
            for ring in (0.52, 0.76):
                d.arc([cx - r2 * ring, cy - th2 * 0.30 - r2 * ring * SQ,
                       cx + r2 * ring, cy - th2 * 0.30 + r2 * ring * SQ],
                      190, 350, fill=R(hx('#1a202c'), 130), width=int(1.6 * SS))
            # 砖面高光（朝上那段）
            mid = (a0 + a1) / 2
            if math.sin(mid) > 0.2:
                hx0 = cx + math.cos(mid) * r2 * 0.40
                hy0 = cy - th2 * 0.30 + math.sin(mid) * r2 * 0.40 * SQ
                hx1 = cx + math.cos(mid) * r2 * 0.70
                hy1 = cy - th2 * 0.30 + math.sin(mid) * r2 * 0.70 * SQ
                d.line([(hx0, hy0), (hx1, hy1)], fill=R(hx('#c6cedb'), 55), width=int(2.6 * SS))

    return img, r2, cy - th2 * 0.30     # 返回上层半径和上层中心 Y


def gold_band(img, W, cx, cy, r, width=2.6):
    d = ImageDraw.Draw(img)
    pts = ngon(cx, cy, r * 1.008, 8)
    d.line(pts + [pts[0]], fill=R(P.gold_dk, 250), width=int((width + 1.4) * SS), joint='curve')
    d.line(pts + [pts[0]], fill=R(P.gold, 250), width=int(width * SS), joint='curve')
    d.line(pts + [pts[0]], fill=R(P.gold_lt, 150), width=int(width * 0.34 * SS), joint='curve')
    return img


def leather_band(img, W, cx, cy, r):
    d = ImageDraw.Draw(img)
    pts = ngon(cx, cy + W * 0.026, r * 1.012, 8)
    d.line(pts + [pts[0]], fill=R(P.leather, 250), width=int(0.040 * W), joint='curve')
    d.line(pts + [pts[0]], fill=R(P.leather_lt, 150), width=int(0.016 * W), joint='curve')
    d.line(pts + [pts[0]], fill=R(hx('#2a1808'), 160), width=int(0.004 * W), joint='curve')
    for i in (4, 5, 6, 7, 0):
        x, y = pts[i]
        d.ellipse([x - W * 0.0125, y - W * 0.0125, x + W * 0.0125, y + W * 0.0125],
                  fill=R(P.gold_dk))
        d.ellipse([x - W * 0.0088, y - W * 0.0088, x + W * 0.0088, y + W * 0.0088],
                  fill=R(P.gold))
        d.ellipse([x - W * 0.0042, y - W * 0.0042, x + W * 0.0042, y + W * 0.0042],
                  fill=R(P.gold_lt))
    return img


# ================================================================= 炮室
def draw_turret(img, W, cx, cy, rt, level):
    d = ImageDraw.Draw(img)

    img = ellipse_shadow(img, cx, cy + rt * 0.60, rt * 1.15, rt * 0.30, 2.8 * SS, 135)
    d = ImageDraw.Draw(img)

    # 侧壁（下暗）
    m1 = m_ell(W, cx, cy + rt * 0.24, rt, rt * 0.78)
    paste(img, radial(W, cx, cy + rt * 0.24, rt * 1.15,
                      [(0.0, '#4772bc'), (0.45, '#27477c'), (1.0, '#101f38')]), m1)
    d.ellipse([cx - rt, cy + rt * 0.24 - rt * 0.78,
               cx + rt, cy + rt * 0.24 + rt * 0.78],
              outline=R(P.line), width=int(2.4 * SS))

    # 顶面（亮）
    m2 = m_ell(W, cx, cy - rt * 0.16, rt, rt * 0.76)
    paste(img, radial(W, cx, cy - rt * 0.16, rt * 1.20,
                      [(0.0, '#e0f0ff'), (0.22, '#8fb4f0'), (0.58, '#3d68b2'), (1.0, '#16294a')]), m2)
    d.ellipse([cx - rt, cy - rt * 0.16 - rt * 0.76,
               cx + rt, cy - rt * 0.16 + rt * 0.76],
              outline=R(P.line), width=int(2.4 * SS))

    # 柔光
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - rt * 0.64, cy - rt * 0.70,
                                cx - rt * 0.02, cy - rt * 0.16],
                               fill=(255, 255, 255, 175))
    img.alpha_composite(blur(hl, 2.4 * SS))

    # 装甲板缝（Lv4+）：只画在炮室**上半部**，像铸造件的分模线，不要放射成星芒
    d = ImageDraw.Draw(img)
    if level >= 4:
        n = 3 if level < 8 else 4
        for i in range(n):
            a = math.pi * (1.16 + i * 0.56 / max(1, n - 1))
            x1 = cx + math.cos(a) * rt * 0.42
            y1 = cy - rt * 0.14 + math.sin(a) * rt * 0.42 * 0.74
            x2 = cx + math.cos(a) * rt * 0.96
            y2 = cy - rt * 0.14 + math.sin(a) * rt * 0.96 * 0.74
            d.line([(x1, y1), (x2, y2)], fill=R(P.metal_dk, 130), width=int(2.2 * SS))
        # 一条横向的盖板缝
        d.arc([cx - rt * 0.80, cy - rt * 0.14 - rt * 0.60,
               cx + rt * 0.80, cy - rt * 0.14 + rt * 0.60],
              200, 340, fill=R(P.metal_dk, 120), width=int(2.0 * SS))
    return img


def draw_shoulder_armor(img, W, cx, cy, rt, level, side_col=None):
    """侧翼装甲板：贴在炮室两侧，等级越高层数越多（明显强化"中级→高级"的体积感）"""
    if level < 3:
        return img
    d = ImageDraw.Draw(img)
    col_dk = side_col or P.metal_dk
    col = side_col or P.metal

    tiers = 1 if level < 6 else (2 if level < 9 else 3)
    for t in range(tiers):
        ax = rt * (1.02 + t * 0.14)
        ay = rt * (-0.10 + t * 0.12)
        aw = rt * 0.34
        ah = rt * (0.62 - t * 0.10)
        for s in (-1, 1):
            pts = [
                (cx + s * ax, cy + ay - ah),
                (cx + s * (ax + aw), cy + ay - ah * 0.55),
                (cx + s * (ax + aw), cy + ay + ah * 0.55),
                (cx + s * ax, cy + ay + ah),
            ]
            # 侧面暗
            d.polygon(pts, fill=R(shade(col_dk, 1.05)))
            # 正面亮（内缩一点）
            inner = [
                (pts[0][0], pts[0][1] + ah * 0.10),
                (pts[1][0] - s * aw * 0.18, pts[1][1] + ah * 0.10),
                (pts[2][0] - s * aw * 0.18, pts[2][1] - ah * 0.10),
                (pts[3][0], pts[3][1] - ah * 0.10),
            ]
            d.polygon(inner, fill=R(col))
            # 高光边
            d.line([inner[0], inner[3]], fill=R(shade(col, 1.55), 200), width=int(1.8 * SS))
            d.line(pts + [pts[0]], fill=R(P.line), width=int(2.0 * SS), joint='curve')
            # 铆钉
            if level >= 5:
                for k in (0.35, 0.72):
                    bx = pts[0][0] + (pts[3][0] - pts[0][0]) * k
                    by = pts[0][1] + (pts[3][1] - pts[0][1]) * k
                    rr = rt * 0.045
                    d.ellipse([bx - rr, by - rr, bx + rr, by + rr],
                              fill=R(P.gold if level >= 6 else P.steel_lt))
    return img


def draw_turret_rim_bolts(img, W, cx, cy, rt, level, gold=False):
    """炮室一圈螺栓（Lv5+），增强机械细节"""
    if level < 5:
        return img
    d = ImageDraw.Draw(img)
    n = 6 if level < 8 else 9
    for i in range(n):
        a = math.pi * (1.02 + i * 0.96 / n)
        bx = cx + math.cos(a) * rt * 0.88
        by = cy - rt * 0.10 + math.sin(a) * rt * 0.88 * 0.78
        rr = rt * 0.052
        c = P.gold if gold else P.steel_lt
        d.ellipse([bx - rr, by - rr, bx + rr, by + rr], fill=R(shade(c, 0.55)))
        d.ellipse([bx - rr * 0.86, by - rr * 0.86, bx + rr * 0.86, by + rr * 0.86],
                  fill=R(c))
        d.ellipse([bx - rr * 0.40, by - rr * 0.42, bx + rr * 0.34, by + rr * 0.28],
                  fill=R(shade(c, 1.5)))
    return img
    """炮座：盖住炮管尾端的圆形基座，让炮管看起来是"插进炮座里"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux

    mw = hw * 1.30
    ml = hw * 0.96
    box = []
    n = 28
    for i in range(n):
        a = i * 2 * math.pi / n
        uu = math.cos(a) * ml
        pp = math.sin(a) * mw
        box.append((cx + ux * uu + px * pp, cy + uy * uu + py * pp))

    # 炮座：深蓝金属，外圈更暗（低矮的基座感）
    paste(img, radial(W, cx, cy, mw * 1.5,
                      [(0.0, '#8fb4ea'), (0.26, '#4a76be'), (0.62, '#25406e'),
                       (0.88, '#13233c'), (1.0, '#0c1626')]),
          m_poly(W, box))
    d.polygon(box, outline=R(P.line), width=int(2.0 * SS))
    # 内圈凹槽
    inner = []
    for i in range(n):
        a = i * 2 * math.pi / n
        uu = math.cos(a) * ml * 0.66
        pp = math.sin(a) * mw * 0.66
        inner.append((cx + ux * uu + px * pp, cy + uy * uu + py * pp))
    d.polygon(inner, outline=R(P.metal_dk, 200), width=int(1.6 * SS))
    return img


# ================================================================= 炮管
def draw_barrel(img, W, cx, cy, ang, blen, bw, level, heavy=1.0, muzzle=False):
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = bw * 0.5 * heavy

    # 投影
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).line([(cx + hw * 0.4, cy + hw * 0.8),
                             (cx + ux * blen + hw * 0.4, cy + uy * blen + hw * 0.8)],
                            fill=(6, 10, 20, 85), width=int(hw * 2.0))
    img.alpha_composite(blur(sh, 3.0 * SS))
    d = ImageDraw.Draw(img)

    q = [(cx + px * hw, cy + py * hw),
         (cx + ux * blen + px * hw, cy + uy * blen + py * hw),
         (cx + ux * blen - px * hw, cy + uy * blen - py * hw),
         (cx - px * hw, cy - py * hw)]
    paste(img, lin(W, q[0], q[3],
                   [(0.0, '#122238'), (0.16, '#4a76be'), (0.36, '#b6d2f8'),
                    (0.56, '#7aa4e4'), (0.78, '#3560a8'), (1.0, '#0e1c30')]),
          m_poly(W, q))
    d.polygon(q, outline=R(P.line), width=int(2.4 * SS))

    # 铁箍
    nb = 2 if level < 5 else 3
    for i in range(nb):
        t = (i + 1) / (nb + 1)
        bx, by = cx + ux * blen * t, cy + uy * blen * t
        bwid = hw * 1.18
        d.line([(bx + px * bwid, by + py * bwid), (bx - px * bwid, by - py * bwid)],
               fill=R(P.steel_dk), width=int(hw * 0.32))
        d.line([(bx + px * bwid, by + py * bwid), (bx - px * bwid, by - py * bwid)],
               fill=R(P.steel), width=int(hw * 0.20))
        d.line([(bx - px * bwid * 0.60, by - py * bwid * 0.60),
                (bx - px * bwid * 0.14, by - py * bwid * 0.14)],
               fill=R(P.steel_lt, 200), width=int(hw * 0.07))

    # 制退器
    if muzzle or level >= 7:
        tx, ty = cx + ux * blen, cy + uy * blen
        ml = hw * 0.92
        mo = hw * 1.40
        q2 = [(tx + px * mo, ty + py * mo),
              (tx + ux * ml + px * mo, ty + uy * ml + py * mo),
              (tx + ux * ml - px * mo, ty + uy * ml - py * mo),
              (tx - px * mo, ty - py * mo)]
        paste(img, lin(W, q2[0], q2[3],
                       [(0.0, '#0e141e'), (0.18, '#525c70'), (0.40, '#ccd6e6'),
                        (0.64, '#6a7488'), (1.0, '#171d29')]), m_poly(W, q2))
        d.polygon(q2, outline=R(P.line), width=int(2.4 * SS))
        for gk in (0.28, 0.62, 0.90):
            gx, gy = tx + ux * ml * gk, ty + uy * ml * gk
            d.line([(gx + px * mo * 0.97, gy + py * mo * 0.97),
                    (gx - px * mo * 0.97, gy - py * mo * 0.97)],
                   fill=R(P.steel_dk, 200), width=int(hw * 0.10))
        mx0, my0 = tx + ux * ml * 0.94, ty + uy * ml * 0.94
        hr = hw * 0.84
        d.ellipse([mx0 - hr * 1.04, my0 - hr * 0.96, mx0 + hr * 1.04, my0 + hr * 0.96],
                  fill=R(hx('#0c1017')))
        d.ellipse([mx0 - hr * 0.76, my0 - hr * 0.70, mx0 + hr * 0.76, my0 + hr * 0.70],
                  fill=R(hx('#04060a')))
        d.arc([mx0 - hr * 1.04, my0 - hr * 0.96, mx0 + hr * 1.04, my0 + hr * 0.96],
              195, 335, fill=R(P.steel_lt, 215), width=int(hw * 0.15))

    # 顶部高光
    hi = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hi).line([(cx + px * hw * 0.54, cy + py * hw * 0.54),
                             (cx + ux * blen * 0.92 + px * hw * 0.54,
                              cy + uy * blen * 0.92 + py * hw * 0.54)],
                            fill=(255, 255, 255, 150), width=int(hw * 0.26))
    img.alpha_composite(blur(hi, 1.2 * SS))
    return img


# ================================================================= 水晶 / 齿轮 / 皇冠 / 光环
def draw_crystal(img, W, cx, cy, r, color, bloom=True):
    if bloom:
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(4):
            rr = r * (2.1 - k * 0.40)
            gd.ellipse([cx - rr, cy - rr * 0.96, cx + rr, cy + rr * 0.96],
                       fill=R(color, 30 + k * 24))
        img.alpha_composite(blur(gl, 2.6 * SS))

    d = ImageDraw.Draw(img)
    n = 6
    pts = [(cx + math.cos(-math.pi / 2 + i * 2 * math.pi / n) * r,
            cy + math.sin(-math.pi / 2 + i * 2 * math.pi / n) * r * 0.96) for i in range(n)]
    paste(img, radial(W, cx, cy, r * 1.6,
                      [(0.0, '#ffffff'), (0.16, '#e8faff'), (0.38, '#96e4ff'),
                       (0.66, '#2eb4e8'), (1.0, '#0a5e88')]), m_poly(W, pts))
    d.polygon(pts, outline=R(shade(color, 0.42)), width=int(2.0 * SS))
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92 * 0.96)],
               fill=R(shade(color, 1.5), 110), width=int(1.2 * SS))
    d.ellipse([cx - r * 0.42, cy - r * 0.62, cx + r * 0.02, cy - r * 0.18],
              fill=(255, 255, 255, 240))
    d.ellipse([cx - r * 0.26, cy - r * 0.48, cx - r * 0.06, cy - r * 0.28],
              fill=(255, 255, 255, 255))
    return img


def draw_gear(img, W, cx, cy, r, teeth, c):
    d = ImageDraw.Draw(img)
    pts = []
    n = teeth * 2
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r if i % 2 == 0 else r * 0.72
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.92))
    d.polygon(pts, fill=R(shade(c, 0.78)))
    d.line(pts + [pts[0]], fill=R(P.line, 210), width=int(1.6 * SS), joint='curve')
    d.ellipse([cx - r * 0.60, cy - r * 0.55, cx + r * 0.60, cy + r * 0.55], fill=R(c))
    d.ellipse([cx - r * 0.48, cy - r * 0.44, cx + r * 0.24, cy + r * 0.14],
              fill=R(shade(c, 1.5), 180))
    d.ellipse([cx - r * 0.23, cy - r * 0.21, cx + r * 0.23, cy + r * 0.21],
              fill=R(hx('#0c1017')))
    return img


def draw_crown(img, W, cx, cy, r, c):
    d = ImageDraw.Draw(img)
    body = [(cx - r, cy + r * 0.26), (cx - r * 0.88, cy - r * 0.50),
            (cx - r * 0.44, cy + r * 0.02), (cx, cy - r * 0.80),
            (cx + r * 0.44, cy + r * 0.02), (cx + r * 0.88, cy - r * 0.50),
            (cx + r, cy + r * 0.26)]
    d.polygon(body, fill=R(c))
    d.polygon(body, outline=R(P.line), width=int(2.2 * SS))
    d.polygon([(cx - r, cy + r * 0.26), (cx - r * 0.88, cy - r * 0.50),
               (cx - r * 0.36, cy + r * 0.08)], fill=R(shade(c, 1.42)))
    d.line([(cx - r * 1.04, cy + r * 0.28), (cx + r * 1.04, cy + r * 0.28)],
           fill=R(shade(c, 0.60)), width=int(r * 0.38))
    d.line([(cx - r * 1.04, cy + r * 0.28), (cx + r * 1.04, cy + r * 0.28)],
           fill=R(shade(c, 1.30), 150), width=int(r * 0.13))
    for gx, gy in [(-r * 0.88, -r * 0.60), (0, -r * 0.92), (r * 0.88, -r * 0.60)]:
        d.ellipse([cx + gx - r * 0.12, cy + gy - r * 0.12,
                   cx + gx + r * 0.12, cy + gy + r * 0.12], fill=R(P.gold_lt))
        d.ellipse([cx + gx - r * 0.06, cy + gy - r * 0.07,
                   cx + gx + r * 0.02, cy + gy + r * 0.01], fill=(255, 255, 255, 230))
    d.ellipse([cx - r * 0.16, cy + r * 0.00, cx + r * 0.16, cy + r * 0.32], fill=R(P.red_lt))
    d.ellipse([cx - r * 0.07, cy + r * 0.06, cx + r * 0.03, cy + r * 0.16],
              fill=(255, 255, 255, 210))
    return img


def draw_aura(img, W, cx, cy, r, c, rings=4):
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for k in range(rings):
        rr = r * (1.05 + k * 0.095)
        gd.ellipse([cx - rr, cy - rr * SQ, cx + rr, cy + rr * SQ],
                   outline=R(c, 105 - k * 22), width=int(1.8 * SS))
    img.alpha_composite(blur(gl, 2.0 * SS))
    return img


# ================================================================= 等级参数
def lp(lv):
    t = (lv - 1) / 9.0
    return {
        'base_r': 0.330 + 0.075 * t,
        'style': 'wood' if lv <= 2 else ('gold' if lv >= 10 else 'stone'),
        'turret_r': 0.148 + 0.062 * t,
        'barrel_len': 0.365 + 0.175 * t,
        'barrel_w': 0.128 + 0.072 * t,
        'rivets': 0 if lv < 2 else (4 if lv < 4 else (8 if lv < 8 else 12)),
        'gear': lv >= 3,
        'strap': lv >= 4,
        'crystal': lv >= 5,
        'gold': lv >= 6,
        'muzzle': lv >= 7,
        'armor': lv >= 4,
        'red': lv >= 9,
        'legend': lv >= 10,
    }


# ================================================================= 主渲染
def render(level=1, branch=None, size=256, team='blue'):
    W = size * SS
    img = canvas(W)
    p = lp(level)
    cx, cy = W * 0.50, W * 0.585
    rb = W * p['base_r']
    rt = W * p['turret_r']
    blen = W * p['barrel_len']
    bw = W * p['barrel_w']

    if team == 'red':
        P.metal_dk = hx('#4e1812')
        P.metal = hx('#b8483f')
        P.metal_lt = hx('#e0786f')
        P.metal_hi = hx('#f8b0a8')

    # ① 地面阴影
    img = ellipse_shadow(img, cx, cy + rb * SQ * 0.98, rb * 1.02, rb * SQ * 0.34, 5 * SS, 125)

    # ② 双层底座
    img, r_up, cy_up = draw_base(img, W, cx, cy, rb, p['style'])

    # ③ 底座铆钉
    if p['rivets'] >= 4:
        d = ImageDraw.Draw(img)
        n = p['rivets']
        for i in range(n):
            a = math.pi / 8 + i * 2 * math.pi / n
            x = cx + math.cos(a) * rb * 0.90
            y = cy + math.sin(a) * rb * 0.90 * SQ
            r = W * 0.0125
            c = P.gold if p['gold'] else P.steel_lt
            d.ellipse([x - r, y - r, x + r, y + r], fill=R(shade(c, 0.58)))
            d.ellipse([x - r * 0.9, y - r * 0.9, x + r * 0.9, y + r * 0.9], fill=R(c))
            d.ellipse([x - r * 0.44, y - r * 0.44, x + r * 0.44, y + r * 0.44],
                      fill=R(shade(c, 1.5)))

    # ④ 齿轮（嵌在上层台阶两侧）
    if p['gear']:
        draw_gear(img, W, cx - r_up * 0.72, cy_up + r_up * SQ * 0.42, W * 0.044, 7,
                  P.gold if p['gold'] else P.steel)
        draw_gear(img, W, cx + r_up * 0.72, cy_up + r_up * SQ * 0.42, W * 0.038, 6,
                  P.gold if p['gold'] else P.steel)

    # ⑤ 金色饰带
    if p['gold']:
        gold_band(img, W, cx, cy_up, r_up, 2.4)

    # ⑤.5 皮带（必须在炮室**之前**画，否则皮带的后半圈会盖到炮室上）
    if p['strap']:
        leather_band(img, W, cx, cy_up, r_up)

    # ⑥ 炮管（先画 → 被炮室盖住根部，形成"从炮室后面伸出来"的自然结构）
    turret_cy = cy_up - rt * 0.30
    ang = math.radians(-33)
    # 炮管起点沿方向偏移一点，让更多管身露在炮室外
    root_u = rt * 0.30
    rx0 = cx + math.cos(ang) * root_u
    ry0 = turret_cy + math.sin(ang) * root_u
    if branch == 'twin':
        off = bw * 0.56
        for s in (-1, 1):
            ox = -math.sin(ang) * off * s
            oy = math.cos(ang) * off * s
            draw_barrel(img, W, rx0 + ox, ry0 + oy, ang, blen * 0.92,
                        bw * 0.80, level, 0.95, p['muzzle'])
    elif branch == 'bigcannon':
        draw_barrel(img, W, rx0, ry0, ang, blen * 0.90, bw, level, 1.85, True)
    else:
        draw_barrel(img, W, rx0, ry0, ang, blen, bw, level, 1.0, p['muzzle'])

    # ⑦ 炮室（盖住炮管根部）
    img = draw_turret(img, W, cx, turret_cy, rt, level)

    # ⑦.5 侧翼装甲板（Lv3+，等级越高层数越多 —— 强化"中级→高级"的体积差）
    img = draw_shoulder_armor(img, W, cx, turret_cy, rt, level)

    # ⑦.6 炮室一圈螺栓（Lv5+）
    img = draw_turret_rim_bolts(img, W, cx, turret_cy, rt, level, p['gold'])

    # ⑧ 能量水晶（炮室前方的宝石，不遮挡炮室主体）
    if p['crystal']:
        cr = rt * (0.30 + 0.08 * ((level - 5) / 5.0))
        # 只有「巨炮分支」用橙色火焰晶体；满级金色形态用金白晶体；其余用蓝色
        if branch == 'bigcannon':
            ccol = P.fire
        elif p['legend']:
            ccol = P.gold_lt
        else:
            ccol = P.crystal
        draw_crystal(img, W, cx - rt * 0.04, turret_cy + rt * 0.40, cr, ccol)

    # ⑨ 红色点缀（Lv9+，炮室顶上两颗）
    if p['red']:
        for s in (-1, 1):
            draw_crystal(img, W, cx + s * rt * 0.56, turret_cy - rt * 0.50,
                         W * 0.021, P.red, bloom=False)

    # ⑩ 皮带（已提前到炮室之前绘制，见 ⑤.5）

    # ⑪ 传说
    if p['legend']:
        draw_aura(img, W, cx, cy + rb * SQ * 0.30, rb * 0.96, P.gold)
        draw_crown(img, W, cx, turret_cy - rt * 1.42, W * 0.056, P.gold)

    img = grain(img, 4)
    return img.resize((size, size), Image.LANCZOS)


def export_all(size=256):
    for lv in range(1, 11):
        render(lv, None, size).save(os.path.join(OUT, f'cannon_lv{lv:02d}.png'))
    for lv in (5, 7, 10):
        render(lv, 'twin', size).save(os.path.join(OUT, f'cannon_twin_lv{lv:02d}.png'))
        render(lv, 'bigcannon', size).save(os.path.join(OUT, f'cannon_big_lv{lv:02d}.png'))
    render(10, None, size, team='red').save(os.path.join(OUT, 'cannon_red_lv10.png'))
    print('exported to', os.path.abspath(OUT))


if __name__ == '__main__':
    export_all()

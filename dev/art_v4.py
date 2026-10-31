# -*- coding: utf-8 -*-
"""
炮塔升级序列图标生成器 v4
风格：皇室战争式欧美卡通策略游戏 UI 资产
修正 v3 的构图问题：
  · 炮管加长加粗，炮根明确嵌入炮室（不再像"插穿"）
  · 水晶移到炮室前方，避开炮管路径
  · 底座加厚侧壁，增强体积感
  · 皮带环绕底座轮廓，不再横穿
  · 皇冠重画（尖顶 + 底座环）
  · 分层明确：地面阴影 → 底座侧壁 → 底座顶面 → 炮室 → 炮管 → 水晶 → 装饰
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 5
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v4')
os.makedirs(OUT, exist_ok=True)


# ================================================================= 工具
def hx(h):
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


def m_ell(W, cx, cy, rx, ry):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return m


def m_poly(W, pts):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m


def radial(W, cx, cy, radius, stops, lx=-0.30, ly=-0.34, spread=1.7):
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    px, py = cx + lx * radius, cy + ly * radius
    d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2) / (radius * spread)
    d = np.clip(d, 0, 1)
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


def soft_shadow(img, cx, cy, rx, ry, bl, alpha=115):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                              fill=(8, 12, 22, alpha))
    return Image.alpha_composite(img, blur(l, bl))


def ao(img, cx, cy, rx, ry, bl, alpha=120):
    l = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                              fill=(6, 10, 20, alpha))
    return Image.alpha_composite(img, blur(l, bl))


def grain(img, s=5):
    W = img.size[0]
    rng = np.random.default_rng(11)
    n = rng.normal(0, s, (W, W, 1)).repeat(3, axis=2)
    a = np.array(img, dtype=np.int16)[:, :, :3] + n.astype(np.int16)
    a = np.clip(a, 0, 255).astype(np.uint8)
    out = Image.fromarray(a, 'RGB').convert('RGBA')
    out.putalpha(img.getchannel('A'))
    return out


# ================================================================= 调色板
class P:
    metal_dk = hx('#1b3358')
    metal = hx('#3a66b0')
    metal_lt = hx('#6f9ce0')
    metal_hi = hx('#b4d2f8')
    steel_dk = hx('#42506a')
    steel = hx('#8b98ad')
    steel_lt = hx('#c8d2e2')
    stone_dk = hx('#333a48')
    stone = hx('#646c7c')
    stone_lt = hx('#929aab')
    wood_dk = hx('#4e3218')
    wood = hx('#94663a')
    wood_lt = hx('#c9985c')
    gold_dk = hx('#8a6018')
    gold = hx('#dfae3c')
    gold_lt = hx('#ffe392')
    leather = hx('#5e381e')
    leather_lt = hx('#8a5430')
    crystal = hx('#5ad0ff')
    crystal_lt = hx('#cff5ff')
    fire = hx('#ff8a3a')
    red = hx('#d63c32')
    red_lt = hx('#ff8878')
    line = hx('#141922')


def oct_pts(cx, cy, r, sq=0.58, rot=math.pi / 8, dy=0.0):
    return [(cx + math.cos(rot + i * math.pi / 4) * r,
             cy + dy + math.sin(rot + i * math.pi / 4) * r * sq) for i in range(8)]


# ================================================================= 底座
def draw_base(img, W, cx, cy, rb, style, thick=0.055):
    """八边形底座：侧壁 + 顶面 + 倒角 + 纹理"""
    d = ImageDraw.Draw(img)
    sq = 0.58
    th = W * thick

    top = oct_pts(cx, cy, rb, sq)
    bot = oct_pts(cx, cy + th, rb * 0.995, sq)

    # 侧壁（用顶面底边 + 底面底边围成的带状）
    side_pts = [top[5], top[6], top[7], top[0], top[1],
                bot[1], bot[0], bot[7], bot[6], bot[5]]
    # 更可靠：直接构造下侧多边形
    side_deg = [(top[5]), (top[6]), (top[7]), (top[0]),
                (bot[0]), (bot[7]), (bot[6]), (bot[5])]
    if style == 'wood':
        g = lin(W, (0, cy - rb * sq), (0, cy + rb * sq + th),
                [(0.0, '#7a4e22'), (0.55, '#5e3a18'), (1.0, '#3a2410')])
    elif style == 'gold':
        g = lin(W, (0, cy - rb * sq), (0, cy + rb * sq + th),
                [(0.0, '#a87a20'), (0.55, '#7a5814'), (1.0, '#4a3410')])
    else:
        g = lin(W, (0, cy - rb * sq), (0, cy + rb * sq + th),
                [(0.0, '#454d5c'), (0.55, '#333a47'), (1.0, '#1f242e')])
    paste(img, g, m_poly(W, side_deg))
    d.line(side_deg + [side_deg[0]], fill=R(P.line), width=int(2.6 * SS), joint='curve')

    # 顶面
    if style == 'wood':
        g2 = radial(W, cx, cy - rb * sq * 0.2, rb * 1.35,
                    [(0.0, '#d8a266'), (0.42, '#a87442'), (1.0, '#6e4620')])
    elif style == 'gold':
        g2 = radial(W, cx, cy - rb * sq * 0.2, rb * 1.35,
                    [(0.0, '#ffeaa8'), (0.40, '#dfae3c'), (1.0, '#8a6018')])
    else:
        g2 = radial(W, cx, cy - rb * sq * 0.2, rb * 1.35,
                    [(0.0, '#b4bcca'), (0.42, '#767e8f'), (1.0, '#454c5a')])
    paste(img, g2, m_poly(W, top))
    d.line(top + [top[0]], fill=R(P.line), width=int(2.6 * SS), joint='curve')

    # 倒角亮线
    bevel = oct_pts(cx, cy - th * 0.06, rb * 0.90, sq)
    d.line(bevel + [bevel[0]],
           fill=R(shade(P.stone_lt if style == 'stone' else P.wood_lt, 1.12), 200),
           width=int(1.8 * SS), joint='curve')

    # 纹理
    if style == 'wood':
        for i in range(5):
            yy = cy - rb * sq * 0.62 + i * rb * sq * 0.30
            d.line([(cx - rb * 0.70, yy), (cx + rb * 0.70, yy)],
                   fill=R(P.wood_dk, 110), width=int(1.4 * SS))
        # 木板拼缝
        for i in (-1, 0, 1):
            xx = cx + i * rb * 0.46
            d.line([(xx, cy - rb * sq * 0.66), (xx, cy + rb * sq * 0.66)],
                   fill=R(P.wood_dk, 130), width=int(1.6 * SS))
    else:
        for i in range(8):
            a = i * 2 * math.pi / 8 + 0.20
            d.line([(cx + math.cos(a) * rb * 0.28, cy + math.sin(a) * rb * 0.28 * sq),
                    (cx + math.cos(a) * rb * 0.92, cy + math.sin(a) * rb * 0.92 * sq)],
                   fill=R(P.stone_dk, 110), width=int(1.5 * SS))
        # 内侧石圈
        ring = oct_pts(cx, cy, rb * 0.58, sq)
        d.line(ring + [ring[0]], fill=R(P.stone_dk, 100), width=int(1.4 * SS), joint='curve')
    return img


def band_around_base(img, W, cx, cy, rb, color, width=2.4, dy=0.0, sq=0.58):
    """环绕底座的饰带（跟随八边形轮廓）"""
    d = ImageDraw.Draw(img)
    pts = oct_pts(cx, cy + dy, rb * 1.005, sq)
    d.line(pts + [pts[0]], fill=R(color, 240), width=int(width * SS), joint='curve')
    d.line(pts + [pts[0]], fill=R(shade(color, 1.5), 130),
           width=int(width * 0.36 * SS), joint='curve')
    return img


def strap_around_base(img, W, cx, cy, rb, sq=0.58):
    """环绕底座的皮带（皮革 + 缝线 + 金扣）"""
    d = ImageDraw.Draw(img)
    pts = oct_pts(cx, cy + W * 0.030, rb * 0.94, sq)
    d.line(pts + [pts[0]], fill=R(P.leather), width=int(0.036 * W))
    d.line(pts + [pts[0]], fill=R(P.leather_lt, 150), width=int(0.014 * W))
    d.line(pts + [pts[0]], fill=R(hx('#2e1a0c'), 170), width=int(0.004 * W))
    # 前侧金扣
    for i in (5, 6, 7, 0):
        x, y = pts[i]
        d.ellipse([x - W * 0.011, y - W * 0.011, x + W * 0.011, y + W * 0.011],
                  fill=R(P.gold_dk))
        d.ellipse([x - W * 0.008, y - W * 0.008, x + W * 0.008, y + W * 0.008],
                  fill=R(P.gold))
    return img


# ================================================================= 炮室
def draw_turret(img, W, cx, cy, rt, level):
    """半球形炮室"""
    d = ImageDraw.Draw(img)

    # AO
    img = ao(img, cx, cy + rt * 0.52, rt * 1.10, rt * 0.34, 3.4 * SS, 130)
    d = ImageDraw.Draw(img)

    # 下半部（暗，代表侧壁）
    m1 = m_ell(W, cx, cy + rt * 0.20, rt, rt * 0.82)
    paste(img, radial(W, cx, cy + rt * 0.20, rt * 1.2,
                      [(0.0, '#4a77c0'), (0.5, '#2b4d85'), (1.0, '#16294a')]), m1)
    d.ellipse([cx - rt, cy + rt * 0.20 - rt * 0.82,
               cx + rt, cy + rt * 0.20 + rt * 0.82],
              outline=R(P.line), width=int(2.6 * SS))

    # 上半部（亮，顶面）
    m2 = m_ell(W, cx, cy - rt * 0.14, rt, rt * 0.80)
    paste(img, radial(W, cx, cy - rt * 0.14, rt * 1.25,
                      [(0.0, '#cfe4fc'), (0.26, '#7fa8e8'), (0.62, '#3f6db8'), (1.0, '#1e3457')]), m2)
    d.ellipse([cx - rt, cy - rt * 0.14 - rt * 0.80,
               cx + rt, cy - rt * 0.14 + rt * 0.80],
              outline=R(P.line), width=int(2.6 * SS))

    # 柔和高光
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - rt * 0.66, cy - rt * 0.72,
                                cx - rt * 0.05, cy - rt * 0.18],
                               fill=(255, 255, 255, 165))
    img.alpha_composite(blur(hl, 2.6 * SS))

    # 装甲分割线（Lv4+）
    d = ImageDraw.Draw(img)
    if level >= 4:
        n = 5 if level < 8 else 7
        for i in range(n):
            a = math.pi * (1.06 + i * 0.86 / n)
            x1 = cx + math.cos(a) * rt * 0.30
            y1 = cy - rt * 0.10 + math.sin(a) * rt * 0.30 * 0.82
            x2 = cx + math.cos(a) * rt * 0.95
            y2 = cy - rt * 0.10 + math.sin(a) * rt * 0.95 * 0.82
            d.line([(x1, y1), (x2, y2)], fill=R(P.metal_dk, 170), width=int(2.0 * SS))

    # 炮室铆钉环（Lv5+）
    if level >= 5:
        pts = []
        for i in range(8):
            a = math.pi * (1.04 + i * 0.92 / 8)
            pts.append((cx + math.cos(a) * rt * 0.78,
                        cy - rt * 0.10 + math.sin(a) * rt * 0.78 * 0.80))
        draw_rivets(img, W, pts, W * 0.0105, P.steel_lt)
    return img


def draw_rivets(img, W, pts, r, c):
    d = ImageDraw.Draw(img)
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=R(shade(c, 0.62)))
        d.ellipse([x - r * 0.92, y - r * 0.92, x + r * 0.92, y + r * 0.92], fill=R(c))
        d.ellipse([x - r * 0.50, y - r * 0.50, x + r * 0.50, y + r * 0.50],
                  fill=R(shade(c, 1.5)))
        d.ellipse([x - r, y - r, x + r, y + r], outline=R(P.line, 160),
                  width=int(0.8 * SS))
    return img


# ================================================================= 炮管
def draw_barrel(img, W, cx, cy, ang, blen, bw, level, heavy=1.0, muzzle=False):
    """炮管：从 (cx,cy) 沿 ang 方向伸出 blen 长，粗细 bw"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = bw * 0.5 * heavy

    # 炮管在底座上的投影
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(sh).line([(cx + hw * 0.5, cy + hw * 0.7),
                             (cx + ux * blen + hw * 0.5, cy + uy * blen + hw * 0.7)],
                            fill=(6, 10, 20, 95), width=int(hw * 2.1))
    img.alpha_composite(blur(sh, 3.4 * SS))
    d = ImageDraw.Draw(img)

    # 管身
    q = [(cx + px * hw, cy + py * hw),
         (cx + ux * blen + px * hw, cy + uy * blen + py * hw),
         (cx + ux * blen - px * hw, cy + uy * blen - py * hw),
         (cx - px * hw, cy - py * hw)]
    paste(img, lin(W, (q[0][0], q[0][1]), (q[3][0], q[3][1]),
                   [(0.0, '#1d3557'), (0.20, '#547ec4'), (0.42, '#a8c8f5'),
                    (0.62, '#6f9ce0'), (0.82, '#3a66b0'), (1.0, '#182a48')]),
          m_poly(W, q))
    d.polygon(q, outline=R(P.line), width=int(2.6 * SS))

    # 铁箍
    nb = 2 if level < 5 else 3
    for i in range(nb):
        t = (i + 1) / (nb + 1)
        bx, by = cx + ux * blen * t, cy + uy * blen * t
        bwid = hw * 1.20
        d.line([(bx + px * bwid, by + py * bwid), (bx - px * bwid, by - py * bwid)],
               fill=R(P.steel_dk), width=int(hw * 0.34))
        d.line([(bx + px * bwid, by + py * bwid), (bx - px * bwid, by - py * bwid)],
               fill=R(P.steel), width=int(hw * 0.22))
        d.line([(bx - px * bwid * 0.55, by - py * bwid * 0.55),
                (bx - px * bwid * 0.10, by - py * bwid * 0.10)],
               fill=R(P.steel_lt, 190), width=int(hw * 0.07))

    # 炮口制退器
    if muzzle or level >= 7:
        tx, ty = cx + ux * blen, cy + uy * blen
        ml = hw * 0.95
        mo = hw * 1.44
        q2 = [(tx + px * mo, ty + py * mo),
              (tx + ux * ml + px * mo, ty + uy * ml + py * mo),
              (tx + ux * ml - px * mo, ty + uy * ml - py * mo),
              (tx - px * mo, ty - py * mo)]
        paste(img, lin(W, (q2[0][0], q2[0][1]), (q2[3][0], q2[3][1]),
                       [(0.0, '#141c2c'), (0.22, '#5a6578'), (0.45, '#c2cbdb'),
                        (0.70, '#6a7488'), (1.0, '#1e2634')]), m_poly(W, q2))
        d.polygon(q2, outline=R(P.line), width=int(2.6 * SS))
        # 制退器箍线
        for gk in (0.26, 0.60, 0.88):
            gx, gy = tx + ux * ml * gk, ty + uy * ml * gk
            d.line([(gx + px * mo * 0.98, gy + py * mo * 0.98),
                    (gx - px * mo * 0.98, gy - py * mo * 0.98)],
                   fill=R(shade(P.steel_dk, 0.85), 200), width=int(hw * 0.10))
        # 炮口
        mx0, my0 = tx + ux * ml * 0.96, ty + uy * ml * 0.96
        hr = hw * 0.86
        d.ellipse([mx0 - hr * 1.06, my0 - hr * 0.98, mx0 + hr * 1.06, my0 + hr * 0.98],
                  fill=R(hx('#0e1218')))
        d.ellipse([mx0 - hr * 0.80, my0 - hr * 0.74, mx0 + hr * 0.80, my0 + hr * 0.74],
                  fill=R(hx('#05070a')))
        # 口沿高光
        d.arc([mx0 - hr * 1.06, my0 - hr * 0.98, mx0 + hr * 1.06, my0 + hr * 0.98],
              200, 330, fill=R(P.steel_lt, 200), width=int(hw * 0.14))

    # 顶部高光条（柔和）
    hi = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hi).line([(cx + px * hw * 0.56, cy + py * hw * 0.56),
                             (cx + ux * blen * 0.94 + px * hw * 0.56,
                              cy + uy * blen * 0.94 + py * hw * 0.56)],
                            fill=(255, 255, 255, 140), width=int(hw * 0.24))
    img.alpha_composite(blur(hi, 1.4 * SS))
    return img


# ================================================================= 水晶
def draw_crystal(img, W, cx, cy, r, color, bloom=True, facets=True):
    if bloom:
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(5):
            rr = r * (3.0 - k * 0.52)
            gd.ellipse([cx - rr, cy - rr * 0.96, cx + rr, cy + rr * 0.96],
                       fill=R(color, 30 + k * 24))
        img.alpha_composite(blur(gl, 3.6 * SS))

    d = ImageDraw.Draw(img)
    n = 6
    pts = [(cx + math.cos(-math.pi / 2 + i * 2 * math.pi / n) * r,
            cy + math.sin(-math.pi / 2 + i * 2 * math.pi / n) * r * 0.94) for i in range(n)]
    paste(img, radial(W, cx, cy, r * 1.5,
                      [(0.0, '#ffffff'), (0.18, '#e4f8ff'), (0.42, '#8ae0ff'),
                       (0.70, '#2eb4e8'), (1.0, '#0e6a94')]), m_poly(W, pts))
    d.polygon(pts, outline=R(shade(color, 0.45)), width=int(2.0 * SS))
    if facets:
        for i in range(n):
            a1 = -math.pi / 2 + i * 2 * math.pi / n
            a2 = -math.pi / 2 + (i + 1) * 2 * math.pi / n
            d.line([(cx, cy),
                    (cx + math.cos(a1) * r * 0.94, cy + math.sin(a1) * r * 0.94 * 0.94)],
                   fill=R(shade(color, 1.4), 120), width=int(1.4 * SS))
    # 高光
    d.ellipse([cx - r * 0.40, cy - r * 0.60, cx + r * 0.02, cy - r * 0.20],
              fill=(255, 255, 255, 235))
    d.ellipse([cx - r * 0.26, cy - r * 0.46, cx - r * 0.06, cy - r * 0.28],
              fill=(255, 255, 255, 255))
    return img


def draw_gear(img, W, cx, cy, r, teeth, c):
    d = ImageDraw.Draw(img)
    pts = []
    n = teeth * 2
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r if i % 2 == 0 else r * 0.74
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.92))
    d.polygon(pts, fill=R(shade(c, 0.8)))
    d.line(pts + [pts[0]], fill=R(P.line, 200), width=int(1.6 * SS), joint='curve')
    d.ellipse([cx - r * 0.62, cy - r * 0.57, cx + r * 0.62, cy + r * 0.57], fill=R(c))
    d.ellipse([cx - r * 0.50, cy - r * 0.46, cx + r * 0.26, cy + r * 0.16],
              fill=R(shade(c, 1.45), 180))
    d.ellipse([cx - r * 0.24, cy - r * 0.22, cx + r * 0.24, cy + r * 0.22],
              fill=R(hx('#0e1218')))
    return img


def draw_crown(img, W, cx, cy, r, c):
    """尖顶皇冠：底座环 + 5 个尖 + 宝石"""
    d = ImageDraw.Draw(img)
    # 冠体
    body = [(cx - r, cy + r * 0.30), (cx - r * 0.86, cy - r * 0.42),
            (cx - r * 0.44, cy + r * 0.06), (cx, cy - r * 0.72),
            (cx + r * 0.44, cy + r * 0.06), (cx + r * 0.86, cy - r * 0.42),
            (cx + r, cy + r * 0.30)]
    d.polygon(body, fill=R(c))
    d.polygon(body, outline=R(P.line), width=int(2.4 * SS))
    # 受光面
    d.polygon([(cx - r, cy + r * 0.30), (cx - r * 0.86, cy - r * 0.42),
               (cx - r * 0.40, cy + r * 0.10)],
              fill=R(shade(c, 1.40)))
    # 冠底环
    d.line([(cx - r * 1.02, cy + r * 0.30), (cx + r * 1.02, cy + r * 0.30)],
           fill=R(shade(c, 0.62)), width=int(r * 0.34))
    # 尖顶宝珠
    for xx, yy in [(-r * 0.86, -r * 0.52), (cx and 0, -r * 0.84), (r * 0.86, -r * 0.52)]:
        gx = cx + (xx if isinstance(xx, float) else 0)
        gy = cy + yy
        d.ellipse([gx - r * 0.11, gy - r * 0.11, gx + r * 0.11, gy + r * 0.11],
                  fill=R(P.gold_lt))
    # 中央宝石
    d.ellipse([cx - r * 0.15, cy + r * 0.02, cx + r * 0.15, cy + r * 0.32],
              fill=R(P.red_lt))
    return img


def draw_aura(img, W, cx, cy, r, c, rings=4):
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for k in range(rings):
        rr = r * (1.06 + k * 0.10)
        gd.ellipse([cx - rr, cy - rr * 0.62, cx + rr, cy + rr * 0.62],
                   outline=R(c, 145 - k * 30), width=int(2.4 * SS))
    img.alpha_composite(blur(gl, 2.6 * SS))
    return img


# ================================================================= 等级参数
def lp(lv):
    t = (lv - 1) / 9.0
    return {
        'base_r': 0.285 + 0.095 * t,
        'style': 'wood' if lv <= 2 else ('gold' if lv >= 10 else 'stone'),
        'turret_r': 0.125 + 0.072 * t,
        'barrel_len': 0.290 + 0.190 * t,
        'barrel_w': 0.092 + 0.080 * t,
        'rivets': 0 if lv < 2 else (4 if lv < 4 else (8 if lv < 8 else 12)),
        'gear': lv >= 3,
        'strap': lv >= 4,
        'crystal': lv >= 5,
        'gold': lv >= 6,
        'muzzle': lv >= 7,
        'heavy': lv >= 8,
        'red': lv >= 9,
        'legend': lv >= 10,
    }


# ================================================================= 主渲染
def render(level=1, branch=None, size=256, team='blue'):
    W = size * SS
    img = canvas(W)
    p = lp(level)
    cx, cy = W * 0.50, W * 0.60
    rb = W * p['base_r']
    rt = W * p['turret_r']
    blen = W * p['barrel_len']
    bw = W * p['barrel_w']

    # 主色替换（红方）
    if team == 'red':
        global _METAL
        P.metal_dk = hx('#5e1e18')
        P.metal = hx('#b8483f')
        P.metal_lt = hx('#e0786f')
        P.metal_hi = hx('#f8b0a8')

    # ① 地面软阴影
    img = soft_shadow(img, cx, cy + rb * 0.58, rb * 1.04, rb * 0.32, 5 * SS, 120)

    # ② 底座
    img = draw_base(img, W, cx, cy, rb, p['style'])

    # ③ 底座铆钉
    if p['rivets'] >= 4:
        pts = []
        n = p['rivets']
        for i in range(n):
            a = math.pi / 8 + i * 2 * math.pi / n
            pts.append((cx + math.cos(a) * rb * 0.82,
                        cy + math.sin(a) * rb * 0.82 * 0.58))
        draw_rivets(img, W, pts, W * 0.0125, P.gold if p['gold'] else P.steel_lt)

    # ④ 齿轮
    if p['gear']:
        draw_gear(img, W, cx - rb * 0.70, cy + rb * 0.05, W * 0.042, 7,
                  P.gold if p['gold'] else P.steel)
        draw_gear(img, W, cx + rb * 0.70, cy + rb * 0.05, W * 0.036, 6,
                  P.gold if p['gold'] else P.steel)

    # ⑤ 金色饰带
    if p['gold']:
        band_around_base(img, W, cx, cy, rb, P.gold, 2.6)

    # ⑥ 炮室
    turret_cy = cy - rt * 0.16
    img = draw_turret(img, W, cx, turret_cy, rt, level)

    # ⑦ 炮管
    ang = math.radians(-32)
    if branch == 'twin':
        off = bw * 0.62
        for s in (-1, 1):
            ox = -math.sin(ang) * off * s
            oy = math.cos(ang) * off * s
            draw_barrel(img, W, cx + ox, turret_cy + oy, ang, blen * 0.90,
                        bw * 0.80, level, 0.95, p['muzzle'])
    elif branch == 'bigcannon':
        draw_barrel(img, W, cx, turret_cy, ang, blen * 0.88, bw, level, 1.90, True)
    else:
        draw_barrel(img, W, cx, turret_cy, ang, blen, bw, level, 1.0, p['muzzle'])

    # ⑧ 能量水晶（放在炮室**前方偏下**，避开炮管路径）
    if p['crystal']:
        cr = rt * (0.50 + 0.12 * ((level - 5) / 5.0))
        ccx = cx - rt * 0.20
        ccy = turret_cy + rt * 0.46
        ccol = P.fire if (branch == 'bigcannon' or p['red']) else P.crystal
        draw_crystal(img, W, ccx, ccy, cr, ccol)

    # ⑨ 红色点缀
    if p['red']:
        for s in (-1, 1):
            draw_crystal(img, W, cx + s * rt * 0.62, turret_cy - rt * 0.52,
                         W * 0.024, P.red, bloom=False, facets=False)

    # ⑩ 皮带
    if p['strap']:
        strap_around_base(img, W, cx, cy, rb)

    # ⑪ 传说皇冠 + 光环
    if p['legend']:
        draw_aura(img, W, cx, cy, rb, P.gold)
        draw_crown(img, W, cx, turret_cy - rt * 1.30, W * 0.050, P.gold)

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

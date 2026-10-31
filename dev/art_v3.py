# -*- coding: utf-8 -*-
"""
炮塔升级序列图标生成器 v3
目标风格：皇室战争式欧美卡通策略游戏 UI 资产
  · 圆润夸张造型 + 清晰轮廓线 + 彩色手绘质感
  · 略微倾斜的等距视角（能看到顶面 + 一点侧面厚度）
  · 玩具模型般的可爱感，但有战斗力
  · 金属 / 木头 / 宝石 / 能量水晶 / 铆钉 / 皮带 / 小齿轮 / 轻微磨损
  · 蓝色为主，高级形态加入红色与金色点缀
  · 明显体积感、柔和高光、软阴影、环境光遮蔽（AO）
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 4                      # 超采样倍数
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v3')
os.makedirs(OUT, exist_ok=True)


# ================================================================= 基础工具
def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def shade(c, f):
    """f<1 变暗, f>1 变亮（向白色靠）"""
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


def mask_ellipse(W, cx, cy, rx, ry):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return m


def mask_poly(W, pts):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).polygon([(x, y) for x, y in pts], fill=255)
    return m


def mask_rrect(W, box, r):
    m = Image.new('L', (W, W), 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=r, fill=255)
    return m


def radial_rgba(W, cx, cy, radius, stops, lx=0.38, ly=0.32, power=1.0):
    """全画布径向渐变（用于球体/圆柱的体积光）。
    stops: [(pos0..1, '#rrggbb'), ...]
    lx, ly: 光源位置（相对半径的比例，0.5 为正中心）"""
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    px = cx - radius * (0.5 - lx) * 2 * 0.55
    py = cy - radius * (0.5 - ly) * 2 * 0.55
    d = np.sqrt((xx - px) ** 2 + ((yy - py) * 1.0) ** 2) / (radius * 1.75)
    d = np.clip(d, 0, 1) ** power

    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([hx(s[1]) for s in stops], dtype=np.float32)
    out = np.zeros((W, W, 4), dtype=np.uint8)
    for ch in range(3):
        out[..., ch] = np.interp(d, pos, cols[:, ch]).astype(np.uint8)
    out[..., 3] = 255
    return Image.fromarray(out, 'RGBA')


def linear_rgba(W, p1, p2, stops):
    """两色线性渐变（垂直于 p1→p2 方向），用于圆柱侧面"""
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy) or 1
    d = ((xx - p1[0]) * dx + (yy - p1[1]) * dy) / (L * L)
    d = np.clip(d, 0, 1)
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.array([hx(s[1]) for s in stops], dtype=np.float32)
    out = np.zeros((W, W, 4), dtype=np.uint8)
    for ch in range(3):
        out[..., ch] = np.interp(d, pos, cols[:, ch]).astype(np.uint8)
    out[..., 3] = 255
    return Image.fromarray(out, 'RGBA')


def soft_shadow(img, cx, cy, rx, ry, bl, alpha=120):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                                  fill=(8, 12, 22, alpha))
    return Image.alpha_composite(img, blur(layer, bl))


def paste(img, grad_layer, mask):
    img.paste(grad_layer, (0, 0), mask)
    return img


def draw_grain(img, strength=8):
    """轻微磨损纹理：叠一层极淡的噪点"""
    W = img.size[0]
    rng = np.random.default_rng(7)
    n = rng.normal(0, strength, (W, W, 1)).repeat(3, axis=2)
    arr = np.array(img, dtype=np.int16)[:, :, :3].astype(np.int16)
    arr = np.clip(arr + n, 0, 255).astype(np.uint8)
    out = Image.fromarray(arr, 'RGB').convert('RGBA')
    out.putalpha(img.getchannel('A'))
    return out


# ================================================================= 配色
class Pal:
    def __init__(self, team='blue'):
        if team == 'blue':
            self.metal_dk = hx('#1e3a68')
            self.metal = hx('#3f6db8')
            self.metal_lt = hx('#6f9ce0')
            self.metal_hi = hx('#a8c8f5')
        else:
            self.metal_dk = hx('#6a241e')
            self.metal = hx('#b8483f')
            self.metal_lt = hx('#e0786f')
            self.metal_hi = hx('#f5a8a0')
        self.steel_dk = hx('#4a5568')
        self.steel = hx('#8894a8')
        self.steel_lt = hx('#c2cbdb')
        self.stone_dk = hx('#3a4150')
        self.stone = hx('#6a7280')
        self.stone_lt = hx('#959dad')
        self.wood_dk = hx('#5a3c1e')
        self.wood = hx('#9a6a38')
        self.wood_lt = hx('#c99a5e')
        self.gold_dk = hx('#9a7020')
        self.gold = hx('#e0ae3a')
        self.gold_lt = hx('#ffe08a')
        self.leather = hx('#6a3f22')
        self.leather_lt = hx('#8f5a32')
        self.crystal = hx('#5ad0ff')
        self.crystal_lt = hx('#c8f4ff')
        self.fire = hx('#ff8a3a')
        self.fire_lt = hx('#ffd27a')
        self.red = hx('#d84238')
        self.red_lt = hx('#ff8a7a')
        self.line = hx('#161b26')


# ================================================================= 组件
def base_plate(img, W, P, cx, cy, rb, style, sq=0.60):
    """底座：八边形石台/木台，带侧面厚度 + 顶面 + 倒角高光"""
    d = ImageDraw.Draw(img)
    pal = P

    def oct_pts(cx, cy, r, sq, rot=math.pi / 8):
        return [(cx + math.cos(rot + i * math.pi / 4) * r,
                 cy + math.sin(rot + i * math.pi / 4) * r * sq) for i in range(8)]

    # --- 侧面（厚度）
    side_col = pal.stone_dk if style != 'wood' else pal.wood_dk
    side = oct_pts(cx, cy + rb * sq * 0.22, rb * 0.985, sq)
    d.polygon(side, fill=R(side_col))
    d.line(side + [side[0]], fill=R(pal.line), width=int(3.0 * SS), joint='curve')

    # --- 顶面（渐变：左上亮）
    top_mask = mask_poly(W, oct_pts(cx, cy, rb, sq))
    if style == 'wood':
        g = radial_rgba(W, cx, cy - rb * sq * 0.15, rb * 1.25,
                        [(0.0, '#d8a468'), (0.45, '#b07a42'), (1.0, '#7a4e24')])
    elif style == 'gold':
        g = radial_rgba(W, cx, cy - rb * sq * 0.15, rb * 1.25,
                        [(0.0, '#ffe8a0'), (0.4, '#e0ae3a'), (1.0, '#9a7020')])
    else:
        g = radial_rgba(W, cx, cy - rb * sq * 0.15, rb * 1.25,
                        [(0.0, '#a8b0c0'), (0.4, '#737b8c'), (1.0, '#464d5b')])
    paste(img, g, top_mask)
    d.line(oct_pts(cx, cy, rb, sq) + [oct_pts(cx, cy, rb, sq)[0]],
           fill=R(pal.line), width=int(3.0 * SS), joint='curve')

    # --- 倒角高光（内侧一圈亮线）
    inner = oct_pts(cx, cy - rb * sq * 0.02, rb * 0.90, sq)
    d.line(inner + [inner[0]], fill=R(shade(pal.stone_lt if style != 'wood' else pal.wood_lt, 1.15), 190),
           width=int(2.2 * SS), joint='curve')

    # --- 砖缝 / 木纹
    if style == 'wood':
        for i in range(4):
            y = cy - rb * sq * 0.55 + i * rb * sq * 0.36
            d.line([(cx - rb * 0.72, y), (cx + rb * 0.72, y)],
                   fill=R(pal.wood_dk, 130), width=int(1.6 * SS))
    else:
        nb = 8
        for i in range(nb):
            a = i * (2 * math.pi / nb) + 0.18
            x1 = cx + math.cos(a) * rb * 0.26
            y1 = cy + math.sin(a) * rb * 0.26 * sq
            x2 = cx + math.cos(a) * rb * 0.93
            y2 = cy + math.sin(a) * rb * 0.93 * sq
            d.line([(x1, y1), (x2, y2)], fill=R(pal.stone_dk, 120), width=int(1.8 * SS))

    # --- AO：底座与地面的接触暗影
    ao = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ad = ImageDraw.Draw(ao)
    ad.ellipse([cx - rb * 0.92, cy + rb * sq * 0.18, cx + rb * 0.92, cy + rb * sq * 0.52],
               fill=(6, 10, 20, 90))
    img.alpha_composite(blur(ao, 5 * SS))
    return img


def turret_body(img, W, P, cx, cy, rt, level):
    """转塔：半球金属炮室"""
    d = ImageDraw.Draw(img)

    # AO：转塔在底座上的投影
    ao = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(ao).ellipse([cx - rt * 1.12, cy + rt * 0.10,
                                cx + rt * 1.12, cy + rt * 0.86],
                               fill=(6, 10, 20, 110))
    img.alpha_composite(blur(ao, 4 * SS))
    d = ImageDraw.Draw(img)

    # 下半球（暗）
    m1 = mask_ellipse(W, cx, cy + rt * 0.18, rt * 1.0, rt * 0.86)
    g1 = radial_rgba(W, cx, cy + rt * 0.18, rt * 1.1,
                     [(0.0, '#3f6db8'), (0.55, '#2c4f8a'), (1.0, '#1a2f55')])
    paste(img, g1, m1)
    d.ellipse([cx - rt, cy + rt * 0.18 - rt * 0.86, cx + rt, cy + rt * 0.18 + rt * 0.86],
              outline=R(P.line), width=int(3.0 * SS))

    # 上半球（亮）
    m2 = mask_ellipse(W, cx, cy - rt * 0.10, rt * 1.0, rt * 0.84)
    g2 = radial_rgba(W, cx, cy - rt * 0.10, rt * 1.15,
                     [(0.0, '#b8d4f8'), (0.30, '#6f9ce0'), (0.72, '#3f6db8'), (1.0, '#24406e')])
    paste(img, g2, m2)
    d.ellipse([cx - rt, cy - rt * 0.10 - rt * 0.84, cx + rt, cy - rt * 0.10 + rt * 0.84],
              outline=R(P.line), width=int(3.0 * SS))

    # 顶部柔和高光（左上小块）
    hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - rt * 0.60, cy - rt * 0.62,
                                cx - rt * 0.02, cy - rt * 0.08],
                               fill=R(P.metal_hi, 150))
    img.alpha_composite(blur(hl, 3 * SS))

    # 装甲板（Lv4+）
    if level >= 4:
        d = ImageDraw.Draw(img)
        n = 6 if level < 8 else 8
        for i in range(n):
            a = math.pi * (0.06 + i * 0.9 / n)
            x1 = cx + math.cos(a) * rt * 0.34
            y1 = cy - rt * 0.06 + math.sin(a) * rt * 0.34
            x2 = cx + math.cos(a) * rt * 0.94
            y2 = cy - rt * 0.06 + math.sin(a) * rt * 0.94
            d.line([(x1, y1), (x2, y2)], fill=R(shade(P.metal_dk, 1.15), 200),
                   width=int(2.4 * SS))

    return img


def barrel(img, W, P, cx, cy, ang, blen, bwid, level, heavy=1.0, muzzle=False):
    """炮管：圆柱 + 铁箍 + 制退器"""
    d = ImageDraw.Draw(img)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    hw = bwid * 0.5 * heavy

    # 炮管投影（落在底座上）
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.line([(cx + hw * 0.4, cy + hw * 0.5),
             (cx + ux * blen + hw * 0.4, cy + uy * blen + hw * 0.5)],
            fill=(6, 10, 20, 100), width=int(hw * 2.0))
    img.alpha_composite(blur(sh, 4 * SS))
    d = ImageDraw.Draw(img)

    # 管身：垂直于轴线的线性渐变（上亮下暗）→ 圆柱感
    q = [(cx + px * hw, cy + py * hw),
         (cx + ux * blen + px * hw, cy + uy * blen + py * hw),
         (cx + ux * blen - px * hw, cy + uy * blen - py * hw),
         (cx - px * hw, cy - py * hw)]
    m = mask_poly(W, q)
    g = linear_rgba(W, (cx + px * hw, cy + py * hw), (cx - px * hw, cy - py * hw),
                    [(0.0, '#2a4a7a'), (0.28, '#6f9ce0'), (0.52, '#a8c8f5'),
                     (0.78, '#4a75b8'), (1.0, '#22406e')])
    paste(img, g, m)
    d.polygon(q, outline=R(P.line), width=int(3.0 * SS))

    # 铁箍（2~3 道）
    nband = 2 if level < 5 else 3
    for i in range(nband):
        t = (i + 1) / (nband + 1)
        bx = cx + ux * blen * t
        by = cy + uy * blen * t
        bw = hw * 1.16
        d.line([(bx + px * bw, by + py * bw), (bx - px * bw, by - py * bw)],
               fill=R(shade(P.steel, 0.85)), width=int(hw * 0.30))
        d.line([(bx + px * bw * 0.92, by + py * bw * 0.92),
                (bx - px * bw * 0.92, by - py * bw * 0.92)],
               fill=R(P.steel_lt, 170), width=int(hw * 0.10))

    # 炮口制退器（Lv7+ 或显式要求）
    if muzzle or level >= 7:
        tx, ty = cx + ux * blen, cy + uy * blen
        ml = hw * 1.1
        mo = hw * 1.42
        q2 = [(tx + px * mo, ty + py * mo),
              (tx + ux * ml + px * mo, ty + uy * ml + py * mo),
              (tx + ux * ml - px * mo, ty + uy * ml - py * mo),
              (tx - px * mo, ty - py * mo)]
        m2 = mask_poly(W, q2)
        g2 = linear_rgba(W, (tx + px * mo, ty + py * mo), (tx - px * mo, ty - py * mo),
                         [(0.0, '#1a2a44'), (0.35, '#8894a8'), (0.6, '#c2cbdb'), (1.0, '#3a4558')])
        paste(img, g2, m2)
        d.polygon(q2, outline=R(P.line), width=int(3.0 * SS))
        # 制退口内孔
        hx0 = tx + ux * ml * 1.02
        hy0 = ty + uy * ml * 1.02
        ho = hw * 0.82
        d.ellipse([hx0 - ho, hy0 - ho * 0.92, hx0 + ho, hy0 + ho * 0.92],
                  fill=R(hx('#12161f')))
        d.ellipse([hx0 - ho * 0.78, hy0 - ho * 0.72, hx0 + ho * 0.78, hy0 + ho * 0.72],
                  fill=R(hx('#06080c')))
        # 铁箍高光
        for gk in (0.30, 0.68):
            gx = tx + ux * ml * gk
            gy = ty + uy * ml * gk
            d.line([(gx + px * mo, gy + py * mo), (gx - px * mo, gy - py * mo)],
                   fill=R(P.steel_lt, 120), width=int(hw * 0.09))

    # 炮管顶部柔和高光条
    hish = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hish)
    hd.line([(cx + px * hw * 0.52, cy + py * hw * 0.52),
             (cx + ux * blen * 0.95 + px * hw * 0.52, cy + uy * blen * 0.95 + py * hw * 0.52)],
            fill=(255, 255, 255, 130), width=int(hw * 0.20))
    img.alpha_composite(blur(hish, 1.6 * SS))

    return img


def rivets(img, W, P, pts, r, color=None):
    """铆钉：圆点 + 高光 + 描边"""
    d = ImageDraw.Draw(img)
    c = color or P.steel_lt
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=R(shade(c, 0.72)))
        d.ellipse([x - r * 0.9, y - r * 0.9, x + r * 0.9, y + r * 0.9], fill=R(c))
        d.ellipse([x - r * 0.52, y - r * 0.52, x + r * 0.52, y + r * 0.52],
                  fill=R(shade(c, 1.45)))
        d.ellipse([x - r, y - r, x + r, y + r], outline=R(P.line, 170),
                  width=int(1.0 * SS))
    return img


def gear(img, W, P, cx, cy, r, teeth, color=None, hole=True):
    """小齿轮"""
    d = ImageDraw.Draw(img)
    c = color or P.steel
    pts = []
    n = teeth * 2
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r if i % 2 == 0 else r * 0.76
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.92))
    d.polygon(pts, fill=R(shade(c, 0.85)))
    d.line(pts + [pts[0]], fill=R(P.line, 200), width=int(1.8 * SS), joint='curve')
    d.ellipse([cx - r * 0.66, cy - r * 0.60, cx + r * 0.66, cy + r * 0.60],
              fill=R(c))
    d.ellipse([cx - r * 0.52, cy - r * 0.48, cx + r * 0.30, cy + r * 0.18],
              fill=R(shade(c, 1.40), 170))
    if hole:
        d.ellipse([cx - r * 0.26, cy - r * 0.24, cx + r * 0.26, cy + r * 0.24],
                  fill=R(hx('#12161f')))
    return img


def leather_strap(img, W, P, p1, p2, width, studs=2):
    """皮带：棕色带 + 缝线 + 金属扣钉"""
    d = ImageDraw.Draw(img)
    d.line([p1, p2], fill=R(P.leather), width=int(width))
    d.line([p1, p2], fill=R(P.leather_lt, 140), width=int(width * 0.44))
    # 缝线
    d.line([p1, p2], fill=R(hx('#3a2210'), 150), width=int(width * 0.10))
    # 扣钉
    for i in range(studs):
        t = (i + 1) / (studs + 1)
        x = p1[0] + (p2[0] - p1[0]) * t
        y = p1[1] + (p2[1] - p1[1]) * t
        d.ellipse([x - width * 0.20, y - width * 0.20, x + width * 0.20, y + width * 0.20],
                  fill=R(P.gold))
        d.ellipse([x - width * 0.10, y - width * 0.10, x + width * 0.10, y + width * 0.10],
                  fill=R(P.gold_lt))
    return img


def crystal_core(img, W, P, cx, cy, r, color=None, bloom=True):
    """能量水晶核心：多面宝石 + 辉光"""
    c = color or P.crystal
    if bloom:
        gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(gl)
        for k in range(4):
            rr = r * (2.8 - k * 0.5)
            gd.ellipse([cx - rr, cy - rr * 0.95, cx + rr, cy + rr * 0.95],
                       fill=R(c, 36 + k * 26))
        img.alpha_composite(blur(gl, 4 * SS))

    d = ImageDraw.Draw(img)
    # 宝石主体（六边形切面）
    pts = [(cx + math.cos(-math.pi / 2 + i * math.pi / 3) * r,
            cy + math.sin(-math.pi / 2 + i * math.pi / 3) * r * 0.94) for i in range(6)]
    m = mask_poly(W, pts)
    g = radial_rgba(W, cx, cy - r * 0.2, r * 1.4,
                    [(0.0, '#ffffff'), (0.22, '#c8f4ff'), (0.55, c.hex() if hasattr(c, 'hex') else '#5ad0ff'),
                     (1.0, '#1a6e9a')])
    paste(img, g, m)
    d.polygon(pts, outline=R(shade(c, 0.5)), width=int(2.2 * SS))
    # 切面线
    for i in range(3):
        a = -math.pi / 2 + i * math.pi / 3
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92 * 0.94)],
               fill=R(shade(c, 1.3), 150), width=int(1.6 * SS))
    # 高光
    d.ellipse([cx - r * 0.34, cy - r * 0.52, cx + r * 0.04, cy - r * 0.14],
              fill=(255, 255, 255, 230))
    return img


def aura(img, W, P, cx, cy, r, color, rings=4):
    """传说光环"""
    gl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for k in range(rings):
        rr = r * (1.10 + k * 0.11)
        gd.ellipse([cx - rr, cy - rr * 0.62, cx + rr, cy + rr * 0.62],
                   outline=R(color, 150 - k * 28), width=int(2.6 * SS))
    img.alpha_composite(blur(gl, 3 * SS))
    return img


def crown(img, W, P, cx, cy, r, color):
    """顶部小皇冠（满级装饰）"""
    d = ImageDraw.Draw(img)
    pts = []
    n = 5
    for i in range(n * 2):
        a = math.pi + i * math.pi / n
        rr = r if i % 2 == 0 else r * 0.58
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.7 + r * 0.4))
    d.polygon(pts, fill=R(color))
    d.line(pts + [pts[0]], fill=R(P.line), width=int(2.0 * SS), joint='curve')
    d.ellipse([cx - r * 0.16, cy + r * 0.24, cx + r * 0.16, cy + r * 0.56],
              fill=R(P.gold_lt))
    return img


# ================================================================= 等级参数
def level_params(lv):
    """返回该等级的所有造型参数（让等级差异一眼可见）"""
    t = (lv - 1) / 9.0
    return {
        'base_r': 0.300 + 0.090 * t,          # 底座半径
        'base_style': 'wood' if lv <= 2 else ('gold' if lv >= 10 else 'stone'),
        'turret_r': 0.132 + 0.070 * t,        # 转塔半径
        'barrel_len': 0.245 + 0.175 * t,      # 炮管长度
        'barrel_w': 0.098 + 0.082 * t,        # 炮管粗细
        'rivets': 0 if lv < 2 else (4 if lv < 4 else (8 if lv < 8 else 12)),
        'gear': lv >= 3,
        'strap': lv >= 4,
        'crystal': lv >= 5,
        'gold_trim': lv >= 6,
        'muzzle': lv >= 7,
        'heavy_armor': lv >= 8,
        'red_accent': lv >= 9,
        'legend': lv >= 10,
    }


# ================================================================= 主渲染
def render_cannon(level=1, branch=None, size=256, team='blue'):
    W = size * SS
    img = canvas(W)
    P = Pal(team)
    pr = level_params(level)
    cx, cy = W * 0.50, W * 0.615

    rb = W * pr['base_r']
    rt = W * pr['turret_r']
    blen = W * pr['barrel_len']
    bwid = W * pr['barrel_w']

    # ① 地面软阴影
    img = soft_shadow(img, cx, cy + rb * 0.36, rb * 1.02, rb * 0.34, 6 * SS, 110)

    # ② 底座
    img = base_plate(img, W, P, cx, cy, rb, pr['base_style'])

    # ③ 底座铆钉
    if pr['rivets'] >= 4:
        pts = []
        n = pr['rivets']
        for i in range(n):
            a = math.pi / 8 + i * 2 * math.pi / n
            pts.append((cx + math.cos(a) * rb * 0.80,
                        cy + math.sin(a) * rb * 0.80 * 0.60))
        img = rivets(img, W, P, pts, W * 0.0135,
                     P.gold if pr['gold_trim'] else P.steel_lt)

    # ④ 小齿轮（Lv3+，嵌在底座边缘）
    if pr['gear']:
        d = ImageDraw.Draw(img)
        img = gear(img, W, P, cx - rb * 0.66, cy + rb * 0.10, W * 0.040, 7,
                   P.gold if pr['gold_trim'] else P.steel)
        img = gear(img, W, P, cx + rb * 0.66, cy + rb * 0.10, W * 0.034, 6,
                   P.gold if pr['gold_trim'] else P.steel)

    # ⑤ 转塔
    img = turret_body(img, W, P, cx, cy - rt * 0.10, rt, level)

    # ⑥ 炮管（在转塔之后画，让炮根叠在炮室上）
    ang = math.radians(-30)
    if branch == 'twin':
        off = bwid * 0.60
        for s in (-1, 1):
            ox = -math.sin(ang) * off * s
            oy = math.cos(ang) * off * s
            img = barrel(img, W, P, cx + ox, cy - rt * 0.10 + oy, ang, blen * 0.92,
                         bwid * 0.86, level, 0.92, pr['muzzle'])
    elif branch == 'bigcannon':
        img = barrel(img, W, P, cx, cy - rt * 0.10, ang, blen * 0.90,
                     bwid, level, 1.85, True)
    else:
        img = barrel(img, W, P, cx, cy - rt * 0.10, ang, blen,
                     bwid, level, 1.0, pr['muzzle'])

    # ⑦ 皮带（Lv4+，横跨底座）
    if pr['strap']:
        img = leather_strap(img, W, P,
                            (cx - rb * 0.72, cy + rb * 0.26),
                            (cx + rb * 0.72, cy + rb * 0.26),
                            W * 0.030, 3)

    # ⑧ 金色饰带（Lv6+）
    if pr['gold_trim']:
        d = ImageDraw.Draw(img)

        def oct_pts(r, sq=0.60, rot=math.pi / 8, dy=0):
            return [(cx + math.cos(rot + i * math.pi / 4) * r,
                     cy + dy + math.sin(rot + i * math.pi / 4) * r * sq) for i in range(8)]
        band = oct_pts(rb * 1.005)
        d.line(band + [band[0]], fill=R(P.gold, 235), width=int(2.8 * SS), joint='curve')
        d.line(band + [band[0]], fill=R(P.gold_lt, 120), width=int(1.2 * SS), joint='curve')

    # ⑨ 能量水晶（Lv5+）
    if pr['crystal']:
        cr = rt * (0.46 + 0.10 * ((level - 5) / 5.0))
        ccx = cx + rt * 0.10
        ccy = cy - rt * 0.26
        ccol = P.crystal
        if pr['red_accent']:
            ccol = P.fire
        if branch == 'bigcannon':
            ccol = P.fire
        img = crystal_core(img, W, P, ccx, ccy, cr, ccol)

    # ⑩ 红色高级点缀（Lv9+）
    if pr['red_accent']:
        d = ImageDraw.Draw(img)
        for side in (-1, 1):
            gx = cx + side * rb * 0.46
            gy = cy - rt * 0.62
            img = crystal_core(img, W, P, gx, gy, W * 0.022, P.red, bloom=False)

    # ⑪ 皇冠 + 光环（Lv10）
    if pr['legend']:
        img = aura(img, W, P, cx, cy, rb * 0.98, P.gold)
        img = crown(img, W, P, cx, cy - rt * 1.42, W * 0.052, P.gold)

    # ⑫ 轻微磨损纹理
    img = draw_grain(img, 5)

    return img.resize((size, size), Image.LANCZOS)


# ================================================================= 导出
def export_all(size=256):
    for lv in range(1, 11):
        render_cannon(lv, None, size).save(os.path.join(OUT, f'cannon_lv{lv:02d}.png'))
    for lv in (5, 7, 10):
        render_cannon(lv, 'twin', size).save(os.path.join(OUT, f'cannon_twin_lv{lv:02d}.png'))
        render_cannon(lv, 'bigcannon', size).save(os.path.join(OUT, f'cannon_big_lv{lv:02d}.png'))
    render_cannon(10, None, size, team='red').save(os.path.join(OUT, 'cannon_red_lv10.png'))
    print('exported to', os.path.abspath(OUT))


if __name__ == '__main__':
    export_all()

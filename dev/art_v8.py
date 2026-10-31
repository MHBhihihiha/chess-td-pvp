# -*- coding: utf-8 -*-
"""建筑 v8 主程序：7 种建筑 × 各自等级的独立结构"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter
import art_v8_lib as L
import numpy as np

SS = L.SS
OUT = L.OUT
R = L.R


# ================================================================= 底座绘制
def build_base(img, W, cx, cy, S, kind, lvl):
    """返回 (锚点x, 锚点y, 半径)"""
    if kind == 'wood_tripod':
        rb = S * 0.205
        img = L.shadow(img, cx, cy + rb * 0.82, rb * 1.24, rb * 0.34, 3.4 * SS, 110)
        L.wood_beam(img, W, (cx - rb * 0.92, cy + rb * 0.64), (cx - rb * 0.40, cy - rb * 0.28), W * 0.030)
        L.wood_beam(img, W, (cx + rb * 0.92, cy + rb * 0.64), (cx + rb * 0.40, cy - rb * 0.28), W * 0.030)
        L.wood_beam(img, W, (cx, cy + rb * 0.76), (cx, cy - rb * 0.28), W * 0.026)
        L.wood_beam(img, W, (cx - rb * 0.54, cy - rb * 0.30), (cx + rb * 0.54, cy - rb * 0.30), W * 0.032)
        return cx, cy - rb * 0.42, rb

    if kind == 'wood_cart':
        rb = S * 0.225
        img = L.shadow(img, cx, cy + rb * 0.80, rb * 1.32, rb * 0.34, 3.6 * SS, 110)
        L.oct_plinth(img, W, cx, cy - rb * 0.12, rb * 0.86, W * 0.050, L.PAL['wood'])
        L.wheel(img, W, cx - rb * 0.90, cy + rb * 0.34, S * 0.070)
        L.wheel(img, W, cx + rb * 0.90, cy + rb * 0.34, S * 0.070)
        return cx, cy - rb * 0.44, rb

    if kind == 'sandbag':
        """环形沙袋工事（不是随便堆几堆，而是围成炮位）"""
        rb = S * 0.248
        img = L.shadow(img, cx, cy + rb * 0.84, rb * 1.18, rb * 0.36, 3.8 * SS, 112)
        d = ImageDraw.Draw(img)

        def bag(bx, by, bw, bh, lit):
            base = '#d8c69c' if lit else '#bca87c'
            L.ps(img, L.rad(W, bx - bw * 0.20, by - bh * 0.40, bw * 1.7,
                            [(0.0, '#f0e0bc'), (0.42, base), (1.0, '#6e5c3c')]),
                 L.me(W, bx, by, bw, bh))
            d.ellipse([bx - bw, by - bh, bx + bw, by + bh],
                      outline=L.R(L.C_LINE), width=int(L.OL * 0.85))
            # 袋口扎绳
            d.line([(bx + bw * 0.52, by - bh * 0.28), (bx + bw * 0.86, by - bh * 0.58)],
                   fill=L.R('#8a7448'), width=int(1.8 * SS))

        # 外圈（8 个袋子围成一圈，前面留一个缺口给炮口）
        n = 10
        for ring_i, (rr, ry_scale, lit) in enumerate([(1.00, 0.50, False), (0.86, 0.44, True)]):
            for i in range(n):
                a = math.pi * 0.10 + i * (math.pi * 1.80) / (n - 1)   # 从左侧绕到右侧，前留口
                bx = cx + math.cos(a) * rb * rr
                by = cy + math.sin(a) * rb * rr * ry_scale + rb * 0.30
                bag(bx, by, rb * 0.20, rb * 0.115, lit)
        # 内侧垫底
        L.ps(img, L.rad(W, cx, cy + rb * 0.30, rb * 0.60,
                        [(0.0, '#c8b48a'), (0.5, '#9c8a62'), (1.0, '#5a4c30')]),
             L.me(W, cx, cy + rb * 0.30, rb * 0.56, rb * 0.24))
        return cx, cy - rb * 0.50, rb

    if kind == 'stone1':
        rb = S * 0.265
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.88, rb * 1.04, rb * L.SQ * 0.38, 4.0 * SS, 115)
        L.oct_plinth(img, W, cx, cy, rb, W * 0.074, L.PAL['stone'])
        return cx, cy - rb * L.SQ * 0.92, rb

    if kind == 'stone2':
        rb = S * 0.278
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.90, rb * 1.06, rb * L.SQ * 0.40, 4.1 * SS, 115)
        L.oct_plinth(img, W, cx, cy, rb, W * 0.072, L.PAL['stone'])
        r2 = rb * 0.845
        cy2 = cy - W * 0.021
        L.oct_plinth(img, W, cx, cy2, r2, W * 0.045, L.PAL['stone'])
        return cx, cy2 - r2 * L.SQ * 0.94, r2

    if kind == 'stone3':
        rb = S * 0.288
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.92, rb * 1.08, rb * L.SQ * 0.42, 4.4 * SS, 118)
        L.oct_plinth(img, W, cx, cy, rb, W * 0.070, L.PAL['stone'])
        r2 = rb * 0.845
        cy2 = cy - W * 0.020
        L.oct_plinth(img, W, cx, cy2, r2, W * 0.044, L.PAL['stone'])
        r3 = r2 * 0.845
        cy3 = cy2 - W * 0.014
        L.oct_plinth(img, W, cx, cy3, r3, W * 0.030, L.PAL['stone'])
        return cx, cy3 - r3 * L.SQ * 0.96, r3

    if kind == 'gold3':
        rb = S * 0.298
        img = L.aura(img, W, cx, cy + rb * L.SQ * 0.30, rb * 0.98)
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.96, rb * 1.10, rb * L.SQ * 0.44, 4.6 * SS, 122)
        L.oct_plinth(img, W, cx, cy, rb, W * 0.066, L.PAL['gold'])
        r2 = rb * 0.845
        cy2 = cy - W * 0.018
        L.oct_plinth(img, W, cx, cy2, r2, W * 0.042, L.PAL['gold'])
        r3 = r2 * 0.845
        cy3 = cy2 - W * 0.013
        L.oct_plinth(img, W, cx, cy3, r3, W * 0.028, L.PAL['gold'])
        return cx, cy3 - r3 * L.SQ * 0.96, r3

    if kind == 'iron_disc':
        rb = S * 0.276
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.92, rb * 1.06, rb * L.SQ * 0.40, 4.2 * SS, 115)
        L.disc_base(img, W, cx, cy, rb, W * 0.070, L.PAL['iron'])
        d = ImageDraw.Draw(img)
        for rr in (0.52, 0.80):
            d.ellipse([cx - rb * rr, cy - rb * rr * L.SQ, cx + rb * rr, cy + rb * rr * L.SQ],
                      outline=L.R('#1a2028', 110), width=int(1.3 * SS))
        pts = []
        for i in range(8):
            a = i * math.pi / 4 + 0.2
            pts.append((cx + math.cos(a) * rb * 0.90, cy + math.sin(a) * rb * 0.90 * L.SQ))
        L.rivets(img, W, pts, S * 0.0105, n=8)
        return cx, cy - rb * L.SQ * 0.96, rb

    if kind == 'iron_well':
        rb = S * 0.278
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.94, rb * 1.08, rb * L.SQ * 0.42, 4.4 * SS, 118)
        L.disc_base(img, W, cx, cy, rb, W * 0.074, L.PAL['iron'])
        # 井口（内圈凹陷）
        d = ImageDraw.Draw(img)
        d.ellipse([cx - rb * 0.64, cy - rb * 0.64 * L.SQ, cx + rb * 0.64, cy + rb * 0.64 * L.SQ],
                  fill=L.R('#1a2028'))
        d.ellipse([cx - rb * 0.64, cy - rb * 0.64 * L.SQ, cx + rb * 0.64, cy + rb * 0.64 * L.SQ],
                  outline=L.R(L.C_LINE), width=int(L.OL))
        d.ellipse([cx - rb * 0.50, cy - rb * 0.50 * L.SQ + W * 0.012,
                   cx + rb * 0.50, cy + rb * 0.50 * L.SQ + W * 0.012],
                  fill=L.R('#2a3340'))
        pts = []
        for i in range(10):
            a = i * math.pi / 5 + 0.15
            pts.append((cx + math.cos(a) * rb * 0.86, cy + math.sin(a) * rb * 0.86 * L.SQ))
        L.rivets(img, W, pts, S * 0.0105, n=10)
        return cx, cy - rb * L.SQ * 0.76, rb

    if kind == 'hex':
        rb = S * 0.284
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.94, rb * 1.06, rb * L.SQ * 0.42, 4.4 * SS, 120)
        L.hex_base(img, W, cx, cy, rb, W * 0.076, L.PAL['iron'])
        d = ImageDraw.Draw(img)
        for s in (-1, 1):
            sx = cx + s * rb * 0.94
            q = [(sx, cy - rb * L.SQ * 0.60),
                 (sx + s * S * 0.062, cy - rb * L.SQ * 0.28),
                 (sx + s * S * 0.062, cy + rb * L.SQ * 0.54),
                 (sx, cy + rb * L.SQ * 0.64)]
            L.ps(img, L.lgr(W, q[0], q[1],
                            [(0.0, '#a2acbe'), (0.45, '#5e6878'), (1.0, '#28303c')]), L.mp(W, q))
            d.polygon(q, outline=L.R(L.C_LINE), width=int(L.OL))
        return cx, cy - rb * L.SQ * 0.96, rb

    if kind == 'stone_wall':
        rb = S * 0.276
        img = L.shadow(img, cx, cy + rb * L.SQ * 0.88, rb * 1.06, rb * L.SQ * 0.38, 4.0 * SS, 115)
        L.oct_plinth(img, W, cx, cy, rb, W * 0.074, L.PAL['stone'])
        d = ImageDraw.Draw(img)
        wh = S * 0.064
        wy = cy - rb * L.SQ * 0.82
        for sx in (-1, 0, 1):
            wx = cx + sx * rb * 0.58
            ww = rb * 0.38
            y0 = wy - (wh * 0.40 if sx == 0 else 0)
            box = [(wx - ww * 0.5, y0), (wx + ww * 0.5, y0),
                   (wx + ww * 0.5, y0 + wh * 1.5), (wx - ww * 0.5, y0 + wh * 1.5)]
            L.ps(img, L.rad(W, wx, y0, ww * 0.85,
                            [(0.0, '#d2d9e4'), (0.42, '#9099a8'), (1.0, '#565f6d')]), L.mp(W, box))
            d.polygon(box, outline=L.R(L.C_LINE), width=int(L.OL))
            for k2 in range(3):
                tx = box[0][0] + (box[1][0] - box[0][0]) * (k2 + 0.5) / 3
                d.rectangle([tx - ww * 0.070, y0 - wh * 0.38, tx + ww * 0.070, y0 + wh * 0.04],
                            fill=L.R('#a8b0be'), outline=L.R(L.C_LINE), width=int(L.OL * 0.6))
        return cx, cy - rb * L.SQ * 0.92, rb

    # 兜底
    rb = S * 0.26
    img = L.shadow(img, cx, cy + rb * L.SQ * 0.88, rb * 1.04, rb * L.SQ * 0.38, 4.0 * SS, 115)
    L.oct_plinth(img, W, cx, cy, rb, W * 0.074, L.PAL['stone'])
    return cx, cy - rb * L.SQ * 0.92, rb


# ================================================================= 每种建筑的规格
# (底座, 炮口, 武器, 武器长度系数, 武器粗度系数, 附加)
SPEC = {
    'cannon': [
        ('wood_tripod', None, 'barrel', 0.19, 0.052, []),
        ('wood_cart', None, 'barrel', 0.215, 0.058, []),
        ('stone1', 'iron', 'barrel', 0.245, 0.064, []),
        ('stone_wall', 'blue', 'barrel', 0.255, 0.068, []),
        ('stone2', 'blue', 'barrel', 0.262, 0.070, ['gold_band', 'crystal']),
        ('iron_disc', 'iron', 'barrel', 0.268, 0.072, ['crystal']),
        ('iron_disc', 'iron', 'barrel', 0.276, 0.074, ['arms', 'crystal']),
        ('hex', 'hex', 'barrel', 0.280, 0.076, ['crystal']),
        ('stone3', 'blue', 'barrel', 0.286, 0.078, ['red_band', 'crystal', 'gems']),
        ('gold3', 'gold', 'barrel', 0.292, 0.080, ['crystal_gold', 'gems', 'crown']),
    ],
    'arrow': [
        ('wood_tripod', None, 'bow', 0.20, 0, []),
        ('wood_cart', None, 'bow', 0.21, 0, ['quiver']),
        ('stone1', None, 'bow', 0.23, 0, ['quiver']),
        ('stone_wall', None, 'bow', 0.235, 0, ['quiver']),
        ('stone2', 'blue', 'crossbow', 0.24, 0, ['gold_band', 'quiver']),
        ('iron_disc', 'iron', 'crossbow', 0.245, 0, ['quiver']),
        ('iron_disc', 'iron', 'crossbow', 0.25, 0, ['arms', 'quiver']),
        ('hex', 'hex', 'crossbow', 0.255, 0, ['quiver']),
        ('stone3', 'blue', 'crossbow', 0.26, 0, ['red_band', 'gems']),
        ('gold3', 'gold', 'crossbow', 0.265, 0, ['gems', 'crown']),
    ],
    'mage': [
        ('wood_tripod', None, 'staff', 0.20, 0, []),
        ('wood_cart', None, 'staff', 0.21, 0, []),
        ('stone1', None, 'staff', 0.23, 0, []),
        ('stone_wall', None, 'staff', 0.235, 0, []),
        ('stone2', 'blue', 'staff', 0.24, 0, ['gold_band', 'crystal']),
        ('iron_disc', 'iron', 'staff', 0.245, 0, ['crystal']),
        ('iron_disc', 'iron', 'staff', 0.25, 0, ['arms', 'crystal']),
        ('hex', 'hex', 'staff', 0.255, 0, ['crystal']),
        ('stone3', 'blue', 'staff', 0.26, 0, ['red_band', 'crystal', 'gems']),
        ('gold3', 'gold', 'staff', 0.265, 0, ['crystal_gold', 'gems', 'crown']),
    ],
    'mortar': [
        ('wood_tripod', None, 'mortar', 0.20, 0, []),
        ('sandbag', None, 'mortar', 0.21, 0, []),
        ('sandbag', None, 'mortar', 0.22, 0, ['quiver']),
        ('stone1', None, 'mortar', 0.235, 0, []),
        ('stone2', 'blue', 'mortar', 0.24, 0, ['gold_band', 'crystal']),
        ('iron_well', 'iron', 'mortar', 0.245, 0, ['crystal']),
        ('iron_well', 'iron', 'mortar', 0.25, 0, ['arms', 'crystal']),
        ('hex', 'hex', 'mortar', 0.255, 0, ['crystal']),
        ('stone3', 'blue', 'mortar', 0.26, 0, ['red_band', 'crystal', 'gems']),
        ('gold3', 'gold', 'mortar', 0.265, 0, ['crystal_gold', 'gems', 'crown']),
    ],
    'tesla': [
        ('wood_tripod', None, 'coil', 0.0, 0, []),
        ('wood_cart', None, 'coil', 0.0, 0, []),
        ('stone1', None, 'coil', 0.0, 0, []),
        ('stone_wall', None, 'coil', 0.0, 0, []),
        ('stone2', 'blue', 'coil', 0.0, 0, ['gold_band', 'crystal']),
        ('iron_disc', 'iron', 'coil', 0.0, 0, ['crystal']),
        ('iron_disc', 'iron', 'coil', 0.0, 0, ['arms', 'crystal']),
        ('hex', 'hex', 'coil', 0.0, 0, ['crystal']),
        ('stone3', 'blue', 'coil', 0.0, 0, ['red_band', 'crystal', 'gems']),
        ('gold3', 'gold', 'coil', 0.0, 0, ['crystal_gold', 'gems', 'crown']),
    ],
    'ward': [
        ('wood_tripod', None, 'none', 0.0, 0, ['shield_small']),
        ('wood_cart', None, 'none', 0.0, 0, ['shield_small']),
        ('stone1', None, 'none', 0.0, 0, ['shield']),
        ('stone_wall', None, 'none', 0.0, 0, ['shield']),
        ('stone2', 'blue', 'none', 0.0, 0, ['gold_band', 'shield', 'crystal']),
        ('iron_disc', 'iron', 'none', 0.0, 0, ['shield', 'crystal']),
        ('iron_disc', 'iron', 'none', 0.0, 0, ['arms', 'shield', 'crystal']),
        ('hex', 'hex', 'none', 0.0, 0, ['shield', 'crystal']),
        ('stone3', 'blue', 'none', 0.0, 0, ['red_band', 'shield', 'crystal', 'gems']),
        ('gold3', 'gold', 'none', 0.0, 0, ['shield', 'crystal_gold', 'gems', 'crown']),
    ],
    'mine': [
        ('wood_tripod', None, 'mine', 0.0, 0, ['barrel_small']),
        ('wood_cart', None, 'mine', 0.0, 0, ['barrel']),
        ('stone1', None, 'mine', 0.0, 0, ['barrel', 'cart_small']),
        ('stone2', 'blue', 'mine', 0.0, 0, ['barrel', 'cart', 'crystal']),
        ('gold3', 'gold', 'mine', 0.0, 0, ['barrel', 'cart', 'crystal_gold', 'aura']),
    ],
}

NAMES = {'cannon': '炮塔', 'arrow': '箭塔', 'mage': '法师塔', 'mortar': '迫击炮塔',
         'tesla': '特斯拉电塔', 'ward': '防御塔', 'mine': '金矿'}


# ================================================================= 附加件
def add_extras(img, W, cx, cy, S, ax, ay, rb, rt, extras, lvl, kind):
    d = ImageDraw.Draw(img)
    if 'gold_band' in extras:
        L.band(img, W, cx, cy - S * 0.020, rb * 0.85, L.C_GOLD, 8, 1.8)
        d = ImageDraw.Draw(img)
    if 'red_band' in extras:
        L.band(img, W, cx, cy, rb, L.C_RED, 8, 2.2)
        L.band(img, W, cx, cy - S * 0.020, rb * 0.85, L.C_RED, 8, 1.8)
        d = ImageDraw.Draw(img)
    if 'arms' in extras:
        # 双侧液压复进臂
        ang = math.radians(-31)
        ux, uy = math.cos(ang), math.sin(ang)
        px, py = -uy, ux
        for s in (-1, 1):
            x1 = ax + px * s * rt * 1.08
            y1 = ay + py * s * rt * 1.08 + rt * 0.20
            x2 = x1 + ux * S * 0.130
            y2 = y1 + uy * S * 0.130
            aw = S * 0.020
            q = [(x1 + px * aw, y1 + py * aw), (x2 + px * aw, y2 + py * aw),
                 (x2 - px * aw, y2 - py * aw), (x1 - px * aw, y1 - py * aw)]
            L.ps(img, L.lgr(W, q[0], q[3],
                            [(0.0, '#1a2634'), (0.26, '#66748a'), (0.50, '#ccd8e8'), (1.0, '#1d2530')]),
                 L.mp(W, q))
            d = ImageDraw.Draw(img)
            d.polygon(q, outline=L.R(L.C_LINE), width=int(L.OL * 0.8))
            for (ex, ey) in ((x1, y1), (x2, y2)):
                d.ellipse([ex - aw, ey - aw, ex + aw, ey + aw],
                          fill=L.R(L.C_STEEL), outline=L.R(L.C_LINE), width=int(L.OL * 0.6))
    if 'crystal' in extras or 'crystal_gold' in extras:
        cc = L.C_GOLD_LT if 'crystal_gold' in extras else L.C_CRYSTAL
        if rt:
            crystal(img, W, ax - rt * 0.10, ay + rt * 0.46, rt * 0.40, cc)
        else:
            crystal(img, W, cx, ay + S * 0.075, S * 0.050, cc)
    if 'gems' in extras:
        for s in (-1, 1):
            if rt:
                crystal(img, W, ax + s * rt * 0.70, ay - rt * 0.42, S * 0.016, L.C_RED, bloom=False)
    if 'crown' in extras:
        L.crown(img, W, ax, ay - (rt * 1.34 if rt else S * 0.20), S * 0.048)
    if 'quiver' in extras:
        # 箭袋（斜插几支箭）
        qx = cx + rb * 0.62
        qy = cy + rb * L.SQ * 0.30
        d = ImageDraw.Draw(img)
        d.polygon([(qx - S * 0.022, qy + S * 0.030), (qx + S * 0.022, qy + S * 0.030),
                   (qx + S * 0.016, qy - S * 0.038), (qx - S * 0.016, qy - S * 0.038)],
                  fill=L.R('#6e4a24'), outline=L.R(L.C_LINE), width=int(L.OL * 0.7))
        for k in (-1, 0, 1):
            d.line([(qx + k * S * 0.010, qy - S * 0.030), (qx + k * S * 0.016, qy - S * 0.070)],
                   fill=L.R('#c8f0a0'), width=int(1.8 * SS))
    if 'barrel' in extras or 'barrel_small' in extras:
        # 金矿木桶
        bw = S * (0.030 if 'barrel_small' in extras else 0.042)
        bx = cx + rb * 0.66
        by = cy + rb * L.SQ * 0.26
        d = ImageDraw.Draw(img)
        d.ellipse([bx - bw, by - bw * 0.86, bx + bw, by + bw * 0.86], fill=L.R('#9c6c3a'),
                  outline=L.R(L.C_LINE), width=int(L.OL * 0.7))
        d.rectangle([bx - bw, by - bw * 0.30, bx + bw, by + bw * 0.30], fill=L.R('#a8763e'))
        d.line([(bx - bw * 0.98, by - bw * 0.34), (bx + bw * 0.98, by - bw * 0.34)],
               fill=L.R('#5e4018'), width=int(1.6 * SS))
        d.line([(bx - bw * 0.98, by + bw * 0.34), (bx + bw * 0.98, by + bw * 0.34)],
               fill=L.R('#5e4018'), width=int(1.6 * SS))
    if 'cart' in extras or 'cart_small' in extras:
        # 矿车
        cw = S * (0.036 if 'cart_small' in extras else 0.048)
        ccx = cx - rb * 0.70
        ccy = cy + rb * L.SQ * 0.24
        d = ImageDraw.Draw(img)
        d.polygon([(ccx - cw, ccy - cw * 0.5), (ccx + cw, ccy - cw * 0.5),
                   (ccx + cw * 0.75, ccy + cw * 0.55), (ccx - cw * 0.75, ccy + cw * 0.55)],
                  fill=L.R('#7a8494'), outline=L.R(L.C_LINE), width=int(L.OL * 0.7))
        for s in (-1, 1):
            d.ellipse([ccx + s * cw * 0.6 - cw * 0.26, ccy + cw * 0.44,
                       ccx + s * cw * 0.6 + cw * 0.26, ccy + cw * 0.96],
                      fill=L.R('#4a5568'), outline=L.R(L.C_LINE), width=int(L.OL * 0.6))
    if 'shield' in extras or 'shield_small' in extras:
        # 护盾水晶柱
        sr = S * (0.044 if 'shield_small' in extras else 0.056)
        sy = ay + (rt * 0.30 if rt else S * 0.06)
        crystal(img, W, ax, sy, sr, L.C_CRYSTAL)
        # 结界环
        d = ImageDraw.Draw(img)
        for k in range(2):
            rr = rb * (0.90 + k * 0.14)
            d.arc([cx - rr, cy - rr * L.SQ, cx + rr, cy + rr * L.SQ],
                  200, 340, fill=L.R('#9fe8ff', 150 - k * 40), width=int(2.2 * SS))
    if 'aura' in extras:
        img = L.aura(img, W, cx, cy + rb * L.SQ * 0.28, rb * 0.96)
    return img


def crystal(img, W, cx, cy, r, c=None, bloom=True):
    return L.crystal(img, W, cx, cy, r, c, bloom)


def w_weapon(img, W, ax, ay, S, kind, wl, ww, extras, lvl):
    d = ImageDraw.Draw(img)
    ang = math.radians(-31)
    if kind == 'barrel':
        return L.w_barrel(img, W, ax, ay, ang, S * wl, S * ww, 1, 2,
                          'gold' if lvl >= 10 else 'blue')
    if kind == 'bow':
        return L.w_bow(img, W, ax, ay, ang, S * 0.46, 'green')
    if kind == 'crossbow':
        return L.w_crossbow(img, W, ax, ay, ang, S * 0.50)
    if kind == 'staff':
        col = '#ffd479' if lvl >= 10 else '#c79bff'
        return L.w_staff(img, W, ax, ay, ang, S * 0.46, col)
    if kind == 'mortar':
        return L.w_mortar(img, W, ax, ay, math.radians(-38), S * 0.42)
    if kind == 'coil':
        return L.w_coil(img, W, ax, ay, S, lvl)
    if kind == 'mine':
        return draw_mine_shaft(img, W, ax, ay, S, lvl)
    return img


def draw_mine_shaft(img, W, ax, ay, S, lvl):
    """金矿：矿洞入口 + 木支架 + 矿石堆"""
    d = ImageDraw.Draw(img)
    # 矿洞（深色拱门）
    hole_w = S * 0.115
    hole_h = S * 0.105
    cy0 = ay + S * 0.035
    d.ellipse([ax - hole_w, cy0 - hole_h * 1.30, ax + hole_w, cy0 + hole_h * 1.30],
              fill=R('#0e1218'))
    d.ellipse([ax - hole_w * 0.88, cy0 - hole_h * 1.18, ax + hole_w * 0.88, cy0 + hole_h * 1.18],
              fill=R('#1a2230'))
    # 洞口轮廓
    d.arc([ax - hole_w, cy0 - hole_h * 1.30, ax + hole_w, cy0 + hole_h * 1.30],
          180, 360, fill=R(L.C_LINE), width=int(L.OL * 1.1))
    # 木支架（两根立柱 + 横梁）
    post = S * 0.020
    for s in (-1, 1):
        px0 = ax + s * hole_w * 1.06
        d.rectangle([px0 - post, cy0 - hole_h * 1.15, px0 + post, cy0 + hole_h * 1.20],
                    fill=R('#8a6234'), outline=R(L.C_LINE), width=int(L.OL * 0.7))
    d.rectangle([ax - hole_w * 1.20, cy0 - hole_h * 1.40, ax + hole_w * 1.20, cy0 - hole_h * 1.06],
                fill=R('#a8763e'), outline=R(L.C_LINE), width=int(L.OL * 0.8))
    # 矿石堆（等级越高越多）
    nrock = 3 + min(6, lvl + 2)
    rng = [(0.62, 0.86), (0.50, 0.92), (0.74, 0.92), (0.60, 1.02), (0.44, 1.00),
           (0.80, 1.02), (0.68, 1.10), (0.54, 1.10), (0.36, 1.06), (0.86, 0.96), (0.28, 0.98)]
    for i in range(min(nrock, len(rng))):
        rx = ax + (rng[i][0] - 0.5) * S * 0.30
        ry = ay + rng[i][1] * S * 0.075
        rr = S * (0.017 + 0.004 * (i % 3))
        d.polygon([(rx - rr, ry + rr * 0.5), (rx - rr * 0.4, ry - rr),
                   (rx + rr * 0.6, ry - rr * 0.8), (rx + rr, ry + rr * 0.4)],
                  fill=R('#e8c24a'), outline=R(L.C_LINE), width=int(L.OL * 0.5))
        d.polygon([(rx - rr * 0.4, ry - rr), (rx + rr * 0.2, ry - rr * 0.5),
                   (rx - rr * 0.1, ry + rr * 0.1)], fill=R('#fff0b0'))
    return img


def render(kind, level, size=256):
    W = size * SS
    S = W
    img = L.canvas(W)
    cx = W * 0.50
    cy = W * 0.615

    spec = SPEC[kind]
    base_k, dome_k, weap, wl, ww, extras = spec[min(level, len(spec)) - 1]

    ax, ay, rb = build_base(img, W, cx, cy, S, base_k, level)
    rt = S * (0.098 + 0.006 * level) if kind != 'mine' else 0.0

    # 炮口尺寸按建筑微调
    rt_map = {'cannon': 1.00, 'arrow': 0.88, 'mage': 0.94, 'mortar': 0.96,
              'tesla': 1.04, 'ward': 0.96}
    rt = S * (0.090 + 0.006 * level) * rt_map.get(kind, 1.0) if kind != 'mine' else 0.0

    # 武器分两批：
    #   穿透型（barrel / mortar）→ 先画，炮口盖住根部，形成"从后面伸出"
    #   上置型（bow / crossbow / staff / coil / mine）→ 后画，架在炮室上面
    PIERCE = ('barrel', 'mortar')
    ONSET = ('bow', 'crossbow', 'staff', 'coil', 'mine')

    if weap in PIERCE:
        img = w_weapon(img, W, ax, ay, S, weap, wl, ww, extras, level)

    # ①.5 没有炮室的等级给一个低基座，避免武器悬空
    if dome_k is None and kind != 'mine':
        mount_col = 'wood' if base_k in ('wood_tripod', 'wood_cart') else 'stone'
        img = L.mount(img, W, ax, ay + S * 0.018, rt * 0.80, mount_col)

    # ② 炮口
    if dome_k == 'iron':
        img = L.dome(img, W, ax, ay, rt, 'iron')
    elif dome_k == 'blue':
        img = L.dome(img, W, ax, ay, rt, 'blue')
    elif dome_k == 'gold':
        img = L.dome(img, W, ax, ay, rt, 'gold')
    elif dome_k == 'hex':
        img = L.hexdome(img, W, ax, ay, rt)

    # ②.5 上置型武器（画在炮室之上）
    if weap in ONSET:
        oy = ay - (rt * 0.30 if rt else 0)
        img = w_weapon(img, W, ax, oy, S, weap, wl, ww, extras, level)

    # ③ 附加件
    img = add_extras(img, W, cx, cy, S, ax, ay, rb, rt, extras, level, kind)

    return L.grain(img, 2).resize((size, size), Image.LANCZOS)


def export_all(size=256):
    counts = {}
    for kind in SPEC:
        n = len(SPEC[kind])
        counts[kind] = n
        for lv in range(1, n + 1):
            render(kind, lv, size).save(os.path.join(OUT, f'{kind}_lv{lv:02d}.png'))
    print('exported:', counts)


if __name__ == '__main__':
    export_all()

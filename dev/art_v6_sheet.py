# -*- coding: utf-8 -*-
"""v6 总览图：炮塔十级序列 / 分支 / 气球兵"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import art_v7 as V

ART = V.OUT
ART5 = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v5')


def font(sz, bold=False):
    cands = [r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc',
             r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf']
    for c in cands:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, sz) if False else ImageFont.truetype(c, sz)
            except Exception:
                pass
    return ImageFont.load_default()


from PIL import ImageFont


def bg(W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.46
    d = np.sqrt(((xx - cx) / (W * 0.78)) ** 2 + ((yy - cy) / (H * 0.88)) ** 2)
    t = np.clip(d, 0, 1)
    base = np.array([26, 32, 44], dtype=np.float32)
    lite = np.array([44, 54, 72], dtype=np.float32)
    arr = base[None, None, :] + (lite - base)[None, None, :] * (1 - t)[..., None]
    img = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA')
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    step = 40
    for x in range(0, W, step):
        gd.line([(x, 0), (x, H)], fill=(70, 84, 108, 30), width=1)
    for y in range(0, H, step):
        gd.line([(0, y), (W, y)], fill=(70, 84, 108, 30), width=1)
    for x in range(0, W, step * 4):
        gd.line([(x, 0), (x, H)], fill=(92, 110, 140, 42), width=1)
    for y in range(0, H, step * 4):
        gd.line([(0, y), (W, y)], fill=(92, 110, 140, 42), width=1)
    img.alpha_composite(g)
    v = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(v).ellipse([-W * 0.30, -H * 0.34, W * 1.30, H * 1.34], fill=(0, 0, 0, 105))
    inv = Image.new('RGBA', (W, H), (0, 0, 0, 115))
    img.alpha_composite(inv)
    img.alpha_composite(v.filter(ImageFilter.GaussianBlur(min(W, H) * 0.11)))
    return img


def tile(img, icon_path, x, y, cell, label, ring=None):
    d = ImageDraw.Draw(img)
    r = int(cell * 0.10)
    d.rounded_rectangle([x, y, x + cell, y + cell], radius=r,
                        fill=(34, 42, 58, 255), outline=(72, 88, 116, 255), width=2)
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.rounded_rectangle([x + 2, y + 2, x + cell - 2, y + int(cell * 0.40)], radius=r - 2,
                         fill=(255, 255, 255, 15))
    od.rounded_rectangle([x + 2, y + int(cell * 0.72), x + cell - 2, y + cell - 2], radius=r - 2,
                         fill=(0, 0, 0, 45))
    img.alpha_composite(ov)

    ic = Image.open(icon_path).convert('RGBA')
    # 按 alpha 包围盒自动裁剪 → 每级都填满格子，视觉大小一致
    bbox = ic.getchannel('A').getbbox()
    if bbox:
        m = 6
        bbox = (max(0, bbox[0] - m), max(0, bbox[1] - m),
                min(ic.width, bbox[2] + m), min(ic.height, bbox[3] + m))
        ic = ic.crop(bbox)
    s = int(cell * 0.88)
    w0, h0 = ic.size
    scale = min(s / w0, s / h0)
    ic = ic.resize((max(1, int(w0 * scale)), max(1, int(h0 * scale))), Image.LANCZOS)
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([x + (cell - s * 0.60) // 2, y + cell * 0.71,
                                x + (cell + s * 0.60) // 2, y + cell * 0.87],
                               fill=(0, 0, 0, 105))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(cell * 0.032)))
    img.alpha_composite(ic, (x + (cell - ic.width) // 2, y + int(cell * 0.03)))

    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', int(cell * 0.13)) \
        if os.path.exists(r'C:\Windows\Fonts\msyhbd.ttc') else font(int(cell * 0.13), True)
    # 胶囊宽度按文字实测宽度自适应
    tb = d.textbbox((0, 0), label, font=f)
    tw = tb[2] - tb[0]
    pw = max(int(cell * 0.40), tw + int(cell * 0.16))
    ph = int(cell * 0.155)
    px, py = x + (cell - pw) // 2, y + int(cell * 0.815)
    cap = Image.new('RGBA', img.size, (0, 0, 0, 0))
    cc = ring if ring else (58, 76, 104)
    ImageDraw.Draw(cap).rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2,
                                          fill=(cc[0], cc[1], cc[2], 238))
    img.alpha_composite(cap)
    d = ImageDraw.Draw(img)
    d.text((px + pw / 2, py + ph / 2), label, font=f, fill=(255, 255, 255, 255), anchor='mm')
    return img


NOTES = [
    ('Lv1', '木质三角支架'),
    ('Lv2', '木轮炮车'),
    ('Lv3', '八角石台'),
    ('Lv4', '石台 + 城垛矮墙'),
    ('Lv5', '双层石台 + 水晶'),
    ('Lv6', '铸铁圆盘底座'),
    ('Lv7', '铸铁 + 复进臂'),
    ('Lv8', '六角装甲 + 侧裙'),
    ('Lv9', '三层石台 + 红束带'),
    ('Lv10', '黄金台 + 皇冠光环'),
]


def seq_sheet():
    cols, cell, gap, pad, th = 10, 186, 13, 44, 116
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = th + cell + 150 + pad * 2
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    fT = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 33) if os.path.exists(r'C:\Windows\Fonts\msyhbd.ttc') else font(33, True)
    fS = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 16) if os.path.exists(r'C:\Windows\Fonts\msyh.ttc') else font(16)
    d.text((pad, 32), '炮塔升级序列  ·  CANNON TOWER  Lv1 → Lv10', font=fT, fill=(228, 240, 255, 255))
    d.text((pad, 78), '十级十种结构：木质 → 石造 → 铁铸 → 装甲 → 黄金。每级造型都不同，不是同一个东西放大。',
           font=fS, fill=(142, 164, 194, 255))
    for i in range(cols):
        lv = i + 1
        ring = (206, 162, 62) if lv == 10 else (58, 76, 104)
        img = tile(img, os.path.join(ART, f'cannon_lv{lv:02d}.png'),
                   pad + i * (cell + gap), th, cell, f'Lv{lv}', ring=ring)
    # 说明
    fy = th + cell + 34
    d = ImageDraw.Draw(img)
    d.text((pad, fy), '结构演进', font=ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 18)
           if os.path.exists(r'C:\Windows\Fonts\msyhbd.ttc') else font(18, True),
           fill=(198, 216, 240, 255))
    fN = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 14) if os.path.exists(r'C:\Windows\Fonts\msyh.ttc') else font(14)
    for i, (k, v) in enumerate(NOTES):
        cx2 = pad + (i % 5) * ((W - pad * 2) // 5)
        cy2 = fy + 30 + (i // 5) * 26
        d.ellipse([cx2, cy2 + 4, cx2 + 8, cy2 + 12], fill=(112, 172, 240, 255))
        d.text((cx2 + 16, cy2), f'{k}', font=fN, fill=(152, 178, 212, 255))
        d.text((cx2 + 52, cy2), v, font=fN, fill=(214, 228, 246, 255))
    out = os.path.join(ART, 'sheet_cannon_sequence.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


def branch_sheet():
    cols, cell, gap, pad, th = 6, 196, 15, 44, 110
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = th + cell + pad * 2
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    fT = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 31) if os.path.exists(r'C:\Windows\Fonts\msyhbd.ttc') else font(31, True)
    fS = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 15) if os.path.exists(r'C:\Windows\Fonts\msyh.ttc') else font(15)
    d.text((pad, 30), '炮塔分支  ·  双管 vs 巨炮', font=fT, fill=(228, 240, 255, 255))
    d.text((pad, 74), 'Lv4→5 分支：双管＝攻速翻倍　巨炮＝伤害翻倍。底座结构不变，只换炮管。',
           font=fS, fill=(142, 164, 194, 255))
    items = [('cannon_lv08.png', 'Lv8 基础', None),
             ('cannon_twin_lv08.png', 'Lv8 双管', (86, 160, 226)),
             ('cannon_big_lv08.png', 'Lv8 巨炮', (206, 124, 74)),
             ('cannon_lv10.png', 'Lv10 基础', None),
             ('cannon_twin_lv10.png', 'Lv10 双管', (86, 160, 226)),
             ('cannon_big_lv10.png', 'Lv10 巨炮', (206, 124, 74))]
    for i, (fn, lb, ring) in enumerate(items):
        img = tile(img, os.path.join(ART, fn), pad + i * (cell + gap), th, cell, lb, ring=ring)
    out = os.path.join(ART, 'sheet_cannon_branches.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


def balloon_sheet():
    cols, cell, gap, pad, th = 5, 200, 15, 44, 110
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = th + cell + pad * 2
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    fT = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 31) if os.path.exists(r'C:\Windows\Fonts\msyhbd.ttc') else font(31, True)
    fS = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 15) if os.path.exists(r'C:\Windows\Fonts\msyh.ttc') else font(15)
    d.text((pad, 30), '气球兵  ·  BALLOON SOLDIER', font=fT, fill=(228, 240, 255, 255))
    d.text((pad, 74), '粉色气球 + 木质吊篮 + 卡通小兵；地面投影表示悬浮；投弹帧带炸弹与引线火花。线条更细，体积感保留。',
           font=fS, fill=(142, 164, 194, 255))
    items = [('balloon_blue_idle.png', '待机', (86, 140, 210)),
             ('balloon_blue_throw.png', '投弹', (206, 130, 92)),
             ('balloon_blue_wind.png', '飞行', (110, 188, 188)),
             ('balloon_blue_throw.png', '蓝方', (86, 160, 226)),
             ('balloon_red_throw.png', '红方', (206, 92, 82))]
    for i, (fn, lb, ring) in enumerate(items):
        img = tile(img, os.path.join(ART, fn), pad + i * (cell + gap), th, cell, lb, ring=ring)
    out = os.path.join(ART, 'sheet_balloon.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


if __name__ == '__main__':
    seq_sheet()
    branch_sheet()
    balloon_sheet()

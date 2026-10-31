# -*- coding: utf-8 -*-
"""炮塔升级序列总览图：深灰蓝 UI 网格背景 + 横向排列"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', 'art', 'v5')


def font(sz, bold=False):
    cands = [r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc',
             r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf']
    for c in cands:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def bg(W, H):
    """深灰蓝底 + 细网格 + 中心柔光 + 暗角"""
    import numpy as np
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # 径向柔光
    cx, cy = W * 0.5, H * 0.46
    d = np.sqrt(((xx - cx) / (W * 0.75)) ** 2 + ((yy - cy) / (H * 0.85)) ** 2)
    t = np.clip(d, 0, 1)
    base = np.array([26, 32, 44], dtype=np.float32)
    lite = np.array([42, 52, 70], dtype=np.float32)
    arr = base[None, None, :] + (lite - base)[None, None, :] * (1 - t)[..., None]
    img = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA')

    # 网格
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    step = 40
    for x in range(0, W, step):
        gd.line([(x, 0), (x, H)], fill=(70, 84, 108, 34), width=1)
    for y in range(0, H, step):
        gd.line([(0, y), (W, y)], fill=(70, 84, 108, 34), width=1)
    # 每 4 格加粗
    for x in range(0, W, step * 4):
        gd.line([(x, 0), (x, H)], fill=(90, 108, 138, 46), width=1)
    for y in range(0, H, step * 4):
        gd.line([(0, y), (W, y)], fill=(90, 108, 138, 46), width=1)
    img = Image.alpha_composite(img, g)

    # 暗角
    v = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    vd.ellipse([-W * 0.25, -H * 0.30, W * 1.25, H * 1.30], fill=(0, 0, 0, 90))
    v = v.filter(ImageFilter.GaussianBlur(min(W, H) * 0.10))
    # 反转：只留边缘暗
    inv = Image.new('RGBA', (W, H), (0, 0, 0, 110))
    inv.paste(v, (0, 0))
    img = Image.alpha_composite(img, inv)
    return img


def tile(img, icon_path, x, y, cell, label, sub=None, ring=None):
    """一个图标格：圆角牌 + 图标 + 标签
    注意：所有半透明元素都必须画在独立图层再 alpha_composite，
    否则 ImageDraw 会直接把 alpha 写进画布，造成"白块"破图。"""
    d = ImageDraw.Draw(img)
    r = int(cell * 0.10)

    # 牌底（不透明，直接画）
    d.rounded_rectangle([x, y, x + cell, y + cell], radius=r,
                        fill=(34, 42, 58, 255), outline=(72, 88, 116, 255), width=2)

    # 半透明层：顶部高光 + 底部暗影
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.rounded_rectangle([x + 2, y + 2, x + cell - 2, y + int(cell * 0.40)],
                         radius=r - 2, fill=(255, 255, 255, 16))
    od.rounded_rectangle([x + 2, y + int(cell * 0.70), x + cell - 2, y + cell - 2],
                         radius=r - 2, fill=(0, 0, 0, 46))
    img.alpha_composite(ov)

    # 图标（带柔和投影）
    ic = Image.open(icon_path).convert('RGBA')
    s = int(cell * 0.94)
    ic = ic.resize((s, s), Image.LANCZOS)
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.ellipse([x + (cell - s * 0.62) // 2, y + cell * 0.70,
                x + (cell + s * 0.62) // 2, y + cell * 0.86],
               fill=(0, 0, 0, 110))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(cell * 0.035)))
    img.alpha_composite(ic, (x + (cell - s) // 2, y + int(cell * 0.02)))

    # 标签胶囊
    d = ImageDraw.Draw(img)
    f = font(int(cell * 0.135), True)
    pw, ph = int(cell * 0.46), int(cell * 0.17)
    px, py = x + (cell - pw) // 2, y + int(cell * 0.80)
    cap = Image.new('RGBA', img.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    cd.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2,
                         fill=(ring if ring else (58, 76, 104, 255))[:3] + (235,))
    img.alpha_composite(cap)
    d = ImageDraw.Draw(img)
    d.text((px + pw / 2, py + ph / 2), label, font=f,
           fill=(255, 255, 255, 255), anchor='mm')

    if sub:
        fs = font(int(cell * 0.095))
        d.text((x + cell * 0.5, y + cell * 1.005), sub, font=fs,
               fill=(150, 170, 198, 255), anchor='mm')
    return img


def make_sheet():
    cols = 10
    cell = 190
    gap = 14
    pad = 46
    title_h = 118

    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = title_h + cell + 150 + pad * 2 + 40

    img = bg(W, H)
    d = ImageDraw.Draw(img)

    # 标题
    d.text((pad, 34), '炮塔升级序列  ·  CANNON TOWER  Lv1 → Lv10',
           font=font(34, True), fill=(226, 238, 255, 255))
    d.text((pad, 80), '皇室战争式卡通 · 蓝金属主体 · 高级形态加入红宝石与金色点缀',
           font=font(17), fill=(140, 162, 192, 255))

    # 等级图标
    y0 = title_h
    for i in range(cols):
        lv = i + 1
        x = pad + i * (cell + gap)
        ring = (200, 158, 62, 255) if lv == 10 else (58, 76, 104, 255)
        img = tile(img, os.path.join(ART, f'cannon_lv{lv:02d}.png'),
                   x, y0, cell, f'Lv{lv}', ring=ring)

    # 进度说明
    fy = y0 + cell + 40
    d.text((pad, fy), '进化节点', font=font(19, True), fill=(196, 214, 240, 255))
    notes = [
        ('Lv1', '木质底座 · 细炮管'),
        ('Lv3', '石台 + 铆钉 + 齿轮'),
        ('Lv4', '炮室装甲板 · 皮革皮带'),
        ('Lv5', '蓝色能量水晶'),
        ('Lv6', '金色饰带'),
        ('Lv7', '炮口制退器'),
        ('Lv9', '红宝石点缀'),
        ('Lv10', '金色传说 + 皇冠 + 光环'),
    ]
    fs = font(15)
    ncols = 4
    for i, (k, v) in enumerate(notes):
        cxi = pad + (i % ncols) * ((W - pad * 2) // ncols)
        cyi = fy + 34 + (i // ncols) * 30
        d.ellipse([cxi, cyi + 4, cxi + 9, cyi + 13], fill=(110, 170, 240, 255))
        d.text((cxi + 18, cyi), f'{k}  ', font=fs, fill=(150, 176, 210, 255))
        d.text((cxi + 18 + 46, cyi), v, font=fs, fill=(214, 228, 246, 255))

    out = os.path.join(ART, 'sheet_cannon_sequence.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


def make_branches():
    cols = 6
    cell = 200
    gap = 16
    pad = 46
    title_h = 112
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = title_h + cell + pad * 2 + 30
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 32), '炮塔分支  ·  双管 vs 巨炮', font=font(32, True), fill=(226, 238, 255, 255))
    d.text((pad, 76), 'Lv4→5 分支：双管＝攻速翻倍　巨炮＝伤害翻倍。同一路线的不同终点',
           font=font(16), fill=(140, 162, 192, 255))

    items = [
        ('cannon_lv05.png', 'Lv5 基础', None),
        ('cannon_twin_lv05.png', 'Lv5 双管', (86, 160, 226, 255)),
        ('cannon_big_lv05.png', 'Lv5 巨炮', (200, 120, 72, 255)),
        ('cannon_lv10.png', 'Lv10 基础', None),
        ('cannon_twin_lv10.png', 'Lv10 双管', (86, 160, 226, 255)),
        ('cannon_big_lv10.png', 'Lv10 巨炮', (200, 120, 72, 255)),
    ]
    y0 = title_h
    for i, (fn, lb, ring) in enumerate(items):
        x = pad + i * (cell + gap)
        img = tile(img, os.path.join(ART, fn), x, y0, cell, lb, ring=ring)

    out = os.path.join(ART, 'sheet_cannon_branches.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


def make_red():
    cols = 3
    cell = 220
    gap = 18
    pad = 46
    title_h = 112
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = title_h + cell + pad * 2 + 30
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 32), '阵营配色  ·  蓝方 / 红方', font=font(32, True), fill=(226, 238, 255, 255))
    d.text((pad, 76), '同一套造型，只换主色 —— 玩家能瞬间分清敌我',
           font=font(16), fill=(140, 162, 192, 255))
    items = [
        ('cannon_lv05.png', '蓝方 Lv5', (86, 160, 226, 255)),
        ('cannon_lv10.png', '蓝方 Lv10', (86, 160, 226, 255)),
        ('cannon_red_lv10.png', '红方 Lv10', (210, 90, 80, 255)),
    ]
    y0 = title_h
    for i, (fn, lb, ring) in enumerate(items):
        x = pad + i * (cell + gap)
        img = tile(img, os.path.join(ART, fn), x, y0, cell, lb, ring=ring)
    out = os.path.join(ART, 'sheet_cannon_teams.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


if __name__ == '__main__':
    make_sheet()
    make_branches()
    make_red()

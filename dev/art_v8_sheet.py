# -*- coding: utf-8 -*-
"""v8 总览图：7 种建筑各自的等级序列"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v8')

INFO = [
    ('cannon', '炮塔', 'CANNON', '木架 → 轮车 → 石台 → 城墙 → 水晶 → 铁盘 → 复进臂 → 六角装甲 → 红束带 → 黄金皇冠',
     ['木质三角支架', '木轮炮车', '八角石台', '石台 + 城垛', '双层石台 + 水晶',
      '铸铁圆盘', '铸铁 + 复进臂', '六角装甲 + 侧裙', '三层石台 + 红束带', '黄金台 + 皇冠']),
    ('arrow', '箭塔', 'ARROW', '木架弓 → 石台弓 → 重弩 → 旋转弩座 → 攻城弩 → 王弩',
     ['木架单弓', '木轮弓车', '石台长弓', '石台 + 城垛弓', '双层石台 + 弩',
      '铁盘弩座', '铁盘 + 复进臂', '六角弩塔', '三层石台 + 红束带', '黄金弩塔 + 皇冠']),
    ('mage', '法师塔', 'MAGE', '木杖 → 石台法杖 → 悬浮光球 → 多层法阵 → 王塔',
     ['木架法杖', '木轮法车', '石台法杖', '石台 + 城垛', '双层石台 + 水晶',
      '铁盘法座', '铁盘 + 复进臂', '六角法塔', '三层石台 + 红束带', '黄金法塔 + 皇冠']),
    ('mortar', '迫击炮塔', 'MORTAR', '木架 → 沙袋 → 石台 → 铁井 → 巨炮',
     ['木架小炮', '沙袋炮位', '沙袋 + 箭袋', '石台炮位', '双层石台 + 水晶',
      '铁井巨炮', '铁井 + 复进臂', '六角炮位', '三层石台 + 红束带', '黄金炮位 + 皇冠']),
    ('tesla', '特斯拉电塔', 'TESLA', '木杆 → 石台线圈 → 多环电极 → 能量风暴',
     ['木架单球', '木轮电塔', '石台线圈', '石台 + 城垛', '双层石台 + 水晶',
      '铁盘线圈', '铁盘 + 复进臂', '六角电塔', '三层石台 + 红束带', '黄金电塔 + 皇冠']),
    ('ward', '防御塔', 'WARD', '木桩护符 → 石台结界 → 水晶结界 → 王塔大结界',
     ['木架护符', '木轮护符', '石台护符', '石台 + 城垛', '双层石台 + 结界',
      '铁盘结界', '铁盘 + 复进臂', '六角结界', '三层石台 + 红束带', '黄金结界 + 皇冠']),
    ('mine', '金矿', 'MINE', '土坑 → 木架矿洞 → 石砌矿口 → 双矿口 + 矿车 → 大型矿井',
     ['木架小矿', '木轮矿车', '石砌矿口', '双矿口 + 矿车', '黄金矿井']),
]


def font(sz, bold=False):
    c = r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc'
    if os.path.exists(c):
        try:
            return ImageFont.truetype(c, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def bg(W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.44
    d = np.sqrt(((xx - cx) / (W * 0.80)) ** 2 + ((yy - cy) / (H * 0.90)) ** 2)
    t = np.clip(d, 0, 1)
    base = np.array([25, 31, 43], dtype=np.float32)
    lite = np.array([43, 53, 71], dtype=np.float32)
    arr = base[None, None, :] + (lite - base)[None, None, :] * (1 - t)[..., None]
    img = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA')
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for x in range(0, W, 40):
        gd.line([(x, 0), (x, H)], fill=(68, 82, 106, 28), width=1)
    for y in range(0, H, 40):
        gd.line([(0, y), (W, y)], fill=(68, 82, 106, 28), width=1)
    img.alpha_composite(g)
    inv = Image.new('RGBA', (W, H), (0, 0, 0, 110))
    img.alpha_composite(inv)
    v = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(v).ellipse([-W * 0.30, -H * 0.34, W * 1.30, H * 1.34], fill=(0, 0, 0, 100))
    img.alpha_composite(v.filter(ImageFilter.GaussianBlur(min(W, H) * 0.11)))
    return img


def tile(img, path, x, y, cell, label, ring=None, lv=None):
    d = ImageDraw.Draw(img)
    r = int(cell * 0.10)
    d.rounded_rectangle([x, y, x + cell, y + cell], radius=r,
                        fill=(33, 41, 57, 255), outline=(70, 86, 114, 255), width=2)
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.rounded_rectangle([x + 2, y + 2, x + cell - 2, y + int(cell * 0.40)], radius=r - 2,
                         fill=(255, 255, 255, 14))
    od.rounded_rectangle([x + 2, y + int(cell * 0.74), x + cell - 2, y + cell - 2], radius=r - 2,
                         fill=(0, 0, 0, 42))
    img.alpha_composite(ov)

    ic = Image.open(path).convert('RGBA')
    bbox = ic.getchannel('A').getbbox()
    if bbox:
        m = 6
        bbox = (max(0, bbox[0] - m), max(0, bbox[1] - m),
                min(ic.width, bbox[2] + m), min(ic.height, bbox[3] + m))
        ic = ic.crop(bbox)
    s = int(cell * 0.88)
    w0, h0 = ic.size
    k = min(s / w0, s / h0)
    ic = ic.resize((max(1, int(w0 * k)), max(1, int(h0 * k))), Image.LANCZOS)
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([x + (cell - s * 0.58) // 2, y + cell * 0.72,
                                x + (cell + s * 0.58) // 2, y + cell * 0.88],
                               fill=(0, 0, 0, 100))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(cell * 0.030)))
    img.alpha_composite(ic, (x + (cell - ic.width) // 2, y + int(cell * 0.04)))

    d = ImageDraw.Draw(img)
    f = font(int(cell * 0.125), True)
    tb = d.textbbox((0, 0), label, font=f)
    pw = max(int(cell * 0.38), tb[2] - tb[0] + int(cell * 0.14))
    ph = int(cell * 0.145)
    px, py = x + (cell - pw) // 2, y + int(cell * 0.825)
    cap = Image.new('RGBA', img.size, (0, 0, 0, 0))
    cc = ring if ring else (58, 76, 104)
    ImageDraw.Draw(cap).rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2,
                                          fill=(cc[0], cc[1], cc[2], 236))
    img.alpha_composite(cap)
    d = ImageDraw.Draw(img)
    d.text((px + pw / 2, py + ph / 2), label, font=f, fill=(255, 255, 255, 255), anchor='mm')
    return img


def one_sheet(kind, cn, en, sub, notes):
    n = len(notes)
    cell, gap, pad, th = 176, 12, 42, 112
    W = int(pad * 2 + n * cell + (n - 1) * gap)
    H = int(th + cell + 118 + pad * 2)
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 28), f'{cn}  ·  {en}', font=font(30, True), fill=(228, 240, 255))
    d.text((pad, 70), f'{n} 级 · 每级造型不同（{sub}）', font=font(14), fill=(140, 162, 192))
    for i in range(n):
        lv = i + 1
        ring = (206, 162, 62) if lv == n else (58, 76, 104)
        img = tile(img, os.path.join(ART, f'{kind}_lv{lv:02d}.png'),
                   int(pad + i * (cell + gap)), th, cell, f'Lv{lv}', ring=ring)
    fy = th + cell + 22
    d = ImageDraw.Draw(img)
    d.text((pad, fy), '结构演进', font=font(16, True), fill=(198, 216, 240))
    fN = font(13)
    per_row = min(n, 5)
    for i, v in enumerate(notes):
        cxi = int(pad + (i % per_row) * ((W - pad * 2) / per_row))
        cyi = int(fy + 26 + (i // per_row) * 22)
        d.ellipse([cxi, cyi + 4, cxi + 7, cyi + 11], fill=(112, 172, 240))
        d.text((cxi + 13, cyi), f'Lv{i+1}', font=fN, fill=(152, 178, 212))
        d.text((cxi + 52, cyi), v, font=fN, fill=(214, 228, 246))
    out = os.path.join(ART, f'sheet_{kind}.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', os.path.basename(out), img.size)


def master_sheet():
    cell, gap, pad = 118, 9, 40
    maxn = 10
    W = int(pad * 2 + maxn * cell + (maxn - 1) * gap)
    rowh = cell + 40
    H = int(96 + len(INFO) * rowh + pad)
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 26), '全部建筑  ·  ALL BUILDINGS', font=font(28, True), fill=(228, 240, 255))
    d.text((pad, 64), '7 种建筑 · 共 65 个等级造型 · 每级结构不同', font=font(13),
           fill=(140, 162, 192))
    fL = font(14, True)
    for r, (kind, cn, en, sub, notes) in enumerate(INFO):
        y0 = int(96 + r * rowh)
        d.text((pad, y0 + cell * 0.40), cn, font=fL, fill=(200, 218, 242))
        for c in range(len(notes)):
            x = int(pad + 56 + c * (cell + gap))
            img = tile(img, os.path.join(ART, f'{kind}_lv{c+1:02d}.png'),
                       x, y0, cell, f'{c+1}', ring=(206, 162, 62) if c == len(notes) - 1 else None)
    out = os.path.join(ART, 'sheet_all_buildings.png')
    img.convert('RGB').save(out, quality=95)
    print('saved sheet_all_buildings.png', img.size)


if __name__ == '__main__':
    for kind, cn, en, sub, notes in INFO:
        one_sheet(kind, cn, en, sub, notes)
    master_sheet()

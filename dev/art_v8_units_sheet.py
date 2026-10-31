# -*- coding: utf-8 -*-
"""兵种 + 法术总览图"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'v8')

UNITS = [
    ('unit_infantry_blue', '步兵', 'INFANTRY', '75金 · 地面 · 打兵 · 只对地', '剑 + 圆盾'),
    ('unit_heavy_blue', '重甲兵', 'HEAVY', '280金 · 地面 · 打兵 · 血量 660', '巨盾 + 重锤'),
    ('unit_siege_blue', '攻城兵', 'SIEGE', '120金 · 地面 · 拆建筑 · 速度最快', '大锤 + 炸药包'),
    ('unit_archer_blue', '弓箭手', 'ARCHER', '180金 · 地面 · 射程 3 格 · 对地对空', '长弓 + 箭袋'),
    ('unit_ram_blue', '攻城车', 'SIEGE RAM', '270金 · 地面 · 拆建筑 · 血量 1480 · 攻击较低', '撞锤 + 金属尖'),
    ('unit_balloon_blue_throw', '气球兵', 'BALLOON', '260金 · 空中 · 打兵 · 对地对空', '气球 + 木篮 + 炸弹'),
    ('unit_airship_blue', '攻城飞艇', 'AIRSHIP', '240金 · 空中 · 拆建筑', '气囊 + 吊舱 + 炸弹'),
    ('unit_dragon_blue', '飞龙', 'DRAGON', '420金 · 空中 · 打兵 · 最贵', '展翼 + 双角 + 焰目'),
]

SPELLS = [
    ('spell_arrowRain', '箭雨', 'ARROW RAIN', 'Lv1 解锁 · 冷却 22s', '范围 5×5 · 伤害 90'),
    ('spell_fireball', '火球', 'FIREBALL', 'Lv2 解锁 · 冷却 26s', '范围 3×3 · 伤害 200'),
    ('spell_rocket', '火箭', 'ROCKET', 'Lv3 解锁 · 冷却 30s', '范围 1×1 · 伤害 420'),
    ('spell_rage', '狂暴', 'RAGE', 'Lv4 解锁 · 冷却 40s', '范围 3×3 · 己方攻速×2，8s'),
    ('spell_freeze', '冰冻', 'FREEZE', 'Lv5 解锁 · 冷却 45s', '范围 3×3 · 全员冻结 4s'),
    ('spell_weaken', '弱化', 'WEAKEN', 'Lv6 解锁 · 冷却 42s', '范围 3×3 · 敌方伤害 -80%，5s'),
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
    cx, cy = W * 0.5, H * 0.45
    d = np.sqrt(((xx - cx) / (W * 0.82)) ** 2 + ((yy - cy) / (H * 0.92)) ** 2)
    t = np.clip(d, 0, 1)
    base = np.array([25, 31, 43], dtype=np.float32)
    lite = np.array([43, 53, 71], dtype=np.float32)
    arr = base[None, None, :] + (lite - base)[None, None, :] * (1 - t)[..., None]
    img = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA')
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for x in range(0, W, 40):
        gd.line([(x, 0), (x, H)], fill=(68, 82, 106, 26), width=1)
    for y in range(0, H, 40):
        gd.line([(0, y), (W, y)], fill=(68, 82, 106, 26), width=1)
    img.alpha_composite(g)
    img.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, 105)))
    v = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(v).ellipse([-W * 0.30, -H * 0.34, W * 1.30, H * 1.34], fill=(0, 0, 0, 100))
    img.alpha_composite(v.filter(ImageFilter.GaussianBlur(min(W, H) * 0.11)))
    return img


def card(img, path, x, y, cw, ch, title, en, line1, line2, ring):
    d = ImageDraw.Draw(img)
    r = int(cw * 0.09)
    d.rounded_rectangle([x, y, x + cw, y + ch], radius=r,
                        fill=(33, 41, 57, 255), outline=(70, 86, 114, 255), width=2)
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rounded_rectangle([x + 2, y + 2, x + cw - 2, y + int(ch * 0.50)],
                                         radius=r - 2, fill=(255, 255, 255, 13))
    img.alpha_composite(ov)

    ic = Image.open(path).convert('RGBA')
    bbox = ic.getchannel('A').getbbox()
    if bbox:
        m = 6
        bbox = (max(0, bbox[0] - m), max(0, bbox[1] - m),
                min(ic.width, bbox[2] + m), min(ic.height, bbox[3] + m))
        ic = ic.crop(bbox)
    s = int(min(cw * 0.72, ch * 0.46))
    k = min(s / ic.width, s / ic.height)
    ic = ic.resize((max(1, int(ic.width * k)), max(1, int(ic.height * k))), Image.LANCZOS)
    img.alpha_composite(ic, (x + (cw - ic.width) // 2, y + int(ch * 0.055)))

    d = ImageDraw.Draw(img)
    # 分隔线
    d.line([(x + cw * 0.14, y + ch * 0.545), (x + cw * 0.86, y + ch * 0.545)],
           fill=(ring[0], ring[1], ring[2], 160), width=2)
    d.text((x + cw / 2, y + int(ch * 0.625)), title, font=font(int(cw * 0.115), True),
           fill=(240, 246, 255), anchor='mm')
    d.text((x + cw / 2, y + int(ch * 0.700)), en, font=font(int(cw * 0.062)),
           fill=(132, 156, 188), anchor='mm')
    d.text((x + cw / 2, y + int(ch * 0.780)), line1, font=font(int(cw * 0.068)),
           fill=(198, 214, 238), anchor='mm')
    d.text((x + cw / 2, y + int(ch * 0.852)), line2, font=font(int(cw * 0.068)),
           fill=(152, 176, 208), anchor='mm')
    return img


def units_sheet():
    cw, ch, gap, pad, th = 232, 300, 13, 40, 104
    cols, rows = 4, 2
    W = int(pad * 2 + cols * cw + (cols - 1) * gap)
    H = int(th + rows * (ch + gap) + pad)
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 26), '全部兵种  ·  ALL UNITS', font=font(29, True), fill=(228, 240, 255))
    d.text((pad, 66), '8 种兵种 · 正俯视 · 阵营色 + 武器剪影 · 能一眼分清「打兵」与「拆建筑」',
           font=font(13), fill=(140, 162, 192))
    for i, (fn, cn, en, l1, l2) in enumerate(UNITS):
        x = int(pad + (i % cols) * (cw + gap))
        y = int(th + (i // cols) * (ch + gap))
        img = card(img, os.path.join(ART, fn + '.png'), x, y, cw, ch, cn, en, l1, l2,
                   (72, 122, 186))
    out = os.path.join(ART, 'sheet_units.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


def spells_sheet():
    cw, ch, gap, pad, th = 208, 280, 13, 40, 104
    cols = 6
    W = int(pad * 2 + cols * cw + (cols - 1) * gap)
    H = int(th + ch + pad)
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 26), '全部法术  ·  ALL SPELLS', font=font(29, True), fill=(228, 240, 255))
    d.text((pad, 66), '6 种法术 · 卡牌图标 · 圆环颜色＝法术色 · 按大本营等级解锁',
           font=font(13), fill=(140, 162, 192))
    for i, (fn, cn, en, l1, l2) in enumerate(SPELLS):
        x = int(pad + i * (cw + gap))
        img = card(img, os.path.join(ART, fn + '.png'), x, th, cw, ch, cn, en, l1, l2,
                   (72, 122, 186))
    out = os.path.join(ART, 'sheet_spells.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


if __name__ == '__main__':
    units_sheet()
    spells_sheet()

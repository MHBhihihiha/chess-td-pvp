# -*- coding: utf-8 -*-
"""底座 + 武器层 拼合预览：验证锚点对齐与旋转是否正确。

用法: python dev/compose_preview.py
产出: art/v9/_sheet_cannon_compose.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(ROOT, 'art', 'v9')
OUT = os.path.join(ART, '_sheet_cannon_compose.png')

BG = (18, 22, 31, 255)
TXT = (206, 222, 240, 255)
ANGLES = [-45, -12, 18, 52]      # 度，正数 = 顺时针（对应 canvas 的 rotate）

import sys

ROWS_BY_FAMILY = {
    'cannon': [
        ('Lv1 木 · 标准炮', 'cannon_base_e1.png', 'cannon_top_e1.png'),
        ('Lv3 石 · 标准炮', 'cannon_base_e2.png', 'cannon_top_e2.png'),
        ('Lv5 铁 · 双管', 'cannon_base_e3.png', 'cannon_twin_top_e3.png'),
        ('Lv7 装甲 · 双管', 'cannon_base_e4.png', 'cannon_twin_top_e4.png'),
        ('Lv10 金 · 双管', 'cannon_base_e5.png', 'cannon_twin_top_e5.png'),
        ('Lv10 金 · 大炮', 'cannon_base_e5.png', 'cannon_bigcannon_top_e5.png'),
    ],
    'arrow': [
        ('Lv1 木 · 标准弓', 'arrow_base_e1.png', 'arrow_top_e1.png'),
        ('Lv3 石 · 标准弓', 'arrow_base_e2.png', 'arrow_top_e2.png'),
        ('Lv5 铁 · 速射塔', 'arrow_base_e3.png', 'arrow_rapid_top_e3.png'),
        ('Lv7 装甲 · 速射塔', 'arrow_base_e4.png', 'arrow_rapid_top_e4.png'),
        ('Lv10 金 · 速射塔', 'arrow_base_e5.png', 'arrow_rapid_top_e5.png'),
        ('Lv5 铁 · 弩塔', 'arrow_base_e3.png', 'arrow_crossbow_top_e3.png'),
        ('Lv7 装甲 · 弩塔', 'arrow_base_e4.png', 'arrow_crossbow_top_e4.png'),
        ('Lv10 金 · 弩塔', 'arrow_base_e5.png', 'arrow_crossbow_top_e5.png'),
    ],
    'mage': [
        ('Lv1 木 · 标准法球', 'mage_base_e1.png', 'mage_top_e1.png'),
        ('Lv3 石 · 标准法球', 'mage_base_e2.png', 'mage_top_e2.png'),
        ('Lv5 铁 · 白魔法', 'mage_base_e3.png', 'mage_white_top_e3.png'),
        ('Lv7 装甲 · 白魔法', 'mage_base_e4.png', 'mage_white_top_e4.png'),
        ('Lv10 金 · 白魔法', 'mage_base_e5.png', 'mage_white_top_e5.png'),
        ('Lv5 铁 · 黑魔法', 'mage_base_e3.png', 'mage_black_top_e3.png'),
        ('Lv7 装甲 · 黑魔法', 'mage_base_e4.png', 'mage_black_top_e4.png'),
        ('Lv10 金 · 黑魔法', 'mage_base_e5.png', 'mage_black_top_e5.png'),
    ],
    'mortar': [
        ('Lv1 木 · 标准炮臼', 'mortar_base_e1.png', 'mortar_top_e1.png'),
        ('Lv3 石 · 标准炮臼', 'mortar_base_e2.png', 'mortar_top_e2.png'),
        ('Lv5 铁 · 重臼', 'mortar_base_e3.png', 'mortar_bigmortar_top_e3.png'),
        ('Lv7 装甲 · 重臼', 'mortar_base_e4.png', 'mortar_bigmortar_top_e4.png'),
        ('Lv10 金 · 重臼', 'mortar_base_e5.png', 'mortar_bigmortar_top_e5.png'),
        ('Lv5 铁 · 导弹', 'mortar_base_e3.png', 'mortar_missile_top_e3.png'),
        ('Lv7 装甲 · 导弹', 'mortar_base_e4.png', 'mortar_missile_top_e4.png'),
        ('Lv10 金 · 导弹', 'mortar_base_e5.png', 'mortar_missile_top_e5.png'),
    ],
    'tesla': [
        ('Lv1 木 · 标准线圈', 'tesla_base_e1.png', 'tesla_top_e1.png'),
        ('Lv3 石 · 标准线圈', 'tesla_base_e2.png', 'tesla_top_e2.png'),
        ('Lv5 铁 · 脉冲环', 'tesla_base_e3.png', 'tesla_pulse_top_e3.png'),
        ('Lv7 装甲 · 脉冲环', 'tesla_base_e4.png', 'tesla_pulse_top_e4.png'),
        ('Lv10 金 · 脉冲环', 'tesla_base_e5.png', 'tesla_pulse_top_e5.png'),
        ('Lv5 铁 · 三叉', 'tesla_base_e3.png', 'tesla_bigtesla_top_e3.png'),
        ('Lv7 装甲 · 三叉', 'tesla_base_e4.png', 'tesla_bigtesla_top_e4.png'),
        ('Lv10 金 · 三叉', 'tesla_base_e5.png', 'tesla_bigtesla_top_e5.png'),
    ],
    'ward': [
        ('Lv1 木 · 无构件', 'ward_body_e1.png', ''),
        ('Lv3 石 · 无构件', 'ward_body_e2.png', ''),
        ('Lv5 铁 · 水晶塔', 'ward_body_e3.png', 'ward_crystal_top_e3.png'),
        ('Lv7 装甲 · 水晶塔', 'ward_body_e4.png', 'ward_crystal_top_e4.png'),
        ('Lv10 金 · 水晶塔', 'ward_body_e5.png', 'ward_crystal_top_e5.png'),
        ('Lv5 铁 · 碉堡塔', 'ward_body_e3.png', 'ward_bunker_top_e3.png'),
        ('Lv7 装甲 · 碉堡塔', 'ward_body_e4.png', 'ward_bunker_top_e4.png'),
        ('Lv10 金 · 碉堡塔', 'ward_body_e5.png', 'ward_bunker_top_e5.png'),
    ],
}

FAMILY = (sys.argv[1] if len(sys.argv) > 1 else 'cannon')
ROWS = ROWS_BY_FAMILY[FAMILY]
OUT = os.path.join(ART, '_sheet_%s_compose.png' % FAMILY)


def compose(base_p, top_p, deg, size=232):
    base = Image.open(os.path.join(ART, base_p)).convert('RGBA')
    canvas = Image.new('RGBA', (base.width, base.height), (0, 0, 0, 0))
    canvas.alpha_composite(base)
    # 有些建筑没有武器/构件层（如防御塔 Lv1-4），只画底座
    if top_p:
        top = Image.open(os.path.join(ART, top_p)).convert('RGBA')
        # 武器层绕画布中心旋转（枢轴被刻意放在中心）
        # PIL 的 rotate 正角是逆时针，canvas 的 rotate 正角是顺时针，所以取负
        rot = top.rotate(-deg, resample=Image.BICUBIC, center=(top.width / 2, top.height / 2))
        canvas.alpha_composite(rot)
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    cell, gap, pad, lbl = 232, 18, 42, 30
    cols = len(ANGLES)
    rows = len(ROWS)
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = pad * 2 + rows * (cell + lbl) + (rows - 1) * gap
    cv = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(cv)
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
        fs = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 14)
    except Exception:
        f = fs = ImageFont.load_default()

    for ri, (label, b, t) in enumerate(ROWS):
        y = pad + ri * (cell + lbl + gap)
        d.text((pad, y - 22), label, font=f, fill=TXT)
        for ci, ang in enumerate(ANGLES):
            x = pad + ci * (cell + gap)
            im = compose(b, t, ang, cell)
            cv.paste(im, (x, y), im)
            if ri == 0:
                txt = '%d°' % ang
                tw = d.textlength(txt, font=fs)
                d.text((x + (cell - tw) / 2, y + cell + 4), txt, font=fs, fill=(127, 148, 176, 255))

    cv.save(OUT)
    print('saved:', OUT, cv.size)


if __name__ == '__main__':
    main()

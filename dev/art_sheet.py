# -*- coding: utf-8 -*-
"""把单张素材拼成对比总览图（带标签），方便一眼看出等级/分支/阵营差异"""
import os
from PIL import Image, ImageDraw, ImageFont

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')


def load(name):
    return Image.open(os.path.join(ART, name)).convert('RGBA')


def get_font(size):
    """优先找系统中文字体，找不到用默认"""
    cands = [
        r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\msyhbd.ttc',
        r'C:\Windows\Fonts\simhei.ttf',
        r'C:\Windows\Fonts\simsun.ttc',
    ]
    for c in cands:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


DARK_BG = (22, 28, 40, 255)
CELL_BG = (34, 42, 58, 255)
TXT = (224, 234, 248, 255)
TXT_DIM = (140, 156, 180, 255)
ACCENT = (110, 190, 255, 255)


def sheet(rows, cols, cell_w, cell_h, title, out_name, pad=16, title_h=64):
    """
    rows: [{'label': str, 'sub': str, 'items': [(png, caption, size)]}]
    """
    W = pad * 2 + cols * cell_w
    H = title_h + pad * 2 + rows.__len__() * (cell_h + pad) - pad
    img = Image.new('RGBA', (W, H), DARK_BG)
    d = ImageDraw.Draw(img)
    f_title = get_font(28)
    f_label = get_font(18)
    f_cap = get_font(15)

    d.text((pad, pad + 6), title, font=f_title, fill=ACCENT)
    d.line([(pad, pad + title_h - 14), (W - pad, pad + title_h - 14)], fill=(52, 66, 90, 255), width=1)

    y = title_h + pad - 8
    for row in rows:
        # 行标签
        d.text((pad, y + 4), row['label'], font=f_label, fill=TXT)
        if row.get('sub'):
            d.text((pad + 4, y + 26), row['sub'], font=f_cap, fill=TXT_DIM)
        x = pad
        for (png, cap, size, *rest) in row['items']:
            box_x = x + 6
            box_y = y - 2
            d.rounded_rectangle([box_x, box_y, box_x + cell_w - 12, box_y + cell_h - 10],
                                radius=8, fill=CELL_BG, outline=(48, 62, 86, 255), width=1)
            try:
                im = load(png)
                im = im.resize((size, size), Image.LANCZOS)
                img.alpha_composite(im, (box_x + (cell_w - 12 - size) // 2, box_y + 8))
            except Exception as e:
                d.text((box_x + 8, box_y + 8), f'missing\n{png}', font=f_cap, fill=(255, 120, 120, 255))
            d.text((box_x + (cell_w - 12) // 2, box_y + cell_h - 32), cap,
                   font=f_cap, fill=TXT, anchor='mm')
            x += cell_w
        y += cell_h + pad

    img.convert('RGB').save(os.path.join(ART, out_name), quality=95)
    print('saved', out_name, img.size)


# ============================================================ 炮塔等级演进
if __name__ == '__main__':
    rows = [
        {'label': '炮塔 Lv1→Lv5', 'sub': '底座变宽 / 铆钉 / 炮管加粗 / 能量核心出现',
         'items': [(f'cannon_blue_lv{l:02d}.png', f'Lv{l}', 128) for l in range(1, 6)]},
        {'label': '炮塔 Lv6→Lv10', 'sub': '装甲带 / 金饰 / 制退器 / Lv10 金环传说级',
         'items': [(f'cannon_blue_lv{l:02d}.png', f'Lv{l}', 128) for l in range(6, 11)]},
        {'label': '分支（Lv5 起步）', 'sub': '双管＝攻速翻倍　巨炮＝伤害翻倍',
         'items': [('cannon_twin_lv05.png', '双管Lv5', 128),
                   ('cannon_big_lv05.png', '巨炮Lv5', 128),
                   ('cannon_twin_lv10.png', '双管Lv10', 128),
                   ('cannon_big_lv10.png', '巨炮Lv10', 128),
                   ('cannon_red_lv10.png', '红方Lv10', 128)]},
    ]
    sheet(rows, 5, 150, 168, '炮塔 —— 等级与分支演进', 'sheet_cannon.png')

    # ======================================================== 气球兵
    rows2 = [
        {'label': '气球兵 蓝方', 'sub': 'idle 待机 / throw 投弹 / wind 飞行风线',
         'items': [('balloon_blue_idle.png', '待机', 128),
                   ('balloon_blue_throw.png', '投弹', 128),
                   ('balloon_blue_wind.png', '飞行', 128)]},
        {'label': '阵营对比', 'sub': '同一兵种两套配色',
         'items': [('balloon_blue_throw.png', '蓝方', 128),
                   ('balloon_red_throw.png', '红方', 128)]},
    ]
    sheet(rows2, 3, 150, 168, '气球兵 —— 动画帧与阵营配色', 'sheet_balloon.png')

    # ======================================================== 大本营
    rows3 = [
        {'label': '大本营 蓝方 Lv1→Lv3', 'sub': 'Lv1 简陋石台无顶 / Lv2 木质尖顶+门 / Lv3 角塔加顶',
         'items': [(f'base_blue_lv{l}.png', f'Lv{l}', 150) for l in range(1, 4)]},
        {'label': '大本营 蓝方 Lv4→Lv6', 'sub': 'Lv4 金色屋脊 / Lv5 角塔插旗+宝珠 / Lv6 金边+外光环',
         'items': [(f'base_blue_lv{l}.png', f'Lv{l}', 150) for l in range(4, 7)]},
        {'label': '大本营 红方 Lv1 / Lv3 / Lv6', 'sub': '同一设计换阵营配色',
         'items': [('base_red_lv1.png', 'Lv1', 150),
                   ('base_red_lv3.png', 'Lv3', 150),
                   ('base_red_lv6.png', 'Lv6', 150)]},
    ]
    sheet(rows3, 3, 170, 190, '大本营 —— 六级演进与阵营', 'sheet_base.png')

    print('done')

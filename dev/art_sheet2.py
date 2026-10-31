# -*- coding: utf-8 -*-
"""生成三张对比总览图（标签放在上方，避免裁切）"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import art_sheet as A


def sheet2(rows, cols, cell_w, cell_h, title, out_name, pad=18, title_h=70):
    W = pad * 2 + cols * cell_w
    H = title_h + pad * 2 + len(rows) * (cell_h + pad + 42) - pad
    img = Image.new('RGBA', (W, H), A.DARK_BG)
    d = ImageDraw.Draw(img)
    f_title, f_row, f_cap = A.get_font(26), A.get_font(17), A.get_font(14)
    d.text((pad, pad + 4), title, font=f_title, fill=A.ACCENT)
    d.line([(pad, pad + title_h - 16), (W - pad, pad + title_h - 16)], fill=(52, 66, 90, 255), width=1)

    y = title_h + pad - 10
    for row in rows:
        d.text((pad, y), row['label'], font=f_row, fill=A.TXT)
        if row.get('sub'):
            d.text((pad, y + 22), row['sub'], font=f_cap, fill=A.TXT_DIM)
        y += 42
        x = pad
        for item in row['items']:
            png, cap, size = item[0], item[1], item[2]
            d.rounded_rectangle([x + 6, y, x + cell_w - 12, y + cell_h - 10], radius=8,
                                fill=A.CELL_BG, outline=(48, 62, 86, 255), width=1)
            try:
                im = A.load(png).resize((size, size), Image.LANCZOS)
                img.alpha_composite(im, (x + (cell_w - 12 - size) // 2, y + 8))
            except Exception as e:
                d.text((x + 10, y + 10), 'missing', font=f_cap, fill=(255, 120, 120, 255))
            d.text((x + (cell_w - 12) // 2, y + cell_h - 34), cap,
                   font=f_cap, fill=A.TXT, anchor='mm')
            x += cell_w
        y += cell_h + pad

    img.convert('RGB').save(os.path.join(A.ART, out_name), quality=95)
    print('saved', out_name, img.size)


# ---------------------------------------------------------------- 气球兵
sheet2([
    {'label': '气球兵 蓝方 —— 动画帧', 'sub': '待机 idle / 投弹 throw（手中炸弹+引线火花）/ 飞行 wind（速度线）',
     'items': [('balloon_blue_idle.png', '待机 idle', 148),
               ('balloon_blue_throw.png', '投弹 throw', 148),
               ('balloon_blue_wind.png', '飞行 wind', 148)]},
    {'label': '阵营配色对比', 'sub': '蓝方＝粉紫气囊+蓝军服　红方＝暖橙气囊+红军服（结构完全一致）',
     'items': [('balloon_blue_throw.png', '蓝方', 148),
               ('balloon_red_throw.png', '红方', 148)]},
], 3, 172, 186, '气球兵 — 动画帧与阵营配色', 'sheet_balloon.png')

# ---------------------------------------------------------------- 大本营
sheet2([
    {'label': '大本营 蓝方 Lv1→Lv3', 'sub': 'Lv1 简陋石台·无屋顶　Lv2 木质尖顶+木门　Lv3 四角塔加锥顶',
     'items': [(f'base_blue_lv{l}.png', f'Lv{l}', 150) for l in range(1, 4)]},
    {'label': '大本营 蓝方 Lv4→Lv6', 'sub': 'Lv4 金色屋脊线　Lv5 角塔插旗+屋顶宝珠　Lv6 全墙金边+外光环',
     'items': [(f'base_blue_lv{l}.png', f'Lv{l}', 150) for l in range(4, 7)]},
    {'label': '大本营 红方 —— 同结构换配色', 'sub': '主色 #ff5a5a / 石材偏暖褐；一眼能分出敌我主堡',
     'items': [('base_red_lv1.png', '红方 Lv1', 150),
               ('base_red_lv3.png', '红方 Lv3', 150),
               ('base_red_lv6.png', '红方 Lv6', 150)]},
], 3, 172, 192, '大本营 — 六级演进与阵营', 'sheet_base.png')

print('done')

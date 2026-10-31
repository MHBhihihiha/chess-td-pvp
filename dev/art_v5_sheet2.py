# -*- coding: utf-8 -*-
"""气球兵 / 大本营 总览图（与炮塔同一套深灰蓝 UI 网格背景）"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_v5_sheet import bg, tile, font, ART
from PIL import Image, ImageDraw
import art_v5 as V

V.OUT = ART


def balloon_sheet():
    cols = 5
    cell = 200
    gap = 16
    pad = 46
    title_h = 112
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = title_h + cell + pad * 2 + 20
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 32), '气球兵  ·  BALLOON SOLDIER', font=font(32, True), fill=(226, 238, 255, 255))
    d.text((pad, 76), '粉色气球 + 木质吊篮 + 卡通小兵；地面投影表示悬浮；投弹帧带炸弹与引线火花',
           font=font(16), fill=(140, 162, 192, 255))
    items = [
        ('balloon_blue_idle.png', '待机', (86, 140, 210, 255)),
        ('balloon_blue_throw.png', '投弹', (210, 130, 90, 255)),
        ('balloon_blue_wind.png', '飞行', (110, 190, 190, 255)),
        ('balloon_blue_throw.png', '蓝方', (86, 160, 226, 255)),
        ('balloon_red_throw.png', '红方', (210, 90, 80, 255)),
    ]
    for i, (fn, lb, ring) in enumerate(items):
        x = pad + i * (cell + gap)
        img = tile(img, os.path.join(ART, fn), x, title_h, cell, lb, ring=ring)
    out = os.path.join(ART, 'sheet_balloon_v5.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


def base_sheet():
    cols = 6
    cell = 210
    gap = 14
    pad = 46
    title_h = 118
    row_h = cell + 42
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = title_h + row_h * 2 + pad * 2 + 30
    img = bg(W, H)
    d = ImageDraw.Draw(img)
    d.text((pad, 30), '大本营  ·  BASE  Lv1 → Lv6', font=font(32, True), fill=(226, 238, 255, 255))
    d.text((pad, 74), '2×2 巨型主堡：城墙 + 四角塔 + 中央主塔 + 屋顶 + 旗帜，逐级加高加饰',
           font=font(16), fill=(140, 162, 192, 255))

    # 第一行：蓝方 6 级
    d.text((pad, title_h - 6), '蓝方 Lv1→Lv6', font=font(18, True), fill=(180, 204, 236, 255))
    y0 = title_h + 26
    for i in range(6):
        x = pad + i * (cell + gap)
        ring = (200, 158, 62, 255) if i == 5 else (58, 76, 104, 255)
        img = tile(img, os.path.join(ART, f'base_blue_lv{i+1}.png'), x, y0, cell,
                   f'Lv{i+1}', ring=ring)

    # 第二行：红方 6 级
    y1 = y0 + row_h
    d.text((pad, y1 - 6), '红方 Lv1→Lv6（同结构，暖褐石材 + 红色主色）',
           font=font(18, True), fill=(236, 180, 176, 255))
    y1 += 26
    for i in range(6):
        x = pad + i * (cell + gap)
        ring = (200, 158, 62, 255) if i == 5 else (110, 60, 58, 255)
        img = tile(img, os.path.join(ART, f'base_red_lv{i+1}.png'), x, y1, cell,
                   f'Lv{i+1}', ring=ring)

    out = os.path.join(ART, 'sheet_base_v5.png')
    img.convert('RGB').save(out, quality=95)
    print('saved', out, img.size)


if __name__ == '__main__':
    balloon_sheet()
    base_sheet()

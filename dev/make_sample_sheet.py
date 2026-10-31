# -*- coding: utf-8 -*-
"""生成样张对比图：新 v9 美术 vs 旧 v8 美术，含「实战尺寸」一比一缩小版。

棋盘单格在桌面端约 40~60px（index.html 里 layout.cell 动态计算），
所以真正的考验是 56px 还有没有质感 —— 这张图就是拿来判这个的。
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'art', 'v9', '_sample_sheet.png')
BG = (18, 22, 31, 255)
LINE = (44, 54, 74, 255)
TXT = (206, 222, 240, 255)
SUB = (127, 148, 176, 255)

BIG, SMALL, GAP = 210, 56, 34
PAD = 44

new_files = ['cannon_lv01_keyed.png', 'cannon_lv05.png', 'cannon_lv10.png']
old_files = ['cannon_lv01.png', 'cannon_lv05.png', 'cannon_lv10.png']


def load(p):
    im = Image.open(p).convert('RGBA')
    return im


def fit(im, box):
    r = min(box / im.width, box / im.height)
    return im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)


def paste_center(canvas, im, cx, cy):
    canvas.paste(im, (cx - im.width // 2, cy - im.height // 2), im)


def main():
    W = PAD * 2 + BIG * 3 + GAP * 2
    H = PAD + 24 + BIG + 26 + SMALL + 46 + 24 + BIG + 26 + SMALL + PAD
    cv = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(cv)
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
        fs = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 14)
    except Exception:
        f = fs = ImageFont.load_default()

    x0 = PAD + BIG // 2

    def row(files, ytop, label, lcolor):
        d.text((PAD, ytop - 26), label, font=f, fill=lcolor)
        for i, fn in enumerate(files):
            p = os.path.join(ROOT, 'art', 'v9' if files is new_files else 'v8', fn)
            if not os.path.exists(p):
                continue
            im = load(p)
            cx = x0 + i * (BIG + GAP)
            paste_center(cv, fit(im, BIG), cx, ytop + BIG // 2)
            paste_center(cv, fit(im, SMALL), cx, ytop + BIG + 26 + SMALL // 2)

    y1 = PAD + 24
    row(new_files, y1, '新 · v9（AI 厚涂 · 彩色描边 · 方向光）', (126, 240, 160, 255))
    y2 = y1 + BIG + 26 + SMALL + 46
    row(old_files, y2, '旧 · v8（统一黑边 · 径向渐变）', (240, 150, 150, 255))

    d.line([(PAD, y2 - 24), (W - PAD, y2 - 24)], fill=LINE, width=1)
    d.text((PAD, H - PAD + 6), '每张下方小图 = 游戏中实际显示尺寸（56px）',
           font=fs, fill=SUB)

    cv.save(OUT)
    print('saved:', OUT, cv.size)


if __name__ == '__main__':
    main()

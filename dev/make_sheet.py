# -*- coding: utf-8 -*-
"""把一组 PNG 拼成一张对比图（深色底，带标签）。

用法:
  python dev/make_sheet.py 输出.png 5 图1.png::标签1 图2.png::标签2 ...
  python dev/make_sheet.py 输出.png 5 --cell 200 *.png
"""
import sys
import os
from PIL import Image, ImageDraw, ImageFont

BG = (18, 22, 31, 255)
TXT = (206, 222, 240, 255)
SUB = (127, 148, 176, 255)


def main():
    args = sys.argv[1:]
    out_path = args[0]
    cols = int(args[1])
    rest = args[2:]
    cell = 200
    if '--cell' in rest:
        i = rest.index('--cell')
        cell = int(rest[i + 1])
        rest = rest[:i] + rest[i + 2:]

    items = []
    for r in rest:
        if '::' in r:
            p, label = r.split('::', 1)
        else:
            p, label = r, os.path.splitext(os.path.basename(r))[0]
        if os.path.exists(p):
            items.append((p, label))
    if not items:
        print('没有可用的输入图片')
        return

    rows = (len(items) + cols - 1) // cols
    GAP, PAD, LBL = 24, 40, 26
    W = PAD * 2 + cols * cell + (cols - 1) * GAP
    H = PAD * 2 + rows * (cell + LBL) + (rows - 1) * GAP
    cv = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(cv)
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
    except Exception:
        f = ImageFont.load_default()

    for idx, (p, label) in enumerate(items):
        cx = idx % cols
        cy = idx // cols
        x = PAD + cx * (cell + GAP)
        y = PAD + cy * (cell + LBL + GAP)
        im = Image.open(p).convert('RGBA')
        r = min(cell / im.width, cell / im.height)
        im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
        cv.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
        tw = d.textlength(label, font=f)
        d.text((x + (cell - tw) / 2, y + cell + 6), label, font=f, fill=TXT)

    cv.save(out_path)
    print('saved:', out_path, cv.size, '| %d 张' % len(items))


if __name__ == '__main__':
    main()

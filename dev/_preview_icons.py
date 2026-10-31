# -*- coding: utf-8 -*-
"""把 4 张新图标按 UI 实际尺寸（46px / 58px）贴到深底上做目检对比图。

验收点（docs/art/icons-and-grass.md）：
  · 46px 下剪影可辨、四张互不混淆
  · 四张不透明像素覆盖率互差 ≤ 15%
  · 深底上边缘干净（白底 flood fill 没啃掉刀光/炮口焰的软边）
"""
from PIL import Image
import numpy as np

BASE = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\art\v9"
OUT = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\dev\_gen\icons_preview.png"
KEYS = [("up_bAtk", "bAtk"), ("up_bHp", "bHp"), ("up_uAtk", "uAtk"), ("up_uHp", "uHp")]

BG = (18, 22, 31)          # #12161f 深底
CELL_BG = (36, 56, 41)     # 卡片底色（林绿）
SIZES = [58, 46, 32]

pad = 16
W = pad + len(KEYS) * (58 + pad)
H = pad + 58 + pad + 58 + pad + 40 + pad
canvas = Image.new("RGB", (W, H), BG)

coverages = []
for i, (key, label) in enumerate(KEYS):
    src = Image.open(f"{BASE}\\{key}.png").convert("RGBA")
    a = np.array(src)[:, :, 3]
    coverages.append(float((a > 16).mean() * 100))
    x = pad + i * (58 + pad)
    # 第一行：58px（建议的新尺寸）
    big = src.resize((58, 58), Image.LANCZOS)
    box = Image.new("RGBA", (58, 58), CELL_BG + (255,))
    box.alpha_composite(big)
    canvas.paste(box.convert("RGB"), (x, pad))
    # 第二行：46px（现尺寸）
    mid = src.resize((46, 46), Image.LANCZOS)
    canvas.paste(mid, (x + 6, pad + 58 + pad))
    # 第三行：32px 极限
    canvas.paste(src.resize((32, 32), Image.LANCZOS), (x + 13, pad + 58 + pad + 58 + pad + 4))

canvas.save(OUT)
print("saved", OUT, canvas.size)
print("coverage %:", [round(c, 1) for c in coverages])
print("max spread:", round(max(coverages) - min(coverages), 1), "pp  (target <= 15pp)")

# -*- coding: utf-8 -*-
"""程序化生成「细叶草地」无缝灰度贴图（v2：超采样柔化版）。

为什么要换掉 ImageGen 版（docs/art/icons-and-grass.md v2 §B5）：
  ImageGen 给的是「有主体的画面」——宽叶蕨状团簇，每团约 1 个棋盘格大，
  在 44px 单格里就是 6~10 颗卵石，四档缩放全部读作石材。
  草地需要「没有主体的纹理」：单格里应有几十根细叶，而不是几个团块。

为什么要 4× 超采样：
  直接在 512 上画 line，边缘是硬像素台阶，放大看像「碎玻璃 / 竹签」；
  在 2048 上画完 LANCZOS 缩到 512，边缘自然变柔，才是草叶的观感。

关键参数：
  · 叶长 6~16px、宽 1~2px（512 尺度下）→ 44px 单格里是细密草叶
  · 三段折线（近似弯曲）而不是两段，避免「V 形折角」
  · 方向全向 0~360°（俯视图里草没有「上」，见下方 ★ 注释）
  · 三层重新分配 0.28 / 0.38 / 0.34，亮度 74~106 / 106~144 / 138~174
    ── 受光层原本只占 0.20（每格 15 根）而又亮又少，贴上棋盘读作「平滑绿板上撒的浅色亮片」
       而不是草坪。靠调 α 或减密度都治不了（前者让亮片更亮、后者让亮片更少），
       只能重新分配占比：受光层 0.20→0.34，同时把明度天花板 198→174 压回去。
  · 低频底座 ±9（2 组相位正弦，周期 128px / 73px）→ 44px 尺度上才有地形起伏，
    否则底色是一块「平滑绿板」，所有叶片都像浮在板上。见勘误 17。
  · wrap 绘制（±512 九偏移）→ 天然无缝，**镜像拼接步骤整个不需要**（镜像正是万花筒对称的来源）
"""
import numpy as np
from PIL import Image, ImageDraw

OUT = r"C:\Users\马海博\WorkBuddy\2026-10-27-09-04-28\game\art\v9\tex_grass.png"
S = 512
SS = 4                      # 超采样倍数
W = S * SS
BASE_V = 118
# 笔数 6400：受光层每格根数 = N_BLADES × HL_SHARE × (cell/k)²/512²，k=0.75。
#   cell=44 → 28.6、cell=42（board-shot 实测）→ 26.0，都落在 C1b 的 [25,45] 内。
#   5600 时 cell=44 只得 25.0（正压下限）、cell=42 得 22.8（已跌破）—— 所以抬到 6400。
#   C1 的总量上限 90 根/格对应笔数上限 6854，6400 仍有余量。
N_BLADES = 6400
HL_SHARE = 0.34             # 受光层占比，必须与 LAYERS 第三项一致
rng = np.random.default_rng(20261028)

img = Image.new("L", (W, W), BASE_V)
d = ImageDraw.Draw(img)


def draw_blade(x, y, length, width, angle_deg, value):
    """三段折线近似弯曲叶片；9 个 wrap 偏移各画一次 → 无缝。"""
    a = np.deg2rad(angle_deg)
    dx, dy = np.cos(a), np.sin(a)
    bend = rng.uniform(-0.30, 0.30)
    # 端点序列：起点 → 1/3 → 2/3 → 终点，中段向侧向弯
    pts = []
    for t in (0.0, 0.34, 0.68, 1.0):
        px = x + dx * length * t - dy * length * bend * (t ** 2)
        py = y + dy * length * t + dx * length * bend * (t ** 2)
        pts.append((px, py))

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    for ox in (-W, 0, W):
        for oy in (-W, 0, W):
            if max(xs) + ox < -6 or min(xs) + ox > W + 6:
                continue
            if max(ys) + oy < -6 or min(ys) + oy > W + 6:
                continue
            shifted = [(p[0] + ox, p[1] + oy) for p in pts]
            d.line(shifted, fill=int(value), width=width, joint="curve")


# 三层：(笔数占比, 叶长范围, 叶宽范围, 亮度范围, 方向抖动)
# ★ 方向必须是全向（0–360°）：这是**俯视**草地，草没有「上」。
#   早期版本用 -90°±40°（按「草向上长」的直觉写的），结果所有叶片同向，
#   超采样柔化后变成一片同向软斜痕，1.5× 铺上去就是「人造草坪刷痕 / 地毯纹」。
#   L5 的手绘草尖只能稀释它、抹不掉它——实测关掉 L5 后斜痕反而更明显。
LAYERS = [
    (0.28, (10, 16), (1, 2), (74, 106)),    # 暗叶：压在下层，制造簇间暗部
    (0.38, (8, 14), (1, 2), (106, 144)),    # 中性叶：主体
    (0.34, (6, 10), (1, 1), (138, 174)),    # 受光叶尖：占比 0.20→0.34，明度 150–198→138–174
]

total = 0
for share, lr, wr, vr in LAYERS:
    for _ in range(int(N_BLADES * share)):
        x = rng.uniform(0, W)
        y = rng.uniform(0, W)
        length = rng.uniform(*lr) * SS
        width = int(rng.integers(wr[0], wr[1] + 1)) * SS
        angle = rng.uniform(0, 360)          # ★ 全向
        value = rng.uniform(*vr)
        draw_blade(x, y, length, width, angle, value)
        total += 1

# 超采样缩回 512 → 边缘柔化。
# 注意：**不能用 resize(LANCZOS)** —— 它的卷积核会吃到画布外像素，边缘被拉黑，
# 接缝反而从 9 涨到 16。改用 box 平均（4×4 块内均值），每块都在画布内，
# 数学上与 wrap 绘制一致，接缝天然保持。
arr = np.array(img).astype(np.float32)
arr = arr.reshape(S, SS, S, SS).mean(axis=(1, 3))
arr -= arr.mean()
arr *= 24.0 / max(1e-6, arr.std())     # 目标 std ≈ 24：够有层次，又不抢棋子

# 低频底座（勘误 17）：2 组相位正弦叠出的低频亮度漂移，峰值 ±9。
# 规格从 v2 起就写了这一项，但代码里从来没实现过 —— 只核了均值/std/接缝/镜像，
# 没核「每条规格是否都落地」，于是底色成了无起伏的「平滑绿板」，叶片像浮在板上。
# 周期必须取 512 的整数分之一（4 周期 = 128px、7 周期 ≈ 73px），
# 否则首尾相位不一致，接缝处亮度跳变，前面为无缝做的 wrap 功夫全废。
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
ph1, ph2 = rng.uniform(0, 2 * np.pi, 2)
lowf = (4.5 * np.sin(2 * np.pi * 4 * yy / S + ph1) +
        4.5 * np.sin(2 * np.pi * 7 * xx / S + ph2))
lowf -= lowf.mean()
# 能量守恒叠加：高频部分按 sqrt(1−(σ_lowf/24)²) 降权，叠加后总 std 仍 ≈24
# （规格要求「生成后重新归一化到 std 24」，直接相加会顶到 ~24.4 并把高光冲掉）
arr = arr * np.sqrt(max(0.0, 1.0 - (lowf.std() / 24.0) ** 2)) + lowf
print("lowf amp", round(float(np.abs(lowf).max()), 2), "std", round(float(lowf.std()), 3))

arr += BASE_V
arr = np.clip(arr, 0, 255)
out = Image.fromarray(arr.astype(np.uint8), "L")
out.save(OUT)

a = np.array(out).astype(np.int16)
print("blades drawn:", total, "| supersample", SS)
print("mean", round(float(a.mean()), 2), "std", round(float(a.std()), 2),
      "min", int(a.min()), "max", int(a.max()))
print("seam L/R", round(float(np.abs(a[:, 0] - a[:, -1]).mean()), 3),
      "T/B", round(float(np.abs(a[0, :] - a[-1, :]).mean()), 3))
print("mirror LR diff (should be LARGE):",
      round(float(np.abs(a[:, :256] - a[:, ::-1][:, :256]).mean()), 2))
# B8-9 哨兵：8×8 块均值 std 反映「低频起伏是否真实存在」。
# 旧版（无低频底座）= 1.53，新版 ≈ 4.4 —— 阈值 3.0 能可靠区分，二者互不污染。
_bm = a.astype(np.float32).reshape(8, 64, 8, 64).mean(axis=(1, 3))
print("block8 std (B8-9):", round(float(_bm.std()), 3), " threshold 3.0")
print("saved", OUT)

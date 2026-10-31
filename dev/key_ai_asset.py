# -*- coding: utf-8 -*-
"""AI 生图素材抠图 / 归一化管线。

生图模型不保证真 alpha：经常把「透明背景」画成灰白棋盘格（RGB 无 alpha 通道）。
本脚本做四件事：
  1. 从四边采样学习背景色（棋盘格 = 两种灰白），生成候选背景掩膜
  2. 从图像边缘 flood fill，只吃掉「与边缘连通」的背景 —— 物体内部的白色高光不会被误删
  3. 轻微内缩 1px + alpha 羽化，消除贴在深色棋盘上的浅色光晕
  4. 按内容裁切、居中、等比缩放到目标画幅，输出干净 PNG

用法：
  python key_ai_asset.py <输入图> <输出图> [--size 512] [--preview 预览图]
"""
import sys
import os
import argparse
import numpy as np
from PIL import Image, ImageFilter


def learn_bg_colors(arr, band=3, tol=10, k=2):
    """从四边取色，聚类出背景主色（棋盘格的两种灰白）。"""
    edges = np.concatenate([
        arr[:band].reshape(-1, 3), arr[-band:].reshape(-1, 3),
        arr[:, :band].reshape(-1, 3), arr[:, -band:].reshape(-1, 3),
    ])
    q = (edges // tol) * tol
    vals, counts = np.unique(q, axis=0, return_counts=True)
    idx = np.argsort(-counts)[:k]
    return [vals[i].astype(np.int16) for i in idx if counts[i] > edges.shape[0] * 0.02]


def bg_candidate(arr, colors, tol=22):
    """到任一背景色的距离小于 tol 认为是背景候选。"""
    d = np.full(arr.shape[:2], 1e9)
    for c in colors:
        dist = np.sqrt(((arr - c) ** 2).sum(axis=2))
        d = np.minimum(d, dist)
    return d < tol


def flood_from_border(cand):
    """只保留从边缘可达的候选背景（4 邻域迭代膨胀）。"""
    seed = np.zeros_like(cand)
    seed[0, :] = cand[0, :]
    seed[-1, :] = cand[-1, :]
    seed[:, 0] = cand[:, 0]
    seed[:, -1] = cand[:, -1]
    prev = 0
    while True:
        cur = int(seed.sum())
        if cur == prev:
            break
        prev = cur
        grown = seed.copy()
        grown[1:, :] |= seed[:-1, :]
        grown[:-1, :] |= seed[1:, :]
        grown[:, 1:] |= seed[:, :-1]
        grown[:, :-1] |= seed[:, 1:]
        seed = grown & cand
    return seed


def fill_enclosed_bg(cand, bg, min_px=260):
    """吃掉「被物体围住、但从画面边缘够不到」的背景（如木架内部的白色三角）。

    做法：对背景候选做连通域分析，凡是没被外部 flood fill 覆盖、且面积大于 min_px
    的连通块，判定为「封闭背景」一并删除。
    只删大块：真正的白色高光通常又小又碎，面积门槛能保住它们。
    """
    from scipy import ndimage
    lbl, n = ndimage.label(cand)
    if n == 0:
        return bg
    out = bg.copy()
    sizes = ndimage.sum(cand, lbl, range(1, n + 1))
    reached = set(np.unique(lbl[bg])) - {0}          # 已被外部填充覆盖的连通块
    for i in range(1, n + 1):
        if i in reached:
            continue
        if sizes[i - 1] >= min_px:
            out |= (lbl == i)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--size', type=int, default=512)
    ap.add_argument('--preview', default=None)
    # 锚点：
    #   center = 物体居中（整图/图标/特效）
    #   bottom = 底边对齐画布底部（底座层，保证占地中心一致）
    #   pivot  = 枢轴点放画布正中心（武器层，炮管绕它旋转）
    ap.add_argument('--anchor', default='center', choices=['center', 'bottom', 'pivot'])
    ap.add_argument('--pivot-x', type=float, default=0.18,
                    help='pivot 模式下，枢轴在包围盒宽度上的相对位置（0=最左）')
    ap.add_argument('--pivot-y', type=float, default=0.5,
                    help='pivot 模式下，枢轴在包围盒高度上的相对位置（0=最上，1=最下）。'
                         '炮管用 0.5，站立小人用 0.92（绕脚下转）')
    # 共享构图网格：两层不能用同一个"填满画幅"规则，否则炮管会和底座一样大
    ap.add_argument('--fit', type=float, default=0.94,
                    help='物体最长边占画幅的比例')
    ap.add_argument('--pivot-at', default='0.5,0.455',
                    help='pivot 模式下，枢轴要落在画幅的这个相对坐标（x,y）')
    ap.add_argument('--luma-key', action='store_true',
                    help='亮度键控：alpha = 亮度×gain。用于纯黑底拍摄的发光特效（火光/爆炸/光效）。'
                         '普通物体不要用，会把暗部一起吃掉。')
    ap.add_argument('--luma-gain', type=float, default=1.6,
                    help='亮度键控的增益，越大边缘越实、光晕越不容易糊掉')
    a = ap.parse_args()

    img = Image.open(a.src).convert('RGB')
    arr = np.array(img).astype(np.int16)
    h, w = arr.shape[:2]

    if a.luma_key:
        '''发光特效：alpha 直接取亮度。
        flood fill 抠出来的是硬边（0/255），火焰和光晕会有一圈明显的"剪切线"；
        亮度键控得到的是连续 alpha，叠到棋盘上才是自然的辉光衰减。
        注意：暗部会变成半透明 —— 对黑底拍摄的特效正是想要的。'''
        lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
        alpha = np.clip(lum * a.luma_gain, 0, 255).astype(np.uint8)
        am = Image.fromarray(alpha, 'L')
        am = am.filter(ImageFilter.GaussianBlur(0.5))       # 只做极轻羽化，保留硬核心
    else:
        colors = learn_bg_colors(arr)
        cand = bg_candidate(arr, colors)
        bg = flood_from_border(cand)
        bg = fill_enclosed_bg(cand, bg)      # 补掉被物体围住的封闭背景

        alpha = np.where(bg, 0, 255).astype(np.uint8)
        am = Image.fromarray(alpha, 'L')
        am = am.filter(ImageFilter.MinFilter(3))          # 内缩 1px，去浅色描边
        am = am.filter(ImageFilter.GaussianBlur(0.7))     # 羽化

    out = img.convert('RGBA')
    out.putalpha(am)

    bbox = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)

    # 等比缩放：物体最长边占画幅 fit 比例
    tw = int(a.size * a.fit)
    r = min(tw / out.width, tw / out.height)
    out = out.resize((max(1, round(out.width * r)), max(1, round(out.height * r))), Image.LANCZOS)
    canvas = Image.new('RGBA', (a.size, a.size), (0, 0, 0, 0))
    if a.anchor == 'bottom':
        # 底边对齐：整个家族的地面线一致，棋盘上不会高低不齐
        margin = int(a.size * 0.03)
        px = (a.size - out.width) // 2
        py = a.size - margin - out.height
    elif a.anchor == 'pivot':
        # 枢轴对齐：把炮管转轴放到共享构图网格的固定位置，两层才拼得上
        pivot_x = out.width * a.pivot_x
        pivot_y = out.height * a.pivot_y
        tx, ty = [float(v) for v in a.pivot_at.split(',')]
        px = int(round(a.size * tx - pivot_x))
        py = int(round(a.size * ty - pivot_y))
    else:
        px = (a.size - out.width) // 2
        py = (a.size - out.height) // 2
    canvas.paste(out, (px, py), out)
    canvas.save(a.dst)

    print('bg colors:', [tuple(int(x) for x in c) for c in colors])
    print('bg ratio: %.3f' % bg.mean())
    print('saved:', a.dst, canvas.size, '| anchor=' + a.anchor,
          '| fit=%.2f' % a.fit, '| obj=%dx%d' % (out.width, out.height), '| paste=(%d,%d)' % (px, py))

    if a.preview:
        # 贴到游戏底色 #12161f 上，重点看边缘有没有浅色光晕
        bgc = Image.new('RGBA', (canvas.width * 2 + 24, canvas.height), (18, 22, 31, 255))
        bgc.paste(canvas, (0, 0), canvas)
        small = canvas.resize((canvas.width // 2, canvas.height // 2), Image.LANCZOS)
        bgc.paste(small, (canvas.width + 24, canvas.height // 4), small)
        bgc.save(a.preview)
        print('preview:', a.preview)


if __name__ == '__main__':
    main()

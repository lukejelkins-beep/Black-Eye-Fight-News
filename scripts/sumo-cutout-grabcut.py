#!/usr/bin/env python3
"""Make a transparent cut-out WebP from a plain-studio-background portrait.

Display-only derivative of an approved portrait; the original is never edited.
Usage: sumo-cutout.py in.jpg out.webp
"""
import sys
import cv2
import numpy as np


def cutout(src, max_h=1400, offset=False):
    img = cv2.imread(src, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    scale = min(1.0, max_h / h)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]
    # Work at <=700px high for the segmentation, then upscale the soft mask.
    ws = 700 / h if h > 700 else 1.0
    small = cv2.resize(img, (int(w * ws), int(h * ws)), interpolation=cv2.INTER_AREA) if ws < 1 else img.copy()
    sh, sw = small.shape[:2]
    lab = cv2.cvtColor(small, cv2.COLOR_BGR2LAB).astype(np.float32)
    # Background colour model from the border strip.
    bw = max(4, sw // 40)
    border = np.concatenate([
        lab[:bw].reshape(-1, 3), lab[:, :bw].reshape(-1, 3), lab[:, -bw:].reshape(-1, 3)])
    mean = border.mean(0)
    dist = np.linalg.norm(lab - mean, axis=2)
    mask = np.full((sh, sw), cv2.GC_PR_BGD, np.uint8)
    mask[dist > 28] = cv2.GC_PR_FGD
    mask[dist > 55] = cv2.GC_FGD
    mask[:bw] = cv2.GC_BGD
    mask[:, :bw] = cv2.GC_BGD
    mask[:, -bw:] = cv2.GC_BGD
    # The wrestler stands in the central column: force the core to foreground.
    cx0, cx1 = int(sw * 0.38), int(sw * 0.62)
    mask[int(sh * 0.20):int(sh * 0.62), cx0:cx1] = cv2.GC_FGD
    lx0, lx1 = int(sw * 0.28), int(sw * 0.72)
    mask[int(sh * 0.45):int(sh * 0.90), lx0:lx1] = cv2.GC_PR_FGD
    mask[dist < 3] = cv2.GC_BGD
    mask[int(sh * 0.45):int(sh * 0.90), cx0:cx1][dist[int(sh * 0.45):int(sh * 0.90), cx0:cx1] >= 3] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(small, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # Keep the largest component and fill holes.
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        fg = np.where(lbl == big, 255, 0).astype(np.uint8)
    inv = 255 - fg
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(inv, 8)
    for i in range(1, n):
        x, y, ww, hh, a = stats[i]
        touches = x == 0 or y == 0 or x + ww == sw or y + hh == sh
        if not touches and a < sw * sh * 0.02:
            fg[lbl == i] = 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    alpha = cv2.resize(fg, (w, h), interpolation=cv2.INTER_LINEAR)
    # Drop the JSA logo/credit strip in the bottom-right corner (credit is shown as a caption).
    alpha[int(h * 0.90):, int(w * 0.60):] = 0
    n2, l2, st2, _ = cv2.connectedComponentsWithStats((alpha > 128).astype(np.uint8), 8)
    if n2 > 1:
        keep = [i for i in range(1, n2) if st2[i, cv2.CC_STAT_AREA] > 0.01 * w * h]
        alpha = np.where(np.isin(l2, keep), alpha, 0).astype(np.uint8)
    # Floor remnants: dark, low-saturation pixels near the bottom are not skin or cloth.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    floor = (hsv[:, :, 1] < 45) & (hsv[:, :, 2] < 115)
    floor[: int(h * 0.88)] = False
    alpha = np.where(floor, 0, alpha).astype(np.uint8)
    # White apron / paper streamers (shide) against the white studio: close light gaps
    # in the central column only, where the apron hangs (arms stay outside it).
    y0, y1, x0, x1 = int(h * 0.40), int(h * 0.84), int(w * 0.30), int(w * 0.70)
    band = (alpha[y0:y1, x0:x1] > 128).astype(np.uint8)
    kx = max(5, (w // 14) | 1)
    closed = cv2.morphologyEx(band, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (kx, 3)))
    light = (hsv[y0:y1, x0:x1, 1] < 70) & (hsv[y0:y1, x0:x1, 2] > 150)
    add = (closed > 0) & (band == 0) & light
    alpha[y0:y1, x0:x1][add] = 255
    # Bottom corners: drop floor tones, keep feet (skin is more saturated than the floor).
    corner = np.zeros((h, w), bool)
    corner[int(h * 0.88):, : int(w * 0.14)] = True
    corner[int(h * 0.88):, int(w * 0.86):] = True
    notskin = hsv[:, :, 1] < 55
    alpha = np.where(corner & notskin, 0, alpha).astype(np.uint8)
    # White studio floor below the apron fringe.
    white = (hsv[:, :, 1] < 32) & (hsv[:, :, 2] > 198)
    white[: int(h * 0.82)] = False
    alpha = np.where(white, 0, alpha).astype(np.uint8)
    # Specks: keep only sizeable components.
    b2 = cv2.morphologyEx((alpha > 100).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n3, l3, st3, _ = cv2.connectedComponentsWithStats(b2, 8)
    keepm = np.zeros_like(b2)
    for i in range(1, n3):
        if st3[i, cv2.CC_STAT_AREA] > 0.004 * w * h:
            keepm[l3 == i] = 1
    alpha = np.where(cv2.dilate(keepm, np.ones((5, 5), np.uint8)) > 0, alpha, 0).astype(np.uint8)
    k = max(3, (w // 300) | 1)
    alpha = cv2.erode(alpha, np.ones((2, 2), np.uint8))
    alpha = cv2.GaussianBlur(alpha, (k, k), 0)
    out = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    out[:, :, 3] = alpha
    ys, xs = np.where(alpha > 8)
    ox = oy = 0
    if len(ys):
        pad = 4
        oy, ox = max(0, ys.min() - pad), max(0, xs.min() - pad)
        out = out[oy:ys.max() + pad, ox:xs.max() + pad]
    # offset=True also returns where the crop sits in the (resized) original.
    return (out, (ox, oy)) if offset else out


if __name__ == '__main__':
    res = cutout(sys.argv[1])
    cv2.imwrite(sys.argv[2], res, [cv2.IMWRITE_WEBP_QUALITY, 88])

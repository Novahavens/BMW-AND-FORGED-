"""python3 scripts/rim3d/mask_outline.py mask.png shapes.json [--round 5] [--sigma 2.5] [--tol 0.35] [--fold N]
Face mask (make-bar-face convention: PNG radius 1 = rim outer radius) -> outlines for
build_rim.py --shapes, without the engine's re-processing: corners rounded by an open/close
with a disc, edges blurred, sub-pixel marching squares, light simplification. Small islands are
dropped (every spoke one piece). Output units: trace units (build_rim multiplies by 0.975)."""
import json, argparse, math
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure
ap = argparse.ArgumentParser(); ap.add_argument('mask'); ap.add_argument('out')
ap.add_argument('--round', type=int, default=5); ap.add_argument('--sigma', type=float, default=2.5)
ap.add_argument('--tol', type=float, default=0.35); ap.add_argument('--sg', type=int, default=0, help='Savitzky-Golay smoothing along each outline, window in px of arc length (0 = off): removes the low wobble a photo cut-out leaves along a spoke edge, keeps corners better than a wider blur'); ap.add_argument('--fold', type=int, default=0)
a = ap.parse_args()
m = np.asarray(Image.open(a.mask).convert('RGBA'))[..., 3].astype(np.float32) / 255
N = m.shape[0]; c = (N - 1) / 2; Rn = N / 2
b = m > 0.5
if a.round:
    yy, xx = np.mgrid[-a.round:a.round + 1, -a.round:a.round + 1]; disk = xx * xx + yy * yy <= a.round * a.round
    b = ndimage.binary_closing(b, disk); b = ndimage.binary_opening(b, disk)
lab, n = ndimage.label(b); sizes = ndimage.sum(b, lab, range(1, n + 1)); b = lab == 1 + int(np.argmax(sizes))
print('solid pieces', n, '-> 1')
f = ndimage.gaussian_filter(b.astype(np.float32), a.sigma)
cs = measure.find_contours(np.pad(f, 2), 0.5)
loops = []
for q in cs:
    q = q - 2
    if len(q) < 12: continue
    if a.sg:
        from scipy.signal import savgol_filter
        d = np.r_[0, np.cumsum(np.hypot(*np.diff(q, axis=0).T))]; L = d[-1]
        k = max(int(L), 16); t = np.linspace(0, L, k, endpoint=False)
        q = np.stack([np.interp(t, d, q[:, 0]), np.interp(t, d, q[:, 1])], 1)
        w = min(a.sg | 1, (k - 1) | 1 if k % 2 == 0 else k - 2)
        q = savgol_filter(q, w, 3, axis=0, mode='wrap'); q = np.vstack([q, q[:1]])
    q = measure.approximate_polygon(q, a.tol)
    pts = [[round((x - c) / Rn / 0.975, 5), round((c - y) / Rn / 0.975, 5)] for y, x in q[:-1]]
    area = 0.5 * sum(p[0] * r[1] - r[0] * p[1] for p, r in zip(pts, pts[1:] + pts[:1]))
    loops.append((abs(area), pts))
loops.sort(key=lambda t: -t[0])
outer = loops[0][1]; holes = [p for _, p in loops[1:]]
json.dump({'symmetry': a.fold, 'mode': 'mask-py', 'size': N, 'shapes': [{'outer': outer, 'holes': holes}]}, open(a.out, 'w'))
print(f'{len(holes)} holes, {sum(len(h) for h in holes) + len(outer)} points')

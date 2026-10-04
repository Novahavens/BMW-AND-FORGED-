"""Turns an angled rim photo (or cut-out) into a front-on one: fits an ellipse through points on
the rim's front lip and maps it to a circle. Alpha is kept, everything outside the lip is cleared.

  python3 scripts/rim3d/rectify.py <in.png|jpg> <out.png> '<[[x,y],...]>' [--size 2048] [--overlay check.jpg]

Pick 6-10 points spread all round the front edge of the lip (pixel coordinates in the input).
Writes a 2048² image whose rim circle fills the frame, as convert.sh / trace-mask.cjs expect.
"""
import argparse, json
import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('points')
ap.add_argument('--size', type=int, default=2048); ap.add_argument('--overlay')
a = ap.parse_args()
pts = np.array(json.loads(a.points), float)
x, y = pts[:, 0], pts[:, 1]
_, _, Vt = np.linalg.svd(np.c_[x * x, x * y, y * y, x, y, np.ones_like(x)])
A, B, C, D, E, F = Vt[-1]
M = np.array([[A, B / 2], [B / 2, C]]); ctr = np.linalg.solve(2 * M, -np.array([D, E]))
F0 = F + 0.5 * (D * ctr[0] + E * ctr[1]); w, v = np.linalg.eigh(M); axes = np.sqrt(-F0 / w)
if np.linalg.det(v) < 0: v[:, 1] *= -1  # a rotation, never a mirror: directional spokes must keep their direction
# keep the photo's orientation: undo the eigenvector rotation so 'up' stays up
ang = np.arctan2(v[1, 0], v[0, 0]); rot = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
print('centre', ctr.round(1), 'axes', axes.round(1), 'ratio', round(axes.min() / axes.max(), 3))
im = Image.open(a.src).convert('RGBA'); src = np.asarray(im)
N = a.size; R = N / 2; c = (N - 1) / 2
yy, xx = np.mgrid[0:N, 0:N]; q = np.stack([(xx - c) / R, (yy - c) / R], -1)
s = ctr + ((q @ rot) * axes) @ v.T
sx = np.clip(s[..., 0], 0, src.shape[1] - 1).round().astype(int); sy = np.clip(s[..., 1], 0, src.shape[0] - 1).round().astype(int)
out = src[sy, sx].copy(); out[np.hypot(xx - c, yy - c) > R] = 0
Image.fromarray(out).save(a.out); print('wrote', a.out)
if a.overlay:
    g = im.convert('RGB'); d = ImageDraw.Draw(g); t = np.linspace(0, 2 * np.pi, 720)
    P = ctr[:, None] + v @ (axes[:, None] * np.vstack([np.cos(t), np.sin(t)]))
    d.line(list(map(tuple, P.T)), fill=(0, 255, 0), width=max(3, im.width // 300))
    for p in pts: d.ellipse([p[0] - 15, p[1] - 15, p[0] + 15, p[1] + 15], outline=(255, 0, 0), width=6)
    g.thumbnail((900, 900)); g.save(a.overlay, quality=80)

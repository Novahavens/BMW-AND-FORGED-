"""python3 scripts/rim3d/clean_face.py shapes.json out.png [--scale 1] [--ring 0] [--island 0.002] [--hole 0.0005] [--sigma 3]
Rasterises traced outlines (trace-mask.cjs) into a face mask in the make-bar-face convention (PNG
radius 1 = rim outer radius, spokes meet the lip at 0.916, solid ring r>0.93), with clean-up:
--scale grows the face about the centre, --ring makes everything outside that radius solid (tips
join the lip ring), islands / holes smaller than the given area (fraction of the disc) are dropped,
--sigma blurs and re-thresholds the edges (px at 2048)."""
import json, sys, argparse
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
ap = argparse.ArgumentParser(); ap.add_argument('shapes'); ap.add_argument('out')
ap.add_argument('--scale', type=float, default=1); ap.add_argument('--ring', type=float, default=0)
ap.add_argument('--island', type=float, default=0.002); ap.add_argument('--hole', type=float, default=0.0005)
ap.add_argument('--sigma', type=float, default=3)
a = ap.parse_args()
N = 2048; S = 2; c = (N * S - 1) / 2; R = N * S / 2
s = json.load(open(a.shapes)); k = 0.975 * a.scale
img = Image.new('L', (N * S, N * S), 0); d = ImageDraw.Draw(img)
P = lambda l: [(c + x * k * R, c - y * k * R) for x, y in l]
for sh in s['shapes']:
    d.polygon(P(sh['outer']), fill=255)
for sh in s['shapes']:
    for h in sh['holes']: d.polygon(P(h), fill=0)
m = np.asarray(img.resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
yy, xx = np.mgrid[0:N, 0:N]; cc = (N - 1) / 2; r = np.hypot(xx - cc, yy - cc) / (N / 2)
if a.ring: m = np.where(r > a.ring, 1.0, m)
m = np.where(r > 0.93, 1.0, m)
b = m > 0.5
disc = np.pi * (N / 2) ** 2
lab, n = ndimage.label(b); sizes = ndimage.sum(b, lab, range(1, n + 1))
keep = np.zeros(n + 1, bool); keep[1:] = sizes >= a.island * disc; keep[1 + np.argmax(sizes)] = True
print('islands dropped:', int((~keep[1:]).sum()), 'of', n)
b = keep[lab]
lab, n = ndimage.label(~b); sizes = ndimage.sum(~b, lab, range(1, n + 1))
outside = lab[0, 0]
fill = np.zeros(n + 1, bool); fill[1:] = sizes < a.hole * disc; fill[outside] = False
print('holes filled:', int(fill[1:].sum()), 'of', n - 1)
b = b | fill[lab]
m = b.astype(np.float32)
if a.sigma > 0:
    m = ndimage.gaussian_filter(m, a.sigma); m = np.clip((m - 0.5) * 4 + 0.5, 0, 1)
m = np.where(r > 0.93, 1.0, m); m = np.where(r > 0.995, 0.0, m)
out = np.zeros((N, N, 4), np.uint8); out[..., :3] = 200; out[..., 3] = (m * 255).astype(np.uint8)
Image.fromarray(out, 'RGBA').save(a.out)

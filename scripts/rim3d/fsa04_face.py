"""FSA-04 (Scribante 3P) face mask from the catalogue cut-out:

  python3 scripts/rim3d/fsa04_face.py <forged_fsa_04 cut-out.png> <out mask.png> [cut 0.585] [top 0.885] [radial blur 0.015]
  python3 scripts/rim3d/mask_outline.py <mask.png> shapes.json --fold 5 --round 8 --sigma 5
  python3 scripts/rim3d/build_rim.py - full.glb --shapes shapes.json --segments 512

The cut-out shows the barrel and the 3-piece rivet ring solid behind the outer half of the arms, so
the engine's trace continues them straight and loses the dog-legs. Here: 5-fold median of the alpha about the measured hub
centre (inner zone, where the windows are see-through and the dog-leg bends are), and every window
continued up to the lip ring along edges measured on the photo (outer zone: MEAS, read off a
hub-centred polar unwrap of the luminance, where the arms show clearly over the rivet ring).
The hub centre (CX, CY) is not the image centre: found by minimising the spread between the five
sectors of the alpha (the photo is slightly off-axis)."""
import numpy as np, math, sys, json
from PIL import Image, ImageDraw
from scipy import ndimage
P = sys.argv[1]; OUT = sys.argv[2]
CX, CY = 1027.35, 1011.59; RP = 1024; FOLD = 5
CUT = float(sys.argv[3]) if len(sys.argv) > 3 else 0.585    # alpha trusted below this radius
FIT = (CUT - 0.09, CUT - 0.01)                               # edge-fit band
TOP = float(sys.argv[4]) if len(sys.argv) > 4 else 0.885     # windows end here (lip ring inside)
A = np.asarray(Image.open(P).convert('LA')).astype(np.float32)[..., 1] / 255
N = 2048; c = (N - 1) / 2; Rn = N / 2
yy, xx = np.mgrid[0:N, 0:N]; X = (xx - c) / Rn; Y = (c - yy) / Rn
r = np.hypot(X, Y); th = np.arctan2(X, Y)  # clockwise from 12
samples = []
for k in range(FOLD):
    t = th + 2 * math.pi * k / FOLD
    samples.append(ndimage.map_coordinates(A, [CY - r * RP * np.cos(t), CX + r * RP * np.sin(t)], order=1))
M = np.median(np.stack(samples), 0) > 0.5   # True = solid
M[r >= CUT] = True
M[r < 0.24] = True                           # hub pad (bolts and bore are 3D parts)
# windows cut by the CUT circle: fit their side edges in the FIT band and continue them
win = ~M & (r < CUT) & (r >= FIT[0] - 0.005)  # band only: each run of a U-shaped window is its own piece
lab, n = ndimage.label(win)
img = Image.fromarray(M.astype(np.uint8) * 255); d = ImageDraw.Draw(img)
def px(p): return (c + p[0] * Rn, c - p[1] * Rn)
ext = 0
from scipy.interpolate import PchipInterpolator
# outer edges measured on the photo (hub-centred, 5-fold median luminance; degrees clockwise from 12):
# window (centre at r 0.57) -> (left edge, right edge) at r 0.70, 0.80, 0.88
MEAS = {-28: ([-33.4, -34.2, -34.6], [-21.5, -20.0, -19.3]),
        -9: ([-18.7, -17.4, -16.8], [1.0, -0.2, -0.8]),
        11: ([4.6, 2.8, 1.6], [16.4, 16.9, 17.2]),
        28: ([19.7, 19.4, 19.2], [35.0, 35.3, 35.5])}
MR = [0.70, 0.80, 0.88]
for i in range(1, n + 1):
    w = lab == i
    if not (w & (r > CUT - 0.006)).any() or w.sum() < 2000: continue
    tw = th[w]; rw = r[w]
    tc = math.atan2(np.sin(tw).mean(), np.cos(tw).mean())
    L, Rr = [], []
    for rr in np.linspace(FIT[0], FIT[1], 30):
        sel = np.abs(rw - rr) < 0.002
        if sel.sum() < 3: continue
        dt = np.angle(np.exp(1j * (tw[sel] - tc)))
        L.append((rr, tc + dt.min())); Rr.append((rr, tc + dt.max()))
    if len(L) < 10: continue
    # which measured window: centre angle relative to its sector
    cdeg = math.degrees(tc); k = round((cdeg - 0) / 72); rel = cdeg - 72 * k
    key = min(MEAS, key=lambda m: abs(math.remainder(rel - m, 72)))
    k = round((cdeg - key) / 72); base = 72 * k
    edges = []
    for pts, meas in ((L, MEAS[key][0]), (Rr, MEAS[key][1])):
        q = np.array(pts); cf = np.polyfit(q[:, 0], np.unwrap(q[:, 1]), 1)
        ra = [FIT[0], (FIT[0] + FIT[1]) / 2, CUT]
        ta = [np.polyval(cf, x) for x in ra]
        tm = [math.radians(base + m) for m in meas]
        tm = [ta[-1] + math.remainder(t - ta[-1], 2 * math.pi) for t in tm]
        f = PchipInterpolator(ra + MR, ta + tm, extrapolate=True)
        rr = np.linspace(FIT[0], TOP, 80); edges.append([(x, float(f(x))) for x in rr])
    left, right = edges
    poly = [(x * math.sin(t), x * math.cos(t)) for x, t in left]
    a0 = left[-1][1]; a1 = right[-1][1]
    poly += [(TOP * math.sin(t), TOP * math.cos(t)) for t in np.linspace(a0, a1, 24)]
    poly += [(x * math.sin(t), x * math.cos(t)) for x, t in right[::-1]]
    d.polygon([px(p) for p in poly], fill=0); ext += 1
print('windows', n, 'extended', ext)
m = np.asarray(img).astype(np.float32) / 255
# smooth along the radius (the arms run outwards): a symmetric blur along r keeps a straight edge's
# 0.5 contour where it is and irons out the cut-out's wobble along each arm; it fades out toward the
# hub and the lip so window tips and the lip ring keep their shape
RS = float(sys.argv[5]) if len(sys.argv) > 5 else 0.015
if RS > 0:
    NT, NRr = 7200, 2000; tt = np.linspace(-math.pi, math.pi, NT, endpoint=False); rr = np.linspace(0, 1, NRr)
    Tg, Rg = np.meshgrid(tt, rr)
    pol = ndimage.map_coordinates(m, [c - Rg * Rn * np.cos(Tg), c + Rg * Rn * np.sin(Tg)], order=1)
    sm = ndimage.gaussian_filter1d(pol, RS * NRr, axis=0)
    wgt = np.clip((rr - 0.30) / 0.05, 0, 1) * np.clip((0.86 - rr) / 0.03, 0, 1)
    pol = pol * (1 - wgt[:, None]) + sm * wgt[:, None]
    ti = (th + math.pi) / (2 * math.pi) * NT; ri = np.clip(r, 0, 1) * (NRr - 1)
    m = ndimage.map_coordinates(np.vstack([pol]), [ri, ti % NT], order=1, mode='grid-wrap')
    m = (m > 0.5).astype(np.float32)
m[r > 0.93] = 1; m = ndimage.gaussian_filter(m, 2.0); m = np.clip((m - 0.5) * 4 + 0.5, 0, 1); m[r > 0.995] = 0
out = np.zeros((N, N, 4), np.uint8); out[..., :3] = 200; out[..., 3] = (m * 255).astype(np.uint8)
Image.fromarray(out, 'RGBA').save(OUT)

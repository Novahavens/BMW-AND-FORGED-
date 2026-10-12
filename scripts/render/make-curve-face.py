"""
Prepared face mask drawn from smooth, variable-width spokes, for designs whose spokes bend or taper
(make-bar-face.py draws only straight, constant-width bars, and a bent blade built from two bars
shows a step at the joint). Writes public/rim-faces/<wheelId>.png in the same convention
(PNG radius 1 = rim outer radius, spokes meet the lip at 0.916, solid ring r > 0.93); the same file
feeds the Blender rim (scripts/rim3d/mask_outline.py -> build_rim.py --shapes), so the car and the
spin share ONE outline.

  python3 scripts/render/make-curve-face.py <spec.json> <wheelId> [photo.png [overlay.png]] [--out dir]

Spec (one sector, repeated `fold` times; radii are fractions of the rim outer radius, angles are
degrees clockwise from 12 o'clock, relative to the sector centre line):

  {
    "fold": 6, "mirror": true,   # every spoke is also drawn mirrored about the centre line
    "rotate": -4.5,              # degrees, turns the whole face to line up with the photo
    "hub": 0.26,                 # solid hub disc radius
    "fillet": 0.008,             # corner rounding, fraction of R (blur + steep ramp)
    "spokes": [ {"pts": [[0.24, 1.5, 0.11], [0.45, 6.5, 0.085], [0.93, 5.0, 0.07]]} ]   # [r, deg, full width]
  }

Each spoke is a Catmull-Rom curve through its points with the width interpolated smoothly along it,
extended in a straight line into the hub and past the lip, with round ends. No two-bar knuckles, so
no steps at a bend.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 2048


def catmull(points, n=40):
    """Centripetal-ish Catmull-Rom through (x, y, w) rows; returns a dense polyline (x, y, w)."""
    P = np.asarray(points, float)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return np.array(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    outdir = None
    if '--out' in sys.argv:
        outdir = sys.argv[sys.argv.index('--out') + 1]
        args = [a for a in args if a != outdir]
    spec = json.load(open(args[0]))
    wheel_id = args[1]
    photo = args[2] if len(args) > 2 else None
    fold, hub = spec['fold'], spec.get('hub', 0.26)
    c, R = (N - 1) / 2, N / 2
    S = 4
    img = Image.new('L', (N * S, N * S), 0)
    d = ImageDraw.Draw(img)
    xy = lambda r, a: (c * S + r * R * S * math.sin(math.radians(a)), c * S - r * R * S * math.cos(math.radians(a)))
    spokes = []
    for sp in spec['spokes']:
        spokes.append(sp['pts'])
        if spec.get('mirror', True):
            spokes.append([[r, -a, w] for r, a, w in sp['pts']])
    rot = spec.get('rotate', 0)
    for k in range(fold):
        base = rot + k * 360 / fold
        for pts in spokes:
            cart = []
            for r, a, w in pts:
                x, y = xy(r, a + base); cart.append((x, y, w * R * S))
            # straight continuation into the hub and past the lip
            (x0, y0, w0), (x1, y1, w1) = cart[0], cart[1]
            L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x0 - x1) / L, (y0 - y1) / L
            cart.insert(0, (x0 + ux * R * S * 0.16, y0 + uy * R * S * 0.16, w0))
            (x0, y0, w0), (x1, y1, w1) = cart[-2], cart[-1]
            L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L
            cart.append((x1 + ux * R * S * 0.14, y1 + uy * R * S * 0.14, w1))
            dense = catmull(cart)
            left, right = [], []
            for i in range(len(dense)):
                j0, j1 = max(i - 1, 0), min(i + 1, len(dense) - 1)
                tx, ty = dense[j1][0] - dense[j0][0], dense[j1][1] - dense[j0][1]
                L = math.hypot(tx, ty) or 1
                nx, ny = -ty / L, tx / L
                hw = dense[i][2] / 2
                left.append((dense[i][0] + nx * hw, dense[i][1] + ny * hw))
                right.append((dense[i][0] - nx * hw, dense[i][1] - ny * hw))
            d.polygon(left + right[::-1], fill=255)
            for (x, y, w) in (dense[0], dense[-1]):
                d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    d.ellipse([c * S - hub * R * S, c * S - hub * R * S, c * S + hub * R * S, c * S + hub * R * S], fill=255)
    a = np.asarray(img.resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
    yy, xx = np.mgrid[0:N, 0:N]
    r = np.hypot(xx - c, yy - c) / R
    a = np.where(r > 0.93, 1.0, a)
    f = spec.get('fillet', 0.008) * R
    if f > 0:
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(f))).astype(np.float32) / 255
        a = np.clip((a - 0.5) * 6 + 0.5, 0, 1)
    a = np.where(r > 0.995, 0.0, a)
    out = np.zeros((N, N, 4), np.uint8)
    out[..., :3] = 200
    out[..., 3] = (a * 255).astype(np.uint8)
    dest_dir = outdir or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'rim-faces')
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, wheel_id + '.png')
    Image.fromarray(out).save(dest, optimize=True)
    print('wrote', os.path.normpath(dest))
    if photo:
        p = Image.open(photo).convert('RGBA').resize((N, N))
        bg = Image.new('RGBA', (N, N), (0, 0, 0, 255))
        bg.alpha_composite(p)
        ov = np.asarray(bg.convert('RGB')).astype(np.float32)
        edge = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) > 40
        ov[edge] = [255, 40, 40]
        ov_path = args[3] if len(args) > 3 else wheel_id + '-overlay.png'
        Image.fromarray(ov.astype(np.uint8)).resize((1024, 1024)).save(ov_path)
        print('overlay', ov_path)


if __name__ == '__main__':
    main()

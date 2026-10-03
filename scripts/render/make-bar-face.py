"""
Prepared face mask drawn from straight bars, for a photo wheel whose spokes are straight bars but
whose photo can't be read cleanly (taken at an angle, crossing bars, a barrel seen through every
gap). See the wheel3d skill, step 4. Writes public/rim-faces/<wheelId>.png; add the wheel to
services/rimFaces.ts, then re-run scripts/render/wheel-qa.cjs.

  python3 scripts/render/make-bar-face.py <spec.json> <wheelId> [overlayPhoto.png [overlay.png]]

The spec describes one sector; it is repeated `fold` times round the wheel. Radii are fractions
of the rim's outer radius (the photo's rim circle = 1; spokes meet the 3D lip at 0.916), angles
are degrees from the sector's centre line, clockwise on the photo:

  {
    "fold": 5,
    "mirror": true,                 # every bar also drawn mirrored about the centre line
    "hub": 0.33,                    # solid hub pad radius
    "fillet": 0.012,                # corner rounding (fraction of the radius)
    "rotate": 0,                    # degrees: turns the whole face to line up with the photo
    "bars": [                       # a straight bar between two points (r, angle), width w
      {"from": [0.40, 18.5], "to": [0.894, 4.5], "w": 0.046},
      {"from": [0.48, 28.6], "to": [0.897, 35.7], "w": 0.046}
    ]
  }

Bars are straight in the image plane, extended inwards into the hub and outwards past the lip so
they always join both. Measure the two points per bar in the most front-on sector of the photo
(the wheel3d skill shows how); with overlayPhoto the result is also drawn over the photo
(default <wheelId>-overlay.png in the current folder) to check the fit by eye.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 2048


def main():
    spec = json.load(open(sys.argv[1]))
    wheel_id = sys.argv[2]
    photo = sys.argv[3] if len(sys.argv) > 3 else None
    fold, hub = spec['fold'], spec.get('hub', 0.33)
    c, R = (N - 1) / 2, N / 2
    S = 4  # supersampling
    img = Image.new('L', (N * S, N * S), 0)
    d = ImageDraw.Draw(img)
    pt = lambda r, a: (c * S + r * R * S * math.sin(math.radians(a)), c * S - r * R * S * math.cos(math.radians(a)))
    bars = []
    for b in spec['bars']:
        bars.append(b)
        if spec.get('mirror', True) and abs(b['from'][1]) + abs(b['to'][1]) > 0:
            bars.append({**b, 'from': [b['from'][0], -b['from'][1]], 'to': [b['to'][0], -b['to'][1]]})
    rot = spec.get('rotate', 0)
    for k in range(fold):
        base = rot + k * 360 / fold
        for b in bars:
            (x0, y0), (x1, y1) = pt(b['from'][0], b['from'][1] + base), pt(b['to'][0], b['to'][1] + base)
            L = math.hypot(x1 - x0, y1 - y0)
            ux, uy = (x1 - x0) / L, (y1 - y0) / L
            # extended both ways: into the hub and past the lip
            ext0, ext1 = R * S * 0.25, R * S * 0.2
            xa, ya, xb, yb = x0 - ux * ext0, y0 - uy * ext0, x1 + ux * ext1, y1 + uy * ext1
            w0 = b['w'] * R * S / 2
            w1 = b.get('w_tip', b['w']) * R * S / 2
            nx, ny = -uy, ux
            d.polygon([(xa + nx * w0, ya + ny * w0), (xb + nx * w1, yb + ny * w1), (xb - nx * w1, yb - ny * w1), (xa - nx * w0, ya - ny * w0)], fill=255)
    d.ellipse([c * S - hub * R * S, c * S - hub * R * S, c * S + hub * R * S, c * S + hub * R * S], fill=255)
    # lip ring (the engine's lip starts at 0.916; drawn solid from there out)
    a = np.asarray(img.resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
    yy, xx = np.mgrid[0:N, 0:N]
    r = np.hypot(xx - c, yy - c) / R
    a = np.where(r > 0.93, 1.0, a)
    # rounded corners (inside and outside): blur, then a steep ramp back to an edge
    f = spec.get('fillet', 0.012) * R
    if f > 0:
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(f))).astype(np.float32) / 255
        a = np.clip((a - 0.5) * 6 + 0.5, 0, 1)
    a = np.where(r > 0.995, 0.0, a)
    out = np.zeros((N, N, 4), np.uint8)
    out[..., :3] = 200
    out[..., 3] = (a * 255).astype(np.uint8)
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'rim-faces', wheel_id + '.png')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    Image.fromarray(out).save(dest, optimize=True)
    print('wrote', os.path.normpath(dest))
    if photo:
        p = Image.open(photo).convert('RGBA').resize((N, N))
        bg = Image.new('RGBA', (N, N), (0, 0, 0, 255))
        bg.alpha_composite(p)
        ov = np.asarray(bg.convert('RGB')).astype(np.float32)
        edge = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) > 40
        ov[edge] = [255, 40, 40]
        ov_path = sys.argv[4] if len(sys.argv) > 4 else wheel_id + '-overlay.png'
        Image.fromarray(ov.astype(np.uint8)).resize((1024, 1024)).save(ov_path)
        print('overlay', ov_path)


if __name__ == '__main__':
    main()

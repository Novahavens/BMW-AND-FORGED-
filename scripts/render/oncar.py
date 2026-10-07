"""Composite for oncar.cjs: dark studio backdrop + Blender body passes recoloured by paint and toned (the same
maths as services/renderedBody.ts: mix in linear light, x1.6, three.js NeutralToneMapping, sRGB) + the engine's wheel layer.
  python3 oncar.py wheels.png carId view '#hex' Metallic|Pearl|Frozen|Uni out.png [passesDir]
passesDir defaults to public/renders; point it at a scratch copy to judge passes that are not live yet."""
import sys
import numpy as np
from PIL import Image
wheels, car, view, hexc, ptype, out = sys.argv[1:7]
passes = sys.argv[7] if len(sys.argv) > 7 else f'public/renders/{car}'
EXPOSURE = 1.6
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, 1) ** (1 / 2.4) - 0.055)

def neutral(c):  # three.js NeutralToneMapping on an RGB triplet (last axis)
    start, desat = 0.8 - 0.04, 0.15
    x = c.min(-1, keepdims=True)
    c = c - np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    peak = c.max(-1, keepdims=True)
    d = 1 - start
    newpeak = 1 - d * d / (np.maximum(peak, 1e-6) + d - start)
    comp = c * newpeak / np.maximum(peak, 1e-6)
    g = 1 - 1 / (desat * (peak - newpeak) + 1)
    return np.where(peak < start, c, comp * (1 - g) + newpeak * g)

def grad(w, h, rx, ry, cx, cy, stops):  # CSS radial-gradient(ellipse rx ry at cx cy, ...) in fractions of the box; premultiplied blend
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.sqrt(((xx + .5 - cx * w) / (rx * w)) ** 2 + ((yy + .5 - cy * h) / (ry * h)) ** 2)
    ps = [s[0] for s in stops]; cs = np.array([[s[1] * s[4], s[2] * s[4], s[3] * s[4], s[4] * 255] for s in stops])
    o = np.stack([np.interp(t, ps, cs[:, k]) for k in range(4)], -1)
    a = o[..., 3:4]
    return np.where(a > 0, o[..., :3] / np.maximum(a, 1e-6) * 255, 0), a / 255

def backdrop(w, h, view=''):  # services/renderedBody.ts BACKDROP / BACKDROP_TOP (same numbers)
    layers = [(0.85, 0.70, 0.5, 0.38, [(0, 0x44, 0x47, 0x50, 1), (.5, 0x26, 0x28, 0x2d, 1), (1, 0x0e, 0x0f, 0x11, 1)]),
              (1.00, 0.34, 0.5, 0.86, [(0, 120, 124, 134, .40), (1, 120, 124, 134, 0)]),
              (0.80, 0.24, 0.5, 0.74, [(0, 212, 215, 224, .80), (.42, 176, 180, 190, .42), (1, 120, 124, 132, 0)])]
    if view == 'top':  # looking down the floor is a disc under the car
        layers[1:] = [(0.85, 0.62, 0.5, 0.5, [(0, 120, 124, 134, .38), (1, 120, 124, 134, 0)]),
                      (0.5, 0.5, 0.5, 0.5, [(0, 212, 215, 224, .7), (.45, 176, 180, 190, .38), (1, 120, 124, 132, 0)])]
    out = np.full((h, w, 3), (0x0e, 0x0f, 0x11), np.float32)
    for l in layers:
        rgb, a = grad(w, h, *l)
        out = out * (1 - a) + rgb * a
    return out / 255

kind = 'matte' if ptype == 'Frozen' else 'gloss'
W = np.asarray(Image.open(f'{passes}/{view}/{kind}_w.webp').convert('RGBA').resize((1440, 900))).astype(float) / 255
B = np.asarray(Image.open(f'{passes}/{view}/{kind}_b.webp').convert('RGBA').resize((1440, 900))).astype(float) / 255
col = lin(np.array([int(hexc.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]) / 255)
lb, lw = lin(B[..., :3]), lin(W[..., :3])
body = srgb(neutral((lb + (lw - lb) * col) * EXPOSURE)); a = W[..., 3:4]
img = body * a + backdrop(1440, 900, view) * (1 - a)
wl = np.asarray(Image.open(wheels).convert('RGBA')).astype(float) / 255
img = wl[..., :3] * wl[..., 3:4] + img * (1 - wl[..., 3:4])
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out)

"""Composite for oncar.cjs: studio backdrop + Blender body passes recoloured by paint (the same
maths as components/journey/RenderedCarView.tsx) + the engine's wheel layer.
  python3 oncar.py wheels.png carId view '#hex' Metallic|Frozen|Uni out.png"""
import sys
import numpy as np
from PIL import Image
wheels, car, view, hexc, ptype, out = sys.argv[1:]
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, 1) ** (1 / 2.4) - 0.055)
kind = 'matte' if ptype == 'Frozen' else 'gloss'
W = np.asarray(Image.open(f'public/renders/{car}/{view}/{kind}_w.webp').convert('RGBA').resize((1440, 900))).astype(float) / 255
B = np.asarray(Image.open(f'public/renders/{car}/{view}/{kind}_b.webp').convert('RGBA').resize((1440, 900))).astype(float) / 255
col = lin(np.array([int(hexc.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]) / 255)
body = srgb(lin(B[..., :3]) + (lin(W[..., :3]) - lin(B[..., :3])) * col); a = W[..., 3:4]
yy, xx = np.mgrid[0:900, 0:1440]; g = 0.93 - 0.06 * np.hypot((xx - 720) / 1440, (yy - 560) / 900)  # soft studio backdrop
img = body * a + g[..., None] * (1 - a)
wl = np.asarray(Image.open(wheels).convert('RGBA')).astype(float) / 255
img = wl[..., :3] * wl[..., 3:4] + img * (1 - wl[..., 3:4])
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out)

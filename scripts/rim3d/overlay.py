"""Fit check: the bar-face mask filled in translucent red over the front-on photo.
  python3 scripts/rim3d/overlay.py <photo.png> <mask.png> <out.jpg>"""
import sys
import numpy as np
from PIL import Image
ph = Image.open(sys.argv[1]).convert('RGBA').resize((1024, 1024)); bg = Image.new('RGBA', (1024, 1024), (70, 70, 70, 255)); bg.alpha_composite(ph)
m = np.asarray(Image.open(sys.argv[2]).convert('RGBA').resize((1024, 1024)))[..., 3].astype(float) / 255
o = np.asarray(bg.convert('RGB')).astype(float); red = np.array([255, 30, 30])
o = o * (1 - 0.45 * m[..., None]) + red * 0.45 * m[..., None]
Image.fromarray(o.astype(np.uint8)).save(sys.argv[3], quality=85)

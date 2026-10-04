import json, sys
from PIL import Image
import numpy as np
d, sprite, out = sys.argv[1], sys.argv[2], sys.argv[3]
L = json.load(open(d + '/layout.json')); W, H = L['w'], L['h']
plate = Image.open(d + '/plate.png').convert('RGBA'); wheels = Image.open(d + '/wheels.png').convert('RGBA')
sp = Image.open(sprite).convert('RGBA')
canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); canvas.alpha_composite(plate); canvas.alpha_composite(wheels)
for w in L['wheels']:
    cx, cy = w['c']; rx = abs(w['fw'][0] - w['bk'][0]) / 2; ry = abs(w['up'][1] - w['dn'][1]) / 2
    # photo circle (lip outer) -> projected ellipse; keep subpixel centre via 4x supersampling
    k = 4; box = (int(cx - rx - 4), int(cy - ry - 4), int(cx + rx + 5), int(cy + ry + 5)); bw, bh = box[2] - box[0], box[3] - box[1]
    big = Image.new('RGBA', (bw * k, bh * k), (0, 0, 0, 0))
    tw, th = int(2 * rx * k), int(2 * ry * k)
    t = sp.resize((tw, th), Image.LANCZOS)
    big.alpha_composite(t, (int((cx - rx - box[0]) * k), int((cy - ry - box[1]) * k)))
    canvas.alpha_composite(big.resize((bw, bh), Image.LANCZOS), (box[0], box[1]))
bg = Image.new('RGBA', (W, H), (40, 40, 42, 255)); bg.alpha_composite(canvas); bg.convert('RGB').save(out, quality=92)

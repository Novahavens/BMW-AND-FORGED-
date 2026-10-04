"""
Crops, encodes and registers the layers from build-stage.cjs for the 2D wheel stage.

  python3 scripts/render/pack-stage.py <rawDir> <carId>

Writes public/stage/<carId>/*.webp and layout.json (coordinates relative to the crop) and merges the car
into public/stage/manifest.json. The crop is the box around everything drawn in any layer, plus a margin.
"""
import json, os, sys, glob
from PIL import Image
import numpy as np

raw, car = sys.argv[1], sys.argv[2]
src = os.path.join(raw, car)
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'stage', car)
os.makedirs(dst, exist_ok=True)
files = sorted(glob.glob(os.path.join(src, '*.png')))
box = None
for f in files:
    a = np.asarray(Image.open(f).convert('RGBA'))[..., 3] > 6
    ys, xs = np.where(a)
    b = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
m = 24
im0 = Image.open(files[0]); W, H = im0.size
box = (max(0, box[0] - m), max(0, box[1] - m), min(W, box[2] + m), min(H, box[3] + m))
layout = json.load(open(os.path.join(src, 'layout.json')))
layout['crop'] = {'w': box[2] - box[0], 'h': box[3] - box[1]}
for size in layout['sizes'].values():
    for ax in size.values():
        ax['cx'] -= box[0]; ax['cy'] -= box[1]
paints = []
for f in files:
    name = os.path.splitext(os.path.basename(f))[0]
    out = Image.open(f).convert('RGBA').crop(box)
    if name.startswith('wheels-'):
        out.save(os.path.join(dst, name + '.webp'), 'WEBP', quality=92, method=6)
    else:
        out.save(os.path.join(dst, name + '.webp'), 'WEBP', quality=90, method=6)
        paints.append(name)
layout['paints'] = paints
json.dump(layout, open(os.path.join(dst, 'layout.json'), 'w'), separators=(',', ':'))
mp = os.path.join(dst, '..', 'manifest.json')
man = json.load(open(mp)) if os.path.exists(mp) else {'cars': {}}
man['cars'][car] = {'paints': paints, 'sizes': list(layout['sizes'].keys()), 'w': layout['crop']['w'], 'h': layout['crop']['h']}
json.dump(man, open(mp, 'w'), separators=(',', ':'))
print(car, box, len(paints), 'paints', sum(os.path.getsize(os.path.join(dst, x)) for x in os.listdir(dst)) // 1024, 'KB')

"""
Wheel quality check, part 2: every combination on the car, rendered and checked.
See .claude/skills/visual-qa.

  python3 scripts/render/qa-matrix.py <outDir> <rimCacheDir> [--quick]

Renders (scripts/render/shoot.cjs, SwiftShader, about a minute a shot):
  A. every wheel design x every finish, close-up on one car (the finish/design matrix)
  B. every wheel design on every car, front three-quarter (the design/car matrix)
  C. every design at the smallest and largest size (size scaling)
--quick renders A only.

Then measures each wheel crop and writes qa-matrix.json, contact sheets per matrix, and a
PASS/FAIL table. A crop fails when the wheel is a flat silhouette (too little tonal range), when
the finish doesn't read as itself (Black Gloss must be dark with highlights, Liquid Metal bright
with strong highlights, Bronze warm, Silver neutral), or when the page logged errors.
"""
import json, os, subprocess, sys, colorsys
from PIL import Image, ImageDraw
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT, RIMS = sys.argv[1], sys.argv[2]
QUICK = '--quick' in sys.argv
os.makedirs(OUT, exist_ok=True)

# indexes into the bundled catalogue (data/configuratorData.ts); keep in sync with the active list
CARS = {0: 'M4', 2: 'M3', 3: 'M3T', 6: 'M5', 8: 'M8'}
N_WHEELS = int(os.environ.get('QA_WHEELS', '9'))
FINISHES = ['liquid_metal', 'black', 'bronze', 'silver']
SIZES = ['19"', '22"']
PAINT = {0: 17, 2: 7, 3: 16, 6: 4, 8: 3}

shots = []
for w in range(N_WHEELS):
    for f in FINISHES:
        shots.append({'name': f'A_w{w}_{f}', 'car': 2, 'paint': 7, 'wheel': w, 'finish': f, 'view': 'frontWheel', 'wait': 6000})
if not QUICK:
    for w in range(N_WHEELS):
        for c in CARS:
            shots.append({'name': f'B_w{w}_c{c}', 'car': c, 'paint': PAINT[c], 'wheel': w, 'finish': FINISHES[(w + c) % 4], 'view': 'frontThreeQuarter', 'wait': 6000})
        for s in SIZES:
            shots.append({'name': f'C_w{w}_{s[:2]}', 'car': 0, 'paint': 17, 'wheel': w, 'finish': 'silver', 'size': s, 'view': 'frontWheel', 'wait': 6000})

todo = [s for s in shots if not os.path.exists(os.path.join(OUT, s['name'] + '.png'))]
log_path = os.path.join(OUT, 'shoot.log')
if todo:
    spec = os.path.join(OUT, 'shots.json')
    json.dump(todo, open(spec, 'w'))
    # this run's log only: an error logged for a shot that was since deleted and re-rendered cleanly
    # must not fail it again
    with open(log_path, 'w') as log:
        subprocess.run(['node', os.path.join(HERE, 'shoot.cjs'), OUT, spec, RIMS], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)

errors = {}
for line in (open(log_path) if os.path.exists(log_path) else []):
    parts = line.strip().split(' ', 2)
    if len(parts) == 3 and parts[2].startswith('['):
        errs = [e for e in json.loads(parts[2]) if 'ERR_CERT' not in e and 'Failed to load resource' not in e]
        if errs:
            errors[parts[0]] = errs

def crop_box(s):
    return (440, 180, 880, 620) if s['view'] == 'frontWheel' else None

def measure(img, s):
    a = np.asarray(img.convert('RGB')).astype(float) / 255
    if s['view'] != 'frontWheel':
        return {}
    # the rim face: inside the tyre, outside the centre cap
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx - w / 2, yy - h / 2) / (h / 2)
    ring = (r > 0.2) & (r < 0.78)
    px = a[ring]
    lum = px @ np.array([0.2126, 0.7152, 0.0722])
    p5, p50, p98 = np.percentile(lum, [5, 50, 98])
    hi = float((lum > 0.85).mean())
    rgb = px[lum > np.percentile(lum, 40)].mean(axis=0)
    hue, light, sat = colorsys.rgb_to_hls(*rgb)
    # bronze: fraction of warm, saturated pixels (red > green > blue). A mean hue over the ring is
    # polluted by the grey brake disc and blue caliper seen through the spokes; this isn't.
    mx, mn = px.max(1), px.min(1)
    warm = float(((px[:, 0] > px[:, 1]) & (px[:, 1] > px[:, 2]) & ((mx - mn) / np.maximum(mx, 1e-6) > 0.3) & (mx > 0.12)).mean())
    return {'p5': p5, 'p50': p50, 'p98': p98, 'range': p98 - p5, 'highlights': hi, 'hue': hue * 360, 'sat': sat, 'warm': warm}

def judge(m, s):
    fails = []
    if not m:
        return fails
    if m['range'] < 0.35:
        fails.append(f"flat (tonal range {m['range']:.2f})")
    f = s.get('finish')
    if f == 'liquid_metal' and m['p98'] < 0.8:
        fails.append(f"liquid metal without bright reflections (p98 {m['p98']:.2f})")
    if f == 'black' and m['p98'] < 0.45:
        fails.append(f"black gloss without highlights (p98 {m['p98']:.2f})")
    # calibrated on the 9 designs: bronze 0.38-0.70 warm pixels, every other finish 0.00
    if f == 'bronze' and m['warm'] < 0.25:
        fails.append(f"bronze not warm enough ({m['warm']:.2f} warm pixels, need >= 0.25)")
    # matrix A only (white car): on a coloured car a big polished face reflects the paint (22" silver
    # on the red M4 scores 0.07-0.10)
    if s['name'].startswith('A_') and f in ('silver', 'liquid_metal', 'black') and m['warm'] > 0.05:
        fails.append(f"{f} tinted warm ({m['warm']:.2f} warm pixels)")
    return fails

rows = []
for s in shots:
    pth = os.path.join(OUT, s['name'] + '.png')
    if not os.path.exists(pth):
        rows.append({'name': s['name'], 'pass': False, 'fails': ['not rendered']})
        continue
    img = Image.open(pth)
    box = crop_box(s)
    m = measure(img.crop(box) if box else img, s)
    fails = judge(m, s) + [f'page error: {e}' for e in errors.get(s['name'], [])]
    rows.append({'name': s['name'], **{k: round(float(v), 3) for k, v in m.items()}, 'pass': not fails, 'fails': fails})

def sheet(prefix, cols, fname, box):
    items = [s for s in shots if s['name'].startswith(prefix)]
    if not items:
        return
    T = 300
    rows_n = (len(items) + cols - 1) // cols
    W = Image.new('RGB', (cols * (T + 4), rows_n * (T + 4)), (0, 0, 0))
    d = ImageDraw.Draw(W)
    res = {r['name']: r for r in rows}
    for i, s in enumerate(items):
        pth = os.path.join(OUT, s['name'] + '.png')
        if not os.path.exists(pth):
            continue
        im = Image.open(pth).convert('RGB')
        im = (im.crop(box) if box else im.crop((140, 120, 1140, 700))).resize((T, T if box else int(T * 0.58)))
        x, y = (i % cols) * (T + 4), (i // cols) * (T + 4)
        W.paste(im, (x, y))
        ok = res[s['name']]['pass']
        d.rectangle((x, y, x + T - 1, y + 16), fill=(0, 90, 0) if ok else (160, 0, 0))
        d.text((x + 4, y + 2), s['name'], fill=(255, 255, 255))
    W.save(os.path.join(OUT, fname), quality=88)

sheet('A_', 4, 'sheet-A-design-x-finish.jpg', (440, 180, 880, 620))
sheet('B_', 5, 'sheet-B-design-x-car.jpg', None)
sheet('C_', 2, 'sheet-C-sizes.jpg', (440, 180, 880, 620))
json.dump(rows, open(os.path.join(OUT, 'qa-matrix.json'), 'w'), indent=2)
bad = [r for r in rows if not r['pass']]
for r in rows:
    print(f"{r['name']:<22} {'PASS' if r['pass'] else 'FAIL'}  {'; '.join(r['fails'])}")
print(f"\n{len(rows) - len(bad)}/{len(rows)} pass")
sys.exit(1 if bad else 0)

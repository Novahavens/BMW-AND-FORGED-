#!/usr/bin/env bash
# Publishes a frames-only car: render_car.py + render_depth.py output -> public/renders/<carId>/<view>/ (webp frames,
# depth.png kept lossless: it is data) and its renders/manifest.json entry with the wheel layout from
# export-scene.cjs (<scene>.layout.json). The car's GLB is never copied anywhere public. docs/ADD_PREPARED_CAR.md,
# "Frames-only cars".
#   scripts/prerender/frames-only.sh <carId> <frames-dir> <layout.json>
set -euo pipefail
cd "$(dirname "$0")/../.."
[ $# -eq 3 ] || { echo "usage: $0 <carId> <frames-dir> <layout.json>" >&2; exit 2; }
python3 - "$1" "$2" "$3" <<'PY'
import sys, os, glob, json, shutil
from PIL import Image
car, src, layout_path = sys.argv[1:]
layout = json.load(open(layout_path))
corners = ['front-left', 'front-right', 'rear-left', 'rear-right']
if sorted(layout.get('wheels', {})) != corners or len(layout.get('footprint', [])) != 2:
    sys.exit(f'{layout_path}: needs wheels for {corners} and a footprint (export-scene.cjs writes it)')
dst = f'public/renders/{car}'
need = ['gloss_w', 'gloss_b', 'matte_w', 'matte_b', 'flake_w', 'depth']
views, missing = [], []
for d in sorted(glob.glob(f'{src}/*/')):
    v = os.path.basename(os.path.normpath(d))
    lack = [n for n in need if not os.path.exists(f'{d}/{n}.png')]
    if lack:
        missing.append(f'{v}: {lack}')
        continue
    os.makedirs(f'{dst}/{v}', exist_ok=True)
    for n in need[:-1]:
        Image.open(f'{d}/{n}.png').save(f'{dst}/{v}/{n}.webp', quality=88, method=6)
    shutil.copyfile(f'{d}/depth.png', f'{dst}/{v}/depth.png')
    views.append(v)
if missing:
    print('skipped incomplete views:', '; '.join(missing))
if not views:
    sys.exit(f'no complete views in {src}')
path = 'public/renders/manifest.json'
m = json.load(open(path)) if os.path.exists(path) else {}
m[car] = {'framesOnly': True, 'views': views, 'wheels': layout['wheels'], 'footprint': layout['footprint']}
json.dump(m, open(path, 'w'), indent=1)
print(car, views)
PY

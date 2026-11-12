#!/usr/bin/env bash
# Turns rendered PNG frames (render_car.py output) into public/renders/<carId>/<view>/*.webp and lists the cars in
# public/renders/stills.json: Blender bodies for the summary and PDF stills only (the configurator keeps drawing the
# car live; see loadStillsManifest in services/renderedBody.ts).
#   scripts/prerender/stills-frames.sh <carId> <frames-dir>      e.g. scripts/prerender/stills-frames.sh m2_g87 /tmp/prerender/m2_g87
set -euo pipefail
cd "$(dirname "$0")/../.."
[ $# -eq 2 ] || { echo "usage: $0 <carId> <frames-dir>" >&2; exit 2; }
python3 - "$1" "$2" <<'PY'
import sys, os, glob, json
from PIL import Image
car, src = sys.argv[1:]
dst = f'public/renders/{car}'
views = []
for f in sorted(glob.glob(f'{src}/*/*.png')):
    if os.path.basename(f) == 'flake_b.png': continue   # only flake_w is used
    v = os.path.basename(os.path.dirname(f)); os.makedirs(f'{dst}/{v}', exist_ok=True)
    Image.open(f).save(f'{dst}/{v}/' + os.path.basename(f)[:-4] + '.webp', quality=88, method=6)
    if v not in views: views.append(v)
if not views: sys.exit(f'no frames in {src}')
path = 'public/renders/stills.json'
m = json.load(open(path)) if os.path.exists(path) else {}
m[car] = sorted(set(m.get(car, [])) | set(views))
json.dump(m, open(path, 'w'), indent=1); print(car, m[car])
PY

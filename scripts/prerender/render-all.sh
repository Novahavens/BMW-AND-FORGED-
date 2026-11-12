#!/usr/bin/env bash
# Pre-renders every car (or the given catalogue indexes) into public/renders and updates the
# manifest. Needs the dev server: bunx vite --host 127.0.0.1 --port 5173
#   scripts/prerender/render-all.sh [index ...]     e.g. scripts/prerender/render-all.sh 0 3
# Env: STUDIO=dark (default: default = the old grey studio), SAMPLES (32), WIDTH (1440), THREADS (0 = all cores).
#   STUDIO=dark THREADS=3 scripts/prerender/render-all.sh 0     # dark studio, one render per material set (W+B derived), tyre stand-ins from the engine
set -euo pipefail
cd "$(dirname "$0")/../.."
TMP=${TMPDIR:-/tmp}/prerender; mkdir -p "$TMP"
IDS=$(node -e "const s=require('fs').readFileSync('data/configuratorData.ts','utf8');const m=s.slice(s.indexOf('BMW_MODELS'),s.indexOf('BMW_PAINTS')).match(/^    id: '([^']+)'/gm).map(x=>x.split(\"'\")[1]);console.log(m.join(' '))")
read -ra ALL <<<"$IDS"
IDX=("$@"); [ ${#IDX[@]} -eq 0 ] && IDX=($(seq 0 $((${#ALL[@]} - 1))))
for i in "${IDX[@]}"; do
  id=${ALL[$i]}; echo "== $i $id"
  if node -e "const m=JSON.parse(require('fs').readFileSync('public/renders/manifest.json','utf8'));process.exit(m['$id']&&m['$id'].framesOnly?0:1)" 2>/dev/null; then
    echo "skipped: $id is frames-only (no GLB in the repo); re-render it with scripts/prerender/frames-only.sh"; continue
  fi
  node scripts/prerender/export-scene.cjs "$i" "$TMP/$id.glb"
  python3 scripts/prerender/render_car.py "$TMP/$id.glb" "$TMP/$id" --car "$id" --studio "${STUDIO:-default}" --samples "${SAMPLES:-32}" --width "${WIDTH:-1440}" --threads "${THREADS:-0}" | grep '^rendered' || true
  python3 - "$TMP/$id" "public/renders/$id" <<'PY'
import sys, os, glob
from PIL import Image
src, dst = sys.argv[1:]
for f in glob.glob(f'{src}/*/*.png'):
    if os.path.basename(f) == 'flake_b.png': continue   # only flake_w is used
    v = os.path.basename(os.path.dirname(f)); os.makedirs(f'{dst}/{v}', exist_ok=True)
    Image.open(f).save(f'{dst}/{v}/' + os.path.basename(f)[:-4] + '.webp', quality=88, method=6)
PY
done
# Only the cars rendered here go into manifest.json: the other entries are kept as they are (a frames-only car's entry
# carries its wheel layout), and cars that only have summary stills (stills.json) must not be put on the stage
python3 - <<PY
import os, json
root = 'public/renders'
ids = '${IDX[*]}'.split()
all_ids = '${ALL[*]}'.split()
path = f'{root}/manifest.json'
m = json.load(open(path)) if os.path.exists(path) else {}
for i in ids:
    c = all_ids[int(i)]
    if isinstance(m.get(c), dict): continue   # frames-only: skipped above
    m[c] = sorted(v for v in os.listdir(f'{root}/{c}') if os.path.exists(f'{root}/{c}/{v}/gloss_w.webp'))
json.dump(m, open(path, 'w'), indent=1); print(m)
PY

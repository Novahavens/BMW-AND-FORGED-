#!/usr/bin/env bash
# Photo in, rim out. One FORGEDSA wheel photo (rim only, front-on, cut out or plain background) or a
# prepared face mask -> traced outlines -> complete 3D rim GLB -> packed for the site -> preview.
#
#   scripts/rim3d/convert.sh <photo.png> <wheelId> [spec.json] [--mask] [--spin]
#   --spin also renders the photoreal 360° spin for the rim detail page (about 45 min per wheel)
#
# Needs the dev server (bunx vite --host 127.0.0.1 --port 5173). Writes:
#   public/models/rims/<wheelId>.glb        packed rim for the site
#   .prerender/rims/<wheelId>/{shapes.json,full.glb,preview.png}
# Then: add the wheel in /admin (or data/configuratorData.ts) with model_url /models/rims/<wheelId>.glb,
# and check it on a car: scripts/render/engine.html?rimModel=/models/rims/<wheelId>.glb&view=frontWheel
set -euo pipefail
cd "$(dirname "$0")/../.."
photo=$1; id=$2; shift 2; spec=-; mask=; spin=
for x in "$@"; do case $x in --mask) mask=--mask;; --spin) spin=1;; *) spec=$x;; esac; done
out=.prerender/rims/$id; mkdir -p "$out" public/models/rims
node scripts/rim3d/trace-mask.cjs "$photo" "$out/shapes.json" $mask
python3 scripts/rim3d/build_rim.py "$spec" "$out/full.glb" --shapes "$out/shapes.json" --segments 512 2>&1 | grep -E '^wrote|Traceback' -A3
[ -n "${PACK:-}" ] && node scripts/rim3d/pack.mjs "$out/full.glb" "public/models/rims/$id.glb" 40000 2>&1 | tail -1
python3 scripts/rim3d/preview.py "$out/preview.png" "$out/full.glb" --samples 24 --size 900x600 2>&1 | grep -E '^rendered|Traceback' -A3
if [ -n "$spin" ]; then
  python3 scripts/rim3d/turntable.py "$out/full.glb" "public/renders/rims/$id" --frames 36 --samples 16 | grep -E '^done|Traceback' -A3
  python3 scripts/rim3d/spin-manifest.py
fi
echo "done: public/models/rims/$id.glb  preview $out/preview.png"

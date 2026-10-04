"""Rebuilds public/renders/rims/manifest.json from the spin.json each turntable run writes, listing a
wheel only when every frame of every finish exists and decodes (a stale spin.json or a half-written
frame must never reach the rim page)."""
import json, os
from PIL import Image
root = 'public/renders/rims'
m = {}
for wid in sorted(os.listdir(root)):
    p = os.path.join(root, wid, 'spin.json')
    if not os.path.isfile(p):
        continue
    s = json.load(open(p)); ok = []
    for f in s['finishes']:
        try:
            for i in range(s['frames']):
                with Image.open(os.path.join(root, wid, f, f'f{i:02d}.webp')) as im: im.load()
            ok.append(f)
        except Exception as e:
            print(f'{wid}/{f}: skipped ({e})')
    if ok: m[wid] = {'frames': s['frames'], 'finishes': ok}
json.dump(m, open(os.path.join(root, 'manifest.json'), 'w'), indent=1)
print({k: len(v['finishes']) for k, v in m.items()})

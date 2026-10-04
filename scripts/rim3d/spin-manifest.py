"""Rebuilds public/renders/rims/manifest.json from the spin.json each turntable run writes."""
import json, os
root = 'public/renders/rims'
m = {}
for wid in sorted(os.listdir(root)):
    p = os.path.join(root, wid, 'spin.json')
    if os.path.isfile(p):
        s = json.load(open(p)); m[wid] = {'frames': s['frames'], 'finishes': s['finishes']}
json.dump(m, open(os.path.join(root, 'manifest.json'), 'w'), indent=1)
print(m)

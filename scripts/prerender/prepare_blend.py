"""Turns a licensed .blend car (e.g. from Blendkit) into a PRIVATE GLB the render pipeline can read.

The GLB is a build-time intermediate for export-scene.cjs and render_car.py: it goes in .scratch/ (git-ignored) and is
never copied to public/ or uploaded. Royalty Free cars may only reach the site as pre-rendered images
(docs/ADD_PREPARED_CAR.md, "Frames-only cars").

What it does:
  - finds the four wheels from the tyres (objects using a material matching --tyre-mat), and renames every mesh that
    sits inside a wheel (tyre, rim, brake, caps, logos) to wheel_<corner>_<n>, so the engine's DEFAULT_HIDE finds four
    wheels and swaps in the forged ones;
  - renames meshes whose material matches --paint-mat to paint_<n>, so the engine's paint regex finds the body;
  - drops meshes using a material matching --drop-mat (default: the model's own number plates, which would sit
    behind the engine's FORGED plates, as on the other cars);
  - exports glTF (textures embedded) with no cameras, lights or animation.

  blender -b car.blend --python scripts/prerender/prepare_blend.py -- out.glb [--tyre-mat Tire] [--paint-mat "Car paint"]
"""
import argparse, os, re, sys
import bpy, mathutils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--tyre-mat', default=r'^tyre$|^tire$', help='regex (case-insensitive) of the tyre tread material')
ap.add_argument('--paint-mat', default=r'car ?paint', help='regex (case-insensitive) of the body paint material')
ap.add_argument('--drop-mat', default=r'number ?plate|licen[cs]e', help='regex (case-insensitive) of materials whose meshes are left out')
ap.add_argument('--margin', type=float, default=0.12, help='metres a wheel part may stick out of its tyre box')
a = ap.parse_args(argv)

if os.path.abspath(a.out).startswith(os.path.abspath('public') + os.sep):
    sys.exit('refusing to write a licensed model under public/: use .scratch/')

tyre_re, paint_re = re.compile(a.tyre_mat, re.I), re.compile(a.paint_mat, re.I)
drop_re = re.compile(a.drop_mat, re.I) if a.drop_mat else None
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.visible_get()]


def box(o):
    pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return (mathutils.Vector([min(p[i] for p in pts) for i in range(3)]),
            mathutils.Vector([max(p[i] for p in pts) for i in range(3)]))


def mats(o):
    return [s.material.name for s in o.material_slots if s.material]


tyres = [o for o in meshes if any(tyre_re.search(m) for m in mats(o))]
if len(tyres) != 4:
    sys.exit(f'expected 4 tyres matching {a.tyre_mat!r}, found {len(tyres)}: {[o.name for o in tyres]}')

# Corner names only for the log; the engine decides front/rear and left/right itself.
cx = sum((box(t)[0].x + box(t)[1].x) / 2 for t in tyres) / 4
cy = sum((box(t)[0].y + box(t)[1].y) / 2 for t in tyres) / 4
wheel_parts, painted = 0, 0
for i, t in enumerate(tyres):
    tmn, tmx = box(t)
    c = (tmn + tmx) / 2
    corner = ('A' if c.y < cy else 'B') + ('R' if c.x > cx else 'L')
    for o in meshes:
        mn, mx = box(o)
        if all(mn[k] >= tmn[k] - a.margin and mx[k] <= tmx[k] + a.margin for k in range(3)):
            o.name = f'wheel_{corner}_{wheel_parts:03d}'
            wheel_parts += 1
    print(f'tyre {corner}: centre {tuple(round(v, 3) for v in c)}, diameter {tmx.z - tmn.z:.3f} m')

for o in meshes:
    if not o.name.startswith('wheel_') and any(paint_re.search(m) for m in mats(o)):
        o.name = f'paint_{painted:03d}'
        painted += 1
if not painted:
    sys.exit(f'no mesh uses a material matching {a.paint_mat!r}')
dropped = [o for o in meshes if drop_re and any(drop_re.search(m) for m in mats(o))]
for o in dropped:
    o.hide_set(True)
    o.hide_render = True
print(f'{wheel_parts} wheel parts, {painted} paint meshes, dropped {len(dropped)}: {[o.name for o in dropped]}')

os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB', use_visible=True, export_cameras=False,
                          export_lights=False, export_animations=False, export_apply=True)
print('wrote', a.out, os.path.getsize(a.out))

"""Photoreal 360° spin of a rim for the rim detail page: Blender Cycles renders N frames around
the rim (standing on its tread, spinning about the vertical axis) per finish, transparent
background with a soft contact shadow, as WebP.

  python3 scripts/rim3d/turntable.py <full.glb> <outDir> [--frames 36] [--size 1000x750]
         [--samples 16] [--finishes scripts/rim3d/finishes.json] [--only liquid_metal,black]

Writes <outDir>/<finishId>/f00.webp … and <outDir>/spin.json (frames, finishes, size). The finish
recipes follow services/wheelFinish.ts (polished / gloss paint / satin metallic / metallic paint).
"""
import argparse, json, math, os, sys
import bpy
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('glb'); ap.add_argument('out')
ap.add_argument('--frames', type=int, default=36); ap.add_argument('--size', default='1000x750')
ap.add_argument('--samples', type=int, default=16)
ap.add_argument('--finishes', default=os.path.join(os.path.dirname(__file__), 'finishes.json'))
ap.add_argument('--only', default='')
a = ap.parse_args()
finishes = json.load(open(a.finishes))
if a.only: finishes = {k: v for k, v in finishes.items() if k in a.only.split(',')}

def srgb_to_lin(h):
    c = [int(h.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def kind(f):  # services/wheelFinish.ts finishKind
    r, g, b = srgb_to_lin(f['hex']); lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    dark = lum < 0.03
    if f['metalness'] >= 0.95 and f['roughness'] <= 0.16 and not dark: return 'polished'
    if (dark or f['metalness'] < 0.3) and f['roughness'] < 0.42: return 'gloss-paint'
    if f['roughness'] >= 0.42: return 'satin-metallic'
    return 'metallic-paint'

def material(f):
    m = bpy.data.materials.new(f['id']); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; k = kind(f)
    b.inputs['Base Color'].default_value = (*srgb_to_lin(f['hex']), 1)
    if k == 'polished':
        b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.07
        b.inputs['Coat Weight'].default_value = f['clearcoat']; b.inputs['Coat Roughness'].default_value = 0.02
    elif k == 'gloss-paint':
        b.inputs['Metallic'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.4
        b.inputs['Coat Weight'].default_value = max(f['clearcoat'], 0.9); b.inputs['Coat Roughness'].default_value = 0.03
    elif k == 'satin-metallic':
        b.inputs['Metallic'].default_value = max(f['metalness'], 0.75); b.inputs['Roughness'].default_value = min(max(f['roughness'], 0.42), 0.7)
        b.inputs['Coat Weight'].default_value = f['clearcoat']; b.inputs['Coat Roughness'].default_value = 0.5
    else:
        b.inputs['Metallic'].default_value = f['metalness']; b.inputs['Roughness'].default_value = f['roughness']
        b.inputs['Coat Weight'].default_value = max(f['clearcoat'], 0.8); b.inputs['Coat Roughness'].default_value = 0.05
    return m

bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=a.glb)
new = [o for o in bpy.data.objects if o not in before]; objs = [o for o in new if o.type == 'MESH']
root = bpy.data.objects.new('rim', None); sc.collection.objects.link(root)
for o in [o for o in new if o.parent is None]: o.parent = root
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector([min(p[k] for p in pts) for k in range(3)]); hi = Vector([max(p[k] for p in pts) for k in range(3)])
size = hi - lo; axle = min(range(3), key=lambda k: size[k]); diam = max(size[k] for k in range(3) if k != axle)
for o in objs:
    for p in o.data.polygons: p.use_smooth = True
# stand the wheel up: axle horizontal along world Y, tread on the floor (z = 0), diameter 2
rotmap = {0: (0, 0, math.radians(-90)), 1: (0, 0, 0), 2: (math.radians(90), 0, 0)}
root.rotation_euler = rotmap[axle]; root.scale = [2 / diam] * 3
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
cw = Vector([(min(p[k] for p in pts) + max(p[k] for p in pts)) / 2 for k in range(3)])
root.location = Vector((0, 0, 1.0)) - cw
# face toward -Y (the camera side) at frame 0
mid = (lo + hi) / 2; hub_x = []
for o in objs:
    for vi, v in enumerate(o.data.vertices):
        if vi % 7: continue
        w = o.matrix_world @ v.co; d = w - mid; d[axle] = 0
        if d.length < 0.3 * diam: hub_x.append(w[axle] - mid[axle])
face_sign = 1 if sum(hub_x) >= 0 else -1
bpy.context.view_layer.update()
fwd = root.matrix_world.to_3x3() @ Vector([face_sign if k == axle else 0 for k in range(3)])
if fwd.y > 0: root.rotation_euler.rotate_axis('Z', math.pi)
spin = bpy.data.objects.new('spin', None); sc.collection.objects.link(spin); spin.location = (0, 0, 0)
bpy.context.view_layer.update(); root.matrix_world = root.matrix_world.copy(); root.parent = spin

# studio: soft grey world, overhead strip, key and fill, shadow-catcher floor
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.55, 0.57, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
def light(name, loc, rot, sx, sy, e):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'; l.size, l.size_y, l.energy = sx, sy, e
    o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = rot; sc.collection.objects.link(o)
light('key', (-3, -4, 5), (math.radians(45), 0, math.radians(-35)), 6, 3, 1500)
light('fill', (5, -5, 2), (math.radians(70), 0, math.radians(45)), 4, 4, 500)
light('strip', (0, -1, 6), (0, 0, 0), 12, 1.5, 800)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); floor = bpy.context.object; floor.is_shadow_catcher = True

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -6.2, 1.55); cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 70
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
sc.render.film_transparent = True
W, H = map(int, a.size.split('x')); sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

from PIL import Image
os.makedirs(a.out, exist_ok=True)
for fid, f in finishes.items():
    m = material(f)
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(m)
    d = os.path.join(a.out, fid); os.makedirs(d, exist_ok=True)
    for i in range(a.frames):
        spin.rotation_euler.z = math.radians(-25 + 360 * i / a.frames)  # start a little off face-on
        tmp = os.path.join(d, f'f{i:02d}.png'); sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        Image.open(tmp).save(os.path.join(d, f'f{i:02d}.webp'), quality=86, method=4); os.remove(tmp)
        print(f'{fid} {i + 1}/{a.frames}', flush=True)
json.dump({'frames': a.frames, 'finishes': list(finishes), 'size': [W, H]}, open(os.path.join(a.out, 'spin.json'), 'w'))
print('done', a.out)

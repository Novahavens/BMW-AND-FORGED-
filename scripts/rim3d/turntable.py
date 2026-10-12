"""Photoreal 360° spin of a rim for the rim detail page: Blender Cycles renders N frames around
the rim (standing on its tread, spinning about the vertical axis) per finish, transparent
background with a soft contact shadow, as WebP.

  python3 scripts/rim3d/turntable.py <full.glb> <outDir> [--frames 36] [--size 1000x750]
         [--samples 16] [--finishes scripts/rim3d/finishes.json] [--only liquid_metal,black]
         [--resmooth]   (face normals by angle: for large flat traced faces that reflect in streaks)
         [--weighted]   (with --resmooth: face-area weighted normals, no streaks from long fill triangles)

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
ap.add_argument('--lens', type=float, default=70)
ap.add_argument('--threads', type=int, default=0, help='CPU threads for Cycles (0 = all); on a shared box pass 3')
ap.add_argument('--resmooth', action='store_true', help='rebuild the face mesh normals by angle (30 deg) instead of '
                'the GLB custom normals: cures streaky, wavy reflections on large flat traced faces made of long '
                'thin triangles (e.g. the solid step flange of FSA-09)')
ap.add_argument('--weighted', action='store_true', help='with --resmooth: face-area weighted normals on the face '
                'mesh, so a big flat face keeps flat normals up to its bevels (smoothing by angle alone tilts the '
                'normals of every outline vertex toward its first bevel step, and long fill triangles smear that '
                'tilt across the face as vertical streaks, worst in Gloss Black)')
a = ap.parse_args()
finishes = json.load(open(a.finishes))
if a.only: finishes = {k: v for k, v in finishes.items() if k in a.only.split(',')}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import materials
material = materials.make

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
if a.resmooth:
    for o in bpy.context.selected_objects: o.select_set(False)  # the importer leaves every mesh selected
    for o in [o for o in objs if o.name.startswith('face')]:
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30)); o.select_set(False)
        if a.weighted:
            wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.mode = 'FACE_AREA'; wn.keep_sharp = True
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

# studio: dark surround, big bright softboxes (how wheels are photographed: chrome and gloss black
# need dark areas to reflect, satin needs broad soft highlights), shadow-catcher floor
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.08, 0.08, 0.085, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
def light(name, loc, rot, sx, sy, e):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'; l.size, l.size_y, l.energy = sx, sy, e
    o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = rot; sc.collection.objects.link(o)
light('key', (-3.5, -4.5, 5.0), (math.radians(45), 0, math.radians(-38)), 3.2, 1.6, 1800)    # upper left, raking the face
light('fill', (5.5, -5.0, 1.8), (math.radians(72), 0, math.radians(48)), 2.5, 4, 450)       # right, soft
light('strip', (0, -0.5, 6.5), (0, 0, 0), 10, 0.9, 1000)                                      # long overhead strip: the highlight line along the lip
light('front', (0, -7.5, 2.6), (math.radians(72), 0, 0), 7, 0.22, 140)              # a thin strip high behind the camera: the crisp line gloss black and chrome show
light('back', (0, 5, 3), (math.radians(-60), 0, 0), 6, 2, 400)                               # separates the barrel from the dark surround
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); floor = bpy.context.object; floor.is_shadow_catcher = True
# the catcher must not show up in the rim's reflections as a white plane (it still catches shadows)
floor.visible_glossy = False; floor.visible_diffuse = False; floor.visible_transmission = False

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -6.2, 1.55); cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = a.lens
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
sc.render.film_transparent = True
if a.threads: sc.render.threads_mode = 'FIXED'; sc.render.threads = a.threads
W, H = map(int, a.size.split('x')); sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'; sc.view_settings.exposure = -0.9
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

from PIL import Image
os.makedirs(a.out, exist_ok=True)

# Parts that keep their own look in every finish, as in the engine (wheelKit createWheelKitMaterials): the polished lip of a
# multi-piece rim ('lip', 'shelf'), its bolts, the lug nuts, and the black centre cap with a gold ring and lettering.
# Rims built before these parts existed have none of these names and render exactly as before.
def fixed_material(name, hex_, metal, rough, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*materials.srgb_to_lin(hex_), 1); b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough; b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.05
    return m
fixed = {}
if any(o.name.startswith('captext') for o in objs):
    fixed['cap'] = fixed_material('cap_dark', '#161719', 0.35, 0.28, 1.0)
    fixed['capring'] = fixed['captext'] = fixed_material('cap_gold', '#CF9F52', 1.0, 0.3, 0.3)
if any(o.name.startswith('lugnut') for o in objs): fixed['lugnut'] = fixed_material('lugnut', '#9da2a8', 1.0, 0.18)
if any(o.name.startswith('lip') for o in objs):
    fixed['lip'] = fixed['shelf'] = fixed_material('lip_polished', '#eceef0', 1.0, 0.06, 1.0)
    fixed['bolt'] = fixed_material('bolt', '#b9bdc3', 1.0, 0.22)
def part_material(o, default, barrel):
    n = o.name.split('.')[0]
    for key in ('captext', 'capring', 'cap', 'lugnut', 'lip', 'shelf', 'bolt'):
        if n.startswith(key) and key in fixed: return fixed[key]
    return barrel if o.name.startswith('barrel') else default
for fid, f in finishes.items():
    # tone curve per finish: gloss black and chrome are photographed with hard contrast, satins soft
    sc.view_settings.look = f.get('look', 'AgX - Base Contrast')
    m = material(f); mb = material(f, 'barrel')
    # the world each finish reflects: chrome needs a brighter surround or it reads as gloss black
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (*[f.get('world', 0.08)] * 3, 1)
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(part_material(o, m, mb))
    d = os.path.join(a.out, fid); os.makedirs(d, exist_ok=True)
    for i in range(a.frames):
        if os.path.exists(os.path.join(d, f'f{i:02d}.webp')): continue  # resume an interrupted run
        spin.rotation_euler.z = math.radians(-25 + 360 * i / a.frames)  # start a little off face-on
        tmp = os.path.join(d, f'f{i:02d}.png'); sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        final = os.path.join(d, f'f{i:02d}.webp')  # write then rename: a killed job never leaves a half frame
        Image.open(tmp).save(final + '.part', 'WEBP', quality=80, method=4); os.replace(final + '.part', final); os.remove(tmp)
        print(f'{fid} {i + 1}/{a.frames}', flush=True)
# a partial re-render (--only) keeps the finishes an earlier run already made
prev = os.path.join(a.out, 'spin.json')
done = json.load(open(prev))['finishes'] if os.path.exists(prev) else []
json.dump({'frames': a.frames, 'finishes': done + [f for f in finishes if f not in done], 'size': [W, H]}, open(prev, 'w'))
print('done', a.out)

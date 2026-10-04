"""Photoreal studio render of a configurator car GLB with Blender Cycles (bpy).

Usage: python3 render_car.py <car.glb> <out_dir> --paint '#1f4d3a' --paint-match 'regex' \
         [--views frontThreeQuarter,side] [--samples 64] [--size 1200x800]
The GLB must be decompressed first (npx @gltf-transform/cli copy in.glb out.glb).
"""
import argparse, math, os, re, sys
import bpy
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('glb'); ap.add_argument('out')
ap.add_argument('--paint', default='#8a8f94')
ap.add_argument('--paint-match', default='paint|body')
ap.add_argument('--finish', default='metallic', choices=['metallic', 'uni', 'frozen'])
ap.add_argument('--views', default='frontThreeQuarter,side,rearThreeQuarter,frontWheel,top')
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--size', default='1200x800')
ap.add_argument('--subdiv', type=int, default=1)
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.glb)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# Normalise: car centred on origin, wheels on the floor, length along X.
bpy.ops.object.select_all(action='DESELECT')
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
size = hi - lo
root = bpy.data.objects.new('root', None); bpy.context.scene.collection.objects.link(root)
for o in bpy.context.scene.objects:
    if o.parent is None and o is not root:
        o.parent = root
root.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)
if size.y > size.x:  # length along Y -> rotate so it runs along X
    root.rotation_euler.z = math.pi / 2
    root.location = ((lo.y + hi.y) / 2, -(lo.x + hi.x) / 2, -lo.z)
length = max(size.x, size.y); height = size.z
bpy.context.view_layer.update()

def hexrgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]

def car_paint():
    m = bpy.data.materials.new('CarPaint'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexrgb(a.paint)
    rough = {'metallic': 0.32, 'uni': 0.18, 'frozen': 0.55}[a.finish]
    b.inputs['Metallic'].default_value = {'metallic': 0.6, 'uni': 0.0, 'frozen': 0.55}[a.finish]
    b.inputs['Roughness'].default_value = rough
    coat = 0.0 if a.finish == 'frozen' else 1.0
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.02
    return m

paint = car_paint(); rx = re.compile(a.paint_match, re.I)
for o in meshes:
    names = [o.name] + [s.material.name for s in o.material_slots if s.material]
    painted = False
    for s in o.material_slots:
        if s.material and rx.search(s.material.name):
            s.material = paint; painted = True
    if painted or rx.search(o.name):
        if not painted:
            for s in o.material_slots: s.material = paint
        # Geometry cleanup: the source panels are faceted/wavy. Smooth normals with
        # weighted-normal + subdivision removes the "crumpled sheet metal" reflections.
        bpy.context.view_layer.objects.active = o
        import bmesh
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.to_mesh(o.data); bm.free()
        for p in o.data.polygons: p.use_smooth = True
        if a.subdiv:
            sd = o.modifiers.new('sub', 'SUBSURF'); sd.levels = sd.render_levels = a.subdiv; sd.boundary_smooth = 'PRESERVE_CORNERS'
        o.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True

# Studio: white cyclorama floor, large softboxes, soft grey world (Aston-style).
sc = bpy.context.scene
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
floor = bpy.context.object
fm = bpy.data.materials.new('Floor'); fm.use_nodes = True
fb = fm.node_tree.nodes['Principled BSDF']
fb.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1); fb.inputs['Roughness'].default_value = 0.35
floor.data.materials.append(fm)

w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.75, 0.77, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

def softbox(name, loc, rot, sx, sy, energy):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'
    l.size, l.size_y, l.energy = sx, sy, energy
    ob = bpy.data.objects.new(name, l); ob.location = loc; ob.rotation_euler = rot
    sc.collection.objects.link(ob)
L = length
softbox('top', (0, 0, height + 3.0), (0, 0, 0), L * 1.4, L * 0.7, 2500)       # long overhead strip
softbox('left', (0, -L, height), (math.radians(70), 0, 0), L * 1.2, 1.2, 900)
softbox('right', (0, L, height), (math.radians(-70), 0, 0), L * 1.2, 1.2, 900)
softbox('front', (L * 1.1, 0, height), (0, math.radians(70), 0), 2, 2, 500)

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
W, H = map(int, a.size.split('x')); sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.image_settings.file_format = 'PNG'

cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam); sc.camera = cam
VIEWS = {  # (azimuth deg from +X front, elevation deg, distance x length, lens mm, target z x height)
    'frontThreeQuarter': (35, 10, 1.55, 50, 0.4),
    'side': (90, 4, 1.55, 50, 0.4),
    'rearThreeQuarter': (145, 10, 1.55, 50, 0.4),
    'frontWheel': (60, 6, 0.55, 50, 0.25),
    'top': (90, 75, 1.9, 50, 0.3),
}
os.makedirs(a.out, exist_ok=True)
for v in a.views.split(','):
    az, el, dist, lens, tz = VIEWS[v]
    tgt = Vector((L * 0.32 if v == 'frontWheel' else 0, 0, height * tz))
    d = dist * L
    cam.location = tgt + Vector((d * math.cos(math.radians(el)) * math.cos(math.radians(az)),
                                 -d * math.cos(math.radians(el)) * math.sin(math.radians(az)),
                                 d * math.sin(math.radians(el))))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_d.lens = lens
    sc.render.filepath = os.path.join(a.out, f'{v}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', sc.render.filepath)

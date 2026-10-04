"""Studio close-up of one or more rim GLBs side by side (same lights as scripts/prerender).

  python3 scripts/rim3d/preview.py out.png a.glb [b.glb ...] [--samples 32] [--size 1200x700] [--angle 35]
Each rim is scaled to the same diameter and shown face toward the camera, turned `angle` degrees.
"""
import argparse, math, sys
import bpy
from mathutils import Vector
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('glbs', nargs='+')
ap.add_argument('--samples', type=int, default=32); ap.add_argument('--size', default='1200x700'); ap.add_argument('--angle', type=float, default=35)
a = ap.parse_args()
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
mat = bpy.data.materials.new('Polished'); mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.85, 0.85, 0.86, 1)
b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.12; b.inputs['Coat Weight'].default_value = 0.6
n = len(a.glbs); spacing = 2.6
for i, g in enumerate(a.glbs):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=g)
    new = [o for o in bpy.data.objects if o not in before]
    objs = [o for o in new if o.type == 'MESH']
    root = bpy.data.objects.new(f'rim{i}', None); sc.collection.objects.link(root)
    for o in [o for o in new if o.parent is None]: o.parent = root
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector([min(p[k] for p in pts) for k in range(3)]); hi = Vector([max(p[k] for p in pts) for k in range(3)])
    size = hi - lo; axle = min(range(3), key=lambda k: size[k])  # thinnest axis = axle
    diam = max(size[k] for k in range(3) if k != axle)
    for o in objs:
        for s in o.material_slots: s.material = mat
        if not o.material_slots: o.data.materials.append(mat)
        for p in o.data.polygons: p.use_smooth = True
    # axle -> +Y (toward camera), scale to diameter 2, centre at its slot
    rotmap = {0: (0, 0, math.radians(-90)), 1: (0, 0, 0), 2: (math.radians(90), 0, 0)}
    root.rotation_euler = rotmap[axle]; root.scale = [2 / diam] * 3
    # the face is the side where the hub sits: small-radius vertices. Turn it toward the camera (-Y).
    mid = (lo + hi) / 2; hub_x = []
    for o in objs:
        for vi, vtx in enumerate(o.data.vertices):
            if vi % 7: continue
            w = o.matrix_world @ vtx.co; d = w - mid; d[axle] = 0
            if d.length < 0.3 * diam: hub_x.append(w[axle] - mid[axle])
    face_sign = 1 if sum(hub_x) >= 0 else -1
    bpy.context.view_layer.update()
    fwd = root.matrix_world.to_3x3() @ Vector([face_sign if k == axle else 0 for k in range(3)])
    if fwd.y > 0: root.rotation_euler.rotate_axis('Z', math.pi)
    root.rotation_euler.rotate_axis('Z', math.radians(a.angle))
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    cw = Vector([(min(p[k] for p in pts) + max(p[k] for p in pts)) / 2 for k in range(3)])
    root.location = Vector(((i - (n - 1) / 2) * spacing, 0, 0)) - cw
# the face may point -Y for some files: flip the whole thing if the thicker side faces the camera
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
W, H = map(int, a.size.split('x')); sc.render.resolution_x, sc.render.resolution_y = W, H
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 0.52, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
def light(name, loc, rot, sx, sy, e):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'; l.size, l.size_y, l.energy = sx, sy, e
    o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = rot; sc.collection.objects.link(o)
light('key', (-3, -4, 5), (math.radians(45), 0, math.radians(-35)), 6, 3, 1500)
light('fill', (5, -5, 2), (math.radians(70), 0, math.radians(45)), 4, 4, 500)
light('strip', (0, -2, 6), (0, 0, 0), 12, 1.5, 800)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -1.05)); bpy.context.object.is_shadow_catcher = False
fm = bpy.data.materials.new('Floor'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.35, 0.36, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.4; bpy.context.object.data.materials.append(fm)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -(3.0 + 2.4 * n), 0.9); cam.rotation_euler = (Vector((0, 0, -0.1)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 60
sc.view_settings.view_transform = 'AgX'; sc.render.filepath = a.out
bpy.ops.render.render(write_still=True); print('rendered', a.out)

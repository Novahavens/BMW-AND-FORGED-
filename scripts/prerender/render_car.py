"""Pre-renders one car for the image configurator with Blender Cycles (pip install bpy).

Input is the GLB from export-scene.cjs (the body exactly as the engine places it, with stock
wheels hidden, plus one CAM_<view> camera per view). For each view it renders the paint four
times: gloss (clearcoat) and matte (frozen), each with white and black base colour. The browser
recolours any paint as  black + (white - black) * colour, so no paint ever needs a re-render.
Background is transparent; the floor is a shadow catcher.

  python3 scripts/prerender/render_car.py scene.glb public/renders/<carId> [--samples 32] [--width 1440]
"""
import argparse, math, os, re, sys
import bpy, bmesh, mathutils

ap = argparse.ArgumentParser()
ap.add_argument('glb'); ap.add_argument('out')
ap.add_argument('--samples', type=int, default=32)
ap.add_argument('--width', type=int, default=1440)
ap.add_argument('--views', default='')
ap.add_argument('--no-subdiv', action='store_true', help='for very dense models that run out of memory')
ap.add_argument('--car', default='', help='car id for the per-car fixes below (default: the output folder name)')
ap.add_argument('--hide', default=None, help='regex of mesh names to drop (overrides the per-car default)')
a = ap.parse_args()

# Per-car fixes, keyed by car id (--car, or the output folder name as render-all.sh passes it).
#  hide: multi-variant source models stack alternative parts (tuner kits, CS/Competition panels)
#        on the same surface; coincident painted copies z-fight into a crumpled, mottled panel
#        once subdivided, so drop all but one variant.
#  thin_glass: glazing modelled as open or doubled sheets refracts the cabin into dark blotches;
#        render it as a thin sheet (IOR 1, reflections from the coat layer) instead.
#  lamps: regex of headlight meshes. The mirrored lamp (…_R001) leaves the exporter with reversed
#        winding but outward custom normals, so Cycles shades it from behind (black); its chrome
#        reflector is also an 'other' material (made satin black) and the lens a 30% white alpha
#        sheet. Re-wind those meshes, then give the lamp parts the materials in LAMP_MATS.
CAR_FIXES = {
    # four front-fender variants (stock, Competition, CS, Keyvany): keep the Competition one
    'm8_f92': {'hide': r'^(PAINT_)?(m8f92_fender_[LR](_cs)?(00\d)?_m8f92_|keyvany_fender_[LR])'},
    'm3_g80': {'thin_glass': True, 'no_subdiv': True},  # subdivided, it runs out of memory (12.7 GB)
    'm3_touring_g81': {'lamps': r'headlight'},
}
LAMP_MATS = {  # source part name in the mesh name: Principled inputs
    'Lights_Common': {'Base Color': (0.7, 0.7, 0.71, 1), 'Metallic': 1.0, 'Roughness': 0.15},  # reflectors
    'Chrome_ext': {'Base Color': (0.8, 0.8, 0.81, 1), 'Metallic': 1.0, 'Roughness': 0.12},
    'Coloured_matte': {'Base Color': (0.12, 0.12, 0.125, 1), 'Metallic': 0.1, 'Roughness': 0.3},  # housing
    'Coloured_gloss': {'Base Color': (0.06, 0.06, 0.065, 1), 'Metallic': 0.1, 'Roughness': 0.22},
    'Glass_Saphir': {'Base Color': (0.8, 0.8, 0.8, 1), 'Metallic': 0.05, 'Roughness': 0.4},
    'signal': {'Base Color': (0.5, 0.5, 0.5, 1), 'Metallic': 0.05, 'Roughness': 0.5},
    'headlight_high': {'Base Color': (0.0, 0.08, 0.8, 1), 'Metallic': 0.2, 'Roughness': 0.2},
    'headlight_low': {'Base Color': (0.0, 0.08, 0.8, 1), 'Metallic': 0.2, 'Roughness': 0.2},
    'running_front': {'Base Color': (0.9, 0.9, 0.9, 1), 'Metallic': 0.0, 'Roughness': 0.35},  # DRL light guides
    'Glass_Clear': {'Base Color': (0.9, 0.91, 0.92, 1), 'Alpha': 1.0, 'Transmission Weight': 0.92, 'IOR': 1.0,
                    'Roughness': 0.0, 'Coat Weight': 1.0, 'Coat Roughness': 0.02},  # thin, slightly hazy lens
}
fix = CAR_FIXES.get(a.car or os.path.basename(os.path.normpath(a.out)), {})

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.glb)
sc = bpy.context.scene
hide = a.hide if a.hide is not None else fix.get('hide')
if hide:
    for o in [o for o in sc.objects if o.type == 'MESH' and re.search(hide, o.name)]:
        bpy.data.objects.remove(o, do_unlink=True)
objs = list(sc.objects)
cams = {o.name.split('CAM_', 1)[1].split('.')[0]: o for o in objs if o.type == 'CAMERA' and 'CAM_' in o.name}
meshes = [o for o in objs if o.type == 'MESH']

def principled(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes['Principled BSDF']

paint, pb = principled('PAINT')
pb.inputs['Coat Roughness'].default_value = 0.02

for o in meshes:
    is_paint = any(s.material and s.material.name.startswith('PAINT') for s in o.material_slots)
    if is_paint:
        o.data.materials.clear(); o.data.materials.append(paint)
        # The source panels are faceted and split: weld, smooth and subdivide them so the
        # reflections run clean instead of looking like crumpled sheet metal.
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.to_mesh(o.data); bm.free()
        for p in o.data.polygons: p.use_smooth = True
        if not (a.no_subdiv or fix.get('no_subdiv')) and len(o.data.vertices) < 150000:  # dense meshes are smooth enough and would run out of memory
            sd = o.modifiers.new('sub', 'SUBSURF'); sd.levels = sd.render_levels = 1
            sd.boundary_smooth = 'PRESERVE_CORNERS'
        o.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True
    else:
        for p in o.data.polygons: p.use_smooth = True
        for s in o.material_slots:
            m = s.material
            b = m and m.node_tree and m.node_tree.nodes.get('Principled BSDF')
            if b and m.name.split('.')[0] in ('part', 'other', 'blackTrim'):
                # unnamed plastics, arch liners and trim: satin black, as on the real car
                b.inputs['Base Color'].default_value = (0.02, 0.02, 0.022, 1)
                b.inputs['Metallic'].default_value = 0.0
                b.inputs['Roughness'].default_value = 0.45
            if m and 'glass' in m.name.lower():
                b = m.node_tree.nodes.get('Principled BSDF')
                if b:
                    b.inputs['Transmission Weight'].default_value = 1.0
                    b.inputs['Roughness'].default_value = 0.02
                    b.inputs['Base Color'].default_value = (0.05, 0.06, 0.07, 1)
                    b.inputs['Alpha'].default_value = 1.0
                    if fix.get('thin_glass'):
                        b.inputs['IOR'].default_value = 1.0
                        b.inputs['Coat Weight'].default_value = 1.0
                        b.inputs['Coat Roughness'].default_value = 0.02

def rewind(o):
    """Reverse faces whose winding disagrees with their custom normals, keeping those normals."""
    me = o.data
    cn = [c.vector.copy() for c in me.corner_normals]
    bad = sum(1 for p in me.polygons if sum((cn[i] for i in p.loop_indices), mathutils.Vector()).dot(p.normal) < 0)
    if bad * 2 < len(me.polygons): return
    keep = [{me.loops[i].vertex_index: cn[i] for i in p.loop_indices} for p in me.polygons]
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([keep[p.index][me.loops[i].vertex_index] for p in me.polygons for i in p.loop_indices])

if fix.get('lamps'):
    for o in [o for o in meshes if re.search(fix['lamps'], o.name)]:
        rewind(o)
        part = next((k for k in LAMP_MATS if k in o.name), None)
        for s in o.material_slots:
            b = part and s.material and s.material.node_tree.nodes.get('Principled BSDF')
            if not b: continue
            for k, v in LAMP_MATS[part].items(): b.inputs[k].default_value = v
            if part == 'Glass_Clear': s.material.surface_render_method = 'DITHERED'

# Car extents (Blender is Z-up after import).
xs = [(o.matrix_world @ v.co) for o in meshes for i, v in enumerate(o.data.vertices) if i % 50 == 0]
L = max(max(p.x for p in xs) - min(p.x for p in xs), max(p.y for p in xs) - min(p.y for p in xs))
H = max(p.z for p in xs)

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
floor = bpy.context.object; floor.is_shadow_catcher = True

w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.75, 0.77, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

def softbox(name, loc, rot, sx, sy, energy):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'
    l.size, l.size_y, l.energy = sx, sy, energy
    ob = bpy.data.objects.new(name, l); ob.location = loc; ob.rotation_euler = rot
    sc.collection.objects.link(ob)
long_y = (max(p.y for p in xs) - min(p.y for p in xs)) > (max(p.x for p in xs) - min(p.x for p in xs))
rz = math.pi / 2 if long_y else 0  # the softboxes follow the car's long axis
softbox('top', (0, 0, H + 3.0), (0, 0, rz), L * 1.4, L * 0.7, 2500)
for sgn in (1, -1):
    d = (0, sgn * L) if not long_y else (sgn * L, 0)
    rot = (math.radians(-70 * sgn), 0, 0) if not long_y else (0, math.radians(70 * sgn), 0)
    softbox(f'side{sgn}', (d[0], d[1], H), rot, L * 1.2, 1.2, 900)

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = a.width; sc.render.resolution_y = round(a.width / 1.6)
sc.view_settings.view_transform = 'Standard'  # linear-safe: the browser mixes black/white passes
sc.view_settings.exposure = -1.6
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

PASSES = {  # name: (base value, metallic, roughness, coat)
    'gloss_w': (1.0, 0.0, 0.30, 1.0), 'gloss_b': (0.0, 0.0, 0.30, 1.0),
    'matte_w': (1.0, 0.0, 0.55, 0.0), 'matte_b': (0.0, 0.0, 0.55, 0.0),
}
views = a.views.split(',') if a.views else list(cams)
for v in views:
    sc.camera = cams[v]
    os.makedirs(os.path.join(a.out, v), exist_ok=True)
    for name, (base, met, rough, coat) in PASSES.items():
        pb.inputs['Base Color'].default_value = (base, base, base, 1)
        pb.inputs['Metallic'].default_value = met
        pb.inputs['Roughness'].default_value = rough
        pb.inputs['Coat Weight'].default_value = coat
        sc.render.filepath = os.path.join(a.out, v, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', sc.render.filepath, flush=True)

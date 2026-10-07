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
ap.add_argument('--studio', choices=['default', 'dark'], default='default',
                help="'dark': near-black room, low-energy overhead softbox, long side strips, rim strips, "
                     "linear headroom so the white pass never clips (see DARK below)")
ap.add_argument('--dark-set', default='', help='override DARK values, e.g. top_rad=3,strip_rad=14 (for tuning)')
ap.add_argument('--passes', default='', help='comma list of passes to render (default: all four)')
ap.add_argument('--threads', type=int, default=0, help='CPU threads for Cycles (0 = all)')
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
    # wheels: (x, y, z, tyre radius, tyre width) in Blender axes, for --studio dark. The live engine draws
    # the wheels, so none is in the scene; these invisible-to-camera tyre cylinders only cast the contact
    # shadows, darken the arches and show in the paint's reflections. Taken from the engine's wheel
    # assemblies (window.e.wheelAssemblies in scripts/render/engine.html: Blender = (x, -z, y)).
    'm4_g82': {'wheels': [(-0.789, -1.534, 0.381, 0.363, 0.275), (0.789, -1.534, 0.381, 0.363, 0.275),
                          (-0.817, 1.320, 0.371, 0.371, 0.313), (0.817, 1.320, 0.371, 0.371, 0.313)]},
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
# --studio dark. Light sizes are in car lengths (L) or metres; *_rad is the emitted radiance in Blender
# units (area-light power = radiance x area x pi), so the numbers mean the same whatever the car size.
# A white paint pass sees diffuse light = albedo x irradiance / pi, so rad values are chosen to keep that
# under ~0.85 on the body, while a 4-10% clear-coat reflection of a bright strip still reaches ~1 (crisp lines).
DARK = dict(
    exposure=0.0,            # view exposure, stops ('Standard' view transform stays linear)
    world_zenith=0.004, world_horizon=0.03,   # near-black room with a faint horizon glow (lower-body reflections)
    top_rad=2.0, top_refl_rad=0.5, top_w=1.0, top_l=0.75, top_h=3.0,   # big soft overhead: width x length (xL), height above roof (m)
    strip_rad=4.5, strip_w=0.05, strip_l=1.15, strip_d=0.5, strip_h=1.0,   # high side strips: width/length (xL), offset (xL), height above roof (m)
    strip2_rad=0.0, strip2_w=0.05, strip2_d=0.4, strip2_h=1.5,   # second high strip, nearer and steeper: shoulder / roof-pillar lines
    low_rad=4.0, low_w=0.05, low_d=0.7, low_h=0.35,   # low side strips (sills): height above ground (m)
    rim_rad=8.0, rim_w=0.07, rim_l=0.8, rim_d=0.9, rim_h=1.8,    # end rim strips, high behind/in front, aimed at roof/bonnet
    panel_rad_top=1.3, panel_rad_bottom=0.15, panel_d=0.75, panel_len=1.3, panel_h=2.4,   # far-side gradient wall (emissive, reflection-only): doors/flanks reflect a soft light-to-dark gradient; d, len in xL, h in metres
    far_strips=0,            # 1 also puts the high/low strips on the far side (they reflect strongly in the windscreen)
    strips_reflect_only=1,   # strips/rims are invisible to diffuse rays: they draw crisp reflections but do not light (wash out) the white pass or the floor
    glass_spec=0.0,          # Principled 'Specular IOR Level' of the (opaque, dark) glazing (default 0.5); anything above ~0.05 turns the bumpy source glass into white wavy reflections
    floor_albedo=0.08,       # the (invisible) floor still shows in reflections
)
for kv in filter(None, a.dark_set.split(',')):
    k, v = kv.split('='); DARK[k] = float(v)
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
                    if a.studio == 'dark':
                        # The bodies are hollow: through transmissive glass a camera ray leaves by the far window and the
                        # transparent film shows the page backdrop (white wavy holes in every window). Render the glazing as
                        # opaque dark-tinted glass that still mirrors the light strips.
                        b.inputs['Transmission Weight'].default_value = 0.0
                        b.inputs['Base Color'].default_value = (0.012, 0.014, 0.017, 1)
                        b.inputs['Roughness'].default_value = 0.04
                        b.inputs['Specular IOR Level'].default_value = DARK['glass_spec']
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

def softbox(name, loc, rot, sx, sy, energy):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'
    l.size, l.size_y, l.energy = sx, sy, energy
    ob = bpy.data.objects.new(name, l); ob.location = loc; ob.rotation_euler = rot
    sc.collection.objects.link(ob)
    return ob
long_y = (max(p.y for p in xs) - min(p.y for p in xs)) > (max(p.x for p in xs) - min(p.x for p in xs))
rz = math.pi / 2 if long_y else 0  # the softboxes follow the car's long axis
cx = (max(p.x for p in xs) + min(p.x for p in xs)) / 2; cy = (max(p.y for p in xs) + min(p.y for p in xs)) / 2

if a.studio == 'default':
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.75, 0.77, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    softbox('top', (0, 0, H + 3.0), (0, 0, rz), L * 1.4, L * 0.7, 2500)
    for sgn in (1, -1):
        d = (0, sgn * L) if not long_y else (sgn * L, 0)
        rot = (math.radians(-70 * sgn), 0, 0) if not long_y else (0, math.radians(70 * sgn), 0)
        softbox(f'side{sgn}', (d[0], d[1], H), rot, L * 1.2, 1.2, 900)
else:
    D = DARK
    # near-black room: vertical gradient, faint glow at the horizon
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.clamp = True
    mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.6
    mr.inputs['To Min'].default_value = D['world_horizon']; mr.inputs['To Max'].default_value = D['world_zenith']
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    absn = nt.nodes.new('ShaderNodeMath'); absn.operation = 'ABSOLUTE'
    nt.links.new(sep.outputs['Z'], absn.inputs[0]); nt.links.new(absn.outputs[0], mr.inputs['Value'])
    cm = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): nt.links.new(mr.outputs[0], cm.inputs[i])
    nt.links.new(cm.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (D['floor_albedo'],) * 3 + (1,)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.5
    floor.data.materials.append(fm)
    if fix.get('wheels'):
        rub = bpy.data.materials.new('rubber'); rub.use_nodes = True
        rb = rub.node_tree.nodes['Principled BSDF']
        rb.inputs['Base Color'].default_value = (0.015, 0.015, 0.016, 1); rb.inputs['Roughness'].default_value = 0.7
        for (x, y, z, r, wd) in fix['wheels']:
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=wd, location=(x, y, z), rotation=(0, math.pi / 2, 0))
            t = bpy.context.object; t.data.materials.append(rub)
            for pl in t.data.polygons: pl.use_smooth = True
            t.visible_camera = False   # not in the picture (the engine draws the real wheel), but shadows + reflections stay

    def lat(sgn, u, v, z):   # car frame (u along the long axis, v sideways) -> world
        return (cx + v * sgn, cy + u, z) if long_y else (cx + u, cy + v * sgn, z)
    def aim(ob, target):
        d = mathutils.Vector(target) - mathutils.Vector(ob.location)
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    def strip(name, loc, target, sx, sy, rad):
        if rad <= 0: return None
        l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'
        l.size, l.size_y = sx, sy; l.energy = rad * sx * sy * math.pi
        ob = bpy.data.objects.new(name, l); ob.location = loc; sc.collection.objects.link(ob)
        if D['strips_reflect_only']: ob.visible_diffuse = False
        ob.visible_transmission = False   # else they show through the windows as white scribbles
        aim(ob, target)
        return ob
    # 1 big soft overhead (a large diffuser, low radiance: gives the form gradient on bonnet/roof)
    tsx, tsy = L * D['top_l'], L * D['top_w']   # sx runs along the car (rz turns it), sy across
    # (two co-located lights: one lights the paint and floor diffusely, one only shows in reflections, so the
    # reflected softbox can be dimmer than the light that models the panel's shading; grazing Fresnel on the
    # bonnet would otherwise reflect it at 30-50% and clip the white pass)
    t_d = softbox('top', (cx, cy, H + D['top_h']), (0, 0, rz), tsx, tsy, D['top_rad'] * tsx * tsy * math.pi)
    t_d.visible_glossy = False
    if D['top_refl_rad'] > 0:
        t_g = softbox('top_refl', (cx, cy, H + D['top_h']), (0, 0, rz), tsx, tsy, D['top_refl_rad'] * tsx * tsy * math.pi)
        t_g.visible_diffuse = False; t_g.visible_transmission = False
    # The five views all shoot from one side of the car, so the camera side gets the strips (crisp lines on the
    # bonnet, roof and shoulder) and the far side gets a tall soft gradient wall that the doors and flanks reflect.
    camv = [(c.matrix_world.translation.x if long_y else c.matrix_world.translation.y) for c in cams.values()]
    cs = 1 if sum(camv) >= 0 else -1
    # 2 long narrow strips: crisp highlight lines along the shoulder and roofline
    for sgn in ((cs, -cs) if D['far_strips'] else (cs,)):
        strip(f'strip{sgn}', lat(sgn, 0, L * D['strip_d'], H + D['strip_h']), lat(sgn, 0, 0, H * 0.55),
              L * D['strip_l'], L * D['strip_w'], D['strip_rad'])
        strip(f'strip2_{sgn}', lat(sgn, 0, L * D['strip2_d'], H + D['strip2_h']), lat(sgn, 0, 0, H * 0.5),
              L * D['strip_l'], L * D['strip2_w'], D['strip2_rad'])
        # 3 low strips for the sills
        strip(f'low{sgn}', lat(sgn, 0, L * D['low_d'], D['low_h']), lat(sgn, 0, 0, H * 0.3),
              L * D['strip_l'], L * D['low_w'], D['low_rad'])
    # 3b far-side gradient wall: emissive quad, bright at the top fading to dark at the bottom, reflection-only
    if D['panel_rad_top'] > 0:
        dd = L * D['panel_d']; hl = L * D['panel_len'] / 2; zt = D['panel_h']
        corners = [lat(-cs, -hl, dd, 0.05), lat(-cs, hl, dd, 0.05), lat(-cs, hl, dd, zt), lat(-cs, -hl, dd, zt)]
        me = bpy.data.meshes.new('panel'); me.from_pydata(corners, [], [(0, 1, 2, 3)])
        pn = bpy.data.objects.new('panel', me); sc.collection.objects.link(pn)
        pm = bpy.data.materials.new('panel'); pm.use_nodes = True; pt = pm.node_tree; pt.nodes.clear()
        em = pt.nodes.new('ShaderNodeEmission'); out = pt.nodes.new('ShaderNodeOutputMaterial')
        gp = pt.nodes.new('ShaderNodeNewGeometry'); sz = pt.nodes.new('ShaderNodeSeparateXYZ')
        mr2 = pt.nodes.new('ShaderNodeMapRange'); mr2.clamp = True; mr2.interpolation_type = 'SMOOTHSTEP'
        mr2.inputs['From Min'].default_value = 0.05; mr2.inputs['From Max'].default_value = zt
        mr2.inputs['To Min'].default_value = D['panel_rad_bottom']; mr2.inputs['To Max'].default_value = D['panel_rad_top']
        pt.links.new(gp.outputs['Position'], sz.inputs[0]); pt.links.new(sz.outputs['Z'], mr2.inputs['Value'])
        pt.links.new(mr2.outputs[0], em.inputs['Strength']); pt.links.new(em.outputs[0], out.inputs[0])
        pn.data.materials.append(pm); pn.visible_diffuse = False; pn.visible_camera = False; pn.visible_shadow = False; pn.visible_transmission = False
    # 4 weak rim strips ahead of / behind the car: separate roof and bonnet from the dark background
    for sgn in (1, -1):
        strip(f'rim{sgn}', lat(1, sgn * L * D['rim_d'], 0, H + D['rim_h']), lat(1, 0, 0, H * 0.8),
              L * D['rim_l'], L * D['rim_w'], D['rim_rad'])

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
if a.threads: sc.render.threads_mode = 'FIXED'; sc.render.threads = a.threads
sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = a.width; sc.render.resolution_y = round(a.width / 1.6)
sc.view_settings.view_transform = 'Standard'  # linear-safe: the browser mixes black/white passes
sc.view_settings.exposure = -1.6 if a.studio == 'default' else DARK['exposure']
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
        if a.passes and name not in a.passes.split(','): continue
        pb.inputs['Base Color'].default_value = (base, base, base, 1)
        pb.inputs['Metallic'].default_value = met
        pb.inputs['Roughness'].default_value = rough
        pb.inputs['Coat Weight'].default_value = coat
        sc.render.filepath = os.path.join(a.out, v, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', sc.render.filepath, flush=True)

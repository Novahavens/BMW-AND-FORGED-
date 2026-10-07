"""Pre-renders one car for the image configurator with Blender Cycles (pip install bpy).

Input is the GLB from export-scene.cjs (the body exactly as the engine places it, with stock
wheels hidden, plus one CAM_<view> camera per view). For each view it renders the paint four
times: gloss (clearcoat) and matte (frozen), each with white and black base colour. The browser
recolours any paint as  black + (white - black) * colour, so no paint ever needs a re-render.
Background is transparent; the floor is a shadow catcher.

  python3 scripts/prerender/render_car.py scene.glb public/renders/<carId> [--samples 32] [--width 1440]
"""
import argparse, json, math, os, re, sys
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
ap.add_argument('--two-render', action='store_true',
                help='render white AND black base colour separately (4 renders per view). Default for --studio dark: ONE render per '
                     'material set with Diffuse passes, black base derived as  B = W - DiffColor*(DiffDirect+DiffIndirect)*paintmask')
ap.add_argument('--seed', type=int, default=0, help='Cycles seed (for noise-floor tests)')
ap.add_argument('--wheels', default='', help="json from export-scene.cjs / wheelpos.cjs: [[x, y, z, radius, width] x4]; default <glb minus .glb>.wheels.json")
ap.add_argument('--threads', type=int, default=0, help='CPU threads for Cycles (0 = all)')
a = ap.parse_args()
DERIVE = a.studio == 'dark' and not a.two_render

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
# --studio dark. Light sizes are in car lengths (L) or metres; *_rad is the emitted radiance in Blender
# units (area-light power = radiance x area x pi), so the numbers mean the same whatever the car size.
# A white paint pass sees diffuse light = albedo x irradiance / pi, so rad values are chosen to keep that
# under ~0.85 on the body, while a 4-10% clear-coat reflection of a bright strip still reaches ~1 (crisp lines).
DARK = dict(
    exposure=0.0,            # view exposure, stops ('Standard' view transform stays linear)
    world_zenith=0.004, world_horizon=0.03,   # near-black room with a faint horizon glow (lower-body reflections)
    top_rad=2.1, top_w=1.0, top_l=0.75, top_h=3.0,   # big soft overhead, DIFFUSE only: width x length (xL), height above roof (m)
    topg_lo=0.25, topg_hi=1.1, topg_dir=1,   # overhead reflection panel (glossy only): radiance rear->front gradient lo..hi (dir -1 flips)
    strip_rad=3.0, strip_w=0.05, strip_l=2.4, strip_d=0.5, strip_h=1.0,   # high camera-side strip: width (xL), length (xL), offset (xL), height above roof (m)
    sh_rad=6.0, sh_w=0.16, sh_l=2.6, sh_x=1.0, sh_h=1.5, sh_both=1,   # ONE long thin bright shoulder strip along the car: width (m), length (xL), lateral (m), height above roof (m), both sides
    low_rad=4.0, low_w=0.05, low_d=0.7, low_h=0.35,   # low camera-side strip (sills / lower door): height above ground (m)
    rim_rad=6.0, rim_w=0.07, rim_l=0.8, rim_d=0.9, rim_h=1.8,    # end rim strips, high behind/in front, aimed at roof/bonnet
    panel_rad_top=1.3, panel_rad_bottom=0.15, panel_d=0.75, panel_len=1.3, panel_h=2.4,   # far-side gradient wall (emissive, reflection-only): doors/flanks reflect a soft light-to-dark gradient; d, len in xL, h in metres
    fill_rad=0.9, fill_d=0.75, fill_h=1.2,            # camera-side soft diffuse-only fill (flanks, lower body): radiance, offset (xL), height (m)
    end_rad=1.6, end_d=0.95,                          # soft diffuse-only fills ahead of / behind the car (grille, bumper, tail)
    cabin_rad=0.8,           # dim diffuse light inside the cabin so the interior reads through the glass
    far_strips=0,            # 1 also puts the high/low strips on the far side (they reflect strongly in the windscreen)
    strips_reflect_only=1,   # strips/rims are invisible to diffuse rays: they draw crisp reflections but do not light (wash out) the white pass or the floor
    glass_tint=0.22, glass_opaque=0, glass_rough=0.07, glass_ior=1.25,   # glass_rough / glass_ior: a little roughness and a lower IOR turn the strip reflections into soft dim ones
    coat_rough=0.05,         # paint clear-coat roughness: ~0.05 softens the bumpy source mesh's mirror reflections
    smooth_body=2,           # Corrective Smooth passes on the paint meshes before subdivision (0 = off; skipped for dense / no_subdiv meshes)   # glazing: base-colour tint of the transmissive glass; glass_opaque=1 = old flat-black fallback
    floor_albedo=0.08,       # the (invisible) floor still shows in reflections
)
for kv in filter(None, a.dark_set.split(',')):
    k, v = kv.split('='); DARK[k] = float(v)
fix = CAR_FIXES.get(a.car or os.path.basename(os.path.normpath(a.out)), {})
# Tyre stand-ins (--studio dark): where the live engine puts the wheels. The GLB has none (the engine draws them), so the
# stand-ins only cast the contact shadow, darken the arches and show in the paint's reflections.
_wj = a.wheels or re.sub(r'\.glb$', '', a.glb) + '.wheels.json'
WHEELS = json.load(open(_wj)) if os.path.exists(_wj) else fix.get('wheels')
if a.studio == 'dark' and not WHEELS: print('WARNING: no wheel positions (%s): no contact shadows or dark arches. Run export-scene.cjs or wheelpos.cjs.' % _wj)

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
pb.inputs['Coat Roughness'].default_value = DARK['coat_rough'] if a.studio == 'dark' else 0.02
if a.studio == 'dark':
    # The source models' cabins are 'paint' too. Seen through the glass they were body-coloured; a real interior is dark and
    # neutral, and it must not depend on the paint (the Diffuse passes do not see through glass, so the derived B could not
    # remove it). Rays that have been through glass (Light Path: Is Transmission Ray) get a dark leather/plastic instead.
    pnt = paint.node_tree; pout = pnt.nodes['Material Output']
    ib = pnt.nodes.new('ShaderNodeBsdfPrincipled'); ib.inputs['Base Color'].default_value = (0.04, 0.04, 0.045, 1); ib.inputs['Roughness'].default_value = 0.55
    lp = pnt.nodes.new('ShaderNodeLightPath'); mx = pnt.nodes.new('ShaderNodeMixShader')
    pnt.links.new(lp.outputs['Is Transmission Ray'], mx.inputs['Fac']); pnt.links.new(pb.outputs['BSDF'], mx.inputs[1])
    pnt.links.new(ib.outputs['BSDF'], mx.inputs[2]); pnt.links.new(mx.outputs['Shader'], pout.inputs['Surface'])
if DERIVE:   # marks the paint's pixels (filtered like colour, so anti-aliased edges get a fractional mask)
    aovn = paint.node_tree.nodes.new('ShaderNodeOutputAOV'); aovn.aov_name = 'paintmask'; aovn.inputs['Value'].default_value = 1.0

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
        if a.studio == 'dark' and DARK['smooth_body'] > 0 and not (a.no_subdiv or fix.get('no_subdiv')) and len(o.data.vertices) < 150000:   # irons out the bumpy source mesh before it is mirrored in the coat
            cs_ = o.modifiers.new('csmooth', 'CORRECTIVE_SMOOTH'); cs_.factor = 0.5; cs_.iterations = int(DARK['smooth_body'])
            cs_.smooth_type = 'SIMPLE'; cs_.rest_source = 'ORCO'
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
                        # dark-tinted, reflective glass with the cabin visible behind it (tint = share of light that gets through)
                        t = DARK['glass_tint']
                        b.inputs['Roughness'].default_value = DARK['glass_rough']; b.inputs['IOR'].default_value = DARK['glass_ior']
                        b.inputs['Base Color'].default_value = (t, t * 1.06, t * 1.14, 1)
                        if DARK['glass_opaque']:   # fallback: no cabin, flat dark glass
                            b.inputs['Transmission Weight'].default_value = 0.0
                            b.inputs['Base Color'].default_value = (0.012, 0.014, 0.017, 1)
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
    if WHEELS:
        rub = bpy.data.materials.new('rubber'); rub.use_nodes = True
        rb = rub.node_tree.nodes['Principled BSDF']
        rb.inputs['Base Color'].default_value = (0.015, 0.015, 0.016, 1); rb.inputs['Roughness'].default_value = 0.7
        for (x, y, z, r, wd) in WHEELS:
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
        aim(ob, target)
        return ob
    def refl_only(ob):   # seen by glossy (reflection) rays only
        if ob: ob.visible_diffuse = False; ob.visible_transmission = False
        return ob
    def diff_only(ob):   # lights diffusely only: never a reflection or something seen through the glass
        if ob: ob.visible_glossy = False; ob.visible_transmission = False
        return ob
    # Rays that have passed through the glass must not see the shadow-catcher floor: the bodies are hollow, so through the
    # windows it showed as transparent film (the page backdrop) with a wavy refracted edge.
    floor.visible_transmission = False
    def emissive_quad(name, corners, axis, v0, v1, lo, hi):
        """Reflection-only emissive quad whose radiance runs lo..hi (smoothstep) as corner . axis goes v0..v1."""
        me = bpy.data.meshes.new(name); me.from_pydata(corners, [], [(0, 1, 2, 3)])
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
        m = bpy.data.materials.new(name); m.use_nodes = True; t = m.node_tree; t.nodes.clear()
        em = t.nodes.new('ShaderNodeEmission'); out = t.nodes.new('ShaderNodeOutputMaterial')
        gp = t.nodes.new('ShaderNodeNewGeometry'); dt = t.nodes.new('ShaderNodeVectorMath'); dt.operation = 'DOT_PRODUCT'
        dt.inputs[1].default_value = tuple(axis)
        mr2 = t.nodes.new('ShaderNodeMapRange'); mr2.clamp = True; mr2.interpolation_type = 'SMOOTHSTEP'
        mr2.inputs['From Min'].default_value = v0; mr2.inputs['From Max'].default_value = v1
        mr2.inputs['To Min'].default_value = lo; mr2.inputs['To Max'].default_value = hi
        t.links.new(gp.outputs['Position'], dt.inputs[0]); t.links.new(dt.outputs['Value'], mr2.inputs['Value'])
        t.links.new(mr2.outputs[0], em.inputs['Strength']); t.links.new(em.outputs[0], out.inputs[0])
        ob.data.materials.append(m); ob.visible_camera = False; ob.visible_shadow = False; refl_only(ob)
        return ob
    # 1 big soft overhead, diffuse only: the form gradient on bonnet / roof / door tops (and the floor shadow)
    tsx, tsy = L * D['top_l'], L * D['top_w']   # sx runs along the car (rz turns it), sy across
    diff_only(softbox('top', (cx, cy, H + D['top_h']), (0, 0, rz), tsx, tsy, D['top_rad'] * tsx * tsy * math.pi))
    # 1b the same panel as seen in reflections: a rear->front radiance gradient, so a flat roof or bonnet shows a sheen, not a flat grey
    if D['topg_hi'] > 0:
        zq = H + D['top_h'] - 0.02; hl, hw = tsx / 2, tsy / 2
        lonax = (0, 1, 0) if long_y else (1, 0, 0)
        cor = [(cx + (-hw if long_y else -hl), cy + (-hl if long_y else -hw), zq), (cx + (hw if long_y else hl), cy + (-hl if long_y else -hw), zq),
               (cx + (hw if long_y else hl), cy + (hl if long_y else hw), zq), (cx + (-hw if long_y else -hl), cy + (hl if long_y else hw), zq)]
        c0 = (cy if long_y else cx)
        emissive_quad('top_refl', cor, lonax, c0 - hl, c0 + hl, D['topg_lo'] if D['topg_dir'] > 0 else D['topg_hi'], D['topg_hi'] if D['topg_dir'] > 0 else D['topg_lo'])
    # The five views all shoot from one side of the car, so the camera side gets the strips (crisp lines on the
    # bonnet, roof and shoulder) and the far side gets a tall soft gradient wall that the doors and flanks reflect.
    camv = [(c.matrix_world.translation.x if long_y else c.matrix_world.translation.y) for c in cams.values()]
    cs = 1 if sum(camv) >= 0 else -1
    # 2 long narrow strips: crisp highlight lines along the shoulder and roofline
    for sgn in ((cs, -cs) if D['far_strips'] else (cs,)):
        refl_only(strip(f'strip{sgn}', lat(sgn, 0, L * D['strip_d'], H + D['strip_h']), lat(sgn, 0, 0, H * 0.55),
                        L * D['strip_l'], L * D['strip_w'], D['strip_rad']))
        # 3 low strips for the sills
        refl_only(strip(f'low{sgn}', lat(sgn, 0, L * D['low_d'], D['low_h']), lat(sgn, 0, 0, H * 0.3),
                        L * D['strip_l'], L * D['low_w'], D['low_rad']))
    # 2b the shoulder strip: one long, thin, bright line parallel to the car, above the shoulder (see the camera-side mirror geometry:
    #    a crest with a 45 degree normal reflects what is straight above it, so one long strip draws one continuous line along door and shoulder)
    if D['sh_rad'] > 0:
        for sgn in ((cs, -cs) if D['sh_both'] else (cs,)):
            refl_only(strip(f'shoulder{sgn}', lat(sgn, 0, D['sh_x'], H + D['sh_h']), lat(sgn, 0, D['sh_x'] - 0.6, 0.0),
                            L * D['sh_l'], D['sh_w'], D['sh_rad']))
    # 3b far-side gradient wall: emissive quad, bright at the top fading to dark at the bottom, reflection-only
    if D['panel_rad_top'] > 0:
        dd = L * D['panel_d']; hl2 = L * D['panel_len'] / 2; zt = D['panel_h']
        corners = [lat(-cs, -hl2, dd, 0.05), lat(-cs, hl2, dd, 0.05), lat(-cs, hl2, dd, zt), lat(-cs, -hl2, dd, zt)]
        emissive_quad('panel', corners, (0, 0, 1), 0.05, zt, D['panel_rad_bottom'], D['panel_rad_top'])
    # 4 weak rim strips ahead of / behind the car: separate roof and bonnet from the dark background
    for sgn in (1, -1):
        refl_only(strip(f'rim{sgn}', lat(1, sgn * L * D['rim_d'], 0, H + D['rim_h']), lat(1, 0, 0, H * 0.8),
                        L * D['rim_l'], L * D['rim_w'], D['rim_rad']))
    # 5 soft diffuse-only fills: lift the flanks, lower body, grille and bumper that the overhead light cannot reach (no reflections)
    if D['fill_rad'] > 0:
        f = strip('fill_cam', lat(cs, 0, L * D['fill_d'], D['fill_h']), lat(cs, 0, 0, H * 0.4), L * 1.1, 1.8, D['fill_rad']); diff_only(f)
    if D['end_rad'] > 0:
        for sgn in (1, -1):
            f = strip(f'end{sgn}', lat(cs, sgn * L * D['end_d'], 0.0, 1.0), lat(cs, 0, 0, H * 0.4), 3.6, 1.6, D['end_rad']); diff_only(f)
    # 6 dim light inside the cabin: lights the seats / dash behind the (otherwise shadowing) glass
    if D['cabin_rad'] > 0:
        cab = softbox('cabin', (cx, cy + 0.15, 0.95), (0, 0, 0), 1.0, 1.8, D['cabin_rad'] * 1.8 * math.pi); diff_only(cab)

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
if a.threads: sc.render.threads_mode = 'FIXED'; sc.render.threads = a.threads
sc.cycles.seed = a.seed; sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = a.width; sc.render.resolution_y = round(a.width / 1.6)
sc.view_settings.view_transform = 'Standard'  # linear-safe: the browser mixes black/white passes
sc.view_settings.exposure = -1.6 if a.studio == 'default' else DARK['exposure']
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

PASSES = {  # name: (base value, metallic, roughness, coat)
    'gloss_w': (1.0, 0.0, 0.30, 1.0), 'gloss_b': (0.0, 0.0, 0.30, 1.0),
    'matte_w': (1.0, 0.0, 0.55, 0.0), 'matte_b': (0.0, 0.0, 0.55, 0.0),
}

def setup_derive():
    """One render gives W; the compositor derives B = W - DiffColor * (DiffDirect + DiffIndirect) * paintmask and writes both.
    Only the paint's diffuse depends on base colour (metallic 0; the coat and the dielectric specular layer do not), and the
    mask keeps every other material's diffuse in B. Inter-reflection between paint panels is the only (tiny) approximation."""
    vl = sc.view_layers[0]
    vl.use_pass_diffuse_direct = vl.use_pass_diffuse_indirect = vl.use_pass_diffuse_color = vl.use_pass_normal = True
    vl.cycles.denoising_store_passes = True   # gives the 'Noisy Image' pass
    aov = vl.aovs.add(); aov.name = 'paintmask'; aov.type = 'VALUE'
    ng = bpy.data.node_groups.new('derive', 'CompositorNodeTree'); sc.compositing_node_group = ng
    rl = ng.nodes.new('CompositorNodeRLayers'); rl.layer = vl.name
    def mix(op, x, y):
        m = ng.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = op; m.clamp_result = False
        m.inputs[0].default_value = 1.0   # Factor
        for nm, v in (('A', x), ('B', y)):
            sock = [i for i in m.inputs if i.name == nm and i.type == 'RGBA'][0]
            if isinstance(v, tuple): sock.default_value = v
            else: ng.links.new(v, sock)
        return [o for o in m.outputs if o.type == 'RGBA'][0]
    light = mix('ADD', rl.outputs['Diffuse Direct'], rl.outputs['Diffuse Indirect'])
    # The passes are averaged per pixel like colour, so at anti-aliased edges the paint's share is already in them: multiplying by the
    # fractional mask would count it twice (bright seams along every panel edge). The mask is used as a plain 'any paint here' switch.
    has_paint = ng.nodes.new('ShaderNodeMath'); has_paint.operation = 'GREATER_THAN'; has_paint.inputs[1].default_value = 0.01
    ng.links.new(rl.outputs['paintmask'], has_paint.inputs[0])
    diff = mix('MULTIPLY', mix('MULTIPLY', light, rl.outputs['Diffuse Color']), has_paint.outputs[0])
    # W is Cycles' own denoised Combined, exactly what the two-render path writes. B on the paint is what a black-base render would be:
    # the NOISY combined minus the (raw) paint diffuse, then denoised the same way (guides: normal, and an albedo that is black on the paint).
    # Denoising W and subtracting a smooth diffuse term instead would leave W's denoiser texture in B, which shows on dark paints.
    # Off the paint nothing is subtracted, so there B is simply the noisy W denoised again; alpha is W's (already clean).
    raw_b = mix('SUBTRACT', rl.outputs['Noisy Image'], diff)
    alb_b = mix('MULTIPLY', rl.outputs['Diffuse Color'], mix('SUBTRACT', (1, 1, 1, 1), has_paint.outputs[0]))
    dn = ng.nodes.new('CompositorNodeDenoise')
    ng.links.new(raw_b, dn.inputs['Image']); ng.links.new(alb_b, dn.inputs['Albedo']); ng.links.new(rl.outputs['Normal'], dn.inputs['Normal'])
    sa = ng.nodes.new('CompositorNodeSetAlpha'); sa.inputs['Type'].default_value = 'Replace Alpha'
    ng.links.new(dn.outputs['Image'], sa.inputs['Image']); ng.links.new(rl.outputs['Alpha'], sa.inputs['Alpha'])
    out_w = rl.outputs['Image']; out_b = sa.outputs['Image']
    fo = ng.nodes.new('CompositorNodeOutputFile')
    fo.format.media_type = 'IMAGE'; fo.format.file_format = 'PNG'; fo.format.color_mode = 'RGBA'; fo.format.color_depth = '8'
    fo.format.color_management = 'FOLLOW_SCENE'
    fo.file_output_items.clear()
    fo.file_output_items.new('RGBA', 'W'); fo.file_output_items.new('RGBA', 'B')
    if os.environ.get('DEBUG_PASSES'):
        for nm in ('mask', 'light', 'diffcol'): fo.file_output_items.new('RGBA', nm)
    ng.links.new(out_w, fo.inputs[0]); ng.links.new(out_b, fo.inputs[1])
    if os.environ.get('DEBUG_PASSES'):
        ng.links.new(mix('MULTIPLY', rl.outputs['paintmask'], (1, 1, 1, 1)), fo.inputs[2]); ng.links.new(light, fo.inputs[3]); ng.links.new(rl.outputs['Diffuse Color'], fo.inputs[4])
    return fo

if DERIVE:
    SETS = {'gloss': (0.30, 1.0), 'matte': (0.55, 0.0)}
    fo = setup_derive()
views = a.views.split(',') if a.views else list(cams)
for v in views:
    sc.camera = cams[v]
    os.makedirs(os.path.join(a.out, v), exist_ok=True)
    if DERIVE:
        for sname, (rough, coat) in SETS.items():
            if a.passes and not any(x.startswith(sname) for x in a.passes.split(',')): continue
            pb.inputs['Base Color'].default_value = (1, 1, 1, 1); pb.inputs['Metallic'].default_value = 0.0
            pb.inputs['Roughness'].default_value = rough; pb.inputs['Coat Weight'].default_value = coat
            fo.directory = os.path.join(a.out, v); fo.file_name = ''
            for it, nm in zip(fo.file_output_items, ('W', 'B')): it.name = f'{sname}_{nm.lower()}'
            bpy.ops.render.render(write_still=False)
            print('rendered', os.path.join(a.out, v, sname + '_[wb].png'), flush=True)
        continue
    for name, (base, met, rough, coat) in PASSES.items():
        if a.passes and name not in a.passes.split(','): continue
        pb.inputs['Base Color'].default_value = (base, base, base, 1)
        pb.inputs['Metallic'].default_value = met
        pb.inputs['Roughness'].default_value = rough
        pb.inputs['Coat Weight'].default_value = coat
        sc.render.filepath = os.path.join(a.out, v, name + '.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', sc.render.filepath, flush=True)

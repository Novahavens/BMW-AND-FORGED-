"""Builds a complete 3D rim (GLB) from a bar-face spec, to the "High poly Rims" template profile
(docs/rim-template/PROFILE.md). Blender as a Python module: pip install bpy.

  python3 scripts/rim3d/build_rim.py <spec.json|-> <out.glb> [--segments 384] [--bevel 0.012] [--shapes traced.json]
  ('-' = all defaults; with --shapes the fold comes from the trace)

With --shapes (from scripts/rim3d/trace-mask.cjs) the spoke face is the traced cut-out of the photo:
any spoke design, no measuring; the spec then only needs fold/hub and the optional keys below
(bars may be empty).

The spec is the same file scripts/render/make-bar-face.py reads (fold, mirror, hub, bars with
from/to as [radius, degrees] and width w; radii are fractions of the lip's outer radius = 1).
Extra optional keys used here only:
  "face_front": 0.24   front of the spoke plate (x, as a fraction of R; lip front is 0.446)
  "face_thick": 0.10   spoke plate thickness
  "dish": 0.10         how far the hub sits behind the spoke tips (concave face)
  "bolts": 5, "pcd": 0.20, "bolt_r": 0.035, "bore": 0.10
  "face_scale": 1.0       traced faces only: scale the outline about the centre (see below)
  "join": "round"         bar faces only: bars that share an end meet in a round knuckle, not overshooting ends
  "lip": "mono"|"two"|"three"   multi-piece rims get a separate polished lip, a shelf and bolts (30 / 40), as the engine's buildRimShell
  "nuts": true            five hex lug nuts on the hub pad (steel), as the engine's buildHub; with "bolts": 0, "bore": 0 (no holes)
  "cap": {"text": "FSA"}  engine-style centre cap: dark dome, thin gold ring, gold lettering (separate meshes cap / capring / captext)
  "dish_curve": "parabola"  traced faces: sink = dish * (1 - rho^2), rho = r / 0.916, exactly the engine's buildSpokeFace; with "subdivide": 0.03
                          (max edge in R) so the dish bends smoothly (engine-matched: face_front 0.408, face_thick 0.13, dish 0.137)
  "bevel": 0.012          edge rounding; "channel": 0.45  milled channel along each bar (fraction
  of its width, bars only), "channel_depth": 0.025
Output: axle along X, face toward +X (what CarConfiguratorEngine.mountRimModel expects with no
flip), two meshes (face, barrel), one material, smooth + weighted normals.
"""
import argparse, json, math, sys
import bpy, bmesh
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('spec'); ap.add_argument('out')
ap.add_argument('--segments', type=int, default=384)
ap.add_argument('--bevel', type=float, default=None, help='edge bevel width (default: spec "bevel" or 0.012)')
ap.add_argument('--shapes', help='traced outlines from scripts/rim3d/trace-mask.cjs: the face comes from these instead of the bars')
a = ap.parse_args()
spec = json.load(open(a.spec)) if a.spec != '-' else {}
if a.shapes and 'fold' not in spec: spec['fold'] = json.load(open(a.shapes)).get('symmetry', 5)
if a.bevel is None: a.bevel = spec.get('bevel', 0.012)
CHANNEL = spec.get('channel', 0); CHANNEL_DEPTH = spec.get('channel_depth', 0.025)
fold = spec['fold']; hub_r = spec.get('hub', 0.33); rot = spec.get('rotate', 0)
FF = spec.get('face_front', 0.24); FT = spec.get('face_thick', 0.10)
# Traced faces stay flat (the template's face is a flat plate; bending a curve-filled face kinks its long triangles)
DISH = spec.get('dish', 0.0 if a.shapes else 0.10)
LIP = spec.get('lip', 'mono'); NUTS = spec.get('nuts', False); CAP = spec.get('cap'); PARAB = spec.get('dish_curve') == 'parabola'; SUBDIV = spec.get('subdivide', 0)
NB = spec.get('bolts', 5); PCD = spec.get('pcd', 0.20); BR = spec.get('bolt_r', 0.035); BORE = spec.get('bore', 0.10)
FACE_R = 0.916      # spokes meet the lip here (make-bar-face convention)
WALL_IN = 0.90      # inner barrel wall radius
LIP_FRONT = 0.446   # template: lip front, barrel back (fractions of R)
BACK = -0.571

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
mat = bpy.data.materials.new('RimFinish')

def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    me.materials.append(mat)
    return ob

# Polar (r, deg clockwise from 12 o'clock when viewed from the front) -> (y, z): the face is the
# YZ plane, looked at from +X. Clockwise on the photo = clockwise seen from +X.
def yz(r, deg):
    t = math.radians(deg)
    return r * math.sin(t), r * math.cos(t)

def prism(points_yz, x0, x1):
    """Extrudes a convex polygon in the YZ plane from x0 to x1."""
    bm = bmesh.new()
    bot = [bm.verts.new((x0, y, z)) for y, z in points_yz]
    top = [bm.verts.new((x1, y, z)) for y, z in points_yz]
    bm.faces.new(bot[::-1]); bm.faces.new(top)
    n = len(bot)
    for i in range(n):
        bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def boolean(target, cutter, op):
    m = target.modifiers.new('b', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

# ---- spoke face: traced outlines (any design) or straight bars
x_back, x_front = FF - FT, FF
face = None
if a.shapes:
    traced = json.load(open(a.shapes))
    SC = 0.975  # traced radius 1 = the photo's rim circle; the engine puts it at 0.24/0.94 of lipOuter 0.262
    # "face_scale" (opt-in, default 1): grows the traced face about the centre, for photos whose
    # windows end well inside a wide step lip (FSA-09): the face then fills the lip instead of
    # leaving a wide flat flange; anything past the face disc is clipped as usual
    SC *= spec.get('face_scale', 1.0)
    cu = bpy.data.curves.new('face', 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = FT / 2
    for sh in traced['shapes']:
        for loop in [sh['outer']] + sh['holes']:
            sp = cu.splines.new('POLY'); sp.points.add(len(loop) - 1); sp.use_cyclic_u = True
            for pt, (px, py) in zip(sp.points, loop):
                pt.co = (px * SC, py * SC, 0, 1)
    ob = bpy.data.objects.new('face', cu); sc.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    face = bpy.context.object; face.data.materials.append(mat)
    # curve plane (x, y, extrude z) -> wheel: face in YZ, extruded along X
    face.rotation_euler = (0, math.radians(90), 0); face.location = (FF - FT / 2, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(face.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(face.data); bm.free()
else:
    bars = []
    for b in spec['bars']:
        bars.append(b)
        if spec.get('mirror', True) and abs(b['from'][1]) + abs(b['to'][1]) > 0:
            bars.append({**b, 'from': [b['from'][0], -b['from'][1]], 'to': [b['to'][0], -b['to'][1]]})
    channels = []
    # "join": "round" (opt-in): where one bar ends exactly where another starts (a bent blade drawn
    # as two bars), neither is extended past that point and a round knuckle fills the joint, so the
    # blade bends cleanly instead of showing the overshooting ends as a step
    JOIN = spec.get('join') == 'round'
    ends = [tuple(b['from']) for b in bars] + [tuple(b['to']) for b in bars]
    shared = lambda p: JOIN and ends.count(tuple(p)) > 1
    for k in range(fold):
        base = rot + k * 360 / fold
        for b in bars:
            p0 = Vector(yz(b['from'][0], b['from'][1] + base)); p1 = Vector(yz(b['to'][0], b['to'][1] + base))
            u = (p1 - p0).normalized(); nrm = Vector((-u.y, u.x))
            pa = p0 if shared(b['from']) else p0 - u * 0.25
            pb = p1 if shared(b['to']) else p1 + u * 0.12
            w0, w1 = b['w'] / 2, b.get('w_tip', b['w']) / 2
            quad = [pa + nrm * w0, pb + nrm * w1, pb - nrm * w1, pa - nrm * w0]
            ob = new_obj('bar', prism([(p.x, p.y) for p in quad], x_back, x_front))
            if face is None: face = ob
            else: boolean(face, ob, 'UNION')
            if shared(b['to']):
                ring = [(p1.x + w1 * math.cos(2 * math.pi * i / 48), p1.y + w1 * math.sin(2 * math.pi * i / 48)) for i in range(48)]
                boolean(face, new_obj('knuckle', prism(ring, x_back, x_front)), 'UNION')
            if CHANNEL > 0:  # the milled channel: a narrower bar, cut into the front face, hub to lip
                c0, c1 = p0 + u * 0.02, p1 - u * 0.04
                cw0, cw1 = w0 * CHANNEL, w1 * CHANNEL
                channels.append([c0 + nrm * cw0, c1 + nrm * cw1, c1 - nrm * cw1, c0 - nrm * cw0])
# hub pad (bar faces only: a traced mask already has its solid hub; a second pad in the same plane
# makes coplanar faces and the boolean crumples them)
if not a.shapes:
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=128, radius1=hub_r, radius2=hub_r, depth=FT)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(FF - FT / 2, 0, 0))
    boolean(face, new_obj('hub', bm), 'UNION')

# clip to the face disc (r <= 0.95: the plate runs a little into the lip wall)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=a.segments, radius1=0.95, radius2=0.95, depth=1.0)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
bmesh.ops.translate(bm, verts=bm.verts, vec=(FF - FT / 2, 0, 0))
boolean(face, new_obj('clip', bm), 'INTERSECT')
# centre bore and bolt holes
def cyl(r, depth, cx, cy, cz, seg=48):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(cx, cy, cz)); return new_obj('cut', bm)
if not a.shapes and CHANNEL > 0:
    for quad in channels:
        boolean(face, new_obj('channel', prism([(p.x, p.y) for p in quad], x_front - CHANNEL_DEPTH, x_front + 0.05)), 'DIFFERENCE')
if BORE > 0: boolean(face, cyl(BORE, 2, FF - FT / 2, 0, 0, 64), 'DIFFERENCE')
for i in range(NB):
    y, z = yz(PCD, i * 360 / NB + rot)
    boolean(face, cyl(BR, 2, FF - FT / 2, y, z), 'DIFFERENCE')

# concave dish: everything inside the face slopes back toward the hub
def dish_sink(r):
    if PARAB:
        rho = min(1.0, r / FACE_R)
        return DISH * (1 - rho * rho)
    t = min(1.0, max(0.0, (FACE_R - r) / (FACE_R - hub_r)))
    return DISH * (t ** 1.3)
if SUBDIV:  # long triangles bend badly under a dish: split every edge longer than SUBDIV (in R) first
    bm = bmesh.new(); bm.from_mesh(face.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(8):
        long_edges = [e for e in bm.edges if e.calc_length() > SUBDIV]
        if not long_edges: break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(face.data); bm.free()
me = face.data
for v in me.vertices:
    r = math.hypot(v.co.y, v.co.z)
    v.co.x -= dish_sink(r)

# bevel every edge of the face, then smooth
bev = face.modifiers.new('bevel', 'BEVEL'); bev.width = a.bevel; bev.segments = 2; bev.limit_method = 'ANGLE'
bev.angle_limit = math.radians(40); bev.harden_normals = True
bpy.context.view_layer.objects.active = face; bpy.ops.object.modifier_apply(modifier='bevel')
# flat front, rounded edges: smooth only across edges under 30 degrees (the bevel's own steps),
# so the spoke sides never blend into the face plate
bpy.ops.object.select_all(action='DESELECT'); face.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
face.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True
face.name = 'face'

# ---- barrel + lip: revolve a closed profile (r, x) around X
prof = [(WALL_IN, BACK + 0.07), (WALL_IN, FF - 0.02), (0.93, 0.30), (0.955, 0.40), (0.975, LIP_FRONT),
        (1.0, LIP_FRONT - 0.02), (1.0, 0.36), (0.97, 0.30), (0.97, BACK + 0.02), (0.93, BACK)]
bm = bmesh.new()
rings = []
for (r, x) in prof:
    rings.append([bm.verts.new((x, r * math.sin(2 * math.pi * i / a.segments), r * math.cos(2 * math.pi * i / a.segments))) for i in range(a.segments)])
n = len(prof)
for j in range(n):
    A, B = rings[j], rings[(j + 1) % n]
    for i in range(a.segments):
        bm.faces.new((A[i], A[(i + 1) % a.segments], B[(i + 1) % a.segments], B[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
barrel = new_obj('barrel', bm)
for p in barrel.data.polygons: p.use_smooth = True
barrel.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True

# ---- hub kit and multi-piece lip
extras = []
K = 1 / 0.262   # the engine's metres -> R (lipOuter 0.262 m = 1)

def revolve(prof, seg, name, cy=0.0, cz=0.0, smooth=True):
    """Closed lathe of a (radius, x) profile around the axle (through (cy, cz)); r = 0 points collapse to the axis."""
    bm = bmesh.new(); rings = []
    for r, x in prof:
        rings.append(bm.verts.new((x, cy, cz)) if r < 1e-9 else [bm.verts.new((x, cy + r * math.sin(2 * math.pi * i / seg), cz + r * math.cos(2 * math.pi * i / seg))) for i in range(seg)])
    for j in range(len(prof) - 1):
        A, B = rings[j], rings[j + 1]
        for i in range(seg):
            i2 = (i + 1) % seg
            if isinstance(A, list) and isinstance(B, list): bm.faces.new((A[i], A[i2], B[i2], B[i]))
            elif isinstance(A, list): bm.faces.new((A[i], A[i2], B))
            elif isinstance(B, list): bm.faces.new((A, B[i2], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm)
    for p in ob.data.polygons: p.use_smooth = smooth
    return ob

def hub_x(r): return FF - dish_sink(r)   # front of the dished face at radius r

if CAP is None:
    # old style: a plain disc in the bore, a little behind the dished hub face
    cap = cyl(BORE * 0.92, 0.035, FF - DISH - 0.03, 0, 0, 96); cap.name = 'cap'
    for p in cap.data.polygons: p.use_smooth = True
    cb = cap.modifiers.new('bevel', 'BEVEL'); cb.width = 0.006; cb.segments = 2
    bpy.context.view_layer.objects.active = cap; bpy.ops.object.modifier_apply(modifier='bevel')
    cap.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True
    extras.append(cap)
else:
    # the engine's cap (wheelKit.buildHub + capTexture): a low dome 69 mm wide and 9 mm high sitting 2 mm into the hub pad,
    # black with a thin gold ring at 0.42 of its width and gold lettering
    xb = hub_x(0) - 0.002 * K
    dome = [(0.0345, 0.0), (0.0335, 0.0035), (0.029, 0.0066), (0.018, 0.0085), (0.0, 0.009)]
    base = xb - 0.004
    extras.append(revolve([(0, base), (0.0345 * K, base)] + [(r * K, xb + h * K) for r, h in dome], 96, 'cap'))
    xtop = xb + 0.009 * K
    ring_r, ring_x = 0.42 * 0.069 * K, xb + 0.0066 * K
    circ = [(ring_r + 0.0032 * math.cos(t), ring_x + 0.0032 * math.sin(t)) for t in [2 * math.pi * k / 10 for k in range(10)]]
    extras.append(revolve([(r, x) for r, x in circ] + [circ[0]], 96, 'capring', smooth=True))
    txt = CAP.get('text', 'FSA')
    cu = bpy.data.curves.new('captext', 'FONT'); cu.body = txt; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.size = CAP.get('size', 0.072 if len(txt) <= 3 else 0.2 / (0.66 * len(txt))); cu.extrude = 0.003; cu.bevel_depth = 0.0004
    to = bpy.data.objects.new('captext', cu); sc.collection.objects.link(to)
    from mathutils import Matrix
    to.rotation_euler = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0))).to_euler(); to.location = (xtop - 0.001, 0, 0)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = to; to.select_set(True)
    bpy.ops.object.convert(target='MESH'); to = bpy.context.object; to.name = 'captext'
    to.data.materials.append(mat); extras.append(to)

if NUTS:
    pcd = 0.056 * K
    for i in range(5):
        y, z = yz(pcd, i * 72.0)
        xb = hub_x(pcd) - 0.003 * K
        body = [(0.0, 0.0), (0.0085, 0.0), (0.0105, 0.003), (0.0105, 0.016), (0.0092, 0.018), (0.0, 0.018)]
        extras.append(revolve([(r * K, xb + h * K) for r, h in body], 6, 'lugnut', y, z, smooth=False))
        top = [(0.0088, 0.0178), (0.0075, 0.0195), (0.0045, 0.021), (0.0, 0.0215)]
        extras.append(revolve([(0.0088 * K, xb + 0.0165 * K)] + [(r * K, xb + h * K) for r, h in top], 24, 'lugnut_dome', y, z))

if LIP != 'mono':
    # the engine's multi-piece lip: a polished outer lip, a ledge just inside the spoke ends and a ring of bolts on it
    pr = [(0.93, 0.30), (0.955, 0.40), (0.975, LIP_FRONT), (1.0, LIP_FRONT - 0.02), (1.0, 0.36), (0.97, 0.30)]
    eps = 0.0015
    lipo = revolve([(r + eps * (1 if r > 0.95 else 0.5), x + (eps if x > 0.39 else 0)) for r, x in pr], a.segments, 'lip')
    extras.append(lipo)
    ledge_x = FF - 0.004
    sh = [(0.885, ledge_x - 0.012), (0.935, ledge_x - 0.012), (0.935, ledge_x), (0.885, ledge_x), (0.885, ledge_x - 0.012)]
    extras.append(revolve(sh, 192, 'shelf', smooth=False))
    count = 40 if LIP == 'three' else 30; br = 0.899
    for i in range(count):
        t = 2 * math.pi * (i + 0.5) / count
        y, z = br * math.sin(t), br * math.cos(t)
        hb = [(0, 0), (0.0036 * K, 0), (0.0034 * K, 0.0024 * K), (0.0027 * K, 0.0032 * K), (0.0015 * K, 0.0038 * K), (0, 0.004 * K)]
        extras.append(revolve([(r, ledge_x + h) for r, h in hb], 6, 'bolt', y, z, smooth=False))

bpy.ops.object.select_all(action='DESELECT')
face.select_set(True); barrel.select_set(True)
for o in extras: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
tris = sum(len(p.vertices) - 2 for ob in [face, barrel] + extras if ob.type == 'MESH' for p in ob.data.polygons)
print(f'wrote {a.out}  triangles={tris}')

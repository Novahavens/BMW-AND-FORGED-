"""PROOF: pre-render the whole wheel assembly (rim + tyre + brake disc + caliper) in Blender Cycles as a transparent
image LAYER that registers pixel-exactly over the existing body render (public/renders/<car>/<view>/*.webp).

  python3 scripts/wheels/render_wheel_layer.py --glb /tmp/prerender/m4_g82.glb --car m4_g82 --rim fsa_06.glb \
      --view side --finish silver --size 20 --parts all --out OUT [--samples 96] [--threads 3] [--caliper '#0055b8']

How it works
 * The scene preamble of scripts/prerender/render_car.py is executed as is (same GLB, same `--studio dark` lights,
   same camera per view, same wheel positions from <glb>.wheels.json), so the light rig cannot drift from the bodies.
 * The tyre stand-ins of the body render are replaced by the real assembly, built to the dimensions of the live engine
   (services/wheelKit.ts: rimLayout, buildTyre, buildDisc, buildCaliper; fitment from data/configuratorData.ts).
 * The body is a HOLDOUT: camera rays see a hole (alpha 0, and it hides the far-side wheels), but shadow / reflection /
   GI rays shade it normally, so the arch occlusion, the car reflected in the rim and the colour bounce are right.
   The floor is hidden from the camera (the body render already has the floor shadow) but still lights and reflects.
 * --parts: all  = rim + tyre + brakes (the whole assembly layer, for the side-by-side with the live wheels)
            rim  = only the rim is visible to the camera (tyre/brakes still shadow and reflect): the REUSABLE layer
            under= tyre + disc + caliper visible, rim only shadows/reflects: the PER-CAR layer that sits under the rim layer
 * --caliper '#rrggbb' renders that colour; 'white' / 'black' render the base-colour pair that the browser can mix as
   black + (white - black) * colour, exactly as the body paint (the caliper is gloss paint under clear coat).
 * Only the wheel regions are rendered (Cycles border), saved as WebP with alpha: <name>.webp = tone-mapped final colour
   (exposure 1.6 + NeutralToneMapping, the maths of services/renderedBody.ts), <name>.raw.webp = the linear 'Standard'
   render like the body passes (for the caliper W/B recolour). <name>.json lists the crops.
"""
import argparse, json, math, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

ap = argparse.ArgumentParser()
ap.add_argument('--glb', required=True); ap.add_argument('--car', required=True); ap.add_argument('--rim', required=True)
ap.add_argument('--view', default='side'); ap.add_argument('--finish', default='silver')
ap.add_argument('--size', type=float, default=20, help='rim diameter in inches (19-22)')
ap.add_argument('--parts', choices=['all', 'rim', 'under'], default='all')
ap.add_argument('--caliper', default='#0055b8')
ap.add_argument('--out', required=True); ap.add_argument('--name', default='')
ap.add_argument('--samples', type=int, default=96); ap.add_argument('--threads', type=int, default=3)
ap.add_argument('--width', type=int, default=1440)
ap.add_argument('--paint-grey', type=float, default=0.18, help='linear grey of the (holdout) body for reflections / bounce')
ap.add_argument('--wheels', default='', help='wheel positions json (default <glb>.wheels.json)')
ap.add_argument('--spin', default='0,0,0,0', help='rim rotation about the axle per wheel (deg): FL,FR,RL,RR')
ap.add_argument('--only-wheel', default='', help='debug: only render the region of these wheel indexes, e.g. 0,2')
ap.add_argument('--no-text', action='store_true', help='skip the tyre sidewall text (faster previews)')
ap.add_argument('--save-blend', default='')
ap.add_argument('--wheel-fill', type=float, default=1.8, help='radiance of a soft fill light that lights ONLY the wheel parts (light linking), one per wheel on the camera side; 0 = off')
ap.add_argument('--fill-w', type=float, default=1.6); ap.add_argument('--fill-h', type=float, default=1.1)
ap.add_argument('--fill-d', type=float, default=1.5); ap.add_argument('--fill-up', type=float, default=0.5)
ap.add_argument('--meta-only', action='store_true', help='only write <out>/<view>/meta.json (wheel centres / radii in px) and exit')
ap.add_argument('--debug-tyre', action='store_true', help='light grey rubber, to check the lettering')
ap.add_argument('--rubber', type=float, default=0.09, help='linear albedo of the sidewall rubber')
args = ap.parse_args()
T0 = time.time()

# ---- 1. the car scene, exactly as the body renders (render_car.py up to its pass loop)
RC = os.path.join(ROOT, 'scripts', 'prerender', 'render_car.py')
_src = open(RC).read().split('\nPASSES = {')[0]
sys.argv = ['render_car.py', args.glb, '/tmp/_unused', '--car', args.car, '--studio', 'dark', '--samples', str(args.samples),
            '--width', str(args.width), '--threads', str(args.threads), '--two-render'] + (['--wheels', args.wheels] if args.wheels else [])
exec(compile(_src, RC, 'exec'), globals())      # defines bpy, bmesh, mathutils, sc, cams, meshes, floor, pb, WHEELS, ...
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from mathutils import Vector, Matrix, Euler
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'rim3d'))
import materials as rimmat

assert WHEELS, 'no wheel positions'
def wheel_projection(cam, S):
    """Per wheel: the tyre (centre plane) and the rim's lip-front circle in the frame, px: centre and radii. Used to place a layer on another car."""
    from bpy_extras.object_utils import world_to_camera_view as wc
    RX, RY = sc.render.resolution_x, sc.render.resolution_y
    out = []
    for idx, (wx, wy, wz, wr, ww) in enumerate(WHEELS):
        gs = wr / 0.35; sgn = 1 if wx > 0 else -1; tw = 0.265 if idx < 2 else 0.295
        def circ(cx, R):
            c0 = wc(sc, cam, Vector((cx, wy, wz))); c1 = wc(sc, cam, Vector((cx, wy, wz + R))); c2 = wc(sc, cam, Vector((cx, wy + R, wz)))
            return {'cx': round(c0.x * RX, 2), 'cy': round((1 - c0.y) * RY, 2), 'ry': round(abs(c1.y - c0.y) * RY, 2), 'rx': round(abs(c2.x - c0.x) * RX, 2)}
        d = circ(wx, wr); d['idx'] = idx
        d['face'] = circ(wx + sgn * (tw / 2 - 0.012) * gs, 0.26 * S * gs)     # the rim's lip front (what the rim layer is made of)
        out.append(d)
    return out
if args.meta_only:
    os.makedirs(os.path.join(args.out, args.view), exist_ok=True)
    json.dump({'car': args.car, 'view': args.view, 'wheels': wheel_projection(cams[args.view], args.size / 20.0)}, open(os.path.join(args.out, args.view, 'meta.json'), 'w'), indent=1)
    sys.exit(0)

for o in [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('Cylinder')]:   # the tyre stand-ins
    bpy.data.objects.remove(o, do_unlink=True)
g = args.paint_grey
pb.inputs['Base Color'].default_value = (g, g, g, 1); pb.inputs['Metallic'].default_value = 0.0
pb.inputs['Roughness'].default_value = 0.30; pb.inputs['Coat Weight'].default_value = 1.0
for o in meshes: o.is_holdout = True            # camera sees a hole; shadow/reflection/GI rays shade it normally
floor.is_shadow_catcher = False; floor.visible_camera = False   # the body render already has the floor shadow

# ---- 2. dimensions of the live engine (services/wheelKit.ts rimLayout / buildTyre ...), metres, wheel-local, +X = outward
S = args.size / 20.0
def rim_layout(front, s):
    tw = 0.265 if front else 0.295
    lipOuter = 0.262 * s; faceRadius = 0.24 * s; beadSeat = 0.254 * s
    rimWidth = tw - 0.03; lipX = tw / 2 - 0.012; faceEdgeX = lipX - 0.01
    dish = 0.036 if front else 0.058
    hubFrontX = faceEdgeX - dish; hubBackX = hubFrontX - 0.032 - 2 * 0.003 - 0.001
    return dict(tw=tw, lipOuter=lipOuter, faceRadius=faceRadius, beadSeat=beadSeat, rimWidth=rimWidth, lipX=lipX, faceEdgeX=faceEdgeX,
                hubBackX=hubBackX, discRadius=0.19 if front else 0.185, discThickness=0.036 if front else 0.028, discX=-0.014 if front else -0.008)

def srgb2lin(h):
    return rimmat.srgb_to_lin(h)

def new_mat(name, hexcol=None, lin=None, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.03, sheen=0.0, sheen_rough=0.5, sheen_tint=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    c = lin if lin is not None else srgb2lin(hexcol)
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = coat_rough
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen; b.inputs['Sheen Roughness'].default_value = sheen_rough
        if sheen_tint: b.inputs['Sheen Tint'].default_value = (*srgb2lin(sheen_tint), 1)
    return m, b

def mesh_obj(name, bm, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True, collection=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    for p in me.polygons: p.use_smooth = smooth
    ob.parent = parent; ob.location = loc; ob.rotation_euler = rot
    return ob

def lathe_bm(prof, seg, with_uv=True):
    """Closed lathe of an (r, x) profile around the axle +X. u = round the wheel, v = arc length along the profile."""
    bm = bmesh.new(); n = len(prof)
    s = [0.0]
    for j in range(1, n): s.append(s[-1] + math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]))
    tot = s[-1] or 1.0
    rings = []; vid = {}
    for j, (r, x) in enumerate(prof):
        ring = [bm.verts.new((x, r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
        for i, v in enumerate(ring): vid[v] = (j, i)
        rings.append(ring)
    uvl = bm.loops.layers.uv.new('UVMap') if with_uv else None
    for j in range(n - 1):
        A, B = rings[j], rings[j + 1]
        for i in range(seg):
            i2 = (i + 1) % seg
            f = bm.faces.new((A[i], A[i2], B[i2], B[i]))
            if uvl:
                for lp in f.loops:
                    jj, ii = vid[lp.vert]
                    u = ii / seg
                    if ii == 0 and i == seg - 1: u = 1.0
                    lp[uvl].uv = (u, s[jj] / tot)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def smooth_by_angle(ob, deg=35):
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg)); ob.select_set(False)

def np_image(name, arr, color=False):
    """arr: (h, w) or (h, w, 3) float 0..1, row 0 = texture v 0."""
    h, w = arr.shape[:2]
    if arr.ndim == 2: arr = np.stack([arr] * 3, -1)
    rgba = np.concatenate([arr, np.ones((h, w, 1))], -1).astype(np.float32)
    im = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False, is_data=not color)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    im.pixels.foreach_set(rgba.ravel()); im.pack()
    return im

def tex_node(nt, img, scale=(1, 1, 1), uv=True):
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.extension = 'REPEAT'
    nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    return t

def blur2(h, passes=1, wrapx=True):
    for _ in range(passes):
        l = np.roll(h, 1, 1) if wrapx else np.concatenate([h[:, :1], h[:, :-1]], 1)
        r = np.roll(h, -1, 1) if wrapx else np.concatenate([h[:, 1:], h[:, -1:]], 1)
        h = (l + 2 * h + r) / 4
        u = np.concatenate([h[:1], h[:-1]], 0); d = np.concatenate([h[1:], h[-1:]], 0)
        h = (u + 2 * h + d) / 4
    return h

# ---- generated maps (ports of treadNormalMap / sidewallSteps of wheelKit.ts, as height + roughness images)
def tread_height():
    W, H, pitches = 1024, 256, 7
    pitch = W / pitches
    x = np.arange(W)[None, :].astype(np.float64); v = (np.arange(H) / (H - 1))[:, None].astype(np.float64)
    val = np.ones((H, W))
    shoulder = (v < 0.17) | (v > 0.83)
    edge = np.where(v < 0.5, (0.17 - v) / 0.17, (v - 0.83) / 0.17)
    slant = np.where(v < 0.5, -1, 1) * 0.35 * pitch * np.clip(1 - edge, 0, 1) ** 1.5
    p = ((x + slant) % pitch + pitch) % pitch
    gw = pitch * (0.13 + 0.05 * edge)
    sh = np.ones((H, W)); sh = np.where(p < gw, 0.15 + 0.25 * (1 - edge), sh)
    q = ((x + slant + pitch / 2) % pitch + pitch) % pitch
    sh = np.where((q < 2.2) & (edge < 0.75), np.minimum(sh, 0.45), sh)
    along = x + (v - 0.5) * H * 0.55
    pr = ((along % (pitch / 2)) + pitch / 2) % (pitch / 2)
    ribpos = np.where(v < 0.5, (v - 0.17) / 0.33, (0.83 - v) / 0.33)
    rib = np.where((pr < 2.0) & (ribpos > 0.12), 0.55, 1.0)
    val = np.where(shoulder, sh, rib)
    return blur2(val, 2)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def sidewall_maps(label):
    W, H = 4096, 256
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    def font(px, bold=True):
        for f in ('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
            if os.path.exists(f): return ImageFont.truetype(f, px)
        return ImageFont.load_default()
    def write(text, x, y, px, spacing=0.06):
        ft = font(px); ws = [d.textlength(c, font=ft) * 0.82 + px * spacing for c in text]   # narrow-ish
        cx = x - sum(ws) / 2
        for c, w in zip(text, ws):
            d.text((cx, y), c, font=ft, fill=255, anchor='lm'); cx += w
    write(label, W * 0.25, H * 0.56, 92, 0.05)
    write('RADIAL  TUBELESS', W * 0.62, H * 0.62, 44, 0.12); write('EXTRA LOAD', W * 0.62, H * 0.42, 40, 0.12)
    write('MAX LOAD 850 KG (1874 LBS)  AT 340 KPA (50 PSI) MAX PRESS', W * 0.86, H * 0.66, 22, 0.06)
    write('TREADWEAR 300   TRACTION AA   TEMPERATURE A', W * 0.86, H * 0.5, 22, 0.06)
    write('DOT  XB 4T  3925', W * 0.05, H * 0.5, 28, 0.08)
    for x in (W * 0.12, W * 0.47, W * 0.95): d.polygon([(x - 14, H * 0.86), (x + 14, H * 0.86), (x, H * 0.95)], fill=255)
    letters = np.asarray(im).astype(np.float32) / 255
    v = (np.arange(H) / (H - 1))[:, None]
    band = smoothstep(0.26, 0.32, v) * (1 - smoothstep(0.76, 0.82, v))
    height = blur2(letters, 1) * 0.9 + band * 0.12
    rough = np.clip(0.62 + band * 0.28 - letters * band * 0.32, 0, 1)
    return height, rough

# ---- 3. parts
FIN = json.load(open(os.path.join(ROOT, 'scripts', 'rim3d', 'finishes.json')))
fin = FIN[args.finish]
cal_arg = args.caliper
cal_lin = (1.0,) * 3 if cal_arg == 'white' else ((0.0,) * 3 if cal_arg == 'black' else tuple(srgb2lin(cal_arg)))

MAT = {}
RUB = 0.5 if args.debug_tyre else args.rubber
rub, rb = new_mat('tyre_tread', lin=(RUB * 0.8,) * 3, rough=0.7, sheen=0.8, sheen_rough=0.5, sheen_tint='#8a8886')
MAT['tread'] = rub
sw, sb = new_mat('tyre_sidewall', lin=(RUB,) * 3, rough=0.6, sheen=0.8, sheen_rough=0.45, sheen_tint='#8a8886')
MAT['sidewall'] = sw
MAT['sidewall_in'] = new_mat('tyre_sidewall_in', lin=(RUB,) * 3, rough=0.7, sheen=0.6, sheen_rough=0.5)[0]
cal_m, cb = new_mat('caliper_paint', lin=cal_lin, metal=0.0, rough=0.32, coat=1.0, coat_rough=0.025)
MAT['caliper'] = cal_m
MAT['cal_window'] = new_mat('caliper_window', '#0b0b0c', rough=0.9)[0]
MAT['cal_cap'] = new_mat('bleed_cap', '#111112', rough=0.6)[0]
MAT['pad'] = new_mat('brake_pad', '#1b1b1c', metal=0.2, rough=0.85)[0]
MAT['pad_back'] = new_mat('pad_backing', '#6c6d70', metal=0.9, rough=0.45)[0]
MAT['steel'] = new_mat('lug_nut', '#9da2a8', metal=1.0, rough=0.18)[0]
MAT['hat'] = new_mat('brake_hat', '#26282b', metal=0.55, rough=0.34, coat=0.4, coat_rough=0.2)[0]
MAT['disc_edge'] = new_mat('brake_disc_edge', '#4b4846', metal=0.8, rough=0.75)[0]
MAT['decal'] = new_mat('caliper_decal', '#f2f2f2', rough=0.4)[0]

# tread / sidewall image textures
_th = tread_height()
_t_img = np_image('tread_h', _th.astype(np.float32))
nt = MAT['tread'].node_tree; t = tex_node(nt, _t_img, (12, 1, 1))
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.9; bump.inputs['Distance'].default_value = 0.004
nt.links.new(t.outputs['Color'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], rb.inputs['Normal'])
LABELS = {}
def sidewall_material(label):
    if label in LABELS: return LABELS[label]
    m, b = new_mat('tyre_sidewall_' + label, lin=(RUB,) * 3, rough=0.6, sheen=0.8, sheen_rough=0.45, sheen_tint='#8a8886')
    if not args.no_text:
        h, r = sidewall_maps(label)
        nt = m.node_tree
        ti = tex_node(nt, np_image('sw_h_' + label, h.astype(np.float32)), (-2, -1, 1)); tr = tex_node(nt, np_image('sw_r_' + label, r.astype(np.float32)), (-2, -1, 1))
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 1.0; bp.inputs['Distance'].default_value = 0.0015
        nt.links.new(ti.outputs['Color'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
        nt.links.new(tr.outputs['Color'], b.inputs['Roughness'])
    nn = m.node_tree.nodes.new('ShaderNodeTexNoise'); nn.inputs['Scale'].default_value = 900; nn.inputs['Detail'].default_value = 3
    m.node_tree.links.new(m.node_tree.nodes.new('ShaderNodeTexCoord').outputs['Object'], nn.inputs['Vector'])
    if args.no_text: bq = m.node_tree.nodes.new('ShaderNodeBump'); bq.inputs['Strength'].default_value = 0.15; bq.inputs['Distance'].default_value = 0.0003; m.node_tree.links.new(nn.outputs['Fac'], bq.inputs['Height']); m.node_tree.links.new(bq.outputs['Normal'], b.inputs['Normal'])
    LABELS[label] = m
    return m

def cubic(p0, p1, p2, p3, n):
    out = []
    for i in range(1, n + 1):
        t = i / n; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; e = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
    return out

def build_tyre(parent, front, s, R=0.35):
    L = rim_layout(front, s); half = L['tw'] / 2
    shoulderR = 0.024; crown = 0.004; segs = 192
    treadHalf = half - 0.006
    crownR = lambda x: R - crown * (x / treadHalf) ** 2
    sCx = -(treadHalf - shoulderR); sCr = R - shoulderR - crown * 0.8
    tread = []
    for i in range(9):
        t = (i / 8) * (math.pi / 2); tread.append((sCr + math.sin(t) * shoulderR, sCx - math.cos(t) * shoulderR))
    grooves = [f * (treadHalf - shoulderR) for f in (-0.62, -0.22, 0.22, 0.62)]
    gw = L['tw'] * 0.04; gd = 0.0075
    xs = [sCx + ((-sCx * 2) * k) / 40 for k in range(41)]
    in_groove = lambda x: any(abs(x - gg) < gw / 2 + 0.0015 for gg in grooves)
    lastX = sCx
    for gg in grooves:
        for x in xs:
            if x > lastX + 1e-6 and x < gg - gw / 2 - 0.0015 and not in_groove(x): tread.append((crownR(x), x))
        e0, e1 = gg - gw / 2, gg + gw / 2
        tread += [(crownR(e0 - 0.0015), e0 - 0.0015), (crownR(e0) - 0.0012, e0), (crownR(e0) - gd, e0 + 0.0012),
                  (crownR(e1) - gd, e1 - 0.0012), (crownR(e1) - 0.0012, e1), (crownR(e1 + 0.0015), e1 + 0.0015)]
        lastX = e1 + 0.0015
    for x in xs:
        if x > lastX + 1e-6 and x < -sCx - 1e-6: tread.append((crownR(x), x))
    for i in range(9):
        t = (math.pi / 2) * (1 - i / 8); tread.append((sCr + math.sin(t) * shoulderR, -sCx + math.cos(t) * shoulderR))
    def sidewall(sign):
        startR, startX = sCr, sign * treadHalf
        bulgeR = L['beadSeat'] + (R - L['beadSeat']) * 0.52; ribR = L['lipOuter'] + 0.007
        flangeX = L['lipX'] if sign == 1 else L['rimWidth'] / 2 + 0.003
        pts = [(startR, startX)]
        pts += cubic((startR, startX), (startR - 0.012, sign * (half + 0.0005)), (bulgeR + 0.02, sign * half), (bulgeR, sign * half), 10)
        pts += cubic((bulgeR, sign * half), (bulgeR - 0.02, sign * half), (ribR + 0.012, sign * (half - 0.004)), (ribR + 0.004, sign * (half - 0.002)), 8)
        pts += [(ribR, sign * (half - 0.0015)), (ribR - 0.004, sign * (half - 0.004))]
        pts += cubic((ribR - 0.004, sign * (half - 0.004)), (ribR - 0.007, sign * (half - 0.008)), (L['lipOuter'] + 0.001, sign * (flangeX - 0.002)), (L['lipOuter'] - 0.003, sign * (flangeX - 0.006)), 6)
        return pts[::-1]
    label = f"{round(L['tw'] * 1000 / 5) * 5}/{round(((R - 0.254 * s) * 1000 / (round(L['tw'] * 1000 / 5) * 5)) * 20) * 5} ZR{round(20 * s)} {'98' if front else '102'}Y XL"
    objs = []
    o = mesh_obj('tyre_tread', lathe_bm(tread, segs), MAT['tread'], parent); smooth_by_angle(o, 40); objs.append(o)
    o = mesh_obj('tyre_side_out', lathe_bm(sidewall(1), segs), sidewall_material(label), parent); smooth_by_angle(o, 50); objs.append(o)
    o = mesh_obj('tyre_side_in', lathe_bm(sidewall(-1), segs), MAT['sidewall_in'], parent); smooth_by_angle(o, 50); objs.append(o)
    return objs, label

def kidney_pts(r0, r1, b0, b1, n=24):
    """Outline of the engine's kidney (outer arc, rounded end, inner arc, rounded end) in the shape plane."""
    mr, er = (r0 + r1) / 2, (r1 - r0) / 2
    pts = [(math.cos(b0 + (b1 - b0) * i / n) * r1, math.sin(b0 + (b1 - b0) * i / n) * r1) for i in range(n + 1)]
    cx, cy = math.cos(b1) * mr, math.sin(b1) * mr
    pts += [(cx + math.cos(b1 + math.pi * i / 12) * er, cy + math.sin(b1 + math.pi * i / 12) * er) for i in range(1, 12)]
    pts += [(math.cos(b1 + (b0 - b1) * i / n) * r0, math.sin(b1 + (b0 - b1) * i / n) * r0) for i in range(n + 1)]
    cx, cy = math.cos(b0) * mr, math.sin(b0) * mr
    pts += [(cx + math.cos(b0 + math.pi + math.pi * i / 12) * er, cy + math.sin(b0 + math.pi + math.pi * i / 12) * er) for i in range(1, 12)]
    return pts

def prism_xyz(pts, z0, z1, to3):
    """Extrudes a convex-ish 2D outline (shape plane) from z0 to z1; to3(sx, sy, z) -> wheel-local xyz."""
    bm = bmesh.new()
    a = [bm.verts.new(to3(x, y, z0)) for x, y in pts]; b = [bm.verts.new(to3(x, y, z1)) for x, y in pts]
    n = len(pts)
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def bevel(ob, width, segs=3, angle=35):
    m = ob.modifiers.new('bev', 'BEVEL'); m.width = width; m.segments = segs; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    m.harden_normals = False
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name); ob.select_set(False)

def build_caliper(parent, front, is_right, s):
    L = rim_layout(front, s); Rd = L['discRadius']; rIn = Rd - 0.066; rOut = Rd + 0.024
    span = math.radians(84 if front else 70); halfW = L['discThickness'] / 2 + (0.038 if front else 0.032)
    a0, a1 = math.pi / 2 - span / 2, math.pi / 2 + span / 2
    at = lambda f: a0 + (a1 - a0) * f
    # shape plane (sx, sy) -> wheel-local (x = extrusion, y = sy, z = -sx)  (the engine's rotateY(pi/2))
    to3 = lambda sx, sy, z: (z, sy, -sx)
    root = bpy.data.objects.new('caliper', None); sc.collection.objects.link(root); root.parent = parent
    root.location = (L['discX'], 0, 0); root.rotation_euler = ((-1 if is_right else 1) * math.radians(48), 0, 0)
    objs = []
    bev = 0.007
    o = mesh_obj('cal_body', prism_xyz(kidney_pts(rIn, rOut, a0, a1), -halfW, halfW, to3), MAT['caliper'], root); bevel(o, bev, 4); objs.append(o)
    o = mesh_obj('cal_face', prism_xyz(kidney_pts(rIn + 0.011, rOut - 0.012, a0 + 0.05, a1 - 0.05), halfW - 0.001, halfW + 0.003, to3), MAT['caliper'], root); bevel(o, 0.0025, 3); objs.append(o)
    # decal plate with the white M stripes
    dp = kidney_pts(rIn + 0.016, rOut - 0.017, at(0.12), at(0.88))
    bm = bmesh.new(); vs = [bm.verts.new(to3(x, y, halfW + 0.0052)) for x, y in dp]
    try: bm.faces.new(vs[::-1])
    except ValueError: pass
    r0, r1, b0, b1 = rIn + 0.016, rOut - 0.017, at(0.12), at(0.88)
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for lp in f.loops:
            x, y, z = lp.vert.co; sx, sy = -z, y
            ang = math.atan2(sy, sx); rr = math.hypot(sx, sy)
            lp[uvl].uv = (1 - (b1 - ang) / (b1 - b0), (rr - r0) / (r1 - r0))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    dm = bpy.data.materials.new('caliper_decal'); dm.use_nodes = True; nt = dm.node_tree; db = nt.nodes['Principled BSDF']
    im = decal_image()
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = im
    nt.links.new(ti.outputs['Color'], db.inputs['Base Color']); nt.links.new(ti.outputs['Alpha'], db.inputs['Alpha'])
    db.inputs['Roughness'].default_value = 0.4
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        if f.normal.x < 0: f.normal_flip()
    o = mesh_obj('cal_decal', bm, dm, root, smooth=False); objs.append(o)
    # pad window: a dark recess on the radial top
    winSpan = (a1 - a0) * 0.42; w0, w1 = math.pi / 2 - winSpan / 2, math.pi / 2 + winSpan / 2
    ri, ro = rOut - 0.004, rOut + 0.0008
    wp = [(math.cos(w0 + (w1 - w0) * i / 16) * ro, math.sin(w0 + (w1 - w0) * i / 16) * ro) for i in range(17)] + \
         [(math.cos(w1 + (w0 - w1) * i / 16) * ri, math.sin(w1 + (w0 - w1) * i / 16) * ri) for i in range(17)]
    o = mesh_obj('cal_window', prism_xyz(wp, -halfW * 0.7, halfW * 0.7, to3), MAT['cal_window'], root, smooth=False); objs.append(o)
    # bridge bolts and bleed nipples
    def cyl(r0_, r1_, depth, seg=6):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0_, radius2=r1_, depth=depth); return bm
    rMid = (rIn + rOut) / 2 - 0.004
    for f in (0.06, 0.94):
        a = at(f); px, py = math.cos(a) * (rMid + 0.004), math.sin(a) * (rMid + 0.004)
        bm = cyl(0.0062, 0.0062, 0.006)   # axis Z in the shape frame -> extrusion axis
        for v in bm.verts: v.co = Vector(to3(px + v.co.x, py + v.co.y, halfW + 0.003 + v.co.z))
        o = mesh_obj('cal_bolt', bm, MAT['steel'], root, smooth=False); objs.append(o)
    def rad_cyl(r_bot, r_top, depth, seg, a, rr, zc):
        """Cylinder along the radial direction at angle a (bottom at radius rr), centred at extrusion depth zc."""
        bm = cyl(r_bot, r_top, depth, seg); d = Vector((math.cos(a), math.sin(a))); tg = Vector((-math.sin(a), math.cos(a)))
        for v in bm.verts:
            q = d * (rr + depth / 2 + v.co.z) + tg * v.co.x
            v.co = Vector(to3(q.x, q.y, zc + v.co.y))
        return bm
    for f in (0.2, 0.8):
        a = at(f)
        o = mesh_obj('cal_nipple', rad_cyl(0.0034, 0.0026, 0.006, 6, a, rOut + 0.0, halfW * 0.35), MAT['steel'], root, smooth=False); objs.append(o)
        o = mesh_obj('cal_cap', rad_cyl(0.0036, 0.0034, 0.006, 12, a, rOut + 0.0045, halfW * 0.35), MAT['cal_cap'], root, smooth=True); objs.append(o)
    # pads and backing plates either side of the disc
    t = L['discThickness']
    for z0, z1, mname in ((t / 2 + 0.0005, t / 2 + 0.0115, 'pad'), (-t / 2 - 0.0115, -t / 2 - 0.0005, 'pad'), (t / 2 + 0.0115, t / 2 + 0.0155, 'pad_back'), (-t / 2 - 0.0155, -t / 2 - 0.0115, 'pad_back')):
        pp = kidney_pts(Rd - 0.06, Rd - 0.003, a0 + 0.08, a1 - 0.08) if mname == 'pad' else kidney_pts(Rd - 0.062, Rd + 0.006, a0 + 0.07, a1 - 0.07)
        o = mesh_obj('cal_' + mname, prism_xyz(pp, z0, z1, to3), MAT[mname], root, smooth=False); objs.append(o)
    return root, objs

def decal_image():
    # white italic M with the three BMW M stripes, on transparent (ported in spirit from caliperDecalTexture)
    W, H = 1024, 256
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, c in enumerate(((0x81, 0xc4, 0xff), (0x1c, 0x69, 0xd4), (0xe7, 0x22, 0x2a))):
        d.polygon([(70 + i * 46 + 70, 40), (70 + i * 46 + 105, 40), (70 + i * 46 + 35, 216), (70 + i * 46, 216)], fill=(*c, 255))
    ft = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 190)
    d.text((420, 128), 'M', font=ft, fill=(255, 255, 255, 255), anchor='lm')
    d.text((620, 150), 'BMW', font=ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 90), fill=(255, 255, 255, 255), anchor='lm')
    arr = np.asarray(im).astype(np.float32) / 255
    arr = arr[::-1]    # texture row 0 = v 0
    imb = bpy.data.images.new('decal', W, H, alpha=True)
    imb.pixels.foreach_set(arr.ravel()); imb.alpha_mode = 'STRAIGHT'; imb.pack()
    return imb

def build_disc(parent, front):
    L = rim_layout(front, 1.0); Rd = L['discRadius']; Ri = Rd * 0.63; t = L['discThickness']; plate = t * 0.3
    objs = []
    # disc material: cast iron with concentric machining (object-space radius -> sin bump), radial anisotropy
    dm = bpy.data.materials.new('brake_disc'); dm.use_nodes = True; nt = dm.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*(np.array(srgb2lin('#a19f9b')) * 0.55), 1); b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.42
    b.inputs['Anisotropic'].default_value = 0.8
    tg = nt.nodes.new('ShaderNodeTangent'); tg.direction_type = 'RADIAL'; tg.axis = 'X'; nt.links.new(tg.outputs['Tangent'], b.inputs['Tangent'])
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    def mathn(op, a_=None, b_=None):
        m = nt.nodes.new('ShaderNodeMath'); m.operation = op
        if a_ is not None: m.inputs[0].default_value = a_
        if b_ is not None: m.inputs[1].default_value = b_
        return m
    yy = mathn('MULTIPLY'); nt.links.new(sep.outputs['Y'], yy.inputs[0]); nt.links.new(sep.outputs['Y'], yy.inputs[1])
    zz = mathn('MULTIPLY'); nt.links.new(sep.outputs['Z'], zz.inputs[0]); nt.links.new(sep.outputs['Z'], zz.inputs[1])
    ad = mathn('ADD'); nt.links.new(yy.outputs[0], ad.inputs[0]); nt.links.new(zz.outputs[0], ad.inputs[1])
    sq = mathn('SQRT'); nt.links.new(ad.outputs[0], sq.inputs[0])
    rn = mathn('DIVIDE', None, Rd); nt.links.new(sq.outputs[0], rn.inputs[0])
    w1 = mathn('MULTIPLY', None, 2 * math.pi * 95); nt.links.new(rn.outputs[0], w1.inputs[0])
    s1 = mathn('SINE'); nt.links.new(w1.outputs[0], s1.inputs[0])
    w2 = mathn('MULTIPLY', None, 2 * math.pi * 23); nt.links.new(rn.outputs[0], w2.inputs[0])
    s2 = mathn('SINE'); nt.links.new(w2.outputs[0], s2.inputs[0])
    hh = mathn('MULTIPLY_ADD', None, 0.3); nt.links.new(s1.outputs[0], hh.inputs[0]); hh.inputs[2].default_value = 0.5
    h2 = mathn('MULTIPLY_ADD', None, 0.2); nt.links.new(s2.outputs[0], h2.inputs[0]); nt.links.new(hh.outputs[0], h2.inputs[2])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.35; bp.inputs['Distance'].default_value = 0.0006
    nt.links.new(h2.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    # one friction plate: ring with three staggered rows of drillings, then duplicated for the inner plate
    bm = bmesh.new(); seg = 360
    outer = [bm.verts.new((0, Rd * math.cos(2 * math.pi * i / seg), Rd * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
    outer2 = [bm.verts.new((plate, Rd * math.cos(2 * math.pi * i / seg), Rd * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
    inner = [bm.verts.new((0, Ri * math.cos(2 * math.pi * i / seg), Ri * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
    inner2 = [bm.verts.new((plate, Ri * math.cos(2 * math.pi * i / seg), Ri * math.sin(2 * math.pi * i / seg))) for i in range(seg)]
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((outer[i], outer[j], outer2[j], outer2[i]))        # rim of the disc
        bm.faces.new((inner[j], inner[i], inner2[i], inner2[j]))        # bore
        bm.faces.new((outer2[i], outer2[j], inner2[j], inner2[i]))      # outer face (+X)
        bm.faces.new((outer[j], outer[i], inner[i], inner[j]))          # back face
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    pl = mesh_obj('disc_plate', bm, dm, parent, loc=(L['discX'] + t / 2 - plate, 0, 0), smooth=False)
    # drillings: boolean with a cutter of small cylinders
    cb = bmesh.new()
    for ri, f in enumerate((0.73, 0.82, 0.91)):
        for k in range(24):
            a = ((k + ri * 0.33) / 24) * 2 * math.pi + ri * 0.08; r = Rd * f
            tmp = bmesh.new(); bmesh.ops.create_cone(tmp, cap_ends=True, segments=14, radius1=0.0034, radius2=0.0034, depth=plate * 3)
            for v in tmp.verts: v.co = Vector((v.co.z + plate / 2, r * math.cos(a) + v.co.x, r * math.sin(a) + v.co.y))
            vm = {}
            for v in tmp.verts: vm[v] = cb.verts.new(v.co)
            for fc in tmp.faces: cb.faces.new([vm[v] for v in fc.verts])
            tmp.free()
    cut = mesh_obj('cutter', cb, None, parent)
    mod = pl.modifiers.new('drill', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = cut; mod.solver = 'EXACT'
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = pl; pl.select_set(True); bpy.ops.object.modifier_apply(modifier=mod.name); pl.select_set(False)
    bpy.data.objects.remove(cut, do_unlink=True)
    pl2 = bpy.data.objects.new('disc_plate_in', pl.data); sc.collection.objects.link(pl2); pl2.parent = parent; pl2.location = (L['discX'] - t / 2, 0, 0)
    objs += [pl, pl2]
    # vanes
    vb = bmesh.new()
    for k in range(36):
        a = k / 36 * 2 * math.pi
        tmp = bmesh.new(); bmesh.ops.create_cube(tmp, size=1.0)
        for v in tmp.verts:
            x, y, z = v.co.x * (t - 2 * plate), v.co.y * 0.004, v.co.z * (Rd - Ri - 0.004)
            # curved vanes read as angled at the edge: rotate about X by 0.35, move out, then round the axle
            yb = y * math.cos(0.35) - z * math.sin(0.35); zb = y * math.sin(0.35) + z * math.cos(0.35) + (Rd + Ri) / 2
            v.co = Vector((x, yb * math.cos(a) - zb * math.sin(a), yb * math.sin(a) + zb * math.cos(a)))
        vm = {}
        for v in tmp.verts: vm[v] = vb.verts.new(v.co)
        for fc in tmp.faces: vb.faces.new([vm[v] for v in fc.verts])
        tmp.free()
    objs.append(mesh_obj('disc_vanes', vb, MAT['disc_edge'], parent, loc=(L['discX'], 0, 0), smooth=False))
    # hat
    hatDepth = L['hubBackX'] - (L['discX'] + t / 2)
    hp = [(Ri + 0.004, t / 2 - 0.002), (Ri - 0.004, t / 2), (0.098, t / 2 + 0.004), (0.094, t / 2 + hatDepth * 0.6), (0.092, t / 2 + hatDepth - 0.003), (0.088, t / 2 + hatDepth), (0.033, t / 2 + hatDepth)]
    o = mesh_obj('disc_hat', lathe_bm(hp, 64, False), MAT['hat'], parent, loc=(L['discX'], 0, 0)); smooth_by_angle(o, 40); objs.append(o)
    # bobbins
    bb = bmesh.new()
    for k in range(10):
        a = k / 10 * 2 * math.pi
        tmp = bmesh.new(); bmesh.ops.create_cone(tmp, cap_ends=True, segments=10, radius1=0.0055, radius2=0.0055, depth=t * 0.42)
        for v in tmp.verts: v.co = Vector((v.co.z + t / 2 - t * 0.0, (Ri + 0.001) * math.cos(a) + v.co.x, (Ri + 0.001) * math.sin(a) + v.co.y))
        vm = {}
        for v in tmp.verts: vm[v] = bb.verts.new(v.co)
        for fc in tmp.faces: bb.faces.new([vm[v] for v in fc.verts])
        tmp.free()
    objs.append(mesh_obj('disc_bobbins', bb, MAT['steel'], parent, loc=(L['discX'] - t / 2, 0, 0), smooth=False))
    return objs

# rim: the owner-approved build_rim.py GLB with the finish materials of turntable.py
def load_rim():
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=args.rim)
    new = [o for o in bpy.data.objects if o not in before]
    objs = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH': o.parent = None
    return objs, [o for o in new if o.type != 'MESH']
rim_tpl, rim_junk = load_rim()
for o in rim_tpl: o.hide_render = True   # templates only; each wheel gets copies
def fixed_material(name, hex_, metal, rough, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb2lin(hex_), 1); b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough; b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.05
    return m
fixed = {}
if any(o.name.startswith('captext') for o in rim_tpl):
    fixed['cap'] = fixed_material('cap_dark', '#161719', 0.35, 0.28, 1.0)
    fixed['capring'] = fixed['captext'] = fixed_material('cap_gold', '#CF9F52', 1.0, 0.3, 0.3)
if any(o.name.startswith('lugnut') for o in rim_tpl): fixed['lugnut'] = fixed_material('lugnut', '#9da2a8', 1.0, 0.18)
if any(o.name.startswith('lip') for o in rim_tpl):
    fixed['lip'] = fixed['shelf'] = fixed_material('lip_polished', '#eceef0', 1.0, 0.06, 1.0)
    fixed['bolt'] = fixed_material('bolt', '#b9bdc3', 1.0, 0.22)
m_face = rimmat.make(fin); m_barrel = rimmat.make(fin, 'barrel')
def part_material(o):
    n = o.name.split('.')[0]
    for key in ('captext', 'capring', 'cap', 'lugnut', 'lip', 'shelf', 'bolt'):
        if n.startswith(key) and key in fixed: return fixed[key]
    return m_barrel if o.name.startswith('barrel') else m_face
for o in rim_tpl:
    for p in o.data.polygons: p.use_smooth = True
    if o.name.startswith('face'):   # as turntable.py --resmooth --weighted (large flat traced face: no streaky reflections)
        for x in bpy.context.selected_objects: x.select_set(False)
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.mesh.customdata_custom_splitnormals_clear(); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30)); o.select_set(False)
        wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.mode = 'FACE_AREA'; wn.keep_sharp = True
    o.data.materials.clear(); o.data.materials.append(part_material(o))

def mount_rim(parent, front, s, spin_deg):
    """The engine's mountRimModel: the rim's front (the lip, 0.446 R) at the tyre's lipX, scaled to the 20" base x size."""
    L = rim_layout(front, s)
    spinner = bpy.data.objects.new('spin', None); sc.collection.objects.link(spinner); spinner.parent = parent
    spinner.rotation_euler = (math.radians(spin_deg), 0, 0)
    holder = bpy.data.objects.new('rim', None); sc.collection.objects.link(holder); holder.parent = spinner
    Rm = 0.26 * s
    holder.rotation_euler = (-math.pi / 2, 0, 0)          # build_rim frame (z up) -> wheel-local frame (y up)
    holder.scale = (Rm, Rm, Rm); holder.location = (L['lipX'] - 0.446 * Rm, 0, 0)
    out = []
    for o in rim_tpl:
        c = o.copy(); c.data = o.data; sc.collection.objects.link(c); c.parent = holder; c.hide_render = False
        for mod in c.modifiers: pass
        out.append(c)
    return out

# ---- 4. assemble the four wheels
rim_o, tyre_o, brake_o = [], [], []
spins = [float(x) for x in args.spin.split(',')]
labels = {}
tyre_cache = {}
for idx, (wx, wy, wz, wr, ww) in enumerate(WHEELS):
    front = idx < 2; is_right = idx % 2 == 1; gs = wr / 0.35
    root = bpy.data.objects.new(f'wheel{idx}', None); sc.collection.objects.link(root)
    root.location = (wx, wy, wz); root.rotation_euler = (math.pi / 2, 0, 0)            # engine Y-up frame -> Blender Z-up
    grp = bpy.data.objects.new(f'grp{idx}', None); sc.collection.objects.link(grp); grp.parent = root
    grp.rotation_euler = (0, 0 if is_right else math.pi, 0); grp.scale = (gs, gs, gs)  # right-hand wheels face +X, left-hand ones are turned round
    spin = bpy.data.objects.new(f'spinGroup{idx}', None); sc.collection.objects.link(spin); spin.parent = grp
    tyres, label = build_tyre(spin, front, S); labels[idx] = label; tyre_o += tyres
    brake_o += build_disc(grp, front)
    croot, cobjs = build_caliper(grp, front, is_right, S); brake_o += cobjs
    rim_o += mount_rim(spin, front, S, spins[idx] if idx < len(spins) else 0.0)
print('tyres', set(labels.values()), 'time', round(time.time() - T0, 1), flush=True)

# a soft fill that lights only the wheel parts (Cycles light linking): the wheel sits in the arch, where the studio's overhead
# light does not reach, so without it spokes and tyres go flat dark; a photographer would flag in a fill card
if args.wheel_fill > 0:
    rc = bpy.data.collections.new('wheel_receivers')
    for o in rim_o + tyre_o + brake_o: rc.objects.link(o)
    for idx, (wx, wy, wz, wr, ww) in enumerate(WHEELS):
        sgn = 1 if wx > 0 else -1
        l = bpy.data.lights.new(f'wheelfill{idx}', 'AREA'); l.shape = 'RECTANGLE'; l.size, l.size_y = args.fill_w, args.fill_h
        l.energy = args.wheel_fill * args.fill_w * args.fill_h * math.pi
        ob = bpy.data.objects.new(f'wheelfill{idx}', l); ob.location = (wx + sgn * args.fill_d, wy - 0.25, wz + args.fill_up); sc.collection.objects.link(ob)
        d = Vector((wx, wy, wz)) - ob.location; ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        ob.light_linking.receiver_collection = rc

# visibility by part: invisible to the camera but still shadowing / reflecting / bouncing
show = {'all': rim_o + tyre_o + brake_o, 'rim': rim_o, 'under': tyre_o + brake_o}[args.parts]
hide = [o for o in rim_o + tyre_o + brake_o if o not in show]
for o in hide: o.visible_camera = False
if args.parts == 'rim':
    # the tyre hides the back of the barrel (it sits inside the tyre): as a holdout it cuts the rim layer's alpha where the tyre is in
    # front, so the layer never paints barrel over the tyre when it is stacked on a per-car tyre layer
    for o in tyre_o: o.visible_camera = True; o.is_holdout = True

# ---- 5. regions: the wheels' bounding boxes in the camera frame (merged where they overlap)
from bpy_extras.object_utils import world_to_camera_view
cam = cams[args.view]; sc.camera = cam
RX, RY = sc.render.resolution_x, sc.render.resolution_y
boxes = []
for idx, (wx, wy, wz, wr, ww) in enumerate(WHEELS):
    if args.only_wheel and str(idx) not in args.only_wheel.split(','): continue
    pts = []
    for sx in (-ww / 2 - 0.02, ww / 2 + 0.02):
        for k in range(32):
            a = 2 * math.pi * k / 32; pts.append(Vector((wx + sx, wy + (wr + 0.01) * math.cos(a), wz + (wr + 0.01) * math.sin(a))))
    pp = [world_to_camera_view(sc, cam, p) for p in pts]
    x0 = min(p.x for p in pp) * RX; x1 = max(p.x for p in pp) * RX; y0 = (1 - max(p.y for p in pp)) * RY; y1 = (1 - min(p.y for p in pp)) * RY
    m = 8
    boxes.append([max(0, int(x0 - m)), max(0, int(y0 - m)), min(RX, int(x1 + m) + 1), min(RY, int(y1 + m) + 1)])
merged = True
while merged:
    merged = False
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            A, B = boxes[i], boxes[j]
            if A[0] < B[2] and B[0] < A[2] and A[1] < B[3] and B[1] < A[3]:
                boxes[i] = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3])]; boxes.pop(j); merged = True; break
        if merged: break
boxes = [b for b in boxes if b[2] > b[0] and b[3] > b[1]]
print('regions', boxes, flush=True)

# lights per view as render_car.py does (view_gain)
for o in sc.objects:
    if o.type == 'LIGHT':
        gain = next((f for k, f in fix.get('view_gain', {}).get(args.view, {}).items() if o.name.startswith(k)), 1.0)
        o.data.energy = o.data.energy * gain

if args.save_blend: bpy.ops.wm.save_as_mainfile(filepath=args.save_blend)

# ---- 6. render each region, save EXR -> raw + tone-mapped WebP with alpha
EXPOSURE = 1.6
def lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 1e-9, 1) ** (1 / 2.4) - 0.055)
def neutral(c):
    start, desat = 0.8 - 0.04, 0.15
    x = c.min(-1, keepdims=True); c = c - np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    peak = c.max(-1, keepdims=True); d = 1 - start
    newpeak = 1 - d * d / (np.maximum(peak, 1e-6) + d - start); comp = c * newpeak / np.maximum(peak, 1e-6)
    gg = 1 - 1 / (desat * (peak - newpeak) + 1)
    return np.where(peak < start, c, comp * (1 - gg) + newpeak * gg)

name = args.name or f'{args.parts}_{args.finish}_{int(args.size)}'
odir = os.path.join(args.out, args.view); os.makedirs(odir, exist_ok=True)
sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.exr_codec = 'ZIP'
sc.render.film_transparent = True
sc.render.use_border = True; sc.render.use_crop_to_border = True
meta = {'car': args.car, 'view': args.view, 'parts': args.parts, 'finish': args.finish, 'size': args.size, 'caliper': args.caliper,
        'samples': args.samples, 'frame': [RX, RY], 'regions': []}
t_render = 0.0
for ri, (x0, y0, x1, y1) in enumerate(boxes):
    sc.render.border_min_x = x0 / RX; sc.render.border_max_x = x1 / RX
    sc.render.border_min_y = 1 - y1 / RY; sc.render.border_max_y = 1 - y0 / RY
    ex = os.path.join(odir, f'_{name}_{ri}')
    sc.render.filepath = ex; t1 = time.time()
    bpy.ops.render.render(write_still=True)
    t_render += time.time() - t1
    img = bpy.data.images.load(ex + '.exr', check_existing=False)
    w, h = img.size; arr = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(arr)
    arr = arr.reshape(h, w, 4)[::-1]; bpy.data.images.remove(img); os.remove(ex + '.exr')
    a = arr[..., 3:4]; rgb = np.where(a > 1e-5, arr[..., :3] / np.maximum(a, 1e-5), 0.0)
    raw = srgb(np.clip(rgb, 0, 1))                               # the 'Standard' render, like the body passes
    rawq = (np.clip(raw, 0, 1) * 255 + 0.5).astype(np.uint8)
    fin_rgb = srgb(np.clip(neutral(lin(rawq / 255.0) * EXPOSURE), 0, 1))
    A = (np.clip(a[..., 0], 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(np.dstack([rawq, A]), 'RGBA').save(os.path.join(odir, f'{name}_{ri}.raw.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    Image.fromarray(np.dstack([(fin_rgb * 255 + 0.5).astype(np.uint8), A]), 'RGBA').save(os.path.join(odir, f'{name}_{ri}.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    meta['regions'].append({'box': [x0, y0, x1, y1], 'file': f'{name}_{ri}.webp', 'raw': f'{name}_{ri}.raw.webp',
                            'kb': round(os.path.getsize(os.path.join(odir, f'{name}_{ri}.webp')) / 1024, 1),
                            'kb_raw': round(os.path.getsize(os.path.join(odir, f'{name}_{ri}.raw.webp')) / 1024, 1)})
    print(f'region {ri} {w}x{h} rendered', flush=True)
wproj = wheel_projection(cam, S)
meta['wheels'] = wproj
meta['render_seconds'] = round(t_render, 1); meta['total_seconds'] = round(time.time() - T0, 1); meta['tyre_labels'] = sorted(set(labels.values()))
json.dump(meta, open(os.path.join(odir, f'{name}.json'), 'w'), indent=1)
print('done', json.dumps({k: meta[k] for k in ('render_seconds', 'total_seconds')}), flush=True)

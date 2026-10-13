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
ap.add_argument('--glb', required=True); ap.add_argument('--car', required=True); ap.add_argument('--rim', default='')
ap.add_argument('--view', default='side'); ap.add_argument('--finish', default='silver')
ap.add_argument('--size', type=float, default=20, help='rim diameter in inches (19-22)')
ap.add_argument('--size-rear', type=float, default=0, help='rear rim diameter in inches (staggered fitment, e.g. M5 G90 20 front / 21 rear); 0 = same as --size')
ap.add_argument('--disc-front', type=float, default=0, help='front brake disc radius in m (default 0.19 = 380 mm; the M5 steel M Compound disc is ~395 mm)')
ap.add_argument('--disc-rear', type=float, default=0, help='rear brake disc radius in m (default 0.185)')
ap.add_argument('--parts', choices=['all', 'rim', 'under'], default='all')
ap.add_argument('--caliper', default='', help="'#rrggbb' | white | black; default = the car's caliper_default in the OEM json, else #0055b8")
ap.add_argument('--out', required=True); ap.add_argument('--name', default='')
ap.add_argument('--samples', type=int, default=96); ap.add_argument('--threads', type=int, default=3)
ap.add_argument('--width', type=int, default=1440)
ap.add_argument('--paint-grey', type=float, default=0.18, help='linear grey of the (holdout) body for reflections / bounce')
ap.add_argument('--wheels', default='', help='wheel positions json (default <glb>.wheels.json)')
ap.add_argument('--spin', default='0,0,0,0', help='rim rotation about the axle per wheel (deg): FL,FR,RL,RR')
ap.add_argument('--only-wheel', default='', help='debug: only render the region of these wheel indexes, e.g. 0,2')
ap.add_argument('--no-text', action='store_true', help='skip the tyre sidewall text (faster previews)')
ap.add_argument('--save-blend', default='')
ap.add_argument('--wheel-lights', type=float, default=None, help='gain of the wheel-only softboxes (light-linked to rim + disc + caliper, NOT the tyre or the body); 0 = off')
ap.add_argument('--wheel-wall', type=float, default=None, help='radiance of a big dim light wall in front of each wheel (wheel parts only): mirror finishes reflect soft grey instead of black room + hard box edges')
ap.add_argument('--wheel-dome', type=float, default=None, help='emission of a big grey dome seen ONLY by glossy rays (reflections): what a mirror finish reflects instead of the black room, like the world of the spin studio (0.45)')
ap.add_argument('--wheel-fill', type=float, default=0.0, help='(old) one fill light on every wheel part incl. the tyre; 0 = off')
ap.add_argument('--fill-w', type=float, default=1.6); ap.add_argument('--fill-h', type=float, default=1.1)
ap.add_argument('--fill-d', type=float, default=1.5); ap.add_argument('--fill-up', type=float, default=0.5)
ap.add_argument('--meta-only', action='store_true', help='only write <out>/<view>/meta.json (wheel centres / radii in px) and exit')
ap.add_argument('--adaptive', type=float, default=None, help='Cycles adaptive sampling threshold (default: Blender 0.01)')
ap.add_argument('--bounces', type=int, default=None, help='max light bounces (default 12); diffuse/glossy are capped to it')
ap.add_argument('--denoise-quality', default=None, help='HIGH|BALANCED|FAST')
ap.add_argument('--clamp', type=float, default=0.0, help='indirect clamp (kills fireflies)')
ap.add_argument('--batch', default='', help='json list of jobs {rim, finish, size, parts, view, name, caliper, ...} rendered in ONE session (the car, its BVH and the studio are built once; Cycles persistent data)')
ap.add_argument('--repeat', type=int, default=1, help='timing test: render every region N times in one session (with persistent data) and record each time')
ap.add_argument('--oem', default='', help='OEM fitment json (default scripts/wheels/oem_tyres.json): real tyre section width, overall diameter, sidewall text and brake discs per car + rim size; "none" = the engine\'s fixed 265/295 x 700 mm tyre')
ap.add_argument('--oem-car', default='', help='car id row of the OEM json (default --car)')
ap.add_argument('--no-brand', action='store_true', help='size text only, never the maker/model name')
ap.add_argument('--face-shade', choices=['weighted', 'flat', 'angle'], default='angle', help='shading of the traced rim face: weighted normals (v1), flat facets, or smooth-by-angle only')
ap.add_argument('--face-smooth', type=int, default=8, help='Laplacian-smooth passes on the rim face mesh outline (rounds traced-mask wobble); 0 = off')
ap.add_argument('--face-bevel', type=float, default=0.008, help='bevel width (rim-local units, 1 = 262 mm) on the traced face edges: catches the edge highlight a flat extruded outline lacks; 0 = off')
ap.add_argument('--caliper-text', default='FORGEDSA', help='plain white lettering on the caliper (no logo artwork); empty = none')
ap.add_argument('--tex-scale', type=int, default=1, help='sidewall lettering map resolution multiplier (2 = 8192x512, crisp at a 2x close-up)')
ap.add_argument('--squash', type=float, default=0.008, help='tyre contact-patch deflection in m (0 = round tyre; ~0.008 = a loaded road tyre)')
ap.add_argument('--brand', default='', help='sidewall brand word (default none)')
ap.add_argument('--debug-tyre', action='store_true', help='light grey rubber, to check the lettering')
ap.add_argument('--rubber', type=float, default=0.045, help='linear albedo of the sidewall rubber')
args = ap.parse_args()
T0 = time.time()
# lighting presets per finish (wheel-only lights; the car studio is untouched): mirror finishes need a grey surround to reflect
PRESET = {'liquid_metal': dict(lights=0.75, wall=0.4, dome=0.55), 'black': dict(lights=0.5, wall=0.1, dome=0.12), 'bronze': dict(lights=0.6, wall=0.0, dome=0.0), 'satin_gold': dict(lights=0.55, wall=0.0, dome=0.0)}
_CLI_LIGHTS = (args.wheel_lights, args.wheel_wall, args.wheel_dome)
def apply_preset():
    pf = PRESET.get(args.finish.split(',')[0], dict(lights=0.75, wall=0.0, dome=0.0))
    args.wheel_lights, args.wheel_wall, args.wheel_dome = [c if c is not None else pf[k] for c, k in zip(_CLI_LIGHTS, ('lights', 'wall', 'dome'))]
apply_preset()

# ---- OEM fitment (scripts/wheels/oem_tyres.json): per car and rim size the real tyre width / overall diameter / lettering and the brake discs
OEM_PATH = args.oem or os.path.join(HERE, 'oem_tyres.json')
OEM = {} if args.oem == 'none' or not os.path.exists(OEM_PATH) else json.load(open(OEM_PATH))
CUR = {True: {}, False: {}}      # front?  ->  dict(tw, R, text, brand, model, disc_r, disc_t) of the current job (read by rim_layout and the builders)
def oem_row(front, size_in):
    c = OEM.get(args.oem_car or args.car)
    if not c: return None, None
    r = c['sizes'].get(str(int(round(size_in))))
    return c, (r['front' if front else 'rear'] if r else None)
def size_text(r):
    t = f"{r['width_mm']}/{r['aspect']} {'ZR' if r.get('zr', True) else 'R'}{r['rim_in']}"
    if r.get('load_speed'): t += ' ' + r['load_speed']
    if r.get('xl'): t += ' XL'
    if r.get('star'): t += ' \u2605'
    if r.get('extra'): t += ' ' + r['extra']
    return t
def setup_fitment():
    for front in (True, False):
        size = args.size if (front or not args.size_rear) else args.size_rear
        c, r = oem_row(front, size)
        d = dict(tw=0.265 if front else 0.295, R=0.35, text=None, brand=None, model=None, disc_r=0, disc_t=0)
        if r:
            d.update(tw=r['width_mm'] / 1000.0, R=r['od_mm'] / 2000.0, text=size_text(r))
            tyr = c.get('tyre') or {}
            if tyr.get('brand_text') and r.get('show_brand') and not args.no_brand: d.update(brand=tyr['brand_text'], model=tyr.get('model_text'))
            bk = (c.get('brakes') or {}).get('front' if front else 'rear') or {}
            if bk.get('disc_mm'): d['disc_r'] = bk['disc_mm'] / 2000.0
            if bk.get('thickness_mm'): d['disc_t'] = bk['thickness_mm'] / 1000.0
        if args.disc_front and front: d['disc_r'] = args.disc_front
        if args.disc_rear and not front: d['disc_r'] = args.disc_rear
        CUR[front] = d
setup_fitment()

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

T_PRE = time.time() - T0
assert WHEELS, 'no wheel positions'
def axle_scale(front, S0):
    """rim scale of an axle: --size for the front, --size-rear for the rear (staggered fitment)."""
    return S0 if (front or not args.size_rear) else args.size_rear / 20.0
def wheel_projection(cam, S0):
    """Per wheel: the tyre (centre plane) and the rim's lip-front circle in the frame, px: centre and radii. Used to place a layer on another car."""
    from bpy_extras.object_utils import world_to_camera_view as wc
    RX, RY = sc.render.resolution_x, sc.render.resolution_y
    out = []
    for idx, (wx, wy, wz, wr, ww) in enumerate(WHEELS):
        gs = wr / CUR[idx < 2]['R']; sgn = 1 if wx > 0 else -1; tw = CUR[idx < 2]['tw']
        S = axle_scale(idx < 2, S0)
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
    tw = CUR[front]['tw']
    lipOuter = 0.262 * s; faceRadius = 0.24 * s; beadSeat = 0.254 * s
    rimWidth = tw - 0.03; lipX = tw / 2 - 0.012; faceEdgeX = lipX - 0.01
    dish = 0.036 if front else 0.058
    hubFrontX = faceEdgeX - dish; hubBackX = hubFrontX - 0.032 - 2 * 0.003 - 0.001
    return dict(tw=tw, lipOuter=lipOuter, faceRadius=faceRadius, beadSeat=beadSeat, rimWidth=rimWidth, lipX=lipX, faceEdgeX=faceEdgeX,
                hubBackX=hubBackX, discRadius=CUR[front]['disc_r'] or (0.19 if front else 0.185), discThickness=CUR[front]['disc_t'] or (0.036 if front else 0.028), discX=-0.014 if front else -0.008)

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

def sidewall_maps(spec):
    """Height + roughness strips of the outer sidewall (repeats twice round the tyre). spec = (size text, brand, model): the size line always;
    the maker and model names (plain raised lettering, no logo artwork) only when the OEM json allows it (brand is None = size text only)."""
    label, brand, model = spec
    K = max(1, args.tex_scale)
    W, H = 4096 * K, 256 * K
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    def font(px, italic=False, star=False):
        px = int(px * K)
        names = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if star else (['/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf'] if italic else []) + ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
        for f in names:
            if os.path.exists(f): return ImageFont.truetype(f, px)
        return ImageFont.load_default()
    def write(text, x, y, px, spacing=0.06, italic=False, shear=0.0, narrow=0.82):
        """centred text; shear > 0 slants the letters (the real Michelin wordmark is italic)."""
        layer = Image.new('L', (W, H), 0); dd = ImageDraw.Draw(layer)
        fts = {c: font(px, italic, c == '\u2605') for c in set(text)}
        ws = [dd.textlength(c, font=fts[c]) * (1.0 if c == '\u2605' else narrow) + px * K * spacing for c in text]
        cx = x - sum(ws) / 2
        for c, w in zip(text, ws):
            dd.text((cx, y), c, font=fts[c], fill=255, anchor='lm'); cx += w
        if shear: layer = layer.transform((W, H), Image.AFFINE, (1, shear, -shear * y, 0, 1, 0), Image.BICUBIC)
        im.paste(Image.fromarray(np.maximum(np.asarray(im), np.asarray(layer))))
    write(label, W * 0.25, H * 0.56, 92, 0.05)
    if brand:
        write(brand, W * 0.52, H * 0.52, 132, 0.09, italic=True, shear=0.22, narrow=0.9)
        if model: write(model, W * 0.715, H * 0.58, 52, 0.10, italic=True, shear=0.22, narrow=0.9)
        write('RADIAL  TUBELESS', W * 0.88, H * 0.62, 36, 0.12); write('EXTRA LOAD', W * 0.88, H * 0.42, 34, 0.12)
        write('TREADWEAR 300   TRACTION AA   TEMPERATURE A', W * 0.93, H * 0.30, 19, 0.06)
        write('DOT  XB 4T  3925', W * 0.05, H * 0.5, 28, 0.08)
    for x in (W * 0.12, W * 0.47, W * 0.95): d.polygon([(x - 14 * K, H * 0.86), (x + 14 * K, H * 0.86), (x, H * 0.95)], fill=255)
    letters = np.asarray(im).astype(np.float32) / 255
    v = (np.arange(H) / (H - 1))[:, None]
    band = smoothstep(0.26, 0.32, v) * (1 - smoothstep(0.76, 0.82, v))
    height = blur2(letters, 1) * 0.9 + band * 0.12
    rough = np.clip(0.62 + band * 0.28 - letters * band * 0.32, 0, 1)
    return height, rough

base_energy = {o.name: o.data.energy for o in sc.objects if o.type == 'LIGHT'}
before_objs = set(bpy.data.objects); before_cols = set(bpy.data.collections)
sc.render.use_persistent_data = True

DISC_CACHE = {}   # drilled friction plate per front/rear: the exact boolean is 2 s, so build it once per session

def run_job():
    T0j = time.time(); S0 = args.size / 20.0; S = S0
    setup_fitment()
    # ---- 3. parts
    FIN = json.load(open(os.path.join(ROOT, 'scripts', 'rim3d', 'finishes.json')))
    fin = FIN[args.finish]
    cal_arg = args.caliper or (((OEM.get(args.oem_car or args.car) or {}).get('caliper_default') or {}).get('hex')) or '#0055b8'
    cal_lin = (1.0,) * 3 if cal_arg == 'white' else ((0.0,) * 3 if cal_arg == 'black' else tuple(srgb2lin(cal_arg)))

    MAT = {}
    RUB = 0.5 if args.debug_tyre else args.rubber
    rub, rb = new_mat('tyre_tread', lin=(RUB * 0.8,) * 3, rough=0.7, sheen=0.35, sheen_rough=0.5, sheen_tint='#6a6866')
    MAT['tread'] = rub
    sw, sb = new_mat('tyre_sidewall', lin=(RUB,) * 3, rough=0.5, sheen=0.35, sheen_rough=0.45, sheen_tint='#6a6866')
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
    def sidewall_material(spec):
        label = '|'.join(str(x) for x in spec)
        if label in LABELS: return LABELS[label]
        m, b = new_mat('tyre_sidewall_' + label, lin=(RUB,) * 3, rough=0.5, sheen=0.35, sheen_rough=0.45, sheen_tint='#6a6866')
        if not args.no_text:
            h, r = sidewall_maps(spec)
            nt = m.node_tree
            ti = tex_node(nt, np_image('sw_h_' + label, h.astype(np.float32)), (-2, -1, 1)); tr = tex_node(nt, np_image('sw_r_' + label, r.astype(np.float32)), (-2, -1, 1))
            bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 1.0; bp.inputs['Distance'].default_value = 0.0015
            nt.links.new(ti.outputs['Color'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
            mxl = nt.nodes.new('ShaderNodeMix'); mxl.data_type = 'RGBA'; mxl.inputs['Factor'].default_value = 1.0
            mxl.inputs['A'].default_value = (*[RUB] * 3, 1); mxl.inputs['B'].default_value = (*[RUB * 3.5] * 3, 1)
            lm = nt.nodes.new('ShaderNodeMath'); lm.operation = 'MULTIPLY'; lm.inputs[1].default_value = 1.0; nt.links.new(ti.outputs['Color'], lm.inputs[0])
            rr = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(ti.outputs['Color'], rr.inputs[0])
            sm = nt.nodes.new('ShaderNodeMapRange'); sm.inputs['From Min'].default_value = 0.35; sm.inputs['From Max'].default_value = 0.8; nt.links.new(rr.outputs[0], sm.inputs['Value'])
            nt.links.new(sm.outputs['Result'], mxl.inputs['Factor']); nt.links.new(mxl.outputs['Result'], b.inputs['Base Color'])
            nt.links.new(tr.outputs['Color'], b.inputs['Roughness'])
        nn = m.node_tree.nodes.new('ShaderNodeTexNoise'); nn.inputs['Scale'].default_value = 900; nn.inputs['Detail'].default_value = 3
        m.node_tree.links.new(m.node_tree.nodes.new('ShaderNodeTexCoord').outputs['Object'], nn.inputs['Vector'])
        # fine rubber grain on every sidewall (after the lettering bump, when there is one)
        bq = m.node_tree.nodes.new('ShaderNodeBump'); bq.inputs['Strength'].default_value = 0.22; bq.inputs['Distance'].default_value = 0.0004
        m.node_tree.links.new(nn.outputs['Fac'], bq.inputs['Height'])
        if not args.no_text: m.node_tree.links.new(bp.outputs['Normal'], bq.inputs['Normal'])
        m.node_tree.links.new(bq.outputs['Normal'], b.inputs['Normal'])
        LABELS[label] = m
        return m

    def cubic(p0, p1, p2, p3, n):
        out = []
        for i in range(1, n + 1):
            t = i / n; a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; e = t ** 3
            out.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
        return out

    def build_tyre(parent, front, s, R=None):
        R = R or CUR[front]['R']
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
        label = CUR[front]['text'] or f"{round(L['tw'] * 1000 / 5) * 5}/{round(((R - 0.254 * s) * 1000 / (round(L['tw'] * 1000 / 5) * 5)) * 20) * 5} ZR{round(20 * s)} {'98' if front else '102'}Y XL"
        objs = []
        def squash(bm):
            """contact-patch deflection: the tyre's bottom (wheel-local -y) is pressed in a little, smoothly, strongest at the tread, none at the bead"""
            if args.squash <= 0: return bm
            for v in bm.verts:
                y, z = v.co.y, v.co.z; r = math.hypot(y, z)
                if r < 1e-6: continue
                th = math.atan2(z, -y); lift = args.squash * math.exp(-(th / 0.17) ** 2) * max(0.0, (r - L['beadSeat']) / (R - L['beadSeat'])) ** 4
                v.co.y = y * (r - lift) / r; v.co.z = z * (r - lift) / r
            return bm
        o = mesh_obj('tyre_tread', squash(lathe_bm(tread, segs)), MAT['tread'], parent); smooth_by_angle(o, 40); objs.append(o)
        o = mesh_obj('tyre_side_out', squash(lathe_bm(sidewall(1), segs)), sidewall_material((label, CUR[front]['brand'], CUR[front]['model'])), parent); smooth_by_angle(o, 50); objs.append(o)
        o = mesh_obj('tyre_side_in', squash(lathe_bm(sidewall(-1), segs)), MAT['sidewall_in'], parent); smooth_by_angle(o, 50); objs.append(o)
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
        span = math.radians(98 if front else 70); halfW = L['discThickness'] / 2 + (0.044 if front else 0.032)
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
        if front:   # the six-piston monoblock's piston-pair dividers: two raised ribs across the face
            for f in (0.36, 0.64):
                a_ = at(f); w_ = 0.0042; r_a, r_b = rIn + 0.014, rOut - 0.015
                rib = [(r_a * math.cos(a_) - w_ * math.sin(a_), r_a * math.sin(a_) + w_ * math.cos(a_)), (r_b * math.cos(a_) - w_ * math.sin(a_), r_b * math.sin(a_) + w_ * math.cos(a_)),
                       (r_b * math.cos(a_) + w_ * math.sin(a_), r_b * math.sin(a_) - w_ * math.cos(a_)), (r_a * math.cos(a_) + w_ * math.sin(a_), r_a * math.sin(a_) - w_ * math.cos(a_))]
                o = mesh_obj('cal_rib', prism_xyz(rib, halfW + 0.001, halfW + 0.0062, to3), MAT['caliper'], root); bevel(o, 0.0014, 2); objs.append(o)
        # decal plate (plain lettering)
        dp = kidney_pts(rIn + 0.016, rOut - 0.017, at(0.12), at(0.88))
        bm = bmesh.new(); vs = [bm.verts.new(to3(x, y, halfW + 0.0068)) for x, y in dp]
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
        # plain white lettering (default 'FORGEDSA') on transparent: no logo artwork (no BMW M stripes / roundel)
        W, H = 2048, 256
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        txt = args.caliper_text.upper()
        if txt:
            px = 200
            while px > 40:
                ft = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', px)
                if d.textlength(txt, font=ft) <= W * 0.5: break
                px -= 6
            d.text((W / 2, H / 2), txt, font=ft, fill=(255, 255, 255, 255), anchor='mm')
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
        b.inputs['Base Color'].default_value = (*(np.array(srgb2lin('#a19f9b')) * 0.85), 1); b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.36
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
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.14; bp.inputs['Distance'].default_value = 0.0004
        nt.links.new(h2.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
        # one friction plate: ring with three staggered rows of drillings, then duplicated for the inner plate
        if (front, Rd) in DISC_CACHE:
            pl = bpy.data.objects.new('disc_plate', DISC_CACHE[(front, Rd)]); sc.collection.objects.link(pl); pl.parent = parent; pl.location = (L['discX'] + t / 2 - plate, 0, 0)
            for p_ in pl.data.polygons: p_.use_smooth = False
            pl.data.materials[0] = dm
        else:
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
            for ri, f in enumerate((0.75, 0.84, 0.93)):
                for k in range(20):
                    a = ((k + ri * 0.33) / 20) * 2 * math.pi + ri * 0.08; r = Rd * f
                    tmp = bmesh.new(); bmesh.ops.create_cone(tmp, cap_ends=True, segments=14, radius1=0.0042, radius2=0.0042, depth=plate * 3)
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
            pl.data.use_fake_user = True; DISC_CACHE[(front, Rd)] = pl.data
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
            if args.face_smooth:
                sm = o.modifiers.new('fsm', 'SMOOTH'); sm.factor = 0.5; sm.iterations = args.face_smooth
                bpy.ops.object.modifier_apply(modifier=sm.name)
            if args.face_bevel:
                bv = o.modifiers.new('fbev', 'BEVEL'); bv.width = args.face_bevel; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40); bv.harden_normals = False
                bpy.ops.object.modifier_apply(modifier=bv.name)
            if args.face_shade == 'flat':
                bpy.ops.object.shade_flat()
            else:
                bpy.ops.mesh.customdata_custom_splitnormals_clear(); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
            o.select_set(False)
            if args.face_shade == 'weighted':
                wn = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.mode = 'FACE_AREA'; wn.keep_sharp = True
        o.data.materials.clear(); o.data.materials.append(part_material(o))

    def mount_rim(parent, front, s, spin_deg):
        """The engine's mountRimModel: the rim's front (the lip, 0.446 R) at the tyre's lipX, scaled to the 20" base x size."""
        L = rim_layout(front, s)
        spinner = bpy.data.objects.new('spin', None); sc.collection.objects.link(spinner); spinner.parent = parent
        spinner.rotation_euler = (math.radians(spin_deg), 0, 0)
        holder = bpy.data.objects.new('rim', None); sc.collection.objects.link(holder); holder.parent = spinner
        Rm = 0.262 * s   # the engine's lipOuter (rimLayout); mountRimModel uses 0.26, a 0.8% difference
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
        front = idx < 2; is_right = idx % 2 == 1; gs = wr / CUR[front]['R']
        S = axle_scale(front, S0)
        root = bpy.data.objects.new(f'wheel{idx}', None); sc.collection.objects.link(root)
        root.location = (wx, wy, wz); root.rotation_euler = (math.pi / 2, 0, 0)            # engine Y-up frame -> Blender Z-up
        grp = bpy.data.objects.new(f'grp{idx}', None); sc.collection.objects.link(grp); grp.parent = root
        grp.rotation_euler = (0, 0 if is_right else math.pi, 0); grp.scale = (gs, gs, gs)  # right-hand wheels face +X, left-hand ones are turned round
        spin = bpy.data.objects.new(f'spinGroup{idx}', None); sc.collection.objects.link(spin); spin.parent = grp
        _t = time.time(); tyres, label = build_tyre(spin, front, S); labels[idx] = label; tyre_o += tyres; _t1 = time.time()
        brake_o += build_disc(grp, front); _t2 = time.time()
        croot, cobjs = build_caliper(grp, front, is_right, S); brake_o += cobjs; _t3 = time.time()
        rim_o += mount_rim(spin, front, S, spins[idx] if idx < len(spins) else 0.0)
        print(f'  build wheel {idx}: tyre {_t1 - _t:.1f}s disc {_t2 - _t1:.1f}s caliper {_t3 - _t2:.1f}s rim {time.time() - _t3:.1f}s', flush=True)
    print('tyres', set(labels.values()), 'time', round(time.time() - T0j, 1), 'preamble', round(T_PRE, 1), flush=True)

    # Wheel-only softboxes (Cycles light linking: they light the rim, disc and caliper and nothing else - not the body, not the tyre).
    # The wheel sits in the arch where the studio's overhead light does not reach, and a flat spoke face reflects almost nothing of a dark room.
    # A photographer lights a wheel with its own boxes: a big overhead box (gradient down the spokes), a key from the front and one from behind
    # (so the face reads from every camera angle), a long vertical strip (crisp highlight on spoke edges) and a thin horizontal one for the lip.
    if args.wheel_lights > 0 or args.wheel_fill > 0:
        rc = bpy.data.collections.new('wheel_receivers'); rc_all = bpy.data.collections.new('wheel_receivers_all')
        for o in rim_o + brake_o: rc.objects.link(o)
        for o in rim_o + tyre_o + brake_o: rc_all.objects.link(o)
        BOXES = [  # name, (outward, forward, up) offsets in m from the wheel centre, (w, h) m, radiance, shape
            ('top', (0.30, 0.0, 1.75), (2.6, 1.7), 3.2),
            ('key', (1.5, -1.3, 0.45), (1.6, 1.2), 3.6),
            ('back', (1.5, 1.3, 0.35), (1.6, 1.2), 2.0),
            ('vstrip', (1.4, -0.55, 0.15), (0.14, 1.9), 11.0),
            ('hstrip', (0.95, 0.0, 0.95), (2.1, 0.10), 9.0),
            ('wall', (2.8, -0.2, 0.25), (6.0, 4.2), args.wheel_wall / max(args.wheel_lights, 1e-6)),
            ('wallb', (1.8, 2.6, 0.25), (3.2, 3.0), args.wheel_wall * 0.8 / max(args.wheel_lights, 1e-6)),
        ]
        for idx, (wx, wy, wz, wr, ww) in enumerate(WHEELS):
            sgn = 1 if wx > 0 else -1
            for name, (o_, f_, u_), (bw, bh), rad in BOXES:
                if args.wheel_lights <= 0 or rad <= 0: continue
                l = bpy.data.lights.new(f'wl_{name}{idx}', 'AREA'); l.shape = 'RECTANGLE'; l.size, l.size_y = bw, bh
                l.energy = rad * args.wheel_lights * bw * bh * math.pi
                ob = bpy.data.objects.new(f'wl_{name}{idx}', l); ob.location = (wx + sgn * o_, wy + f_, wz + u_); sc.collection.objects.link(ob)
                ob.rotation_euler = (Vector((wx, wy, wz)) - ob.location).to_track_quat('-Z', 'Y').to_euler()
                ob.light_linking.receiver_collection = rc
            if args.wheel_fill > 0:
                l = bpy.data.lights.new(f'wheelfill{idx}', 'AREA'); l.shape = 'RECTANGLE'; l.size, l.size_y = 1.6, 1.1; l.energy = args.wheel_fill * 1.6 * 1.1 * math.pi
                ob = bpy.data.objects.new(f'wheelfill{idx}', l); ob.location = (wx + sgn * 1.5, wy - 0.25, wz + 0.5); sc.collection.objects.link(ob)
                ob.rotation_euler = (Vector((wx, wy, wz)) - ob.location).to_track_quat('-Z', 'Y').to_euler(); ob.light_linking.receiver_collection = rc_all

    if args.wheel_dome > 0:
        dm_ = bpy.data.materials.new('wheel_dome'); dm_.use_nodes = True; nt_ = dm_.node_tree; nt_.nodes.clear()
        em_ = nt_.nodes.new('ShaderNodeEmission'); out_ = nt_.nodes.new('ShaderNodeOutputMaterial')
        gp_ = nt_.nodes.new('ShaderNodeNewGeometry'); sep_ = nt_.nodes.new('ShaderNodeSeparateXYZ'); nt_.links.new(gp_.outputs['Position'], sep_.inputs[0])
        mr_ = nt_.nodes.new('ShaderNodeMapRange'); mr_.clamp = True; mr_.inputs['From Min'].default_value = -2.0; mr_.inputs['From Max'].default_value = 6.0   # a little brighter overhead than low down
        mr_.inputs['To Min'].default_value = args.wheel_dome * 0.6; mr_.inputs['To Max'].default_value = args.wheel_dome * 1.4
        nt_.links.new(sep_.outputs['Z'], mr_.inputs['Value']); nt_.links.new(mr_.outputs[0], em_.inputs['Strength']); nt_.links.new(em_.outputs[0], out_.inputs[0])
        bpy.ops.mesh.primitive_uv_sphere_add(radius=9, segments=48, ring_count=24, location=(cx, cy, 1.0)); dome = bpy.context.object; dome.data.materials.append(dm_)
        for pl in dome.data.polygons: pl.use_smooth = True
        bmesh_ = bmesh.new(); bmesh_.from_mesh(dome.data); bmesh.ops.reverse_faces(bmesh_, faces=bmesh_.faces); bmesh_.to_mesh(dome.data); bmesh_.free()
        dome.visible_camera = False; dome.visible_shadow = False; dome.visible_diffuse = False; dome.visible_transmission = False; dome.visible_volume_scatter = False

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
    if args.adaptive is not None: sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = args.adaptive
    if args.bounces is not None: sc.cycles.max_bounces = args.bounces; sc.cycles.diffuse_bounces = min(2, args.bounces); sc.cycles.glossy_bounces = args.bounces; sc.cycles.transmission_bounces = min(4, args.bounces); sc.cycles.transparent_max_bounces = min(4, args.bounces)
    if args.denoise_quality: sc.cycles.denoising_quality = args.denoise_quality
    if args.clamp: sc.cycles.sample_clamp_indirect = args.clamp
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    meta = {'car': args.car, 'view': args.view, 'parts': args.parts, 'finish': args.finish, 'size': args.size, 'caliper': args.caliper,
            'samples': args.samples, 'frame': [RX, RY], 'regions': []}
    t_render = 0.0; times = []
    for ri, (x0, y0, x1, y1) in enumerate(boxes):
        sc.render.border_min_x = x0 / RX; sc.render.border_max_x = x1 / RX
        sc.render.border_min_y = 1 - y1 / RY; sc.render.border_max_y = 1 - y0 / RY
        ex = os.path.join(odir, f'_{name}_{ri}')
        sc.render.filepath = ex
        if args.repeat > 1: sc.render.use_persistent_data = True
        for rep in range(args.repeat):
            t1 = time.time(); bpy.ops.render.render(write_still=True); dt = time.time() - t1; times.append(round(dt, 1))
            if rep == 0: t_render += dt
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
    wproj = wheel_projection(cam, S0)
    meta['wheels'] = wproj
    meta['preamble_seconds'] = round(T_PRE, 1); meta['render_times'] = times; meta['render_seconds'] = round(t_render, 1); meta['total_seconds'] = round(time.time() - T0j, 1); meta['tyre_labels'] = sorted(set(labels.values()))
    json.dump(meta, open(os.path.join(odir, f'{name}.json'), 'w'), indent=1)
    print('done', json.dumps({k: meta[k] for k in ('render_seconds', 'total_seconds')}), flush=True)

if args.batch:
    jobs = json.load(open(args.batch))
else:
    jobs = [{}]
base_args = dict(vars(args))
for ji, job in enumerate(jobs):
    for k, v in base_args.items(): setattr(args, k.replace('-', '_'), v)
    for k, v in job.items(): setattr(args, k.replace('-', '_'), v)
    apply_preset()
    for o in sc.objects:
        if o.type == 'LIGHT' and o.name in base_energy: o.data.energy = base_energy[o.name]
    tj = time.time(); run_job()
    # tear the wheels down (keep the car and the studio, so the next job reuses their BVH)
    for o in [o for o in bpy.data.objects if o not in before_objs]: bpy.data.objects.remove(o, do_unlink=True)
    for c in [c for c in bpy.data.collections if c not in before_cols]: bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)
    print(f'job {ji + 1}/{len(jobs)} {args.view} {args.name} {round(time.time() - tj, 1)}s', flush=True)

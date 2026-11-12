"""Shared by the two M5 adapters: m5_g90 (saloon) and m5_touring_g99 (Touring).

Both cars come from the same game asset family and are built the same way, so the role assignments live here
and the two adapters only say what differs (the Touring's tail lamps).

How these cars are built (verified by listing every mesh's connected parts, bounds and UVs):

  C02_Glass_Window         one mesh, three materials:
                             Glass           the windows (large parts) plus mirror-indicator covers (tiny parts)
                             Glass_Lens      headlamp covers, plate-lamp and sensor covers, kidney-light covers
                             Glass_TailLens  red tail-lamp covers and the bumper reflectors
  C02_Glass_WindowInside   one mesh, one material (Glass) for three unrelated things:
                             an inner skin for every window (same outline, 4 mm inside the outer pane)
                             cabin glass: curved display, interaction bar, roof console, gear selector
                             the tail lamps' L-shaped light bars
  C03_Light_Light          every lamp's internals, front and rear:
                             Light_Housing   bezels, projectors, reflectors. One atlas: flat swatches in the
                                             top-left corner, photographs of lenses and reflectors elsewhere
                             LightDRL        a thin strip along the foot of each headlamp light blade
                             LightKidney     the kidney contour light AND the etched lines on the headlamp blades
                             LightTail       lit strips behind the tail light bars (saloon only)
  C01_Body_Coloured        all trim in one mesh and one material; the colour comes from an 8x8 swatch texture,
                           so a face's UV says which trim it is (gloss black, grained plastic, rubber seal,
                           mirror glass, exhaust tip, windscreen frit)
  C01_Body_Carbon*         carbon parts; the weave is mapped about three times too coarse
  C01_Body_ManufacturerPlate  the game's placeholder number plate (pale grey with an M logo)

Each headlamp has two projector modules. Beside each stands a blade: a plate with a band of etched lines.
That band is the daytime running light, a slim near-vertical bar, two per lamp. Only the band is lit.
"""
import bpy
from mathutils import Vector

from .. import glass, lamps
from ..core import log

# ----------------------------------------------------------------------------- where things are (metres)
HEAD_Y = -1.8            # lamp parts wholly ahead of this are in the nose (headlamps, kidney light)
TAIL_Y = 1.9             # glass and lamp parts wholly behind this are tail lamps
KIDNEY_X = 0.5           # at the nose, |x| below this is the kidney contour light, above it the headlamp
PANE_MIN_AREA = 0.02     # m2; 'Glass' parts smaller than this are indicator covers and sensor windows
PANE_MATCH = 0.03        # m; an inner part whose bounds sit this close to a window's is that window's inner skin
DRL_BAND = 0.007         # m; blade faces this close to an etched line belong to the lit band
FOOT_STRIP_MAX_HEIGHT = 0.02   # m; the strip along a blade's foot is flatter than this
LENS_PHOTO_UV = (0.49, 0.58, 1.0, 0.95)   # u0, v0, u1, v1 of the projector-lens photographs in the lamp atlas
SWATCH_UV = (0.0, 0.94, 0.215, 1.0)       # the flat-colour swatches in the lamp atlas

# ----------------------------------------------------------------------------- look values owned by this module
DRL_SPILL = 3.0               # light the bars cast into the lamp. The shared value suits the M2's thin guide;
#                               these bars are far larger and flooded the whole cavity yellow with it.
DRL_LINE_GAIN = 2.2           # the etched lines: these are what glows on a real light-guide plate
DRL_BAND_GAIN = 0.35          # the clear plate between the lines only carries a little of their light
TAIL_LENS_HEX = "#C8141A"     # red cover lens
TAIL_HEX = "#FF1206"          # lit tail light bars
TAIL_STRENGTH = 3.2
KIDNEY_HEX = "#EEF3FF"        # the kidney contour light ('Iconic Glow') is white on the real car
KIDNEY_STRENGTH = 0.55        # seen by the camera: a soft glow, well under the DRL. 0 switches it off.
KIDNEY_SPILL = 3.0            # what it casts on the gloss surround, so it reads as light and not as a white line
SHOW_GAME_PLATE = False       # the placeholder plate is hidden; the boot lid behind it is fully modelled
CARBON_WEAVE_SCALE = 3.0      # tiles the weave to about 4-5 mm per repeat, as on the real roof
CARBON_BUMP = 0.45            # normal-map strength; full strength sparkles at car-sized distances

# swatch cells (column, row from the top) of the 8x8 trim texture -> what that trim really is
TRIM_CELLS = {
    (0, 1): "gloss_black",    # kidney surround, window surrounds and pillars, diffuser, lower air intakes
    (2, 1): "plastic",        # arch liners, grille slats, scuttle, undertray edges, roof fin
    (3, 1): "plastic",        # mirror feet, bumper side vents
    (4, 1): "rubber",         # window seals, door-handle inserts, sensor rings
    (7, 2): "frit",           # the black band printed round the windscreen and rear screen
    (0, 2): "mirror",         # door-mirror glass
    (6, 1): "exhaust",        # tailpipe outer shells
    (4, 0): "exhaust_inner",  # tailpipe bores
}

# name -> Principled inputs. Black is never 0: real black trim reflects 2-5 % and must not merge into the dark.
TRIM = {
    "gloss_black":   {"Base Color": (0.012, 0.012, 0.013, 1.0), "Metallic": 0.0, "Roughness": 0.22,
                      "Coat Weight": 1.0, "Coat Roughness": 0.025, "Coat IOR": 1.5},
    "plastic":       {"Base Color": (0.040, 0.040, 0.042, 1.0), "Metallic": 0.0, "Roughness": 0.62, "Coat Weight": 0.0},
    "rubber":        {"Base Color": (0.022, 0.022, 0.022, 1.0), "Metallic": 0.0, "Roughness": 0.78, "Coat Weight": 0.0},
    "frit":          {"Base Color": (0.006, 0.006, 0.006, 1.0), "Metallic": 0.0, "Roughness": 0.35, "Coat Weight": 0.0},
    "mirror":        {"Base Color": (0.86, 0.88, 0.90, 1.0), "Metallic": 1.0, "Roughness": 0.015, "Coat Weight": 0.0},
    "exhaust":       {"Base Color": (0.30, 0.30, 0.32, 1.0), "Metallic": 1.0, "Roughness": 0.16, "Coat Weight": 0.0},
    "exhaust_inner": {"Base Color": (0.06, 0.06, 0.06, 1.0), "Metallic": 1.0, "Roughness": 0.55, "Coat Weight": 0.0},
}


def mesh_object(name):
    """The scene's mesh object called name, or None."""
    o = bpy.data.objects.get(name)
    return o if o is not None and o.type == 'MESH' else None


def principled_material(name, values):
    """A Principled material from a dict of input values (inputs this Blender lacks are skipped)."""
    mat, nt = glass.fresh_material(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    for key, value in values.items():
        glass.set_input(bsdf, key, value)
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def darken_base(mat, value=0.02):
    """Set a material's Principled base colour to near-black (used on the shared emitter where the lit part is
    a clear plate: the shared emitter's pale frosted base would show the studio light as a white veil)."""
    bsdf = next((node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is not None:
        glass.set_input(bsdf, "Base Color", (value, value, value, 1.0))


def add_white_vertex_colour(obj):
    """lamps.housing_material multiplies the atlas by the mesh's vertex colour; these meshes have none, and a
    missing attribute reads as black. Give the mesh a white one so the atlas shows as it is."""
    me = obj.data
    if len(me.color_attributes) > 0:
        return False
    attr = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
    for d in attr.data:
        d.color = (1.0, 1.0, 1.0, 1.0)
    me.color_attributes.active_color = attr
    return True


def in_headlamp(part):
    """part is a glass.Piece or a glass.Face."""
    return part.centre.y < HEAD_Y and abs(part.centre.x) > KIDNEY_X


def uv_inside(face, box):
    if face.uv is None:
        return False
    u0, v0, u1, v1 = box
    return u0 <= face.uv[0] <= u1 and v0 <= face.uv[1] <= v1


# --------------------------------------------------------------------------------------------------- glass

def assign_glass_roles(ctx):
    """Windows, clear lenses and red lenses; the windows' inner skins are removed (single thin panes)."""
    n = {"window": 0, "lens": 0, "red": 0, "inner_removed": 0, "cabin_glass": 0}
    outer = mesh_object("C02_Glass_Window")
    inner = mesh_object("C02_Glass_WindowInside")
    window = glass.window_material(ctx)
    lens = lamps.lens_material(ctx)
    red = lamps.tinted_lens_material(ctx, "PL_M5_TailLens", TAIL_LENS_HEX)
    panes = []
    if outer:
        panes = [(p.lo.copy(), p.hi.copy()) for p in glass.pieces(outer)
                 if p.materials == {"Glass"} and p.area >= PANE_MIN_AREA]
        n["lens"] += glass.assign_pieces(outer, lens, lambda p: p.materials == {"Glass"} and p.area < PANE_MIN_AREA)
        n["window"] += glass.assign_faces(outer, window, lambda f: f.material == "Glass")
        n["lens"] += glass.assign_faces(outer, lens, lambda f: f.material == "Glass_Lens")
        n["red"] += glass.assign_faces(outer, red, lambda f: f.material == "Glass_TailLens")
    if inner:
        def is_inner_skin(pc):
            return pc is not None and any((pc.lo - lo).length < PANE_MATCH and (pc.hi - hi).length < PANE_MATCH
                                          for lo, hi in panes)
        n["inner_removed"] += glass.remove_faces(inner, lambda f: is_inner_skin(f.piece), with_pieces=True)
        n["cabin_glass"] += glass.assign_pieces(inner, lens, lambda p: p.hi.y <= TAIL_Y)
    n["panes"] = len(panes)
    return n


# --------------------------------------------------------------------------------------------------- lamps

def drl_bar_faces(lamp):
    """The daytime-running-light bars: on each headlamp blade, the etched lines and the blade faces between
    them. Returns (line face indices, band face indices, {blade piece index: [face indices]})."""
    faces = glass.faces(lamp, with_pieces=True)
    lines, by_piece, bars = set(), {}, {}
    for f in faces:
        if f.material == "LightKidney" and in_headlamp(f) and f.piece is not None:
            lines.add(f.index)
            by_piece.setdefault(f.piece.index, []).append(f.centre)
            bars.setdefault(f.piece.index, []).append(f.index)
    band = set()
    for f in faces:
        if f.material != "Light_Housing" or f.piece is None:
            continue
        centres = by_piece.get(f.piece.index)
        if centres and any((f.centre - c).length < DRL_BAND for c in centres):
            band.add(f.index)
            bars[f.piece.index].append(f.index)
    return lines, band, bars


def map_bar_uvs(lamp, face_indices):
    """Give one light bar UVs that run 0..1 across it (U) and 0..1 up it (V), so the shared emitter can put
    its hot core along the middle and fade the ends. Only these faces' own UV corners are rewritten."""
    me = lamp.data
    layer = me.uv_layers.active
    if layer is None or not face_indices:
        return False
    mw = lamp.matrix_world
    rot = mw.to_3x3()
    normal = Vector((0.0, 0.0, 0.0))
    for i in face_indices:
        p = me.polygons[i]
        normal += (rot @ p.normal) * p.area
    if normal.length < 1e-9:
        return False
    normal.normalize()
    up = Vector((0.0, 0.0, 1.0))
    along = up - normal * up.dot(normal)          # the bars stand near-vertical: 'up' within the blade's plane
    if along.length < 1e-6:
        return False
    along.normalize()
    across = normal.cross(along).normalized()
    corners = []
    for i in face_indices:
        p = me.polygons[i]
        for li, vi in zip(p.loop_indices, p.vertices):
            w = mw @ me.vertices[vi].co
            corners.append((li, w.dot(across), w.dot(along)))
    u0, u1 = min(c[1] for c in corners), max(c[1] for c in corners)
    v0, v1 = min(c[2] for c in corners), max(c[2] for c in corners)
    if u1 - u0 < 1e-6 or v1 - v0 < 1e-6:
        return False
    for li, a, b in corners:
        layer.data[li].uv = ((a - u0) / (u1 - u0), (b - v0) / (v1 - v0))
    return True


def assign_lamp_roles(ctx, tail_bars_lit):
    n = {"drl_lines": 0, "drl_band": 0, "drl_foot": 0, "kidney": 0, "tail": 0, "tail_bars": 0,
         "projector": 0, "bezel": 0, "housing": 0}
    lamp = mesh_object("C03_Light_Light")
    inner = mesh_object("C02_Glass_WindowInside")
    look = ctx.cfg.get("look", {}).get("drl", {})
    drl_hex, drl_strength = look.get("hex", "#FFBA00"), float(look.get("strength", 6.0))
    core, ends = float(look.get("core", 1.0)), float(look.get("ends", 1.0))
    # The shared emitter with the shared colour, strength, core and ends, but this car's own spill (see
    # DRL_SPILL). The bars get UVs made for it in map_bar_uvs: U across the bar, V up it.
    shape = {"across": (0, 0.0, 1.0), "along": (1, 0.0, 1.0), "core": core, "ends": ends}
    band_mat = lamps.emitter_material(ctx, "PL_M5_DRL_Band", drl_hex, drl_strength * DRL_BAND_GAIN,
                                      spill=DRL_SPILL * DRL_BAND_GAIN, **shape)
    darken_base(band_mat)      # clear plate, not frosted rod: it must not catch the studio light as white
    line_mat = lamps.emitter_material(ctx, "PL_M5_DRL_Line", drl_hex, drl_strength * DRL_LINE_GAIN,
                                      spill=DRL_SPILL, **shape)
    foot_mat = lamps.emitter_material(ctx, "PL_M5_DRL_Foot", drl_hex, drl_strength, spill=DRL_SPILL)
    darken_base(foot_mat)      # the foot strips face up into the softbox and showed as white slashes
    tail = lamps.emitter_material(ctx, "PL_M5_Tail", TAIL_HEX, TAIL_STRENGTH)
    if lamp:
        source = bpy.data.materials.get("Light_Housing")
        add_white_vertex_colour(lamp)
        housing = lamps.housing_material(ctx, "PL_M5_LampHousing", source=source)
        projector = lamps.projector_material(ctx, "PL_M5_Projector", source=source)
        bezel = lamps.reflector_material(ctx, "PL_M5_LampBezel", roughness=0.2, tone=0.5)
        lines, band, bars = drl_bar_faces(lamp)
        n["drl_bars"] = sum(1 for face_indices in bars.values() if map_bar_uvs(lamp, face_indices))
        lens_pieces = [p for p in glass.pieces(lamp) if in_headlamp(p) and len(p.faces) < 120]

        def is_module_bezel(pc):
            """The shroud round a projector: a headlamp part whose bounds hold a projector lens."""
            if pc is None or not in_headlamp(pc) or pc.materials != {"Light_Housing"} or len(pc.faces) < 500:
                return False
            return any(all(pc.lo[i] - 0.01 <= q.centre[i] <= pc.hi[i] + 0.01 for i in range(3))
                       and (pc.hi - pc.lo).length < 0.25 for q in lens_pieces if q is not pc)

        def is_foot_strip(pc):
            """The thin strip along the front edge of a blade's foot. The saloon marks its lit faces LightDRL
            on the foot itself, the Touring inside this strip; lighting both gives both cars the same line
            (as plain housing the strip mapped onto chrome texels and showed as a white slash)."""
            return (pc is not None and in_headlamp(pc) and len(pc.faces) < 100
                    and pc.hi.z - pc.lo.z < FOOT_STRIP_MAX_HEIGHT and (pc.hi - pc.lo).length > 0.05)

        # order matters: each call sees the material names the earlier calls left behind
        n["drl_lines"] += glass.assign_faces(lamp, line_mat, lambda f: f.index in lines)
        n["drl_band"] += glass.assign_faces(lamp, band_mat, lambda f: f.index in band)
        n["drl_foot"] += glass.assign_faces(lamp, foot_mat, lambda f: f.material == "LightDRL"
                                            or (f.material == "Light_Housing" and is_foot_strip(f.piece)),
                                            with_pieces=True)
        if KIDNEY_STRENGTH > 0:
            kidney = lamps.emitter_material(ctx, "PL_M5_KidneyGlow", KIDNEY_HEX, KIDNEY_STRENGTH, spill=KIDNEY_SPILL)
        else:
            kidney = principled_material("PL_M5_Trim_gloss_black", TRIM["gloss_black"])
        n["kidney"] += glass.assign_faces(lamp, kidney, lambda f: f.material == "LightKidney")
        n["tail"] += glass.assign_faces(lamp, tail, lambda f: f.material == "LightTail")
        n["projector"] += glass.assign_faces(
            lamp, projector, lambda f: f.material == "Light_Housing" and in_headlamp(f) and uv_inside(f, LENS_PHOTO_UV)
            and f.piece is not None and len(f.piece.faces) < 120, with_pieces=True)
        n["bezel"] += glass.assign_faces(
            lamp, bezel, lambda f: f.material == "Light_Housing" and uv_inside(f, SWATCH_UV) and is_module_bezel(f.piece),
            with_pieces=True)
        n["housing"] += glass.assign_faces(lamp, housing, lambda f: f.material == "Light_Housing")
    if inner:
        bar = tail if tail_bars_lit else lamps.lens_material(ctx, "PL_M5_TailBar")
        n["tail_bars"] += glass.assign_pieces(inner, bar, lambda p: p.lo.y > TAIL_Y)
    return n


# ----------------------------------------------------------------------------------------- trim and details

def assign_trim_roles(ctx):
    """Split the one-material trim mesh by swatch cell into what each part really is."""
    n = {}
    body = mesh_object("C01_Body_Coloured")
    if body is None:
        return n
    mats = {}

    def swatch_cell(f):
        if f.uv is None or f.material != "Trim_GlossBlack":
            return None
        return (int(f.uv[0] * 8) % 8, int((1.0 - f.uv[1]) * 8) % 8)

    for key, kind in TRIM_CELLS.items():
        if kind not in mats:
            mats[kind] = principled_material(f"PL_M5_Trim_{kind}", TRIM[kind])
        n[kind] = n.get(kind, 0) + glass.assign_faces(body, mats[kind], lambda f, key=key: swatch_cell(f) == key)
    return n


def refine_carbon_weave():
    """Tile the carbon weave finer and soften its bump. Returns how many texture nodes were remapped."""
    mat = bpy.data.materials.get("Carbon")
    if mat is None or mat.node_tree is None:
        return 0
    nt = mat.node_tree
    images = [node for node in nt.nodes if node.type == 'TEX_IMAGE' and not node.inputs["Vector"].is_linked]
    if images:
        uv = nt.nodes.new("ShaderNodeUVMap")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (CARBON_WEAVE_SCALE, CARBON_WEAVE_SCALE, 1.0)
        nt.links.new(uv.outputs["UV"], mapping.inputs["Vector"])
        for node in images:
            nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    for node in nt.nodes:
        if node.type == 'NORMAL_MAP':
            node.inputs["Strength"].default_value = CARBON_BUMP
    return len(images)


def hide_game_plate():
    """The asset's number plate is a game placeholder. Hide it; the boot lid and camera behind it are modelled."""
    plate = mesh_object("C01_Body_ManufacturerPlate")
    if plate is None or SHOW_GAME_PLATE:
        return False
    plate.hide_render = True
    plate.hide_viewport = True
    return True


def apply(ctx, tail_bars_lit=False):
    """Run both cars' role assignments. tail_bars_lit: the tail lamps' light bars are the lit part themselves
    (Touring: its lamp mesh has no lit strips behind them)."""
    roles = {
        "glass": assign_glass_roles(ctx),
        "lamps": assign_lamp_roles(ctx, tail_bars_lit),
        "trim": assign_trim_roles(ctx),
        "carbon_nodes": refine_carbon_weave(),
        "plate_hidden": hide_game_plate(),
    }
    ctx.notes["m5_roles"] = roles
    log(f"M5 roles ({ctx.car_id}): {roles}")
    return roles

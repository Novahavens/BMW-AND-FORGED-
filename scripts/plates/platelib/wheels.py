"""Catalogue wheels: swap the rim, keep the car's own tyres, discs and calipers.

OWNER: wheels. The render driver calls these:

    prepare_body(ctx)             before a body plate: factory rims on, and (config wheel_plate.neutral_reflection)
                                  the floor and the paint are shown a neutral grey rim instead of the factory
                                  rim's colour, so the body plate does not give the factory rim away under a
                                  catalogue wheel. The camera still sees the real factory rim.
    fit(ctx, wheel_id, finish_id) hide the factory rims, mount the catalogue rim on all four hubs in a finish
    factory(ctx)                  put the factory rims back
    plate_mode(ctx, on)           wheel-plate mode: transparent film, everything that is not tyre, rim, disc,
                                  caliper or the barrel backing becomes a holdout for camera rays (it still
                                  lights and reflects in the wheel); off puts every setting back
    plate_region(ctx)             (left, top, right, bottom) frame fractions around the wheels in view

How a rim is fitted (per axle, front and rear separately):
  * the rim file is read once and turned into a rim frame: X along the axle, +X the face side;
  * it is scaled so its flange has the radius of the car's factory rim flange (the factory tyre was drawn
    around that), and its outer lip is put on the plane of the factory rim's outer lip;
  * the inboard half of the barrel is stretched or shortened along the axle so the back flange also sits in
    the tyre's inner bead (rim widths differ from the factory rim's; the face and spokes are never distorted);
  * where the factory caliper would touch the barrel's drop centre, that part of the barrel is moved out
    radially (wall thickness kept) until it clears. The clearances are measured and logged for the report.
"""
import math
import os

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

from . import rubber
from .core import fail, log, srgb_to_linear

STATE_KEY = "wheels"
ROLES = ("face", "barrel", "bolts", "cap")
FLANGE_HEIGHT = 0.0175           # bead seat to flange tip on a J-flange rim (m); only used to name a file's size
CLEARANCE = 0.004                # the barrel is opened up until the caliper has this much room (m)
GRID = 8                         # crop boxes snap outward to this many full-resolution pixels

# Cycles values for a finish that the config does not spell out, and the parts that do not take the finish.
FINISH_DEFAULTS = {"metallic": 1.0, "roughness": 0.3, "coat": 1.0, "coat_roughness": 0.03, "flake": 0.0, "flake_scale": 1400.0,
                   "flop": 1.0, "peel": 0.0, "anisotropic": 0.0, "sheen": 0.0, "specular": 0.5, "hardware": "bright"}
HARDWARE = {
    "bright": {"base": (0.62, 0.62, 0.63), "metallic": 1.0, "roughness": 0.2, "coat": 0.0},
    "dark": {"base": (0.05, 0.05, 0.055), "metallic": 1.0, "roughness": 0.3, "coat": 0.0},
}
CAP = {"base": (0.014, 0.014, 0.015), "metallic": 0.0, "roughness": 0.35, "coat": 0.6, "coat_roughness": 0.08}
NEUTRAL_RIM = {"base": (0.33, 0.33, 0.33), "metallic": 0.6, "roughness": 0.45}


def _state(ctx):
    return ctx.notes.setdefault(STATE_KEY, {"templates": {}, "fitted": {}, "mounted": {}, "active": "factory", "reports": {},
                                            "plate": None, "neutral": False})


def _show(obj, on):
    """Visible or hidden for the render and for ray casts alike."""
    obj.hide_render = not on
    obj.hide_viewport = not on


# ---------------------------------------------------------------------------------------------------------
# Reading a rim file
# ---------------------------------------------------------------------------------------------------------
def _role_of(name):
    n = name.lower()
    if "barrel" in n or "lip" in n:
        return "barrel"
    if "cap" in n:
        return "cap"
    if any(w in n for w in ("bolt", "nut", "lug", "hardware")):
        return "bolts"
    return "face"


def _mesh_points(me):
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def _import_gltf(path):
    """Import a .glb and return the objects it added. Stops with the file's name when it cannot be read."""
    if not os.path.isfile(path):
        fail(f"rim file not found: {path} (decode the site's rims with scripts/plates/decode-rims.mjs)")
    before = set(bpy.data.objects)
    mats_before = set(bpy.data.materials)
    try:
        if not hasattr(bpy.ops.import_scene, "gltf"):
            import addon_utils
            addon_utils.enable("io_scene_gltf2", default_set=False)
        result = bpy.ops.import_scene.gltf(filepath=path)
    except (RuntimeError, OSError, ValueError, ImportError, AttributeError) as e:
        fail(f"could not import rim file {path}: {e}")
    added = [o for o in bpy.data.objects if o not in before]
    if 'FINISHED' not in result or not any(o.type == 'MESH' for o in added):
        fail(f"rim file {path} imported no meshes (is it meshopt-compressed? Blender cannot read those)")
    return added, [m for m in bpy.data.materials if m not in mats_before]


def load_rim(ctx, filename):
    """Read one rim file into a template: meshes per role in the rim frame (X = axle, +X = face side), with its measurements."""
    st = _state(ctx)
    if filename in st["templates"]:
        return st["templates"][filename]
    path = os.path.join(ctx.cfg.source(ctx.cfg["sources"]["rims"]), filename)
    added, new_materials = _import_gltf(path)
    bpy.context.view_layer.update()
    parts = []
    for obj in added:
        if obj.type != 'MESH' or not len(obj.data.vertices):
            continue
        m = np.array(obj.matrix_world)
        parts.append((_role_of(obj.name), obj, _mesh_points(obj.data) @ m[:3, :3].T + m[:3, 3]))
    every = np.concatenate([p for _, _, p in parts])
    lo, hi = every.min(0), every.max(0)
    size = hi - lo
    axle = int(np.argmin(size))
    others = [i for i in range(3) if i != axle]
    if size[axle] > 0.8 * min(size[others]) or size[axle] < 0.2 * max(size[others]):
        fail(f"rim file {path}: size {np.round(size, 3).tolist()} has no clear axle, or is not a complete rim (face only?)")
    centre = (lo + hi) / 2
    face_pts = [p for role, _, p in parts if role == "face"]
    probe = np.concatenate(face_pts) if face_pts else every[np.hypot(*(every[:, others] - centre[others]).T) < 0.3 * size[others[0]] / 2]
    sign = 1.0 if probe[:, axle].mean() >= centre[axle] else -1.0
    u = np.zeros(3)
    u[axle] = sign
    v = np.zeros(3)
    v[others[0]] = 1.0
    w = np.cross(u, v)
    rot = np.stack([u, v, w])                                    # world -> rim frame (proper rotation)
    template = {"file": filename, "meshes": {}, "tris": 0}
    for role, obj, pts in parts:
        rim_pts = (pts - centre) @ rot.T
        me = obj.data
        me.vertices.foreach_set("co", rim_pts.astype(np.float32).ravel())
        me.materials.clear()
        me.update()
        me.use_fake_user = True
        me.name = f"PLW_tpl_{os.path.splitext(filename)[0]}_{role}_{len(template['meshes'].get(role, []))}"
        template["meshes"].setdefault(role, []).append(me)
        template["tris"] += sum(len(p.vertices) - 2 for p in me.polygons)
    for obj in added:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mat in new_materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    allp = np.concatenate([_mesh_points(me) for lst in template["meshes"].values() for me in lst])
    radius = np.hypot(allp[:, 1], allp[:, 2])
    barrel = (np.concatenate([_mesh_points(me) for me in template["meshes"]["barrel"]]) if "barrel" in template["meshes"]
              else allp[radius >= 0.93 * radius.max()])
    face = np.concatenate([_mesh_points(me) for me in template["meshes"].get("face", [])]) if "face" in template["meshes"] else allp
    hub_zone = face[np.hypot(face[:, 1], face[:, 2]) < 0.3 * radius.max()]
    template.update({
        "flange_radius": float(radius.max()),
        "lip_x": float(barrel[:, 0].max()),
        "back_x": float(barrel[:, 0].min()),
        "pad_x": float(hub_zone[:, 0].min()) if len(hub_zone) else float(barrel[:, 0].max() - 0.4 * (barrel[:, 0].max() - barrel[:, 0].min())),
        "inches": 2.0 * (float(radius.max()) - FLANGE_HEIGHT) / 0.0254,
        "width_j": (float(barrel[:, 0].max() - barrel[:, 0].min()) - 0.026) / 0.0254,
    })
    st["templates"][filename] = template
    log(f"RIM {filename}: {template['tris']} triangles, roles {sorted(template['meshes'])}, flange r={template['flange_radius']:.4f} "
        f"(about {template['inches']:.1f} x {template['width_j']:.1f}J), lip x={template['lip_x']:+.4f} pad x={template['pad_x']:+.4f} "
        f"back x={template['back_x']:+.4f}")
    return template


# ---------------------------------------------------------------------------------------------------------
# Fitting a rim to an axle
# ---------------------------------------------------------------------------------------------------------
def _swept_clearance(rim_ar, brake_ar):
    """Smallest distance between two sets of (axial, radius) points: the gap between the swept volumes."""
    if not len(rim_ar) or not len(brake_ar):
        return float("inf")
    rim = np.unique(np.round(rim_ar, 3), axis=0)
    best = float("inf")
    for i in range(0, len(brake_ar), 256):
        block = brake_ar[i:i + 256]
        d = np.hypot(block[:, None, 0] - rim[None, :, 0], block[:, None, 1] - rim[None, :, 1])
        best = min(best, float(d.min()))
    return best


def _polar(points):
    return np.stack([points[:, 0], np.hypot(points[:, 1], points[:, 2])], axis=1)


def _fit_axle(ctx, wheel, axle):
    """Fitted meshes of one catalogue wheel for one axle (hub frame, outboard = +X), and the fitment numbers."""
    st = _state(ctx)
    key = (wheel["id"], axle)
    if key in st["fitted"]:
        return st["fitted"][key]
    asms = rubber.assemblies(ctx)
    pair = [a for a in asms.values() if a.axle == axle]
    m = pair[0].measure
    for other in pair[1:]:
        for name in ("flange_radius", "lip_axial", "back_axial"):
            if abs(other.measure[name] - m[name]) > 0.004:
                log(f"WARNING {ctx.car_id} {axle}: left and right {name} differ ({m[name]:.4f} / {other.measure[name]:.4f}); using {pair[0].corner}")
    brake = np.concatenate([a.brake_points for a in pair]) if pair else np.zeros((0, 2))
    filename = wheel.get("rear") if (axle == "rear" and wheel.get("rear")) else wheel["front"]
    tpl = load_rim(ctx, filename)
    scale = m["flange_radius"] / tpl["flange_radius"]
    try:
        tyre_inches = float(str(ctx.car["tyres"][axle]).upper().split("R")[-1])
    except (KeyError, ValueError):
        tyre_inches = 0.0
    nominal = tyre_inches / tpl["inches"] if tyre_inches else scale
    if abs(scale / nominal - 1.0) > 0.03:
        log(f"WARNING {ctx.car_id} {axle} {wheel['id']}: flange match gives scale {scale:.4f} but the tyre size gives {nominal:.4f}; using the tyre size")
        scale = nominal
    lip, back = m["lip_axial"], m["back_axial"]

    def uniform(points):
        out = points * scale
        out[:, 0] = lip + scale * (points[:, 0] - tpl["lip_x"])
        return out

    # barrel: uniform from the lip to the mounting-pad plane, then stretched to reach the factory back flange
    split_x = tpl["pad_x"]
    split_a = lip + scale * (split_x - tpl["lip_x"])
    stretch = (split_a - back) / max(1e-6, split_x - tpl["back_x"])
    if not 0.6 * scale <= stretch <= 1.6 * scale:
        log(f"WARNING {ctx.car_id} {axle} {wheel['id']}: barrel stretch {stretch / scale:.2f} is out of range; the barrel keeps its own width")
        stretch = scale
    # centre (face, cap, bolts): moved outboard as one piece when the spokes would run into the caliper, the
    # way a wheel is built with more disc offset for big brakes; it never passes the lip plane
    centre_pts = {role: [uniform(_mesh_points(me)) for me in meshes] for role, meshes in tpl["meshes"].items() if role != "barrel"}
    centre_all = np.concatenate([p for lst in centre_pts.values() for p in lst]) if centre_pts else np.zeros((0, 3))
    centre_ar = _polar(centre_all)
    room = max(0.0, lip - 0.002 - float(centre_all[:, 0].max())) if len(centre_all) else 0.0
    face_shift = 0.0
    for _ in range(12):
        gap = _swept_clearance(centre_ar + np.array([face_shift, 0.0]), brake)
        if gap >= CLEARANCE or face_shift >= room:
            break
        face_shift = min(room, face_shift + (CLEARANCE - gap) + 0.001)
    fitted = {"meshes": {}, "file": filename}
    barrel_shift = 0.0
    polar_face, polar_barrel = [], []
    placed, field = {}, None
    for n, me_tpl in enumerate(tpl["meshes"].get("barrel", [])):
        pts = _mesh_points(me_tpl)
        new = uniform(pts)
        inboard = pts[:, 0] < split_x
        new[inboard, 0] = split_a + stretch * (pts[inboard, 0] - split_x)
        extra = 0.0
        for _ in range(4):                                        # until the measured gap is there
            field = _caliper_shift_field(new, brake, extra)
            opened, shift = _move_out(new, field)
            gap = _swept_clearance(_polar(opened), brake)
            if gap >= CLEARANCE - 0.0015 or not len(brake):
                break
            extra += CLEARANCE - gap
        barrel_shift = max(barrel_shift, shift)
        polar_barrel.append(_polar(opened))
        placed[("barrel", n)] = opened
    for role, lst in centre_pts.items():
        for n, new in enumerate(lst):
            new[:, 0] += face_shift
            new, _ = _move_out(new, field, near_barrel_only=True)   # spoke ends follow the barrel wall
            polar_face.append(_polar(new))
            placed[(role, n)] = new
    for role, meshes in tpl["meshes"].items():
        for n, me_tpl in enumerate(meshes):
            me = me_tpl.copy()
            me.use_fake_user = False
            me.name = f"PLW_{wheel['id']}_{axle}_{role}"
            me.vertices.foreach_set("co", placed[(role, n)].astype(np.float32).ravel())
            me.update()
            fitted["meshes"].setdefault(role, []).append(me)
    rim_ar = np.concatenate(polar_face + polar_barrel)
    near_lip = rim_ar[rim_ar[:, 0] >= lip - 0.012]
    report = {
        "car": ctx.car_id, "wheel": wheel["id"], "axle": axle, "file": filename,
        "file_size": f"{tpl['inches']:.1f}x{tpl['width_j']:.1f}J", "tyre": ctx.car["tyres"].get(axle, ""),
        "scale": scale, "nominal_scale": nominal,
        "lip_axial": lip, "back_axial": back, "barrel_stretch": stretch / scale,
        "flange_radius": float(near_lip[:, 1].max()), "bead_radius": m["bead_radius"],
        "flange_over_bead": float(near_lip[:, 1].max()) - m["bead_radius"],
        "lip_past_tyre": float(rim_ar[:, 0].max()) - m["tyre_half_width"],
        "pad_axial": split_a + face_shift, "pad_to_hub_face": split_a + face_shift - m.get("hub_face_axial", split_a + face_shift),
        "face_moved_out": face_shift, "face_behind_lip": lip - float(np.concatenate(polar_face)[:, 0].max()) if polar_face else 0.0,
        "barrel_opened": barrel_shift,
        "caliper_to_barrel": _swept_clearance(np.concatenate(polar_barrel), brake) if polar_barrel else float("inf"),
        "caliper_to_face": _swept_clearance(np.concatenate(polar_face), brake) if polar_face else float("inf"),
    }
    fitted["report"] = report
    st["fitted"][key] = fitted
    st["reports"][key] = report
    log(f"FIT {ctx.car_id} {axle} {wheel['id']} ({filename}, {report['file_size']} on {report['tyre']}): scale {scale:.4f} (tyre size says {nominal:.4f}) "
        f"lip a={lip:+.4f} pad a={report['pad_axial']:+.4f} ({report['pad_to_hub_face'] * 1000:+.1f} mm from the hub face) "
        f"flange over tyre bead {report['flange_over_bead'] * 1000:.1f} mm, barrel stretch x{report['barrel_stretch']:.3f}, "
        f"centre moved out {face_shift * 1000:.1f} mm, "
        f"barrel opened {barrel_shift * 1000:.1f} mm, caliper to barrel {report['caliper_to_barrel'] * 1000:.1f} mm, "
        f"caliper to spokes {report['caliper_to_face'] * 1000:.1f} mm")
    if report["caliper_to_face"] < CLEARANCE - 0.0005:
        log(f"WARNING {ctx.car_id} {axle} {wheel['id']}: the spokes still come within {report['caliper_to_face'] * 1000:.1f} mm of the "
            f"caliper's swept volume after moving the centre out {face_shift * 1000:.1f} mm (no room left behind the lip)")
    return fitted


def _caliper_shift_field(points, brake, extra=0.0):
    """How far the barrel must move out along the axle for the caliper: (grid, shift, inner radius) or None."""
    if not len(brake):
        return None
    a = points[:, 0]
    r = np.hypot(points[:, 1], points[:, 2])
    grid = np.arange(a.min() - 0.002, a.max() + 0.004, 0.001)
    # inner radius of the barrel along the axle (rings of vertices; straight runs between them are interpolated)
    stations = np.round(a, 3)
    order = np.argsort(stations)
    uniq, first = np.unique(stations[order], return_index=True)
    inner = np.minimum.reduceat(r[order], first)
    # a ring that only the outer skin has would read too large: take the smallest radius within 4 mm
    inner = np.array([inner[np.abs(uniq - u) <= 0.004].min() for u in uniq])
    inner_grid = np.interp(grid, uniq, inner)
    # what the caliper needs along the axle: its largest radius within 6 mm, plus the clearance
    need = np.zeros_like(grid)
    for i, g in enumerate(grid):
        near = brake[np.abs(brake[:, 0] - g) <= 0.006]
        if len(near):
            need[i] = near[:, 1].max() + CLEARANCE + extra
    deficit = np.maximum(0.0, need - inner_grid)
    if deficit.max() <= 0.0:
        return None
    # widen by 12 mm each way and soften the ends so the barrel stays a smooth surface of revolution
    wide = np.array([deficit[max(0, i - 12):i + 13].max() for i in range(len(grid))])
    smooth = np.maximum(np.convolve(wide, np.ones(13) / 13.0, mode="same"), deficit)
    return grid, smooth, inner_grid


def _move_out(points, field, near_barrel_only=False):
    """Apply a shift field radially. With near_barrel_only, only what reaches the barrel wall moves (spoke ends)."""
    if field is None:
        return points, 0.0
    grid, smooth, inner_grid = field
    a = points[:, 0]
    r = np.hypot(points[:, 1], points[:, 2])
    shift = np.interp(a, grid, smooth, left=0.0, right=0.0)
    if near_barrel_only:
        wall = np.interp(a, grid, inner_grid)
        shift = shift * np.clip((r - 0.8 * wall) / (0.2 * wall), 0.0, 1.0)
    factor = np.where(r > 1e-6, (r + shift) / np.maximum(r, 1e-6), 1.0)
    out = points.copy()
    out[:, 1] *= factor
    out[:, 2] *= factor
    return out, float(shift.max()) if len(shift) else 0.0


# ---------------------------------------------------------------------------------------------------------
# Finishes
# ---------------------------------------------------------------------------------------------------------
def _linear_rgb(value):
    """A config colour: '#RRGGBB' (sRGB) or [r, g, b] already linear."""
    if isinstance(value, str):
        h = value.lstrip("#")
        if len(h) != 6:
            fail(f"bad wheel colour {value!r}, expected #RRGGBB or [r, g, b]")
        try:
            return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))
        except ValueError:
            fail(f"bad wheel colour {value!r}, expected #RRGGBB or [r, g, b]")
    try:
        r, g, b = (float(v) for v in value)
    except (TypeError, ValueError):
        fail(f"bad wheel colour {value!r}, expected #RRGGBB or [r, g, b]")
    return (r, g, b)


def finish_values(ctx, finish_id):
    """Cycles values of a finish: the config entry's 'cycles' block over the defaults (old real-time numbers as fallback)."""
    entry = ctx.cfg.wheel_finish(finish_id)
    cy = dict(entry.get("cycles") or {})
    values = {**FINISH_DEFAULTS, **cy}
    if "base" not in cy:
        values["base"] = entry["hex"]
        values.setdefault("metallic", entry.get("metalness", 1.0))
        values["roughness"] = cy.get("roughness", entry.get("roughness", 0.3))
        values["coat"] = cy.get("coat", entry.get("clearcoat", 1.0))
    values["base"] = _linear_rgb(values["base"])
    return values


def _rim_material(name):
    """One layered metal/paint shader. Its values are set by _set_rim_material; the node graph never changes."""
    mat = bpy.data.materials.get(name)
    if mat is not None and mat.get("plw_rim_shader"):
        return mat
    if mat is not None:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nt = mat.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.name = "PLW_BSDF"
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    coords = nt.nodes.new("ShaderNodeTexCoord")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    # face / flop: metallic paint is darker where the surface turns away from the eye
    facing = nt.nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.35
    flop = nt.nodes.new("ShaderNodeMix")
    flop.name = "PLW_Flop"
    flop.data_type = 'RGBA'
    nt.links.new(facing.outputs["Facing"], rubber.enabled_socket(flop.inputs, "Factor"))
    nt.links.new(rubber.enabled_socket(flop.outputs, "Result"), bsdf.inputs["Base Color"])
    # flake: one small random tilt per cell of the base normal only (the coat stays smooth)
    cells = nt.nodes.new("ShaderNodeTexVoronoi")
    cells.name = "PLW_FlakeCells"
    cells.feature = 'F1'
    nt.links.new(coords.outputs["Object"], cells.inputs["Vector"])
    tilt = nt.nodes.new("ShaderNodeVectorMath")
    tilt.operation = 'SUBTRACT'
    tilt.inputs[1].default_value = (0.5, 0.5, 0.5)
    nt.links.new(cells.outputs["Color"], tilt.inputs[0])
    scaled = nt.nodes.new("ShaderNodeVectorMath")
    scaled.name = "PLW_FlakeTilt"
    scaled.operation = 'SCALE'
    nt.links.new(tilt.outputs["Vector"], scaled.inputs[0])
    add = nt.nodes.new("ShaderNodeVectorMath")
    add.operation = 'ADD'
    nt.links.new(geo.outputs["Normal"], add.inputs[0])
    nt.links.new(scaled.outputs["Vector"], add.inputs[1])
    unit = nt.nodes.new("ShaderNodeVectorMath")
    unit.operation = 'NORMALIZE'
    nt.links.new(add.outputs["Vector"], unit.inputs[0])
    nt.links.new(unit.outputs["Vector"], bsdf.inputs["Normal"])
    # orange peel on the clear coat only
    peel_noise = nt.nodes.new("ShaderNodeTexNoise")
    peel_noise.inputs["Scale"].default_value = 260.0
    peel_noise.inputs["Detail"].default_value = 1.0
    nt.links.new(coords.outputs["Object"], peel_noise.inputs["Vector"])
    peel = nt.nodes.new("ShaderNodeBump")
    peel.name = "PLW_Peel"
    if "Distance" in peel.inputs:
        peel.inputs["Distance"].default_value = 0.0008
    nt.links.new(peel_noise.outputs["Fac"], peel.inputs["Height"])
    if "Coat Normal" in bsdf.inputs:
        nt.links.new(peel.outputs[0], bsdf.inputs["Coat Normal"])
    # turned or brushed metal: highlights stretch around the axle (rim meshes are stored with X along the axle)
    tangent = nt.nodes.new("ShaderNodeTangent")
    tangent.direction_type = 'RADIAL'
    tangent.axis = 'X'
    if "Tangent" in bsdf.inputs:
        nt.links.new(tangent.outputs[0], bsdf.inputs["Tangent"])
    mat["plw_rim_shader"] = True
    return mat


def _set_rim_material(mat, v):
    nt = mat.node_tree
    bsdf, flop = nt.nodes["PLW_BSDF"], nt.nodes["PLW_Flop"]
    base = tuple(v["base"])
    rubber.enabled_socket(flop.inputs, "A").default_value = (*base, 1.0)
    rubber.enabled_socket(flop.inputs, "B").default_value = (*(c * float(v.get("flop", 1.0)) for c in base), 1.0)
    for name, key, default in (("Metallic", "metallic", 1.0), ("Roughness", "roughness", 0.3), ("Coat Weight", "coat", 0.0),
                               ("Coat Roughness", "coat_roughness", 0.03), ("Anisotropic", "anisotropic", 0.0),
                               ("Sheen Weight", "sheen", 0.0), ("Specular IOR Level", "specular", 0.5)):
        rubber.set_socket(bsdf, name, float(v.get(key, default)))
    rubber.set_socket(bsdf, "Coat IOR", 1.5)
    rubber.set_socket(bsdf, "Sheen Roughness", 0.5)
    nt.nodes["PLW_FlakeCells"].inputs["Scale"].default_value = float(v.get("flake_scale", 1400.0))
    nt.nodes["PLW_FlakeTilt"].inputs["Scale"].default_value = float(v.get("flake", 0.0))
    nt.nodes["PLW_Peel"].inputs["Strength"].default_value = float(v.get("peel", 0.0))


def _part_values(ctx, wheel, role, finish):
    """Values for one role of a wheel: the finish, unless the wheel's config gives that part its own look."""
    own = (wheel.get("parts") or {}).get(role)
    if own:
        if "finish" in own:
            return finish_values(ctx, own["finish"])
        values = {**FINISH_DEFAULTS, "coat": 0.0, **own}
        values["base"] = _linear_rgb(values.get("base", (0.6, 0.6, 0.6)))
        return values
    if role == "bolts":
        return {**FINISH_DEFAULTS, **HARDWARE.get(finish.get("hardware", "bright"), HARDWARE["bright"])}
    if role == "cap":
        return {**FINISH_DEFAULTS, **CAP}
    return finish


def _apply_finish(ctx, wheel, finish_id):
    finish = finish_values(ctx, finish_id)
    st = _state(ctx)
    for role in ROLES:
        mat = _rim_material(f"PLW_Rim_{role}")
        _set_rim_material(mat, _part_values(ctx, wheel, role, finish))
        for objs in st["mounted"].get(wheel["id"], {}).values():
            for obj in objs:
                if obj.get("plw_role") == role:
                    if len(obj.data.materials):
                        obj.data.materials[0] = mat
                    else:
                        obj.data.materials.append(mat)


# ---------------------------------------------------------------------------------------------------------
# Mounting
# ---------------------------------------------------------------------------------------------------------
def _mount(ctx, wheel):
    """Rim objects of one catalogue wheel on all four hubs (made once per scene, then shown or hidden)."""
    st = _state(ctx)
    if wheel["id"] in st["mounted"]:
        return st["mounted"][wheel["id"]]
    asms = rubber.assemblies(ctx)
    mounted = {}
    for corner, asm in asms.items():
        fitted = _fit_axle(ctx, wheel, asm.axle)
        objs = []
        for role, meshes in fitted["meshes"].items():
            for n, me in enumerate(meshes):
                obj = bpy.data.objects.new(f"PLW_{wheel['id']}_{corner}_{role}{n or ''}", me)
                for coll in asm.hub.users_collection:
                    coll.objects.link(obj)
                obj.parent = asm.hub
                obj.matrix_parent_inverse = Matrix.Identity(4)
                if asm.outward < 0:
                    obj.matrix_basis = Matrix.Rotation(math.pi, 4, 'Z')     # turned, not mirrored: the same rim on both sides
                obj[rubber.PART_KEY] = "rim"
                obj[rubber.CORNER_KEY] = corner
                obj["plw_role"] = role
                obj["plw_wheel"] = wheel["id"]
                rubber.rim_light_receivers().objects.link(obj)
                objs.append(obj)
        mounted[corner] = objs
    st["mounted"][wheel["id"]] = mounted
    bpy.context.view_layer.update()
    return mounted


def _set_active(ctx, wheel_id):
    """Show the rims of wheel_id ('factory' for the car's own) and hide every other rim."""
    st = _state(ctx)
    asms = rubber.assemblies(ctx)
    for asm in asms.values():
        for obj in asm.parts["factory_rim"]:
            _show(obj, wheel_id == "factory")
    for wid, mounted in st["mounted"].items():
        for objs in mounted.values():
            for obj in objs:
                _show(obj, wid == wheel_id)
    st["active"] = wheel_id
    bpy.context.view_layer.update()


def active_wheel_objects(ctx):
    """Every object that belongs in a wheel plate right now: tyres, discs, calipers, backings and the rims shown."""
    st = _state(ctx)
    asms = rubber.assemblies(ctx)
    objs = [o for asm in asms.values() for o in asm.objects("tyre", "disc", "caliper", "backing")]
    if st["active"] == "factory":
        objs += [o for asm in asms.values() for o in asm.parts["factory_rim"]]
    else:
        objs += [o for lst in st["mounted"].get(st["active"], {}).values() for o in lst]
    return objs


def fit(ctx, wheel_id, finish_id):
    """Mount catalogue wheel wheel_id in finish finish_id on all four hubs; the factory rims are hidden."""
    wheel = ctx.cfg.wheel(wheel_id)
    ctx.cfg.wheel_finish(finish_id)
    _mount(ctx, wheel)
    _apply_finish(ctx, wheel, finish_id)
    _set_active(ctx, wheel_id)
    _state(ctx)["finish"] = finish_id


def factory(ctx):
    """The car's own rims back on; every catalogue rim hidden."""
    _set_active(ctx, "factory")
    _state(ctx)["finish"] = "factory"


def fit_reports(ctx):
    """Fitment numbers gathered so far: {(wheel_id, axle): {...}}."""
    return dict(_state(ctx)["reports"])


# ---------------------------------------------------------------------------------------------------------
# Body plates: a neutral rim for everything but the camera
# ---------------------------------------------------------------------------------------------------------
def _neutral_switches(ctx):
    """Give each factory-rim material a switch that shows diffuse and glossy rays a neutral grey rim instead."""
    st = _state(ctx)
    if "switches" in st:
        return st["switches"]
    switches = []
    copies = {}
    for asm in rubber.assemblies(ctx).values():
        for obj in asm.parts["factory_rim"]:
            for slot in obj.material_slots:
                src = slot.material
                if src is None or src.node_tree is None:
                    continue
                if src.name not in copies:
                    mat = src.copy()
                    mat.name = f"PLW_FactoryRim_{src.name}"
                    nt = mat.node_tree
                    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
                    if out is None or not out.inputs["Surface"].is_linked:
                        copies[src.name] = src
                        continue
                    shader = out.inputs["Surface"].links[0].from_socket
                    path = nt.nodes.new("ShaderNodeLightPath")
                    either = nt.nodes.new("ShaderNodeMath")
                    either.operation = 'MAXIMUM'
                    nt.links.new(path.outputs["Is Diffuse Ray"], either.inputs[0])
                    nt.links.new(path.outputs["Is Glossy Ray"], either.inputs[1])
                    gate = nt.nodes.new("ShaderNodeMath")
                    gate.name = "PLW_NeutralGate"
                    gate.operation = 'MULTIPLY'
                    gate.inputs[1].default_value = 0.0
                    nt.links.new(either.outputs[0], gate.inputs[0])
                    grey = nt.nodes.new("ShaderNodeBsdfPrincipled")
                    rubber.set_socket(grey, "Base Color", (*NEUTRAL_RIM["base"], 1.0))
                    rubber.set_socket(grey, "Metallic", NEUTRAL_RIM["metallic"])
                    rubber.set_socket(grey, "Roughness", NEUTRAL_RIM["roughness"])
                    mix = nt.nodes.new("ShaderNodeMixShader")
                    nt.links.new(gate.outputs[0], mix.inputs[0])
                    nt.links.new(shader, mix.inputs[1])
                    nt.links.new(grey.outputs[0], mix.inputs[2])
                    nt.links.new(mix.outputs[0], out.inputs["Surface"])
                    switches.append(gate)
                    copies[src.name] = mat
                slot.material = copies[src.name]
    st["switches"] = switches
    return switches


def _set_neutral(ctx, on):
    for gate in _neutral_switches(ctx):
        gate.inputs[1].default_value = 1.0 if on else 0.0
    _state(ctx)["neutral"] = bool(on)


def prepare_body(ctx):
    """Before a body plate: factory rims in place; floor and paint are shown a neutral rim (see module text)."""
    rubber.assemblies(ctx)
    if _state(ctx)["active"] != "factory":
        factory(ctx)
    _set_neutral(ctx, bool(ctx.cfg.get("wheel_plate", {}).get("neutral_reflection", True)))


# ---------------------------------------------------------------------------------------------------------
# Wheel plates
# ---------------------------------------------------------------------------------------------------------
def _edge_inset_group(steps):
    """Compositor group: keep only fully covered pixels and pull the matte in by `steps` pixels with a short ramp.

    The body plate already holds the tyre, so partly covered pixels on the tyre's outline must come from the
    body plate alone; a wheel plate laid over them would count the tyre twice and leave a dark fringe.
    """
    name = f"PLW_PlateEdge_{steps}"
    tree = bpy.data.node_groups.get(name)
    if tree is not None:
        return tree
    tree = bpy.data.node_groups.new(name, "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    layers = tree.nodes.new("CompositorNodeRLayers")
    out = tree.nodes.new("NodeGroupOutput")
    full = tree.nodes.new("ShaderNodeMath")
    full.operation = 'GREATER_THAN'
    full.inputs[1].default_value = 0.995
    tree.links.new(layers.outputs["Alpha"], full.inputs[0])
    total = None
    for k in range(1, steps + 1):
        erode = tree.nodes.new("CompositorNodeDilateErode")
        erode.inputs["Size"].default_value = -k
        tree.links.new(full.outputs[0], erode.inputs["Mask"])
        if total is None:
            total = erode.outputs[0]
        else:
            add = tree.nodes.new("ShaderNodeMath")
            add.operation = 'ADD'
            tree.links.new(total, add.inputs[0])
            tree.links.new(erode.outputs[0], add.inputs[1])
            total = add.outputs[0]
    mean = tree.nodes.new("ShaderNodeMath")
    mean.operation = 'MULTIPLY'
    mean.inputs[1].default_value = 1.0 / steps
    tree.links.new(total, mean.inputs[0])
    matte = tree.nodes.new("CompositorNodeSetAlpha")                   # default type: apply mask (premultiplied result)
    tree.links.new(layers.outputs["Image"], matte.inputs["Image"])
    tree.links.new(mean.outputs[0], matte.inputs["Alpha"])
    tree.links.new(matte.outputs[0], out.inputs[0])
    return tree


def plate_mode(ctx, on=True):
    """Wheel-plate mode on or off. Off restores exactly what on changed."""
    st = _state(ctx)
    sc = ctx.scene
    saved = st["plate"]
    if not on:
        if saved is None:
            return
        for name, was in saved["holdout"].items():
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.is_holdout = was
        sc.render.film_transparent = saved["film"]
        sc.render.use_compositing = saved["use_compositing"]
        if hasattr(sc, "compositing_node_group"):
            sc.compositing_node_group = saved["group"]
        _set_neutral(ctx, saved["neutral"])
        st["plate"] = None
        return
    if saved is None:
        saved = {"holdout": {}, "film": sc.render.film_transparent, "use_compositing": sc.render.use_compositing,
                 "group": getattr(sc, "compositing_node_group", None), "neutral": st["neutral"]}
        st["plate"] = saved
    keep = {o.name for o in active_wheel_objects(ctx)}
    for obj in sc.objects:
        if obj.type not in ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META', 'VOLUME', 'POINTCLOUD', 'CURVES'):
            continue
        saved["holdout"].setdefault(obj.name, obj.is_holdout)
        obj.is_holdout = obj.name not in keep
    sc.render.film_transparent = True
    _set_neutral(ctx, False)                                           # the wheel itself is always lit by the real rim
    steps = int(ctx.cfg.get("wheel_plate", {}).get("edge_inset_px", 2))
    if steps > 0 and hasattr(sc, "compositing_node_group"):
        try:
            sc.compositing_node_group = _edge_inset_group(steps)
            sc.render.use_compositing = True
        except (RuntimeError, TypeError, AttributeError, KeyError) as e:
            log(f"WARNING wheel plate: the edge inset could not be set up ({e}); the plate keeps its raw coverage alpha")
            sc.compositing_node_group = saved["group"]
    elif steps > 0:
        log("WARNING wheel plate: this Blender has no compositor node group on the scene; the plate keeps its raw coverage alpha")


def _visible_points(ctx, asm, depsgraph, limit=2500):
    """Frame positions (x right, y down, 0..1) of the points of this wheel's tyre that the camera can see."""
    sc, cam = ctx.scene, ctx.cam
    origin = cam.matrix_world.translation
    seen = []
    for tyre in asm.parts["tyre"]:
        m = tyre.matrix_world
        verts = tyre.data.vertices
        step = max(1, len(verts) // limit)
        for i in range(0, len(verts), step):
            p = m @ verts[i].co
            uv = world_to_camera_view(sc, cam, p)
            if uv.z <= 0.0 or not (0.0 <= uv.x <= 1.0 and 0.0 <= uv.y <= 1.0):
                continue
            ray = p - origin
            dist = ray.length
            hit, loc, _normal, _index, obj, _matrix = sc.ray_cast(depsgraph, origin, ray / dist, distance=dist + 0.02)
            if (not hit) or (loc - p).length < 0.012 or (obj is not None and obj.get(rubber.CORNER_KEY) == asm.corner):
                seen.append((uv.x, 1.0 - uv.y))
    return seen


def _rim_is_visible(ctx, asm, depsgraph):
    """True when the camera sees any of the wheel inside the tyre (rim, spokes, disc), from either side."""
    sc, cam = ctx.scene, ctx.cam
    origin = cam.matrix_world.translation
    m = asm.measure
    world = asm.hub.matrix_world
    for axial in (m["lip_axial"] - 0.004, m["back_axial"] + 0.004):
        for radius in (m["flange_radius"] * 0.96, m["flange_radius"] * 0.7, m["flange_radius"] * 0.4):
            for k in range(24):
                ang = 2 * math.pi * k / 24
                p = world @ Vector((axial * asm.outward, radius * math.cos(ang), radius * math.sin(ang)))
                uv = world_to_camera_view(sc, cam, p)
                if uv.z <= 0.0 or not (0.0 <= uv.x <= 1.0 and 0.0 <= uv.y <= 1.0):
                    continue
                ray = p - origin
                dist = ray.length
                hit, loc, _normal, _index, obj, _matrix = sc.ray_cast(depsgraph, origin, ray / dist, distance=dist + 0.02)
                if not hit or (loc - p).length < 0.012:
                    return True
                if obj is not None and obj.get(rubber.CORNER_KEY) == asm.corner and obj.get(rubber.PART_KEY) != "tyre":
                    return True
    return False


def plate_region(ctx):
    """Crop box (left, top, right, bottom; frame fractions, origin top-left) around the wheels the camera sees."""
    asms = rubber.assemblies(ctx)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    pts = []
    for asm in asms.values():
        seen = _visible_points(ctx, asm, depsgraph)
        # a wheel of which only tyre shows (a sliver at the frame edge or under the car) is the same in every
        # plate and in the body plate, so it does not need to be in the box
        if len(seen) >= 3 and _rim_is_visible(ctx, asm, depsgraph):
            pts.extend(seen)
    if not pts:
        log(f"WHEEL PLATE {ctx.car_id} {ctx.view_id}: no wheel is visible; the plate is the whole (empty) frame")
        return None
    width, height = int(ctx.cfg["frame"]["width"]), int(ctx.cfg["frame"]["height"])
    pad = float(ctx.cfg.get("wheel_plate", {}).get("pad_px", 6)) + 2.0
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    left = max(0, math.floor((min(xs) * width - pad) / GRID) * GRID)
    top = max(0, math.floor((min(ys) * height - pad) / GRID) * GRID)
    right = min(width, math.ceil((max(xs) * width + pad) / GRID) * GRID)
    bottom = min(height, math.ceil((max(ys) * height + pad) / GRID) * GRID)
    # a hair inside the pixel grid, so the border Blender derives from these fractions lands on whole pixels
    eps = 1e-6
    return (left / width + eps, top / height - eps if top else 0.0, min(1.0, right / width + eps), bottom / height - eps)

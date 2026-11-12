"""m2_cs_g87: the fixes and role assignments only this car needs.

apply(ctx) runs once after the shared look; on_view(ctx, view) after every view change.

How this car is built (CSR2 game asset, cleaned): windows, headlamp covers and tail-lamp covers share one
mesh and one material (C02_Glass_ChassisGlass / GlassMtl); every window has a second inner skin in a
'...Inside' mesh; all lamp internals are one mesh (C03_Light_ChassisLight) textured from one atlas, where the
light guide is the part mapped onto the atlas's honeycomb rows.
"""
import bpy

from .. import glass, lamps
from ..core import log

FRONT_Y = -1.6      # lamp parts ahead of this are headlamps
REAR_Y = 1.8        # lamp parts behind this are tail lamps
GUIDE_V = (0.28, 0.46)   # atlas rows (UV v) of the light-guide texture in the headlamp


def _obj(name):
    return bpy.data.objects.get(name)


def _glass(ctx):
    window = glass.window_material(ctx)
    lens = lamps.lens_material(ctx)
    red = lamps.tinted_lens_material(ctx, "PL_Lens_Red", "#C8141A")
    n = {"window": 0, "lens": 0, "red": 0, "inner": 0}

    body = _obj("C02_Glass_ChassisGlass")
    if body:
        n["lens"] += glass.assign_pieces(body, lens, lambda p: "GlassRed" not in p.materials and (p.hi.y < FRONT_Y or p.lo.y > REAR_Y))
        n["window"] += glass.assign_pieces(body, window, lambda p: "GlassRed" not in p.materials and FRONT_Y <= p.centre.y <= REAR_Y)
        n["red"] += glass.assign_faces(body, red, lambda f: f.material == "GlassRed")
    inner = _obj("C02_Glass_ChassisGlassInside")
    if inner:
        n["inner"] += glass.drop_inner_shells([inner], keep=lambda f: f.material == "GlassRed")
        n["red"] += glass.assign_faces(inner, red, lambda f: f.material == "GlassRed")
    for side in ("L", "R"):
        door = _obj(f"C02_Glass_Door{side}Glass")
        if door:
            n["lens"] += glass.assign_pieces(door, lens, lambda p: p.area < 0.05)        # mirror indicator cover
            n["window"] += glass.assign_pieces(door, window, lambda p: p.area >= 0.05)
        n["inner"] += glass.drop_inner_shells([_obj(f"C02_Glass_Door{side}GlassInside")])
    plate = _obj("C02_Glass_TrunkGlass")
    if plate:
        n["lens"] += glass.assign(lens, [plate])
    return n


def _lamps(ctx):
    src = bpy.data.materials.get("LightA")
    # the guide's UVs: V runs across it (0.338 .. 0.43), U along it (-1.86 .. 2.70)
    drl = lamps.drl_material(ctx, across=(1, 0.338, 0.43), along=(0, -1.86, 2.70))
    housing = lamps.housing_material(ctx, "PL_LampHousing", source=src)
    bezel = lamps.reflector_material(ctx, "PL_LampBezel", roughness=0.22, tone=0.42, vertex_ao=True)
    chrome = lamps.reflector_material(ctx, "PL_LampChrome", roughness=0.12, tone=0.85, vertex_ao=True)
    projector = lamps.projector_material(ctx, "PL_Projector", source=src)
    n = {"drl": 0, "bezel": 0, "chrome": 0, "projector": 0, "housing": 0}
    lamp = _obj("C03_Light_ChassisLight")
    if lamp:
        lo, hi = GUIDE_V
        front = lambda f: f.centre.y < FRONT_Y
        n["drl"] += glass.assign_faces(lamp, drl, lambda f: front(f) and f.uv is not None and lo <= f.uv[1] <= hi)
        # headlamp pieces by size: bezel (the big inner trim), projector module, projector lens disc
        def is_piece(f, faces, tol=4):
            return front(f) and f.piece is not None and abs(len(f.piece.faces) - faces) <= tol and f.material == "LightA"
        n["bezel"] += glass.assign_faces(lamp, bezel, lambda f: is_piece(f, 1654), with_pieces=True)
        n["chrome"] += glass.assign_faces(lamp, chrome, lambda f: is_piece(f, 2732), with_pieces=True)
        n["projector"] += glass.assign_faces(lamp, projector, lambda f: is_piece(f, 243) or is_piece(f, 112), with_pieces=True)
        n["housing"] += glass.assign_faces(lamp, housing, lambda f: f.material == "LightA")
    for name in ("C03_Light_DoorLLight", "C03_Light_DoorRLight", "C03_Light_TrunkLight"):
        o = _obj(name)
        if o:
            n["housing"] += glass.assign(housing, [o])
    return n


def _interior(ctx):
    """The cabin trim is a game texture with baked shading: about a third of the reflectance of real black
    leather, so nothing read through the glass. Lift its dark end to a plausible value (albedo 0.03-0.05)."""
    gamma = float(ctx.cfg.get("look", {}).get("interior_lift", {}).get(ctx.car_id, 0.72))
    return glass.lift_base_colour(bpy.data.materials.get("InteriorA"), gamma)


def apply(ctx):
    g = _glass(ctx)
    l = _lamps(ctx)
    i = _interior(ctx)
    log(f"M2 roles: glass {g} lamps {l} interior lifted={i}")

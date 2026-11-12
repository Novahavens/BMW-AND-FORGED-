"""Scene assembly: the reference studio, one car in it, and the camera views.

The studio is the scene that rendered the approved M2 hero still. Every other car is appended into it and the
camera and lights are scaled to its size. Views turn the car on a turntable, so the studio, floor and backdrop
stay identical from view to view; the camera only slides along its line of sight (or moves to a wheel).
"""
import importlib
import math
import os

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

from .core import fail, log

CAR_COLLECTIONS = ("Body", "Glass", "Interior", "Lights", "Mechanical", "Wheels")
LOOK_MODULES = ("studio", "paint", "glass", "lamps", "rubber")   # shared look, applied in this order


class Ctx:
    """What the scripts pass around: the config, the car and the camera's home pose."""

    def __init__(self, cfg, car_id):
        self.cfg = cfg
        self.car_id = car_id
        self.car = cfg.car(car_id)
        self.scene = bpy.context.scene
        self.cam = None
        self.home = None            # camera location for the hero view
        self.home_focus = 0.0
        self.lookat = None          # point on the camera axis nearest the car centre
        self.centre = None          # turntable axis (x, y, 0)
        self.aim = None             # bounding-box centre of the car
        self.hero_width = 0.0       # share of the frame width the car spans in the hero view
        self.turned = 0.0
        self.view_id = None
        self.paint = None           # platelib.paint.PaintRig
        self.notes = {}             # free space for look modules and car adapters


def open_studio(cfg):
    path = cfg.source(cfg["sources"]["studio"])
    try:
        bpy.ops.wm.open_mainfile(filepath=path)
    except RuntimeError as e:
        fail(f"could not open the studio scene {path}: {e}")


def car_objects():
    objs = set()
    for name in CAR_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll:
            objs.update(coll.all_objects)
    return objs


def mesh_bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    if not pts:
        fail("car has no meshes to frame")
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def swap_car(src):
    """Replace the studio's M2 with the car in src; its paint slots get the studio's Paint material."""
    paint = bpy.data.materials.get("Paint")
    if paint is None:
        fail("studio has no Paint material")
    paint.use_fake_user = True
    for o in list(car_objects()):
        bpy.data.objects.remove(o, do_unlink=True)
    for name in CAR_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll:
            bpy.data.collections.remove(coll)
    try:
        with bpy.data.libraries.load(src, link=False) as (data_from, data_to):
            data_to.collections = [c for c in data_from.collections if c in CAR_COLLECTIONS]
    except (OSError, RuntimeError, ValueError) as e:   # Blender raises RuntimeError / ValueError for a corrupt file
        fail(f"could not read car file {src}: {e}")
    swapped = 0
    for coll in data_to.collections:
        if coll is None:
            continue
        bpy.context.scene.collection.children.link(coll)
        for o in coll.all_objects:
            for slot in o.material_slots:
                if slot.material and slot.material.name.startswith("Paint") and slot.material != paint:
                    slot.material = paint
                    swapped += 1
    bpy.context.view_layer.update()   # appended children of hub empties need world matrices before framing
    if swapped == 0:
        fail(f"{src} has no material named Paint*, so the car cannot be recoloured")
    return swapped


def reframe(ref_lo, ref_hi, new_lo, new_hi):
    """Keep the hero camera's angle; scale its distance and the studio lights to the new car's size."""
    ref_c, new_c = (ref_lo + ref_hi) / 2, (new_lo + new_hi) / 2
    ref_size, new_size = ref_hi - ref_lo, new_hi - new_lo
    if min(ref_size.x, ref_size.y, ref_size.z) <= 0:
        fail("reference car has a zero-size axis; cannot scale the camera and lights from it")
    s = max(new_size.y / ref_size.y, new_size.z / ref_size.z, new_size.x / ref_size.x)
    cam = bpy.context.scene.camera
    if cam is None:
        fail("studio has no active camera")
    cam.location = new_c + (cam.location - ref_c) * s
    dof = cam.data.dof
    if dof.use_dof:
        if dof.focus_object is None or dof.focus_object.name not in bpy.data.objects:
            dof.focus_object = None
        dof.focus_distance *= s
    studio = bpy.data.collections.get("Studio")
    for o in (studio.objects if studio else []):
        if o.type != 'LIGHT':
            continue
        o.location.x = new_c.x + (o.location.x - ref_c.x) * s
        o.location.y = new_c.y + (o.location.y - ref_c.y) * s
        d = o.data
        if d.type == 'AREA' and d.shape in ('RECTANGLE', 'ELLIPSE') and d.size_y > d.size:
            d.size_y *= s
            d.energy *= s
    return s


def _corners():
    return [o.matrix_world @ Vector(c) for o in car_objects() if o.type == 'MESH' for c in o.bound_box]


def frame_span(ctx, pts=None):
    """Left, right, bottom, top of the points in camera frame units (0..1)."""
    uv = [world_to_camera_view(ctx.scene, ctx.cam, p) for p in (pts or _corners())]
    xs, ys = [p.x for p in uv], [p.y for p in uv]
    return min(xs), max(xs), min(ys), max(ys)


def hub(ctx, corner):
    """The hub empty for 'FL', 'FR', 'RL' or 'RR'."""
    for o in bpy.data.objects:
        if o.name.endswith(f"_Hub_{corner}"):
            return o
    fail(f"{ctx.car_id}: no hub empty for corner {corner}")


def assemble(cfg, car_id, look=True):
    """Open the studio, put the car in it, apply the shared look and the car's own fixes. Returns a Ctx."""
    from . import paint as paint_mod
    ctx = Ctx(cfg, car_id)
    open_studio(cfg)
    ctx.scene = bpy.context.scene
    bpy.context.view_layer.update()
    ref_bounds = mesh_bounds(car_objects())
    if ctx.car.get("source"):
        swapped = swap_car(cfg.source(ctx.car["source"]))
        s = reframe(*ref_bounds, *mesh_bounds(car_objects()))
        log(f"CAR {car_id}: paint slots={swapped} frame scale={s:.3f}")
    else:
        log(f"CAR {car_id}: reference car")
    ctx.cam = ctx.scene.camera
    if ctx.cam is None:
        fail("studio has no active camera")
    bpy.context.view_layer.update()
    lo, hi = mesh_bounds(car_objects())
    ctx.centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0.0))
    ctx.aim = (lo + hi) / 2
    ctx.home = ctx.cam.location.copy()
    ctx.home_focus = ctx.cam.data.dof.focus_distance
    fwd = ctx.cam.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    ctx.lookat = ctx.home + fwd * (ctx.aim - ctx.home).dot(fwd)
    x0, x1, _, _ = frame_span(ctx)
    ctx.hero_width = x1 - x0
    ctx.paint = paint_mod.PaintRig(ctx)
    if look:
        for name in LOOK_MODULES:
            mod = importlib.import_module(f"platelib.{name}")
            if hasattr(mod, "apply"):
                mod.apply(ctx)
        try:
            adapter = importlib.import_module(f"platelib.cars.{car_id}")
        except ModuleNotFoundError:
            adapter = None
        if adapter is not None and hasattr(adapter, "apply"):
            adapter.apply(ctx)
    bpy.context.view_layer.update()
    return ctx


def _turn_car(ctx, angle_deg):
    """Turn the whole car about the vertical axis through its centre (root objects only; children follow)."""
    delta = angle_deg - ctx.turned
    if abs(delta) < 1e-6:
        return
    c = ctx.centre
    rot = Matrix.Translation(c) @ Matrix.Rotation(math.radians(delta), 4, 'Z') @ Matrix.Translation(-c)
    for o in car_objects():
        if o.parent is None:
            o.matrix_world = rot @ o.matrix_world
    ctx.turned = angle_deg
    bpy.context.view_layer.update()


def set_view(ctx, view_id):
    """Turn the car and place the camera for one of the config's views."""
    v = ctx.cfg.view(view_id)
    cam = ctx.cam
    _turn_car(ctx, float(v.get("turn_deg", 0.0)))
    aim = v.get("aim", "car")
    if aim == "car":
        target = min(ctx.hero_width, float(v.get("fill", 0.8))) if v.get("turn_deg", 0) else ctx.hero_width
        k = 1.0
        for _ in range(14):
            cam.location = ctx.lookat + (ctx.home - ctx.lookat) * k
            bpy.context.view_layer.update()
            x0, x1, _, _ = frame_span(ctx)
            w = x1 - x0
            if w <= 0:
                fail(f"view {view_id}: the car is not in front of the camera")
            if abs(w - target) < 0.003:
                break
            k = max(0.6, k * w / target)
        cam.location = ctx.lookat + (ctx.home - ctx.lookat) * k
        cam.data.dof.focus_distance = ctx.home_focus * k
    elif aim in ("wheel_front", "wheel_rear"):
        corners = ("FL", "FR") if aim == "wheel_front" else ("RL", "RR")
        hubs = [hub(ctx, c) for c in corners]
        bpy.context.view_layer.update()
        near = min(hubs, key=lambda h: (h.matrix_world.translation - ctx.home).length)
        centre = near.matrix_world.translation.copy()
        tyre = max((c for c in near.children if c.type == 'MESH' and "_Wheel_" in c.name),
                   key=lambda o: max(o.dimensions), default=None)
        diameter = max(tyre.dimensions) if tyre else 0.68
        cd = cam.data
        sensor_h = cd.sensor_width * ctx.scene.render.resolution_y / ctx.scene.render.resolution_x
        vfov = 2.0 * math.atan(sensor_h / (2.0 * cd.lens))
        dist = diameter / (float(v.get("wheel_frac", 0.5)) * 2.0 * math.tan(vfov / 2.0))
        direction = (ctx.home - ctx.lookat).normalized()
        cam.location = centre + Vector((0.0, 0.0, float(v.get("lift", 0.06)))) + direction * dist
        cam.data.dof.focus_distance = dist
    else:
        fail(f"view {view_id}: unknown aim {aim!r}")
    bpy.context.view_layer.update()
    ctx.view_id = view_id
    for name in LOOK_MODULES:
        mod = importlib.import_module(f"platelib.{name}")
        if hasattr(mod, "on_view"):
            mod.on_view(ctx, v)
    try:
        adapter = importlib.import_module(f"platelib.cars.{ctx.car_id}")
    except ModuleNotFoundError:
        adapter = None
    if adapter is not None and hasattr(adapter, "on_view"):
        adapter.on_view(ctx, v)
    return v

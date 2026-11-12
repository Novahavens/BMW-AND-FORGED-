"""The studio: lights, floor and backdrop.

OWNER: look-dev (shared). The scene is the approved hero studio: L_Top_Softbox, L_Strip_CamSide,
L_Strip_FarSide, L_Kicker_Rear, a dark cyclorama. apply(ctx) runs once after the car is in the scene;
on_view(ctx, view) runs after every view change. Values live in the config's look.studio section.

What this module adds to the hero studio, and why:

1. Glass gets its own reflector. A windscreen is a mirror at a grazing angle, so the overhead softbox showed
   up in it as a flat white panel. In a real studio that is handled with a flag or a polariser; here the
   glass objects are taken out of the softbox's light linking and given L_Glass_Reflector instead: the same
   place and shape, soft-edged and much dimmer, linked to glass only. Paint still sees the original softbox,
   so the approved bonnet and roof reflections do not change, and the softbox still lights the cabin.
2. A dim cabin fill (L_Cabin_Fill), linked to the interior only, so seats and wheel read through the glass.
3. The car's lamps follow the turntable (look.studio.follow, 0..1 per light) so reflections still run along
   the body in the turned views, while the floor and backdrop keep fixed copies of the same lamps
   (split_floor_lights): the floor is lit identically in every view, and the hero frame is unchanged.
"""
import math

import bpy
from mathutils import Matrix, Vector

from .core import log

GLASS_REFLECTOR = "L_Glass_Reflector"
CABIN_FILL = "L_Cabin_Fill"
TOP = "L_Top_Softbox"


def _cfg(ctx):
    return ctx.cfg.get("look", {}).get("studio", {})


def studio_lights():
    coll = bpy.data.collections.get("Studio")
    return [o for o in (coll.objects if coll else []) if o.type == 'LIGHT']


def _objects(collection_name):
    coll = bpy.data.collections.get(collection_name)
    return [o for o in (coll.all_objects if coll else []) if o.type == 'MESH']


def link_light(light_obj, objects, include, name=None):
    """Light linking: add objects to the lamp's receiver list as included (True) or excluded (False).

    A lamp whose list holds only excluded objects lights everything else; a list with included objects lights
    only those. Each lamp gets its own list, so calls add up.
    """
    coll = light_obj.light_linking.receiver_collection
    if coll is None:
        coll = bpy.data.collections.new(name or f"LL_{light_obj.name}")
        light_obj.light_linking.receiver_collection = coll
    for o in objects:
        if o.name not in coll.objects:
            coll.objects.link(o)
    wanted = {o.name for o in objects}
    for child, entry in zip(coll.objects, coll.collection_objects):
        if child.name in wanted:
            entry.light_linking.link_state = 'INCLUDE' if include else 'EXCLUDE'
    return coll


def split_floor_lights(ctx):
    """Give the floor its own fixed copy of every studio lamp, so the car's lamps can turn with the car.

    The floor and backdrop are lit only by the copies (F_<name>), which never move: the floor is the same in
    every view. Everything else is lit only by the originals, which may follow the turntable. With the car at
    its hero angle both sets coincide, so the hero frame is unchanged.
    """
    floor = [o for o in (bpy.data.collections.get("Studio").objects if bpy.data.collections.get("Studio") else [])
             if o.type == 'MESH']
    if not floor:
        return []
    copies = []
    for o in studio_lights():
        if o.name.startswith("F_") or o.name in (GLASS_REFLECTOR, CABIN_FILL):
            continue
        twin = o.copy()
        twin.data = o.data.copy()
        twin.name = f"F_{o.name}"
        twin.data.name = twin.name
        twin.light_linking.receiver_collection = None
        for coll in o.users_collection:
            coll.objects.link(twin)
        link_light(twin, floor, True)
        link_light(o, floor, False)
        copies.append(twin)
    return copies


def soft_edges(light_data, edge=0.4, power=1.0):
    """Give an area lamp a soft-edged face: full strength in the middle, falling to nothing at the rim.

    edge is the width of the falloff as a share of each side (0.5 = a smooth bump with no flat middle).
    """
    if hasattr(light_data, "use_nodes") and not light_data.node_tree:
        light_data.use_nodes = True
    nt = light_data.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputLight")
    em = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Parametric"], sep.inputs[0])
    ramps = []
    for axis in (0, 1):
        tri = nt.nodes.new("ShaderNodeMath")          # distance to the nearer edge, 0..0.5
        tri.operation = 'PINGPONG'
        tri.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs[axis], tri.inputs[0])
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.interpolation_type = 'SMOOTHERSTEP'
        ramp.inputs["From Min"].default_value = 0.0
        ramp.inputs["From Max"].default_value = max(1e-3, min(0.5, edge))
        nt.links.new(tri.outputs[0], ramp.inputs["Value"])
        ramps.append(ramp)
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = 'MULTIPLY'
    nt.links.new(ramps[0].outputs[0], mul.inputs[0])
    nt.links.new(ramps[1].outputs[0], mul.inputs[1])
    shape = nt.nodes.new("ShaderNodeMath")
    shape.operation = 'POWER'
    shape.inputs[1].default_value = power
    nt.links.new(mul.outputs[0], shape.inputs[0])
    nt.links.new(shape.outputs[0], em.inputs["Strength"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return nt


def _glass_reflector(ctx, look):
    top = bpy.data.objects.get(TOP)
    glass_objs = _objects("Glass")
    g = look.get("glass_reflector", {})
    if top is None or not glass_objs or not g.get("on", True):
        return None
    link_light(top, glass_objs, False)
    old = bpy.data.objects.get(GLASS_REFLECTOR)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    refl = top.copy()
    refl.data = top.data.copy()
    refl.name = GLASS_REFLECTOR
    refl.data.name = GLASS_REFLECTOR
    for coll in top.users_collection:
        coll.objects.link(refl)
    sx, sy = (float(v) for v in g.get("scale", (1.0, 1.0)))
    ox, oy = (float(v) for v in g.get("offset", (0.0, 0.0)))
    d = refl.data
    d.size *= sx
    d.size_y *= sy
    refl.location.x += ox
    refl.location.y += oy
    strength = float(g.get("strength", 0.3))
    d.energy = top.data.energy * strength * sx * sy          # same radiance as the softbox, times strength
    soft_edges(d, float(g.get("soft_edge", 0.45)), float(g.get("power", 1.0)))
    refl.visible_camera = False
    refl.visible_diffuse = False
    refl.light_linking.receiver_collection = None            # the copy must not share the softbox's list
    link_light(refl, glass_objs, True)
    return refl


def _cabin_fill(ctx, look):
    c = look.get("cabin_fill", {})
    interior = _objects("Interior")
    watts = float(c.get("watts", 0.0))
    if not interior or watts <= 0:
        return None
    pts = [o.matrix_world @ Vector(corner) for o in interior for corner in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    old = bpy.data.objects.get(CABIN_FILL)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    data = bpy.data.lights.new(CABIN_FILL, 'AREA')
    data.shape = 'RECTANGLE'
    data.size = (hi.x - lo.x) * float(c.get("width", 0.7))
    data.size_y = (hi.y - lo.y) * float(c.get("length", 0.45))
    data.energy = watts
    data.color = tuple(c.get("color", (1.0, 0.97, 0.93)))
    fill = bpy.data.objects.new(CABIN_FILL, data)
    studio = bpy.data.collections.get("Studio") or ctx.scene.collection
    studio.objects.link(fill)
    y = lo.y + (hi.y - lo.y) * float(c.get("y", 0.42))
    fill.location = ((lo.x + hi.x) / 2, y, hi.z - float(c.get("drop", 0.10)))
    fill.visible_camera = False
    fill.visible_glossy = False
    fill.visible_transmission = False
    data.use_shadow = bool(c.get("shadow", True))
    link_light(fill, interior, True)
    return fill


def apply(ctx):
    look = _cfg(ctx)
    notes = ctx.notes.setdefault("studio", {})
    refl = _glass_reflector(ctx, look)
    fill = _cabin_fill(ctx, look)
    for name, scale in look.get("energy", {}).items():       # optional per-light gain, 1.0 = the hero value
        o = bpy.data.objects.get(name)
        if o is not None and o.type == 'LIGHT':
            o.data.energy *= float(scale)
    floor_copies = split_floor_lights(ctx) if look.get("fixed_floor_lights", True) else []
    if not look.get("lamps_seen_through_glass", False):
        for o in studio_lights():                             # a strip light seen through both side windows
            o.visible_transmission = False                    # is a white bar across the cabin; it still lights it
    bpy.context.view_layer.update()
    notes["home"] = {o.name: o.matrix_world.copy() for o in studio_lights()}
    notes["car_bound"] = [o.name for o in (fill,) if o is not None]
    notes["fixed"] = [o.name for o in floor_copies]
    log(f"STUDIO: lights {sorted(notes['home'])} glass reflector {'on' if refl else 'off'} cabin fill {'on' if fill else 'off'}")


def on_view(ctx, view):
    """Turn each light about the turntable axis by its 'follow' share of the car's turn."""
    notes = ctx.notes.get("studio")
    if not notes:
        return
    follow = dict(_cfg(ctx).get("follow", {}))
    follow.update(view.get("follow", {}))                     # a view may override
    turn = float(view.get("turn_deg", 0.0))
    c = ctx.centre
    for name, home in notes["home"].items():
        o = bpy.data.objects.get(name)
        if o is None:
            continue
        if name in notes.get("fixed", ()):
            continue                                          # the floor's lamps never move
        share = 1.0 if name in notes["car_bound"] else float(follow.get(name, follow.get("default", 0.0)))
        if name == GLASS_REFLECTOR and name not in follow:
            share = float(follow.get(TOP, follow.get("default", 0.0)))
        rot = Matrix.Translation(c) @ Matrix.Rotation(math.radians(turn * share), 4, 'Z') @ Matrix.Translation(-c)
        o.matrix_world = rot @ home
    bpy.context.view_layer.update()

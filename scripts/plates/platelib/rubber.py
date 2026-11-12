"""Tyres and brakes (disc, caliper), and the split of every wheel into its parts.

OWNER: wheels. The factory calipers, discs and tyres always stay on the car; only the rim is ever swapped.

The four source cars hold a wheel as two meshes per hub (C1x_Wheel_*, C2x_Brake_*) whose material split
is not reliable: the M2 and the M5s mix the brake disc's edge and bell into the rim material, the M4 CS has
tyre and rim on one material and its disc under the caliper paint. assemblies(ctx) sorts every polygon of
those meshes into one of four parts by where it sits around the hub, and leaves one object per part:

    tyre          C1x_Wheel_<corner>         (the source object, rim and disc faces removed)
    factory_rim   C1x_FactoryRim_<corner>    (rim, centre cap, wheel bolts, valve)
    disc          C2x_Disc_<corner>[_B]      (friction ring, bell, hub face and their bolts)
    caliper       C2x_Brake_<corner>         (the source object, disc faces removed)
    backing       C2x_Backing_<corner>       (new: a black disc that closes the back of the rim barrel, seen
                                              by the camera only; it makes a wheel plate opaque inside the tyre)

Every part object carries the custom properties plw_part and plw_corner. Measurements used for rim fitment
(metres, in the hub's frame, axial = along the axle, positive outboard) are in WheelAssembly.measure.

apply(ctx) then gives tyre, disc and caliper their look: dark grey rubber with the source sidewall lettering,
brushed iron discs, gloss caliper paint in the car's own colour. Shapes and positions are not touched.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from .core import fail, log

CORNERS = ("FL", "FR", "RL", "RR")
PART_KEY = "plw_part"
CORNER_KEY = "plw_corner"
NOTE_KEY = "wheel_assemblies"

TYRE, FACTORY_RIM, DISC, CALIPER = 0, 1, 2, 3

# Look values (linear). The tyre base and roughness can be overridden by the config's look.tyre section.
TYRE_BASE = 0.022               # never pure black
TYRE_LETTER_BASE = 0.036        # raised lettering reads a little lighter than the sidewall
TYRE_ROUGHNESS = 0.66
DISC_BASE = (0.30, 0.295, 0.285)  # machined cast iron: a mid grey, darker than any bright rim finish
DISC_ROUGHNESS = 0.38
CALIPER_COAT_ROUGHNESS = 0.045


class WheelAssembly:
    """One corner of the car: its hub, which way is outboard, the part objects and the fitment measurements."""

    def __init__(self, corner, hub, outward):
        self.corner = corner
        self.axle = "front" if corner[0] == "F" else "rear"
        self.hub = hub
        self.outward = outward                    # +1 or -1: the sign of the hub's local X that points away from the car
        self.parts = {"tyre": [], "factory_rim": [], "disc": [], "caliper": [], "backing": []}
        self.measure = {}
        self.brake_points = np.zeros((0, 2))      # caliper vertices as (axial, radius), for rim clearance

    def objects(self, *names):
        return [o for n in (names or self.parts) for o in self.parts[n]]


# ---------------------------------------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------------------------------------
def _mesh_in_hub_frame(obj, to_hub, outward):
    """Vertex and polygon arrays of a mesh object, with vertices as (axial, radius, angle) around the hub."""
    me = obj.data
    nv, npoly = len(me.vertices), len(me.polygons)
    co = np.empty(nv * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    m = np.array(to_hub @ obj.matrix_world)
    p = co.reshape(nv, 3) @ m[:3, :3].T + m[:3, 3]
    loop_start = np.empty(npoly, dtype=np.int32)
    loop_total = np.empty(npoly, dtype=np.int32)
    material = np.empty(npoly, dtype=np.int32)
    me.polygons.foreach_get("loop_start", loop_start)
    me.polygons.foreach_get("loop_total", loop_total)
    me.polygons.foreach_get("material_index", material)
    loop_vert = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", loop_vert)
    if npoly and (np.any(np.diff(loop_start) <= 0) or loop_start[0] != 0):
        fail(f"{obj.name}: polygon loops are not stored in order; cannot sort the wheel into parts")
    p[:, 0] *= outward                                           # axial: positive is outboard on both sides of the car
    axial = p[:, 0]
    radius = np.hypot(p[:, 1], p[:, 2])
    angle = np.arctan2(p[:, 2], p[:, 1])
    a_l, r_l = axial[loop_vert], radius[loop_vert]
    poly = {
        "r_min": np.minimum.reduceat(r_l, loop_start) if npoly else np.zeros(0),
        "r_max": np.maximum.reduceat(r_l, loop_start) if npoly else np.zeros(0),
        "a_min": np.minimum.reduceat(a_l, loop_start) if npoly else np.zeros(0),
        "a_max": np.maximum.reduceat(a_l, loop_start) if npoly else np.zeros(0),
        "a_mid": (np.add.reduceat(a_l, loop_start) / loop_total) if npoly else np.zeros(0),
        "r_mid": (np.add.reduceat(r_l, loop_start) / loop_total) if npoly else np.zeros(0),
        "angle_bin": ((np.arctan2(np.add.reduceat(p[loop_vert, 2], loop_start), np.add.reduceat(p[loop_vert, 1], loop_start))
                       + math.pi) / (2 * math.pi) * 36).astype(np.int32) % 36 if npoly else np.zeros(0, dtype=np.int32),
    }
    return {"obj": obj, "nv": nv, "npoly": npoly, "points": p, "axial": axial, "radius": radius, "angle": angle, "loop_start": loop_start,
            "loop_total": loop_total, "loop_vert": loop_vert, "material": material, "poly": poly,
            "names": [(s.material.name if s.material else "") for s in obj.material_slots]}


def _connected_parts(mesh, selected):
    """Label the selected polygons by connected piece (polygons that share a vertex). Unselected get -1."""
    parent = list(range(mesh["nv"]))

    def root_of(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    loop_vert = mesh["loop_vert"].tolist()
    start, total = mesh["loop_start"].tolist(), mesh["loop_total"].tolist()
    chosen = np.nonzero(selected)[0].tolist()
    for p in chosen:
        s = start[p]
        base = root_of(loop_vert[s])
        for k in range(s + 1, s + total[p]):
            other = root_of(loop_vert[k])
            if other != base:
                parent[other] = base
    labels = np.full(mesh["npoly"], -1, dtype=np.int64)
    for p in chosen:
        labels[p] = root_of(loop_vert[start[p]])
    return labels


def _piece_stats(mesh, labels):
    """Per connected piece: polygon mask, radial and axial extent and how much of the full turn it covers."""
    poly = mesh["poly"]
    pieces = []
    for label in np.unique(labels[labels >= 0]):
        mask = labels == label
        pieces.append({"mask": mask, "count": int(mask.sum()),
                       "r_min": float(poly["r_min"][mask].min()), "r_max": float(poly["r_max"][mask].max()),
                       "a_min": float(poly["a_min"][mask].min()), "a_max": float(poly["a_max"][mask].max()),
                       "cover": len(np.unique(poly["angle_bin"][mask])) / 36.0,
                       "materials": set(np.unique(mesh["material"][mask]).tolist())})
    return pieces


def _surface_samples(mesh, mask, step=0.004):
    """Points spread over the selected polygons, about `step` apart, as (axial, radius) around the hub."""
    start, total, loop_vert = mesh["loop_start"], mesh["loop_total"], mesh["loop_vert"]
    tri = []
    for p in np.nonzero(mask)[0].tolist():
        s = int(start[p])
        for k in range(1, int(total[p]) - 1):                    # fan triangles
            tri.append((loop_vert[s], loop_vert[s + k], loop_vert[s + k + 1]))
    if not tri:
        return np.zeros((0, 2))
    tri = np.asarray(tri)
    pts = mesh["points"]
    a, b, c = pts[tri[:, 0]], pts[tri[:, 1]], pts[tri[:, 2]]
    longest = np.maximum.reduce([np.linalg.norm(b - a, axis=1), np.linalg.norm(c - b, axis=1), np.linalg.norm(a - c, axis=1)])
    steps = np.clip(np.ceil(longest / step).astype(int), 1, 24)
    out = []
    for n in np.unique(steps):
        sel = steps == n
        i, j = np.meshgrid(np.arange(n + 1), np.arange(n + 1), indexing="ij")
        keep = (i + j) <= n
        u, v = i[keep] / n, j[keep] / n                          # barycentric lattice
        w = 1.0 - u - v
        out.append((a[sel][:, None, :] * w[None, :, None] + b[sel][:, None, :] * u[None, :, None]
                    + c[sel][:, None, :] * v[None, :, None]).reshape(-1, 3))
    xyz = np.concatenate(out)
    polar = np.stack([xyz[:, 0], np.hypot(xyz[:, 1], xyz[:, 2])], axis=1)
    return np.unique(np.round(polar, 3), axis=0)                 # a turning wheel only cares about (axial, radius)


def _material_mask(mesh, word):
    """Polygons whose material name contains word (case-insensitive)."""
    idx = [i for i, n in enumerate(mesh["names"]) if word in n.lower()]
    return np.isin(mesh["material"], idx) if idx else np.zeros(mesh["npoly"], dtype=bool)


def _used_vertices(mesh, mask):
    loop_poly = np.repeat(np.arange(mesh["npoly"]), mesh["loop_total"])
    return np.unique(mesh["loop_vert"][mask[loop_poly]])


# ---------------------------------------------------------------------------------------------------------
# Sorting polygons into parts
# ---------------------------------------------------------------------------------------------------------
def _sort_wheel_mesh(mesh):
    """Tyre, factory rim or disc for every polygon of a C1x_Wheel mesh. Returns (labels, disc reference)."""
    poly, npoly = mesh["poly"], mesh["npoly"]
    name = mesh["obj"].name
    r_out = float(np.percentile(mesh["radius"], 99.9))
    half_width = float(np.abs(mesh["axial"]).max())
    tyre = _material_mask(mesh, "tyre") | _material_mask(mesh, "tire")
    if tyre.any():
        # faces of the tyre material that sit inside the tyre cavity (M5 Touring) go with the rim
        stray = tyre & (poly["r_mid"] < 0.82 * r_out) & (np.abs(poly["a_mid"]) < 0.72 * half_width)
        tyre &= ~stray
    else:
        # one material for rim and tyre (M4 CS): the tyre is every piece that reaches the tread
        tyre = np.zeros(npoly, dtype=bool)
        for piece in _piece_stats(mesh, _connected_parts(mesh, np.ones(npoly, dtype=bool))):
            if piece["r_max"] >= 0.88 * r_out:
                tyre |= piece["mask"]
    if not tyre.any() or poly["r_min"][tyre].min() < 0.55 * r_out:
        fail(f"{name}: could not tell the tyre from the rim (tyre polygons {int(tyre.sum())}, "
             f"innermost at {poly['r_min'][tyre].min() if tyre.any() else 0:.3f} m of {r_out:.3f} m)")
    labels = np.full(npoly, FACTORY_RIM, dtype=np.int8)
    labels[tyre] = TYRE
    pieces = _piece_stats(mesh, _connected_parts(mesh, ~tyre))
    # the brake disc: faces of a disc material, or a flat full ring of disc size (M4 CS)
    reference = _material_mask(mesh, "disc") & ~tyre
    for piece in pieces:
        if (piece["cover"] >= 0.8 and piece["r_min"] < 0.06 and 0.14 <= piece["r_max"] <= 0.25
                and piece["a_max"] - piece["a_min"] < 0.03):
            reference |= piece["mask"]
    disc_ref = None
    if reference.any():
        disc_ref = {"radius": float(poly["r_max"][reference].max()), "face": float(poly["a_max"][reference].max()),
                    "back": float(poly["a_min"][reference].min())}
        for piece in pieces:
            # car side of the wheel's mounting face: friction ring, bell, hub face, bell bolts. Wheel bolts
            # (radius under 80 mm) and the centre cap are further out and go with the factory rim.
            on_disc = bool((piece["mask"] & reference).any())
            near_hub = (piece["r_max"] <= disc_ref["radius"] * 1.03 and piece["r_max"] >= 0.10
                        and piece["a_max"] <= disc_ref["face"] + 0.024)
            if on_disc or near_hub:
                labels[piece["mask"]] = DISC
    else:
        log(f"WARNING {name}: no brake disc found in the wheel mesh; everything that is not tyre counts as rim")
    return labels, disc_ref


def _sort_brake_mesh(mesh, disc_ref):
    """Caliper or disc for every polygon of a C2x_Brake mesh, and the role of each caliper polygon."""
    labels = np.full(mesh["npoly"], CALIPER, dtype=np.int8)
    pieces = _piece_stats(mesh, _connected_parts(mesh, np.ones(mesh["npoly"], dtype=bool)))
    by_name = _material_mask(mesh, "disc")
    labels[by_name] = DISC
    if disc_ref:
        for piece in pieces:
            ring = piece["r_max"] <= disc_ref["radius"] + 0.004 and piece["cover"] >= 0.8 and piece["r_min"] < 0.09
            edge = piece["r_max"] <= disc_ref["radius"] + 0.004 and piece["r_min"] >= disc_ref["radius"] - 0.006
            hub_bits = piece["r_max"] <= 0.09
            if ring or edge or hub_bits:
                labels[piece["mask"]] = DISC
    # caliper roles from what the polygons are, not from slot names (the M4 CS names are shifted on three corners)
    roles = np.full(mesh["npoly"], 0, dtype=np.int8)           # 0 metal, 1 paint, 2 badge
    caliper = labels == CALIPER
    body = max((p for p in pieces if (p["mask"] & caliper).any()), key=lambda p: p["count"], default=None)
    if body is not None:
        paint_idx = np.bincount(mesh["material"][body["mask"]]).argmax()
        roles[caliper & (mesh["material"] == paint_idx)] = 1
        for idx in np.unique(mesh["material"][caliper]):
            if idx != paint_idx and int((caliper & (mesh["material"] == idx)).sum()) <= 8:
                roles[caliper & (mesh["material"] == idx)] = 2
    return labels, roles


# ---------------------------------------------------------------------------------------------------------
# Splitting objects
# ---------------------------------------------------------------------------------------------------------
def _delete_polygons(me, keep):
    """Remove the polygons of a mesh datablock that are not in keep (and the vertices only they used)."""
    bm = bmesh.new()
    try:
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        doomed = [f for f in bm.faces if not keep[f.index]]
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context='FACES')
        bm.to_mesh(me)
    finally:
        bm.free()
    me.update()


def _split_off(obj, keep, name, hub):
    """A new object with only the polygons in keep, stored in the hub's frame and parented to the hub."""
    me = obj.data.copy()
    me.name = name
    _delete_polygons(me, keep)
    me.transform(hub.matrix_world.inverted() @ obj.matrix_world)
    me.update()
    new = bpy.data.objects.new(name, me)
    for coll in obj.users_collection:
        coll.objects.link(new)
    new.parent = hub
    new.matrix_parent_inverse = Matrix.Identity(4)
    return new


def _tag(obj, part, corner):
    obj[PART_KEY] = part
    obj[CORNER_KEY] = corner
    return obj


def _backing_disc(asm, name):
    """A disc that closes the back of the barrel, facing outboard, in the 'outboard = +X' convention."""
    m = asm.measure
    radius = m["bead_radius_inner"] + 0.004
    x = m["back_axial"] + 0.003
    steps = 72
    verts = [(x, 0.0, 0.0)] + [(x, radius * math.cos(2 * math.pi * i / steps), radius * math.sin(2 * math.pi * i / steps))
                               for i in range(steps)]
    faces = [(0, 1 + i, 1 + (i + 1) % steps) for i in range(steps)]      # counter-clockwise seen from +X
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    for coll in asm.hub.users_collection:
        coll.objects.link(obj)
    obj.parent = asm.hub
    obj.matrix_parent_inverse = Matrix.Identity(4)
    if asm.outward < 0:
        obj.matrix_basis = Matrix.Rotation(math.pi, 4, 'Z')
    # the camera sees it, light does not: it must not change how the wheel or the arch is lit
    for flag in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(obj, flag, False)
    me.materials.append(_backing_material())
    return obj


def _measure(asm, wheel_mesh, wheel_labels, brake_meshes, brake_labels, disc_ref):
    """Fitment measurements of one corner, from the sorted polygons (before the objects are split)."""
    tyre_v = _used_vertices(wheel_mesh, wheel_labels == TYRE)
    rim_v = _used_vertices(wheel_mesh, wheel_labels == FACTORY_RIM)
    a, r = wheel_mesh["axial"], wheel_mesh["radius"]
    if not len(rim_v):
        fail(f"{asm.hub.name}: the wheel mesh has no factory rim polygons")
    m = asm.measure
    m["tyre_radius"] = float(np.percentile(r[tyre_v], 99.9))
    m["tyre_half_width"] = float(np.abs(a[tyre_v]).max())
    outer, inner = tyre_v[a[tyre_v] > 0], tyre_v[a[tyre_v] < 0]
    m["bead_radius"] = float(r[outer].min())                    # inner edge of the tyre, outboard side
    m["bead_radius_inner"] = float(r[inner].min())
    flange = rim_v[r[rim_v] >= m["bead_radius"] - 0.002]
    back = rim_v[r[rim_v] >= m["bead_radius_inner"] - 0.004]
    if not len(flange) or not len(back):
        fail(f"{asm.hub.name}: the factory rim does not reach the tyre bead; cannot measure the rim seat")
    m["lip_axial"] = float(a[flange].max())                     # outer face of the factory rim's outboard flange
    m["back_axial"] = float(a[back].min())
    near_lip = rim_v[a[rim_v] >= m["lip_axial"] - 0.012]
    m["flange_radius"] = float(r[near_lip].max())
    if disc_ref:
        m["disc_radius"], m["disc_face_axial"] = disc_ref["radius"], disc_ref["face"]
        hub_v = _used_vertices(wheel_mesh, wheel_labels == DISC)
        hub_v = hub_v[r[hub_v] <= 0.085]
        # the face a wheel bolts on to: the front of the disc bell
        m["hub_face_axial"] = float(a[hub_v].max()) if len(hub_v) else disc_ref["face"]
    points = [_surface_samples(mesh, labels == CALIPER) for mesh, labels in zip(brake_meshes, brake_labels)]
    asm.brake_points = np.concatenate(points) if points else np.zeros((0, 2))
    if len(asm.brake_points):
        m["caliper_radius"] = float(asm.brake_points[:, 1].max())
        m["caliper_axial"] = float(asm.brake_points[:, 0].max())


def _outward_sign(hub, hubs):
    """Which way along the hub's own X axis points away from the car (works at any turntable angle)."""
    mid = sum((h.matrix_world.translation for h in hubs), Vector()) / len(hubs)
    local = hub.matrix_world.to_3x3().inverted() @ (hub.matrix_world.translation - mid)
    return 1.0 if local.x >= 0 else -1.0


def _brake_source_materials(hubs):
    """The car's own caliper materials by role (metal, paint, badge), found by name across all four brakes."""
    found = {"metal": None, "paint": None, "badge": None}
    for hub in hubs:
        for obj in hub.children_recursive:
            if obj.type != 'MESH' or "_Brake_" not in obj.name:
                continue
            for slot in obj.material_slots:
                name = slot.material.name.lower() if slot.material else ""
                if "paint" in name:
                    found["paint"] = found["paint"] or slot.material
                elif "badge" in name:
                    found["badge"] = found["badge"] or slot.material
                elif "metal" in name or "zone" in name:
                    found["metal"] = found["metal"] or slot.material
    return found


def _build_assembly(ctx, corner, hubs, brake_sources):
    from . import scene
    hub = scene.hub(ctx, corner)
    asm = WheelAssembly(corner, hub, _outward_sign(hub, hubs))
    to_hub = hub.matrix_world.inverted()
    kids = [o for o in hub.children_recursive if o.type == 'MESH']
    wheels = [o for o in kids if "_Wheel_" in o.name]
    brakes = [o for o in kids if "_Brake_" in o.name]
    if len(wheels) != 1:
        fail(f"{ctx.car_id}: hub {hub.name} has {len(wheels)} wheel meshes, expected one (children: {[o.name for o in kids]})")
    wheel = wheels[0]
    prefix = wheel.name.split("_Wheel_")[0]                    # C10
    brake_prefix = brakes[0].name.split("_Brake_")[0] if brakes else prefix
    wheel_mesh = _mesh_in_hub_frame(wheel, to_hub, asm.outward)
    wheel_labels, disc_ref = _sort_wheel_mesh(wheel_mesh)
    brake_meshes = [_mesh_in_hub_frame(o, to_hub, asm.outward) for o in brakes]
    sorted_brakes = [_sort_brake_mesh(mesh, disc_ref) for mesh in brake_meshes]
    _measure(asm, wheel_mesh, wheel_labels, brake_meshes, [labels for labels, _ in sorted_brakes], disc_ref)

    rim = _tag(_split_off(wheel, wheel_labels == FACTORY_RIM, f"{prefix}_FactoryRim_{corner}", hub), "factory_rim", corner)
    asm.parts["factory_rim"].append(rim)
    if (wheel_labels == DISC).any():
        asm.parts["disc"].append(_tag(_split_off(wheel, wheel_labels == DISC, f"{brake_prefix}_Disc_{corner}", hub), "disc", corner))
    _delete_polygons(wheel.data, wheel_labels == TYRE)
    asm.parts["tyre"].append(_tag(wheel, "tyre", corner))
    for obj, mesh, (labels, roles) in zip(brakes, brake_meshes, sorted_brakes):
        if (labels == DISC).any():
            asm.parts["disc"].append(_tag(_split_off(obj, labels == DISC, f"{brake_prefix}_Disc_{corner}_B", hub), "disc", corner))
        # slots become [metal, paint, badge], whatever the source order and names were
        by_role = [None, None, None]
        for role in (0, 1, 2):
            used = mesh["material"][(labels == CALIPER) & (roles == role)]
            if len(used) and int(np.bincount(used).argmax()) < len(obj.material_slots):
                by_role[role] = obj.material_slots[int(np.bincount(used).argmax())].material
        metal = brake_sources["metal"] or by_role[0] or _dark_metal_material()
        paint = brake_sources["paint"] or by_role[1] or metal
        badge = brake_sources["badge"] or by_role[2] or paint
        obj.data.materials.clear()                                 # this also resets every polygon to slot 0
        for mat in (metal, paint, badge):
            obj.data.materials.append(mat)
        obj.data.polygons.foreach_set("material_index", roles.astype(np.int32))
        obj.data.update()
        _delete_polygons(obj.data, labels == CALIPER)
        asm.parts["caliper"].append(_tag(obj, "caliper", corner))
    asm.parts["backing"].append(_tag(_backing_disc(asm, f"{brake_prefix}_Backing_{corner}"), "backing", corner))
    m = asm.measure
    log(f"WHEEL {ctx.car_id} {corner}: tyre R={m['tyre_radius']:.4f} half-width={m['tyre_half_width']:.4f} bead r={m['bead_radius']:.4f} | "
        f"factory rim flange r={m['flange_radius']:.4f} lip a={m['lip_axial']:+.4f} back a={m['back_axial']:+.4f} | "
        f"disc r={m.get('disc_radius', 0):.4f} face a={m.get('disc_face_axial', 0):+.4f} hub face a={m.get('hub_face_axial', 0):+.4f} | "
        f"caliper r<={m.get('caliper_radius', 0):.4f} a<={m.get('caliper_axial', 0):+.4f} | "
        f"polygons tyre={int((wheel_labels == TYRE).sum())} rim={int((wheel_labels == FACTORY_RIM).sum())} disc={int((wheel_labels == DISC).sum())}")
    return asm


def assemblies(ctx):
    """The four wheel assemblies of the car in the scene, split into parts on first use."""
    cached = ctx.notes.get(NOTE_KEY)
    if cached is not None:
        return cached
    from . import scene
    bpy.context.view_layer.update()
    hubs = [scene.hub(ctx, c) for c in CORNERS]
    brake_sources = _brake_source_materials(hubs)
    result = {corner: _build_assembly(ctx, corner, hubs, brake_sources) for corner in CORNERS}
    bpy.context.view_layer.update()
    ctx.notes[NOTE_KEY] = result
    return result


# ---------------------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------------------
def _new_material(name):
    mat = bpy.data.materials.get(name)
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
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat, nt, bsdf, out


def enabled_socket(sockets, name):
    """The live socket called name (a Mix node has one per data type under the same name)."""
    for sock in sockets:
        if sock.name == name and sock.enabled:
            return sock
    fail(f"node has no enabled socket named {name!r}")


def set_socket(node, name, value):
    """Set an input if this Blender version has it. Returns True when it did."""
    sock = node.inputs.get(name)
    if sock is None:
        return False
    sock.default_value = value
    return True


def _backing_material():
    mat = bpy.data.materials.get("PLW_Backing")
    if mat is not None:
        return mat
    mat, nt, bsdf, out = _new_material("PLW_Backing")
    set_socket(bsdf, "Base Color", (0.0, 0.0, 0.0, 1.0))
    set_socket(bsdf, "Roughness", 1.0)
    set_socket(bsdf, "Specular IOR Level", 0.0)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
    nt.links.new(bsdf.outputs[0], mix.inputs[1])
    nt.links.new(clear.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def _source_textures(mat):
    """The base-colour and normal-map images of a source material (either may be None)."""
    if mat is None or mat.node_tree is None:
        return None, None
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return None, None

    def upstream_image(socket_name):
        seen, todo = set(), [l.from_node for l in bsdf.inputs[socket_name].links] if socket_name in bsdf.inputs else []
        while todo:
            node = todo.pop()
            if node.name in seen:
                continue
            seen.add(node.name)
            if node.type == 'TEX_IMAGE' and node.image is not None:
                return node.image
            todo.extend(l.from_node for i in node.inputs for l in i.links)
        return None

    return upstream_image("Base Color"), upstream_image("Normal")


def _luminance(nt, colour_socket):
    node = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(colour_socket, node.inputs[0])
    return node.outputs[0]


def _map_range(nt, value_socket, from_min, from_max, to_min, to_max):
    node = nt.nodes.new("ShaderNodeMapRange")
    node.clamp = True
    node.inputs["From Min"].default_value = from_min
    node.inputs["From Max"].default_value = from_max
    node.inputs["To Min"].default_value = to_min
    node.inputs["To Max"].default_value = to_max
    nt.links.new(value_socket, node.inputs["Value"])
    return node.outputs[0]


def _grey(nt, value_socket):
    node = nt.nodes.new("ShaderNodeCombineColor")
    for i in range(3):
        nt.links.new(value_socket, node.inputs[i])
    return node.outputs[0]


def tyre_material(ctx, source):
    """Dark grey rubber. The source atlas supplies the sidewall lettering (a little lighter, embossed)."""
    look = ctx.cfg.get("look", {}).get("tyre", {})
    base = float(look.get("base", TYRE_BASE))
    rough = float(look.get("roughness", TYRE_ROUGHNESS))
    diffuse, normal = _source_textures(source)
    mat, nt, bsdf, _ = _new_material(f"PLW_Tyre_{ctx.car_id}")
    set_socket(bsdf, "Base Color", (base, base, base * 1.04, 1.0))
    set_socket(bsdf, "Metallic", 0.0)
    set_socket(bsdf, "Roughness", rough)
    set_socket(bsdf, "Specular IOR Level", 0.42)
    set_socket(bsdf, "Sheen Weight", 0.12)
    set_socket(bsdf, "Sheen Roughness", 0.55)
    set_socket(bsdf, "Coat Weight", 0.0)
    if diffuse is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = diffuse
        tex.interpolation = 'Cubic'
        lum = _luminance(nt, tex.outputs["Color"])
        # atlas: sidewall about 0.010 linear, lettering and tread marks 0.03 to 0.06
        lift = _map_range(nt, lum, 0.012, 0.05, 0.0, 1.0)
        nt.links.new(_grey(nt, _map_range(nt, lift, 0.0, 1.0, base, max(base, float(look.get("letter_base", TYRE_LETTER_BASE))))),
                     bsdf.inputs["Base Color"])
        nt.links.new(_map_range(nt, lift, 0.0, 1.0, rough, rough - 0.10), bsdf.inputs["Roughness"])
    if normal is not None:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = normal
        ntex.interpolation = 'Cubic'
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 1.6
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def disc_material(ctx, source, name):
    """Brushed cast iron: metallic, turned around the axle. The source atlas keeps the drilled holes and the darker bell."""
    diffuse, _ = _source_textures(source)
    mat, nt, bsdf, _ = _new_material(name)
    set_socket(bsdf, "Metallic", 1.0)
    set_socket(bsdf, "Base Color", (*DISC_BASE, 1.0))
    set_socket(bsdf, "Roughness", DISC_ROUGHNESS)
    set_socket(bsdf, "Coat Weight", 0.0)
    set_socket(bsdf, "Anisotropic", 0.55)
    tangent = nt.nodes.new("ShaderNodeTangent")
    tangent.direction_type = 'RADIAL'
    tangent.axis = 'X'                                           # disc objects are stored in the hub's frame: X is the axle
    if "Tangent" in bsdf.inputs:
        nt.links.new(tangent.outputs[0], bsdf.inputs["Tangent"])
    # turning marks: fine rings of slightly different roughness and brightness
    coords = nt.nodes.new("ShaderNodeTexCoord")
    split = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coords.outputs["Object"], split.inputs[0])
    radius = nt.nodes.new("ShaderNodeMath")
    radius.operation = 'SQRT'
    squares = nt.nodes.new("ShaderNodeVectorMath")
    squares.operation = 'DOT_PRODUCT'
    flat = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(split.outputs["Y"], flat.inputs["Y"])
    nt.links.new(split.outputs["Z"], flat.inputs["Z"])
    nt.links.new(flat.outputs[0], squares.inputs[0])
    nt.links.new(flat.outputs[0], squares.inputs[1])
    nt.links.new(squares.outputs["Value"], radius.inputs[0])
    rings = nt.nodes.new("ShaderNodeTexNoise")
    rings.noise_dimensions = '1D'
    rings.inputs["Scale"].default_value = 900.0
    rings.inputs["Detail"].default_value = 3.0
    nt.links.new(radius.outputs[0], rings.inputs["W"])
    nt.links.new(_map_range(nt, rings.outputs["Fac"], 0.3, 0.7, DISC_ROUGHNESS - 0.07, DISC_ROUGHNESS + 0.09), bsdf.inputs["Roughness"])
    tone = _map_range(nt, rings.outputs["Fac"], 0.3, 0.7, 0.86, 1.0)
    if diffuse is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = diffuse
        # atlas: friction ring about 0.07 linear, bell about 0.03, drilled holes near 0.01
        atlas = _map_range(nt, _luminance(nt, tex.outputs["Color"]), 0.012, 0.06, 0.10, 1.0)
        both = nt.nodes.new("ShaderNodeMath")
        both.operation = 'MULTIPLY'
        nt.links.new(tone, both.inputs[0])
        nt.links.new(atlas, both.inputs[1])
        tone = both.outputs[0]
    colour = nt.nodes.new("ShaderNodeMix")
    colour.data_type = 'RGBA'
    colour.blend_type = 'MULTIPLY'
    enabled_socket(colour.inputs, "Factor").default_value = 1.0
    enabled_socket(colour.inputs, "A").default_value = (*DISC_BASE, 1.0)
    nt.links.new(_grey(nt, tone), enabled_socket(colour.inputs, "B"))
    nt.links.new(enabled_socket(colour.outputs, "Result"), bsdf.inputs["Base Color"])
    return mat


def caliper_paint_material(ctx, source):
    """Gloss caliper paint in the car's own colour: the source material's colour under a clear coat."""
    colour = (0.45, 0.02, 0.02, 1.0)
    if source is not None and source.node_tree is not None:
        bsdf_src = next((n for n in source.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf_src is not None and not bsdf_src.inputs["Base Color"].is_linked:
            colour = tuple(bsdf_src.inputs["Base Color"].default_value)
        else:
            log(f"WARNING {ctx.car_id}: the caliper paint colour is textured in the source; using a default red")
    mat, nt, bsdf, _ = _new_material(f"PLW_CaliperPaint_{ctx.car_id}")
    mat["plw_colour"] = [float(v) for v in colour[:3]]
    set_socket(bsdf, "Base Color", colour)
    set_socket(bsdf, "Metallic", 0.0)
    set_socket(bsdf, "Roughness", 0.45)
    set_socket(bsdf, "Coat Weight", 1.0)
    set_socket(bsdf, "Coat IOR", 1.5)
    set_socket(bsdf, "Coat Roughness", CALIPER_COAT_ROUGHNESS)
    # cast aluminium under paint: a slight, broad orange peel on the coat only
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 420.0
    coords = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    if "Distance" in bump.inputs:
        bump.inputs["Distance"].default_value = 0.0006
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if "Coat Normal" in bsdf.inputs:
        nt.links.new(bump.outputs[0], bsdf.inputs["Coat Normal"])
    return mat


def _dark_metal_material():
    mat = bpy.data.materials.get("PLW_BrakeMetal")
    if mat is not None:
        return mat
    mat, _, bsdf, _ = _new_material("PLW_BrakeMetal")
    set_socket(bsdf, "Base Color", (0.06, 0.06, 0.065, 1.0))
    set_socket(bsdf, "Metallic", 1.0)
    set_socket(bsdf, "Roughness", 0.5)
    return mat


def rim_light_receivers():
    """The collection of rim objects that the rim card lights (and nothing else does)."""
    return bpy.data.collections.get("PLW_RimLit") or bpy.data.collections.new("PLW_RimLit")


def _rim_card(ctx):
    """A large soft card that only the rims see: polished and chrome rims need something bright to mirror
    in a dark studio, or they read as black. It is linked to the rim objects alone and hidden from the camera."""
    light = bpy.data.objects.get("PLW_RimCard")
    if light is not None:
        return light
    look = ctx.cfg.get("wheel_plate", {})
    data = bpy.data.lights.new("PLW_RimCard", 'AREA')
    data.shape = 'RECTANGLE'
    data.size, data.size_y = float(look.get("rim_card_width", 5.0)), float(look.get("rim_card_height", 2.2))
    data.energy = float(look.get("rim_card_watts", 260.0))
    light = bpy.data.objects.new("PLW_RimCard", data)
    ctx.scene.collection.objects.link(light)
    light.visible_camera = False
    receivers = rim_light_receivers()
    for asm in assemblies(ctx).values():
        for obj in asm.parts["factory_rim"]:
            if obj.name not in receivers.objects:
                receivers.objects.link(obj)
    try:
        light.light_linking.receiver_collection = receivers
    except AttributeError:
        log("WARNING: this Blender has no light linking; the rim card is switched off")
        light.hide_render = True
    return light


def on_view(ctx, view):
    """Put the rim card where the camera's mirror image in the near-side wheel faces lies."""
    light = bpy.data.objects.get("PLW_RimCard")
    if light is None:
        return
    asms = assemblies(ctx)
    cam = ctx.cam.matrix_world.translation
    def outward_of(a):
        return (a.hub.matrix_world.to_3x3() @ Vector((a.outward, 0.0, 0.0))).normalized()

    first = min(asms.values(), key=lambda a: (a.hub.matrix_world.translation - cam).length)
    near = [a for a in asms.values() if outward_of(a).dot(outward_of(first)) > 0.5]      # the wheels on the camera's side
    centre = sum((a.hub.matrix_world.translation for a in near), Vector()) / len(near)
    normal = sum((outward_of(a) for a in near), Vector()).normalized()
    to_cam = (cam - centre).normalized()
    mirror = (2.0 * normal.dot(to_cam) * normal - to_cam).normalized()
    pos = centre + mirror * float(ctx.cfg.get("wheel_plate", {}).get("rim_card_distance", 3.2))
    pos.z = max(pos.z, 0.5 * light.data.size_y + 0.05)
    light.matrix_world = Matrix.Translation(pos) @ (centre - pos).to_track_quat('-Z', 'Z').to_matrix().to_4x4()


def apply(ctx):
    """Split the wheels into parts and give tyres, discs and calipers their look."""
    asms = assemblies(ctx)
    if ctx.notes.get("rubber_look_done"):
        return
    _rim_card(ctx)
    paint_src = next((o.material_slots[1].material for asm in asms.values() for o in asm.parts["caliper"]
                      if len(o.material_slots) > 1), None)
    paint = caliper_paint_material(ctx, paint_src)
    tyre_src = next((s.material for asm in asms.values() for o in asm.parts["tyre"] for s in o.material_slots
                     if s.material and _source_textures(s.material)[0] is not None), None)
    tyre = tyre_material(ctx, tyre_src)
    atlas = _source_textures(tyre_src)[0]
    disc_textured = disc_material(ctx, tyre_src, f"PLW_Disc_{ctx.car_id}")
    disc_plain = disc_material(ctx, None, f"PLW_DiscPlain_{ctx.car_id}")
    for asm in asms.values():
        for obj in asm.parts["tyre"]:
            for slot in obj.material_slots:
                slot.material = tyre
        for obj in asm.parts["disc"]:
            for slot in obj.material_slots:
                # faces that were mapped to the wheel atlas keep its drilled holes; anything else gets plain iron
                slot.material = disc_textured if (atlas is not None and _source_textures(slot.material)[0] == atlas) else disc_plain
        for obj in asm.parts["caliper"]:
            if len(obj.material_slots) > 1:                            # slot order is [metal, paint, badge]
                if obj.material_slots[2].material == obj.material_slots[1].material:
                    obj.material_slots[2].material = paint             # no badge on this car: the spot stays paint
                obj.material_slots[1].material = paint
    ctx.notes["rubber_look_done"] = True
    log(f"RUBBER {ctx.car_id}: tyre atlas={'yes' if atlas else 'no'} caliper colour={tuple(round(v, 3) for v in paint['plw_colour'])}")

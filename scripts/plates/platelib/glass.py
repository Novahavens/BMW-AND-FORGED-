"""Window glass, and the mesh helpers car adapters use to give parts of a mesh their own material.

OWNER: look-dev (shared helpers; car adapters decide which meshes are glass). Target: the cabin is visible
through every window, the windscreen carries at most a soft gradient band, nothing goes white or opaque black.

Materials (signatures are stable; tune the insides and the config's look.glass values):
    window_material(ctx, name="PL_Glass", tint_hex=None, darkness=1.0) -> material
    transmissive_material(name, colour, ior, thin_wall=True, shadow_transparency=0.85, roughness=0.0) -> material
    assign(material, objects, slot_filter=None) -> slots changed
    lift_base_colour(material, gamma) -> bool    lift a too-dark cabin material so it reads through the glass

Mesh helpers (game-derived cars keep windows, lenses and lamp parts in one mesh with one material):
    pieces(obj) -> [Piece]                       connected parts with world bounds, area, mean normal
    assign_faces(obj, material, test) -> n       test(Face) -> bool; Face has centre, normal, uv, material, piece
    assign_pieces(obj, material, test) -> n      test(Piece) -> bool
    remove_faces(obj, test) -> n                 delete faces in memory (inner glass shells, stray geometry)
    drop_inner_shells(objects, keep=None) -> n   single-pane glass: remove the '...Inside' duplicate panes

Why single panes: these cars model each window twice (outer and inner skin, about 10 mm apart). With a tinted
transmissive material every skin tints and reflects again, so a side window seen through the windscreen went
through four tinted layers and read as near-opaque. One thin-walled pane per window is what the Thin Wall
option is for: no refraction offset, one tint, light and shadow rays pass.
"""
import bpy
from mathutils import Vector

from .core import hex_to_linear, log


# ---------------------------------------------------------------------------------------------- materials

def _principled(mat):
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    if out is None:
        out = nt.nodes.new("ShaderNodeOutputMaterial")
    return nt, bsdf, out


def set_input(node, name, value):
    """Set a socket if this Blender version has it; returns True when it did."""
    sock = node.inputs.get(name)
    if sock is None:
        return False
    sock.default_value = value
    return True


def fresh_material(name):
    """The material called name with an empty node tree (made if missing), so helpers can be called twice."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return mat, nt


def transmissive_material(name, colour, ior, thin_wall=True, shadow_transparency=0.85, roughness=0.0):
    """Clear dielectric that lets light through to what is behind it.

    Camera and bounce rays see a Principled glass (reflection by Fresnel, tinted transmission). Shadow rays see
    a tinted transparent surface instead, so lamps light the cabin and the lamp internals through the glass;
    shadow_transparency (0..1) is how much of that light gets through.
    """
    mat, nt = fresh_material(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    set_input(bsdf, "Base Color", (*colour[:3], 1.0))
    set_input(bsdf, "Metallic", 0.0)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "IOR", ior)
    set_input(bsdf, "Transmission Weight", 1.0)
    set_input(bsdf, "Coat Weight", 0.0)
    if thin_wall:
        set_input(bsdf, "Thin Wall", True)
    if shadow_transparency > 0:
        path = nt.nodes.new("ShaderNodeLightPath")
        clear = nt.nodes.new("ShaderNodeBsdfTransparent")
        k = max(0.0, min(1.0, shadow_transparency))
        clear.inputs["Color"].default_value = (colour[0] * k, colour[1] * k, colour[2] * k, 1.0)
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(path.outputs["Is Shadow Ray"], mix.inputs[0])
        nt.links.new(bsdf.outputs[0], mix.inputs[1])
        nt.links.new(clear.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
    else:
        nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def window_material(ctx, name="PL_Glass", tint_hex=None, darkness=1.0):
    """Car window glass. darkness < 1 gives privacy glass (0.35 is a dark rear window); 1.0 is clear green-tint."""
    look = ctx.cfg.get("look", {}).get("glass", {})
    r, g, b, _ = hex_to_linear(tint_hex or look.get("tint_hex", "#D9E4E0"))
    colour = (r * darkness, g * darkness, b * darkness, 1.0)
    return transmissive_material(name, colour, float(look.get("ior", 1.52)), bool(look.get("thin_wall", True)),
                                 float(look.get("shadow_transparency", 0.85)))


def lift_base_colour(material, gamma):
    """Lift the dark end of a material's Base Color with a gamma curve (gamma < 1 brightens darks, keeps whites).

    For cabins that are too dark to read through the glass: game interiors multiply baked shading into an
    already dark albedo (about 0.012 where real black leather is 0.03-0.05). gamma 0.72 turns 0.012 into
    0.04 and leaves light stitching alone. Returns True when it did; safe to call twice (the node is reused).
    """
    if material is None or material.node_tree is None or abs(gamma - 1.0) < 1e-6:
        return False
    nt = material.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return False
    sock = bsdf.inputs["Base Color"]
    if not sock.is_linked:
        r, g, b, a = sock.default_value
        sock.default_value = (r ** gamma, g ** gamma, b ** gamma, a)
        return True
    src = sock.links[0].from_node
    if src.type == 'GAMMA' and src.label == "PL lift":
        src.inputs["Gamma"].default_value = gamma
        return True
    curve = nt.nodes.new("ShaderNodeGamma")
    curve.label = "PL lift"
    curve.inputs["Gamma"].default_value = gamma
    nt.links.new(sock.links[0].from_socket, curve.inputs["Color"])
    nt.links.new(curve.outputs[0], sock)
    return True


def assign(material, objects, slot_filter=None):
    """Put material on every slot of the objects (or only on slots whose material name passes slot_filter)."""
    n = 0
    for o in objects:
        for slot in o.material_slots:
            if slot.material is not None and (slot_filter is None or slot_filter(slot.material.name)):
                slot.material = material
                n += 1
    return n


# ------------------------------------------------------------------------------------------- mesh helpers

class Piece:
    """One connected part of a mesh. Bounds, centre and normal are in world space."""
    __slots__ = ("index", "faces", "lo", "hi", "centre", "area", "normal", "materials")

    def __repr__(self):
        return (f"Piece#{self.index}(faces={len(self.faces)} area={self.area:.4f} "
                f"x[{self.lo.x:.2f},{self.hi.x:.2f}] y[{self.lo.y:.2f},{self.hi.y:.2f}] z[{self.lo.z:.2f},{self.hi.z:.2f}] "
                f"n=({self.normal.x:.2f},{self.normal.y:.2f},{self.normal.z:.2f}) mats={sorted(self.materials)})")


class Face:
    """What a face test sees. centre and normal are in world space; uv is the mean UV (or None)."""
    __slots__ = ("index", "centre", "normal", "uv", "material", "area", "piece")


def _components(me):
    """Polygon index -> component id, by shared edges."""
    parent = list(range(len(me.polygons)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner = {}
    for p in me.polygons:
        for key in p.edge_keys:
            other = owner.setdefault(key, p.index)
            if other != p.index:
                ra, rb = find(other), find(p.index)
                if ra != rb:
                    parent[rb] = ra
    return [find(i) for i in range(len(parent))]


def pieces(obj):
    """The connected parts of obj's mesh, largest first."""
    me = obj.data
    mw = obj.matrix_world
    rot = mw.to_3x3()
    comp = _components(me)
    names = [s.material.name if s.material else "" for s in obj.material_slots]
    world = [mw @ v.co for v in me.vertices]
    groups = {}
    for p in me.polygons:
        groups.setdefault(comp[p.index], []).append(p.index)
    out = []
    for faces in groups.values():
        pc = Piece()
        pc.faces = faces
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        n = Vector((0.0, 0.0, 0.0))
        area = 0.0
        mats = set()
        for i in faces:
            p = me.polygons[i]
            for vi in p.vertices:
                w = world[vi]
                lo.x, lo.y, lo.z = min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)
                hi.x, hi.y, hi.z = max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)
            n += p.normal * p.area
            area += p.area
            if p.material_index < len(names):
                mats.add(names[p.material_index])
        n = rot @ n
        pc.lo, pc.hi, pc.centre, pc.area, pc.materials = lo, hi, (lo + hi) / 2, area, mats
        pc.normal = n.normalized() if n.length > 1e-12 else n
        out.append(pc)
    out.sort(key=lambda q: -q.area)
    for k, pc in enumerate(out):
        pc.index = k
    return out


def _uv_data(me):
    layer = me.uv_layers.active
    if layer is None:
        return None
    try:
        return [d.vector for d in layer.uv]
    except (AttributeError, TypeError):
        return [d.uv for d in layer.data]


def faces(obj, with_pieces=False):
    """Every face of obj as a Face record (world centre and normal, mean UV, material name)."""
    me = obj.data
    mw = obj.matrix_world
    rot = mw.to_3x3()
    names = [s.material.name if s.material else "" for s in obj.material_slots]
    uvs = _uv_data(me)
    owner = {}
    if with_pieces:
        for pc in pieces(obj):
            for i in pc.faces:
                owner[i] = pc
    out = []
    for p in me.polygons:
        f = Face()
        f.index = p.index
        f.centre = mw @ p.center
        f.normal = (rot @ p.normal).normalized()
        f.area = p.area
        f.material = names[p.material_index] if p.material_index < len(names) else ""
        if uvs is not None:
            u = v = 0.0
            for li in p.loop_indices:
                u += uvs[li][0]
                v += uvs[li][1]
            f.uv = (u / p.loop_total, v / p.loop_total)
        else:
            f.uv = None
        f.piece = owner.get(p.index)
        out.append(f)
    return out


def _slot_for(obj, material):
    me = obj.data
    for i, m in enumerate(me.materials):
        if m == material:
            return i
    me.materials.append(material)
    return len(me.materials) - 1


def assign_faces(obj, material, test, with_pieces=False):
    """Give the faces that pass test(Face) their own material slot on obj. Returns how many faces changed."""
    hits = [f.index for f in faces(obj, with_pieces) if test(f)]
    if not hits:
        return 0
    slot = _slot_for(obj, material)
    polys = obj.data.polygons
    for i in hits:
        polys[i].material_index = slot
    obj.data.update()
    return len(hits)


def assign_pieces(obj, material, test):
    """Give whole connected parts that pass test(Piece) the material. Returns how many faces changed."""
    hits = [i for pc in pieces(obj) if test(pc) for i in pc.faces]
    if not hits:
        return 0
    slot = _slot_for(obj, material)
    polys = obj.data.polygons
    for i in hits:
        polys[i].material_index = slot
    obj.data.update()
    return len(hits)


def remove_faces(obj, test, with_pieces=False):
    """Delete the faces that pass test(Face) from the mesh in memory (the source file is never saved)."""
    import bmesh
    hits = {f.index for f in faces(obj, with_pieces) if test(f)}
    if not hits:
        return 0
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in hits], context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(hits)


def drop_inner_shells(objects, keep=None):
    """Make double-skinned windows single panes: remove the faces of the inner-skin objects.

    objects are the '...Inside' meshes. keep(Face) -> True protects faces that are not window glass (for
    example red tail-lamp inserts that live in the same mesh). An object left with no faces is hidden.
    """
    removed = 0
    for o in objects:
        if o is None or o.type != 'MESH':
            continue
        removed += remove_faces(o, (lambda f: not keep(f)) if keep else (lambda f: True))
        if len(o.data.polygons) == 0:
            o.hide_render = True
            o.hide_viewport = True
    return removed


def apply(ctx):
    """Nothing car-independent to do: adapters assign glass because only they know which meshes are glass."""
    log(f"GLASS look: tint {ctx.cfg.get('look', {}).get('glass', {}).get('tint_hex', '#D9E4E0')}")

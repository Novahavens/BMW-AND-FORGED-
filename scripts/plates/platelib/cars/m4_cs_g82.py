"""m4_cs_g82: the fixes and role assignments only this car needs.

apply(ctx) runs once after the shared look; on_view(ctx, view) after every view change.

What this car is (measured, see /home/claude/plates_out/reports/ws2.md):
  * C02_Glass_body_24 is one mesh of 11 islands: windscreen, rear window, two quarter windows, a pane over the
    carbon roof, two headlight lenses and four tail-lamp lenses. All of it arrives as one grey "Glass".
  * C03_Light_body_09 holds the lit parts: two L-shaped DRL guides and a projector card per headlight, and
    the fibre strips of the tail lamps. The headlight housing is real geometry inside C01_Body_body_12.
  * The body colour was baked into two textures. Faces that were not pure body colour kept them
    (Hood_Stripes, Body_Textured). Here those faces go back to Paint and what the texture drew on top
    (carbon bonnet channels, shut lines) becomes a thin decal layer above the paint.
  * Trim materials came from a game engine with almost no specular reflection; they get the normal 4%.
"""
import math

import bpy
import numpy as np

from .. import glass, lamps
from ..core import fail, log

GLASS_BODY = "C02_Glass_body_24"
GLASS_DOORS = ("C02_Glass_leftdoor_25", "C02_Glass_window_26")
HEAD_LENS = "C02_Glass_M4_HeadLens"     # made here: the two headlight lenses, split off the glass mesh
LENS_FLAGGED_LIGHTS = ("L_Strip_CamSide", "L_Strip_FarSide", "L_Kicker_Rear")
LIGHTS = "C03_Light_body_09"
TRIM = "C01_Body_body_12"      # textured trim: lamp housings, window surrounds, mirrors, badges
FRONT_Y = -1.5                 # glass ahead of this is a headlight lens
REAR_Y = 1.6                   # glass behind this (and below the rear window) is a tail-lamp lens
HEAD_BOX = ((0.34, -2.34, 0.52), (0.94, -1.74, 0.81))   # |x|, y, z of one headlamp cavity
TAIL_LENS_HEX = "#C81E1E"
TAIL_FIBRE_HEX = "#FF1E0A"
TAIL_FIBRE_STRENGTH = 3.0
CORE_ATTR = "m4_core"          # vertex attribute on the DRL guides: 0 at the rim, 1 in the middle
GUIDE_RIM = 0.8                # emission at the rim of a guide, times the shared DRL strength
GUIDE_CORE = 2.2               # and in its core (the tone curve turns this into the paler hot centre)
GUIDE_FADE = 0.16              # share of the guide's half-width over which the rim fades out
GUIDE_SPILL_SHARE = 0.4        # share of the shared look.drl.spill this car's guides cast on their housing
GUIDE_BODY_GLOW = 0.03         # the guide's plastic body behind the lit face glows this much
SATIN_TONE = 0.15              # small housing parts the atlas paints lighter than this are the satin inserts
SATIN_MAX_AREA = 0.02          # (the lighter strip that runs round the whole lens is its black seal, not an insert)
SCREEN_EMISSION = 0.3          # dashboard screens (the source has them at 1.0: a white block in a dark studio)
LENS_CREASE_DEG = 40.0         # glass folds sharper than this get a hard edge instead of a smeared normal
GLASS_SUBDIVISIONS = 2         # Catmull-Clark levels on the glass mesh (119 flat faces per headlight lens otherwise)
DECAL_LIFT = 0.0003            # metres above the painted surface
WEAVE_TILE = 0.05              # metres per repeat of the carbon weave on the bonnet channels


def _obj(name):
    o = bpy.data.objects.get(name)
    if o is None or o.type != 'MESH':
        fail(f"m4_cs_g82: mesh {name} is missing from the car file")
    return o


def _slot(obj, mat):
    for i, s in enumerate(obj.material_slots):
        if s.material == mat:
            return i
    obj.data.materials.append(mat)
    return len(obj.material_slots) - 1


def _nodes(mat):
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    return nt, bsdf, out


def _new_material(name):
    mat, nt = glass.fresh_material(name)
    return mat, nt, nt.nodes.new("ShaderNodeOutputMaterial")


def _set(node, **values):
    for name, value in values.items():
        sock = node.inputs.get(name.replace("_", " "))
        if sock is not None and not sock.is_linked:
            sock.default_value = value


def _in_lamp_box(piece, box):
    """True when a piece lies wholly inside the box on either side of the car (box x is |x|)."""
    (x0, y0, z0), (x1, y1, z1) = box
    if piece.lo.x * piece.hi.x < 0:
        return False
    ax0, ax1 = sorted((abs(piece.lo.x), abs(piece.hi.x)))
    return x0 <= ax0 and ax1 <= x1 and y0 <= piece.lo.y and piece.hi.y <= y1 and z0 <= piece.lo.z and piece.hi.z <= z1


# ------------------------------------------------------------------ glass

def _is_roof_pane(piece):
    return piece.normal.z > 0.95 and piece.lo.z > 1.2 and piece.area > 0.8


def _crease_folds(obj, degrees):
    """Replace the file's stored normals with smooth ones that break at real folds.

    The lenses wrap round their edges (folds of up to 94 degrees) but the stored normals blend straight
    across, so a strip light mirrored in a lens smeared into a ragged white patch instead of a clean line.
    """
    me = obj.data
    stored = me.attributes.get("custom_normal")
    if stored is not None:
        me.attributes.remove(stored)
    try:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(degrees))
    except AttributeError as e:
        log(f"WARNING m4_cs_g82: could not rebuild the normals of {obj.name}: {e}")
        return 0
    me.update()
    return sum(1 for e in me.edges if e.use_edge_sharp)


def _round_off(obj, levels):
    """Subdivide a coarse glass mesh so reflections run over a curved surface, not over flat facets.

    The outline is kept: corners stay where they are and only the edge between them is smoothed.
    """
    mod = obj.modifiers.new("M4_RoundOff", 'SUBSURF')
    mod.levels = mod.render_levels = levels
    mod.boundary_smooth = 'PRESERVE_CORNERS'
    mod.uv_smooth = 'PRESERVE_BOUNDARIES'
    return mod


def _split_off(obj, material, name):
    """Move the faces that carry material into a new object beside obj: same collections, same modifiers,
    and the same light linking the studio gave obj (it links objects into its lamp collections)."""
    import bmesh
    idx = _slot(obj, material)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx], context='FACES')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in obj.data.materials:
        me.materials.append(m)
    part = bpy.data.objects.new(name, me)
    part.matrix_world = obj.matrix_world.copy()
    for coll in obj.users_collection:
        state = next((entry.light_linking.link_state for o, entry in zip(coll.objects, coll.collection_objects) if o == obj), None)
        coll.objects.link(part)
        if state is not None:
            for o, entry in zip(coll.objects, coll.collection_objects):
                if o == part:
                    entry.light_linking.link_state = state
    for mod in obj.modifiers:
        if mod.type == 'SUBSURF':
            _round_off(part, mod.levels)
    glass.remove_faces(obj, lambda f: f.material == material.name)
    return part


def _unlit_by(objects, light_names, coll_name):
    """Take objects out of some studio lamps with light linking (they still let those lamps' light through).

    A lamp that already lights only a listed set is left alone; one with an exclusion list gets these added.
    """
    own = None
    done = []
    for name in light_names:
        light = bpy.data.objects.get(name)
        if light is None or light.type != 'LIGHT':
            continue
        coll = light.light_linking.receiver_collection
        if coll is None:
            if own is None:
                own = bpy.data.collections.get(coll_name) or bpy.data.collections.new(coll_name)
            coll = own
            light.light_linking.receiver_collection = coll
        elif any(entry.light_linking.link_state == 'INCLUDE' for entry in coll.collection_objects):
            continue
        for o in objects:
            if o.name not in coll.objects:
                coll.objects.link(o)
        for o, entry in zip(coll.objects, coll.collection_objects):
            if o in objects:
                entry.light_linking.link_state = 'EXCLUDE'
        done.append(name)
    return done


def _glass(ctx):
    body = _obj(GLASS_BODY)
    window = glass.window_material(ctx)
    lens = lamps.lens_material(ctx)
    tail = lamps.tinted_lens_material(ctx, "PL_M4_TailLens", TAIL_LENS_HEX)
    n = {}
    n["head"] = glass.assign_pieces(body, lens, lambda p: p.hi.y < FRONT_Y)
    n["tail"] = glass.assign_pieces(body, tail, lambda p: p.lo.y > REAR_Y and p.hi.z < 1.0)
    # a pane floating 6 mm over the carbon roof (the M4 CS roof is lacquered carbon, not glass)
    n["roof"] = glass.remove_faces(body, lambda f: f.piece is not None and _is_roof_pane(f.piece), with_pieces=True)
    n["window"] = glass.assign_pieces(body, window, lambda p: "Glass" in p.materials)
    n["door"] = glass.assign(window, [_obj(name) for name in GLASS_DOORS])
    n["creases"] = _crease_folds(body, LENS_CREASE_DEG)
    _round_off(body, GLASS_SUBDIVISIONS)
    # The headlight lenses wrap round the wing, and that side face mirrors the camera-side strip light as a
    # blown white patch across the outer light guide. In a studio that lamp is flagged off the lens; here the
    # lenses become their own object and are taken out of the strips and the kicker (they keep the glass
    # reflector the studio gives all glass, and every lamp still lights the internals through them).
    head = _split_off(body, lens, HEAD_LENS)
    n["lens_unlit_by"] = _unlit_by([head], LENS_FLAGGED_LIGHTS, "LL_M4_NotHeadLens")
    if (n["head"], n["tail"], n["roof"], n["window"]) != (238, 666, 610, 306):
        log(f"WARNING m4_cs_g82: glass faces differ from the file this adapter was written for: {n}")
    ctx.notes["m4_glass"] = n


# ------------------------------------------------------------------ lamps

def _texture_pixels(mat):
    """The base-colour texture of a source material as (height, width, channels) floats, or None."""
    img = _image_into(mat, "Base Color") if mat is not None else None
    if img is None or img.size[0] == 0:
        return None
    w, h = img.size
    px = np.empty(w * h * img.channels, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, img.channels)


def _piece_tone(piece, uv_of, pixels):
    """Mean stored texture value (0..1) under a piece's faces."""
    h, w = pixels.shape[:2]
    total = n = 0.0
    for i in piece.faces:
        uv = uv_of.get(i)
        if uv is None:
            continue
        total += float(pixels[int((uv[1] % 1.0) * (h - 1)), int((uv[0] % 1.0) * (w - 1)), :3].mean())
        n += 1
    return total / n if n else 0.0


def _refine_guides(obj, mat, rounds=3):
    """Cut the flat light-guide cards into small triangles and store how far each vertex is from the card's
    rim (0 at the rim, 1 at the widest point) in the vertex attribute CORE_ATTR, for the emission profile."""
    import bmesh
    idx = _slot(obj, mat)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if f.material_index == idx])
    for _ in range(rounds):
        edges = list({e for f in bm.faces if f.material_index == idx for e in f.edges})
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1)
    layer = bm.verts.layers.float.get(CORE_ATTR) or bm.verts.layers.float.new(CORE_ATTR)
    todo = {f for f in bm.faces if f.material_index == idx}
    cards = 0
    while todo:
        card, stack = set(), [todo.pop()]
        while stack:
            f = stack.pop()
            card.add(f)
            for v in f.verts:
                for g in v.link_faces:
                    if g in todo:
                        todo.discard(g)
                        stack.append(g)
        rim = [(e.verts[0].co.copy(), e.verts[1].co.copy()) for e in {e for f in card for e in f.edges} if e.is_boundary]
        verts = {v for f in card for v in f.verts}
        dist = {}
        for v in verts:
            best = 1e9
            for p0, p1 in rim:
                seg = p1 - p0
                t = max(0.0, min(1.0, (v.co - p0).dot(seg) / max(seg.length_squared, 1e-18)))
                best = min(best, (v.co - (p0 + seg * t)).length)
            dist[v] = best
        widest = max(dist.values(), default=0.0)
        for v, d in dist.items():
            v[layer] = d / widest if widest > 0 else 1.0
        cards += 1
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return cards


def _shape_emitter(mat):
    """Car-specific finish on the shared emitter: a hot core that falls off to a soft, see-through rim.

    The colour, strength and spill stay whatever lamps.emitter_material set; this only scales the colour
    across the guide (GUIDE_RIM at the edge, GUIDE_CORE in the middle) and fades the last bit of the rim out.
    """
    nt, bsdf, out = _nodes(mat)
    if bsdf is None or out is None:
        log(f"WARNING m4_cs_g82: {mat.name} has no Principled emitter to shape")
        return
    core = nt.nodes.new("ShaderNodeAttribute")
    core.attribute_name = CORE_ATTR
    gain = nt.nodes.new("ShaderNodeMapRange")
    gain.interpolation_type = 'SMOOTHSTEP'
    gain.inputs["From Min"].default_value = 0.0
    gain.inputs["From Max"].default_value = 0.8
    gain.inputs["To Min"].default_value = GUIDE_RIM
    gain.inputs["To Max"].default_value = GUIDE_CORE
    nt.links.new(core.outputs["Fac"], gain.inputs["Value"])
    sock = bsdf.inputs["Emission Color"]
    if sock.is_linked:
        colour = sock.links[0].from_socket
    else:
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = tuple(sock.default_value)
        colour = rgb.outputs[0]
    scaled = nt.nodes.new("ShaderNodeVectorMath")
    scaled.operation = 'SCALE'
    nt.links.new(colour, scaled.inputs[0])
    nt.links.new(gain.outputs["Result"], scaled.inputs["Scale"])
    nt.links.new(scaled.outputs["Vector"], sock)
    surface = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else bsdf.outputs[0]
    fade = nt.nodes.new("ShaderNodeMapRange")
    fade.interpolation_type = 'SMOOTHSTEP'
    fade.inputs["From Min"].default_value = 0.0
    fade.inputs["From Max"].default_value = GUIDE_FADE
    nt.links.new(core.outputs["Fac"], fade.inputs["Value"])
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fade.outputs["Result"], mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(surface, mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def _lamps(ctx):
    lamp = _obj(LIGHTS)
    trim = _obj(TRIM)
    look = ctx.cfg.get("look", {}).get("drl", {})
    drl_hex = look.get("hex", "#FFBA00")
    # the shared DRL colour and strength; less spill than the shared value, because this car's guides sit
    # against large flat gloss walls that mirrored the spill brighter than the guide itself
    drl = lamps.emitter_material(ctx, "PL_M4_DRL", drl_hex, float(look.get("strength", 6.0)),
                                 float(look.get("spill", 0.0)) * GUIDE_SPILL_SHARE)
    projector = lamps.housing_material(ctx, "PL_M4_ProjectorGlass", roughness=0.02)
    fibre = lamps.emitter_material(ctx, "PL_M4_TailFibre", TAIL_FIBRE_HEX, TAIL_FIBRE_STRENGTH)
    housing = lamps.housing_material(ctx, "PL_M4_LampHousing")
    guide_body = lamps.housing_material(ctx, "PL_M4_GuideBody", roughness=0.45, glow_hex=drl_hex, glow=GUIDE_BODY_GLOW)
    satin = lamps.reflector_material(ctx, name="PL_M4_LampSatin", roughness=0.3)
    chrome = lamps.reflector_material(ctx, name="PL_M4_LampChrome", roughness=0.1)
    n = {}
    # the atlas rows tell the lit parts apart: v > 0.44 the two L-shaped guides, below that the projector
    # lens card; at the rear the fibre strips sit on the atlas's red bottom edge
    n["drl"] = glass.assign_faces(lamp, drl, lambda f: f.centre.y < 0 and f.uv is not None and f.uv[1] > 0.44)
    n["projector"] = glass.assign_faces(lamp, projector, lambda f: f.centre.y < 0 and f.uv is not None and f.uv[1] <= 0.44)
    n["fibre"] = glass.assign_faces(lamp, fibre, lambda f: f.centre.y > 0 and f.uv is not None and f.uv[1] < 0.05)
    if (n["drl"], n["projector"]) != (24, 76):
        log(f"WARNING m4_cs_g82: lamp faces differ from the file this adapter was written for: {n}")
    n["guides"] = _refine_guides(lamp, drl)
    _shape_emitter(drl)

    # the housing is real geometry in the trim mesh: the two guide bodies face sideways, the projector
    # surround faces forward, and the parts the atlas paints lighter are the satin-metal inserts
    in_box = lambda p: _in_lamp_box(p, HEAD_BOX)                                      # noqa: E731
    is_guide = lambda p: in_box(p) and abs(p.normal.x) > 0.8 and 0.01 < p.area < 0.06     # noqa: E731
    is_surround = lambda p: in_box(p) and abs(p.normal.y) > 0.95 and 0.01 < p.area < 0.06  # noqa: E731
    pixels = _texture_pixels(bpy.data.materials.get("Trim_Textured"))
    uv_of = {f.index: f.uv for f in glass.faces(trim)} if pixels is not None else {}
    light = {p.index for p in glass.pieces(trim)
             if pixels is not None and in_box(p) and not is_guide(p) and not is_surround(p)
             and p.area < SATIN_MAX_AREA and _piece_tone(p, uv_of, pixels) >= SATIN_TONE}
    n["guide_body"] = glass.assign_pieces(trim, guide_body, is_guide)
    n["surround"] = glass.assign_pieces(trim, chrome, is_surround)
    n["satin"] = glass.assign_pieces(trim, satin, lambda p: p.index in light and "Trim_Textured" in p.materials)
    n["housing"] = glass.assign_pieces(trim, housing, lambda p: in_box(p) and "Trim_Textured" in p.materials)
    if (n["guide_body"], n["surround"]) != (452, 142):
        log(f"WARNING m4_cs_g82: headlamp housing parts differ from the file this adapter was written for: {n}")
    ctx.notes["m4_lamps"] = n


# ------------------------------------------------------------------ baked-paint leftovers

def _image_into(mat, socket_name):
    """The image texture that feeds a Principled input of a source material (directly or through one node)."""
    _, bsdf, _ = _nodes(mat)
    todo = [l.from_node for l in bsdf.inputs[socket_name].links]
    seen = 0
    while todo and seen < 8:
        n = todo.pop(0)
        seen += 1
        if n.type == 'TEX_IMAGE' and n.image:
            return n.image
        todo += [l.from_node for i in n.inputs for l in i.links]
    return None


def _lift_copy(obj, src_slots, decal):
    """Copy the faces of the given slots, lift the copy a hair off the surface and give it the decal material."""
    import bmesh
    idx = _slot(obj, decal)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [f for f in bm.faces if f.material_index in src_slots]
    made = bmesh.ops.duplicate(bm, geom=faces)["geom"]
    new_faces = [g for g in made if isinstance(g, bmesh.types.BMFace)]
    new_verts = [g for g in made if isinstance(g, bmesh.types.BMVert)]
    bm.normal_update()
    scale = obj.matrix_world.to_scale()
    k = DECAL_LIFT / max(1e-9, (abs(scale.x) + abs(scale.y) + abs(scale.z)) / 3.0)
    for v in new_verts:
        v.co += v.normal * k
    for f in new_faces:
        f.material_index = idx
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(new_faces)


def _mask_from_darkness(nt, image, lo, hi):
    """0..1 where the occlusion map (red channel) is dark: the shut lines and gaps the texture drew."""
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = 'Cubic'
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.interpolation_type = 'SMOOTHSTEP'
    ramp.inputs["From Min"].default_value = lo
    ramp.inputs["From Max"].default_value = hi
    nt.links.new(tex.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs[0], inv.inputs[1])
    nt.links.new(inv.outputs[0], ramp.inputs["Value"])
    return ramp.outputs["Result"]


def _decal_output(nt, out, shader_socket, mask_socket):
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask_socket, mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(shader_socket, mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def _panel_line_material(orm):
    mat, nt, out = _new_material("M4_PanelLines")
    dark = nt.nodes.new("ShaderNodeBsdfPrincipled")
    _set(dark, Base_Color=(0.004, 0.004, 0.004, 1.0), Roughness=0.7, Specular_IOR_Level=0.2)
    _decal_output(nt, out, dark.outputs[0], _mask_from_darkness(nt, orm, 0.35, 0.65))
    return mat


def _carbon_material(albedo, orm, weave, weave_normal):
    """Lacquered carbon where the bonnet texture is grey (the two channels), shut-line black where it is dark."""
    mat, nt, out = _new_material("M4_HoodCarbon")
    carbon = nt.nodes.new("ShaderNodeBsdfPrincipled")
    _set(carbon, Base_Color=(0.02, 0.02, 0.022, 1.0), Metallic=0.35, Roughness=0.42, Specular_IOR_Level=0.5,
         Coat_Weight=1.0, Coat_Roughness=0.03, Coat_IOR=1.5)
    if weave is not None:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        scale = nt.nodes.new("ShaderNodeMapping")
        scale.inputs["Scale"].default_value = (1.0 / WEAVE_TILE,) * 3
        nt.links.new(coord.outputs["Object"], scale.inputs["Vector"])
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = weave
        nt.links.new(scale.outputs[0], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], carbon.inputs["Base Color"])
        if weave_normal is not None:
            ntex = nt.nodes.new("ShaderNodeTexImage")
            ntex.image = weave_normal
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nmap.inputs["Strength"].default_value = 0.6
            nt.links.new(scale.outputs[0], ntex.inputs["Vector"])
            nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs[0], carbon.inputs["Normal"])
    # grey texels (no saturation) are the channels; the body colour around them has saturation near 0.58
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = albedo
    tex.interpolation = 'Cubic'
    hsv = nt.nodes.new("ShaderNodeSeparateColor")
    hsv.mode = 'HSV'
    grey = nt.nodes.new("ShaderNodeMapRange")
    grey.interpolation_type = 'SMOOTHSTEP'
    grey.inputs["From Min"].default_value = 0.22
    grey.inputs["From Max"].default_value = 0.36
    grey.inputs["To Min"].default_value = 1.0
    grey.inputs["To Max"].default_value = 0.0
    nt.links.new(tex.outputs["Color"], hsv.inputs[0])
    nt.links.new(hsv.outputs[1], grey.inputs["Value"])
    mask = grey.outputs["Result"]
    if orm is not None:
        both = nt.nodes.new("ShaderNodeMath")
        both.operation = 'MAXIMUM'
        nt.links.new(mask, both.inputs[0])
        nt.links.new(_mask_from_darkness(nt, orm, 0.35, 0.65), both.inputs[1])
        mask = both.outputs[0]
    _decal_output(nt, out, carbon.outputs[0], mask)
    return mat


def _leftovers(ctx):
    paint = ctx.paint.mat
    hood_src = bpy.data.materials.get("Hood_Stripes")
    body_src = bpy.data.materials.get("Body_Textured")
    carbon_src = bpy.data.materials.get("Carbon")
    made = {}
    if hood_src is not None:
        weave = weave_normal = None
        if carbon_src is not None:
            weave = _image_into(carbon_src, "Base Color")
            weave_normal = _image_into(carbon_src, "Normal")
        decal = _carbon_material(_image_into(hood_src, "Base Color"), _image_into(hood_src, "Roughness"), weave, weave_normal)
        made["hood"] = _retarget(hood_src, paint, decal)
    if body_src is not None:
        orm = _image_into(body_src, "Roughness")
        if orm is None:
            log("WARNING m4_cs_g82: Body_Textured has no occlusion map; its faces become plain paint")
        decal = _panel_line_material(orm) if orm is not None else None
        made["body"] = _retarget(body_src, paint, decal)
    ctx.notes["m4_leftovers"] = made


def _retarget(src, paint, decal):
    """Every face that uses src becomes Paint, with a lifted decal copy on top. Returns the number of decal faces."""
    n = 0
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        slots = [i for i, s in enumerate(o.material_slots) if s.material == src]
        if not slots:
            continue
        if decal is not None:
            n += _lift_copy(o, set(slots), decal)
        for i in slots:
            o.material_slots[i].material = paint
    return n


# ------------------------------------------------------------------ trim

def _grey_vertex_shade(mat):
    """The vertex colours are a packed game channel set: red is occlusion, green and blue something else.
    Multiplied in as a colour they tint every shaded corner dark red. Use the red channel alone, as grey."""
    nt = mat.node_tree
    changed = 0
    for node in [n for n in nt.nodes if n.type == 'VERTEX_COLOR']:
        for link in list(node.outputs["Color"].links):
            target = link.to_socket
            red = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(node.outputs["Color"], red.inputs[0])
            nt.links.new(red.outputs[0], target)
            changed += 1
    return changed


def _trim(ctx):
    """Source trim materials reflect almost nothing (specular level 0.03-0.11 instead of 0.5) and carry a red
    vertex tint. Wheels, tyres and brakes are WS4's and are left alone."""
    wheels = bpy.data.collections.get("Wheels")
    skip = {s.material for o in (wheels.all_objects if wheels else []) for s in o.material_slots if s.material}
    skip.add(ctx.paint.mat)
    n = {"specular": 0, "vertex_tint": 0}
    for coll_name in ("Body", "Interior", "Lights"):
        coll = bpy.data.collections.get(coll_name)
        for o in (coll.all_objects if coll else []):
            for s in o.material_slots:
                m = s.material
                if m is None or m in skip or m.name.startswith(("PL_", "M4_")) or m.node_tree is None:
                    continue
                skip.add(m)
                _, bsdf, _ = _nodes(m)
                if bsdf is None:
                    continue
                spec = bsdf.inputs.get("Specular IOR Level")
                if spec is not None and not spec.is_linked and spec.default_value < 0.3:
                    spec.default_value = 0.5
                    n["specular"] += 1
                n["vertex_tint"] += _grey_vertex_shade(m)

    # lacquered carbon (roof, splitter, mirror caps, diffuser): the source has a third of a clear coat
    carbon = bpy.data.materials.get("Carbon")
    if carbon is not None:
        _, bsdf, _ = _nodes(carbon)
        if bsdf is not None:
            _set(bsdf, Coat_Weight=1.0, Coat_Roughness=0.03, Coat_IOR=1.5)
    # kidney frames and bars: piano black (the source makes them 70% metal with a black base: a dead mirror)
    frames = bpy.data.materials.get("Trim_GlossBlack_2")
    if frames is not None:
        _, bsdf, _ = _nodes(frames)
        if bsdf is not None:
            _set(bsdf, Metallic=0.0, Roughness=0.12, Coat_Weight=1.0, Coat_Roughness=0.03)
    # dashboard screens: dimmer, and lit on their face only (the back of the display glowed through the windscreen)
    for name in ("Interior_B", "Interior_C"):
        m = bpy.data.materials.get(name)
        nt, bsdf, _ = _nodes(m) if m is not None else (None, None, None)
        if bsdf is None or bsdf.inputs["Emission Strength"].is_linked:
            continue
        side = nt.nodes.new("ShaderNodeNewGeometry")
        front = nt.nodes.new("ShaderNodeMapRange")
        front.inputs["To Min"].default_value = SCREEN_EMISSION
        front.inputs["To Max"].default_value = 0.0
        nt.links.new(side.outputs["Backfacing"], front.inputs["Value"])
        nt.links.new(front.outputs["Result"], bsdf.inputs["Emission Strength"])
    ctx.notes["m4_trim"] = n


def apply(ctx):
    _glass(ctx)
    _lamps(ctx)
    _leftovers(ctx)
    _trim(ctx)
    log(f"ADAPTER m4_cs_g82: glass={ctx.notes['m4_glass']} lamps={ctx.notes['m4_lamps']} "
        f"decal faces={ctx.notes['m4_leftovers']} trim={ctx.notes['m4_trim']}")

"""Headlights and tail lights: clear lenses, reflectors and the daytime running lights.

OWNER: look-dev (shared helpers; car adapters decide which meshes are lens, reflector and light guide).
Target: crystal-clear lenses with the internals visible, DRLs lit in selective yellow (config look.drl),
bright enough to read as on, not so bright that the tone curve washes them to white.

Helpers (signatures are stable; tune the insides and the config's look.lens / look.drl values):
    lens_material(ctx, name="PL_Lens") -> material                 clear cover lens, thin wall, no tint
    reflector_material(ctx, name="PL_Reflector", roughness=0.1, tone=0.91, vertex_ao=False)
                                                                   bright metal for reflectors and bezels
    emitter_material(ctx, name, hex_code, strength, spill=0.0, across=None, along=None, core=1.0, ends=1.0)
                                                                   a lit light guide in any colour
    drl_material(ctx, name="PL_DRL", across=None, along=None)      the yellow daytime running light
    housing_material(ctx, name="PL_LampHousing", source=None, ...) lamp internals that keep the car's own texture
    projector_material(ctx, name="PL_Projector", source=None)      the glass ball of a projector module
    tinted_lens_material(ctx, name, hex_code, ...)                 red / amber inner lenses
"""
import bpy

from .core import hex_to_linear
from .glass import _principled, fresh_material, set_input, transmissive_material


def _look(ctx, key):
    return ctx.cfg.get("look", {}).get(key, {})


def lens_material(ctx, name="PL_Lens"):
    """The clear cover lens of a lamp: polycarbonate, no tint, lets all light in and out."""
    look = _look(ctx, "lens")
    return transmissive_material(name, (1.0, 1.0, 1.0, 1.0), float(look.get("ior", 1.585)),
                                 bool(look.get("thin_wall", True)), 1.0)


def tinted_lens_material(ctx, name, hex_code, shadow_transparency=0.9):
    """A coloured inner lens (red tail lamp, amber indicator). Thin wall, so stacked pieces do not go black."""
    look = _look(ctx, "lens")
    return transmissive_material(name, hex_to_linear(hex_code), float(look.get("ior", 1.585)),
                                 bool(look.get("thin_wall", True)), shadow_transparency)


def reflector_material(ctx, name="PL_Reflector", roughness=0.1, tone=0.91, vertex_ao=False):
    """Bright metal for reflectors and bezels. tone is the metal's reflectance (0.91 chrome, 0.3-0.5 shadow
    chrome). vertex_ao multiplies in the mesh's colour attribute (game cars bake crevice shading there); only
    switch it on for meshes that have one, a missing attribute reads as black."""
    mat, nt = fresh_material(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    set_input(bsdf, "Base Color", (tone, tone * 1.01, tone * 1.01, 1.0))
    set_input(bsdf, "Metallic", 1.0)
    set_input(bsdf, "Roughness", roughness)
    if vertex_ao:
        col = nt.nodes.new("ShaderNodeVertexColor")
        lift = nt.nodes.new("ShaderNodeMapRange")           # keep crevices dark, never black
        lift.inputs["To Min"].default_value = 0.35 * tone
        lift.inputs["To Max"].default_value = tone
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(col.outputs["Color"], bw.inputs[0])
        nt.links.new(bw.outputs[0], lift.inputs["Value"])
        grey = nt.nodes.new("ShaderNodeCombineColor")
        for i in range(3):
            nt.links.new(lift.outputs[0], grey.inputs[i])
        nt.links.new(grey.outputs[0], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def _uv_ramp(nt, uv_out, spec):
    """0..1 across a UV range. spec = (axis, lo, hi): axis 0 is U, 1 is V."""
    axis, lo, hi = spec
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv_out, sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = float(lo)
    ramp.inputs["From Max"].default_value = float(hi)
    nt.links.new(sep.outputs[int(axis)], ramp.inputs["Value"])
    return ramp.outputs[0]


def _bump(nt, t_out, low, high=1.0):
    """low at t = 0 and t = 1, high at t = 0.5, smooth in between."""
    tri = nt.nodes.new("ShaderNodeMath")
    tri.operation = 'PINGPONG'
    tri.inputs[1].default_value = 0.5
    nt.links.new(t_out, tri.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.interpolation_type = 'SMOOTHSTEP'
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = 0.5
    ramp.inputs["To Min"].default_value = float(low)
    ramp.inputs["To Max"].default_value = float(high)
    nt.links.new(tri.outputs[0], ramp.inputs["Value"])
    return ramp.outputs[0]


def emitter_material(ctx, name, hex_code, strength, spill=0.0, across=None, along=None, core=1.0, ends=1.0):
    """A lit light guide: a frosted rod that glows.

    strength is what the camera sees at the guide's edge, directly or through a clear lens (near 1.5-2 keeps
    a yellow saturated under the tone curve). spill is the strength every other ray sees: with spill > 0 the
    guide is sampled as a small lamp and lights the housing around it, which is what makes it read as
    switched on; spill = 0 only glows (no light cast, no noise).

    A real guide is hottest along its middle and fades toward its ends. If the car's mesh has UVs that run
    across and along the guide, pass across=(axis, lo, hi) and/or along=(axis, lo, hi) (axis 0 = U, 1 = V):
    the middle then gets strength * core (2-2.5 lets the core start to wash toward pale yellow) and the two
    ends strength * ends. Without them the guide is uniform.
    """
    mat, nt = fresh_material(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    colour = hex_to_linear(hex_code)
    set_input(bsdf, "Base Color", (0.35, 0.33, 0.28, 1.0))    # frosted acrylic, also catches the studio light
    set_input(bsdf, "Roughness", 0.45)
    set_input(bsdf, "Emission Color", colour)
    set_input(bsdf, "Emission Strength", float(strength))
    level = None                                               # a socket carrying the strength, when it varies
    shape = None
    if across is not None or along is not None:
        uv = nt.nodes.new("ShaderNodeUVMap").outputs[0]
        if across is not None:
            shape = _bump(nt, _uv_ramp(nt, uv, across), 1.0, float(core))
        if along is not None:
            fade = _bump(nt, _uv_ramp(nt, uv, along), float(ends), 1.0)
            if shape is None:
                shape = fade
            else:
                both = nt.nodes.new("ShaderNodeMath")
                both.operation = 'MULTIPLY'
                nt.links.new(shape, both.inputs[0])
                nt.links.new(fade, both.inputs[1])
                shape = both.outputs[0]
    if spill > 0:
        path = nt.nodes.new("ShaderNodeLightPath")
        direct = nt.nodes.new("ShaderNodeMath")      # seen directly, or straight through a clear lens
        direct.operation = 'MAXIMUM'
        nt.links.new(path.outputs["Is Camera Ray"], direct.inputs[0])
        nt.links.new(path.outputs["Is Transmission Ray"], direct.inputs[1])
        pick = nt.nodes.new("ShaderNodeMapRange")
        pick.inputs["To Min"].default_value = float(spill)
        pick.inputs["To Max"].default_value = float(strength)
        nt.links.new(direct.outputs[0], pick.inputs["Value"])
        level = pick.outputs[0]
    if shape is not None:
        scale = nt.nodes.new("ShaderNodeMath")
        scale.operation = 'MULTIPLY'
        nt.links.new(shape, scale.inputs[0])
        if level is not None:
            nt.links.new(level, scale.inputs[1])
        else:
            scale.inputs[1].default_value = float(strength)
        level = scale.outputs[0]
    if level is not None:
        nt.links.new(level, bsdf.inputs["Emission Strength"])
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    try:
        mat.cycles.emission_sampling = 'FRONT_BACK' if spill > 0 else 'NONE'
    except (AttributeError, TypeError):
        pass
    return mat


def drl_material(ctx, name="PL_DRL", across=None, along=None):
    """The daytime running light in the config's colour (look.drl). across / along: see emitter_material."""
    look = _look(ctx, "drl")
    return emitter_material(ctx, name, look.get("hex", "#FFBA00"), float(look.get("strength", 6.0)),
                            float(look.get("spill", 0.0)), across=across, along=along,
                            core=float(look.get("core", 1.0)), ends=float(look.get("ends", 1.0)))


def housing_material(ctx, name="PL_LampHousing", source=None, chrome_above=0.22, roughness=0.18,
                     glow_hex=None, glow=0.0):
    """Lamp internals that keep the car's own texture: bright texels become metal, dark texels gloss plastic.

    source is the car's lamp material (image texture x vertex colour feeding Base Color); without one the
    result is a plain dark gloss housing. chrome_above is the albedo value where plastic turns into metal.
    glow adds a little of glow_hex as emission scaled by the albedo, for housings that sit next to a lit guide.
    """
    mat, nt = fresh_material(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    set_input(bsdf, "Roughness", roughness)
    albedo = None
    src_tree = source.node_tree if source is not None else None
    tex = next((n for n in src_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None) if src_tree else None
    if tex is not None:
        img = nt.nodes.new("ShaderNodeTexImage")
        img.image = tex.image
        img.interpolation = tex.interpolation
        col = nt.nodes.new("ShaderNodeVertexColor")
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs[0].default_value = 1.0
        nt.links.new(img.outputs["Color"], mul.inputs[6])
        nt.links.new(col.outputs["Color"], mul.inputs[7])
        albedo = mul.outputs[2]
        nt.links.new(albedo, bsdf.inputs["Base Color"])
        lum = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(img.outputs["Color"], lum.inputs[0])
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["From Min"].default_value = chrome_above * 0.7
        ramp.inputs["From Max"].default_value = chrome_above * 1.3
        nt.links.new(lum.outputs[0], ramp.inputs["Value"])
        nt.links.new(ramp.outputs[0], bsdf.inputs["Metallic"])
    else:
        set_input(bsdf, "Base Color", (0.02, 0.02, 0.022, 1.0))
        set_input(bsdf, "Metallic", 0.0)
    if glow > 0 and glow_hex:
        r, g, b, _ = hex_to_linear(glow_hex)
        if albedo is not None:
            tint = nt.nodes.new("ShaderNodeMix")
            tint.data_type = 'RGBA'
            tint.blend_type = 'MULTIPLY'
            tint.inputs[0].default_value = 1.0
            tint.inputs[7].default_value = (r, g, b, 1.0)
            nt.links.new(albedo, tint.inputs[6])
            nt.links.new(tint.outputs[2], bsdf.inputs["Emission Color"])
        else:
            set_input(bsdf, "Emission Color", (r, g, b, 1.0))
        set_input(bsdf, "Emission Strength", float(glow))
        try:
            mat.cycles.emission_sampling = 'NONE'
        except (AttributeError, TypeError):
            pass
    return mat


def projector_material(ctx, name="PL_Projector", source=None):
    """A projector lens seen from outside: a dark glass ball that glints. Keeps the car's lens texture."""
    mat, nt = fresh_material(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    src_tree = source.node_tree if source is not None else None
    tex = next((n for n in src_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None) if src_tree else None
    if tex is not None:
        img = nt.nodes.new("ShaderNodeTexImage")
        img.image = tex.image
        nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        set_input(bsdf, "Base Color", (0.02, 0.02, 0.025, 1.0))
    set_input(bsdf, "Metallic", 0.0)
    set_input(bsdf, "Roughness", 0.04)
    set_input(bsdf, "IOR", 1.52)
    set_input(bsdf, "Specular IOR Level", 1.0)
    set_input(bsdf, "Coat Weight", 1.0)
    set_input(bsdf, "Coat Roughness", 0.0)
    return mat


def apply(ctx):
    pass

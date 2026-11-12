"""Body paint: one shader, driven by the paint table in plates.config.json.

OWNER: look-dev (shared). PaintRig wraps the studio's Paint material. Without the look (render.py --no-look)
it drives the baseline rig from the first hero stills. With the look, apply(ctx) rebuilds the material as a
layered car paint and every finish class reads as what it is:

    base    the pigment / flake layer: a soft, coloured lobe. Metallic and pearl bases are part metal, so the
            colour itself flashes (the flop): bright where a lamp is mirrored, darker and richer at grazing angles.
    flake   a fine cell pattern tilts the base normal and varies its roughness, only in the base layer. In a
            whole-car frame it averages out to the soft lobe; in the wheel close-up it is the sparkle.
    pearl   thin-film interference on the base plus a hue shift toward grazing angles: colour travel.
    coat    the clear coat: a second, sharp lobe on top (IOR 1.5). Gloss classes 0.015-0.03 rough; satin and
            frozen have a matte clear (0.16-0.4) over a still-metallic base, which is why frozen paint keeps a
            broad sheen that follows the form instead of going flat grey.
    peel    orange peel: a millimetre-scale waviness in the coat normal only, a little stronger on vertical
            panels. It is what stops a mirror-smooth gloss from reading as moulded plastic.

Paint parameters (config paint_finishes.<class>, overridable per paint in "o"):
    metalness roughness clearcoat clearcoatRoughness flake iridescence iridescenceIOR     (as before)
    flake_scale   cells per metre (default 2400: about 0.4 mm)
    flop          0..1 how far the base colour moves at grazing angles
    flop_value    brightness of the grazing colour relative to the face colour (default 0.5)
    flop_sat      saturation of the grazing colour (default 1.15)
    flop_hue      hue rotation of the grazing colour, in turns (pearl colour travel; default 0)
    peel          orange peel strength, 1.0 = factory gloss (default by class)
    peel_scale    waves per metre (default 260: about 4 mm)
"""
import bpy

from .core import fail, hex_to_linear, log

REF_FLAKE = 0.32          # 'metallic' flake strength the studio's flake nodes were tuned for
METAL_GAIN = 1.2          # table metalness 0.75 -> 0.9, the value the reference render used
THIN_FILM_NM = 300.0      # baseline rig: thin-film thickness per unit of table iridescence
FILM_BASE_NM = 250.0      # layered rig: thickness = FILM_BASE_NM + FILM_SPAN_NM * iridescence
FILM_SPAN_NM = 400.0
FLAKE_TILT = 0.35         # normal tilt of a flake cell at table flake = REF_FLAKE
PEEL_DEPTH = 2.2e-5       # metres of coat waviness at peel = 1 (wavelength about 4 mm)


class PaintRig:
    def __init__(self, ctx):
        mat = bpy.data.materials.get("Paint")
        if mat is None or mat.node_tree is None:
            fail("studio Paint material missing")
        self.mat = mat
        nt = mat.node_tree
        self.bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if self.bsdf is None:
            fail("Paint material has no Principled BSDF")
        self.flake = next((n for n in nt.nodes if n.type == 'VECT_MATH' and n.operation == 'MULTIPLY_ADD'), None)
        self.coat = next((n for n in nt.nodes if n.type == 'MAP_RANGE'), None)
        self.flake_mul = tuple(self.flake.inputs[1].default_value) if self.flake else None
        self.flake_add = tuple(self.flake.inputs[2].default_value) if self.flake else None
        self.layered = None       # the layered rig's nodes, once apply(ctx) has built them
        self.current = None

    def set_input(self, name, value):
        sock = self.bsdf.inputs.get(name)
        if sock is not None and not sock.is_linked:
            sock.default_value = value

    # ------------------------------------------------------------------ the layered rig (the look)

    def build_layered(self):
        """Replace the material's nodes with the layered car paint. Values are set later by apply(p)."""
        nt = self.mat.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        new, link = nt.nodes.new, nt.links.new
        out = new("ShaderNodeOutputMaterial")
        bsdf = new("ShaderNodeBsdfPrincipled")
        link(bsdf.outputs[0], out.inputs["Surface"])
        coord = new("ShaderNodeTexCoord")
        geo = new("ShaderNodeNewGeometry")

        # flake: a random tilt and a random roughness per cell, base layer only
        cells = new("ShaderNodeTexVoronoi")
        cells.feature = 'F1'
        link(coord.outputs["Object"], cells.inputs["Vector"])
        tilt = new("ShaderNodeVectorMath")
        tilt.operation = 'MULTIPLY_ADD'
        link(cells.outputs["Color"], tilt.inputs[0])
        bent = new("ShaderNodeVectorMath")
        bent.operation = 'ADD'
        link(geo.outputs["Normal"], bent.inputs[0])
        link(tilt.outputs[0], bent.inputs[1])
        unit = new("ShaderNodeVectorMath")
        unit.operation = 'NORMALIZE'
        link(bent.outputs[0], unit.inputs[0])
        link(unit.outputs[0], bsdf.inputs["Normal"])
        pick = new("ShaderNodeSeparateColor")
        link(cells.outputs["Color"], pick.inputs[0])
        rough = new("ShaderNodeMapRange")                    # per-cell base roughness: some flakes glint
        link(pick.outputs[0], rough.inputs["Value"])
        link(rough.outputs[0], bsdf.inputs["Roughness"])

        # flop: the base colour moves toward a darker, richer (or hue-shifted) colour at grazing angles
        facing = new("ShaderNodeLayerWeight")
        facing.inputs["Blend"].default_value = 0.35
        face = new("ShaderNodeRGB")
        graze = new("ShaderNodeHueSaturation")
        link(face.outputs[0], graze.inputs["Color"])
        amount = new("ShaderNodeMath")
        amount.operation = 'MULTIPLY'
        link(facing.outputs["Facing"], amount.inputs[0])
        blend = new("ShaderNodeMix")
        blend.data_type = 'RGBA'
        link(amount.outputs[0], blend.inputs[0])
        link(face.outputs[0], blend.inputs[6])
        link(graze.outputs[0], blend.inputs[7])
        link(blend.outputs[2], bsdf.inputs["Base Color"])

        # orange peel: coat normal only, stronger where the panel is vertical
        waves = new("ShaderNodeTexNoise")
        waves.inputs["Detail"].default_value = 1.5
        waves.inputs["Roughness"].default_value = 0.45
        link(coord.outputs["Object"], waves.inputs["Vector"])
        up = new("ShaderNodeSeparateXYZ")
        link(geo.outputs["Normal"], up.inputs[0])
        flat = new("ShaderNodeMath")
        flat.operation = 'ABSOLUTE'
        link(up.outputs[2], flat.inputs[0])
        sag = new("ShaderNodeMapRange")                      # 1.0 on a horizontal panel, 1.5 on a vertical one
        sag.inputs["From Min"].default_value = 1.0
        sag.inputs["From Max"].default_value = 0.0
        sag.inputs["To Min"].default_value = 1.0
        sag.inputs["To Max"].default_value = 1.5
        link(flat.outputs[0], sag.inputs["Value"])
        depth = new("ShaderNodeMath")
        depth.operation = 'MULTIPLY'
        link(sag.outputs[0], depth.inputs[0])
        peel = new("ShaderNodeBump")
        peel.inputs["Strength"].default_value = 1.0
        link(waves.outputs[0], peel.inputs["Height"])
        link(depth.outputs[0], peel.inputs["Distance"])
        link(peel.outputs[0], bsdf.inputs["Coat Normal"])

        self.bsdf = bsdf
        self.flake = self.coat = None
        self.layered = {"cells": cells, "tilt": tilt, "rough": rough, "face": face, "graze": graze,
                        "amount": amount, "waves": waves, "depth": depth}
        if self.current:
            self.apply(self.current)

    def apply_layered(self, p):
        n = self.layered
        bsdf = self.bsdf
        base = hex_to_linear(p["hex"])
        n["face"].outputs[0].default_value = base
        metal = min(1.0, p["metalness"] * METAL_GAIN)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["IOR"].default_value = 1.5
        # flake
        f = p.get("flake", 0.0) / REF_FLAKE
        n["cells"].inputs["Scale"].default_value = float(p.get("flake_scale", 2400.0))
        t = FLAKE_TILT * f
        n["tilt"].inputs[1].default_value = (t, t, t)
        n["tilt"].inputs[2].default_value = (-t / 2, -t / 2, -t / 2)
        r = float(p["roughness"])
        spread = min(0.6, 0.45 * f)                           # cell-to-cell roughness variation
        n["rough"].inputs["To Min"].default_value = max(0.04, r * (1.0 - spread))
        n["rough"].inputs["To Max"].default_value = min(1.0, r * (1.0 + spread * 0.6))
        # flop
        n["amount"].inputs[1].default_value = float(p.get("flop", 0.0))
        n["graze"].inputs["Hue"].default_value = 0.5 + float(p.get("flop_hue", 0.0))
        n["graze"].inputs["Saturation"].default_value = float(p.get("flop_sat", 1.15))
        n["graze"].inputs["Value"].default_value = float(p.get("flop_value", 0.5))
        # pearl
        irid = float(p.get("iridescence", 0.0))
        bsdf.inputs["Thin Film Thickness"].default_value = FILM_BASE_NM + FILM_SPAN_NM * irid if irid > 0 else 0.0
        bsdf.inputs["Thin Film IOR"].default_value = float(p.get("iridescenceIOR", 1.5))
        # coat
        bsdf.inputs["Coat Weight"].default_value = float(p["clearcoat"])
        bsdf.inputs["Coat Roughness"].default_value = float(p["clearcoatRoughness"])
        bsdf.inputs["Coat IOR"].default_value = float(p.get("coat_ior", 1.5))
        n["waves"].inputs["Scale"].default_value = float(p.get("peel_scale", 260.0))
        n["depth"].inputs[1].default_value = PEEL_DEPTH * float(p.get("peel", 1.0))

    # ------------------------------------------------------------------ the baseline rig (--no-look)

    def apply_baseline(self, p):
        self.set_input("Base Color", hex_to_linear(p["hex"]))
        self.set_input("Metallic", min(1.0, p["metalness"] * METAL_GAIN))
        self.set_input("Roughness", p["roughness"])
        self.set_input("Coat Weight", p["clearcoat"])
        irid = p.get("iridescence", 0.0)
        self.set_input("Thin Film Thickness", THIN_FILM_NM * irid)
        self.set_input("Thin Film IOR", p.get("iridescenceIOR", 1.5))
        if self.flake:
            f = p.get("flake", 0.0) / REF_FLAKE
            self.flake.inputs[1].default_value = tuple(v * f for v in self.flake_mul)
            self.flake.inputs[2].default_value = tuple(v * f for v in self.flake_add)
        if self.coat:
            cr = p["clearcoatRoughness"]
            self.coat.inputs["To Min"].default_value = cr * 0.5
            self.coat.inputs["To Max"].default_value = cr * 4.0 / 3.0

    def apply(self, p):
        """p is Config.paint(...): hex plus the finish values listed in the module docstring."""
        if self.layered:
            self.apply_layered(p)
        else:
            self.apply_baseline(p)
        self.current = p


def apply(ctx):
    """Switch the scene's paint to the layered rig (runs with the look; --no-look keeps the baseline)."""
    ctx.paint.build_layered()
    log("PAINT: layered rig (base + flake + flop + coat + peel)")

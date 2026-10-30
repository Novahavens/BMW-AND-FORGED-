"""Blender materials for FORGEDSA wheel finishes, built the way the real coatings are layered
(see services/wheelFinish.ts for the live-engine version of the same recipes).

  polished      bare polished metal: coloured metal reflectance, near-mirror, clear coat
  gloss-paint   solid paint under a thick gloss clear coat; a faint orange peel in the coat
  satin         metallic paint (fine aluminium flake) under a satin clear coat; a soft micro-texture
                varies the roughness so the sheen reads as powder coat, not dull plastic
  metallic      metallic paint under a gloss clear coat, with flake sparkle
  brushed       machined aluminium: subtle anisotropic roughness, the grain running round the hub ("brush": "legacy" = the old straight
                bump brushing), thin clear coat

Recipes are chosen from the finish's numbers (hex, metalness, roughness, clearcoat) like
finishKind(), or forced with "kind" in finishes.json. Base colours are sRGB hex.
"""
import bpy

def srgb_to_lin(h):
    c = [int(h.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def kind(f):
    if f.get('kind'): return f['kind']
    r, g, b = srgb_to_lin(f['hex']); lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    dark = lum < 0.03
    if f['metalness'] >= 0.95 and f['roughness'] <= 0.16 and not dark: return 'polished'
    if (dark or f['metalness'] < 0.3) and f['roughness'] < 0.42: return 'gloss-paint'
    if f['roughness'] >= 0.42: return 'satin'
    return 'metallic'

def _noise(nt, scale, detail=2.0, roughness=0.5):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = roughness
    return n

def _maprange(nt, src, lo, hi):
    m = nt.nodes.new('ShaderNodeMapRange'); m.inputs['To Min'].default_value = lo; m.inputs['To Max'].default_value = hi
    nt.links.new(src, m.inputs['Value']); return m.outputs['Result']

def _bump(nt, src, strength, distance=0.0005):
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = strength; b.inputs['Distance'].default_value = distance
    nt.links.new(src, b.inputs['Height']); return b.outputs['Normal']

def make(f, part='face'):
    """f: dict with id, hex, metalness, roughness, clearcoat and optional kind -> bpy Material.
    part='barrel': the same coating without directional brushing or bump. A barrel is turned on a
    lathe (round, even), and a straight brushing pattern wrapped round a cylinder reads as dents."""
    k = kind(f)
    if part == 'barrel' and k == 'brushed':
        k = 'metallic'; f = {**f, 'roughness': f['roughness'] * 0.8}
    m = bpy.data.materials.new(f"{f['id']}_{part}"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    col = srgb_to_lin(f['hex']); b.inputs['Base Color'].default_value = (*col, 1)
    # texture coordinates: object space so the grain scales with the rim, not its UVs
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if k == 'polished':
        b.inputs['Metallic'].default_value = 1.0
        b.inputs['Roughness'].default_value = max(0.04, min(f['roughness'], 0.08))
        b.inputs['Coat Weight'].default_value = f['clearcoat']; b.inputs['Coat Roughness'].default_value = 0.02
        # the very fine polishing haze: roughness varies by +/-0.015
        n = _noise(nt, 900, 3, 0.6); nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        nt.links.new(_maprange(nt, n.outputs['Fac'], 0.03, 0.08), b.inputs['Roughness'])
    elif k == 'gloss-paint':
        # finishes.json may give "paint_roughness" / "coat" / "coat_roughness": a semi-gloss black (the OEM look: soft broad highlights,
        # reflections still visible but not a mirror) is paint 0.3, a thin clear coat (0.35) with a slightly soft top (0.12);
        # without them the recipe is the old mirror gloss (0.45 / 1.0 / 0.025)
        b.inputs['Metallic'].default_value = 0.0
        b.inputs['Roughness'].default_value = f.get('paint_roughness', 0.45)    # the paint film; the shine is the clear coat
        b.inputs['Coat Weight'].default_value = f.get('coat', 1.0); b.inputs['Coat Roughness'].default_value = f.get('coat_roughness', 0.025)
        b.inputs['Coat IOR'].default_value = 1.5
        # orange peel: a soft large-scale ripple in the clear coat's normal only
        n = _noise(nt, 60, 2, 0.4); nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        nt.links.new(_bump(nt, n.outputs['Fac'], f.get('peel', 0.03), 0.0003), b.inputs['Coat Normal'])
    elif k == 'satin':
        # satin metallic powder coat: flake under a rough clear; the micro-texture is what makes
        # satin read as a coating rather than dull metal
        b.inputs['Metallic'].default_value = max(f['metalness'], 0.85)
        b.inputs['Coat Weight'].default_value = max(f['clearcoat'], 0.4); b.inputs['Coat Roughness'].default_value = 0.3
        n = _noise(nt, 1400, 2, 0.5); nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        nt.links.new(_maprange(nt, n.outputs['Fac'], f['roughness'] - 0.08, f['roughness'] + 0.08), b.inputs['Roughness'])
        fl = _noise(nt, 2600, 1, 0.5); nt.links.new(tc.outputs['Object'], fl.inputs['Vector'])
        nt.links.new(_bump(nt, fl.outputs['Fac'], 0.35, 0.0002), b.inputs['Normal'])  # flake tilt
    elif k == 'brushed':
        b.inputs['Metallic'].default_value = 1.0
        b.inputs['Roughness'].default_value = f['roughness']
        b.inputs['Coat Weight'].default_value = min(f['clearcoat'], 0.4); b.inputs['Coat Roughness'].default_value = 0.08
        if part == 'face' and f.get('brush', 'radial') == 'radial':
            # machined / brushed face: subtle anisotropic roughness (stretched, dull highlights along the grain), the grain running round the
            # hub like a lathe finish: the Tangent node is radial about the rim's axle (object X); fine concentric lines in the roughness
            tg = nt.nodes.new('ShaderNodeTangent'); tg.direction_type = 'RADIAL'; tg.axis = 'X'
            nt.links.new(tg.outputs['Tangent'], b.inputs['Tangent'])
            b.inputs['Anisotropic'].default_value = f.get('anisotropy', 0.45); b.inputs['Anisotropic Rotation'].default_value = 0.0
            sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
            # radius in the face plane, from y and z of the object coordinates
            yy = nt.nodes.new('ShaderNodeVectorMath'); yy.operation = 'LENGTH'
            comb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(sep.outputs['Y'], comb.inputs['X']); nt.links.new(sep.outputs['Z'], comb.inputs['Y'])
            nt.links.new(comb.outputs['Vector'], yy.inputs[0])
            # concentric grooves: noise along the radius only (a 1-D noise through the radius)
            nz = _noise(nt, 1, 0, 0.5)
            rmap = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(yy.outputs['Value'], rmap.inputs['X'])
            sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'; sc_.inputs['Scale'].default_value = 900.0
            nt.links.new(rmap.outputs['Vector'], sc_.inputs[0]); nt.links.new(sc_.outputs['Vector'], nz.inputs['Vector'])
            nt.links.new(_maprange(nt, nz.outputs['Fac'], f['roughness'] - 0.04, f['roughness'] + 0.04), b.inputs['Roughness'])
        else:
            b.inputs['Anisotropic'].default_value = 0.9; b.inputs['Anisotropic Rotation'].default_value = 0.25
            # brushing lines: a stretched noise bumps the normal along one direction
            mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 60)
            nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
            n = _noise(nt, 40, 2, 0.5); nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
            nt.links.new(_bump(nt, n.outputs['Fac'], 0.25, 0.0002), b.inputs['Normal'])
    else:  # metallic paint
        b.inputs['Metallic'].default_value = f['metalness']
        b.inputs['Roughness'].default_value = f['roughness']
        b.inputs['Coat Weight'].default_value = max(f['clearcoat'], 0.8); b.inputs['Coat Roughness'].default_value = 0.04
        fl = _noise(nt, 2600, 1, 0.5); nt.links.new(tc.outputs['Object'], fl.inputs['Vector'])
        nt.links.new(_bump(nt, fl.outputs['Fac'], 0.3, 0.0002), b.inputs['Normal'])
    return m

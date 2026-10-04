"""Renders the pre-render studio (scripts/prerender/render_car.py: grey world + softboxes) as an
equirectangular HDR, so the live WebGL wheels can be lit by the same studio the car bodies were
rendered in (lighting match, docs/RIM_3D_PROCESS.md step 10).

  python3 scripts/prerender/studio_hdri.py public/env/forgedsa_studio.hdr [--size 1024]
"""
import argparse, math
import bpy
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--size', type=int, default=1024)
a = ap.parse_args()
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.75, 0.77, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
# The softboxes as emissive panels (lights are invisible to camera rays). Same places as render_car.py
# for a 4.8 m car: a long strip overhead, two side walls. Radiance = power / (area * pi).
def panel(name, loc, rot, sx, sy, power):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = (sx, sy, 1); o.name = name
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    em.inputs['Strength'].default_value = power / (sx * sy * math.pi)
    nt.links.new(em.outputs[0], out.inputs[0]); o.data.materials.append(m)
L, H = 4.8, 1.4
panel('top', (0, 0, H + 3.0), (math.pi, 0, 0), L * 1.4, L * 0.7, 2500)
panel('side+', (0, L, H), (math.radians(90 + 70), 0, 0), L * 1.2, 1.2, 900)
panel('side-', (0, -L, H), (math.radians(-90 - 70), 0, 0), L * 1.2, 1.2, 900)
# a dark floor far below so reflections from under the car aren't sky-bright
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.01)); f = bpy.context.object
fm = bpy.data.materials.new('floor'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1); f.data.materials.append(fm)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, 0, 0.45); cam.rotation_euler = (math.pi / 2, 0, 0)  # wheel-centre height, looking +Y... panorama ignores most of it
cam.data.type = 'PANO'; cam.data.panorama_type = 'EQUIRECTANGULAR'
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.resolution_x = a.size; sc.render.resolution_y = a.size // 2
sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = 0
sc.render.image_settings.file_format = 'HDR'; sc.render.filepath = a.out
bpy.ops.render.render(write_still=True); print('rendered', a.out)

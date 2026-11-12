"""Depth images for a frames-only car: <out>/<view>/depth.png, one per CAM_<view> in the scene GLB from export-scene.cjs.

A frames-only car has no GLB in the browser, so nothing masks the far-side live wheels behind the rendered body. The
engine draws this image first as depth (CarConfiguratorEngine.ensureDepthOccluder), which hides exactly what the body
covers in the frame. It is an image, like the frames, so the licensed model still never leaves the build machine.

Encoding: distance along the camera's view axis (metres) as 16 bits, R = high byte, G = low byte, B = 0, alpha 255;
0..65534 spans 0..DEPTH_RANGE m, 65535 = nothing there (also the floor, which is left out). DEPTH_RANGE must match
CarConfiguratorEngine.FRAMES_DEPTH_RANGE.

  blender -b --python scripts/prerender/render_depth.py -- scene.glb public/renders/<carId> [--width 1440] [--views a,b]
"""
import argparse, os, sys
import bpy
import numpy as np

DEPTH_RANGE = 40.0
ASPECT = 1.6  # RENDER_ASPECT

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('glb'); ap.add_argument('out')
ap.add_argument('--width', type=int, default=1440, help='match the frames (render_car.py --width)')
ap.add_argument('--views', default='')
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.glb)
sc = bpy.context.scene
cams = {o.name.split('CAM_', 1)[1].split('.')[0]: o for o in sc.objects if o.type == 'CAMERA' and 'CAM_' in o.name}
if not cams:
    sys.exit(f'no CAM_<view> cameras in {a.glb}: export it with export-scene.cjs')

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 1                 # depth needs no light: one sample, no denoising
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 0
sc.cycles.filter_width = 0.01         # one ray per pixel centre: no blending of near and far depths along edges
sc.render.film_transparent = True
sc.render.resolution_x = a.width
sc.render.resolution_y = round(a.width / ASPECT)
sc.render.resolution_percentage = 100
vl = sc.view_layers[0]
vl.use_pass_z = True

# The exported depth goes through a float EXR (the compositor's file output), then numpy packs it into 8-bit PNG bytes.
ng = bpy.data.node_groups.new('depth', 'CompositorNodeTree'); sc.compositing_node_group = ng  # as render_car.py (Blender 5)
rl = ng.nodes.new('CompositorNodeRLayers')
fo = ng.nodes.new('CompositorNodeOutputFile')
fo.format.media_type = 'IMAGE'; fo.format.file_format = 'OPEN_EXR'; fo.format.color_depth = '32'
fo.format.color_mode = 'BW'
fo.file_output_items.clear()
fo.file_output_items.new('FLOAT', 'depth')
ng.links.new(rl.outputs['Depth'], fo.inputs[0])

tmp = os.path.join(a.out, '_depth_tmp')
os.makedirs(tmp, exist_ok=True)
views = a.views.split(',') if a.views else list(cams)
for v in views:
    if v not in cams:
        sys.exit(f'no CAM_{v} in {a.glb}; it has {sorted(cams)}')
    sc.camera = cams[v]
    fo.directory = tmp; fo.file_name = v
    bpy.ops.render.render(write_still=False)
    exr = next((os.path.join(tmp, f) for f in sorted(os.listdir(tmp)) if f.startswith(v) and f.endswith('.exr')), None)
    if not exr:
        sys.exit(f'{v}: Blender wrote no depth EXR in {tmp} (render failed? see the log above)')
    img = bpy.data.images.load(exr)
    w, h = img.size
    z = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, 0]   # bottom row first, as Blender stores it
    bpy.data.images.remove(img)
    os.remove(exr)
    empty = ~np.isfinite(z) | (z >= 1e9) | (z <= 0)
    code = np.clip(np.round(z / DEPTH_RANGE * 65534), 0, 65534).astype(np.uint32)
    code[empty] = 65535
    px = np.zeros((h, w, 4), dtype=np.float32)
    px[:, :, 0] = (code >> 8) / 255.0
    px[:, :, 1] = (code & 255) / 255.0
    px[:, :, 3] = 1.0
    os.makedirs(os.path.join(a.out, v), exist_ok=True)
    out = bpy.data.images.new('depth_' + v, w, h, alpha=True, float_buffer=False)
    out.colorspace_settings.name = 'Non-Color'
    out.pixels.foreach_set(px.ravel())
    path = os.path.join(a.out, v, 'depth.png')
    out.filepath_raw = path; out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    covered = float((~empty).mean())
    print(f'wrote {path}: {w}x{h}, body covers {covered:.1%}, nearest {float(z[~empty].min()) if covered else 0:.2f} m', flush=True)
os.rmdir(tmp)

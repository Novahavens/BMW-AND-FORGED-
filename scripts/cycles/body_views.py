"""Wheel-less M2 body stills for each web view. The six view cameras (CAM_<view>) come from the prerender GLB,
so the frames line up with the live wheel layer. The studio, paint and Cycles settings are the approved stills
(batch_stills.py). Wheels and brakes are hidden so the live forged wheels can be drawn on top.
usage: python3 -I body_views.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import batch_stills as bs  # noqa: E402

GLB = "/tmp/prerender/m2_g87.glb"
OUT = "/tmp/cy/body_test/views"
VIEWS = ["frontThreeQuarter", "side", "rearThreeQuarter", "frontWheel", "top", "front"]
PAINT_INDEX = 3  # Black Sapphire Metallic in paints.json


def main():
    try:
        bs.open_studio()
    except (RuntimeError, OSError) as e:
        sys.exit(f"could not open the studio scene: {e}")
    bpy.context.view_layer.update()
    for name in ("Wheels", "Mechanical"):
        coll = bpy.data.collections.get(name)
        if coll is not None:
            coll.hide_render = True

    before = set(bpy.data.objects)
    if not os.path.isfile(GLB):
        sys.exit(f"view GLB not found: {GLB}")
    try:
        bpy.ops.import_scene.gltf(filepath=GLB)
    except RuntimeError as e:
        sys.exit(f"could not import {GLB}: {e}")
    new = [o for o in bpy.data.objects if o not in before]

    cams = {}
    for o in new:
        if o.type == 'CAMERA' and 'CAM_' in o.name:
            cams[o.name.split('CAM_', 1)[1].split('.')[0]] = o
    print("cameras found:", sorted(cams), flush=True)
    missing = [v for v in VIEWS if v not in cams]
    if missing:
        sys.exit(f"no camera for views {missing}")

    keep = {cams[v] for v in VIEWS}
    for v in VIEWS:
        cam = cams[v]
        world = cam.matrix_world.copy()
        cam.parent = None
        cam.matrix_world = world
    for o in new:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    paints = bs.load_paints(bs.PAINTS_JSON)
    if not 1 <= PAINT_INDEX <= len(paints):
        sys.exit(f"paint index {PAINT_INDEX} is outside the paint table ({len(paints)} paints)")
    p = paints[PAINT_INDEX - 1]
    rig_mat = bpy.data.materials.get("Paint")
    if rig_mat is None:
        sys.exit("studio Paint material missing")
    bs.configure_render(8, (1600, 900), "Khronos PBR Neutral", -0.8)
    bs.PaintRig(rig_mat).apply(p)
    print(f"paint {PAINT_INDEX}: {p['name']} {p['hex']}", flush=True)

    try:
        os.makedirs(OUT, exist_ok=True)
    except OSError as e:
        sys.exit(f"could not create {OUT}: {e}")
    for v in VIEWS:
        bpy.context.scene.camera = cams[v]
        path = os.path.join(OUT, f"{v}.png")
        try:
            bpy.ops.render.render(write_still=False)
            bs.save_outputs(path, "")
        except (RuntimeError, OSError) as e:
            sys.exit(f"render or save failed for {path}: {e}")
        print("saved", path, flush=True)


if __name__ == "__main__":
    main()

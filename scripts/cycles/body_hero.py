"""Wheel-less M2 front three-quarter body for every paint, in the reference studio with the approved Cycles
settings. The camera is the web's CAM_frontThreeQuarter from the prerender GLB. Wheels and brakes are hidden so
the live forged wheels can be drawn on top.
usage: python3 -I body_hero.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import batch_stills as bs  # noqa: E402

GLB = "/tmp/prerender/m2_g87.glb"
OUT = "/tmp/cy/body_test/m2_hero"
VIEW = "frontThreeQuarter"


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
    cam = next((o for o in new if o.type == 'CAMERA' and o.name.startswith(f"CAM_{VIEW}")), None)
    if cam is None:
        sys.exit(f"camera CAM_{VIEW} not found in {GLB}")
    world = cam.matrix_world.copy()
    cam.parent = None
    cam.matrix_world = world
    for o in new:
        if o is not cam:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.camera = cam

    paints = bs.load_paints(bs.PAINTS_JSON)
    rig_mat = bpy.data.materials.get("Paint")
    if rig_mat is None:
        sys.exit("studio Paint material missing")
    bs.configure_render(8, (1600, 900), "Khronos PBR Neutral", -0.8)
    rig = bs.PaintRig(rig_mat)
    try:
        os.makedirs(OUT, exist_ok=True)
    except OSError as e:
        sys.exit(f"could not create {OUT}: {e}")

    done = 0
    for i, p in enumerate(paints, 1):
        path = os.path.join(OUT, f"{i:02d}_{bs.slugify(p['name'])}.png")
        rig.apply(p)
        try:
            bpy.ops.render.render(write_still=False)
            bs.save_outputs(path, "")
        except (RuntimeError, OSError) as e:
            print(f"FAIL {p['name']}: {e}", flush=True)
            continue
        done += 1
        print(f"DONE {i:02d} {p['name']} {p['hex']}", flush=True)
    print(f"ALL_DONE {done} of {len(paints)}", flush=True)


if __name__ == "__main__":
    main()

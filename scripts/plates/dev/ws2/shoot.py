"""WS2 look-dev driver: one scene, several frames. Uses the same assemble / set_view / render_task as render.py.

    ./bl dev/ws2/shoot.py --preset review --outdir /abs/dir \
         --shots "front34:sao_paulo_yellow:0.30,0.40,0.50,0.54:hl_yellow;side:jet_black::side_black"
    python3 cloud/client.py render --name ws2-x --entry dev/ws2/shoot.py -- --preset review --outdir ws2/x --shots ...

A shot is view:paint:region:name; region (left,top,right,bottom as frame fractions) and name may be empty.
A relative --outdir is taken under PLATES_OUT. Diagnostics only (never for evidence frames):
    --no-look            the baseline scene
    --only A,B           hide every car mesh whose name contains none of these
    --hide A,B           hide car meshes whose name contains one of these
    --clay               grey override material on everything (geometry check)
    --close x,y,z,dist   camera keeps the view's direction but sits dist metres from that point of the car
    --exposure E         override the view exposure
"""
import argparse
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import render as render_mod  # noqa: E402
from platelib import rendering, scene  # noqa: E402
from platelib.core import OUT, Config, fail, log  # noqa: E402


def parse_shots(text):
    """'view:paint:region:name;...' -> [(view, paint, region tuple or None, name)]."""
    shots = []
    for spec in [s for s in text.split(";") if s.strip()]:
        view, paint, region, name = (spec.strip().split(":") + ["", "", ""])[:4]
        try:
            box = tuple(float(v) for v in region.split(",")) if region else None
            if box is not None and len(box) != 4:
                raise ValueError("a region needs four numbers")
        except ValueError as e:
            fail(f"bad shot {spec!r}: {e}")
        shots.append((view, paint, box, name))
    if not shots:
        fail("--shots is empty")
    return shots


def hide_car_meshes(only, hide):
    for o in scene.car_objects():
        if o.type != 'MESH':
            continue
        if (only and not any(s in o.name for s in only)) or any(s in o.name for s in hide):
            o.hide_render = True


def use_clay_override():
    clay = bpy.data.materials.new("WS2_Clay")
    if bpy.app.version < (5, 0, 0):
        clay.use_nodes = True
    bsdf = next((n for n in clay.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = clay.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        out = clay.node_tree.nodes.new("ShaderNodeOutputMaterial")
        clay.node_tree.links.new(bsdf.outputs[0], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (0.6, 0.6, 0.6, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.5
    bpy.context.view_layer.material_override = clay


def move_camera_close(ctx, spec):
    """Keep the view's direction, sit dist metres from a point given in the car's own (unturned) coordinates."""
    try:
        x, y, z, dist = (float(v) for v in spec.split(","))
    except ValueError:
        fail(f"bad --close {spec!r}: need x,y,z,dist")
    c = ctx.centre
    turn = Matrix.Translation(c) @ Matrix.Rotation(math.radians(ctx.turned), 4, 'Z') @ Matrix.Translation(-c)
    target = turn @ Vector((x, y, z))
    forward = ctx.cam.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    ctx.cam.location = target - forward * dist
    ctx.cam.data.dof.use_dof = False
    bpy.context.view_layer.update()


def main():
    ap = argparse.ArgumentParser(description="WS2 look-dev: several frames from one assembled scene")
    ap.add_argument("--car", default="m4_cs_g82")
    ap.add_argument("--preset", default="preview")
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--shots", required=True)
    ap.add_argument("--no-look", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--hide", default="")
    ap.add_argument("--clay", action="store_true")
    ap.add_argument("--close", default="")
    ap.add_argument("--lens", type=float, default=None)
    ap.add_argument("--exposure", type=float, default=None)
    a = ap.parse_args()

    shots = parse_shots(a.shots)
    outdir = a.outdir if os.path.isabs(a.outdir) else os.path.join(OUT, a.outdir)
    try:
        os.makedirs(outdir, exist_ok=True)
    except OSError as e:
        fail(f"could not create the output folder {outdir}: {e}")

    cfg = Config()
    ctx = scene.assemble(cfg, a.car, look=not a.no_look)
    info = rendering.configure(cfg, a.preset, scale=a.scale, samples=a.samples)
    hide_car_meshes([s for s in a.only.split(",") if s], [s for s in a.hide.split(",") if s])
    if a.clay:
        use_clay_override()
    if a.exposure is not None:
        ctx.scene.view_settings.exposure = a.exposure
    if a.lens:
        ctx.cam.data.lens = a.lens

    view_now = None
    failed = 0
    for view, paint, box, name in shots:
        if view != view_now:
            scene.set_view(ctx, view)
            view_now = view
            if a.close:
                move_camera_close(ctx, a.close)
        task = {"car": a.car, "view": view, "kind": "body", "paint": cfg.paint(paint or ctx.car["default_paint"])["id"]}
        path = os.path.join(outdir, f"{name or view + '_' + task['paint']}.png")
        t0 = time.time()
        try:
            render_mod.render_task(ctx, task, path, region=box)
        except (RuntimeError, OSError) as e:
            failed += 1
            log(f"FAIL {path}: {e}")
            continue
        log(f"DONE {path} {time.time() - t0:.1f}s {info['size']} samples={info['samples']}")
    if failed:
        fail(f"{failed} of {len(shots)} frames failed")


if __name__ == "__main__":
    main()

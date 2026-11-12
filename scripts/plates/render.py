"""Render plates: one frame for a test, or a list of tasks for a batch.

One frame (look-dev):
    ./bl render.py --car m2_cs_g87 --view front34 --paint portimao_blue_metallic --preset preview \
                   [--region 0.55,0.35,0.80,0.60] [--scale 1.0] [--samples 64] [--out /path/test.png] [--exr]
    ./bl render.py --car m5_g90 --view side --kind wheel --wheel forged_fsa002 --finish gold --out ...

A batch (tasks.json from tasks.py; grouped by car so each scene is built once):
    ./bl render.py --tasks tasks.json [--shard 0/4] --preset final [--skip-existing]

Masters go to PLATES_OUT/<car>/<view>/body/<paint>.png and .../wheels/<wheel>__<finish>.png (RGBA, cropped,
with a .json beside it that records where the crop sits in the frame).
Every file operation stops with one clear message; in a batch a failed frame is logged and skipped.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from platelib import rendering, scene, wheels  # noqa: E402
from platelib.core import OUT, Config, fail, log  # noqa: E402


def master_path(task, out_root):
    base = os.path.join(out_root, task["car"], task["view"])
    if task["kind"] == "body":
        return os.path.join(base, "body", f"{task['paint']}.png")
    return os.path.join(base, "wheels", f"{task['wheel']}__{task.get('finish') or 'factory'}.png")


def has_master(path):
    """True when a non-empty master file is already there (an unreadable one counts as missing)."""
    try:
        return os.path.getsize(path) > 0
    except OSError:
        return False


def render_task(ctx, task, path, exr=False, region=None):
    """Render one task into path. The scene is already assembled and on the task's view."""
    cfg = ctx.cfg
    if task["kind"] == "body":
        wheels.factory(ctx)
        wheels.plate_mode(ctx, False) if ctx.notes.get("plate_mode") else None
        wheels.prepare_body(ctx)
        ctx.paint.apply(cfg.paint(task["paint"]))
        rendering.set_region(region)
        rendering.render_frame(path, exr_path=path[:-4] + ".exr" if exr else "")
        return {"path": path}
    ctx.paint.apply(cfg.paint(task.get("paint") or cfg["wheel_plate"]["paint"]))
    if task["wheel"] == "factory":
        wheels.factory(ctx)
    else:
        wheels.fit(ctx, task["wheel"], task["finish"])
    wheels.plate_mode(ctx, True)
    ctx.notes["plate_mode"] = True
    box = region or wheels.plate_region(ctx)
    rendering.set_region(box)
    rendering.render_frame(path, exr_path=path[:-4] + ".exr" if exr else "", rgba=True)
    meta = {"region": list(box) if box else [0.0, 0.0, 1.0, 1.0]}
    try:
        with open(path[:-4] + ".json", "w", encoding="utf-8") as fh:
            json.dump(meta, fh)
    except OSError as e:
        raise RuntimeError(f"could not write the crop record for {path}: {e}") from e
    return {"path": path, **meta}


def run_single(a, cfg):
    task = {"car": a.car, "view": a.view, "kind": a.kind}
    if a.kind == "body":
        task["paint"] = cfg.paint(a.paint or cfg.car(a.car)["default_paint"])["id"]
    else:
        task["wheel"] = a.wheel or "factory"
        task["finish"] = a.finish or ""
        if a.paint:
            task["paint"] = cfg.paint(a.paint)["id"]
        if task["wheel"] != "factory":
            cfg.wheel(task["wheel"])
            cfg.wheel_finish(task["finish"])
    ctx = scene.assemble(cfg, a.car, look=not a.no_look)
    info = rendering.configure(cfg, a.preset, scale=a.scale, samples=a.samples)
    scene.set_view(ctx, a.view)
    path = a.out or os.path.join(OUT, "tests", f"{a.car}_{a.view}_{task.get('paint') or task.get('wheel')}_{a.preset}.png")
    t0 = time.time()
    try:
        render_task(ctx, task, path, exr=a.exr, region=a.region)
    except (RuntimeError, OSError) as e:
        fail(f"render failed for {path}: {e}")
    log(f"DONE {path} {time.time() - t0:.1f}s device={info['backend']} size={info['size']} samples={info['samples']}")


def run_batch(a, cfg):
    try:
        with open(a.tasks, encoding="utf-8") as fh:
            tasks = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        fail(f"could not read tasks {a.tasks}: {e}")
    if a.shard:
        i, n = a.shard
        tasks = [t for k, t in enumerate(tasks) if k % n == i]
    out_root = a.outdir or OUT
    done = failed = skipped = 0
    t_start = time.time()
    order = {"body": 0, "wheel": 1}
    for car_id in dict.fromkeys(t["car"] for t in tasks):
        car_tasks = [t for t in tasks if t["car"] == car_id]
        todo = [t for t in car_tasks if not (a.skip_existing and has_master(master_path(t, out_root)))]
        skipped += len(car_tasks) - len(todo)
        if not todo:
            continue
        ctx = scene.assemble(cfg, car_id)
        info = rendering.configure(cfg, a.preset, scale=a.scale, samples=a.samples)
        log(f"SCENE {car_id} device={info['backend']} {info['devices']} size={info['size']} samples={info['samples']}")
        for view_id in dict.fromkeys(t["view"] for t in todo):
            scene.set_view(ctx, view_id)
            for task in sorted((t for t in todo if t["view"] == view_id), key=lambda t: order.get(t["kind"], 9)):
                path = master_path(task, out_root)
                t0 = time.time()
                try:
                    render_task(ctx, task, path, exr=a.exr)
                except (RuntimeError, OSError) as e:
                    failed += 1
                    log(f"FAIL {path}: {e}")
                    continue
                done += 1
                log(f"DONE {os.path.relpath(path, out_root)} {time.time() - t0:.1f}s")
    log(f"ALL_DONE done={done} failed={failed} skipped={skipped} minutes={(time.time() - t_start) / 60:.1f}")
    if failed:
        sys.exit(1)


def parse_args():
    ap = argparse.ArgumentParser(description="Render FORGEDSA plates")
    ap.add_argument("--car")
    ap.add_argument("--view", default="front34")
    ap.add_argument("--kind", choices=("body", "wheel"), default="body")
    ap.add_argument("--paint", default="", help="paint id or 1-based number")
    ap.add_argument("--wheel", default="", help="catalogue wheel id, or 'factory'")
    ap.add_argument("--finish", default="")
    ap.add_argument("--preset", default="preview")
    ap.add_argument("--scale", type=float, default=None, help="override the preset's resolution scale")
    ap.add_argument("--samples", type=int, default=None, help="override the preset's sample count")
    ap.add_argument("--region", default="", help="left,top,right,bottom as fractions of the frame")
    ap.add_argument("--out", default="")
    ap.add_argument("--exr", action="store_true", help="also write a linear EXR master")
    ap.add_argument("--no-look", action="store_true", help="skip the look modules and car adapter (baseline)")
    ap.add_argument("--tasks", default="")
    ap.add_argument("--shard", default="", help="i/n: take every n-th task starting at i")
    ap.add_argument("--outdir", default="")
    ap.add_argument("--skip-existing", action="store_true")
    a = ap.parse_args()
    try:
        a.region = tuple(float(v) for v in a.region.split(",")) if a.region else None
        if a.region is not None and len(a.region) != 4:
            raise ValueError("need four numbers")
        if a.shard:
            i, n = (int(v) for v in a.shard.split("/"))
            if not 0 <= i < n:
                raise ValueError("need 0 <= i < n")
            a.shard = (i, n)
    except ValueError as e:
        fail(f"bad --region or --shard: {e}")
    if not a.tasks and not a.car:
        fail("give --car (one frame) or --tasks (a batch)")
    return a


def main():
    a = parse_args()
    cfg = Config()
    if a.tasks:
        run_batch(a, cfg)
    else:
        run_single(a, cfg)


if __name__ == "__main__":
    main()

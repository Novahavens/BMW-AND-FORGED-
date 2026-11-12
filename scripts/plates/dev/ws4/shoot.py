"""WS4 test driver: several frames of one car in a single Blender session (the scene is built once).

    ./bl dev/ws4/shoot.py --car m2_cs_g87 --preset preview --out-dir ws4/t1 \
         --shot view=wheel,kind=direct,wheel=forged_fsa002,finish=gold,name=fsa002_gold \
         --shot view=wheel,kind=plate,wheel=factory --shot view=wheel,kind=body [--fits]

kind=direct  the wheel on the car, plain render (no plate tricks): what a composite has to match
kind=body    a body plate, through render.render_task (factory wheels, wheels.prepare_body)
kind=plate   a wheel plate, through render.render_task (RGBA crop + .json with the box)
Other keys: paint=<id>, region=l,t,r,b (frame fractions), name=<file stem>, hide=rim (no rim at all),
            neutral=0|1 (direct only: force the neutral-reflection switch), backing=0 (hide the barrel backing)
--fits       fit every catalogue wheel to this car and write fit_reports.json (no render needed)
Files go under PLATES_OUT/<out-dir>/.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import render as driver  # noqa: E402
from platelib import rendering, rubber, scene, wheels  # noqa: E402
from platelib.core import OUT, Config, fail, log  # noqa: E402


def parse_shot(text):
    shot = {"view": "wheel", "kind": "direct", "wheel": "factory", "finish": "", "paint": "", "region": None, "name": "",
            "hide": "", "neutral": "", "backing": "1"}
    for item in text.split(","):
        key, _, value = item.partition("=")
        if key not in shot:
            if key in ("t", "r", "b") or key.replace(".", "").isdigit():
                continue
            fail(f"shot key {key!r} is not one of {sorted(shot)}")
        shot[key] = value
    if "region=" in text:
        try:
            nums = text.split("region=")[1].split(",")[:4]
            shot["region"] = tuple(float(v) for v in nums)
            if len(shot["region"]) != 4:
                raise ValueError("need four numbers")
        except ValueError as e:
            fail(f"bad region in shot {text!r}: {e}")
    return shot


def write_json(path, data):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1)
    except OSError as e:
        fail(f"could not write {path}: {e}")


def render_shot(ctx, cfg, shot, out_dir, car):
    paint = cfg.paint(shot["paint"] or ("" if shot["kind"] == "plate" else cfg.car(car)["default_paint"]) or cfg["wheel_plate"]["paint"])["id"]
    stem = shot["name"] or "_".join(v for v in (shot["view"], shot["kind"], shot["wheel"], shot["finish"], paint if shot["kind"] != "plate" else "") if v)
    path = os.path.join(out_dir, f"{stem}.png")
    t0 = time.time()
    try:
        if shot["kind"] == "direct":
            wheels.plate_mode(ctx, False)
            if shot["wheel"] == "factory":
                wheels.factory(ctx)
            else:
                wheels.fit(ctx, shot["wheel"], shot["finish"])
            ctx.paint.apply(cfg.paint(paint))
            if shot["neutral"] != "":
                wheels._set_neutral(ctx, shot["neutral"] == "1")
            else:
                wheels._set_neutral(ctx, False)
            asms = rubber.assemblies(ctx)
            if shot["hide"] == "rim":
                for obj in wheels.active_wheel_objects(ctx):
                    if obj.get(rubber.PART_KEY) in ("rim", "factory_rim"):
                        wheels._show(obj, False)
            for asm in asms.values():
                for obj in asm.parts["backing"]:
                    wheels._show(obj, shot["backing"] != "0")
            rendering.set_region(shot["region"])
            rendering.render_frame(path)
            for asm in asms.values():
                for obj in asm.parts["backing"]:
                    wheels._show(obj, True)
            result = {"path": path}
        elif shot["kind"] == "body":
            result = driver.render_task(ctx, {"car": car, "view": shot["view"], "kind": "body", "paint": paint}, path, region=shot["region"])
        elif shot["kind"] == "plate":
            task = {"car": car, "view": shot["view"], "kind": "wheel", "wheel": shot["wheel"], "finish": shot["finish"]}
            if shot["paint"]:
                task["paint"] = paint
            result = driver.render_task(ctx, task, path, region=shot["region"])
        else:
            fail(f"unknown shot kind {shot['kind']!r}")
    except (RuntimeError, OSError) as e:
        fail(f"render failed for {path}: {e}")
    log(f"SHOT {os.path.relpath(path, OUT)} {time.time() - t0:.1f}s {result.get('region', '')}")
    return path


def main():
    ap = argparse.ArgumentParser(description="WS4 wheel test frames")
    ap.add_argument("--car", required=True)
    ap.add_argument("--preset", default="preview")
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--out-dir", default="ws4/shots")
    ap.add_argument("--shot", action="append", default=[])
    ap.add_argument("--fits", action="store_true")
    ap.add_argument("--no-look", action="store_true")
    a = ap.parse_args()
    cfg = Config()
    out_dir = os.path.join(OUT, a.out_dir)
    ctx = scene.assemble(cfg, a.car, look=not a.no_look)
    info = rendering.configure(cfg, a.preset, scale=a.scale, samples=a.samples)
    log(f"SCENE {a.car} device={info['backend']} size={info['size']} samples={info['samples']}")
    rubber.assemblies(ctx)
    if a.fits:
        for wheel in cfg["wheels"]:
            for axle in ("front", "rear"):
                wheels._fit_axle(ctx, wheel, axle)
        reports = [dict(r) for r in wheels.fit_reports(ctx).values()]
        measures = {c: asm.measure for c, asm in rubber.assemblies(ctx).items()}
        write_json(os.path.join(out_dir, f"fit_reports_{a.car}.json"), {"car": a.car, "assemblies": measures, "fits": reports})
    view = None
    for text in a.shot:
        shot = parse_shot(text)
        if shot["view"] != view:
            scene.set_view(ctx, shot["view"])
            view = shot["view"]
        render_shot(ctx, cfg, shot, out_dir, a.car)
    log("SHOOT_DONE")


if __name__ == "__main__":
    main()

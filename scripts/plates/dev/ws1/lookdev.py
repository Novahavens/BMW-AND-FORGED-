"""WS1 look-dev runner: several frames from one scene, with config overrides, for local or cloud use.

    ./bl dev/ws1/lookdev.py --tag t1 --frames front34:portimao_blue_metallic side:jet_black \
         [--set look.studio.glass_reflector.strength=0.2 ...] [--preset review] [--region l,t,r,b] [--no-look]
    python3 cloud/client.py render --name ws1-t1 --entry dev/ws1/lookdev.py -- --tag t1 --frames ...

Frames are view:paint or view:paint:l,t,r,b (a region for that frame only). Images go to
PLATES_OUT/ws1x/<tag>/<view>__<paint>[__r].png. --set takes dotted config paths and JSON values.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from platelib import rendering, scene, wheels  # noqa: E402
from platelib.core import OUT, Config, fail, log  # noqa: E402


def set_path(data, dotted, value):
    keys = dotted.split(".")
    node = data
    for k in keys[:-1]:
        if isinstance(node, list):
            node = next((i for i in node if i.get("id") == k), None)
            if node is None:
                fail(f"--set {dotted}: no item with id {k!r}")
        else:
            node = node.setdefault(k, {})
    node[keys[-1]] = value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--car", default="m2_cs_g87")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--frames", nargs="+", required=True)
    ap.add_argument("--set", nargs="*", default=[], dest="sets")
    ap.add_argument("--preset", default="review")
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--region", default="")
    ap.add_argument("--no-look", action="store_true")
    a = ap.parse_args()
    cfg = Config()
    for item in a.sets:
        key, _, raw = item.partition("=")
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            value = raw
        set_path(cfg.data, key, value)
        log(f"SET {key} = {value!r}")
    ctx = scene.assemble(cfg, a.car, look=not a.no_look)
    info = rendering.configure(cfg, a.preset, scale=a.scale, samples=a.samples)
    outdir = os.path.join(OUT, "ws1x", a.tag)
    current = None
    for spec in a.frames:
        parts = spec.split(":")
        view, paint = parts[0], cfg.paint(parts[1] if len(parts) > 1 and parts[1] else ctx.car["default_paint"])["id"]
        region = parts[2] if len(parts) > 2 else a.region
        region = tuple(float(v) for v in region.split(",")) if region else None
        if view != current:
            scene.set_view(ctx, view)
            current = view
        wheels.factory(ctx)
        wheels.prepare_body(ctx)
        ctx.paint.apply(cfg.paint(paint))
        rendering.set_region(region)
        path = os.path.join(outdir, f"{view}__{paint}{'__r' if region else ''}.png")
        t0 = time.time()
        rendering.render_frame(path)
        log(f"DONE {path} {time.time() - t0:.1f}s size={info['size']} samples={info['samples']}")


if __name__ == "__main__":
    main()

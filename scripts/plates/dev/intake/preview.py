"""Intake preview: put a newly prepared car in the studio WITHOUT the look modules or a car adapter and render it.

    ./bl dev/intake/preview.py --car m340i_g20[:paint_id] [--car ...] [--view front34] [--preset preview] [--subdir intake]
    python3 cloud/client.py render --name intake-x --entry dev/intake/preview.py -- --car m340i_g20 --preset review

The car is not in plates.config.json yet: its entry is added to the loaded config in memory only (the file is
never edited). The source is PLATES_SRC/cars/<car_id>.blend. Images go to PLATES_OUT/<subdir>/<car_id>_<view>.png.
OWNER: intake. Only proves that a prepared car loads, frames and takes paint; it is not a look.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from platelib import rendering, scene  # noqa: E402
from platelib.core import OUT, Config, fail, log  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Render a prepared car that has no config entry or adapter yet")
    ap.add_argument("--car", action="append", required=True, help="car_id or car_id:paint_id (repeatable)")
    ap.add_argument("--view", action="append", default=[], help="view id from the config (repeatable; default front34)")
    ap.add_argument("--preset", default="preview")
    ap.add_argument("--subdir", default="intake")
    a = ap.parse_args()
    views = a.view or ["front34"]
    cfg = Config()
    known = {c["id"] for c in cfg["cars"]}
    for spec in a.car:
        car_id, _, paint_id = spec.partition(":")
        paint = cfg.paint(paint_id or "brooklyn_grey_metallic")
        if car_id not in known:
            cfg.data["cars"].append({"id": car_id, "label": car_id, "chassis": "", "source": f"cars/{car_id}.blend",
                                     "tyres": {}, "default_paint": paint["id"]})
            known.add(car_id)
        ctx = scene.assemble(cfg, car_id, look=False)
        info = rendering.configure(cfg, a.preset)
        ctx.paint.apply(paint)
        for view_id in views:
            scene.set_view(ctx, view_id)
            path = os.path.join(OUT, a.subdir, f"{car_id}_{view_id}.png")
            t0 = time.time()
            try:
                rendering.render_frame(path)
            except (RuntimeError, OSError) as e:
                fail(f"intake preview failed for {path}: {e}")
            log(f"DONE {path} {time.time() - t0:.1f}s device={info['backend']} size={info['size']} samples={info['samples']} paint={paint['id']}")


if __name__ == "__main__":
    main()

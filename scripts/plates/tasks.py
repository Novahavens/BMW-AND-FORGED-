"""Expand plates.config.json into the list of frames to render.

    python3 -I tasks.py --out tasks.json [--cars a,b] [--views front34,side] [--kinds body,wheel]
                        [--paints id,id] [--wheels id,id]

One body task per car, view and paint; one wheel task per car, view, wheel and stocked finish, plus the
factory wheel. Tasks are ordered by car, then view, so a worker builds each scene once.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from platelib.core import Config, fail  # noqa: E402


def expand(cfg, cars=None, views=None, kinds=("body", "wheel"), paints=None, wheels=None):
    tasks = []
    for car in cfg["cars"]:
        if cars and car["id"] not in cars:
            continue
        for view in cfg["views"]:
            if views and view["id"] not in views:
                continue
            if "body" in kinds:
                for p in cfg["paints"]:
                    if not paints or p["id"] in paints:
                        tasks.append({"car": car["id"], "view": view["id"], "kind": "body", "paint": p["id"]})
            if "wheel" in kinds:
                if not wheels or "factory" in wheels:
                    tasks.append({"car": car["id"], "view": view["id"], "kind": "wheel", "wheel": "factory", "finish": ""})
                for w in cfg["wheels"]:
                    if wheels and w["id"] not in wheels:
                        continue
                    for f in w["finishes"]:
                        tasks.append({"car": car["id"], "view": view["id"], "kind": "wheel", "wheel": w["id"], "finish": f})
    return tasks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    for name in ("cars", "views", "kinds", "paints", "wheels"):
        ap.add_argument(f"--{name}", default="")
    a = ap.parse_args()
    pick = lambda s: {v for v in s.split(",") if v} or None   # noqa: E731
    cfg = Config()
    tasks = expand(cfg, pick(a.cars), pick(a.views), pick(a.kinds) or ("body", "wheel"), pick(a.paints), pick(a.wheels))
    if not tasks:
        fail("the filters left no tasks")
    try:
        with open(a.out, "w", encoding="utf-8") as fh:
            json.dump(tasks, fh, indent=0)
    except OSError as e:
        fail(f"could not write {a.out}: {e}")
    kinds = {k: sum(1 for t in tasks if t["kind"] == k) for k in ("body", "wheel")}
    print(f"{len(tasks)} tasks -> {a.out}  {kinds}")


if __name__ == "__main__":
    main()

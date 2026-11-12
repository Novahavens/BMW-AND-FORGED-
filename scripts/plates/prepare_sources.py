"""Copy the source scenes into PLATES_SRC as self-contained .blend files (textures packed, compressed).

    python3 -I prepare_sources.py [--studio /path/studio.blend] [--car id=/path/car.blend ...]

The defaults are where the sandbox keeps the prepared packages. Missing textures are listed and stop the run,
because a plate rendered without a texture is silently wrong.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from platelib.core import SRC, Config, fail, log  # noqa: E402

DEFAULT_STUDIO = "/home/claude/m2/out/BMW_M2_CS_G87_clean_studio.blend"
DEFAULT_CARS = {
    "m4_cs_g82": "/home/claude/pkg/BMW M4 CS G82/model/m4_cs_g82.blend",
    "m5_g90": "/home/claude/pkg/BMW M5 G90/model/m5_g90.blend",
    "m5_touring_g99": "/home/claude/pkg/BMW M5 Touring G99/model/m5_touring_g99.blend",
}


def pack_copy(src, dst):
    if not os.path.isfile(src):
        fail(f"source not found: {src}")
    try:
        bpy.ops.wm.open_mainfile(filepath=src)
    except RuntimeError as e:
        fail(f"could not open {src}: {e}")
    missing = []
    for img in bpy.data.images:
        if img.source != 'FILE' or img.packed_file is not None:
            continue
        path = bpy.path.abspath(img.filepath, library=img.library)
        if not os.path.isfile(path):
            if img.users:
                missing.append(f"{img.name} -> {path}")
            continue
        try:
            img.pack()
        except RuntimeError as e:
            missing.append(f"{img.name}: could not pack ({e})")
    if missing:
        fail(f"{src} has textures that cannot be packed:\n  " + "\n  ".join(missing))
    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=dst, copy=True, compress=True)
    except (OSError, RuntimeError) as e:
        fail(f"could not write {dst}: {e}")
    try:
        size = os.path.getsize(dst)
    except OSError:
        size = 0
    if size == 0:
        fail(f"no file was written at {dst}")
    packed = sum(1 for i in bpy.data.images if i.packed_file is not None)
    log(f"OK {dst} {size / 1e6:.1f} MB, {packed} packed images")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--studio", default=DEFAULT_STUDIO)
    ap.add_argument("--car", action="append", default=[], help="id=/path/car.blend (repeatable)")
    a = ap.parse_args()
    cfg = Config()
    cars = dict(DEFAULT_CARS)
    for spec in a.car:
        car_id, sep, path = spec.partition("=")
        if not sep:
            fail(f"bad --car {spec!r}, expected id=/path/car.blend")
        cars[car_id] = path
    pack_copy(a.studio, os.path.join(SRC, cfg["sources"]["studio"]))
    for car in cfg["cars"]:
        if not car.get("source"):
            continue
        if car["id"] not in cars:
            fail(f"no source given for {car['id']}")
        pack_copy(cars[car["id"]], os.path.join(SRC, car["source"]))


if __name__ == "__main__":
    main()

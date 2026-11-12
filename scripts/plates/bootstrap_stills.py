"""Placeholder body plates from the previous Cycles stills, so the web page has real-shaped data today.

    python3 -I bootstrap_stills.py [--stills /home/claude/cfg/in_stills] [--out /home/claude/plates_web]
                                   [--src /home/claude/plates_out] [--view front34] [--all]

Reads <stills>/<car>/NN_<paint id>.jpg (1600 x 900, the front three-quarter view), scales each to the manifest
frame and writes it as <out>/<car>/<view>/body/<paint>[-1280w].{avif,webp} with the same encoder as encode.py.
The manifest lists exactly what exists, carries "placeholder": true and names every stand-in in "placeholders".
There are no wheel plates in the stills, so the manifest has no wheel entries.

A plate that encode.py already made from a real master is never overwritten. Run encode.py as masters arrive:
it replaces the stand-ins one by one and drops the flag when none is left. --all writes the stand-ins again.
The manifest is rewritten after each car, so it exists within the first minute.
"""
import argparse
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import encode  # noqa: E402
from platelib.core import OUT, Config  # noqa: E402

STILLS = "/home/claude/cfg/in_stills"


def fail(msg):
    sys.exit(f"bootstrap: {msg}")


def find_stills(cfg, root):
    """-> ({car: {paint: path}}, problems). File names are NN_<paint id>.jpg; the id must be in the config."""
    paints = [p["id"] for p in cfg["paints"]]
    found, problems = {}, []
    for car in cfg["cars"]:
        folder = os.path.join(root, car["id"])
        try:
            names = sorted(os.listdir(folder))
        except FileNotFoundError:
            problems.append(f"MISSING {folder}: no stills for {car['id']}")
            continue
        except OSError as e:
            fail(f"could not list {folder}: {e}")
        got = {}
        for name in names:
            m = re.fullmatch(r"\d+_(.+)\.jpe?g", name)
            if not m:
                continue
            if m.group(1) not in paints:
                problems.append(f"UNKNOWN {os.path.join(folder, name)}: {m.group(1)!r} is not a paint id in plates.config.json")
                continue
            got[m.group(1)] = os.path.join(folder, name)
        for p in paints:
            if p not in got:
                problems.append(f"MISSING {car['id']}: no still for paint {p}")
        found[car["id"]] = got
    return found, problems


def main():
    ap = argparse.ArgumentParser(description="Placeholder body plates from the previous stills")
    ap.add_argument("--stills", default=STILLS)
    ap.add_argument("--out", default=encode.WEB)
    ap.add_argument("--src", default=OUT, help="masters root, only used to tell real plates from stand-ins when there is no manifest")
    ap.add_argument("--view", default="front34")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    cfg = Config()
    encode.check_codecs()
    cfg.view(a.view)
    if not os.path.isdir(a.stills):
        fail(f"stills folder not found: {a.stills}")
    try:
        os.makedirs(a.out, exist_ok=True)
    except OSError as e:
        fail(f"could not create {a.out}: {e}")

    frame = (int(cfg["frame"]["width"]), int(cfg["frame"]["height"]))
    before = encode.read_manifest(a.out)
    placeholders = encode.known_placeholders(cfg, a.out, before, a.src)
    boxes = encode.old_boxes(before)
    stills, problems = find_stills(cfg, a.stills)
    if not any(stills.values()):
        fail(f"no stills named NN_<paint id>.jpg under {a.stills}/<car>/")

    made = kept_real = fresh = 0
    t0 = time.time()
    manifest = None
    for car, by_paint in stills.items():
        for paint, path in by_paint.items():
            key = encode.plate_key(car, a.view, "body", paint)
            files = encode.plate_files(a.out, key, cfg)
            complete = all(encode.exists(f) for f in files)
            if complete and key not in placeholders:
                kept_real += 1                       # a real plate: never replace it with a still
                continue
            if complete and not a.all and not encode.is_stale([path], files):
                fresh += 1
                continue
            try:
                im = encode.open_image(path, "RGB")
                if abs(im.width / im.height - frame[0] / frame[1]) > 0.01:
                    raise encode.MasterError(f"{path} is {im.width}x{im.height}: not the frame's shape")
            except encode.MasterError as e:
                problems.append(f"FAIL {e}")
                continue
            got = encode.write_plate(encode.resize_to(im, frame), a.out, key, cfg, "body")
            placeholders.add(key)
            made += 1
            print(f"STILL {key}  " + "  ".join(f"{k} {v / 1000:.0f}k" for k, v in got.items()), flush=True)
        manifest, notes = encode.build_manifest(cfg, a.out, boxes, placeholders)
        path = encode.write_manifest(a.out, manifest)
        print(f"MANIFEST {path} after {car}: {encode.summary(manifest)}", flush=True)
    for line in problems + notes:
        print(line)
    print(f"bootstrap: {made} stand-ins written, {fresh} already there, {kept_real} real plates kept, "
          f"{len(problems)} problems, {time.time() - t0:.0f}s -> {encode.summary(manifest)}")
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()

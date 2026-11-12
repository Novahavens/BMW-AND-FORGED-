"""Masters -> web plates (AVIF and WebP, at every width) and manifest.json. Needs Pillow and numpy, not Blender.

    python3 -I encode.py [--src DIR] [--out DIR] [--all] [--cars a,b] [--views front34,side]
                         [--allow-scaled] [--manifest-only] [--quiet]

    --src            masters root (default $PLATES_OUT or /home/claude/plates_out), as render.py writes it:
                       <car>/<view>/body/<paint>.png                        opaque, frame size
                       <car>/<view>/wheels/<wheel>__<finish>.png  + .json   RGBA crop, {"region": [l, t, r, b]}
    --out            web root (default /home/claude/plates_web; the site serves it as public/plates)
    --all            encode everything again (default: skip outputs that are newer than their master)
    --allow-scaled   accept a master that is not at frame size (a preview render): it is scaled to the frame
                     and recorded as a placeholder, because it is not a final plate
    --manifest-only  write the manifest from what is in --out, encode nothing

Output, per plate and per entry of the manifest's "sizes" (suffix "" is the full frame):
    <out>/<car>/<view>/body/<paint><suffix>.{avif,webp}
    <out>/<car>/<view>/wheels/<wheel>__<finish><suffix>.{avif,webp}
    <out>/manifest.json   docs/PLATES_MASTER_PLAN.md section 5, plus: sizes, factoryWheel, encoder, and
                          placeholder/placeholders while stand-in plates (bootstrap_stills.py) remain

A plate is listed in the manifest only when every one of its files exists. A placeholder is replaced as soon
as its master exists, whatever the file dates say; "placeholder": true goes away when none is left.
Wheel boxes go into the manifest as the rectangle of pixels Blender really rendered (see box_pixels), not as
the fractions that were asked for.
A master that cannot be used is reported on one line (FAIL, or UNKNOWN for a name that is not in the config)
and skipped; a wheel plate whose size is 1 px off its region is encoded and reported (WARN). Any such line
makes the exit code 1; everything else is still encoded and listed. A failure to write into --out stops the
run with one message. The manifest is written to a temporary file and renamed.
Encoding the whole set takes roughly 6 s per body plate and 3 s per wheel plate on two cores.
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402
import PIL  # noqa: E402
from PIL import Image, features  # noqa: E402

from platelib.core import OUT, Config  # noqa: E402

WEB = "/home/claude/plates_web"
FORMATS = ("avif", "webp")
FACTORY = "factory__factory"
EXTRA_WIDTHS = (1280,)            # besides the full frame: the phone copy (about half the bytes)
MANIFEST = "manifest.json"

# Encoder settings, chosen by measurement on real 1920x1080 renders (/home/claude/plates_out/reports/ws5.md,
# "Encoder comparison"). In short:
#   AVIF 4:4:4, not 4:2:0: halved chroma costs about 8 dB on the rim (gold spokes on black, red caliper).
#   AVIF quality 92: the lowest setting at which the near-black backdrop, half the frame, shows no block pattern
#     when its levels are stretched; 85 and 90 show squares and hatching there, 94 is larger and no cleaner,
#     96 keeps the render's dither but costs 250 to 280 kB. Speed 6: speed 4 is slower and smooths the backdrop more.
#   WebP is the fallback: always 4:2:0 and limited-range, so it cannot match AVIF on rims or on the backdrop;
#     above 92 the file grows much faster than the quality.
#   Alpha must be lossless. Pillow's AVIF codes alpha at the colour quality unless told otherwise: measured at
#     quality 92, 563 pixels inside the wheel fell below 255 (down to 250, so the body plate's rim shows through)
#     and 870 transparent pixels rose above 0 (up to 6, a veil over the body). "alpha:lossless" makes it exact
#     for about 3 kB. WebP: alpha_quality 100 is lossless; exact=True keeps the colour this script puts under
#     transparent pixels instead of libwebp's own.
ENCODERS = {
    "avif": {
        "body": {"quality": 92, "subsampling": "4:4:4", "speed": 6},
        "wheel": {"quality": 92, "subsampling": "4:4:4", "speed": 6, "advanced": {"alpha:lossless": "1"}},
    },
    "webp": {
        "body": {"quality": 92, "method": 6},
        "wheel": {"quality": 92, "method": 6, "alpha_quality": 100, "exact": True},
    },
}

Image.MAX_IMAGE_PIXELS = 64_000_000


class MasterError(Exception):
    """A master that cannot be used. The message is the whole story: one line, no traceback."""


def fail(msg):
    sys.exit(f"encode: {msg}")


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------------------------------------- names

def sizes(cfg):
    """[{w, suffix}] with the full frame first."""
    full = int(cfg["frame"]["width"])
    return [{"w": full, "suffix": ""}] + [{"w": int(w), "suffix": f"-{int(w)}w"} for w in EXTRA_WIDTHS if w < full]


def plate_key(car, view, kind, name):
    return f"{car}/{view}/{'body' if kind == 'body' else 'wheels'}/{name}"


def plate_files(out_root, key, cfg):
    """Every file one plate consists of, in a fixed order."""
    base = os.path.join(out_root, *key.split("/"))
    return [f"{base}{s['suffix']}.{fmt}" for s in sizes(cfg) for fmt in FORMATS]


def wheel_names(cfg):
    """Every '<wheel>__<finish>' the config allows, factory first, in config order."""
    return [FACTORY] + [f"{w['id']}__{f}" for w in cfg["wheels"] for f in w["finishes"]]


def exists(path):
    try:
        return os.path.getsize(path) > 0
    except OSError:
        return False


# ---------------------------------------------------------------------------------------------- pixels

def open_image(path, mode):
    """Read a whole image, or raise MasterError with the reason."""
    try:
        if os.path.getsize(path) == 0:
            raise MasterError(f"{path} is empty (0 bytes)")
        with Image.open(path) as im:
            im.load()
            return im.convert(mode) if im.mode != mode else im.copy()
    except MasterError:
        raise
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as e:
        raise MasterError(f"{path} cannot be read: {e}") from e


def fill_colour_under_transparent(im):
    """Give fully transparent pixels the colour of their nearest visible neighbours (push-pull fill).

    Blender's PNGs hold straight alpha and black under alpha 0. A lossy codec codes colour and alpha apart,
    so that black rings into the edge pixels and a browser draws a dark fringe. With the colour continued
    under the transparent area there is nothing dark to ring from. Alpha is not touched."""
    a = np.asarray(im)
    alpha = a[..., 3]
    if alpha.min() > 0 or alpha.max() == 0:
        return im
    known = alpha > 0
    colour = a[..., :3].astype(np.float32) * known[..., None]
    weight = known.astype(np.float32)
    levels = []
    while True:
        levels.append((colour, weight))
        h, w = weight.shape
        if h == 1 and w == 1:
            break
        if h % 2 or w % 2:
            colour = np.pad(colour, ((0, h % 2), (0, w % 2), (0, 0)))
            weight = np.pad(weight, ((0, h % 2), (0, w % 2)))
        colour = colour[0::2, 0::2] + colour[1::2, 0::2] + colour[0::2, 1::2] + colour[1::2, 1::2]
        weight = weight[0::2, 0::2] + weight[1::2, 0::2] + weight[0::2, 1::2] + weight[1::2, 1::2]
    fill = levels[-1][0] / np.maximum(levels[-1][1], 1e-6)[..., None]
    for colour, weight in reversed(levels[:-1]):
        up = np.repeat(np.repeat(fill, 2, axis=0), 2, axis=1)[:weight.shape[0], :weight.shape[1]]
        fill = np.where((weight > 0)[..., None], colour / np.maximum(weight, 1e-6)[..., None], up)
    out = a.copy()
    out[..., :3] = np.where(known[..., None], a[..., :3], np.clip(np.rint(fill), 0, 255).astype(np.uint8))
    return Image.fromarray(out)


def resize_to(im, size):
    """Resize when needed. Pillow resizes RGBA through premultiplied alpha, so edges keep their colour."""
    return im if im.size == size else im.resize(size, Image.LANCZOS)


def write_image(im, path, fmt, kind):
    """Encode into a temporary file and rename, so a reader never sees half a file. Stops on any failure."""
    tmp = f"{path}.tmp{os.getpid()}"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.save(tmp, format=fmt.upper(), **ENCODERS[fmt][kind])
        written = os.path.getsize(tmp)
        if written == 0:
            raise OSError("the encoder wrote an empty file")
        os.replace(tmp, path)
    except (OSError, ValueError, KeyError) as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        fail(f"could not write {path}: {e}")
    return written


def write_plate(im, out_root, key, cfg, kind):
    """All sizes and formats of one plate from a frame-size (body) or box-size (wheel) image. Returns bytes."""
    full = int(cfg["frame"]["width"])
    base = os.path.join(out_root, *key.split("/"))
    total = {}
    for s in sizes(cfg):
        k = s["w"] / full
        size = im.size if k == 1 else (max(1, round(im.width * k)), max(1, round(im.height * k)))
        scaled = resize_to(im, size)
        if kind == "wheel":
            scaled = fill_colour_under_transparent(scaled)
        for fmt in FORMATS:
            total[f"{fmt}{s['suffix']}"] = write_image(scaled, f"{base}{s['suffix']}.{fmt}", fmt, kind)
    return total


# ---------------------------------------------------------------------------------------------- masters

def read_box(json_path):
    """The crop box render.py wrote beside a wheel plate: {"region": [left, top, right, bottom]} in frame fractions."""
    try:
        with open(json_path, encoding="utf-8") as fh:
            box = json.load(fh)["region"]
        box = [float(v) for v in box]
    except OSError as e:
        raise MasterError(f"{json_path} cannot be read: {e}") from e
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        raise MasterError(f"{json_path} is not a crop record (want {{\"region\": [l, t, r, b]}}): {e!r}") from e
    if len(box) != 4 or not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
        raise MasterError(f"{json_path} has a bad region {box}: want 0 <= left < right <= 1 and 0 <= top < bottom <= 1")
    return box


def box_pixels(box, frame):
    """The pixel rectangle (x0, y0, x1, y1, origin top-left) Blender renders for a region given as frame fractions.

    Blender keeps the border as single-precision floats, multiplies by the frame size in single precision and
    truncates, counting rows from the bottom; platelib/rendering.set_region hands it 1 - bottom and 1 - top.
    The same sum in double precision lands 1 px away when an edge sits exactly on a pixel boundary (found with
    Blender 5.2.4: plates_out/ws5/tools/border_probe2.py), so this repeats Blender's arithmetic step by step."""
    single = np.float32
    fw, fh = frame
    left, top, right, bottom = (max(0.0, min(1.0, float(v))) for v in box)
    x0, x1 = int(single(left) * single(fw)), int(single(right) * single(fw))
    rows_below, rows_to_top = int(single(1.0 - bottom) * single(fh)), int(single(1.0 - top) * single(fh))
    return x0, fh - rows_to_top, x1, fh - rows_below


def load_body(path, frame, allow_scaled):
    """-> (image at frame size, scaled?)."""
    im = open_image(path, "RGB")
    if im.size == frame:
        return im, False
    if not allow_scaled:
        raise MasterError(f"{path} is {im.width}x{im.height}, the frame is {frame[0]}x{frame[1]} "
                          "(a preview render? pass --allow-scaled to use it as a placeholder)")
    if abs(im.width / im.height - frame[0] / frame[1]) > 0.01:
        raise MasterError(f"{path} is {im.width}x{im.height}: not the frame's shape, cannot be scaled to it")
    return resize_to(im, frame), True


def load_wheel(path, frame, allow_scaled):
    """-> (RGBA image at the box's size in frame pixels, box as frame fractions, scaled?, warning or '')."""
    box = read_box(path[:-4] + ".json")
    im = open_image(path, "RGBA")
    x0, y0, x1, y1 = box_pixels(box, frame)
    want = (x1 - x0, y1 - y0)
    if abs(im.width - want[0]) <= 1 and abs(im.height - want[1]) <= 1:
        # the manifest gets the rectangle the pixels really cover, so the page lands them on the pixel grid
        snapped = [x0 / frame[0], y0 / frame[1], (x0 + im.width) / frame[0], (y0 + im.height) / frame[1]]
        warning = "" if im.size == want else (
            f"WARN {path} is {im.width}x{im.height}, its region {box} should give {want[0]}x{want[1]}: encoded, "
            "but it may sit 1 px off; check it with qa.py seam")
        return im, [round(v, 6) for v in snapped], False, warning
    if not allow_scaled:
        raise MasterError(f"{path} is {im.width}x{im.height} but its region {box} is {want[0]}x{want[1]} px of the "
                          f"{frame[0]}x{frame[1]} frame (a preview render? pass --allow-scaled to use it as a placeholder)")
    if abs(im.width / im.height - want[0] / want[1]) > 0.03:
        raise MasterError(f"{path} is {im.width}x{im.height}: not the shape of its region ({want[0]}x{want[1]} px)")
    return resize_to(im, want), [round(v, 6) for v in box], True, ""


def master_is_frame_size(path, kind, frame):
    """True when the master has the frame's pixel size (body) or its box's (wheel): a final render, not a preview.

    Only the file header is read. Anything unreadable also gives True, so the caller goes on to load the master
    and reports why it cannot."""
    try:
        with Image.open(path) as im:
            size = im.size
        if kind == "body":
            return size == frame
        x0, y0, x1, y1 = box_pixels(read_box(path[:-4] + ".json"), frame)
        return abs(size[0] - (x1 - x0)) <= 1 and abs(size[1] - (y1 - y0)) <= 1
    except (OSError, ValueError, SyntaxError, MasterError, Image.DecompressionBombError):
        return True


def is_stale(masters, outputs):
    """True when an output is missing, empty, or older than any of its masters."""
    try:
        newest = max(os.path.getmtime(p) for p in masters)
    except OSError:
        return True
    for o in outputs:
        try:
            if os.path.getsize(o) == 0 or os.path.getmtime(o) < newest:
                return True
        except OSError:
            return True
    return False


def find_masters(cfg, src, cars=None, views=None):
    """-> (list of (key, kind, png path), list of one-line problems for files that do not belong)."""
    found, problems = [], []
    paints = {p["id"] for p in cfg["paints"]}
    wheels = set(wheel_names(cfg))
    for car in cfg["cars"]:
        if cars and car["id"] not in cars:
            continue
        for view in cfg["views"]:
            if views and view["id"] not in views:
                continue
            for kind, sub, known in (("body", "body", paints), ("wheel", "wheels", wheels)):
                folder = os.path.join(src, car["id"], view["id"], sub)
                try:
                    names = sorted(os.listdir(folder))
                except FileNotFoundError:
                    continue
                except OSError as e:
                    fail(f"could not list {folder}: {e}")
                for name in names:
                    if not name.endswith(".png"):
                        continue
                    stem = name[:-4]
                    if stem not in known:
                        problems.append(f"UNKNOWN {os.path.join(folder, name)}: {stem!r} is not a "
                                        f"{'paint' if kind == 'body' else 'wheel__finish'} in plates.config.json; skipped")
                        continue
                    found.append((plate_key(car["id"], view["id"], kind, stem), kind, os.path.join(folder, name)))
    return found, problems


# ---------------------------------------------------------------------------------------------- manifest

def read_manifest(out_root):
    """The manifest already in out_root, {} when there is none. A damaged one is reported, then treated as none."""
    path = os.path.join(out_root, MANIFEST)
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("not a JSON object")
        return data
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        log(f"WARNING {path} cannot be used ({e}); rebuilding it from the files")
        return {"_damaged": True}


def old_boxes(manifest):
    """{plate key: box} for the wheel plates of an existing manifest."""
    boxes = {}
    for car in manifest.get("cars", []) if isinstance(manifest.get("cars"), list) else []:
        for view, entry in (car.get("plates") or {}).items():
            for name, box in ((entry or {}).get("wheels") or {}).items():
                boxes[plate_key(car.get("id"), view, "wheel", name)] = box
    return boxes


def build_manifest(cfg, out_root, boxes, placeholders):
    """The manifest for what is on disk. boxes: {wheel plate key: [l, t, r, b]}; placeholders: set of plate keys.

    -> (manifest dict, notes): a plate is listed only when all of its files exist; anything half-written or
    without a box is left out and named in notes."""
    notes = []
    finishes = cfg["wheel_finishes"]
    cars, listed = [], set()
    for car in cfg["cars"]:
        plates = {}
        for view in cfg["views"]:
            body, wheels = [], {}
            for p in cfg["paints"]:
                key = plate_key(car["id"], view["id"], "body", p["id"])
                have = [exists(f) for f in plate_files(out_root, key, cfg)]
                if all(have):
                    body.append(p["id"])
                    listed.add(key)
                elif any(have):
                    notes.append(f"INCOMPLETE {key}: {sum(have)} of {len(have)} files; not listed")
            for name in wheel_names(cfg):
                key = plate_key(car["id"], view["id"], "wheel", name)
                have = [exists(f) for f in plate_files(out_root, key, cfg)]
                if all(have) and key in boxes:
                    wheels[name] = [round(float(v), 6) for v in boxes[key]]
                    listed.add(key)
                elif all(have):
                    notes.append(f"NO BOX {key}: files exist but no crop box is known; not listed")
                elif any(have):
                    notes.append(f"INCOMPLETE {key}: {sum(have)} of {len(have)} files; not listed")
            plates[view["id"]] = {"body": body, "wheels": wheels}
        cars.append({"id": car["id"], "label": car["label"], "chassis": car["chassis"],
                     "defaultPaint": car["default_paint"], "plates": plates})
    manifest = {
        "version": 1,
        "frame": {"w": int(cfg["frame"]["width"]), "h": int(cfg["frame"]["height"])},
        "formats": list(FORMATS),
        "sizes": sizes(cfg),
        "factoryWheel": FACTORY,
    }
    stand_ins = sorted(placeholders & listed)
    if stand_ins:
        manifest["placeholder"] = True
        manifest["placeholders"] = stand_ins
    manifest.update({
        "views": [{"id": v["id"], "label": v["label"]} for v in cfg["views"]],
        "paints": [{k: p[k] for k in ("id", "name", "code", "group", "finish", "hex")} for p in cfg["paints"]],
        "wheels": [{"id": w["id"], "name": w["name"],
                    "finishes": [{"id": f, "name": finishes[f]["name"], "hex": finishes[f]["hex"]} for f in w["finishes"]]}
                   for w in cfg["wheels"]],
        "cars": cars,
        "encoder": {"pillow": PIL.__version__, "libavif": features.version("avif"),
                    "libwebp": features.version("webp"), **ENCODERS},
    })
    return manifest, notes


def write_manifest(out_root, manifest):
    """Atomic: a complete temporary file, then a rename. Stops with one message when that fails."""
    path = os.path.join(out_root, MANIFEST)
    text = json.dumps(manifest, indent=2, ensure_ascii=False)
    text = re.sub(r"\[\s+((?:-?[\d.]+,\s+)*-?[\d.]+)\s+\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", text)
    tmp = f"{path}.tmp{os.getpid()}"
    try:
        os.makedirs(out_root, exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        fail(f"could not write {path}: {e}")
    return path


def known_placeholders(cfg, out_root, manifest, src):
    """The plate keys recorded as stand-ins.

    The manifest is the record. When there is none to read but plate files exist, every plate on disk that has
    no master under src is taken to be a stand-in: calling a placeholder real is the worse mistake."""
    keys = manifest.get("placeholders")
    if isinstance(keys, list):
        return {k for k in keys if isinstance(k, str)}
    if manifest and not manifest.get("_damaged"):
        return set()
    guessed = set()
    for car in cfg["cars"]:
        for view in cfg["views"]:
            names = [("body", p["id"]) for p in cfg["paints"]] + [("wheel", n) for n in wheel_names(cfg)]
            for kind, name in names:
                key = plate_key(car["id"], view["id"], kind, name)
                if exists(plate_files(out_root, key, cfg)[0]) and not exists(os.path.join(src, *key.split("/")) + ".png"):
                    guessed.add(key)
    if guessed:
        log(f"WARNING no usable manifest in {out_root}: {len(guessed)} plates without a master are taken to be placeholders")
    return guessed


def summary(manifest):
    body = sum(len(v["body"]) for c in manifest["cars"] for v in c["plates"].values())
    wheel = sum(len(v["wheels"]) for c in manifest["cars"] for v in c["plates"].values())
    return f"{body} body plates, {wheel} wheel plates, {len(manifest.get('placeholders', []))} placeholders"


# ---------------------------------------------------------------------------------------------- main

def check_codecs():
    for fmt in FORMATS:
        if not features.check(fmt):
            fail(f"this Pillow ({PIL.__version__}) cannot write {fmt.upper()}; "
                 "install a build with it (pip install --break-system-packages -U pillow)")


def main():
    ap = argparse.ArgumentParser(description="Encode plate masters for the web and write the manifest")
    ap.add_argument("--src", default=OUT)
    ap.add_argument("--out", default=WEB)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--cars", default="")
    ap.add_argument("--views", default="")
    ap.add_argument("--allow-scaled", action="store_true")
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    pick = lambda s: {v for v in s.split(",") if v} or None   # noqa: E731
    cfg = Config()
    check_codecs()
    for name, wanted in (("car", pick(a.cars)), ("view", pick(a.views))):
        known = {i["id"] for i in cfg[name + "s"]}
        if wanted and wanted - known:
            fail(f"unknown {name} {', '.join(sorted(wanted - known))}; known: {', '.join(sorted(known))}")
    if not os.path.isdir(a.src):
        fail(f"masters folder not found: {a.src} (set PLATES_OUT or pass --src)")
    try:
        os.makedirs(a.out, exist_ok=True)
    except OSError as e:
        fail(f"could not create {a.out}: {e}")

    frame = (int(cfg["frame"]["width"]), int(cfg["frame"]["height"]))
    before = read_manifest(a.out)
    placeholders = known_placeholders(cfg, a.out, before, a.src)
    boxes = old_boxes(before)
    if before.get("encoder") and {k: before["encoder"].get(k) for k in FORMATS} != ENCODERS and not a.all:
        log("NOTE the encoder settings changed since the last run; plates with a master are encoded again")
        a.all = True

    masters, problems = ([], []) if a.manifest_only else find_masters(cfg, a.src, pick(a.cars), pick(a.views))
    done = skipped = replaced = 0
    size_sum = {}
    t0 = time.time()
    for key, kind, path in masters:
        deps = [path] + ([path[:-4] + ".json"] if kind == "wheel" else [])
        stand_in = key in placeholders
        # a stand-in is replaced as soon as a real master exists, whatever the file dates say; a stand-in made
        # from a preview-size master (--allow-scaled) is only redone when that master changes
        wanted = (a.all or is_stale(deps, plate_files(a.out, key, cfg))
                  or (stand_in and master_is_frame_size(path, kind, frame)))
        if not wanted:
            skipped += 1
            if kind == "wheel" and key not in boxes:
                try:
                    boxes[key] = load_wheel(path, frame, a.allow_scaled)[1]
                except MasterError as e:
                    problems.append(f"FAIL {e}")
            continue
        try:
            if kind == "body":
                im, scaled = load_body(path, frame, a.allow_scaled)
            else:
                im, box, scaled, warning = load_wheel(path, frame, a.allow_scaled)
                if np.asarray(im)[..., 3].max() == 0:
                    raise MasterError(f"{path} is fully transparent: no wheel in it")
                if warning:
                    problems.append(warning)
        except MasterError as e:
            problems.append(f"FAIL {e}")
            continue
        got = write_plate(im, a.out, key, cfg, kind)
        if kind == "wheel":
            boxes[key] = box
        if scaled:
            placeholders.add(key)
        else:
            replaced += stand_in
            placeholders.discard(key)
        done += 1
        for name, n in got.items():
            size_sum.setdefault((kind, name), []).append(n)
        if not a.quiet:
            log(f"ENC {key}  " + "  ".join(f"{k} {v / 1000:.0f}k" for k, v in got.items())
                + ("  (scaled: placeholder)" if scaled else "  (replaces a placeholder)" if stand_in else ""))

    manifest, notes = build_manifest(cfg, a.out, boxes, placeholders)
    path = write_manifest(a.out, manifest)
    for line in problems + notes:
        log(line)
    for (kind, name), values in sorted(size_sum.items()):
        log(f"SIZE {kind:5s} {name:12s} n={len(values)} mean {sum(values) / len(values) / 1000:.0f} kB  max {max(values) / 1000:.0f} kB")
    log(f"encode: {done} encoded ({replaced} replaced a placeholder), {skipped} up to date, {len(problems)} problems, "
        f"{time.time() - t0:.0f}s -> {path}: {summary(manifest)}"
        + ("" if manifest.get("placeholder") else "; no placeholders left"))
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()

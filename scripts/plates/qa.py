"""Checks on plates: the seam between body and wheel plate (gate G5), and the encoded set as a whole.

    python3 -I qa.py seam --body body.png --wheel wheel.png --wheel-json wheel.json --direct direct.png
                          [--out DIR] [--name NAME] [--ring 24] [--limit 2] [--edge-limit 8] [--gain 16]

        Lays the wheel plate over the body plate at its box, the way a browser does (straight alpha, 8 bit),
        and compares the result with the direct render of that wheel on the car:
          box      every pixel inside the wheel box                         gate: 95th percentile <= limit
          ring     a band --ring px wide just outside the box (halos, cut-off wheels, floor reflections)
                                                                            gate: 95th percentile <= limit
          covered  only pixels the wheel plate draws on (alpha > 0)         reported
          edge     only its soft-edged pixels (0 < alpha < 255)             gate: 95th percentile <= edge-limit
                   A fringe lives here and nowhere else. These pixels are a few percent of the box (about 2 %
                   in the test case), so the box figure cannot see one: a dark-fringed plate scored box p95 0.
                   --edge-limit 0 switches this gate off and leaves the plan's box and ring definition alone.
          hard     the edge pixels again, as they would be if the plate left them to the body plate
                   (alpha below 255 treated as 0)                           reported
          fit      the plate is tried 2 px each way; if it fits better anywhere but at its box, the box is
                   wrong                                                    gate: best fit at 0,0
        Differences are absolute, per channel (R/G/B), in 8-bit units. Writes NAME_diff.png (difference x gain),
        NAME_side.png (composite | direct | difference, at 100%) and NAME_composite.png into --out.
        Exit 0 = pass, 1 = the gate failed, 2 = the inputs could not be used.

    python3 -I qa.py set [--out /home/claude/plates_web] [--existing-only] [--placeholders-ok] [--fast]

        Walks the manifest and the encoded files and prints one line per problem, then a count:
          MISSING      a plate of tasks.py's full list that the manifest does not have (not with --existing-only)
          PLACEHOLDER  a stand-in from the old stills, not a rendered plate (not with --placeholders-ok)
          NO FILE / EMPTY / UNDECODABLE / SIZE / MODE   a listed file that is absent, 0 bytes, broken, of the wrong
                       dimensions, or with/without alpha when it should be the other way
          ALPHA        a wheel plate that is fully transparent or fully opaque (AVIF and WebP drop an alpha
                       channel that is opaque everywhere, so that case usually arrives as MODE)
          BLANK        a body plate that is near-black, near-white or flat overall (a failed render)
          BOX / MANIFEST / ORPHAN   a bad box, a broken or inconsistent manifest, a file nothing refers to
        --fast decodes only the full-size AVIF of each plate (the other files are still checked for presence).
        Exit 0 = no problems, 1 = problems, 2 = no manifest to check.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import encode  # noqa: E402
from platelib.core import OUT, Config  # noqa: E402
from tasks import expand  # noqa: E402


def fail(msg, code=2):
    print(f"qa: {msg}", file=sys.stderr)
    sys.exit(code)


# ================================================================================================ seam

def lay_plate_over(body, plate, x0, y0, hard=False):
    """body (H, W, 3 uint8) with plate (h, w, 4 uint8, straight alpha) laid over it at x0, y0. Parts of the
    plate that fall outside the frame are dropped. hard=True leaves soft-edged pixels to the body plate."""
    out = body.copy()
    fh, fw = body.shape[:2]
    h, w = plate.shape[:2]
    cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x0 + w, fw), min(y0 + h, fh)
    if cx1 <= cx0 or cy1 <= cy0:
        return out
    part = plate[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0].astype(np.float32)
    alpha = part[..., 3:4] / 255.0
    if hard:
        alpha = (alpha >= 1.0).astype(np.float32)
    under = out[cy0:cy1, cx0:cx1].astype(np.float32)
    out[cy0:cy1, cx0:cx1] = np.clip(np.rint(part[..., :3] * alpha + under * (1.0 - alpha)), 0, 255).astype(np.uint8)
    return out


def diff_stats(diff, mask):
    """(p95 per channel, max per channel, mean over all channels, pixel count) of diff where mask is set."""
    n = int(mask.sum())
    if n == 0:
        return None
    values = diff[mask]
    return (tuple(int(v) for v in np.percentile(values, 95, axis=0)), tuple(int(v) for v in values.max(axis=0)),
            float(values.mean()), n)


def format_stats(s):
    if s is None:
        return "no pixels"
    p95, mx, mean, n = s
    return f"p95 {p95[0]}/{p95[1]}/{p95[2]}   max {mx[0]}/{mx[1]}/{mx[2]}   mean {mean:.2f}   ({n} px)"


def label_font(size=14):
    for name in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue                     # not installed or unreadable: try the next, then Pillow's built-in font
    return ImageFont.load_default()


def labelled_panels(images, labels):
    """Panels at 100% with a caption bar: side by side when they fit in about 2000 px, else stacked."""
    bar = 22
    w, h = images[0].size
    across = w * len(images) <= 2000
    size = (w * len(images), h + bar) if across else (w, (h + bar) * len(images))
    sheet = Image.new("RGB", size, (14, 14, 15))
    draw = ImageDraw.Draw(sheet)
    for n, (im, text) in enumerate(zip(images, labels)):
        x, y = (n * w, 0) if across else (0, n * (h + bar))
        sheet.paste(im, (x, y + bar))
        draw.text((x + 6, y + 3), text, fill=(201, 169, 110), font=label_font())
    return sheet


def save_image(im, path):
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        im.save(path)
    except OSError as e:
        fail(f"could not write {path}: {e}")
    return path


def cmd_seam(a):
    try:
        body = np.asarray(encode.open_image(a.body, "RGB"))
        direct = np.asarray(encode.open_image(a.direct, "RGB"))
        plate = np.asarray(encode.open_image(a.wheel, "RGBA"))
        box = encode.read_box(a.wheel_json)
    except encode.MasterError as e:
        fail(str(e))
    if body.shape != direct.shape:
        fail(f"the body plate is {body.shape[1]}x{body.shape[0]} and the direct render {direct.shape[1]}x{direct.shape[0]}: "
             "they must be the same frame")
    fh, fw = body.shape[:2]
    x0, y0, x1, y1 = encode.box_pixels(box, (fw, fh))
    ph, pw = plate.shape[:2]
    if abs(pw - (x1 - x0)) > 1 or abs(ph - (y1 - y0)) > 1:
        fail(f"the wheel plate is {pw}x{ph} px but its box {box} is {x1 - x0}x{y1 - y0} px of the {fw}x{fh} frame: "
             "plate and box do not belong together (or the plate was rendered at another scale than the body)")
    x1, y1 = x0 + pw, y0 + ph
    alpha = np.zeros((fh, fw), np.uint8)
    cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x1, fw), min(y1, fh)
    alpha[cy0:cy1, cx0:cx1] = plate[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0, 3]
    if alpha.max() == 0:
        fail(f"{a.wheel} is fully transparent: there is no wheel to check")

    comp = lay_plate_over(body, plate, x0, y0)
    diff = np.abs(comp.astype(np.int16) - direct.astype(np.int16)).astype(np.uint8)
    in_box = np.zeros((fh, fw), bool)
    in_box[cy0:cy1, cx0:cx1] = True
    rx0, ry0, rx1, ry1 = max(x0 - a.ring, 0), max(y0 - a.ring, 0), min(x1 + a.ring, fw), min(y1 + a.ring, fh)
    in_ring = np.zeros((fh, fw), bool)
    in_ring[ry0:ry1, rx0:rx1] = True
    in_ring &= ~in_box
    soft = (alpha > 0) & (alpha < 255)
    s_box, s_ring = diff_stats(diff, in_box), diff_stats(diff, in_ring)
    s_cov, s_edge = diff_stats(diff, alpha > 0), diff_stats(diff, soft)
    hard = lay_plate_over(body, plate, x0, y0, hard=True)
    s_hard = diff_stats(np.abs(hard.astype(np.int16) - direct.astype(np.int16)).astype(np.uint8), soft)

    # Does the plate fit better somewhere else? Mean difference over box + 2 px, for shifts of up to 2 px.
    near = np.zeros((fh, fw), bool)
    near[max(y0 - 2, 0):min(y1 + 2, fh), max(x0 - 2, 0):min(x1 + 2, fw)] = True
    ref = direct.astype(np.int16)
    fits = {}
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            shifted = lay_plate_over(body, plate, x0 + dx, y0 + dy)
            fits[(dx, dy)] = float(np.abs(shifted.astype(np.int16) - ref)[near].mean())
    best = min(fits, key=fits.get)
    misfit = best != (0, 0) and fits[best] < 0.9 * fits[(0, 0)]

    reasons = []
    if max(s_box[0]) > a.limit:
        reasons.append(f"box p95 {max(s_box[0])} > {a.limit:g}")
    if s_ring and max(s_ring[0]) > a.limit:
        reasons.append(f"ring p95 {max(s_ring[0])} > {a.limit:g}")
    if a.edge_limit > 0 and s_edge and max(s_edge[0]) > a.edge_limit:
        reasons.append(f"edge p95 {max(s_edge[0])} > {a.edge_limit:g} (soft-edged pixels only"
                       + ("; left to the body plate they would be within the limit: see 'hard')"
                          if s_hard and max(s_hard[0]) <= a.edge_limit else ")"))
    if misfit:
        reasons.append(f"the plate fits best {best[0]:+d},{best[1]:+d} px away from its box "
                       f"(mean difference {fits[best]:.2f} there, {fits[(0, 0)]:.2f} at the box)")

    name = a.name or os.path.splitext(os.path.basename(a.wheel))[0]
    crop = (rx0, ry0, rx1, ry1)
    amplified = np.clip(diff.astype(np.int32) * a.gain, 0, 255).astype(np.uint8)
    diff_im = Image.fromarray(amplified).crop(crop)
    marked = diff_im.copy()
    ImageDraw.Draw(marked).rectangle((x0 - rx0 - 1, y0 - ry0 - 1, x1 - rx0, y1 - ry0), outline=(90, 90, 40))
    paths = [
        save_image(diff_im, os.path.join(a.out, f"{name}_diff.png")),
        save_image(labelled_panels([Image.fromarray(comp).crop(crop), Image.fromarray(direct).crop(crop), marked],
                    ["composite: body + wheel plate", "direct render", f"difference x{a.gain:g} (line: the wheel box)"]),
             os.path.join(a.out, f"{name}_side.png")),
        save_image(Image.fromarray(comp), os.path.join(a.out, f"{name}_composite.png")),
    ]
    print(f"seam {name}: frame {fw}x{fh}, box {x0},{y0} to {x1},{y1} ({pw}x{ph} px), limit {a.limit:g}, "
          f"edge limit {a.edge_limit:g}{' (off)' if a.edge_limit <= 0 else ''}, R/G/B in 8-bit units")
    print(f"  box      {format_stats(s_box)}")
    print(f"  ring     {format_stats(s_ring)}   ({a.ring} px outside the box)")
    print(f"  covered  {format_stats(s_cov)}")
    print(f"  edge     {format_stats(s_edge)}")
    print(f"  hard     {format_stats(s_hard)}   (the edge pixels if they were left to the body plate)")
    print(f"  fit      best at {best[0]:+d},{best[1]:+d} (mean {fits[best]:.2f}; at the box {fits[(0, 0)]:.2f})")
    print("  images   " + "  ".join(paths))
    if reasons:
        print(f"  FAIL     {'; '.join(reasons)}")
        sys.exit(1)
    print("  PASS")


# ================================================================================================ set

def check_file(path, want_size, want_alpha, tolerance):
    """-> ((tag, text) of the problem or None, image or None). The image is returned only when it decoded."""
    try:
        if os.path.getsize(path) == 0:
            return ("EMPTY", f"{path}: 0 bytes"), None
    except OSError:
        return ("NO FILE", f"{path}: listed in the manifest, not on disk"), None
    try:
        with Image.open(path) as im:
            im.load()
            im = im.copy()
    except Exception as e:   # noqa: BLE001  a broken file can fail in many ways; every one is the same finding
        return ("UNDECODABLE", f"{path}: {type(e).__name__}: {str(e)[:120]}"), None
    if abs(im.width - want_size[0]) > tolerance or abs(im.height - want_size[1]) > tolerance:
        return ("SIZE", f"{path}: {im.width}x{im.height}, expected {want_size[0]}x{want_size[1]}"), im
    has_alpha = im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info
    if has_alpha != want_alpha:
        return ("MODE", f"{path}: {'has' if has_alpha else 'has no'} alpha ({im.mode}); a "
                        f"{'wheel' if want_alpha else 'body'} plate must{'' if want_alpha else ' not'} have it"), im
    return None, im


def blank_reason(im):
    """Why a body plate looks like a failed render, or ''."""
    small = np.asarray(im.convert("L").resize((240, 135), Image.BILINEAR), np.float32)
    lo, hi = np.percentile(small, (0.5, 99.5))
    if hi < 20:
        return f"near-black overall (brightest half percent is {hi:.0f}/255)"
    if lo > 235:
        return f"near-white overall (darkest half percent is {lo:.0f}/255)"
    if small.std() < 3:
        return f"flat (standard deviation {small.std():.1f})"
    return ""


def read_manifest_to_check(path):
    """The manifest as a dict; stops with one message when there is none or it is not JSON."""
    try:
        with open(path, encoding="utf-8") as fh:
            man = json.load(fh)
    except OSError as e:
        fail(f"no manifest to check: {path}: {e}")
    except json.JSONDecodeError as e:
        fail(f"the manifest is not valid JSON: {path}: {e}")
    if not isinstance(man, dict):
        fail(f"the manifest is not a JSON object: {path}")
    return man


def check_manifest_contents(man, cfg, add, placeholders_ok, existing_only):
    """Everything that can be said about the manifest without opening an image.

    -> (listed {plate key: 'body' | 'wheel'}, boxes {wheel plate key: box or None}, stand-ins, sizes).
    A manifest of the wrong shape raises KeyError/TypeError/AttributeError/ValueError; the caller reports it."""
    frame = (int(cfg["frame"]["width"]), int(cfg["frame"]["height"]))
    if (man["frame"]["w"], man["frame"]["h"]) != frame:
        add("MANIFEST", f"frame is {man['frame']}, the config says {frame[0]}x{frame[1]}")
    if list(man["formats"]) != list(encode.FORMATS):
        add("MANIFEST", f"formats are {man['formats']}, expected {list(encode.FORMATS)}")
    sizes = man.get("sizes") or [{"w": frame[0], "suffix": ""}]
    for s in sizes:
        if not (isinstance(s["w"], int) and s["w"] > 0 and isinstance(s["suffix"], str)):
            raise ValueError(f"sizes entry {s!r} needs a positive integer w and a text suffix")
    if sizes != encode.sizes(cfg):
        add("MANIFEST", f"sizes are {sizes}, encode.py writes {encode.sizes(cfg)}")
    paint_ids = [p.get("id") for p in man["paints"]]
    for field, want in (("views", [v["id"] for v in cfg["views"]]), ("paints", [p["id"] for p in cfg["paints"]]),
                        ("wheels", [w["id"] for w in cfg["wheels"]]), ("cars", [c["id"] for c in cfg["cars"]])):
        got = [i.get("id") for i in man[field]]
        if got != want:
            add("MANIFEST", f"{field} are {got}, the config has {want}")
    for p in man["paints"]:
        lost = [k for k in ("id", "name", "code", "group", "finish", "hex") if k not in p]
        if lost:
            add("MANIFEST", f"paint {p.get('id')!r} has no {', '.join(lost)}")
    wheel_keys = {man.get("factoryWheel", encode.FACTORY)}
    for w in man["wheels"]:
        for f in w.get("finishes", []):
            wheel_keys.add(f"{w.get('id')}__{f.get('id')}")
            if not all(k in f for k in ("id", "name", "hex")):
                add("MANIFEST", f"wheel {w.get('id')!r} finish {f!r} needs id, name and hex")

    listed, boxes = {}, {}
    for car in man["cars"]:
        if car.get("defaultPaint") not in paint_ids:
            add("MANIFEST", f"car {car.get('id')!r}: defaultPaint {car.get('defaultPaint')!r} is not a paint")
        for view, entry in (car.get("plates") or {}).items():
            for paint in (entry or {}).get("body", []):
                if paint not in paint_ids:
                    add("MANIFEST", f"{car['id']}/{view}: body paint {paint!r} is not in the paints list")
                listed[encode.plate_key(car["id"], view, "body", paint)] = "body"
            for name, box in ((entry or {}).get("wheels") or {}).items():
                key = encode.plate_key(car["id"], view, "wheel", name)
                if name not in wheel_keys:
                    add("MANIFEST", f"{car['id']}/{view}: wheel {name!r} is not a wheel__finish of the wheels list")
                ok = (isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)
                      and 0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1)
                if not ok:
                    add("BOX", f"{key}: {box!r} is not [left, top, right, bottom] with 0 <= left < right <= 1 "
                               "and 0 <= top < bottom <= 1")
                listed[key] = "wheel"
                boxes[key] = box if ok else None
    stand_ins = set(man.get("placeholders") or [])
    if bool(man.get("placeholder")) != bool(stand_ins):
        add("MANIFEST", f"placeholder is {man.get('placeholder')!r} but placeholders lists {len(stand_ins)} plates")
    for key in sorted(stand_ins - set(listed)):
        add("MANIFEST", f"placeholders names {key}, which is not a listed plate")
    if not placeholders_ok:
        for key in sorted(stand_ins & set(listed)):
            add("PLACEHOLDER", f"{key}: a stand-in from the old stills, not a rendered plate")
    if not existing_only:
        for t in expand(cfg):
            name = t["paint"] if t["kind"] == "body" else f"{t['wheel']}__{t.get('finish') or 'factory'}"
            key = encode.plate_key(t["car"], t["view"], t["kind"], name)
            if key not in listed:
                add("MISSING", f"{key}: in the task list, not in the manifest")
    return listed, boxes, stand_ins, sizes


def check_plate_files(out_root, man, frame, listed, boxes, sizes, add, fast):
    """Open every file of every listed plate (with fast: one per plate, the rest for presence). -> files decoded."""
    decoded = 0
    for key, kind in sorted(listed.items()):
        base = os.path.join(out_root, *key.split("/"))
        if kind == "wheel" and boxes.get(key) is None:
            continue                                   # already reported as BOX; its size cannot be known
        for n, s in enumerate(sizes):
            k = s["w"] / frame[0]
            if kind == "body":
                want = (round(frame[0] * k), round(frame[1] * k))
            else:
                b = boxes[key]
                want = (round((b[2] - b[0]) * frame[0] * k), round((b[3] - b[1]) * frame[1] * k))
            for fmt in man["formats"]:
                file = f"{base}{s['suffix']}.{fmt}"
                if fast and not (n == 0 and fmt == man["formats"][0]):
                    if not os.path.exists(file):
                        add("NO FILE", f"{file}: listed in the manifest, not on disk")
                    elif not encode.exists(file):
                        add("EMPTY", f"{file}: 0 bytes")
                    continue
                found, im = check_file(file, want, kind == "wheel", 1 if kind == "wheel" else 0)
                decoded += 1
                if found:
                    add(*found)
                    continue
                if kind == "wheel":
                    alpha = np.asarray(im.convert("RGBA"))[..., 3]
                    if alpha.max() == 0:
                        add("ALPHA", f"{file}: fully transparent, there is no wheel in it")
                    elif alpha.min() == 255:
                        add("ALPHA", f"{file}: fully opaque, the cut-out is missing")
                else:
                    why = blank_reason(im)
                    if why:
                        add("BLANK", f"{file}: {why}")
    return decoded


def report_orphan_files(out_root, man, listed, sizes, add):
    """Files under out_root that the manifest does not account for, and folders that could not be read."""
    expected = {os.path.join(out_root, encode.MANIFEST)}
    for key in listed:
        base = os.path.join(out_root, *key.split("/"))
        expected.update(f"{base}{s['suffix']}.{fmt}" for s in sizes for fmt in man["formats"])

    def unreadable(err):
        add("UNREADABLE", f"{err.filename}: {err.strerror}; its files were not checked")

    for folder, _, names in os.walk(out_root, onerror=unreadable):
        for name in sorted(names):
            file = os.path.join(folder, name)
            if file not in expected:
                add("ORPHAN", f"{file}: not referred to by the manifest")


def cmd_set(a):
    cfg = Config()
    path = os.path.join(a.out, encode.MANIFEST)
    man = read_manifest_to_check(path)
    problems = []

    def add(tag, text):
        problems.append((tag, text))

    frame = (int(cfg["frame"]["width"]), int(cfg["frame"]["height"]))
    listed, stand_ins, decoded = {}, set(), 0
    missing_keys = [k for k in ("version", "frame", "formats", "views", "paints", "wheels", "cars") if k not in man]
    if missing_keys:
        add("MANIFEST", f"{path} has no {', '.join(repr(k) for k in missing_keys)}; nothing else was checked")
    else:
        try:
            listed, boxes, stand_ins, sizes = check_manifest_contents(man, cfg, add, a.placeholders_ok, a.existing_only)
        except (KeyError, TypeError, AttributeError, ValueError, IndexError) as e:
            add("MANIFEST", f"{path} does not have the documented shape ({type(e).__name__}: {e}); nothing else was checked")
        else:
            decoded = check_plate_files(a.out, man, frame, listed, boxes, sizes, add, a.fast)
            report_orphan_files(a.out, man, listed, sizes, add)

    counts = {}
    for tag, text in problems:
        print(f"{tag} {text}")
        counts[tag] = counts.get(tag, 0) + 1
    n_body = sum(1 for k in listed.values() if k == "body")
    print(f"qa set: {a.out}: {n_body} body plates and {len(listed) - n_body} wheel plates listed, "
          f"{len(stand_ins)} placeholders, {decoded} files decoded" + (" (fast: one file per plate)" if a.fast else ""))
    print(f"qa set: {len(problems)} problems" + (": " + ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) if counts else ""))
    sys.exit(1 if problems else 0)


# ================================================================================================ main

def main():
    ap = argparse.ArgumentParser(description="Plate checks: seam (gate G5) and the encoded set")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("seam")
    p.add_argument("--body", required=True)
    p.add_argument("--wheel", required=True)
    p.add_argument("--wheel-json", required=True)
    p.add_argument("--direct", required=True)
    p.add_argument("--out", default=os.path.join(OUT, "ws5", "seam"))
    p.add_argument("--name", default="")
    p.add_argument("--ring", type=int, default=24)
    p.add_argument("--limit", type=float, default=2.0)
    p.add_argument("--edge-limit", type=float, default=8.0)
    p.add_argument("--gain", type=float, default=16.0)
    p.set_defaults(fn=cmd_seam)
    p = sub.add_parser("set")
    p.add_argument("--out", default=encode.WEB)
    p.add_argument("--existing-only", action="store_true")
    p.add_argument("--placeholders-ok", action="store_true")
    p.add_argument("--fast", action="store_true")
    p.set_defaults(fn=cmd_set)
    a = ap.parse_args()
    if a.cmd == "seam" and a.ring < 1:
        fail("--ring must be at least 1")
    a.fn(a)


if __name__ == "__main__":
    main()

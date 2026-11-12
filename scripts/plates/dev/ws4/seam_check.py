"""Gate G5 by hand: lay a wheel plate over a body plate at its recorded box and compare with a direct render.

    python3 -I dev/ws4/seam_check.py --body body.png --plate plate.png --direct direct.png --out seam.png [--label text]

The plate's box is read from the .json beside it. Differences are reported per wheel (each connected patch of
the plate's alpha, padded by 8 px): mean, 95th and 99th percentile and maximum of the largest channel
difference (0..255), and the same along the matte edge (pixels within 3 px of where alpha changes), which is
where a halo would show. The sheet shows body plate, composite, direct render and the difference x8.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def fail(msg):
    sys.exit(f"seam_check: {msg}")


def load_image(path, mode):
    try:
        return Image.open(path).convert(mode)
    except OSError as e:
        fail(f"could not read {path}: {e}")


def read_box(plate_path):
    path = os.path.splitext(plate_path)[0] + ".json"
    try:
        with open(path, encoding="utf-8") as fh:
            region = json.load(fh)["region"]
    except (OSError, json.JSONDecodeError, KeyError) as e:
        fail(f"could not read the crop record {path}: {e}")
    if len(region) != 4:
        fail(f"{path}: region must hold four numbers")
    return region


def patches(alpha, min_pixels=200):
    """Bounding boxes of the connected opaque patches of an alpha mask (coarse: on a 4 px grid)."""
    small = alpha[::4, ::4] > 0
    labels = np.zeros(small.shape, dtype=np.int32)
    boxes, current = [], 0
    for y, x in zip(*np.nonzero(small)):
        if labels[y, x]:
            continue
        current += 1
        stack, x0, y0, x1, y1, count = [(y, x)], x, y, x, y, 0
        labels[y, x] = current
        while stack:
            cy, cx = stack.pop()
            count += 1
            x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < small.shape[0] and 0 <= nx < small.shape[1] and small[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = current
                    stack.append((ny, nx))
        if count * 16 >= min_pixels:
            boxes.append((x0 * 4, y0 * 4, x1 * 4 + 4, y1 * 4 + 4))
    return boxes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--body", required=True)
    ap.add_argument("--plate", required=True)
    ap.add_argument("--direct", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="")
    a = ap.parse_args()
    body, direct, plate = load_image(a.body, "RGBA"), load_image(a.direct, "RGB"), load_image(a.plate, "RGBA")
    if body.size != direct.size:
        fail(f"body plate {body.size} and direct render {direct.size} differ in size")
    width, height = body.size
    left, top, right, bottom = read_box(a.plate)
    x0, y0 = round(left * width), round(top * height)
    want = (round(right * width) - x0, round(bottom * height) - y0)
    if plate.size != want:
        fail(f"plate is {plate.size} but its box says {want}: the crop record and the image do not match")
    comp = body.copy()
    comp.alpha_composite(plate, (x0, y0))
    comp = comp.convert("RGB")
    diff = np.abs(np.asarray(comp).astype(np.int16) - np.asarray(direct).astype(np.int16)).max(axis=2)
    alpha = np.zeros((height, width), dtype=np.uint8)
    alpha[y0:y0 + plate.height, x0:x0 + plate.width] = np.asarray(plate)[..., 3]
    mask = Image.fromarray(((alpha > 0) * 255).astype(np.uint8))
    edge = np.asarray(mask.filter(ImageFilter.MaxFilter(7))).astype(np.int16) - np.asarray(mask.filter(ImageFilter.MinFilter(7))).astype(np.int16) > 0
    report = {"label": a.label, "frame": [width, height], "box_px": [x0, y0, x0 + plate.width, y0 + plate.height], "wheels": []}
    lines = []
    for bx0, by0, bx1, by1 in patches(alpha):
        bx0, by0, bx1, by1 = max(0, bx0 - 8), max(0, by0 - 8), min(width, bx1 + 8), min(height, by1 + 8)
        d = diff[by0:by1, bx0:bx1]
        e = d[edge[by0:by1, bx0:bx1]]
        row = {"box_px": [int(bx0), int(by0), int(bx1), int(by1)], "mean": float(d.mean()), "p95": float(np.percentile(d, 95)),
               "p99": float(np.percentile(d, 99)), "max": int(d.max()),
               "edge_p95": float(np.percentile(e, 95)) if e.size else 0.0, "edge_max": int(e.max()) if e.size else 0}
        report["wheels"].append(row)
        lines.append(f"wheel box {row['box_px']}: mean {row['mean']:.2f}  p95 {row['p95']:.1f}  p99 {row['p99']:.1f}  max {row['max']}  | "
                     f"matte edge p95 {row['edge_p95']:.1f} max {row['edge_max']}")
    whole = diff[y0:y0 + plate.height, x0:x0 + plate.width]
    report["plate_box"] = {"mean": float(whole.mean()), "p95": float(np.percentile(whole, 95)), "max": int(whole.max())}
    for line in lines:
        print(line)
    print(f"whole plate box: mean {report['plate_box']['mean']:.2f} p95 {report['plate_box']['p95']:.1f} max {report['plate_box']['max']}")
    # sheet: the largest wheel at 100%
    if report["wheels"]:
        bx0, by0, bx1, by1 = max(report["wheels"], key=lambda r: (r["box_px"][2] - r["box_px"][0]) * (r["box_px"][3] - r["box_px"][1]))["box_px"]
    else:
        bx0, by0, bx1, by1 = x0, y0, x0 + plate.width, y0 + plate.height
    tiles = [(body.convert("RGB"), "body plate"), (comp, "body + wheel plate"), (direct, "direct render"),
             (Image.fromarray(np.clip(diff * 8, 0, 255).astype(np.uint8)).convert("RGB"), "difference x8")]
    w, h = bx1 - bx0, by1 - by0
    sheet = Image.new("RGB", (w * 2, (h + 22) * 2 + 22), (14, 14, 15))
    draw = ImageDraw.Draw(sheet)
    draw.text((6, 4), f"{a.label}  " + (lines[0] if lines else ""), fill=(235, 232, 225))
    for n, (im, name) in enumerate(tiles):
        px, py = (n % 2) * w, 22 + (n // 2) * (h + 22)
        sheet.paste(im.crop((bx0, by0, bx1, by1)), (px, py + 22))
        draw.text((px + 6, py + 4), name, fill=(201, 169, 110))
    try:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        sheet.save(a.out)
        with open(os.path.splitext(a.out)[0] + ".json", "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=1)
    except OSError as e:
        fail(f"could not write {a.out}: {e}")
    print(f"sheet {a.out}")


if __name__ == "__main__":
    main()

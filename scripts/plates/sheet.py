"""Contact sheets and side-by-sides for reviewing renders.

    python3 -I sheet.py --out sheet.jpg [--cols 3] [--cell 960x540] [--title "M2 CS"] img.png::label ...
    python3 -I sheet.py --out pair.jpg --pair before.png after.png [--labels "Before,After"] [--crop l,t,r,b]

--crop takes fractions of each image (left, top, right, bottom), for 100% detail crops of the same area.
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont


def fail(msg):
    sys.exit(f"sheet: {msg}")


def load(path, crop=None):
    if not os.path.isfile(path):
        fail(f"image not found: {path}")
    try:
        im = Image.open(path).convert("RGB")
    except OSError as e:
        fail(f"could not read {path}: {e}")
    if crop:
        w, h = im.size
        left, top, right, bottom = crop
        im = im.crop((int(left * w), int(top * h), int(right * w), int(bottom * h)))
    return im


def font(size):
    for name in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.isfile(name):
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def fit(im, cell):
    cw, ch = cell
    k = min(cw / im.width, ch / im.height)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def build(items, cols, cell, title):
    bar = 30
    rows = (len(items) + cols - 1) // cols
    head = 40 if title else 0
    sheet = Image.new("RGB", (cols * cell[0], head + rows * (cell[1] + bar)), (14, 14, 15))
    draw = ImageDraw.Draw(sheet)
    if title:
        draw.text((12, 8), title, fill=(235, 232, 225), font=font(20))
    for n, (im, label) in enumerate(items):
        x, y = (n % cols) * cell[0], head + (n // cols) * (cell[1] + bar)
        small = fit(im, cell)
        sheet.paste(small, (x + (cell[0] - small.width) // 2, y + bar + (cell[1] - small.height) // 2))
        draw.text((x + 10, y + 6), label, fill=(201, 169, 110), font=font(15))
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--cell", default="960x540")
    ap.add_argument("--title", default="")
    ap.add_argument("--pair", nargs=2, metavar=("BEFORE", "AFTER"))
    ap.add_argument("--labels", default="Before,After")
    ap.add_argument("--crop", default="")
    ap.add_argument("images", nargs="*")
    a = ap.parse_args()
    try:
        cell = tuple(int(v) for v in a.cell.lower().split("x"))
        crop = tuple(float(v) for v in a.crop.split(",")) if a.crop else None
        if len(cell) != 2 or (crop is not None and len(crop) != 4):
            raise ValueError("wrong number of values")
    except ValueError as e:
        fail(f"bad --cell or --crop: {e}")
    if a.pair:
        labels = (a.labels.split(",") + ["Before", "After"])[:2]
        items = [(load(p, crop), lab) for p, lab in zip(a.pair, labels)]
        cols = 2
    else:
        if not a.images:
            fail("give image paths (optionally path::label), or --pair BEFORE AFTER")
        items = []
        for spec in a.images:
            path, _, label = spec.partition("::")
            items.append((load(path, crop), label or os.path.splitext(os.path.basename(path))[0]))
        cols = max(1, a.cols)
    sheet = build(items, cols, cell, a.title)
    try:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        sheet.save(a.out, quality=90)
    except OSError as e:
        fail(f"could not write {a.out}: {e}")
    print(f"sheet {a.out} {sheet.size[0]}x{sheet.size[1]} ({len(items)} images)")


if __name__ == "__main__":
    main()

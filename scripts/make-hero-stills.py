"""Welcome-stage images: one Cycles studio still per prepared car, as WebP at 1600 and 960 px wide.

The stills come from the Cycles hero batch (one PNG per car per paint). The welcome screen
(components/journey/HeroStage.tsx) loads public/hero/<carId>-<width>.webp.
usage: python3 scripts/make-hero-stills.py <stills_dir> [out_dir]
Every file operation stops with one clear message."""
import os
import sys

from PIL import Image

PICKS = {  # car id in the catalogue -> (stills folder, still name)
    'm2_g87': ('m2_cs_g87', '07_portimao_blue_metallic'),
    'm4_cs_g82': ('m4_cs_g82', '10_sao_paulo_yellow'),
    'm5_g90': ('m5_g90', '08_fire_red_vegas_red_metallic'),
    'm5_touring_g99': ('m5_touring_g99', '11_frozen_pure_grey_metallic'),
}
WIDTHS = (1600, 960)


def fail(msg):
    sys.exit(f"make-hero-stills: {msg}")


def main():
    if len(sys.argv) < 2:
        fail("usage: make-hero-stills.py <stills_dir> [out_dir]")
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'public/hero'
    try:
        os.makedirs(out, exist_ok=True)
    except OSError as e:
        fail(f"could not create {out}: {e}")
    for car, (folder, name) in PICKS.items():
        path = os.path.join(src, folder, f'{name}.png')
        try:
            with Image.open(path) as im:
                still = im.convert('RGB')
        except OSError as e:
            fail(f"could not read {path}: {e}")
        for w in WIDTHS:
            dst = os.path.join(out, f'{car}-{w}.webp')
            try:
                still.resize((w, round(w * 9 / 16)), Image.LANCZOS).save(dst, 'WEBP', quality=86, method=6)
            except OSError as e:
                fail(f"could not write {dst}: {e}")
            print(dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()

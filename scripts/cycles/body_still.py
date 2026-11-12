"""Wheel-less body still in the reference studio, for one paint. Reuses batch_stills.py so the look matches
the approved Cycles stills exactly; the only change is that the Wheels and Mechanical (brakes/calipers)
collections are hidden so the live forged wheels can be drawn on top in the browser.
usage: python3 -I body_still.py <paint_index_1based> <out_png>"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import batch_stills as bs  # noqa: E402


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: body_still.py <paint_index_1based> <out_png>")
    idx = int(sys.argv[1])
    out_png = sys.argv[2]
    paints = bs.load_paints(bs.PAINTS_JSON)
    if not 1 <= idx <= len(paints):
        sys.exit(f"paint index {idx} out of range 1..{len(paints)}")
    p = paints[idx - 1]

    try:
        bs.open_studio()
    except (RuntimeError, OSError) as e:
        sys.exit(f"could not open the studio scene: {e}")
    bpy.context.view_layer.update()
    hidden = []
    for name in ("Wheels", "Mechanical"):
        coll = bpy.data.collections.get(name)
        if coll is None:
            print(f"note: no collection {name!r} in studio")
            continue
        coll.hide_render = True
        hidden.append(name)
    print(f"hidden for render: {hidden}")

    # Same settings as the approved stills: 1600x900, 8 samples, Khronos PBR Neutral, -0.8 EV.
    bs.configure_render(8, (1600, 900), "Khronos PBR Neutral", -0.8)
    rig_mat = bpy.data.materials.get("Paint")
    if rig_mat is None:
        sys.exit("studio Paint material missing")
    rig = bs.PaintRig(rig_mat)
    rig.apply(p)
    print(f"paint {idx}: {p['name']} {p['hex']}")

    try:
        bpy.ops.render.render(write_still=False)
        bs.save_outputs(out_png, "")
    except (RuntimeError, OSError) as e:
        sys.exit(f"render or save failed for {out_png}: {e}")
    print(f"saved {out_png}")


if __name__ == "__main__":
    main()

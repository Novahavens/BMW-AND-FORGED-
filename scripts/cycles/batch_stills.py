"""Cycles hero stills: every car in every paint, in the reference studio.

Opens the reference studio .blend (the scene that rendered the M2 hero), swaps in each car (the M2 is
already there), sets each paint on the studio's flake paint shader and renders one hero still.
usage: python3 -I batch_stills.py [--cars a,b] [--paints all|N] [--samples 12] [--res 1920x1080] [--out DIR]
Every file operation stops with one clear message; a single failed render is logged and skipped."""
import argparse
import json
import os
import re
import sys
import time

import bpy
from mathutils import Vector

STUDIO_BLEND = "/home/claude/m2/out/BMW_M2_CS_G87_clean_studio.blend"
PAINTS_JSON = "/tmp/cy/paints.json"
CAR_SOURCES = {                      # car id -> source .blend ('' = the car already in the studio)
    "m2_cs_g87": "",
    "m5_g90": "/home/claude/pkg/BMW M5 G90/model/m5_g90.blend",
    "m5_touring_g99": "/home/claude/pkg/BMW M5 Touring G99/model/m5_touring_g99.blend",
    "m4_cs_g82": "/home/claude/pkg/BMW M4 CS G82/model/m4_cs_g82.blend",
}
CAR_COLLECTIONS = ("Body", "Glass", "Interior", "Lights", "Mechanical", "Wheels")
REF_FLAKE = 0.32          # viewer 'metallic' flake strength; the studio's flake nodes were tuned for it
METAL_GAIN = 1.2          # viewer metalness 0.75 -> 0.9, the value the reference render used
THIN_FILM_NM = 300.0      # pearl colour flop: thin-film thickness per unit of viewer iridescence


def fail(msg):
    sys.exit(f"batch_stills: {msg}")


def log(msg):
    print(msg, flush=True)


def load_paints(path):
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        fail(f"could not read paint table {path}: {e}")
    finish = data.get("finish", {})
    paints = []
    for p in data.get("paints", []):
        if p.get("finish") not in finish:
            fail(f"paint {p.get('name')!r} has unknown finish {p.get('finish')!r}")
        paints.append({"name": p["name"], "hex": p["hex"], **finish[p["finish"]], **p.get("o", {})})
    if not paints:
        fail(f"no paints in {path}")
    return paints


def srgb_hex_to_linear(hex_code):
    h = hex_code.lstrip("#")
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", h):
        fail(f"bad paint hex {hex_code!r}")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def open_studio():
    if not os.path.isfile(STUDIO_BLEND):
        fail(f"studio scene not found: {STUDIO_BLEND}")
    try:
        bpy.ops.wm.open_mainfile(filepath=STUDIO_BLEND)
    except (RuntimeError, OSError) as e:
        fail(f"could not open {STUDIO_BLEND}: {e}")


def car_objects():
    objs = set()
    for name in CAR_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll:
            objs.update(coll.all_objects)
    return objs


def mesh_bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    if not pts:
        fail("car has no meshes to frame")
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def swap_car(src):
    """Replace the studio's M2 with the car in src; its paint slots get the studio's flake paint."""
    if not os.path.isfile(src):
        fail(f"car file not found: {src}")
    paint = bpy.data.materials.get("Paint")
    if paint is None:
        fail("studio has no Paint material")
    paint.use_fake_user = True
    for o in list(car_objects()):
        bpy.data.objects.remove(o, do_unlink=True)
    for name in CAR_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll:
            bpy.data.collections.remove(coll)
    try:
        with bpy.data.libraries.load(src, link=False) as (data_from, data_to):
            data_to.collections = [c for c in data_from.collections if c in CAR_COLLECTIONS]
    except (OSError, RuntimeError, ValueError) as e:   # Blender raises RuntimeError / ValueError for a corrupt or non-.blend file
        fail(f"could not read car file {src}: {e}")
    swapped = 0
    for coll in data_to.collections:
        if coll is None:
            continue
        bpy.context.scene.collection.children.link(coll)
        for o in coll.all_objects:
            for slot in o.material_slots:
                if slot.material and slot.material.name.startswith("Paint") and slot.material != paint:
                    slot.material = paint
                    swapped += 1
    bpy.context.view_layer.update()   # appended children of hub empties need their world matrices evaluated before framing
    return swapped


def reframe(ref_lo, ref_hi, new_lo, new_hi):
    """Keep the hero camera's angle; scale its distance and the studio lights to the new car's size."""
    ref_c, new_c = (ref_lo + ref_hi) / 2, (new_lo + new_hi) / 2
    ref_size, new_size = ref_hi - ref_lo, new_hi - new_lo
    if min(ref_size.x, ref_size.y, ref_size.z) <= 0:
        fail("reference car has a zero-size axis; cannot scale the camera and lights from it")
    s = max(new_size.y / ref_size.y, new_size.z / ref_size.z, new_size.x / ref_size.x)
    cam = bpy.context.scene.camera
    if cam is None:
        fail("studio has no active camera")
    cam.location = new_c + (cam.location - ref_c) * s
    dof = cam.data.dof
    if dof.use_dof:
        if dof.focus_object is None or dof.focus_object.name not in bpy.data.objects:
            dof.focus_object = None
        dof.focus_distance *= s
    studio = bpy.data.collections.get("Studio")
    for o in (studio.objects if studio else []):
        if o.type != 'LIGHT':
            continue
        o.location.x = new_c.x + (o.location.x - ref_c.x) * s
        o.location.y = new_c.y + (o.location.y - ref_c.y) * s
        d = o.data
        if d.type == 'AREA' and d.shape in ('RECTANGLE', 'ELLIPSE') and d.size_y > d.size:
            d.size_y *= s
            d.energy *= s
    return s


class PaintRig:
    """The studio's Paint material: principled base, voronoi flake normal, noise-driven coat roughness."""

    def __init__(self, mat):
        nt = mat.node_tree
        self.bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if self.bsdf is None:
            fail("Paint material has no Principled BSDF")
        self.flake = next((n for n in nt.nodes if n.type == 'VECT_MATH' and n.operation == 'MULTIPLY_ADD'), None)
        self.coat = next((n for n in nt.nodes if n.type == 'MAP_RANGE'), None)
        self.flake_mul = tuple(self.flake.inputs[1].default_value) if self.flake else None
        self.flake_add = tuple(self.flake.inputs[2].default_value) if self.flake else None

    def set_input(self, name, value):
        sock = self.bsdf.inputs.get(name)
        if sock is not None and not sock.is_linked:
            sock.default_value = value

    def apply(self, p):
        self.set_input("Base Color", srgb_hex_to_linear(p["hex"]))
        self.set_input("Metallic", min(1.0, p["metalness"] * METAL_GAIN))
        self.set_input("Roughness", p["roughness"])
        self.set_input("Coat Weight", p["clearcoat"])
        irid = p.get("iridescence", 0.0)
        self.set_input("Thin Film Thickness", THIN_FILM_NM * irid)
        self.set_input("Thin Film IOR", p.get("iridescenceIOR", 1.5))
        if self.flake:
            f = p.get("flake", 0.0) / REF_FLAKE
            self.flake.inputs[1].default_value = tuple(v * f for v in self.flake_mul)
            self.flake.inputs[2].default_value = tuple(v * f for v in self.flake_add)
        if self.coat:
            cr = p["clearcoatRoughness"]
            self.coat.inputs["To Min"].default_value = cr * 0.5
            self.coat.inputs["To Max"].default_value = cr * 4.0 / 3.0


def configure_render(samples, res, view, exposure):
    sc = bpy.context.scene
    try:
        sc.view_settings.view_transform = view
        sc.view_settings.look = 'None'
    except TypeError as e:
        fail(f"view transform {view!r} not available: {e}")
    sc.view_settings.exposure = exposure
    r, cy = sc.render, sc.cycles
    r.engine = 'CYCLES'
    try:
        cy.device = 'CPU'
    except (TypeError, AttributeError) as e:
        log(f"device setting not applied: {e}")
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.03
    cy.use_denoising = True
    try:
        cy.denoiser = 'OPENIMAGEDENOISE'
    except TypeError as e:
        log(f"denoiser setting not applied: {e}")
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 8, 2, 4
    cy.transmission_bounces, cy.transparent_max_bounces = 8, 8
    cy.caustics_reflective = cy.caustics_refractive = False
    r.use_persistent_data = True
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'
    r.image_settings.compression = 15


def save_outputs(png_path, exr_path):
    """Write the render result as a graded PNG and, if asked, a linear half-float EXR for later re-grading."""
    img = bpy.data.images.get("Render Result")
    if img is None:
        raise RuntimeError("no Render Result image after render")
    sc = bpy.context.scene
    st = sc.render.image_settings
    if exr_path:
        st.file_format = 'OPEN_EXR'
        st.color_mode = 'RGB'
        st.color_depth = '16'
        st.exr_codec = 'ZIP'
        try:
            img.save_render(exr_path, scene=sc)
        except (RuntimeError, OSError) as e:
            raise RuntimeError(f"could not write {exr_path}: {e}") from e
    st.file_format = 'PNG'
    st.color_mode = 'RGB'
    st.color_depth = '8'
    st.compression = 15
    try:
        img.save_render(png_path, scene=sc)
    except (RuntimeError, OSError) as e:
        raise RuntimeError(f"could not write {png_path}: {e}") from e
    if not os.path.isfile(png_path) or os.path.getsize(png_path) == 0:   # Blender can return without raising on an unwritable path
        raise RuntimeError(f"no file was written at {png_path}")


def render_car(car_id, src, paints, args, ref_bounds):
    try:
        open_studio()
    except (RuntimeError, OSError) as e:
        fail(f"could not open the studio scene: {e}")
    rig_mat = bpy.data.materials.get("Paint")
    if rig_mat is None or rig_mat.node_tree is None:
        fail("studio Paint material missing")
    if src:
        swapped = swap_car(src)
        s = reframe(*ref_bounds, *mesh_bounds(car_objects()))
        log(f"CAR {car_id}: paint slots swapped={swapped} frame scale={s:.3f}")
    else:
        log(f"CAR {car_id}: reference car")
    configure_render(args.samples, args.res, args.view, args.exposure)
    rig = PaintRig(rig_mat)
    out_dir = os.path.join(args.out, car_id)
    exr_dir = os.path.join(args.exr, car_id) if args.exr else ""
    for d in (out_dir, exr_dir):
        if not d:
            continue
        try:
            os.makedirs(d, exist_ok=True)
        except OSError as e:
            fail(f"could not create {d}: {e}")
    done = 0
    for i, p in enumerate(paints, 1):
        if args.only and i not in args.only:
            continue
        path = os.path.join(out_dir, f"{i:02d}_{slugify(p['name'])}.png")
        rig.apply(p)
        exr_path = os.path.join(exr_dir, os.path.basename(path)[:-4] + ".exr") if exr_dir else ""
        t0 = time.time()
        try:
            bpy.ops.render.render(write_still=False)
            save_outputs(path, exr_path)
        except (RuntimeError, OSError) as e:
            log(f"FAIL {car_id} {p['name']}: {e}")
            continue
        if not os.path.isfile(path) or (exr_path and not os.path.isfile(exr_path)):
            log(f"FAIL {car_id} {p['name']}: output missing ({path} / {exr_path})")
            continue
        done += 1
        log(f"DONE {car_id} {i:02d} {p['name']} {time.time() - t0:.1f}s")
    return done


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cars", default=",".join(CAR_SOURCES))
    ap.add_argument("--paints", default="all")
    ap.add_argument("--samples", type=int, default=12)
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--out", default="/mnt/user-data/outputs/cycles_stills")
    ap.add_argument("--view", default="Khronos PBR Neutral", help="colour view transform; the web viewer uses the same Neutral curve")
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--only", default="", help="comma list of 1-based paint numbers, for tests")
    ap.add_argument("--exr", default="/tmp/cy/exr", help="folder for linear EXRs ('' to skip)")
    args = ap.parse_args()
    m = re.fullmatch(r"(\d+)x(\d+)", args.res)
    if not m:
        fail(f"bad --res {args.res!r}, expected e.g. 1920x1080")
    args.res = (int(m.group(1)), int(m.group(2)))
    try:
        args.only = {int(x) for x in args.only.split(",") if x.strip()}
    except ValueError:
        fail(f"bad --only {args.only!r}, expected e.g. 2,6,10")
    return args


def main():
    args = parse_args()
    paints = load_paints(PAINTS_JSON)
    if args.paints != "all":
        paints = paints[:int(args.paints)]
    cars = [c.strip() for c in args.cars.split(",") if c.strip()]
    unknown = [c for c in cars if c not in CAR_SOURCES]
    if unknown:
        fail(f"unknown car id(s): {unknown}; known: {list(CAR_SOURCES)}")
    try:
        open_studio()
    except (RuntimeError, OSError) as e:
        fail(f"could not open the studio scene: {e}")
    bpy.context.view_layer.update()
    ref_bounds = mesh_bounds(car_objects())
    t0, total = time.time(), 0
    for car_id in cars:
        total += render_car(car_id, CAR_SOURCES[car_id], paints, args, ref_bounds)
    log(f"ALL_DONE renders={total} of {len(cars) * len(paints)} minutes={(time.time() - t0) / 60:.1f}")


if __name__ == "__main__":
    main()

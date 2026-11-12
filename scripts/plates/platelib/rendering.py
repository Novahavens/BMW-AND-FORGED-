"""Cycles settings, the render device and saving a frame.

Quality presets, light paths and the colour grade come from plates.config.json. PLATES_DEVICE=GPU switches
Cycles and the denoiser to the GPU (OptiX first, then CUDA); anything else renders on the CPU.
"""
import os

import bpy

from .core import DEVICE, fail, log


def enable_gpu():
    """Turn on every GPU of the first backend that has one. Returns (backend, device names) or (None, [])."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        return None, []
    order = [k.strip().upper() for k in os.environ.get("PLATES_GPU_BACKENDS", "OPTIX,CUDA").split(",") if k.strip()]
    for kind in order:
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        try:
            prefs.refresh_devices()
        except (AttributeError, RuntimeError):
            prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == kind]
        if devices:
            for d in prefs.devices:
                d.use = d.type == kind
            return kind, [d.name for d in devices]
    return None, []


def configure(cfg, preset="preview", scale=None, samples=None):
    """Apply the config's colour grade, light paths and one quality preset to the scene."""
    q = cfg["quality"].get(preset)
    if q is None:
        fail(f"unknown quality preset {preset!r}; known: {', '.join(cfg['quality'])}")
    sc = bpy.context.scene
    col = cfg["colour"]
    try:
        sc.view_settings.view_transform = col["view_transform"]
        sc.view_settings.look = col.get("look", "None")
    except TypeError as e:
        fail(f"view transform {col['view_transform']!r} / look {col.get('look')!r} not available: {e}")
    sc.view_settings.exposure = float(col.get("exposure", 0.0))
    r, cy = sc.render, sc.cycles
    r.engine = 'CYCLES'
    backend, names = (enable_gpu() if DEVICE == "GPU" else (None, []))
    try:
        cy.device = 'GPU' if backend else 'CPU'
    except TypeError as e:
        log(f"device setting not applied: {e}")
    if DEVICE == "GPU" and not backend:
        log("WARNING: PLATES_DEVICE=GPU but no GPU backend was found; rendering on the CPU")
    cy.samples = int(samples or q["samples"])
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = float(q["noise_threshold"])
    cy.adaptive_min_samples = int(q.get("min_samples", 0))
    cy.use_denoising = bool(q.get("denoise", True))
    for attr, value in (("denoiser", 'OPENIMAGEDENOISE'), ("denoising_input_passes", 'RGB_ALBEDO_NORMAL'),
                        ("denoising_prefilter", 'ACCURATE'), ("denoising_quality", 'HIGH'),
                        ("denoising_use_gpu", bool(backend))):
        try:
            setattr(cy, attr, value)
        except (TypeError, AttributeError) as e:
            log(f"{attr} not applied: {e}")
    lp = cfg.get("light_paths", {})
    cy.max_bounces = int(lp.get("max", 12))
    cy.diffuse_bounces = int(lp.get("diffuse", 3))
    cy.glossy_bounces = int(lp.get("glossy", 6))
    cy.transmission_bounces = int(lp.get("transmission", 12))
    cy.transparent_max_bounces = int(lp.get("transparent", 16))
    cy.sample_clamp_indirect = float(lp.get("clamp_indirect", 10.0))
    cy.caustics_reflective = cy.caustics_refractive = bool(lp.get("caustics", False))
    r.use_persistent_data = True
    r.resolution_x, r.resolution_y = int(cfg["frame"]["width"]), int(cfg["frame"]["height"])
    r.resolution_percentage = int(round(100 * float(scale if scale is not None else q.get("scale", 1.0))))
    r.film_transparent = False
    r.use_border = False
    r.use_crop_to_border = False
    return {"backend": backend or "CPU", "devices": names, "samples": cy.samples, "threshold": cy.adaptive_threshold,
            "size": (r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100)}


def set_region(region):
    """Render only part of the frame. region = (left, top, right, bottom) as fractions, origin top-left."""
    r = bpy.context.scene.render
    if not region:
        r.use_border = r.use_crop_to_border = False
        return
    left, top, right, bottom = (max(0.0, min(1.0, float(v))) for v in region)
    if right <= left or bottom <= top:
        fail(f"bad region {region}: need left < right and top < bottom (fractions of the frame)")
    r.border_min_x, r.border_max_x = left, right
    r.border_min_y, r.border_max_y = 1.0 - bottom, 1.0 - top
    r.use_border = True
    r.use_crop_to_border = True


def render_frame(png_path, exr_path="", rgba=False):
    """Render the active camera and write an 8-bit PNG (and a linear EXR master when asked)."""
    sc = bpy.context.scene
    for path in (png_path, exr_path):
        if path:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            except OSError as e:
                raise RuntimeError(f"could not create the folder for {path}: {e}") from e
    bpy.ops.render.render(write_still=False)
    img = bpy.data.images.get("Render Result")
    if img is None:
        raise RuntimeError("no Render Result image after render")
    st = sc.render.image_settings
    if exr_path:
        st.file_format = 'OPEN_EXR'
        st.color_mode = 'RGBA' if rgba else 'RGB'
        st.color_depth = '16'
        st.exr_codec = 'ZIP'
        img.save_render(exr_path, scene=sc)
    st.file_format = 'PNG'
    st.color_mode = 'RGBA' if rgba else 'RGB'
    st.color_depth = '8'
    st.compression = 15
    img.save_render(png_path, scene=sc)
    for path in (png_path, exr_path):
        if not path:
            continue
        try:
            written = os.path.getsize(path) > 0
        except OSError:
            written = False
        if not written:   # Blender can return without raising
            raise RuntimeError(f"no file was written at {path}")
    return png_path

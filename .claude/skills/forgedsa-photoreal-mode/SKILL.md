---
name: forgedsa-photoreal-mode
description: Build on the FORGEDSA path-traced photoreal mode (three-gpu-pathtracer), which refines a photoreal still whenever the camera rests. Covers the five fixes it needed (quantized geometry, BVH worker, Vite pre-bundling, denoise, studio floor), how to test it, performance expectations, and how it fits with better car models. Use when working on photorealism, the summary/PDF still quality, or the claude/photoreal-proof branch.
---

# Photoreal (path-traced) mode

**Status:** proof of concept on branch `claude/photoreal-proof`, local and unpushed until the owner
approves. It is **not** in the live site or the work branch. Check `git branch` first; if the
branch is gone, it was rejected or lost with the container.

## Design

- `services/photorealRenderer.ts` wraps `WebGLPathTracer`.
  - While the camera moves (or the car animates, wheels spin, auto-rotate or shadow frames run),
    the normal rasterizer draws.
  - About 350 ms after the camera rests, `frame()` path-traces and returns true, so the engine skips
    its render. It stops at `maxSamples` (400).
- Engine hooks in `CarConfiguratorEngine.ts`:
  - `static PHOTOREAL` (or `?photoreal=1`) turns the mode on.
  - `sceneVersion` is bumped by `markShadowDirty`, `applyPaintColor`, `applyWheelFinish` and
    `applyCaliperColor`. A new version forces a scene rebuild.
  - `envEquirect` keeps the HDRI equirect, because the path tracer can't use the PMREM cube.
  - The module loads through dynamic `import('./photorealRenderer')`, so it's its own ~210 kB chunk,
    not in the main bundle.
- Raster-only objects (the baked contact-shadow group) are hidden while tracing. A dark satin floor
  with a radial `alphaMap` fade catches real shadows and reflections without a horizon line.

## The five fixes it needed (don't regress)

1. **Quantized geometry → black frame.** The car GLBs use meshopt quantization (interleaved,
   normalized Int16). The tracer reads raw arrays, so `dequantize()` expands every attribute to
   Float32 once per geometry before `setScene`.
2. **`setSceneAsync` needs a BVH worker.** Call `pt.setBVHWorker(new GenerateMeshBVHWorker())` from
   `three-mesh-bvh/worker`, and fall back to synchronous `setScene` if that fails.
3. **Vite:** `optimizeDeps.exclude: ['three-mesh-bvh/worker']` only. Excluding the whole libraries
   caused **two copies of three.js** (warning "Multiple instances of Three.js").
4. **Denoise:** the library's `DenoiseMaterial` in `renderToCanvasCallback` once the fade completes,
   with sigma decreasing as samples grow (threshold 0.2, kSigma 1.2).
5. **Floor brightness and framing:** still being tuned. The floor reflects the HDRI strongly, and
   `applyViewInset` view offsets may not carry over, so the framing can differ from the raster view.

## Testing

- Use `forgedsa-render-verification` with `.scratch/engine.html?car=6&view=frontThreeQuarter&photoreal=1`.
- Poll `window.e.photoreal.samples`.
- **SwiftShader performance:** roughly 130 s to the first sample and about 1 sample per 5 s at
  960×600, so 200 samples take about 18 minutes and still show grain.
- **Real GPUs** are orders of magnitude faster. Judge quality on a device via a Vercel preview, not
  in the sandbox.

## Where it fits

Path tracing fixes light, shadow and reflection, not geometry. Photorealism needs both this mode
**and** premium, commercially licensed car models (`forgedsa-add-car-model`).
- Pre-rendered layered imagery is the most photoreal, but loses free rotation and admin
  flexibility.
- Cloud pixel streaming costs per visitor.

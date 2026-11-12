---
name: forgedsa-resume
description: Pick up the FORGEDSA photoreal work exactly where it was left - the four prepared cars drawn live from GLB in the stage look, the six stock-sheet GLB rims on the car and in the rim page's wheel studio, and the legacy Blender routes (pre-rendered body frames, which only the M5 G90 still has, the rim spin scripts and their finishes). Reads docs/CHECKPOINT.md, restores the tooling in a fresh container (bpy, rembg, numpy pin, dev server), and runs the next queued item with the exact commands. Use when someone says "continue", "carry on with the rims/cars", "where were we", "pick up the checkpoint", or starts a new session on this work.
---

# Resume the photoreal work

**The source of truth is `docs/CHECKPOINT.md`.** Read it first, then do the top unchecked item of its
queue. Update it (tick, add what you learned) before you stop, and commit it with the work.

## 1. Restore the tools (a fresh container has none of them)
```bash
pip install -q bpy "rembg[cpu]" pillow && pip install -q "numpy<2.0,>=1.26"   # bpy needs numpy 1.x; rembg still works
python3 -c "import bpy, rembg, numpy; print(numpy.__version__)"                  # expect 1.26.x
bun install
bunx vite --host 127.0.0.1 --port 5173 > /tmp/vite.log 2>&1 &                   # trace-mask, oncar, export need it
```
Rim photos come from Supabase storage; the harnesses fetch them with curl (pass a cache dir to reuse).

## 2. The rules (decided with the owner; don't re-litigate)
- **Live cars = the owner's prepared GLBs drawn live** (M2 CS `m2_g87`, M4 CS `m4_cs_g82`, M5 `m5_g90`, M5 Touring
  `m5_touring_g99`; `scripts/ingest-car.mjs`, `docs/ADD_PREPARED_CAR.md`) in the stage look (`services/viewerStudio.ts`,
  `engine.setLook('stage')`, "FORGED" plates; the owner asked for the scenes to look like the Cycles hero stills). The car is
  chosen on the welcome carousel and Enter opens `/configure` on it; there is no showroom. The controls are the stepped
  drawer (`StepDrawer` in `components/journey/Configurator.tsx`), which the owner chose over the viewer's glass panel.
- **Blender body frames: only the M5 G90 has them** (`public/renders/m5_g90/`, six views, listed in
  `public/renders/manifest.json`; made by `scripts/prerender/` as `<view>/{gloss,matte}_{w,b}.webp` plus `flake_w.webp`,
  recoloured per paint by `RenderedCarView`). The configurator shows them for the M5 in those six fixed views while the
  turntable is off; the other three live cars are always drawn live. The eight hidden cars (`active: false`) have no body
  in the repo: commit `b62b126` (2026-11-11) removed their Sketchfab GLBs and the frames six of them had. Their catalogue
  rows remain, but a hidden car needs a new model before it can be shown again.
- **Wheels on the car: a GLB rim wins whenever `modelUrl` is set** (`applyWheelDesign` picks mode `model`; `rearModelUrl`
  for the staggered FSA001). All six stocked wheels (`forged_fsa001`, `forged_fsa002`, `forged_fsa_03`, `forged_fsa004`,
  `sixnine_ff1`, `sixnine_ff3`) are GLBs (`scripts/ingest-rim.mjs`). The photo/bar-face 2D route (`imageUrl`,
  `services/rimFaces.ts`) remains for wheels without a model: today the hidden legacy wheels. Never strip a stock wheel's
  `modelUrl` to "fix" it back to a photo face.
- **Rim page = the wheel studio** ported from the FORGED website (`shared/wheel-viewer/WheelStudio.tsx`, `WheelStage.tsx`,
  `shared/wheel-viewer/wheelStudioParts.ts`). It loads the same rim files the car uses (`public/models/rims/`) and draws finishes with
  `services/wheelFinish.ts`, so a finish is the same on the rim page and on the car; a wheel without a `modelUrl` shows its
  photo. The pre-rendered 360° spin is no longer part of the app: `RimSpinView.tsx` and `public/renders/rims/manifest.json`
  are removed, and no spin frames existed for the six stocked wheels. Do not render spins for the rim page.
- **Legacy spin scripts and their finishes** (`scripts/rim3d/turntable.py`, `spin-manifest.py`, `finishes.json` +
  `materials.py`: Liquid Metal (chrome), Satin Bronze, Satin Gold (#c4aa7f, measured from the client photo), Gloss Black
  (very-high-contrast tone curve), Silver = **brushed aluminium**) still exist, but nothing in the app uses their output.
  The finishes customers pick are the stock sheet's (`forgedsa-rim-finishes`, `docs/WHEEL_INVENTORY.md`).
- Free only: CPU rendering here, no paid APIs, no GPU rental. Ask before buying any model.
- **The wheel catalogue is the owner's stock sheet** (`docs/WHEEL_INVENTORY.md`): real names FSA001-004/FF-1/FF-3, sizes,
  finishes and ZAR prices stored as USD ÷ 18.2. Hide a wheel with `active: false`, never delete it. A spin is not a
  gate for going live and is no longer shown anywhere; stocked wheels are live as GLBs.

## 3. Common jobs
| Job | Commands |
|---|---|
| New wheel, clean front-on cut-out | `scripts/rim3d/convert.sh <cutout.png> <wheelId>` then judge with `turntable.py … --frames 1 --only silver` (a Blender still for judging the shape, not for the app) |
| New wheel, angled photo | `rembg` cut-out → `scripts/rim3d/rectify.py` (fit the lip) → if spokes are straight bars: polar grid, write `docs/rim-template/<id>-spec.json`, `make-bar-face.py`, `overlay.py`, `build_rim.py <spec> full.glb` |
| Check a wheel on the rim page | open `/rims/<wheelId>` on the dev server and screenshot it: the wheel studio draws the wheel's rim GLB. Nothing is rendered ahead (the old spin job, `turntable.py … && spin-manifest.py`, is legacy: the app does not read its output) |
| New stock rim (GLB) | `node scripts/ingest-rim.mjs <rim.glb> --wheel <id> --check` (staggered: `--rear <rear.glb>`); sheet in `docs/ingest/rims/<id>.jpg` |
| Check a wheel on a live car | `node scripts/render/shoot.cjs <out> shots.json` with `"wheel":"<wheelId>"`, `"car":<1|5|7|8>` and `"q":"&look=stage"` (as customers see it; about 50 s a shot on SwiftShader, the container has no GPU). `oncar.cjs` is for a car with Blender body frames (today only the M5 G90, `"car": 7`) |
| New prepared car | `node scripts/ingest-car.mjs <car.zip|car.glb> --car <id> --check` (live GLB; `--render` for Blender frames) |
| Blender body frames for a car | `scripts/prerender/render-all.sh <carIndex>` (~15 min/car). The car's GLB has to be in `public/models/`, so this no longer works for the hidden cars |

## 4. Pitfalls already paid for
- Background jobs are killed at 2 h: one wheel per job, or rely on turntable's resume.
- `pkill -f <pattern>` matches your own shell; kill by PID from `ps`.
- `rembg` keeps the barrel seen through the windows as solid: fine for silver-on-wood photos after rectify,
  useless for black wheels (use the bar route). Rectify must never mirror (directional spokes).
- `processRimPhoto` can guess the wrong symmetry (FSA-06 traced 12-fold): count spokes in the cut-out first.
- Traced faces stay flat (`dish` 0): bending a curve-filled face kinks it. No hub pad on traced faces (coplanar = crumple).
- Spin frames are not committed any more: the app has no spin viewer (the old rule was to commit them only when a wheel was
  complete).
- `scripts/render/e2e.cjs` still walks the showroom and has not been updated; `car-switch.cjs` needs `BASE` to end in
  `?panel=viewer`.

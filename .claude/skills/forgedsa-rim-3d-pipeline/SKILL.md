---
name: forgedsa-rim-3d-pipeline
description: Turn a FORGEDSA rim (CAD or product photo) into a complete, high-detail 3D rim GLB modelled on the "High poly Rims" template - flat bevelled face recessed behind a deep barrel and lip, polished metal. Covers the CAD-or-photo decision, the 11-step photo route, what the engine requires of a rim file, the measured template cross-section, the live triangle budget, QA and credits. Use when asked to improve how rims look in 3D, to convert a wheel photo to a real 3D rim, or to judge a new rim against the template.
---

# Rim → 3D rim (template: "High poly Rims")

Full process: `docs/RIM_3D_PROCESS.md`. Template numbers and the CC-BY credit: `docs/rim-template/PROFILE.md`.

## Rules the engine imposes (`CarConfiguratorEngine.mountRimModel`)
- `wheel.modelUrl` always beats the photo. The file must be a **complete rim** (face + barrel + lip + centre) with **no tyre**: the engine hides its own barrel, lip and centre.
- Thinnest axis = axle; widest of Y/Z is scaled to the 20" base diameter. Units don't matter, proportions do.
- One finish material is applied to every mesh, so all four finishes keep working. Don't bake photo colour into it.
- Spokes facing inward → **Flip 3D rim** (`model_flip`).

## Do this
1. CAD available? Admin → Rim 3D model, or `bun run rim:convert`. Stop here.
2. Photo only: front-on rim-only photo → existing cut-out (`loadRimFace`, `RIM_FACE_MASKS`) → `outlines.cjs` / `wheel-qa.cjs`.
3. Build face (one sector repeated by symmetry) + barrel/lip/centre to the template: face plate 7–9 % of R thick; face front 24 % of R behind the lip; width 0.51 × diameter.
4. Export GLB, decimate to about 40k triangles (confirm on a phone), meshopt.
5. Upload, QA with `visual-qa` (3 cars × 2 sizes × 4 finishes + M4 close-up against the template), fix lighting to match the Blender studio.

## Limits (say them out loud)
A photo has no depth: complex or concave designs need CAD. The template is another maker's design: benchmark and proportions only, credit it if its geometry is ever shown.

## One command (any design, no measuring)
`scripts/rim3d/convert.sh <photo.png> <wheelId>` (dev server running): trace with the engine's cleaning → build → pack → preview, ~20 s. Then add the wheel with `model_url /models/rims/<wheelId>.glb`.

## Rim detail page = the wheel studio (same GLB as the car)
`/rims/<id>` draws the wheel's `modelUrl` file live in the wheel studio ported from the FORGED website (`shared/wheel-viewer/WheelStudio.tsx`, lazy chunk; `components/WheelStage.tsx` picks the studio for a wheel with a `modelUrl` and the wheel's photo for one without; `shared/wheel-viewer/wheelStudioParts.ts`). It loads the same files as the car (`public/models/rims/`, `rearModelUrl` behind a Front / Rear switch) and draws finishes with `services/wheelFinish.ts`, so a finish is the same on the rim page and on the car. Views Face / 3/4 / Side / Back / Top; Show toggles Orbit, Spin wheel, Exploded, Wireframe, Bolts, Cap, and Brake check when the model has brake meshes. Parts are found by node name (`classifyStudioPart`: `Rim_Barrel`, `Rim_Face_Spokes`, `Hardware_Bolts`, `Center_Cap`, `Brake_Rotor`, `Brake_Caliper`, or the short names; anything else counts as face), so after any new rim file open its rim page as well as the car.

Legacy: the pre-rendered spin (`turntable.py full.glb public/renders/rims/<id>`, `convert.sh … --spin`, `spin-manifest.py`) is no longer part of the app. `components/RimSpinView.tsx` and `public/renders/rims/manifest.json` are removed; the scripts still exist but nothing in the app uses their output.

## Matching the car (spec keys of build_rim.py, used for FSA-06/08/12/13)
`{"face_front": 0.408, "face_thick": 0.13, "dish": 0.137, "dish_curve": "parabola", "subdivide": 0.03, "bolts": 0, "bore": 0, "nuts": true, "cap": {"text": "FSA"}, "lip": "mono"|"two"|"three"}`
gives the spin (legacy, see above) the engine's own hub kit: dished face, spoke ends 10 mm behind the lip, five lug nuts, black cap with gold ring and
lettering, polished bolted lip (30 / 40 bolts) for two / three-piece. `turntable.py` keeps those parts in their own material in every
finish (by object name: cap, capring, captext, lugnut, lip, shelf, bolt) and takes `--threads N` for a shared box. Cap lettering on the
car is `RIM_CAP_TEXT` in `services/rimFaces.ts`. Render with `--resmooth --weighted`.

## Scripts (scripts/rim3d/)
- `trace-mask.cjs <photo> <out.json> [--mask]`: photo → cleaned outlines (processRimPhoto + traceMaskShapes).
- `build_rim.py <spec.json|-> <out.glb> [--shapes traced.json]`: outlines or bar spec → complete rim (face, barrel, lip, hub, cap, optional spoke channel), bpy.
- `pack.mjs in.glb out.glb [maxTris]`: weld, simplify, quantize, meshopt for the live site.
- `preview.py out.png a.glb [b.glb]`: studio close-up side by side (auto-orients the face).
- `scripts/render/engine.html?rimModel=/models/rims/x.glb` puts any GLB on the chosen wheel for screenshots.
Worked example: FSA-12 (`docs/rim-template/fsa_12-spec.json`), measured from an angled photo by
rectifying the spoke-tip ellipse. Full commands in `docs/RIM_3D_PROCESS.md`. Lighting match: `public/env/forgedsa_studio.hdr` lights the live wheels in rendered-body mode (`RENDER_ENV_INTENSITY` 0.33).

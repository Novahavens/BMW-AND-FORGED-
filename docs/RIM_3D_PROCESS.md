# Rim photo → 3D rim: the process

Goal: every FORGEDSA wheel ends up as a **complete 3D rim file (GLB)** that looks like the
template in [`rim-template/PROFILE.md`](rim-template/PROFILE.md): real spoke depth, bevelled edges, a
recessed face behind a proper lip, a deep barrel, a polished metal surface.

## How the engine uses a rim file (so the file must match)

`wheel.modelUrl` set → the engine loads the GLB and **always prefers it over the photo**
(`applyWheelDesign` / `loadRimModel` / `mountRimModel`, `services/CarConfiguratorEngine.ts`).

- It hides its own barrel, lip and centre: **the file must be a complete rim** (face + barrel + lip + centre), and **no tyre**.
- The thinnest axis becomes the axle. The widest of Y/Z is scaled to the 20" base diameter, so **the file's units don't matter**, but its proportions do. The outer face goes to the tyre's outer face.
- All meshes get **one finish material** (colour, metalness, roughness, clearcoat from `services/wheelFinish.ts`), so every finish still works. A mesh that has its own map or normal map keeps it.
- Wrong way round → tick **Flip 3D rim** (`wheels.model_flip`).

## Step 0: do we have the manufacturer's CAD?

| We have | Do this | Quality |
|---|---|---|
| STEP / IGES / STL / OBJ of the rim (no tyre) | Admin → Wheels → the wheel → **Rim 3D model** (or `bun run rim:convert wheel.step` over ~50 MB). Then jump to step 8. | Best: exact geometry |
| Only product photos | Steps 1–8 below | Good for simple and medium spoke designs; see the limits |

Ask every manufacturer for **CAD of the rim only**. It always beats a photo route.

## The photo route

1. **Intake.** Front-on photo, rim only (no tyre), plain background, as large as possible, sharp edges. Rules: `forgedsa-rim-from-photo`.
2. **Clean cut-out + measurements.** Use the existing ingest and mask clean-up (the engine's `loadRimFace` with `RIM_FACE_MASKS` / `RIM_FACE_OPTIONS`). Check the outline with `scripts/render/outlines.cjs` and `scripts/render/wheel-qa.cjs`. Record: spoke count, symmetry, thinnest spoke, window count. **Do not re-trace in Blender**; reuse this mask.
3. **Face from the outline.** *(New script to build: `scripts/rim3d/build_rim.py`, Blender `bpy`, free.)* Take the one clean spoke sector, repeat it by the measured symmetry so all spokes are identical, turn the outline into a solid plate, bevel the edges.
4. **Depth from the template.** Plate thickness 7–9 % of the outer radius; spoke edges bevelled; face front **recessed 24 % of R behind the lip front**. Numbers come from the template table. If the photo is clearly a concave or stepped design, flag it: this step is a guess.
5. **Barrel, lip, centre.** Revolve the template's barrel/lip cross-section (barrel width 0.51 × diameter, lip as measured), scaled to the wheel's diameter. Add the centre recess, bolt holes and valve hole. Join to the face as one watertight mesh.
6. **Surface.** One material. No baked colour from the photo (it must take all four finishes). Smooth normals and weighted normals so reflections run clean (the same fix that cured the car bodies).
7. **Export.** Z-up to GLB, axle on any single axis (the engine finds it), rim only. Decimate to the **live budget (target about 40,000 triangles; to be confirmed on a real phone)** and compress with meshopt (`gltf-transform`). Keep the full-detail copy for Blender renders only.
8. **Publish.** Upload as **Rim 3D model** in `/admin` (or set `wheels.model_url`). If the spokes face inward, tick **Flip 3D rim**.
9. **QA** (`visual-qa`): render each new rim on 3 cars × 2 sizes × 4 finishes with the `scripts/render/` harnesses, plus the M4 close-up next to the template at the same camera. Reject on: visible stepping or facets, fat or thin spokes against the photo (overlay the outline), spokes facing inward, a tyre or barrel showing through, a frame-rate drop on a phone.
10. **Lighting match.** The body is path-traced in Blender; the wheel is lit live. Tune the live wheel's environment and reflections to the Blender studio (`forgedsa-paint-and-lighting`), so they read as one photo. This is the biggest single step toward "photoreal".
11. **Credits.** If any asset derived from a third-party model is shown, add its credit (`rim-template/PROFILE.md` has the text).

## Honest limits

- A single front photo contains **no depth**. Depth, the lip and the barrel are inferred from the template, so they are right for flat, simple and medium designs, and wrong for layered or deeply concave ones. For those, get CAD.
- The photo route reproduces the spoke **shape**, not a manufacturer's finish detail (machining marks, engraving, logos). Add a normal/roughness map only where it matters.
- The template is a sibling design, not our wheel: use it for proportions and finish, never as the product.

## The commands (built and proven on FSA-12, the polished twin-Y wheel)

```bash
# 1. Measure the photo. If it is angled, fit the spoke-tip ellipse and rectify it to a circle first
#    (numpy; see the ellipse/rectify steps recorded in docs/rim-template/fsa_12-spec.json notes).
# 2. Describe one sector as straight bars and draw the symmetric face mask (+ overlay to check):
python3 scripts/render/make-bar-face.py docs/rim-template/<id>-spec.json <wheelId> rectified.png overlay.png
#    Add the wheel to RIM_FACE_MASKS in services/rimFaces.ts, then:
node scripts/render/wheel-qa.cjs <rimCacheDir> <outDir> <wheelId>          # must PASS
# 3. Build the complete 3D rim from the same spec (face + barrel + lip + hub, template proportions):
python3 scripts/rim3d/build_rim.py docs/rim-template/<id>-spec.json full.glb --segments 512
# 4. Pack for the live site (weld, simplify to budget, quantize, meshopt):
node scripts/rim3d/pack.mjs full.glb public/models/rims/<wheelId>.glb 40000
# 5. Look at it: next to the template, and on the cars in every finish
python3 scripts/rim3d/preview.py out.png full.glb <template.glb>
node scripts/render/shoot.cjs out shots.json rimCache    # shots with "q": "&rimModel=/models/rims/<wheelId>.glb"
```

Spec keys beyond make-bar-face's: `face_front`, `face_thick`, `dish`, `bolts`, `pcd`, `bolt_r`, `bore`
(fractions of the lip's outer radius; defaults in `build_rim.py` follow the template profile).

FSA-12 result: 18.8k triangles, 115 kB, mask QA PASS (1 piece, 10 windows, symmetry 0.99, thinnest spoke 16.5 mm), all four
finishes on the car (proofs: `rim-template/fsa_12-vs-template.jpg`, `rim-template/fsa_12-on-car.jpg`). Known gaps: the milled channel along each spoke and the lip engraving are not
modelled; the live wheel's lighting still differs from the Blender body (step 10).

## Still to do

1. Lighting match (step 10).
2. A free-orbit wheel close-up (the pre-rendered view is fixed-camera).
3. Optional spoke surface detail (channel, chamfer profile) as spec options.

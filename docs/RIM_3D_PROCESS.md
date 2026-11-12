# Rim photo → 3D rim: the process

> **Before picking a route, read [`RIM_PHOTO_TO_3D_SPEC.md`](RIM_PHOTO_TO_3D_SPEC.md)** — a Nov 2026
> researched comparison of this route against manufacturer CAD, multi-image AI reconstruction and
> photogrammetry, with a decision table and a recommended pilot (FSA-07).

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

## The commands

### Route 1 (default): photo in, rim out, no measuring

```bash
bunx vite --host 127.0.0.1 --port 5173                 # dev server, in another shell
scripts/rim3d/convert.sh <photo.png> <wheelId>          # ~20 s per wheel
```
`convert.sh` runs the engine's own cut-out cleaning (`processRimPhoto`: symmetry folding, arm
tracing, edge straightening) and outline tracer on the photo (`scripts/rim3d/trace-mask.cjs`),
builds the complete rim from the outlines to the template profile (`build_rim.py --shapes`), packs
it (`pack.mjs`) to `public/models/rims/<wheelId>.glb`, and writes a studio preview to
`.prerender/rims/<wheelId>/preview.png`. Any spoke design. Photo rules as for the photo wheels
(front-on, rim only, cut out or plain background). Pass a spec JSON as the third argument to
override hub, dish, bolts, bevel, etc.; `--mask` if the input is a prepared face mask.

### Route 2 (fallback): angled photo, straight-bar design

Measure the bars (rectify the spoke-tip ellipse first), write a spec, then:
```bash
python3 scripts/render/make-bar-face.py docs/rim-template/<id>-spec.json <wheelId> rectified.png overlay.png
python3 scripts/rim3d/build_rim.py docs/rim-template/<id>-spec.json full.glb --segments 512
node scripts/rim3d/pack.mjs full.glb public/models/rims/<wheelId>.glb 40000
```
Spec keys beyond make-bar-face's: `face_front`, `face_thick`, `dish`, `bolts`, `pcd`, `bolt_r`,
`bore`, `bevel`, `channel` (milled groove along each bar, fraction of its width), `channel_depth`.
FSA-12 was made this way (`docs/rim-template/fsa_12-spec.json`): 17.3k triangles, 108 kB, mask QA
PASS, proofs in `rim-template/fsa_12-vs-template.jpg` and `rim-template/fsa_12-on-car.jpg`.

### Check it, then publish
```bash
python3 scripts/rim3d/preview.py out.png full.glb <template.glb>        # beside the template
node scripts/render/shoot.cjs out shots.json rimCache    # "q": "&rimModel=/models/rims/<wheelId>.glb"
```
Admin → Wheels → Rim 3D model (or `wheels.model_url`), tick **Flip 3D rim** if the face points in.

### Finishes in Blender (done)
`scripts/rim3d/materials.py` builds each finish the way the coating is layered, from the numbers in
`scripts/rim3d/finishes.json` (same four numbers the admin stores, plus an optional `kind`):
polished (Liquid Metal), gloss-paint (Gloss Black: paint under a thick clear with a faint orange
peel), satin (Satin Bronze, Satin Gold: metallic flake under a satin clear, micro-texture in the
roughness), metallic (Silver: metallic paint, flake, gloss clear), brushed (Silver as machined
aluminium: anisotropic). The turntable studio is a dark surround with softboxes, the shadow-catcher
floor hidden from reflections, AgX base contrast at −0.9 EV: chrome and black need dark areas to
reflect, satin needs broad soft highlights. Comparison: `rim-template/finishes-blender.jpg`.

### The rim detail page: the wheel studio (since 2026-11-11)
The rim page (`/rims/<wheelId>`) draws the rim live in the wheel studio ported from the FORGED website:
`components/RimDetailPage.tsx` → `components/WheelStage.tsx` → `shared/wheel-viewer/WheelStudio.tsx` (a lazy
chunk), with `shared/wheel-viewer/wheelStudioParts.ts`. A wheel with a `modelUrl` gets the studio; one without
shows its photo.

- It loads the same rim file the car uses (`public/models/rims/<wheelId>.glb`, plus the `-rear` file of
  a staggered set), so there is nothing extra to render or publish for the rim page.
- Finishes are drawn with `services/wheelFinish.ts`, the recipe the car's wheels use, so a finish is the
  same on the rim page and on the car.
- Views: Face / 3/4 / Side / Back / Top; Front / Rear for a staggered set (FSA001); finish chips; Show
  toggles Orbit, Spin wheel, Exploded, Wireframe, Bolts, Cap, and Brake check when the model has brake
  meshes.
- The studio sorts meshes into parts by node name (`classifyStudioPart`): the website convention's
  `Rim_Barrel`, `Rim_Face_Spokes`, `Hardware_Bolts`, `Center_Cap`, `Brake_Rotor`, `Brake_Caliper`, or the
  short names barrel, face, bolts, cap, rotor, caliper. A mesh it does not recognise is treated as part
  of the face, so it still follows the finish. Exploded, Bolts and Cap are only offered when the model
  has the parts for them.

**Legacy: the pre-rendered 360° spin.** Until 2026-11-11 the page played Blender frames:
`scripts/rim3d/turntable.py` rendered the rim standing on its tread, 36 frames round, in every finish,
as transparent WebP with a contact shadow, into `public/renders/rims/<wheelId>/<finish>/fNN.webp`,
`spin-manifest.py` listed them, and `components/RimSpinView.tsx` dragged through them (`convert.sh …
--spin` did it all, about 45 min per wheel on CPU). `RimSpinView.tsx` and
`public/renders/rims/manifest.json` are removed, and no spin frames existed for the six stocked wheels.
The two scripts are still in `scripts/rim3d/`, but nothing in the app uses their output.

### Lighting match (done)
`scripts/prerender/studio_hdri.py` renders the Blender studio as `public/env/forgedsa_studio.hdr`;
in rendered-body mode the engine lights the live wheels with it (`RENDER_ENV_URL`, intensity
`RENDER_ENV_INTENSITY` = 0.33 because the bodies were rendered at −1.6 EV; `?renvi=` tunes).

## Still to do

1. Spoke channel for traced (Route 1) faces: today it is a bar-spec option only.
2. Lip engraving / logos: not modelled.

Done since this list was written: a free-orbit wheel close-up (the wheel studio on the rim page,
2026-11-11).

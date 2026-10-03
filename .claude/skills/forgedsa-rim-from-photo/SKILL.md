---
name: forgedsa-rim-from-photo
description: Step by step from a regular photo of a FORGEDSA rim to a swappable 3D rim in the configurator (any car, 19–22", every finish). Covers which photo to use, the cut-out, the ingest checks, how the app turns the cut-out into 3D spokes (symmetry, barrel/flange/stretch modes, lip radius), QA with the outline harness and close-ups, going live in /admin, and a symptom → fix table for every failure seen so far. Use for any new wheel image, a wheel that looks wrong on the car (fat, stretched, broken, jagged or missing spokes; a solid disc), or questions about what photo to send.
---

# From a rim photo to a swappable rim

A **swappable rim** is one PNG per design. The app turns it into a 3D spoke face that fits every
car, every size (19–22") and every finish.
- **Generated, not from the photo:** tyre, lip and barrel, brake disc, caliper, lug nuts and
  centre cap.
- **From the photo:** only the *shape* of the cut-out (its alpha). Never its colour, which comes
  from the finish (`forgedsa-rim-finishes`).

Pipeline: photo → cut-out PNG → ingest (normalise + 3D-readiness test) → `wheels` row →
`processRimPhoto` → `traceMaskShapes` → `buildSpokeFace` (all in `services/wheelKit.ts` and
`services/rimExtrusion.ts`).

## 1. Choose the photo

- **Front-on**, camera on the wheel's axis, the whole rim in frame including the outer lip.
  - A slight angle puts the barrel off-centre. The app copes with a little (FSA-01).
  - A clear angle tears the arms, because the sectors no longer match (FSA-07). Ask for a
    front-on shot or the CAD file, or give it a prepared face (the `wheel3d` skill, step 3).
- **Sharp and large:** at least 1500 px across the rim (2048+ is better). Edge smoothness comes
  from resolution.
- **One photo per design,** in any finish: the finish is chosen in the app.
- **Plain background and even light.** No stands or hands over the spokes.
- **Three-quarter catalogue shots** need an AI redraw to front-on (FSA-10…17). Always compare
  the redraw with the original by eye: designs drift.
- **Best of all is the manufacturer's CAD** (STEP/IGES/STL/OBJ). It replaces the photo with
  true 3D (admin → Wheels → Rim 3D model; see `forgedsa-wheel-pipeline`, Route B).

## 2. Cut it out

What the app needs in the PNG:

| Requirement | Why |
|---|---|
| Transparent background (corners ≥ 97% clear) | The rim circle is found from the alpha |
| **Transparent windows between the spokes** (≥ 5% of the face see-through) | The spokes are the opaque shape; no windows means a flat disc |
| Unbroken outer lip touching all four edges (lip ≥ 85% solid, fills ≥ 96%) | The lip sets the scale: spokes meet the 3D lip at 91.6% of the rim radius |
| Square, 1024–4096 px | Normalised to 2048 px |
| Light neutral grey (the ingest does this) | Only matters for the flat fallback, which uses the photo as a texture |

- **Barrel seen between the outer spokes:** best is to cut it out as well, so only spokes, hub
  and lip stay opaque. If it's left in (all the current photos), the app traces the arms across
  it (step 4). That works, but a clean cut is always better.
- **Tools:**
  - batches: the n8n pipeline cuts out with an image model and checks it against the original;
  - single wheels: any editor with select-subject plus manual window clean-up (Photopea,
    Photoshop).
  - Background removers leave the windows filled; don't trust one without checking.
- **Remove specks and stray pixels** around the lip. Holes inside the spokes smaller than about
  170 mm² (13 × 13 mm on the wheel) are dropped. The specks seen so far are about 35 mm²; the
  smallest real window, about 840 mm². Anything larger stays a hole.

## 3. Ingest: two ways in

- **Batch (preferred):** Drive folder + `wheels` sheet → n8n "FORGED wheel pipeline
  (automated)" → `ingest-wheel` Supabase function. Full steps in `forgedsa-wheel-pipeline`.
  - `normalize.ts` crops to the rim circle, removes stands, centres it on 2048 px and maps to
    neutral grey.
  - `validate.ts` runs the 3D-readiness test (the table above). Failures are hidden, with
    reasons in `wheel-report.csv`.
- **Single wheel by hand:** admin → Wheels → the wheel → **Rim image (.png)**.
  - ⚠️ The admin upload does **not** normalise or validate. Upload a PNG that already meets the
    table: square, lip touching the edges, transparent background and windows.
  - Tick **Build 3D spokes from the image** (off shows the photo flat).

## 4. What the app does with it

`processRimPhoto(image)` (1536 px read, one sector as a polar table):

1. **Radii.** Coverage per ring gives the rim radius and where the see-through windows end.
2. **Symmetry.** Angular correlation over folds 3–24; the largest fold scoring within 85% of the
   best (≥ 0.4) wins. Current designs: 01:5, 02:10, 03:15, 04:5, 05:5, 06:12, 07:5, 08:5, 09:10.
   No symmetry (an angled photo) means no fold, so no median clean-up.
3. **The outer band** (`traceFaceArms`). In most photos the barrel is seen solid behind the outer
   half of the spokes, so the windows end well inside the lip. The app decides between:
   - **barrel:** arms cross the band. Each arm edge is fitted as a straight line on its cut-out
     edge and continued straight to the lip (default; `straightArms: false` follows the photo's
     brightness edges instead, for curved arms). Copies of an arm in the other sectors are
     averaged into one symmetric arm, from the row where all copies have started. Only arms are
     solid; the barrel between them is open. FSA-01 to 06 and 08.
   - **flange:** no arms cross. A solid face ring runs out to the lip (FSA-09).
   - **stretch:** the fallback when arms can't be traced (too few seeds, no arms repeating
     round the wheel). The see-through spokes are stretched to the lip. ⚠️ This is what made
     FSA-01's slender split arms fat before the tracer existed.
   - **clean:** a prepared face mask (`services/rimFaces.ts`), mapped 1:1, nothing traced
     (FSA-07, a bar face).
   - Spokes always end at `LIP_FRACTION` = 0.916 of the photo's rim radius (3D: 240 / 262 mm).
4. **Clean-up:**
   - median across the symmetric sectors;
   - smoothing along the radius (σ 8 px, to just inside the lip);
   - **edge refit** (`regulariseEdges`): every spoke edge refitted as a smooth curve, so the
     steps where the cut-out meets the traced arms go;
   - solid hub pad (lug nuts and cap are 3D);
   - blur, then a 3 px opening (slivers) and a 5 px closing (hooked window tips).
5. **Outline and face:**
   - `traceMaskShapes(mask, …, 0.5, 2.0, 6)`: marching squares, outline smoothing (σ 6 px,
     corners kept), simplify;
   - pin-hole holes dropped;
   - `buildSpokeFace`: 32 mm deep, 3 mm rounded bevel, concave dish (36 mm front / 58 mm
     rear), exact dish normals on the face.
6. **Lip style comes from the wheel's text,** not the photo. "Two-piece"/"2P" or
   "three-piece"/"3P" in the style or name gives the polished bolted lip; anything else, a
   one-piece lip in the finish.

## 5. QA, every new photo

0. **Measured face check (seconds):** `node scripts/render/wheel-qa.cjs <rimCacheDir> <outDir>`.
   Every wheel must PASS: pieces, windows, symmetry, ragged, **wiggle** (nicks and wobble) and
   thinnest spoke. The thresholds are in the `visual-qa` skill, the full process in `wheel3d`.
1. **Outlines (seconds per photo).** Dev server on 127.0.0.1:5173, then:
   ```bash
   node scripts/render/outlines.cjs <rimCacheDir> <outDir> '[{"name":"default"}]' forged_fsa_10
   ```
   - It prints the fold and the mode (`barrel`/`flange`/`stretch`) and writes the mask with the
     traced outlines at 2×.
   - Compare with the photo:
     - same number of arms;
     - every arm reaches the lip;
     - windows the same shape;
     - no slivers, flags or floating pieces.
   - Cache the rim PNGs first (`curl` each `imageUrl` into `<rimCacheDir>`): the sandbox browser
     can't reach Supabase storage.
2. **Close-ups:** `scripts/render/shoot.cjs` with `view: "frontWheel"` on two cars and two
   finishes (one bright, one Black Gloss). Look at full size.
3. **360° page:** `/rims/<id>` (route Tailwind to a local copy in the sandbox; see
   `forgedsa-render-verification`).
4. **On a real screen** before telling the client.

## 6. Symptom → cause → fix

| On the car | Cause | Fix |
|---|---|---|
| Fat, stretched spokes; split arms merged | `stretch` mode on a photo whose barrel shows behind the arms | Check the mode in outlines.cjs. Front-on, larger photo, or cut the barrel out between the arms |
| Spokes end at a solid ring | `flange` chosen: no arm edges found in the band | Real flange designs (FSA-09) are right. Otherwise the photo is too soft: a sharper photo |
| Torn or broken arms, floating pieces | Angled photo: the sectors disagree (FSA-07) | Front-on photo or CAD; else a bar face or AI face mask (`wheel3d` step 3) |
| Nicks or steps halfway along the spokes | The cut-out half and the traced half of each arm meet a few pixels apart | Fixed in the engine (Oct 2026); if `wheel-qa` wiggle > 15° on a new photo, see `wheel3d` step 3 |
| Wide wedges instead of Y-branched arms | Branches split inside the barrel band (FSA-02). The app follows a see-through slot enclosed by an arm out to the lip (≤ ~18 mm wide, never narrowing), but only once the slot shows in the cut-out | Cut the barrel out between the branches, so the slot starts where the branches part |
| Pin-holes in spokes | Holes in the cut-out over ~170 mm² | Clean the cut-out |
| Jagged or lumpy edges | Low resolution, or a noisy cut-out edge | A larger photo; check `traceMaskShapes` smoothing is on (6 px) |
| Flat disc with the photo printed on it | No transparency inside the rim, or *Build 3D spokes* off | Cut out the windows; tick the box |
| Wrong arm count or wrong symmetry | A defect or reflection breaks the repeat; fold detection picked a multiple | Check the printed fold; clean the photo |
| Caliper or hat showing through the spokes | Clearance, not the photo | Move `discX` in `rimLayout`, never the spokes (`3d-car-perfect`) |
| Plain lip where the real wheel has a bolted lip | Style text has no "two-piece"/"three-piece" | Edit the style in admin |

## 7. Go live

1. **Admin → Wheels → New** (or the n8n batch, which fills the same row):
   - code (`FSA-xx`, stable: it becomes the id), name, subtitle;
   - style (decides the lip);
   - Rim image + *Build 3D spokes*;
   - sizes & set prices;
   - available finishes + default;
   - description, highlights;
   - Save. Live at once: production and previews read the same Supabase tables.
2. **Mirror the row** in `data/configuratorData.ts` (the offline fallback) in the next code
   change.
3. Re-run the outline check and the close-ups after any change to `services/wheelKit.ts`. Every
   photo wheel is rebuilt from its photo at load.

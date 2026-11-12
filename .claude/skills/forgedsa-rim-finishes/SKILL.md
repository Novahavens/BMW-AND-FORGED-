---
name: forgedsa-rim-finishes
description: How FORGEDSA wheel finishes (the stock sheet's Gold, Hyper Black, Polished Face, Pure Bronze, Black Matte, Silver, Gloss Black and Liquid Metal, the older Bronze Matte, and any finish made in /admin) are built so they look like the real coatings. Covers the four finish kinds and their values, the code (services/wheelFinish.ts), what else follows the finish (barrel, lip, GLB rims), adding or tuning a finish, QA renders and pitfalls. Use when a finish looks wrong (plastic, flat, orange, a black hole, chrome-like matte), when adding or editing a finish, or when someone asks how the wheel colours work.
---

# Rim finishes: the four kinds, and the stock-sheet finishes built from them

A finish is **one colour plus four numbers** in the `wheel_finishes` table (admin → Finishes). It
is never a texture. `services/wheelFinish.ts` reads the numbers as a layered coating, the way
the real finish is made:

```
admin numbers (hex, metalness, roughness, clearcoat)
   └─ finishKind()  → polished | gloss-paint | satin-metallic | metallic-paint
       └─ finishLook() → base colour, metal, roughness, clear coat + its roughness, flake, flop
           └─ applyFinishLook() on the spokes and lip; the barrel and GLB rims follow (see below)
```

The kind is picked from the numbers, so a finish made in the admin works without code changes.

## The four base finishes (one per kind)

Customers now see nine finishes (the stock-sheet table at the end); these four are the reference
recipe for each kind. `bronze` (Bronze Matte) is offered on hidden wheels only.

| Finish (id) | Admin values | Kind (rule) | What the engine renders |
|---|---|---|---|
| Liquid Metal (`liquid_metal`) | #dfe4e8, metal 0.98, rough 0.12, clear 1.0 | **polished** (metal ≥ 0.95, rough ≤ 0.16) | bare polished metal: metal 1, roughness 0.05–0.1, mirror clear coat (0.02) |
| Gloss Black (`black`) | #141618, metal 0.7, rough 0.15, clear 0.95 | **gloss paint** (linear luminance < 0.03 or metal < 0.3; rough ≤ 0.35) | black **paint** (metal 0, base roughness 0.4) under a gloss clear coat (≥ 0.9, roughness 0.03) |
| Bronze Matte (`bronze`) | #8f6738, metal 0.8, rough 0.55, clear 0.1 | **satin metallic** (rough ≥ 0.42; metal < 0.3 = matte solid paint) | metallic paint (metal ≥ 0.75, rough 0.42–0.7) under a satin clear coat (roughness 0.5); strong flop 0.5, flake 0.09 |
| Silver (`silver`) | #c3c8cd, metal 0.9, rough 0.28, clear 0.7 | **metallic paint** (everything else) | metallic paint (rough ≥ 0.3) under a gloss clear coat (0.04); flop 0.7, flake 0.06 |

Why each recipe:

- **Liquid Metal.** For a metal, the colour *is* the reflectance. #dfe4e8 is about 0.73–0.80
  linear: brighter than chrome (0.55), darker than polished aluminium (0.91). It looks like
  liquid metal only because of what it reflects, so it needs the softbox studio
  (`services/studioSoftbox.ts`). Under a flat environment it goes dull grey. Roughness stays
  ≥ 0.05, because below that the thin spoke edges sparkle (alias) between frames.
- **Gloss Black.** Gloss black wheels are painted or powder-coated: a non-metal. The old reading
  (metal 0.7 with a near-black colour) reflected almost nothing from the base, so spokes were
  flat black cut-outs with a rim of highlight.
  - As paint, the base gives its own 4% reflection with a soft sheen (roughness 0.4).
  - The clear coat adds the crisp studio reflections, so the spoke shapes read.
- **Bronze Matte.** Matte means **no sharp reflection anywhere**. A smooth clear coat, even at
  0.1, adds a mirror reflection at grazing angles and the wheel reads satin-gloss. The engine
  keeps the clear coat amount but makes it rough (0.6).
  - **Form comes from flop, not reflections.** Under the soft studio a matte metallic averages to
    one flat colour; strong flop (0.5) makes the spoke sides go dark as they turn away, so the
    3D shape reads. Flake 0.09 gives the metallic grain. Lowering the roughness alone did nothing.
  - The clear coat keeps a faint satin sheen (roughness 0.5): real matte powder coat isn't dead.
- **Silver (aluminium).** Wheel silver is a metallic paint ("hyper silver"), not bare metal:
  - flakes under a gloss clear coat;
  - face/flop: bright face-on, darker where the spoke sides turn away;
  - roughness ≥ 0.3 keeps it from reading as chrome, while the clear coat stays sharp.

Flake and flop are in `installFinishLayers()`: a shader addition on top of the wheel-arch
shading.
- Flake cells are 1 mm in the mesh's own space, so they turn with the wheel.
- They fade out once a cell is smaller than a pixel: no shimmer at normal distances, sparkle in
  close-ups.
- The clear coat keeps the unperturbed normal, so reflections stay smooth on top, as on the car
  paint (`services/paintShader.ts`).

## What else follows the finish (`applyWheelFinish` in the engine)

- **Barrel (inside of the rim):** finish colour × 0.4, roughness + 0.15, half the clear coat
  (roughness + 0.1), plus the barrel AO map. It is deep in shadow; a full-brightness barrel makes
  silver wheels look like solid discs.
- **Lip:**
  - one-piece rims: the finish;
  - two-/three-piece rims (style text "two-piece"/"three-piece"): always the polished lip with
    bolts (`kit.lipPolished`), whatever the finish, as on the real wheels.
- **GLB rims (the six stocked wheels, CAD uploads):** the same look, flake and flop included.
  `makeRimFinishMaterial` in the engine gives each rim mesh the finish layers and multiplies the flake
  scale by the mesh's own unit, so the cells stay about 1 mm whatever units the file is in.
- **The flat-photo fallback** (a photo that could not be turned into 3D spokes, or a wheel with
  `imageExtrude: false`; `applyCustom2DSpokeTexture`): the finish's colour, metalness, roughness and
  clear coat only. Its material has no finish layers, so it has no flake and no flop.
- **The rim page (`/rims/<id>`):** the wheel studio (`shared/wheel-viewer/WheelStudio.tsx`) loads the same rim file as
  the car and draws it with `finishLook()` / `applyFinishLook()` from `services/wheelFinish.ts`, so a finish
  is the same coating on the rim page and on the car. Its barrel, face and cap take the finish; bolts and
  brake meshes keep their own materials (`FINISH_PARTS` in `shared/wheel-viewer/wheelStudioParts.ts`). What differs is
  the room: a light product stage with its own generated reflections, and no wheel-arch shading.
- **Reflections on the stage (ADR-001, 2026-11-12):** on the stage and viewer looks the wheel materials (spokes or GLB
  rim, barrel, image faces) reflect the softbox studio, not the body's black cove, at `CarConfiguratorEngine.WHEEL_ENV`
  (0.1; the barrel 0.45 of it). `syncWheelEnvironment()` sets it. Without it the near-vertical spokes mirrored black and
  every finish read flat or as a black hole. `?wheelEnv=` compares strengths: 0.35 and up turns Silver white and Gloss
  Black chrome-like. On the softbox studio look the wheels follow `scene.environment` as before.
- **Not affected:** caliper colour (`applyCaliperColor`), tyre, disc, lug nuts, centre cap.

## Adding or tuning a finish

1. **Admin → Finishes → New:** id (slug, referenced by wheels), name, colour name, colour (hex),
   metalness, roughness, clear coat, badge, description. Save. Then tick it on each wheel
   (Wheels → Available finishes).
2. **Pick the numbers for the kind you want:**
   - **Polished/chrome:** metal 1.0, roughness 0.06–0.12, clear coat 0–1. Colours #c8ccd0
     (chrome) to #e8ebee (polished aluminium).
   - **Gloss paint:** any colour with metal below 0.3 (or any colour darker than about #303030),
     roughness ≤ 0.3, clear coat ~1. E.g. gloss white #e8e8e6, metal 0, rough 0.2.
   - **Satin/matte metallic:** roughness 0.45–0.65, metal 0.75–0.9, clear coat ≤ 0.3. E.g. matte
     gunmetal #4a4d52, rough 0.5.
   - **Satin solid paint:** the same but metal 0, e.g. satin black #26282b, metal 0, rough 0.5:
     no flake or flop.
   - **Gloss metallic paint:** metal 0.8–0.95, roughness 0.25–0.4, clear coat 0.7–1. E.g.
     gloss bronze #8a6a3c, rough 0.3; gold #b8964f; brushed titanium #9aa0a6, rough 0.24.
   - **Inactive ones in the table:** titanium, champagne_gold and rose_gold land as metallic
     paint; flip `active` to offer them.
3. **The colour is the colour you want to see.** Pick it from a photo of the real wheel in soft
   light (the face, not a highlight). For metals it sets the reflection tint.
4. **Metalness decides paint or metal.** Below 0.3 the engine renders a non-metal paint (no flake,
   no flop); 0.3 and above, a metallic paint or metal.

⚠️ **Finish values are live.** Production *and* every preview read the same Supabase tables, so
an edit in Finishes changes the live site at once.
- Test on one wheel first.
- Note the old numbers before changing them; they're the rollback.
- Code changes to how finishes are read go through a preview deploy as usual.

## QA

1. **Shot list:** the same stocked design (by id), live car and view in every stock-sheet finish;
   no other change between shots. `car` 1 is the M4 CS (live cars: 1, 5, 7, 8; `3` is the hidden
   M3), `"q": "&look=stage"` is what /configure draws:

   ```json
   [{"name":"gold","car":1,"paint":16,"wheel":"forged_fsa004","finish":"gold","view":"frontWheel","q":"&look=stage"},
    {"name":"hyper_black","car":1,"paint":16,"wheel":"forged_fsa004","finish":"hyper_black","view":"frontWheel","q":"&look=stage"},
    {"name":"polished_face","car":1,"paint":16,"wheel":"forged_fsa004","finish":"polished_face","view":"frontWheel","q":"&look=stage"},
    {"name":"silver","car":1,"paint":16,"wheel":"forged_fsa004","finish":"silver","view":"frontWheel","q":"&look=stage"},
    {"name":"black","car":1,"paint":16,"wheel":"forged_fsa004","finish":"black","view":"frontWheel","q":"&look=stage"},
    {"name":"pure_bronze","car":1,"paint":16,"wheel":"forged_fsa004","finish":"pure_bronze","view":"frontWheel","q":"&look=stage"},
    {"name":"liquid","car":1,"paint":16,"wheel":"forged_fsa004","finish":"liquid_metal","view":"frontWheel","q":"&look=stage"},
    {"name":"black_matte","car":1,"paint":16,"wheel":"forged_fsa004","finish":"black_matte","view":"frontWheel","q":"&look=stage"}]
   ```

   Then the same list on each stocked wheel in the finishes it offers (`docs/WHEEL_INVENTORY.md`);
   add `bronze` only when a wheel offers it. Run with `node scripts/render/shoot.cjs <out> shots.json`
   (GLB rims need no rim cache; see `forgedsa-render-verification` and the `3d-car-perfect` skill).
   Crop the wheels side by side.
2. **Look for, per finish:**
   - **Liquid Metal:** crisp reflections of the softbox panels on the spoke faces; no sparkle
     on the edges.
   - **Gloss Black:** the spoke *shapes* visible through soft reflections; sharp highlights
     along the edges; never a flat black silhouette.
   - **Bronze Matte:** no mirror highlight anywhere, even on the lip and at grazing angles;
     darker sides; brown-gold, not orange.
   - **Silver:** brighter faces, darker sides; not chrome-like.
   - **Gold / Pure Bronze:** warm metallic paint with flop and sharp clear-coat reflections; gold
     reads gold, not yellow or brass-orange; bronze brown-gold, not orange.
   - **Hyper Black:** dark gloss metallic whose faces flash bright as they turn (flop); pockets
     near-black; never a flat black cut-out, never as light as Silver.
   - **Polished Face:** bare polished aluminium, mirror-sharp panel reflections like Liquid Metal but
     a touch whiter; on a GLB rim the whole rim reads polished (one material covers every mesh).
   - **Black Matte:** satin solid black with no flake, no flop and no sharp highlight anywhere; not a
     black hole (the base must still show form).
3. **Close-up:** check `/rims/<id>` in each finish. The wheel studio there uses the same recipe as the
   car, on a light stage with no arch shading: the recipe is shared, only the room differs. The finish
   chips in its control card switch finishes without leaving the page.
4. **Colour and gloss:** judge on a real screen as well; the headless renderer has no
   anti-aliasing.

## Pitfalls

- **Near-black + metal = black hole.** A metal reflects its colour; a near-black metal reflects
  nothing. Dark finishes are paint.
- **A smooth clear coat on a matte finish** makes it satin. Matte needs a rough clear coat or
  none.
- **Never a texture per finish,** and never the photo's colour: the face is generated in the
  finish material.
- **Barrel at full finish brightness** makes silver and liquid metal wheels look solid. Keep it
  dark.
- **Flake in the wrong space:**
  - world space makes the sparkle swim as the wheel turns;
  - file units make it glitter on GLBs.
  The wheel kit is in metres, so mesh space is right. A GLB rim is not in metres, so
  `makeRimFinishMaterial` multiplies the flake scale by each mesh's unit.
- **Changing the four thresholds in `finishKind()`** moves every admin-made finish between
  kinds. Re-render all active finishes after any change.

## The stock-sheet finishes (Nov 2026)

The owner's stock sheet names the finishes customers see; they map onto these rows (`docs/WHEEL_INVENTORY.md`):

| Sheet | id | kind | hex, metal, rough, clear |
|---|---|---|---|
| Gold | `gold` | metallic paint | #c9a24e, 0.9, 0.32, 0.85 |
| Hyper Black | `hyper_black` | metallic paint (dark, bright flop) | #3a3e44, 0.9, 0.24, 0.9 |
| Polished Face | `polished_face` | polished | #e6e9ec, 1.0, 0.08, 0.6 |
| Pure Bronze | `pure_bronze` | metallic paint (SIXNINE chocolate bronze; #9c6b3a until 2026-11-12; satin rough 0.45 read as flat clay, keep it below 0.42) | #75523f, 0.9, 0.3, 0.7 |
| Black Matte | `black_matte` | satin solid (no flake/flop) | #26282b, 0.0, 0.5, 0.0 |
| Silver / Gloss Black / Liquid Metal | `silver` / `black` / `liquid_metal` | as above | unchanged |

A finish can cost more on one wheel (Polished Face on FSA002, Liquid Metal on FF-1/FF-3): that is the wheel's
`price_by_finish` (admin "Dearer finishes"), not a finish property. On GLB rims the one finish material covers
every mesh, so a "polished face with painted pockets" reads as fully polished.

---
name: forgedsa-rim-finishes
description: How FORGEDSA wheel finishes (Liquid Metal, Black Gloss, Bronze Matte, Silver aluminium, and any finish made in /admin) are built so they look like the real coatings. Covers the four finish kinds and their values, the code (services/wheelFinish.ts), what else follows the finish (barrel, lip, GLB rims), adding or tuning a finish, QA renders and pitfalls. Use when a finish looks wrong (plastic, flat, orange, a black hole, chrome-like matte), when adding or editing a finish, or when someone asks how the wheel colours work.
---

# Rim finishes: Liquid Metal, Black Gloss, Bronze Matte, Silver

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

## The four finishes

| Finish (id) | Admin values | Kind (rule) | What the engine renders |
|---|---|---|---|
| Liquid Metal (`liquid_metal`) | #dfe4e8, metal 0.98, rough 0.12, clear 1.0 | **polished** (metal ≥ 0.95, rough ≤ 0.16) | bare polished metal: metal 1, roughness 0.05–0.1, mirror clear coat (0.02) |
| Black Gloss (`black`) | #141618, metal 0.7, rough 0.15, clear 0.95 | **gloss paint** (linear luminance < 0.03 or metal < 0.3; rough ≤ 0.35) | black **paint** (metal 0, base roughness 0.4) under a gloss clear coat (≥ 0.9, roughness 0.03) |
| Bronze Matte (`bronze`) | #8f6738, metal 0.8, rough 0.55, clear 0.1 | **satin metallic** (rough ≥ 0.42; metal < 0.3 = matte solid paint) | metallic paint (metal ≥ 0.75, rough 0.42–0.7) under a satin clear coat (roughness 0.5); strong flop 0.5, flake 0.09 |
| Silver (`silver`) | #c3c8cd, metal 0.9, rough 0.28, clear 0.7 | **metallic paint** (everything else) | metallic paint (rough ≥ 0.3) under a gloss clear coat (0.04); flop 0.7, flake 0.06 |

Why each recipe:

- **Liquid Metal.** For a metal, the colour *is* the reflectance. #dfe4e8 is about 0.73–0.80
  linear: brighter than chrome (0.55), darker than polished aluminium (0.91). It looks like
  liquid metal only because of what it reflects, so it needs the softbox studio
  (`services/studioSoftbox.ts`). Under a flat environment it goes dull grey. Roughness stays
  ≥ 0.05, because below that the thin spoke edges sparkle (alias) between frames.
- **Black Gloss.** Gloss black wheels are painted or powder-coated: a non-metal. The old reading
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
- **GLB rims (CAD) and the flat-photo fallback:** same look, without flake (their units vary).
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

1. **Shot list:** the same design, car and view in all four finishes; no other change between
   shots:

   ```json
   [{"name":"liquid","car":3,"paint":16,"wheel":4,"finish":"liquid_metal","view":"frontWheel"},
    {"name":"black","car":3,"paint":16,"wheel":4,"finish":"black","view":"frontWheel"},
    {"name":"bronze","car":3,"paint":16,"wheel":4,"finish":"bronze","view":"frontWheel"},
    {"name":"silver","car":3,"paint":16,"wheel":4,"finish":"silver","view":"frontWheel"}]
   ```

   Run with `node scripts/render/shoot.cjs <out> shots.json <rimCacheDir>` (see
   `forgedsa-render-verification` and the `3d-car-perfect` skill). Crop the wheels side by side.
2. **Look for, per finish:**
   - **Liquid Metal:** crisp reflections of the softbox panels on the spoke faces; no sparkle
     on the edges.
   - **Black Gloss:** the spoke *shapes* visible through soft reflections; sharp highlights
     along the edges; never a flat black silhouette.
   - **Bronze Matte:** no mirror highlight anywhere, even on the lip and at grazing angles;
     darker sides; brown-gold, not orange.
   - **Silver:** brighter faces, darker sides; not chrome-like.
3. **Close-up:** check `/rims/<id>` in each finish (the showcase has no arch shading).
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
  The wheel kit is in metres, so mesh space is right.
- **Changing the four thresholds in `finishKind()`** moves every admin-made finish between
  kinds. Re-render all active finishes after any change.

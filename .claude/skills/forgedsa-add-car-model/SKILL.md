---
name: forgedsa-add-car-model
description: Add or replace a BMW car in the FORGEDSA configurator. Covers sourcing a licensed 3D model, compressing it, finding the paint and hide regexes, wiring it into Supabase and the bundled fallback, and verifying it renders. Use when a car is added, swapped, looks wrong (unpainted panels, original wheels showing, wrong size or rotation) or when a model has to be rebuilt from a multi-variant source.
---

# Add or replace a car model

The car catalogue lives in Supabase `public.cars` (source of truth) and is mirrored in
`data/configuratorData.ts` (offline fallback). Both must agree.

## 1. Source the model and check the licence first

- The browser downloads the GLB, so anyone can extract it. The licence must allow **commercial,
  real-time/web** use. CC BY (credit required), Sketchfab Free Standard, or a paid licence that
  names real-time/interactive use.
- Reject **Editorial** licences (no commercial use) and CC BY-NC. Watch for "CC BY" re-uploads of
  someone else's NC model; they are unlicensed.
- Many community uploads derive from game assets. Note it in `public/models/CREDITS.md` and flag a
  formal licence check before a large launch.
- Record author, link and licence in `public/models/CREDITS.md` in the same commit.

## 2. Prepare the GLB

- Compress: `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress webp`. Aim for
  under 15 MB (the `car-models` bucket limit is 50 MB).
- Multi-variant sources (game mods that stack every bumper, hood and interior in one file) need a
  build script. See `scripts/build-x5m-lci.mjs`: keep one coherent variant, zero the kept parts'
  node translations, rebuild PBR materials from mesh names, mount one wheel per corner, then run
  meshopt.
- Do **not** smooth or crease normals on car bodies (`toCreasedNormals` broke the M5 bumper).

## 3. Find the paint and hide regexes

The engine (`services/CarConfiguratorEngine.ts`) paints meshes whose own or material name matches
`paint_mesh_match`, except those matching `notPaintRe`
(`glass|window|light|lamp|chrome|trim|rubber|interior|carbon|grille|badge|logo|plastic`). It hides
the model's own wheels via `hide_mesh_match`, default `DEFAULT_HIDE`
(`(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)`).

- Real exports rarely use "paint" or "body". List the mesh and material names (browser console
  after load, or a small `@gltf-transform/core` script) and write **literal** per-model patterns.
  Example: M4 = `zx1mtl|body151mtl|pillars1mtl`.
- A panel left in its baked grey or black texture means a body material is missing from the regex.
- Forged wheels are placed only when **four** wheels are found by the hide regex.

## 4. Wire it in

- Write a migration in `supabase/migrations/` (see `20260927020000_m4_paint_fix.sql` and
  `20260927100000_x5m_lci_and_photoreal_paint.sql`) that upserts the row. Set `model_url`,
  `model_rotation_deg`, `model_length_m` (the real length in metres), `paint_mesh_match`,
  `hide_mesh_match` and `paint_ids`.
- Apply it with the Supabase MCP `apply_migration` (project `qxlfkfhzpqbxffuqqewg`) and read the row
  back.
- Mirror the same values in `data/configuratorData.ts`.
- Or, for non-developers: `/admin` → Cars → Upload GLB → set the fields → Save.

## 5. Verify

Use the `forgedsa-render-verification` skill. Render front three-quarter, side and rear in at
least one metallic and one black paint. Check: one consistent paint colour, no floating
unpainted panels, forged wheels seated in the arches, correct scale.

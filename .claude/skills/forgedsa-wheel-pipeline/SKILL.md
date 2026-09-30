---
name: forgedsa-wheel-pipeline
description: Add FORGEDSA wheel designs to the configurator from product photos (Google Sheet + n8n + the ingest-wheel Supabase function) or from manufacturer CAD files (STEP/IGES/STL/OBJ → rim GLB). Use for new wheel batches, hidden or failed wheels in wheel-report.csv, the CAD upgrade route, or questions about how photo wheels become 3D.
---

# Wheel pipeline: photos or CAD → wheels in the app

Full reference: `docs/WHEEL_PIPELINE.md`. Wheels live in `public.wheels`, and `data/configuratorData.ts`
mirrors the live ones.

## Route A: photos (live today for FSA-01…FSA-09)

1. Put the photos (or a zip) and the `wheels` sheet in one Drive folder. There is one row per design:
   `file, name, code, sizes, prices_zar|prices_usd, finishes, subtitle, description, highlights,
   style, skip, notes`. Separate lists with `|`. Keep `code` stable, because it becomes the id
   (`forged_fsa_02`).
2. Run the n8n workflow **"FORGED wheel pipeline (automated)"** (form: Start Wheel Batch →
   Production URL). It does the following:
   - An OpenRouter image model cuts out the wheel.
   - An AI check compares the cutout with the original, with one retry.
   - The result is posted to the `ingest-wheel` function (header `x-ingest-secret`).
3. `supabase/functions/ingest-wheel/` normalizes the cutout (`normalize.ts`: circle crop, 2048 px,
   neutral light grey) and runs the 3D-readiness test (`validate.ts`: ≥5% see-through, unbroken
   lip, rim fills the frame). It then uploads to `rim-images` and goes live or hidden with reasons.
4. Read `wheel-report.csv` in the "(processed)" folder. Fix hidden rows and rerun; the same `code`
   updates the wheel rather than duplicating it.

Why grey: the app multiplies the image by the chosen finish colour and uses it as the metal's
reflectance. A gold photo tints every finish gold.

Prefer front-on photos. Three-quarter photos need an AI redraw (FSA-10…FSA-17), which risks design
drift, so always inspect those by eye.

## Route B: CAD → true 3D (the photoreal route)

- In `/admin` → Wheels → the wheel → **Rim 3D model** → upload the STEP/IGES/STL/OBJ. The file is
  converted in a Web Worker (`services/cadToGlb.worker.ts` + `services/cadToGlbCore.js`,
  OpenCascade wasm loaded for admins only) to an oriented, sized, compressed rim GLB. It gets one
  finish surface, so all four finishes apply.
- Large files (over ~50 MB): `bun run rim:convert wheel.step` (`scripts/cad-to-glb.mjs`, same
  core).
- A model always wins over the photo on the car. If the spokes face inwards, tick **Flip 3D
  rim**.
- Ask manufacturers for the **rim only, no tyre**.

## Prices and sizes

`price_by_size` (USD per set of four) is the truth. `price_per_set` and `standard_sizes` are derived on
save. Region prices are USD × the rates in `config/brand.ts`, rounded to 10.

## One-time setup and secrets

- OpenRouter privacy settings must allow Sourceful and Google.
- Ingest keys are stored only as SHA-256 in `public.ingest_keys`. Never commit a raw key or put one
  in n8n node parameters; use an n8n Header Auth credential.

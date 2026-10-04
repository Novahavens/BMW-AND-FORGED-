---
name: forgedsa-paint-and-lighting
description: Tune car paint, reflections and studio lighting in the FORGEDSA Three.js engine for a photoreal look. Covers the metallic, uni and frozen paint parameters, HDRI and environment intensity, studio lights, tone mapping, and the side-by-side tuning method. Use when paint looks plastic, blotchy, washed out or too shiny, or when adding a paint type.
---

# Paint and lighting tuning

Everything lives in `services/CarConfiguratorEngine.ts`. Paint rows are in `public.paints`
(mirrored in `data/configuratorData.ts`).

## Current values (Oct 2026)

**Paint finishes** (per-paint numbers in `paints`, finish extras in `services/paintShader.ts` `PAINT_LAYERS`;
sources in `docs/bmw-factory-paints.md`, "Material values"):

| Type | metalness | roughness | clearcoat / rough | specular | flake / flop | extra |
|---|---|---|---|---|---|---|
| Uni (solid) | 0 | 0.40 | 1 / 0.03 | 0.2 | 0 / 1.0 | |
| Metallic | 0.60 | 0.38 | 1 / 0.03 | 0.5 | 0.10 / 0.65 | 0.3 mm flakes (`FLAKE_SCALE` 3200) |
| Pearl | 0.45 | 0.40 | 1 / 0.03 | 0.5 | 0.14 / 0.70 | iridescence 0.2, IOR 1.9, 250-450 nm |
| Frozen | 0.60 | 0.58 | 1 / 0.45 (satin coat) | 0.5 | 0.02 / 0.78 | sheen 0.25, no coat boost |

Per-code looks: `PAINT_CODE_LOOKS` (A96 Mineral White, C3E Amber effect, X16 Frozen Brilliant White).
The catalogue values are used as they are (`GLOSS` is 1, a tuning switch only).

- **Every lit material is bound to the environment** (`syncEnvironment` in `services/carMaterials.ts`,
  run before each drawn frame). three r181 only honours `envMapIntensity` (and `envMapRotation`) when a
  material carries its own `envMap`, so the engine gives every standard material the scene's environment,
  intensity scaled by the scene's, rotation copied. So per-part values work (wheel barrel 0.45, tyre 0.7,
  interior...) and a WebGL context restore or HDRI load re-binds everything. `BODY_ENV_INTENSITY` is
  relative: 1 = the studio level.
- **Studio room** (`?room=`): default `studio` (`ROOM_STUDIO`): bright overhead softbox and strip lines,
  dark surround at door height and a thin sill line, like BMW's own renders, so deep paints stay deep.
  `white` (the Oct 2026 white room) greyed dark paints with broad wall reflections (M4 door mean ΔE00
  to BMW's renders: 10.6 white vs 6.4 studio). The page behind the car stays white either way.
- **Studio intensity:** `SOFTBOX_INTENSITY` 0.45 (`?envi=`). **Clear-coat boost:** `COAT_BOOST` 1.2 on
  glossy paints (`?coat=`), 1 on Frozen.
- **Tone mapping:** ACES Filmic, exposure 1.08 (`?tone=agx|neutral&exposure=` for reviews).
- **Paint colours are calibrated, not swatches.** `paints.hex` is a base colour solved so the M4's front
  door matches BMW's own renders (`scripts/render/paint-calibrate.cjs` with `paint-door.html`; method
  and table in `docs/bmw-factory-paints.md`, "Recalibration"). Any change to the finish values, tone
  mapping, exposure or the calibration lighting changes what a hex looks like: re-run the solver, and
  ship the new hexes (migration + fallback) with the code change.
- Paint changes go in a migration **and** the fallback catalogue (`data/configuratorData.ts`).

## Method

1. Fix a baseline: same car, paint, view and viewport. Use `forgedsa-render-verification`.
2. Change **one** parameter per round and render before and after side by side.
3. Check a bright metallic, black, white and a frozen paint. Black and white expose clearcoat and
   exposure problems fastest.
4. The M5 has the best model, so tune on it, then confirm on a weaker model.

## Known pitfalls

- Blotchy, "disgusting" shine came from high environment intensity plus low roughness on a
  clearcoated metallic. Fix it with softer base roughness and a dimmer environment, not by
  removing the clearcoat.
- Normal smoothing or creasing (`toCreasedNormals`) creased the M5 bumper and was removed. Don't
  re-add it.
- A panel that stays grey is a paint regex issue, not lighting (see `forgedsa-add-car-model`).
- Flakes computed in model space take on the car file's units and show as coarse glitter.
  They must stay in world space.
- Real-time paint has a ceiling. Beyond it, use the path-traced mode (`forgedsa-photoreal-mode`)
  and better models, rather than more parameter tweaking. The whole photoreal process is in
  `3d-car-perfect`.

---
name: forgedsa-paint-and-lighting
description: Tune car paint, reflections and studio lighting in the FORGEDSA Three.js engine for a photoreal look. Covers the metallic, uni and frozen paint parameters, HDRI and environment intensity, studio lights, tone mapping, and the side-by-side tuning method. Use when paint looks plastic, blotchy, washed out or too shiny, or when adding a paint type.
---

# Paint and lighting tuning

Everything lives in `services/CarConfiguratorEngine.ts`. Paint rows are in `public.paints`
(mirrored in `data/configuratorData.ts`).

## Current tuned values (chosen from side-by-side renders on the M235 and M5)

| Paint type | metalness | roughness | clearcoat | clearcoatRoughness |
|---|---|---|---|---|
| Metallic | 0.8 | 0.45 | 1 | 0.05 |
| Uni (solid) | 0 | 0.5 | 1 | 0.05 |
| Frozen (matte) | 0.4 | 0.55 | 0 | – |

- `CarConfiguratorEngine.BODY_ENV_INTENSITY = 0.45`: the body's reflection strength.
  Higher values wash the bonnet out white.
- **Reflections (since Oct 2026):** a generated **softbox studio** (`services/studioSoftbox.ts`).
  - Feathered diffuser panels: overhead 2.3, side strips 2.4, low strips 1.3, kickers, a 0.08
    floor bounce, in a dark room.
  - Built with `PMREMGenerator.fromScene(..., { size: 512 })`.
  - `?studio=hdri` brings back the old HDRI (`/env/studio_small_09_1k.hdr`, Poly Haven CC0) for
    comparison.
- **Paint layers** (`services/paintShader.ts`):
  - metallic flake in **world space** (0.7 mm cells, strength 0.07, fading out below about
    0.4 px) plus face/flop darkening; Frozen 0.03/0.78, Uni 0/0.92;
  - the clear coat keeps the unperturbed normal.
- **Studio lights:** softbox 0.6, rim lights 0.55 and 0.45.
- **Tone mapping:** ACES Filmic at exposure 1.08 (the default after comparing AgX and Neutral);
  `?tone=agx|neutral&exposure=` switches for reviews.
- Paint changes go in a migration (e.g. `20260927100000_x5m_lci_and_photoreal_paint.sql`) **and**
  the fallback catalogue.

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

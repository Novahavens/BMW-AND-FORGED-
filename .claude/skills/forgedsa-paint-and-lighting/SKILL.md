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

- `CarConfiguratorEngine.BODY_ENV_INTENSITY = 0.45`: the body's HDRI reflection strength.
  Higher values wash the bonnet out white.
- Lights: softbox 0.6, rim lights 0.55 and 0.45. Tone mapping is ACES Filmic at exposure 1.08.
- HDRI: `HDRI_URL = '/env/studio_small_09_1k.hdr'` (Poly Haven, CC0). A `RoomEnvironment` PMREM is
  used until it loads.
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
- Real-time paint has a ceiling. Beyond it, use the path-traced mode (`forgedsa-photoreal-mode`)
  and better models, rather than more parameter tweaking.

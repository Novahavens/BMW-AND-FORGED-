---
name: forgedsa-paint-and-lighting
description: Tune car paint, reflections and studio lighting in the FORGEDSA Three.js engine for a photoreal look. Covers the metallic, uni and frozen paint parameters, HDRI and environment intensity, studio lights, tone mapping, and the side-by-side tuning method. Use when paint looks plastic, blotchy, washed out or too shiny, or when adding a paint type.
---

# Paint and lighting tuning

Everything lives in `services/CarConfiguratorEngine.ts`, except the look customers see on `/configure`:
the **stage look** in `services/viewerStudio.ts` (next section). Paint rows are in `public.paints`
(mirrored in `data/configuratorData.ts`).

## The stage look: what /configure draws (since 2026-11-11)

`/configure` draws live cars with `engine.setLook('stage')`, defined in `services/viewerStudio.ts`
(`STAGE`, `buildStageDome`, `buildStageFloor`, `buildStageCove`). It is modelled on the Cycles hero
stills (`public/hero/`): a black backdrop, a pool of light on a pale floor that fades to black, and a
black reflection cove with one overhead softbox. The softbox studio values further down are the
`look=studio` default of the bare engine, not what customers see.

| `STAGE` key | Default | URL override | What it is |
|---|---|---|---|
| `peak` | 0.97 | `?stagePeak=` | floor brightness at the centre of the pool |
| `rx`, `rz` | 2.2 m, 3.4 m | `?stageRx=`, `?stageRz=` | pool sigma across the car and along it |
| `overhead` | 12 | `?stageOver=` | the overhead softbox in the cove |
| `rails` | 6 | `?stageRails=` | the two light rails |
| `ring` | 1 | `?stageRing=` | the wrap ring |
| `floorEnv` | 0.5 | `?stageFloorEnv=` | the lit floor as the paint sees it in the cove |
| `exposure` | 1.2 | `?stageExp=` | multiplies the paint's exposure |
| `parts` | 0.35 | `?stageParts=` | the share of the cove that glass, carbon, chrome, trim and lamps mirror |

- Frozen paints keep the soft cove. The paint finish table (`VIEWER_FINISH`) is shared with the viewer
  look: on the stage a paint's metalness, roughness and clear coat come from that table by paint type
  (Uni 0 / 0.3 / 1 / 0.02, Metallic 0.75 / 0.34 / 1 / 0.03, Pearl 0.45 / 0.3 / 1 / 0.03 with iridescence
  0.5, Frozen 0.55 / 0.52 / 0.35 / 0.55), not from the paint rows in the table below, which the softbox
  studio uses.
- In the render harness `?look=stage` is what /configure draws. `?look=viewer` still exists and draws
  the older grey viewer dome, for comparison only. `?look=studio` is the softbox studio. The URL
  overrides above are for comparison renders.
- Tuning notes (chosen against `public/hero/m2_g87-1600.webp`, the M2 CS in Portimao Blue):
  - Overhead 12, 18 and 32 look the same from the front three-quarter, but from above 18 and 32 wash
    the bonnet and roof paint out. Check a change from above as well as at the front three-quarter.
  - A wrap ring above about 2 flattens the body.
  - Mirror-like parts need the reduced share (`parts`), or the windscreen and carbon roof clip to
    white.
- It is still the live WebGL car: it does not have the stills' path-traced reflections and soft
  shadows.

## Current tuned values (chosen from side-by-side renders on the M235 and M5)

| Paint type | metalness | roughness | clearcoat | clearcoatRoughness |
|---|---|---|---|---|
| Metallic | 0.8 | 0.45 | 1 | 0.05 |
| Uni (solid) | 0 | 0.5 | 1 | 0.05 |
| Frozen (matte) | 0.4 | 0.55 | 0 | – |

- **`material.envMapIntensity` does nothing here.** In three r181 it only applies when the material
  has its own `envMap`; ours use `scene.environment`, so the strength is `scene.environmentIntensity`
  (`SOFTBOX_INTENSITY`, now 1.15). `BODY_ENV_INTENSITY` (`?bodyenv=`) is kept but has no effect.
- **White studio (current default, `?room=white`):** white page backdrop (`.bg-stage`; parts of the UI
  on it use `.stage-light`, dialogs `.stage-dark`) with a mid-grey reflection room lit by big bright
  softboxes. A uniformly white room washes paint out; contrast between softboxes and room is what
  reads as gloss. `SOFTBOX_INTENSITY` 0.55 (`?envi=`); ROOM_WHITE panels are 2.5x brighter with 0.3x feather for crisp reflections.
- **Clear-coat boost (`COAT_BOOST` 1.2, `?coat=`):** `paintShader.ts` multiplies the clear coat's
  indirect reflection. `clearcoat` can't go above 1, and a plain 4% reflection of a soft room looks
  matte. Glossy paints also get base roughness x `GLOSS` 0.65 (`?gloss=`) and clearcoatRoughness
  at most 0.025; Frozen is unchanged.
- **Studio room** (`?room=walls|dark|light|white`; older `walls` = dark room with side panels): a dark room plus tall soft panels either
  side of the car, so doors and flanks show broad gradients. The light-grey room washed the paint out
  and a dark room alone read as satin: paint only looks glossy when something big and bright is
  reflected in it. White paints blow out above about 1.3 environment intensity.
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

1. Fix a baseline: same car, paint, view and viewport. Use `forgedsa-render-verification`, with
   `"q": "&look=stage"` for anything customers see on `/configure`.
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

## Gloss vs satin: what was measured (Oct 2026)

- Shine comes from **hot, crisp highlights on the curves** (bonnet, roof, haunches), not from a bright
  room: brighter and sharper softboxes (`panelGain` 8, `edge` 0.3) with a low overall environment
  (`SOFTBOX_INTENSITY` 0.28) and a plain clear coat (`COAT_BOOST` 1.0). A uniformly bright room washed
  colour out; a soft one read as satin.
- A flat door only mirrors a few degrees around the horizon, so lighting alone cannot make it look
  glossy; flank gradients and a floor step were tried and did nothing visible. Judge gloss on
  3/4 views.
- Satin / Frozen paints (clearcoat 0, roughness 0.55) stay matte under the same lights: no sharp
  highlights, a soft sheen.
- Tyres were tuned for the old dark room (grey in a bright one): rubber is now 0x1c1b1a.
- Rig: `?gain= ?edge= ?base= ?side= ?floor= ?horizon= ?flank=` override the room live; render the
  same view on a flat magenta `?bg=` and compare contrast / hot-pixel fraction on the body.

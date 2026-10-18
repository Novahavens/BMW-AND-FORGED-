# Photoreal car and wheel renders: the repeatable process

**Owner of this process:** whoever runs the renders (a person, or Claude Code with the skills in `.claude/skills/`).
**Companion file:** [`RENDER_CHECKLISTS.md`](RENDER_CHECKLISTS.md): the tick-box version of every stage below.
**Last updated:** 2026-10-18. Status of each part is in section 7 (what is live, what is only a proof).

---

## 0. The quality bar

The picture must look like a studio photograph, as good as the manufacturers' own configurators.
References the owner has given (keep them private, never commit them): BMW's own online configurator
(M5 Sedan, green, black double-spoke wheel, red caliper) and the Aston Martin DBX configurator.

What that means in practice, per part:

| Part | What a photo has that a render usually lacks |
|---|---|
| Paint | Depth, long soft reflections, crisp highlight lines along the shoulder, no clipped white, no grey haze |
| Glass | See-through tint with the cabin faintly visible; soft reflections, never ragged white bars |
| Rim face | Chamfered spoke edges, a slightly curved face, a stepped window, bright edge highlights, the right finish (semi-gloss black, brushed or polished metal) |
| Tyre | Real OEM size and diameter, matte rubber, raised sidewall lettering, tread and shoulder detail, a little squash at the ground |
| Brake | The real disc size and type, a cast caliper with bolts and pads, correct default colour |
| Fit | Correct ride height, a believable gap in the arch, shadow inside the arch and under the tyre |

---

## 1. How the picture is built (one picture = stacked layers)

```
backdrop (CSS gradient, sized to the render frame)
  + car body: Blender images recoloured per paint in the browser   (services/renderedBody.ts)
  + wheels:   TODAY drawn live by three.js on top of the body      (services/CarConfiguratorEngine.ts)
              PLANNED  pre-rendered Blender wheel layers           (scripts/wheels/, proof only)
  + tone mapping (Khronos Neutral, exposure per layer)
```

Why layers: a paint colour, a wheel, a finish and a size are each a *choice*. Rendering every combination
into one image per car would be roughly 35,000 renders (about 700 hours). Layers keep it to about a day.

**Body passes per car and view** (`scripts/prerender/render_car.py`, 5 views: `frontThreeQuarter`, `side`,
`rearThreeQuarter`, `frontWheel`, `top`):

| File | What it is |
|---|---|
| `gloss_w`, `gloss_b` | clear-coated paint with a white / black base colour. The browser mixes any paint as `black + (white − black) × colour`, in linear light |
| `matte_w`, `matte_b` | the same for Frozen (matte) paints |
| `flake_w` | white-metal pass: coloured, angle-dependent sparkle for Metallic and Pearl paints |

Because of the mix, **a paint never needs a re-render**. A new paint is a catalogue row (hex = the paint's true colour).

---

## 2. Ten rules that make it repeatable

1. **One source of truth per thing, in git.** Car: `data/configuratorData.ts` + the `CAR_FIXES` entry in `render_car.py`. Wheel: its `docs/rim-template/<id>-*.json` spec. Tyre/brake: `scripts/wheels/oem_tyres.json`. Paint: `docs/bmw-factory-paints.md` + the migration. Finish: `scripts/rim3d/finishes.json` + `materials.py`.
2. **Same light everywhere.** The wheel layers run the *same* preamble as the car render (`render_wheel_layer.py` executes `render_car.py`'s scene setup), so lights, cameras and wheel positions cannot drift. If the car studio changes, re-check the wheels.
3. **One outline per wheel, used twice.** The spin on the rim page and the wheel on the car come from the same spec/outline, so they are the same wheel.
4. **Measure first, then look.** Run the numeric checks (clipping, window holes, sizes), then contact sheets, then full-size by eye. Never judge from a thumbnail.
5. **Compare against a reference, side by side, at the same scale** (the photo or CAD render of the real wheel; the benchmark configurator for overall quality).
6. **Small test before a big run.** One car, two wheels, three views at low samples; owner approves the look; only then the full render.
7. **One heavy job at a time.** The render machine has 4 cores: Blender at 3 threads (`--threads 3`), nothing else heavy alongside.
8. **Log and resume.** Containers restart and kill jobs. Every long run writes `progress.txt`, runs with `nohup` and a log file, and can be re-run to continue.
9. **Commit per unit of work** (one car, one wheel), only the files that unit owns. Never `git add -A`. Never commit CAD, BMW/benchmark images, `.whl`, `.pyc` or scratch renders.
10. **Nothing goes live unchecked.** Gate → PR → merge → deploy from the merge SHA → verify the live bundle and a live screenshot.

---

## 3. The workflow (stages, with inputs, steps, outputs and gates)

### Stage A: Intake (before any rendering)

| Item | Input needed | Where it lands |
|---|---|---|
| Car | Licensed 3D model (licence + credit noted), paint-region and hide-region names, factory paint palette | `forgedsa-add-car-model` skill; `data/configuratorData.ts` + Supabase `cars` row; `public/models/CREDITS.md` |
| Wheel | **Supplier CAD (STEP preferred) per size, or a front-on rim photo**; PCD, centre bore, widths and offsets per size; finish names, codes and gloss levels; cap/logo artwork (vector); clean product renders per finish; photo of the real wheel on a car | `docs/rim-template/<id>-*.json`, `public/rim-images/` (photo route) |
| Tyre | Factory make/model, sizes front and rear, plus-size equivalents for sizes the factory does not offer, sidewall photos | `scripts/wheels/oem_tyres.json` (with a `confidence` per row) |
| Brake | Disc diameter and type, caliper design and default colour, photos | same json |
| Paint | BMW code, name, finish type (Uni / Metallic / Pearl / Frozen), **true colour** from at least two sources | `docs/bmw-factory-paints.md`, migration, `data/configuratorData.ts` |

**Gate A:** every row has a source; anything unverified is marked `UNVERIFIED` and rendered conservatively
(for tyres: size text only, no brand, until verified). Brand names are drawn as plain text; no logo artwork
(owner decision).

### Stage B: Car body renders (live pipeline)

```bash
bunx vite --host 127.0.0.1 --port 5173 &                      # dev server (the export needs the engine)
STUDIO=dark THREADS=3 scripts/prerender/render-all.sh <i>     # i = position in BMW_MODELS (script prints "== i id")
```
`render-all.sh` → `export-scene.cjs` (body as the engine places it + 5 cameras + `<id>.wheels.json`) →
`render_car.py --studio dark` (one render per material set, black base derived from white) → WebP into
`public/renders/<id>/<view>/` → `public/renders/manifest.json`. About 20–30 minutes per car at 1440 px and 32 samples.
Env: `SAMPLES`, `WIDTH`, `THREADS`.

Per-car problems are fixed in `CAR_FIXES` (never by hand-editing images): `hide` (stacked variants z-fight),
`thin_glass`, `no_subdiv` (very dense models run out of memory), `lamps`, `glass_unlink`, `dark_glass`
(panoramic roofs), `view_gain`, `dark`, `glass_tint`.

**Gate B (per car):** see checklist B. Headline numbers: white-pass p99 under about 0.96 on the body, no holes in
windows, no stock wheels, dark arches, contact shadow, all four/five frames per view present and the same size.

### Stage C: Rim 3D model and the 360° spin (live pipeline)

1. **CAD present?** Convert it (`scripts/cad-to-glb.mjs` / the admin **Rim 3D model** upload); otherwise photo route.
2. **Photo route:** `scripts/rim3d/convert.sh <photo.png> <wheelId>` (cut-out → outlines → `build_rim.py` → packed GLB → preview).
   Straight-bar designs: `scripts/render/make-bar-face.py` with a measured spec; flowing spokes: `scripts/render/make-curve-face.py`.
3. **Sculpt the spokes** with a `spoke_profile` in the wheel's `-rim.json` (chamfer, fillet, crown or concave, taper, hub pad,
   window ledge). Numbers come from the supplier render or photo shading. `scripts/rim3d/sculpt_face.py`.
4. **Finishes:** `scripts/rim3d/finishes.json` + `materials.py` (Liquid Metal, Gloss/Semi-gloss Black, Satin Bronze, Satin Gold, Silver).
5. **Check one frame first:** `turntable.py … --only-frames 0,9,18 --only black,silver`.
6. **Full spin:** `python3 scripts/rim3d/turntable.py <full.glb> public/renders/rims/<id> --frames 36 --threads 3`
   then `python3 scripts/rim3d/spin-manifest.py`. About 45–60 minutes per wheel (5 finishes × 36 frames).

**Gate C:** the wheel matches the real wheel (overlay on the photo/CAD render), no stair-stepping or zigzag, every finish
reads as its real coating, all 36 frames × finishes decode (`spin-manifest.py` only lists complete wheels).

### Stage D: On-car wheel layers (proof done; see section 7)

Per **car** (changes with every car): tyre + disc + caliper. Per **wheel design** (reused across cars): the rim.

```bash
# per car, per view, per rim size: tyre + brakes
python3 scripts/wheels/render_wheel_layer.py --glb /tmp/prerender/<id>.glb --car <id> --view side --size 20 \
    --parts under --caliper white --out OUT        # and --caliper black for the recolour pair
# per wheel, per view, per finish, per size: the rim
python3 scripts/wheels/render_wheel_layer.py --glb /tmp/prerender/<id>.glb --car m4_g82 --rim <rim.glb> --view side \
    --finish silver --size 20 --parts rim --out OUT
```
OEM tyre data comes from `oem_tyres.json` (`--oem`, `--size-rear` for staggered cars). The body is a holdout so arch shadows,
the car reflected in the lip and colour bounce are right, and the layer registers pixel-exactly over the body render.
Defaults: deep-black rubber, wheel-only light-linked lights, 96 samples, FAST denoise.

**Gate D:** side by side with the reference at matching scale (checklist D); seams invisible; lettering crisp at 2x;
close-up views checked at full size. Render times (3 threads, 1x, 96 spp): side/3-quarter 25–50 s per layer, close-up 130–190 s,
2x close-up about 20 min (hero shots only).

### Stage E: Integrate and verify in the site

- Body: `services/renderedBody.ts` (tone mapping, flake, backdrop) and `components/journey/RenderedCarView.tsx`.
- Wheels today: the live engine (`services/CarConfiguratorEngine.ts`). Layers need a compositing component and a fallback to
  the live wheels for any combination not yet rendered (not built yet).
- Check on every device size: `node scripts/render/oncar.cjs <outDir> '<shots>'`, `scripts/render/journey.cjs`,
  `scripts/render/responsive.cjs`, `scripts/render/e2e.cjs`, `scripts/render/swap-perf.cjs` (wheel swaps must not freeze).
- Headless Chromium needs the proxy CA in `$HOME/.pki/nssdb` (see `docs/CHECKPOINT.md`); never disable TLS checks.

### Stage F: Release and after

1. `bun run lint` prints nothing; `bun run build` ends "built in"; secret grep clean.
2. Commit per car / wheel, push, open a PR (draft until Gate E passes), merge (squash).
3. Apply Supabase migrations *after* the code that needs them is deployed, *before* anything that reads the new data.
4. Deploy to Vercel from the merge SHA; poll the live bundle for something unique; compare a live frame hash with the local one; take a live phone and desktop screenshot.
5. Update the owner review page and `docs/CHECKPOINT.md`; add anything learned to the matching skill.

---

## 4. What "photoreal" is checked against

| Check | Measured by | Pass |
|---|---|---|
| Paint not flat or clipped | white-pass p99 on body pixels (`gloss_w`) | under about 0.96; top view may be higher only from thin highlight strips |
| Glass | contact sheet | cabin visible, no white holes, no ragged bars |
| Wheel arches | contact sheet | dark, with a shadow under the tyre |
| Spokes | wheel-qa (`scripts/render/wheel-qa.cjs`) and overlay on the photo/CAD render | wiggle near 0°, no stair-stepping, thinnest spoke as in the photo |
| Tyre | 2x close-up | correct OEM size and overall diameter, crisp lettering, matte |
| Brake | close-up | right size for the car, caliper has bolts and pads |
| Registration | composite at 4x zoom | no seam between body and wheel layer |
| Finish | against the supplier render per finish | gloss level and colour match |

---

## 5. Time budget (this 4-core machine; free, runs unattended)

| Job | Time |
|---|---|
| One car, 5 views, all passes | 20–30 min |
| One wheel spin (36 frames × 5 finishes) | 45–60 min |
| Sculpt one wheel (profile tuning + checks) | 30–40 min of work |
| One wheel-layer render | 25–190 s (view dependent) |
| Three hero wheels × 5 finishes × 4 sizes × 4 views, rim layers (240) | roughly 3–4 h |
| Per-car tyre/brake layers (9 cars × 4 views × 4 sizes, white + black) | roughly 5 h |

These are measured from the proof runs and extrapolated; re-measure after the first full batch.

---

## 6. Troubleshooting (symptom → cause → fix)

| Symptom | Cause | Fix |
|---|---|---|
| Paint looks flat, washed out, white panels | white pass clipped, light too strong | `--studio dark`; check the p99 |
| White holes in the windows | floor or backdrop seen through hollow body | glass handling in `render_car.py` (floor hidden from transmission rays, cabin closed) |
| Ragged white streaks on a windscreen | crisp strip lights mirrored in bumpy glass | `glass_unlink` |
| Blotchy sunroof or roof | coplanar plastic panel z-fights the glass | hide the panel, `dark_glass` |
| Black headlight | mirrored mesh has reversed winding | `lamps` fix |
| Render crashes or runs out of memory | dense model subdivided | `no_subdiv` |
| A panel is crumpled or mottled | stacked variants of the same part | `hide` regex |
| Wheel layer looks flat and dark | the dark studio gives the rim no light | wheel-only light-linked lights (`--wheel-lights`, `--wheel-dome`) |
| Tyre reads grey instead of black | fill light on the rubber | `--rubber 0.045`, light-link away from the tyre |
| Tyre too big or small for the car | one generic 700 mm tyre | `oem_tyres.json` (`--oem`) |
| Jagged or zigzag spokes | stair-stepped photo mask | curve or bar face, `build_rim.py` smoothing, `turntable.py --resmooth --weighted` |
| Spin does not match the wheel on the car | two different outlines | one spec/outline for both |
| Brand name where it is not verified | unverified tyre row | `brand_text: null`; size text only |
| Job killed mid-render | container restart | `progress.txt`; re-run the same command |
| Live site shows old renders | stale deploy | deploy from the merge SHA, compare frame hashes |

---

## 7. Status snapshot and what is still missing

**Live today:** nine cars in the dark studio with flake layer and true BMW paints; 12 wheels with 360° spins (FSA-06, 08, 12, 13 rebuilt);
wheels on the car drawn live by the engine; M4 CS selectable.

**Proven on a branch, not live:** the Blender wheel-layer renderer (`scripts/wheels/`), OEM tyre/brake data for all nine cars
(`oem_tyres.json`), sculpted rim faces for FSA-06 and FSA-12, semi-gloss black and brushed silver materials, benchmark against BMW's configurator
(tyre, disc, caliper and sharpness close; rim face still plainer than BMW's).

**Missing before the process is fully repeatable end to end:**
1. The site cannot show wheel layers yet (compositing component, preload, fallback to live wheels, summary/PDF stills).
2. Wheel layers were tuned against the studio *before* the flake layer and darker reflections; re-verify after rebuilding.
3. The CAD route has not yet been run on real supplier CAD; the hero-wheel set (three designs) is not chosen.
4. No single wrapper command (`render-car`, `render-wheel`) and no layer manifest yet.
5. `docs/CHECKPOINT.md` is out of date; update it at the end of each stage.
6. Tyre make for the M235 and M4 CS, South African tyre fitment, default caliper colours and 22" availability are unverified.

---

## 8. File map

| Area | Files |
|---|---|
| Car renders | `scripts/prerender/` (`render-all.sh`, `export-scene.cjs`, `render_car.py`, `wheelpos.cjs`, `studio_hdri.py`), `public/renders/<id>/` |
| Rim and spin | `scripts/rim3d/` (`convert.sh`, `trace-mask.cjs`, `build_rim.py`, `sculpt_face.py`, `materials.py`, `finishes.json`, `turntable.py`, `spin-manifest.py`), `docs/rim-template/`, `public/renders/rims/` |
| Wheel layers (proof) | `scripts/wheels/` (`render_wheel_layer.py`, `compose_proof.py`, `oem_tyres.json`) |
| Site | `services/renderedBody.ts`, `components/journey/RenderedCarView.tsx`, `services/CarConfiguratorEngine.ts`, `services/wheelKit.ts`, `components/RimSpinView.tsx` |
| QA | `scripts/render/` (`oncar.cjs`, `wheel-qa.cjs`, `outlines.cjs`, `journey.cjs`, `responsive.cjs`, `e2e.cjs`, `swap-perf.cjs`, `qa-matrix.py`) |
| Data | `data/configuratorData.ts`, `supabase/migrations/`, `docs/bmw-factory-paints.md` |
| Skills | `.claude/skills/` (`forgedsa-resume`, `forgedsa-add-car-model`, `wheel3d`, `forgedsa-rim-3d-pipeline`, `forgedsa-rim-finishes`, `visual-qa`, `forgedsa-deploy-and-release`, …) |

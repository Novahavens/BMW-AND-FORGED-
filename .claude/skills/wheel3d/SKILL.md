---
name: wheel3d
description: Perfect any new FORGEDSA wheel in 3D the way the nine current ones were done, from a photo to a clean, photoreal rim on every car, size and finish. Step by step - check the photo, read it with the engine, measure it with the wheel QA (pieces, windows, symmetry, nicks and wobble, thinnest spoke), pick the route that makes it clean (photo as is, per-wheel options, a bar face drawn from measured straight bars, or an AI face mask), then the on-car render matrix, and going live. Use for "add this wheel", "this rim looks wrong / jagged / fat / broken on the car", "make wheel X perfect", or /wheel3d.
---

# /wheel3d: any new wheel, perfected

The engine builds the 3D spoke face from the **shape** of one PNG per design (its alpha).
Everything else is generated: tyre, lip, barrel, disc, caliper, lug nuts, cap, finish.
So "perfect" means two things:
1. **The face is clean:** one piece; every window present; symmetric; straight or smoothly curved
   edges with no nicks, steps or wobble; no slivers.
2. **It renders photoreal on the car:** every car, both sizes, all four finishes.

Both are measured, not judged by eye alone. The checks are in the `visual-qa` skill:
`scripts/render/wheel-qa.cjs` for the face, `scripts/render/qa-matrix.py` for the car.

Background:
- the photo rules and the engine's photo reading are in `forgedsa-rim-from-photo`;
- the finishes are in `forgedsa-rim-finishes`;
- the studio and the brakes are in `3d-car-perfect`.

## 0. Setup (once per session)

```bash
bun install
setsid nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/vite.log 2>&1 &   # dev server
mkdir -p $RIMS && cd $RIMS && curl -sO <each wheel's imageUrl>             # rim cache
```

- The sandbox browser can't reach Supabase storage, so the harnesses serve rim photos from
  `$RIMS`. The file names must be the storage names (`forged_fsa_10-<timestamp>.png`).
- **Don't edit `services/wheelKit.ts` while a render runs:** the dev server hot-reloads, and the
  shots after the edit use the new code.

## 1. Check the photo

It must be:
- **front-on**, with the whole rim and lip in frame;
- **≥ 1500 px** across the rim;
- a transparent background, with **transparent windows**.

Three-quarter shots need an AI redraw to front-on first. Compare the redraw by eye, because
designs drift. The full table is in `forgedsa-rim-from-photo` §1–2. The best input of all is the
manufacturer's CAD (Route B in `forgedsa-wheel-pipeline`), which skips all of this.

## 2. Read it and measure it

```bash
node scripts/render/wheel-qa.cjs $RIMS $OUT forged_fsa_10
```

It prints one line per wheel and writes `$OUT/<id>.png`: the mask, its outlines in yellow, and
failing windows in magenta.

| Check | Pass | Fails when |
|---|---|---|
| pieces | 1 | floating islands (an arm torn off) |
| windows | multiple of the fold | a window broken in two or merged with its neighbour |
| symmetry | IoU ≥ 0.97 | sectors disagree (angled photo, wrong fold) |
| ragged | ≤ 5% | noisy outline |
| **wiggle** | **≤ 15°** | nicks, steps, wobbly edges (live wheels before the clean-up scored 17–113°; clean ones 0–3°) |
| thinnest | ≥ 3 mm | a spoke tip too thin to extrude |

Then **look at the overlay next to the photo**, at full size. The numbers catch defects; only
your eye catches a wrong design:
- the same number of arms;
- each arm where the photo has it;
- branches (Y, V, twin) as in the photo;
- the same window shapes.

Also note the mode printed:
- `barrel`: arms traced across the barrel band (most photos);
- `flange`: a solid face ring (FSA-09);
- `stretch`: the fallback; check it hard;
- `clean`: a prepared face mask.

## 3. Make it clean: pick the route

Try them in this order. Stop at the first one that passes step 2 *and* looks like the photo.

### Route 1: the photo as it is (FSA-01–06, 08, 09)

The defaults handle most photos:
- **Straight arms** across the barrel band. Forged arms are straight bars, and a straight
  continuation of the cut-out edge is cleaner than any brightness edge in the photo.
- **Edge refit:** every spoke edge in the sector table is refitted as a locally smooth curve.
  The steps where the cut-out meets the traced arms become short tapers.
- **Canonical arms** averaged only over rows where every copy has started, so no sideways jumps.
- **Opening and closing (3/5 px):** no slivers, and no hooked window tips.

### Route 2: per-wheel options (`services/rimFaces.ts` → `RIM_FACE_OPTIONS`)

For a design the defaults don't suit, e.g.:

```ts
export const RIM_FACE_OPTIONS = { forged_fsa_xx: { straightArms: false } }; // curved arms
```

Other options (`RimPhotoOptions` in `services/wheelKit.ts`):
- `sectorMode: 'best'`: copies the single most typical sector instead of the median;
- `quantile`;
- `radialSigma`;
- `edgeBlur`;
- `edgeFit: false`.

Compare variants side by side in seconds:

```bash
node scripts/render/outlines.cjs $RIMS $OUT '[{"name":"a"},{"name":"b","straightArms":false},{"name":"c","sectorMode":"best"}]' forged_fsa_xx
```

### Route 3: a bar face, for straight-bar designs the photo can't give cleanly (FSA-07)

Use it for a photo taken at an angle, crossing bars, or a barrel seen through every gap. Draw the
face from measured bars, so it's crisp by construction:

1. **Measure one sector.**
   - Take the most front-on sector. Top or bottom are usually best: an angled photo shifts the
     left and right sectors.
   - View it with contrast and a coordinate grid:
     ```python
     # mask = photo composited on black, levels (v-200)*5, 1024 px, crop around the sector,
     # grid every 32 px with labels (see make-bar-face.py docstring)
     ```
   - For each bar, note two points on its centre line, one near the hub and one near the lip, and
     its width.
   - Convert to polar: r as a fraction of the rim radius (512 px at 1024), and the angle from the
     sector's centre line.
   - Average the mirror pair (left and right bars) to cancel the photo's angle.
2. **Write the spec:**
   ```json
   {"fold": 5, "mirror": true, "hub": 0.33, "fillet": 0.01,
    "bars": [{"from": [0.40, 18.5], "to": [0.894, 4.5], "w": 0.046},
             {"from": [0.48, 28.6], "to": [0.897, 35.7], "w": 0.046}]}
   ```
   - Bars are straight in the image plane and are extended into the hub and past the lip.
   - `w_tip` tapers a bar.
   - `rotate` turns the whole face to match the photo.
   - The FSA-07 spec above is the real one: A-legs at ±4.5° at the lip and ±18.5° at r 0.40;
     diagonals that meet the next sector's at ±36°.
3. **Generate and overlay:**
   ```bash
   python3 scripts/render/make-bar-face.py spec.json forged_fsa_xx $RIMS/forged_fsa_xx-*.png overlay.png
   ```
   Check `overlay.png`: the red outline must sit on the bars of the front-on sector. Adjust and
   rerun.
4. **Register the mask:** `RIM_FACE_MASKS` in `services/rimFaces.ts` (`'/rim-faces/<id>.png'`).
   The engine reads it in `clean` mode.

### Route 4: an AI face mask, for curved or organic designs the photo can't give cleanly

```bash
OPENROUTER_API_KEY=... python3 scripts/render/make-face-mask.py $RIMS/forged_fsa_xx-*.png forged_fsa_xx 4
```

- An image model redraws the photo as a two-colour silhouette. Several attempts are made; each is
  aligned to the photo and scored, and the best is kept if its IoU is ≥ 0.8. Its spokes are then
  carried out to the lip.
- It is less faithful than a bar face (the model drifts): always compare it with the photo.
- Pass the key in the environment only. Never commit it.

### Still failing?

The symptom → fix table is in `forgedsa-rim-from-photo` §6. Get a front-on photo or the CAD file
rather than bending the engine to one bad photo.

**After any engine change** (`services/wheelKit.ts`), re-run step 2 on **all** wheels. Every
photo wheel is rebuilt from its photo at load, so one change touches them all.

## 4. On the car: the render matrix

```bash
python3 scripts/render/qa-matrix.py $OUT $RIMS            # full: ~100 shots, ~100 min
python3 scripts/render/qa-matrix.py $OUT $RIMS --quick    # design x finish only, ~40 min
```

- Run it in the background, and don't edit the engine while it runs.
- It writes `sheet-A-design-x-finish.jpg`, `sheet-B-design-x-car.jpg`, `sheet-C-sizes.jpg` and
  `qa-matrix.json`, with a PASS/FAIL per shot (tonal range, finish read, page errors).
- Look at every sheet, then open any doubtful shot at full size.
- What to look for, and the thresholds: the `visual-qa` skill.
- A new design must render like its neighbours on every car. If it only fails on one car, the
  cause is clearance or the arch shading, not the face (`3d-car-perfect`).

## 5. Go live

1. **The wheel row:** admin → Wheels, or the n8n batch (`forgedsa-rim-from-photo` §7):
   - rim image;
   - *Build 3D spokes* ticked;
   - style text (decides the lip);
   - sizes and prices;
   - finishes.
2. **Code:**
   - any `RIM_FACE_MASKS` / `RIM_FACE_OPTIONS` entry and its `public/rim-faces/<id>.png`;
   - the row mirrored in `data/configuratorData.ts`.
3. **Ship:**
   - `bun run lint` and `bun run build`;
   - commit and push;
   - a Vercel preview, then a look on a real screen;
   - **production only when the owner says** (`forgedsa-deploy-and-release`).

## What changed to get the current nine clean (Oct 2026)

| Defect on the car | Cause | Fix (in `services/wheelKit.ts`) |
|---|---|---|
| Nicks where the spoke's cut-out half meets its traced outer half | The canonical arm averaged copies that start at different rows, so it jumped sideways each time a copy joined | Average from the row where every shaping copy has started; before that, each sector follows its own traced edges |
| Shoulders just before the join | The window fillets make the cut-out arm swell | Trim against the arm's own straight edges carried inwards (`armEdges`) |
| Remaining steps of a few px | Cut-out vs traced offsets | `regulariseEdges`: edge tracks in the sector table refitted with a sliding Gaussian-weighted parabola |
| Notches cut into arms | The Y-slot detector saw the overlap rows (traced arm drawn over the photo's window corner) as a branch pocket | Pockets count only past the handover |
| Arms narrower than the cut-out | Brightness edges follow a chamfer or rib inside the silhouette | Straight arms by default; a chamfer offset is moved back out |
| Hooked window tips at the hub | Cut-out window tips curl | 5 px closing |
| FSA-07 blobby | Angled photo of crossing bars, and an AI silhouette | A bar face measured from the front-on sector |

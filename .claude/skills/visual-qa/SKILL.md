---
name: visual-qa
description: The general quality check for any visual 3D change in the configurator (wheels, finishes, calipers, paint, studio, a new car) - measure what can be measured, render every combination the change touches, judge each shot with metrics and contact sheets, look at full size, and calibrate every threshold against a known-bad version. Covers the three harnesses (scripts/render/journey.cjs for the customer journey and responsiveness, scripts/render/wheel-qa.cjs for spoke faces, scripts/render/qa-matrix.py for the car matrix), their checks and thresholds, how to extend them to a new kind of change, and the pitfalls (hot reload mid-run, a metric that passes a visibly bad result). Use before telling anyone a visual change is done, when asked to "check every combination", "make sure it looks right everywhere", or to build a QA for something new.
---

# Visual QA: prove it, everywhere it shows

A visual change is done only when it is **right in every combination it touches**, not just in
the one close-up that was looked at. One fix for one wheel on one car can break another wheel,
another car, the 22" size or Black Gloss.

The check has four layers, cheapest first:

1. **Measure** what can be measured without rendering (geometry, masks, counts). Seconds.
2. **Render the matrix:** every combination the change touches, on the real engine. About a
   minute a shot.
3. **Judge each shot** with simple image metrics, and lay all shots out on contact sheets.
4. **Look** at the sheets, and at full size at anything doubtful, beside the reference photo.

**Never trust a metric you haven't seen fail.** Before relying on a check, run it on a version
you know is bad (the live version, `git show HEAD:<file>`). Set the threshold between the bad and
the good scores. The wheel faces' first "ragged" check passed every nicky spoke the owner had
complained about. Only a check calibrated on those spokes ("wiggle", below) catches them.

## Setup

```bash
setsid nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/vite.log 2>&1 &
```

- **Rim cache:** curl every hidden photo wheel's `imageUrl` into `$RIMS`. The sandbox browser can't
  reach Supabase storage, so the harnesses route storage requests to the cache. The six stocked
  wheels are GLB rims (`modelUrl`, `public/models/rims/`) served by Vite and need no cache.
- **Ids, not indexes:** `shoot.cjs` shot lists take `"wheel": "<wheelId>"` (an index counts the
  hidden designs too: `0` is the hidden FSA-01). `car` is an index into `BMW_MODELS` including the
  hidden cars: the live ones are 1 (M4 CS), 5 (M2 CS), 7 (M5), 8 (M5 Touring). Add `"q": "&look=stage"`
  to see what /configure draws (`&look=viewer` is the older grey viewer dome, for comparison only).
- **No GPU:** the cloud container renders with SwiftShader on CPU, about 50 s a shot.
- **Run renders in the background,** and **don't edit engine files while one runs:** Vite
  hot-reloads, so the shots after an edit use the new code, or a half-written file.
- Shell `sleep` chains are blocked. Use a background command and wait for its notification.

## Layer 0: the journey still works (`scripts/render/journey.cjs`)

```bash
node scripts/render/journey.cjs $OUT $RIMS both      # phone (390x844, touch) and desktop (1440x900)
```

Any change to the app shell, the engine or the catalogue runs this first. It drives the real app
(welcome → Enter, straight into the configurator on the car on stage → wheels step → three wheels →
size → finish → summary; there is no showroom) and writes a log and a screenshot per step. It waits
for the boot overlay by its opacity (the overlay fades to 0 and stays in the page, which Playwright
does not count as hidden). Supabase writes are stubbed (never create a real lead: each one emails the
owner).

Its selectors work with both panels: the stepped drawer customers get (`StepDrawer` in
`components/journey/Configurator.tsx`) and the viewer panel behind `?panel=viewer`
(`components/journey/ViewerPanel.tsx`):
- steps: buttons with `aria-label="Step N: Paint|Wheels|Size|Finish"` (the numbered stepper of the
  drawer, the section headings of the viewer panel;
  `getByRole('button', { name: /step 2: wheels|^wheels$/i })` and so on);
- wheel list: `aside [data-section="wheels"] li > button`; finish list:
  `aside [data-section="finish"] li > button` (the viewer panel), with the fallback
  `aside ul li > button`, which is what matches in the stepped drawer; size chips: `aside button`
  whose text matches `/^\d\d"/`;
- summary: the icon button named "Summary" when it is visible, otherwise the footer CTA
  "View your <car>" (`/^view your /i`).
Do not switch these to selectors that miss either panel.

The other journey scripts: `pdf-check.cjs` and `swap-perf.cjs` no longer click Build / Confirm;
`responsive.cjs` no longer records a showroom page; `car-switch.cjs` drives the viewer panel's car
chips, so it needs `BASE` to end in `?panel=viewer`. **`e2e.cjs` (every button and link, three
devices) still walks the showroom and has not been updated.**

Read the log for:
- **FAILED steps:** a button not found or not clickable within the timeout (a broken step, an
  overlay in the way, a modal that didn't close);
- **PAGEERROR / console.error** lines (network noise is filtered out);
- **long tasks ≥ 100 ms** after a step: main-thread work that freezes the UI (the rim photo read
  was ~1 s before it moved to a worker);
- **overflow:** elements wider than the viewport on the phone (horizontal scroll).
Then look at the screenshots at phone size: the bottom sheet, the camera bar above it, the
summary page.

Found this way (Oct 2026): the engine redrew a still scene every frame, the photo read froze the
main thread for a second per wheel, every wheel click rebuilt all four tyres, and rim thumbnails
loaded 2 MB PNGs twice per row.

## Layer 1: spoke faces (`scripts/render/wheel-qa.cjs`)

```bash
node scripts/render/wheel-qa.cjs $RIMS $OUT [idFilter]     # exit 1 if any wheel fails
```

- It builds every **photo** wheel's mask and outlines exactly as the engine does, from the cached
  rim photos. It uses the face mask and the options from `services/rimFaces.ts` when a wheel has them.
- **Scope (Nov 2026): the hidden photo wheels only.** The six stocked wheels are GLB rims
  (`modelUrl`) and this check never sees them; judge them on `shoot.cjs` sheets (below).
- It writes `wheel-qa.json` and one overlay per wheel: outlines in yellow, failing windows in
  magenta.

| Check | Threshold | Catches | Calibration |
|---|---|---|---|
| pieces | = 1 | arms torn off, floating islands | |
| windows | multiple of the fold | windows broken in two, or merged | |
| symmetry (IoU with itself turned one sector) | ≥ 0.97 | sectors that disagree | clean: 0.987–0.996 |
| ragged (outline vs smoothed copy) | ≤ 5% | noisy outlines | sharp wedge tips alone score 3.5% |
| **wiggle** (turning at an 8 px scale beyond a 48 px scale) | **≤ 15°** | nicks, steps, wobbly edges; a corner turns the same at both scales | live before the clean-up: 17–113°; clean: 0–10° |
| thinnest spoke (edge-normal rays, 2nd percentile, hub to lip) | ≥ 3 mm | tips too thin to extrude | |

Pitfalls the checks had to learn:
- **A ring crossing a spoke at a slant** reads as a thin spoke. Widths are measured along edge
  normals instead.
- **Small round windows** always look "ragged" against a smoothed copy, so outlines under 300 px
  are skipped.
- **Coarse chords jump across a sharp tip,** whose turn of nearly 180° then wraps round. The
  heading is measured at every sample instead.
- **Look at the overlays anyway.** The checks can't tell a clean face from a clean *wrong* face
  (a missing branch, the wrong arm count). Compare with the photo.

## Layer 2–3: the car matrix (`scripts/render/qa-matrix.py`)

```bash
python3 scripts/render/qa-matrix.py $OUT $RIMS            # A + B + C, ~100 shots, ~100 min
python3 scripts/render/qa-matrix.py $OUT $RIMS --quick    # A only, ~36 shots
```

**Scope (Nov 2026): obsolete until a new photo wheel is added. The legacy photo wheels and cars it was written for were deleted on 2026-11-11, so its wheel and car indexes below no longer exist; update them before using it.** The script
still takes `W = range(QA_WHEELS=9)` (wheel indexes 0-8: the hidden photo wheels; none of the six
stocked wheels, indexes 11-16), the old four finishes (`liquid_metal`, `black`, `bronze`, `silver`),
and `CARS = {0, 2, 3, 6, 8}` written when those indexes meant M4, M3, M3 Touring, M5, M8. The
`BMW_MODELS` list has since gained the M4 CS and the prepared cars, so today they are 0 = `m4_g82`
(hidden), 2 = `m4_convertible_g83` (hidden, no model), 3 = `m3_g80` (hidden), 6 = `m235_f74`
(hidden), 8 = `m5_touring_g99`. Running it tests no live car and no stock wheel. Before relying on
it again, repoint `CARS` at 1, 5, 7, 8 (M4 CS, M2 CS, M5, M5 Touring), pass wheel ids, and use the
stock-sheet finishes (`gold`, `hyper_black`, `polished_face`, `pure_bronze`, `black_matte`,
`silver`, `black`, `liquid_metal`; not every wheel offers `bronze`).

| Matrix | What (as written) | Why |
|---|---|---|
| A: design × finish | every photo wheel in the four old finishes, `frontWheel` close-up, car index 2 | each finish must read as itself on every design |
| B: design × car | every photo wheel on car indexes 0, 2, 3, 6, 8 (all hidden but the M5 Touring), front three-quarter, finishes rotating | fit, arch shading and clearance differ per car |
| C: sizes | every photo wheel at 19" and 22", close-up, car index 0 | the face scales; tyre and caliper clearance change |

- It reuses shots already rendered: delete a shot to redo it, or the folder to redo all.
- It writes `qa-matrix.json`, `sheet-A-design-x-finish.jpg`, `sheet-B-design-x-car.jpg` and
  `sheet-C-sizes.jpg` (green or red name bars), and prints PASS/FAIL per shot.

Per close-up, on the rim face ring (0.2–0.78 of the crop):

| Rule | Fails when |
|---|---|
| tonal range p98 − p5 ≥ 0.35 | a flat silhouette (plastic, a black hole, no reflections) |
| Liquid Metal p98 ≥ 0.8 | polished metal without bright reflections |
| Black Gloss p98 ≥ 0.45 | gloss black without highlights (a flat black cut-out) |
| Bronze: warm-pixel fraction ≥ 0.25 (red > green > blue, saturation > 0.3) | grey, green or washed-out bronze. Calibrated: bronze 0.38–0.70, every other finish 0.00. A mean hue over the ring failed all the bronzes: the grey disc and blue caliper behind the spokes pollute it |
| Silver, Liquid Metal, Black Gloss: warm-pixel fraction ≤ 0.05, matrix A only | a tinted finish. Not on coloured cars: a big polished face reflects the paint (22" silver on the red M4 scores 0.07–0.10) |
| no page errors | shader compile errors, missing textures, exceptions (cert and blocked-request noise is ignored) |

**Then look at every sheet:**
- **A:** the same design reads the same in all finishes; the finishes look like the reference
  shots in `forgedsa-rim-finishes`.
- **B:** every wheel sits right on every car. No caliper or hat through the spokes, no gap at
  the arch, the same face quality as in the close-up.
- **C:** the 22" face is as clean as the 19" one, and the tyre doesn't look stretched or
  balloon-like.

Open any doubtful shot at full size. Headless SwiftShader has no anti-aliasing, so judge final
gloss and colour on a real screen as well.

## Extending the QA to a new kind of change

1. **Write down what "right" means** as things you can see: "the caliper reads as a cast part
   with a logo", "paint is one colour on every panel".
2. **Find the cheapest measurement** for each: a mesh count, a mask property, a pixel statistic
   on a crop, a page error.
3. **Calibrate it:** run it on the known-bad version and on a fixed one, and put the threshold
   between them. Note both scores next to the threshold in the script.
4. **Add the combinations it touches** to the matrix (cars × views × options). Keep each shot's
   name self-describing (`B_w3_c6`).
5. **Make the script exit non-zero on any failure,** so it can gate a push.
6. Add the check, its threshold and its calibration to this skill.

## Before saying "done"

The current gate (Nov 2026):
- Layer 0 (`journey.cjs`) passes at both sizes with no FAILED step, no page errors and no long
  task ≥ 100 ms after a click.
- `node scripts/render/pdf-check.cjs <out>` saves the two-page brochure (lead and share-code writes
  stubbed).
- `shoot.cjs` sheets of the **six stocked wheels by id** (`forged_fsa001`, `forged_fsa002`,
  `forged_fsa_03`, `forged_fsa004`, `sixnine_ff1`, `sixnine_ff3`) on the live cars (indexes 1, 5, 7, 8)
  with `"q": "&look=stage"`, in the finishes each wheel offers (`docs/WHEEL_INVENTORY.md`); the
  reference is `docs/ingest/stock-wheels.jpg`. Every sheet has been looked at, and the doubtful
  shots at full size.
- When a rim file or a finish changed: the rim page (`/rims/<id>`) looked at too. It is the wheel
  studio (`shared/wheel-viewer/WheelStudio.tsx`), which loads the same rim file and finish recipe as the car but
  is not covered by `shoot.cjs`.
- Only when a photo wheel is touched: Layer 1 on **every** photo wheel (one engine change touches
  them all) and the matrix; both cover the hidden photo wheels only.
- `bun run lint` and `bun run build` pass.
- A preview deploy has been checked on a real screen, then the sheets sent to the owner.
  Production only when the owner says.

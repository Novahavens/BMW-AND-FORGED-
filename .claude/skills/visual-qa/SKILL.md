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

- **Rim cache:** curl every wheel's `imageUrl` into `$RIMS`. The sandbox browser can't reach
  Supabase storage, so the harnesses route storage requests to the cache.
- **Run renders in the background,** and **don't edit engine files while one runs:** Vite
  hot-reloads, so the shots after an edit use the new code, or a half-written file.
- Shell `sleep` chains are blocked. Use a background command and wait for its notification.

## Layer 0: the journey still works (`scripts/render/journey.cjs`)

```bash
node scripts/render/journey.cjs $OUT $RIMS both      # phone (390x844, touch) and desktop (1440x900)
```

Any change to the app shell, the engine or the catalogue runs this first. It drives the real app
(welcome → showroom → build → wheels, size, finish → summary) and writes a log and a screenshot per
step. Read the log for:
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

- It builds every photo wheel's mask and outlines exactly as the engine does. It uses the face
  mask and the options from `services/rimFaces.ts` when a wheel has them.
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

| Matrix | What | Why |
|---|---|---|
| A: design × finish | every wheel in all four finishes, `frontWheel` close-up, M3 | each finish must read as itself on every design |
| B: design × car | every wheel on every car (M4, M3, M3 Touring, M5, M8), front three-quarter, finishes rotating | fit, arch shading and clearance differ per car |
| C: sizes | every wheel at 19" and 22", close-up | the face scales; tyre and caliper clearance change |

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

- Layer 0 passes at both sizes with no FAILED step, no page errors and no long task ≥ 100 ms
  after a click.
- Layer 1 passes on **every** wheel (one engine change touches all photo wheels).
- The matrix passes. Every sheet has been looked at, and the doubtful shots at full size.
- `bun run lint` and `bun run build` pass.
- A preview deploy has been checked on a real screen, then the sheets sent to the owner.
  Production only when the owner says.

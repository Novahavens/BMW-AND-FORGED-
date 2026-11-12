# Photoreal plates: master plan

Owner's brief (11 Nov 2026), in his words:

> Build a photorealistic configurator for the 4 cars. Use our new wheel viewer to swap wheels. Only swap
> wheels, keep original caliper on car. Wheels on the configurator should be the same wheels on the website.
> Headlights should be crystal clear and have yellow daytime running lights on. Windows should be better than
> they are. Paints and finishes should show their texture and type easily. Gloss should be high gloss and
> shiny but not cheap and tacky. So too for matte, liquid metal, etc. The app's colours should be luxury.
> Do a side by side and don't stop running the cars through Blender until you achieve photorealism and fix
> any weird visual quirks. Refactor, make performant and engineer like an expert. Update the README with what
> is relevant to the new configurator. Trash everything else.

The owner rejects overstated claims. Nothing is called photoreal, done or fixed without a render that shows it.

## 1. What we are building

Every picture the customer sees is a path-traced Cycles render. The live WebGL view is replaced, because it
looked flat and jagged next to the Cycles stills.

- **Body plate:** the whole car in the studio with its factory wheels. One per car, view and paint. Opaque.
- **Wheel plate:** the wheel assemblies only (tyre, rim, disc, caliper) with everything else cut out. One per
  car, view, catalogue wheel and stocked finish, plus the factory wheel. RGBA, cropped to the wheels.
- **In the browser:** body plate with the wheel plate laid over it. Changing car, paint, wheel, finish or
  view swaps images. No 3D engine on the page.

The catalogue wheels are the website's six designs (`public/models/rims/*.glb`): FSA001 (staggered, two
files), FSA002, FSA003, FSA004, FF-1, FF-3. Only the rim is swapped. The car keeps its own tyres, discs and
calipers.

### Render matrix (`scripts/plates/plates.config.json`)

| Axis | Values |
|---|---|
| Cars | `m2_cs_g87`, `m4_cs_g82`, `m5_g90`, `m5_touring_g99` |
| Views | `front34` (the approved hero camera), `side`, `rear34`, `wheel` (front wheel close-up) |
| Paints | 21, in five finish classes: solid, metallic, pearl, frozen, satin |
| Wheels | factory + 6 designs in their stocked finishes (14 design-finish pairs) |
| Frame | 1920 x 1080, Khronos PBR Neutral, exposure -0.8 |

Totals: 336 body plates and 240 wheel plates (`python3 -I scripts/plates/tasks.py --out tasks.json`).

## 2. Code layout and who owns what

```
scripts/plates/
  plates.config.json     the matrix, quality presets, look values        orchestrator (others: own section only)
  platelib/core.py       config, paths, colour helpers                    orchestrator
  platelib/scene.py      studio + car assembly, turntable views, camera   orchestrator
  platelib/rendering.py  Cycles settings, CPU/GPU, saving                 orchestrator
  platelib/studio.py     lights, floor, backdrop                          LOOK (shared)
  platelib/paint.py      the paint shader and finish classes              LOOK (shared)
  platelib/glass.py      window glass helpers                             LOOK (shared)
  platelib/lamps.py      lens, reflector, DRL helpers                     LOOK (shared)
  platelib/cars/<id>.py  one adapter per car                              that car's agent
  platelib/rubber.py     tyres, discs, calipers                           WHEELS
  platelib/wheels.py     rim import, fitment, finishes, wheel-plate mode  WHEELS
  render.py              one frame or a batch of tasks                    orchestrator
  tasks.py, sheet.py     task list; contact sheets and side-by-sides      orchestrator
  encode.py, qa.py       masters -> AVIF/WebP + manifest; seam checks     PIPELINE
  cloud/                 the Modal GPU service and its client             PIPELINE
  bl                     runs a script under Blender, one at a time       orchestrator
```

Rules:

- Edit only the files you own. If you need a change in someone else's file, say so in your report (or, for a
  small additive helper in a shared look file, add it and say so). Never rewrite another agent's function.
- Blender-side agents do not run `git add`, `git commit` or `git push`. The orchestrator commits. The web
  agent works in its own worktree and commits there.
- Sources are read-only: `/home/claude/plates_src` (studio, cars, decoded rims). All look changes are code in
  `platelib`, applied when the scene is assembled. Do not save edited .blend files as a way to keep a fix.

### How a scene is built (`platelib/scene.py`)

`assemble(cfg, car_id)` opens the studio (the scene of the approved M2 hero), appends the car, scales camera
and lights to its size, then runs `studio.apply`, `paint`, `glass.apply`, `lamps.apply`, `rubber.apply` and the
car adapter's `apply(ctx)`. `set_view(ctx, view_id)` turns the car on a turntable and slides the camera along
its own axis, so floor and backdrop are identical in every view; then it calls each module's `on_view`.

Scene contract (all four cars): collections `Body`, `Glass`, `Interior`, `Lights`, `Mechanical`, `Wheels`;
objects `C01_Body_*`, `C02_Glass_*`, `C03_Light_*`, `C30_Interior_*`; hubs `C10_Hub_FL`, `C11_Hub_FR`,
`C12_Hub_RL`, `C13_Hub_RR` with children `C1x_Wheel_*` (rim + tyre in one mesh, split by material) and
`C2x_Brake_*`; body colour is the material `Paint`. Car faces -Y, left side +X, Z up, metres.

## 3. The look: targets and gates

Reference for the mood: the approved hero still (`/mnt/user-data/uploads/c143b1d3-image.png`). Reference for
lit yellow DRLs in clear lenses and for a matte paint that still reads as paint:
`/mnt/user-data/uploads/27a4e209-image.jpg`. Clear lenses with lit signature:
`/mnt/user-data/uploads/4df8369e-image.jpg`. What the owner called bad: white windows and blob headlights
(`/mnt/user-data/uploads/5d9738b0-image.png`), the flat jagged WebGL view (`/mnt/user-data/uploads/9f5ae6eb-image.png`).
Current stills ("before"): `/home/claude/cfg/in_stills/<car>/NN_<paint>.jpg` (front34 only).

A plate set passes only when every gate below is shown in a render at 100% scale. Report each gate as
PASS or FAIL with the image that shows it.

| Gate | What must be true |
|---|---|
| G1 Headlights | Lens is clear: reflector, projector and housing are visible through it. DRL light guides are lit, yellow (hue about 40-48 degrees, not washed to white) and are the brightest thing in the lamp. Nothing reads as a smoked or black lens. |
| G2 Glass | Cabin is visible through windscreen and side windows in every view. The windscreen carries at most a soft gradient band. No window is white, milky or opaque black. No double-shell darkening. |
| G3 Paint classes | Solid: deep, crisp continuous highlights, no flake. Metallic: bright flop, fine flake visible in the `wheel` close-up. Pearl: colour shift across the body. Frozen: broad soft sheen that follows the form, edges catch light, clearly not flat grey. Satin: between gloss and frozen. Gloss never looks like plastic: two lobes (soft coloured base, sharp coat), slight orange peel on the coat only. |
| G4 Wheels | The catalogue rim sits in the factory tyre with no gap or overlap, is centred on the hub, and clears the factory caliper. Factory tyre, disc and caliper are unchanged. Each finish reads as its type (gloss black, matte black, hyper black, silver, polished, liquid metal, bronze, gold). |
| G5 Seam | Body plate + factory wheel plate, composited, matches a direct render: 95th-percentile difference in the wheel boxes at most 2/255, no halo on any paint. The floor reflection does not give away the factory rim's colour under a catalogue wheel. |
| G6 Ground | Tyres touch the floor, contact shadow present, no floating. |
| G7 Clean | No fireflies, denoiser smears, jagged edges, missing textures, pink materials, z-fighting or stray geometry at 100%. |
| G8 Consistent | Same exposure, floor and backdrop across the four cars and across views. |

Starting values from the research report (tune by looking; they are not final):

- **Paint:** Coat Weight 1, Coat IOR 1.5. Gloss classes Coat Roughness 0.01-0.03; satin 0.12-0.25; frozen
  0.30-0.45 with Metallic 0.8-1.0 (frozen goes flat grey when it loses metallic). Flake goes into the base
  Normal only, orange peel into Coat Normal only (noise scale about 150-400 at car scale, bump 0.01-0.04,
  stronger on vertical panels). Metallic flop: darker, more saturated colour at grazing angles. Pearl: Thin
  Film Thickness 250-600 nm, IOR 1.3-1.6.
- **Glass:** Transmission 1, Roughness 0, IOR 1.52, Thin Wall (Blender 5.2) on single-sided panes, light tint,
  shadow rays let through (factor 0.7-0.9). A white windscreen is the overhead softbox mirrored at a grazing
  angle: move or shape the softbox, or accept a gradient band; do not darken the glass to hide it.
- **Lens:** Transmission 1, Roughness 0, IOR about 1.585, no tint, Thin Wall or a real 2-3 mm shell. Dark
  lenses come from stacked shells, too few transmission bounces (use 12) or tinted base colour. Reflectors
  are metal (base 0.91, roughness 0.05-0.15), not black plastic.
- **DRL:** selective yellow, about #FFBA00. Emission strength about 3-8 against paint highlights near 1.0.
  Emission sampling off. If it reads white, lower the strength or deepen the colour; do not add more light.
  BMW fits yellow DRLs only to the M4 CS of these four; the owner asked for them on all four.
- **Tyre:** base 0.02-0.03, roughness 0.6-0.75, never pure black. **Disc:** metallic, base about 0.56,
  roughness 0.3-0.4. **Caliper:** gloss paint, coat 1.
- **Wheel finishes:** gloss black 0.02-0.03 base under a 0.02 coat; matte black roughness 0.6-0.7, no coat;
  hyper black metallic 0.15-0.25 base, roughness 0.12-0.2, coat; silver 0.75-0.85, roughness 0.3; polished
  aluminium (0.913, 0.921, 0.925), roughness 0.04-0.1; liquid metal 0.9-0.95, roughness 0.01-0.04; bronze
  about (0.40, 0.26, 0.12), roughness 0.3; gold (1.0, 0.766, 0.336), roughness 0.15-0.25. Clean metals stay
  above 0.5 linear.
- **Studio:** keep the dark hero mood. A car is a mirror: place and shape lights by where their reflections
  land (shoulder line, sills). Large soft-edged sources, never small bright ones.

## 4. Rendering

**Local (sandbox, 2 CPU cores, 7 GB RAM):** always through `scripts/plates/bl`, which queues Blender sessions
on a lock so they never run together.

```
cd scripts/plates
./bl render.py --car m2_cs_g87 --view front34 --paint portimao_blue_metallic --preset preview --out /home/claude/plates_out/<you>/a.png
./bl render.py --car m5_g90 --view front34 --paint 3 --preset review --region 0.10,0.38,0.42,0.62 --out ...   # a 100% crop
./bl render.py --car m2_cs_g87 --view side --no-look --preset preview --out ...                                 # the baseline look
python3 -I sheet.py --out pair.jpg --pair before.png after.png
```

- `preview` (960 x 540, 32 samples) takes about 30 s. Use it for framing and big changes.
- For detail (lamps, glass, flake) render a small `--region` at `--preset review`; never whole frames at review
  quality locally. `--samples N` and `--scale F` override the preset.
- Other agents are waiting on the same lock. Keep renders short, look at every image you render, and do not
  loop on renders you are not going to inspect.

**Cloud (Modal GPUs):** `scripts/plates/cloud/` (PIPELINE). The sandbox cannot reach Modal's API directly, so
a GitHub workflow deploys a small HTTPS service into the owner's Modal account and the sandbox talks to that.
It is live only after the owner adds two repo secrets; until `python3 scripts/plates/cloud/client.py health`
answers, render locally. Budget: the account has $30 of free credit a month. Final plates and review frames
go to the cloud; keep a running cost ledger and stop at $24.

**Quality presets** (`plates.config.json`): `preview`, `review`, `final`. Final frames are 1920 x 1080 with
adaptive sampling and OpenImageDenoise (albedo + normal, accurate prefilter).

## 5. Outputs

Masters (PNG): `PLATES_OUT/<car>/<view>/body/<paint>.png` and
`PLATES_OUT/<car>/<view>/wheels/<wheel>__<finish>.png` (+ `.json` with the crop box as frame fractions;
the factory wheel is `factory__factory`).

Web files (`scripts/plates/encode.py`): `public/plates/<car>/<view>/body/<paint>.{avif,webp}`,
`public/plates/<car>/<view>/wheels/<wheel>__<finish>.{avif,webp}` and `public/plates/manifest.json`:

```json
{
  "version": 1,
  "frame": { "w": 1920, "h": 1080 },
  "formats": ["avif", "webp"],
  "views": [{ "id": "front34", "label": "Front" }],
  "paints": [{ "id": "alpine_white", "name": "Alpine White", "code": "300", "group": "Standard", "finish": "solid", "hex": "#EEEEEA" }],
  "wheels": [{ "id": "forged_fsa002", "name": "FSA002", "finishes": [{ "id": "gold", "name": "Gold", "hex": "#c9a24e" }] }],
  "cars": [{
    "id": "m2_cs_g87", "label": "BMW M2 CS", "chassis": "G87", "defaultPaint": "portimao_blue_metallic",
    "plates": { "front34": { "body": ["alpine_white"], "wheels": { "forged_fsa002__gold": [0.31, 0.52, 0.47, 0.83] } } }
  }]
}
```

`plates.<view>.body` lists the paints that exist; `plates.<view>.wheels` maps `<wheel>__<finish>` to its box
`[left, top, right, bottom]` in frame fractions. The page positions the wheel image with those percentages.
A missing entry means "not rendered yet": the UI shows the option as unavailable instead of a broken image.

## 6. Workstreams

| # | Name | Scope | Done when |
|---|---|---|---|
| WS1 | LOOK-M2 | Shared look (`studio`, `paint`, `glass`, `lamps`) tuned on the M2 CS, plus `cars/m2_cs_g87.py`. Owns the shared helpers' insides and the `look` and `paint_finishes` config values. | G1-G3, G6-G8 pass on the M2 in all four views; before/after sheets |
| WS2 | LOOK-M4 | `cars/m4_cs_g82.py`: lenses, DRLs, glass, baked-paint leftovers (`Hood_Stripes`, `Body_Textured`), any quirk only this car has | same gates on the M4 CS |
| WS3 | LOOK-M5 | `cars/m5_g90.py` and `cars/m5_touring_g99.py` (same front end and lamps) | same gates on both |
| WS4 | WHEELS | `wheels.py`, `rubber.py`: rim fitment on all four cars, the eight finishes, wheel-plate mode, floor-reflection fix | G4, G5 (with PIPELINE's check), G6 |
| WS5 | PIPELINE | `encode.py`, `qa.py`, `cloud/client.py`, batch runner, cost ledger; bootstrap `public/plates` from the existing stills for the web agent | manifest + encoded files from masters; seam check; cloud batch works once the service is up |
| WS6 | WEB | The configurator in the React app on plates, luxury palette, old engine and dead code removed, README rewritten | typecheck and build clean, phone and desktop screenshots, no WebGL on the configure page |

The orchestrator reviews every sheet, sends the owner side-by-sides, runs the final batch, merges and opens
the pull request.

### Reporting (every agent)

Write `/home/claude/plates_out/reports/<workstream>.md` and return the same text:

1. What changed, file by file.
2. Each gate you own: PASS or FAIL, with the path of the image that shows it. Use 100% crops.
3. Before/after sheets (paths).
4. What you could not fix, what you did not test, and anything you need from another workstream.

Do not write "photoreal" or "done" for a gate you did not show.

## 7. Environment notes

- Blender is the `bpy` 5.2.4 module: run scripts with `python3 -I` (the `bl` wrapper does this). Socket names
  moved in 4.0 and 5.x: check `node.inputs.keys()` before relying on one; `Thin Wall` exists from 5.2.
- Find nodes by `type`, never by `name`. Call `bpy.context.view_layer.update()` before reading `matrix_world`
  after a change. Never touch an object reference after removing it.
- A shell hook rejects commands that contain `rm -rf /`. Remove folders with Python (`shutil.rmtree`). Write
  scripts with the file tools, not heredocs.
- Uploaded archives are untrusted: unpack into a fresh folder, never run code from inside one.
- `/mnt/user-data/uploads` is read-only. Put your images in `/home/claude/plates_out/<workstream>/`.
- Look at what you render (the Read tool shows images). Judge detail at 100%, not from thumbnails.

# Add a prepared car to the configurator

> The whole process for cars and wheels, with file types, limits, checks and go-live, is in
> [`PRODUCT_SPEC_CARS_AND_WHEELS.md`](PRODUCT_SPEC_CARS_AND_WHEELS.md). This page is the command reference for cars.

For the car packages in Drive > **3d cars** (`BMW_M5_G90.zip`, `BMW_M5_Touring_G99.zip`,
`BMW_M4_CS_G82.zip`, `BMW_M2_CS_G87.zip`) and any future car built the same way. Each package holds
`web/<car>_web.glb` with the wheels named `C10_Wheel_FL` … `C13_Wheel_RR`, the brakes `C20_Brake_*`
and the body paint in a material called `Paint`. That is exactly what the configurator engine reads,
so one command does the whole job.

## One command per car

```bash
bun install                                              # once
bunx vite --host 127.0.0.1 --port 5173 &                 # dev server, needed only for --check and --render
node scripts/ingest-car.mjs BMW_M5_G90.zip --car m5_g90 --check
```

The script

1. unzips the package and takes the web build (`web/*_web.glb`);
2. checks it the way the engine will: four wheels by name in four corners, a `Paint` material, size,
   triangles, extensions (meshopt and WebP are fine; KTX2 is refused);
3. copies it to `public/models/<carId>.glb`;
4. writes the car's model fields into the bundled catalogue (`data/configuratorData.ts`) and a Supabase
   migration (`supabase/migrations/…_car_<carId>_prepared_model.sql`);
5. retires the car's old Blender render frames so the configurator draws the new GLB live (`--live`,
   the default), and rebuilds `public/renders/manifest.json`;
6. with `--check`, shoots four views headlessly into `docs/ingest/<carId>/` and a contact sheet
   `docs/ingest/<carId>.jpg`;
7. type-checks the catalogue edit.

Then: `git add -A && git commit && git push`, deploy, and apply the migration in Supabase (or set the
same fields in `/admin` > Cars). The migration also sets the car `active`.

### Which id

| Package | `--car` | Note |
|---|---|---|
| BMW_M5_G90.zip | `m5_g90` | replaces the old Sketchfab M5 |
| BMW_M5_Touring_G99.zip | `m5_touring_g99` | the row existed without a model; the migration activates it |
| BMW_M4_CS_G82.zip | `m4_cs_g82` | replaces the VR46 file |
| BMW_M2_CS_G87.zip | `m2_g87 --name "BMW M2 CS" --badge "M2 CS G87"` | the old "M2 Coupe" row, renamed |

A car that is not in the catalogue yet: add `--name "BMW X" --body coupe|sedan|suv|touring|…`; a row
with blank specs is created (the UI hides blank rows) for you to fill in `/admin`.

All four were ingested on 2026-11-10 (see `docs/ingest/*.jpg` for the check sheets).

### Options you may need

| Problem in the check sheet | Fix |
|---|---|
| Car faces the wrong way | `--rotation 180` (or 90 / 270) |
| Too big or small | `--length 4.79` (real length in metres) |
| A panel keeps its own colour | `--paint-match '(^\|[^a-z])paint($\|[^a-z])\|Body_Textured'` (regex on mesh + material names) |
| Model wheels still showing, forged wheels in the wrong place | `--hide-match '(^\|[^a-z])(wheel\|tyre\|brake)'`; the engine needs exactly four wheels by name |
| Only want the report | `--dry-run` |
| Re-run the screenshots without touching the renders | `--keep-renders --check` |

## Body modes: live GLB vs Blender frames

The configurator can draw a car two ways (`App.tsx`, `services/renderedBody.ts`), and it decides per view: a
view listed for the car in `public/renders/manifest.json` shows its Blender frame, any other view shows the live
GLB, and so does the turntable, because a frame is a fixed camera.

- **Live GLB** (what the ingest sets up by default): the engine draws the model with the studio lighting, paint
  shader and materials pass; the forged wheels sit in the model's arches. Any car without render frames
  works this way.
- **Blender frames** (`--render`; no GLB car shows them on the stage today, the four prepared cars are drawn live; the
  frames-only iX3 M60 below is always its frames): Cycles renders the body once
  per view (front three-quarter, side, rear three-quarter, front, wheel, top; the stepped drawer has chips for
  all but the straight-on front, which only the `?panel=viewer` panel offers) with white and black paint bases, and the browser
  recolours them for any paint. The wheels are still drawn live on top, so paint, wheel, size and finish all
  change at once. It needs Blender as a Python module:

  ```bash
  pip install bpy "numpy<2.0,>=1.26"
  SAMPLES=12 IDLE_FRAMES=1000 node scripts/ingest-car.mjs BMW_M5_G90.zip --car m5_g90 --render --check
  ```

  Nothing else changes: the same GLB is still what the turntable and any view without a frame draw, and the
  wheels stay live.

### Stills-only frames (the summary page and the PDF)

The summary page and the PDF show **Cycles-rendered bodies with the live wheels on top** for the M2 CS, M4 CS, M5 G90 and
M5 Touring, but the configurator's stage still draws those cars live. Their frames are listed in
`public/renders/stills.json` (read by `loadStillsManifest` in `services/renderedBody.ts`), not in `manifest.json`: a
view in `manifest.json` would also replace the live car on the stage. Only the three views the summary uses are
rendered (`frontThreeQuarter`, `side`, `frontWheel`). A car with no entry gets live raster stills as before.

```bash
bunx vite --host 127.0.0.1 --port 5173 &
IDLE_FRAMES=1000 node scripts/prerender/export-scene.cjs <carIndex> /tmp/prerender/<carId>.glb   # m2_g87 = 5, m4_cs_g82 = 1, m5_g90 = 7, m5_touring_g99 = 8
python3 scripts/prerender/render_car.py /tmp/prerender/<carId>.glb /tmp/prerender/<carId> --car <carId> \
  --studio dark --samples 12 --width 1440 --views frontThreeQuarter,side,frontWheel      # about 3 minutes on 4 cores
scripts/prerender/stills-frames.sh <carId> /tmp/prerender/<carId>                         # webp frames + stills.json
```

Needs `pip install bpy` (Blender 5.3 worked with the script as it is; do not install `rembg` in the same command, pip
backtracks for many minutes) and `apt-get install libegl1` (Blender aborts without it). Re-render a car after its GLB
changes. The paint recolouring, the lamps and the wheels need nothing else.

### What the frames of a prepared car need

- **Its own normals** (`keep_normals` in `CAR_FIXES`, `scripts/prerender/render_car.py`). The script welds, smooths
  and subdivides the paint panels of the old Sketchfab files. Done to a prepared car it crumples the bonnet and
  fenders (welding and re-weighting the normals), and subdividing has Blender killed for memory on an 8 GB
  machine. A prepared car renders exactly as exported.
- **Its own lamps** (`authored_lamps`). The export names a clear lamp cover `lens`, the parts behind it `lamp`, and
  keeps the glow of lit parts. With the flag the cover is clear glass and the DRLs, kidney outline and tail lamps
  are lit (capped by `LAMP_GLOW`); without it the covers and housings are satin black and nothing glows, as the
  old frames were.
- **A web GLB with 16-bit normals.** The packages' optimiser now writes them (meshopt `QUANTIZE`, not `FILTER`,
  which packs normals at 8 bits); the files are about 0.5 to 0.8 MB larger.
- **Time.** On 2 cores: the scene export takes 2.5 minutes with `IDLE_FRAMES=1000` (5.5 without; same meshes,
  cameras and wheel positions), and the six views take 21 minutes at 12 samples (`SAMPLES=12`; each of the 18
  renders has about 21 seconds of fixed cost, so fewer samples save little). `ingest-car.mjs --render` now stops
  with an error if Blender wrote no new frames; before, a killed Blender still read as "Rendered".

Going back to the old frames: `git checkout <commit> -- public/renders/<carId>` restores the frames but not
their entry in `public/renders/manifest.json` (the ingest removed it; `--dry-run` rebuilds nothing). Either
add the entry by hand (`"<carId>": [<view folders that hold gloss_w.webp>]`, the shape of the other entries),
or run `scripts/prerender/render-all.sh <carIndex>` for that one car (its index in `BMW_MODELS`, hidden cars
included: `scripts/prerender/render-all.sh 7` for m5_g90) — it re-renders that car (about 15 minutes) and then
updates that car's manifest entry (the others, frames-only entries included, are kept; frames-only cars are skipped). Do not run it with no index: that re-renders every car for hours
and overwrites the frames just restored.

## Frames-only cars (licensed models that must not be served)

Some licences allow a car only as pictures: Blendkit **Royalty Free** forbids assets that are "directly extractable in the
distribution", and a GLB the browser downloads is exactly that. Such a car is **frames-only**: its body exists on the site
only as Cycles frames, recoloured per paint like any Blender frame, with the forged wheels drawn live on top. The first
one is the BMW iX3 M60 (`ix3_m60`).

What the browser gets, all in `public/renders/<carId>/`: per view the five webp frames (`gloss_w/b`, `matte_w/b`,
`flake_w`) and a `depth.png`, plus the car's entry in `public/renders/manifest.json`:

```json
"ix3_m60": { "framesOnly": true, "views": ["front", "frontThreeQuarter", ...],
             "wheels": { "front-left": [x, y, z, scale], ... }, "footprint": [halfLength, halfWidth] }
```

How the engine copes without the GLB (`services/CarConfiguratorEngine.ts`, `mountFramesCar`, `syncFramesDepth`):

- **Wheels**: placed from `wheels` (engine space, written by the export from the same engine), not from the model.
- **Far-side wheels**: the GLB depth mask is replaced by the view's `depth.png` (distance along the view axis, 16 bits
  over 40 m in R/G, 65535 = no body), drawn first as a depth-only quad covering exactly the Blender camera's view.
- **No live body ever**: `loadCar` downloads nothing for it, `preloadCar`/`driveToCar` skip it, the turntable is refused
  (and its button hidden), `captureViews` returns nothing, so the summary/PDF stills always come from the frames.
- **The line-up** (`App.tsx lineUpCars`) admits it without `modelUrl`; its catalogue row has `model_url` NULL.

Build it (the licensed file stays in `/opt` and the git-ignored `.scratch/`; nothing of it is committed or uploaded):

```bash
scripts/blender-mcp/setup.sh <blendkit.zip>        # Blender 5.3; and: apt-get install -y libegl1
# download the .blend with the owner's Blendkit key (environment network secret for www.blendkit.com)
blender -b car.blend --python scripts/prerender/prepare_blend.py -- .scratch/private/<carId>.glb --tyre-mat '^Tire$'
bunx vite --host 127.0.0.1 --port 5173 &
CAR_QUERY='&model=/.scratch/private/<carId>.glb&len=<metres>&body=suv&paintMatch=paint_' IDLE_FRAMES=400 \
  node scripts/prerender/export-scene.cjs 0 .scratch/private/<carId>/scene.glb     # + scene.layout.json, scene.wheels.json
blender -b --python scripts/prerender/render_depth.py -- .scratch/private/<carId>/scene.glb .scratch/private/<carId>/frames
python3 scripts/prerender/render_car.py .scratch/private/<carId>/scene.glb .scratch/private/<carId>/frames \
  --car <carId> --studio dark --samples 12 --width 1440            # bpy 5.3 (pip/uv), about 25 minutes on 4 cores
scripts/prerender/frames-only.sh <carId> .scratch/private/<carId>/frames .scratch/private/<carId>/scene.layout.json
```

Then add the car to `data/configuratorData.ts` with `modelUrl: null` and a migration inserting its row (model_url NULL),
add `CAR_FIXES['<carId>'] = {'keep_normals': True, 'authored_lamps': True}` in `render_car.py` for a clean model, and
check in the browser's network tab that no `.glb` is requested for it on the welcome, configure and summary pages.

## The configurator screen is the stage look

Whatever is drawn live (a car or view without a Blender frame, and the turntable of any car) sits in the
**stage look** on the configurator screen. It is modelled on the Cycles hero stills of the welcome carousel
(`public/hero/`): a black backdrop, a pool of light on a pale floor that fades to black, the pool of shadow
around the footprint, Neutral tone mapping with the exposure set by the paint, and a black reflection cove
with one overhead softbox for solid, metallic and pearl paints (Frozen paints keep the soft grey cove). It
is still the live WebGL car: it does not have the stills' path-traced reflections and soft shadows.

The code is `services/viewerStudio.ts` (`STAGE`, `buildStageDome`, `buildStageFloor`, `buildStageCove`) and
`CarConfiguratorEngine.setLook('stage' | 'viewer' | 'studio')`. `App.tsx` sets `'stage'` for `/configure`, and
already behind the welcome's stills, so the look is built before **Enter** shows it. The headless harness
takes `?look=stage`. `?look=viewer` still draws the older look (the four-car viewer's grey gradient dome,
fogged floor and gloss cove), for comparison only; with no `look=` the harness draws the softbox studio.
The paint finish table (`VIEWER_FINISH`, by the catalogue's paint `type` Uni / Metallic / Pearl / Frozen) is
shared by the stage and viewer looks.

Stage defaults: floor peak 0.97, pool sigma 2.2 m across and 3.4 m along, overhead 12, rails 6, ring 1,
floorEnv 0.5, exposure 1.2, parts 0.35 (the share of the cove that glass, carbon, chrome, trim and lamps
mirror). For comparison renders each can be overridden from the URL: `?stagePeak= ?stageRx= ?stageRz=
?stageOver= ?stageRails= ?stageRing= ?stageFloorEnv= ?stageExp= ?stageParts=`.

## Rims the same way

A rim GLB in the website's convention (`Rim_Barrel`, `Rim_Face_Spokes`, `Center_Cap`, `Hardware_Bolts`,
no tyre; see `public/models/wheels/README.md` in the Forgedwebsite repo) goes on a configurator wheel with:

```bash
node scripts/ingest-rim.mjs ../Forgedwebsite/public/models/wheels/fsa003.glb --wheel forged_fsa_03 --check
```

It packs the file (`scripts/rim3d/pack.mjs`, to `--budget` triangles; the default is 160 000, which is above
the triangle count of every stocked rim, so they were packed without losing triangles; at 40 000 the thin
spokes broke up), writes
`public/models/rims/<wheelId>.glb`, sets `modelUrl` on the wheel in the bundled catalogue plus a migration
for `public.wheels`, and with `--check` shoots the wheel on the two prepared cars the engine page indexes as
`1` (M4 CS, `m4_cs_g82`: close-up in Liquid Metal and Black Gloss, front three-quarter in Silver) and `7`
(M5, `m5_g90`: 21" in Bronze) into `docs/ingest/rims/<wheelId>/` with a contact sheet
`docs/ingest/rims/<wheelId>.jpg`. On the car the 3D rim replaces the wheel's photo face; the rim page
(`/rims/<wheelId>`) loads the same file in the wheel studio (`shared/wheel-viewer/WheelStudio.tsx`). Spokes facing into the car: run again with `--flip`. Back to the photo face: remove
`modelUrl` (or clear "Rim 3D model" in `/admin`). `--dry-run` prints the rim check and the plan and changes
nothing (no pack, no catalogue edit, no migration, no thumbnail copy); `--port` points at a dev server on
another port; `node scripts/ingest-rim.mjs --help` lists every option.

A wheel that is not in the catalogue yet is created on the way in with `--new` and a **new** id:

```bash
node scripts/ingest-rim.mjs fsa005.glb --wheel forged_fsa005 --new \
  --name "FSA005" --code FSA005 --spokes 10 --sizes 20,21 --price-zar 75000 \
  --finishes gold,hyper_black,polished_face --default-finish gold --image ./fsa005.webp --check
```

`--new` appends a row (PLACEHOLDER copy; the ZAR price is stored in USD to the cent at the ZA rate, the same
for every size, as on the stock sheet; `--price-usd` takes a dollar price instead) to the bundled catalogue
and writes an `insert … on conflict` migration; the owner sets the real copy, and any per-size or per-finish
price, in `/admin`. `--image` copies a file into `public/rim-images/` (or takes a `/rim-images/…` path already
there). The script refuses `--new` for an id that already exists (the six wheels above included), because it
would add a second row with the same id and reactivate a wheel hidden in `/admin`: to put a rim on an existing
wheel, or to re-run with `--flip`, leave `--new` and the describing options out. `--rear <rear.glb>` packs a
second file for a staggered set (`rearModelUrl`; the engine mounts it on the rear corners). Brake parts and
tyres inside the file are dropped when packing (`--drop ''` keeps them, `--drop '<regex>'` changes the rule).
Every run writes a new, later-stamped migration file.

Thumbnails: `RimThumb` masks the photo by its alpha, so a website `front.webp` on white must be cut out
first (`rembg`, as the photo pipeline does), squared on a transparent canvas and saved as WebP with alpha
into `public/rim-images/<id>.webp`.

Website rims in the configurator on 2026-11-10, named and priced from the owner's stock sheet
(`docs/WHEEL_INVENTORY.md`): `stf399-front/rear.glb` → `forged_fsa001` (FSA001, staggered: `--rear`),
`fsa002.glb` → `forged_fsa002` (FSA002), `fsa003.glb` → `forged_fsa_03` (FSA003), `fsa004.glb` →
`forged_fsa004` (FSA004), `ff-1.glb` → `sixnine_ff1` (FF-1), `ff-3.glb` → `sixnine_ff3` (FF-3). Brake
calipers and rotors inside a rim file are dropped when packing (`scripts/rim3d/pack.mjs`; the engine draws
its own). Since 2026-11-11 the rim page draws these same files in the wheel studio
(`shared/wheel-viewer/WheelStudio.tsx`); the pre-rendered spins (`scripts/rim3d/turntable.py`, `spin-manifest.py`) are
legacy scripts whose output nothing in the app uses.
A thumbnail for a rim that has no website photo: `python3 scripts/rim3d/preview.py out.png <uncompressed
rim.glb> --size 1024x1024 --angle 0`, cut out with `rembg`, saved as WebP with alpha (FSA001 was done this
way).

## Licence

The four packages are game-derived and came without a licence (their READ ME says so). The ingest
records "Licence not confirmed" in `public/models/CREDITS.md`. Treat them as prototype assets until a
licence that covers real-time web use is in hand; BMW's trademarks are a separate matter.

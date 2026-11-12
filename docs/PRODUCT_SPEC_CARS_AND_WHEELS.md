# Product spec: adding cars and wheels to the FORGEDSA configurator

**Written:** 2026-11-11 · **Owner:** Fuzz (FORGEDSA) · **Status:** describes what the repo does today; anything not built yet is marked **Planned**.
**Companion docs:** `docs/ADD_PREPARED_CAR.md` (car commands), `docs/WHEEL_INVENTORY.md` (stock sheet), `docs/RIM_3D_PROCESS.md` and `docs/WHEEL_PIPELINE.md` (rim routes), `public/models/CREDITS.md` (licences).

---

## 1. What this spec is for

A customer picks a car, a factory paint, a wheel, a size and a finish, and sees the result in 3D. This spec says what a **new car** and a **new wheel** must be, in which file types, how they get into the app, how each is checked, and who signs off. Follow it start to finish and nothing is guessed along the way.

It is written so that one person can run it. Every step names the command, the file it produces and the check that decides whether to go on.

### What is true today (checked 2026-11-11)

| Thing | State |
|---|---|
| Active cars | M2 CS (`m2_g87`), M4 CS (`m4_cs_g82`), M5 (`m5_g90`), M5 Touring (`m5_touring_g99`). Active in the bundled catalogue and in Supabase. |
| Hidden cars | M4 Competition, M4 Convertible, M3, M3 Touring, M235i, M8, X3 M50, X5 M (and a model-less `m5_f90` row in Supabase). Hidden with `active = false`, never deleted. |
| Active wheels | Six from the stock sheet: FSA001 (staggered), FSA002, FSA003, FSA004, FF-1, FF-3. All are real 3D rim files. |
| Hidden wheels | Eleven photo-traced designs (FSA-01, 02, 04 to 09, 12, 13, 14). |
| How a car is chosen | On the welcome carousel (`HERO_SLIDES` in `components/journey/HeroStage.tsx`). **Enter** opens the configurator on the car on stage. There is no showroom page (removed 2026-11-11). |
| How a car is drawn | Live from its GLB for all four, in the stage look on `/configure` (`engine.setLook('stage')`, `services/viewerStudio.ts`). Only the M5 G90 also has Blender frames (dark studio). |
| Rim page (`/rims/<id>`) | The wheel studio (`shared/wheel-viewer/WheelStudio.tsx`) draws the same rim file the car uses. The pre-rendered 360 spin is no longer part of the app. |
| Cycles bodies in the configurator | **Planned.** Wheel-less Cycles bodies exist for the M2 CS only, in files outside the app, and are not wired in. |
| Licences | Not confirmed for the four prepared cars (game-derived). Prototype use until resolved. |

---

## 2. The three ways a car can be drawn

A car always works the first way. The other two are upgrades.

| Mode | What the customer sees | What it needs | Status |
|---|---|---|---|
| **A. Live GLB** | The car model drawn live in the studio, paint and wheels change instantly | The web GLB only | Shipped. Default for every new car. |
| **B. Blender frames** | Pre-rendered body images per view, recoloured in the browser, live wheels on top | A Blender (bpy) render run, about 15 to 25 minutes per car | Shipped for the M5 G90 only. Dark-studio look. |
| **C. Cycles bodies + live wheels** | Bodies rendered without wheels in the approved reference studio, one image per paint and view, live FORGED wheels on top | Reference studio `.blend`, Cycles run per car, wiring in `services/renderedBody.ts` | **Planned.** Not wired. Acceptance rule in section 9. |

The welcome screen is separate: it shows one Cycles still per car (`public/hero/`), baked-in stock wheels, and does not take part in the wheel swap. It is where the customer chooses the car: **Enter** opens the configurator on the car on stage (section 4.7).

---

## 3. File types at a glance

| Asset | What you receive | What the app serves | Where it lives | Hard limits and targets |
|---|---|---|---|---|
| **Car package** | `.zip` with `web/<car>_web.glb`, a `.blend`, `.fbx` and textures, a plain `.glb`, reports. A single `.glb` also works. | `public/models/<carId>.glb` | repo | See section 4.3 |
| **Rim file** | `.glb` in the website convention, or CAD (`.step`, `.iges`, `.stl`, `.obj`) | `public/models/rims/<wheelId>.glb` (+ `-rear.glb` for staggered) | repo | One complete rim, no tyre |
| **Rim thumbnail** | Product photo or a Blender front view | `public/rim-images/<wheelId>.webp`, transparent, square | repo | Storage bucket `rim-images` limit 10 MB, png or webp |
| **Welcome still** | Cycles PNG, 1600 x 900 | `public/hero/<carId>-1600.webp` and `-960.webp` | repo | About 18 to 48 KB each |
| **Blender frames (mode B)** | Rendered by `scripts/prerender/render_car.py` | `public/renders/<carId>/<view>/*.webp`, listed in `public/renders/manifest.json` | repo | White and black paint bases plus a flake frame, per view |
| **Catalogue row** | Written by the ingest script | `data/configuratorData.ts` (fallback) and Supabase `cars` / `wheels` | repo + database | Both must agree |
| **Migration** | Written by the ingest script | `supabase/migrations/<stamp>_<name>.sql` | repo | Applied to the database by the owner |
| **Credit line** | Written by the ingest script | `public/models/CREDITS.md` | repo | Must name author and licence, or say "not confirmed" |
| **Check sheet** | Made by `--check` | `docs/ingest/<carId>.jpg`, `docs/ingest/rims/<wheelId>.jpg` | repo | Looked at by a person before go-live |
| **Source masters** | `.blend`, `.fbx`, CAD, uncompressed GLB, studio `.blend` | Drive > 3d cars (not the repo) | Drive | Never overwritten; work on copies |

Never put source masters or secrets in the repo.

---

## 4. Adding a car, start to finish

### 4.1 Before you start (the gate)

Do these first. A car that fails the licence check is not built.

1. **Licence.** The file must allow commercial, real-time web use. Accept CC BY (credit required) or a paid licence that names real-time use. Reject editorial licences and CC BY-NC or CC BY-NC-SA. A "CC BY" copy of a non-commercial model is unlicensed. Many marketplace models come from games: record that in `CREDITS.md` and flag a formal check before a large launch. BMW's trademark is a separate question from the mesh licence.
   **BlendKit models (the service was formerly BlenderKit).** The owner is looking at BlendKit car models. Checked 2026-11-11 on `blendkit.com/docs/licenses` and `blendkit.com/docs/licenses/licensing-faq`:
   - Royalty Free "allows commercial use without mentioning the author, but doesn't allow for re-sale of the asset in the same form".
   - For games the FAQ says yes "if these can't be extracted by the users in an easy way" and "the assets shouldn't be directly extractable in the distribution".
   - A GLB that a browser downloads is directly extractable. So a BlendKit Royalty Free car **must not be shipped as a live GLB (mode A)**. It can be used through pre-rendered images: Blender frames (mode B) or Cycles bodies with live wheels (mode C, section 8).
   - As built today, mode B still serves the car's GLB: the engine loads it as an invisible depth mask behind the frames, and the turntable and any view without a frame draw it live (`docs/ADD_PREPARED_CAR.md`, "Body modes"). For a BlendKit car that file must not be served: that is the **frames-only** mode, built 2026-11-12 (no GLB at all; wheels and a per-view depth image from the manifest; `docs/ADD_PREPARED_CAR.md`, "Frames-only cars"). The BMW iX3 M60 is the first.
   - Those pages do not say anything about trademarks or real car brands, or whether the licence continues after a subscription ends. Both are open questions for the owner (section 10).
2. **Real figures.** Length, width, height, wheelbase, track, tyre sizes. Put them in the car spec (`car_specs.yaml`, with `# est` on every estimate).
3. **Names.** Pick the catalogue id: lowercase, digits and underscores, model plus chassis code (`m5_touring_g99`). The id is permanent because saved builds and share codes point at it.

### 4.2 Prepare the model (Blender, once per car)

A prepared package is a cleaned model. If the file comes raw, prepare it first:

1. Back up the raw file. Work on a copy.
2. Bake any rig pose, delete cameras, lights, ground planes and helper meshes.
3. Work in metres at scale 1. Car faces the way the engine expects (the prepared packages have the nose at +Z; the ingest `--rotation` fixes a car that faces the wrong way).
4. Merge vertices by about 0.01 mm. **Keep authored custom normals.** Do not recalculate or crease normals on a car body; it breaks the shading.
5. Name the parts the engine reads:

| Name | Meaning |
|---|---|
| `C10_Wheel_FL`, `C11_Wheel_FR`, `C12_Wheel_RL`, `C13_Wheel_RR` | The four road wheels, each under a hub empty `C1x_Hub_*` at the hub centre |
| `C20_Brake_*` to `C23_Brake_*` | Brakes and calipers |
| Material `Paint` | Body paint. Every panel that takes paint shares it or matches `paintMeshMatch` |
| `Caliper_Paint`, `Glass`, `Glass_Lens`, `LightDRL`, `InteriorA` | Other materials the engine styles |
| `C01_Body_*`, `C02_Glass_*`, `C03_Light_*`, `C30_Interior_*` | Parts by group |

6. Tyres at the real width, outer faces flush with the body. The wheels must sit in four corners so the forged wheels land in the arches.
7. Measure it against the spec: length, width, height, wheelbase, track, overhangs, tyre diameter and width, wheel centres. Report spec, measured and delta in a table. Over about 1% on a main dimension means fix it or say so.

The intake tooling that does most of this lives in the Project (`car-intake-runbook.md`, `tools/prep_car.py`, `tools/carcheck.py`). It refuses files with fewer than four wheel-shaped objects, files where the nose cannot be told from the tail, and files that are not a plausible car size. It cannot judge paint versus trim, and it has been tested on one real car plus hostile copies of it.

### 4.3 Export the web GLB

This is the file the browser downloads, so size and format matter.

| Requirement | Value | Why |
|---|---|---|
| Container | `.glb` (binary glTF 2.0), one file | Single request |
| Geometry compression | **meshopt** (`EXT_meshopt_compression`) | The engine's loader has the meshopt decoder. Fast to decode, works on all current loaders. |
| Normals | **16-bit** (meshopt `QUANTIZE`), not the 8-bit filter | 8-bit normals crumpled the M5's bonnet and wings (fixed 2026-11-11) |
| Textures | **WebP** (`EXT_texture_webp`), capped at 2048 px | Small download. Note WebP stays uncompressed in GPU memory. |
| KTX2 / Basis | **Refused** by the ingest | The engine's loader is not set up for it. It would cut phone GPU memory; adding it is a code change, not a file change. |
| Draco | Do not use | The engine loads meshopt; Draco gives slightly smaller geometry but decodes slower and needs a larger decoder |
| Extensions kept | `KHR_materials_clearcoat`, transmission, emissive strength | Paint and glass depend on them |
| Size target | Up to about 5 MB. Over 15 MB the ingest recompresses. Storage bucket `car-models` allows 50 MB. | Current four: 3.1 to 4.1 MB |
| Triangles, draw calls | Current four: 166k to 332k triangles, 44 to 91 draw calls. Aim for 250k to 350k triangles and under 120 draw calls. | Phones are the weak point; not yet tested on a real phone |
| Validation | Khronos glTF validator: 0 errors | Catches malformed files before the browser does |

Useful tool: `npx @gltf-transform/cli inspect <file>` lists meshes, textures, extensions and sizes. `optimize` defaults to re-encoding textures in their original format, so pass `--texture-compress webp` explicitly. Keep the uncompressed original; compression is not reversible.

### 4.4 Ingest into the app (one command)

```bash
bun install                                              # once
bunx vite --host 127.0.0.1 --port 5173 &                 # dev server, needed for --check and --render
node scripts/ingest-car.mjs <car.zip|car_web.glb> --car <id> --check
```

New car (not in the catalogue yet) also needs `--name "BMW X" --body coupe|sedan|suv|convertible|touring|gran_coupe`. The script:

1. unzips and picks `web/*_web.glb`, else `model/*.glb`, else the largest `.glb`;
2. checks it as the engine will: four wheels by name in four corners, a `Paint` material, size, triangles, extensions;
3. copies it to `public/models/<carId>.glb`;
4. writes the catalogue row into `data/configuratorData.ts` and a migration into `supabase/migrations/`;
5. retires old Blender frames for that car (mode A) or re-renders them with `--render` (mode B);
6. with `--check`, shoots four views into `docs/ingest/<carId>/` and a contact sheet `docs/ingest/<carId>.jpg`;
7. type-checks the catalogue edit and records the licence line in `CREDITS.md`.

Fix flags when the contact sheet shows a problem:

| Problem | Flag |
|---|---|
| Car faces the wrong way | `--rotation 180` (or 90, 270) |
| Wrong scale | `--length <real metres>` |
| A panel keeps its own colour | `--paint-match '<regex on mesh and material names>'` |
| Original wheels still show, or forged wheels misplaced | `--hide-match '<regex>'` (the engine needs exactly four wheels by name) |
| Report only | `--dry-run` |
| Re-shoot without touching renders | `--keep-renders --check` |

### 4.5 Fill in the car row

The ingest creates a row; the owner finishes it (in the file or in `/admin` > Cars).

| Field | Notes |
|---|---|
| `id`, `name`, `badge`, `generation`, `chassisCode` | Id is permanent |
| `engine`, `power`, `torque`, `acceleration` | Published figures. Blank is allowed; the UI hides blank rows. Owner confirms. |
| `recommendedWheelFitment` | `front`, `rear`, `pcd` (5x112), `cb` (66.6mm) |
| `bodyStyle` | `coupe`, `sedan`, `suv`, `convertible`, `touring`, `gran_coupe`. Used only when there is no GLB. |
| `paintIds` | The factory paints this car offers, in BMW's order. Empty means every active paint. |
| `modelUrl`, `modelRotationDeg`, `modelLengthM` | Set by the ingest |
| `paintMeshMatch`, `hideMeshMatch` | Regexes on mesh and material names. Defaults: paint matches `paint`, hide matches wheel, rim, tyre, brake, caliper, rotor, lug. |
| `active` | `false` hides the car. Never delete a car. |

Paint colours: BMW does not publish RGB values, so the hex values are visual approximations. A new paint code is added to the paints table (`type`: Uni, Metallic, Pearl or Frozen; roughness, metalness, clearcoat, clearcoat roughness) and listed in `docs/bmw-factory-paints.md`.

### 4.6 Check the car

Pass all of these before it goes anywhere:

- Contact sheet `docs/ingest/<carId>.jpg` read by a person: one consistent paint colour, no floating unpainted panels, glass tinted not coloured, red tail lamps and clear headlamp covers, forged wheels seated in the arches with the caliper visible behind the spokes, scale correct.
- Paint matrix: black, white, one saturated colour and one Frozen (satin), at front three-quarter, side and rear three-quarter. Black proves reflections, white proves nothing clips, Frozen proves the soft studio.
- `bun run lint` prints nothing; `bun run build` ends with "built in …".
- `node scripts/render/journey.cjs <out> <rimCache> both`: phone and desktop, no FAILED step, no page error, no long task.
- Not yet covered by any check: real phones, real GPUs, frame rate. Say so in the report.

### 4.7 The welcome carousel (where the car is chosen)

Since 2026-11-11 there is no showroom page: the welcome carousel is where a customer chooses the car, and the stepped drawer on `/configure` has no car picker (**Change model** goes back to the carousel). A car that is active in the catalogue but not on the carousel is not offered on the normal journey: it is only reached through a share code or garage build that points at it, or the `?panel=viewer` comparison panel. So a new car needs a slide.

The welcome stage has a fixed list in `components/journey/HeroStage.tsx` (`HERO_SLIDES`) and a picks table in `scripts/make-hero-stills.py` (`PICKS`). To add a car: render one Cycles still, add it to `PICKS` and `HERO_SLIDES`, run `python3 scripts/make-hero-stills.py <stills_dir>`, and add the `public/hero/<carId>-1600.webp` and `-960.webp` files. Each slide carries `paintId`, the catalogue paint its still shows: **Enter** opens the car in that paint when the car's palette has it, otherwise in the first paint of its palette (today the M2 CS opens in Portimao Blue and the M5 in Fire Red; the M4 CS and M5 Touring palettes do not have their stills' paints). A slide only shows while its car is active in the catalogue, so hiding a car in `/admin` removes it from the carousel.

### 4.8 Optional upgrade: Blender frames (mode B)

```bash
pip install bpy "numpy<2.0,>=1.26"
SAMPLES=12 IDLE_FRAMES=1000 node scripts/ingest-car.mjs <car.zip> --car <id> --render --check
```

Needs `keep_normals` and `authored_lamps` set for the car in `CAR_FIXES` (`scripts/prerender/render_car.py`) so prepared meshes are not welded and lamps keep their glow. About 2.5 minutes to export the scene and 21 minutes for six views on two CPU cores. `--render` stops with an error if Blender wrote no new frames.

---

## 5. Adding a wheel, start to finish

The configurator offers **exactly the wheels on the owner's stock sheet** (`docs/WHEEL_INVENTORY.md`). A wheel that is not on the sheet is added hidden, or not at all.

### 5.1 Choose the route

| You have | Route | Quality |
|---|---|---|
| A rim `.glb` from the website repo, or CAD (STEP, IGES, STL, OBJ) | **A. Rim file** (default) | Best. Exact geometry. |
| A straight-on product photo only | **B. Photo to 3D** | Good for flat and medium spoke designs. Depth is inferred, so deeply concave or layered designs come out wrong. Ask the maker for CAD. |
| A photo and no 3D time | **C. Flat photo face** | Fallback for the hidden legacy wheels. Spokes are traced from the cut-out. |

Before route B, see [`RIM_PHOTO_TO_3D_SPEC.md`](RIM_PHOTO_TO_3D_SPEC.md): a Nov 2026 researched
comparison against manufacturer CAD, multi-image AI reconstruction and photogrammetry, with a
decision table and a recommended low-risk pilot.

### 5.2 Route A: a rim file

**The file** (website convention):

| Requirement | Value |
|---|---|
| Container | `.glb` |
| Parts | `Rim_Barrel`, `Rim_Face_Spokes`, `Hardware_Bolts`, `Center_Cap` |
| Completeness | A complete rim: face, barrel, lip and centre. **No tyre.** The engine hides its own barrel and centre, so a missing part shows as a hole. |
| Origin and axle | Bore at the origin, axle on the thinnest axis (the engine finds it). Face toward +Z per the website spec. |
| Units | Any. The widest of Y and Z is scaled to the 20" base diameter. Proportions matter, units do not. |
| Brakes and tyres in the file | Dropped when packing (`--drop ''` keeps them) |
| Colour | The engine gives every mesh the selected finish material, so the file's colours are ignored. A mesh with its own map or normal map keeps it. |
| Website spec (for reference) | 35,000 to 80,000 triangles, 2048 px PBR textures. The configurator packs to its own budget below. |

**The command:**

```bash
node scripts/ingest-rim.mjs <rim.glb> --wheel <wheelId> --check
```

It packs the file (`scripts/rim3d/pack.mjs`: weld, simplify to the budget, quantize, meshopt) into `public/models/rims/<wheelId>.glb`, sets `modelUrl` (and `modelFlip`) on the wheel in the catalogue, writes a migration, and with `--check` shoots the wheel on the M4 CS (close-up in two finishes, front three-quarter) and the M5 (21", front three-quarter) into `docs/ingest/rims/<wheelId>/` with a contact sheet.

| Option | Use |
|---|---|
| `--flip` | Spokes face into the car in the check shot. Run again without `--new`. |
| `--rear <rear.glb>` | Staggered set: a second file packed as the rear rim (`rearModelUrl`) |
| `--budget <n>` | Triangle budget. Default 160,000 (no reduction). Thin spokes break below about 100,000. |
| `--drop '<regex>'` | Mesh names removed when packing |
| `--dry-run` | Prints the check and the plan, changes nothing |

**A wheel not in the catalogue yet** needs `--new` with a **new** id:

```bash
node scripts/ingest-rim.mjs fsa005.glb --wheel forged_fsa005 --new \
  --name "FSA005" --code FSA005 --spokes 10 --sizes 20,21 --price-zar 75000 \
  --finishes gold,hyper_black,polished_face --default-finish gold --image ./fsa005.webp --check
```

`--new` refuses an id that already exists, because it would add a second row and reactivate a wheel hidden in `/admin`. The price is stored in USD at the rate in `config/brand.ts`; `--price-usd` takes a dollar price. The script fills placeholder copy; the owner sets the real copy, and any per-size or per-finish price, in `/admin`.

**CAD input:** `bun run rim:convert wheel.step` (scripts/cad-to-glb.mjs) makes a GLB; or upload in `/admin` > Wheels > Rim 3D model.

### 5.3 Route B: photo to 3D rim

Rules for the photo: front-on (an angled photo tears the spokes), rim only, no tyre, plain or transparent background, as large and sharp as possible, outer lip touching all four edges.

```bash
bunx vite --host 127.0.0.1 --port 5173      # in another shell
scripts/rim3d/convert.sh <photo.png> <wheelId>    # about 20 seconds
```

This cleans the cut-out, traces the outline, builds a complete rim to the template profile in Blender (`build_rim.py`), packs it to `public/models/rims/<wheelId>.glb` and writes a preview to `.prerender/rims/<wheelId>/preview.png`. Then publish as in Route A. Limits: a single front photo has no depth, so depth, lip and barrel are inferred from the template; machining marks, engraving and logos are not modelled.

### 5.4 Route C: flat photo face (legacy)

The photo (`imageUrl`) is a PNG with transparent background and transparent gaps between the spokes. The app traces the gaps into bevelled 3D spokes (`services/wheelKit.ts`). The `ingest-wheel` edge function normalises the cut-out and runs the readiness test (background gone, at least 5% see-through, unbroken lip, rim fills the frame); the n8n batch workflow feeds it from a Drive folder and a `wheels` sheet. Used for the hidden legacy designs. A `modelUrl` always wins over an image.

### 5.5 Thumbnail

`RimThumb` masks the photo by its alpha, so the file must be a **transparent WebP, square, cut out** (`rembg`), saved to `public/rim-images/<wheelId>.webp`. With no photo, render a front view: `python3 scripts/rim3d/preview.py out.png <uncompressed rim.glb> --size 1024x1024 --angle 0`, cut it out and save with alpha.

### 5.6 Fill in the wheel row

| Field | Notes |
|---|---|
| `id` | Permanent. `forged_fsa_03` keeps its old id so old share codes still open. |
| `code`, `name`, `subtitle`, `style` | Shown to customers |
| `spokeType`, `spokeCount` | `multi`, `y_spoke`, `directional`, `mesh`, `aerodisc`, `clubsport` |
| `weightFrontKg`, `weightRearKg`, `weightSavingsKg` | 0 until measured |
| `standardSizes` | Strings like `'19"'` |
| `pricePerSet`, `priceBySize`, `priceByFinish` | Set of four. `priceByFinish` wins over the size price for dearer finishes (`rimPrice(wheel, size, finishId)`). |
| `availableVariants`, `defaultVariant` | Finish ids from `WHEEL_FINISHES`, for example `gold`, `hyper_black`, `polished_face`, `black_matte`, `pure_bronze`, `liquid_metal`, `black_gloss`, `silver` |
| `imageUrl`, `imageExtrude` | Thumbnail, or the photo for Route C |
| `modelUrl`, `rearModelUrl`, `modelFlip` | Set by the ingest |
| `active` | `false` hides it. Never delete a wheel. |

A new finish needs a recipe in `services/wheelFinish.ts` and a row in `wheel_finishes` (see the `forgedsa-rim-finishes` skill).

### 5.6a Check the wheel

- Contact sheet `docs/ingest/rims/<wheelId>.jpg` read by a person: spokes face outward (else `--flip`), no tyre or barrel showing through, spokes not fat, thin or broken against the source, correct in every offered finish and size, staggered front and rear if offered.
- The wheel on at least two different cars (the M4 CS and the M5 are the harness defaults).
- `bun run lint`, `bun run build`, `journey.cjs both`, and `pdf-check.cjs` if price or spec fields changed.
- The rim page: open `/rims/<wheelId>`. The wheel studio (`shared/wheel-viewer/WheelStudio.tsx`) draws the same rim file the car uses, with the same finish recipe (`services/wheelFinish.ts`). Check each offered finish, the Front / Rear switch on a staggered set, and the Exploded, Bolts and Cap toggles (offered only when the file has those parts). The pre-rendered 360 spin is no longer part of the app; `scripts/rim3d/turntable.py` and `spin-manifest.py` are legacy scripts whose output nothing uses.

---

## 6. Go live

1. Work on a branch from `main`; commit the ingest outputs together: the GLBs, the catalogue edit, the migration, `CREDITS.md`, the check sheets, and the doc changes.
2. Commit messages and the PR description end with the session's attribution lines. Do not put model names in commit or PR text.
3. **Push only with the owner's approval.** Open a draft PR. The repo has no CI, so the pre-push checks in section 4.6 are the gate.
4. Deploy a **preview** and look at it. A preview is not production.
5. **Apply the migrations** (owner): in `supabase/migrations/` order, or set the same fields in `/admin`. Compare by name, not timestamp, because the dashboard re-stamps them. Read the rows back.
6. Production deploy only after the owner has seen the preview.
7. Smoke the live catalogue: the app reports its source (`supabase`, not the fallback), the new car or wheel appears, a build saves and reloads.

Retiring a car or wheel: set `active = false` in the fallback and in a migration. Never delete: share codes and saved builds point at the ids.

### Database drift to clear first (as of 2026-11-11)

Checked by migration name against the project's applied list:

- **Applied since the first check:** `customer_accounts`, `admin_requires_confirmed_email` and `prepared_cars_keep_own_brakes` are in the applied list (read with `list_migrations` on 2026-11-11), and the SQL for `prepared_cars_keep_own_brakes` is in the repo (`20261110190000`). All fifteen `20261110*` files are applied.
- **Applied 2026-11-11:** `20261111090000_car_m2_g87_name_m2_cs.sql` (the live `m2_g87` row now reads "BMW M2 CS" / "M2 CS G87", read back through the REST API). `lead_hardening` (20261001090000) has no migration of that name in the applied list.
- **Name mismatch:** Supabase still calls `m2_g87` "BMW M2 Coupe" (badge "M2 G87"); the bundled catalogue and the welcome carousel say "BMW M2 CS". The earlier upsert updated only the model fields. The migration above fixes it.
- The `cars` table has an `m5_f90` row that the bundled catalogue does not.

---

## 7. Who decides what

| Decision | Owner | Claude or developer may do |
|---|---|---|
| Licence for a car or rim file | Fuzz | Record it in `CREDITS.md`, flag gaps |
| Real names, sizes, prices, specs | Fuzz | Fill placeholders marked PLACEHOLDER |
| Push, deploy, apply a migration, activate a car in the live catalogue | Fuzz | Prepare; never do it unasked |
| Live GLB or Blender frames or Cycles bodies for a car | Fuzz, after seeing a side-by-side | Render and compare |
| Replacing source packages (the Drive 3d cars folders) | Fuzz | Work on copies, keep originals |

---

## 8. The photoreal lane (mode C, Planned)

Today the app draws prepared cars live, which looks less real than the approved Cycles stills. Since 2026-11-11 the live stage on `/configure` is modelled on those stills (the stage look: black backdrop, a pool of light on a pale floor, one overhead softbox in a black cove), but it is still the live WebGL car: it does not have the stills' path-traced reflections and soft shadows. The plan:

1. Render each car **without wheels** in the approved reference studio (Cycles CPU, 8 samples, adaptive 0.03, OpenImageDenoise, 1600 x 900, Khronos PBR Neutral at -0.8 EV, metalness x 1.2, `Wheels` and `Mechanical` collections hidden). Scripts: `scripts/cycles/` (`batch_stills.py`, `body_hero.py`, `body_views.py`, `body_still.py`).
2. One body image per paint (21 paints) at front three-quarter, plus six view images in one paint, per car. Camera names in the scene GLB: `CAM_frontThreeQuarter`, `CAM_side`, `CAM_rearThreeQuarter`, `CAM_frontWheel`, `CAM_top`, `CAM_front`.
3. Convert to WebP and wire into `services/renderedBody.ts`; draw the live FORGED wheels on top.
4. **Acceptance:** send a side-by-side of the app against the approved still for one car (the M2 CS first) and get the owner's yes before rendering the others. Do not call any result photoreal until black, white, a saturated colour and a Frozen paint all pass at three views.

**Licence reason for this lane (BlendKit, section 4.1):** a BlendKit Royalty Free car must not be shipped as a live GLB, because a GLB that a browser downloads is directly extractable. It can be used through pre-rendered images (mode B or this mode C). When this lane is wired in, it must not serve the car's GLB to the browser either; today's mode B still does (section 4.1).

**Gap:** the reference studio `.blend` (`BMW_M2_CS_G87_clean_studio.blend`) lives only on the working machine. It must be saved somewhere durable (Drive > 3d cars) before this lane is relied on.

Render cost: 84 stills took about 54 minutes on two CPU cores (about 38 seconds each).

---

## 9. Done means

A car or wheel is done when all of these are true, and the report says which were not tested:

- [ ] Licence line in `CREDITS.md` (or "not confirmed")
- [ ] Files in the right folder, correct names, sizes inside the table in section 4.3 or 5.2
- [ ] Catalogue row filled and the fallback and database agree (by name and by field)
- [ ] Contact sheet looked at by a person
- [ ] `bun run lint` clean, `bun run build` built, `journey.cjs both` with no FAILED step
- [ ] Pushed only with approval; preview checked; migrations applied by the owner and read back
- [ ] Not tested, stated plainly: real phones, real GPUs, frame rate

---

## 10. Open decisions

1. Keep the 16-bit GLBs in the prepared-car folders? (Originals kept beside them as `.int8.bak`.)
2. Live GLB, Blender frames or Cycles bodies for the other three cars?
3. Licences for the four prepared packages.
4. Where the studio `.blend` and the source masters are stored long term.
5. Whether the website rim files (FF-1 and FF-3 use the historic `sixnine_` ids) are FORGEDSA's own designs.
6. BlendKit car models (section 4.1): the licence pages checked on 2026-11-11 say nothing about trademarks or real car brands. Is a BlendKit model of a real BMW usable on a public site?
7. BlendKit: the same pages do not say whether the licence continues after a subscription ends. Confirm before any BlendKit car is rendered for the site.
8. BlendKit: if one is used, which pre-rendered mode (B or C), given that neither may serve the car's GLB to the browser.

---

## 11. Sources

- three.js `GLTFLoader` docs (supported extensions, `setMeshoptDecoder`): https://threejs.org/docs/pages/GLTFLoader
- glTF Transform CLI (`inspect`, `validate`, `optimize`): https://gltf-transform.dev/cli
- glTF Transform `EXT_texture_webp` note (WebP needs browser support; GPU formats avoid the memory cost): https://gltf-transform.dev/modules/extensions/classes/EXTTextureWebP
- Cinevva, "How to optimize GLB files for the web" (Sept 2026; Meshopt vs Draco vs KTX2, texture order of work): https://app.cinevva.com/guides/optimize-glb-for-web
- Needle Engine optimization notes (KTX2 vs WebP in GPU memory): https://engine.needle.tools/docs/how-to-guides/optimization/
- Khronos glTF Validator: https://github.khronos.org/glTF-Validator
- BlendKit licences and licensing FAQ (checked 2026-11-11): `blendkit.com/docs/licenses`, `blendkit.com/docs/licenses/licensing-faq`
- Repo: `docs/ADD_PREPARED_CAR.md`, `docs/RIM_3D_PROCESS.md`, `docs/WHEEL_PIPELINE.md`, `docs/WHEEL_INVENTORY.md`, `scripts/ingest-car.mjs --help`, `scripts/ingest-rim.mjs --help`.

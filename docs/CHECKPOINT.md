# Checkpoint: photoreal cars and rims

**Read first:** `docs/SESSION_HANDOVER_2026-11-11.md` (what is merged and what is not, helpers still in flight, decisions waiting for the owner).

**Last updated:** 2026-11-11 · **Branch:** `ccr-f52bf849-fnf7qs` (the work in the first entry below is on it, ahead of `main`) · **To continue:** the
`forgedsa-resume` skill (`.claude/skills/forgedsa-resume/SKILL.md`) restores the tools, and this file says what is next.

## 2026-11-12: rims reflect their own studio on the stage (presentation-ready)
- **Why the rims looked fake:** on the stage look the studio lights are off and everything mirrors the stage cove, which is
  black except overhead. Spoke faces are near-vertical, so they mirrored black: Silver and Liquid Metal read as grey
  plastic, Gold as mustard, the gloss blacks as silhouettes. The rim files were never the problem.
- **Fix (ADR-001, `.10x/adrs/001-wheel-own-reflections-on-stage.md`):** the wheels reflect the softbox studio built at
  start, at `WHEEL_ENV` 0.1 (`?wheelEnv=` to compare). Body, glass and parts keep the cove. Checked with `shoot.cjs` on the
  M2 CS, front wheel, all 16 wheel-and-finish pairs, and three-quarter views of the M2 CS and M5: body unchanged.
- **Tripo CLI** 0.11.2 installs and dry-runs (40 credits for one photo, geometry only, v3.1 detailed; 30 for front + side);
  no key in this session, so no rim was generated.
- **Logins:** admin works; Google provider is off; the dealer's allowlisted email has no Supabase Auth user yet. The
  "Check your inbox" screen now tells a dealer or admin with no login to ask FORGED. Owner steps:
  `.10x/specs/2026-11-12-presentation-ready-design.md` and below in the status file.

## 2026-11-11: no showroom, stage look, stepped drawer, wheel studio on the rim page
- **Journey:** Welcome (`/`) → Enter → Configurator (`/configure`) → Summary (`/summary`). There is no showroom:
  `components/journey/Showroom.tsx` is deleted and `/models` opens the welcome. No Explore, Build or "Next model" buttons, and
  no drive-out / drive-in between cars. The footer's "Configure" link goes to `/configure`.
- **The welcome carousel is where the car is chosen** (arrows, scroll, keyboard, swipe, dots). Enter opens the configurator on
  the car on stage, in the paint its still shows when that car's palette has it (`HERO_SLIDES[].paintId` in `HeroStage.tsx`):
  the M2 CS (Portimao Blue) and M5 (Fire Red) do; the M4 CS and M5 Touring palettes do not have their stills' paints, so they
  open in their first paint. "Change model" in the configurator goes back to the carousel, which opens on the car being built.
- **The carousel's slides are a fixed list** (`HERO_SLIDES`), filtered to the cars that are active in the catalogue: a car
  hidden in `/admin` loses its slide, but a car added there is not offered until it has a slide, and *Sort order* does not
  reorder the slides (`docs/PRODUCT_SPEC_CARS_AND_WHEELS.md` section 4.7).
- **Enter is fast:** while the stills cover the canvas the engine is prepared behind them (stage look built, camera framed as
  in the configurator, the car on stage preloaded), so Enter reaches the configurator in well under a second in the harness.
- **Controls = the stepped drawer** (`StepDrawer` in `components/journey/Configurator.tsx`): Overview, then steps 1 Paint,
  2 Wheels, 3 Size, 4 Finish; a bottom sheet on phones, a side panel on wider screens; camera chips Front / Side / Rear /
  Wheel / Top and a turntable button over the stage. The owner chose it over the viewer's glass panel.
  `components/journey/ViewerPanel.tsx` still exists but only behind `?panel=viewer`; `?panel=steps` no longer exists.
- **The owner's visualisation notice** (`BRAND.visualisationNotice`, formerly the showroom's "Pre-curated vehicle" confirmation
  before Build) now shows on the summary page. `shortModelName` lives in `components/journey/carNames.ts`.
- **Stage look:** `/configure` draws live cars with `engine.setLook('stage')` (`services/viewerStudio.ts`: `STAGE`,
  `buildStageDome`, `buildStageFloor`, `buildStageCove`), modelled on the Cycles hero stills: a black backdrop, a pool of light
  on a pale floor that fades to black, and a black reflection cove with one overhead softbox. Defaults: floor peak 0.97, pool
  sigma 2.2 m across and 3.4 m along, overhead 12, rails 6, ring 1, floorEnv 0.5, exposure 1.2, parts 0.35 (the share of the
  cove that glass, carbon, chrome, trim and lamps mirror). URL overrides for comparison renders: `?stagePeak= ?stageRx=
  ?stageRz= ?stageOver= ?stageRails= ?stageRing= ?stageFloorEnv= ?stageExp= ?stageParts=`. Frozen paints keep the soft cove;
  the paint finish table (`VIEWER_FINISH`) is shared with the viewer look. In the harness `?look=stage` is what /configure
  draws; `?look=viewer` draws the older grey viewer dome, for comparison only; `?look=studio` is the softbox studio. It is
  still the live WebGL car: it does not have the stills' path-traced reflections and soft shadows.
- **Rim page (`/rims/<id>`) = the wheel studio ported from the FORGED website:** `shared/wheel-viewer/WheelStudio.tsx` (lazy chunk),
  `components/WheelStage.tsx` (the studio for a wheel with a `modelUrl`, the wheel's photo for one without),
  `shared/wheel-viewer/wheelStudioParts.ts`. Views Face / 3/4 / Side / Back / Top; Front / Rear for a staggered set (FSA001); finish
  chips; Show toggles Orbit, Spin wheel, Exploded, Wireframe, Bolts, Cap, and Brake check when the model has brake meshes. It
  loads the same rim files the car uses (`public/models/rims/`) and draws finishes with `services/wheelFinish.ts`, so a finish
  is the same on the rim page and on the car.
- **Removed:** `components/RimSpinView.tsx` and `public/renders/rims/manifest.json`. No spin frames existed for the six stocked
  wheels. The pre-rendered 360° spin is no longer part of the app. `scripts/rim3d/turntable.py` and `spin-manifest.py` still
  exist but nothing in the app uses their output (legacy). The engine's `showcase` constructor option is no longer used by the app.
- **Harnesses (`scripts/render/`):** `journey.cjs` goes welcome → Enter (straight into the configurator) → wheels step → three
  wheels → size → finish → summary, and waits for the boot overlay by its opacity. `car-switch.cjs` drives the viewer panel's
  car chips, so it needs `BASE` to end in `?panel=viewer`. `responsive.cjs` no longer records a showroom page. `pdf-check.cjs`
  and `swap-perf.cjs` no longer click Build / Confirm. **`e2e.cjs` still walks the showroom and has not been updated.**
- **Renders here are slow:** the cloud container has no GPU; headless renders use SwiftShader on CPU (about 50 s a shot).
- **BlendKit licence finding** (the owner is looking at BlendKit car models; a Royalty Free model must not ship as a live GLB):
  `docs/PRODUCT_SPEC_CARS_AND_WHEELS.md` section 4.1.
- **Not done:** `e2e.cjs`; the branded client PDF (`docs/FORGEDSA-Client-Handover.pdf`) has not been regenerated since this change.
- **Menu:** the hamburger menu and top bar went with the showroom (`components/journey/TopBar.tsx` is deleted). Its links now
  live in the configurator's "More options" dialog (the … button in the drawer header, `MoreOptionsModal` in
  `components/journey/Configurator.tsx`): The wheels, Enquire, Delivery & fitment, Terms & conditions, Credits, next to Region,
  Load a configuration, Account & garage and Start again (which returns to the welcome). There is no "Home", "Models" or
  "Configure" menu entry any more. The welcome keeps its own "The wheels" link and social icons.

## 2026-11-11: welcome stage, Cycles stills, 16-bit normals (PR #3)
- **Welcome screen** is a dark studio stage that cycles Cycles-rendered stills of the four cars (arrows, scroll, keyboard,
  swipe, dots; Enter opens the showroom on the car showing): `components/journey/HeroStage.tsx`, `WelcomeGate.tsx`,
  `public/hero/*.webp`, `scripts/make-hero-stills.py`. Checked headless at phone, desktop and landscape-phone; not on a real device.
- **Cycles scripts** in `scripts/cycles/` (`batch_stills.py`, `body_hero.py`, `body_views.py`, `body_still.py`). Wheel-less M2 CS
  bodies (21 paints, six views) exist but are **not wired into the configurator**, and the reference studio `.blend` is not in the repo.
- **Four prepared GLBs rebuilt with 16-bit normals** (the 8-bit ones crumpled the bonnet). **M5 G90 has Blender frames** in six
  views including a new `front`; it is the only car with frames, the other three prepared cars are drawn live.
- **Not done:** Cycles bodies in the app and the live wheels over them; wheel-less bodies for M4 CS, M5, M5 Touring; licence for
  the four packages; any real-device or GPU test.
- **Process for adding cars and wheels, start to finish:** `docs/PRODUCT_SPEC_CARS_AND_WHEELS.md`.

## 2026-11-10: the four prepared cars are in (live GLB mode)
The owner's prepared packages (Drive > `3d cars`: M5 G90, M5 Touring G99, M4 CS G82, M2 CS G87; clean meshes,
`C10_Wheel_FL..` nodes, `Paint` material) replace the Sketchfab bodies. `scripts/ingest-car.mjs` is the one-command
route (`docs/ADD_PREPARED_CAR.md`); it copies the GLB to `public/models/<carId>.glb`, writes the catalogue fields and a
migration, and **retires the Blender frames of that car** so the configurator draws the GLB live (the frames were
renders of the old dented bodies). `--render` re-renders Blender frames from the new GLB (bpy, ~15 min/car) if the
photoreal route is wanted back for these cars. Check sheets: `docs/ingest/<carId>.jpg`. Rims: `scripts/ingest-rim.mjs`
puts a website-convention rim GLB on a wheel (FSA-03 done from the website's `fsa003.glb`; sheet in `docs/ingest/rims/`).
The migrations in `supabase/migrations/2026111013*_*` still have to be applied (no Supabase MCP in that session).
The configurator screen now uses the four-car viewer's studio for live cars (`services/viewerStudio.ts`, `engine.setLook`): dome,
fogged floor, pool shadow, Neutral tone mapping, gloss / soft coves by paint; `?look=viewer` in the harness.
**The panel is the viewer's too** (`components/journey/ViewerPanel.tsx`, rendered by `Configurator.tsx`; `?panel=steps` shows the
old stepped panel for comparison): Car chips, paint swatch groups by finish, rim thumbs, size chips, finish swatches, view chips
(incl. the new `front` preset), Auto-rotate, price + CTA; the paint name sits bottom-left of the stage. The harness selectors
("Step N: …" headings, "Summary", "Wheel details", "View in 360°", "Change model", "View your …") are kept.
**Legacy cars hidden** (`active: false` in the fallback + `20261110141000_legacy_cars_hidden.sql`): the showroom and configurator list
the four prepared cars until their packages arrive.

**Later the same day: the wheel catalogue is the stock sheet** (`docs/WHEEL_INVENTORY.md`, migration
`20261110153000_wheel_inventory_stock_sheet.sql`): FSA001 (staggered, `rearModelUrl` + engine support in `applyWheelDesign`),
FSA002, FSA003 (`forged_fsa_03` renamed), FSA004, FF-1, FF-3 with the sheet's sizes, finishes (new `gold`, `hyper_black`,
`polished_face`, `pure_bronze`, `black_matte`) and ZAR prices (USD ÷ 18.2; dearer finishes via `priceByFinish` /
`price_by_finish`, read by `rimPrice(wheel, size, finishId)` everywhere incl. the lead email). The eleven photo-traced wheels
are hidden (`active: false`; `WheelDesign.active`, `STATIC_CATALOG` filters). `pack.mjs` drops brake meshes inside rim files.
**"FORGED" plates** (the viewer's, ported: `engine.addNumberPlates`, `wheelKit.plateTexture`; `?plates=0`). **Customer accounts**
(Google via Supabase Auth, profiles, garage, `user_id` on share codes and leads): `docs/ACCOUNTS.md`,
`20261110150000_customer_accounts.sql`, `services/authService.ts`, `components/journey/AccountSheet.tsx`. Check sheets:
`docs/ingest/stock-wheels.jpg`. **Preview:** <https://forgedsa-configurator.onrender.com> (Render static site, bundled catalogue;
README → Hosting). Verified: tsc, vite build, `journey.cjs` phone + desktop, `pdf-check.cjs` (brochure 2 pages, lead +
share-code writes stubbed), accounts sheet check at both sizes.

## Goal of this phase (since 2026-11-10)
The owner's **four prepared cars** (M2 CS, M4 CS, M5, M5 Touring) drawn live from their GLBs in the stage look (the viewer
look until 2026-11-11), with the **six stock-sheet wheels** (FSA001-004, FF-1, FF-3) as GLB rims, in the sheet's sizes,
finishes and prices, verified with the harness (`journey.cjs` both sizes, `pdf-check.cjs`, `shoot.cjs` sheets of the six
wheels). Next: apply the migrations, Google sign-in (queue below). Spins for the six wheels are no longer planned: the rim
page draws the rim GLB in the wheel studio.

*Superseded (Oct 2026 goal, kept for the history below):* M4 Competition and M5 G90 with Twin-Y (FSA-12), Star 6 (FSA-13),
Kyalami 15 (FSA-03), Turbine 25 (FSA-14). FSA-12/13/14 are hidden (`active: false`); the `forged_fsa_03` id now carries
the stock FSA003 GLB, not the photo-traced Kyalami 15.

## How it works now (decided, keep)
| Surface | What renders it |
|---|---|
| Car body (configurator) | **Prepared cars (M5, M5 Touring, M4 CS, M2 CS since 2026-11-10): the GLB live** (`docs/ADD_PREPARED_CAR.md`). **The M5 G90 also has Blender Cycles frames** (`public/renders/m5_g90/`, six views), which the configurator shows in those fixed views while the turntable is off, recoloured per paint in the browser (`scripts/prerender/`, `components/journey/RenderedCarView.tsx`); it is the only car with frames. The eight hidden cars have no body in the repo: commit `b62b126` (2026-11-11) removed their Sketchfab GLBs and the frames six of them had, so a hidden car needs a new model before it can be shown again. The frames since 2026-10-07: darker reflection panels in the `STUDIO=dark` studio (no milky haze), a third `flake_w` frame (metallic base) blended in for Metallic/Pearl paints (`flakeLook` in `services/renderedBody.ts`), `BODY_EXPOSURE` 1.25 |
| Wheels on the car | live engine. **The six stocked wheels are 3D rim GLBs** (`modelUrl`, `rearModelUrl` for the staggered FSA001; `scripts/ingest-rim.mjs`; a GLB wins whenever `modelUrl` is set in `applyWheelDesign`), lit by the stage look on the live cars. The **2D photo/bar face** (`imageUrl`, `services/rimFaces.ts`, Blender studio HDR `public/env/forgedsa_studio.hdr`) applies only to the hidden legacy wheels |
| Rim detail page | **The wheel studio** (since 2026-11-11): `shared/wheel-viewer/WheelStudio.tsx` via `components/WheelStage.tsx` draws the wheel's rim GLB (the same file as on the car) live, with fixed views, finish chips and Show toggles; a wheel without a `modelUrl` shows its photo. The Blender 360° spin (`scripts/rim3d/turntable.py`, `RimSpinView.tsx`) is no longer part of the app |
| Finishes (legacy spin scripts) | `scripts/rim3d/finishes.json` + `materials.py`: Liquid Metal, Satin Bronze, Satin Gold, Gloss Black, Silver = brushed aluminium. Nothing in the app uses their output |
| Finishes (car and rim page) | `services/wheelFinish.ts` (Satin Gold live in Supabase on every wheel since 2026-10-04) |

## Status of the Oct 2026 target set (history: these wheels are hidden since 2026-11-10, the M4 Competition too)
| Item | M4 Competition | M5 G90 | Rim page spin |
|---|---|---|---|
| Body (Blender) | done | done | n/a |
| FSA-12 Twin-Y | done (on-car check) | done | ✓ complete; brighter chrome, flat barrel |
| FSA-13 Star 6 | done | done | ✓ complete; brighter chrome, flat barrel |
| FSA-03 Kyalami 15 | done | done | ✓ complete; brighter chrome, flat barrel |
| FSA-14 Turbine 25 | done after fold fix | done after fold fix | ✓ complete; brighter chrome, flat barrel |

**Live since 2026-10-05:** FSA-12/13/14 are active in Supabase (migration `20261004180000_wheels_fsa_12_13_14_live.sql`)
with PLACEHOLDER names/sizes/prices from FSA-05. **Every one of the twelve spun wheels has a rim page spin, but eleven of the twelve (FSA-03 is now the stock FSA003)
are hidden since 2026-11-10 (`active: false`); the six active stock wheels have no spin yet** (queue). *(2026-11-11: the spin
frames are no longer in the repo and the app no longer shows spins; see the first entry.)* FSA-01, 02, 04,
05, 06, 07, 08, 09 were added on 2026-10-05 (FSA-07 built from `public/rim-faces/forged_fsa_07.png`; FSA-09 rendered
with `turntable.py --resmooth`). Weakest matches: FSA-07 Dezzi Star, then FSA-04 Scribante 3P.

On-car check sheets for the five cars that were active in Oct 2026 (legacy bodies; M4 G82, M3, M3 Touring and M8 are hidden
now, the M5 G90 is a new prepared GLB): `docs/rim-template/oncar/{m4_g82,m3_g80,m3_touring_g81,m5_g90,m8_f92}.jpg`
(made with `scripts/render/oncar.cjs`; `PORT=` picks the dev server). The four live cars' sheets are `docs/ingest/<carId>.jpg`
and the stock wheels' `docs/ingest/stock-wheels.jpg`. Car body fixes in `scripts/prerender/render_car.py`
`CAR_FIXES`: M8 keeps only the Competition fender (four stacked variants z-fought), M3 has thin windscreen glass and
renders without subdivision (it needs >12.7 GB subdivided). Both re-rendered and live.

Responsive: `scripts/render/responsive.cjs` passed 180/180 (12 pages × 15 devices incl. iPad 834×1194 and 1366×1024) with
the showroom page still in its list. Since 2026-11-11 the list has 11 pages (no showroom); no run of that list is recorded here.
Headless Chromium needs the proxy CA in `$HOME/.pki/nssdb` (`apt install libnss3-tools`, then `certutil -d sql:$HOME/.pki/nssdb
-A -t C,, -n agent-proxy -i /root/.ccr/agent-proxy-ca.crt`); without it Supabase fails and the app silently uses the
bundled catalogue.

**Owner review page:** https://claude.ai/artifact/XfokPgUT8rYWeJJKBy1UkT. Verdicts and notes land in its database,
collection `feedback` (doc ids `car_<carId>`, `rim_<wheelId>`, `details_<wheelId>`, `decision_star6`,
`decision_m3t_headlights`); read them with ArtifactData `list`.

## Queue (do the top unchecked item; tick it when committed)
- [ ] Supabase migrations, checked by name on 2026-11-11: the four cars, legacy cars hidden, the `_wheel_*_rim_model` files, the
      wheel inventory, `car_specs_m2cs_m5touring`, `customer_accounts`, `admin_requires_confirmed_email` and
      `prepared_cars_keep_own_brakes` are applied (all fifteen `20261110*` files; read with `list_migrations`) and the four
      prepared cars are active. No migration named `lead_hardening` is in the applied list. `20261111090000_car_m2_g87_name_m2_cs.sql` was applied
      on 2026-11-11 with the owner's go-ahead (`m2_g87` is now "BMW M2 CS" / "M2 CS G87"). Then deploy and smoke the live catalogue (source `supabase`).
- [ ] Owner: Supabase dashboard → Authentication → Providers → Google (client id/secret, redirect URLs) per `docs/ACCOUNTS.md`;
      then the manual sign-in → save → garage test on the preview URL.
- [x] Rim-page spins for the six stocked wheels: dropped on 2026-11-11. The rim page draws the rim GLB in the wheel studio
      (`shared/wheel-viewer/WheelStudio.tsx`), so no spin frames are needed.
- [ ] `scripts/render/e2e.cjs` still walks the showroom (Build, Confirm, `?panel=steps`): update it to the journey without one.
- [ ] Regenerate the branded client PDF (`docs/handover/handover.html` → `docs/FORGEDSA-Client-Handover.pdf`): it still shows the showroom.
- [ ] Owner: look at `docs/ingest/*.jpg` and `docs/ingest/stock-wheels.jpg`; decide live GLB vs `--render` Blender frames for the four prepared cars.
- [ ] Owner: licence for the four prepared cars (game-derived, none supplied); real M5 Touring / M2 CS specs and palettes.
- [ ] Optional: the viewer's GTAO + SMAA composer behind a flag (`CarConfiguratorEngine.AO`) for the on-screen frame.
- [x] Spins for FSA-12, FSA-13, FSA-03, FSA-14 (all five finishes).
- [x] Re-render Liquid Metal + Silver for those four (brighter chrome surround, plain barrel; review fixes).
      All four wheels completed with improved chrome reflections and consistent brushed barrel texture.
- [x] Owner approved the four spins; FSA-12/13/14 inserted into Supabase and live (placeholders).
- [x] Re-shot the on-car sheets (Black now reads black) and extended them to all five active cars.
- [x] Rim page screenshots: 4 wheels × 2 finishes × phone / iPad portrait / iPad landscape / desktop.
- [x] M8 fender and M3 windscreen fixed and re-rendered; tablet/phone responsive pass; spins for all 12 wheels.
- [x] Round 1 answers worked through (PR #9, merged, live): FSA-14 straight blade edges (built from `fsa_14-spec.json`),
      FSA-09 mesh fills the face, FSA-02 spokes in one piece, FSA-04 arms bend (`docs/rim-template/fsa_0{2,4,9}-shapes.json`,
      `turntable.py --resmooth --weighted`); M3 Touring headlights (`CAR_FIXES['m3_touring_g81']` lamps); wheel swaps no
      longer freeze (spokes built in `services/rimFaceBuild.ts` in the worker, tyre/shell cache, `scripts/render/swap-perf.cjs`);
      code-review fixes (bounded image caches, phone memory, no GEMINI define).
- [x] Navigation dead ends fixed (PR #11): rim Back returns to its opener, Back never leaves the site, /summary → /configure,
      menu Escape, unknown rim id → not found. `scripts/render/e2e.cjs` clicks every control (lead/saved-config writes faked);
      desktop journey checks pass so far; a full run takes hours on SwiftShader, so run it section by section
      (`node scripts/render/e2e.cjs <out> desktop journey|forged|rims|info|deeplinks`).
- [x] Owner round 3 (rim page review of 2026-10-06): FSA-06 FORGED on the centre cap (car: `RIM_CAP_TEXT` in `services/rimFaces.ts`,
      spin: `"cap": {"text": "FORGED"}`) and car = spin; FSA-08 (hub streaks, polished three-piece lip with 40 bolts, spoke count 15);
      FSA-12 spokes as thick as the reference photo (~0.11 R mid-length, was 0.06-0.075); FSA-13 jagged spokes gone (smooth curved blades,
      `scripts/render/make-curve-face.py`). All four spins are rebuilt to the engine's hub kit: dished face (`dish_curve: parabola`),
      spoke ends 10 mm behind the lip, five lug nuts, black cap with gold ring and lettering, polished bolted lip for two/three-piece
      (specs: `docs/rim-template/fsa_{06,08,12,13}-rim.json`; face sources `fsa_12-curve.json`, `fsa_13-curve.json`). The other eight
      spins still have the older plain hub and flat face: re-render them from the same spec keys when convenient.
- [ ] **Owner round 2**: re-check FSA-14, 09, 02, 04 and the M3 Touring lamps on the review page (answers in `rim2_<id>`
      and `recheck_m3t_headlights`); cars and the other spins still unmarked.
- [ ] **Broken social links** (config/brand.ts): YouTube @ForgedSA 404, TikTok @forgedsa not found, www.forgedsa.com
      doesn't connect, Instagram unverifiable (login wall). Need the real handles from the owner.
- [ ] Real names, sizes and prices for FSA-12/13/14 → `/admin` or a migration, mirrored in `data/configuratorData.ts`
      (owner: keep placeholders for now). Contact phone/email stay placeholders (owner's choice).
- [ ] Owner decisions: Star 6 (keep, or front-on photo), Aldo Fork 15 spoke count (photo 12 vs name 15).
- [ ] Stale draft PRs #6 (2D wheel stage), #8 (old phone fixes), #10 (live-WebGL paint/lighting recalibration): all
      conflict with main and predate the Blender bodies; owner to decide close vs salvage (#10's verified paint codes).
- [x] Optional: re-render the other eight spins with `--resmooth --weighted` for cleaner hub reflections. Dropped on
      2026-11-11: the app no longer shows spins.

## Later (parked)
- **Photo 7** (champagne, forked spokes) may be a different design from the catalogue's 12-spoke Aldo Fork 15: ask.
- Cars: the M4 Convertible has no real 3D model (placeholder body; hidden); X3 M50's model has filled
  wheel arches (hidden). The M5 Touring is one of the four prepared GLBs and live. Paid models need the owner's OK.
- Summary page and PDF stills still come from the live WebGL car, not the Blender renders.
- Spin frames: no longer in the repo (`public/renders/rims/` is gone) and no longer shown by the app (`RimSpinView` was
  removed on 2026-11-11), so there is nothing left to move to Supabase storage.
- Not modelled on 3D rims: lip engraving, logos, milled channels on traced faces.

## Decisions log (so they aren't asked twice)
- Pre-rendered bodies instead of live WebGL cars **for the Sketchfab-era cars** (their GLB panels were dented; shader tweaks
  couldn't fix it). Superseded on 2026-11-10 for the four prepared cars: clean packages, drawn live from the GLB in the
  viewer look (`--render` can bring Blender frames back for them if the owner prefers).
- Free only: render on this CPU; no GPU rental, no paid APIs.
- Template rim: "High poly Rims" (CC-BY-4.0, credit in `docs/rim-template/PROFILE.md`), benchmark only.
- Silver in spins = brushed aluminium; Satin Gold measured from the client's photo (#c4aa7f).
- New wheels went live only after the owner approved their spin (Oct 2026, photo-traced wheels). Superseded on 2026-11-10:
  **the stock sheet is the catalogue** (`docs/WHEEL_INVENTORY.md`); stocked wheels are live as GLB rims without a spin,
  legacy wheels and cars are hidden (`active: false`), never deleted.
- 2026-11-10: live GLB for the prepared cars; viewer look and viewer panel on /configure; customer accounts via Google on
  Supabase Auth; admin allowlist untouched.
- 2026-11-11 (owner): no showroom, the welcome carousel leads straight to the configurator; the stepped drawer instead of
  the viewer's glass panel (kept behind `?panel=viewer`); the live stage modelled on the Cycles hero stills (`look=stage`);
  the FORGED website's wheel studio on the rim page instead of the pre-rendered spin.

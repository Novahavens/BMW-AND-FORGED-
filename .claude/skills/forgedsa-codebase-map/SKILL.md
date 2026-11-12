---
name: forgedsa-codebase-map
description: Orientation for the FORGEDSA BMW M forged-wheel configurator (React 19, Vite, Three.js, Supabase, Vercel, n8n). Covers where the customer journey, 3D engine, catalogue, pricing, admin, PDF, leads and automations live, and the conventions for editing them. Use at the start of any task on this repo, or when unsure which file owns a behaviour.
---

# FORGEDSA codebase map

**Live:** https://forged-configurator.vercel.app (admin at `/admin`). The package manager is `bun`
(`bun run dev|build|lint`, where lint = `tsc --noEmit`).

## Customer journey (`App.tsx` routes)

| Route | Component |
|---|---|
| `/` welcome: the dark carousel of Cycles stills where the car is chosen (arrows, scroll, keyboard, swipe, dots), region picker, Enter | `components/journey/WelcomeGate.tsx`, `HeroStage.tsx` (`HERO_SLIDES`, images in `public/hero/`), `BootLoader.tsx` |
| `/models` | opens the welcome (the showroom is gone; `components/journey/Showroom.tsx` is deleted) |
| `/configure` the stepped drawer: Overview, then 1 Paint, 2 Wheels, 3 Size, 4 Finish (a bottom sheet on phones, a side panel on wider screens); camera chips Front / Side / Rear / Wheel / Top and a turntable button over the stage; "Change model" goes back to the welcome | `StepDrawer` in `components/journey/Configurator.tsx`, which also holds the wheel-info and More options modals. `components/journey/ViewerPanel.tsx` (the viewer's glass panel) only shows with `?panel=viewer`; `?panel=steps` no longer exists |
| `/summary` stills, share code, PDF gate, enquiry, the visualisation notice (`BRAND.visualisationNotice`) | `components/journey/SummaryPage.tsx`, `EnquiryModal.tsx` |
| `/forged` collection | `components/ForgedPage.tsx` |
| `/rims/<id>` one wheel in the 3D wheel studio | `components/RimDetailPage.tsx`, `components/WheelStage.tsx`, `shared/wheel-viewer/WheelStudio.tsx` (lazy chunk), `shared/wheel-viewer/wheelStudioParts.ts` |
| `/terms`, `/delivery` | `components/InfoPage.tsx` + `config/pages.ts` (`LEGAL_DRAFT`) |
| `/?config=CODE` reopen a build | share codes via `services/journeyService.ts` |
| `/admin` | `components/admin/*` |

The journey is Welcome → Enter → Configurator → Summary. There is no showroom, and no Explore, Build or
"Next model" buttons. Enter opens the configurator on the car on the welcome stage, in the paint its still
shows when that car's palette has it (`HERO_SLIDES[].paintId`). While the stills cover the canvas the engine
is prepared behind them (stage look built, camera framed as in the configurator, the car on stage preloaded).

Shared UI lives in `components/journey/ui.tsx` (Button, Modal, PaintChip, RimThumb, Logo) and
`components/SiteFooter.tsx` (its "Configure" link goes to `/configure`). `shortModelName` is in
`components/journey/carNames.ts`. Navigation uses `services/nav.ts` (`goTo`, `linkTo`, pushState).

There is no hamburger menu or top bar: they went with the showroom (`components/journey/TopBar.tsx` is
deleted). Their links live in the configurator's "More options" dialog (the … button in the drawer header,
`MoreOptionsModal` in `components/journey/Configurator.tsx`; `menuLinks` in `App.tsx`): The wheels, Enquire,
Delivery & fitment, Terms & conditions, Credits, next to Region, Load a configuration, Account & garage and
Start again (which returns to the welcome). There is no "Home", "Models" or "Configure" entry. The welcome
keeps its own "The wheels" link and social icons.

## Engine and 3D

- `services/CarConfiguratorEngine.ts`: scene, studio lights, HDRI, contact shadow, the camera
  presets (`setCameraPreset`), `loadCar`/`mountCarModel` (paint and hide regexes, wheel
  placement), `applyWheelDesign`, `setRimSize`, `captureViews` (stills for the summary and PDF),
  `setLook('stage'|'viewer'|'studio')`. `/configure` draws live cars in the **stage** look
  (`services/viewerStudio.ts`: `STAGE`, `buildStageDome`, `buildStageFloor`, `buildStageCove`), modelled on the
  Cycles hero stills: black backdrop, a pool of light on a pale floor that fades to black, a black reflection
  cove with one overhead softbox (Frozen paints keep the soft cove), exposure and finish table
  (`VIEWER_FINISH`) by paint. `'viewer'` is the older grey viewer dome (comparison only), `'studio'` the
  softbox studio. The `showcase` constructor option is no longer used by the app.
- Wheels: `services/wheelKit.ts` builds the tyre, rim lip and barrel, brake disc, caliper, lug
  nuts and centre cap, and turns rim photos into clean 3D spokes (`processRimPhoto` →
  `traceMaskShapes` in `services/rimExtrusion.ts` → `buildSpokeFace`).
  - Other sources: `services/proceduralRims.ts` for designs without a photo, a GLB rim, or CAD →
    GLB (`services/cadToGlb*.ts|js`, `scripts/cad-to-glb.mjs`).
- Look:
  - `services/studioSoftbox.ts`: generated studio reflections;
  - `services/paintShader.ts`: flake and flop;
  - `services/carMaterials.ts`: glass, lenses, chrome, trim and interior for downloaded car
    models.
  - The method is in `docs/PHOTOREAL_METHOD.md` and the `3d-car-perfect` skill.
- Render checks: `scripts/render/` (headless engine page + batch screenshot script). `?look=stage` on the
  engine page is what `/configure` draws. `e2e.cjs` still walks the showroom and has not been updated.
- Car models are in `public/models/*.glb` (credits in `CREDITS.md`), plus the `car-models` bucket. Prepared
  packages go in with `scripts/ingest-car.mjs`, rim GLBs with `scripts/ingest-rim.mjs` (`docs/ADD_PREPARED_CAR.md`).

## Data

- `services/catalogService.ts` loads from Supabase, falling back to `data/configuratorData.ts`.
- `services/pricing.ts` (`rimPrice`, `rimSizes`) and `config/brand.ts` (`formatMoney`: USD × region
  rate, rounded to 10; ZA default).
- `services/supabaseClient.ts` (auth flags) and `services/journeyService.ts` (leads, share codes).
- Schema history is in `supabase/migrations/`, and the edge function in
  `supabase/functions/ingest-wheel/`.

## Automations (n8n, novahavensai.app.n8n.cloud)

- "FORGED wheel pipeline (automated)", see `forgedsa-wheel-pipeline`.
- "FORGEDSA · Lead email", see `forgedsa-lead-email-automation`.

## Docs

`docs/MAP.md` (navigation: cars, photorealism, wheels, how they combine), `README.md`,
`docs/HANDOVER.md` (technical), `docs/CLIENT_HANDOVER.md` + PDF (client),
`docs/WHEEL_PIPELINE.md`, `docs/SKILLS.md` (this skill set).
`docs/archive/PHOTOREAL_SPEC.md` is the superseded October 2026 photoreal plan, kept for history.

## Conventions

- Match the surrounding style.
- Every catalogue change goes in two places: a migration and the fallback.
- Prefer the brand tokens over raw hex in new code (a few older components and the admin panel still hard-code colours).
- Verify visually before claiming done.
- Ask the owner before assuming on product decisions.

## Since 2026-11-10 (afternoon)

- `/configure` had `components/journey/ViewerPanel.tsx` on the viewer look from 2026-11-10 to 2026-11-11. Now it is the
  stepped drawer on the stage look (see the route table and "Since 2026-11-11" below). "FORGED" plates via
  `engine.addNumberPlates` (`?plates=0`) are unchanged.
- Wheels = the stock sheet (`docs/WHEEL_INVENTORY.md`); `services/pricing.ts rimPrice(wheel, size, finishId)`;
  staggered rims via `WheelDesign.rearModelUrl` (engine `applyWheelDesign`).
- Accounts: `services/authService.ts`, `components/journey/AccountSheet.tsx`, `docs/ACCOUNTS.md`.
- Ingest: `scripts/ingest-car.mjs`, `scripts/ingest-rim.mjs` (`docs/ADD_PREPARED_CAR.md`); `scripts/rim3d/pack.mjs` drops brake meshes.

## Since 2026-11-11

- No showroom: Welcome (`/`, the car carousel) → Enter → Configurator (`/configure`) → Summary (`/summary`). `/models`
  opens the welcome. "Change model" in the configurator goes back to the carousel, which opens on the car being built.
- `/configure` = `StepDrawer` (`components/journey/Configurator.tsx`) on the stage look (`engine.setLook('stage')`,
  `STAGE` in `services/viewerStudio.ts`; URL overrides `?stagePeak= ?stageRx= ?stageRz= ?stageOver= ?stageRails=
  ?stageRing= ?stageFloorEnv= ?stageExp= ?stageParts=`). `?panel=viewer` = the viewer's glass panel; in the harness
  `?look=stage` is what customers see, `?look=viewer` the older grey dome, `?look=studio` the softbox studio.
- Rim page = the wheel studio ported from the FORGED website (`shared/wheel-viewer/WheelStudio.tsx`, `WheelStage.tsx`,
  `shared/wheel-viewer/wheelStudioParts.ts`). It loads the rim files the car uses (`public/models/rims/`) and draws finishes with
  `services/wheelFinish.ts`. `components/RimSpinView.tsx` and `public/renders/rims/manifest.json` are removed;
  `scripts/rim3d/turntable.py` and `spin-manifest.py` are legacy (nothing in the app uses their output).
- Harnesses: `journey.cjs` (welcome → Enter → wheels step → three wheels → size → finish → summary), `car-switch.cjs`
  needs `BASE` ending in `?panel=viewer`, `e2e.cjs` not updated. No GPU in the cloud container: SwiftShader on CPU,
  about 50 s a shot.

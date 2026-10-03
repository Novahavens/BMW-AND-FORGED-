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
| `/` welcome (region picker, Enter) | `components/journey/WelcomeGate.tsx`, `BootLoader.tsx` |
| `/models` showroom (drive-out/in between cars) | `components/journey/Showroom.tsx` |
| `/configure` Paint → Wheels → Size → Finish | `components/journey/Configurator.tsx` |
| `/summary` stills, share code, PDF gate, enquiry | `components/journey/SummaryPage.tsx`, `EnquiryModal.tsx` |
| `/forged`, `/rims/<id>` collection, 360° rim | `components/ForgedPage.tsx`, `RimDetailPage.tsx` |
| `/terms`, `/delivery` | `components/InfoPage.tsx` + `config/pages.ts` (`LEGAL_DRAFT`) |
| `/?config=CODE` reopen a build | share codes via `services/journeyService.ts` |
| `/admin` | `components/admin/*` |

Shared UI lives in `components/journey/ui.tsx` (Button, Modal, PaintChip, RimThumb, Logo) and
`components/SiteFooter.tsx`. Navigation uses `services/nav.ts` (`goTo`, `linkTo`, pushState).

## Engine and 3D

- `services/CarConfiguratorEngine.ts`: scene, studio lights, HDRI, contact shadow, the camera
  presets (`setCameraPreset`), `loadCar`/`mountCarModel` (paint and hide regexes, wheel
  placement), `applyWheelDesign`, `setRimSize`, `captureViews` (stills for the summary and PDF).
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
- Render checks: `scripts/render/` (headless engine page + batch screenshot script).
- Car models are in `public/models/*.glb` (credits in `CREDITS.md`), plus the `car-models` bucket.

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

`docs/PHOTOREAL_SPEC.md` (photoreal goal + sprints), `README.md`, `docs/HANDOVER.md` (technical), `docs/CLIENT_HANDOVER.md` + PDF (client),
`docs/WHEEL_PIPELINE.md`, `docs/SKILLS.md` (this skill set).

## Conventions

- Match the surrounding style.
- Every catalogue change goes in two places: a migration and the fallback.
- Prefer the brand tokens over raw hex in new code (a few older components and the admin panel still hard-code colours).
- Verify visually before claiming done.
- Ask the owner before assuming on product decisions.

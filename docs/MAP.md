# Map: where things live

One screen to answer the four questions people keep asking about this repo. For "which file owns
this specific behaviour" (not just which doc), read [`../AGENTS.md`](../AGENTS.md) and the skill
index [`SKILLS.md`](SKILLS.md) first — Claude Code loads those skills automatically.

| I want to… | Read | Code / commands |
|---|---|---|
| Add or replace a **car** | [`ADD_PREPARED_CAR.md`](ADD_PREPARED_CAR.md) (command reference), [`PRODUCT_SPEC_CARS_AND_WHEELS.md`](PRODUCT_SPEC_CARS_AND_WHEELS.md) §4 (the full process, licence gate, checks) | `scripts/ingest-car.mjs`, `.claude/skills/forgedsa-add-car-model/` |
| Make a car **photoreal** | [`PHOTOREAL_METHOD.md`](PHOTOREAL_METHOD.md) (the validated method and numbers), [`research/`](research/) (sources behind it) | `services/studioSoftbox.ts`, `services/paintShader.ts`, `services/carMaterials.ts`, `.claude/skills/3d-car-perfect/` |
| Add a **wheel** | [`PRODUCT_SPEC_CARS_AND_WHEELS.md`](PRODUCT_SPEC_CARS_AND_WHEELS.md) §5 (pick the route: CAD file, photo-to-3D, or flat photo), [`WHEEL_PIPELINE.md`](WHEEL_PIPELINE.md) (photo batch via n8n), [`RIM_3D_PROCESS.md`](RIM_3D_PROCESS.md) (photo → real 3D rim, step by step) | `scripts/ingest-rim.mjs`, `scripts/rim3d/`, `.claude/skills/forgedsa-wheel-pipeline/`, `.claude/skills/forgedsa-rim-from-photo/` |
| See **how a car and its wheels combine** in the configurator | §1 below | `services/CarConfiguratorEngine.ts`, `services/wheelKit.ts`, `services/viewerStudio.ts` |
| Go from a **rim photo to a photoreal 3D file**, the best way today | [`RIM_PHOTO_TO_3D_SPEC.md`](RIM_PHOTO_TO_3D_SPEC.md) (researched decision guide, Nov 2026) | `scripts/rim3d/convert.sh` (the in-house route) |

---

## 1. How a car and its wheels come together (the configurator's data flow)

```
catalogue (Supabase `cars`/`wheels`/`wheel_finishes`, fallback data/configuratorData.ts)
        │
        ▼
App.tsx picks the car + paint + wheel + size + finish the customer has chosen
        │
        ▼
services/CarConfiguratorEngine.ts
  ├─ loadCar(carId)            → car GLB (public/models/<carId>.glb), hides its own wheels
  │                              (hideMeshMatch) and body-colours the rest (paintMeshMatch)
  │                              → services/carMaterials.ts classifies every other part
  │                              (glass, chrome, carbon, trim…) and styles it for the studio
  ├─ applyWheelDesign(wheel)   → a GLB wins: loadRimModel/mountRimModel loads
  │                              public/models/rims/<wheelId>.glb at the car's wheel hubs,
  │                              widest of Y/Z scaled to the size chosen, axle auto-detected.
  │                              No GLB → services/proceduralRims.ts + rimExtrusion.ts build the
  │                              face from the wheel's photo instead (services/wheelKit.ts).
  ├─ every mesh on the wheel gets ONE finish material from services/wheelFinish.ts
  │                              (the customer's finish pick) — baked photo colour is ignored
  └─ services/viewerStudio.ts  → the stage look (lighting, floor, reflection cove) both the car
                                   and the wheels sit inside
        │
        ▼
Same rim GLB + same services/wheelFinish.ts recipe also drives the standalone wheel page
(/rims/<id>, shared/wheel-viewer/WheelStudio.tsx) — so a finish looks identical on the car and
on its own page, because they share the recipe, not just the look.
```

The one rule that matters most: **a wheel's `modelUrl` always beats its photo.** Everything in
section "Add a wheel" above exists to produce that `modelUrl` file in the shape the engine expects
(`Rim_Barrel`, `Rim_Face_Spokes`, `Hardware_Bolts`, `Center_Cap`, no tyre) — see
[`RIM_3D_PROCESS.md`](RIM_3D_PROCESS.md) "How the engine uses a rim file".

## 2. Docs that are current vs. historical

Everything linked from the table above is current. A few docs describe **work that hasn't landed
or has been superseded** — don't treat them as how the app behaves today:

| Doc | Status |
|---|---|
| [`PLATES_MASTER_PLAN.md`](PLATES_MASTER_PLAN.md) | A plan to replace the live WebGL configurator with pre-rendered Cycles "plates". **PR #13 merged its render-pipeline tooling** (`scripts/plates/`) into `main` on 2026-11-11, but **not** the web integration (workstream WS6): nothing in `App.tsx`, `components/` or `services/` reads from `public/plates/` yet. The live engine described in this map is still what customers see. Read this doc only if you're picking up WS6. |
| [`archive/PHOTOREAL_SPEC.md`](archive/PHOTOREAL_SPEC.md) | October 2026 photoreal plan for a 3-car line-up that no longer exists. Superseded by `PRODUCT_SPEC_CARS_AND_WHEELS.md` + `PHOTOREAL_METHOD.md`. Kept for the research citations. |
| [`archive/NO_BLENDER_AND_UI_PLAN.md`](archive/NO_BLENDER_AND_UI_PLAN.md) | Pre-Blender-adoption handover plan. Kept for a couple of still-useful tips (browser GLB inspection, gltf.report compression). |
| [`CHECKPOINT.md`](CHECKPOINT.md), [`SESSION_HANDOVER_2026-11-11.md`](SESSION_HANDOVER_2026-11-11.md) | Operational session logs, not architecture docs — read them to pick up *in-flight* work, not to learn how a feature works. |

## 3. Everything else, by topic

| Topic | Doc |
|---|---|
| Stock sheet / wheel catalogue (real names, sizes, prices) | [`WHEEL_INVENTORY.md`](WHEEL_INVENTORY.md) |
| Wheel finishes (how the four coating kinds are built) | `.claude/skills/forgedsa-rim-finishes/` |
| Admin panel, prices, who can sign in | `.claude/skills/forgedsa-catalogue-admin/` |
| Customer accounts (Google sign-in, garage) | [`ACCOUNTS.md`](ACCOUNTS.md) |
| Dealer accounts | [`DEALERS.md`](DEALERS.md) |
| Leads and the new-lead email | [`HANDOVER.md`](HANDOVER.md) §5a, `.claude/skills/forgedsa-lead-email-automation/` |
| PDF spec sheet | `.claude/skills/forgedsa-pdf-brochure/` |
| Brand, colours, fonts | `.claude/skills/forgedsa-brand-system/` |
| Render/QA harnesses (proving a visual change) | `.claude/skills/visual-qa/`, `.claude/skills/forgedsa-render-verification/` |
| Deploys, PRs, secrets | `.claude/skills/forgedsa-deploy-and-release/`, `.claude/skills/forgedsa-secrets-and-safety/` |
| Full technical handover | [`HANDOVER.md`](HANDOVER.md) · client-facing version: [`CLIENT_HANDOVER.md`](CLIENT_HANDOVER.md) |

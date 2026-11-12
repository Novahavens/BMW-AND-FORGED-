# 🚗 BMW Wheel Configurator

> *Precision Engineering Meets Interactive Design*

A modern, interactive wheel configurator for BMW vehicles, built with TypeScript. Configure premium wheels, visualize in real-time, and explore customization options with a sleek, intuitive interface.

**Live:** <https://forged-configurator.vercel.app> · **Admin:** `/admin`
**Preview of this branch (new cars, stock-sheet wheels, stage look, accounts):**
<https://forgedsa-configurator.onrender.com> (Render static site built from `ccr-f52bf849-fnf7qs` on every push,
`VITE_CATALOG_SOURCE=static` so it shows the bundled catalogue, whatever the live database holds; see
[Hosting](#hosting) below).

A real-time 3D configurator for FORGEDSA forged wheels on BMW M cars: pick a car, factory paint,
wheel design, size and finish, then share the build, download a branded PDF spec sheet or send an
enquiry (every lead is emailed to the team). Built with React 19, Vite and Three.js, backed by
Supabase (catalogue, auth, file storage), automated with n8n and deployed on Vercel.

**New to this repo? Start at [`docs/MAP.md`](docs/MAP.md):** where cars are added, how they're made
photoreal, where wheels are added, and how wheels and cars come together in the configurator — one
screen, with direct links.

**Brand name, logo, colours, copy and regions/currencies live in one file:** `config/brand.ts`.
For the full step-by-step handover see [`docs/HANDOVER.md`](docs/HANDOVER.md); the client-facing
overview is [`docs/CLIENT_HANDOVER.md`](docs/CLIENT_HANDOVER.md) (branded PDF:
[`docs/FORGEDSA-Client-Handover.pdf`](docs/FORGEDSA-Client-Handover.pdf)).

---

## 📖 The customer journey

1. **Welcome** – a dark studio stage that cycles studio renders of the four prepared BMW M cars (M2 CS, M4 CS,
   M5, M5 Touring; the older models stay in the catalogue, hidden, until their prepared packages arrive). This is
   where the car is chosen: arrows, scroll, keyboard, swipe or dots. Pick a region and currency (South Africa /
   ZAR by default); **Enter** opens the configurator on the car showing. There is no separate showroom page.
2. **Configure** – a live car on a dark stage modelled on the welcome stills (black backdrop, a pool of light on a
   pale floor) with the "FORGED" plates (the M5 shows its pre-rendered Blender frames in the fixed views
   instead), and the stepped drawer (a bottom sheet on phones, a side panel on wider
   screens): Overview, then Paint, Wheels, Size and Finish, with the live set price. Camera chips (Front, Side,
   Rear, Wheel, Top) and a turntable button sit over the stage; **Change model** goes back to the welcome.
   **More options** (the … button in the drawer header) holds Region, Load a configuration, Account & garage,
   the links to The wheels, Enquire, Delivery & fitment, Terms & conditions and Credits, and Start again; it
   replaces the hamburger menu and top bar, which went with the showroom.
   Every wheel is a real 3D rim from the stock sheet.
3. **Summary** – studio stills of the build, share code and link, PDF spec sheet (email + mobile
   required), enquiry form, the visualisation notice, **Save to garage** when signed in.
4. **Account** (optional) – Google sign-in via Supabase Auth; the garage lists the customer's saved
   builds (share codes mapped to their account) and pre-fills the PDF gate and enquiry form.
   See [`docs/ACCOUNTS.md`](docs/ACCOUNTS.md).

---

## 🌟 Outstanding Highlights

- **Luxury Brand Experience** – Designed to match the premium look and feel of BMW styling.
- **Real-Time Visual Feedback** – See updates instantly as wheel configuration changes are applied.
- **High-End Customization Flow** – Tailor finish, size, style, and aesthetic preferences in a smooth experience.
- **Interactive Product Storytelling** – Turns wheel selection into a premium digital showroom experience.
- **TypeScript-Powered Reliability** – Maintains clean logic and scalable front-end architecture.
- **Modern UI/UX Approach** – Built for a polished, responsive, and highly engaging user journey.

---

## ✨ Features

- **🎨 Interactive Visualization** – Real-time wheel preview and customization
- **🚘 Prepared car packages** – one command (`scripts/ingest-car.mjs`) drops a prepared BMW package
  (`web/<car>_web.glb`) into the catalogue, migration and check sheet ([`docs/ADD_PREPARED_CAR.md`](docs/ADD_PREPARED_CAR.md);
  the full process for cars and wheels is [`docs/PRODUCT_SPEC_CARS_AND_WHEELS.md`](docs/PRODUCT_SPEC_CARS_AND_WHEELS.md))
- **🛞 Real 3D rims from the stock sheet** – the six in-stock designs (FSA001–FSA004, FF-1, FF-3) with the
  sheet's names, sizes, finishes and ZAR prices, including dearer finishes and the staggered FSA001
  ([`docs/WHEEL_INVENTORY.md`](docs/WHEEL_INVENTORY.md))
- **👤 Customer accounts** – Google sign-in, profile, garage of saved builds; share codes and leads carry
  the customer's id ([`docs/ACCOUNTS.md`](docs/ACCOUNTS.md))
- **⚡ TypeScript-First** – Fully typed codebase for reliability and maintainability
- **📱 Responsive Design** – Seamless experience across desktop and mobile devices
- **🔧 Advanced Configuration** – Deep customization options for wheel specifications
- **🎯 User-Friendly Interface** – Intuitive controls and instant feedback

---

## Stack

- **Frontend:** React 19 + Vite 6 + Three.js, package manager is **bun**.
  ```bash
  bun install
  bun run dev      # http://localhost:3000
  bun run build    # production build to dist/
  bun run lint     # tsc --noEmit (typecheck, not eslint)
  ```
- **Backend:** Supabase (Postgres + Auth + Storage). The catalogue tables (`cars`, `paints`,
  `wheels`, `wheel_finishes`) are the **source of truth**; `data/configuratorData.ts` is only a
  bundled fallback used if Supabase is unreachable, so the app never renders empty. If you edit the
  catalogue by hand instead of through `/admin`, keep both in sync. Customer accounts use Supabase
  Auth (Google provider) with `profiles`, `saved_configurations.user_id` and `leads.user_id`
  (migration `20261110150000_customer_accounts.sql`); admins stay on the `admin_users` allowlist.
- **Migrations:** all fifteen `supabase/migrations/20261110*.sql` files are applied to the live project
  (read back on 2026-11-11). `20261111090000_car_m2_g87_name_m2_cs.sql` was applied on 2026-11-11 and renamed the
  live `m2_g87` row from "BMW M2 Coupe" to "BMW M2 CS".
- **Hosting:** Vercel project `forged-configurator` (team Nova Havens). Framework preset Vite,
  build `vite build`, output `dist`, no environment variables required.

## Hosting

| Where | URL | Builds from | Catalogue |
|---|---|---|---|
| Production (Vercel) | <https://forged-configurator.vercel.app> | `main` | Supabase (live) |
| Branch preview (Render static site `forgedsa-configurator`) | <https://forgedsa-configurator.onrender.com> | `ccr-f52bf849-fnf7qs`, auto-deploy on push | bundled (`VITE_CATALOG_SOURCE=static`) |

The Render preview exists so the new work can be seen before the migrations touch the live database:
build command `npm install --no-audit --no-fund && npm run build && cp dist/index.html dist/404.html`
(the `404.html` copy makes deep links such as `/configure` load the app; a `/* → /index.html` rewrite in
the Render dashboard does the same with a 200), publish directory `dist`, `NODE_VERSION=22`. Share codes,
leads, the PDF gate and the admin on the preview talk to the live Supabase project as usual; Google
sign-in works there once the preview URL is in Supabase → Authentication → URL Configuration → Redirect URLs
(`docs/ACCOUNTS.md`). To go to production: merge the PR and deploy `main` to Vercel by hand; the Vercel
project is not linked to this repo, so a merge alone deploys nothing (`docs/HANDOVER.md` section 5).

## The admin panel (`/admin`)

Sign in with an email that's in the `admin_users` table (Supabase enforces this with row-level
security, not just the UI — see `supabase/migrations/20260922000000_catalog_schema.sql`). There are
exactly **four tabs: Cars, Wheels, Finishes, Paints.** (Calipers exist in the schema but are no
longer a customer-facing option and have no admin tab — don't look for one.)

Every tab works the same way: pick a row to edit it, or **New** to start one, fill in the fields,
**Save**. **Delete** asks for confirmation — untick "Visible" instead if you just want to hide
something rather than remove it.

### Updating prices

Wheels tab → open a wheel → edit the **"Sizes & set prices"** grid (one row per size, price in USD
for a set of four; add or remove sizes with the buttons). On Save, the overall "from" price and the
list of offered sizes are **computed automatically** from that grid — you never edit those two
fields directly. Prices are stored in USD and shown per region (`config/brand.ts formatMoney`; ZA =
USD × 18.2, so R75 000 is stored as 4120.88). A finish that costs more (Polished Face, Liquid Metal)
goes in **"Dearer finishes"** on the same wheel; blank means the same price as the others.

### The wheels on offer: the stock sheet

The catalogue is the owner's stock sheet (*BMW M / M Performance Wheel Inventory (in stock)*): FSA001,
FSA002, FSA003, FSA004, FF-1 and FF-3 with the sheet's sizes, finishes, prices and fitment
([`docs/WHEEL_INVENTORY.md`](docs/WHEEL_INVENTORY.md)). Each one is a real 3D rim on the car
(`public/models/rims/*.glb`, FSA001 with a separate rear file). Everything else in the wheel table is
hidden, not deleted: tick **Visible in configurator** to bring a design back.

### Adding a new wheel design

**With a rim GLB** (the website's convention: `Rim_Barrel`, `Rim_Face_Spokes`, `Center_Cap`,
`Hardware_Bolts`, no tyre):

```bash
node scripts/ingest-rim.mjs rim.glb --wheel forged_fsa005 --new --name FSA005 --code FSA005 \
  --sizes 20,21 --price-zar 75000 --finishes gold,hyper_black --default-finish gold --check
# staggered set: add --rear rear.glb
```

It checks and packs the file, writes the catalogue row and a migration, and shoots a check sheet on the
prepared M4 CS and M5. `--new` is for an id that does not exist yet (the script refuses an existing one);
to put a rim on a wheel already in the catalogue, leave `--new` and the describing options out
(`node scripts/ingest-rim.mjs rim.glb --wheel forged_fsa_03 --check`). `--dry-run` prints the plan and
changes nothing; `node scripts/ingest-rim.mjs --help` lists every option.

**By hand:** Wheels tab → **New** → fill in code/name/subtitle/style/spoke type/spoke count/weights/description
→ upload either a transparent front-on rim **PNG** (the app extrudes it into 3D automatically) or a
rim **GLB** if you have a real 3D model → set the finishes it's offered in and the size/price grid →
Save. See `docs/HANDOVER.md` §2b for image prep specifics (square crop, transparent gaps between
spokes, 1024–2048px).

**Automated (recommended for batches):** put the photos (or a zip of them) and a sheet named
`wheels` in one Google Drive folder, then run the n8n workflow "FORGED wheel pipeline (automated)".
The live catalogue's sheet is
[wheels](https://docs.google.com/spreadsheets/d/1OJJYaZsVSuJIgjnYkiSE55hBF7_l6y2o4dJH0SehOIM/edit)
in the FORGED Drive folder; edit it like any spreadsheet.

| Sheet column | Example | Notes |
|---|---|---|
| `file` | `DSC08145.jpg` | photo file name in the folder (extension optional) |
| `name` | `Zwartkops Branch` | shown to customers |
| `code` | `FSA-02` | optional; becomes the wheel id (`forged_fsa_02`), keep it stable |
| `sizes` | `19\|20\|21\|22` | separate values with `\|` |
| `prices_zar` or `prices_usd` | `68000\|74000\|82000\|92000` | set of four, one per size |
| `finishes` | `Liquid Metal\|Silver` | any finish in the `wheel_finishes` table: Liquid Metal, Bronze Matte, Gloss Black, Silver, Gold, Hyper Black, Polished Face, Pure Bronze, Black Matte (and Satin Gold, Gunmetal Matte) |
| optional | `subtitle`, `description`, `highlights` (split on `\|`), `style`, `skip` (`yes` = leave alone), `notes` | AI writes the copy if blank |

Each photo is cut out (rim only, transparent gaps), then posted to the Supabase function
`supabase/functions/ingest-wheel`. The function squares the rim to 2048px, converts it to the neutral
grey the finishes are multiplied onto, re-runs the app's own 3D-spoke test, uploads it to
`rim-images` and creates or updates the wheel: **live** when every check passes, **hidden with
reasons** otherwise. Re-running a row updates that wheel; style, weights and spoke count set in
`/admin` are kept. Full guide, setup and troubleshooting: [`docs/WHEEL_PIPELINE.md`](docs/WHEEL_PIPELINE.md).

### Adding a new car

**Prepared car package** (the `3d cars` zips: `web/<car>_web.glb`, wheels `C10_Wheel_FL..`, material `Paint`)?
One command checks the file, copies it in, updates the catalogue and migration and shoots a check sheet:

```bash
node scripts/ingest-car.mjs BMW_M5_G90.zip --car m5_g90 --check     # see docs/ADD_PREPARED_CAR.md
node scripts/ingest-rim.mjs rim.glb --wheel forged_fsa_03 --check   # a 3D rim on a wheel
```

Any other model, by hand: Cars tab → **New** → fill in the spec fields (engine, power, fitment, etc.) → upload a `.glb`
(compressed with `gltf-transform`, see [`public/models/CREDITS.md`](public/models/CREDITS.md) for
the compression command and the licence-credit convention every sourced model follows — note any
non-commercial licence there too) → Save.

Two fields need a bit of care, because every 3D model names its own parts differently:

- **Paint mesh match** — a regex matched against the model's own mesh/material names to decide what
  gets recoloured. The default (`paint|body|carpaint|exterior`) is only a starting point. Real
  exports are inconsistent: the M3's paint is one flat-colour material covering every body panel
  (`merged_materials`), while the M4 needed **four** separate materials named `zx1mtl`,
  `body151mtl`, `livery1mtl` and (confusingly) `pillars1mtl` — the last one, despite its name, covers
  most of the rear bodywork, not window pillars. **Inspect the model's real material names** (open the browser
  console on `/configure` with the car loaded, or a glTF viewer) rather than assuming the default
  regex is enough — an incomplete match is exactly what causes a car to look "two-tone" or have
  unpainted panels.
- **Hide mesh match** — a regex for the model's own wheels/brakes/lug nuts, which get hidden so the
  app's configurable wheels sit in their place instead.

A new car also needs a slide on the welcome carousel, because that is where customers choose the car:
an entry in `HERO_SLIDES` (`components/journey/HeroStage.tsx`) and its stills in `public/hero/`
([`docs/PRODUCT_SPEC_CARS_AND_WHEELS.md`](docs/PRODUCT_SPEC_CARS_AND_WHEELS.md) section 4.7). The carousel
shows the slides of the cars that are active in the catalogue: hiding a car in `/admin` removes its slide,
but a new car is not offered until it has one.

You can also add a car directly with SQL if you're comfortable with it — insert a row into
`public.cars` with the same columns (snake_case); see `supabase/migrations/` for worked examples of
real cars being added this way.

## Leads and lead emails

The PDF gate (email + mobile required) and the enquiry form both insert into `public.leads`
(`source` = `pdf` / `enquiry`); admins read them in `/admin` → Enquiries. An `AFTER INSERT` trigger
posts each lead, enriched with paint hex, wheel image and price (the dearer-finish price when it
applies), to the n8n workflow *FORGEDSA · Lead email*, which emails forgedsa1@gmail.com a branded
HTML summary through Gmail. The webhook URL lives in Supabase Vault (`lead_webhook_url`), and the
template is in `n8n/lead-email.code.js`. Details: `docs/HANDOVER.md` §5a. A signed-in customer's
leads and share codes also carry their `user_id`, so the garage and the admin can tie them together.

## Rendering notes

- The studio (lighting, HDRI reflections, camera, contact shadow, paint/wheel materials) lives in
  `services/CarConfiguratorEngine.ts`. On `/configure` a live car sits in the stage look
  (`services/viewerStudio.ts`: `STAGE`, `buildStageDome`, `buildStageFloor`, `buildStageCove`;
  `engine.setLook('stage')`), modelled on the Cycles stills of the welcome screen: a black backdrop, a
  pool of light on a pale floor that fades to black, a pool shadow, Neutral tone mapping with the
  exposure set by the paint, a black reflection cove with one overhead softbox (Frozen paints keep the
  soft cove), the viewer's finish table for Uni / Metallic / Pearl / Frozen paints (`VIEWER_FINISH`), and
  "FORGED" placeholder plates on the bumpers (`?plates=0` turns them off). The harness takes
  `?look=stage`; `?look=viewer` still draws the older grey viewer dome, for comparison only.
- The rim page (`/rims/<id>`) uses the wheel viewer shared with the FORGED website: `shared/wheel-viewer/` is a
  byte-identical copy of the website's `src/wheel-viewer/` (edited there; `node scripts/wheel-viewer-sync.mjs pull`
  copies it, `bun run lint` fails if the copy was edited here). `components/WheelStage.tsx` loads it on demand. It
  loads the same rim files the car uses (`public/models/rims/`) and paints them through
  `services/wheelViewerPaint.ts`, which reads each finish with `services/wheelFinish.ts`, so a finish is the same
  coating on the rim page and on the car. A wheel without a `modelUrl` shows its photo.
- Procedural wheel faces (used until a design has a real rim image or GLB) are generated in
  `services/proceduralRims.ts` and extruded in `services/rimExtrusion.ts`. A rim GLB
  (`modelUrl`, optional `rearModelUrl`) wins over both.
- Pricing helpers (`rimPrice(wheel, size, finishId)`, `finishSurcharge`, `rimSizes`,
  `nearestRimSize`) are in `services/pricing.ts`.

## Project skills (for Claude Code and developers)

Twenty task playbooks in `.claude/skills/` capture how this project is built and run: adding cars
and wheels (including turning a rim photo into a swappable 3D rim, and the wheel finishes), tuning
paint, verifying renders, the PDF, lead emails, branding, docs, deploys and secrets. Claude Code loads them automatically; the index with when-to-use notes is
[`docs/SKILLS.md`](docs/SKILLS.md).

**A new wheel:** `/wheel3d` (`.claude/skills/wheel3d`) takes any wheel from a photo to a clean,
photoreal rim on every car, size and finish. `visual-qa` is the general quality check behind it:
measured checks (`scripts/render/wheel-qa.cjs`), then a render matrix over every combination
(`scripts/render/qa-matrix.py`) with contact sheets.

**Photorealism.** How the cars, wheels, tyres and brakes are made to look like studio photos, with
the numbers and the pitfalls, is in [`docs/PHOTOREAL_METHOD.md`](docs/PHOTOREAL_METHOD.md). The
step-by-step skill is `3d-car-perfect`, and the research behind it is in
[`docs/research/`](docs/research/).

## Repository layout

```
config/brand.ts              Brand name, logo, colours, copy, regions/currencies — one file
data/configuratorData.ts     Bundled fallback catalogue (cars, paints, wheels, finishes)
services/                    3D engine, stage and viewer looks (viewerStudio.ts), wheel kit (tyres, rims, brakes), paint, pricing, catalogue, auth
scripts/ingest-car.mjs       One command: prepared car package → catalogue + migration + check sheet
scripts/ingest-rim.mjs       One command: rim GLB (front, optional rear) → packed rim on a wheel
scripts/render/              Headless render harness (engine page + batch screenshots, journey/e2e/responsive;
                             e2e.cjs still walks the removed showroom and has not been updated)
components/journey/          Welcome (car carousel) → configurator (StepDrawer in Configurator.tsx) → summary, AccountSheet
shared/wheel-viewer/   The 3D wheel viewer on the rim page, one copy shared with the FORGED website (see its README; edit it there)
components/WheelStage.tsx   The rim page's stage around it: lazy load, error and photo stand-ins, this app's finish rows
components/admin/            /admin UI (AdminPage.tsx, entityConfig.ts defines every field)
public/models/               Prepared car GLBs; public/models/rims/ the packed rim GLBs; CREDITS.md
supabase/migrations/         Database schema, RLS policies, and catalogue changes over time
n8n/lead-email.code.js       Copy of the n8n Code node that builds the branded lead email
docs/MAP.md                  Start here: where cars/wheels/photorealism live, how they combine
docs/HANDOVER.md             Full handover guide: setup, workflow, pre-handover checklist
docs/ADD_PREPARED_CAR.md     Runbook: a prepared car package or a rim GLB into the configurator
docs/WHEEL_INVENTORY.md      The stock sheet as the wheel catalogue: ids, finishes, prices
docs/ACCOUNTS.md             Customer accounts: Supabase Google setup, schema, RLS, test plan
docs/CHECKPOINT.md           Where the work stands and what is queued next
docs/SKILLS.md               Index of the project skills in .claude/skills/ (task playbooks)
docs/PHOTOREAL_METHOD.md     The validated photoreal method (studio, paint, wheels, materials, checks)
.claude/skills/              Skills Claude Code loads when working in this repo
```

---

## 🤝 Contributing

1. Start with [`docs/MAP.md`](docs/MAP.md) (where cars, photorealism, wheels and the configurator
   live), then [`AGENTS.md`](AGENTS.md) and the task playbooks in [`docs/SKILLS.md`](docs/SKILLS.md)
   (`.claude/skills/`).
2. Work on a feature branch and open a Pull Request against `main`.
3. Before pushing: `bun run lint` (TypeScript) and `bun run build` must pass; check visual changes
   in the browser.
4. Catalogue changes go in a Supabase migration **and** the fallback in `data/configuratorData.ts`.
5. Never commit secrets (see `forgedsa-secrets-and-safety`).

---

## 🌟 Acknowledgments

Built with precision and care for BMW M enthusiasts. 3D car model credits and licences:
[`public/models/CREDITS.md`](public/models/CREDITS.md).

**Happy configuring! 🏁**

<div align="center">

**[⬆ back to top](#-bmw-wheel-configurator)**

</div>

# FORGED — BMW M wheel configurator

A real-time 3D configurator for forged wheels on BMW M cars: pick a car, paint, wheel design, size
and finish, then share or download a spec sheet. Built with React 19, Vite and Three.js, backed by
Supabase (catalogue, auth, file storage) and deployed on Vercel.

**Brand name, logo, colours, copy and regions/currencies all live in one file:** `config/brand.ts`.
"FORGED" is a placeholder brand — rename it there.

For the full step-by-step handover (first-time setup, a pre-handover checklist, the no-Blender
workflow) see [`docs/HANDOVER.md`](docs/HANDOVER.md). This README is the quick reference.

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
  catalogue by hand instead of through `/admin`, keep both in sync.
- **Hosting:** Vercel project `forged-configurator` (team Nova Havens). Framework preset Vite,
  build `vite build`, output `dist`, no environment variables required.

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
fields directly.

### Adding a new wheel design

Wheels tab → **New** → fill in code/name/subtitle/style/spoke type/spoke count/weights/description
→ upload either a transparent front-on rim **PNG** (the app extrudes it into 3D automatically) or a
rim **GLB** if you have a real 3D model → set the finishes it's offered in and the size/price grid →
Save. See `docs/HANDOVER.md` §2b for image prep specifics (square crop, transparent gaps between
spokes, 1024–2048px).

**Automated (recommended for batches):** the n8n workflow "FORGED wheel pipeline (automated)" takes a
Google Drive folder of front-on product shots plus a sheet named `wheels` and does everything:

| Sheet column | Example | Notes |
|---|---|---|
| `file` | `gt3-front.jpg` | image file name in the folder (extension optional) |
| `name` | `Monoblock GT3` | shown to customers |
| `sizes` | `19\|20\|21` | separate values with `\|` |
| `prices_zar` or `prices_usd` | `76000\|82000\|90000` | set of four, one per size |
| `finishes` | `Liquid Metal\|Silver` | Liquid Metal, Bronze Matte, Black Gloss, Silver |
| optional | `code`, `subtitle`, `description`, `highlights`, `weight_front_kg`, `weight_rear_kg` | AI writes the copy if blank |

Per image it makes a transparent rim-only cut-out (Riverflow 2.5 Pro via OpenRouter), has Gemini
compare it with the original for design drift (one automatic retry), squares it to 2048px and posts it
to the Supabase function `supabase/functions/ingest-wheel`. That function re-runs the app's own
3D-spoke test (`validate.ts`, mirroring `services/rimExtrusion.ts`), uploads the PNG to `rim-images`
and creates the wheel — **live** when every check passes, **hidden with reasons** otherwise. A
`wheel-report.csv` lands in a "(processed)" folder. One-time setup: set the Supabase secret
`INGEST_SECRET` and put the same value in the n8n Header Auth credential `x-ingest-secret`.

### Adding a new car

Cars tab → **New** → fill in the spec fields (engine, power, fitment, etc.) → upload a `.glb`
(compressed with `gltf-transform`, see [`public/models/CREDITS.md`](public/models/CREDITS.md) for
the compression command and the licence-credit convention every sourced model follows — note any
non-commercial licence there too) → Save.

Two fields need a bit of care, because every 3D model names its own parts differently:

- **Paint mesh match** — a regex matched against the model's own mesh/material names to decide what
  gets recoloured. The default (`paint|body|carpaint|exterior`) is only a starting point. Real
  exports are inconsistent: the M3's paint is one flat-colour material covering every body panel
  (`merged_materials`), while the M4 needed **three** separate materials named `zx1mtl`,
  `body151mtl` and (confusingly) `pillars1mtl` — the last one, despite its name, covers most of the
  rear bodywork, not window pillars. **Inspect the model's real material names** (open the browser
  console on `/configure` with the car loaded, or a glTF viewer) rather than assuming the default
  regex is enough — an incomplete match is exactly what causes a car to look "two-tone" or have
  unpainted panels.
- **Hide mesh match** — a regex for the model's own wheels/brakes/lug nuts, which get hidden so the
  app's configurable wheels sit in their place instead.

You can also add a car directly with SQL if you're comfortable with it — insert a row into
`public.cars` with the same columns (snake_case); see `supabase/migrations/` for worked examples of
real cars being added this way.

## Rendering notes

- The studio (lighting, HDRI reflections, camera, contact shadow, paint/wheel materials) lives in
  `services/CarConfiguratorEngine.ts`.
- Procedural wheel faces (used until a design has a real rim image or GLB) are generated in
  `services/proceduralRims.ts` and extruded in `services/rimExtrusion.ts`.
- Pricing helpers (`rimPrice`, `rimSizes`, `nearestRimSize`) are in `services/pricing.ts`.

## Repository layout

```
config/brand.ts              Brand name, logo, colours, copy, regions/currencies — one file
data/configuratorData.ts     Bundled fallback catalogue (cars, paints, wheels, finishes)
services/                    3D engine, procedural wheels, pricing, Supabase catalogue access
components/journey/          Welcome → showroom → configurator → summary screens
components/admin/            /admin UI (AdminPage.tsx, entityConfig.ts defines every field)
supabase/migrations/         Database schema, RLS policies, and catalogue changes over time
public/models/CREDITS.md     Licence and attribution for every 3D car model
docs/HANDOVER.md             Full handover guide: setup, workflow, pre-handover checklist
```

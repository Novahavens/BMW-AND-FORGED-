# 🚗 BMW Wheel Configurator

> *Precision Engineering Meets Interactive Design*

A modern, interactive wheel configurator for BMW vehicles, built with TypeScript. Configure premium wheels, visualize in real-time, and explore customization options with a sleek, intuitive interface.

**Live:** <https://forged-configurator.vercel.app> · **Admin:** `/admin`

A real-time 3D configurator for FORGEDSA forged wheels on BMW M cars: pick a car, factory paint,
wheel design, size and finish, then share the build, download a branded PDF spec sheet or send an
enquiry (every lead is emailed to the team). Built with React 19, Vite and Three.js, backed by
Supabase (catalogue, auth, file storage), automated with n8n and deployed on Vercel.

**Brand name, logo, colours, copy and regions/currencies live in one file:** `config/brand.ts`.
For the full step-by-step handover see [`docs/HANDOVER.md`](docs/HANDOVER.md); the client-facing
overview is [`docs/CLIENT_HANDOVER.md`](docs/CLIENT_HANDOVER.md) (branded PDF:
[`docs/FORGEDSA-Client-Handover.pdf`](docs/FORGEDSA-Client-Handover.pdf)).

---

## 📖 The customer journey

1. **Welcome** – pick a region and currency (South Africa / ZAR by default) and enter the studio.
2. **Showroom** – choose one of 11 BMW M models.
3. **Configure** – Paint → Wheels → Size → Finish, with a live price and wheel close-ups.
4. **Summary** – studio stills of the build, share code and link, PDF spec sheet (email + mobile
   required), enquiry form.

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
| `finishes` | `Liquid Metal\|Silver` | Liquid Metal, Bronze Matte, Black Gloss, Silver |
| optional | `subtitle`, `description`, `highlights` (split on `\|`), `style`, `skip` (`yes` = leave alone), `notes` | AI writes the copy if blank |

Each photo is cut out (rim only, transparent gaps), then posted to the Supabase function
`supabase/functions/ingest-wheel`. The function squares the rim to 2048px, converts it to the neutral
grey the finishes are multiplied onto, re-runs the app's own 3D-spoke test, uploads it to
`rim-images` and creates or updates the wheel: **live** when every check passes, **hidden with
reasons** otherwise. Re-running a row updates that wheel; style, weights and spoke count set in
`/admin` are kept. Full guide, setup and troubleshooting: [`docs/WHEEL_PIPELINE.md`](docs/WHEEL_PIPELINE.md).

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

## Leads and lead emails

The PDF gate (email + mobile required) and the enquiry form both insert into `public.leads`
(`source` = `pdf` / `enquiry`); admins read them in `/admin` → Enquiries. An `AFTER INSERT` trigger
posts each lead, enriched with paint hex, wheel image and price, to the n8n workflow
*FORGEDSA · Lead email*, which emails forgedsa1@gmail.com a branded HTML summary through Gmail. The
webhook URL lives in Supabase Vault (`lead_webhook_url`), and the template is in
`n8n/lead-email.code.js`. Details: `docs/HANDOVER.md` §5a.

## Rendering notes

- The studio (lighting, HDRI reflections, camera, contact shadow, paint/wheel materials) lives in
  `services/CarConfiguratorEngine.ts`.
- Procedural wheel faces (used until a design has a real rim image or GLB) are generated in
  `services/proceduralRims.ts` and extruded in `services/rimExtrusion.ts`.
- Pricing helpers (`rimPrice`, `rimSizes`, `nearestRimSize`) are in `services/pricing.ts`.

## Project skills (for Claude Code and developers)

Thirteen task playbooks in `.claude/skills/` capture how this project is built and run: adding cars
and wheels, tuning paint, verifying renders, the PDF, lead emails, branding, docs, deploys and
secrets. Claude Code loads them automatically; the index with when-to-use notes is
[`docs/SKILLS.md`](docs/SKILLS.md).

## Repository layout

```
config/brand.ts              Brand name, logo, colours, copy, regions/currencies — one file
data/configuratorData.ts     Bundled fallback catalogue (cars, paints, wheels, finishes)
services/                    3D engine, procedural wheels, pricing, Supabase catalogue access
components/journey/          Welcome → showroom → configurator → summary screens
components/admin/            /admin UI (AdminPage.tsx, entityConfig.ts defines every field)
supabase/migrations/         Database schema, RLS policies, and catalogue changes over time
n8n/lead-email.code.js       Copy of the n8n Code node that builds the branded lead email
public/models/CREDITS.md     Licence and attribution for every 3D car model
docs/HANDOVER.md             Full handover guide: setup, workflow, pre-handover checklist
docs/SKILLS.md               Index of the project skills in .claude/skills/ (task playbooks)
.claude/skills/              Skills Claude Code loads when working in this repo
```

---

## 🤝 Contributing

1. Read [`agents.md`](agents.md), [`skills.md`](skills.md) and the task playbooks in
   [`docs/SKILLS.md`](docs/SKILLS.md) (`.claude/skills/`).
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

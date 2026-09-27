# FORGED Configurator: Handover & Customisation Guide

> The brand name **FORGED** is a placeholder. Rename it, add a logo and change colours in one file: `config/brand.ts` (section 4).

Follow the sections in order. Each step has a **Check** line; do not move on until it passes.

---

## 0. What you have

| Piece | Where | Cost |
|---|---|---|
| Web app (React + Three.js, Vite) | this repo | free |
| Database, logins, file storage | Supabase project **Apex Forged Configurator** (`qxlfkfhzpqbxffuqqewg`, org *nova havens*) | free tier |
| Hosting | Vercel (step 5) | free Hobby tier |

**Pages**

| URL | What it is |
|---|---|
| `/` | Welcome: live car in a white studio, region and currency select, **Enter** |
| `/models` | Showroom: one BMW M car at a time, huge model name behind it, ← → to switch (the car drives out and the next drives in), **Explore** (specs) and **Build** |
| `/configure` | Configurator: right-hand panel (bottom sheet on phones) with 4 steps: Paint, Wheels, Size, Finish. Wheel choices cut to a close-up of the wheel |
| `/summary` | Your build: studio stills, options, price, **Share** (configuration code + link), **PDF**, **Enquire** |
| `/?config=CODE` | Reopens a shared configuration |
| `/forged` | The wheel collection |
| `/rims/<rim-id>` | 360° view of one wheel: finish, size, price, "See it on my car" |
| `/admin` | Admin sign-in, then edit cars, wheels, finishes and paints, and upload GLBs and rim PNGs |

**Only cars with a 3D file appear in the showroom.** Today those are the BMW M4 Competition and the
2025 BMW M5 (G90). The M2, M3 and X5 M appear automatically as soon as you upload a GLB for them in
`/admin`. Model credits and licences: `public/models/CREDITS.md`. **The M5 file is licensed for
non-commercial use only**, so replace or license it before any commercial use.

**Customer choices (only these five):** car, paint colour, rim design, rim size, rim colour (finish).
Rim size visibly changes the rim on the car (bigger rim, thinner tyre sidewall) and has its own price.

Visitors can only **read** the catalogue. Only emails in the `admin_users` table can change anything
(enforced in the database by row-level security, not just hidden in the UI).

If Supabase is ever unreachable, the app falls back to the bundled catalogue in
`data/configuratorData.ts`, so the demo never shows an empty screen.

---

## 1. First-time admin setup (5 min, once)

1. Open <https://supabase.com/dashboard/project/qxlfkfhzpqbxffuqqewg/auth/users>.
2. **Add user → Create new user**: email `fazal@novahavens.com` (already on the admin allowlist),
   choose a strong password, tick **Auto Confirm User**.
3. **Turn off public sign-ups**: Authentication → Sign In / Providers → Email → untick
   *Allow new users to sign up* → Save. (Nobody can sign up via the app anyway, but this closes the door.)
4. To make the **client** an admin too: create their user the same way, then in
   **SQL Editor** run:
   ```sql
   insert into public.admin_users (email) values ('client@theirdomain.com');
   ```
   To remove someone: `delete from public.admin_users where email = '...';`

**Check:** go to `/admin`, sign in, and you should see the Cars / Wheels / Finishes / Paints tabs.
If it says *"not on the admin allowlist"*, the email in `admin_users` doesn't match the login email.

---

## 2. Adding your custom assets

### 2a. Car models (.glb)

> **No Blender?** See `NO_BLENDER_AND_UI_PLAN.md`, section 1: check names in the browser, rename in the free three.js editor, compress at gltf.report.

**Prepare the file (Blender, free):**
1. `File → Import` your model. If it's already .glb, import it anyway to check it.
2. **Name the parts.** The app finds parts by name (case doesn't matter):
   - Body panels that should take the paint colour: name the mesh *or* its material with
     `paint`, `body`, `carpaint` or `exterior` (e.g. material `CarPaint`).
     Glass, lights, chrome, trim, rubber, carbon, grille and badges are never painted, even if they match.
   - The model's own wheels: put `wheel`, `rim`, `tyre` or `tire` in the object name,
     one per corner (e.g. `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`). Brakes: `brake`, `caliper`, `rotor`.
     These are **hidden** and the configurable forged wheels are placed exactly where they were,
     at the same size. Nothing called "steering wheel" or "wheel arch" is touched.
3. Orientation doesn't matter (rotation and scale are fixed automatically and can be tuned in admin).
4. `File → Export → glTF 2.0`, format **glTF Binary (.glb)**, tick *Apply Modifiers*.
5. **Shrink it** (strongly recommended; loading speed is what the client notices):
   ```bash
   npx @gltf-transform/cli optimize input.glb output.glb --texture-compress webp
   ```
   Aim for **under 15 MB** (hard limit 50 MB).

**Upload:**
1. `/admin` → **Cars** → click the car → **3D model (.glb) → Upload** → pick the file.
2. Wait for the link to appear under the button, then click **Save**.
3. Click **Back to studio** and select that car.

**Check / fix:**

| You see | Fix in admin (Cars) |
|---|---|
| Car faces the wrong way | *Model rotation*: try 90, 180, 270 → Save |
| Car too big or small | *Real car length (m)*: set the real length |
| Paint doesn't change colour | *Paint mesh/material names*: add the part's real name, e.g. `paint\|body\|Mat_Shell_01` |
| Original wheels still showing / forged wheels in the wrong place | *Hide mesh names*: add the wheel objects' names. Wheels are placed correctly only when **4** wheels are found. In the browser press F12 → Console to see what was found. |
| Model doesn't appear at all | File failed to load, so the procedural body is shown. Re-export as .glb, check it opens at <https://gltf-viewer.donmccurdy.com> |

### 2b. Rims: PNG (automatic 3D) or GLB

Each wheel can have a **rim image**, a **rim 3D model**, or both (the model wins on the car).

**Rim PNG → automatic 3D spokes** (no 3D software needed)
- Straight-on, face view of the rim (not at an angle).
- **Transparent background _and_ transparent gaps between the spokes** (remove.bg or Canva).
  The app traces the see-through areas and builds solid, bevelled spokes with a concave dish, wrapped in
  your photo. If the gaps aren't transparent, it can't find the spokes and shows the image flat instead.
- Crop square, with the outer rim edge **touching all four edges** of the image.
- 1024×1024 to 2048×2048 px, PNG or WebP, under 10 MB.
- Upload: `/admin` → **Wheels** → the wheel → **Rim image → Upload** → **Save**.
- *Build 3D spokes from the image* is ticked by default; untick it to show the image flat.

**Rim GLB (best quality)**: from the client's CAD files, an AI image-to-3D tool (Tripo, Meshy, Hunyuan3D)
or a 3D modeller. See `NO_BLENDER_AND_UI_PLAN.md` section 2b.
- The rim only, **without a tyre**. Under 15 MB is ideal (compress at gltf.report).
- Upload: `/admin` → **Wheels** → the wheel → **Rim 3D model (.glb) → Upload** → **Save**.
- It's turned, sized to the rim diameter and centred automatically, and takes the finish colour.
  If the face points into the car, tick **Flip 3D rim** → Save.

**Check:** Studio → wheel drawer → select the wheel → **Zoom to Wheel**, and open **Rim detail**
(the 3D turntable page).

### 2c. Prices, names, finishes, paints

Everything in the drawers comes from the admin tabs. Edit → **Save** → the studio updates immediately.
- **Hide instead of delete**: untick *Visible in configurator*.
- **Order**: *Sort order* (lower = first).
- A wheel only offers the finishes ticked in *Available finishes*; *Default finish ID* must be one of them.
- **Sizes & prices**: each wheel has a list of sizes with a set price (4 wheels) per size. Only listed sizes
  are offered; remove a size with the bin icon, add one with the **+ 22"** style buttons. Starting prices are
  placeholders (20" = the old set price, 19" −$600, 21" +$700, 22" +$1,500): **set the real ones**.

---

## 3. User journey

Welcome (`/`) → **Enter** → Showroom (`/models`) → **Build** → pre-curated vehicle notice → Configurator
(`/configure`) → **View your M4** → Summary (`/summary`) → Share / PDF / Enquire.
One 3D studio stays alive behind every step; the camera glides between stages rather than the page reloading.

| To change… | Edit |
|---|---|
| Brand name, logo, tagline, welcome copy, contact details, visualisation notice | `config/brand.ts` |
| Regions, languages, currencies and exchange rates (prices are stored in USD) | `config/brand.ts` → `regions` |
| Browser tab title, link-preview text | `index.html` |
| Welcome screen layout | `components/journey/WelcomeGate.tsx` |
| Showroom | `components/journey/Showroom.tsx` |
| Configurator panel and steps | `components/journey/Configurator.tsx` |
| Summary page | `components/journey/SummaryPage.tsx` |
| PDF layout | `services/brochurePdf.ts` |
| Enquiry form | `components/journey/EnquiryModal.tsx` |
| Car order in the showroom / default paint and wheel | Admin → *Sort order* (the first item is the default) |

**Where things are saved (Supabase):**
- **Enquiries** → table `leads` (name, email, phone, message, consultation, configuration, code, region).
  View them at Supabase → Table editor → `leads`. If Supabase is unreachable, a copy is kept in the visitor's browser.
- **Share codes** → table `saved_configurations`. Anyone with a code can reopen it; nobody can list them.

---

## 4. UI tweaks (brand)

| Change | How |
|---|---|
| Name, logo | `config/brand.ts`: `name`, and `logoUrl` (put the SVG/PNG in `public/` and use e.g. `'/logo.svg'`) |
| Colours | `config/brand.ts` → `colors`, and the matching `ink` / `bronze` colours in `index.html` (`tailwind.config`) |
| Font | Archivo, self-hosted in `public/fonts/` and declared in `index.html` |
| Studio lighting / reflections | `services/CarConfiguratorEngine.ts` → `setupStudioLighting('studio_light')` and `HDRI_URL` |
| Camera angles | `services/CarConfiguratorEngine.ts` → `setCameraPreset` |

**Safe editing loop (every time):**
```bash
git checkout -b my-change        # never edit main directly
bun install                      # first time only (or: npm install)
bun run dev                      # open http://localhost:3000, check the change
bun run lint                     # must print nothing
bun run build                    # must end with "built in …"
git commit -am "Describe change" && git push -u origin my-change
```
Vercel builds a **preview URL** for every pushed branch. Check it there before merging to `main`.

---

## 5. Deploy (Vercel)

A Vercel project **forged-configurator** (team *Nova Havens*) is connected to this repo. Every push
builds a preview URL; the production URL is <https://forged-configurator-nova-havens.vercel.app>.
Build settings: framework **Vite**, build `vite build`, output `dist`. No environment variables are needed.
`vercel.json` makes every page work on refresh. Optional: Settings → Domains → add the client's domain.

---

## 6. Pre-handover checklist (do it on the live URL, on a laptop **and** a phone)

- [ ] Loader → welcome in a few seconds; the car turns slowly on the welcome screen
- [ ] Showroom arrows switch cars (drive-out / drive-in); Explore shows specs
- [ ] Build → notice → Confirm opens the configurator; every paint, wheel, size and finish applies
- [ ] Choosing a wheel, size or finish cuts to the wheel close-up
- [ ] Prices and currency match the region chosen on the welcome screen
- [ ] Summary shows three stills; **Share** shows a code; opening `/?config=CODE` in a private window restores it
- [ ] **PDF** downloads a two-page spec sheet
- [ ] An enquiry appears in Supabase → `leads`
- [ ] `/admin` sign-in works for you **and** the client; sign-ups disabled (step 1.3)

---

## 7. Reference

- Database schema & policies: `supabase/migrations/` (apply to a new project in order, via the Supabase SQL editor)
- Catalogue loading & admin API: `services/catalogService.ts`
- Admin UI & editable fields: `components/admin/AdminPage.tsx`, `components/admin/entityConfig.ts`
- GLB fitting logic: `services/CarConfiguratorEngine.ts` → `loadCar` / `mountCarModel` (wheels found by name; if all four wheels are one mesh they are split by position)
- Procedural wheel shapes (used until a rim PNG/GLB is uploaded): `services/proceduralRims.ts`
- Storage buckets: `car-models` (GLB, 50 MB max), `rim-images` (PNG/WebP, 10 MB max); both publicly readable
- Free-tier note: Supabase pauses free projects after ~1 week with no traffic. Open the site (or the
  dashboard) the day before any demo; a paused project is restored from the dashboard in a minute.

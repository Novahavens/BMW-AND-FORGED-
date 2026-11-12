# FORGEDSA Configurator: Technical Handover & Customisation Guide

> For the business-owner overview, read [`CLIENT_HANDOVER.md`](CLIENT_HANDOVER.md) first. This guide is
> the technical companion. Brand name, logo, colours, contact details and social links live in one
> file: `config/brand.ts` (section 4). Terms and delivery copy live in `config/pages.ts`.

Follow the sections in order. Each step has a **Check** line; do not move on until it passes.

> **Task playbooks:** the recurring jobs (add a car, add wheels, tune paint, verify renders, lead
> emails, deploy, secrets) are also written up as skills in `.claude/skills/`, indexed in
> [`SKILLS.md`](SKILLS.md). Claude Code picks them up automatically; update the matching skill when a
> process changes.

---

## 0. What you have

| Piece | Where | Cost |
|---|---|---|
| Web app (React + Three.js, Vite) | this repo | free |
| Database, logins, file storage | Supabase project **Apex Forged Configurator** (`qxlfkfhzpqbxffuqqewg`, org *nova havens*) | free tier |
| Hosting | Vercel (step 5) | free Hobby tier |
| Lead emails | n8n workflow *FORGEDSA · Lead email (PDF downloads + enquiries)* (`Le68biVptAvswzqq`, novahavensai.app.n8n.cloud) + Gmail | existing n8n plan |
| Wheel pipeline | n8n workflow *FORGED wheel pipeline (automated)* + Google Sheet `wheels` | existing n8n plan |

**Pages**

| URL | What it is |
|---|---|
| `/` | Welcome: the dark carousel of studio stills of the four cars. The car is chosen here (arrows, scroll, keyboard, swipe or dots). Region and currency select, **Enter** (opens the configurator on the car showing) |
| `/models` | Opens the welcome. The showroom page that used to live here was removed on 2026-11-11 |
| `/configure` | Configurator: a live car on the dark stage (black backdrop, a pool of light on a pale floor, pool shadow, "FORGED" plates; the M5 G90 shows its Blender frames in the fixed views instead, `ADD_PREPARED_CAR.md`, "Body modes"); the stepped drawer (a bottom sheet on phones, a side panel on wider screens) with Overview, then steps 1 Paint, 2 Wheels, 3 Size, 4 Finish; camera chips Front / Side / Rear / Wheel / Top and a turntable button over the stage; **Change model** (back to the welcome carousel, which opens on the car being built); **More options** (the … button in the drawer header: Region, Load a configuration, Account & garage, links to The wheels, Enquire, Delivery & fitment, Terms & conditions and Credits, and Start again, which returns to the welcome); live set price (the dearer finish counts). `?panel=viewer` shows the viewer's glass panel instead, for comparison |
| `/summary` | Your build: studio stills, options, price, **Share** (configuration code + link), **PDF**, **Enquire**, **Save to garage** (signed in) |
| Account sheet (the **Account** button in the configurator's stage corner, or **More options** → **Account & garage**) | Google sign-in (Supabase Auth); profile; garage of saved builds (open, rename, delete); sign out. `docs/ACCOUNTS.md` |
| `/?config=CODE` | Reopens a shared configuration |
| `/forged` | The wheel collection |
| `/rims/<rim-id>` | One wheel in the 3D wheel studio (views Face / 3/4 / Side / Back / Top, finish chips, Show toggles): finish, size, price, "See it on my car" |
| `/delivery` | Delivery & fitment (copy in `config/pages.ts`) |
| `/terms` | Terms & conditions (copy in `config/pages.ts`) |
| `/admin` | Admin sign-in (with emailed set-password link), then edit cars, wheels, finishes and paints, upload GLBs, rim PNGs or CAD, and read Enquiries |

Since 2026-11-11 there is no showroom page: the car is chosen on the welcome carousel and **Enter** opens `/configure` on it. The `/configure` screen draws a live car in the stage look (`services/viewerStudio.ts`, `engine.setLook('stage')`: a black backdrop, a pool of light on a pale floor, a black reflection cove with one overhead softbox), modelled on the welcome's Cycles stills. Its controls are the stepped drawer (`StepDrawer` in `components/journey/Configurator.tsx`), which the owner chose over the viewer's glass panel. The prepared cars (M2 CS, M4 CS, M5, M5 Touring) are the line-up and the older Sketchfab cars are hidden until their packages arrive (`ADD_PREPARED_CAR.md`).

**Four cars are in the line-up:** the prepared M2 CS, M4 CS, M5 and M5 Touring (all with a GLB in
`public/models/`). The other eight rows (M4 Competition, M4 Convertible, M3, M3 Touring, M235, M8, X3 M50,
X5 M) stay in the catalogue but are hidden (`active = false`, migration `20261110141000_legacy_cars_hidden.sql`)
until their prepared packages arrive. Uploading a GLB alone does not bring a hidden car back: tick *Visible in
configurator* as well (the M4 Convertible has no 3D file at all). Model credits and licences:
`public/models/CREDITS.md`; the four prepared bodies are recorded there as **"Licence not confirmed"**
(prototype use until a licence covering web use is in hand, `ADD_PREPARED_CAR.md`, "Licence").

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
3. **Leave sign-ups and email confirmation on**: Authentication → Sign In / Providers → Email → *Allow
   new users to sign up* stays **on** (customers are created on their first Google sign-in, section 5b) and
   *Confirm email* stays **on**. The admin lock is the allowlist plus a **confirmed email**: since
   `supabase/migrations/20261110170000_admin_requires_confirmed_email.sql`, `private.is_admin()` says yes
   only for an `admin_users` address whose `auth.users.email_confirmed_at` is set, so an unconfirmed
   sign-up with an admin's address is just a customer. Create every admin with **Auto Confirm User**
   ticked (or have them set a password through the emailed link, which confirms the address); the check
   query is in `ACCOUNTS.md`, owner step 5c.
4. To make the **client** an admin too: create their user the same way, then in
   **SQL Editor** run:
   ```sql
   insert into public.admin_users (email) values ('client@theirdomain.com');
   ```
   To remove someone: `delete from public.admin_users where email = '...';`

**Check:** go to `/admin`, sign in, and you should see the Cars / Wheels / Finishes / Paints tabs.
If it says *"not on the admin allowlist"*, the email in `admin_users` doesn't match the login email, or
(after migration `20261110170000`) the admin's email is not confirmed (`ACCOUNTS.md`, owner step 5c).

---

## 2. Adding your custom assets

### 2a. Car models (.glb)

> **No Blender?** See `archive/NO_BLENDER_AND_UI_PLAN.md`, section 1: check names in the browser, rename in the free three.js editor, compress at gltf.report.
>
> **Got one of the prepared car packages** (Drive > 3d cars, `BMW_*.zip` with `C10_Wheel_FL..` and a `Paint` material)? One command does everything below: `node scripts/ingest-car.mjs BMW_M5_G90.zip --car m5_g90 --check`. See `ADD_PREPARED_CAR.md`.

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
3. Click **Back to studio** and choose that car on the welcome carousel, then **Enter**. A car with no slide
   on the carousel yet (see the note under the table in section 3) is not offered there; open
   `/configure?panel=viewer`, whose panel has Car chips, to look at it.

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
or a 3D modeller. See `archive/NO_BLENDER_AND_UI_PLAN.md` section 2b. The six stocked designs are already real
3D rims (`public/models/rims/`, from the website's files); a new one goes in with one command,
`node scripts/ingest-rim.mjs rim.glb --wheel <id> --new --name … --sizes … --price-zar … --finishes … --check`
(`docs/ADD_PREPARED_CAR.md`, "Rims the same way"; a staggered set adds `--rear rear.glb`). Brake parts inside
the file are dropped automatically.
- The rim only, **without a tyre**. Under 15 MB is ideal (compress at gltf.report).
- Upload: `/admin` → **Wheels** → the wheel → **Rim 3D model (.glb) → Upload** → **Save**.
- It's turned, sized to the rim diameter and centred automatically, and takes the finish colour.
  If the face points into the car, tick **Flip 3D rim** → Save.

**Check:** `/configure` → step 2 **Wheels** → select the wheel (the camera cuts to the wheel close-up; the
**Wheel** camera chip over the stage returns to it), then the **View in 360°** button on the wheel card,
which opens the rim page (`/rims/<rim-id>`, the 3D wheel studio with finish, size and price). Check the
wheel there as well: the rim page loads the same rim file as the car.

### 2c. Prices, names, finishes, paints

Everything in the drawers comes from the admin tabs. Edit → **Save** → the studio updates immediately.
- **Hide instead of delete**: untick *Visible in configurator*.
- **Order**: *Sort order* (lower = first).
- A wheel only offers the finishes ticked in *Available finishes*; *Default finish ID* must be one of them.
- **Sizes & prices**: each wheel has a list of sizes with a set price (4 wheels) per size. Only listed sizes
  are offered; remove a size with the bin icon, add one with the **+ 22"** style buttons. The six stocked
  wheels carry the stock sheet's prices (`docs/WHEEL_INVENTORY.md`; USD = ZAR ÷ 18.2 so the ZA price shows
  exactly). **Dearer finishes** (Polished Face, Liquid Metal) have their own set price in the field of that name;
  blank = same as the size price.
- **Rear rim 3D model**: only for a staggered set whose rear rim differs (FSA001); otherwise leave it empty.

---

## 3. User journey

Welcome (`/`, the car is chosen on the carousel) → **Enter** → Configurator (`/configure`) → **View your M4** →
Summary (`/summary`, which carries the visualisation notice) → Share / PDF / Enquire. There is no showroom.
One 3D studio stays alive behind the welcome and the configurator rather than the page reloading. While the
welcome stills cover the canvas the engine is prepared behind them (stage look built, camera framed as in the
configurator, the car on stage preloaded), so Enter reaches the configurator in well under a second in the
harness. **Enter** opens the car in the paint its still shows when that car's palette has it (the M2 CS in
Portimao Blue, the M5 in Fire Red); the M4 CS and M5 Touring palettes do not have their stills' paints, so they
open in their first paint. **Change model** in the configurator goes back to the welcome carousel, which opens
on the car being built.

| To change… | Edit |
|---|---|
| Brand name, logo, tagline, welcome copy, contact details, visualisation notice | `config/brand.ts` |
| Regions, languages, currencies and exchange rates (prices are stored in USD) | `config/brand.ts` → `regions` |
| Browser tab title, link-preview text | `index.html` |
| Welcome screen layout | `components/journey/WelcomeGate.tsx` |
| Welcome carousel: the cars, their order and the paint each still shows | `HERO_SLIDES` in `components/journey/HeroStage.tsx`; images in `public/hero/` |
| Configurator controls (Overview, then 1 Paint, 2 Wheels, 3 Size, 4 Finish; camera chips; turntable) | `StepDrawer` in `components/journey/Configurator.tsx`. The viewer's glass panel (`components/journey/ViewerPanel.tsx`) only shows with `?panel=viewer` |
| More options dialog (region, load a code, account, links to the other pages, Start again) | `MoreOptionsModal` in `components/journey/Configurator.tsx`; its page links are `menuLinks` in `App.tsx`. It replaces the hamburger menu and top bar, which went with the showroom (`components/journey/TopBar.tsx` is deleted). There is no "Home", "Models" or "Configure" entry; the welcome keeps its own "The wheels" link and social icons |
| Rim page (`/rims/<id>`) | `components/RimDetailPage.tsx`, `components/WheelStage.tsx`, `shared/wheel-viewer/WheelStudio.tsx`, `shared/wheel-viewer/wheelStudioParts.ts` |
| Summary page | `components/journey/SummaryPage.tsx` |
| PDF layout | `services/brochurePdf.ts` |
| Enquiry form | `components/journey/EnquiryModal.tsx` |
| Car order on the welcome, and the paint a car opens in | `HERO_SLIDES` (above). A car whose palette lacks its still's paint opens in the first paint of its palette |
| Order of the wheel list / default wheel | Admin → *Sort order* (the first wheel is the default) |

**The welcome carousel's slides are a fixed list (`HERO_SLIDES`), filtered to the catalogue's active cars.** Since
the showroom went, it is the only place a customer chooses the car, so:
- a car added in `/admin` is not offered to customers until it has a slide (a still in `public/hero/` and an
  entry in `HERO_SLIDES`; `PRODUCT_SPEC_CARS_AND_WHEELS.md` section 4.7);
- a car hidden in `/admin` loses its slide (`WelcomeGate` leaves out slides whose car is not on offer);
- *Sort order* on cars does not change the order of the slides.

**Where things are saved (Supabase):**
- **Enquiries** → table `leads` (name, email, phone, message, consultation, configuration, code, region).
  View them at Supabase → Table editor → `leads`. If Supabase is unreachable, a copy is kept in the visitor's browser.
- **Share codes** → table `saved_configurations`. Anyone with a code can reopen it; nobody can list them.

---

## 4. UI tweaks (brand)

| Change | How |
|---|---|
| Name, logo | `config/brand.ts`: `name`, and `logoUrl` (put the SVG/PNG in `public/` and use e.g. `'/logo.svg'`) |
| Colours | `config/brand.ts` → `colors` (used by the PDF), and the matching Tailwind tokens in `tailwind.config.cjs` (`gold`, `brass`, `carbon`, `surface`, `ember`). Main action buttons are the `primary` variant of `Button` in `components/journey/ui.tsx` (`bg-ember`, hover `ember-light`). The lead email has its own copy of the colours in the n8n Code node (§5a). |
| Font | Satoshi (headings) and Inter (body), self-hosted in `public/fonts/` and declared in `index.html`. The PDF embeds `satoshi-700/900.ttf` |
| Studio lighting / reflections | `/configure` (the stage look): `services/viewerStudio.ts` → `STAGE` (floor, pool of light, overhead softbox, exposure). The softbox studio the engine uses elsewhere: `services/CarConfiguratorEngine.ts` → `setupStudioLighting('studio_light')` and `HDRI_URL` |
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
Check a branch on the Render preview (below) before merging to `main`. Vercel builds nothing on push
(section 5).

---

## 5. Deploy (Vercel)

The production URL is <https://forged-configurator.vercel.app>. The client handover, the OAuth client
and the Supabase redirect list all use this URL. It is served by the Vercel project
**forged-configurator** (team *Nova Havens*, `prj_p1fOXWBPFfxedbLZFp9R3s1Qiq9P`).

**The project is not linked to this repo, so pushes and merges deploy nothing.** This was checked
read-only through the Vercel API on 2026-11-11:
- The project has no git connection.
- Its current production build (2026-10-08) was made from `Novahavens/BMW-AND-FORGED-` at `0aef67e`,
  42 commits behind this repo's `main`.
- No build has ever come from `FazalRSA/BMW-AND-FORGED-`.

To update production there are two routes. Either connect this repo in the project's Git settings and
merge to `main`, or start a production deployment by hand from a `main` commit (the
`forgedsa-deploy-and-release` skill). Either way, production deploys are the owner's call.

Build settings: framework **Vite**, build `vite build`, output `dist`. No environment variables are
needed. `vercel.json` makes every page work on refresh. Optional: Settings → Domains → add the client's
domain.

**Production reads the live Supabase catalogue.**
- All fifteen `supabase/migrations/20261110*.sql` files were applied to the live project on 2026-11-10
  and checked against its migration history on 2026-11-11.
- They cover the four prepared cars, the hidden legacy cars, the six stock-sheet wheels and finishes,
  customer accounts, the confirmed-email admin lock, the M2 CS / M5 Touring specs and the
  own-brakes hide rule.
- The two `CONCURRENTLY` indexes from `ACCOUNTS.md` step 5b were created separately.

The production code, however, is still the 2026-10-08 build until it is redeployed. **Continue with
Google** fails until the Google provider and redirect URLs are set up (`ACCOUNTS.md`, owner steps 1
to 4).

---

### Branch preview on Render

While a branch is under review it can be seen at <https://forgedsa-configurator.onrender.com>: a Render
static site (`forgedsa-configurator`, workspace *My Workspace*) that builds `ccr-f52bf849-fnf7qs` on every
push with `npm install --no-audit --no-fund && npm run build && cp dist/index.html dist/404.html`, publish
`dist`, env `NODE_VERSION=22` and `VITE_CATALOG_SOURCE=static` (the bundled catalogue, so the preview shows
the new cars and wheels before the migrations are applied). Point it at another branch in the Render
dashboard → Settings → Branch. Everything else (share codes, leads, PDF, admin) uses the live Supabase
project, so test leads from the preview email the team like real ones. **Google sign-in only works on a
URL in the Supabase redirect list** (`ACCOUNTS.md`, owner step 3): add `https://forgedsa-configurator.onrender.com/**`
before testing accounts on the preview, and `http://localhost:3000/**` for `bun run dev` (Vite is set to
port 3000 in `vite.config.ts`; the list as written names `localhost:5173`, the port the harness scripts use).

## 5a. New-lead email automation

Every insert into `public.leads` (the PDF gate, `source = 'pdf'`, and the enquiry form, `source = 'enquiry'`)
emails forgedsa1@gmail.com a branded HTML summary.

```
browser ── insert ──▶ public.leads ── AFTER INSERT trigger leads_notify_webhook
                                        └─ private.notify_lead_webhook()  (SECURITY DEFINER)
                                             · looks up car / paint / wheel / finish by the names stored in
                                               leads.configuration (generation, hex, type, image, price for the size)
                                             · pg_net net.http_post (async, never blocks or fails the insert)
                                                  ▼
n8n "FORGEDSA · Lead email" ── Webhook (POST) ─▶ Code "Build branded email" ─▶ Gmail "Email forgedsa1@gmail.com"
```

- **Migration:** `supabase/migrations/20260928090000_lead_email_webhook.sql` (enables `pg_net`, creates the
  function and trigger).
- **Webhook URL:** a secret, kept only in **Supabase Vault** as `lead_webhook_url`, never in the repo. The
  path is random, so it acts as the key. With no secret the trigger is a no-op. To rotate: change the
  Webhook node path in n8n, publish, then
  `select vault.update_secret(id, '<new production URL>') from vault.secrets where name = 'lead_webhook_url';`
- **Email template:** the n8n Code node. A copy is in `n8n/lead-email.code.js` (excluded from `tsc`), built with
  table-based, inline-styled HTML for Gmail/Outlook/Apple Mail. The brand tokens (#121212, #1A1A1A, #CF9F52,
  #F2EEE6, #9C978E) and region rates mirror `config/brand.ts`, so **if you change region rates or colours
  there, change them in the Code node too.** All customer text is HTML-escaped.
- **Sender:** n8n credential *Gmail account* (fazal@novahavens.com), display name "FORGEDSA Leads",
  Reply-To set to the customer.
- **Debugging:** `select * from net._http_response order by created desc limit 5;` shows each call and its
  status (n8n replies 200 "Workflow was started"); n8n → workflow → Executions shows each email.
- **New project / restore:** apply the migration, publish the workflow, then
  `select vault.create_secret('<n8n production webhook URL>', 'lead_webhook_url');`

---

## 5b. Customer accounts (Google sign-in)

Customers can sign in with Google (Supabase Auth) to keep a garage of saved builds; share codes and
leads they create carry their account id, and the PDF gate and enquiry form pre-fill from their
profile. Anonymous use is unchanged. The one-time dashboard setup (Google provider, redirect URLs),
the schema and policies (`supabase/migrations/20261110150000_customer_accounts.sql`), what is stored
(POPIA) and the test script are in [`ACCOUNTS.md`](ACCOUNTS.md). Admins keep their password sign-in and
the `admin_users` allowlist, so a Google customer gains nothing at `/admin`; the one change for admins is
that their email must be **confirmed** (step 1.3, migration `20261110170000`). Sign-in only works from a
URL in the redirect list: production, the Vercel preview pattern, localhost, and the Render preview if
you add it (section 5, "Branch preview on Render").

---

## 6. Pre-handover checklist (do it on the live URL, on a laptop **and** a phone)

**Before you start (otherwise the car, wheel and account items below cannot pass):** every
`supabase/migrations/20261110*.sql` applied in order, ending with `20261110170000` and `20261110171000`
(section 5); the Google provider, redirect URLs and the confirmed-admin check done (`ACCOUNTS.md`, owner
steps 1 to 5); the URL you test on is in the redirect list. Until then, use the Render preview for the
car and wheel items (it ships the bundled catalogue) and skip the account item.

- [ ] Loader → welcome in a few seconds; the welcome shows a studio still of a car on a dark stage
- [ ] The welcome's arrows, scroll, arrow keys, swipe and dots switch between the four cars (M2 CS, M4 CS, M5, M5 Touring); no Sketchfab-era car appears
- [ ] **Enter** opens the configurator on the car showing (the M2 CS in Portimao Blue, the M5 in Fire Red, the M4 CS and M5 Touring in their first paint); every paint, wheel, size and finish applies; **Change model** returns to the welcome on the same car
- [ ] Choosing a wheel, size or finish cuts to the wheel close-up
- [ ] Prices and currency match the region chosen on the welcome screen
- [ ] Summary shows three stills and the visualisation notice; **Share** shows a code; opening `/?config=CODE` in a private window restores it
- [ ] **View in 360°** on a wheel opens the rim page: the wheel studio draws the rim, the view and finish chips work, FSA001 offers Front / Rear
- [ ] **PDF** downloads a two-page spec sheet
- [ ] PDF asks for email + mobile first; the lead appears in `/admin` → Enquiries as "PDF download"
- [ ] An enquiry appears in `/admin` → Enquiries
- [ ] Both send a branded email to forgedsa1@gmail.com within a few seconds (n8n → Executions shows green)
- [ ] `/admin` sign-in works for you **and** the client; *Allow new users to sign up* **and** *Confirm email* are both still **on**, and every admin's email is confirmed (step 1.3; a Google customer visiting `/admin` sees "not on the admin allowlist")
- [ ] Account → **Continue with Google** signs a customer in (needs the `ACCOUNTS.md` owner steps and the test URL in the redirect list); **Save to garage** on the summary lists the build in the garage; **Open** restores it; sign out
- [ ] Every wheel in the panel is one of the six on the stock sheet, with its finishes and ZAR prices (`docs/WHEEL_INVENTORY.md`); FSA001 shows different front and rear rims

---

## 7. Reference

- Project skills (task playbooks): `.claude/skills/`, indexed in `docs/SKILLS.md`
- Database schema & policies: `supabase/migrations/` (apply to a new project in order, via the Supabase SQL editor)
- Catalogue loading & admin API: `services/catalogService.ts`
- Admin UI & editable fields: `components/admin/AdminPage.tsx`, `components/admin/entityConfig.ts`
- GLB fitting logic: `services/CarConfiguratorEngine.ts` → `loadCar` / `mountCarModel` (wheels found by name; if all four wheels are one mesh they are split by position)
- Procedural wheel shapes (used until a rim PNG/GLB is uploaded): `services/proceduralRims.ts`
- Storage buckets: `car-models` (GLB, 50 MB max), `rim-images` (PNG/WebP, 10 MB max); both publicly readable
- Free-tier note: Supabase pauses free projects after ~1 week with no traffic. Open the site (or the
  dashboard) the day before any demo; a paused project is restored from the dashboard in a minute.

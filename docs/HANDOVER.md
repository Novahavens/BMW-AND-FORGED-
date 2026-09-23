# Apex Forged Configurator: Handover & Customisation Guide

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
| `/` | 3D studio configurator (landing page today) |
| `/forged` | Marketing / showcase page |
| `/admin` | Admin sign-in, then edit cars, wheels, finishes, paints, calipers, and upload GLBs and rim PNGs |

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

**Check:** go to `/admin`, sign in, and you should see the Cars / Wheels / Finishes / Paints / Calipers tabs.
If it says *"not on the admin allowlist"*, the email in `admin_users` doesn't match the login email.

---

## 2. Adding your custom assets

### 2a. Car models (.glb)

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

### 2b. Rim images (.png)

**Prepare each image:**
- Straight-on, face view of the rim (not at an angle).
- **Transparent background** (remove.bg or Photoshop). Transparent areas show the brake behind.
- Crop square, with the outer rim edge **touching all four edges** of the image.
- 1024×1024 to 2048×2048 px, PNG or WebP, under 10 MB.

**Upload:** `/admin` → **Wheels** → pick a wheel (or **New wheel**) → **Rim image → Upload** → **Save**.
The image replaces the 3D spokes on the car and the thumbnails in the wheel drawer. The finish colour
(Liquid Metal, Gloss Black…) tints it.

**Check:** Studio → open the wheel drawer → select that wheel → **Zoom to Wheel**.

> Image rims look best from the front, side and 3/4 views. Seen from steep angles they look flat. That's the
> trade-off of using 2D images; true 3D rims would need wheel GLBs.

### 2c. Prices, names, finishes, paints

Everything in the drawers comes from the admin tabs. Edit → **Save** → the studio updates immediately.
- **Hide instead of delete**: untick *Visible in configurator*.
- **Order**: *Sort order* (lower = first).
- A wheel only offers the finishes ticked in *Available finishes*; *Default finish ID* must be one of them.

---

## 3. Landing page & user journey

**Current journey:** `/` opens straight into the 3D studio → vehicle drawer (car, paint, calipers,
ride height) → wheel drawer (design, finish, size, price) → **Get Brochure** (lead form) →
`/forged` is a separate showcase page linked from the header.

| To change… | Edit |
|---|---|
| Browser tab title, link-preview text | `index.html` lines 6–10 |
| Loading screen text | `App.tsx`, search `APEX FORGED 3D STUDIO` |
| Header logo, links, buttons | `components/ConfiguratorHeader.tsx` |
| Showcase page copy, hero, social links | `components/ForgedPage.tsx` |
| Brochure form wording | `components/BrochureModal.tsx` |
| Which drawer is open on arrival | `App.tsx`: `isVehicleDrawerOpen` (`true`) / `isDrawerOpen` (`false`) |
| Starting car / paint / wheel | Admin → *Sort order* (the first item is the default) |
| Make `/forged` the landing page | `App.tsx` → `routeFromLocation`: return `'forged'` instead of the final `'studio'` |

**Fix before the client sees it** (template leftovers):
- `ForgedPage.tsx` shows a fake terminal command (`npx apex-forged …`, line 48) and an announcement
  pill with a version number: remove them or replace them with real copy.
- `ForgedPage.tsx` social links point to the generic facebook.com / instagram.com / tiktok.com homepages
  (around lines 388–415): put in the real profile URLs or delete them.
- `ForgedPage.tsx` logo is a Vercel-style triangle (around line 103): swap in the client's logo.
- Header button **"2D → 3D AI"** (`ConfiguratorHeader.tsx` line 87) is a manual image tool, not AI: rename it.
- The brochure form saves leads **only in that visitor's browser** (localStorage). No one receives them.
  Either tell the client it's a demo, or ask for it to be wired to Supabase + email (about 1–2 h of work).

---

## 4. UI tweaks (brand)

| Change | How |
|---|---|
| Accent colour (orange `#FF5500`) | Find & replace `#FF5500` across the project (≈200 uses), plus the `neon` colours in `index.html` (`tailwind.config`) and `#FF6600`/`#FF7722` hover shades |
| Font (forced to Verdana) | `index.html`: change the `font-family` rules marked `!important` and `fontFamily` in `tailwind.config`. A Google font is already loaded: `Geist` |
| Brand name "Apex Forged" | Find & replace in `index.html`, `App.tsx`, `components/*.tsx`, `metadata.json` |
| Studio background / lighting | Studio controls in the app (theme buttons); defaults live in `services/CarConfiguratorEngine.ts` → `setupStudioLighting` |
| Currency | Prices display as `$… USD` in `components/WheelDrawer.tsx` and `components/BrochureModal.tsx` |

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

## 5. Deploy (Vercel, 10 min, once)

1. <https://vercel.com/new> → import `novahavens/BMW-AND-FORGED-`.
2. Framework preset **Vite**, build command `npm run build`, output `dist` (auto-detected).
3. Environment variables are **optional** (the Supabase URL and publishable key are built in; they're
   safe to be public). To override, copy them from `.env.example`.
4. Deploy. `vercel.json` already makes `/admin` and `/forged` work on refresh.
5. Optional: Settings → Domains → add the client's domain.

**Check:** on the live URL, `/`, `/forged` and `/admin` all load, and refreshing each still works.

---

## 6. Pre-handover checklist (do it on the live URL, on a laptop **and** a phone)

- [ ] Studio loads in under ~5 s, with no stuck loading screen
- [ ] Every car switches; uploaded GLBs face the camera, correct size, paint changes colour
- [ ] Every wheel shows on the car; image rims look right in **Zoom to Wheel**
- [ ] Every finish, paint and caliper colour applies
- [ ] Prices in the drawer match what the client expects
- [ ] Template leftovers from section 3 removed
- [ ] `/admin` sign-in works for you **and** the client; sign-ups disabled (step 1.3)
- [ ] Change a price in admin → it appears in the studio → change it back
- [ ] Brochure form behaviour explained to the client (demo only / wired up)

---

## 7. Reference

- Database schema & policies: `supabase/migrations/` (apply to a new project in order, via the Supabase SQL editor)
- Catalogue loading & admin API: `services/catalogService.ts`
- Admin UI & editable fields: `components/admin/AdminPage.tsx`, `components/admin/entityConfig.ts`
- GLB fitting logic: `services/CarConfiguratorEngine.ts` → `loadCar` / `mountCarModel`
- Storage buckets: `car-models` (GLB, 50 MB max), `rim-images` (PNG/WebP, 10 MB max); both publicly readable
- Free-tier note: Supabase pauses free projects after ~1 week with no traffic. Open the site (or the
  dashboard) the day before any demo; a paused project is restored from the dashboard in a minute.

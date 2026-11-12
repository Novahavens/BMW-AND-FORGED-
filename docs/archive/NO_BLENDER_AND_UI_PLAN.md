# Plan: Custom Assets Without Blender + New UI

> **Archived (2026-11-11).** Written for the first handover, before Blender (`bpy`) was adopted as
> a standard tool in this repo and before the UI direction (the stepped drawer, no showroom) was
> decided. Kept for its still-useful tips (checking GLB part names in a browser viewer, the free
> three.js editor rename trick, `gltf.report` compression). Current process:
> [`../PRODUCT_SPEC_CARS_AND_WHEELS.md`](../PRODUCT_SPEC_CARS_AND_WHEELS.md) (cars and wheels),
> [`../MAP.md`](../MAP.md) (navigation).

Companion to `HANDOVER.md`. This covers:
1. Getting your car GLBs and rim PNGs in **without Blender**
2. Where **OpenRouter, n8n and Firecrawl** fit
3. Changing the **UI**
4. One master to-do list, in order

---

## TL;DR: do these first

1. **Check your GLBs before touching anything** (2 min per file, section 1, Step 1). Many models already have
   usable part names and will just work when uploaded.
2. For files that don't: **rename parts in the free three.js editor in your browser** (section 1, Option B).
   No install, about 5 min per car.
3. **Compress** each GLB at gltf.report (section 1, Step 3).
4. Rims: **remove backgrounds** with remove.bg or Canva, then upload (section 2).
5. Pick a **UI direction** (section 4) and send the brand info (section 6).

If you'd rather skip the manual steps entirely, I can build **Option A** (a click-to-tag part picker and
automatic compression inside `/admin`). That's the proper long-term fix.

---

## 1. Car models (.glb) without Blender

The app needs to know two things about each model:
- which parts are **paint**
- which parts are the **wheels**, so it can hide them and put the forged wheels in their place

It works this out from part names. So the whole job is: *check the names, fix them if needed, compress, upload.*

### Step 1: Check what you already have (no editing)
1. Open <https://gltf-viewer.donmccurdy.com> and drag your `.glb` in.
2. Open the panel on the right and expand the **scene hierarchy**. It lists every part's name.
3. Look for:
   - Parts whose name contains `wheel`, `rim`, `tyre` or `tire`, **one per corner** (4 in total).
   - Body parts or materials containing `paint`, `body`, `carpaint` or `exterior`.

**If both are there:** skip to Step 3.
**If the names are different but consistent** (e.g. body material is `Mat_Shell`, wheels are `Roue_AVG`):
don't rename anything. Just type those names into the admin (Cars → *Paint mesh/material names* =
`Mat_Shell`, *Hide mesh names* = `Roue`). The fields accept several names separated by `|`.
**If the names are meaningless** (`Object_12`, `Mesh.004`): go to Option B, or ask me for Option A.

### Option B: Rename parts in the browser (free, no install)
1. Open <https://threejs.org/editor/>.
2. **File → Import** → pick your `.glb`.
3. Click a part in the 3D view (or in the list at the top right). Its name shows in the **Object** tab.
4. Rename:
   - each wheel: `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` (front-left, front-right, rear-left, rear-right)
   - each painted body panel: `Body_Paint` (several parts can share the name; if there are too many, see the tip below)
5. **File → Export → GLB**.

*Tip:* if the body is dozens of parts, check the **Material** tab of one body panel instead. If they all share
one material, type that material's name into the admin's *Paint mesh/material names*. That's one change instead of dozens.

### Option A: Click-to-tag inside `/admin` (I build it, about half a day)
What you'd get:
- After uploading a GLB, the admin shows the model in 3D.
- Click a part, then choose **Paint** / **Wheel** / **Hide**. The choices are saved to the database, so no renaming is ever needed.
- **Automatic compression on upload** (glTF-Transform, running in the browser). Files shrink before they reach storage.
- The admin shows **"4 of 4 wheels found ✓"** so you know it'll work before you open the studio.

To-dos if you want this:
- [ ] Tell me "build Option A"
- [ ] Send me 1–2 of your real GLBs (Drive link is fine) so I can test against them

### Step 3: Compress (do this for every car)
Big files are the main reason a 3D demo feels broken.
1. Open <https://gltf.report> and drag your `.glb` in. It shows the file size and texture sizes.
2. Use its export or optimise options to compress the mesh (Draco or Meshopt) and shrink textures.
   **Keep textures to 2048 px or less.**
3. Target **under 15 MB** (hard limit 50 MB). Both compression types load in the app automatically.

### Step 4: Upload and verify
`/admin` → **Cars** → the car → **Upload** → **Save** → **Back to studio**. If something looks off, use the
fix table in `HANDOVER.md` section 2a (rotation, length, names).

### Licensing
For each model, confirm you're allowed to use it **commercially**. Sketchfab and marketplace licences vary, and
the client will ask. Keep the licence or receipt in a folder you hand over.

---

## 2. Rim PNGs without Photoshop

Each rim needs: a front-on view, a **transparent background**, square, and the rim edge touching the image edges.

| Tool | Cost | Quality | How |
|---|---|---|---|
| **remove.bg** | free for small previews, paid for full-res | very good | upload → download PNG |
| **Canva** (Pro) | subscription | good | Edit photo → *BG Remover* → download as PNG with *transparent background* |
| **Admin auto-prep** (I build, about 2–3 h) | free | good on clean studio shots | upload a photo → the admin crops to the rim circle, removes the background and the gaps between spokes, and shows a preview with a slider |
| OpenRouter image models | pay per use | **not recommended** | AI image editing redraws the rim, so spokes and logos change. Not acceptable for a real product. |

**Then crop square:** in Canva, resize to 2048×2048, place the rim so its edge touches all four sides, and download as PNG.

To-dos:
- [ ] Collect one front-on photo per rim design
- [ ] Remove backgrounds (remove.bg or Canva) **or** ask me for admin auto-prep
- [ ] Crop square, 2048×2048, rim edge to edge
- [ ] Upload each one under Admin → Wheels → the wheel → **Rim image** → **Save**

---

### 2b. Rims in full 3D (no Blender)

A PNG is already turned into solid 3D spokes automatically (section 2 prep is all it needs). For a true
3D rim, upload a **GLB** under Admin → Wheels → *Rim 3D model*. Ways to get one, best first:

| Source | Quality | Cost / time | Notes |
|---|---|---|---|
| **Client's CAD files** (STEP/STL, the file the wheel was machined from) | exact | free, same day | Convert to GLB with an online converter (e.g. CAD Exchanger), or send them to me. Ask the client first: forged-wheel makers always have these. |
| **3D modeller** (Fiverr / Upwork) | near-exact | about $30–150 per rim, 1–3 days | Send front photo + side photo + dimensions |
| **AI image-to-3D**: Tripo, Meshy (use its symmetry setting), Hunyuan3D | variable | minutes, pay per model | Upload several angles. Check spokes and bolt holes closely; hidden sides are guessed. Can be automated with n8n via their APIs. |

After upload: if the rim faces into the car, tick **Flip 3D rim**.

## 3. Where OpenRouter, n8n and Firecrawl fit

| Tool | Best use here | Effort |
|---|---|---|
| **Firecrawl** | Scrape the **client's existing website** to pull the logo, brand colours, product names, specs and copy, so the configurator matches their brand and catalogue without retyping. | Me: about 30 min, once you send the URL |
| **n8n** | **Brochure leads:** form → n8n webhook → save the lead + email you (Gmail) + create a Monday item + optional SMS. Also a **catalogue import** (spreadsheet → Supabase) if the client has many products. | Leads workflow: about 1–2 h |
| **OpenRouter** | **Writing:** wheel descriptions, highlights and brochure copy from specs (a "✨ Write description" button in admin). **Checking:** a vision model flags rim images that are off-centre, angled or have backgrounds left. | about 1–2 h |

**Security rule:** the OpenRouter API key must **never** be in the website code, because anyone could copy it.
Calls go through n8n (a webhook the admin calls) or a Supabase Edge Function, and the key lives there.

To-dos:
- [ ] Send me the client's website URL (for Firecrawl)
- [ ] Decide: wire up brochure leads via n8n? (Yes/No) If yes: which email gets the lead, and Monday board or not
- [ ] Decide: an OpenRouter description writer in admin? (nice to have, not needed for tomorrow)

---

## 4. Changing the UI

### Decide the direction (pick one)

| Option | What changes | Effort | Good for |
|---|---|---|---|
| **1. Rebrand** | Client's logo, colours, fonts and name everywhere. Remove template leftovers. Same layout. | 2–3 h | Handover tomorrow, safest |
| **2. Guided flow** (recommended after handover) | Replace the side drawers with a Porsche/BMW-style **step bar**: *Car → Paint → Wheels → Finish → Calipers → Summary*. A live price, and a summary page with a "Get brochure" button. Mobile-first. | 1–2 days | A clear, premium client journey |
| **3. Landing page + studio** | A new hero landing page (brand, hero render, "Configure yours" button) in front of the studio; `/forged` merged into it | 0.5–1 day | Marketing-led launch |

My recommendation: do **Option 1 tonight** for the handover, and quote Options 2 and 3 to the client as phase 2.

### What I need to do Option 1
- [ ] Client brand name
- [ ] Logo (SVG preferred, or a transparent PNG)
- [ ] Brand colours (primary accent + background), or their website URL and I'll pull them with Firecrawl
- [ ] Font preference (or "match their website")
- [ ] Real social links, or "remove them"
- [ ] Currency and whether prices show at all

### What I'll change for Option 1
- [ ] Accent colour `#FF5500` → brand colour, everywhere
- [ ] Verdana → brand font
- [ ] "Apex Forged" → brand name (title, loading screen, header, brochure, admin)
- [ ] Logo in the header, the showcase page and the loading screen
- [ ] Remove the fake terminal command, the version pill and the Vercel-style logo; rename the "2D → 3D AI" button
- [ ] Real or removed social links
- [ ] Replace the Tailwind CDN with a proper build (faster, no console warning)
- [ ] Check on a phone and a laptop, redeploy

---

## 5. Master to-do list

### Tonight (for the handover)
- [ ] Create your admin login and turn off sign-ups (`HANDOVER.md` step 1)
- [ ] Deploy to Vercel (`HANDOVER.md` step 5)
- [ ] Check each GLB's names (section 1, Step 1); rename if needed (Option B)
- [ ] Compress each GLB (section 1, Step 3), then upload and check it in the studio
- [ ] Remove rim backgrounds, crop, and upload (section 2)
- [ ] Send me the brand info → I do the Option 1 rebrand
- [ ] Decide about brochure leads: explain "demo only" **or** I wire up n8n
- [ ] Run the pre-handover checklist (`HANDOVER.md` step 6) on the live URL

### Handover meeting
- [ ] Show the studio journey; show `/admin` editing a price live
- [ ] Create the client's admin login (`HANDOVER.md` step 1.4)
- [ ] Hand over: live URL, admin login, the repo, model licences, and these two guides
- [ ] Agree phase 2 (UI Option 2/3, click-to-tag part picker, lead automation, AI descriptions)

### Phase 2 (after handover, if the client wants it)
- [ ] Option A: click-to-tag parts + automatic GLB compression in admin
- [ ] Admin rim auto-prep (background removal and crop)
- [ ] Guided step-by-step UI or a new landing page
- [ ] n8n lead workflow, OpenRouter description writer

---

## 6. Send me this and I'll do the rest

1. Which UI option (1, 2 or 3) for tomorrow?
2. Brand name, logo, colours or website URL, font, social links, currency
3. Leads: demo only, **or** n8n to email/Monday (which email?)
4. Do you want Option A (no renaming ever) and admin rim auto-prep built now or in phase 2?
5. 1–2 of your real GLBs and rim photos (Drive link) so I can test with your actual files

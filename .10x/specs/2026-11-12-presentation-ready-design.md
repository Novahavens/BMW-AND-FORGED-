# Presentation-ready: photoreal rims, Tripo, three working logins

**Status:** Proposed, waiting for the owner's approval. No code has been written.
**Date:** 2026-11-12 · **Feature slug:** `presentation-ready` · **Branch:** `claude/clever-brahmagupta-xnnpfj`

## 1. What the owner asked for

1. Get the app and its parts ready to present.
2. Get the rims photoreal, fast.
3. Install and configure the Tripo CLI (`npm install -g tripo-cli`).
4. Use the wheel images in Drive > "WEBSITE wheels".
5. The rims must render on the cars in the app.
6. Supabase must work for admin, dealership and customer logins.

## 2. What is true today (checked 2026-11-12)

### Rims
- All six stocked wheels (FSA001 front and rear, FSA002, FSA003, FSA004, FF-1, FF-3) are **already real 3D rim files**
  (`public/models/rims/*.glb`, 0.4 to 0.75 MB each, from the FORGED website). Supabase has 6 active wheels, 6 with a
  `model_url`. They already mount on all four cars and on the rim page.
- The geometry is right. What makes them read as "not photoreal" is in the check sheet
  `docs/ingest/stock-wheels.jpg`: the stage is dark, so dark finishes (Black Matte, Hyper Black, Gloss Black, Liquid
  Metal) become black holes in the arch; metal has little to reflect; nothing separates the rim from the tyre and brake.
  Gold and Bronze read best because they are bright.
- Drive > "WEBSITE wheels" has per-wheel folders: FSA 001 (2 photos + `website` and `3d` subfolders), FSA 002 (3 photos),
  FSA 003 (2 photos), FSA4 (3 photos), sixnine ff3 (7 studio PNGs: Hero / Half / Side in Glossy Black, Hyper Silver,
  Liquid Metal, Pure Bronze). **There is no FF-1 folder.** These are the reference for "what real looks like".

### Tripo CLI
- Installed in this sandbox: `tripo-cli` 0.11.2 (Node 22). The npm name the owner gave is correct.
- Not configured: there is no API key yet. The CLI reads `TRIPO_API_KEY` (`tsk_...`) and `TRIPO_REGION=ov`
  (international). Keys come from the Tripo developer console and use **API credits, not Tripo Studio credits**.
- Dry runs (no upload, no charge) against an FSA002 photo:

  | Job | Endpoint | Credits (list price) |
  |---|---|---|
  | One photo, geometry only, detailed, model v3.1 | image-to-model | 40 |
  | Two photos (front + side), model v3.1 | multiview-to-model | 30 |

- Known limit, from Tripo's own guide and independent tests: **thin spokes and brake detail are the first thing
  image-to-3D blurs or breaks**. A rim is the hardest kind of object for it: thin, symmetric, shiny, and
  self-occluding. The website GLBs are modelled, symmetric and clean, so Tripo is not expected to beat them.

### Logins (live project `qxlfkfhzpqbxffuqqewg`)

| Login | Built | Live state |
|---|---|---|
| Admin `/admin` (email + password, allowlist) | yes | 1 admin with a confirmed login. Works. |
| Dealer `/dealer` (email + password or Google, allowlist) | yes, merged in #22 | 1 active dealership and 1 allowlisted email, but **that email has no Supabase Auth user**, so nobody can sign in yet. Never tried for real. |
| Customer (Google) | yes | **Google provider is OFF** (live `/auth/v1/settings`: `google: false`). No customer can sign in. |

- Email sign-up is on, email confirmation is required (`mailer_autoconfirm: false`).
- The production site is still the 8 October build (`docs/SESSION_HANDOVER_2026-11-11.md` section 5). What the
  owner presents must be a fresh deploy.

## 3. Approaches considered for "photoreal rims, fast"

| Approach | What it is | Time | Result | Verdict |
|---|---|---|---|---|
| **A. Light and finish pass on the existing GLBs** (recommended) | Keep the website rims. Give the wheels their own reflection environment, lift the arch so dark finishes read, tune the eight finishes against the Drive photos, add tyre and contact-shadow detail. | about 1 day | Same rims everywhere (car, rim page, summary, PDF), every finish, every car | **Do first.** It fixes what is actually wrong. |
| B. Tripo meshes from the Drive photos | `tripo make` per wheel, then centre, scale, symmetrise and pack into the existing rim format | half a day per wheel, plus a clean-up step that does not exist yet | Likely lumpy spokes, needs radial symmetry repair; textures would be thrown away because finishes are ours | **Spike on one wheel only.** Use Tripo for wheels with no 3D file (the "Custom order wheels" folder), not to replace good ones. |
| C. Pre-rendered Cycles stills of each rim | Blender renders per wheel and finish for the rim page hero and PDF | CPU here: slow (minutes per frame) | Truly photoreal stills, but not on the live car | **Optional extra** for the rim page and PDF if time remains. |

"Don't build" option: present the Gold and Bronze builds only, which already read well. Rejected as the main plan
because the owner wants every rim to look right, but it is the fallback if the presentation is within hours.

## 4. Design

### Workstream R — rims photoreal (approach A)

1. **Reference board.** Pull the Drive photos for each wheel into `docs/reference/website-wheels/` and build a side-by-side
   sheet: Drive photo next to our live render, same finish, close view. This is the yardstick for every later step.
2. **Wheel reflection environment.** Rim materials get a studio environment of their own (a bright softbox strip
   environment), separate from the dark stage the body uses, so metal has highlights to show. Intensity per finish kind.
3. **Arch fill.** A low, soft fill aimed into the wheel arches and a thin rim light along the lip, so Black Matte, Hyper
   Black and Gloss Black separate from the tyre and the brake.
4. **Finish recipe tuning** in `services/wheelFinish.ts`: clearcoat on the painted finishes, lower roughness on Polished
   Face and Liquid Metal, brushed-metal anisotropy on Polished Face only if the rim files have UVs (checked first). Each
   finish is tuned against its Drive photo.
5. **Tyre and contact.** Tyre sidewall roughness and a soft contact shadow under each wheel.
6. **The rim page.** The wheel studio there is the shared viewer owned by the Forgedwebsite repo (a byte-identical copy,
   `bun run lint` fails if edited here). This app's part is `services/wheelViewerPaint.ts` and `components/WheelStage.tsx`.
   Finish changes flow through automatically; viewer lighting changes must be made in the website repo, which this session
   cannot reach unless it is added.

Verification: `scripts/render/shoot.cjs` and `?look=stage`, every wheel in every finish on the M2 CS and M5, front-wheel close
and three-quarter views, contact sheets next to the Drive photos. Renders here are SwiftShader on CPU (about 50 s a shot);
no GPU or phone result can be claimed.

### Workstream T — Tripo set-up and a one-wheel spike (approach B)

1. Save the Tripo API key as a network secret for the Tripo API host, so it never sits in the repo or the chat.
2. `tripo doctor` and `tripo balance` to prove the key and credits.
3. Spike: FSA002 from its Drive photos, geometry only, model v3.1 detailed, plus a two-photo multiview run.
   About 70 credits in total.
4. Normalise the result (centre on the hub axis, scale to the 20" rim diameter, face +Z) and put it next to the website
   GLB in the same render. Keep or drop on that evidence. A `scripts/rim3d/tripo-rim.mjs` wrapper is only written if the
   spike passes.

### Workstream L — three logins working

1. **Customer, Google.** Owner steps 1 to 4 in `docs/ACCOUNTS.md`: create the Google OAuth client, switch the Google
   provider on in Supabase with that client ID and secret, set Site URL and redirect URLs. These need the owner's Google
   Cloud and Supabase dashboard; the Supabase connector here cannot set auth providers.
2. **Dealer.** Create the dealer's Supabase Auth user (Auto Confirm) for the allowlisted email, or have them use Google once
   step 1 is done. Then a real sign-in at `/dealer`.
3. **Admin.** Already works. The plain sign-in card gets the brand redesign that was started and stopped
   (`docs/SESSION_HANDOVER_2026-11-11.md` section 6) only if the owner wants it for the presentation.
4. **Test accounts for the demo**: one admin, one dealer, one customer, written down for the owner (not in the repo).
5. Re-run the rolled-back RLS check from `docs/DEALERS.md` against the live database.

### Workstream D — presentation deploy

1. `bun run lint`, `vite build`, `journey.cjs` phone and desktop, `pdf-check.cjs` (lead writes stubbed).
2. Production deploy from a `main` commit once the owner merges, then check the live site and the three logins on it.
3. A short demo script: welcome, choose car, paint, wheel, finish, summary, PDF, then admin and dealer views.

## 5. Order and time (one working day, if the owner's steps happen in parallel)

| # | Task | Who | Time |
|---|---|---|---|
| 1 | Owner: Tripo API key, Google OAuth client, Google provider in Supabase | owner | 30 min |
| 2 | Reference board from Drive | Claude | 30 min |
| 3 | Wheel environment, arch fill, finish tuning, tyre and contact | Claude | 4 to 5 h |
| 4 | Tripo spike on FSA002 (parallel to 3) | Claude helper | 1 h |
| 5 | Dealer auth user, real dealer and customer sign-ins, RLS recheck | Claude + owner | 1 h |
| 6 | Full QA renders, journey and PDF checks | Claude | 1 h |
| 7 | Merge, deploy, check live, demo script | owner + Claude | 30 min |

## 6. Risks

- **Lighting changes can make the car body look worse.** Mitigation: wheel-only environment and lights, before and after
  sheets of the body too.
- **SwiftShader is not a real GPU.** A phone may look different. Mitigation: the owner checks one build on a real phone
  before the presentation.
- **Tripo output may be unusable.** The spike is capped at about 70 credits and nothing ships unless it beats the
  existing GLB side by side.
- **Google sign-in depends on dashboard steps only the owner can do.** If they are not done, the demo shows admin and
  dealer password logins and skips the customer garage.
- **The production deploy is outward-facing.** It happens only on the owner's go-ahead.

## 7. Questions for the owner

1. When is the presentation? This decides whether approach A is done in full or cut to the four dark finishes.
2. Approve this plan (or change it)?
3. Do you want the `/admin` sign-in redesign before the presentation?

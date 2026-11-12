# Session handover: 10 to 11 November 2026

Written at the end of a long session so a fresh session (or a person) can carry on without the chat history.
Read this first, then `docs/CHECKPOINT.md` (the queue) and `CLAUDE.md` (standing rules). Facts below were
read from GitHub, the live Supabase project and the repo on 11 November 2026, not remembered.

## 1. Where things stand, in one screen

| Thing | State |
|---|---|
| Repo | `FazalRSA/BMW-AND-FORGED-`. Work branch `ccr-f52bf849-fnf7qs`. Base `main`. |
| `main` | Has PR #12 (merged by the owner at 03:04 UTC on 11 November, at commit `27a071a`): no showroom, stage look, stepped drawer, wheel studio. |
| **Not on `main` yet** | Nine later commits, carried by **draft PR #14**: the menu links (`48c53f8`), the black-car-after-GPU-restore fix (`6c7ac95`), the carousel fix (`e4d75aa`), the M2 name migration file (`e3c1de7`), and the docs (`576e644`, `90f2a72`, `7cccc99`, `ed5fac5`, `06cbf9d`). `main` right now has no menu, because #12 removed the showroom's top bar. **Merging #14 is the most urgent thing.** |
| Render preview | https://forgedsa-configurator.onrender.com builds the branch on every push, with the bundled catalogue (`VITE_CATALOG_SOURCE=static`). It has everything above. |
| Production | https://forged-configurator.vercel.app still runs the **8 October** build. The Vercel project `forged-configurator` is not linked to this repo (see section 6). Merging to `main` deploys nothing. |
| Live database | Supabase project `qxlfkfhzpqbxffuqqewg`. All fifteen `20261110*` migrations are applied (read back with `list_migrations`). `20261111090000_car_m2_g87_name_m2_cs.sql` was applied later on 11 Nov with the owner's go-ahead. |
| Other open draft PRs | #10 (drop the M5's stale stored frames, other session) and #13 ("Photoreal plates configurator: path-traced renders, wheel overlay, cloud render service", other session). Not reviewed by this session. |

## 2. What the owner asked for, in order (this session)

1. Build the configurator on the owner's four prepared cars and six stock-sheet wheels, in the owner's "viewer" look, with the BMW repo's workflow (Supabase catalogue with bundled fallback, admin, share codes, PDF, leads to n8n). Customers can sign in with Google and keep a garage. Done in earlier phases (PR #1, #2).
2. Use the car's own tyre, disc and caliper and swap only the rim. Done (`82251fd`, `5abd0dd`). The caliper's colour and badge are set aside: "if it looks like it does in real life it's good".
3. Only spreadsheet wheels. Done (stock "Bronze Mesh" default removed).
4. Welcome screen: "the dark one". Done: it is the dark carousel of Cycles stills from PR #3.
5. "Better login page". The customer sign-in screen is done and merged (PR #11). The **`/admin` sign-in page redesign was started and then stopped by the owner and is not done**.
6. "This part of the configurator needs to get ripped out" (the showroom). Done: Enter goes straight to `/configure`.
7. "Scenes should look like this" (the Cycles M2 CS still). Partly done: the stage look matches the still's backdrop and floor, **not** its path-traced reflections and soft shadows.
8. "Just use the drawer from the legacy". Done: the stepped drawer is the default again.
9. "Use our new wheel viewer and throw the old one away". Done: the FORGED website's WheelStudio is on `/rims/<id>`; the spin viewer is deleted.
10. Pointers to BlendKit car models (screenshots of M3 G80, M4 G82, M4 Competition, M5 F90 listings). **Not started**: see section 5.
11. "Use GPU". The cloud container has no GPU (checked: no `/dev/dri`, no `nvidia-smi`; Chromium uses SwiftShader on 4 CPU cores).
12. "Merge" (twice) and "Fix it", "Use sub agents", "Spin up more agents". Standing preference: be fast, use helpers, do not waste the token budget, proper commit messages.

## 3. What was built (the journey as it is now)

Welcome (`/`) → **Enter** → configurator (`/configure`) → summary (`/summary`). No showroom.

- **Welcome** (`components/journey/WelcomeGate.tsx`, `HeroStage.tsx`): dark carousel of Cycles stills in `public/hero/`. It is the only place a car is chosen. Slides are a fixed list (`HERO_SLIDES`, each with `paintId`), filtered to the cars that are active in the catalogue. A new car needs a slide.
- **Enter**: opens `/configure` on the car on stage, in the still's paint when the car's palette has it (M2 CS Portimao Blue and M5 Fire Red do; the M4 CS and M5 Touring palettes do not, so they open in their first paint). While the stills cover the canvas the engine is prepared behind them (stage look built, camera framed, car preloaded), so Enter took about 0.2 to 0.3 s in the harness, against about 55 s before.
- **Stage look** (`services/viewerStudio.ts` `STAGE`, `engine.setLook('stage')` in `services/CarConfiguratorEngine.ts`): black dome, an unlit floor whose pool of light fades out, a black reflection cove with one overhead softbox. Defaults: peak 0.97, pool sigma 2.2 by 3.4 m, overhead 12, rails 6, ring 1, floorEnv 0.5, exposure 1.2, parts 0.35 (the share of the cove that glass, carbon, chrome and trim mirror; without it the windscreen and carbon roof clip to white from above). URL overrides for comparison renders: `?look=stage&stagePeak= &stageRx= &stageRz= &stageOver= &stageRails= &stageRing= &stageFloorEnv= &stageExp= &stageParts=`. `?look=viewer` is the older grey dome, `?look=studio` the softbox studio.
- **Controls**: the stepped drawer (`StepDrawer` in `components/journey/Configurator.tsx`, formerly `LegacyConfigurator`): Overview, 1 Paint, 2 Wheels, 3 Size, 4 Finish, camera chips, turntable. The viewer's glass panel is only at `?panel=viewer`.
- **More options** (the "…" button in the drawer header, `MoreOptionsModal`): Region, Load a configuration, Account & garage, the links (The wheels, Enquire, Delivery & fitment, Terms & conditions, Credits), Start again. `TopBar.tsx` is deleted. **This is on the branch and PR #14, not on `main`.**
- **Rim page** (`/rims/<id>`): `components/WheelStudio.tsx`, `WheelStage.tsx`, `services/wheelStudioParts.ts`. Views, Front/Rear for the staggered FSA001, finish chips, Exploded, Wireframe, Bolts, Cap. It loads the rim files the car uses and draws finishes with `services/wheelFinish.ts`. A wheel without a model shows its photo.
- **Sign-in sheet** (`components/journey/AccountSheet.tsx`): the car on stage, three reasons to sign in, a Google button to Google's dark-theme spec (Google Sans via a text-subset font link in `index.html`), "Not now". Merged in PR #11.
- **Wheel size fix** (PR #9): each wheel is sized from the car's own tyre, not the rim box.
- **Visualisation notice** (`BRAND.visualisationNotice`) moved to the summary page, since the showroom's Build confirmation is gone.

## 4. In flight at the moment of writing (helpers that were still running)

Four helper agents were started about an hour before this was written. The machine has 4 cores and no GPU and
was at load 25 to 45, so they are slow. They report on their own; a new session will not receive their reports,
so check the places below.

| Helper | Job | Where its work is | State |
|---|---|---|---|
| e2e rewrite | Update `scripts/render/e2e.cjs` to the new journey and make it pass | Worktree `/home/user/BMW-AND-FORGED-/.claude/worktrees/agent-ac88c4d6470d43611`, **uncommitted** (about 500 lines changed). Own dev server on port 5177. Output `…/scratchpad/e2e-new/`. | Running. A draft was reviewed: its write guard is unchanged and safe (lead and saved-configuration inserts get a fake 201, every other write is aborted). Its final version and run results are not seen. |
| Summary and PDF check | Look at the summary page and the PDF spec sheet under the new dark stage, on several cars | Read-only. Output `…/scratchpad/summary-pdf/`. | Running, no report. Scripts `drive.cjs`, `whatif.cjs`, `stats.py` are the helper's scratch. |
| Wheel studio QA | All six stocked wheels, every finish, phone and desktop, plus the hidden-wheel fallback | Read-only. Output `…/scratchpad/studio-qa/` (`sheets/`, `shots/`, `logs/`). | Running, no report. |
| Leftover docs and client PDF | Stale comments and script notes, three older doc claims, regenerate the branded client PDF | Worktree `…/agent-a2b43d2cb7867040d`. Four commits (`7737247`, `c6dc117`, `cb68cfd`, `c19cbc3`) were reviewed and **landed on the branch** as `90f2a72`, `7cccc99`, `ed5fac5`, `06cbf9d`. | The regenerated PDF (`docs/FORGEDSA-Client-Handover.pdf`), `docs/handover/handover.html` and eight handover pictures are **uncommitted** in that worktree, awaiting the helper's final report. Look at every page of the PDF before committing it. |

`…/scratchpad` is `/tmp/claude-0/-home-user/a5cf626a-0dc3-5698-9ebe-fc9303fd0b39/scratchpad` and is not
durable. Findings that matter must be written into the repo or the PR.

When a helper's work is ready: review its diff for secrets, I/O error handling and naming; check the findings
against its own screenshots (do not trust a report alone); cherry-pick onto `ccr-f52bf849-fnf7qs`; run
`bun run lint` and `bun run build`; push; update the PR.

## 5. Decisions waiting for the owner

1. **Merge PR #14** (menu links, GPU-restore fix, carousel fix, docs). Squash-merge is how earlier PRs were done; the PR body carries what to say.
2. **Done 11 Nov (owner approved): the M2 name fix** applied to the live database: `20261111090000_car_m2_g87_name_m2_cs.sql` renames the `m2_g87` row from "BMW M2 Coupe" / "M2 G87" to "BMW M2 CS" / "M2 CS G87". Dry-run read-only against the live schema: it matches exactly one row; the only trigger on `cars` is `touch_updated_at`. It is in the live migration list (`20261111065356 car_m2_g87_name_m2_cs`).
3. **Deploy production.** The live site is the 8 October build. Either connect this repo to the Vercel project, or start a production deployment by hand from a `main` commit (`forgedsa-deploy-and-release` skill). Not done: it is the owner's call.
4. **The photoreal route and BlendKit cars.**
   - The scene still does not match the Cycles still's fidelity. Matching it needs pre-rendered Cycles bodies with live wheels (mode C in `docs/PRODUCT_SPEC_CARS_AND_WHEELS.md`). That needs the reference studio file `BMW_M2_CS_G87_clean_studio.blend`, which is **not in the repo and not in the owner's Google Drive** (searched). The owner should upload it, plus any BlendKit `.blend` files.
   - BlendKit licence (checked 11 November on blendkit.com, formerly BlenderKit): Royalty Free allows commercial use, but not re-sale "in the same form". For games the FAQ says "yes, if these can't be extracted by the users in an easy way" and "the assets shouldn't be directly extractable in the distribution". A GLB that a browser downloads is extractable, so **a BlendKit car must not be shipped as a live GLB**. Pre-rendered images are the way. Today's pre-rendered mode (mode B, the M5 frames) still downloads the car's GLB as a depth mask, so that has to change first. The pages say nothing on trademarks or real car brands, or on whether the licence survives the subscription ending. Both are open questions for the owner. I cannot download from BlendKit (it needs the owner's account).
   - Another session opened draft PR #13 ("Photoreal plates configurator: path-traced renders, wheel overlay, cloud render service"). It looks like the same goal. Read it before building anything new in that direction.
5. **Google sign-in** is not usable until the Google provider and redirect URLs are set up in Supabase (`docs/ACCOUNTS.md`, owner steps 1 to 4). Add `https://forgedsa-configurator.onrender.com/**` to the redirect list to test on the preview.
6. **Licences and specs** for the four prepared cars (game-derived, none supplied), real M5 Touring and M2 CS specs and palettes, real names, copy and prices in `/admin`.

## 6. Facts a new session will otherwise get wrong

- **Production is not connected to this repo.** Read-only Vercel check: project `forged-configurator` (id `prj_p1fOXWBPFfxedbLZFp9R3s1Qiq9P`, team Nova Havens `team_YEcPHHbzFoa1DSSKBbNDiyEk`) has no git link. Its last deployment was 2026-10-08 from `Novahavens/BMW-AND-FORGED-` at `0aef67e`, 42 commits behind. Nothing was ever built from `FazalRSA/BMW-AND-FORGED-`. `docs/HANDOVER.md` section 5 says so.
- **Always compare `main` and the branch before saying something is "on main".** The owner merges PRs themselves, at any moment. PR #12 was merged while later commits were still on the branch, so for a while `main` had the showroom removed but no menu. Use `git log origin/main..HEAD` and `git merge-base --is-ancestor <sha> origin/main`.
- **The earlier session summary had the two welcome screens backwards.** The dark carousel is on `main` from PR #3. The branch had carried the older light welcome. Fixed by merging `main` in.
- **The welcome carousel is not the catalogue.** The slide list is in code (`HERO_SLIDES`); a car added in `/admin` has no slide until someone adds one with its stills (`docs/PRODUCT_SPEC_CARS_AND_WHEELS.md` section 4.7).
- **The M5 G90 is different.** It still has pre-rendered Blender frames (`public/renders/manifest.json`), so in the configurator's fixed views it does not get the stage look. PR #10 removes them.
- **No GPU.** All renders here are SwiftShader on CPU, about 50 s a shot, and parallel jobs slow each other badly. Never claim real-phone or real-GPU results. The harness waits for the boot overlay by its opacity (it fades to 0 and stays in the DOM, so Playwright's "hidden" never fires).
- **Lead safety.** Every real row in `leads` emails the business owner. Every browser script must route `/supabase\.co\/(rest|functions)\//` and answer non-GET/HEAD with a fake 201. `journey.cjs`, `e2e.cjs` and `pdf-check.cjs` do. Never click Enquire or PDF in an unguarded script.
- **Supabase writes from the sandbox.** The Supabase connector works here (the 15 migrations were applied through it, with the owner's approval each time). It asks for approval on writes. Production-looking changes may be blocked by the auto-mode classifier; ask the owner and say what the change is.
- **Commit rules** (`CLAUDE.md`, `forgedsa-deploy-and-release` skill): `type(scope)` subject at most about 65 characters; a body that says why, what and what was checked; end with the two attribution lines; never put a model name in a commit or PR; never rewrite pushed history (the sandbox also blocked a force-push). Learning-log file `.cto-toolkit/learning/patterns.jsonl` is now git-ignored (main did that in `b98f2b6`).
- **Stop-hook reviews** repeatedly ask for a secrets, I/O error-handling and naming review of every change. Do it on the real diff and keep the evidence in the transcript. One such review found a real bug (the GPU-restore black car), so the review is worth doing properly, not just answering.
- **Token budget.** The owner has complained about token use and slowness. Prefer helpers in worktrees for independent jobs, keep each helper's scope narrow, do not poll in loops.

## 7. Open items (nothing is lost)

- `scripts/render/e2e.cjs` still walks the showroom and its menu (rewrite in flight, section 4).
- Regenerate the branded client PDF (in flight, section 4). `docs/CLIENT_HANDOVER.md` carries a "PDF not regenerated" line until then.
- **`/admin` sign-in page redesign** (stopped by the owner): `components/admin/AdminPage.tsx` `LoginForm` and `SetPasswordForm` are still the plain card. The brief that was given to the helper: brand look (carbon background, gold glow, `Logo`, `Eyebrow`, glass card), taller fields, show/hide password, Caps Lock warning, clear errors ("That email and password don't match an admin account"), a back link to the configurator, all `supabase.auth` calls unchanged.
- The M4 CS GLB's caliper materials: only the front-left caliper takes the caliper colour; the rears look dark. Needs a fixed GLB or a per-car material rule.
- The M2 CS caliper badge shows as two flat blocks (the texture is a stripe image). The owner judges against the real car.
- The engine's `showcase` option, `scripts/rim3d/turntable.py` and `spin-manifest.py` are unused now and were left in place.
- Long main-thread tasks (7 to 19 s) at one wheel pick under SwiftShader: re-measure on a real GPU before drawing conclusions.
- `docs/handover/handover.html` and the client PDF still show the old journey (until the PDF work above lands).
- Owner items from `docs/CHECKPOINT.md`: look at `docs/ingest/*.jpg`, decide live GLB versus Blender frames for the four cars, licences, specs.

## 8. How to resume

```bash
cd /home/user/BMW-AND-FORGED-            # clone FazalRSA/BMW-AND-FORGED- if it is not there
git fetch origin && git checkout ccr-f52bf849-fnf7qs
bun install
(setsid nohup npx vite --host 127.0.0.1 --port 5173 --strictPort > /tmp/vite.log 2>&1 &)
bun run lint && bun run build            # both must pass before any push
```

Render checks (see `.claude/skills/forgedsa-render-verification/SKILL.md` and `visual-qa`):

```bash
node scripts/render/journey.cjs <out> <rimCache> both       # welcome → Enter → wheels → size → finish → summary
node scripts/render/shoot.cjs <out> shots.json <rimCache>   # shot list with "q": "&look=stage"
```

Order of work for the next session:
1. Check `git log origin/main..HEAD` and the PR list. If #14 is not merged, say so first.
2. Collect the in-flight helpers' results (section 4), review, land.
3. Ask the owner about the decisions in section 5 that block further work (the `.blend` files above all).
4. Update `docs/CHECKPOINT.md` and this file's section 1 whenever the state changes.

## Update 11 Nov, later: checklist and direction

Merged: #12, then #14 (menu links, GPU-restore fix, carousel, dark wheel stage). Dark everywhere now: `.bg-stage` and `.wheel-stage` are the black stills backdrop; `.stage-light` is gone. The wheel studio no longer auto-orbits on load.

| Feature | State |
|---|---|
| Admin login (`/admin`, email + password, allowlist) | built, plain form, redesign not done |
| Customer login (Google via Supabase Auth, garage) | built; needs the owner's Google provider setup (docs/ACCOUNTS.md) |
| Dealer login | BUILT and merged (#22): `/dealer`, Dealers tab in `/admin`. Migration `20261111120000_dealers.sql` APPLIED to the live project on 11 Nov, index built, RLS checked in a rolled-back test. No real dealership or dealer sign-in exists yet; docs/DEALERS.md |
| Magic link / password-less login | NOT BUILT (`signInWithOtp` is the route) |
| FORGED wordmark | present (`public/brand/forgedsa-wordmark.png`) |
| SixNine logo | NO ASSET in the repo; the owner must supply it |
| PDF "renders beautifully" | check was interrupted (helper hit its usage limit); rerun `scripts/render/pdf-check.cjs` |
| Fonts | Satoshi + Inter now; a better pairing from an OFL source is not chosen yet |
| Wheels | stage darkened; the wheel itself was not judged on a real GPU; owner to say which wheel/view looks wrong |
| Modal | token ID was pasted in chat and is NOT stored; the secret goes in environment settings; PR #13 already holds a Modal render service |
| e2e harness rewrite | unfinished in `.claude/worktrees/agent-ac88c4d6470d43611` |

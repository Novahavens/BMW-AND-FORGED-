# Spec: the best way from a rim photo to a photoreal 3D file (researched Nov 2026)

**Written:** 2026-11-11. This updates the "photo route" in [`RIM_3D_PROCESS.md`](RIM_3D_PROCESS.md) and
section 5 of [`PRODUCT_SPEC_CARS_AND_WHEELS.md`](PRODUCT_SPEC_CARS_AND_WHEELS.md) with what the
market actually offers today, not what it offered when this repo's photo pipeline was built. It does
not replace either doc — it tells you which route to pick, and what changed since.

## Pilot log

The original plan below (§2, "Recommended pilot") was to re-run FSA-07. That didn't work: the only
FSA-07 asset in this repo (`public/rim-faces/forged_fsa_07.png`) turned out to be the already-traced
flat grey silhouette mask, not a photo — there's no second angle of it anywhere, and no raw photo
folder in the repo by design (source photos live in Drive). Feeding a single flat mask through a
"multi-image" tool would not have tested anything real, so the pilot was redirected.

**What ran instead, 2026-11-11:** the owner's Drive folder "WEBSITE wheels" → "FSA4" has three real
product photos of the physical **FSA004** wheel on a turntable stand (consistent studio lighting,
same background) — two of the silver/machined finish at different rotations, one of the same design
in gloss black. The two silver photos are genuinely different viewpoints of the same physical wheel,
which is exactly what multi-image reconstruction needs. **This is a better pilot subject than
FSA-07 was going to be**, because FSA004 already has an authoritative ground-truth 3D file in this
repo (`public/models/rims/forged_fsa004.glb`, sourced from the FORGED website) — so the AI
reconstruction's geometry can be measured against a known-correct model, not just judged "does it
look plausible."

Progress:
- Both photos downloaded from Drive, uploaded to Higgsfield (which exposes Meshy's models) and
  confirmed. They're in the account's media library under these IDs (no local re-upload needed to
  resume):
  - `7f798784-49ee-4338-8289-f9d1dc311fdc` (silver, angle 1 — face mostly square-on)
  - `f1014bdf-42cf-4f25-b766-284cc37ebc03` (silver, angle 2 — rotated to show the barrel/profile)
- The job was preflighted (`get_cost: true`) against Meshy's `multi_image_to_3d` model: **20
  credits**, `should_texture: false` (geometry only — the engine replaces every rim's material
  anyway), `symmetry_mode: "on"` (wheels are rotationally symmetric), `topology: "triangle"`,
  `target_polycount: 50000` (ample headroom under this repo's rim pack budget; `pack.mjs` will
  decimate to the live triangle budget during cleanup regardless).
- **Blocked on submission:** the connected Higgsfield workspace has 0 credits (starter plan). The
  owner chose not to top up credits for this pilot right now, so the job was not submitted — no
  charge was made.

**To resume exactly where this left off:** call `generate_3d` with
`model: "multi_image_to_3d"`, `medias: [{"value": "7f798784-49ee-4338-8289-f9d1dc311fdc", "role": "image"}, {"value": "f1014bdf-42cf-4f25-b766-284cc37ebc03", "role": "image"}]`,
`should_texture: false`, `symmetry_mode: "on"`, `topology: "triangle"`, `target_polycount: 50000`,
once the workspace has at least 20 credits. Then: strip any texture, decimate/retopologize to this
repo's rim budget, sort meshes into the `Rim_Barrel`/`Rim_Face_Spokes`/`Hardware_Bolts`/`Center_Cap`
convention, pack with `scripts/rim3d/pack.mjs`, and compare directly against
`public/models/rims/forged_fsa004.glb` plus `scripts/render/wheel-qa.cjs` — this one pilot answers
both "is the multi-image route any good" and "how close does it get to the real file."

**Coordination, 2026-11-12:** the `presentation-ready` session (branch
`claude/clever-brahmagupta-xnnpfj`) was independently exploring the same idea via a direct Tripo
API key. It confirmed it's holding that spike (the owner had already declined to provide the Tripo
key, and it has no cost/quality evidence favouring Tripo over Meshy) and flagged something useful
for whoever resumes this pilot: its PR [#40](https://github.com/FazalRSA/BMW-AND-FORGED-/pull/40)
changes how rims reflect the stage look (`CarConfiguratorEngine.syncWheelEnvironment`, `WHEEL_ENV`
0.1), not rim meshes. Any rim this pilot produces picks up that reflection change automatically
through `makeRimFinishMaterial` — compare it under the same light with `scripts/render/shoot.cjs`
and `&look=stage`, no extra wiring needed.

## TL;DR

1. **Still ask for CAD first** (STEP/IGES). Nothing below beats it, and nothing has closed that gap.
2. **The single biggest upgrade available to you, and the one nobody has tried yet on this
   project: feed an AI reconstructor *several* photos of the same wheel (front + two or three
   three-quarter angles), not one.** Every limitation this repo's own docs list for the photo
   route — "no depth", "lip and barrel are inferred from the template, wrong for concave or
   layered designs" — is a consequence of using exactly one image. Multi-image reconstruction
   (Meshy, Rodin/Hyper3D, Tripo all support 4–8 input images as of late 2026) solves that specific
   problem directly, for a few cents to a few dollars a wheel. It still won't give you a CAD file,
   and it still needs this repo's existing cleanup (strip the baked texture, retopologize to the
   triangle budget, sort meshes into `Rim_Barrel`/`Rim_Face_Spokes`/`Center_Cap`/`Hardware_Bolts`,
   pack with `scripts/rim3d/pack.mjs`) — but it's a genuinely new option, not a restatement of what
   you're already doing.
3. **Photogrammetry is a trap for this specific product.** Forged rims are machined, polished or
   plated — exactly the reflective surfaces photogrammetry fails on — unless you matte them first
   with a sacrificial spray, which most owners of a customer's demo wheel won't want to do.
4. **Commissioned freelance CAD modelling** ($100–300, a few days) is the proven fallback that's
   already in this repo's docs, and still the right call for a hero design worth the spend.
5. **The current single-front-photo pipeline** (`scripts/rim3d/convert.sh`) stays the fast, free,
   zero-dependency default for a flat/simple spoke design when none of the above is worth the
   effort for that particular wheel.

## Why a photo has a hard ceiling (the physics, not the tooling)

A photograph is a 2D projection: one ray per pixel, no record of how far along that ray the surface
sits. Everything "3D" that comes out of a single photo is the generator's *prior* — its guess, from
training data or a hand-built template, about what the unseen side and the depth look like. This
repo's own research already says this plainly (`RIM_3D_PROCESS.md`: "a single front photo has no
depth… depth, the lip and the barrel are inferred from the template"). No AI model, however good its
2026 marketing claims, repeals that: a 2025 computer-vision paper on exactly this problem
(reflection-symmetry-aware single-image 3D) frames single-view 3D as fundamentally about "inferring
the unseen side of the object" ([Img2CAD](https://arxiv.org/html/2410.03417v1)). The fix is not a
smarter single-image model — it's giving the model more views, which is why option 2 below is the
one worth testing.

## Decision table

| What you have | Do this | Typical quality | Cost | Time |
|---|---|---|---|---|
| Manufacturer STEP/IGES/STL of the rim | Admin → Wheels → **Rim 3D model**, or `bun run rim:convert wheel.step` | Exact | $0 | same day |
| A physical wheel in hand, no CAD | Commission a freelance CAD modeller (face-on + 45° photos, dimensions, spoke count) | Near-exact | $100–300 | 1–7 days |
| 4–8 photos from different angles (front + three-quarters), no physical sample needed beyond what was photographed | **Multi-image AI reconstruction** (new route, below) | Good for most designs; weak on deep concave/layered faces and fine machining detail | $0.20–$3 per wheel, or $30/mo for the better tier | minutes |
| A physical wheel in hand, want precise geometry without CAD cost | Photogrammetry with a matte/vanishing spray | Very good geometry, no colour value (greyed anyway) | $0 software (RealityCapture free under $1M revenue) + ~$20 spray | hours per wheel |
| Only one front-on photo | The existing route: `scripts/rim3d/convert.sh` | Good for flat/medium spokes only; depth, lip, barrel are template guesses | $0 | ~20 seconds |

## Option detail

### 1. Manufacturer CAD — still the ceiling, and still hard to get for free

Forged-wheel makers design in 3D CAD and run FEA before anything is machined (Forgeline: 3D CAD +
FEA, tested beyond SAE standard;
[forgeline.com/about-us](https://forgeline.com/about-us); RVRN: "engineers create a 3D CAD model...
runs each design through computer simulations",
[rvrnwheel.com/pages/rvrn-manufacturing](https://rvrnwheel.com/pages/rvrn-manufacturing)). The file
exists. What's changed since this repo's earlier research: there's now a visible freelance market
of people who *will* produce or redraw that CAD for you in STEP/IGES, scoped specifically to wheels
— e.g. a Fiverr listing offering "production-ready CAD files in formats like STEP, IGES, STL" for
"custom alloy, racing, forged and performance wheels", and an Upwork listing for parametric CAD with
PCD, offset and hub bore built in. This is the same budget and turnaround this repo already
documented (`research/CAR_MODEL_SOURCING.md`: "$100–300 per design, 3–7 days") — it's now backed by
visible live listings rather than a general estimate. Still true: manufacturers themselves mostly
don't hand out STEP files; they share renders and drawings, so you're commissioning a redraw, not
requesting the original.

### 2. Multi-image AI reconstruction — untried, worth a cheap pilot

As of late 2026, the leading image-to-3D services accept more than one photo of the same object and
fuse them, instead of inferring depth from a single frame:

- **Meshy** (Multi-Image-to-3D) and **Hyper3D Rodin v2** both take multiple images (reports differ
  on the exact cap, 4–8) ([3D AI Studio guide](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/what-is-the-best-way-to-use-multiple-images-to-create-3d-model)).
- **Rodin Gen-2.5** additionally exposes an explicit symmetry mode (forced left-right symmetry vs.
  free vs. auto), directly relevant to a spoked wheel, plus a "BANG" tool that splits a finished
  mesh into separate closed parts — potentially useful for getting `Rim_Barrel` / `Rim_Face_Spokes`
  as separate pieces instead of one blob ([80.lv writeup](https://80.lv/articles/how-hyper3d-rodin-gen-2-5-is-bringing-production-level-control-to-ai-3d-generation)).
  No source found tests Rodin specifically on wheel-rim spoke symmetry, bolt-pattern precision, or
  machining tolerance — that gap is exactly what a pilot would answer.
- Reviewer consensus across several 2026 comparison roundups: Rodin for raw surface/topology quality
  (at a cost — Creator tier ≈$30/mo), Meshy for the best general starting point and the most
  production-oriented docs (quad/triangle topology option, 100–300k polycount target), Tripo for
  speed and value ([3daistudio](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/best-image-to-3d-tools-2026),
  [topon.tech](https://topon.tech/en/best-ai-3d-model-generators/)). These are vendor-adjacent blogs,
  not independent benchmarks — treat the ranking as "worth testing," not proven.
- **Pricing is inconsistent across sources** (reported anywhere from $0.01–0.60 per model depending
  on texturing and vendor) — check `docs.meshy.ai` and `docs.tripo3d.ai` directly before budgeting
  ([apicostcalc comparison](https://apicostcalc.com/meshy-vs-tripo3d-vs-rodin-3d-model-cost-calculator.html)).
- **Licensing:** paid tiers generally grant commercial use of the output; free tiers are frequently
  restricted (personal/academic only, or CC BY with attribution — sources disagree even on this), and
  resale as a stand-alone asset is a separate question from use inside your own product
  ([Tripo's own licensing posts](https://www.tripo3d.ai/blog/commercial-use-ai-3d-models), which are
  the most direct source found but still need checking against the live terms before you rely on
  them). **Verify the current ToS before committing budget** — this is the same diligence this repo
  already applies to Sketchfab car licences, and it should apply here too.

**How this slots into the existing pipeline**, rather than replacing it: the output is a triangle
mesh with a baked texture, not a CAD file and not pre-sorted into named parts. Treat it as a richer
substitute for `RIM_3D_PROCESS.md` steps 3–6 ("face from the outline" through "surface") only:

1. Shoot 4–8 photos per wheel: front-on (as today) plus three-quarter angles, consistent lighting,
   rim only (reuse the existing photo rules from `forgedsa-rim-from-photo`).
2. Generate with the multi-image mode of whichever vendor the pilot favours.
3. **Strip the baked colour/texture** — the engine gives every mesh one finish material
   (`services/wheelFinish.ts`); a baked photo texture would tint every finish, the exact bug
   `WHEEL_PIPELINE.md` already warns about for the flat-photo route.
4. Retopologize/decimate to the live budget and pack with the existing `scripts/rim3d/pack.mjs`
   (meshopt, weld, quantize) — same as any other rim GLB.
5. Sort or rename meshes into the website convention (`Rim_Barrel`, `Rim_Face_Spokes`,
   `Hardware_Bolts`, `Center_Cap`) by hand or with Rodin's part-splitting tool if it proves reliable.
6. Run the same QA this repo already has for a new rim: `scripts/render/wheel-qa.cjs` (symmetry,
   wiggle, thinnest spoke) and the on-car render matrix (`visual-qa` skill) — compare directly
   against the single-photo route's result for the same wheel to see whether the extra depth was
   worth it.

**Recommended pilot:** re-run **FSA-07** through this route. It's already flagged in this repo's
own docs as the weakest result from the single-photo pipeline ("comes from an angled photo and
keeps some torn arms; manufacturer CAD… is the real fix",
[`PHOTOREAL_METHOD.md`](PHOTOREAL_METHOD.md)) — a good low-risk test of whether multi-image
reconstruction actually closes that specific, already-diagnosed gap, with a before/after everyone
can judge against the existing result.

### 3. Photogrammetry — only if you have the wheel in hand, and only after matting it

Classic structure-from-motion (COLMAP, RealityCapture/RealityScan, Metashape, 3DF Zephyr) gives the
most geometrically accurate result of any option here that doesn't start from CAD — but it depends
entirely on finding matching features across dozens of photos, and **a reflective surface has no
stable features to match: its highlights move with the camera, not with the surface**
([Polycam's guide](https://poly.cam/blog/how-to-handle-reflective-glass-and-mirrors-in-3d-scans);
[OpenScan](https://en.openscan.eu/post/tutorial-scanning-a-metal-key-with-the-right-amount-of-scanning-chalk-spray)).
Forged wheels are routinely polished, machined or plated, i.e. exactly the finish this breaks on.
The standard fix is a temporary vanishing/matting spray (AESUB and similar; dries matte, sublimates
away after 1–2 hours) applied in even coats from all sides, then 20–100+ photos around the object
([3dscanstore](https://www.3dscanstore.com/blog/3d-scanning-reflective-objects)). Software cost is
now effectively zero: **RealityCapture (rebranded RealityScan) is free for any company under $1M
annual revenue**, and 3DF Zephyr has a free tier capped at 50 photos
([skyebrowse comparison](https://www.skyebrowse.com/news/posts/metashape-vs-realitycapture.md)). The
output is colourless geometry anyway (the engine recolours every rim per finish), so losing the
baked photo colour to the matte spray costs nothing here. This is the right choice when you have a
physical sample and want the most faithful geometry without paying for CAD — but it's real
per-wheel labour (spraying, a careful photo circuit, processing), so reserve it for a hero design,
not a batch.

### 4. The existing single-front-photo pipeline — keep it as the free default

`scripts/rim3d/convert.sh` (see `RIM_3D_PROCESS.md`) stays the right choice when a wheel is simple
or flat enough that the template's inferred depth is close to correct, or when none of the above is
worth the setup cost for that particular design. Its ceiling is well understood and already
documented: no real depth, no machining detail, wrong for deeply concave or layered faces. Nothing
in this research changes that assessment — it just gives you somewhere better to go when a specific
wheel hits that ceiling (FSA-07, FSA-01, and similar flagged cases).

## What would change this recommendation

- If a direct test shows a vendor's multi-image mode doesn't actually use the extra views for real
  depth (some tools reportedly just average or pick one) — downgrade it back to "same ceiling as
  single-image, skip it."
- If the owner can get even one manufacturer to share STEP/IGES for the current six stocked designs
  — do that instead for those six, no contest, and keep this spec for *future* designs only.
- Pricing and licensing terms for Meshy/Tripo/Rodin move quickly; re-check `docs.meshy.ai`,
  `docs.tripo3d.ai` and Hyper3D's own terms before budgeting rather than trusting the figures above.

## Sources

- [Img2CAD (arXiv)](https://arxiv.org/html/2410.03417v1) — single-image 3D/CAD reconstruction, why one view is the hard part
- [3D AI Studio: best way to use multiple images for 3D](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/what-is-the-best-way-to-use-multiple-images-to-create-3d-model)
- [3D AI Studio: best image-to-3D tools 2026](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/best-image-to-3d-tools-2026)
- [topon.tech: best AI 3D model generators](https://topon.tech/en/best-ai-3d-model-generators/)
- [80.lv: Hyper3D Rodin Gen-2.5 production control](https://80.lv/articles/how-hyper3d-rodin-gen-2-5-is-bringing-production-level-control-to-ai-3d-generation)
- [apicostcalc: Meshy vs Tripo3D vs Rodin cost](https://apicostcalc.com/meshy-vs-tripo3d-vs-rodin-3d-model-cost-calculator.html)
- [Tripo3D: commercial use of AI 3D models](https://www.tripo3d.ai/blog/commercial-use-ai-3d-models)
- [Polycam: handling reflective surfaces in 3D scans](https://poly.cam/blog/how-to-handle-reflective-glass-and-mirrors-in-3d-scans)
- [3dscanstore: 3D scanning reflective objects](https://www.3dscanstore.com/blog/3d-scanning-reflective-objects)
- [OpenScan: scanning a metal key with chalk spray](https://en.openscan.eu/post/tutorial-scanning-a-metal-key-with-the-right-amount-of-scanning-chalk-spray)
- [SkyeBrowse: Metashape vs RealityCapture pricing 2026](https://www.skyebrowse.com/news/posts/metashape-vs-realitycapture.md)
- [Forgeline: manufacturing / CAD + FEA](https://forgeline.com/about-us)
- [RVRN: wheel manufacturing / CAD process](https://rvrnwheel.com/pages/rvrn-manufacturing)
- Repo: [`RIM_3D_PROCESS.md`](RIM_3D_PROCESS.md), [`PRODUCT_SPEC_CARS_AND_WHEELS.md`](PRODUCT_SPEC_CARS_AND_WHEELS.md) §5, [`research/CAR_MODEL_SOURCING.md`](research/CAR_MODEL_SOURCING.md) §4

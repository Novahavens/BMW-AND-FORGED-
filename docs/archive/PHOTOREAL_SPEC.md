# Photoreal programme: 3 cars + the wheels

> **Superseded in part (2026-11-11).** The line-up below (M4, M3, M3 Touring, M5, M8) is the October plan. Since
> 2026-11-10 the active cars are the four prepared ones (M2 CS, M4 CS, M5, M5 Touring) and the legacy cars are
> hidden. Current process: [`PRODUCT_SPEC_CARS_AND_WHEELS.md`](../PRODUCT_SPEC_CARS_AND_WHEELS.md).
> Navigation: [`../MAP.md`](../MAP.md).

**Written:** 1 Oct 2026. **Owner:** Nova Havens for FORGEDSA.

## Progress (2 Oct 2026)

The method and its numbers are in [`PHOTOREAL_METHOD.md`](../PHOTOREAL_METHOD.md); the skill is
`3d-car-perfect`.

- **Line-up:** the five good models stay (M4, M3, M3 Touring, M5, M8). The 2 Series, the SUVs and
  the two cars without models are set inactive. *(The owner widened the scope from 3 cars to every
  good model.)*
- **Done, Sprint 1 (studio and paint):**
  - feathered softbox studio;
  - world-space metallic flake and flop;
  - tone-mapping comparison (ACES kept).
- **Done, Sprint 2 (material pass on every car):**
  - tinted glass with a reflection overlay, clear lenses, red tail lenses;
  - neutral chrome, gloss carbon and black trim;
  - shadowed interior.
- **Done, Sprint 3 (wheels, tyres, brakes in code):**
  - real tyre profile with tread and sidewall markings, plus a loaded contact patch;
  - rim lip and barrel, with polished bolted lips on two- and three-piece designs;
  - cross-drilled vented discs with radial anisotropy;
  - 6-piston gloss calipers, lug nuts and the FSA centre cap;
  - rim photos become clean, symmetric, concave 3D spokes;
  - fake arch and barrel occlusion.
- **Still open:**
  - a real-GPU and phone check (NOV-56);
  - manufacturer CAD for the wheels (NOV-57), above all FSA-01 and FSA-07;
  - licensed premium car files (NOV-64/65);
  - real AO, rest-frame TAA and a shadowing key light (next levers in the method doc);
  - client sign-off (Sprint 4).

## Goal

A BMW M owner who opens the configurator on a phone or laptop should believe they're looking at a
studio photograph of their car on FORGEDSA wheels. That applies to the live 3D view when it's
still, the summary stills and the PDF.

**Scope:** only the **BMW M5 G90, M4 G82 and M3 G80**, plus the **FORGEDSA wheels**. The other cars
stay as they are.

### Done when

1. The owner and FORGEDSA sign off a side-by-side of each car (front three-quarter, side and rear
   three-quarter, in 3 paints) against real BMW press photos.
2. Each car view comes to rest as a path-traced, denoised still within about 3 seconds on a
   mid-range laptop and about 6 seconds on a recent phone.
3. Wheels hold up at the 360° close-up: real spoke depth, machined faces, a correct lip and tyre
   sidewall.
4. Every model and wheel file has a licence allowing commercial web use, with credits linked
   from the site.

## What is wrong today (findings)

| Area | Finding | Effect |
|---|---|---|
| Lighting | The studio is one small HDRI plus point lights. Car photography uses large softboxes, which give the long clean highlights on panels. | Paint reads flat or plastic, highlights are blotchy. |
| Paint | A single base colour with clear coat. No metallic flake, no pearl, no "frozen" (matte) micro-texture. | Metallics look like solid colours. |
| Car models | Community Sketchfab models. The M5 is good; the M4 and M3 come from game rips with baked colour maps, low-quality glass, lights and tyres. The provenance of some "CC BY" BMW uploads is doubtful (the same mesh appears under NC licences). | The geometry and material ceiling is set by the file, and there's a licence risk. |
| Model maps | The engine dropped the model's own normal/AO maps when painting. Fixed in PR #2. The three target cars' paint materials have no such maps anyway. | No change for the three cars; it helps others. |
| Wheels | FSA-01–09 are extruded from photos; FSA-10–17 have photos only. No manufacturer CAD yet. | Flat spokes, no machined detail, weak up close. |
| Grounding | Baked contact shadow only in the real-time view. | The car floats a little. |
| Photoreal mode | The path tracer proof works (branch `claude/photoreal-proof`, preview below) but was only tested on a software GPU: grainy at 200 samples, floor tuning and framing to check. | Needs a real-GPU check before it ships. |

**Preview to judge on a real GPU:**
<https://forged-configurator-git-claude-photoreal-proof-nova-havens.vercel.app/?photoreal=1>.
Stop moving the camera and the image refines into a path-traced still.

## Answers to the owner's questions

**Can we use the "perfect" Sketchfab BMW files?** Yes, if the licence allows commercial use and
the uploader really owns the work.

- **CC BY:** fine with credit. Keep `public/models/CREDITS.md` and link it from the site footer.
- **Sketchfab "Standard" (free or paid):** fine. For paid files, the terms must forbid visitors
  from extracting the model.
- **NC, ND or "Editorial":** not usable. That rules out Squir's M3/M4, which are Editorial.
- **Trademarks:** no licence covers BMW's name, badges or design. Use names descriptively
  ("fits BMW M3 G80"), add "not affiliated with BMW AG", and get South African legal advice.

**How to bring a Sketchfab file in:** download the glTF, then follow the existing pipeline
(`forgedsa-add-car-model` skill):

1. Compress with gltf-transform (meshopt, KTX2 textures). Decimate 1.5–2.4M-triangle files to
   about 400–600k.
2. Find the body-paint material names for the paint regex, and the wheel/tyre/brake names for the
   hide regex.
3. Upload in `/admin` → Cars.
4. Verify with renders.

**Does the colour changer need a texture for each paint?** No. Every BMW paint is one base colour
plus a finish preset:

- **metallic:** flake normal map, clear coat;
- **uni (solid):** no flake;
- **frozen (matte):** high roughness, no clear coat;
- **pearl:** iridescence/sheen.

Only two shared textures are needed, both generated in code: a tiling **flake normal map**
(three.js ships `FlakesTexture`) and optionally a pearl/sheen mask. The model's baked colour
texture is dropped on purpose, so any of the 64 paints can apply.

## How it fits together

```
Licensed GLB (per car) ──► gltf-transform (decimate, meshopt, KTX2) ──► Supabase car-models bucket
                                                                          │
Manufacturer CAD (per wheel) ──► CAD → GLB route (admin) ──► rim-models bucket
                                                                          ▼
                     Engine: softbox studio + paint presets (flake, clear coat, pearl) + AO/contact shadow
                                                                          │
                ┌─────────────────────── while moving: real-time WebGL ───┤
                └─────── at rest: path tracer (photoreal mode) + denoise ─┴──► summary stills + PDF
```

## Sprints

One-week sprints. Each task lists who it depends on (**Client** = FORGEDSA, **Owner** = Nova
Havens, **Dev** = us).

### Sprint 0: unblock (this week, days 1–2)

| # | Task | Who | Done when |
|---|---|---|---|
| 0.1 | Review the photoreal preview on a real laptop and phone; keep or bin it | Owner | Decision recorded |
| 0.2 | Review/merge PR #2 and approve the lead-hardening migration | Owner, Dev | Migration live, test lead emailed with correct paint code |
| 0.3 | Ask the wheel manufacturer for STEP/IGES files of the top 5 designs | Client | Files received or date given |
| 0.4 | Check where the current M5/M4/M3 files came from (uploader owns them?) | Dev | Note in CREDITS.md |
| 0.5 | Quick legal read on BMW names and badges (SA) | Client | Go/no-go on badges |

### Sprint 1: studio and paint (biggest win, $0)

| # | Task | Who | Done when |
|---|---|---|---|
| 1.1 | Softbox studio: replace the small HDRI with a generated environment of large rectangular light panels (top strip, two side strips, rim light), as in car photography | Dev | Long clean highlights on the bonnet and doors in renders |
| 1.2 | Paint presets: flake normal map (metallic), solid, frozen (matte), pearl; map all 64 BMW paints to a preset | Dev | Side-by-side vs BMW press photos for 3 paints per car |
| 1.3 | Grounding: ambient occlusion (N8AO) plus a tuned contact shadow; SMAA antialiasing | Dev | Car sits on the floor, no jaggies |
| 1.4 | Tone mapping check: ACES vs AgX at matched exposure | Dev | Owner picks one |
| 1.5 | Path tracer: real-GPU tuning (samples, denoise, floor, framing) and use it for the summary stills and PDF | Dev | Stills render in < 6 s on the phone test |

### Sprint 2: the three cars

| # | Task | Who | Done when |
|---|---|---|---|
| 2.1 | Benchmark purchase: NLM-Group M4 Competition (Sketchfab Standard, $39.99) and Zifir3D M5 G90 (about €9–$59). Compare with the current files. | Owner approval, Dev | Comparison sheet; keep the better file per car |
| 2.2 | M3 G80: same comparison (Zifir3D or another Standard-licensed file) | Owner approval, Dev | Chosen file |
| 2.3 | Optimise each chosen file: decimate to about 500k triangles, meshopt, KTX2, under 15 MB | Dev | Loads in < 4 s on 4G |
| 2.4 | Material pass per car: glass (tint, transmission), lights (emissive DRLs), tyres (sidewall normal), chrome/black trim, badges per legal answer | Dev | Signed-off renders for each car |
| 2.5 | Paint and hide regexes, framing per car, migration and fallback data | Dev | All 64 paints apply cleanly |

### Sprint 3: the wheels

| # | Task | Who | Done when |
|---|---|---|---|
| 3.1 | Convert received CAD to GLB via the admin CAD route; check scale, offset and centre bore | Dev | Wheels mount correctly on all 3 cars |
| 3.2 | Wheel materials: machined face (anisotropic brushed metal), painted spokes, polished lip, centre cap | Dev | 360° close-ups signed off |
| 3.3 | Fallback for designs without CAD: commission models (about $100–300 each, 3–7 days, GLB plus full IP) | Owner approval | Quotes and order placed |
| 3.4 | Better tyre (sidewall lettering normal map, tread) and brake disc/caliper | Dev | Close-up renders |
| 3.5 | Real names, prices and photos for FSA-10–17 | Client | Catalogue complete |

### Sprint 4: harden and ship

| # | Task | Who | Done when |
|---|---|---|---|
| 4.1 | Performance budget: phone fallback (lower samples, no path tracing on weak GPUs) | Dev | No crashes on a mid-range Android |
| 4.2 | Merge the photoreal branch behind a feature flag, then on by default | Owner approval | Live |
| 4.3 | Credits page, "not affiliated with BMW AG", model extraction clause in terms | Dev, Client legal | Live |
| 4.4 | Client sign-off session with side-by-sides | Client | Sign-off |

## Risks

- **No premium BMW models exist on the big stores** (BMW enforces its trademarks). The buyable
  files are mid-tier, so per-car material work in Sprint 2 is where quality is won.
- **Wheel CAD depends on the manufacturer.** The fallback is commissioned models (cost and time).
- **Phones:** path tracing on low-end phones can be slow, so the real-time view must stand on its
  own (Sprint 1).

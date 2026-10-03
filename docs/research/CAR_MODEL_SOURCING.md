# FORGEDSA photoreal research (1 Oct 2026)

Scope: BMW M5 G90, M4 G82, M3 G80 + forged wheels, for a public commercial Three.js configurator.
"Verified" = seen on the live page / API today. "Unverified" = from memory, forum posts or vendor marketing.

---

## 0. Headline finding: BMW is largely absent from the big commercial stores

- **TurboSquid**: search "bmw-m4" returns 0 BMW models (the single hit is an Aston Martin); "porsche-911" returns 900+. Verified: https://www.turbosquid.com/Search/3D-Models/bmw-m4 vs https://www.turbosquid.com/Search/3D-Models/porsche-911
  - Background: BMW Group sued TurboSquid in 2016 over BMW car models (polycount thread with link to the suit: https://polycount.com/discussion/174378/bmw-suing-turbosquid-over-car-models). Outcome not verified; BMW models appear to have been removed.
- **Hum3D** now redirects to **3dmodels.org**. Searching "BMW M5/M4/M3 G80" returns only **blueprints**, and there is no BMW make category (`/3d-models/vehicles/bmw/` redirects to the generic vehicles page). Verified. So **Hum3D does not sell these cars** (any more).
- **CGTrader**: search URLs failed for every keyword (Porsche too), so this is **inconclusive**. The tag URL `/3d-models/bmw-m4-g82` returns **410 Gone** (verified), which suggests removal, but this is unconfirmed.
- **Squir** sells M3 G80 and M4 G82 (2021), but on Sketchfab both are **Editorial** licence, $169 each (Sketchfab API, verified). Editorial means no commercial or promotional use, so they are **not usable**.
- Licence pages on TurboSquid, Sketchfab and CGTrader all say the same thing: **they license copyright in the mesh only, never BMW trademark or trade-dress rights.** See section 2.

What is actually buyable with a commercial licence (verified today):

| Car | Product | Licence | Price | Polys | Formats / notes |
|---|---|---|---|---|---|
| M4 G82 (2021, pre-LCI) | NLM-Group "BMW M4 Competition 2021" https://sketchfab.com/3d-models/bmw-m4-competition-2021-a4fb6e275e3943478684249f852e91c1 | Sketchfab **Standard** | **$39.99** | 2.35M tris, 24 materials, 12 textures | GLB with textures embedded; "highly detailed interior". Too heavy for web as-is, so decimate to about 300-500k. |
| M4 G82 (2020) | Eihab_3D "BMW G82 M4" https://sketchfab.com/3d-models/bmw-g82-m4-7b001a89bce14fd8bb76a61235873b5f | Standard | $39.99 | 1.58M tris, 53 materials | Made in Blender. Interior not stated. |
| M5 G90 (2025) | Zifir3D "BMW M5 2025" https://zifir3d.com/product/bmw-m5-2025 (also on CGMood for €9 + VAT https://cgmood.com/3d-model/bmw-m5-2025) | Royalty-free (vendor). Store says "inspired by a real product" | $59 (Zifir) / €9 (CGMood) | 281k polys | .max (Corona/V-Ray), FBX, OBJ, 3DS. No GLB. Zifir lists "Unwrapped UVs: No", so no clean UVs for AO baking. Interior: unverified. |
| M3 G80 | Zifir3D "BMW M3 Competition G80 2021" and "M3 Sedan 2025" (CGMood links on the page above) | as above | about €9 on CGMood / $59 on Zifir (assumed same pricing) | not checked | as above |
| M4 G82 | Zifir3D "BMW M4 Competition 2021" (CGMood) | as above | as above | not checked | as above |
| M5 G90 | R.works "M5 G90 2025" https://3dexport.com/3d-model-m5-g90-2025-626103 | 3DExport royalty-free | $42.50 (50% off $85) | not checked | c4d/max/obj/fbx/blend |
| M5 G90 | Next Level Models on ArtStation https://www.artstation.com/marketplace/p/ekG29/bmw-m5-g90 | ArtStation (standard/pro tiers) | unverified (page returned 503) | ? | "animated, high detailed interior, can be used in games" |

Interpretation: there is **no premium "configurator-grade" G90/G82/G80 for sale on a top-tier store**. The real options are mid-tier sellers (NLM, Zifir3D, R.works) for $10-60 each. They are cheap enough to test-buy all three and judge them in our own renderer. None comes with a guarantee of BMW trademark clearance.

---

## 1. Notes per source

- **Hum3D / 3dmodels.org**: none for BMW (see above). They do take custom commissions ("send us a request for price and time frames"). Typical Hum3D custom car price is unverified; historically $1,000+.
- **Squir**: high quality (1.4M tris, separate materials, clear-coat channels on Sketchfab) but Editorial on Sketchfab. Squir.com's own store search is JS-only and could not be scraped. **Ask Squir directly** whether a Standard/commercial licence is available on squir.com. Unverified.
- **TurboSquid**: none (see above). It also offers "Enhanced licences" (Small Business +$99, $250k indemnity, up to Agency +$429), but these only cover copyright.
- **Sketchfab Store**: Standard vs Editorial; see section 2. Editorial models **could not migrate to Fab** (Epic's new store). Epic: "other license types, such as the Editorial license, will not be eligible for migration" (https://www.unrealengine.com/blog/fab-content-marketplace-launches-in-october-publishing-portal-opens-today).

### Provenance warning on free "CC BY" BMW models (important)
The Sketchfab API shows identical face counts across different uploaders with different licences. That is a strong sign of re-uploads with the licence changed ("licence laundering"):
- **389,102 faces**: ddiaz-design "2025 BMW M5 Sedan" is **CC BY-NC-SA**, but Res1n, tangwang920 and klserdar0 upload the same count as **CC BY**.
- **239,781 faces** (M4 Adro): ddiaz-design is NC-SA, but vecarz and Golden-Models list it as CC BY. vecarz's own description credits Ddiaz Design.
- **341,175** (ddiaz NC-SA vs tangwang920 CC BY), **125,819** (ddiaz 2025 M4 NC-SA vs homicivan53 CC BY), **658k** M3 2025 (MattDoesBlender/VTX NC-SA vs Golden-Models CC BY).
- koelkastasbers "2024 BMW M4 Competition" (Free Standard) says it "comes from a BeamNG.Drive mod".
- The current app M5 (JUSTGAME, CC BY, 378,335 faces) does **not** match the 389,102 family. Its origin is still unverified.

A CC BY licence is only valid if the uploader actually owns the work. A laundered model gives you no rights.

---

## 2. Using Sketchfab models legally in a commercial web app

Sources: https://sketchfab.com/licenses, https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses/

- **CC BY 4.0**: commercial use is OK. You must credit the author and title, link the source and licence, and say that it was modified. A visible "Credits" page or footer link is the usual way. Already done in `public/models/CREDITS.md`, but it needs to be **reachable from the live site**.
- **CC BY-SA**: commercial use is OK, but derivative 3D files must be shared under the same licence. That is risky for a modified GLB served to the browser.
- **CC BY-NC / NC-SA**: **no**, because a lead-generating sales configurator is commercial.
- **CC BY-ND**: no modification allowed, so you cannot even replace the wheels. **No.**
- **Free Standard** (newer Sketchfab free licence): standard-licence terms at $0, so commercial use is OK. Whether credit is required is unclear (community Q&A; unverified).
- **Standard (paid)**: commercial use is OK. Limits: single seat; no distributing the asset "as a stand-alone file" or "in a way that allows third parties to ... extract" it; you must "post terms ... that prohibit ... use of the Licensed Material as a stand-alone file" (s2.2, s2.7). A web GLB can be downloaded by anyone, so add a ToS clause, and Draco/meshopt compression plus obfuscation is prudent. Standard does **not** clear trademarks (s2.2(d), s4).
- **Editorial**: no "commercial, promotional, endorsement, advertising" use, and nothing that "suggests ... affiliation ... with any ... brand" (s2.3). **Not usable.**
- **Trademarks / trade dress**: every licence (Sketchfab s4 "Releases", TurboSquid "Associated Brands", CGTrader RF licence) says the seller grants no trademark rights. BMW has enforced against 3D models before (2016 TurboSquid suit). Mitigations:
  - Remove BMW roundels, M badges and kidney-grille logos from meshes and textures, or check with counsel.
  - Show "BMW" and model names only descriptively ("fits BMW M3 G80"), with a disclaimer such as "FORGEDSA is not affiliated with BMW AG".
  - Aftermarket wheel brands commonly do this, but **get South African legal advice** (Trade Marks Act 194 of 1993). Unverified / not legal advice.

---

## 3. Photoreal car paint and rendering in Three.js (2025-26)

### Paint stack (one material, no per-colour textures)
- `MeshPhysicalMaterial`. Metallic paint uses `color` = paint base, `metalness` about 0.5-0.9, `roughness` about 0.3-0.45 for the base layer, `clearcoat: 1`, `clearcoatRoughness` about 0.02-0.05.
- Flakes: put a **tiling flake normal map on `normalMap` (base layer only)** with high repeat (for example ×100-400 on car-scale UVs), and leave `clearcoatNormalMap` empty or very subtle (orange-peel). The clear coat must stay mirror-smooth. Three.js ships a procedural generator, `three/addons/textures/FlakesTexture.js` (listed in the docs: https://threejs.org/docs/pages/FlakesTexture.html), used in the official `webgl_materials_physical_clearcoat` example.
  - Caveat: flakes need UVs. Many rips have no or bad UVs (Zifir lists "Unwrapped UVs: No"). Fixes: triplanar flakes in a custom `onBeforeCompile` / TSL node using world or object position, or a box/auto UV pass in Blender.
- Solid (uni) paints: `metalness` 0, base `roughness` about 0.5, clear coat 1.
- Frozen/matte: clear coat 0 (or `clearcoatRoughness` about 0.5+), base `roughness` 0.5-0.7, no flakes.
- Pearl / "Individual" colours: optional low `iridescence` (0.1-0.3, `iridescenceIOR` about 1.3) or `sheen` for colour shift. glTF equivalents: `KHR_materials_clearcoat`, `KHR_materials_iridescence`, `KHR_materials_sheen`, `KHR_materials_specular`, `KHR_materials_anisotropy` (use this for brushed or machined wheel faces; supported in three.js since about r153), `KHR_texture_transform` (flake tiling).
- **Do you need per-colour textures? No.** Factory paint = base colour + finish preset (metallic / solid / frozen / pearl), with the flake map and parameters shared. This matches your belief. Store paints as `{hex, type, metalness, roughness, clearcoatRoughness, flakeScale, flakeIntensity, iridescence}`.

### Lighting and environment (the biggest lever)
- Car advertising looks "real" mainly because of **large rectangular softbox reflections** on the paint, not because of the HDRI. Build the environment from area emitters: drei `<Environment>` + `<Lightformer>` rectangles/rings rendered to a cubemap, or a studio HDRI with strip lights. Then add a dark or graded floor.
- CC0 studio HDRIs: Poly Haven "studio_small_0x", "photo_studio_loft_hall", "brown_photostudio_0x" (Poly Haven, CC0; exact names not re-checked today).
- Grounding: baked AO / contact shadow under the car (drei `ContactShadows` / `AccumulativeShadows`, or a pre-baked shadow PNG per car). Optionally bake AO into a lightmap for the body (needs UV2). The existing path tracer already gives GI when the camera rests.
- Tone mapping: `AgXToneMapping` or `ACESFilmicToneMapping`, exposure about 0.8-1.2, sRGB output, `envMapIntensity` about 1-2 on paint.

### Post-processing
- WebGL (pmndrs `postprocessing`): N8AO (fast SSAO/HBAO), SMAA or MSAA, subtle bloom only on lights, and optional SSR (realism-effects by 0beqz offers SSGI/SSR/TRAA; maintenance status unverified).
- WebGPU/TSL (three r16x-r18x): built-in `ao` (GTAO), `ssr`, `ssgi`, `traa` (temporal AA) nodes. The TSL docs list `ssao`, `ssgi`, `sampleHistory4Tap`, `vxgi` today (https://threejs.org/docs/). Migrating to WebGPURenderer is a larger task.
- The highest-value combination for still frames: TAA/accumulation while idle, which the path tracer already provides.

### How the big configurators do it
- **Porsche Car Configurator**: Unreal Engine-based 3D view ("powered by the same Unreal Engine technology from Epic Games", Porsche newsroom 2026: https://newsroom.porsche.com/en_AU/2026/company/porsche-cayenne-turbo-electric-fortnite-42504.html); options "visually represented in real time" (2022: https://newsroom.porsche.com/en/2022/products/porsche-new-car-configurator-29875.html). Delivery is widely reported as cloud **pixel streaming**, with 2D pre-rendered fallbacks. The streaming detail is unverified.
- **BMW / Mercedes / Audi**: mainly **pre-rendered or server-rendered image sequences** from CAD-derived datasets (BMW shows CAD-to-Unreal pipelines at Unreal Fest: https://www.youtube.com/watch?v=Y3YPry57l7U). Exact delivery is unverified.
- **Chevy Corvette visualizer**: Unreal + cloud streaming (PureWeb: https://www.pureweb.com/news-updates/how-unreal-engine-is-creating-new-possibilities-for-the-automotive-industry/).
- **Threekit, Expivi, Zakeke, Sketchfab viewer, Mint/Mintviewer**: in-browser WebGL real-time PBR with baked AO/lightmaps, curated HDRIs and, for Threekit, a server-side "photoreal" renderer for stills. Product details unverified today.
- Takeaway: the OEMs get photorealism from **CAD-accurate geometry + offline or cloud rendering**. A WebGL app competes with the same recipe: real-time PBR plus a **progressive path-traced still when idle**, which FORGEDSA already has. Pixel streaming costs about $0.5-3 per GPU-hour per concurrent user (unverified) and is overkill here.

---

## 4. Wheels

- **Best: the manufacturer's CAD.** Forged wheels are CNC-machined from 3D CAD, and makers produce renders for customer approval (e.g. JC Forged: "design engineers create 3D model renders" https://www.jcforgedwheels.com/blog-posts/the-bespoke-forged-project-an-inside-look-on-the-custom-forged-wheels; FUMEI describes the process starting with 3D modelling + FEA https://fumeiwheel.com/custom-forged-wheels-manufacturing-process/).
  - Ask FORGEDSA's supplier for **STEP/IGES** per design. Tessellate with FreeCAD / Mayo / CAD Assistant (free) or Blender + CAD importer to about 40-120k tris per wheel. Export GLB with separate face / barrel / lip / bolt materials and apply anisotropic machined, gloss and brushed finishes.
  - Cost: $0 plus about 2-4 h of work per design. The repo already has a CAD route (`forgedsa-wheel-pipeline` skill).
- **Freelance modelling from photos + dimensions**: Fiverr "3D wheel" gigs start at about **$25-70**. Realistic, configurator-grade wheels are typically about $100-300 per design with 3-7 day turnaround (Fiverr listing page shows starting prices $25-$200: https://www.fiverr.com/gigs/3d-wheel; the realistic range and turnaround are unverified estimates). CGTrader custom requests and Upwork are similar.
  - Provide face-on and 45° photos, diameter/width/offset and spoke count. Require clean quads/UVs, a GLB deliverable and a **full IP assignment**.
- **Photogrammetry**: poor for gloss, chrome or polished wheels (reflective surfaces need scanning spray and a turntable). Not recommended for finished wheels. Useful only for brushed/matte raw blanks (general knowledge).
- **AI image-to-3D** (Meshy, Tripo, etc.): not accurate enough for symmetrical machined spokes (general knowledge).

---

## 5. Recommendation for this week (limited budget)

**Single best move: rebuild the studio lighting and paint stack (softbox `Lightformer` environment + proper flake/clear-coat presets + contact shadow/AO).** It costs $0, improves every car and wheel at once, and makes the existing path-traced "rest" mode look like a car commercial instead of a lit model. No new car model fixes flat or HDRI-blobby reflections.

In parallel, for next to nothing:
1. Email the wheel supplier today for STEP files of the top 5 designs (free, and the biggest wheel realism gain).
2. Test-buy one commercial car to benchmark against the community models: NLM-Group M4 Competition 2021 ($39.99, Standard, GLB + interior) or Zifir3D M5 2025 (€9 on CGMood / $59). Check UVs, the paint-panel split and the badges.
3. Audit the provenance of the current free M3/M4/M5 against the face-count families above, and make the credits page public.
4. Get a short legal opinion on BMW name/badge use in South Africa. Strip roundel/M badges from the meshes if in doubt.

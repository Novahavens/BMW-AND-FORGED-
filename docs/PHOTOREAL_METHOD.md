# Photoreal method: cars, wheels, tyres and brakes

**Status:** validated 2 Oct 2026 with headless renders of all five cars and all nine FORGEDSA
wheels (SwiftShader, no GPU). The skill [`3d-car-perfect`](../.claude/skills/3d-car-perfect/SKILL.md)
is the step-by-step checklist, and this document explains the reasoning behind it.

**Research and sources:**
- [`research/PHOTOREAL_RENDERING.md`](research/PHOTOREAL_RENDERING.md): tyre, brake and rim
  dimensions, material values, three.js r181 details.
- [`research/CAR_MODEL_SOURCING.md`](research/CAR_MODEL_SOURCING.md): where to buy or licence
  better car files.

## What makes a car render look like a photo

In order of impact:

1. **The shape of the lights reflected in the paint.** Car paint is a mirror under its clear
   coat. Studio photos show long, soft-edged highlights from big diffusers, with dark between them
   so the colour shows. A small HDRI gives blotchy spots.
2. **Occlusion.** Real-time environment light isn't blocked by geometry. Unless you fake it,
   the inside of the barrel, the brakes, the top of the tyre under the fender and the cabin are all
   lit as brightly as the bonnet. This is the single biggest "CG" tell.
3. **Materials that match the real part:**
   - rubber is dark charcoal, not black;
   - discs are machined cast iron with radial streaks;
   - glass is tinted with strong reflections at grazing angles;
   - lenses are clear;
   - chrome is neutral.
4. **Geometry where the camera looks closely:** wheels, tyres, calipers. A photo stuck on a
   flat disc never survives a close-up.
5. **Tone mapping and exposure:** these decide whether darks survive and colours stay true.

## The line-up

The five cars with good models are kept: **M4 G82, M3 G80, M3 Touring G81, M5 G90 and M8 F92**.
These were set inactive in Supabase on 2 Oct 2026: the M2 and M235i (2 Series), the X3 M50 and X5 M
(SUVs), and the M4 Convertible and M5 Touring, which have no 3D model. Their files and bundled
fallback entries are still in the repo; see the PR.

## 1. Studio (`services/studioSoftbox.ts`)

The reflections come from a studio generated in code, not from a downloaded HDRI:

| Light | Size (m) | Position | Intensity | Feather |
|---|---|---|---|---|
| Overhead softbox | 4.6 × 8.5 | y 6.6, over the car | 2.3 | 0.32 |
| Side strips (each side) | 11 × 0.9 | x ±6.5, y 2.2 | 2.4 | 0.18 |
| Upper side strips | 11 × 0.5 | x ±6.5, y 4.4 | 1.0 | 0.25 |
| Low side strips | 12 × 1.2 | x ±7, y 0.7 | 1.3 | 0.3 |
| Front / rear kickers | 5 × 2.2 | z ±9, y 2 | 1.0 / 0.8 | 0.35 |
| Three-quarter accent | 2.4 × 2.4 | front left, high | 1.4 | 0.4 |
| Floor bounce | 9 × 9 | under the car | 0.08 | 0.45 |

- **Panels:** each panel is a diffuser shader with a hotter centre and feathered edges, added on
  top of a near-black room that is lighter at the horizon.
- **Reflection map:** `PMREMGenerator.fromScene(studio, 0.02, 0.1, 100, { size: 512 })`.
- **Comparison:** `?studio=hdri` switches back to the old Poly Haven HDRI.
- **Tone mapping:** ACES Filmic, exposure 1.08, stays the default.
  - Compared on the same frames, AgX looked flat and washed out, and Neutral looked slightly
    brighter with truer colour.
  - `?tone=agx|neutral&exposure=` keeps the comparison one click away for a client review on a
    real screen.

## 2. Paint (`services/paintShader.ts`)

All colours come from one base colour plus a finish preset. There are no textures per colour:

| Type | Flake strength | Flop (darkness at grazing angles) |
|---|---|---|
| Metallic | 0.07 | 0.66 |
| Frozen (matte) | 0.03 | 0.78 |
| Uni (solid) | 0 | 0.92 |

- **Flakes:**
  - computed from the **world-space** position, at 1,400 cells per metre (about 0.7 mm);
  - faded out once a cell is smaller than about 0.4 px, so distant views stay clean;
  - they tilt only the base layer, so the clear coat stays mirror-smooth.
  - **Pitfall (fixed):** in model space the flakes took on each file's units and showed as
    coarse glitter.
- **Clear coat and gloss:** clear coat 1 with clearcoatRoughness 0.05; `BODY_ENV_INTENSITY` 0.45.

## 3. Wheels, tyres and brakes (`services/wheelKit.ts`)

Every part is generated in code, so it fits any design, size (19–22") and car. Axle on +X.

### Tyre

- **Profile:** a lathe from a 35-series section, 192 segments around:
  - crowned tread with **four circumferential grooves** in the profile (4% of width wide,
    7.5 mm deep);
  - rounded shoulders (24 mm radius);
  - sidewall bulging to the section width at 52% of its height;
  - **rim-protector rib** standing proud of the lip;
  - bead tucked behind the flange.
- **Tread map:** a generated normal-map tile of seven pitches, repeated 12 times, with angled
  shoulder grooves and sipes.
- **Sidewall markings:** generated from a canvas into a normal map plus a roughness map:
  - raised, glossier letters (size such as `265/35 ZR20 98Y XL`, load, DOT, tread-wear arrows)
    in a matte "velvet" band;
  - generic markings only, never a tyre brand;
  - **orientation was checked on the render:** the text is drawn as-is, reads clockwise and has
    its letter tops towards the tread.
- **Rubber:**
  - tread #302e2d, roughness 0.88; sidewall #333130;
  - sheen 0.5–0.55 with `sheenColor` set (it defaults to black, which makes the sheen invisible);
  - the inner sidewall gets envMapIntensity 0.45.
- **Loaded tyre:** the bottom 9 mm flattens onto the floor, in world space, so it stays put while
  the wheel spins.

### Rim shell

- **Lip and barrel:** lathed from a real cross-section: rounded flange, inner wall, drop centre
  kept clear of the caliper, inner bead seat.
- **Two- and three-piece designs:** chosen from the wheel's `style` (`lipStyleFor`). They get a
  polished lip (metal 1, roughness 0.06, clear coat), a ledge and 30–40 bolt heads on an
  `InstancedMesh`.
- **Barrel material:**
  - the finish at **40% brightness** and +0.15 roughness;
  - an **AO map along the profile**, so it darkens with depth (in r181 an aoMap also dims
    environment reflections);
  - envMapIntensity 0.45.
  - Without these, the windows between spokes show a bright barrel and silver wheels read as
    solid discs.

### Spokes from the rim photo

This is `processRimPhoto` → `traceMaskShapes` → `buildSpokeFace`:

1. **Measure the photo.** Radial coverage gives the outer radius and the point where the spoke
   windows end, about 0.66–0.72 of the radius in the FORGEDSA photos. Beyond that the photo shows
   the barrel solid behind the outer half of the spokes, then the lip. The barrel ring used to be
   extruded as a flat disc: the old "disgusting wheels".
2. **Trace the arms across the barrel band** (`traceFaceArms`, mode `barrel`). The first fix
   stretched the see-through spokes out to the lip. That distorts every design and turned FSA-01's
   five slender split arms into five fat spokes on the car: the owner's "not correct" report.
   Instead:
   - **Where each angle's window ends:** the first 20-row solid run after the window; later specks
     are ignored. Median-smoothed, and bounded by a robust off-centre fit, since photos are rarely
     centred on the barrel.
   - **Arm edges:** a straight line fitted to each arm's cut-out edge in the image plane. Then an
     optimal smooth path (dynamic programming, ±24 columns, one column per row at most) through
     the brightness edges to the lip, preferring the outer silhouette over the chamfer lines
     (0.03 per column inward), and smoothed σ 6 rows. Following edges greedily, the tracks jumped
     between parallel chamfer lines and died at the barrel's rings and bolts.
   - **Barrel or flange:** if at least half the arms show real edges on ≥ 40% of their path, it's
     `barrel` (arms only); otherwise `flange`, a solid ring to the lip (FSA-09).
   - **One arm shape for all sectors:** each arm's copies around the wheel are slotted (at most one
     per sector) and their edge curves averaged. A per-pixel median would erase thin tips, since
     an off-centre photo puts the copies a few pixels apart. Each sector's arm starts on its own
     traced edges and eases into the shared shape over 60 rows. The handover from cut-out to
     traced arm is per column; a common row left "flags" on the arms.
   - **Lip:** spokes end at **0.916** of the photo's rim radius, which is the 3D layout's
     240 / 262 mm. Tips keep at least 3 mm of width, so every arm meets the lip.
   - **Fallback:** `stretch` (the old behaviour) when arms can't be traced.
   - **Branch slots** (Y-spokes): a see-through run enclosed by an arm is cut out. Its edges are followed to the lip, averaged across sectors (copies up to 0.15 sector apart), never narrowing and capped at ~18 mm. Clustering at different radii failed, because the slots slant.
   - Results: FSA-01 to 06 and 08 `barrel`, FSA-09 `flange`. FSA-07 (an angled photo of crossing
     bars) is a **bar face** drawn from measured straight bars (`scripts/render/make-bar-face.py`,
     `services/rimFaces.ts`).
   - **Clean joins (Oct 2026).** The owner saw nicks and shoulders on the spokes, where each
     spoke's cut-out half meets its traced outer half. The causes and fixes:
     - The shared arm shape averaged copies that start at different rows, so it jumped sideways
       each time a copy joined. It is now averaged from the row where all copies have started;
       before that, each sector follows its own edges.
     - Window fillets swell the cut-out arm just before the join. It is trimmed against the arm's
       own straight edges.
     - The Y-slot detector cut "pockets" in the overlap rows. Pockets now count only past the
       handover.
     - Brightness edges follow chamfers inside the silhouette. **Straight arms are the default**:
       the fitted cut-out line continues to the lip.
     - Every spoke edge in the sector table is then refitted with a sliding, Gaussian-weighted
       parabola (σ 16 rows; `regulariseEdges`). Straight and evenly curved edges stay put; steps
       of up to 14 columns become short tapers.
     - A 5 px closing fills hooked window tips.
     - Measured by `scripts/render/wheel-qa.cjs`'s **wiggle** check: 17–113° before, 0–10° after
       (limit 15°).
3. **Detect the rotational symmetry.** Angular correlation at four radii over folds 3–24. Take
   the largest fold scoring within 85% of the best. It is applied only when the best score is
   ≥ 0.4.
4. **Take the median across the symmetric sectors (not the mean).**
   - A spoke is solid in nearly every sector, while the barrel or a reflection seen in only a
     few sectors is rejected. The mean left grey ghosts and jagged edges.
   - Read the photo at 1536 px (it was 768) and build one sector as a polar table, about one
     output pixel per cell, before drawing the mask.
   - A lower quantile (0.35) was tested: it thinned the spokes and let partly covered windows
     through, so the median stays.
5. **Smooth along the radius** (Gaussian, σ 8 px on the 1024 px mask) in the polar table.
   - The median still leaves small steps along spoke edges, wherever the photo's sectors
     disagree (perspective side walls, cut-out wobble). Up close they read as lumpy, hand-made
     spokes.
   - Radial smoothing turns the steps into straight runs and leaves each edge where it is.
   - The window corners get a fillet of a few millimetres, as real forged windows have.
   - It runs on across the handover to the traced arms (a symmetric blur leaves a straight edge's
     0.5 contour where it is, whatever its slant) and fades out just inside the lip.
6. **Replace the centre** with a solid hub pad (0.3 of the face radius). Lug nuts and cap are 3D.
7. **Trace:**
   - blur the mask about 2 px (four passes), then trace it at 0.5 with marching squares;
   - **smooth each outline along its length** (σ 6 px, resampled every pixel). Corners, where
     the outline turns more than 50° within ±2σ, stay fixed and the filter stops at them;
   - simplify with a 2 px tolerance (`traceMaskShapes(mask, n, n, 0.5, 2.0, 6)`), so straight
     edges come out as straight lines.
   - Contour smoothing alone can't remove the steps: a step is two sharp turns, so it counts as
     corners and is kept. Steps 5 and 7 work together.
8. **Extrude:**
   - 32 mm deep with a 3 mm, four-segment rounded bevel; the negative offset chamfers the windows
     too;
   - subdivide the caps to 11 mm;
   - dish with **z = −dish·(1 − ρ²)** (steep at the lip, flat at the hub): 36 mm front,
     58 mm rear;
   - `toCreasedNormals` at 38° for the bevel and walls;
   - the **front cap gets the dish's exact normal** (−2d·x/R², −2d·y/R², 1). Left to the creased
     normals, the cap mixed with the bevel's first row (22.5° away, inside the crease angle), and
     the long cap triangles spread that tilt across the spoke. The tops shaded in blotches, like a
     hand-filed part. Cap triangles are tagged before the dish moves them (all three vertices in
     the extrude's top plane).
9. **Material:** the finish only (no photo texture), DoubleSide, light arch occlusion. How the
   four finishes are built is below (Wheel finishes).

Results (fold detected): FSA-01 5, 02 10, 03 15, 04 5, 05 5, 06 12, 07 5, 08 5, 09 10. FSA-07
comes from an angled photo and keeps some torn arms; manufacturer CAD (the admin CAD route) is the
real fix. The step-by-step for a new photo is the `forgedsa-rim-from-photo` skill.

### Wheel finishes

`services/wheelFinish.ts` reads the admin's four numbers per finish as a layered coating. The
kind is picked from the numbers, so admin-made finishes work unchanged. Details and QA: the
`forgedsa-rim-finishes` skill.

| Finish | Kind | Rendered as |
|---|---|---|
| Liquid Metal | polished (metal ≥ 0.95, rough ≤ 0.16) | metal 1, roughness 0.05–0.1, mirror clear coat |
| Black Gloss | gloss paint (dark, or metal < 0.3; rough ≤ 0.35) | **non-metal** black paint, base roughness 0.4, clear coat ≥ 0.9 at 0.03 |
| Bronze Matte | satin metallic (rough ≥ 0.42) | metal ≥ 0.75, clear coat kept but **rough (0.6)**; flop 0.75, flake 0.05 |
| Silver | metallic paint (the rest) | roughness ≥ 0.3, clear coat at 0.04; flop 0.7, flake 0.06 |

- **Black Gloss was metal 0.7 with a near-black colour.** That reflects almost nothing from the
  base, so the spokes rendered as flat black silhouettes. As paint, the base gives a soft 4%
  sheen and the clear coat gives the crisp reflections.
- **Bronze Matte had a smooth clear coat (0.1).** At grazing angles it added mirror reflections,
  so the "matte" wheel read satin-gloss and orange.
- **Flop and flake** come from `installFinishLayers`:
  - flake cells are 1 mm in mesh space, so they turn with the wheel, and fade when sub-pixel;
  - the clear coat keeps the smooth normal.
- **Live data:** finish values in `wheel_finishes` are read by production and previews alike.
  The engine reads them physically instead of the values being changed.

### Brakes

- **Disc:** 380 × 36 mm front, 370 × 28 mm rear; spins with the wheel.
  - Two-piece floating disc: two plates with 72 cross-drillings, 36 vanes, an anodised hat and
    10 bobbins.
  - Face: cast iron #a19f9b, metal 1, roughness 0.38, normal-map machining grooves.
  - **Anisotropy 0.8 with a radial direction map:** turned marks are circles, so highlights
    stretch radially. A (0.5, 0.5) texel gives NaN.
- **Caliper (M Compound style):** 6-piston monoblock, stationary, on the upper trailing side.
  The first version was a smooth blue kidney with soft 11 mm edges and domed pistons: the owner
  called it "a blue blob". What makes it read as a real caliper:
  - Kidney body spanning 84° front and 70° rear (about 278 / 230 mm), from 66 mm inside the disc
    edge to 24 mm outside it. **Firm 7 mm cast edges** (a soft edge reads as a toy).
  - A **raised outer face** with its own 3 mm bevel. This is where the light catches, as on the
    real part.
  - **The BMW M logo** on the face (the owner chose it over a FORGEDSA wordmark or none):
    - the light blue / dark blue / red stripes and a white italic "M", drawn on a canvas
      (1024 × 400, the decal's real proportions);
    - mapped along the arc from 12% to 88% of the span;
    - polygon offset and clear coat, so it sits in the paint.
  - **Pad window** recessed flush in the radial face. Pad pin and anti-rattle spring, flush with
    the top.
  - **Hex bridge bolts with washers**, short bleed nipples with dark caps, and pads with metal
    backing plates. The old domes read as blobs and were removed.
  - Gloss paint: **M Performance Blue #0055b8**, roughness 0.36, clear coat 1 / 0.03. The colour
    can be changed per car (`applyCaliperColor`).
- **Clearance:**
  - the disc centre sits at x = −14 mm front and −8 mm rear, so the caliper clears the back of
    the concave spokes;
  - the drop centre clears the caliper down to 19".

### Hub

- Five hex lug nuts on 5 × 112 (six-segment lathe with creased normals and a domed top).
- Domed centre cap with a gold FSA monogram.

### Occlusion tricks (no post-processing)

- **Arch shade:** `installWheelShading` darkens wheel parts towards the top of the wheel in world
  height (tyre 0.62, disc and hat 0.45, caliper 0.4, barrel 0.5, spokes 0.3). It acts on indirect
  and most direct light, like the fender's shade in a photo.
- **Rim showcase:** the uniform is switched off there (no car).

## 4. Car material pass (`services/carMaterials.ts`)

Downloaded and game-derived GLBs ship with default or wrong values. Every non-paint part is
classified by its mesh, parent and material names, then given studio values:

| Kind | Rule |
|---|---|
| glass | Tint at lightness ≤ 0.035, opacity 0.62–0.82, roughness 0.02. A black additive **reflection overlay** (ior 1.52) keeps Fresnel reflections at full strength. |
| lens | Clear cover: white, opacity 0.12–0.3, roughness 0.02. Only untextured parts. |
| tailLens | Deep red, opacity 0.55–0.9, faint red glow. **Only if the material is actually red.** |
| chrome | Neutral bright metal (some files tint it green), metal 1, roughness ≤ 0.1. |
| carbon | Gloss clear-coated, roughness 0.38. |
| blackTrim | High-gloss "shadow line" black, roughness 0.22–0.4, clear coat 0.6. |
| interior | envMapIntensity 0.35 (the cabin is in shadow). |
| other | glTF default rough 1 / metal ≤ 0.06 → roughness 0.45. |

**Opaque parts:** near-opaque parts marked transparent (opacity ≥ 0.95) are drawn solid,
alpha-tested where textured. Otherwise they sort badly against the glass.

**Gotchas found on the five cars** (each fixed in the rules):
- **M3 front windows:** they use a material called `Taillightglass21Mtl`, which turned red.
  Now only a red material can be a tail lens, and a dark, fairly opaque "lens" is smoked glass.
- **M5 tail lights:** they are `glass_red` with no lamp word in the name. Red glass is now
  always a tail lens.
- **Textured lamp parts** (DRL light guides) keep their texture, so they don't fade to a clear
  lens.
- **M3 leftover wheel parts:** the M3's hub discs, and a ring round its brake disc, are triangles
  inside a body-paint mesh.
  - They showed as a white or red disc in the middle of every FORGEDSA wheel once the concave face
    sat deeper.
  - `stripLeftoverWheelParts` now cuts away triangles that sit inside a tyre **cylinder** (not the
    wheel's box: fender lips sit in the box corners) and hides parts made only of them.
  - It runs after the wheel corners are known, including when all four wheels are one merged
    mesh (found by splitting vertices).
  - Found by elimination: hide the hub, tint the face, hide the body, recolour the paint.

## 5. Verification (how this was validated)

Use `scripts/render/` (dev server, `engine.html`, `shoot.cjs` shot lists):

1. **Audit:** a hero shot of every car with real wheels.
2. **Wheel QA:** a close-up (`frontWheel`) of every design, with alternating finishes.
3. **Car passes:** front three-quarter and rear three-quarter of every car.
4. **Comparisons:**
   - before/after crops at the same view, paint and viewport;
   - tone mappers on identical frames.
5. **Live app smoke test:** `/rims/<id>` (the 360° page) with a local Tailwind copy. Only
   sandbox network errors are allowed.
6. **Masks:** dump the processed spoke masks as images and check them one by one.

## 6. Known limits and next steps

- **Thin spokes, lettering and specular sparkle alias:** temporal anti-aliasing (TAA) when the
  camera rests (`TAARenderPass`, accumulate), or the path-traced still mode
  (`claude/photoreal-proof`).
- **Real ambient occlusion** (N8AO) needs the composer path, and the canvas is transparent. Try it
  behind a flag and test on real phones.
- **Shadow-casting key light:** spokes onto the caliper and disc, the fender onto the tyre.
  Render it once and update it on change.
- **Manufacturer CAD** for every wheel: the admin CAD → GLB route is ready.
- **Better licensed car files** (see research/CAR_MODEL_SOURCING.md), then the same material pass.
- **Check on a real GPU and phone:** colours, gloss and performance.

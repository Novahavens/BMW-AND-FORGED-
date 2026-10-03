---
name: 3d-car-perfect
description: The validated end-to-end process for making a car configurator look photoreal in three.js (WebGL, no GPU in the sandbox). Covers auditing car models, the generated softbox studio, paint layers, procedural photoreal wheels/tyres/brakes, turning rim photos into clean 3D spokes, the car material pass, fake occlusion, tone mapping, and headless render verification. Use whenever a car, wheel, tyre, caliper, paint or studio change is asked to look "real", "photoreal", "less fake", "better", or when a wheel or car looks bad, flat, plastic or glittery.
---

# 3D car perfect

This is the process used on 2 Oct 2026 for the five FORGEDSA cars and nine wheels, validated with
renders. The reasoning and numbers are in [`docs/PHOTOREAL_METHOD.md`](../../../docs/PHOTOREAL_METHOD.md),
and the sources in [`docs/research/`](../../../docs/research/). Work through the steps in order and
render after each one.

## 0. Set up the render loop first

```bash
cd /home/user/BMW-AND-FORGED-
rm -rf node_modules/.vite
(setsid nohup npx vite --host 127.0.0.1 --port 5173 > "$SCRATCH/vite.log" 2>&1 &)
node scripts/render/shoot.cjs "$SCRATCH/out" shots.json "$SCRATCH/rims"   # ~1 min per shot
```

- **Shot lists:** JSON objects `{name, car, paint, wheel, finish, size, view, q, cam}`. Indexes
  come from `data/configuratorData.ts`. Views are `frontThreeQuarter`, `rearThreeQuarter`,
  `frontWheel`, `side` and `hero`.
- **Rim photos:** cache them locally first, e.g. `curl` every `imageUrl` into `$SCRATCH/rims`.
  The sandbox browser can't reach Supabase storage.
- **App pages:** `/rims/<id>` and the other app routes are styled offline (Tailwind is built by
  Vite); a page that renders unstyled means `index.css` isn't imported, not a network problem.
- **Slow first loads:** use `waitUntil: 'domcontentloaded'` and a 240 s goto timeout. The dev server
  re-optimises dependencies on first load, and that used to hang `load`.
- **Edits mid-run:** the dev server serves new code on the next navigation, so stop a batch
  before comparing versions.
- **Compare like for like:** crop full-size PNGs, same view, paint and viewport. Contact sheets via
  PIL.

## 1. Audit the cars

1. Render every car with **real wheels** at front 3/4. Look at full resolution.
2. Keep only good models. A missing model shows a placeholder body: drop it.
   - Set `active = false` in Supabase (`cars` table, via `execute_sql`).
   - The public catalogue filters on `active`.
3. Dump material lists per GLB (`json` chunk of the GLB: names, factors, alpha mode, textures)
   to plan the material pass.

## 2. Studio light: shape, not brightness

- **Studio:** `services/studioSoftbox.ts`. Large feathered diffuser panels (overhead softbox, long
  side strips, low strips, kickers, a dim floor bounce) in a dark room, built with
  `PMREMGenerator.fromScene(..., { size: 512 })`.
- **Bonnet blown out:** lower the overhead intensity or widen the feather. Never make the panels
  hard-edged.
- **Tone mapping:** ACES 1.08 is the default. Compare with `?tone=agx|neutral` on identical frames
  before changing it: AgX flattens, Neutral pulls darks towards black.

## 3. Paint

- **One base colour plus a preset** (`services/paintShader.ts`): flake + flop + clear coat.
  Never a texture per colour.
- **Flakes:** in **world space** (model space inherits each file's units, which turns them into
  glitter). About 0.7 mm cells, strength ≤ 0.07, fading out below about 0.4 px.

## 4. Wheels, tyres, brakes (`services/wheelKit.ts`)

Never use the photo as the face texture, and never extrude the whole photo. Instead:

1. **Photo → mask** (`processRimPhoto`):
   - where the barrel shows solid behind the outer spokes, trace the arms across it to the lip
     at 91.6% of the rim radius (`traceFaceArms`, mode `barrel`). Stretching the see-through
     spokes to the lip (mode `stretch`, the fallback) turned FSA-01's slender split arms into
     fat spokes. Full detail: `forgedsa-rim-from-photo`;
   - read the photo at 1536 px, detect symmetry, then take the **median** across sectors (in a
     polar table of one sector);
   - smooth along the radius (σ 8 px), then refit every spoke edge as a smooth curve
     (`regulariseEdges`), which removes the steps where the cut-out meets the traced arms;
   - solid hub pad, blur, then opening and closing (no slivers, no hooked window tips);
   - a design the photo can't give cleanly gets a prepared face (a bar face, or an AI face mask
     in `services/rimFaces.ts`). The process for any new wheel: the `wheel3d` skill.
2. **Mask → face:**
   - `traceMaskShapes` with outline smoothing (σ 6 px; corners kept) and tolerance 2 px;
   - `buildSpokeFace`: bevelled extrude, cap subdivision, dish −d·(1−ρ²), creased normals on
     the bevel and walls, and the dish's exact normal on the front cap (averaged with the bevel,
     the tops shade in blotches).
3. **Everything else is generated:**
   - tyre profile with grooves, tread normal map and sidewall markings;
   - lip and barrel lathe (polished, bolted lip for two- and three-piece designs);
   - cross-drilled vented disc with **radial** anisotropy;
   - 6-piston M Compound-style caliper about 278 mm long: firm 7 mm cast edges, a raised face,
     the BMW M logo, pad window, bridge bolts, bleed nipples, pads with backing plates, in
     M Performance Blue. Detail in `docs/PHOTOREAL_METHOD.md`;
   - lug nuts and centre cap.
4. **Fake the occlusion the environment can't do:**
   - barrel at 40% brightness with a profile AO map and envMapIntensity 0.45;
   - inner parts at envMapIntensity 0.45–0.75;
   - `installWheelShading` arch shade on everything under the fender;
   - switched off in the showcase.
5. **Finishes** are layered coatings read from the admin numbers (`services/wheelFinish.ts`):
   polished metal, gloss paint (Black Gloss is a non-metal), satin metallic (Bronze Matte's clear
   coat is rough) and metallic paint (Silver), with flop and flake. See `forgedsa-rim-finishes`.
6. **Rubber colour:** #302e2d–#333130 with `sheenColor` set. Below about #262626, ACES makes it a
   black hole.
7. **Check the sidewall text orientation on a render:** it must read clockwise with the letter
   tops towards the tread. Use generic tyre markings only (no Michelin, Pirelli or Brembo logos). The BMW M logo on the
   caliper is the owner's choice (Oct 2026); don't add other brands' marks.
8. **Clearance:** the caliper sits behind the concave spokes and inside the 19" drop centre. Move
   the disc plane (`discX`), never the spokes.

**Wheel QA:** measured first, then by eye (the `visual-qa` skill):
`scripts/render/wheel-qa.cjs` for every face (pieces, windows, symmetry, wiggle, thinnest
spoke), then `scripts/render/qa-matrix.py` on the car. Look for:
- jagged or lumpy spoke edges:
  - run `scripts/render/outlines.cjs`: it draws the traced outlines over the mask at 2× for each
    settings variant, in seconds;
  - compare settings there before any full render;
  - steps survive outline smoothing (they count as corners); radial smoothing removes them;
  - don't use a lower sector quantile: it distorts the windows;
- blotchy, hand-filed-looking spoke tops: the cap normals are mixing with the bevel (see step 2);
- a "solid disc" look on silver (barrel too bright);
- the hat or caliper poking through the spokes (clearance).

## 5. Car material pass (`services/carMaterials.ts`)

- **Classify by name, then set studio values:** glass, lens, tailLens, chrome, carbon, blackTrim,
  rubber, interior, badge, other. The pass is idempotent (`userData.forgedPass`).
- **Glass:** dark tint plus an additive black **reflection overlay**. Transparent materials scale
  their own reflections by opacity, which makes them dull.
- **Names lie:**
  - "Taillightglass" was the M3's front windows;
  - "glass_red" (the M5 tail lights) has no lamp word.
  - Gate colour-specific presets on the actual colour (red), and treat dark opaque "lenses" as
    smoked glass.
- **Near-opaque transparent parts:** draw them opaque (alpha test if textured) to fix sorting.
- **Leftover pieces of the model's own wheels** can hide inside other meshes (the M3's hub discs
  are in its paint mesh).
  - `stripLeftoverWheelParts` removes triangles inside the tyre cylinder.
  - If something odd shows inside a wheel, find it by elimination: hide the hub group, tint the
    spoke face, hide `bodyMeshGroup`, recolour the paint. A raycast also reports hidden meshes,
    so don't trust it alone.
- **After the pass, list the parts per kind:** load the car in `engine.html`, traverse
  `window.e.bodyMeshGroup` and group by `userData.partKind`. Look for misfiled parts, then render
  front and rear 3/4.

## 6. Ship it

1. `bun run lint` and `bun run build`. Heavy libraries stay in their own lazy chunks.
2. **Smoke-test the app:** `/rims/<id>` and the welcome page. Only sandbox network errors are
   allowed.
3. Commit with before/after evidence described in the message, push, update the PR, and deploy a
   Vercel **preview**. Production only when the owner says so.
4. Update `docs/PHOTOREAL_METHOD.md` and this skill with anything new you learned. Every pitfall
   above cost a render cycle to find.

## Not solved yet (next levers)

- **Real AO:** N8AO behind a flag, which needs the composer and an opaque canvas.
- **Rest-frame TAA:** for thin spokes and lettering.
- **Shadow-casting key light.**
- **Manufacturer CAD:** for the wheels from angled photos (FSA-01, FSA-07).
- **Licensed premium car files.**
- **Real-GPU and phone check.**

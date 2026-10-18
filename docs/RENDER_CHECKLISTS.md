# Render checklists (tick-box)

Copy the section you need into the PR description or a working note and tick it off.
The reasoning and the commands are in [`RENDER_PLAYBOOK.md`](RENDER_PLAYBOOK.md).

---

## A. New car: intake

- [ ] Licensed 3D model; licence and credit recorded in `public/models/CREDITS.md`
- [ ] Paint-region and hide-region mesh names found (skill `forgedsa-add-car-model`)
- [ ] Factory paint palette for the car (`docs/bmw-factory-paints.md`); palette ids in `data/configuratorData.ts` and the migration
- [ ] Wheel fitment: sizes, widths, offsets, staggered or square (`recommendedWheelFitment`)
- [ ] OEM tyre row in `scripts/wheels/oem_tyres.json` (make, model, sizes front/rear, plus-sizes, `confidence`)
- [ ] OEM brake row: disc diameter and type, caliper design, default colour
- [ ] Anything unverified marked `UNVERIFIED` and `brand_text: null`

## B. Car body render (per car)

- [ ] Dev server running; no other heavy job running
- [ ] `STUDIO=dark THREADS=3 scripts/prerender/render-all.sh <i>`; log kept
- [ ] 5 views × (`gloss_w`, `gloss_b`, `matte_w`, `matte_b`, `flake_w`) present, same pixel size
- [ ] White-pass p99 on body pixels under about 0.96 (top view may exceed only through thin highlight strips)
- [ ] Contact sheet in 3 paints (a solid, a metallic, a Frozen matte) looked at full size
- [ ] Windows: cabin visible, no white holes, no ragged streaks
- [ ] No stock wheels showing; arches dark; contact shadow under the tyres
- [ ] No crumpled or mottled panels (z-fighting); headlights not black; panoramic roof clean
- [ ] Anything wrong fixed in `CAR_FIXES` (not by editing images) and the car re-rendered
- [ ] One commit: `public/renders/<id>/` only; `public/renders/manifest.json` correct

## C. New wheel: intake and model

- [ ] Supplier CAD (STEP/IGES) per size, **or** a front-on photo, rim only, as large as possible
- [ ] Spec sheet: PCD, centre bore, widths and offsets per size, which cars it fits
- [ ] Finish list with names/codes/gloss level; clean product render per finish
- [ ] Cap and logo artwork (vector); any lip engraving text
- [ ] Photo of the real wheel fitted on a car (stance, reflections)
- [ ] Rim model built (`convert.sh` / CAD convert); outline overlaid on the photo or CAD render
- [ ] Spoke count, symmetry, thinnest spoke, window count recorded (`wheel-qa.cjs`)
- [ ] `spoke_profile` set in `docs/rim-template/<id>-rim.json` from the real shading; no stair-stepping or zigzag
- [ ] Spec and outline JSON committed under `docs/rim-template/` (CAD files are **not** committed)
- [ ] Test frames: `turntable.py --only-frames 0,9,18 --only black,silver` looked at full size

## D. Wheel spin and on-car layers (per wheel)

- [ ] Full spin: 36 frames × 5 finishes; `spin-manifest.py` lists the wheel
- [ ] Each finish checked against the supplier render (colour, gloss, brushed/polished character)
- [ ] Rim page checked at phone, iPad and desktop sizes
- [ ] On-car layer test: one car, two wheels, three views, side by side with the reference at matching scale
- [ ] Rim face: chamfers and edge highlights visible; semi-gloss black not a mirror
- [ ] Tyre: right OEM size and overall diameter; deep-black matte; lettering crisp at 2x; no unverified brand name
- [ ] Brake: right disc size for the car; caliper with bolts and pads; colour recolours via the white/black pair
- [ ] Arch shadow and ground contact right; no seam between body and layer at 4x zoom
- [ ] Owner has approved the look **before** the full batch is started
- [ ] Full batch run with `progress.txt`; commit per wheel (only that wheel's files)

## E. Integration and verification

- [ ] `bun run lint` prints nothing; `bun run build` ends "built in"
- [ ] Secret grep clean (`sk-or-v1`, `forgedsa-lead-`, `INGEST` only in docs, never as values)
- [ ] `oncar.cjs` sheet for every car × the new wheels × 2 finishes
- [ ] `journey.cjs` phone + desktop: no failed step, no page error, no long task
- [ ] `responsive.cjs`: all pages × all devices pass
- [ ] `e2e.cjs`: every button and link works (writes to `leads` and `saved_configurations` intercepted)
- [ ] `swap-perf.cjs`: wheel swaps stay under the long-task limits; layers fall back to the live wheels when a combination is missing
- [ ] Summary page still and PDF use the same composite as the configurator

## F. Release

- [ ] PR opened (draft until E is ticked); description lists what changed and any migration
- [ ] Migrations applied **after** the code that needs them is deployed, and read back
- [ ] Squash-merged; deployed to Vercel from the merge SHA
- [ ] Live bundle contains something unique to the change; one live frame hash equals the local file's
- [ ] Live screenshots at phone and desktop size looked at
- [ ] Owner review page updated; verdicts read back
- [ ] `docs/CHECKPOINT.md` and the matching skill updated in the same PR (or the next)
- [ ] Work branch restarted from the new `main`

## G. When something goes wrong

- [ ] Container restarted: read `progress.txt`, check the dev server and `bpy`, re-run the same command (it resumes)
- [ ] Chromium certificate error: add the proxy CA to `$HOME/.pki/nssdb`; never disable TLS verification
- [ ] Out of memory on a dense car: `no_subdiv` in `CAR_FIXES`
- [ ] Two heavy jobs fighting for the 4 cores: stop one; Blender at `--threads 3`
- [ ] Something rendered looks wrong: find the symptom in the playbook's table (section 6) before changing settings

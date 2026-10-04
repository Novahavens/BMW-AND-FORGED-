# Checkpoint: photoreal cars and rims

**Last updated:** 2026-10-04 · **Branch:** `ccr-a49729da-y3hwoq` · **PR:** #9 (draft) · **To continue:** the
`forgedsa-resume` skill (`.claude/skills/forgedsa-resume/SKILL.md`) restores the tools, and this file says what is next.

## Goal of this phase (owner's words, condensed)
Two cars and at least two wheels each **perfectly done**: **M4 Competition** and **M5 (G90)**, with
**Twin-Y (FSA-12), Star 6 (FSA-13), Kyalami 15 (FSA-03), Turbine 25 (FSA-14)**. Everything else waits
here for later.

## How it works now (decided, keep)
| Surface | What renders it |
|---|---|
| Car body (configurator) | Blender Cycles images per car × view, recoloured per paint in the browser (`scripts/prerender/`, `components/journey/RenderedCarView.tsx`) |
| Wheels on the car | live engine, **2D photo/bar face** (`imageUrl`, `services/rimFaces.ts`), lit by the Blender studio HDR (`public/env/forgedsa_studio.hdr`) |
| Rim detail page | **Blender 360° spin**, 36 frames × 5 finishes (`scripts/rim3d/turntable.py` → `public/renders/rims/<id>/`, `RimSpinView.tsx`); live 3D only as a fallback |
| Finishes (spins) | `scripts/rim3d/finishes.json` + `materials.py`: Liquid Metal, Satin Bronze, Satin Gold, Gloss Black, Silver = brushed aluminium |
| Finishes (car) | `services/wheelFinish.ts` (Satin Gold live in Supabase on every wheel since 2026-10-04) |

## Status of the target set
| Item | M4 Competition | M5 G90 | Rim page spin |
|---|---|---|---|
| Body (Blender) | done | done | n/a |
| FSA-12 Twin-Y | done (on-car check) | done | done; Liquid Metal + Silver re-rendering |
| FSA-13 Star 6 | done | done | done; Liquid Metal + Silver re-rendering |
| FSA-03 Kyalami 15 | done | done | done; Liquid Metal + Silver re-rendering |
| FSA-14 Turbine 25 | done after fold fix | done after fold fix | done; Liquid Metal + Silver re-rendering |

On-car check sheets: `docs/rim-template/oncar/m4_g82.jpg`, `m5_g90.jpg` (made with `scripts/render/oncar.cjs`).

## Queue (do the top unchecked item; tick it when committed)
- [x] Spins for FSA-12, FSA-13, FSA-03, FSA-14 (all five finishes).
- [ ] Re-render Liquid Metal + Silver for those four (brighter chrome surround, plain barrel; review fixes):
      `rm -rf public/renders/rims/<id>/{liquid_metal,silver}` then `turntable.py <glb> public/renders/rims/<id> --frames 36
      --samples 10 --size 900x675 --only liquid_metal,silver`, then `spin-manifest.py`. Commit per wheel.
- (old note) One wheel per background job (2 h limit); turntable resumes.
      Commit each wheel's frames when its `spin.json` exists, then `python3 scripts/rim3d/spin-manifest.py`.
      GLBs to spin from: FSA-12 `build_rim.py docs/rim-template/fsa_12-spec.json` (has the spoke channel),
      FSA-13/14 `build_rim.py docs/rim-template/fsa_1N-spec.json`, FSA-03 `convert.sh <catalogue cut-out> forged_fsa_03`.
- [ ] Re-shoot the on-car sheets for Black (the two old grey shots: M4 front ¾, M5 wheel close-up) after the gloss fix.
- [ ] Ask the owner: keep Star 6 as the bar version, or send a front-on photo to trace it properly.
- [ ] Owner approval of the four spins → Supabase insert of FSA-12/13/14 (names, sizes, prices are PLACEHOLDERS
      copied from FSA-05) via `/admin` or a migration. Until then they exist only in the bundled catalogue.
- [ ] Rim page screenshots (phone + desktop) for the four wheels, two finishes each.

## Later (parked)
- Spins for the other catalogue wheels: FSA-01, 02, 06 have 3D rims ready to rebuild with `convert.sh` from their
  catalogue cut-outs; FSA-04, 05, 07, 08, 09 not built yet.
- **Photo 7** (champagne, forked spokes) may be a different design from the catalogue's 12-spoke Aldo Fork 15: ask.
- Cars: M4 Convertible and M5 Touring have no real 3D model (placeholder body); X3 M50's model has filled
  wheel arches. Paid models need the owner's OK.
- Summary page and PDF stills still come from the live WebGL car, not the Blender renders.
- Spin frames are in git (~12 MB per wheel). Before the full catalogue, move them to Supabase storage
  (and consider 720×540 or lazy preloading in `RimSpinView`).
- Not modelled on 3D rims: lip engraving, logos, milled channels on traced faces.

## Decisions log (so they aren't asked twice)
- Pre-rendered bodies instead of live WebGL cars (the GLB panels were dented; shader tweaks couldn't fix it).
- Free only: render on this CPU; no GPU rental, no paid APIs.
- Template rim: "High poly Rims" (CC-BY-4.0, credit in `docs/rim-template/PROFILE.md`), benchmark only.
- Silver in spins = brushed aluminium; Satin Gold measured from the client's photo (#c4aa7f).
- New wheels go live only after the owner approves their spin.

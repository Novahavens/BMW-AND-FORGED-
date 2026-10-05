# Checkpoint: photoreal cars and rims

**Last updated:** 2026-10-05 · **Branch:** `ccr-a49729da-y3hwoq` · **PR:** #9 (draft) · **To continue:** the
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
| FSA-12 Twin-Y | done (on-car check) | done | ✓ complete; brighter chrome, flat barrel |
| FSA-13 Star 6 | done | done | ✓ complete; brighter chrome, flat barrel |
| FSA-03 Kyalami 15 | done | done | ✓ complete; brighter chrome, flat barrel |
| FSA-14 Turbine 25 | done after fold fix | done after fold fix | ✓ complete; brighter chrome, flat barrel |

**Live since 2026-10-05:** FSA-12/13/14 are active in Supabase (migration `20261004180000_wheels_fsa_12_13_14_live.sql`)
with PLACEHOLDER names/sizes/prices from FSA-05. **Every active wheel (12) has a rim page spin**; FSA-01, 02, 04,
05, 06, 07, 08, 09 were added on 2026-10-05 (FSA-07 built from `public/rim-faces/forged_fsa_07.png`; FSA-09 rendered
with `turntable.py --resmooth`). Weakest matches: FSA-07 Dezzi Star, then FSA-04 Scribante 3P.

On-car check sheets for all five active cars: `docs/rim-template/oncar/{m4_g82,m3_g80,m3_touring_g81,m5_g90,m8_f92}.jpg`
(made with `scripts/render/oncar.cjs`; `PORT=` picks the dev server). Car body fixes in `scripts/prerender/render_car.py`
`CAR_FIXES`: M8 keeps only the Competition fender (four stacked variants z-fought), M3 has thin windscreen glass and
renders without subdivision (it needs >12.7 GB subdivided). Both re-rendered and live.

Responsive: `scripts/render/responsive.cjs` passes 180/180 (12 pages × 15 devices incl. iPad 834×1194 and 1366×1024).
Headless Chromium needs the proxy CA in `$HOME/.pki/nssdb` (`apt install libnss3-tools`, then `certutil -d sql:$HOME/.pki/nssdb
-A -t C,, -n agent-proxy -i /root/.ccr/agent-proxy-ca.crt`); without it Supabase fails and the app silently uses the
bundled catalogue.

**Owner review page:** https://claude.ai/artifact/XfokPgUT8rYWeJJKBy1UkT. Verdicts and notes land in its database,
collection `feedback` (doc ids `car_<carId>`, `rim_<wheelId>`, `details_<wheelId>`, `decision_star6`,
`decision_m3t_headlights`); read them with ArtifactData `list`.

## Queue (do the top unchecked item; tick it when committed)
- [x] Spins for FSA-12, FSA-13, FSA-03, FSA-14 (all five finishes).
- [x] Re-render Liquid Metal + Silver for those four (brighter chrome surround, plain barrel; review fixes).
      All four wheels completed with improved chrome reflections and consistent brushed barrel texture.
- [x] Owner approved the four spins; FSA-12/13/14 inserted into Supabase and live (placeholders).
- [x] Re-shot the on-car sheets (Black now reads black) and extended them to all five active cars.
- [x] Rim page screenshots: 4 wheels × 2 finishes × phone / iPad portrait / iPad landscape / desktop.
- [x] M8 fender and M3 windscreen fixed and re-rendered; tablet/phone responsive pass; spins for all 12 wheels.
- [ ] **Read the owner's answers** on the review page and work through every "Needs work" note.
- [ ] Real names, sizes and prices for FSA-12/13/14 (from the review page) → `/admin` or a migration, and mirror in `data/configuratorData.ts`.
- [ ] Owner decisions: Star 6 (keep, or front-on photo), M3 Touring black headlights (fix or leave), Aldo Fork 15 spoke count (photo 12 vs name 15).
- [ ] Optional: re-render all spins with `turntable.py --resmooth` for cleaner hub reflections.

## Later (parked)
- **Photo 7** (champagne, forked spokes) may be a different design from the catalogue's 12-spoke Aldo Fork 15: ask.
- Cars: M4 Convertible and M5 Touring have no real 3D model (placeholder body); X3 M50's model has filled
  wheel arches. Paid models need the owner's OK.
- Summary page and PDF stills still come from the live WebGL car, not the Blender renders.
- Spin frames are in git (~12 MB per wheel, 137 MB for 12). Before the full catalogue, move them to Supabase storage
  (and consider 720×540 or lazy preloading in `RimSpinView`).
- Not modelled on 3D rims: lip engraving, logos, milled channels on traced faces.

## Decisions log (so they aren't asked twice)
- Pre-rendered bodies instead of live WebGL cars (the GLB panels were dented; shader tweaks couldn't fix it).
- Free only: render on this CPU; no GPU rental, no paid APIs.
- Template rim: "High poly Rims" (CC-BY-4.0, credit in `docs/rim-template/PROFILE.md`), benchmark only.
- Silver in spins = brushed aluminium; Satin Gold measured from the client's photo (#c4aa7f).
- New wheels go live only after the owner approves their spin.

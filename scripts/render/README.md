# Render harness

Headless screenshots of the 3D engine, used to check every visual change (paint, studio, cars,
wheels, tyres, brakes) without a GPU. The full method is in
[`.claude/skills/3d-car-perfect/SKILL.md`](../../.claude/skills/3d-car-perfect/SKILL.md).

1. Start the dev server: `bunx vite --host 127.0.0.1 --port 5173`.
2. Write a shot list (JSON, see the header of `shoot.cjs`).
3. Run `node scripts/render/shoot.cjs <outDir> shots.json [rimCacheDir]`.

`engine.html` is the bare engine page. Its query parameters come from `data/configuratorData.ts`,
unfiltered, so hidden rows count:

- `car` is an index into `BMW_MODELS` (the bundled catalogue). The legacy cars were deleted on
  2026-11-11, so it holds only the four live cars: `0` m4_cs_g82, `1` m2_g87 (M2 CS), `2` m5_g90,
  `3` m5_touring_g99.
- `paint` is an index into `BMW_PAINTS`.
- `wheel` is a wheel **id** (preferred, the same ids `ingest-rim.mjs` takes: `forged_fsa001`,
  `forged_fsa002`, `forged_fsa_03`, `forged_fsa004`, `sixnine_ff1`, `sixnine_ff3`) or an index into
  `WHEEL_DESIGNS`, which holds only those six wheels in that order (`0`-`5`).
- `finish` (id), `size` (e.g. `21"`) and `view` (camera preset).

For ad-hoc GLBs it also takes `model`, `rot`, `len`, `paintMatch` and `hideMatch`; `rimModel=` and
`rimFlip=1` put a rim file on the chosen wheel; `rendered=1` uses the Blender body frames.

`look=` picks the scene. `look=stage` is what `/configure` draws for customers (a black backdrop and a
pool of light on a pale floor). `look=viewer` is the older grey viewer dome, kept for comparison.
Without `look=` the page draws the softbox studio. The other engine switches are `plates=0` and, in
the softbox studio only, `studio=hdri`, `tone=agx|neutral` and `exposure=` (the stage and viewer
looks set their own tone mapping and exposure). A shot's `q` field in `shoot.cjs` passes any of these
through.

Shots take about a minute each on SwiftShader. Judge colour and gloss on a real device as well.

`outlines.cjs` checks how rim photos turn into spoke outlines, in seconds rather than minutes. It
draws the processed mask with the traced outlines over it, once per settings variant (see its
header). Use it to compare settings before rendering wheel close-ups. `blank.html` is the empty
page it runs in.

`swap-perf.cjs` measures wheel swaps in the real configurator: it taps every wheel twice (and
changes the size twice) at desktop and phone sizes, and writes each tap's long tasks and the time
until the new spokes are in the scene to a JSON file (see its header; `cold` and `preload` modes).

## Rim thumbnails (`rim-thumbs.cjs`, `rim-thumbs-pack.py`)
The collection cards, the wheels step and the rim page label use thumbnails rendered from each rim's own GLB,
one per wheel and stocked finish (`public/rim-thumbs/<wheel>/<finish>.webp`, listed in `data/rimThumbs.json`).
`rim-thumbs.html` mounts the shared wheel viewer face-on on a transparent page with the configurator's finish
recipe; `node scripts/render/rim-thumbs.cjs [wheelId ...]` writes raw PNGs to `.scratch/rim-thumbs/`, then
`python3 scripts/render/rim-thumbs-pack.py` trims them and rewrites the manifest. Re-run both after a finish's
values change or a wheel/finish is added; a finish with no render falls back to the tinted photo.
`?hex=&metal=&rough=&coat=` on the harness page tries other finish values for comparison.

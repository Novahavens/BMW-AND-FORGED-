# Render harness

Headless screenshots of the 3D engine, used to check every visual change (paint, studio, cars,
wheels, tyres, brakes) without a GPU. The full method is in
[`.claude/skills/3d-car-perfect/SKILL.md`](../../.claude/skills/3d-car-perfect/SKILL.md).

1. Start the dev server: `bunx vite --host 127.0.0.1 --port 5173`.
2. Write a shot list (JSON, see the header of `shoot.cjs`).
3. Run `node scripts/render/shoot.cjs <outDir> shots.json [rimCacheDir]`.

`engine.html` is the bare engine page. Its query parameters are `car`, `paint`, `wheel` (indexes
into the bundled catalogue), `finish`, `size` and `view`. For ad-hoc GLBs it also takes `model`,
`rot`, `len`, `paintMatch` and `hideMatch`. Engine switches are `studio=hdri`, `tone=agx|neutral`,
`exposure=` and `photoreal=1`.

Shots take about a minute each on SwiftShader. Judge colour and gloss on a real device as well.

`outlines.cjs` checks how rim photos turn into spoke outlines, in seconds rather than minutes. It
draws the processed mask with the traced outlines over it, once per settings variant (see its
header). Use it to compare settings before rendering wheel close-ups. `blank.html` is the empty
page it runs in.

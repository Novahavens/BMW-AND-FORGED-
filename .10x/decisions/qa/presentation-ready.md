# QA: presentation-ready
- Before/after: six wheels, front-wheel view, M2 CS, stage look (shoot.cjs, SwiftShader).
- Strength sweep on Silver, Gloss Black, Liquid Metal: 0.08 / 0.14 / 0.2 / 0.35 / 0.6 / 1.0. 0.35+ washes Silver to white and Gloss Black to chrome; 0.1 chosen.
- All 16 wheel-and-finish pairs at 0.1: every finish reads as its coating (sheet docs/ingest/rims-stage-all-finishes.jpg).
- Body: three-quarter M2 CS and M5 with Gold, body look unchanged (the change only touches wheel materials).
- bun run lint (tsc + wheel-viewer hash) pass; vite build pass; journey.cjs phone + desktop: pass, exit 0, no overflow.
- Not tested: real GPU, real phone, the rim page (unchanged code path), the softbox studio look (falls back to the old path by design).

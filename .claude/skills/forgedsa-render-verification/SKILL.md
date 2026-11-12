---
name: forgedsa-render-verification
description: Take screenshots of the FORGEDSA configurator and 3D engine headlessly to verify visual changes (paint, lighting, cars, wheels, UI theme, PDF, emails) in a sandbox without a GPU. Covers the .scratch harness pages, Playwright + SwiftShader flags, routing Supabase storage through curl, contact sheets, and the pitfalls that wasted time before. Use before claiming any visual change works.
---

# Render verification (headless, no GPU)

Never report a visual change as done without looking at a render. The cloud container has no GPU:
headless renders use SwiftShader on CPU (about 50 s a shot), so never claim a real-GPU or phone result
from them.

## Dev server

```bash
cd /home/user/BMW-AND-FORGED-
rm -rf node_modules/.vite          # stale pre-bundles after `bun add` make pages hang
(setsid nohup npx vite --host 127.0.0.1 --port 5173 > "$SCRATCH/vite.log" 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 1; done
```

- `hmr` is off. Restart Vite after editing `vite.config.ts`.
- **Never run `pkill -f vite ...` in a command that also contains "vite"**: it kills its own shell
  (exit 144). Find PIDs with `pgrep -af bin/vite` and `kill` them in a separate call.

## Committed harness (`scripts/render/`)

- **`scripts/render/shoot.cjs <outDir> shots.json [rimCacheDir]`:** batch screenshots from a JSON
  shot list (`car`, `paint`, `wheel`, `finish`, `size`, `view`, `q`, `cam`).
  - `wheel` is a **wheel id** (`"forged_fsa002"`, preferred) or an index into the bundled
    `WHEEL_DESIGNS` list, which holds only the six stocked wheels `forged_fsa001`, `forged_fsa002`,
    `forged_fsa_03`, `forged_fsa004`, `sixnine_ff1`, `sixnine_ff3` (indexes 0-5; the legacy photo
    wheels were deleted on 2026-11-11). Use ids in shot lists. `car` is an index into `BMW_MODELS`,
    which holds only the four live cars: `0` (M4 CS), `1` (M2 CS), `2` (M5), `3` (M5 Touring). `q` appends raw params, e.g. `"&look=stage"` for what /configure shows.
  - It loads `scripts/render/engine.html`, routes Supabase storage to a local rim cache (curl
    fallback) and waits for `window.done`. Stock wheels are GLBs under `public/models/rims/` served
    by Vite, so they need no rim cache; the cache only matters for the hidden photo wheels.
  - Waits use `domcontentloaded` with long timeouts.
  - About 50 s per shot. See `scripts/render/README.md` and the `3d-car-perfect` skill.
- **App routes** (`/rims/<id>`, `/`): the CSS is built by Vite (Tailwind via PostCSS, `index.css`),
  so the page is styled offline. Only `ERR_CERT_AUTHORITY_INVALID` (sandbox network) errors are
  acceptable. (It used to need the Tailwind Play CDN routed to a local copy: that CDN is gone, and
  must stay gone: it compiled the CSS in every visitor's browser.)
- **Screenshot timeout:** pass `timeout: 180000` to `page.screenshot`. Continuous SwiftShader
  frames on big pages can exceed the default 30 s.

## Older harness pages (`.scratch/`, gitignored)

- **`scripts/render/engine.html?car=N&paint=N&wheel=<id|N>&finish=id&size=20"&view=frontThreeQuarter`**
  (the `.scratch/` copy is the same page): the bare engine. `car=N` indexes `STATIC_CATALOG.cars`,
  all 12 including hidden (live: 1, 5, 7, 8; `car=0` is the hidden M4 G82). `wheel=` takes a wheel id
  (preferred) or an index into the full `WHEEL_DESIGNS` list, hidden ones included (`wheel=0` is the
  hidden FSA-01, not a stock wheel). The page sets `window.done` when the car has loaded, and exposes `window.e`.
  Extra params: `rimModel=/path.glb` (+ `rimFlip=1` if the face points inward) puts a 3D rim file on
  the chosen wheel; `look=stage` draws the stage look that /configure uses for the live cars
  (`look=viewer` still draws the older grey viewer dome, for comparison only; with no `look=` the page
  is the softbox studio); `stagePeak=`, `stageRx=`, `stageRz=`, `stageOver=`, `stageRails=`,
  `stageRing=`, `stageFloorEnv=`, `stageExp=`, `stageParts=` override the stage's numbers for
  comparison renders; `plates=0` hides the "FORGED" plates; `model=`, `rot=`, `len=`, `paintMatch=`, `hideMatch=` for
  ad-hoc car GLBs; `tone=agx|neutral`, `studio=hdri`, `exposure=`, `photoreal=1`.
- **`.scratch/pdf-test.html`:** builds a brochure with `downloadBrochurePdf`. Load it through a
  route that maps `https://forged-configurator.vercel.app/**` to the dev server, so the PDF prints
  live URLs, not 127.0.0.1.
- Full journeys: a Playwright script that clicks Enter → steps → View your … → Share. There is no
  showroom, so no Build or Confirm click: Enter opens the configurator on the car on stage. Button
  names change with the catalogue (e.g. wheel names), so update the selectors.

## Playwright setup

- `require('/opt/node22/lib/node_modules/playwright')` with
  `executablePath: '/opt/pw-browsers/chromium'`. Never run `playwright install`.
- WebGL flags: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- The sandbox browser **cannot fetch Supabase storage** (rim PNGs fail as "Failed to load custom 2D
  wheel texture"). This only matters for the hidden photo wheels; the six stocked wheels are GLB
  rims (`modelUrl`) served by the dev server. Route storage requests through curl:
  ```js
  await p.route(/supabase\.co\/storage\//, r => { const u = r.request().url();
    const body = require('child_process').execFileSync('curl', ['-sSL', u], { maxBuffer: 64 << 20 });
    r.fulfill({ body, contentType: u.endsWith('.png') ? 'image/png' : 'application/octet-stream',
                headers: { 'access-control-allow-origin': '*' } }); });
  ```
- Whole journey, both sizes: `node scripts/render/journey.cjs <out> <rimCache> both` (`visual-qa`).
  It goes welcome → Enter (straight into the configurator) → wheels step → three wheels → size →
  finish → summary, and waits for the boot overlay by its opacity (the overlay fades to opacity 0 and
  stays in the page, which Playwright does not count as hidden).
- The other journey scripts: `pdf-check.cjs` and `swap-perf.cjs` no longer click Build / Confirm;
  `responsive.cjs` no longer records a showroom page; `car-switch.cjs` drives the viewer panel's car
  chips, so it needs `BASE` to end in `?panel=viewer`. **`e2e.cjs` still walks the showroom and has not
  been updated**: its journey section still expects `/models`, a Build button and the old menu.
- **The current gate before claiming a visual change is done:** `journey.cjs` at both sizes,
  `node scripts/render/pdf-check.cjs <out>` (brochure, writes stubbed), and `shoot.cjs` sheets of
  the six stocked wheels (by id) on the live cars with `"q": "&look=stage"`. `qa-matrix.py` and
  `wheel-qa.cjs` cover the hidden photo wheels only.
- The rim page (`/rims/<id>`) is the wheel studio (`shared/wheel-viewer/WheelStudio.tsx`), not the engine: a
  finish or rim-file change that shows there needs its own screenshot of that page. Its root element
  carries `data-studio-state` (`loading`, `ready`, `error`, or `photo` for a wheel without a model).

## Reviewing output

- Build contact sheets with PIL. **Crop from the full-size PNG in full-size coordinates.** Earlier
  crops went wrong because positions were read off a downscaled sheet with a column offset.
- Render PDFs to PNG with `pypdfium2` (`pip install pypdfium2`); pdftoppm and fitz aren't
  installed.
- Compare before and after at the same view, paint and viewport.

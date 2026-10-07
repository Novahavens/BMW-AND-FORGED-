/**
 * Traces a rim cut-out (or a prepared face mask) into spoke outlines with the engine's own code
 * (wheelKit.processRimPhoto: symmetry folding, arm tracing, edge regularising; then
 * rimExtrusion.traceMaskShapes), and writes them as JSON for scripts/rim3d/build_rim.py --shapes.
 *
 *   bunx vite --host 127.0.0.1 --port 5173                       # dev server, in another shell
 *   node scripts/rim3d/trace-mask.cjs <photo.png|/served/path.png> <out.json> [--mask] [--res 1024]
 *
 * --mask: the input is already a clean face mask (public/rim-faces), not a photo.
 * --opts '{"straightArms":false}': per-wheel RimPhotoOptions (see services/rimFaces.ts RIM_FACE_OPTIONS), merged with cleanFace.
 * --smooth N (10) / --tol T (1.6): outline smoothing and simplification, in mask pixels; higher = cleaner edges.
 * Coordinates: rim-plane units, radius 1 = the photo's rim circle, y up.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2); const flags = new Set(args.filter((x) => x.startsWith('--')));
const [input, out] = args.filter((x, i) => !x.startsWith('--') && !['--res', '--smooth', '--tol', '--opts'].includes(args[i - 1]));
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const optsArg = args.indexOf('--opts') >= 0 ? JSON.parse(args[args.indexOf('--opts') + 1]) : {};
const res = num('--res', 1024), smooth = num('--smooth', 10), tol = num('--tol', 1.6);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  let url = input;
  if (fs.existsSync(input)) {
    url = 'https://local.rim/' + path.basename(input);
    await p.route(/local\.rim\//, (r) => r.fulfill({ body: fs.readFileSync(input), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }));
  } else if (input.startsWith('/')) url = 'http://127.0.0.1:5173' + input;
  await p.goto('http://127.0.0.1:5173/scripts/render/blank.html', { waitUntil: 'domcontentloaded', timeout: 240000 });
  const result = await p.evaluate(async ({ url, res, clean, smooth, tol, opts }) => {
    const kit = await import('/services/wheelKit.ts');
    const rx = await import('/services/rimExtrusion.ts');
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    const m = kit.processRimPhoto(img, res, { ...opts, cleanFace: clean });
    if (!m) return { error: 'not a usable cut-out' };
    const shapes = rx.traceMaskShapes(m.data, m.size, m.size, 0.5, tol, smooth) || [];
    const pts = (c) => c.getPoints(8).map((q) => [+q.x.toFixed(5), +q.y.toFixed(5)]);
    return { symmetry: m.symmetry, mode: m.mode, size: m.size, shapes: shapes.map((s) => ({ outer: pts(s), holes: s.holes.map(pts) })) };
  }, { url, res, clean: flags.has('--mask'), smooth, tol, opts: optsArg });
  await b.close();
  if (result.error) { console.error(result.error); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify(result));
  console.log(`${input}: fold ${result.symmetry} (${result.mode}), ${result.shapes.length} shape(s), ${result.shapes.reduce((n, s) => n + s.holes.length, 0)} holes -> ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });

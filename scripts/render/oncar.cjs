/**
 * What the customer sees in the configurator, rendered headlessly: the Blender body for a car and
 * view, recoloured with a paint (as RenderedCarView does), with the live engine's wheels on top
 * from the same camera (CarConfiguratorEngine.setRenderedBody).
 *
 *   bunx vite --host 127.0.0.1 --port 5173      # dev server, in another shell
 *   node scripts/render/oncar.cjs <outDir> '<json list of shots>' [rimCacheDir]
 *   shot: {"car": 0, "carId": "m4_g82", "wheel": 9, "paint": 16, "finish": "silver", "view": "frontWheel", "size": "20\""}
 * car / wheel / paint are bundled-catalogue indexes (scripts/render/engine.html). Writes <name>.png.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const [,, OUT, shotsArg, RIMS = ''] = process.argv;
const shots = JSON.parse(shotsArg);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const s of shots) {
    const name = `${s.carId}-${s.wheel}-${s.finish}-${s.view}`;
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); // the render aspect (1.6)
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.route(/supabase\.co\/storage\//, (r) => {
      const u = r.request().url(); const local = path.join(RIMS, path.basename(u.split('?')[0]));
      const body = RIMS && fs.existsSync(local) ? fs.readFileSync(local) : cp.execFileSync('curl', ['-sSL', u], { maxBuffer: 256 << 20 });
      r.fulfill({ body, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
    });
    const q = new URLSearchParams({ car: s.car, wheel: s.wheel, paint: s.paint ?? 0, finish: s.finish, size: s.size || '20"', view: s.view, rendered: '1', bg: 'transparent' });
    await p.goto(`http://127.0.0.1:${process.env.PORT || 5173}/scripts/render/engine.html?${q}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.waitForFunction(() => window.done !== undefined, null, { timeout: 300000 });
    await p.waitForTimeout(9000); // rim face worker, HDR, shadows
    await p.screenshot({ path: path.join(OUT, name + '-wheels.png'), omitBackground: true, timeout: 120000 });
    await p.close();
    cp.execFileSync('python3', [path.join(__dirname, 'oncar.py'), path.join(OUT, name + '-wheels.png'), s.carId, s.view, String(s.paintHex), s.paintType || 'Metallic', path.join(OUT, name + '.png')]);
    console.log(name);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

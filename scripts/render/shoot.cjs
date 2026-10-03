/**
 * Headless render harness for the 3D engine (see .claude/skills/3d-car-perfect).
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/shoot.cjs <outDir> <specs.json> [rimCacheDir]
 *
 * specs.json is a list of shots:
 *   { "name": "m4-wheel", "car": 0, "paint": 17, "wheel": 2, "finish": "black", "size": "20\"",
 *     "view": "frontWheel", "q": "&tone=agx", "w": 1280, "h": 800, "wait": 6000,
 *     "cam": { "pos": [x, y, z], "look": [x, y, z] } }
 * car / paint / wheel are indexes into the bundled catalogue (data/configuratorData.ts).
 *
 * Uses the sandbox Chromium with SwiftShader (no GPU): about a minute per shot. Rim photos from
 * Supabase storage are served from [rimCacheDir] when present (curl otherwise), because the
 * sandbox browser can't reach storage directly.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const [,, out, specFile, rimDir] = process.argv;
const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const RIMS = rimDir || path.join(path.dirname(specFile), 'rims');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  fs.mkdirSync(out, { recursive: true });
  for (const s of specs) {
    const p = await b.newPage({ viewport: { width: s.w || 1280, height: s.h || 800 } });
    const errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    await p.route(/supabase\.co\/storage\//, r => {
      const u = r.request().url();
      const local = path.join(RIMS, path.basename(u.split('?')[0]));
      let body;
      if (fs.existsSync(local)) body = fs.readFileSync(local);
      else body = cp.execFileSync('curl', ['-sSL', u], { maxBuffer: 256 << 20 });
      r.fulfill({ body, contentType: u.includes('.png') ? 'image/png' : 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
    });
    const q = new URLSearchParams({ car: s.car ?? 0, paint: s.paint ?? 0, wheel: s.wheel ?? 0, finish: s.finish || 'liquid_metal', size: s.size || '20"', view: s.view || 'frontThreeQuarter' });
    const url = `http://127.0.0.1:5173/scripts/render/engine.html?${q}${s.q || ''}`;
    const t0 = Date.now();
    await p.goto(url, { timeout: 240000, waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.done, null, { timeout: 300000 });
    if (s.cam) {
      await p.evaluate(({ pos, look }) => {
        const e = window.e;
        e.targetLookAt.set(...look); e.currentLookAt.set(...look);
        e.targetCameraPos.set(...pos);
        const o = e.targetCameraPos.clone().sub(e.targetLookAt);
        const r = o.length();
        e.targetSpherical = { radius: r, theta: Math.atan2(o.x, o.z), phi: Math.acos(o.y / r) };
        e.spherical = { ...e.targetSpherical };
        e.zoomRange = { min: 0.2, max: 20 };
        e.updateCameraTransform();
      }, s.cam);
    }
    if (s.eval) await p.evaluate(s.eval);
    await p.waitForTimeout(s.wait || 4000);
    await p.screenshot({ path: path.join(out, s.name + '.png'), timeout: 180000 });
    console.log(s.name, ((Date.now() - t0) / 1000).toFixed(0) + 's', errs.length ? JSON.stringify(errs.slice(0, 4)) : '');
    await p.close();
  }
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

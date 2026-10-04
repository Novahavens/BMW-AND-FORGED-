/**
 * Layer renderer for the 2D "swap the whole wheel" configurator (see docs/WHEEL_SPRITES.md).
 *
 *   bunx vite --host 127.0.0.1 --port 5173
 *   node scripts/render/layers.cjs <outDir> '{"car":3,"paint":16,"view":"side","size":"20\""}' [rimCacheDir]
 *
 * Renders, with a transparent background and one fixed camera:
 *   plate.png   the car with all four wheel assemblies hidden
 *   wheels.png  the wheel assemblies alone (tyre, disc, caliper, barrel, lip) with the spokes, hub
 *               and cap hidden: the layer that sits behind a rim photo
 *   full.png    the normal 3D render, for comparison
 *   layout.json per near-side wheel: centre of the rim lip face and its two projected axes, in pixels
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, out, specJson, rimDir = ''] = process.argv;
const s = JSON.parse(specJson || '{}');
const W = s.w || 1600, H = s.h || 900;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  fs.mkdirSync(out, { recursive: true });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.route(/supabase\.co\/storage\//, r => {
    const f = path.join(rimDir, path.basename(r.request().url().split('?')[0]));
    if (fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); else r.abort();
  });
  const q = new URLSearchParams({ car: s.car ?? 0, paint: s.paint ?? 0, wheel: s.wheel ?? 0, finish: s.finish || 'liquid_metal', size: s.size || '20"', view: s.view || 'side', bg: 'transparent' });
  await p.goto(`http://127.0.0.1:5173/scripts/render/engine.html?${q}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForFunction(() => window.done, null, { timeout: 300000 });
  await p.waitForTimeout(s.wait || 6000);
  const shot = async (name) => { await p.evaluate(() => { window.e.requestRender(3); }); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, name), omitBackground: true }); };
  await shot('full.png');
  const layout = await p.evaluate(() => {
    const e = window.e, cam = e.camera, THREE_V = e.camera.position.constructor;
    cam.updateMatrixWorld(true);
    const proj = (v) => { const t = v.clone().project(cam); return [(t.x * 0.5 + 0.5) * innerWidth, (-t.y * 0.5 + 0.5) * innerHeight]; };
    return e.wheelAssemblies.filter(a => a.isRight).map(a => {
      a.group.updateMatrixWorld(true);
      const rimS = a.dims.rimScale, lipX = a.dims.tyreWidth / 2 - 0.012, R = 0.262 * rimS;
      const P = (x, y, z) => proj(a.group.localToWorld(new THREE_V(x, y, z)));
      return { front: a.isFront, rimScale: rimS, tyreWidth: a.dims.tyreWidth, c: P(lipX, 0, 0), up: P(lipX, R, 0), dn: P(lipX, -R, 0), fw: P(lipX, 0, R), bk: P(lipX, 0, -R), tyreTop: P(0, a.dims.tyreRadius, 0) };
    });
  });
  fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify({ w: W, h: H, wheels: layout }, null, 1));
  await p.evaluate(() => { const e = window.e; e.wheelsGroup.visible = false; });
  await shot('plate.png');
  await p.evaluate(() => {
    const e = window.e; e.wheelsGroup.visible = true; e.bodyMeshGroup.visible = false;
    e.wheelAssemblies.forEach(a => { a.spokeMeshGroup.visible = false; a.hub.visible = false; a.group.visible = a.isRight; });
  });
  await shot('wheels.png');
  await b.close();
})();

/**
 * Renders the layers for the 2D wheel stage (see docs/WHEEL_STAGE.md) for one car.
 *
 *   bunx vite --host 127.0.0.1 --port 5173
 *   node scripts/render/build-stage.cjs <rawDir> <carIndex> <paintIndexes|all> <sizes> [view]
 *   e.g. node scripts/render/build-stage.cjs /tmp/raw 3 16,7 '19",20",21",22"'
 *   then python3 scripts/render/pack-stage.py <rawDir> <carId>
 *
 * Per car it writes, at 2x pixel ratio and a transparent background, from one fixed camera:
 *   <paintId>.png       the car with all wheel assemblies hidden (one per paint)
 *   wheels-<size>.png   the near-side tyres, discs, calipers and barrels, with the spokes and hub
 *                       hidden and the car body occluding them exactly (depth only), one per rim size
 *   layout.json         per size and axle: the centre and semi-axes of the rim lip ellipse, in pixels
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, raw, carIdx, paintArg, sizeArg, view = 'side'] = process.argv;
const W = 1600, H = 900, DSF = 2;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://127.0.0.1:5173/scripts/render/engine.html?car=${carIdx}&paint=0&wheel=0&view=${view}&bg=transparent`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForFunction(() => window.done, null, { timeout: 300000 });
  await p.waitForTimeout(6000);
  const meta = await p.evaluate(() => {
    const cat = window.__catalog;
    return null;
  });
  const info = await p.evaluate(async () => {
    const { STATIC_CATALOG } = await import('/services/catalogService.ts');
    return { car: STATIC_CATALOG.cars[+new URLSearchParams(location.search).get('car')].id, paints: STATIC_CATALOG.paints.map((x) => x.id) };
  });
  const carId = info.car;
  const dir = path.join(raw, carId); fs.mkdirSync(dir, { recursive: true });
  const paints = paintArg === 'all' ? info.paints.map((_, i) => i) : paintArg.split(',').map(Number);
  const sizes = sizeArg.split(',');
  const shot = async (name) => { await p.evaluate(() => window.e.requestRender(4)); await p.waitForTimeout(1800); await p.screenshot({ path: path.join(dir, name), omitBackground: true }); };
  const layout = { carId, w: W * DSF, h: H * DSF, sizes: {} };
  for (const size of sizes) {
    await p.evaluate((s) => window.e.setRimSize(s), size);
    await p.waitForTimeout(2500);
    layout.sizes[size] = await p.evaluate((dsf) => {
      const e = window.e, cam = e.camera, V = cam.position.constructor; cam.updateMatrixWorld(true);
      const proj = (v) => { const t = v.clone().project(cam); return [(t.x * 0.5 + 0.5) * innerWidth * dsf, (-t.y * 0.5 + 0.5) * innerHeight * dsf]; };
      const out = {};
      e.wheelAssemblies.filter((a) => a.isRight).forEach((a) => {
        a.group.updateMatrixWorld(true);
        const R = 0.262 * a.dims.rimScale, lipX = a.dims.tyreWidth / 2 - 0.012;
        const P = (x, y, z) => proj(a.group.localToWorld(new V(x, y, z)));
        const c = P(lipX, 0, 0), up = P(lipX, R, 0), dn = P(lipX, -R, 0), fw = P(lipX, 0, R), bk = P(lipX, 0, -R);
        out[a.isFront ? 'front' : 'rear'] = { cx: c[0], cy: c[1], rx: Math.abs(fw[0] - bk[0]) / 2, ry: Math.abs(up[1] - dn[1]) / 2 };
      });
      return out;
    }, DSF);
    // wheels layer: body hidden in colour but still occluding; spokes, hub and left-hand wheels off
    await p.evaluate(() => {
      const e = window.e; window.__saved = [];
      e.bodyMeshGroup.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => { window.__saved.push([m, m.colorWrite]); m.colorWrite = false; }); });
      e.wheelAssemblies.forEach((a) => { a.spokeMeshGroup.visible = false; a.hub.visible = false; a.group.visible = a.isRight; });
    });
    await shot(`wheels-${size.replace('"', '')}.png`);
    await p.evaluate(() => {
      const e = window.e; window.__saved.forEach(([m, v]) => (m.colorWrite = v));
      e.wheelAssemblies.forEach((a) => { a.spokeMeshGroup.visible = true; a.hub.visible = true; a.group.visible = true; });
    });
    console.log('wheels', size);
  }
  await p.evaluate(() => { window.e.wheelsGroup.visible = false; });
  for (const i of paints) {
    await p.evaluate(async (i) => { const { STATIC_CATALOG } = await import('/services/catalogService.ts'); window.e.applyPaintColor(STATIC_CATALOG.paints[i]); }, i);
    await p.waitForTimeout(1500);
    await shot(`${info.paints[i]}.png`);
    console.log('plate', info.paints[i]);
  }
  fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(layout, null, 1));
  await b.close();
})();

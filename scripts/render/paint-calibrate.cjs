/**
 * Solves each paint's base colour (paints.hex) so the M4's front door in the side view renders as the
 * target colour: the door colour BMW's own renders show (docs/bmw-factory-paints.md, "Recalibration").
 * Re-run after any change to the studio, tone mapping, exposure or paint finish values, since each of
 * those changes what a given base colour looks like.
 *
 *   bunx vite --host 127.0.0.1 --port 5173      # dev server, in another shell
 *   node scripts/render/paint-calibrate.cjs <targets.json> <out.json> [port]
 *
 * Solves under the neutral HDRI studio (?studio=hdri), the lighting the targets were calibrated in: the
 * base colour is a property of the paint, and the app's white softbox studio then lights it.
 *
 * targets.json maps a BMW paint code to a displayed sRGB door colour, e.g. { "C68": [108, 9, 21] }.
 * The base colour is iterated per channel in linear light (7 rounds), which converges to about
 * 1 ΔE00 unless a colour is out of reach. Writes { code: { id, hex, measured, target } }. SwiftShader at
 * 500x320: a few seconds a paint.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [targetsFile, outFile, port = '5173'] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
  });
  const p = await b.newPage({ viewport: { width: 500, height: 320 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(`http://127.0.0.1:${port}/scripts/render/paint-door.html?studio=hdri&w=500&h=320`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForFunction('window.done', null, { timeout: 300000 });
  await wait(20000); // studio and contact shadow settle
  const targets = JSON.parse(fs.readFileSync(targetsFile, 'utf8'));
  const res = await p.evaluate((targets) => {
    const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const l2s = (c) => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
    const hex = (lin) => '#' + lin.map((c) => Math.round(l2s(c) * 255).toString(16).padStart(2, '0')).join('');
    const out = {};
    window.door();
    for (const pt of window.paints) {
      const tgt = targets[pt.code];
      if (!tgt) continue;
      const tl = tgt.map(s2l);
      let lin = [1, 3, 5].map((i) => s2l(parseInt(pt.hex.slice(i, i + 2), 16)));
      for (let it = 0; it < 7; it++) {
        window.e.applyPaintColor({ ...pt, hex: hex(lin) });
        window.door();
        const ml = window.door().rgb.map(s2l);
        lin = lin.map((c, i) => Math.min(1, Math.max(0.0003, c * Math.pow((tl[i] + 0.0005) / (ml[i] + 0.0005), 0.9))));
      }
      window.e.applyPaintColor({ ...pt, hex: hex(lin) });
      window.door();
      out[pt.code] = { id: pt.id, hex: hex(lin), measured: window.door().rgb, target: tgt };
    }
    return out;
  }, targets);
  fs.writeFileSync(outFile, JSON.stringify(res, null, 1));
  console.log('solved', Object.keys(res).length);
  await b.close();
})();

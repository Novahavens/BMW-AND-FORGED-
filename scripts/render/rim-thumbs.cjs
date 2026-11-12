/**
 * Catalogue thumbnails of the rims, rendered from their own 3D files (one per wheel and finish), so the cards
 * show the barrel's depth through the spokes and the real finish instead of a tinted product photo.
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/rim-thumbs.cjs [wheelId ...]   # all wheels in data/configuratorData.ts when none given
 *   python3 scripts/render/rim-thumbs-pack.py          # trims, sizes and writes public/rim-thumbs/ + the manifest
 *
 * Raw PNGs (transparent background) go to .scratch/rim-thumbs/. Uses SwiftShader (no GPU): about 30-60 s a shot.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '../../.scratch/rim-thumbs');
let src;
try {
  src = fs.readFileSync(path.join(__dirname, '../../data/configuratorData.ts'), 'utf8');
} catch (e) {
  console.error(`cannot read the catalogue: ${e.message}`);
  process.exit(1);
}
// wheel ids and their finishes, read from the bundled catalogue (the same rows as Supabase)
const wheels = [...src.matchAll(/id: '([a-z0-9_]+)',\n\s+code:[\s\S]*?availableVariants: \[([^\]]*)\]/g)]
  .map((m) => ({ id: m[1], finishes: [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) }));
const only = process.argv.slice(2);
(async () => {
  if (!wheels.length) throw new Error('no wheels found in data/configuratorData.ts (has its layout changed?)');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const failed = [];
  try {
    for (const w of wheels.filter((w) => !only.length || only.includes(w.id))) {
      for (const f of w.finishes) {
        const p = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
        p.on('pageerror', (e) => console.log('  pageerror', e.message));
        const t0 = Date.now();
        try {
          await p.goto(`http://127.0.0.1:5173/scripts/render/rim-thumbs.html?wheel=${w.id}&finish=${f}`, { timeout: 240000 });
          await p.waitForSelector('canvas', { timeout: 240000 });
          await p.waitForFunction(() => !document.querySelector('.wv-spin'), null, { timeout: 300000 });
          await p.waitForTimeout(4000); // the camera settles and the shadow map is drawn
          await p.screenshot({ path: path.join(OUT, `${w.id}__${f}.png`), omitBackground: true });
          console.log(`${w.id} ${f} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        } catch (e) {
          failed.push(`${w.id}/${f}`);
          console.error(`${w.id} ${f} FAILED: ${e.message.split('\n')[0]} (is the dev server running on :5173?)`);
        } finally {
          await p.close();
        }
      }
    }
  } finally {
    await b.close();
  }
  if (failed.length) {
    console.error(`${failed.length} render(s) failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

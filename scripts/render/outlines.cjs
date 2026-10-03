/**
 * Spoke-outline check for photo wheels (see .claude/skills/3d-car-perfect, step 4).
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/outlines.cjs <rimCacheDir> <outDir> '<variants.json>' [nameFilter]
 *
 * For every cached rim photo in <rimCacheDir> (file names as in Supabase storage), runs
 * processRimPhoto + traceMaskShapes once per variant and writes <outDir>/<photo>-<name>.png:
 * the mask in grey with the traced outlines drawn over it at 2x (red = outer, yellow = holes).
 * A variant is { "name": "a", "res": 1536, "quantile": 0.5, "radialSigma": 8, "smooth": 4,
 * "tol": 2.0, "cleanFace": false }; omitted fields use the engine defaults. Takes seconds per photo, so compare
 * settings here before rendering close-ups.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, RIMS, OUT, variantsArg, only = ''] = process.argv;
const variants = JSON.parse(variantsArg || '[{"name":"default"}]');
const STORAGE = 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  await p.route(/supabase\.co\/storage\//, (r) => r.fulfill({
    body: fs.readFileSync(path.join(RIMS, path.basename(r.request().url()))),
    contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' }
  }));
  await p.goto('http://127.0.0.1:5173/scripts/render/blank.html', { waitUntil: 'domcontentloaded', timeout: 240000 });
  const files = fs.readdirSync(RIMS).filter((f) => f.endsWith('.png') && f.includes(only)).sort();
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of files) {
    const res = await p.evaluate(async ({ url, variants }) => {
      const kit = await import('/services/wheelKit.ts');
      const rx = await import('/services/rimExtrusion.ts');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await img.decode();
      const out = [];
      let fold = 1, mode = '';
      for (const v of variants) {
        const t0 = performance.now();
        const m = kit.processRimPhoto(img, 1024, v);
        if (!m) { out.push({ name: v.name, error: 'not a usable cut-out' }); continue; }
        fold = m.symmetry;
        mode = m.mode;
        const t1 = performance.now();
        const shapes = rx.traceMaskShapes(m.data, m.size, m.size, 0.5, v.tol ?? 2.0, v.smooth ?? 6) || [];
        const ms = `${Math.round(t1 - t0)}+${Math.round(performance.now() - t1)}ms`;
        const S = m.size * 2;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        const id = new ImageData(m.size, m.size);
        for (let i = 0; i < m.data.length; i++) {
          const k = 40 + m.data[i] * 120;
          id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = k;
          id.data[i * 4 + 3] = 255;
        }
        const tmp = document.createElement('canvas');
        tmp.width = tmp.height = m.size;
        tmp.getContext('2d').putImageData(id, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(tmp, 0, 0, S, S);
        const half = m.size / 2;
        let verts = 0;
        const draw = (pts, colour) => {
          g.beginPath();
          pts.forEach((pt, i) => {
            const x = (pt.x * half + half) * 2, y = (-pt.y * half + half) * 2;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          });
          g.closePath();
          g.strokeStyle = colour;
          g.lineWidth = 2;
          g.stroke();
          verts += pts.length;
        };
        for (const sh of shapes) {
          draw(sh.getPoints(), '#ff3b30');
          sh.holes.forEach((h) => draw(h.getPoints(), '#ffd60a'));
        }
        out.push({ name: v.name, ms, verts, url: c.toDataURL('image/png') });
      }
      return { fold, mode, out };
    }, { url: STORAGE + f, variants });
    for (const o of res.out) {
      if (o.url) fs.writeFileSync(path.join(OUT, `${path.basename(f, '.png')}-${o.name}.png`), Buffer.from(o.url.split(',')[1], 'base64'));
    }
    console.log(f, 'fold', res.fold, res.mode, res.out.map((o) => o.error ? `${o.name}: ${o.error}` : `${o.name}: ${o.verts} pts ${o.ms}`).join(' | '));
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

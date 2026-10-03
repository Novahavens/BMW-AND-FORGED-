/**
 * Wheel quality check, part 1: the 3D spoke face of every photo wheel, measured (no rendering).
 * See .claude/skills/wheel3d and .claude/skills/visual-qa.
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/wheel-qa.cjs <rimCacheDir> <outDir> [nameFilter]
 *
 * For each cached rim photo (file names as in Supabase storage; a prepared face mask from
 * services/rimFaces.ts is used when the wheel has one), it builds the spoke mask and outlines
 * exactly as the engine does and checks:
 *
 * - pieces:     the face is one connected piece (lip + spokes + hub); floating islands = fail
 * - holes:      the windows come in whole sets of the symmetry (fold); otherwise a window is
 *               broken or merged
 * - symmetry:   the mask matches itself turned by one sector (IoU >= 0.97)
 * - ragged:     window outlines are no longer than 5% over a smoothed copy of themselves
 * - wiggle:     no nicks, steps or wobbles: an outline turns no more than 15° at an 8 px scale
 *               beyond what it turns at a 48 px scale (corners, however sharp, turn the same at
 *               both; a step turns there and back). The live wheels before the edge clean-up
 *               scored 17-113°; clean ones score 0-3°
 * - thinnest:   no spoke is thinner than 3 mm between the hub and the lip (measured across
 *               the spoke, from its edges)
 *
 * Writes <outDir>/wheel-qa.json and one overlay PNG per wheel (outlines over the mask; windows that fail the wiggle check in magenta), and
 * prints a PASS/FAIL table. Exit code 1 if any wheel fails.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, RIMS, OUT, only = ''] = process.argv;
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
  const results = [];
  for (const f of files) {
    const id = f.replace(/-\d+\.png$/, '').replace(/\.png$/, '');
    const r = await p.evaluate(async ({ url, id, WF, WC }) => {
      const kit = await import('/services/wheelKit.ts');
      const rx = await import('/services/rimExtrusion.ts');
      const { RIM_FACE_MASKS, RIM_FACE_OPTIONS } = await import('/services/rimFaces.ts');
      const face = RIM_FACE_MASKS[id];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = face || url;
      await img.decode();
      const m = kit.processRimPhoto(img, 1024, { ...(RIM_FACE_OPTIONS[id] || {}), cleanFace: !!face });
      if (!m) return { error: 'not a usable cut-out' };
      const n = m.size, half = n / 2;
      // engine settings (CarConfiguratorEngine.loadRimFace)
      const shapes = rx.traceMaskShapes(m.data, n, n, 0.5, 2.0, 6) || [];
      const area = (pts) => {
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], c = pts[(i + 1) % pts.length];
          s += a.x * c.y - c.x * a.y;
        }
        return Math.abs(s / 2);
      };
      // windows that survive the engine's pin-hole filter (area in rim-plane units, radius 1)
      const k = 1 / kit.FACE_FRACTION;
      const holes = [];
      for (const sh of shapes) for (const h of sh.holes) {
        const pts = h.getPoints();
        if (area(pts) * k * k > 0.003) holes.push(pts);
      }
      // pieces bigger than a speck (the engine drops nothing here, so islands show on the car)
      const pieces = shapes.filter((sh) => area(sh.getPoints()) > 0.0005).length;
      // raggedness: perimeter over the perimeter of a smoothed copy
      const perim = (pts) => pts.reduce((s, a, i) => s + Math.hypot(pts[(i + 1) % pts.length].x - a.x, pts[(i + 1) % pts.length].y - a.y), 0);
      const smooth = (pts, w) => pts.map((_, i) => {
        let x = 0, y = 0;
        for (let d = -w; d <= w; d++) { const q = pts[(i + d + pts.length) % pts.length]; x += q.x; y += q.y; }
        return { x: x / (2 * w + 1), y: y / (2 * w + 1) };
      });
      const resample = (pts, step) => {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], c = pts[(i + 1) % pts.length];
          const L = Math.hypot(c.x - a.x, c.y - a.y), s = Math.max(1, Math.ceil(L / step));
          for (let t = 0; t < s; t++) out.push({ x: a.x + (c.x - a.x) * t / s, y: a.y + (c.y - a.y) * t / s });
        }
        return out;
      };
      let ragged = 0, wiggle = 0;
      const wiggly = new Set();
      // total turning along an outline, its direction measured with chords of h samples (2 px
      // each) at every sample: a corner spreads over h samples, so no single step wraps round
      const turning = (pts, h) => {
        let T = 0;
        const head = (i) => { const a2 = pts[i % pts.length], c2 = pts[(i + h) % pts.length]; return Math.atan2(c2.y - a2.y, c2.x - a2.x); };
        for (let i = 0; i < pts.length; i++) {
          let d = head(i + 1) - head(i);
          d = Math.atan2(Math.sin(d), Math.cos(d));
          T += Math.abs(d);
        }
        return T;
      };
      for (const h of holes) {
        // small windows (lug-side slots) are skipped: smoothing shortens any small round outline
        if (perim(h) * half < 300) continue;
        const rs = resample(h, 2 / half);
        const ratio = perim(rs) / Math.max(1e-9, perim(smooth(rs, 6)));
        ragged = Math.max(ragged, ratio - 1);
        // wiggle: turning at an 8 px scale beyond the turning at a 48 px scale, in degrees. A
        // corner, however sharp, turns the same at both scales; a nick, step or wobbly edge
        // turns there and back, which only the fine scale sees.
        const wg = ((turning(rs, WF) - turning(rs, WC)) * 180) / Math.PI;
        if (wg > 15) wiggly.add(h);
        wiggle = Math.max(wiggle, wg);
      }
      // symmetry: IoU of the mask with itself turned by one sector
      const fold = m.symmetry;
      let inter = 0, uni = 0;
      if (fold > 1) {
        const t = (2 * Math.PI) / fold, ct = Math.cos(t), st = Math.sin(t), c0 = (n - 1) / 2;
        for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) {
          const dx = x - c0, dy = y - c0;
          if (dx * dx + dy * dy > (half * 0.93) ** 2) continue;
          const xr = Math.round(c0 + dx * ct - dy * st), yr = Math.round(c0 + dx * st + dy * ct);
          const a = m.data[y * n + x] > 0.5, c = m.data[yr * n + xr] > 0.5;
          if (a && c) inter++;
          if (a || c) uni++;
        }
      }
      const symmetry = fold > 1 ? inter / uni : 1;
      // thinnest spoke: from every edge pixel between the hub and the lip, walk straight into
      // the solid against the mask's gradient until it ends; the shortest walk is the narrowest
      // spoke (2nd percentile, so a single noisy pixel doesn't decide)
      const faceR = half * kit.FACE_FRACTION, c0 = (n - 1) / 2;
      const D = m.data, at = (x, y) => D[Math.min(n - 1, Math.max(0, Math.round(y))) * n + Math.min(n - 1, Math.max(0, Math.round(x)))];
      const widths = [];
      for (let y = 1; y < n - 1; y += 1) for (let x = 1; x < n - 1; x += 1) {
        const v = D[y * n + x];
        if (v < 0.5 || D[y * n + x - 1] >= 0.5 && D[y * n + x + 1] >= 0.5 && D[(y - 1) * n + x] >= 0.5 && D[(y + 1) * n + x] >= 0.5) continue;
        const rho = Math.hypot(x - c0, y - c0) / faceR;
        if (rho < 0.42 || rho > 0.95) continue;
        let gx = D[y * n + x + 1] - D[y * n + x - 1], gy = D[(y + 1) * n + x] - D[(y - 1) * n + x];
        const gl = Math.hypot(gx, gy);
        if (gl < 1e-3) continue;
        gx /= gl; gy /= gl;
        let t = 1;
        while (t < 200 && at(x + gx * t, y + gy * t) >= 0.5) t++;
        widths.push((t / faceR) * 240);
      }
      widths.sort((p1, p2) => p1 - p2);
      const thinnestMm = widths.length ? widths[Math.floor(widths.length * 0.02)] : Infinity;
      // overlay image
      const S = n * 2, cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const g = cv.getContext('2d');
      const id2 = new ImageData(n, n);
      for (let i = 0; i < m.data.length; i++) { const v = 40 + m.data[i] * 120; id2.data[i * 4] = id2.data[i * 4 + 1] = id2.data[i * 4 + 2] = v; id2.data[i * 4 + 3] = 255; }
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = n; tmp.getContext('2d').putImageData(id2, 0, 0);
      g.drawImage(tmp, 0, 0, S, S);
      const draw = (pts, col) => { g.beginPath(); pts.forEach((pt, i) => { const X = (pt.x * half + half) * 2, Y = (-pt.y * half + half) * 2; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); };
      for (const sh of shapes) { draw(sh.getPoints(), '#ff3b30'); }
      holes.forEach((h) => draw(h, wiggly.has(h) ? '#ff2bd6' : '#ffd60a'));
      return { fold, mode: m.mode, face: !!face, pieces, holes: holes.length, ragged, wiggle, symmetry, thinnestMm, png: cv.toDataURL('image/png') };
    }, { url: STORAGE + f, id, WF: 4, WC: 24 });
    if (r.error) { results.push({ id, pass: false, fails: [r.error] }); console.log(id, 'FAIL', r.error); continue; }
    fs.writeFileSync(path.join(OUT, id + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
    delete r.png;
    const fails = [];
    if (r.pieces !== 1) fails.push(`${r.pieces} pieces (floating islands)`);
    if (r.fold > 1 && r.holes % r.fold !== 0) fails.push(`${r.holes} windows, not a multiple of ${r.fold}`);
    if (r.symmetry < 0.97) fails.push(`symmetry ${r.symmetry.toFixed(3)}`);
    if (r.ragged > 0.05) fails.push(`ragged edges ${(r.ragged * 100).toFixed(1)}%`);
    if (r.wiggle > 15) fails.push(`nicks or wobbly edges (wiggle ${r.wiggle.toFixed(0)}°)`);
    if (r.thinnestMm < 3) fails.push(`spoke ${r.thinnestMm.toFixed(1)} mm thin`);
    const row = { id, ...r, pass: fails.length === 0, fails };
    results.push(row);
    console.log(`${id.padEnd(16)} ${row.pass ? 'PASS' : 'FAIL'}  fold ${r.fold} ${r.mode}${r.face ? ' (face mask)' : ''}  pieces ${r.pieces}  windows ${r.holes}  sym ${r.symmetry.toFixed(3)}  ragged ${(r.ragged * 100).toFixed(1)}%  wiggle ${r.wiggle.toFixed(0)}°  thinnest ${r.thinnestMm.toFixed(1)} mm  ${fails.join('; ')}`);
  }
  fs.writeFileSync(path.join(OUT, 'wheel-qa.json'), JSON.stringify(results, null, 2));
  await b.close();
  process.exit(results.every((x) => x.pass) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

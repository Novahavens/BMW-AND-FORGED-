/**
 * Check a frames-only car in the real app (docs/ADD_PREPARED_CAR.md, "Frames-only cars"): picks it on the welcome
 * carousel, enters the configurator, shoots every view chip, opens the summary, and FAILS if the browser requested any
 * .glb for that car (its licence forbids serving the model) or if the turntable button shows for it.
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/frames-car.cjs <outDir> <carId> "<slide name>" [--hero]
 *
 * --hero also writes public/hero/<carId>-1600.webp and -960.webp from the summary's front three-quarter still (the
 * frame recoloured in the slide's paint, with the live forged wheels on top): a frames-only car has no Cycles hero batch.
 * Supabase writes are answered locally (never a real lead). CAR_ROW=<json> adds the car's row to the catalogue read, in
 * the test browser only, before its migration is applied. SwiftShader: several minutes.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [,, OUT, CAR, SLIDE, flag] = process.argv;
if (!OUT || !CAR || !SLIDE) { console.error('usage: frames-car.cjs <outDir> <carId> "<slide name>" [--hero]'); process.exit(2); }
const VIEWS = [['Front', 'frontThreeQuarter'], ['Side', 'side'], ['Rear', 'rearThreeQuarter'], ['Wheel', 'frontWheel'], ['Top', 'top']];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  const glbs = [];
  p.on('request', (r) => { if (/\.glb(\?|$)/i.test(r.url())) glbs.push(r.url()); });
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::|ERR_/.test(m.text())) problems.push('console.error ' + m.text().slice(0, 200)); });
  await p.route(/supabase\.co\/(rest|functions)\//, (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })));
  // CAR_ROW=<json file>: a cars row to add to the live catalogue's answer, in this browser only, for a car whose
  // migration is not applied yet (the row as the migration inserts it). Nothing is written to the database.
  if (process.env.CAR_ROW) {
    const row = JSON.parse(fs.readFileSync(process.env.CAR_ROW, 'utf8'));
    await p.route(/supabase\.co\/rest\/v1\/cars\?/, async (r) => {
      try {
        const res = await r.fetch();
        const rows = await res.json();
        if (Array.isArray(rows) && !rows.some((x) => x.id === row.id)) rows.push(row);
        await r.fulfill({ response: res, json: rows });
      } catch (e) {
        problems.push(`could not add the CAR_ROW to the catalogue read: ${e.message}`);
        await r.continue().catch(() => {});
      }
    });
  }
  const shot = (tag) => p.screenshot({ path: path.join(OUT, `${CAR}-${tag}.png`), timeout: 120000 });
  const log = (s) => console.log(`${CAR}: ${s}`);

  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().waitFor({ timeout: 240000 });
  await p.waitForFunction(() => { const l = document.querySelector('[aria-label="Loading"]'); return !l || getComputedStyle(l).opacity === '0'; }, null, { timeout: 120000 }).catch(() => {});
  // Jump to the car's slide: the carousel's dots are buttons labelled with the slide's name (HeroStage.tsx)
  const dot = p.getByRole('button', { name: SLIDE, exact: true }).first();
  if (!(await dot.count())) throw new Error(`no slide "${SLIDE}" on the welcome carousel`);
  await dot.click();
  await p.waitForTimeout(2500);
  await shot('welcome');
  await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().click({ timeout: 60000 });
  await p.getByRole('button', { name: /step 2|wheels/i }).first().waitFor({ timeout: 180000 });
  await p.waitForTimeout(6000);
  if (await p.getByRole('button', { name: /^turntable$|stop turntable/i }).count()) problems.push('turntable button shown for a frames-only car');

  for (const [label, view] of VIEWS) {
    const chip = p.getByRole('button', { name: new RegExp(`^${label}$`) }).first();
    if (await chip.count()) { await chip.click(); await p.waitForTimeout(7000); }
    await shot(view);
    log(`shot ${view}`);
  }

  const summaryBtn = p.getByRole('button', { name: /^summary$/i }).first();
  if (await summaryBtn.isVisible().catch(() => false)) await summaryBtn.click({ timeout: 60000 });
  else await p.getByRole('button', { name: /^view your /i }).first().click({ timeout: 60000 });
  await p.getByRole('button', { name: /^pdf$|download pdf/i }).first().waitFor({ timeout: 60000 });
  const stills = await p.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('img')].map((i) => i.src).filter((s) => s.startsWith('data:image/jpeg'));
    return imgs.length >= 3 ? imgs : null;
  }, null, { timeout: 180000 }).then((h) => h.jsonValue()).catch(() => []);
  await shot('summary');
  if (stills.length < 3) problems.push(`summary has ${stills.length} stills, expected 3`);
  stills.forEach((s, i) => fs.writeFileSync(path.join(OUT, `${CAR}-still-${i}.jpg`), Buffer.from(s.split(',')[1], 'base64')));

  const own = glbs.filter((u) => u.includes(CAR));
  log(`glb requests: ${glbs.length ? glbs.map((u) => new URL(u).pathname).join(', ') : 'none'}`);
  if (own.length) problems.push(`the browser requested the car's GLB: ${own.join(', ')}`);
  await b.close();

  if (flag === '--hero' && stills[0]) {
    const { execFileSync } = require('child_process');
    const src = path.join(OUT, `${CAR}-still-0.jpg`);
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
for w in (1600, 960):
    im.resize((w, round(w * im.height / im.width)), Image.LANCZOS).save(f'public/hero/{sys.argv[2]}-{w}.webp', quality=88, method=6)
print('hero stills written')`, src, CAR], { stdio: 'inherit' });
  }
  if (problems.length) { console.error('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
  log('ok');
})().catch((e) => { console.error(e); process.exit(2); });

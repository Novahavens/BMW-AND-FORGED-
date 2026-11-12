/**
 * Captures the screens for the how-it-works tutorial video (video/m2-tutorial, made with HyperFrames).
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/video/capture-tutorial.cjs <outDir> [rimCacheDir]
 *
 * Walks the real app at 1920x1080: welcome carousel -> Enter -> Paint (Black Sapphire) -> Wheels (FF-3) ->
 * Size (21") -> Finish (Pure Bronze) -> camera chips -> More options -> Summary -> Share -> Enquire -> the
 * rim page. Writes <outDir>/NN-name.png and <outDir>/manifest.json (per shot: the box of each control the
 * film points at, in 1920x1080 pixels, so the cursor and callouts land on the real buttons).
 *
 * Writes to Supabase are answered locally (no real leads: each one emails the owner). SwiftShader (no GPU):
 * a few minutes per shot at this size, so expect a long run.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUT, RIMS = ''] = process.argv;
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const CAR = process.env.CAR_MATCH || 'M2';
const PAINT = process.env.PAINT || 'Black Sapphire';
const WHEEL = process.env.WHEEL || 'FF-3';
const SIZE = process.env.SIZE || '21"';
const FINISH = process.env.FINISH || 'Pure Bronze';
const RIM_ID = process.env.RIM_ID || 'sixnine_ff3';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const t0 = Date.now();
  const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  ${s}`);
  p.on('pageerror', (e) => log('PAGEERROR ' + e.message));
  await p.route(/supabase\.co\/(rest|functions|auth)\//, (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })));
  await p.route(/supabase\.co\/storage\//, (r) => {
    const f = RIMS && path.join(RIMS, path.basename(r.request().url().split('?')[0]));
    if (f && fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
    else r.continue();
  });

  const manifest = {};
  let n = 0;
  const box = async (loc) => { try { const bb = await loc.first().boundingBox({ timeout: 2000 }); return bb && { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) }; } catch { return null; } };
  /** screenshot + the boxes of named locators */
  const shot = async (name, targets = {}) => {
    const file = `${String(++n).padStart(2, '0')}-${name}.png`;
    await p.screenshot({ path: path.join(OUT, file), timeout: 240000 });
    const boxes = {};
    for (const [k, loc] of Object.entries(targets)) boxes[k] = await box(loc);
    manifest[name] = { file, boxes };
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    log(`shot ${file}`);
  };
  const settle = (ms) => p.waitForTimeout(ms);
  // CSS entrance animations starve under software rendering and get photographed half-faded: finish them first
  const finishCss = () => p.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }));
  const calm = async (ms = 600) => { await settle(ms); await finishCss(); await settle(400); };
  const chipActive = (label) => p.waitForFunction((l) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim().toLowerCase() === l && /bg-gold/.test(b.className)), label.toLowerCase(), { timeout: 120000 });
  const overlayGone = () => p.waitForFunction(() => { const l = document.querySelector('[aria-label="Loading"]'); return !l || getComputedStyle(l).opacity === '0'; }, null, { timeout: 240000 }).catch(() => {});
  const aside = p.locator('aside');
  const step = (label) => p.getByRole('button', { name: new RegExp(`^step \\d: ${label}$`, 'i') });
  const cam = (label) => p.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });

  // 1. Welcome: the carousel is where the car is chosen
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  const enter = p.getByRole('button', { name: /^enter$/i }).first();
  await enter.waitFor({ timeout: 240000 });
  await overlayGone();
  await settle(2500);
  await shot('welcome-m2', { enter, region: p.locator('select').first() });
  await p.keyboard.press('ArrowRight'); await settle(2500);
  await shot('welcome-next', { enter });
  await p.keyboard.press('ArrowLeft'); await settle(2500);
  // make sure the M2 is on stage again
  log('welcome back on M2');

  // 2. Enter -> configurator
  await enter.click({ timeout: 60000 });
  await step('wheels').waitFor({ timeout: 240000 });
  await settle(6000);
  await shot('configure-overview', { panel: aside, paintRow: aside.getByRole('button', { name: /^paint/i }), moreBtn: p.getByRole('button', { name: /more options/i }), summaryIcon: p.getByRole('button', { name: /^summary$/i }), price: aside.locator('.tabular-nums').last(), cta: aside.getByRole('button', { name: /^view your/i }), stepper: step('paint') });

  // 3. Paint
  await step('paint').click(); await aside.getByRole('heading', { name: /^paint$/i }).waitFor({ timeout: 60000 }); await calm(1500);
  await shot('paint-step', { panel: aside, swatch: aside.locator(`button[title="${PAINT}"]`) });
  await aside.locator(`button[title="${PAINT}"]`).first().scrollIntoViewIfNeeded();
  await aside.locator(`button[title="${PAINT}"]`).first().click(); await settle(9000); await finishCss();
  await shot('paint-black', { swatch: aside.locator(`button[title="${PAINT}"]`) });

  // 4. Wheels
  await step('wheels').click(); await aside.getByRole('heading', { name: /^wheels$/i }).waitFor({ timeout: 60000 }); await calm(5000);
  await shot('wheels-step', { list: aside.locator('ul').first(), info: aside.getByRole('button', { name: /wheel details/i }), rim360: aside.getByRole('button', { name: /360/i }) });
  const row = aside.locator('li > button', { hasText: new RegExp(`^\\s*.*${WHEEL}`) }).first();
  await row.scrollIntoViewIfNeeded(); await row.click(); await settle(9000);
  await shot('wheels-ff3', { row, info: aside.getByRole('button', { name: /wheel details/i }) });
  await aside.getByRole('button', { name: /wheel details/i }).click(); await settle(1500);
  await shot('wheel-info', { modal: p.locator('[role="dialog"]') });
  await p.keyboard.press('Escape'); await settle(800);

  // 5. Size
  await step('size').click(); await aside.getByRole('heading', { name: /^wheel size$/i }).waitFor({ timeout: 60000 }); await calm(1500);
  const sz = aside.getByRole('button', { name: new RegExp(`^${SIZE.replace('"', '')}"`) }).first();
  await sz.click(); await settle(9000); await finishCss();
  await shot('size-21', { size: sz });

  // 6. Finish
  await step('finish').click(); await aside.getByRole('heading', { name: /^wheel finish$/i }).waitFor({ timeout: 60000 }); await calm(1500);
  const fin = aside.locator('li > button', { hasText: FINISH }).first();
  await fin.click(); await settle(9000); await finishCss();
  await shot('finish-bronze', { finish: fin });

  // 7. Camera chips: back to the overview panel first, then each preset. Wait for the chip to take the gold highlight
  // (the UI lags a click under software rendering), then give the camera move time to land.
  await aside.getByRole('button', { name: /^exterior$/i }).first().click().catch(() => {});
  await calm(1500);
  for (const [label, name] of [['Side', 'cam-side'], ['Rear', 'cam-rear'], ['Wheel', 'cam-wheel'], ['Top', 'cam-top'], ['Front', 'cam-front']]) {
    await cam(label).click(); await chipActive(label); await settle(14000); await finishCss();
    await shot(name, { chip: cam(label), chips: cam('Front'), turntable: p.getByRole('button', { name: /turntable/i }) });
  }
  await p.getByRole('button', { name: /^turntable$/i }).click(); await p.getByRole('button', { name: /stop turntable/i }).waitFor({ timeout: 120000 }); await settle(5000);
  await shot('turntable', { turntable: p.getByRole('button', { name: /stop turntable/i }) });
  await p.getByRole('button', { name: /stop turntable/i }).click(); await settle(1500);

  // 8. More options
  await p.getByRole('button', { name: /more options/i }).click(); await calm(1500);
  await shot('more-options', { modal: p.locator('[role="dialog"]') });
  await p.keyboard.press('Escape'); await settle(800);

  // 9. Summary: wait for the stills (drawn by the engine), then finish the entrance animations
  await p.getByRole('button', { name: /^summary$/i }).first().click({ timeout: 60000 });
  await p.getByRole('button', { name: /^pdf$/i }).first().waitFor({ timeout: 240000 });
  await p.waitForFunction(() => { const im = [...document.querySelectorAll('img[alt^="Your"]')]; return im.length > 0 && im.every((i) => i.complete && i.naturalWidth > 0); }, null, { timeout: 240000 }).catch(() => log('stills not loaded'));
  await calm(6000);
  const scroller = () => p.evaluate(() => { const s = document.querySelector('.overflow-y-auto.bg-carbon'); return !!s; });
  const scrollToTab = async () => p.evaluate(() => { const s = document.querySelector('.overflow-y-auto.bg-carbon'); const t = [...document.querySelectorAll('button')].find((b) => /selected options/i.test(b.textContent)); if (s && t) s.scrollTo({ top: s.scrollTop + t.getBoundingClientRect().top - 260 }); });
  await shot('summary-top', { share: p.getByRole('button', { name: /share summary/i }) });
  await scrollToTab(); await calm(1500);
  await shot('summary-options', { price: p.locator('aside').last(), enquire: p.getByRole('button', { name: /^enquire$/i }), share: p.getByRole('button', { name: /^share$/i }), pdf: p.getByRole('button', { name: /^pdf$/i }) });
  await p.getByRole('button', { name: /standard features/i }).click(); await calm(1500);
  await shot('summary-standard', { tab: p.getByRole('button', { name: /standard features/i }) });
  await p.getByRole('button', { name: /^share$/i }).first().click(); await calm(2500);
  await shot('share-modal', { modal: p.locator('[role="dialog"]') });
  await p.keyboard.press('Escape'); await calm(800);
  await p.getByRole('button', { name: /^enquire$/i }).first().click(); await calm(2000);
  await shot('enquire-modal', { modal: p.locator('[role="dialog"]') }); // opened only: never submitted
  await p.keyboard.press('Escape'); await calm(800);

  // 10. The wheel's own page: the one wheel studio
  await p.goto(`${BASE}/rims/${RIM_ID}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForSelector('[data-studio-state="ready"]', { timeout: 240000 }).catch(() => log('rim studio not ready, shooting anyway'));
  await settle(6000);
  await shot('rim-page', {});

  await b.close();
  log('done');
})().catch((e) => { console.error(e); process.exit(2); });

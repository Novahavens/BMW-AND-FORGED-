/**
 * Drives the real app to the wheels step of one car and records whether the 2D stage is used.
 *   node scripts/render/stage-test.cjs <outDir> <stand-in grey rim png> [phone|desktop] [modelNameRegex]
 * Every Supabase rim image is answered with the stand-in so the tint can be judged without network.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUT, STAND, which = 'desktop', model = 'M3 Competition'] = process.argv;
const SIZES = { phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desktop: { width: 1440, height: 900 } };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { width, height, ...dev } = SIZES[which];
  const ctx = await b.newContext({ viewport: { width, height }, ...dev });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.route(/supabase\.co\/storage\//, (r) => r.fulfill({ body: fs.readFileSync(STAND), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }));
  const shot = (t) => p.screenshot({ path: path.join(OUT, `${which}-${t}.png`) });
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().click({ timeout: 240000 });
  await p.getByRole('button', { name: /^build$/i }).waitFor({ timeout: 120000 });
  for (let i = 0; i < 8; i++) {
    const txt = await p.locator('body').innerText();
    if (new RegExp(model, 'i').test(txt.split('Build')[0] || txt)) break;
    const next = p.getByRole('button', { name: 'Next model' });
    await next.waitFor({ state: 'visible', timeout: 120000 });
    await p.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Next model'); return b && !b.disabled; }, null, { timeout: 120000 });
    await next.click();
    await p.waitForTimeout(3500);
  }
  await shot('showroom');
  await p.getByRole('button', { name: /^build$/i }).click();
  await p.getByRole('button', { name: /^confirm$/i }).click();
  await p.getByRole('button', { name: /step 2|wheels/i }).first().waitFor({ timeout: 60000 });
  await p.getByRole('button', { name: /step 2: wheels|^wheels$/i }).first().click();
  await p.waitForTimeout(2500);
  await shot('wheels-step');
  const stage = async () => (await p.locator('canvas[aria-label]').count()) > 0;
  console.log('stage canvas present after entering wheels step:', await stage());
  for (let i = 0; i < 2; i++) {
    const btns = p.locator('aside ul li > button'); const n = await btns.count();
    await btns.nth(Math.min(n - 1, 1 + i * 3)).click(); await p.waitForTimeout(2500);
    console.log(`wheel ${i}: stage present`, await stage());
    await shot(`wheel-${i}`);
  }
  await p.getByRole('button', { name: /step 4|wheel finish|^finish$/i }).first().click(); await p.waitForTimeout(800);
  const fin = p.locator('aside ul li > button'); const fn = await fin.count();
  for (let i = 0; i < Math.min(fn, 5); i++) { await fin.nth(i).click(); await p.waitForTimeout(1800); await shot(`finish-${i}`); }
  await p.getByRole('button', { name: /step 3|wheel size|^size$/i }).first().click(); await p.waitForTimeout(800);
  const sizes = p.locator('aside button', { hasText: /^\d\d"/ });
  if (await sizes.count()) { await sizes.last().click(); await p.waitForTimeout(2500); await shot('size-last'); console.log('size last: stage present', await stage()); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });

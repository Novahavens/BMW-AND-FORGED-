/**
 * Journey smoke test (see .claude/skills/visual-qa): drives the real app through the customer
 * journey at a phone and a desktop size, and records page errors, long main-thread tasks, the time
 * each step took, horizontal overflow, and a screenshot per step.
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/journey.cjs <outDir> <rimCacheDir> [phone|desktop|both]
 *
 * Welcome -> Enter -> showroom (next model) -> Build -> Confirm -> wheels step -> three wheels ->
 * size -> finish -> summary. Writes <outDir>/<size>.log and <size>-<step>.png (…-FAIL.png on a
 * failed step). SwiftShader: a few minutes per size; the step times are for comparison between
 * runs, not absolute.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUT, RIMS, which = 'both'] = process.argv;
const SIZES = { phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desktop: { width: 1440, height: 900 } };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const name of Object.keys(SIZES)) {
    if (which !== 'both' && which !== name) continue;
    const { width, height, ...dev } = SIZES[name];
    const ctx = await b.newContext({ viewport: { width, height }, ...dev });
    const p = await ctx.newPage();
    const log = [];
    const note = (s) => { log.push(`${((performance.now() - t0) / 1000).toFixed(1)}s  ${s}`); console.log(name, s); };
    p.on('pageerror', (e) => note('PAGEERROR ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_CERT|Failed to load resource|ERR_NAME|net::/.test(t)) note('console.error ' + t.slice(0, 200)); } });
    await p.addInitScript(() => {
      window.__long = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
    });
    // a test run must never write to the live database (saved configurations, leads): answer its writes here
    await p.route(/supabase\.co\/(rest|functions)\//, (r) => (r.request().method() === 'GET' || r.request().method() === 'HEAD' ? r.continue() : r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })));
    await p.route(/supabase\.co\/storage\//, (r) => {
      const f = path.join(RIMS, path.basename(r.request().url()));
      if (fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
      else r.continue();
    });
    const t0 = performance.now();
    const shot = async (tag) => { await p.screenshot({ path: path.join(OUT, `${name}-${tag}.png`), timeout: 120000 }); };
    const longs = async (tag) => {
      const L = await p.evaluate(() => { const l = window.__long; window.__long = []; return l; });
      const big = L.filter(([, d]) => d >= 100);
      if (big.length) note(`${tag}: long tasks ${big.map(([, d]) => d + 'ms').join(', ')}`);
    };
    const overflowCheck = (tag) => overflowCheckOn(p, note, tag);
    const step = async (tag, fn) => {
      const s = performance.now();
      try { await fn(); } catch (e) { note(`${tag}: FAILED ${e.message.split('\n')[0]}`); await shot(tag + '-FAIL'); return false; }
      note(`${tag}: ${Math.round(performance.now() - s)} ms`);
      await longs(tag);
      await shot(tag);
      return true;
    };
    await step('load', async () => {
      await p.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 240000 });
      await p.getByRole('button', { name: /enter|start|begin|explore|discover/i }).first().waitFor({ timeout: 240000 });
    });
    await step('welcome-enter', async () => {
      await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().click();
      await p.getByRole('button', { name: /^build$/i }).waitFor({ timeout: 60000 });
    });
    await step('showroom-next', async () => {
      await p.getByRole('button', { name: 'Next model' }).click();
      await p.waitForTimeout(4000);
    });
    await step('showroom-build', async () => {
      await p.getByRole('button', { name: /^build$/i }).click();
      await p.getByRole('button', { name: /^confirm$/i }).click();
      await p.getByRole('button', { name: /step 2|wheels/i }).first().waitFor({ timeout: 60000 });
    });
    await step('configure-wheels-step', async () => {
      await p.getByRole('button', { name: /step 2: wheels|^wheels$/i }).first().click();
      await p.waitForTimeout(1500);
    });
    await overflowCheck('configure');
    for (let i = 0; i < 3; i++) {
      await step(`pick-wheel-${i}`, async () => {
        // the wheel list in the panel (each design is an <li><button>)
        const btns = p.locator('aside ul li > button');
        const n = await btns.count();
        if (n < 2) throw new Error(`only ${n} wheel buttons found`);
        await btns.nth(Math.min(n - 1, 1 + i * 2)).click();
        await p.waitForTimeout(3000);
      });
    }
    await step('size-step', async () => {
      await p.getByRole('button', { name: /step 3|wheel size|^size$/i }).first().click();
      await p.waitForTimeout(800);
      const sizes = p.locator('aside button', { hasText: /^\d\d"/ });
      if (await sizes.count()) await sizes.last().click();
      await p.waitForTimeout(2500);
    });
    await step('finish-step', async () => {
      await p.getByRole('button', { name: /step 4|wheel finish|^finish$/i }).first().click();
      await p.waitForTimeout(800);
      const fin = p.locator('aside ul li > button');
      if (await fin.count() > 1) await fin.nth(1).click();
      await p.waitForTimeout(2500);
    });
    await step('summary', async () => {
      await p.getByRole('button', { name: /^summary$/i }).first().click();
      // the summary page: its price card has Enquire / Share / PDF
      await p.getByRole('button', { name: /^pdf$|download pdf/i }).first().waitFor({ timeout: 60000 });
      await p.waitForTimeout(6000);
    });
    const finalLongs = await p.evaluate(() => window.__long);
    note(`remaining long tasks: ${finalLongs.filter(([, d]) => d >= 100).map(([, d]) => d + 'ms').join(', ') || 'none'}`);
    await overflowCheck('end');
    fs.writeFileSync(path.join(OUT, `${name}.log`), log.join('\n'));
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });

// layout check: anything overflowing the viewport horizontally? (run before clicks that may scroll)
async function overflowCheckOn(p, note, tag) {
    const overflow = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('canvas')) {
          const cls = (el.className && String(el.className).slice(0, 60)) || el.tagName;
          out.push(`${el.tagName.toLowerCase()} ${cls} right=${Math.round(r.right)} left=${Math.round(r.left)}`);
          if (out.length > 12) break;
        }
      }
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, out };
    });
    note(`overflow (${tag}): scrollWidth ${overflow.scrollW} vs ${overflow.innerW}; ${overflow.out.join(' | ') || 'none'}`);
}

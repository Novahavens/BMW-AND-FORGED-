/**
 * PDF smoke test (see .claude/skills/forgedsa-pdf-brochure): drives the real app to the summary,
 * opens the PDF gate, fills it, and saves the brochure the browser generates, so the spec sheet can be
 * looked at page by page (`pdftoppm -png -r 80 out/brochure.pdf out/page`).
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/pdf-check.cjs <outDir> [desktop|phone]        # BASE=https://… runs it against a deployed site
 *
 * Nothing real is written: the lead insert and the saved configuration that the gate triggers are
 * answered here (every real lead emails the owner). Exit 0 with <outDir>/brochure.pdf, 2 on failure.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUT, which = 'desktop'] = process.argv;
const BASE = (process.env.BASE || 'http://127.0.0.1:5173').replace(/\/$/, '');
const SIZES = { phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desktop: { width: 1440, height: 900 } };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { width, height, ...dev } = SIZES[which] || SIZES.desktop;
  const ctx = await b.newContext({ viewport: { width, height }, ...dev, acceptDownloads: true });
  const p = await ctx.newPage();
  const log = [];
  const t0 = performance.now();
  const note = (s) => { log.push(`${((performance.now() - t0) / 1000).toFixed(1)}s  ${s}`); console.log(s); };
  p.on('pageerror', (e) => note('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_CERT|Failed to load resource|ERR_NAME|net::/.test(t)) note('console.error ' + t.slice(0, 200)); } });
  const writes = [];
  // STATIC=1: no catalogue reads either, so the app runs on the bundled catalogue (useful before a migration is applied)
  await p.route(/supabase\.co\/(rest|functions)\//, (r) => {
    const m = r.request().method();
    if (m === 'GET' || m === 'HEAD') return process.env.STATIC ? r.abort('blockedbyclient') : r.continue();
    writes.push(`${m} ${new URL(r.request().url()).pathname}`);
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  const shot = (tag) => p.screenshot({ path: path.join(OUT, `${which}-${tag}.png`), timeout: 120000 });
  try {
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().waitFor({ timeout: 240000 });
    note('welcome loaded');
    // The boot screen can still cover the page under load: wait for it to fade before clicking
    await p.locator('[aria-label="Loading"]').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
    await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().click({ timeout: 60000 });
    // Enter opens the configurator directly (the showroom model picker is gone)
    note('enter clicked');
    await p.getByRole('button', { name: /step 2|wheels/i }).first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(4000);
    note('configure reached');
    // Desktop: the "Summary" icon button; phones: the footer CTA "View your <car>" (the icon is hidden there)
    const summaryBtn = p.getByRole('button', { name: /^summary$/i }).first();
    if (await summaryBtn.isVisible().catch(() => false)) await summaryBtn.click();
    else await p.getByRole('button', { name: /^view your /i }).first().click();
    note('summary clicked');
    const pdfBtn = p.getByRole('button', { name: /^pdf$|download pdf/i }).first();
    await pdfBtn.waitFor({ timeout: 120000 });
    await p.waitForTimeout(8000); // stills are captured from the live engine
    await shot('summary');
    const code = await p.evaluate(() => (document.body.innerText.match(/\b[A-Z0-9]{6,8}\b(?=\s*(?:Share|Copy|Open|$))/m) || [])[0] || '');
    note(`summary reached; share code on page: ${code || '(not matched)'}`);
    await pdfBtn.click();
    const dialog = p.getByRole('dialog').filter({ hasText: /download your pdf/i }).first();
    await dialog.waitFor({ timeout: 30000 });
    await dialog.getByLabel(/email address/i).fill('qa@example.com');
    await dialog.getByLabel(/mobile number/i).fill('0821234567');
    await shot('gate');
    const dl = p.waitForEvent('download', { timeout: 180000 });
    await dialog.getByRole('button', { name: /download pdf/i }).click();
    const download = await dl;
    const target = path.join(OUT, 'brochure.pdf');
    await download.saveAs(target);
    const size = fs.statSync(target).size;
    note(`brochure saved: ${download.suggestedFilename()} (${(size / 1024).toFixed(0)} kB)`);
    note(`stubbed writes: ${writes.join(', ') || 'none'}`);
    await p.waitForTimeout(1500);
    await shot('after-pdf');
    if (size < 20000) throw new Error('the PDF is suspiciously small');
    if (!writes.some((w) => /\/leads/.test(w))) throw new Error('the PDF gate did not try to save a lead');
    fs.writeFileSync(path.join(OUT, `${which}.log`), log.join('\n'));
    await b.close();
    process.exit(0);
  } catch (e) {
    note('FAILED ' + e.message.split('\n')[0]);
    await shot('FAIL').catch(() => {});
    fs.writeFileSync(path.join(OUT, `${which}.log`), log.join('\n'));
    await b.close();
    process.exit(2);
  }
})();

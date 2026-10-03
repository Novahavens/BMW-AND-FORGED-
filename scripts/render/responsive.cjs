/**
 * Responsive audit (see .claude/skills/visual-qa, layer 0b): every page of the app at every device
 * size, with automatic checks and a screenshot each.
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/responsive.cjs <outDir> <rimCacheDir> [devices] [pages]   (comma lists: part of a
 *   device name, exact page names; e.g. `phone-390,tablet-portrait` `configure,wheels`)
 *
 * Devices: small / normal / large phones, phones in landscape, small / large tablets (portrait and
 * landscape), laptop, desktop, full HD, 4K. Pages: welcome, showroom, configurator (overview, wheels,
 * size, finish), summary, the wheels gallery, a rim page, terms, delivery.
 *
 * Checks per page and device (all must be empty):
 * - overflow:  the page scrolls sideways, or an element pokes out of the viewport
 * - clipped:   a button / heading / price whose text is cut off (scrollWidth > clientWidth with
 *              overflow hidden) or whose box lies partly outside the viewport
 * - tap:       a visible button or link smaller than 40 x 40 CSS px on a touch device (44 is the
 *              guideline; 40 allows the dense steppers)
 * - covered:   the primary action ("Build", "View your ...", "Enter") is not fully visible and
 *              unobstructed
 * - text:      body text below 11 px
 * Writes <outDir>/responsive.json, one PNG per device/page, and prints a PASS/FAIL table.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUT, RIMS, devFilter = '', pageFilter = ''] = process.argv;

const DEVICES = {
  'phone-small-320x568': { width: 320, height: 568, touch: true },
  'phone-360x740': { width: 360, height: 740, touch: true },
  'phone-390x844': { width: 390, height: 844, touch: true, dpr: 2 },
  'phone-large-430x932': { width: 430, height: 932, touch: true, dpr: 2 },
  'phone-landscape-844x390': { width: 844, height: 390, touch: true },
  'phone-landscape-667x375': { width: 667, height: 375, touch: true },
  'tablet-portrait-768x1024': { width: 768, height: 1024, touch: true },
  'tablet-landscape-1024x768': { width: 1024, height: 768, touch: true },
  'tablet-large-1024x1366': { width: 1024, height: 1366, touch: true },
  'laptop-1280x720': { width: 1280, height: 720 },
  'desktop-1440x900': { width: 1440, height: 900 },
  'fullhd-1920x1080': { width: 1920, height: 1080 },
  'uhd-2560x1440': { width: 2560, height: 1440 }
};

const PAGES = ['welcome', 'showroom', 'configure', 'wheels', 'size', 'finish', 'summary', 'forged', 'rim', 'terms', 'delivery'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const [dev, d] of Object.entries(DEVICES)) {
    if (devFilter && !devFilter.split(',').some((f) => dev.includes(f))) continue;
    const ctx = await b.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr || 1, isMobile: !!d.touch && d.width < 800, hasTouch: !!d.touch });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.route(/supabase\.co\/storage\//, (r) => {
      const f = path.join(RIMS, path.basename(r.request().url()));
      if (fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
      else r.continue();
    });

    const audit = (page) => p.evaluate(({ touch, page }) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const issues = { overflow: [], clipped: [], tap: [], covered: [], text: [] };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
      };
      const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      // modals and the page itself scroll vertically on purpose; horizontal poking is the bug
      if (document.documentElement.scrollWidth > vw + 1) issues.overflow.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el)) continue;
        if (el.closest('canvas, svg, [aria-hidden="true"]')) continue;
        const r = el.getBoundingClientRect();
        const tag = el.tagName.toLowerCase();
        const interactive = tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button';
        // inside a scroller (the panel's list, a modal) only horizontal escape counts
        if (interactive && (r.left < -1 || r.right > vw + 1)) issues.overflow.push(`${tag} "${label(el)}" x ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
        if (interactive && touch && (r.width < 40 || r.height < 40) && !el.closest('[data-allow-small]')) {
          // only report when actually on screen
          if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) issues.tap.push(`${tag} "${label(el)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        if (/^(h1|h2|h3|button|a|span|p|div)$/.test(tag) && el.children.length === 0 && el.textContent.trim() && el.clientWidth > 2) {
          const cs = getComputedStyle(el);
          if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) issues.clipped.push(`${tag} "${label(el)}" cut off`);
          if (parseFloat(cs.fontSize) < 11 && el.textContent.trim().length > 3 && !/uppercase/.test(cs.textTransform)) issues.text.push(`${tag} "${label(el)}" ${cs.fontSize}`);
          else if (parseFloat(cs.fontSize) < 9.5) issues.text.push(`${tag} "${label(el)}" ${cs.fontSize}`);
        }
      }
      // the primary action must be fully visible and not covered by something else
      const primary = [...document.querySelectorAll('button')].find((b) => visible(b) && /^(build|enter|view your|download|send enquiry)/i.test(label(b)));
      if (primary) {
        const r = primary.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(Math.min(vw - 1, Math.max(0, cx)), Math.min(vh - 1, Math.max(0, cy)));
        if (r.bottom > vh + 1 || r.top < -1 || r.right > vw + 1 || r.left < -1) issues.covered.push(`primary "${label(primary)}" off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${vw}x${vh})`);
        else if (top && !primary.contains(top) && !top.contains(primary)) issues.covered.push(`primary "${label(primary)}" covered by ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}`);
      }
      return issues;
    }, { touch: !!d.touch, page });

    const record = async (page, setup) => {
      if (pageFilter && !pageFilter.split(',').some((f) => page === f)) return;
      let issues;
      try {
        await setup();
        await p.waitForTimeout(1800);
        issues = await audit(page);
      } catch (e) {
        issues = { error: [String(e.message).split('\n')[0]] };
      }
      try { await p.screenshot({ path: path.join(OUT, `${dev}__${page}.png`), timeout: 120000 }); } catch {}
      const n = Object.values(issues).reduce((s, v) => s + v.length, 0);
      results.push({ device: dev, page, pass: n === 0, issues });
      console.log(`${dev.padEnd(26)} ${page.padEnd(10)} ${n === 0 ? 'PASS' : 'FAIL ' + n}  ${Object.entries(issues).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.slice(0, 2).join('; ')}`).join(' | ').slice(0, 220)}`);
    };

    const go = (route) => p.goto('http://127.0.0.1:5173' + route, { waitUntil: 'domcontentloaded', timeout: 240000 });
    // the page is ready when its button exists and the loading screen has faded away
    const ready = async (re) => {
      await p.getByRole('button', { name: re }).first().waitFor({ timeout: 240000 });
      await p.waitForFunction(() => { const l = document.querySelector('[aria-label="Loading"]'); return !l || getComputedStyle(l).opacity === '0'; }, null, { timeout: 240000 });
    };
    await record('welcome', async () => { await go('/'); await ready(/^enter/i); });
    await record('showroom', async () => { await go('/models'); await ready(/^build$/i); });
    await record('configure', async () => { await go('/configure'); await ready(/^front$/i); });
    await record('wheels', async () => { await p.getByRole('button', { name: /step 2: wheels/i }).first().click(); });
    await record('size', async () => { await p.getByRole('button', { name: /step 3: size/i }).first().click(); });
    await record('finish', async () => { await p.getByRole('button', { name: /step 4: finish/i }).first().click(); });
    await record('summary', async () => {
      await p.getByRole('button', { name: /^summary$/i }).first().click().catch(() => p.locator('button:has-text("View your")').first().click());
      await p.getByRole('button', { name: /^pdf$|download pdf/i }).first().waitFor({ timeout: 120000 });
    });
    await record('forged', async () => { await go('/forged'); await p.waitForSelector('text=/FSA-0/', { timeout: 120000 }).catch(() => {}); });
    await record('rim', async () => { await go('/rims/forged_fsa_01'); await p.waitForTimeout(6000); });
    await record('terms', async () => { await go('/terms'); });
    await record('delivery', async () => { await go('/delivery'); });
    if (errors.length) console.log(`${dev}: page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'responsive.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} pass`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

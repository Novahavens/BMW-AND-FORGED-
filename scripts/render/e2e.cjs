/**
 * End-to-end click-through (see .claude/skills/visual-qa): every button and link of the app at a phone
 * (390x844, touch), an iPad (834x1194, touch) and a desktop (1440x900), each control checked for its
 * effect (route, modal open/closed, the DOM state it changes, the clipboard, the PDF download, the
 * payload of the backend write it makes).
 *
 *   bunx vite --host 127.0.0.1 --port 5173 --strictPort         # dev server, in another shell
 *   node scripts/render/e2e.cjs <outDir> [devices] [sections]
 *   BASE=https://forged-configurator.vercel.app node scripts/render/e2e.cjs <outDir>   # production
 *
 * devices: comma list of phone,ipad,desktop (default all). sections: comma list of journey, forged,
 * rims, info, deeplinks (default all). RIMS=<dir> serves Supabase storage files from a local cache
 * (optional; the browser fetches them itself once the proxy CA is trusted, see docs/CHECKPOINT.md).
 *
 * Nothing real is written: inserts into `leads` (every one emails the owner) and
 * `saved_configurations` are fulfilled here with a 201 and their payloads checked; any other write to
 * Supabase is aborted and fails the run. The read-only `get_configuration` RPC is real, except for the
 * test code FAKE_CODE, which returns a build made here.
 *
 * Also recorded per device: page errors, console errors, failed requests and HTTP errors (the
 * intercepted writes excluded; blob: texture errors from a page being replaced by page.goto mid-load are not
 * the app's). Writes <outDir>/e2e.json (as it goes), a PNG per failed check, the
 * downloaded PDFs, and prints a PASS/FAIL table. Exit 1 on any failure. SwiftShader: a busy main
 * thread can hold a tap for a while, so timeouts are long; the devices run one after another.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = (process.env.BASE || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const [, , OUT = 'e2e-out', devFilter = '', secFilter = ''] = process.argv;
const RIMS = process.env.RIMS || '';
const FAKE_CODE = 'QATESTQA22';

const DEVICES = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  ipad: { width: 834, height: 1194, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }
};
const SECTIONS = ['journey', 'forged', 'rims', 'info', 'deeplinks'];

// ---- expectations from the repo (brand) and the live catalogue (Supabase) ----
const brandSrc = fs.readFileSync(path.join(__dirname, '../../config/brand.ts'), 'utf8');
const SOCIALS = [...brandSrc.matchAll(/\{ id: '(\w+)', label: '([^']+)', handle: '[^']+', url: '([^']+)' \}/g)].map((m) => ({ id: m[1], label: m[2], url: m[3] }));
const EMAIL = /email: '([^']+)'/.exec(brandSrc)[1];
const PHONE = /phone: '([^']+)'/.exec(brandSrc)[1];
const supaSrc = fs.readFileSync(path.join(__dirname, '../../services/supabaseClient.ts'), 'utf8');
const SUPA_URL = /'(https:\/\/\w+\.supabase\.co)'/.exec(supaSrc)[1];
const SUPA_KEY = /'(sb_publishable_[^']+)'/.exec(supaSrc)[1];
const rest = (q) => JSON.parse(execFileSync('curl', ['-sS', '--max-time', '60', `${SUPA_URL}/rest/v1/${q}`, '-H', `apikey: ${SUPA_KEY}`], { maxBuffer: 16 << 20 }).toString());
const WHEELS = rest('wheels?select=id,code,name,standard_sizes,available_variants,default_variant&active=eq.true&order=sort_order');
const FINISHES = Object.fromEntries(rest('wheel_finishes?select=id,name&active=eq.true').map((f) => [f.id, f.name]));
const CARS = rest('cars?select=id,name&active=eq.true&order=sort_order');
const REGIONS = [['South Africa', 'za', /R/], ['United Kingdom', 'uk', /£/], ['United States', 'us', /\$/], ['Europe', 'eu', /€/], ['United Arab Emirates', 'ae', /AED/]];
// the build the fake code opens: a different car, wheel, finish and size from the defaults
const FAKE_WHEEL = WHEELS.find((w) => w.id === 'forged_fsa_05') || WHEELS[WHEELS.length - 1];
const FAKE_CAR = CARS.find((c) => c.id === 'm5_g90') || CARS[CARS.length - 1];
const FAKE_BUILD = { carId: FAKE_CAR.id, paintId: 'nope_first_paint', wheelId: FAKE_WHEEL.id, finishId: 'bronze', size: '21"', regionId: 'za' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const results = [];
  const save = () => fs.writeFileSync(path.join(OUT, 'e2e.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });

  for (const [devName, d] of Object.entries(DEVICES)) {
    if (devFilter && !devFilter.split(',').includes(devName)) continue;
    const ctx = await b.newContext({ viewport: { width: d.width, height: d.height }, isMobile: d.isMobile, hasTouch: d.hasTouch, deviceScaleFactor: d.deviceScaleFactor, acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN }).catch(() => {});
    const p = await ctx.newPage();
    p.setDefaultTimeout(120000);
    p.setDefaultNavigationTimeout(240000);
    const t0 = Date.now();
    let current = 'start';
    let leaving = false; // a page.goto is replacing the page: the old page's half-done loads fail
    const problems = []; // page errors, console errors, failed requests
    const writes = []; // intercepted inserts
    const unexpected = []; // other writes, aborted
    const frames = new Map(); // `${wheel}/${finish}` -> Map(frame -> {status, ct})
    const frameFails = [];

    // ---- network: intercept writes, optional storage cache, external pages stubbed ----
    await ctx.route(/supabase\.co\//, async (r) => {
      const req = r.request();
      const u = new URL(req.url());
      const m = req.method();
      if (m === 'GET' && RIMS && u.pathname.includes('/storage/')) {
        const f = path.join(RIMS, path.basename(u.pathname));
        if (fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
      }
      if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return r.continue();
      const table = /\/rest\/v1\/([\w/]+)/.exec(u.pathname)?.[1];
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = req.postData(); }
      const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
      if (m === 'POST' && (table === 'leads' || table === 'saved_configurations')) {
        writes.push({ table, body, during: current });
        return r.fulfill({ status: 201, body: '', headers: cors });
      }
      if (m === 'POST' && table === 'rpc/get_configuration') {
        if (body && body.p_code === FAKE_CODE) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_BUILD), headers: cors });
        return r.continue();
      }
      unexpected.push(`${m} ${u.pathname} during ${current}`);
      return r.abort('blockedbyclient');
    });
    const STUB_HOSTS = SOCIALS.map((s) => new URL(s.url).host);
    await ctx.route((url) => STUB_HOSTS.includes(url.host), (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>stub' }));

    const intercepted = (url) => /\/rest\/v1\/(leads|saved_configurations)/.test(url) || STUB_HOSTS.includes(new URL(url).host);
    const FRAME_RE = /\/renders\/rims\/([^/]+)\/([^/]+)\/f(\d+)\.webp/;
    ctx.on('response', (res) => {
      const url = res.url();
      const fm = FRAME_RE.exec(url);
      if (fm) {
        const k = `${fm[1]}/${fm[2]}`;
        if (!frames.has(k)) frames.set(k, new Map());
        frames.get(k).set(+fm[3], { status: res.status(), ct: res.headers()['content-type'] || '' });
      }
      if (res.status() >= 400 && !intercepted(url)) problems.push({ kind: 'http', detail: `${res.status()} ${url.slice(0, 160)}`, during: current });
    });
    ctx.on('requestfailed', (req) => {
      const url = req.url();
      const err = req.failure()?.errorText || '';
      if (FRAME_RE.test(url) && !/ERR_ABORTED/.test(err)) frameFails.push(`${url} ${err}`);
      if (intercepted(url) || /blockedbyclient|BLOCKED_BY_CLIENT/i.test(err)) return;
      // an image or media load cancelled by leaving the page is not a failure
      if (/ERR_ABORTED/.test(err)) return;
      problems.push({ kind: 'requestfailed', detail: `${err} ${url.slice(0, 160)}`, during: current });
    });
    const watchPage = (pg) => {
      pg.on('pageerror', (e) => problems.push({ kind: 'pageerror', detail: e.message.slice(0, 300), during: current }));
      pg.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const t = msg.text();
        // HTTP errors are recorded from the response itself (with their URL)
        if (/^Failed to load resource: the server responded with a status of/.test(t)) return;
        // the page being left mid-load (a car's GLB textures are blob: URLs revoked with it)
        if (leaving && /blob:/.test(t)) return;
        problems.push({ kind: 'console.error', detail: t.slice(0, 300), during: current });
      });
    };
    watchPage(p);
    // copy-link: the URL written to the clipboard
    await ctx.addInitScript(() => {
      try {
        const c = navigator.clipboard;
        if (c) {
          const orig = c.writeText.bind(c);
          c.writeText = (t) => { window.__clip = t; return orig(t).catch(() => {}); };
        }
      } catch {}
    });

    // ---- helpers ----
    const row = (section, control, status, detail, ms) => {
      results.push({ device: devName, section, control, status, detail, ms });
      save();
      console.log(`${devName.padEnd(8)} ${status.padEnd(4)} ${section.padEnd(9)} ${control}${detail && status !== 'PASS' ? '  -- ' + detail : ''}`);
    };
    const check = async (section, control, fn) => {
      current = `${section}: ${control}`;
      const s = Date.now();
      try {
        const r = await fn();
        if (r && r.skip) row(section, control, 'SKIP', r.skip, Date.now() - s);
        else row(section, control, 'PASS', typeof r === 'string' ? r : '', Date.now() - s);
        return true;
      } catch (e) {
        row(section, control, 'FAIL', String(e.message).split('\n')[0].slice(0, 300), Date.now() - s);
        try { await p.screenshot({ path: path.join(OUT, `${devName}__${slug(section)}__${slug(control)}-FAIL.png`), timeout: 120000 }); } catch {}
        // a modal or the menu left open would fail every check after this one
        for (let i = 0; i < 3 && (await p.locator('[role="dialog"]').count()); i++) { await p.keyboard.press('Escape').catch(() => {}); await sleep(300); }
        return false;
      }
    };
    const act = (loc, opts = {}) => (d.hasTouch ? loc.tap(opts) : loc.click(opts));
    const btn = (name, exact = true) => p.getByRole('button', { name, exact });
    const pathname = () => new URL(p.url()).pathname;
    const waitPath = (want, timeout = 60000) =>
      p.waitForFunction((w) => location.pathname === w, want, { timeout }).catch(() => { throw new Error(`expected ${want}, at ${pathname()}`); });
    const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
    const text = async (loc) => ((await loc.first().textContent({ timeout: 30000 })) || '').replace(/\s+/g, ' ').trim();
    const go = async (route) => { leaving = true; try { await p.goto(BASE + route, { waitUntil: 'domcontentloaded' }); } finally { leaving = false; } };
    const ready = async () => {
      await p.waitForFunction(() => { const l = document.querySelector('[aria-label="Loading"]'); return !l || getComputedStyle(l).opacity === '0'; }, null, { timeout: 240000 });
    };
    const dialog = (title) => p.locator('[role="dialog"]').filter({ has: p.locator('.sticky .font-display', { hasText: title }) });
    const anyDialogs = () => p.locator('[role="dialog"]').count();
    const gone = async (loc, what) => { await loc.waitFor({ state: 'detached', timeout: 20000 }).catch(() => { throw new Error(`${what} still open`); }); };
    const waitWrite = async (table, from, timeout = 30000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const w = writes.slice(from).find((x) => x.table === table);
        if (w) return w.body;
        await sleep(200);
      }
      throw new Error(`no ${table} insert`);
    };
    const configOk = (c) => {
      const keys = ['car', 'paint', 'wheel', 'size', 'finish', 'carId', 'paintId', 'wheelId', 'finishId'];
      const missing = keys.filter((k) => !c || typeof c[k] !== 'string' || !c[k]);
      assert(!missing.length, `configuration missing ${missing.join(', ')}`);
    };
    /** a modal closes by its X, a tap on the backdrop and Escape */
    const closeTriple = async (section, name, open, title) => {
      for (const how of ['X', 'backdrop', 'Escape']) {
        await check(section, `${name}: closes by ${how}`, async () => {
          await open();
          const dl = dialog(title);
          await dl.waitFor({ state: 'visible', timeout: 60000 });
          if (how === 'X') await act(dl.getByRole('button', { name: 'Close', exact: true }));
          else if (how === 'backdrop') await act(dl.locator(':scope > div').first(), { position: { x: 6, y: 6 } });
          else await p.keyboard.press('Escape');
          await gone(dl, `"${title}" modal`);
        });
      }
    };
    /** a target=_blank link opens its URL in a new tab */
    const popup = async (loc, want) => {
      const href = await loc.getAttribute('href');
      assert(href === want, `href ${href} != ${want}`);
      assert((await loc.getAttribute('target')) === '_blank', 'not target=_blank');
      assert(/noopener/.test((await loc.getAttribute('rel')) || ''), 'no rel=noopener');
      const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 60000 }), act(loc)]);
      await pop.waitForLoadState('domcontentloaded').catch(() => {});
      const u = pop.url();
      await pop.close();
      assert(u.replace(/\/$/, '') === want.replace(/\/$/, ''), `opened ${u}`);
    };
    const socialIcons = async (section, scope, withWebsite) => {
      for (const s of SOCIALS) {
        if (s.id === 'website' && !withWebsite) continue;
        await check(section, `social icon ${s.label}`, () => popup(scope.locator(`a[aria-label*=" on ${s.label} "]`).first(), s.url));
      }
    };
    const enquiryDialog = () => dialog('Enquire');
    /** footer: in-app links (and back), contact links, socials */
    const footer = async (section, here, marker) => {
      const f = p.locator('footer');
      for (const [label, target] of [['The wheels', '/forged'], ['Configure', '/models'], ['Delivery & fitment', '/delivery'], ['Terms & conditions', '/terms']]) {
        await check(section, `footer "${label}"`, async () => {
          assert(pathname() === here, `not on ${here} (at ${pathname()})`);
          const a = f.locator('nav a', { hasText: label });
          assert((await a.getAttribute('href')) === target, `href ${await a.getAttribute('href')}`);
          await act(a);
          await waitPath(target);
          if (target === '/models') await btn(/^build$/i, false).waitFor();
          else await p.locator('h1').first().waitFor();
          if (target === here) return 'same page';
          await p.goBack();
          await waitPath(here);
          await marker().waitFor({ timeout: 60000 });
        });
      }
      await check(section, 'footer email + phone links', async () => {
        assert(pathname() === here, `not on ${here} (at ${pathname()})`);
        const mail = await f.locator('a[href^="mailto:"]').getAttribute('href');
        const tel = await f.locator('a[href^="tel:"]').getAttribute('href');
        assert(mail === `mailto:${EMAIL}`, `mailto ${mail}`);
        assert(tel === `tel:${PHONE.replace(/\s+/g, '')}`, `tel ${tel}`);
        return `${mail} ${tel} (placeholders, kept by the owner)`;
      });
      for (const s of SOCIALS) await check(section, `footer ${s.label} link`, () => popup(f.locator('ul a', { hasText: s.label }).last(), s.url));
      await check(section, 'footer social icons', async () => {
        for (const s of SOCIALS) assert((await f.locator(`a[aria-label*=" on ${s.label} "]`).getAttribute('href')) === s.url, `${s.label} icon href`);
      });
    };
    // configurator
    const stepTitle = () => text(p.locator('aside h3'));
    const heroName = () => text(p.locator('aside .text-\\[16px\\]'));
    const overviewShown = () => p.getByText('Choose the paint, then design', { exact: false }).waitFor({ timeout: 30000 });
    const toConfigureVia = async () => {
      // from wherever the journey is: the showroom menu's Configure
      if (pathname() === '/') { await act(btn(/^enter/i, false)); await waitPath('/models'); }
      await act(btn('Menu'));
      await act(p.locator('nav li button', { hasText: 'Configure' }));
      await waitPath('/configure');
      await btn('Change model').waitFor();
    };

    // =====================================================================================
    // Journey: welcome -> showroom -> configurator -> summary (one page load)
    // =====================================================================================
    if (!secFilter || secFilter.split(',').includes('journey')) {
      const S = 'welcome';
      const okLoad = await check(S, 'page loads (Enter shown)', async () => { await go('/'); await btn(/^enter/i, false).waitFor({ timeout: 240000 }); await ready(); });
      if (okLoad) {
        await check(S, 'region select saves to localStorage', async () => {
          const sel = p.locator('select').first();
          await sel.selectOption('uk');
          assert((await p.evaluate(() => localStorage.getItem('forged_region'))) === 'uk', 'not saved');
          await sel.selectOption('za');
          assert((await p.evaluate(() => localStorage.getItem('forged_region'))) === 'za', 'not saved back');
        });
        await socialIcons(S, p.locator('body'), false);
        await check(S, '"The wheels" -> /forged', async () => { await act(btn('The wheels')); await waitPath('/forged'); await p.locator('h1', { hasText: 'The collection' }).waitFor(); });
        await check('forged', 'Back (opened from welcome) -> /', async () => { await act(btn('Back')); await waitPath('/'); await btn(/^enter/i, false).waitFor(); });
        await check(S, 'Enter -> /models', async () => { await act(btn(/^enter/i, false)); await waitPath('/models'); await btn(/^build$/i, false).waitFor(); });

        // ---- showroom ----
        const R = 'showroom';
        const carName = () => text(p.locator('h2'));
        const notBusy = () => p.waitForFunction(() => { const b = document.querySelector('[aria-label="Next model"]'); return b && !b.disabled; }, null, { timeout: 180000 });
        const name0 = await carName().catch(() => '');
        await check(R, 'next model', async () => { await act(btn('Next model')); await p.waitForFunction((n) => document.querySelector('h2')?.textContent.trim() !== n, name0, { timeout: 60000 }); await notBusy(); return await carName(); });
        await check(R, 'previous model', async () => { await act(btn('Previous model')); await p.waitForFunction((n) => document.querySelector('h2')?.textContent.trim() === n, name0, { timeout: 60000 }); await notBusy(); });
        await check(R, 'position dots', async () => {
          const dots = p.locator('[data-allow-small] button');
          const n = await dots.count();
          assert(n === CARS.length, `${n} dots for ${CARS.length} cars`);
          const target = await dots.nth(2).getAttribute('aria-label');
          await act(dots.nth(2));
          await p.waitForFunction((n) => document.querySelector('h2')?.textContent.trim() === n, target, { timeout: 60000 });
          await notBusy();
          await act(dots.nth(0));
          await p.waitForFunction((n) => document.querySelector('h2')?.textContent.trim() === n, name0, { timeout: 60000 });
          await notBusy();
        });
        await check(R, 'swipe left/right changes model', async () => {
          if (!d.hasTouch) return { skip: 'no touch on desktop' };
          const cdp = await ctx.newCDPSession(p);
          const swipe = async (dx) => {
            const x0 = Math.round(d.width / 2 - dx / 2), y = Math.round(d.height * 0.45);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
            for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 6, y }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          };
          await swipe(-160);
          await p.waitForFunction((n) => document.querySelector('h2')?.textContent.trim() !== n, name0, { timeout: 60000 });
          await notBusy();
          await swipe(160);
          await p.waitForFunction((n) => document.querySelector('h2')?.textContent.trim() === n, name0, { timeout: 60000 });
          await notBusy();
        });
        // menu drawer
        const drawer = p.locator('div.fixed.inset-0', { has: p.locator('nav') }).filter({ has: btn('Close menu') });
        const openMenu = async () => { await act(btn('Menu')); await drawer.waitFor({ state: 'visible' }); };
        await check(R, 'menu: opens, closes by X', async () => { await openMenu(); await act(btn('Close menu')); await gone(drawer, 'menu'); });
        await check(R, 'menu: closes by backdrop', async () => { await openMenu(); await act(drawer.locator(':scope > div').first(), { position: { x: d.width - 3, y: Math.round(d.height / 2) } }); await gone(drawer, 'menu'); });
        await check(R, 'menu: closes by Escape', async () => { await openMenu(); await p.keyboard.press('Escape'); await gone(drawer, 'menu'); });
        if (await drawer.count()) await act(btn('Close menu')).catch(() => {});
        const menuLink = async (label) => { await openMenu(); await act(drawer.locator('li button', { hasText: label })); await gone(drawer, 'menu'); };
        await check(R, 'menu "Home" -> / (Enter -> back)', async () => { await menuLink('Home'); await waitPath('/'); await act(btn(/^enter/i, false)); await waitPath('/models'); });
        await check(R, 'menu "Models" -> /models', async () => { await menuLink('Models'); await waitPath('/models'); await btn(/^build$/i, false).waitFor(); });
        await check(R, 'menu "Configure" -> /configure (Change model -> back)', async () => { await menuLink('Configure'); await waitPath('/configure'); await act(btn('Change model')); await waitPath('/models'); });
        for (const [label, target] of [['The wheels', '/forged'], ['Delivery & fitment', '/delivery'], ['Terms & conditions', '/terms']]) {
          await check(R, `menu "${label}" -> ${target} (Back -> /models)`, async () => {
            await menuLink(label);
            await waitPath(target);
            await p.locator('h1').first().waitFor();
            await act(btn('Back'));
            await waitPath('/models');
            await btn(/^build$/i, false).waitFor();
          });
        }
        await check(R, 'menu "Enquire" opens the enquiry', async () => { await menuLink('Enquire'); await enquiryDialog().waitFor(); await p.keyboard.press('Escape'); await gone(enquiryDialog(), 'enquiry'); });
        await check(R, 'menu socials (4, incl. website)', async () => {
          await openMenu();
          for (const s of SOCIALS) await popup(drawer.locator(`a[aria-label*=" on ${s.label} "]`), s.url);
          await act(btn('Close menu'));
          await gone(drawer, 'menu');
        });
        await check(R, 'header Configure -> /configure', async () => {
          const c = p.locator('header').getByRole('button', { name: 'Configure', exact: true });
          if (!(await c.isVisible())) return { skip: 'hidden below 640 px (menu has Configure)' };
          await act(c);
          await waitPath('/configure');
          await act(btn('Change model'));
          await waitPath('/models');
        });
        const headerEnquire = () => act(p.locator('header').getByRole('button', { name: 'Enquire', exact: true }));
        await closeTriple(R, 'enquiry modal', headerEnquire, 'Enquire');
        await check('enquiry', 'Send needs name and email', async () => {
          await headerEnquire();
          const from = writes.length;
          await act(btn('Send enquiry'));
          await sleep(1500);
          assert(writes.length === from, 'sent without name/email');
          assert(await enquiryDialog().isVisible(), 'modal closed');
          assert(await p.locator('[role="dialog"] input:invalid').count() >= 2, 'name/email not flagged');
        });
        await check('enquiry', 'Send inserts a lead (payload) and thanks', async () => {
          const dl = enquiryDialog();
          const from = writes.length;
          await dl.getByLabel('Full name').fill('QA Test');
          await dl.getByLabel('Email').fill('qa@example.com');
          await dl.getByLabel('Phone').fill('082 123 4567');
          await dl.getByLabel('Message').fill('Automated QA, please ignore');
          const box = dl.locator('input[type="checkbox"]');
          await act(box);
          assert(!(await box.isChecked()), 'checkbox did not toggle');
          await act(dl.getByRole('button', { name: 'Send enquiry' }));
          const lead = await waitWrite('leads', from);
          assert(lead.name === 'QA Test' && lead.email === 'qa@example.com' && lead.phone === '082 123 4567', `contact ${JSON.stringify(lead).slice(0, 120)}`);
          assert(lead.message === 'Automated QA, please ignore', 'message');
          assert(lead.consultation === false, 'consultation not false');
          assert(lead.source === 'enquiry' && lead.region === 'za', `source/region ${lead.source}/${lead.region}`);
          configOk(lead.configuration);
          await dialog('Thank you').waitFor();
        });
        await check('enquiry', 'Close after sending', async () => { await act(dialog('Thank you').getByRole('button', { name: 'Close', exact: true }).last()); await gone(dialog('Thank you'), 'thank-you'); });
        // explore + notice
        const car = await carName();
        await closeTriple(R, 'Explore specs modal', () => act(btn(/explore/i, false)), car);
        await check(R, 'Explore -> "Build your …" -> notice; Cancel', async () => {
          await act(btn(/explore/i, false));
          await act(dialog(car).getByRole('button', { name: /^build your/i }));
          await gone(dialog(car), 'explore');
          const n = dialog('Pre-curated vehicle');
          await n.waitFor();
          await act(n.getByRole('button', { name: 'Cancel' }));
          await gone(n, 'notice');
          assert(pathname() === '/models', 'left the showroom');
        });
        await closeTriple(R, 'Build notice modal', () => act(btn(/^build$/i, false)), 'Pre-curated vehicle');
        await check(R, 'Build -> Confirm -> /configure', async () => {
          await act(btn(/^build$/i, false));
          await act(dialog('Pre-curated vehicle').getByRole('button', { name: 'Confirm' }));
          await waitPath('/configure');
          await btn('Change model').waitFor();
          await overviewShown();
        });

        // ---- configurator ----
        const C = 'configure';
        if (pathname() !== '/configure') await toConfigureVia().catch(() => {});
        await check(C, 'camera chips Front/Side/Rear/Wheel/Top', async () => {
          for (const v of ['Side', 'Rear', 'Wheel', 'Top', 'Front']) {
            await act(btn(v));
            await p.waitForFunction((v) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === v && b.className.includes('bg-gold')), v, { timeout: 30000 }).catch(() => { throw new Error(`${v} not active`); });
          }
        });
        await check(C, 'turntable on/off', async () => { await act(btn('Turntable')); await btn('Stop turntable').waitFor(); await act(btn('Stop turntable')); await btn('Turntable').waitFor(); });
        for (const [row, title] of [['Paint', 'Paint'], ['Wheels', 'Wheels'], ['Wheel size', 'Wheel size'], ['Wheel finish', 'Wheel finish']]) {
          await check(C, `overview row "${row}" -> step; "Exterior" back`, async () => {
            await act(p.locator('aside ul li > button').filter({ has: p.getByText(row, { exact: true }) }).first());
            await p.waitForFunction((t) => document.querySelector('aside h3')?.textContent.trim() === t, title, { timeout: 30000 });
            await act(btn('Exterior').nth(1));
            await overviewShown();
          });
        }
        for (const [i, [label, title]] of [['Paint', 'Paint'], ['Wheels', 'Wheels'], ['Size', 'Wheel size'], ['Finish', 'Wheel finish']].entries()) {
          await check(C, `step button ${i + 1} "${label}"`, async () => {
            await act(btn(`Step ${i + 1}: ${label}`));
            await p.waitForFunction((t) => document.querySelector('aside h3')?.textContent.trim() === t, title, { timeout: 30000 });
          });
        }
        await check(C, 'stepper "Exterior" -> overview', async () => { await act(btn('Exterior').first()); await overviewShown(); });
        await check(C, 'Next links Paint -> Wheels -> Size -> Finish', async () => {
          await act(btn('Step 1: Paint'));
          for (const [next, title] of [['Wheels', 'Wheels'], ['Wheel size', 'Wheel size'], ['Wheel finish', 'Wheel finish']]) {
            await act(p.locator('aside button', { hasText: new RegExp(`^\\s*Next\\s*${next}\\s*$`) }));
            await p.waitForFunction((t) => document.querySelector('aside h3')?.textContent.trim() === t, title, { timeout: 30000 });
          }
        });
        await check(C, 'finish step Next "Summary" -> /summary; Back', async () => {
          await act(p.locator('aside button', { hasText: /^\s*Next\s*Summary\s*$/ }));
          await waitPath('/summary');
          await btn(/^pdf$/i, false).waitFor({ timeout: 180000 });
          await act(p.locator('header').getByRole('button', { name: /back|return to configuration/i }));
          await waitPath('/configure');
          await btn('Change model').waitFor();
        });
        await check(C, 'paint swatches (every paint)', async () => {
          await act(btn('Step 1: Paint'));
          const sw = p.locator('aside section button[title]');
          const n = await sw.count();
          assert(n > 1, `${n} paints`);
          for (let i = n - 1; i >= 0; i--) {
            const name = await sw.nth(i).getAttribute('title');
            await act(sw.nth(i));
            await p.waitForFunction((nm) => (document.querySelector('aside h3 + p')?.textContent || '').startsWith(nm + ' ·'), name, { timeout: 30000 }).catch(() => { throw new Error(`paint ${name} not selected`); });
          }
          return `${n} paints`;
        });
        await check(C, 'wheel list (every wheel)', async () => {
          await act(btn('Step 2: Wheels'));
          const rows = p.locator('aside ul li > button');
          const n = await rows.count();
          assert(n === WHEELS.length, `${n} rows for ${WHEELS.length} wheels`);
          for (let i = 0; i < n; i++) {
            const name = await text(rows.nth(i).locator('span.truncate').first());
            await act(rows.nth(i));
            await p.waitForFunction((nm) => document.querySelector('aside .text-\\[16px\\]')?.textContent.trim() === nm, name, { timeout: 60000 }).catch(() => { throw new Error(`wheel ${name} not selected`); });
            assert((await rows.nth(i).locator('span.rounded-full').last().getAttribute('class')).includes('bg-gold'), `${name} row not ticked`);
          }
          return `${n} wheels`;
        });
        await closeTriple(C, 'Wheel details modal', () => act(btn('Wheel details')), (await text(p.locator('aside .text-bronze').first()).catch(() => 'FSA')));
        await check(C, 'Wheel details "View in 360°" -> /rims/id; Back to your build', async () => {
          const code = await text(p.locator('aside .text-bronze').first());
          const w = WHEELS.find((x) => x.code === code);
          await act(btn('Wheel details'));
          await act(dialog(code).getByRole('button', { name: 'View in 360°' }));
          await waitPath(`/rims/${w.id}`);
          assert(!(await anyDialogs()), 'modal left open');
          await act(btn('Back to your build'));
          await waitPath('/configure');
          await p.waitForFunction(() => document.querySelector('aside h3')?.textContent.trim() === 'Wheels', null, { timeout: 30000 });
        });
        await check(C, '"View in 360°" icon -> /rims/id; Back to your build', async () => {
          const code = await text(p.locator('aside .text-bronze').first());
          const w = WHEELS.find((x) => x.code === code);
          await act(btn('View in 360°'));
          await waitPath(`/rims/${w.id}`);
          await p.locator('h1', { hasText: w.name }).waitFor();
          await act(btn('Back to your build'));
          await waitPath('/configure');
        });
        await check(C, 'sizes (every size)', async () => {
          await act(btn('Step 3: Size'));
          const sz = p.locator('aside .grid > button');
          const n = await sz.count();
          assert(n >= 2, `${n} sizes`);
          for (let i = 0; i < n; i++) {
            await act(sz.nth(i));
            await p.waitForFunction((i) => document.querySelectorAll('aside .grid > button')[i]?.className.includes('bg-gold'), i, { timeout: 30000 }).catch(() => { throw new Error(`size ${i} not active`); });
          }
          return `${n} sizes`;
        });
        await check(C, 'finishes (every finish)', async () => {
          await act(btn('Step 4: Finish'));
          const fl = p.locator('aside ul li > button');
          const n = await fl.count();
          assert(n >= 2, `${n} finishes`);
          for (let i = 0; i < n; i++) {
            await act(fl.nth(i));
            await p.waitForFunction((i) => document.querySelectorAll('aside ul li > button')[i]?.querySelector('span.rounded-full:last-child')?.className.includes('bg-gold'), i, { timeout: 30000 }).catch(() => { throw new Error(`finish ${i} not ticked`); });
          }
          return `${n} finishes`;
        });
        await check(C, 'Summary icon -> /summary (saved_configurations payload); Back', async () => {
          const from = writes.length;
          await act(btn('Summary'));
          await waitPath('/summary');
          await btn(/^pdf$/i, false).waitFor({ timeout: 180000 });
          const w = await waitWrite('saved_configurations', from);
          assert(/^[A-HJ-NP-Z2-9]{10}$/.test(w.code), `code ${w.code}`);
          const keys = ['carId', 'paintId', 'wheelId', 'finishId', 'size', 'regionId'];
          assert(keys.every((k) => w.payload && w.payload[k]), `payload ${JSON.stringify(w.payload)}`);
          await act(p.locator('header').getByRole('button', { name: /back|return to configuration/i }));
          await waitPath('/configure');
        });
        // ··· More options
        await closeTriple(C, 'More options modal', () => act(btn('More options')), 'More options');
        await check(C, 'More options: region buttons change currency', async () => {
          await act(btn('More options'));
          const mo = dialog('More options');
          for (const [label, id, sym] of [...REGIONS.slice(1), REGIONS[0]]) {
            const b = mo.getByRole('button', { name: new RegExp('^' + label) });
            await act(b);
            await p.waitForFunction((id) => localStorage.getItem('forged_region') === id, id, { timeout: 15000 }).catch(() => { throw new Error(`${id} not saved`); });
            assert((await b.getAttribute('class')).includes('bg-gold'), `${label} not active`);
            const price = await text(p.locator('aside div.font-display.tabular-nums'));
            assert(sym.test(price), `${label}: price ${price}`);
          }
          await p.keyboard.press('Escape');
          await gone(mo, 'More options');
        });
        await check(C, 'More options: load code (unknown code -> error)', async () => {
          await act(btn('More options'));
          const mo = dialog('More options');
          const input = mo.locator('input');
          const load = mo.getByRole('button', { name: 'Load' });
          await input.fill('');
          assert(await load.isDisabled(), 'Load enabled when empty');
          await input.fill('ZZZZZZZZZZ');
          await act(load);
          await mo.getByText('No configuration found').waitFor({ timeout: 30000 });
        });
        await check(C, 'More options: load code (valid) applies the build', async () => {
          const mo = dialog('More options');
          await mo.locator('input').fill(FAKE_CODE);
          await act(mo.getByRole('button', { name: 'Load' }));
          await gone(mo, 'More options');
          await overviewShown();
          const panel = await text(p.locator('aside'));
          for (const want of [FAKE_CAR.name, FAKE_WHEEL.name, '21"', FINISHES.bronze]) assert(panel.includes(want), `panel lacks ${want}`);
        });
        await check(C, 'More options: Start again -> /', async () => {
          await act(btn('More options'));
          await act(dialog('More options').getByRole('button', { name: /start again/i }));
          await waitPath('/');
          await btn(/^enter/i, false).waitFor();
          assert(!(await anyDialogs()), 'modal left open');
        });
        await check(C, 'back to the configurator (Enter, menu Configure)', toConfigureVia);
        await check(C, 'Change model -> /models', async () => { await act(btn('Change model')); await waitPath('/models'); await act(btn('Menu')); await act(p.locator('nav li button', { hasText: 'Configure' })); await waitPath('/configure'); });
        await check(C, '"View your …" -> /summary', async () => {
          await act(btn(/^view your/i, false));
          await waitPath('/summary');
          await btn(/^pdf$/i, false).waitFor({ timeout: 180000 });
        });

        // ---- summary ----
        const M = 'summary';
        const pdfBtn = () => p.locator('aside').getByRole('button', { name: /^pdf$/i });
        await check(M, 'tabs Standard / Selected', async () => {
          await act(btn('Standard features'));
          await p.getByText(/^Every FSA-/).waitFor({ timeout: 15000 });
          await act(btn('Selected options'));
          await p.getByText('Wheel design', { exact: true }).waitFor({ timeout: 15000 });
        });
        const headerShare = () => act(p.locator('header').getByRole('button', { name: /^share/i }));
        await closeTriple(M, 'Share modal (header Share)', headerShare, 'Share summary');
        await check(M, 'Share (price card) opens the share modal', async () => { await act(p.locator('aside').getByRole('button', { name: 'Share', exact: true })); await dialog('Share summary').waitFor(); });
        let code = '';
        await check(M, 'Copy link writes the share URL', async () => {
          const sh = dialog('Share summary');
          if (!(await sh.isVisible())) await headerShare();
          code = await text(sh.locator('.font-mono'));
          assert(/^[A-HJ-NP-Z2-9]{10}$/.test(code), `code ${code}`);
          await act(sh.getByRole('button', { name: 'Copy link' }));
          await sh.getByRole('button', { name: 'Link copied' }).waitFor({ timeout: 10000 });
          const clip = await p.evaluate(() => window.__clip);
          const want = `${ORIGIN}/?config=${code}`;
          assert(clip === want, `clipboard ${clip} != ${want}`);
          const read = await p.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message));
          return read === want ? 'clipboard read back' : `written (read back: ${String(read).slice(0, 40)})`;
        });
        const gate = () => dialog('Download your PDF');
        await check(M, 'Share "Download PDF" -> PDF form', async () => {
          const sh = dialog('Share summary');
          if (!(await sh.isVisible())) await headerShare();
          await act(sh.getByRole('button', { name: 'Download PDF' }));
          await gone(sh, 'share');
          await gate().waitFor();
          await p.keyboard.press('Escape');
          await gone(gate(), 'PDF form');
        });
        await closeTriple(M, 'PDF form modal', () => act(pdfBtn()), 'Download your PDF');
        await check(M, 'PDF form terms link -> /terms in a new tab', async () => {
          await act(pdfBtn());
          const a = gate().locator('a', { hasText: /terms/i });
          assert((await a.getAttribute('href')) === '/terms' && (await a.getAttribute('target')) === '_blank', 'href/target');
          const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 60000 }), act(a)]);
          watchPage(pop);
          await pop.waitForFunction(() => location.pathname === '/terms', null, { timeout: 120000 });
          await pop.locator('h1').first().waitFor({ timeout: 240000 });
          await pop.close();
          assert(await gate().isVisible(), 'PDF form closed');
        });
        await check(M, 'PDF form needs email + mobile', async () => {
          const g = gate();
          if (!(await g.isVisible())) await act(pdfBtn());
          const from = writes.length;
          await g.getByLabel('Email address').fill('');
          await g.getByLabel('Mobile number').fill('');
          await act(g.getByRole('button', { name: 'Download PDF' }));
          await sleep(1200);
          assert(writes.length === from && (await g.isVisible()), 'submitted empty');
          await g.getByLabel('Email address').fill('qa@example.com');
          await g.getByLabel('Mobile number').fill('12');
          await act(g.getByRole('button', { name: 'Download PDF' }));
          await g.getByText(/valid mobile number/).waitFor({ timeout: 10000 });
          assert(writes.length === from, 'lead saved with a bad number');
        });
        await check(M, 'PDF form inserts a lead, downloads the PDF (> 20 KB)', async () => {
          const g = gate();
          if (!(await g.isVisible())) await act(pdfBtn());
          const from = writes.length;
          await g.getByLabel('Mobile number').fill('082 123 4567');
          await g.getByLabel('Name (optional)').fill('QA Test');
          const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), act(g.getByRole('button', { name: 'Download PDF' }))]);
          const lead = await waitWrite('leads', from);
          assert(lead.source === 'pdf' && lead.email === 'qa@example.com' && lead.phone === '082 123 4567' && lead.name === 'QA Test', `lead ${JSON.stringify(lead).slice(0, 160)}`);
          assert(lead.consultation === false && lead.region === 'za', 'consultation/region');
          assert(!code || lead.config_code === code, `config_code ${lead.config_code} != ${code}`);
          configOk(lead.configuration);
          const f = path.join(OUT, `${devName}-${dl.suggestedFilename()}`);
          await dl.saveAs(f);
          const size = fs.statSync(f).size;
          assert(fs.readFileSync(f).subarray(0, 4).toString() === '%PDF', 'not a PDF');
          assert(size > 20 * 1024, `PDF ${size} bytes`);
          await gone(g, 'PDF form');
          return `${dl.suggestedFilename()} ${Math.round(size / 1024)} KB`;
        });
        await check(M, 'Enquire (price card) opens the enquiry', async () => {
          await act(p.locator('aside').getByRole('button', { name: 'Enquire' }));
          await enquiryDialog().waitFor();
          await p.keyboard.press('Escape');
          await gone(enquiryDialog(), 'enquiry');
        });
        await footer(M, '/summary', () => pdfBtn());
        await check(M, 'header Back -> /configure', async () => {
          await act(p.locator('header').getByRole('button', { name: /back|return to configuration/i }));
          await waitPath('/configure');
          await btn('Change model').waitFor();
        });
        await check(M, 'bottom "Return to configuration" -> /configure', async () => {
          await act(btn(/^view your/i, false));
          await waitPath('/summary');
          await pdfBtn().waitFor({ timeout: 180000 });
          await act(btn('Return to configuration').last());
          await waitPath('/configure');
        });
      }
    }

    // =====================================================================================
    // The wheels (/forged), reached from outside the app
    // =====================================================================================
    let order = WHEELS.map((w) => w.id);
    if (!secFilter || secFilter.split(',').includes('forged') || secFilter.split(',').includes('rims')) {
      const F = 'forged';
      await check(F, 'direct visit: Back stays in the app (-> /)', async () => {
        leaving = true;
        await p.goto('about:blank');
        leaving = false;
        await go('/forged');
        await p.locator('h1', { hasText: 'The collection' }).waitFor({ timeout: 240000 });
        await act(btn('Back'));
        await waitPath('/');
        assert(new URL(p.url()).origin === ORIGIN, `left the app: ${p.url()}`);
        await btn(/^enter/i, false).waitFor({ timeout: 240000 });
      });
      await check(F, 'welcome "The wheels" -> /forged', async () => {
        if (pathname() !== '/') { await go('/'); await btn(/^enter/i, false).waitFor({ timeout: 240000 }); }
        await ready();
        await act(btn('The wheels'));
        await waitPath('/forged');
        const codes = await p.locator('main li .text-bronze, li .text-bronze').allTextContents();
        order = codes.map((c) => WHEELS.find((w) => w.code === c.trim())?.id).filter(Boolean);
        assert(order.length === WHEELS.length, `${order.length} cards for ${WHEELS.length} wheels`);
      });
    }
    if (!secFilter || secFilter.split(',').includes('forged')) {
      const F = 'forged';
      for (const id of order) {
        const w = WHEELS.find((x) => x.id === id);
        const card = () => p.locator('li').filter({ has: p.locator('.text-bronze', { hasText: w.code }) });
        await check(F, `${w.code} "360°" -> /rims/${id}; Back -> /forged`, async () => {
          await act(card().getByRole('button', { name: '360°' }));
          await waitPath(`/rims/${id}`);
          await p.locator('h1', { hasText: w.name }).waitFor();
          await act(btn('Back'));
          await waitPath('/forged');
        });
        await check(F, `${w.code} "Configure" -> wheels step with it`, async () => {
          await act(card().getByRole('button', { name: 'Configure' }));
          await waitPath('/configure');
          await p.waitForFunction(() => document.querySelector('aside h3')?.textContent.trim() === 'Wheels', null, { timeout: 120000 });
          const hero = await heroName();
          assert(hero === w.name, `hero ${hero}`);
          await p.goBack();
          await waitPath('/forged');
          await p.locator('h1', { hasText: 'The collection' }).waitFor();
        });
      }
      await footer(F, '/forged', () => p.locator('h1', { hasText: 'The collection' }));
    }

    // =====================================================================================
    // Rim pages: all of them, every finish's spin, sizes, prev/next round the collection
    // =====================================================================================
    if (!secFilter || secFilter.split(',').includes('rims')) {
      const R = 'rims';
      const n = order.length;
      const spinLoaded = async (id, finishId) => {
        const k = `${id}/${finishId}`;
        await p.waitForFunction((k) => !!document.querySelector(`img[src*="/renders/rims/${k}/"]`), k, { timeout: 60000 }).catch(() => { throw new Error(`${k}: no spin image (live 3D fallback?)`); });
        const end = Date.now() + 180000;
        while (Date.now() < end) {
          const m = frames.get(k);
          if (m && m.size >= 36) break;
          await sleep(250);
        }
        const m = frames.get(k) || new Map();
        const bad = [...m.entries()].filter(([, v]) => v.status !== 200 || !/image\/webp/.test(v.ct));
        assert(m.size >= 36, `${k}: ${m.size}/36 frames`);
        assert(!bad.length, `${k}: bad frames ${bad.slice(0, 3).map(([i, v]) => `f${i} ${v.status} ${v.ct}`).join(', ')}`);
        const fails = frameFails.filter((f) => f.includes(`/${k}/`));
        assert(!fails.length, `${k}: failed ${fails[0]}`);
        // every frame decoded: the progress bar is gone
        await p.waitForFunction(() => !document.querySelector('.transition-\\[width\\]'), null, { timeout: 60000 }).catch(() => { throw new Error(`${k}: progress bar stuck`); });
      };
      await check(R, `open ${order[0]} from /forged ("Back" label)`, async () => {
        if (pathname() !== '/forged') { await go('/forged'); await p.locator('h1').first().waitFor({ timeout: 240000 }); }
        const w0 = WHEELS.find((x) => x.id === order[0]);
        await act(p.locator('li').filter({ has: p.locator('.text-bronze', { hasText: w0.code }) }).getByRole('button', { name: '360°' }));
        await waitPath(`/rims/${order[0]}`);
        await btn('Back').waitFor();
      });
      for (let i = 0; i < n; i++) {
        const id = order[i];
        const w = WHEELS.find((x) => x.id === id);
        await check(R, `${w.code} page: name, spin of every finish`, async () => {
          await waitPath(`/rims/${id}`);
          await p.locator('h1', { hasText: w.name }).waitFor();
          const chips = p.locator('aside button[title]');
          const c = await chips.count();
          assert(c === w.available_variants.length, `${c} finish chips for ${w.available_variants.length}`);
          for (let j = 0; j < c; j++) {
            const title = await chips.nth(j).getAttribute('title');
            const fid = Object.keys(FINISHES).find((f) => FINISHES[f] === title);
            await act(chips.nth(j));
            await p.waitForFunction((t) => (document.querySelector('aside')?.textContent || '').includes('Finish · ' + t), title, { timeout: 30000 }).catch(() => { throw new Error(`finish ${title} not shown`); });
            await spinLoaded(id, fid);
          }
          return `${c} finishes x 36 frames`;
        });
        if (i === 0) {
          await check(R, 'Rotate toggles', async () => {
            const r = p.getByRole('button', { name: 'Rotate', exact: true });
            const on = () => r.getAttribute('class').then((c) => c.includes('bg-gold'));
            const was = await on();
            await act(r);
            await p.waitForFunction((was) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Rotate')?.className.includes('bg-gold') !== was, was, { timeout: 10000 });
            await act(r);
            assert((await on()) === was, 'did not toggle back');
          });
          await check(R, 'sizes change the price', async () => {
            const sz = p.locator('aside .grid > button');
            const k = await sz.count();
            assert(k === w.standard_sizes.length, `${k} sizes for ${w.standard_sizes.length}`);
            const prices = new Set();
            for (let j = 0; j < k; j++) {
              await act(sz.nth(j));
              assert((await sz.nth(j).getAttribute('class')).includes('bg-gold'), `size ${j} not active`);
              prices.add(await text(p.locator('aside .tabular-nums')));
            }
            assert(prices.size > 1, `one price for every size: ${[...prices]}`);
          });
        }
        await check(R, `${w.code} Next -> ${order[(i + 1) % n]}`, async () => {
          await act(p.getByRole('button', { name: /^Next: / }));
          await waitPath(`/rims/${order[(i + 1) % n]}`);
        });
      }
      await check(R, `Previous cycles all ${n} back to ${order[0]}`, async () => {
        for (let i = 0; i < n; i++) {
          await act(p.getByRole('button', { name: /^Previous: / }));
          await waitPath(`/rims/${order[(n - 1 - i + n) % n]}`);
        }
        assert(pathname() === `/rims/${order[0]}`, 'not back at the first');
      });
      await check(R, '"Back" (opened from /forged) -> /forged', async () => {
        await act(btn('Back'));
        await waitPath('/forged');
      });
      await check(R, '"See it on my car" -> configurator with wheel, finish, size', async () => {
        const w = WHEELS.find((x) => x.id === order[1]);
        await act(p.locator('li').filter({ has: p.locator('.text-bronze', { hasText: w.code }) }).getByRole('button', { name: '360°' }));
        await waitPath(`/rims/${w.id}`);
        const fin = w.available_variants.find((f) => f !== w.default_variant && FINISHES[f]);
        await act(p.locator(`aside button[title="${FINISHES[fin]}"]`));
        const size = w.standard_sizes[w.standard_sizes.length - 1];
        await act(p.locator('aside .grid > button', { hasText: size }));
        await act(btn('See it on my car'));
        await waitPath('/configure');
        await p.waitForFunction(() => document.querySelector('aside h3')?.textContent.trim() === 'Wheels', null, { timeout: 120000 });
        assert((await heroName()) === w.name, 'wheel');
        const sub = await text(p.locator('aside .text-\\[16px\\] + div'));
        assert(sub === `${size} · ${FINISHES[fin]}`, `size/finish shown: ${sub}`);
      });
      await check(R, 'unknown rim id: "Wheel not found" + Back', async () => {
        await go('/rims/no-such-wheel');
        await p.getByText('Wheel not found.').waitFor({ timeout: 240000 });
        await act(btn('Back'));
        await waitPath('/configure');
      });
    }

    // =====================================================================================
    // Terms and delivery, reached from outside the app
    // =====================================================================================
    if (!secFilter || secFilter.split(',').includes('info')) {
      for (const pg of ['terms', 'delivery']) {
        const I = pg;
        await check(I, 'direct visit: Back stays in the app (-> /)', async () => {
          leaving = true;
          await p.goto('about:blank');
          leaving = false;
          await go('/' + pg);
          await p.locator('h1').first().waitFor({ timeout: 240000 });
          await act(btn('Back'));
          await waitPath('/');
          assert(new URL(p.url()).origin === ORIGIN, `left the app: ${p.url()}`);
          await go('/' + pg);
          await p.locator('h1').first().waitFor({ timeout: 240000 });
        });
        await check(I, 'Enquire opens the enquiry', async () => {
          await act(p.locator('header').getByRole('button', { name: 'Enquire' }));
          await enquiryDialog().waitFor();
          await p.keyboard.press('Escape');
          await gone(enquiryDialog(), 'enquiry');
        });
        await footer(I, '/' + pg, () => p.locator('h1').first());
        await check(I, 'Back after an in-app link -> previous page', async () => {
          const other = pg === 'terms' ? 'delivery' : 'terms';
          await act(p.locator('footer nav a', { hasText: other === 'terms' ? 'Terms' : 'Delivery' }));
          await waitPath('/' + other);
          await act(btn('Back'));
          await waitPath('/' + pg);
        });
      }
    }

    // =====================================================================================
    // Deep links
    // =====================================================================================
    if (!secFilter || secFilter.split(',').includes('deeplinks')) {
      const D = 'deeplinks';
      await check(D, '/summary -> configurator, address bar /configure', async () => {
        await go('/summary');
        await btn('Change model').waitFor({ timeout: 240000 });
        assert(pathname() === '/configure', `address bar ${pathname()}`);
      });
      await check(D, `/?config=${FAKE_CODE} opens that build`, async () => {
        await go(`/?config=${FAKE_CODE}`);
        await waitPath('/configure', 240000);
        await overviewShown();
        const panel = await text(p.locator('aside'));
        for (const want of [FAKE_CAR.name, FAKE_WHEEL.name, '21"', FINISHES.bronze]) assert(panel.includes(want), `panel lacks ${want}`);
      });
      await check(D, '/admin shows its sign-in', async () => {
        await go('/admin');
        await p.getByText('Admin sign in').waitFor({ timeout: 240000 });
        assert((await p.locator('input[type="email"]').count()) && (await p.locator('input[type="password"]').count()), 'no email/password inputs');
      });
    }

    // ---- what went wrong in the background ----
    current = 'end';
    const uniq = (a) => [...new Map(a.map((x) => [x.kind + x.detail, x])).values()];
    const pr = uniq(problems);
    row('errors', 'no page errors or console errors', pr.some((x) => /pageerror|console/.test(x.kind)) ? 'FAIL' : 'PASS', pr.filter((x) => /pageerror|console/.test(x.kind)).map((x) => `${x.kind}: ${x.detail} [${x.during}]`).slice(0, 8).join(' | '));
    row('errors', 'no failed requests or HTTP errors', pr.some((x) => /http|requestfailed/.test(x.kind)) ? 'FAIL' : 'PASS', pr.filter((x) => /http|requestfailed/.test(x.kind)).map((x) => `${x.detail} [${x.during}]`).slice(0, 8).join(' | '));
    row('errors', 'no unexpected backend writes', unexpected.length ? 'FAIL' : 'PASS', unexpected.slice(0, 5).join(' | '));
    results.push({ device: devName, section: 'writes', control: 'intercepted', status: 'INFO', detail: writes.map((w) => `${w.table}${w.body && w.body.code ? ' ' + w.body.code : ''} during ${w.during}`).join(' | ') });
    save();
    console.log(`${devName}: done in ${Math.round((Date.now() - t0) / 1000)} s`);
    await ctx.close();
  }
  await b.close();

  // ---- table ----
  const devs = [...new Set(results.map((r) => r.device))];
  console.log('\nPASS/FAIL per device');
  for (const dv of devs) {
    const r = results.filter((x) => x.device === dv);
    const c = (s) => r.filter((x) => x.status === s).length;
    console.log(`${dv.padEnd(8)} PASS ${c('PASS')}  FAIL ${c('FAIL')}  SKIP ${c('SKIP')}`);
  }
  const bad = results.filter((r) => r.status === 'FAIL');
  for (const r of bad) console.log(`FAIL ${r.device} ${r.section}: ${r.control} -- ${r.detail}`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

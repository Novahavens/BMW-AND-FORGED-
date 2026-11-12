/**
 * End-to-end click-through (see .claude/skills/visual-qa): every button and link of the customer's
 * side of the app at a phone (390x844, touch), an iPad (834x1194, touch) and a desktop (1440x900), each
 * control checked for its effect (route, modal open/closed, the DOM state it changes, the clipboard, the
 * PDF download, the payload of the backend write it makes). Not pressed: "Continue with Google" (it
 * leaves for Google) and anything behind a sign-in (the garage, /admin).
 *
 *   bunx vite --host 127.0.0.1 --port 5173 --strictPort         # dev server, in another shell
 *   node scripts/render/e2e.cjs <outDir> [devices] [sections]
 *   BASE=https://forged-configurator.vercel.app node scripts/render/e2e.cjs <outDir>   # production
 *
 * devices: comma list of phone,ipad,desktop (default all). sections: comma list of journey, forged,
 * rims, info, deeplinks (default all). RIMS=<dir> serves Supabase storage files from a local cache
 * (optional; the browser fetches them itself once the proxy CA is trusted, see docs/CHECKPOINT.md).
 *
 * The journey it walks (there is no showroom and no top bar):
 *   welcome (/)   a carousel of stills: "Previous car" / "Next car", a dot per car on offer, swipe on a
 *                 touch screen; the region select, "The wheels", the social icons; Enter
 *   /configure    Enter opens the configurator on the car on stage, in the still's paint when the car
 *                 offers it. The controls are the stepped drawer (Overview, 1 Paint, 2 Wheels, 3 Size,
 *                 4 Finish), the camera chips and the turntable. "More options" holds the region, a
 *                 configuration code, the account sheet, the links to the other pages and the enquiry
 *                 (the menu the top bar had) and "Start again". "Change model" and "Start again" go back
 *                 to the welcome, whose carousel opens on the car being built
 *   /summary      tabs, share, the PDF form, the visualisation notice, the footer
 * then the collection (/forged), every rim page (/rims/<id>: the 3D wheel studio's views, finishes, show
 * toggles, Front / Rear on a staggered set, its Controls card and Enquire), the info pages and the deep
 * links (/models is the welcome now).
 *
 * The panel switch: customers get the stepped drawer. The viewer's glass panel is only drawn when the
 * page was loaded with ?panel=viewer, and the app's own navigation drops the query, so the journey
 * always drives the drawer; the deep-link section loads /configure?panel=viewer once and checks which
 * panel it gets (?panel=steps no longer exists). The configurator helpers still read whichever panel is
 * rendered: the viewer panel (one scrolling aside with a section per step) or the drawer; the checks
 * only the drawer has (overview rows, Exterior, Next links) are SKIPped on the viewer panel.
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

// ---- expectations from the repo (brand, the welcome's slides) and the live catalogue (Supabase) ----
const brandSrc = fs.readFileSync(path.join(__dirname, '../../config/brand.ts'), 'utf8');
const SOCIALS = [...brandSrc.matchAll(/\{ id: '(\w+)', label: '([^']+)', handle: '[^']+', url: '([^']+)' \}/g)].map((m) => ({ id: m[1], label: m[2], url: m[3] }));
const EMAIL = /email: '([^']+)'/.exec(brandSrc)[1];
const PHONE = /phone: '([^']+)'/.exec(brandSrc)[1];
const NOTICE = /visualisationNotice:\s*'([^']+)'/.exec(brandSrc)[1];
const supaSrc = fs.readFileSync(path.join(__dirname, '../../services/supabaseClient.ts'), 'utf8');
const SUPA_URL = /'(https:\/\/\w+\.supabase\.co)'/.exec(supaSrc)[1];
const SUPA_KEY = /'(sb_publishable_[^']+)'/.exec(supaSrc)[1];
const rest = (q) => JSON.parse(execFileSync('curl', ['-sS', '--max-time', '60', `${SUPA_URL}/rest/v1/${q}`, '-H', `apikey: ${SUPA_KEY}`], { maxBuffer: 16 << 20 }).toString());
const WHEELS = rest('wheels?select=id,code,name,standard_sizes,available_variants,default_variant,model_url,rear_model_url,price_by_size&active=eq.true&order=sort_order');
const FINISHES = Object.fromEntries(rest('wheel_finishes?select=id,name&active=eq.true').map((f) => [f.id, f.name]));
const CARS = rest('cars?select=id,name,model_url,paint_ids&active=eq.true&order=sort_order');
const PAINTS = rest('paints?select=id,name,active&order=sort_order').filter((x) => x.active !== false);
const REGIONS = [['South Africa', 'za', /R/], ['United Kingdom', 'uk', /£/], ['United States', 'us', /\$/], ['Europe', 'eu', /€/], ['United Arab Emirates', 'ae', /AED/]];
/** the car's paints, in its order (catalogService.paintsForCar: every active paint when it lists none) */
const paletteOf = (car) => {
  const own = (car.paint_ids || []).map((id) => PAINTS.find((x) => x.id === id)).filter(Boolean);
  return own.length ? own : PAINTS;
};
// The welcome carousel (components/journey/HeroStage.tsx): a still per car, in the paint it was rendered in.
// It leaves out a car that is not on offer (App.tsx lineUpCars: the active cars that have a 3D body). The
// names are the slides' own (the dots' labels); the configurator shows the catalogue's name for the car.
const heroSrc = fs.readFileSync(path.join(__dirname, '../../components/journey/HeroStage.tsx'), 'utf8');
const HERO = [...heroSrc.matchAll(/\{ carId: '([^']+)', name: '([^']+)', paint: '([^']+)', paintId: '([^']+)' \}/g)].map((m) => ({ carId: m[1], name: m[2], paint: m[3], paintId: m[4] }));
// a frames-only car (renders/manifest.json framesOnly, no GLB) is on offer too
const FRAMES_ONLY = (() => {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/renders/manifest.json'), 'utf8'));
    return new Set(Object.keys(m).filter((id) => m[id] && m[id].framesOnly));
  } catch { return new Set(); }
})();
const hasBody = (c) => c.model_url || FRAMES_ONLY.has(c.id);
const LINE_UP = CARS.some(hasBody) ? CARS.filter(hasBody) : CARS;
const SLIDES = (HERO.some((s) => LINE_UP.some((c) => c.id === s.carId)) ? HERO.filter((s) => LINE_UP.some((c) => c.id === s.carId)) : HERO).map((s) => {
  const car = LINE_UP.find((c) => c.id === s.carId) || { id: s.carId, name: s.name, paint_ids: [] };
  const palette = paletteOf(car);
  // stillPaint: the catalogue's name of the still's paint when the car offers it (Enter opens the car in it), else null
  return { ...s, car, palette: palette.map((x) => x.name), stillPaint: palette.find((x) => x.id === s.paintId)?.name || null };
});
// The car the journey enters on: one the app did not start on (Enter has to bring it in), whose still's
// paint the car offers when there is such a slide (so "arrives in the still's paint" is put to the test)
const JOURNEY = SLIDES.find((s, i) => i > 0 && s.stillPaint) || SLIDES[1] || SLIDES[0];
// The build the fake code opens: a car that is neither the journey's nor the one the app starts on, a wheel
// that is neither the first (the default) nor the last (where the journey's wheel list ends), a finish that
// is not that wheel's default and its largest size
const FAKE_SLIDE = [...SLIDES].reverse().find((s) => s !== JOURNEY && s !== SLIDES[0]) || SLIDES[SLIDES.length - 1];
const FAKE_CAR = FAKE_SLIDE.car;
const FAKE_WHEEL = WHEELS[WHEELS.length - 2] || WHEELS[WHEELS.length - 1];
const FAKE_FINISH = FAKE_WHEEL.available_variants.find((f) => f !== FAKE_WHEEL.default_variant && FINISHES[f]) || FAKE_WHEEL.default_variant;
const FAKE_SIZE = FAKE_WHEEL.standard_sizes[FAKE_WHEEL.standard_sizes.length - 1];
// (a paint id no car offers: the build opens in the car's first paint)
const FAKE_BUILD = { carId: FAKE_CAR.id, paintId: 'nope_first_paint', wheelId: FAKE_WHEEL.id, finishId: FAKE_FINISH, size: FAKE_SIZE, regionId: 'za' };

// How long to wait for what follows a tap at once on a real device. On SwiftShader, with other renders on
// the machine, the main thread can hold a tap (and the reading of its result) for tens of seconds
const WAIT = 90000;
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
    const hmr = []; // the dev server's hot updates and reloads (an edit landing mid-run resets the app's state)

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
    ctx.on('response', (res) => {
      const url = res.url();
      if (res.status() >= 400 && !intercepted(url)) problems.push({ kind: 'http', detail: `${res.status()} ${url.slice(0, 160)}`, during: current });
    });
    ctx.on('requestfailed', (req) => {
      const url = req.url();
      const err = req.failure()?.errorText || '';
      if (intercepted(url) || /blockedbyclient|BLOCKED_BY_CLIENT/i.test(err)) return;
      // an image or media load cancelled by leaving the page is not a failure
      if (/ERR_ABORTED/.test(err)) return;
      problems.push({ kind: 'requestfailed', detail: `${err} ${url.slice(0, 160)}`, during: current });
    });
    const watchPage = (pg) => {
      pg.on('pageerror', (e) => problems.push({ kind: 'pageerror', detail: e.message.slice(0, 300), during: current }));
      pg.on('console', (msg) => {
        const t = msg.text();
        if (/^\[vite\] (hot updated|page reload|server connection lost|connected)/.test(t)) hmr.push(`${t.replace(/\s+/g, ' ').slice(0, 100)} [${current}]`);
        if (msg.type() !== 'error') return;
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
    // "Back" is also the wheel studio's view chip (Face / 3/4 / Side / Back / Top) on a rim page: the page's own
    // Back button comes first in the DOM, so a bare "Back" means that one
    const btn = (name, exact = true) => {
      const loc = p.getByRole('button', { name, exact });
      return name === 'Back' ? loc.first() : loc;
    };
    const pathname = () => new URL(p.url()).pathname;
    const waitPath = (want, timeout = 120000) =>
      p.waitForFunction((w) => location.pathname === w, want, { timeout }).catch(() => { throw new Error(`expected ${want}, at ${pathname()}`); });
    const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
    const text = async (loc) => ((await loc.first().textContent({ timeout: WAIT })) || '').replace(/\s+/g, ' ').trim();
    const go = async (route) => { leaving = true; try { await p.goto(BASE + route, { waitUntil: 'domcontentloaded' }); } finally { leaving = false; } };
    const ready = async () => {
      await p.waitForFunction(() => { const l = document.querySelector('[aria-label="Loading"]'); return !l || getComputedStyle(l).opacity === '0'; }, null, { timeout: 240000 });
    };
    const dialog = (title) => p.locator('[role="dialog"]').filter({ has: p.locator('.sticky .font-display', { hasText: title }) });
    const anyDialogs = () => p.locator('[role="dialog"]').count();
    const gone = async (loc, what, timeout = WAIT) => { await loc.waitFor({ state: 'detached', timeout }).catch(() => { throw new Error(`${what} still open`); }); };
    const waitWrite = async (table, from, timeout = WAIT) => {
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
    const closeTriple = async (section, name, open, title, hows = ['X', 'backdrop', 'Escape']) => {
      for (const how of hows) {
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
      for (const [label, target] of [['The wheels', '/forged'], ['Configure', '/configure'], ['Delivery & fitment', '/delivery'], ['Terms & conditions', '/terms'], ['Credits', '/credits']]) {
        await check(section, `footer "${label}" -> ${target}`, async () => {
          assert(pathname() === here, `not on ${here} (at ${pathname()})`);
          const a = f.locator('nav a', { hasText: label });
          assert((await a.getAttribute('href')) === target, `href ${await a.getAttribute('href')}`);
          await act(a);
          await waitPath(target);
          // the configurator (on a page opened from outside the app the studio may still be starting)
          if (target === '/configure') { await btn('Change model').waitFor({ timeout: 240000 }); await panelReady(); }
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
    // configurator: the stepped drawer (StepDrawer in components/journey/Configurator.tsx: an overview and
    // one step at a time; what customers get) or the viewer panel (components/journey/ViewerPanel.tsx: one
    // scrolling aside with a section per step; ?panel=viewer only). Both have "Change model", the
    // "Step N: X" buttons, the price line and the Summary / More options buttons.
    const STEP_LABEL = { paint: 'Step 1: Paint', wheels: 'Step 2: Wheels', size: 'Step 3: Size', finish: 'Step 4: Finish' };
    const STEP_TITLE = { paint: 'Paint', wheels: 'Wheels', size: 'Wheel size', finish: 'Wheel finish' };
    const panelReady = (timeout = 120000) => btn(STEP_LABEL.wheels).waitFor({ timeout });
    const isViewer = async () => (await p.locator('aside [data-section="wheels"]').count()) > 0;
    const overviewShown = () => p.getByText('Choose the paint, then design', { exact: false }).waitFor({ timeout: WAIT });
    /**
     * the step is on: the stepped panel's h3 title, or the viewer's section scrolled into the upper half of
     * the panel (its smooth scroll can stop short on SwiftShader), or as far down as the panel goes
     */
    const stepShown = (step, timeout = WAIT) =>
      p.waitForFunction(({ label, title }) => {
        const h3 = document.querySelector('aside h3');
        if (h3) return h3.textContent.trim() === title;
        const b = document.querySelector(`aside [aria-label="${label}"]`);
        const s = b && b.closest('section');
        let box = s && s.parentElement;
        while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
        if (!s || !box) return false;
        const r = s.getBoundingClientRect(), c = box.getBoundingClientRect();
        const atEnd = box.scrollTop >= box.scrollHeight - box.clientHeight - 2;
        return (r.top >= c.top - 24 && r.top < c.top + box.clientHeight / 2) || (atEnd && r.top < c.bottom - 8);
      }, { label: STEP_LABEL[step], title: STEP_TITLE[step] }, { timeout }).catch(() => { throw new Error(`step "${STEP_TITLE[step]}" not shown`); });
    /** the selected wheel's name: next to the viewer's Wheels heading, or the stepped panel's hero */
    const HERO_SEL = 'aside [aria-label="Step 2: Wheels"] + span, aside .text-\\[16px\\]';
    const heroName = () => text(p.locator(HERO_SEL));
    /** "<size> · <finish>" (the stepped hero) or "<wheel> · <size> · <finish>" (the price line, both panels) */
    const wheelLine = () => text(p.locator('aside .text-\\[16px\\] + div, aside .border-t .truncate.text-\\[12px\\]'));
    /** the selected wheel's code (shown by the stepped panel; the viewer shows the name) */
    const wheelCode = async () => {
      if (await p.locator('aside .text-bronze').count()) return text(p.locator('aside .text-bronze').first());
      const name = await heroName();
      return WHEELS.find((w) => w.name === name)?.code || name;
    };
    /** the panel's text plus the stage header (the viewer names the car over the stage, not in the panel) */
    const panelText = async () => [...(await p.locator('aside').allTextContents()), ...(await p.locator('h1').allTextContents())].join(' ').replace(/\s+/g, ' ');
    /** the car being built, by the catalogue's name: the drawer's heading, or the viewer's stage header */
    const buildCar = async () => ((await isViewer()) ? (await text(p.locator('h1'))).split(' · ')[0] : text(p.locator('aside .font-display.truncate')));
    /** the drawer's overview (the viewer panel has none: everything is on one page) */
    const toOverview = async () => {
      if (await isViewer()) return;
      if (!(await p.getByText('Choose the paint, then design', { exact: false }).count())) await act(btn('Exterior').first());
      await overviewShown();
    };
    /** the paint of the build: the overview's Paint row, or the name next to the viewer's Paint heading */
    const buildPaint = async () => {
      if (await isViewer()) return (await text(p.locator('aside [aria-label="Step 1: Paint"] + span'))).split(' · ')[0];
      await toOverview();
      return text(p.locator('aside ul li > button').filter({ has: p.getByText('Paint', { exact: true }) }).locator('span.text-ink'));
    };
    /** the panel shows this build: the car by its name, and the wheel, size and finish somewhere on it */
    const buildShown = async (carName, wheelName, size, finishName) => {
      await toOverview();
      const car = await buildCar();
      assert(car === carName, `car "${car}", not ${carName}`);
      const panel = await panelText();
      for (const want of [wheelName, size, finishName]) assert(panel.includes(want), `panel lacks ${want}`);
    };
    // the paint swatches: titled "Name" in the drawer's Paint step (echoed under its h3), "Name (CODE)" and
    // pressed in the viewer panel (echoed next to its Paint heading as "Name · CODE")
    const paintSel = (viewer) => (viewer ? 'aside section:has([aria-label="Step 1: Paint"]) button[title]' : 'aside section button[title]');
    const paintName = (title, viewer) => (viewer ? title.replace(/ \([^)]+\)$/, '') : title);
    const paintPicked = async (sel, i, title, viewer) => {
      if (viewer) {
        const m = /^(.*) \(([^)]+)\)$/.exec(title);
        await p.waitForFunction(({ sel, i, want }) => {
          const b = document.querySelectorAll(sel)[i];
          const named = (document.querySelector('aside [aria-label="Step 1: Paint"] + span')?.textContent || '').trim();
          return !!b && b.getAttribute('aria-pressed') === 'true' && (!want || named === want);
        }, { sel, i, want: m ? `${m[1]} · ${m[2]}` : '' }, { timeout: WAIT }).catch(() => { throw new Error(`paint ${title} not selected`); });
      } else {
        await p.waitForFunction((nm) => (document.querySelector('aside h3 + p')?.textContent || '').startsWith(nm + ' ·'), title, { timeout: WAIT }).catch(() => { throw new Error(`paint ${title} not selected`); });
      }
    };
    /** the engine's canvas is showing: it is kept dark while a car chosen on the welcome is still coming in */
    const stageShown = (timeout = 240000) =>
      p.waitForFunction(() => document.querySelector('div.z-10.transition-opacity.duration-700')?.classList.contains('opacity-100') === true, null, { timeout }).catch(() => { throw new Error('the stage stayed dark (the car did not arrive)'); });

    // the welcome: Enter and the carousel of stills (components/journey/HeroStage.tsx)
    const enter = () => btn(/^enter/i, false);
    const heroDots = () => p.locator('.hero-controls [data-allow-small] button');
    const heroCar = () => text(p.locator('.hero-controls .font-display')).catch(() => '?');
    /** this car is on stage: its name and paint over the carousel, its dot lit, its number, its still the one showing */
    const onSlide = (s, timeout = 120000) =>
      p.waitForFunction(({ name, paint, no }) => {
        const c = document.querySelector('.hero-controls');
        if (!c) return false;
        const dot = c.querySelector(`[data-allow-small] button[aria-label="${name}"] span`);
        const lit = [...c.querySelectorAll('[data-allow-small] button span')].filter((x) => x.className.includes('bg-gold'));
        const still = [...document.querySelectorAll('img.hero-shot')].filter((i) => i.style.opacity === '1');
        return c.querySelector('.font-display')?.textContent.trim() === name && c.querySelector('.text-bronze')?.textContent.trim() === paint &&
          (!dot || (lit.length === 1 && lit[0] === dot && c.querySelector('.font-mono')?.textContent.trim() === no)) &&
          still.length === 1 && still[0].alt === `${name} in ${paint}` && still[0].getAttribute('aria-hidden') !== 'true';
      }, { name: s.name, paint: s.paint, no: String(SLIDES.indexOf(s) + 1).padStart(2, '0') }, { timeout }).catch(async () => { throw new Error(`"${s.name}" not on stage (the carousel shows "${await heroCar()}")`); });
    /** into the configurator from wherever the journey is: the welcome's Enter (the only way in without a build link) */
    const toConfigure = async () => {
      if (pathname() !== '/') await go('/');
      await enter().waitFor({ timeout: 240000 });
      await ready();
      await act(enter());
      await waitPath('/configure');
      await btn('Change model').waitFor();
      await panelReady();
    };
    const ONE_CAR = { skip: 'one car on offer: the carousel has no controls' };

    // =====================================================================================
    // Journey: welcome (carousel) -> configurator -> summary (one page load)
    // =====================================================================================
    if (!secFilter || secFilter.split(',').includes('journey')) {
      const S = 'welcome';
      const okLoad = await check(S, 'page loads (Enter shown)', async () => { await go('/'); await enter().waitFor({ timeout: 240000 }); await ready(); });
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

        // ---- the carousel of stills: the only place a car is chosen ----
        const n = SLIDES.length;
        await check(S, `carousel: a dot per car on offer (${n}), opens on the first`, async () => {
          const labels = await heroDots().evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
          const want = n > 1 ? SLIDES.map((s) => s.name) : [];
          assert(labels.join(' | ') === want.join(' | '), `dots "${labels.join(', ')}" for ${want.join(', ')}`);
          await onSlide(SLIDES[0]);
          return SLIDES.map((s) => s.name).join(', ');
        });
        await check(S, 'carousel "Next car": every car in turn, then round to the first', async () => {
          if (n < 2) return ONE_CAR;
          // (each car that comes on stage is fetched and parsed behind the still, which can hold a tap on SwiftShader)
          for (let i = 1; i <= n; i++) { await act(btn('Next car')); await onSlide(SLIDES[i % n]); }
        });
        await check(S, 'carousel "Previous car": back through every car', async () => {
          if (n < 2) return ONE_CAR;
          for (let i = n - 1; i >= 0; i--) { await act(btn('Previous car')); await onSlide(SLIDES[i]); }
        });
        await check(S, 'carousel dots: each opens its car', async () => {
          if (n < 2) return ONE_CAR;
          // from the last dot down to the first, so every tap changes the car
          for (let i = n - 1; i >= 0; i--) { await act(heroDots().nth(i)); await onSlide(SLIDES[i]); }
        });
        await check(S, 'carousel swipe left/right changes the car', async () => {
          if (!d.hasTouch) return { skip: 'no touch on desktop' };
          if (n < 2) return ONE_CAR;
          const cdp = await ctx.newCDPSession(p);
          const swipe = async (dx) => {
            // over the still, above the carousel's controls
            const x0 = Math.round(d.width / 2 - dx / 2), y = Math.round(d.height * 0.3);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
            for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 6, y }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          };
          await onSlide(SLIDES[0]);
          await swipe(-160);
          await onSlide(SLIDES[1]);
          await sleep(600); // a gesture moves the carousel at most once in 450 ms
          await swipe(160);
          await onSlide(SLIDES[0]);
          await cdp.detach().catch(() => {});
        });
        await check(S, `Enter -> /configure on the car on stage (${JOURNEY.name})`, async () => {
          if (n > 1) await act(heroDots().nth(SLIDES.indexOf(JOURNEY)));
          await onSlide(JOURNEY);
          await act(enter());
          await waitPath('/configure');
          await btn('Change model').waitFor();
          await panelReady();
          await stageShown();
          const car = await buildCar();
          assert(car === JOURNEY.car.name, `the configurator is on "${car}", the carousel was on ${JOURNEY.name} (${JOURNEY.car.name})`);
          const paint = await buildPaint();
          // in the still's paint when the car offers it; else in one of its own
          if (JOURNEY.stillPaint) assert(paint === JOURNEY.stillPaint, `paint ${paint}; the still shows ${JOURNEY.stillPaint}`);
          else assert(JOURNEY.palette.includes(paint), `paint ${paint} is not one of the car's`);
          return `${car} in ${paint}${JOURNEY.stillPaint ? " (the still's paint)" : ` (the still's ${JOURNEY.paint} is not offered on this car)`}`;
        });

        // ---- configurator ----
        const C = 'configure';
        if (pathname() !== '/configure') await toConfigure().catch(() => {});
        const viewer = await isViewer();
        const STEPPED_ONLY = { skip: 'stepped drawer only (this is the viewer panel, ?panel=viewer)' };
        await check(C, 'camera chips Front/Side/Rear/Wheel/Top', async () => {
          // the viewer's six views (ends on its default, Front ¾) or the stepped panel's five
          const views = viewer ? ['Side', 'Rear ¾', 'Front', 'Wheel', 'Top', 'Front ¾'] : ['Side', 'Rear', 'Wheel', 'Top', 'Front'];
          for (const v of views) {
            await act(btn(v));
            await p.waitForFunction((v) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === v && b.className.includes('bg-gold')), v, { timeout: WAIT }).catch(() => { throw new Error(`${v} not active`); });
          }
          return views.join(', ');
        });
        await check(C, 'turntable on/off', async () => {
          if (!viewer) { await act(btn('Turntable')); await btn('Stop turntable').waitFor(); await act(btn('Stop turntable')); await btn('Turntable').waitFor(); return; }
          const ar = btn('Auto-rotate');
          const pressed = async (want) => {
            const end = Date.now() + 15000;
            while (Date.now() < end) { if ((await ar.getAttribute('aria-pressed')) === want) return; await sleep(200); }
            throw new Error(`Auto-rotate aria-pressed != ${want}`);
          };
          await act(ar); await pressed('true');
          await act(ar); await pressed('false');
        });
        for (const [row, step] of [['Paint', 'paint'], ['Wheels', 'wheels'], ['Wheel size', 'size'], ['Wheel finish', 'finish']]) {
          await check(C, `overview row "${row}" -> step; "Exterior" back`, async () => {
            if (viewer) return STEPPED_ONLY;
            await act(p.locator('aside ul li > button').filter({ has: p.getByText(row, { exact: true }) }).first());
            await stepShown(step);
            await act(btn('Exterior').nth(1));
            await overviewShown();
          });
        }
        for (const [i, step] of ['paint', 'wheels', 'size', 'finish'].entries()) {
          await check(C, `step button ${i + 1} "${STEP_LABEL[step].split(': ')[1]}"`, async () => {
            await act(btn(STEP_LABEL[step]));
            await stepShown(step);
          });
        }
        await check(C, 'stepper "Exterior" -> overview', async () => { if (viewer) return STEPPED_ONLY; await act(btn('Exterior').first()); await overviewShown(); });
        await check(C, 'Next links Paint -> Wheels -> Size -> Finish', async () => {
          if (viewer) return STEPPED_ONLY;
          await act(btn('Step 1: Paint'));
          for (const [next, step] of [['Wheels', 'wheels'], ['Wheel size', 'size'], ['Wheel finish', 'finish']]) {
            await act(p.locator('aside button', { hasText: new RegExp(`^\\s*Next\\s*${next}\\s*$`) }));
            await stepShown(step);
          }
        });
        await check(C, 'finish step Next "Summary" -> /summary; Back', async () => {
          if (viewer) return STEPPED_ONLY;
          await act(p.locator('aside button', { hasText: /^\s*Next\s*Summary\s*$/ }));
          await waitPath('/summary');
          await btn(/^pdf$/i, false).waitFor({ timeout: 180000 });
          await act(p.locator('header').getByRole('button', { name: /back|return to configuration/i }));
          await waitPath('/configure');
          await btn('Change model').waitFor();
        });
        await check(C, 'paint swatches (every paint)', async () => {
          await act(btn('Step 1: Paint'));
          const sel = paintSel(viewer);
          const sw = p.locator(sel);
          const n = await sw.count();
          assert(n > 1, `${n} paints`);
          for (let i = n - 1; i >= 0; i--) {
            const title = await sw.nth(i).getAttribute('title');
            await act(sw.nth(i));
            await paintPicked(sel, i, title, viewer);
          }
          return `${n} paints`;
        });
        await check(C, 'wheel list (every wheel)', async () => {
          await act(btn('Step 2: Wheels'));
          const sel = viewer ? 'aside [data-section="wheels"] li > button' : 'aside ul li > button';
          const rows = p.locator(sel);
          const n = await rows.count();
          assert(n === WHEELS.length, `${n} rows for ${WHEELS.length} wheels`);
          for (let i = 0; i < n; i++) {
            const name = await text(rows.nth(i).locator('span.truncate').first());
            await act(rows.nth(i));
            // picked (pressed, or the stepped row's gold tick) and named as the current wheel
            await p.waitForFunction(({ sel, i, nm, hero }) => {
              const b = document.querySelectorAll(sel)[i];
              const on = !!b && (b.getAttribute('aria-pressed') === 'true' || !!b.querySelector('span.rounded-full.bg-gold'));
              return on && document.querySelector(hero)?.textContent.trim() === nm;
            }, { sel, i, nm: name, hero: HERO_SEL }, { timeout: 60000 }).catch(() => { throw new Error(`wheel ${name} not selected`); });
          }
          return `${n} wheels`;
        });
        await closeTriple(C, 'Wheel details modal', () => act(btn('Wheel details')), await wheelCode().catch(() => 'FSA'));
        await check(C, 'Wheel details "View in 360°" -> /rims/id; Back to your build', async () => {
          const code = await wheelCode();
          const w = WHEELS.find((x) => x.code === code);
          assert(w, `no wheel with code ${code}`);
          await act(btn('Wheel details'));
          await act(dialog(code).getByRole('button', { name: 'View in 360°' }));
          await waitPath(`/rims/${w.id}`);
          assert(!(await anyDialogs()), 'modal left open');
          await act(btn('Back to your build'));
          await waitPath('/configure');
          await stepShown('wheels', 60000);
        });
        await check(C, '"View in 360°" icon -> /rims/id; Back to your build', async () => {
          const code = await wheelCode();
          const w = WHEELS.find((x) => x.code === code);
          assert(w, `no wheel with code ${code}`);
          await act(btn('View in 360°'));
          await waitPath(`/rims/${w.id}`);
          await p.locator('h1', { hasText: w.name }).waitFor();
          await act(btn('Back to your build'));
          await waitPath('/configure');
        });
        await check(C, 'sizes (every size)', async () => {
          await act(btn('Step 3: Size'));
          const sel = viewer ? 'aside section:has([aria-label="Step 3: Size"]) button[aria-pressed]' : 'aside .grid > button';
          const sz = p.locator(sel);
          const n = await sz.count();
          assert(n >= 2, `${n} sizes`);
          for (let i = 0; i < n; i++) {
            await act(sz.nth(i));
            await p.waitForFunction(({ sel, i }) => document.querySelectorAll(sel)[i]?.className.includes('bg-gold'), { sel, i }, { timeout: WAIT }).catch(() => { throw new Error(`size ${i} not active`); });
          }
          return `${n} sizes`;
        });
        await check(C, 'finishes (every finish)', async () => {
          await act(btn('Step 4: Finish'));
          const sel = viewer ? 'aside [data-section="finish"] li > button' : 'aside ul li > button';
          const fl = p.locator(sel);
          const n = await fl.count();
          assert(n >= 2, `${n} finishes`);
          for (let i = 0; i < n; i++) {
            await act(fl.nth(i));
            await p.waitForFunction(({ sel, i }) => {
              const b = document.querySelectorAll(sel)[i];
              return !!b && (b.getAttribute('aria-pressed') === 'true' || !!b.querySelector('span.rounded-full.bg-gold'));
            }, { sel, i }, { timeout: WAIT }).catch(() => { throw new Error(`finish ${i} not picked`); });
          }
          return `${n} finishes`;
        });
        await check(C, 'Summary icon -> /summary (saved_configurations payload); Back', async () => {
          const from = writes.length;
          // the icon steps aside on a phone, where the main button is the summary
          const icon = btn('Summary');
          await act((await icon.isVisible()) ? icon : btn(/^view your/i, false));
          await waitPath('/summary');
          await btn(/^pdf$/i, false).waitFor({ timeout: 180000 });
          const w = await waitWrite('saved_configurations', from);
          assert(/^[A-HJ-NP-Z2-9]{10}$/.test(w.code), `code ${w.code}`);
          const keys = ['carId', 'paintId', 'wheelId', 'finishId', 'size', 'regionId'];
          assert(keys.every((k) => w.payload && w.payload[k]), `payload ${JSON.stringify(w.payload)}`);
          await act(p.locator('header').getByRole('button', { name: /back|return to configuration/i }));
          await waitPath('/configure');
        });
        // the account sheet (signed out: the sign-in screen; "Continue with Google" is left alone, it leaves for
        // Google). On a phone the sheet is the whole screen, so there is no backdrop to tap
        await closeTriple(C, 'account sheet ("Account" button on the stage)', () => act(btn('Account')), 'Sign in', d.width < 640 ? ['X', 'Escape'] : undefined);
        // ··· More options: the region, a configuration code, the account, the other pages and the enquiry
        // (the menu the top bar used to hold), Start again
        const openMore = async () => {
          await act(btn('More options'));
          const mo = dialog('More options');
          await mo.waitFor({ state: 'visible', timeout: 60000 });
          return mo;
        };
        const MORE_LINKS = [['The wheels', '/forged'], ['Enquire', null], ['Delivery & fitment', '/delivery'], ['Terms & conditions', '/terms'], ['Credits', '/credits']];
        /** a link of the "More pages" list: the dialog closes and the link does its thing */
        const moreLink = async (label) => {
          const mo = await openMore();
          await act(mo.locator('nav[aria-label="More pages"] button', { hasText: label }));
          await gone(mo, 'More options');
        };
        await closeTriple(C, 'More options modal', () => act(btn('More options')), 'More options');
        await check(C, 'More options lists the pages: The wheels, Enquire, Delivery & fitment, Terms & conditions, Credits', async () => {
          const mo = await openMore();
          const labels = (await mo.locator('nav[aria-label="More pages"] button').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
          assert(labels.join(' | ') === MORE_LINKS.map((l) => l[0]).join(' | '), `links: ${labels.join(', ')}`);
          await p.keyboard.press('Escape');
          await gone(mo, 'More options');
        });
        for (const [label, target] of MORE_LINKS.filter((l) => l[1])) {
          await check(C, `More options "${label}" -> ${target}; Back -> /configure`, async () => {
            await moreLink(label);
            await waitPath(target);
            await p.locator('h1').first().waitFor();
            if (target === '/forged') await p.locator('h1', { hasText: 'The collection' }).waitFor();
            await act(btn('Back'));
            await waitPath('/configure');
            await btn('Change model').waitFor();
            await panelReady();
          });
        }
        const moreEnquire = () => moreLink('Enquire');
        await closeTriple(C, 'enquiry modal (More options "Enquire")', moreEnquire, 'Enquire');
        await check('enquiry', 'Send needs name and email', async () => {
          await moreEnquire();
          const from = writes.length;
          await act(btn('Send enquiry'));
          await sleep(1500);
          assert(writes.length === from, 'sent without name/email');
          assert(await enquiryDialog().isVisible(), 'modal closed');
          assert(await p.locator('[role="dialog"] input:invalid').count() >= 2, 'name/email not flagged');
        });
        await check('enquiry', 'Send inserts a lead (payload) and thanks', async () => {
          const dl = enquiryDialog();
          if (!(await dl.isVisible())) await moreEnquire();
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
        await check(C, 'More options "Account & garage" -> the sign-in sheet; "Not now" closes it', async () => {
          const mo = await openMore();
          await act(mo.getByRole('button', { name: 'Account & garage', exact: true }));
          const sheet = dialog('Sign in');
          await sheet.waitFor();
          await gone(mo, 'More options');
          await sheet.getByRole('button', { name: 'Continue with Google' }).waitFor();
          await act(sheet.getByRole('button', { name: /^not now/i }));
          await gone(sheet, 'sign-in sheet');
          assert(pathname() === '/configure', `left the configurator (at ${pathname()})`);
        });
        await check(C, 'More options: region buttons change currency', async () => {
          const mo = await openMore();
          for (const [label, id, sym] of [...REGIONS.slice(1), REGIONS[0]]) {
            const b = mo.getByRole('button', { name: new RegExp('^' + label) });
            await act(b);
            await p.waitForFunction((id) => localStorage.getItem('forged_region') === id, id, { timeout: WAIT }).catch(() => { throw new Error(`${id} not saved`); });
            assert((await b.getAttribute('class')).includes('bg-gold'), `${label} not active`);
            const price = await text(p.locator('aside div.font-display.tabular-nums'));
            assert(sym.test(price), `${label}: price ${price}`);
          }
          await p.keyboard.press('Escape');
          await gone(mo, 'More options');
        });
        await check(C, 'Change model -> / (carousel on the car being built); Enter -> the same build, its paint kept', async () => {
          const car = await buildCar();
          const slide = SLIDES.find((s) => s.car.name === car);
          assert(slide, `no slide for "${car}"`);
          // in a paint other than the still's, so a paint that Enter put back would show
          await act(btn(STEP_LABEL.paint));
          await stepShown('paint');
          const now = await isViewer();
          const sel = paintSel(now);
          const titles = await p.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('title')));
          const i = titles.findIndex((t) => paintName(t, now) !== slide.stillPaint);
          assert(i >= 0, 'no paint to change to');
          await act(p.locator(sel).nth(i));
          await paintPicked(sel, i, titles[i], now);
          const paint = paintName(titles[i], now);
          await act(btn('Change model'));
          await waitPath('/');
          await enter().waitFor();
          await onSlide(slide);
          await act(enter());
          await waitPath('/configure');
          await btn('Change model').waitFor();
          await panelReady();
          await stageShown();
          assert((await buildCar()) === car, `came back to "${await buildCar()}", not ${car}`);
          const back = await buildPaint();
          assert(back === paint, `paint ${back} after Enter, the build was in ${paint}`);
          return `${slide.name} on stage; back in ${paint}`;
        });
        await check(C, 'More options: load code (unknown code -> error)', async () => {
          const mo = await openMore();
          const input = mo.locator('input');
          const load = mo.getByRole('button', { name: 'Load' });
          await input.fill('');
          assert(await load.isDisabled(), 'Load enabled when empty');
          await input.fill('ZZZZZZZZZZ');
          await act(load);
          await mo.getByText('No configuration found').waitFor({ timeout: WAIT });
        });
        await check(C, 'More options: load code (valid) applies the build', async () => {
          const mo = (await dialog('More options').isVisible()) ? dialog('More options') : await openMore();
          await mo.locator('input').fill(FAKE_CODE);
          await act(mo.getByRole('button', { name: 'Load' }));
          // the modal closes once the build is applied, which loads another car (slow on SwiftShader)
          await gone(mo, 'More options', 180000);
          await panelReady();
          await buildShown(FAKE_CAR.name, FAKE_WHEEL.name, FAKE_SIZE, FINISHES[FAKE_FINISH]);
          // its paint id is one no car offers: the car's first paint
          const paint = await buildPaint();
          assert(paint === FAKE_SLIDE.palette[0], `paint ${paint}, the car's first is ${FAKE_SLIDE.palette[0]}`);
          return `${FAKE_CAR.name}, ${paint}, ${FAKE_WHEEL.name} ${FAKE_SIZE} in ${FINISHES[FAKE_FINISH]}`;
        });
        await check(C, 'More options: Start again -> /', async () => {
          const mo = await openMore();
          await act(mo.getByRole('button', { name: /start again/i }));
          await waitPath('/');
          await enter().waitFor();
          assert(!(await anyDialogs()), 'modal left open');
        });
        await check(C, 'back to the configurator (Enter)', toConfigure);
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
          // "Every <wheel code> set" (the stock sheet's codes: FSA001, FF-1, ...)
          await p.getByText(/^Every \S+ set$/).waitFor({ timeout: WAIT });
          await act(btn('Selected options'));
          await p.getByText('Wheel design', { exact: true }).waitFor({ timeout: WAIT });
        });
        await check(M, 'visualisation notice (price card)', async () => {
          // the owner's disclaimer, shown before the PDF and the enquiry (it was the showroom's Build notice)
          const shown = await text(p.locator('aside p').filter({ hasText: NOTICE.slice(0, 48) }));
          assert(shown === NOTICE, `the notice reads "${shown.slice(0, 120)}"`);
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
          await g.getByText(/valid mobile number/).waitFor({ timeout: WAIT });
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
    // ONLY_WHEELS=id1,id2 walks just those rim pages (a rim page takes minutes on a CPU-only machine)
    if (process.env.ONLY_WHEELS) order = order.filter((id) => process.env.ONLY_WHEELS.split(',').includes(id));
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
          await stepShown('wheels', 120000);
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
    // Rim pages: all of them in the 3D wheel studio (components/WheelStudio.tsx), every finish, the studio's
    // controls, sizes, prev/next round the collection
    // =====================================================================================
    if (!secFilter || secFilter.split(',').includes('rims')) {
      const R = 'rims';
      const n = order.length;
      // the stage: the studio for a wheel with a model (data-studio-state loading | ready | error), its photo otherwise
      const stage = p.locator('.wheel-stage');
      const studioState = () => p.evaluate(() => document.querySelector('.wheel-stage')?.getAttribute('data-studio-state') || 'missing').catch(() => 'missing');
      /** the rim's model is on stage (the studio's code is a chunk of its own and the rim a GLB: slow on SwiftShader) */
      const studioReady = (timeout = 300000) =>
        p.waitForFunction(() => document.querySelector('.wheel-stage')?.getAttribute('data-studio-state') === 'ready', null, { timeout }).catch(async () => { throw new Error(`the wheel studio is "${await studioState()}", not ready`); });
      const chip = (name) => stage.getByRole('button', { name, exact: true });
      const attrIs = async (loc, attr, want, what, timeout = WAIT) => {
        const end = Date.now() + timeout;
        let got;
        while (Date.now() < end) {
          got = await loc.getAttribute(attr, { timeout: WAIT }).catch(() => null);
          if (got === want) return;
          await sleep(150);
        }
        throw new Error(`${what}: ${attr} is ${got}, not ${want}`);
      };
      const pressed = (name, want) => attrIs(chip(name), 'aria-pressed', String(want), `"${name}"`);
      const finishChip = (name) => stage.locator(`button[aria-label="Select ${name} finish"]`);
      /** the finish is the page's: named in the details, and its chip pressed in the studio */
      const finishShown = async (name, studio) => {
        await p.waitForFunction((t) => (document.querySelector('aside')?.textContent || '').includes('Finish · ' + t), name, { timeout: WAIT }).catch(() => { throw new Error(`finish ${name} not shown in the details`); });
        if (studio) await attrIs(finishChip(name), 'aria-pressed', 'true', `studio chip ${name}`);
      };
      /** "Model: ⌀520 × 245 mm" in the studio's badge (the size of the model on stage) */
      const modelLine = async () => /Model: [^A-Za-z]*mm/.exec((await text(stage)) || '')?.[0] || '';
      const staggered = (w) => !!w.rear_model_url && w.rear_model_url !== w.model_url;

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
        const finishNames = w.available_variants.filter((f) => FINISHES[f]).map((f) => FINISHES[f]);
        await check(R, `${w.code} page: name, 3D studio, every finish (details and studio chips)`, async () => {
          await waitPath(`/rims/${id}`);
          await p.locator('h1', { hasText: w.name }).waitFor();
          await stage.waitFor({ timeout: 60000 });
          const studio = !!w.model_url;
          if (studio) await studioReady();
          else assert((await studioState()) === 'photo', `a wheel without a model shows "${await studioState()}", not its photo`);
          // the details' finish swatches (titled "Name", or "Name · +R 2 000" for a dearer finish), in the catalogue's order
          const chips = p.locator('aside button[title]');
          const titles = await chips.evaluateAll((els) => els.map((e) => e.getAttribute('title')));
          assert(titles.length === finishNames.length && titles.every((t, j) => t === finishNames[j] || t.startsWith(finishNames[j] + ' · ')), `finish swatches "${titles.join('", "')}" for ${finishNames.join(', ')}`);
          if (studio) {
            const labels = await stage.locator('button[aria-label^="Select "][aria-label$=" finish"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
            assert(labels.join(' | ') === finishNames.map((f) => `Select ${f} finish`).join(' | '), `studio finish chips: ${labels.join(', ')}`);
            assert((await stage.locator('[role="group"][aria-label="Axle"]').count()) === (staggered(w) ? 1 : 0), staggered(w) ? 'a staggered set without Front / Rear' : 'Front / Rear on a wheel with one model');
          }
          // each finish from the details, then back through them from the studio's own chips: the two stay in step
          for (let j = 0; j < finishNames.length; j++) { await act(chips.nth(j)); await finishShown(finishNames[j], studio); }
          if (studio) for (let j = finishNames.length - 1; j >= 0; j--) { await act(finishChip(finishNames[j])); await finishShown(finishNames[j], true); }
          if (studio) assert((await studioState()) === 'ready', `the wheel studio is "${await studioState()}" after the finishes`);
          return `${finishNames.length} finish${finishNames.length === 1 ? '' : 'es'}${studio ? `, ${await modelLine()}` : ', photo (no model)'}`;
        });
        if (staggered(w)) {
          await check(R, `${w.code} studio Front / Rear (staggered set)`, async () => {
            await studioReady();
            await pressed('Front', true);
            await pressed('Rear', false);
            const front = await modelLine();
            // the rear rim is another file: fetched, then on stage
            const [res] = await Promise.all([p.waitForResponse((r) => new URL(r.url()).pathname === w.rear_model_url, { timeout: 120000 }), act(chip('Rear'))]);
            assert(res.status() === 200 || res.status() === 304, `${w.rear_model_url}: HTTP ${res.status()}`);
            await pressed('Rear', true);
            await pressed('Front', false);
            await studioReady();
            await p.waitForFunction(() => document.querySelector('.wheel-stage b')?.textContent.trim() === 'Rear', null, { timeout: WAIT }).catch(() => { throw new Error('the badge does not say Rear'); });
            const rear = await modelLine();
            await act(chip('Front'));
            await pressed('Front', true);
            await pressed('Rear', false);
            await studioReady();
            await p.waitForFunction(() => document.querySelector('.wheel-stage b')?.textContent.trim() === 'Front', null, { timeout: WAIT }).catch(() => { throw new Error('the badge does not say Front'); });
            return `front ${front || '(not measured)'}, rear ${rear || '(not measured)'}`;
          });
        }
        if (i === 0) {
          await check(R, 'studio views Face / 3/4 / Side / Back / Top (a view stops the orbit)', async () => {
            await studioReady();
            const VIEWS = ['Face', '3/4', 'Side', 'Back', 'Top'];
            for (const v of VIEWS) assert((await chip(v).count()) === 1, `no "${v}" chip`);
            // it opens on 3/4 and still (the orbit is a toggle: on load it used to carry the wheel round to its barrel)
            await pressed('3/4', true);
            await pressed('Orbit', false);
            await act(chip('Orbit'));
            await pressed('Orbit', true);
            for (const v of ['Face', 'Side', 'Back', 'Top', '3/4']) {
              await act(chip(v));
              for (const o of VIEWS) await pressed(o, o === v);
              await pressed('Orbit', false);
            }
          });
          await check(R, 'studio toggles Orbit / Spin wheel / Exploded / Wireframe / Bolts / Cap', async () => {
            await studioReady();
            // Exploded, Bolts and Cap are only offered when the model has the parts (Brake check when it has brakes)
            const offered = [];
            for (const t of ['Orbit', 'Spin wheel', 'Exploded', 'Wireframe', 'Bolts', 'Cap', 'Brake check']) if (await chip(t).count()) offered.push(t);
            for (const must of ['Orbit', 'Spin wheel', 'Wireframe']) assert(offered.includes(must), `no "${must}" toggle (offered: ${offered.join(', ')})`);
            // as the studio starts: the wheel still and whole, its bolts and cap on (Orbit is on until a view is chosen or the wheel dragged)
            const START = { 'Spin wheel': 'false', Exploded: 'false', Wireframe: 'false', Bolts: 'true', Cap: 'true', 'Brake check': 'false' };
            for (const t of offered) {
              const was = await chip(t).getAttribute('aria-pressed');
              if (t in START) assert(was === START[t], `"${t}" starts ${was === 'true' ? 'on' : 'off'}`);
              await act(chip(t));
              await pressed(t, was !== 'true');
              await act(chip(t));
              await pressed(t, was === 'true');
            }
            assert((await studioState()) === 'ready', `the wheel studio is "${await studioState()}" after the toggles`);
            return offered.join(', ');
          });
          await check(R, 'studio "Controls" card collapses and expands', async () => {
            const card = stage.getByRole('button', { name: /^Controls/ });
            await attrIs(card, 'aria-expanded', 'true', 'Controls');
            await act(card);
            await attrIs(card, 'aria-expanded', 'false', 'Controls');
            await chip('Face').waitFor({ state: 'detached', timeout: WAIT }).catch(() => { throw new Error('the view chips still show in the collapsed card'); });
            assert(await chip('Enquire').isVisible(), 'Enquire went with the card');
            await act(card);
            await attrIs(card, 'aria-expanded', 'true', 'Controls');
            await chip('Face').waitFor({ timeout: WAIT });
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
            // the stock sheet's wheels cost the same in every size (docs/WHEEL_INVENTORY.md): the page must show as many
            // different prices as the catalogue has, so a size that moved the price on a flat-priced wheel fails too
            const want = new Set(Object.values(w.price_by_size || {}).map(Number)).size || 2;
            assert(want === 1 ? prices.size === 1 : prices.size > 1, `${prices.size} prices for ${want} in the catalogue: ${[...prices]}`);
          });
          // the enquiry is for the rim on this page, in the finish and size chosen here
          for (const [what, tap] of [['studio "Enquire"', () => act(chip('Enquire'))], ['"Enquire about this wheel"', () => act(btn('Enquire about this wheel'))]]) {
            await check(R, `${what} opens the enquiry for this wheel, size and finish`, async () => {
              const size = await text(p.locator('aside .grid > button.bg-gold'));
              const finish = await text(p.locator('aside span.text-ink'));
              await tap();
              await enquiryDialog().waitFor();
              const want = `${w.name} ${size} in ${finish}`;
              const said = await text(enquiryDialog());
              assert(said.includes(want), `the enquiry is not about "${want}": ${said.slice(0, 200)}`);
              await p.keyboard.press('Escape');
              await gone(enquiryDialog(), 'enquiry');
              assert(pathname() === `/rims/${id}`, `left the rim page (at ${pathname()})`);
              return want;
            });
          }
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
        // a wheel other than the first, in a finish that is not its default when it has one
        const pool = order.slice(1).map((x) => WHEELS.find((y) => y.id === x));
        const w = pool.find((x) => x.available_variants.some((f) => f !== x.default_variant && FINISHES[f])) || pool[0] || WHEELS.find((x) => x.id === order[0]);
        await act(p.locator('li').filter({ has: p.locator('.text-bronze', { hasText: w.code }) }).getByRole('button', { name: '360°' }));
        await waitPath(`/rims/${w.id}`);
        const fin = FINISHES[w.available_variants.find((f) => f !== w.default_variant && FINISHES[f]) || w.default_variant];
        await act(p.locator(`aside button[title="${fin}"], aside button[title^="${fin} · "]`));
        await finishShown(fin, false);
        const size = w.standard_sizes[w.standard_sizes.length - 1];
        await act(p.locator('aside .grid > button', { hasText: size }));
        await act(btn('See it on my car'));
        await waitPath('/configure');
        await stepShown('wheels', 120000);
        assert((await heroName()) === w.name, 'wheel');
        const sub = await wheelLine();
        assert(sub.endsWith(`${size} · ${fin}`), `size/finish shown: ${sub}`);
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
      await check(D, '/configure shows the stepped drawer (the panel customers get)', async () => {
        if (pathname() !== '/configure') await go('/configure');
        await panelReady(240000);
        assert(!(await isViewer()), 'the viewer panel without ?panel=viewer');
        await overviewShown();
        for (const step of Object.values(STEP_LABEL)) assert((await btn(step).count()) === 1, `no "${step}" button`);
      });
      await check(D, '/configure?panel=viewer shows the viewer panel (comparison switch)', async () => {
        await go('/configure?panel=viewer');
        await panelReady(240000);
        assert(await isViewer(), 'no viewer panel with ?panel=viewer');
        // what the viewer branches of the configurator checks read: its lists, its six views, its turntable chip
        const wheels = await p.locator('aside [data-section="wheels"] li > button').count();
        assert(wheels === WHEELS.length, `${wheels} wheels in the panel for ${WHEELS.length}`);
        assert((await p.locator('aside [data-section="finish"] li > button').count()) >= 1, 'no finishes in the panel');
        assert((await p.locator(paintSel(true)).count()) > 1, 'no paint swatches in the panel');
        for (const v of ['Front ¾', 'Side', 'Rear ¾', 'Front', 'Wheel', 'Top', 'Auto-rotate']) assert((await btn(v).count()) === 1, `no "${v}" chip`);
        for (const step of Object.values(STEP_LABEL)) assert((await btn(step).count()) === 1, `no "${step}" heading`);
        for (const b of ['Change model', 'More options']) assert((await btn(b).count()) === 1, `no "${b}" button`);
      });
      await check(D, '/models (the old model picker) -> the welcome carousel; Enter -> /configure', async () => {
        await go('/models');
        await enter().waitFor({ timeout: 240000 });
        await ready();
        await onSlide(SLIDES[0]);
        if (SLIDES.length > 1) for (const b of ['Previous car', 'Next car']) assert((await btn(b).count()) === 1, `no "${b}" button`);
        // nothing of the showroom is left
        for (const b of ['Next model', 'Previous model', 'Menu']) assert(!(await btn(b).count()), `a "${b}" button on the welcome`);
        assert(!(await btn(/^(build|explore)\b/i, false).count()), 'a Build or Explore button on the welcome');
        await act(enter());
        await waitPath('/configure');
        await btn('Change model').waitFor();
        await panelReady();
      });
      await check(D, `/?config=${FAKE_CODE} opens that build`, async () => {
        await go(`/?config=${FAKE_CODE}`);
        await waitPath('/configure', 240000);
        await panelReady(120000);
        await buildShown(FAKE_CAR.name, FAKE_WHEEL.name, FAKE_SIZE, FINISHES[FAKE_FINISH]);
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
    // a hot update mid-check can fail it without the app being wrong (a full reload resets the journey)
    const hot = hmr.filter((h) => !/connected/.test(h));
    if (hot.length) { results.push({ device: devName, section: 'dev', control: 'hot updates during the run', status: 'INFO', detail: hot.slice(0, 12).join(' | ') }); console.log(`${devName}: ${hot.length} dev-server hot update(s): ${hot.slice(0, 6).join(' | ')}`); }
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

/**
 * Captures the screens for the dealership admin tutorial video (video/admin-tutorial, made with HyperFrames).
 *
 *   bunx vite --host 127.0.0.1 --port 5173                       # dev server, in another shell
 *   bun run scripts/video/admin-fixture.ts > <outDir>/fixtures.json
 *   node scripts/video/capture-admin.cjs <outDir>
 *
 * There is no admin account in the sandbox (and none is needed): the real /admin page runs in the browser with a
 * stubbed demo session, and every Supabase call it makes is answered here from fixtures.json (the bundled catalogue
 * plus four clearly fictional example.com enquiries). Writes (save, delete, upload) are swallowed locally, so nothing
 * reaches the live database. Writes <outDir>/NN-name.png and manifest.json (box of each control in 1920x1080 film pixels, i.e. CSS pixels x 1.5).
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUT] = process.argv;
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const REF = 'qxlfkfhzpqbxffuqqewg'; // Supabase project ref: the key supabase-js keeps its session under
const FX = JSON.parse(fs.readFileSync(path.join(OUT, 'fixtures.json'), 'utf8'));
const EMAIL = 'dealer@example.com';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const nowS = Math.floor(Date.now() / 1000);
const session = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated', email: EMAIL, exp: nowS + 86400 * 30 })}.demo`,
  token_type: 'bearer', expires_in: 86400 * 30, expires_at: nowS + 86400 * 30, refresh_token: 'demo-refresh',
  user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: EMAIL, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const t0 = Date.now();
  const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  ${s}`);
  const manifest = {}; let n = 0;

  const mk = async (signedIn) => {
    // 1280x720 layout drawn at 1.5x = 1920x1080 pixels: the admin's content column is narrow, so this keeps its text large in the film
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
    if (signedIn) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => log('PAGEERROR ' + e.message));
    const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    await p.route(/supabase\.co\//, async (route) => {
      const req = route.request(); const url = new URL(req.url()); const m = req.method();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      const table = (url.pathname.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
      if (url.pathname.includes('/auth/v1/token')) return json(route, session);
      if (url.pathname.includes('/auth/v1/user')) return json(route, session.user);
      if (url.pathname.includes('/auth/v1/')) return json(route, {});
      if (url.pathname.includes('/storage/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"demo"}' });
      if (!table) return route.abort();
      if (m !== 'GET' && m !== 'HEAD') return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '[]' }); // writes: swallowed
      if (table === 'admin_users') return json(route, { email: EMAIL });
      let rows = FX[table];
      if (!rows) return json(route, []);
      if (url.searchParams.get('active') === 'eq.true') rows = rows.filter((r) => r.active !== false);
      return json(route, rows);
    });
    return { ctx, p };
  };

  let p; const box = async (loc) => { try { const bb = await loc.first().boundingBox({ timeout: 2500 }); return bb && { x: Math.round(bb.x * 1.5), y: Math.round(bb.y * 1.5), w: Math.round(bb.width * 1.5), h: Math.round(bb.height * 1.5) }; } catch { return null; } };
  const shot = async (name, targets = {}) => {
    const file = `${String(++n).padStart(2, '0')}-${name}.png`;
    await p.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }));
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, file), timeout: 120000 });
    const boxes = {}; for (const [k, loc] of Object.entries(targets)) boxes[k] = await box(loc);
    manifest[name] = { file, boxes };
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    log(`shot ${file}`);
  };
  const tab = (label) => p.locator('nav button', { hasText: new RegExp(`^${label}$`, 'i') });
  const row = (text) => p.locator('aside button', { hasText: text }).first();
  const field = (label) => p.locator('section div.space-y-1', { has: p.locator(`div.text-xs:text-is("${label}")`) }).first();
  const scrollTo = async (loc) => { await loc.scrollIntoViewIfNeeded(); await p.evaluate(() => { const s = document.querySelector('.overflow-y-auto.bg-black'); if (s) s.scrollBy(0, 120); }); await p.waitForTimeout(400); };
  const top = () => p.evaluate(() => { const s = document.querySelector('.overflow-y-auto.bg-black'); if (s) s.scrollTo(0, 0); });

  // 1. Signed out: the sign-in form and the first-time / forgotten-password mode
  ({ p } = await mk(false));
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('heading', { name: /admin sign in/i }).waitFor({ timeout: 240000 });
  await p.fill('input[type=email]', 'dealer@example.com');
  await shot('login', { form: p.locator('form'), email: p.locator('input[type=email]'), password: p.locator('input[type=password]'), signin: p.getByRole('button', { name: /^sign in$/i }), forgot: p.getByRole('button', { name: /first time here/i }) });
  await p.getByRole('button', { name: /first time here/i }).click(); await p.waitForTimeout(600);
  await shot('login-reset', { form: p.locator('form'), send: p.getByRole('button', { name: /email me a link/i }) });

  // 2. Signed in (stubbed demo session)
  ({ p } = await mk(true));
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await tab('Cars').waitFor({ timeout: 240000 });
  await p.waitForSelector('aside button', { timeout: 120000 }); await p.waitForTimeout(1200);
  const navBoxes = { tabs: p.locator('nav').first(), cars: tab('Cars'), wheels: tab('Wheels'), finishes: tab('Finishes'), paints: tab('Paints'), enquiries: tab('Enquiries'), newBtn: p.locator('aside button', { hasText: /^\s*New /i }), signout: p.getByRole('button', { name: /sign out/i }), back: p.getByRole('button', { name: /back to studio/i }) };
  await shot('cars-list', { ...navBoxes, list: p.locator('aside').first() });

  await row('BMW M2 CS').click(); await p.waitForTimeout(900);
  await shot('cars-edit', { ...navBoxes, form: p.locator('section').first(), item: row('BMW M2 CS'), hidden: row('· hidden') });
  const paintsF = field('Factory paints'); await scrollTo(paintsF);
  await shot('cars-paints', { field: paintsF });
  const modelF = field('3D model (.glb)'); await scrollTo(modelF);
  await shot('cars-model', { field: modelF, rotation: field('Model rotation (°)'), length: field('Real car length (m)') });
  const vis = field('Visible in configurator'); await scrollTo(vis);
  await shot('cars-visible', { visible: vis, save: p.getByRole('button', { name: /^save$/i }), del: p.getByRole('button', { name: /^delete$/i }) });

  // Wheels
  await top(); await tab('Wheels').click(); await p.waitForTimeout(1200);
  await shot('wheels-list', { ...navBoxes, list: p.locator('aside').first() });
  await row('FF-3').click(); await p.waitForTimeout(900);
  await shot('wheels-edit', { item: row('FF-3'), form: p.locator('section').first(), image: field('Rim image (.png)') });
  const rimF = field('Rim 3D model (.glb) – optional'); await scrollTo(rimF);
  await shot('wheels-model', { field: rimF });
  const sizeF = field('Sizes & set prices (USD, 4 wheels)'); await scrollTo(sizeF);
  await shot('wheels-sizes', { field: sizeF });
  const finF = field('Available finishes'); await scrollTo(finF);
  await shot('wheels-finishes', { field: finF, dearer: field('Dearer finishes (USD set price)') });
  const dearF = field('Dearer finishes (USD set price)'); await scrollTo(dearF);
  await shot('wheels-dearer', { field: dearF });
  // change a price and save: the write is swallowed locally, the panel reports it as saved
  const priceInput = sizeF.locator('input[type=number]').nth(1);
  await scrollTo(sizeF); await priceInput.fill('4200'); await p.waitForTimeout(500);
  await shot('wheels-price-edit', { price: priceInput, save: p.getByRole('button', { name: /^save$/i }) });
  await p.getByRole('button', { name: /^save$/i }).click(); await p.waitForTimeout(1500); await top();
  await shot('wheels-saved', { message: p.locator('p.text-emerald-400') });

  // Finishes and paints
  await tab('Finishes').click(); await p.waitForTimeout(1200); await row('Pure Bronze').click(); await p.waitForTimeout(900);
  await shot('finishes-edit', { form: p.locator('section').first(), colour: field('Colour'), metal: field('Metalness (0–1)') });
  await tab('Paints').click(); await p.waitForTimeout(1200); await row('Black Sapphire').click(); await p.waitForTimeout(900);
  await shot('paints-edit', { form: p.locator('section').first(), colour: field('Colour'), type: field('Type') });

  // A new wheel (blank form)
  await tab('Wheels').click(); await p.waitForTimeout(1000);
  await p.locator('aside button', { hasText: /^\s*New wheel/i }).click(); await p.waitForTimeout(900);
  await shot('wheels-new', { form: p.locator('section').first(), id: field('ID (slug)') });

  // Enquiries
  await tab('Enquiries').click(); await p.waitForSelector('ul li', { timeout: 60000 }); await p.waitForTimeout(1200);
  await shot('enquiries', { tabs: tab('Enquiries'), refresh: p.getByRole('button', { name: /refresh/i }), exportCsv: p.getByRole('button', { name: /export csv/i }), first: p.locator('ul li').first(), count: p.locator('p', { hasText: /enquir/i }).first() });

  await b.close();
  log('done');
})().catch((e) => { console.error(e); process.exit(2); });

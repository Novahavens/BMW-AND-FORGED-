/**
 * Wheel-swap performance: drives the real configurator to the wheels step and taps every wheel in
 * turn (the catalogue mixes mono, two- and three-piece lips), changing the rim size twice, at a
 * desktop and a phone size. Records every long main-thread task (PerformanceObserver 'longtask')
 * against the tap it followed, the time from each tap until the new spokes are in the scene, and
 * page errors. Same Playwright/SwiftShader launch and Supabase storage routing as journey.cjs.
 *
 *   bunx vite --host 127.0.0.1 --port 5173            # dev server, in another shell
 *   node scripts/render/swap-perf.cjs <out.json> <rimCacheDir> [phone|desktop|both] [cold|preload]
 *
 * Modes: `cold` turns the engine's wheel preloading off (every first tap of a wheel builds it from
 * scratch) and taps as soon as the wheels step opens; `preload` waits until the preloader has
 * prepared every wheel (and rim size) before tapping. Each run taps the whole list twice: pass 1 (first taps),
 * pass 2 (every wheel seen before).
 *
 * The harness finds the engine by rewriting the dev server's CarConfiguratorEngine.ts so the
 * constructor registers itself on window.__engines (nothing in the app changes). "Spokes in the
 * scene" = the right-front spoke mesh is a different geometry from before the tap (scene graph,
 * polled every 10 ms); "drawn" = the first animation frame that sees it (slow under SwiftShader).
 * SwiftShader inflates GPU time: judge the main-thread numbers, and compare runs, not absolutes.
 * A CPU profile runs alongside, so each long task also records how much of it was spent waiting
 * inside WebGL calls (uploads, shader compiles); `maxLongJsMs` is the longest task without that.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [,, OUTFILE, RIMS, which = 'both', mode = 'cold'] = process.argv;
if (!OUTFILE || !RIMS) { console.error('usage: swap-perf.cjs <out.json> <rimCacheDir> [phone|desktop|both] [cold|preload]'); process.exit(2); }
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const PORT = process.env.PORT || 5173;

(async () => {
  fs.mkdirSync(path.dirname(path.resolve(OUTFILE)), { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const result = { mode, startedAt: new Date().toISOString(), sizes: {} };
  for (const name of Object.keys(SIZES)) {
    if (which !== 'both' && which !== name) continue;
    const { width, height, ...dev } = SIZES[name];
    const ctx = await b.newContext({ viewport: { width, height }, ...dev });
    const p = await ctx.newPage();
    p.setDefaultTimeout(180000); // SwiftShader: the page can be busy for a while
    const t0 = Date.now();
    const errors = [];
    const log = (s) => console.log(`${name} ${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
    p.on('pageerror', (e) => { errors.push(e.message); log('PAGEERROR ' + e.message); });
    p.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_CERT|Failed to load resource|ERR_NAME|net::/.test(t)) { errors.push('console.error ' + t.slice(0, 200)); log('console.error ' + t.slice(0, 200)); } } });
    await p.addInitScript((noPreload) => {
      window.__noPreload = noPreload;
      window.__long = [];
      window.__taps = [];
      window.__sig = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
      // the click that runs React's handler
      window.addEventListener('click', () => window.__taps.push(performance.now()), true);
      const engine = () => (window.__engines || []).filter((x) => !x.isShowcase && !x.isDisposed).pop();
      const sig = () => {
        const e = engine();
        const a = e && e.wheelAssemblies && e.wheelAssemblies[1];
        if (!a) return { spokes: null, rim: null };
        let mesh = null;
        a.spokeMeshGroup.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        return { spokes: mesh ? mesh.geometry.uuid : null, rim: a.rim ? a.rim.uuid : null };
      };
      // the scene graph, checked every 10 ms (when the main thread is free), and every frame:
      // SwiftShader can take seconds per frame, so "drawn" lags "in the scene" here
      window.__sigFrame = [];
      let last = '', lastF = '';
      setInterval(() => {
        const s = sig();
        const k = `${s.spokes}|${s.rim}`;
        if (k !== last) { last = k; window.__sig.push([performance.now(), s.spokes, s.rim]); }
      }, 10);
      const poll = () => {
        const s = sig();
        const k = `${s.spokes}|${s.rim}`;
        if (k !== lastF) { lastF = k; window.__sigFrame.push([performance.now(), s.spokes, s.rim]); }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
      window.__cacheState = async () => {
        const e = engine();
        if (!e || !e.rimFaceCache) return { size: 0, settled: 0 };
        const ps = [...e.rimFaceCache.values()];
        let settled = 0;
        await Promise.all(ps.map((q) => Promise.race([q.then(() => settled++, () => settled++), new Promise((r) => setTimeout(r, 0))])));
        // rim sizes prepared in the background (engines that have them)
        const sizes = e.readyScales ? { sizesReady: e.readyScales.size, sizesPending: Math.max(e.sizeJobs.size, e.sizesPreloaded.size - e.readyScales.size) } : {};
        return { size: ps.length, settled, ...sizes };
      };
    }, mode === 'cold');
    let injected = false;
    await p.route(/\/services\/CarConfiguratorEngine\.ts(\?|$)/, async (r) => {
      const resp = await r.fetch();
      let body = await resp.text();
      const hook = 'this.container = container;';
      if (body.includes(hook)) {
        injected = true;
        body = body.replace(hook, `${hook} (window.__engines ||= []).push(this); if (window.__noPreload) { this.preloadWheels = () => {}; }`);
      }
      r.fulfill({ response: resp, body });
    });
    await p.route(/supabase\.co\/storage\//, (r) => {
      const f = path.join(RIMS, path.basename(r.request().url().split('?')[0]));
      if (fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
      else r.continue();
    });

    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().waitFor({ timeout: 240000 });
    if (!injected) log('WARNING: engine hook not injected; spoke times will be missing');
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /enter|start|begin|discover/i }).first().click({ timeout: 180000 });
    await p.getByRole('button', { name: /^build$/i }).waitFor({ timeout: 60000 });
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /^build$/i }).click({ timeout: 180000 });
    await p.getByRole('button', { name: /^confirm$/i }).click({ timeout: 180000 });
    await p.getByRole('button', { name: /step 2: wheels/i }).first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(2500);
    const carName = await p.locator('aside .font-display').first().textContent().catch(() => '?');
    // wait for the first spokes (bundled + Supabase catalogue both applied)
    await p.waitForFunction(() => window.__sig.length && window.__sig[window.__sig.length - 1][1], null, { timeout: 120000 }).catch(() => log('no initial spokes'));
    await p.waitForTimeout(3000);

    const events = []; // {kind, label, tapAt, ...}
    const mark = () => p.evaluate(() => ({ taps: window.__taps.length, now: performance.now() }));
    const tapIt = async (kind, label, locator, waitFor) => {
      const before = await p.evaluate(() => { const s = window.__sig[window.__sig.length - 1] || [0, null, null]; return { spokes: s[1], rim: s[2], taps: window.__taps.length }; });
      await locator.click();
      const tapAt = await p.waitForFunction((n) => window.__taps.length > n && window.__taps[n], before.taps, { timeout: 90000 }).then((h) => h.jsonValue());
      let doneAt = null;
      if (waitFor) {
        doneAt = await p.waitForFunction(({ t, b, what }) => {
          const hit = window.__sig.find(([at, spokes, rim]) => at >= t && (what === 'spokes' ? spokes && spokes !== b.spokes : rim && rim !== b.rim));
          return hit ? hit[0] : false;
        }, { t: tapAt, b: before, what: waitFor }, { timeout: 45000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
      }
      let frameAt = null;
      if (waitFor && doneAt) {
        frameAt = await p.waitForFunction(({ t, b, what }) => {
          const hit = window.__sigFrame.find(([at, spokes, rim]) => at >= t && (what === 'spokes' ? spokes && spokes !== b.spokes : rim && rim !== b.rim));
          return hit ? hit[0] : false;
        }, { t: tapAt, b: before, what: waitFor }, { timeout: 60000, polling: 100 }).then((h) => h.jsonValue()).catch(() => null);
      }
      await p.waitForTimeout(1800); // trailing work (uploads, shadow frames)
      const after = await p.evaluate(() => window.__sig[window.__sig.length - 1] || [0, null, null]);
      const ev = { kind, label, tapAt, doneAt, ms: doneAt ? Math.round(doneAt - tapAt) : null, frameMs: frameAt ? Math.round(frameAt - tapAt) : null, spokes: after[1] };
      events.push(ev);
      log(`${kind} ${label}: ${ev.ms ?? 'n/a'} ms in the scene, ${ev.frameMs ?? 'n/a'} ms drawn`);
      return ev;
    };

    const wheelButtons = () => p.locator('aside ul li > button');
    const openWheels = async () => {
      await tapIt('nav', 'wheels step', p.getByRole('button', { name: /step 2: wheels/i }).first(), null);
      await wheelButtons().first().waitFor({ timeout: 180000 }).catch(async (e) => { await p.screenshot({ path: OUTFILE.replace(/\.json$/, '') + `-${name}-FAIL.png` }); throw e; });
    };
    const changeSize = async (n) => {
      await tapIt('nav', 'size step', p.getByRole('button', { name: /step 3: size/i }).first(), null);
      const sizes = p.locator('aside button', { hasText: /^\d\d"/ });
      const count = await sizes.count();
      if (count < 2) { log('size: fewer than two sizes'); return; }
      // the first size not selected (gold), alternating from the ends
      const texts = await sizes.evaluateAll((els) => els.map((e) => ({ t: e.textContent.slice(0, 3), active: /bg-gold/.test(e.className) })));
      const order = n % 2 ? [...texts.keys()] : [...texts.keys()].reverse();
      const pick = order.find((i) => !texts[i].active);
      await tapIt('size', texts[pick].t, sizes.nth(pick), 'rim');
      await openWheels();
    };

    // CPU profile of the taps, to tell JavaScript from time spent waiting inside WebGL calls (on
    // SwiftShader a texture or buffer upload waits for the software GPU to finish its frame)
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
    await cdp.send('Profiler.start');
    const calibAt = await p.evaluate(() => {
      const t = performance.now();
      (function __swapCalib() { while (performance.now() - t < 60); })();
      return t;
    });
    await openWheels();
    await p.waitForTimeout(500);
    let preload = null;
    if (mode === 'preload') {
      // let the preloader prepare every wheel (it runs in idle time after the wheels step opens)
      const s0 = Date.now();
      let st = { size: 0, settled: 0 }, stableSince = Date.now(), lastSize = -1;
      while (Date.now() - s0 < 180000) {
        st = await p.evaluate(() => window.__cacheState());
        const k = st.size * 100 + (st.sizesReady || 0);
        if (k !== lastSize) { lastSize = k; stableSince = Date.now(); }
        if (st.size > 0 && st.settled === st.size && !st.sizesPending && Date.now() - stableSince > 4000) break;
        await p.waitForTimeout(500);
      }
      preload = { ms: Date.now() - s0, ...st };
      log(`preload: ${JSON.stringify(preload)}`);
      await p.waitForTimeout(1000);
      const now = (await mark()).now;
      events.push({ kind: 'preload', label: 'idle preload', tapAt: 0, doneAt: now, ms: null });
    }

    const n = await wheelButtons().count();
    const labels = await wheelButtons().evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    log(`${carName}: ${n} wheels`);
    const activeIndex = await wheelButtons().evaluateAll((els) => els.findIndex((e) => /bg-ink\/\[0\.045\]/.test(e.className)));
    for (let pass = 1; pass <= 2; pass++) {
      // every wheel in list order starting after the current one, ending back on it
      const start = Math.max(0, activeIndex);
      for (let k = 1; k <= n; k++) {
        const i = (start + k) % n;
        const ev = await tapIt('wheel', labels[i].split(' · ')[0], wheelButtons().nth(i), 'spokes');
        ev.pass = pass; ev.style = (labels[i].match(/(Mono\w*|Two-Piece|Three-Piece)/i) || [])[1] || '';
        if (pass === 1 && (k === 3 || k === 7)) await changeSize(k);
      }
    }

    // rapid taps: three wheels 120 ms apart must end on the last one (its spokes from pass 2)
    const rapid = { picks: [], ok: false };
    if (n >= 4) {
      const picks = [1, 2, 3].map((d) => (Math.max(0, activeIndex) + d) % n);
      const last = events.filter((e) => e.kind === 'wheel' && e.pass === 2 && e.label === labels[picks[2]].split(' · ')[0]).pop();
      const t = (await mark()).now;
      for (const i of picks) { await wheelButtons().nth(i).click(); await p.waitForTimeout(120); }
      await p.waitForTimeout(6000);
      const fin = await p.evaluate(() => window.__sig[window.__sig.length - 1] || [0, null, null]);
      const activeNow = await wheelButtons().evaluateAll((els) => els.findIndex((e) => /bg-ink\/\[0\.045\]/.test(e.className)));
      rapid.picks = picks.map((i) => labels[i].split(' · ')[0]);
      rapid.ok = !!last && fin[1] === last.spokes && activeNow === picks[2];
      events.push({ kind: 'rapid', label: rapid.picks.join(' > '), tapAt: t, doneAt: null, ms: null });
      log(`rapid taps ${rapid.picks.join(' > ')}: ${rapid.ok ? 'ended on the last' : 'WRONG WHEEL'}`);
    }

    // long tasks, each to the latest tap (or the preload) that started before it
    const longs = await p.evaluate(() => window.__long);
    const { profile } = await cdp.send('Profiler.stop');
    const glTime = profileGlTime(profile, calibAt);
    const sorted = events.slice().sort((a, b) => a.tapAt - b.tapAt);
    for (const ev of events) ev.longtasks = [];
    const unattributed = [];
    for (const [start, dur] of longs) {
      let owner = null;
      for (const ev of sorted) if (ev.tapAt <= start + 1) owner = ev;
      const nextTap = owner ? sorted[sorted.indexOf(owner) + 1] : null;
      if (owner && (!nextTap || start < nextTap.tapAt)) owner.longtasks.push([Math.round(start - owner.tapAt), Math.round(dur), glTime(start, dur), glTime.top()]);
      else unattributed.push([Math.round(start), Math.round(dur)]);
    }
    for (const ev of events) {
      ev.maxLong = ev.longtasks.reduce((m, [, d]) => Math.max(m, d), 0);
      ev.sumLong = ev.longtasks.reduce((m, [, d]) => m + d, 0);
      // the part of each long task that is not spent inside WebGL calls (null: no profile)
      ev.maxLongJs = ev.longtasks.reduce((m, [, d, gl]) => Math.max(m, gl == null ? d : d - gl), 0);
      ev.tapAt = Math.round(ev.tapAt); ev.doneAt = ev.doneAt && Math.round(ev.doneAt);
    }
    const wheels = (pass) => events.filter((e) => e.kind === 'wheel' && e.pass === pass);
    const stat = (list) => ({
      taps: list.length,
      maxLongMs: Math.max(0, ...list.map((e) => e.maxLong)),
      meanSumLongMs: Math.round(list.reduce((s, e) => s + e.sumLong, 0) / Math.max(1, list.length)),
      maxLongJsMs: Math.max(0, ...list.map((e) => e.maxLongJs)),
      tapsOver50: list.filter((e) => e.maxLong > 50).length,
      tapsOver120: list.filter((e) => e.maxLong > 120).length,
      spokesMedianMs: median(list.map((e) => e.ms).filter((v) => v != null)),
      spokesMaxMs: Math.max(0, ...list.map((e) => e.ms ?? 0)),
      drawnMedianMs: median(list.map((e) => e.frameMs).filter((v) => v != null)),
      missing: list.filter((e) => e.ms == null).length
    });
    const summary = { pass1: stat(wheels(1)), pass2: stat(wheels(2)), size: stat(events.filter((e) => e.kind === 'size')) };
    result.sizes[name] = { car: carName, wheels: n, preload, summary, rapid, events, unattributedLongtasks: unattributed, errors, injected };
    log(`summary ${JSON.stringify(summary)}`);
    fs.writeFileSync(OUTFILE, JSON.stringify(result, null, 1));
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });

/** (start, dur) of a page long task -> ms of profile samples inside WebGL calls during it. */
function profileGlTime(profile, calibAt) {
  const GL = /^(tex(Sub)?Image[23]D|compressedTex.*|generateMipmap|buffer(Sub)?Data|readPixels|getError|finish|flush|get(Program|Shader)(InfoLog|Parameter)|linkProgram|compileShader|clientWaitSync|getParameter|draw(Arrays|Elements).*)$/;
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const times = []; let t = profile.startTime;
  for (const d of profile.timeDeltas) { t += d; times.push(t / 1000); }
  const calibIdx = profile.samples.findIndex((id) => byId.get(id).callFrame.functionName === '__swapCalib');
  if (calibIdx < 0) return Object.assign(() => null, { top: () => '' });
  const offset = times[calibIdx] - calibAt; // profile ms = page ms + offset
  const fnTime = new Map();
  const glTime = (start, dur) => {
    let gl = 0;
    fnTime.clear();
    for (let i = 0; i < profile.samples.length - 1; i++) {
      const at = times[i] - offset;
      if (at < start || at > start + dur) continue;
      const fn = byId.get(profile.samples[i]).callFrame;
      const dt = times[i + 1] - times[i];
      if (!fn.url && GL.test(fn.functionName)) gl += dt;
      const k = `${fn.functionName || '(anonymous)'} ${fn.url.split('/').pop().split('?')[0]}:${fn.lineNumber + 1}`;
      fnTime.set(k, (fnTime.get(k) || 0) + dt);
    }
    return Math.round(gl);
  };
  /** The functions that took most of a long task (self time), for the record. */
  glTime.top = () => [...fnTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v)}ms`).join(', ');
  return glTime;
}

function median(v) {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

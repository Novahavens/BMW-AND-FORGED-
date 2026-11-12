/**
 * Builds index.html + compositions/sNN.html from the SCENES table below.
 *
 *   node build.mjs            # reads assets/shots/manifest.json and (if present) assets/voice/meta.json
 *
 * - Boxes (where a control is on screen) come from the capture manifest, so the cursor and ring land on the real buttons.
 * - Timing: when assets/voice/meta.json exists ({ s02: { duration, words: [{text,start,end}] } }) a beat lands on its
 *   anchor word and a scene is as long as its voice-over; before that the timing is estimated at 2.35 words a second.
 * - The voice-over text is the script; the cards say the function name and its purpose in different words (SPEC.md).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const W = 1920, H = 1080, WPS = 2.35, LEAD = 0.5, TAIL = 0.9;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/shots/manifest.json'), 'utf8'));
const voiceMetaPath = path.join(ROOT, 'assets/voice/meta.json');
const voiceMeta = fs.existsSync(voiceMetaPath) ? JSON.parse(fs.readFileSync(voiceMetaPath, 'utf8')) : {};
const has = (f) => fs.existsSync(path.join(ROOT, f));

// A beat: { at: anchor word in the voice-over, ref: [shot, control] | box: [x,y,w,h], label, text, click, show, card:false }
const SCENES = [
  { id: 'a01', base: 'cars-list', focus: [960, 300],
    vo: "Every car, wheel, price and finish your customers see in the configurator is managed from one place. This is the dealership admin, and here's how it works.",
    beats: [{ at: 'dealership', ref: ['cars-list', 'tabs'], label: 'FORGEDSA ADMIN', text: 'Your catalogue, in one place', pos: 'bl' }] },
  { id: 'a02', base: 'login', focus: [960, 540],
    vo: "Open slash admin and sign in with your email and password. Only emails on the dealership's allowlist get through. And if it's your first time, or you've forgotten your password, tap the link underneath, and it emails you a link to set a new one.",
    beats: [
      { at: 'email', ref: ['login', 'email'], label: 'SIGN IN', text: 'Only allowlisted emails get in', pos: 'bl' },
      { at: 'tap', ref: ['login', 'forgot'], label: 'FIRST TIME?', text: 'Set or reset your password', click: true, show: 'login-reset', pos: 'bl' },
      { at: 'emails', ref: ['login-reset', 'send'], label: 'ONE-TIME LINK', text: 'Sent to your admin email', pos: 'bl' }
    ] },
  { id: 'a03', base: 'cars-list', focus: [960, 300],
    vo: "Once you're in, five tabs run everything: cars, wheels, finishes, paints and enquiries. Anything you change here shows up in the configurator as soon as you save.",
    beats: [{ at: 'five', ref: ['cars-list', 'tabs'], label: 'FIVE TABS', text: 'Everything the configurator shows', pos: 'bl' }] },
  { id: 'a04', base: 'cars-list', focus: [400, 540],
    vo: "On the left, a list of everything in that tab. Anything marked hidden is switched off for customers but still here, so nothing is lost. Pick an item to edit it, or press New to add one.",
    beats: [
      { at: 'list', ref: ['cars-list', 'list'], label: 'THE LIST', text: 'Every item in the tab' },
      { at: 'hidden', ref: ['cars-edit', 'hidden'], label: 'HIDDEN', text: 'Off for customers, never deleted', show: 'cars-edit' },
      { at: 'New', ref: ['cars-list', 'newBtn'], label: 'NEW', text: 'Add a car, wheel, finish or paint', click: true, show: 'cars-list' }
    ] },
  { id: 'a05', base: 'cars-edit', focus: [1100, 540],
    vo: "Open a car and its details are right there: the name, the engine, the power, and the factory fitment, which customers see on their summary.",
    beats: [{ at: 'details', ref: ['cars-edit', 'form'], label: 'CAR DETAILS', text: 'What customers see on the summary', pos: 'bl' }] },
  { id: 'a06', base: 'cars-paints', focus: [1000, 540],
    vo: "Tick the factory paints this car is offered in. Tick none, and it offers every visible paint.",
    beats: [{ at: 'Tick', ref: ['cars-paints', 'field'], label: 'PAINTS PER CAR', text: 'Choose the colours it comes in', pos: 'bl' }] },
  { id: 'a07', base: 'cars-model', focus: [1000, 540],
    vo: "Here's the car's 3D model. Upload a new G L B to replace it, set the rotation so the nose faces the camera, and give it the real car length, so it's scaled correctly.",
    beats: [
      { at: 'Upload', ref: ['cars-model', 'field'], label: '3D MODEL', text: 'Replace the car in one upload', pos: 'bl' },
      { at: 'rotation', ref: ['cars-model', 'rotation'], label: 'ROTATION', text: 'Nose to the camera', pos: 'bl' },
      { at: 'length', ref: ['cars-model', 'length'], label: 'REAL LENGTH', text: 'Scales it true to size', pos: 'bl' }
    ] },
  { id: 'a08', base: 'cars-visible', focus: [1000, 700],
    vo: "Untick Visible to hide a car without deleting it. Delete is permanent, so it asks you to confirm first. And Save publishes your changes to the configurator.",
    beats: [
      { at: 'Untick', ref: ['cars-visible', 'visible'], label: 'VISIBLE', text: 'Hide without deleting', pos: 'tl' },
      { at: 'Delete', ref: ['cars-visible', 'del'], label: 'DELETE', text: 'Permanent, so it asks first', pos: 'tl' },
      { at: 'Save', ref: ['cars-visible', 'save'], label: 'SAVE', text: 'Publishes to the configurator', click: true, pos: 'tl' }
    ] },
  { id: 'a09', base: 'wheels-edit', focus: [1100, 540],
    vo: "Wheels work the same way. Each one has a code, a name, a style, and a rim picture that the configurator turns into 3D spokes.",
    beats: [
      { at: 'code', ref: ['wheels-edit', 'form'], label: 'WHEELS', text: 'Same editor, wheel by wheel', pos: 'bl' },
      { at: 'picture', ref: ['wheels-edit', 'image'], label: 'RIM IMAGE', text: 'Turned into 3D spokes', pos: 'bl' }
    ] },
  { id: 'a10', base: 'wheels-model', focus: [1000, 540],
    vo: "For the best quality, upload the manufacturer's 3D file. If it's a STEP, IGES, S T L or O B J, it's converted in the browser first. Staggered set? There's a separate rear file too.",
    beats: [{ at: 'upload', ref: ['wheels-model', 'field'], label: 'RIM 3D MODEL', text: 'Best quality: the maker\'s own file', pos: 'bl' }] },
  { id: 'a11', base: 'wheels-sizes', focus: [1000, 540],
    vo: "Sizes and prices live here. Only the sizes you list are offered, and each price is for a full set of four, stored in dollars, so every customer sees it in their own currency.",
    beats: [{ at: 'Sizes', ref: ['wheels-sizes', 'field'], label: 'SIZES & PRICES', text: 'A full set of four, per size', pos: 'bl' }] },
  { id: 'a12', base: 'wheels-finishes', focus: [1000, 540],
    vo: "Next, choose which finishes this wheel comes in. And if a finish costs more, like Polished Face or Liquid Metal, set its price underneath. Leave it blank and it costs the same as the rest.",
    beats: [
      { at: 'choose', ref: ['wheels-finishes', 'field'], label: 'FINISHES', text: 'Only what it really comes in', pos: 'bl' },
      { at: 'costs', ref: ['wheels-finishes', 'dearer'], label: 'DEARER FINISHES', text: 'A higher set price, per finish', pos: 'tl' }
    ] },
  { id: 'a13', base: 'wheels-price-edit', focus: [1000, 400],
    vo: "To change a price, type the new figure and press Save. You'll get a green confirmation, and the configurator picks up the change straight away.",
    beats: [
      { at: 'type', ref: ['wheels-price-edit', 'price'], label: 'EDIT A PRICE', text: 'Just type it', pos: 'bl' },
      { at: 'Save', ref: ['wheels-price-edit', 'save'], label: 'SAVE', text: 'Live on save', click: true, show: 'wheels-saved', pos: 'bl' },
      { at: 'green', ref: ['wheels-saved', 'message'], label: 'CONFIRMED', text: 'Saved, and the catalogue reloads', pos: 'br' }
    ] },
  { id: 'a14', base: 'finishes-edit', focus: [1000, 540],
    vo: "Finishes and paints are edited the same way. Pick the colour, then how metallic, how rough, and how glossy it is, so it looks like the real coating on the car.",
    beats: [
      { at: 'colour', ref: ['finishes-edit', 'colour'], label: 'FINISHES', text: 'Colour and reflection', pos: 'bl' },
      { at: 'metallic', ref: ['finishes-edit', 'metal'], label: 'METAL, ROUGH, GLOSS', text: 'Matches the real coating', pos: 'bl' },
      { at: 'real', ref: ['paints-edit', 'type'], label: 'PAINTS TOO', text: 'Same fields, for factory colours', show: 'paints-edit', pos: 'bl' }
    ] },
  { id: 'a15', base: 'wheels-new', focus: [1000, 400],
    vo: "To add something new, press New, give it a unique ID, add the pictures or the 3D file, set the sizes, and save.",
    beats: [{ at: 'unique', ref: ['wheels-new', 'id'], label: 'NEW WHEEL', text: 'The ID can\'t change later', pos: 'bl' }] },
  { id: 'a16', base: 'enquiries', focus: [1000, 540],
    vo: "And finally, enquiries. Every enquiry form and every PDF download from the configurator lands here, newest first, with the customer's details and the exact build they chose. Reply opens an email to them, Open build reopens their configuration, and Export CSV gives you a spreadsheet.",
    beats: [
      { at: 'enquiries', ref: ['enquiries', 'count'], label: 'ENQUIRIES · SAMPLE DATA', text: 'Every lead, newest first', pos: 'bl' },
      { at: 'exact', ref: ['enquiries', 'first'], label: 'THE BUILD', text: 'Exactly what they chose', pos: 'bl' },
      { at: 'Reply', box: [1407, 309, 115, 45], label: 'REPLY', text: 'Emails the customer', pos: 'bl' },
      { at: 'Open', box: [1535, 309, 161, 45], label: 'OPEN BUILD', text: 'Their configuration, reopened', pos: 'bl' },
      { at: 'Export', ref: ['enquiries', 'exportCsv'], label: 'EXPORT CSV', text: 'Straight into a spreadsheet', pos: 'bl' }
    ] },
  { id: 'a17', kind: 'end',
    vo: "That's the whole admin. Your cars, your wheels, your prices, and every enquiry, all in one place. Forged S A.",
    beats: [] }
];

// ---- timing ---------------------------------------------------------------------------------------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function wordsOf(scene) {
  const m = voiceMeta[scene.id];
  if (m?.words?.length) return m.words;
  const toks = scene.vo.split(/\s+/);
  return toks.map((t, i) => ({ text: t, start: LEAD + i / WPS, end: LEAD + (i + 1) / WPS }));
}
function voiceEnd(scene) { const m = voiceMeta[scene.id]; return m?.duration ? LEAD + m.duration : LEAD + scene.vo.split(/\s+/).length / WPS; }
function resolveBeats(scene) {
  const ws = wordsOf(scene); let from = 0; let prev = 0.4;
  return scene.beats.map((b, i) => {
    let idx = ws.findIndex((w, k) => k >= from && norm(w.text).startsWith(norm(b.at)));
    if (idx < 0) idx = Math.min(ws.length - 1, from);
    from = idx + 1;
    const t = Math.max(prev + 1.7, ws[idx].start + 0.05);
    prev = t;
    return { ...b, t };
  });
}

// ---- geometry -------------------------------------------------------------------------------------
function boxOf(b) {
  if (b.box) { const [x, y, w, h] = b.box; return { x, y, w, h }; }
  if (b.ref) { const bb = manifest[b.ref[0]]?.boxes?.[b.ref[1]]; if (bb) return bb; console.warn(`! no box for ${b.ref.join('.')}`); }
  return null;
}
const CARD_W = 560;
function cardRect(b, bx, hHint) {
  const slots = { bl: [72, H - 72 - hHint], br: [W - 72 - CARD_W, H - 72 - hHint], tl: [72, 140], tr: [W - 72 - CARD_W, 140] };
  const order = b.pos ? [b.pos] : ['bl', 'br', 'tr', 'tl'];
  const hit = (s) => bx && !(s[0] + CARD_W < bx.x - 40 || s[0] > bx.x + bx.w + 40 || s[1] + hHint < bx.y - 40 || s[1] > bx.y + bx.h + 40);
  const pick = order.find((k) => !hit(slots[k])) || order[0];
  return slots[pick];
}

// ---- scene file -----------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = `
@font-face { font-family: 'Satoshi'; src: url('assets/fonts/satoshi-500.woff2') format('woff2'); font-weight: 500; }
@font-face { font-family: 'Satoshi'; src: url('assets/fonts/satoshi-700.woff2') format('woff2'); font-weight: 700; }
@font-face { font-family: 'Satoshi'; src: url('assets/fonts/satoshi-900.woff2') format('woff2'); font-weight: 900; }`;

function sceneDuration(scene, beats) {
  const last = beats.length ? beats[beats.length - 1].t + 1.6 : 0;
  return +Math.max(voiceEnd(scene) + TAIL, last, 3).toFixed(2);
}

function buildScene(scene, beats, dur) {
  const id = scene.id;
  if (scene.kind === 'end') return buildEnd(scene, dur);
  const imgs = [...new Set([scene.base, ...beats.map((b) => b.show).filter(Boolean)])];
  const file = (n) => (n === 'hero' ? 'assets/shots/hero.png' : `assets/shots/${manifest[n].file}`);
  const [fx, fy] = scene.focus || [960, 540];
  const els = []; const tw = [];
  // camera layer: image stack, ring, cursor
  let html = `<div id="${id}-cam" class="clip" data-start="0" data-duration="${dur}" data-track-index="0"><div id="${id}-cami" class="cam">`;
  imgs.forEach((n, i) => { html += `<img id="${id}-img-${i}" class="shot" src="${file(n)}" alt="" style="opacity:${i === 0 ? 1 : 0}">`; });
  beats.forEach((b, i) => {
    const bx = boxOf(b); if (!bx) return; const pad = 12;
    html += `<div id="${id}-ring-${i}" class="ring" style="left:${bx.x - pad}px;top:${bx.y - pad}px;width:${bx.w + pad * 2}px;height:${bx.h + pad * 2}px"></div>`;
    if (b.click) html += `<div id="${id}-click-${i}" class="click" style="left:${Math.round(bx.x + bx.w / 2 - 60)}px;top:${Math.round(bx.y + bx.h / 2 - 60)}px"></div>`;
  });
  html += `<svg id="${id}-cur" class="cur" viewBox="0 0 24 24" width="40" height="40"><path d="M3 2 L3 19 L8 14.5 L11.2 21.5 L14 20.3 L10.9 13.4 L17.5 13 Z" fill="#fff" stroke="#0b0b0c" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  html += `</div></div>`;
  // camera push
  // A push on a real UI screen crops the edges (the panel's price, the back button): keep it to 2.5% about a point
  // near the centre, so the outermost control stays inside the frame. Only the hero render (no UI) pushes further.
  const hero = scene.kind === 'hero';
  const ox = hero ? fx : Math.round(960 + (fx - 960) * 0.25), oy = hero ? fy : Math.round(540 + (fy - 540) * 0.25);
  tw.push(`gsap.set("#${id}-cami",{transformOrigin:"${ox}px ${oy}px"});`);
  tw.push(`tl.fromTo("#${id}-cami",{scale:1},{scale:${hero ? 1.1 : 1.025},duration:${dur},ease:"sine.inOut"},0);`);
  // beats
  let cx = scene.kind === 'hero' ? 0 : W * 0.5, cy = scene.kind === 'hero' ? 0 : H + 60; // cursor starts below the frame
  let shown = 0; let curPlaced = false;
  const cardBeats = beats.map((b, i) => i).filter((i) => beats[i].card !== false && (beats[i].label || beats[i].text));
  beats.forEach((b, i) => {
    const bx = boxOf(b);
    const t = b.t;
    if (bx) {
      const tx = Math.round(bx.x + bx.w * 0.5), ty = Math.round(bx.y + bx.h * 0.5);
      const t0 = Math.max(0.1, t - 0.8);
      if (!curPlaced) { tw.push(`gsap.set("#${id}-cur",{x:${cx},y:${cy},opacity:0});`); curPlaced = true; }
      tw.push(`tl.to("#${id}-cur",{x:${tx},y:${ty},opacity:1,duration:0.8,ease:"power3.inOut"},${t0.toFixed(2)});`);
      // target ring: fixed box, fades and settles in; leaves before the next beat
      const ringEnd = t + (beats[i + 1] ? Math.max(0.5, Math.min(1.4, beats[i + 1].t - t - 1.0)) : 1.1);
      tw.push(`tl.fromTo("#${id}-ring-${i}",{opacity:0,scale:1.12},{opacity:1,scale:1,duration:0.25,ease:"power4.out"},${(t - 0.3).toFixed(2)});`);
      tw.push(`tl.to("#${id}-ring-${i}",{opacity:0,duration:0.25,ease:"power2.in"},${ringEnd.toFixed(2)});`);
      if (b.click) {
        tw.push(`tl.fromTo("#${id}-click-${i}",{opacity:1,scale:0.3},{opacity:0,scale:1,duration:0.4,ease:"power2.out"},${t.toFixed(2)});`);
        tw.push(`tl.to("#${id}-cur",{scale:0.86,duration:0.08,ease:"power1.in",transformOrigin:"3px 2px"},${(t - 0.02).toFixed(2)});`);
        tw.push(`tl.to("#${id}-cur",{scale:1,duration:0.14,ease:"power2.out",transformOrigin:"3px 2px"},${(t + 0.08).toFixed(2)});`);
        if (has('assets/sfx/click.wav')) els.push({ audio: `${id}-clk-${i}`, src: 'assets/sfx/click.wav', at: t - 0.04, dur: 0.37, vol: 0.9 });
      }
      cx = tx; cy = ty;
    }
    if (b.show && b.show !== imgs[shown >= 0 ? shown : 0]) {
      const k = imgs.indexOf(b.show);
      tw.push(`tl.set("#${id}-img-${k}",{opacity:1},${(t + 0.12).toFixed(2)});`);
      imgs.forEach((_, j) => { if (j !== k) tw.push(`tl.set("#${id}-img-${j}",{opacity:0},${(t + 0.12).toFixed(2)});`); });
      shown = k;
    }
  });
  // cards: one per beat that has one; visible until the next card beat starts
  let cards = '';
  cardBeats.forEach((i, n) => {
    const b = beats[i]; const bx = boxOf(b);
    const nextT = n + 1 < cardBeats.length ? beats[cardBeats[n + 1]].t - 0.5 : dur - 0.25;
    const show = Math.max(0, b.t - 0.55); const end = Math.max(show + 1.2, nextT);
    const [x, y] = cardRect(b, bx, 190);
    cards += `<div id="${id}-card-${i}" class="clip card-host" data-start="${show.toFixed(2)}" data-duration="${(end - show).toFixed(2)}" data-track-index="2" style="left:${x}px;top:${y}px"><div id="${id}-cardi-${i}" class="card"><div class="eye">${esc(b.label || '')}</div><div class="line">${esc(b.text || '')}</div></div></div>`;
    tw.push(`tl.fromTo("#${id}-cardi-${i}",{opacity:0,x:-24},{opacity:1,x:0,duration:0.33,ease:"power4.out"},${(show + 0.05).toFixed(2)});`);
    tw.push(`tl.to("#${id}-cardi-${i}",{opacity:0,x:-10,duration:0.2,ease:"power2.in"},${(end - 0.24).toFixed(2)});`);
  });
  const body = html + cards;
  const doc = `<template>
  <style>${FONT}
    #root { position: absolute; inset: 0; overflow: hidden; background: #000; }
    #root .cam { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
    #root .shot { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
    #root .ring { position: absolute; border: 4px solid #CF9F52; border-radius: 14px; opacity: 0; box-shadow: 0 0 0 2px rgba(11,11,12,.55); box-sizing: border-box; }
    #root .click { position: absolute; width: 120px; height: 120px; border: 4px solid #CF9F52; border-radius: 50%; opacity: 0; }
    #root .cur { position: absolute; left: 0; top: 0; opacity: 0; filter: drop-shadow(0 1.5px 1.5px rgba(0,0,0,.5)); }
    #root .card-host { position: absolute; width: ${CARD_W}px; }
    #root .card { background: #0b0b0c; border-left: 10px solid #CF9F52; border-radius: 6px; padding: 22px 28px 26px 26px; box-shadow: 0 24px 60px rgba(0,0,0,.45); font-family: 'Satoshi', sans-serif; }
    #root .eye { color: #CF9F52; font-weight: 700; font-size: 28px; letter-spacing: .16em; }
    #root .line { margin-top: 10px; color: #fff; font-weight: 900; font-size: 48px; line-height: 1.06; letter-spacing: -.015em; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    ${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${tw.join('\n    ')}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
  return { doc, audio: els.filter((e) => e.audio) };
}

function buildEnd(scene, dur) {
  const id = scene.id;
  const wm = has('assets/brand/forgedsa-wordmark.svg') ? 'assets/brand/forgedsa-wordmark.svg' : 'assets/brand/forgedsa-wordmark.png';
  const doc = `<template>
  <style>${FONT}
    #root { position: absolute; inset: 0; background: #0b0b0c; overflow: hidden; font-family: 'Satoshi', sans-serif; }
    #root .pic-host { position: absolute; left: 820px; top: 0; width: 1100px; height: 1080px; overflow: hidden; }
    #root .pic { position: absolute; left: -274px; top: 108px; width: 1728px; height: 972px; }
    #root .wm-host { position: absolute; left: 110px; top: 260px; width: 640px; }
    #root .wm { width: 640px; display: block; }
    #root .rule { position: absolute; left: 110px; top: 360px; width: 240px; height: 10px; background: #CF9F52; }
    #root .tag-host { position: absolute; left: 110px; top: 420px; width: 700px; }
    #root .tag { color: #fff; font-weight: 900; font-size: 60px; line-height: 1.08; letter-spacing: -.02em; }
    #root .url-host { position: absolute; left: 110px; top: 800px; }
    #root .url { color: #fff; font-weight: 700; font-size: 44px; letter-spacing: .02em; border-bottom: 8px solid #FF5500; padding-bottom: 8px; display: inline-block; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    <div id="${id}-pic" class="clip pic-host" data-layout-allow-overflow data-start="0" data-duration="${dur}" data-track-index="0"><img id="${id}-pici" class="pic" src="assets/shots/hero.png" alt=""></div>
    <div id="${id}-wm" class="clip wm-host" data-start="0" data-duration="${dur}" data-track-index="1"><img id="${id}-wmi" class="wm" src="${wm}" alt="FORGEDSA"></div>
    <div id="${id}-rule" class="clip rule" data-start="0" data-duration="${dur}" data-track-index="1"></div>
    <div id="${id}-tag" class="clip tag-host" data-hold data-start="0" data-duration="${dur}" data-track-index="2"><div id="${id}-tagi" class="tag">Your catalogue.<br>Your prices.<br>Your enquiries.</div></div>
    <div id="${id}-url" class="clip url-host" data-start="0" data-duration="${dur}" data-track-index="3"><div id="${id}-urli" class="url">Sign in at /admin</div></div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#${id}-pici",{opacity:0,scale:1.0,transformOrigin:"50% 100%"},{opacity:1,scale:1.04,duration:${dur},ease:"sine.out"},0);
    tl.fromTo("#${id}-wmi",{x:-80,opacity:0},{x:0,opacity:1,duration:0.6,ease:"power4.out"},0.1);
    tl.fromTo("#${id}-rule",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:0.5,ease:"power3.out"},0.5);
    tl.fromTo("#${id}-tagi",{x:-40,opacity:0},{x:0,opacity:1,duration:0.45,ease:"power4.out"},0.8);
    tl.fromTo("#${id}-urli",{opacity:0},{opacity:1,duration:0.3,ease:"power2.out"},1.6);
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
  return { doc, audio: [] };
}

// ---- assemble -------------------------------------------------------------------------------------
fs.mkdirSync(path.join(ROOT, 'compositions'), { recursive: true });
let t = 0; const hosts = []; const audios = []; const plan = [];
for (const scene of SCENES) {
  const beats = resolveBeats(scene);
  const dur = sceneDuration(scene, beats);
  const { doc, audio } = buildScene(scene, beats, dur);
  fs.writeFileSync(path.join(ROOT, `compositions/${scene.id}.html`), doc);
  hosts.push(`    <div id="${scene.id}" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="${t.toFixed(2)}" data-duration="${dur}" data-track-index="1" data-track-kind="graphics" data-width="${W}" data-height="${H}"></div>`);
  if (has(`assets/voice/${scene.id}.wav`)) audios.push(`    <audio id="vo-${scene.id}" src="assets/voice/${scene.id}.wav" data-start="${(t + LEAD).toFixed(2)}" data-duration="${(voiceMeta[scene.id]?.duration ?? dur - LEAD - TAIL).toFixed(2)}" data-track-index="5" data-volume="1"></audio>`);
  for (const a of audio) audios.push(`    <audio id="${a.audio}" src="${a.src}" data-start="${(t + a.at).toFixed(2)}" data-duration="${a.dur}" data-track-index="6" data-volume="${a.vol}"></audio>`);
  plan.push(`${scene.id}  ${t.toFixed(1).padStart(6)}s  ${dur.toFixed(1).padStart(5)}s  beats ${beats.map((b) => b.t.toFixed(1)).join(', ')}`);
  t += dur;
}
const total = +t.toFixed(2);
if (has('assets/music.mp3')) audios.push(`    <audio id="bed" src="assets/music.mp3" data-start="0" data-duration="${total}" data-track-index="4" data-volume="0.12" data-fade-in="1.2" data-fade-out="3"></audio>`);
const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
${hosts.join('\n')}
${audios.join('\n')}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'index.html'), index);
console.log(plan.join('\n'));
console.log(`total ${total}s (${(total / 60).toFixed(1)} min)  voice meta: ${Object.keys(voiceMeta).length ? 'yes' : 'estimated'}`);

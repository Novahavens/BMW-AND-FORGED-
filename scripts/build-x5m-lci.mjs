// Builds public/models/bmw-x5m-f95-lci.glb (2024 BMW X5 M Competition, F95 LCI) from the
// Sketchfab model "BMW X5M F95 + Facelifted Versions" by ZapupaNekra (CC BY 4.0,
// https://sketchfab.com/3d-models/2f4b104aae8f4b59b05683a2a144902d).
//
// The source is a game mod ("x5mf95racing") that ships every tuning variant in one file: each
// alternative part sits in the scene moved out of the way by its node translation (bumpers,
// hoods, grilles, lights, interior colour sets, ...). A variant goes back in place by zeroing its
// translation. This script keeps exactly one coherent facelift X5 M Competition, zeroes the
// kept parts' offsets, replaces the source's collapsed flat materials with proper PBR materials
// (the source's real material names survive only in the mesh node names), mounts one wheel +
// tyre per corner (the mod's wheels all sit at the origin; the app hides them and puts its own
// wheels where they are), and writes a meshopt-compressed GLB.
//
// Usage: node scripts/build-x5m-lci.mjs [source.glb] [out.glb] [--catalog] [--no-interior] [--raw]
//   --catalog      keep every exterior variant (zeroed, stacked) for side-by-side isolation renders
//   --no-interior  drop the cabin (smaller test files while iterating)
//   --raw          skip meshopt compression

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { dedup, flatten, prune, weld, reorder, quantize, meshopt as meshoptFn, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [SRC = '.scratch/x5fl.glb', OUT = 'public/models/bmw-x5m-f95-lci.glb'] = args.filter((a) => !a.startsWith('--'));
const CATALOG = flags.has('--catalog');
const INTERIOR = !flags.has('--no-interior');

const PREFIX = 'x5mf95racing_';
const strip = (s) => s.replaceAll(PREFIX, '');

// ---------------------------------------------------------------------------------------------
// Parts kept (top-level node names under RootNode, prefix stripped). Every one is put back in
// place by zeroing its translation. Children matching dropChild are removed from a kept part
// (duplicate stacked copies inside one node).
// ---------------------------------------------------------------------------------------------
const EXTERIOR = [
  // Shell, doors, glasshouse trim (the "vstchr" set is the black shadow-line version; the chrome
  // "vstchr2.*" copies are dropped).
  'body', 'body_vstchr', 'door_FL', 'door_FR', 'door_RL', 'door_RR',
  'door_FL_vstchr', 'door_FR_vstchr', 'door_RL_vstchr', 'door_RR_vstchr',
  'fender_LxStok', 'fender_RxStok', 'roof_panoram', 'roof_panoram.001', 'tailgate', 'tailgate_lower',
  'panbodx', 'x5mracing_dno', 'x5mf95racinjg_krilia', 'tubs', 'prorabot_2', 'x5mracing_tailprorabot', 'tailgate_prorabot',
  // Facelift (LCI) front end: bumper, facelift hood with kidney surround, M Competition grille,
  // facelift ("rest") headlights.
  'bumper_F_facelit', 'hood_fcl', 'grille_competition', 'scoop1',
  'headlight_LrestDXO1', 'headlight_RrestDXO1', 'headlightframe_Lrest', 'headlightframe_Rrest',
  'headlightglass_Lrest', 'headlightglass_Rrest',
  // Front fenders with the M gill, competition fender trim.
  'fender_Lfc', 'fender_Rfc', 'fender_flare_competiton_L', 'fender_flare_competiton_R',
  // Mirrors, roof spoiler.
  'mirror_Lb', 'mirror_Rb', 'spoiler',
  // Rear: M bumper, competition diffuser, quad tips, facelift lights, badges.
  'bumper_R_a', 'diffuser_R_competition', 'exhausttip_L_a', 'exhausttip_R_a',
  'taillight_euro_Lrest', 'taillight_euro_Rrest', 'taillightglass_Lrest', 'taillightglass_Rrest',
  'tailgatelight_Lrest', 'tailgatelight_Rrest', 'tailgatelightglass_Lrest', 'tailgatelightglass_Rrest',
  'lettering_x5m_competition', 'tailgate_logo_stock',
  // Glass.
  'windshield', 'doorglass_FL', 'doorglass_FR', 'quatter_glass_L', 'quatter_glass_R', 'tailgateglass',
  'door_lr_dummy', 'door_rr_dummy'
];
const CABIN = [
  'dashModRest', 'dash_black_Rest', 'dash_carbon_rest', 'mult_rest', 'gaugs_x5m', 'dash_gauge',
  'steeringwheel_dummy', 'intcarpet', 'intmirror', 'shelf', 'covrik',
  'seat_FL_blackM', 'seat_FR_blackM', 'seats_R_black',
  'doorpanel_FL', 'doorpanel_FR', 'doorpanel_RL', 'doorpanel_RR',
  'doorpanel_FL_black', 'doorpanel_FR_black', 'doorpanel_RL_black', 'doorpanel_RR_black'
];
// Catalog mode: all exterior alternatives too.
const CATALOG_EXTRA = [
  'bumper_F_X5m', 'bumper_F_facelit.001', 'bumper_F_facelit.003', 'bumper_F_serie', 'bumper_F_Asco', 'bumper_F_m50i', 'bumper_F_xline', 'bumper_F_base', 'bumper_F_30d', 'bumper_F_b',
  'hood', 'hood_Asco', 'hood_carbon', 'hood_manhart', 'grille_stock', 'grille_forget_carbon', 'grill_back',
  'headlight_LrestDXO', 'headlight_RrestDXO', 'headlight_LrestDXO.001', 'headlight_RrestDXO.001', 'BMW X5M F85.001', 'BMW X5M F85.002', 'BMW X5M F85.003', 'BMW X5M F85.005',
  'fender_L', 'fender_R', 'fender_Lm', 'fender_Rm', 'fender_Lm2', 'fender_Rm2', 'fender_Lxl', 'fender_Rxl',
  'fender_flare_stock_L', 'fender_flare_stock_R', 'fender_flare_forget_carbon_L', 'fender_flare_forget_carbon_R',
  'mirror_L', 'mirror_R', 'mirror_stock_L', 'mirror_stock_R', 'mirror_black_L', 'mirror_black_R', 'mirror_carbon_L', 'mirror_carbon_R',
  'spoiler1', 'spoiler_base', 'spoiler_manhart', 'spoiler_forget_carbon', 'blackroof',
  'bumper_R_basee', 'bumper_R_basee.001', 'bumper_R_xline', 'bumper_R_M50i', 'bumper_R_M50i_a', 'bumper_R_M50i_a.001',
  'diffuser_R', 'diffuser_R_manhart', 'diffuser_R_forget_carbon',
  'exhausttip_L_a_base', 'exhausttip_R_a_base', 'exhausttip_L_a_base1', 'exhausttip_R_a_base1', 'exhausttip_L_a_base1.001', 'exhausttip_R_a_base1.001', 'exhausttip_L_a_mperfomance', 'exhausttip_R_a_mperfomance',
  'taillight_euro_L', 'taillight_euro_R', 'taillightglass_L', 'taillightglass_R', 'tailgatelight_L', 'tailgatelight_R', 'tailgatelightglass_L', 'tailgatelightglass_R',
  'lettering_x5m', 'trunk_badge0', 'panbod', 'panbodb', 'skirts1', 'splitter1', 'lip_F_manhart', 'lip_F_forget_carbon', 'radsupport', 'bumperbar_F', 'nak1', 'diff_F'
];
// Duplicate or alternative copies stacked inside a kept node.
const DROP_CHILD = [
  /steer\.00[12]_|steer_0|steer_leather|steer_logo/, // keep one wheel of the three stacked (see pickSteer)
  /tinted/, // tinted glass copies inside the rear-door dummies
  /glassmark/
];
const KEEP_CHILD = [/steer\.002_/];

// Wheel set kept for the corners: facelift wheels and the Michelin tyre.
const WHEEL_F = 'x5mf95_wheel_F_facel', WHEEL_R = 'x5mf95_wheel_R_facel', TYRE_F = 'mishlen', TYRE_R = 'mishlenR';
// Axle positions (source units = metres, +Z forward, +X = car's left), from the arch cut-outs
// in the body sides: the arches span z 1.02..1.88 (front) and -1.03..-1.88 (rear).
const AXLE_Z = { F: 1.45, R: -1.455 };
const WHEEL_Y = 0.385; // arch crown at y 0.80, ~4 cm over a 0.38 m tyre
const TRACK_X = { F: 0.8, R: 0.8 }; // wheel-assembly centre, half-track

// ---------------------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const doc = await io.read(SRC);
const root = doc.getRoot();
const rootNode = root.listNodes().find((n) => n.getName() === 'RootNode');

const keep = new Set([...EXTERIOR, ...(INTERIOR ? CABIN : []), ...(CATALOG ? CATALOG_EXTRA : [])]);
const wheelParts = new Map();
for (const n of rootNode.listChildren()) {
  const name = strip(n.getName());
  if ([WHEEL_F, WHEEL_R, TYRE_F, TYRE_R].includes(name)) { wheelParts.set(name, n); continue; }
  if (!keep.has(name)) { n.traverse((c) => c !== n && c.dispose()); n.dispose(); continue; }
  keep.delete(name);
  n.setTranslation([0, 0, 0]);
  n.traverse((c) => {
    if (c === n) return;
    const cn = strip(c.getName());
    if (DROP_CHILD.some((re) => re.test(cn)) && !KEEP_CHILD.some((re) => re.test(cn))) c.dispose();
  });
}
if (keep.size) console.warn('not found:', [...keep]);

// ---------------------------------------------------------------------------------------------
// Wheels: one rim + tyre per corner, named so the app's wheel regex finds them.
// ---------------------------------------------------------------------------------------------
const corners = [];
for (const axle of ['F', 'R']) {
  for (const side of ['L', 'R']) {
    const rim = wheelParts.get(axle === 'F' ? WHEEL_F : WHEEL_R);
    const tyre = wheelParts.get(axle === 'F' ? TYRE_F : TYRE_R);
    const group = doc.createNode(`wheel_${axle}${side}`);
    rootNode.addChild(group);
    for (const [src, label] of [[rim, 'rim'], [tyre, 'tyre']]) {
      const copy = doc.createNode(`wheel_${axle}${side}_${label}`)
        .setRotation(src.getRotation()).setScale(src.getScale()).setTranslation(src.getTranslation());
      src.traverse((c) => { if (c !== src && c.getMesh()) copy.addChild(doc.createNode(`wheel_${axle}${side}_${label}_mesh`).setMesh(c.getMesh()).setMatrix(c.getMatrix())); });
      group.addChild(copy);
    }
    corners.push({ group, axle, side });
  }
}
for (const n of wheelParts.values()) { n.traverse((c) => c !== n && c.dispose()); n.dispose(); }
// RootNode carries the 0.01 scale; place corners in world metres through it.
const rootScale = rootNode.getWorldMatrix()[0] || 0.01;
for (const { group, axle, side } of corners) {
  // Centre the assembly's box on the target: the source meshes are modelled off-centre.
  const sx = side === 'L' ? 1 : -1; // mirror the right side so the rim face points outwards
  group.setTranslation([0, 0, 0]).setScale([sx, 1, 1]);
  const b = getBounds(group);
  const c = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
  const target = [sx * TRACK_X[axle], WHEEL_Y, AXLE_Z[axle]];
  group.setTranslation([0, 1, 2].map((i) => (target[i] - c[i]) / rootScale));
}

// ---------------------------------------------------------------------------------------------
// Materials. The source collapsed most materials into one default grey, but each mesh node keeps
// its original material name as the tail of its node name ("<part>_x5mf95racing_<material>_0").
// ---------------------------------------------------------------------------------------------
const clearcoatExt = doc.createExtension(KHRMaterialsClearcoat);
const mats = {};
const mk = (name, color, metal, rough, extra = {}) => {
  const m = doc.createMaterial(name).setBaseColorFactor([...color, extra.alpha ?? 1]).setMetallicFactor(metal).setRoughnessFactor(rough).setDoubleSided(true);
  if (extra.alpha !== undefined && extra.alpha < 1) m.setAlphaMode('BLEND');
  if (extra.emissive) m.setEmissiveFactor(extra.emissive);
  if (extra.clearcoat) m.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(extra.clearcoat).setClearcoatRoughnessFactor(0.05));
  return (mats[name] = m);
};
const srgb = (h) => [1, 3, 5].map((i) => ((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))(parseInt(h.slice(i, i + 2), 16) / 255));
mk('x5m_paint', srgb('#3a3d42'), 0.5, 0.3, { clearcoat: 1 });
mk('trim_gloss_black', srgb('#0a0a0b'), 0, 0.22, { clearcoat: 0.6 });
mk('trim_satin_black', srgb('#111213'), 0, 0.55);
mk('trim_black_chrome', srgb('#2a2c30'), 1, 0.18);
mk('trim_chrome', srgb('#d8dadd'), 1, 0.08);
mk('plastic_textured_black', srgb('#141516'), 0, 0.75);
mk('underbody_black', srgb('#0b0b0b'), 0, 0.9);
mk('glass_window', srgb('#0a0c0e'), 0, 0.03, { alpha: 0.72 });
mk('lamp_lens_clear', srgb('#ffffff'), 0, 0.02, { alpha: 0.12 });
mk('lamp_lens_tail', srgb('#3a0306'), 0, 0.04, { alpha: 0.7 });
mk('lamp_reflector_chrome', srgb('#c9ccd0'), 1, 0.12);
mk('lamp_housing_black', srgb('#0d0e10'), 0.2, 0.35);
mk('lamp_drl_blue', srgb('#8fb4ff'), 0, 0.2, { emissive: [0.35, 0.45, 0.7] });
mk('lamp_signal', srgb('#b9b4ad'), 0.2, 0.12);
mk('lamp_tail_red', srgb('#9a0b10'), 0, 0.3, { emissive: [0.25, 0.0, 0.01] });
mk('badge_chrome', srgb('#cfd2d6'), 1, 0.12);
mk('tyre_rubber', srgb('#1a1a1a'), 0, 0.88);
mk('rim_metal', srgb('#6d7075'), 1, 0.3);
mk('interior_leather_black', srgb('#141414'), 0, 0.6);
mk('interior_alcantara', srgb('#101010'), 0, 0.95);
mk('interior_carpet', srgb('#0d0d0d'), 0, 1);
mk('interior_trim', srgb('#1c1d1f'), 0.1, 0.45);
mk('interior_accent_red', srgb('#a3141a'), 0, 0.5);
mk('interior_display', srgb('#050608'), 0, 0.08);

// Per-part defaults for the generic "x5mf95racing" material (an unlit atlas in the game).
const GENERIC = [
  [/^wheel_.*rim/, 'rim_metal'], [/^wheel_.*tyre/, 'tyre_rubber'],
  [/headlight_.rest|headlightframe/, 'lamp_reflector_chrome'],
  [/tail.*light|tailgatelight/, 'lamp_tail_red'],
  [/exhausttip/, 'trim_black_chrome'],
  [/tubs|krilia|dno|prorabot/, 'underbody_black'],
  [/logo|lettering|badge/, 'badge_chrome'],
  [/dash|seat|doorpanel|intcarpet|steer|intmirror|mult|gaug|covrik|shelf/, 'interior_trim'],
  [/grille|diffuser/, 'trim_gloss_black'],
  [/vstchr/, 'trim_gloss_black'],
  [/.*/, 'plastic_textured_black']
];
const classify = (part, tail) => {
  const t = tail;
  if (/^wheel_/.test(part)) return part.includes('tyre') ? 'tyre_rubber' : 'rim_metal';
  if (t === 'body') return 'x5m_paint';
  if (/glass_tinted|glass$|^glass/.test(t) && !/peredfari/.test(t)) return /nak1/.test(part) ? 'lamp_lens_clear' : 'glass_window';
  if (/peredfari/.test(t)) return /tail|tailgate|bumper_R/.test(part) ? 'lamp_lens_tail' : 'lamp_lens_clear';
  if (/^signal_.res$/.test(t)) return 'lamp_signal';
  if (/leather_perff/.test(t)) return 'interior_leather_black';
  if (/^(fonar_red|fonar_red2|fonar_red3|fonar_red_t|fonar_red2_t|headlight_zad|stop|stop2|signal_._zad)$/.test(t)) return 'lamp_tail_red';
  if (/^blue$|bmw_laser/.test(t)) return 'lamp_drl_blue';
  if (/chrome/.test(t)) {
    if (/headlight/.test(part)) return 'lamp_reflector_chrome';
    return 'trim_gloss_black'; // M Competition: Shadow Line, no exterior chrome
  }
  if (t === 'black') {
    if (/dash|seat|doorpanel|intcarpet|steer|gaug|mult/.test(part)) return 'interior_trim';
    if (/bumper|diffuser|tailgate_lower|panbod|dno|krilia/.test(part)) return 'plastic_textured_black';
    return 'trim_gloss_black';
  }
  if (/pek_black|bumppek_black|fonar_black/.test(t)) return /fender|bumper/.test(part) ? 'plastic_textured_black' : 'trim_gloss_black';
  if (/leather/.test(t)) return 'interior_leather_black';
  if (t === 'alca') return 'interior_alcantara';
  if (/carpet/.test(t)) return /dash|seat|intcarpet|doorpanel|shelf|covrik/.test(part) ? 'interior_carpet' : 'underbody_black';
  if (t === 'red' || t === 'logoNEW') return 'interior_accent_red';
  if (/display|screen|disp/.test(t)) return 'interior_display';
  if (/carbon/.test(t)) return 'trim_gloss_black';
  if (/logo|palitra/.test(t)) return 'badge_chrome';
  if (/bastion|etk/.test(t)) return 'underbody_black';
  for (const [re, m] of GENERIC) if (re.test(part)) return m;
  return 'plastic_textured_black';
};

const report = new Map();
for (const top of rootNode.listChildren()) {
  const part = strip(top.getName());
  top.traverse((c) => {
    const mesh = c.getMesh();
    if (!mesh) return;
    let tail = strip(c.getName());
    if (tail.startsWith(part)) tail = tail.slice(part.length);
    tail = tail.replace(/^_/, '').replace(/_0$/, '').replace(/^0$/, '');
    // Sub-object names inside dummies: "doorglass_RL_glass" -> "glass".
    const sub = tail.match(/(glass_tinted|glass|leather_black|chrome|black|body|logo|stitch)$/);
    const cls = /^wheel_/.test(part) ? (/_tyre/.test(c.getName()) ? 'tyre_rubber' : 'rim_metal') : classify(part, sub ? sub[1] : tail);
    const m = mats[cls];
    // Meshes are shared by instancing only for the wheels; clone-per-use keeps it simple.
    for (const p of mesh.listPrimitives()) p.setMaterial(m);
    const k = `${cls}`;
    report.set(k, (report.get(k) || 0) + mesh.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0));
    if (process.env.VERBOSE) console.log(part.padEnd(28), (tail || '(generic)').padEnd(28), cls);
  });
}
console.log('triangles per material:', Object.fromEntries([...report].map(([k, v]) => [k, Math.round(v)])));

// Old materials are now unused.
for (const m of root.listMaterials()) if (!Object.values(mats).includes(m)) m.dispose();

// Clean names for the app: the part name on every mesh node (paint is matched by material name).
for (const top of rootNode.listChildren()) {
  const part = strip(top.getName());
  top.setName(part);
  top.traverse((c) => { if (c !== top && c.getMesh()) c.setName(part.startsWith('wheel_') ? c.getName() : `${part}_${c.getMesh().listPrimitives()[0].getMaterial().getName()}`); });
}
root.listMeshes().forEach((m) => m.setName(''));

await doc.transform(prune(), dedup(), weld(), flatten(), prune());

if (!flags.has('--raw') && !CATALOG) {
  await doc.transform(
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
    meshoptFn({ encoder: MeshoptEncoder, level: 'medium' })
  );
}
await io.write(OUT, doc);
const tris = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
const fs = await import('node:fs');
console.log(`wrote ${OUT}: ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB, ${Math.round(tris)} triangles, ${root.listNodes().length} nodes, ${root.listMaterials().length} materials`);

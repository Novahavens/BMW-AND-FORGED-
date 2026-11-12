#!/usr/bin/env node
/**
 * Drops a prepared car into the configurator in one command.
 *
 *   node scripts/ingest-car.mjs <BMW_M5_G90.zip | car_web.glb> --car m5_g90 [--check] [--render]
 *
 * Takes the car packages from Drive > "3d cars" (one zip per car: web/<car>_web.glb with the wheels
 * C10_Wheel_FL..C13_Wheel_RR and brakes C20..C23 under hub empties, and a material named "Paint"),
 * or any GLB whose wheels and paint can be found by name, and does everything the engine needs:
 *
 *   1. unzips the package (if a zip) and picks web/*_web.glb, else model/*.glb, else the largest .glb
 *   2. checks the file the way CarConfiguratorEngine.mountCarModel will read it: four wheels found by
 *      name in four corners (so the forged wheels land in the arches), a paint material, the file's
 *      extensions (meshopt / Draco load; KTX2 does not), size and triangle count
 *   3. copies it to public/models/<carId>.glb (compressed with gltf-transform when it is over 15 MB or
 *      not compressed at all)
 *   4. writes the car's model fields into the bundled catalogue (data/configuratorData.ts) and a
 *      Supabase migration (supabase/migrations/...) so both sources of truth agree
 *   5. body mode: --live (default) retires the car's old Blender render frames so the configurator
 *      draws this GLB itself; --render re-renders the Blender body frames from the new GLB instead
 *      (needs `pip install bpy` and the dev server; ~15 min per car); --keep-renders touches neither
 *   6. --check shoots front three-quarter, side and wheel close-up screenshots with the headless
 *      harness into docs/ingest/<carId>/ and a contact sheet docs/ingest/<carId>.jpg (needs the dev
 *      server: bunx vite --host 127.0.0.1 --port 5173)
 *
 * Options
 *   --car <id>          catalogue id: m5_g90, m5_touring_g99, m4_cs_g82, m2_g87, ... (required)
 *   --name <name>       display name: renames an existing car (e.g. the M2 Coupe row becomes "BMW M2 CS") or
 *                       names a new one (a new row is added). Customers choose the car on the welcome carousel,
 *                       so a new car is only offered once it also has a slide there (HERO_SLIDES in
 *                       components/journey/HeroStage.tsx)
 *   --badge <badge>     short badge (default: the name without "BMW", e.g. "M2 CS G87"). Without its chassis code
 *                       it is the car's short name in the configurator, on the summary and in the garage ("M2 CS")
 *   --body <style>      coupe | sedan | suv | convertible | touring | gran_coupe (new cars; default sedan)
 *   --length <m>        real length in metres (default: measured from the file, which is in metres for
 *                       the prepared packages)
 *   --rotation <deg>    model rotation (default 0; the packages have the nose at +Z, which the engine
 *                       treats as the front)
 *   --paint-match <re>  override the paint regex   --hide-match <re>  override the wheel/brake regex
 *   --live | --render | --keep-renders   see 5 above
 *   --check             screenshots (see 6)        --port <n>  dev server port (default 5173)
 *   --dry-run           report only; change nothing
 *
 * Licence: the four packages are game-derived and unlicensed (see their READ ME). The script records
 * that in public/models/CREDITS.md; replace the row when a licence is in hand.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOGUE = path.join(ROOT, 'data/configuratorData.ts');
const RENDERS = path.join(ROOT, 'public/renders');
const MODELS = path.join(ROOT, 'public/models');
const CREDITS = path.join(MODELS, 'CREDITS.md');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const SIZE_LIMIT = 15 * 1024 * 1024;

// The engine's own name rules (services/CarConfiguratorEngine.ts), copied so the report matches what it will do.
const DEFAULT_HIDE = '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)';
const DEFAULT_PAINT = 'paint|body|carpaint|exterior';
const NOT_PAINT = /glass|window|light|lamp|chrome|trim|rubber|interior|carbon|grille|badge|logo|plastic/i;
const NOT_WHEEL = /steer|arch|well|house|liner|mudguard|fender/i;
const WHEEL = /wheel|(^|[^a-z])(rim|tyre|tire)/i;
const BODY_STYLES = ['coupe', 'sedan', 'suv', 'convertible', 'touring', 'gran_coupe'];

const die = (msg) => {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
};
const log = (msg) => console.log(msg);
// A failed read, write or spawn ends with one line, not a stack trace.
process.on('uncaughtException', (e) => die(e?.message || String(e)));
process.on('unhandledRejection', (e) => die(e?.message || String(e)));
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// ---------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------
const opts = { live: true, render: false, check: false, dryRun: false, port: '5173' };
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const valued = { '--car': 'car', '--name': 'name', '--badge': 'badge', '--body': 'body', '--length': 'length', '--rotation': 'rotation', '--paint-match': 'paintMatch', '--hide-match': 'hideMatch', '--port': 'port' };
  if (valued[a]) {
    if (argv[i + 1] === undefined) die(`${a} needs a value`);
    opts[valued[a]] = argv[++i];
  } else if (a === '--render') { opts.render = true; opts.live = false; }
  else if (a === '--live') { opts.live = true; opts.render = false; }
  else if (a === '--keep-renders') { opts.live = false; opts.render = false; }
  else if (a === '--check') opts.check = true;
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }
  else if (a.startsWith('--')) die(`unknown option ${a} (see --help)`);
  else positional.push(a);
}
const input = positional[0];
if (!input) die('usage: node scripts/ingest-car.mjs <car.zip | car.glb> --car <id> [--check] [--render] (see --help)');
if (!fs.existsSync(input)) die(`${input} does not exist`);
if (!opts.car) die('--car <id> is required (m5_g90, m5_touring_g99, m4_cs_g82, m2_g87, ...)');
if (!/^[a-z0-9_]+$/.test(opts.car)) die('--car must be lowercase letters, digits and underscores (e.g. m5_touring_g99)');
if (opts.body && !BODY_STYLES.includes(opts.body)) die(`--body must be one of ${BODY_STYLES.join(', ')}`);
if (opts.length !== undefined && !(+opts.length > 0)) die('--length must be a number of metres');
if (opts.rotation !== undefined && !Number.isFinite(+opts.rotation)) die('--rotation must be a number of degrees');

// ---------------------------------------------------------------------------------------------------
// 1. Unpack
// ---------------------------------------------------------------------------------------------------
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

function unpack(file) {
  if (!/\.zip$/i.test(file)) {
    if (!/\.glb$/i.test(file)) die('the input must be a .zip package or a .glb file');
    return { glb: path.resolve(file), readme: null, packageName: path.basename(file) };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-car-'));
  const unzip = spawnSync('unzip', ['-o', '-q', file, '-d', dir], { stdio: 'inherit' });
  if (unzip.status !== 0) {
    const py = spawnSync('python3', ['-I', '-m', 'zipfile', '-e', file, dir], { stdio: 'inherit' });
    if (py.status !== 0) die(`could not unzip ${file}`);
  }
  // Finder zips add __MACOSX/._name resource forks that look like GLBs and are not.
  const files = walk(dir).filter((f) => !/(^|[\\/])__MACOSX([\\/]|$)/.test(f) && !path.basename(f).startsWith('._'));
  const glbs = files.filter((f) => f.toLowerCase().endsWith('.glb'));
  if (!glbs.length) die('the zip holds no .glb file');
  const web = glbs.filter((f) => /(^|[\\/])web[\\/][^\\/]+\.glb$/i.test(f) || /_web\.glb$/i.test(f));
  const model = glbs.filter((f) => /(^|[\\/])model[\\/][^\\/]+\.glb$/i.test(f));
  let candidates = web.length ? web : model.length ? model : glbs;
  if (candidates.length > 1) {
    // A zip with several cars (e.g. the four-car viewer): keep the files named after the requested car.
    const tokens = opts.car.split('_').filter(Boolean);
    const named = candidates.filter((f) => tokens.every((t) => path.basename(f).toLowerCase().includes(t)));
    if (named.length === 1) candidates = named;
    else die(`the zip holds ${candidates.length} candidate models (${candidates.map((f) => path.relative(dir, f)).join(', ')}); unzip it and pass the one for ${opts.car} as the first argument`);
  }
  const glb = candidates[0];
  const readme = files.find((f) => /readme\.md$/i.test(f)) || null;
  log(`Package: ${path.basename(file)}`);
  log(`  .glb files: ${glbs.map((f) => `${path.relative(dir, f)} (${mb(fs.statSync(f).size)})`).join(', ')}`);
  log(`  using: ${path.relative(dir, glb)}${glbs.length > 1 ? ` (${web.length ? 'the web build' : model.length ? 'no web build; the plain model' : 'the only candidate'}${candidates.length < (web.length || model.length || glbs.length) || glbs.length > 1 ? `, named after ${opts.car}` : ''})` : ''}`);
  return { glb, readme, packageName: path.basename(file) };
}

const pkg = unpack(input);
if (pkg.readme) {
  const text = fs.readFileSync(pkg.readme, 'utf8');
  const lengthLine = text.split('\n').find((l) => /length/i.test(l) && /\d\.\d{2,3}/.test(l));
  log(`  README: ${path.basename(pkg.readme)}${lengthLine ? ` ("${lengthLine.trim().slice(0, 100)}")` : ''}`);
}

// ---------------------------------------------------------------------------------------------------
// 2. Read the GLB the way the engine will
// ---------------------------------------------------------------------------------------------------
const paintRe = safeRegex(opts.paintMatch, DEFAULT_PAINT);
const hideRe = safeRegex(opts.hideMatch, DEFAULT_HIDE);

function safeRegex(pattern, fallback) {
  try {
    return new RegExp(pattern || fallback, 'i');
  } catch {
    die(`"${pattern}" is not a valid regular expression`);
  }
}

async function readDoc(file) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  try {
    const draco = await import('draco3dgltf').catch(() => null);
    if (draco) io.registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule(), 'draco3d.encoder': await draco.createEncoderModule() });
  } catch { /* no Draco in this checkout: fine unless the file uses it */ }
  return io.read(file);
}

function analyse(doc) {
  const root = doc.getRoot();
  const used = root.listExtensionsUsed().map((e) => e.extensionName);
  const required = root.listExtensionsRequired().map((e) => e.extensionName);
  const parts = [];
  const bboxOf = (node) => {
    const mesh = node.getMesh();
    if (!mesh) return null;
    const m = node.getWorldMatrix();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const v = [0, 0, 0];
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      const n = pos.getCount();
      const stride = Math.max(1, Math.floor(n / 40000)); // a sample is enough for corners and sizes
      for (let i = 0; i < n; i += stride) {
        pos.getElement(i, v);
        const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
        const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
        const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
        if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
        if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
      }
    }
    return { min, max, tris };
  };
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const ancestry = [];
    for (let n = node; n; n = n.getParentNode()) ancestry.push(n.getName());
    const materials = node.getMesh().listPrimitives().map((p) => p.getMaterial()?.getName() || '').filter(Boolean);
    const materialNames = materials.join(' ');
    const partNames = `${ancestry.join(' ')} ${materialNames}`;
    const ownNames = `${node.getName()} ${materialNames}`;
    const box = bboxOf(node);
    if (!box) continue;
    let kind = 'other';
    if (hideRe.test(partNames) && !NOT_WHEEL.test(partNames)) kind = WHEEL.test(partNames) ? 'wheel' : 'hidden';
    else if (/caliper|calliper/i.test(materialNames)) kind = 'caliper';
    else if (paintRe.test(ownNames) && !NOT_PAINT.test(ownNames)) kind = 'paint';
    parts.push({ name: node.getName() || '(unnamed)', materials, kind, ...box });
  }
  if (!parts.length) die('the file has no meshes');
  const min = [0, 1, 2].map((i) => Math.min(...parts.map((p) => p.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...parts.map((p) => p.max[i])));
  const size = max.map((v, i) => v - min[i]);
  const centre = min.map((v, i) => v + size[i] / 2);
  // The engine turns an X-long model to run along Z, then keys the wheels by the sign of z (front/rear) and x
  // (left/right) around the centre; here the long and lateral axes are used directly, which gives the same four keys.
  const longAxis = size[0] > size[2] ? 0 : 2;
  const latAxis = longAxis === 0 ? 2 : 0;
  const corners = new Map();
  for (const p of parts.filter((p) => p.kind === 'wheel')) {
    const c = p.min.map((v, i) => (v + p.max[i]) / 2);
    const key = `${c[longAxis] >= centre[longAxis] ? 'A' : 'B'}-${c[latAxis] >= centre[latAxis] ? 'L' : 'R'}`;
    const prev = corners.get(key);
    corners.set(key, prev ? { min: prev.min.map((v, i) => Math.min(v, p.min[i])), max: prev.max.map((v, i) => Math.max(v, p.max[i])) } : { min: [...p.min], max: [...p.max] });
  }
  const textures = root.listTextures().map((t) => {
    let dims = '?';
    try { const s = t.getSize(); if (s) dims = `${s[0]}x${s[1]}`; } catch { /* unknown format */ }
    return `${dims} ${t.getMimeType() || ''}`.trim();
  });
  return {
    parts, used, required, size, longLength: size[longAxis], corners,
    tris: Math.round(parts.reduce((n, p) => n + p.tris, 0)),
    materials: root.listMaterials().map((m) => m.getName()),
    textures
  };
}

let doc;
try {
  doc = await readDoc(pkg.glb);
} catch (e) {
  die(`could not read ${pkg.glb}: ${e.message}${/draco/i.test(e.message) ? ' (Draco files load in the app, but this script cannot inspect them; re-export with meshopt or plain geometry to get the checks)' : ''}`);
}
const info = analyse(doc);
const fileSize = fs.statSync(pkg.glb).size;

log(`\nModel check (${path.basename(pkg.glb)}, ${mb(fileSize)}, ${info.tris.toLocaleString()} triangles)`);
log(`  extensions: ${info.used.join(', ') || 'none'}`);
if (info.required.includes('KHR_texture_basisu')) die('the textures are KTX2 (KHR_texture_basisu), which the app cannot decode. Re-export with WebP or PNG textures.');
log(`  textures: ${info.textures.length ? info.textures.join(', ') : 'none'}`);
log(`  size: ${info.size.map((v) => v.toFixed(2)).join(' x ')} (long axis ${info.longLength.toFixed(2)})`);
const byKind = (k) => info.parts.filter((p) => p.kind === k);
const wheels = byKind('wheel'), painted = byKind('paint'), calipers = byKind('caliper'), hiddenOnly = byKind('hidden');
log(`  wheels by name: ${wheels.length} mesh${wheels.length === 1 ? '' : 'es'} in ${info.corners.size}/4 corners ${info.corners.size === 4 ? 'OK' : 'PROBLEM'}`);
if (wheels.length) log(`    ${[...new Set(wheels.map((p) => p.name))].slice(0, 12).join(', ')}${wheels.length > 12 ? ', ...' : ''}`);
if (hiddenOnly.length) log(`  other hidden parts (brakes etc.): ${[...new Set(hiddenOnly.map((p) => p.name))].slice(0, 8).join(', ')}${hiddenOnly.length > 8 ? ', ...' : ''}`);
if (calipers.length) log(`  model calipers kept and recoloured: ${[...new Set(calipers.map((p) => p.name))].slice(0, 4).join(', ')}`);
log(`  painted meshes: ${painted.length} (materials: ${[...new Set(painted.flatMap((p) => p.materials))].join(', ') || 'none'})`);
const others = byKind('other');
log(`  other parts (glass, trim, lights, interior; given studio materials automatically): ${others.length}`);
if (others.length) log(`    e.g. ${[...new Set(others.map((p) => `${p.name}[${p.materials.join('/')}]`))].slice(0, 10).join(', ')}`);

const problems = [];
if (info.corners.size !== 4) problems.push(`the engine finds the model's wheels by name (${hideRe}); ${info.corners.size}/4 corners were found, so the forged wheels would sit at default positions. Name the wheels C10_Wheel_FL, C11_Wheel_FR, C12_Wheel_RL, C13_Wheel_RR (or pass --hide-match).`);
if (!painted.length) problems.push(`no mesh takes the paint (${paintRe}). Name the body material "Paint" (or pass --paint-match).`);
if (info.longLength < 1.5 || info.longLength > 8) problems.push(`the model is ${info.longLength.toFixed(2)} units long, which does not look like metres. Pass --length <real metres>; the engine scales to it.`);
if (fileSize > 50 * 1024 * 1024) problems.push(`${mb(fileSize)} is over the 50 MB limit of the car-models bucket.`);
for (const p of problems) log(`  PROBLEM: ${p}`);

// A material called exactly "Paint" is the convention of the prepared packages: match that word on its own so a
// node called C01_Body_Diffuser with a black material is not painted too.
const hasPaintMaterial = info.materials.some((m) => /^paint$/i.test(m));
const paintMatch = opts.paintMatch || (hasPaintMaterial ? '(^|[^a-z])paint($|[^a-z])' : DEFAULT_PAINT);
const hideMatch = opts.hideMatch || DEFAULT_HIDE;
const lengthM = opts.length !== undefined ? +opts.length : +info.longLength.toFixed(2);
const rotationDeg = opts.rotation !== undefined ? +opts.rotation : 0;
if (hasPaintMaterial && !opts.paintMatch && paintMatch !== DEFAULT_PAINT) {
  // Re-count with the narrower pattern so the report says what the catalogue will do.
  const re = new RegExp(paintMatch, 'i');
  const n = info.parts.filter((p) => p.kind === 'paint' && re.test(`${p.name} ${p.materials.join(' ')}`)).length;
  log(`  paint regex "${paintMatch}" (material "Paint" found): ${n} painted meshes`);
}

if (problems.length && !opts.dryRun) {
  log('\nFix the problems above and run again (or --dry-run to re-check). Nothing was changed.');
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------------
// 3. Catalogue text (read now, written later)
// ---------------------------------------------------------------------------------------------------
const source = fs.readFileSync(CATALOGUE, 'utf8');
const carsStart = source.indexOf('export const BMW_MODELS');
const carsEnd = source.indexOf('\n];', carsStart);
if (carsStart < 0 || carsEnd < 0) die('data/configuratorData.ts: BMW_MODELS not found');
const carsText = source.slice(carsStart, carsEnd);
const carIds = [...carsText.matchAll(/^    id: '([^']+)'/gm)].map((m) => m[1]);
const exists = carIds.includes(opts.car);
if (!exists && !opts.name) die(`${opts.car} is not in the catalogue. Pass --name "BMW M5 Touring" (and --body touring) to add it, or use an existing id: ${carIds.join(', ')}`);
const modelUrl = `/models/${opts.car}.glb`;
const target = path.join(MODELS, `${opts.car}.glb`);
const needsCompression = fileSize > SIZE_LIMIT || !info.used.some((e) => e === 'EXT_meshopt_compression' || e === 'KHR_draco_mesh_compression');
const rendersDir = path.join(RENDERS, opts.car);
const hadRenders = fs.existsSync(rendersDir);

log(`\nPlan for ${opts.car}${exists ? '' : ` (new car "${opts.name}", ${opts.body || 'sedan'})`}`);
log(`  model_url ${modelUrl}${needsCompression ? ' (compressed on the way in)' : ' (copied as is)'}`);
log(`  model_length_m ${lengthM}   model_rotation_deg ${rotationDeg}`);
log(`  paint_mesh_match ${paintMatch}`);
log(`  hide_mesh_match ${hideMatch}`);
log(`  body: ${opts.render ? 'Blender re-render of the body frames (--render)' : opts.live ? `live GLB in the configurator${hadRenders ? ' (the old render frames are retired)' : ''}` : `unchanged (${hadRenders ? 'the old render frames stay' : 'no render frames'})`}`);
if (opts.dryRun) {
  log('\n--dry-run: nothing changed.');
  process.exit(problems.length ? 2 : 0);
}

// ---------------------------------------------------------------------------------------------------
// 4. Copy (or compress) the model
// ---------------------------------------------------------------------------------------------------
fs.mkdirSync(MODELS, { recursive: true });
if (needsCompression) {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  await doc.transform(dedup({ keepUniqueNames: true }), prune(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' })); // names stay: the engine keys paint/hide/caliper on them
  const sharp = await import('sharp').catch(() => null);
  if (sharp) {
    const { textureCompress } = await import('@gltf-transform/functions');
    await doc.transform(textureCompress({ encoder: sharp.default, targetFormat: 'webp', resize: [2048, 2048] }));
  } else if (fileSize > SIZE_LIMIT) {
    log('  (textures left as they are: `bun add -d sharp` lets this script shrink them to WebP, or run `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress webp`)');
  }
  await io.write(target, doc);
} else {
  fs.copyFileSync(pkg.glb, target);
}
const outSize = fs.statSync(target).size;
log(`\nWrote ${path.relative(ROOT, target)} (${mb(outSize)})${outSize > SIZE_LIMIT ? '  NOTE: over 15 MB, slow on phones' : ''}`);

// ---------------------------------------------------------------------------------------------------
// 5. Bundled catalogue
// ---------------------------------------------------------------------------------------------------
const tsStr = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const modelLines = [
  `    modelUrl: ${tsStr(modelUrl)}`,
  `    modelRotationDeg: ${rotationDeg}`,
  `    modelLengthM: ${lengthM}`,
  `    paintMeshMatch: ${tsStr(paintMatch)}`,
  `    hideMeshMatch: ${tsStr(hideMatch)}`
];
const MODEL_KEYS = /^    (modelUrl|modelRotationDeg|modelLengthM|paintMeshMatch|hideMeshMatch):/;
/** The line that closes a catalogue entry: "  }," or "  }", with or without a trailing comment. */
const ENTRY_END = /^  },?\s*(\/\/.*)?$/;
/** The line with a trailing comma on its code, keeping any "// comment" after it. */
function withComma(line) {
  const m = line.match(/^(.*?)(\s*\/\/.*)?$/);
  const code = m[1].trimEnd(), comment = m[2] || '';
  return !code || code.endsWith(',') || code.endsWith('{') || code.endsWith('[') ? line : `${code},${comment}`;
}

function updateCar(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `    id: ${tsStr(opts.car)},` || l === `    id: '${opts.car}',`);
  if (start < 0) die(`car ${opts.car} not found in the catalogue text`);
  let end = start;
  while (end < lines.length && !ENTRY_END.test(lines[end])) end++;
  if (end >= lines.length) die('could not find the end of the car entry');
  // Drop the old model lines and the full-line comments right above them (they describe the old file).
  const body = lines.slice(start, end);
  const kept = [];
  for (let i = 0; i < body.length; i++) {
    if (opts.name && /^    name: /.test(body[i])) { kept.push(`    name: ${tsStr(opts.name)},`); continue; }
    if (opts.name && /^    badge: /.test(body[i])) { kept.push(`    badge: ${tsStr(opts.badge || opts.name.replace(/^BMW\s+/i, ''))},`); continue; }
    if (MODEL_KEYS.test(body[i])) {
      while (kept.length && /^\s*\/\//.test(kept[kept.length - 1])) kept.pop();
      continue;
    }
    kept.push(body[i]);
  }
  // The comma goes on the last line that holds code (a trailing full-line comment is left alone).
  let last = kept.length - 1;
  while (last >= 0 && /^\s*(\/\/.*)?$/.test(kept[last])) last--;
  if (last >= 0) kept[last] = withComma(kept[last]);
  const fresh = modelLines.map((l, i) => (i < modelLines.length - 1 ? `${l},` : l));
  lines.splice(start, end - start, ...kept, ...fresh);
  return lines.join('\n');
}

function addCar(text) {
  const entry = [
    '  {',
    `    id: ${tsStr(opts.car)},`,
    `    name: ${tsStr(opts.name)},`,
    `    badge: ${tsStr(opts.badge || opts.name.replace(/^BMW\s+/i, ''))},`,
    "    generation: '',",
    "    chassisCode: '',",
    '    // Specs left blank (the UI hides blank rows); fill them in /admin or here.',
    "    engine: '',",
    "    power: '',",
    "    torque: '',",
    "    acceleration: '',",
    "    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },",
    `    bodyStyle: ${tsStr(opts.body || 'sedan')},`,
    '    paintIds: [],',
    ...modelLines.map((l, i) => (i < modelLines.length - 1 ? `${l},` : l)),
    '  }'
  ];
  const before = text.slice(0, carsEnd).replace(/\s*$/, '');
  const needsComma = !before.endsWith(',') && !before.endsWith('[');
  return `${before}${needsComma ? ',' : ''}\n${entry.join('\n')}${text.slice(carsEnd)}`;
}

const updated = exists ? updateCar(source) : addCar(source);
fs.writeFileSync(CATALOGUE, updated);
log(`Updated ${path.relative(ROOT, CATALOGUE)} (${exists ? `model fields replaced${opts.name ? `, renamed to "${opts.name}"` : ''}` : 'car added'})`);

// ---------------------------------------------------------------------------------------------------
// 6. Supabase migration
// ---------------------------------------------------------------------------------------------------
const field = (block, key) => (block.match(new RegExp(`^    ${key}: '((?:[^'\\\\]|\\\\.)*)'`, 'm')) || [])[1]?.replace(/\\'/g, "'") ?? '';
const carBlock = (() => {
  const t = fs.readFileSync(CATALOGUE, 'utf8');
  const s = t.indexOf(`    id: '${opts.car}',`);
  return t.slice(s, t.indexOf('\n  }', s));
})();
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
// One migration per car: a re-run (e.g. with --check) rewrites it instead of adding a second file.
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const migration = path.join(MIGRATIONS, (fs.existsSync(MIGRATIONS) && fs.readdirSync(MIGRATIONS).find((f) => f.endsWith(`_car_${opts.car}_prepared_model.sql`))) || `${stamp}_car_${opts.car}_prepared_model.sql`);
const body = exists ? field(carBlock, 'bodyStyle') || 'sedan' : opts.body || 'sedan';
fs.mkdirSync(MIGRATIONS, { recursive: true });
fs.writeFileSync(migration, `-- ${field(carBlock, 'name') || opts.name}: prepared model from ${pkg.packageName}, ingested by scripts/ingest-car.mjs on ${new Date().toISOString().slice(0, 10)}.
-- The file is served from the repo at ${modelUrl}. Licence: see public/models/CREDITS.md (not confirmed for the
-- prepared packages; prototype use until a licence is in hand).
insert into public.cars (id, name, badge, generation, chassis_code, body_style, model_url, model_rotation_deg, model_length_m,
  paint_mesh_match, hide_mesh_match, active)
values (${sqlStr(opts.car)}, ${sqlStr(field(carBlock, 'name') || opts.name)}, ${sqlStr(field(carBlock, 'badge') || opts.name)}, ${sqlStr(field(carBlock, 'generation'))}, ${sqlStr(field(carBlock, 'chassisCode'))},
  ${sqlStr(body)}, ${sqlStr(modelUrl)}, ${rotationDeg}, ${lengthM}, ${sqlStr(paintMatch)}, ${sqlStr(hideMatch)}, true)
on conflict (id) do update set
  model_url = excluded.model_url, model_rotation_deg = excluded.model_rotation_deg, model_length_m = excluded.model_length_m,
  paint_mesh_match = excluded.paint_mesh_match, hide_mesh_match = excluded.hide_mesh_match, active = true, updated_at = now()${opts.name ? ',\n  name = excluded.name, badge = excluded.badge' : ''};
`);
log(`Wrote ${path.relative(ROOT, migration)} (apply it to Supabase, or set the same fields in /admin > Cars)`);

// ---------------------------------------------------------------------------------------------------
// 7. Credits
// ---------------------------------------------------------------------------------------------------
if (fs.existsSync(CREDITS)) {
  const row = `| \`${opts.car}.glb\` | Prepared package ${pkg.packageName} (Drive > 3d cars) | not stated | **Licence not confirmed** | Game-derived per the package READ ME: prototype use only until a licence is in hand. Wheels replaced in the app; paint material \`Paint\`. |`;
  let text = fs.readFileSync(CREDITS, 'utf8');
  const existing = new RegExp(`^\\| \`${opts.car}\\.glb\` \\|.*$`, 'm');
  if (existing.test(text)) text = text.replace(existing, row);
  else {
    const rows = [...text.matchAll(/^\|.*\|$/gm)];
    const lastRow = rows[rows.length - 1];
    text = lastRow ? `${text.slice(0, lastRow.index + lastRow[0].length)}\n${row}${text.slice(lastRow.index + lastRow[0].length)}` : `${text}\n${row}\n`;
  }
  fs.writeFileSync(CREDITS, text);
  log(`Updated ${path.relative(ROOT, CREDITS)} (licence row: NOT CONFIRMED)`);
}

// ---------------------------------------------------------------------------------------------------
// 8. Body frames: retire, re-render or keep
// ---------------------------------------------------------------------------------------------------
function writeManifest() {
  const m = {};
  for (const c of fs.readdirSync(RENDERS).sort()) {
    const dir = path.join(RENDERS, c);
    if (!fs.statSync(dir).isDirectory()) continue;
    m[c] = fs.readdirSync(dir).filter((v) => fs.existsSync(path.join(dir, v, 'gloss_w.webp'))).sort();
  }
  fs.writeFileSync(path.join(RENDERS, 'manifest.json'), JSON.stringify(m, null, 1));
  return m;
}
const carIndex = () => {
  const t = fs.readFileSync(CATALOGUE, 'utf8');
  const ids = [...t.slice(t.indexOf('export const BMW_MODELS'), t.indexOf('export const BMW_PAINTS')).matchAll(/^    id: '([^']+)'/gm)].map((x) => x[1]);
  return ids.indexOf(opts.car);
};
const devServerUp = () => {
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${opts.port}/scripts/render/engine.html`]);
  return r.status === 0 && r.stdout.toString() === '200';
};

if (opts.live) {
  if (hadRenders) {
    fs.rmSync(rendersDir, { recursive: true, force: true });
    writeManifest();
    log(`Retired public/renders/${opts.car} (old Blender frames of the old model) and rebuilt the manifest: the configurator now draws the GLB live for this car. Run with --render later for Blender body frames of the new model.`);
  } else {
    log('No old render frames for this car: the configurator draws the GLB live.');
  }
} else if (opts.render) {
  const hasBpy = spawnSync('python3', ['-c', 'import bpy']).status === 0;
  if (!hasBpy) die('--render needs Blender as a Python module: pip install bpy "numpy<2.0,>=1.26" (then run again with --render --keep-renders to skip the steps above)');
  if (!devServerUp()) die(`--render needs the dev server: bunx vite --host 127.0.0.1 --port ${opts.port}`);
  if (opts.port !== '5173') die('scripts/prerender/export-scene.cjs reads the dev server on port 5173; start it there for --render');
  const idx = carIndex();
  log(`\nRendering the Blender body frames (car index ${idx}, STUDIO=dark; about 15 minutes on 4 cores)...`);
  const started = Date.now();
  const r = spawnSync('bash', [path.join(ROOT, 'scripts/prerender/render-all.sh'), String(idx)], { stdio: 'inherit', env: { ...process.env, STUDIO: process.env.STUDIO || 'dark' } });
  if (r.status !== 0) die('render-all.sh failed (see above); the GLB, catalogue and migration are in place, so --live is the fallback');
  // render-all.sh pipes Blender through grep, so it exits 0 even when Blender is killed (e.g. out of memory). Check the
  // frames themselves: every view the other cars have needs a gloss_w.webp written by this run.
  const manifest = JSON.parse(fs.readFileSync(path.join(RENDERS, 'manifest.json'), 'utf8'));
  const expected = [...new Set(Object.entries(manifest).filter(([c, v]) => c !== opts.car && v.length).flatMap(([, v]) => v))];
  const fresh = (manifest[opts.car] || []).filter((v) => fs.statSync(path.join(rendersDir, v, 'gloss_w.webp')).mtimeMs >= started);
  const missing = expected.filter((v) => !fresh.includes(v));
  if (!fresh.length || missing.length) {
    die(`Blender wrote no new body frames for ${missing.length ? missing.join(', ') : 'any view'} of ${opts.car} (it was probably killed, `
      + 'e.g. out of memory: run scripts/prerender/render_car.py by hand to see why). The GLB, catalogue and migration are in place, so --live is the fallback');
  }
  log(`Rendered public/renders/${opts.car} (${fresh.length} views) and updated the manifest.`);
}

// ---------------------------------------------------------------------------------------------------
// 9. Check shots
// ---------------------------------------------------------------------------------------------------
if (opts.check) {
  if (!devServerUp()) {
    log(`\n--check skipped: start the dev server first (bunx vite --host 127.0.0.1 --port ${opts.port}) and run: node scripts/ingest-car.mjs ${input} --car ${opts.car} --keep-renders --check`);
  } else {
    const idx = carIndex();
    const paints = (() => {
      const t = fs.readFileSync(CATALOGUE, 'utf8');
      return [...t.slice(t.indexOf('export const BMW_PAINTS'), t.indexOf('export const WHEEL_FINISHES')).matchAll(/\{ id: '([^']+)'/g)].map((x) => x[1]);
    })();
    const paint = (id) => Math.max(0, paints.indexOf(id));
    const rendered = fs.existsSync(path.join(rendersDir, 'frontThreeQuarter', 'gloss_w.webp')) ? '&rendered=1' : '';
    const outDir = path.join(ROOT, 'docs/ingest', opts.car);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const shots = [
      { name: '1-front34-grey', car: idx, paint: paint('brooklyn_grey'), wheel: 'forged_fsa002', finish: 'liquid_metal', view: 'frontThreeQuarter', w: 1280, h: 800, q: rendered },
      { name: '2-side-black', car: idx, paint: paint('black_sapphire'), wheel: 'forged_fsa002', finish: 'silver', view: 'side', w: 1280, h: 800, q: rendered },
      { name: '3-rear34-white', car: idx, paint: paint('alpine_white'), wheel: 'sixnine_ff3', finish: 'black', view: 'rearThreeQuarter', w: 1280, h: 800, q: rendered },
      { name: '4-wheel-grey', car: idx, paint: paint('brooklyn_grey'), wheel: 'forged_fsa002', finish: 'liquid_metal', view: 'frontWheel', w: 1280, h: 800, q: rendered }
    ];
    const spec = path.join(os.tmpdir(), `ingest-car-${opts.car}-shots.json`);
    fs.writeFileSync(spec, JSON.stringify(shots));
    log(`\nShooting ${shots.length} check views with scripts/render/shoot.cjs (about a minute each on SwiftShader)...`);
    const r = spawnSync('node', [path.join(ROOT, 'scripts/render/shoot.cjs'), outDir, spec], { encoding: 'utf8', env: { ...process.env } });
    process.stdout.write(r.stdout || '');
    if (r.status !== 0) log(`shoot.cjs failed: ${r.stderr}`);
    const wheelWarning = (r.stdout || '').match(/found (\d)\/4 wheels/);
    if (wheelWarning) log(`  WARNING from the engine: found ${wheelWarning[1]}/4 wheels by name; the forged wheels are at default positions.`);
    const sheet = path.join(ROOT, 'docs/ingest', `${opts.car}.jpg`);
    const py = spawnSync('python3', ['-I', '-', outDir, sheet, `${opts.car}: ${path.basename(pkg.glb)}`], {
      input: `
import sys, os, glob
from PIL import Image, ImageDraw
src, dst, title = sys.argv[1:4]
files = sorted(glob.glob(os.path.join(src, '*.png')))
if files:
    W = 640
    ims = [Image.open(f).convert('RGB') for f in files]
    ims = [im.resize((W, round(im.height * W / im.width))) for im in ims]
    cols = 2; rows = (len(ims) + cols - 1) // cols
    h = max(im.height for im in ims)
    sheet = Image.new('RGB', (cols * W, 28 + rows * (h + 22)), (18, 18, 20))
    d = ImageDraw.Draw(sheet); d.text((8, 7), title, fill=(230, 230, 230))
    for i, (im, f) in enumerate(zip(ims, files)):
        x = (i % cols) * W; y = 28 + (i // cols) * (h + 22)
        sheet.paste(im, (x, y + 20)); d.text((x + 6, y + 4), os.path.basename(f)[:-4], fill=(200, 200, 200))
    sheet.save(dst, quality=86)
    print('contact sheet', dst)
`, encoding: 'utf8' });
    process.stdout.write(py.stdout || '');
    if (py.status !== 0) log(`contact sheet failed: ${py.stderr}`);
    log(`Look at ${path.relative(ROOT, sheet)}: one paint colour over the whole body, forged wheels in the arches, glass tinted, right size and facing. Fix with --rotation / --length / --paint-match / --hide-match and run again.`);
  }
}

// ---------------------------------------------------------------------------------------------------
// 10. Type-check the catalogue edit
// ---------------------------------------------------------------------------------------------------
const tsc = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
if (tsc.status === 0) log('\nType-check passed (tsc --noEmit).');
else log(`\nType-check FAILED; look at data/configuratorData.ts:\n${(tsc.stdout || tsc.stderr).split('\n').slice(0, 12).join('\n')}`);

log(`\nNext: git add -A && git commit -m "Add prepared ${opts.car} model" && git push, then deploy. Supabase: apply ${path.basename(migration)} (or set the same fields in /admin > Cars > ${opts.car}).`);

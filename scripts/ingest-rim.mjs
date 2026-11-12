#!/usr/bin/env node
/**
 * Puts a 3D rim file on a configurator wheel in one command.
 *
 *   node scripts/ingest-rim.mjs <rim.glb> --wheel forged_fsa_03 [--flip] [--check] [--budget 160000]
 *   node scripts/ingest-rim.mjs <rim.glb> --wheel forged_fsa005 --new --name FSA005 --finishes gold,hyper_black --price-zar 75000
 *
 * Takes a rim GLB in the website's convention (public/models/wheels/README.md in the Forgedwebsite repo:
 * meshes Rim_Barrel, Rim_Face_Spokes, Hardware_Bolts, Center_Cap; axle bore at the origin; no tyre) or any
 * complete rim (face + barrel + lip + centre, no tyre), and:
 *
 *   1. reads it and checks what the engine needs (CarConfiguratorEngine.mountRimModel): a complete rim
 *      without a tyre, one thin axis (the axle), sensible width-to-diameter
 *   2. packs it for the live site with scripts/rim3d/pack.mjs (weld, simplify to the triangle budget,
 *      quantize, meshopt) into public/models/rims/<wheelId>.glb (and <wheelId>-rear.glb with --rear)
 *   3. sets modelUrl / modelFlip on the wheel in the bundled catalogue (data/configuratorData.ts) and
 *      writes a Supabase migration for public.wheels, so both sources of truth agree; with --new the
 *      wheel row is created first (PLACEHOLDER copy, finished in /admin)
 *   4. --check shoots the wheel on the prepared M4 CS (close-up in two finishes, front three-quarter)
 *      and the prepared M5 (21", front three-quarter) into docs/ingest/rims/<wheelId>/ with a contact
 *      sheet docs/ingest/rims/<wheelId>.jpg (needs the dev server: bunx vite --host 127.0.0.1 --port 5173)
 *
 * Options
 *   --wheel <id>          catalogue wheel id, e.g. forged_fsa_03 (required; lowercase letters, digits, _)
 *   --flip                the rim face points into the car in the check shot: mirror it (modelFlip)
 *   --rear <rear.glb>     staggered set: a second file packed as the rear rim (rearModelUrl)
 *   --budget <n>          triangle budget for packing (default 160000: no reduction, the thin spokes break below ~100k)
 *   --drop <regex>        mesh names removed when packing (default: brake parts and tyres, see
 *                         scripts/rim3d/pack.mjs); --drop '' keeps every mesh
 *   --check               screenshots (see 4)          --port <n>  dev server port (default 5173)
 *   --dry-run             print the check and the plan; change nothing (no pack, no catalogue edit, no
 *                         migration, no image copy)
 *   --new                 the wheel is not in the catalogue yet: create its row (an existing id is refused;
 *                         drop --new to put a rim on a wheel that already exists). Needs --name, --finishes
 *                         and --price-zar or --price-usd; the rest default to PLACEHOLDER copy:
 *     --name <name>           display name (required with --new)
 *     --code <code>           short code shown on the card (default: the name in capitals)
 *     --subtitle <text>       one-line subtitle            --style <text>  e.g. "Monoblock Forged" (default)
 *     --spokes <n>            spoke count (default 10)     --sizes 20,21   sizes offered (default 20,21)
 *     --price-zar <n> | --price-usd <n>   price of a set of four (ZAR is stored in USD at the ZA rate, 18.2)
 *     --finishes a,b,c        finish ids from WHEEL_FINISHES, e.g. gold,hyper_black,polished_face (required)
 *     --default-finish <id>   one of --finishes (default: the first)
 *     --image <file|/path>    thumbnail: a file copied into public/rim-images/, or a /path already there
 *     --description <text>    card description
 *   -h, --help            this text
 *
 * On the car the 3D rim replaces the wheel's photo face (the engine prefers modelUrl); the rim detail page
 * keeps its pre-rendered spin. The engine gives every mesh the selected finish material, so the file's own
 * colours do not matter. If the spokes face into the car in the check shot, run again with --flip (without
 * --new: the wheel exists by then).
 *
 * To go back to the photo face: remove modelUrl from the wheel (or clear "Rim 3D model" in /admin).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOGUE = path.join(ROOT, 'data/configuratorData.ts');
const RIMS = path.join(ROOT, 'public/models/rims');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

const die = (msg) => {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
};
const log = (msg) => console.log(msg);
// A failed read, write or spawn ends with one line, not a stack trace.
process.on('uncaughtException', (e) => die(e?.message || String(e)));
process.on('unhandledRejection', (e) => die(e?.message || String(e)));

const opts = { flip: false, check: false, dryRun: false, budget: '160000', port: '5173', isNew: false };
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const valued = {
    '--wheel': 'wheel', '--budget': 'budget', '--port': 'port',
    // --new: the wheel is not in the catalogue yet; these describe it (prices in ZAR are converted at the ZA region rate)
    '--name': 'name', '--code': 'code', '--subtitle': 'subtitle', '--style': 'style', '--spokes': 'spokes', '--sizes': 'sizes',
    '--price-zar': 'priceZar', '--price-usd': 'priceUsd', '--finishes': 'finishes', '--default-finish': 'defaultFinish',
    '--image': 'image', '--description': 'description', '--rear': 'rear',
    // --drop: regex of mesh names removed when packing (default: brake parts and tyres, see scripts/rim3d/pack.mjs); '' keeps everything
    '--drop': 'drop'
  };
  if (valued[a]) {
    if (argv[i + 1] === undefined) die(`${a} needs a value`);
    opts[valued[a]] = argv[++i];
  } else if (a === '--new') opts.isNew = true;
  else if (a === '--flip') opts.flip = true;
  else if (a === '--check') opts.check = true;
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }
  else if (a.startsWith('--')) die(`unknown option ${a} (see --help)`);
  else positional.push(a);
}
const input = positional[0];
if (!input) die('usage: node scripts/ingest-rim.mjs <rim.glb> --wheel <id> [--flip] [--check] (see --help)');
if (!fs.existsSync(input)) die(`${input} does not exist`);
if (!/\.glb$/i.test(input)) die('the input must be a .glb (STEP/IGES/STL/OBJ: `bun run rim:convert` first, or upload in /admin)');
if (!opts.wheel || !/^[a-z0-9_]+$/.test(opts.wheel)) die('--wheel <id> is required, e.g. forged_fsa_03');
if (!(+opts.budget > 1000)) die('--budget is a triangle count, e.g. 160000');
if (opts.rear && (!fs.existsSync(opts.rear) || !/\.glb$/i.test(opts.rear))) die('--rear must be the rear rim .glb of a staggered set');
if (opts.isNew) {
  if (!opts.name) die('--new needs --name "Wheel name"');
  if (!opts.finishes) die('--new needs --finishes liquid_metal,bronze,... (finish ids from WHEEL_FINISHES)');
  if (!opts.priceZar && !opts.priceUsd) die('--new needs --price-zar 75000 or --price-usd 4120 (set of four)');
}

// ---------------------------------------------------------------------------------------------------
// 1. Read and check
// ---------------------------------------------------------------------------------------------------
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
let doc;
try {
  doc = await io.read(input);
} catch (e) {
  die(`could not read ${input}: ${e.message}`);
}
const root = doc.getRoot();
const meshes = [];
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let tris = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  const v = [0, 0, 0];
  let count = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const idx = prim.getIndices();
    count += (idx ? idx.getCount() : pos.getCount()) / 3;
    const n = pos.getCount();
    const stride = Math.max(1, Math.floor(n / 60000));
    for (let i = 0; i < n; i += stride) {
      pos.getElement(i, v);
      const p = [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
      ];
      for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
    }
  }
  tris += count;
  meshes.push({ name: node.getName() || mesh.getName() || '(unnamed)', tris: Math.round(count), materials: mesh.listPrimitives().map((p) => p.getMaterial()?.getName() || '').filter(Boolean) });
}
if (!meshes.length) die('the file has no meshes');
const size = max.map((v, i) => v - min[i]);
const axle = size.indexOf(Math.min(...size));
const diameter = Math.max(...size.filter((_, i) => i !== axle));
const width = size[axle];
const ratio = width / diameter;
const names = meshes.map((x) => x.name);
const tyre = names.filter((n) => /tyre|tire/i.test(n));
const partOf = (re) => names.filter((n) => re.test(n));
const fileSize = fs.statSync(input).size;

log(`Rim check (${path.basename(input)}, ${(fileSize / 1024).toFixed(0)} kB, ${Math.round(tris).toLocaleString()} triangles, ${meshes.length} mesh${meshes.length === 1 ? '' : 'es'})`);
log(`  meshes: ${meshes.map((x) => `${x.name} (${x.tris.toLocaleString()})`).join(', ')}`);
log(`  barrel/lip: ${partOf(/barrel|lip/i).join(', ') || 'none named'}   face: ${partOf(/face|spoke/i).join(', ') || 'none named'}   cap: ${partOf(/cap/i).join(', ') || 'none named'}   bolts: ${partOf(/bolt|nut|hardware/i).join(', ') || 'none named'}`);
log(`  size: ${size.map((v) => v.toFixed(3)).join(' x ')} (axle along ${'XYZ'[axle]}, diameter ${diameter.toFixed(3)}, width ${width.toFixed(3)}, width/diameter ${ratio.toFixed(2)})`);
log(`  extensions: ${root.listExtensionsUsed().map((e) => e.extensionName).join(', ') || 'none'}`);
const problems = [];
const DROP_DEFAULT = '^(brake|caliper|calliper|rotor|tyre|tire)([^a-z]|$)'; // the same default as scripts/rim3d/pack.mjs
const dropRe = opts.drop === '' ? null : new RegExp(opts.drop ?? DROP_DEFAULT, 'i');
const dropped = dropRe ? names.filter((n) => dropRe.test(n)) : [];
if (dropped.length) log(`  note: dropped when packing (${dropped.join(', ')}): the engine draws its own disc and caliper. Keep them with --drop ''`);
if (tyre.length) problems.push(`the file holds a tyre (${tyre.join(', ')}); the engine adds its own tyre, so export the rim only.`);
if (ratio < 0.25 || ratio > 0.8) problems.push(`width/diameter ${ratio.toFixed(2)} is outside 0.25-0.8: this is not a complete rim (a flat face only?), or the units differ per axis. The engine needs face + barrel + lip + centre.`);
if (!partOf(/barrel|lip/i).length) log('  note: no mesh named barrel/lip; fine if the barrel is part of another mesh (the engine hides its own barrel and lip whatever the names)');
for (const p of problems) log(`  PROBLEM: ${p}`);
if (problems.length) {
  log('\nFix the problems above and run again. Nothing was changed.');
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------------
// 2. Catalogue lookup
// ---------------------------------------------------------------------------------------------------
let source = fs.readFileSync(CATALOGUE, 'utf8');
const wheelsStart = source.indexOf('export const WHEEL_DESIGNS');
const wheelsEnd = source.indexOf('\n];', wheelsStart);
if (wheelsStart < 0 || wheelsEnd < 0) die('data/configuratorData.ts: WHEEL_DESIGNS not found');
const wheelIds = [...source.slice(wheelsStart, wheelsEnd).matchAll(/^    id: '([^']+)'/gm)].map((m) => m[1]);
const finishIds = [...source.slice(source.indexOf('export const WHEEL_FINISHES'), wheelsStart).matchAll(/^    id: '([^']+)'/gm)].map((m) => m[1]);
const exists = wheelIds.includes(opts.wheel);
if (!exists && !opts.isNew) die(`${opts.wheel} is not a wheel in the catalogue (${wheelIds.join(', ')}); add --new --name ... --finishes ... --price-zar ... to create it`);
// --new on a wheel that exists would append a second row with the same id and write a migration that
// reactivates it; the rim goes on the existing row without --new.
if (exists && opts.isNew) die(`${opts.wheel} is already in the catalogue; drop --new (and the --name/--finishes/--price options) to put the rim on the existing wheel, or pick a new id`);
const modelUrl = `/models/rims/${opts.wheel}.glb`;
const target = path.join(RIMS, `${opts.wheel}.glb`);
const rearModelUrl = opts.rear ? `/models/rims/${opts.wheel}-rear.glb` : null;
const rearTarget = opts.rear ? path.join(RIMS, `${opts.wheel}-rear.glb`) : null;

// A new wheel row (the same shape as the rows in WHEEL_DESIGNS; PLACEHOLDER copy the owner edits in /admin)
const ZA_RATE = 18.2; // config/brand.ts: ZAR per USD; the catalogue prices in USD
const round2 = (n) => Math.round(n * 100) / 100;
const newRow = opts.isNew ? (() => {
  const finishes = opts.finishes.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = finishes.filter((f) => !finishIds.includes(f));
  if (unknown.length) die(`unknown finish id(s) ${unknown.join(', ')}; known: ${finishIds.join(', ')}`);
  const sizes = (opts.sizes || '20,21').split(',').map((s) => `${s.trim().replace(/"$/, '')}"`);
  // USD to the cent, so the ZA price shows exactly as on the stock sheet (formatMoney rounds to R10)
  const base = opts.priceUsd ? +opts.priceUsd : round2(+opts.priceZar / ZA_RATE);
  if (!(base > 0)) die('the price must be a number');
  // The stock sheet prices a design once, whatever the size; per-size prices are set in /admin if they differ
  const priceBySize = Object.fromEntries(sizes.map((s) => [s, base]));
  return {
    id: opts.wheel, code: opts.code || opts.name.toUpperCase(), name: opts.name, subtitle: opts.subtitle || 'PLACEHOLDER subtitle', style: opts.style || 'Monoblock Forged',
    spokeType: 'multi', spokeCount: +(opts.spokes || 10), standardSizes: sizes, pricePerSet: priceBySize[sizes[0]], priceBySize,
    description: opts.description || 'PLACEHOLDER description: set the real copy in /admin.', highlights: [],
    availableVariants: finishes, defaultVariant: opts.defaultFinish && finishes.includes(opts.defaultFinish) ? opts.defaultFinish : finishes[0],
    imageUrl: opts.image ? (opts.image.startsWith('/') ? opts.image : `/rim-images/${path.basename(opts.image)}`) : null, imageExtrude: false
  };
})() : null;
const copyImage = newRow && opts.image && !opts.image.startsWith('/') && !fs.existsSync(path.join(ROOT, 'public', newRow.imageUrl));
if (copyImage && !fs.existsSync(opts.image)) die(`--image ${opts.image} does not exist`);

log(`\nPlan for ${opts.wheel}${newRow ? ` (new wheel "${newRow.name}", ${newRow.standardSizes.join(' ')}, $${newRow.pricePerSet} per set, finishes ${newRow.availableVariants.join('/')})` : ''}: model_url ${modelUrl}${rearModelUrl ? `, rear_model_url ${rearModelUrl}` : ''}, model_flip ${opts.flip}, packed to <= ${(+opts.budget).toLocaleString()} triangles${copyImage ? `, thumbnail copied to public${newRow.imageUrl}` : ''}`);
if (opts.dryRun) {
  log('--dry-run: nothing changed.');
  process.exit(0);
}

// Only past the dry-run exit does anything touch the working tree (the thumbnail copy included)
if (copyImage) {
  fs.mkdirSync(path.join(ROOT, 'public/rim-images'), { recursive: true });
  fs.copyFileSync(opts.image, path.join(ROOT, 'public', newRow.imageUrl));
}

if (newRow) {
  // Append the row before the closing "];" of WHEEL_DESIGNS
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const arr = (a) => `[${a.map(q).join(', ')}]`;
  const entry = [
    '  {',
    `    id: ${q(newRow.id)},`,
    `    code: ${q(newRow.code)},`,
    `    name: ${q(newRow.name)},`,
    `    subtitle: ${q(newRow.subtitle)},`,
    `    style: ${q(newRow.style)},`,
    `    spokeType: ${q(newRow.spokeType)},`,
    `    spokeCount: ${newRow.spokeCount},`,
    '    weightFrontKg: 0,',
    '    weightRearKg: 0,',
    '    weightSavingsKg: 0,',
    `    standardSizes: ${arr(newRow.standardSizes)},`,
    `    pricePerSet: ${newRow.pricePerSet},`,
    `    priceBySize: { ${Object.entries(newRow.priceBySize).map(([k, v]) => `${q(k)}: ${v}`).join(', ')} },`,
    `    description: ${q(newRow.description)},`,
    '    highlights: [],',
    `    availableVariants: ${arr(newRow.availableVariants)},`,
    `    defaultVariant: ${q(newRow.defaultVariant)},`,
    `    imageUrl: ${newRow.imageUrl ? q(newRow.imageUrl) : 'null'},`,
    '    imageExtrude: false',
    '  }'
  ];
  const before = source.slice(0, wheelsEnd).replace(/\s*$/, '');
  source = `${before}${before.endsWith(',') || before.endsWith('[') ? '' : ','}\n${entry.join('\n')}${source.slice(wheelsEnd)}`;
  fs.writeFileSync(CATALOGUE, source);
  log(`Added ${opts.wheel} to data/configuratorData.ts`);
}

// ---------------------------------------------------------------------------------------------------
// 3. Pack
// ---------------------------------------------------------------------------------------------------
fs.mkdirSync(RIMS, { recursive: true });
const packArgs = (from, to) => [path.join(ROOT, 'scripts/rim3d/pack.mjs'), path.resolve(from), to, opts.budget, ...(opts.drop !== undefined ? [opts.drop] : [])];
const pack = spawnSync('node', packArgs(input, target), { encoding: 'utf8' });
process.stdout.write(pack.stdout || '');
if (pack.status !== 0) die(`pack.mjs failed: ${pack.stderr}`);
log(`Wrote ${path.relative(ROOT, target)} (${(fs.statSync(target).size / 1024).toFixed(0)} kB)`);
if (opts.rear) {
  const packRear = spawnSync('node', packArgs(opts.rear, rearTarget), { encoding: 'utf8' });
  process.stdout.write(packRear.stdout || '');
  if (packRear.status !== 0) die(`pack.mjs failed on the rear rim: ${packRear.stderr}`);
  log(`Wrote ${path.relative(ROOT, rearTarget)} (${(fs.statSync(rearTarget).size / 1024).toFixed(0)} kB)`);
}

// ---------------------------------------------------------------------------------------------------
// 4. Bundled catalogue + migration
// ---------------------------------------------------------------------------------------------------
const lines = source.split('\n');
const start = lines.findIndex((l) => l === `    id: '${opts.wheel}',`);
let end = start;
while (end < lines.length && !/^  },?\s*(\/\/.*)?$/.test(lines[end])) end++;   // "  }," with or without a trailing comment
if (start < 0 || end >= lines.length) die('could not find the wheel entry');
const kept = lines.slice(start, end).filter((l) => !/^    (modelUrl|rearModelUrl|modelFlip):/.test(l));
{ // a trailing comma on the last line that holds code (not on a trailing full-line comment), in front of any "// comment"
  let last = kept.length - 1;
  while (last > 0 && /^\s*(\/\/.*)?$/.test(kept[last])) last--;
  const m = kept[last].match(/^(.*?)(\s*\/\/.*)?$/);
  const code = m[1].trimEnd(), comment = m[2] || '';
  if (code && !code.endsWith(',')) kept[last] = `${code},${comment}`;
}
kept.push(`    modelUrl: '${modelUrl}',`);
if (rearModelUrl) kept.push(`    rearModelUrl: '${rearModelUrl}',`);
kept.push(`    modelFlip: ${opts.flip}`);
lines.splice(start, end - start, ...kept);
fs.writeFileSync(CATALOGUE, lines.join('\n'));
log(`Updated ${path.relative(ROOT, CATALOGUE)}`);

const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlArr = (a) => `array[${a.map(sql).join(', ')}]::text[]`;
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
// Always a new, later-stamped file: rewriting an earlier one could put a rear_model_url update before the
// migration that adds the column (20261110153000_wheel_inventory_stock_sheet.sql)
const migration = path.join(MIGRATIONS, `${stamp}_wheel_${opts.wheel}_rim_model.sql`);
fs.mkdirSync(MIGRATIONS, { recursive: true });
fs.writeFileSync(migration, `-- ${opts.wheel}: 3D rim ${path.basename(input)}${opts.rear ? ` + rear ${path.basename(opts.rear)}` : ''} packed by scripts/ingest-rim.mjs on ${new Date().toISOString().slice(0, 10)}.
-- Served from the repo at ${modelUrl}; on the car it replaces the wheel's photo face (the rim page keeps its spin).
${newRow ? `-- New wheel with PLACEHOLDER copy; set the real name, sizes, prices and description in /admin.
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, standard_sizes, price_per_set, price_by_size,
  description, highlights, available_variants, default_variant, image_url, image_extrude, model_url, model_flip, active)
values (${sql(newRow.id)}, ${sql(newRow.code)}, ${sql(newRow.name)}, ${sql(newRow.subtitle)}, ${sql(newRow.style)}, ${sql(newRow.spokeType)}, ${newRow.spokeCount},
  ${sqlArr(newRow.standardSizes)}, ${newRow.pricePerSet}, ${sql(JSON.stringify(newRow.priceBySize))}::jsonb,
  ${sql(newRow.description)}, '{}'::text[], ${sqlArr(newRow.availableVariants)}, ${sql(newRow.defaultVariant)}, ${newRow.imageUrl ? sql(newRow.imageUrl) : 'null'}, false, '${modelUrl}', ${opts.flip}, true)
on conflict (id) do update set model_url = excluded.model_url, model_flip = excluded.model_flip, image_url = coalesce(public.wheels.image_url, excluded.image_url),
  image_extrude = false, active = true, updated_at = now();
` : `update public.wheels set model_url = '${modelUrl}', model_flip = ${opts.flip}, updated_at = now() where id = '${opts.wheel}';
`}${rearModelUrl ? `-- Staggered set: the rear rim file (the rear_model_url column comes from 20261110153000_wheel_inventory_stock_sheet.sql).
update public.wheels set rear_model_url = '${rearModelUrl}', updated_at = now() where id = '${opts.wheel}';
` : ''}`);
log(`Wrote ${path.relative(ROOT, migration)} (apply it to Supabase, or upload the same file in /admin > Wheels > ${opts.wheel} > Rim 3D model)`);

// ---------------------------------------------------------------------------------------------------
// 5. Check shots
// ---------------------------------------------------------------------------------------------------
if (opts.check) {
  const up = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${opts.port}/scripts/render/engine.html`]);
  if (!(up.status === 0 && up.stdout.toString() === '200')) {
    log(`\n--check skipped: start the dev server first (bunx vite --host 127.0.0.1 --port ${opts.port}).`);
  } else {
    const idx = opts.wheel; // engine.html takes the wheel id (hidden designs included), so no index arithmetic
    // engine.html takes the car as an index into BMW_MODELS (hidden cars included: index 0 is the retired Sketchfab
    // M4), so look the prepared cars up by id instead of hard-coding a position that moves when a row is added
    const carIds = [...source.slice(source.indexOf('export const BMW_MODELS'), source.indexOf('export const BMW_PAINTS')).matchAll(/^    id: '([^']+)'/gm)].map((m) => m[1]);
    const carIdx = (id) => { const i = carIds.indexOf(id); if (i < 0) die(`${id} is not a car in data/configuratorData.ts (check shots need it)`); return i; };
    const m4cs = carIdx('m4_cs_g82'), m5 = carIdx('m5_g90');
    const outDir = path.join(ROOT, 'docs/ingest/rims', opts.wheel);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const shots = [
      { name: '1-wheel-liquid-metal', car: m4cs, paint: 2, wheel: idx, finish: 'liquid_metal', view: 'frontWheel', w: 1280, h: 800 },
      { name: '2-wheel-black', car: m4cs, paint: 2, wheel: idx, finish: 'black', view: 'frontWheel', w: 1280, h: 800 },
      { name: '3-front34-silver', car: m4cs, paint: 3, wheel: idx, finish: 'silver', view: 'frontThreeQuarter', w: 1280, h: 800 },
      { name: '4-front34-bronze-21', car: m5, paint: 7, wheel: idx, finish: 'bronze', size: '21"', view: 'frontThreeQuarter', w: 1280, h: 800 }
    ];
    const spec = path.join(os.tmpdir(), `ingest-rim-${opts.wheel}-shots.json`);
    fs.writeFileSync(spec, JSON.stringify(shots));
    log(`\nShooting ${shots.length} check views (about a minute each on SwiftShader)...`);
    const r = spawnSync('node', [path.join(ROOT, 'scripts/render/shoot.cjs'), outDir, spec], { encoding: 'utf8' });
    process.stdout.write(r.stdout || '');
    if (r.status !== 0) log(`shoot.cjs failed: ${r.stderr}`);
    const sheet = path.join(ROOT, 'docs/ingest/rims', `${opts.wheel}.jpg`);
    const py = spawnSync('python3', ['-I', '-', outDir, sheet, `${opts.wheel}: ${path.basename(input)}${opts.flip ? ' (flipped)' : ''}`], {
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
    log(`Look at ${path.relative(ROOT, sheet)}: spokes facing out (else --flip), the rim filling the tyre, the caliper visible behind the spokes.`);
  }
}

const tsc = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
log(tsc.status === 0 ? '\nType-check passed (tsc --noEmit).' : `\nType-check FAILED:\n${(tsc.stdout || tsc.stderr).split('\n').slice(0, 12).join('\n')}`);
log(`\nNext: git add -A && git commit -m "3D rim for ${opts.wheel}" && git push, then deploy and apply ${path.basename(migration)}.`);

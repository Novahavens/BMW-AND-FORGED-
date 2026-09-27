#!/usr/bin/env node
/**
 * cad-to-glb: turn a wheel manufacturer's CAD/mesh file into a web-ready rim GLB for the
 * configurator (WheelDesign.modelUrl, uploaded to the `rim-models` bucket via /admin).
 *
 *   node scripts/cad-to-glb.mjs <input.step|.stp|.iges|.igs|.brep|.stl|.obj> [out.glb] [options]
 *
 * Output: one mesh with a single "RimFinish" material, axle along X with the outboard face
 * towards +X, real size in metres, meshopt-compressed. The pipeline lives in
 * services/cadToGlbCore.js and is shared with the in-browser converter (services/cadToGlb.ts).
 *
 * Options:
 *   --axis x|y|z        axle axis in the source file (default: auto-detect)
 *   --flip              invert the auto-detected face direction
 *   --units mm|cm|m|in  units of STL/OBJ input (default: guessed from size; STEP/IGES carry units)
 *   --max-tris N        triangle budget (default 150000)
 *   --error E           max simplification error, fraction of mesh size (default 0.0008)
 *   --crease DEG        normal crease angle in degrees (default 35)
 *   --deflection MM     CAD tessellation chord tolerance in mm (default 0.08)
 *   --no-compress       write plain (uncompressed) GLB
 *   --diameter M        rescale so the overall diameter is M metres (default: keep real size)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { convertToGlb, DEFAULT_OPTIONS, UNIT_TO_M } from '../services/cadToGlbCore.js';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const opts = { ...DEFAULT_OPTIONS };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--axis') opts.axis = next().toLowerCase();
    else if (a === '--flip') opts.flip = true;
    else if (a === '--units') opts.units = next().toLowerCase();
    else if (a === '--max-tris') opts.maxTris = Number(next());
    else if (a === '--error') opts.error = Number(next());
    else if (a === '--crease') opts.crease = Number(next());
    else if (a === '--deflection') opts.deflection = Number(next());
    else if (a === '--no-compress') opts.compress = false;
    else if (a === '--diameter') opts.diameter = Number(next());
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length < 1) usage(1);
  if (opts.axis && !['x', 'y', 'z'].includes(opts.axis)) fail('--axis must be x, y or z');
  if (opts.units && !(opts.units in UNIT_TO_M)) fail(`--units must be one of ${Object.keys(UNIT_TO_M).join(', ')}`);
  const input = pos[0];
  const output = pos[1] || input.replace(/\.[^.]+$/, '') + '.glb';
  return { input, output, opts };
}
function usage(code) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, ''));
  process.exit(code);
}
function fail(msg) {
  console.error(`cad-to-glb: ${msg}`);
  process.exit(1);
}

async function main() {
  const { input, output, opts } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(input)) fail(`no such file: ${input}`);
  const bytes = new Uint8Array(fs.readFileSync(input));
  const { glb } = await convertToGlb(bytes, path.basename(input), {
    options: opts,
    loadOcct: () => require('occt-import-js')({ print: () => {}, printErr: () => {} }),
    log: (m) => {
      if (!m.endsWith('...')) console.log(m);
    },
    warn: (m) => console.warn(`warning   ${m}`),
    generator: 'BMW-AND-FORGED scripts/cad-to-glb.mjs'
  });
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, glb);
  console.log(`output    ${output}`);
}

main().catch((err) => fail(err?.message || String(err)));

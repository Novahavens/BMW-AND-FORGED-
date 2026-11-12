// Writes plain glTF copies of the site's rim files for Blender, which cannot read meshopt compression.
//   node scripts/plates/decode-rims.mjs [outDir=/home/claude/plates_src/rims] [inDir=public/models/rims]
// The website and the configurator keep using public/models/rims/*.glb; these copies are render sources only.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const outDir = process.argv[2] || '/home/claude/plates_src/rims';
const inDir = process.argv[3] || 'public/models/rims';
const stop = (msg) => { console.error(`decode-rims: ${msg}`); process.exit(1); };

let names;
try { names = fs.readdirSync(inDir).filter((n) => n.endsWith('.glb')).sort(); } catch (e) { stop(`cannot list ${inDir}: ${e.message}`); }
if (!names.length) stop(`no .glb files in ${inDir}`);
try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { stop(`cannot create ${outDir}: ${e.message}`); }

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const name of names) {
  let doc;
  try { doc = await io.read(path.join(inDir, name)); } catch (e) { stop(`cannot read ${name}: ${e.message}`); }
  await doc.transform(dequantize(), prune());
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext instanceof EXTMeshoptCompression || ext instanceof KHRMeshQuantization) ext.dispose();
  }
  const out = path.join(outDir, name);
  try { await io.write(out, doc); } catch (e) { stop(`cannot write ${out}: ${e.message}`); }
  const tris = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  console.log(`${name}: ${Math.round(tris)} triangles, ${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
}

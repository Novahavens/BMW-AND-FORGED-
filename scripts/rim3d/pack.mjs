// Packs a rim GLB for the live site: weld, simplify to a triangle budget, quantize, meshopt-compress
// (same extensions as public/models/*.glb; the engine registers MeshoptDecoder).
//   node scripts/rim3d/pack.mjs in.glb out.glb [maxTriangles=40000]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
const [, , input, output, budgetArg] = process.argv;
const budget = +(budgetArg || 40000);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const tris = (d) => d.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = tris(doc);
await doc.transform(dedup(), weld());
if (before > budget) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / before, error: 0.001, lockBorder: true }));
await doc.transform(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);
const fs = await import('node:fs');
console.log(`${input}: ${Math.round(before)} -> ${Math.round(tris(doc))} triangles, ${(fs.statSync(output).size / 1024).toFixed(0)} kB`);

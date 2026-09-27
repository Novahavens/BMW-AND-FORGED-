/**
 * Shared CAD/mesh -> rim GLB pipeline, used by both the CLI (scripts/cad-to-glb.mjs) and the
 * browser worker (services/cadToGlb.worker.ts). Plain JS with no Node or DOM APIs, so it runs
 * in Node, a Web Worker, or the main thread.
 *
 * Output convention (matches CarConfiguratorEngine.mountRimModel):
 *   - one mesh, one primitive, one neutral material "RimFinish" (the engine swaps every rim
 *     material for the selected wheel finish, so CAD colours are dropped)
 *   - axle along X, outboard face (spokes / mounting pad side) towards +X
 *   - centred on the axle, real size in metres (the engine rescales to its 20" base anyway)
 *   - welded, simplified to a triangle budget, creased normals, meshopt-compressed
 *     (EXT_meshopt_compression + KHR_mesh_quantization, same as public/models/*.glb)
 */
import { Document, Logger, WebIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
// Static (not dynamic) imports keep the worker a single chunk, which Vite's default iife worker format needs.
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export const CAD_EXTENSIONS = ['.step', '.stp', '.iges', '.igs', '.brep', '.stl', '.obj'];
export const BREP_EXTENSIONS = ['step', 'stp', 'iges', 'igs', 'brep'];

/**
 * @typedef {object} ConvertOptions
 * @property {'x'|'y'|'z'|null} [axis]   axle axis in the source (null = auto-detect)
 * @property {boolean} [flip]             invert the detected face side
 * @property {'mm'|'cm'|'m'|'in'|null} [units]  STL/OBJ units (null = guess from size)
 * @property {number} [maxTris]           triangle budget
 * @property {number} [error]             max simplification error, fraction of mesh size
 * @property {number} [crease]            normal crease angle, degrees
 * @property {number} [deflection]        CAD chord tolerance, mm
 * @property {number} [angularDeflection] CAD angular tolerance, radians
 * @property {boolean} [compress]         meshopt-compress the output
 * @property {number|null} [diameter]     rescale to this overall diameter in metres
 */
/** @type {Required<ConvertOptions>} */
export const DEFAULT_OPTIONS = {
  axis: null,
  flip: false,
  units: null,
  maxTris: 150000,
  error: 0.0008,
  crease: 35,
  deflection: 0.08,
  angularDeflection: 0.2,
  compress: true,
  diameter: null
};

export const UNIT_TO_M = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, inch: 0.0254 };

const fmt = (n) => n.toLocaleString('en-US');

/** File extension without the dot, lower case. */
export function extensionOf(name) {
  const m = /\.([^./\\]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

// ---------------------------------------------------------------- readers
/** Tessellate STEP/IGES/BREP with an initialised occt-import-js instance. Positions in metres. */
function readCad(occt, bytes, ext, opts) {
  const params = {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: opts.deflection,
    angularDeflection: opts.angularDeflection
  };
  const fn = ext === 'iges' || ext === 'igs' ? 'ReadIgesFile' : ext === 'brep' ? 'ReadBrepFile' : 'ReadStepFile';
  const res = occt[fn](bytes, params);
  if (!res || !res.success) throw new Error(`OpenCascade could not read the file (${fn})`);
  if (!res.meshes?.length) throw new Error('the CAD file contains no surfaces to tessellate');
  let nv = 0;
  let ni = 0;
  for (const m of res.meshes) {
    nv += m.attributes.position.array.length / 3;
    ni += m.index.array.length;
  }
  const positions = new Float32Array(nv * 3);
  const indices = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const m of res.meshes) {
    const p = m.attributes.position.array;
    for (let k = 0; k < p.length; k++) positions[vo * 3 + k] = p[k] * 0.001; // mm -> m
    const idx = m.index.array;
    for (let k = 0; k < idx.length; k++) indices[io + k] = idx[k] + vo;
    vo += p.length / 3;
    io += idx.length;
  }
  return { positions, indices, source: `${fn}, ${res.meshes.length} bodies` };
}

/** STL/OBJ via three's loaders. Positions in metres. */
async function readMesh(bytes, ext, opts) {
  let geos = [];
  if (ext === 'stl') {
    geos = [new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
  } else {
    const group = new OBJLoader().parse(new TextDecoder().decode(bytes));
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (o.isMesh) geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
    });
  }
  let nv = 0;
  for (const g of geos) nv += g.index ? g.index.count : g.attributes.position.count;
  if (!nv) throw new Error('no triangles found');
  const positions = new Float32Array(nv * 3);
  let o = 0;
  for (const g of geos) {
    const pa = g.attributes.position;
    const n = g.index ? g.index.count : pa.count;
    for (let k = 0; k < n; k++) {
      const v = g.index ? g.index.getX(k) : k;
      positions[o++] = pa.getX(v);
      positions[o++] = pa.getY(v);
      positions[o++] = pa.getZ(v);
    }
  }
  // Unitless formats: guess from the overall diameter (a road-car rim is ~0.4-0.6 m across).
  const d = Math.max(...extents(positions).size);
  let units = opts.units;
  if (!units) units = d > 100 ? 'mm' : d > 35 ? 'cm' : d > 10 ? 'in' : 'm';
  const s = UNIT_TO_M[units];
  for (let k = 0; k < positions.length; k++) positions[k] *= s;
  const indices = new Uint32Array(nv);
  for (let k = 0; k < nv; k++) indices[k] = k;
  return { positions, indices, source: `${ext.toUpperCase()} (${units}${opts.units ? '' : ', guessed'})` };
}

// ---------------------------------------------------------------- pipeline
/**
 * Convert one CAD/mesh file to rim GLB bytes.
 * @param {Uint8Array} bytes      file contents
 * @param {string} fileName       used for the extension and the asset metadata
 * @param {object} [ctx]
 * @param {ConvertOptions} [ctx.options]
 * @param {() => Promise<any>} [ctx.loadOcct]  returns an initialised occt-import-js module (STEP/IGES/BREP only)
 * @param {(msg: string) => void} [ctx.log]
 * @param {(msg: string) => void} [ctx.warn]
 * @param {string} [ctx.generator]
 * @returns {Promise<{ glb: Uint8Array, stats: object, warnings: string[] }>}
 */
export async function convertToGlb(bytes, fileName, ctx = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(ctx.options || {}) };
  const warnings = [];
  const log = ctx.log || (() => {});
  const warn = (m) => {
    warnings.push(m);
    (ctx.warn || log)(m);
  };
  if (opts.axis && !['x', 'y', 'z'].includes(opts.axis)) throw new Error('axis must be x, y or z');
  if (opts.units && !(opts.units in UNIT_TO_M)) throw new Error(`units must be one of ${Object.keys(UNIT_TO_M).join(', ')}`);
  const ext = extensionOf(fileName);
  const t0 = Date.now();
  let mesh;
  if (BREP_EXTENSIONS.includes(ext)) {
    if (!ctx.loadOcct) throw new Error('no OpenCascade loader supplied for CAD input');
    log('loading OpenCascade...');
    const occt = await ctx.loadOcct();
    log('tessellating CAD...');
    mesh = readCad(occt, bytes, ext, opts);
  } else if (ext === 'stl' || ext === 'obj') {
    mesh = await readMesh(bytes, ext, opts);
  } else {
    throw new Error(`unsupported input type .${ext} (use STEP/STP, IGES/IGS, BREP, STL or OBJ)`);
  }
  const inTris = mesh.indices.length / 3;
  log(`read      ${fileName}: ${fmt(inTris)} triangles [${mesh.source}]`);

  // --- orient: axle -> X, face -> +X, centre on the axle (proper rotation, never a mirror)
  const ex = extents(mesh.positions);
  const det = detectAxis(ex.size);
  const axis = opts.axis ? 'xyz'.indexOf(opts.axis) : det.axis;
  const radius = Math.max(ex.size[(axis + 1) % 3], ex.size[(axis + 2) % 3]) / 2;
  if (!opts.axis && (det.roundness > 0.03 || det.thin > 0.8))
    warn(`axle detection is unsure (cross-section ${(det.roundness * 100).toFixed(1)}% out of round, width/diameter ${det.thin.toFixed(2)}); set the axis explicitly if the result is wrong`);
  const face = detectFace(mesh.positions, mesh.indices, axis, ex.center, radius);
  const sign = face.sign * (opts.flip ? -1 : 1);
  log(`orient    axle = ${'XYZ'[axis]}, face towards ${sign > 0 ? '+' : '-'}${'XYZ'[axis]} (confidence ${(face.confidence * 100).toFixed(0)}%${opts.flip ? ', flipped' : ''})`);
  if (face.confidence < 0.1) warn('face side is ambiguous; check the preview and flip the rim if the spokes face the car');
  // Rows of the rotation: new X = old axis * sign, new Y = next axis, new Z = X cross Y
  const e = (k) => [0, 1, 2].map((i) => (i === k ? 1 : 0));
  const rx = e(axis).map((v) => v * sign);
  const ry = e((axis + 1) % 3);
  const rz = [rx[1] * ry[2] - rx[2] * ry[1], rx[2] * ry[0] - rx[0] * ry[2], rx[0] * ry[1] - rx[1] * ry[0]];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] - ex.center[0];
    const y = p[i + 1] - ex.center[1];
    const z = p[i + 2] - ex.center[2];
    p[i] = x * rx[0] + y * rx[1] + z * rx[2];
    p[i + 1] = x * ry[0] + y * ry[1] + z * ry[2];
    p[i + 2] = x * rz[0] + y * rz[1] + z * rz[2];
  }
  if (opts.diameter) {
    const s = opts.diameter / (radius * 2);
    for (let i = 0; i < p.length; i++) p[i] *= s;
  }
  const diaM = opts.diameter || radius * 2;
  if (diaM > 0.75) warn(`overall diameter is ${(diaM * 1000).toFixed(0)} mm; if the file includes a tyre, remove it in CAD first (the app supplies its own tyre)`);
  if (diaM < 0.25) warn(`overall diameter is only ${(diaM * 1000).toFixed(0)} mm; check the units`);

  // --- weld + simplify
  const scale = diaM;
  let { positions, indices } = weldPositions(mesh.positions, mesh.indices, scale * 1e-5);
  await MeshoptSimplifier.ready;
  const weldedTris = indices.length / 3;
  if (weldedTris > opts.maxTris) {
    log(`simplifying ${fmt(weldedTris)} triangles...`);
    const [simp, err] = MeshoptSimplifier.simplify(indices, positions, 3, opts.maxTris * 3, opts.error, []);
    indices = simp;
    log(`simplify  ${fmt(weldedTris)} -> ${fmt(indices.length / 3)} triangles (error ${(err * scale * 1000).toFixed(2)} mm)`);
    if (indices.length / 3 > opts.maxTris * 1.05)
      warn(`stopped above the ${fmt(opts.maxTris)} budget to stay within error ${opts.error}; raise the error limit to go lower`);
  } else {
    log(`simplify  skipped (${fmt(weldedTris)} triangles is within the ${fmt(opts.maxTris)} budget)`);
  }
  ({ positions, indices } = compact(positions, indices));
  const shaded = creasedNormals(positions, indices, opts.crease);

  // --- write glTF
  log('writing GLB...');
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  doc.getRoot().getAsset().generator = ctx.generator || 'BMW-AND-FORGED cadToGlbCore';
  doc.getRoot().getAsset().extras = { source: fileName, axle: '+X is outboard face', units: 'm' };
  const buffer = doc.createBuffer();
  const material = doc
    .createMaterial('RimFinish')
    .setBaseColorFactor([0.78, 0.79, 0.8, 1])
    .setMetallicFactor(1)
    .setRoughnessFactor(0.3);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor('POSITION').setType('VEC3').setArray(shaded.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor('NORMAL').setType('VEC3').setArray(shaded.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor('INDEX').setType('SCALAR').setArray(shaded.indices).setBuffer(buffer))
    .setMaterial(material);
  const gmesh = doc.createMesh('Rim').addPrimitive(prim);
  const node = doc.createNode('Rim').setMesh(gmesh);
  doc.createScene('Scene').addChild(node);

  await doc.transform(dedup(), prune());
  if (opts.compress) {
    await MeshoptEncoder.ready;
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  }
  // WebIO.writeBinary is platform-neutral (no fetch/fs), so it serves Node and the browser.
  const io = new WebIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(doc);

  const outEx = extents(shaded.positions);
  const dia = Math.max(outEx.size[1], outEx.size[2]);
  const stats = {
    inputTriangles: inTris,
    triangles: shaded.indices.length / 3,
    vertices: shaded.positions.length / 3,
    bytes: glb.byteLength,
    diameterMm: +(dia * 1000).toFixed(1),
    widthMm: +(outEx.size[0] * 1000).toFixed(1),
    bboxMin: outEx.min,
    bboxMax: outEx.max,
    sourceAxis: 'xyz'[axis],
    faceSign: sign,
    faceConfidence: +face.confidence.toFixed(2),
    seconds: +((Date.now() - t0) / 1000).toFixed(1)
  };
  const mb = glb.byteLength / 1048576;
  log(`wrote     ${mb.toFixed(2)} MB, ${fmt(stats.triangles)} triangles, ${fmt(stats.vertices)} vertices`);
  log(`size      diameter ${stats.diameterMm} mm (${(dia / 0.0254).toFixed(1)}"), width ${stats.widthMm} mm, took ${stats.seconds} s`);
  if (mb > 8) warn('file is over 8 MB; lower the triangle budget');
  else if (mb > 3) warn('file is over 3 MB; consider a lower triangle budget for faster loading');
  return { glb, stats, warnings };
}

// ---------------------------------------------------------------- geometry helpers
function extents(p) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = p[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max, size: [0, 1, 2].map((a) => max[a] - min[a]), center: [0, 1, 2].map((a) => (max[a] + min[a]) / 2) };
}

/** Merge vertices that share a position (quantised to `tol` metres); drop degenerate triangles. */
function weldPositions(positions, indices, tol) {
  const map = new Map();
  const out = [];
  const remap = new Uint32Array(positions.length / 3);
  const inv = 1 / tol;
  for (let v = 0; v < remap.length; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      map.set(key, id);
      out.push(x, y, z);
    }
    remap[v] = id;
  }
  const idx = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]];
    const b = remap[indices[t + 1]];
    const c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(out), indices: new Uint32Array(idx) };
}

/** Drop vertices no triangle references. */
function compact(positions, indices) {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const out = [];
  const idx = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    const v = indices[k];
    if (remap[v] < 0) {
      remap[v] = out.length / 3;
      out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    }
    idx[k] = remap[v];
  }
  return { positions: new Float32Array(out), indices: idx };
}

/**
 * Creased normals: each triangle corner averages the (area x corner-angle weighted) normals of
 * the triangles around that vertex that lie within `creaseDeg` of its own face. Corners with
 * equal position + normal are then shared again. Sharp CAD edges stay sharp, fillets go smooth.
 */
function creasedNormals(positions, indices, creaseDeg) {
  const nt = indices.length / 3;
  const nv = positions.length / 3;
  const fn = new Float32Array(nt * 3); // unit face normals
  const cw = new Float32Array(nt * 3); // per-corner weight = area * angle
  const P = (v, a) => positions[v * 3 + a];
  for (let t = 0; t < nt; t++) {
    const ia = indices[t * 3];
    const ib = indices[t * 3 + 1];
    const ic = indices[t * 3 + 2];
    const e1 = [P(ib, 0) - P(ia, 0), P(ib, 1) - P(ia, 1), P(ib, 2) - P(ia, 2)];
    const e2 = [P(ic, 0) - P(ia, 0), P(ic, 1) - P(ia, 1), P(ic, 2) - P(ia, 2)];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1e-30;
    fn[t * 3] = n[0] / len;
    fn[t * 3 + 1] = n[1] / len;
    fn[t * 3 + 2] = n[2] / len;
    const area = len / 2;
    const corner = [ia, ib, ic];
    for (let c = 0; c < 3; c++) {
      const v0 = corner[c];
      const v1 = corner[(c + 1) % 3];
      const v2 = corner[(c + 2) % 3];
      const a = [P(v1, 0) - P(v0, 0), P(v1, 1) - P(v0, 1), P(v1, 2) - P(v0, 2)];
      const b = [P(v2, 0) - P(v0, 0), P(v2, 1) - P(v0, 1), P(v2, 2) - P(v0, 2)];
      const la = Math.hypot(...a);
      const lb = Math.hypot(...b);
      const cos = la && lb ? (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb) : 1;
      cw[t * 3 + c] = Math.sqrt(area) * Math.acos(Math.max(-1, Math.min(1, cos)));
    }
  }
  // vertex -> incident triangles (CSR)
  const count = new Uint32Array(nv + 1);
  for (let k = 0; k < indices.length; k++) count[indices[k] + 1]++;
  for (let v = 0; v < nv; v++) count[v + 1] += count[v];
  const fill = count.slice(0, nv);
  const inc = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) inc[fill[indices[k]]++] = k; // corner id
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);

  const outPos = [];
  const outNrm = [];
  const outIdx = new Uint32Array(indices.length);
  const seen = new Map();
  for (let k = 0; k < indices.length; k++) {
    const v = indices[k];
    const t = (k / 3) | 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let j = count[v]; j < count[v + 1]; j++) {
      const k2 = inc[j];
      const t2 = (k2 / 3) | 0;
      const d = fn[t * 3] * fn[t2 * 3] + fn[t * 3 + 1] * fn[t2 * 3 + 1] + fn[t * 3 + 2] * fn[t2 * 3 + 2];
      if (d < cosCrease) continue;
      const w = cw[k2];
      nx += fn[t2 * 3] * w;
      ny += fn[t2 * 3 + 1] * w;
      nz += fn[t2 * 3 + 2] * w;
    }
    let l = Math.hypot(nx, ny, nz);
    if (!l) {
      nx = fn[t * 3];
      ny = fn[t * 3 + 1];
      nz = fn[t * 3 + 2];
      l = 1;
    }
    nx /= l;
    ny /= l;
    nz /= l;
    const key = `${v}|${Math.round(nx * 1000)},${Math.round(ny * 1000)},${Math.round(nz * 1000)}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = outPos.length / 3;
      seen.set(key, id);
      outPos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      outNrm.push(nx, ny, nz);
    }
    outIdx[k] = id;
  }
  return { positions: new Float32Array(outPos), normals: new Float32Array(outNrm), indices: outIdx };
}

/**
 * Axle axis: the two radial extents of a wheel are (near) equal and the axial one is the
 * smallest. Score each axis by how round the cross-section is plus how thin it is.
 */
function detectAxis(size) {
  let best = 0;
  let bestScore = Infinity;
  const scores = [];
  for (let a = 0; a < 3; a++) {
    const r1 = size[(a + 1) % 3];
    const r2 = size[(a + 2) % 3];
    const roundness = Math.abs(r1 - r2) / Math.max(r1, r2); // 0 = perfectly round
    const thin = size[a] / Math.max(r1, r2); // < 1 for a wheel
    const score = roundness * 4 + thin;
    scores.push(score);
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  const r1 = size[(best + 1) % 3];
  const r2 = size[(best + 2) % 3];
  return { axis: best, roundness: Math.abs(r1 - r2) / Math.max(r1, r2), thin: size[best] / Math.max(r1, r2) };
}

/**
 * Face side: the spokes, hub and mounting pad (everything inside ~60% of the radius) sit towards
 * the outboard face. Returns +1 / -1 along the axle and a 0..1 confidence.
 */
function detectFace(positions, indices, axis, center, radius) {
  const r1 = (axis + 1) % 3;
  const r2 = (axis + 2) % 3;
  let sum = 0;
  let wsum = 0;
  let halfW = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const cen = [0, 1, 2].map((k) => (positions[a + k] + positions[b + k] + positions[c + k]) / 3 - center[k]);
    halfW = Math.max(halfW, Math.abs(cen[axis]));
    if (Math.hypot(cen[r1], cen[r2]) > radius * 0.6) continue;
    const e1 = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]);
    const e2 = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    sum += cen[axis] * area;
    wsum += area;
  }
  if (!wsum) return { sign: 1, confidence: 0 };
  const mean = sum / wsum;
  return { sign: mean >= 0 ? 1 : -1, confidence: Math.min(1, Math.abs(mean) / (halfW || 1)) };
}


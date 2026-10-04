// Removes emissive textures that can never show from a GLB, and the images only they used.
//
// An emissive map is multiplied by the material's emissive colour. Some exports attach a map to
// every material but leave the colour at the glTF default (black), so the map adds nothing: the
// BMW M3 carries 56 of them, 1.8 MB of the file and about 90 MB of decoded textures. The engine
// drops them at load time too (services/carMaterials.ts); stripping them from the file also
// saves the download.
//
// This edits the file at the byte level, not through a glTF library: the mesh data is
// meshopt-compressed, and decoding and re-encoding it would put the geometry through a second
// lossy pass. Every mesh byte is copied across untouched; only the JSON and the image bytes
// change. It handles the layout the car GLBs here use (images and compressed mesh data both in
// buffer 0, an empty fallback buffer) and stops with an error on anything else.
//
// Usage: node scripts/strip-black-emissive.mjs <in.glb> [out.glb]    (out defaults to in, in place)

import fs from 'node:fs';

const [IN, OUT = IN] = process.argv.slice(2);
if (!IN) {
  console.error('usage: node scripts/strip-black-emissive.mjs <in.glb> [out.glb]');
  process.exit(1);
}

const pad4 = (n) => (n + 3) & ~3;
const buf = fs.readFileSync(IN);
if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) throw new Error('not a glTF 2.0 binary');
const jsonLen = buf.readUInt32LE(12);
if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binHead = 20 + jsonLen;
if (buf.readUInt32LE(binHead + 4) !== 0x004e4942) throw new Error('second chunk is not BIN');
const binLen = buf.readUInt32LE(binHead);
const bin = buf.subarray(binHead + 8, binHead + 8 + binLen);

const { textures = [], images = [], materials = [], bufferViews = [], accessors = [] } = json;
if (!images.length) {
  console.log(`${IN}: no images, nothing to do`);
  process.exit(0);
}

// --- 1. drop emissive textures from materials with no emissive colour ----------------------------
let stripped = 0;
for (const m of materials) {
  const f = m.emissiveFactor ?? [0, 0, 0];
  if (m.emissiveTexture && f[0] + f[1] + f[2] === 0) {
    delete m.emissiveTexture;
    stripped++;
  }
}
if (!stripped) {
  console.log(`${IN}: no black emissive textures, nothing to do`);
  process.exit(0);
}

// --- 2. which textures and images are still used --------------------------------------------------
// A texture reference is any {index} under a key ending in "Texture", at any depth in a material
// (core slots and extensions such as clearcoat).
const usedTex = new Set();
const walk = (o) => {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k.endsWith('Texture') && v && typeof v.index === 'number') usedTex.add(v.index);
    else walk(v);
  }
};
materials.forEach(walk);
const texSource = (t) => t.source ?? Object.values(t.extensions ?? {}).find((e) => e && e.source !== undefined)?.source;
const usedImg = new Set([...usedTex].map((i) => texSource(textures[i])));
const keepTex = textures.map((_, i) => usedTex.has(i));
const keepImg = images.map((_, i) => usedImg.has(i));
const removedImages = keepImg.filter((k) => !k).length;

// --- 3. check the layout is the one this script understands ---------------------------------------
if (json.buffers.length !== 2 || json.buffers[1].uri || !json.buffers[1].extensions?.EXT_meshopt_compression?.fallback) {
  throw new Error('unexpected buffer layout (expected one data buffer and one meshopt fallback buffer)');
}
const imageViews = new Set(images.map((im) => im.bufferView));
if (imageViews.size !== images.length) throw new Error('images share a buffer view');
const removedViews = new Set(images.filter((_, i) => !keepImg[i]).map((im) => im.bufferView));
for (const [i, bv] of bufferViews.entries()) {
  const inBin = bv.buffer === 0 || bv.extensions?.EXT_meshopt_compression?.buffer === 0;
  if (!inBin && bv.buffer !== 1) throw new Error(`bufferView ${i} uses an unexpected buffer`);
}

// --- 4. renumber textures, images and buffer views ----------------------------------------------
const remap = (keep) => {
  const m = new Map();
  let n = 0;
  keep.forEach((k, i) => k && m.set(i, n++));
  return m;
};
const texMap = remap(keepTex);
const imgMap = remap(keepImg);
const viewMap = remap(bufferViews.map((_, i) => !removedViews.has(i)));

const fixTex = (o) => {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k.endsWith('Texture') && v && typeof v.index === 'number') v.index = texMap.get(v.index);
    else fixTex(v);
  }
};
materials.forEach(fixTex);
json.textures = textures.filter((_, i) => keepTex[i]);
for (const t of json.textures) {
  if (t.source !== undefined) t.source = imgMap.get(t.source);
  for (const e of Object.values(t.extensions ?? {})) if (e && e.source !== undefined) e.source = imgMap.get(e.source);
}
json.images = images.filter((_, i) => keepImg[i]);
for (const im of json.images) im.bufferView = viewMap.get(im.bufferView);
for (const a of accessors) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
if (accessors.some((a) => a.sparse)) throw new Error('sparse accessors are not handled');
const keptViews = bufferViews.filter((_, i) => !removedViews.has(i));

// --- 5. rebuild the BIN chunk: the same bytes, minus the removed images --------------------------
// Each kept range in buffer 0 (an image, or a compressed mesh stream) is copied in its original
// order and its offset updated, on the buffer view or on its meshopt extension.
const ranges = [];
for (const bv of keptViews) {
  const ext = bv.extensions?.EXT_meshopt_compression;
  if (bv.buffer === 0) ranges.push({ holder: bv, off: bv.byteOffset ?? 0, len: bv.byteLength });
  if (ext && ext.buffer === 0) ranges.push({ holder: ext, off: ext.byteOffset ?? 0, len: ext.byteLength });
}
ranges.sort((a, b) => a.off - b.off);
const parts = [];
let cursor = 0;
for (const r of ranges) {
  parts.push(bin.subarray(r.off, r.off + r.len));
  const padding = pad4(r.len) - r.len;
  if (padding) parts.push(Buffer.alloc(padding));
  r.holder.byteOffset = cursor;
  cursor += pad4(r.len);
}
json.bufferViews = keptViews;
json.buffers[0].byteLength = cursor;
const newBin = Buffer.concat(parts);

// --- 6. write -------------------------------------------------------------------------------------
const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(pad4(jsonBytes.length) - jsonBytes.length, 0x20)]);
const binPadded = Buffer.concat([newBin, Buffer.alloc(pad4(newBin.length) - newBin.length)]);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0);
head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(jsonPadded.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(binPadded.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
const out = Buffer.concat([head, jh, jsonPadded, bh, binPadded]);
fs.writeFileSync(OUT, out);

console.log(
  `${OUT}: stripped ${stripped} emissive texture refs, removed ${removedImages} of ${images.length} images ` +
    `(${((buf.length - out.length) / 1e6).toFixed(2)} MB: ${(buf.length / 1e6).toFixed(2)} -> ${(out.length / 1e6).toFixed(2)} MB)`
);

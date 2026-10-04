/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Shared surface detail for the car's own parts: carbon twill, grille honeycomb and leather grain.
 *
 * Every car file carries its own copy of the same few surfaces (a carbon swatch, a honeycomb tile,
 * a 1024² leather or carpet grain), at a different UV scale on every file, and most of them read
 * flat at the end. Instead, each surface is generated once per page (module-level cache, like the
 * wheel kit's textures), never changed per engine or per material, and projected onto the part
 * from its own position (box/triplanar projection in metre-scaled object space) in the shader.
 * So the size of a carbon tow or a grain cell is real whatever units or UVs the file uses, the
 * pattern moves with the part, and no per-material repeat (or texture clone) is needed.
 *
 * Each detail fades out once its features get smaller than a few pixels, so distant views stay
 * clean (no moiré): what is left is the averaged look (tone, roughness) of the surface.
 *
 * The textures are referenced from shader uniforms only, never from material slots, so the
 * engine's disposeScene (which disposes every texture a car material holds) never frees them.
 */

export type DetailKind = 'carbon' | 'grille' | 'leather' | 'alcantara';

interface DetailLook {
  /** tile size in metres (u, v) */
  tile: [number, number];
  /** size of one feature (tow, cell, grain) in metres: the fade-out reference */
  feature: number;
  normal: number;
  /** diffuse tone variation (texture alpha) */
  tone: number;
  /** roughness added where the texture's blue channel is 1 (carbon: none, it carries the tow direction) */
  rough: number;
  /** anisotropy along the fibres (carbon only) */
  aniso: number;
}

/**
 * The look per kind. Sizes are real: a 2x2 twill of 4.5 mm tows (the bold, readable weave of
 * M Performance parts in photos), a 14 mm honeycomb, a 1.2 mm leather pebble grain, a 0.5 mm suede nap.
 */
export const DETAIL_LOOKS: Record<DetailKind, DetailLook> = {
  carbon: { tile: [0.018, 0.018], feature: 0.0045, normal: 0.5, tone: 0.9, rough: 0, aniso: 0.45 },
  grille: { tile: [0.0139, 0.024], feature: 0.007, normal: 0.9, tone: 0.92, rough: 0.25, aniso: 0 },
  leather: { tile: [0.03, 0.03], feature: 0.0012, normal: 0.45, tone: 0.12, rough: 0.12, aniso: 0 },
  alcantara: { tile: [0.012, 0.012], feature: 0.0005, normal: 0.25, tone: 0.1, rough: 0.06, aniso: 0 }
};

// ---------------------------------------------------------------------------
// Generated textures (one copy per page)
// ---------------------------------------------------------------------------

function wrapAt(h: Float32Array, w: number, hh: number, x: number, y: number) {
  return h[((y + hh) % hh) * w + ((x + w) % w)];
}

/** RG = tangent-space normal (x, y), from a height field that wraps on both axes. */
function encodeNormals(h: Float32Array, w: number, hh: number, strength: number, out: Uint8Array) {
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (wrapAt(h, w, hh, x + 1, y) - wrapAt(h, w, hh, x - 1, y)) * strength;
      const dy = (wrapAt(h, w, hh, x, y + 1) - wrapAt(h, w, hh, x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
    }
  }
}

function makeTexture(data: Uint8Array, w: number, h: number, name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.name = name;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Small deterministic hash (no Math.random: the same pattern on every load). */
function hash2(x: number, y: number) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 2x2 twill, 4 tows each way per tile. RG = normal, B = which way the top tow runs
 * (255: along u, 0: along v), A = tone (each tow a touch different, darker where it dives under).
 * The tows are rounded bundles with fine fibre grooves along them, which is what makes the
 * highlights break up into the checker of real carbon.
 */
function buildCarbon(): THREE.DataTexture {
  const N = 256, TOWS = 4, P = N / TOWS;
  const h = new Float32Array(N * N);
  const data = new Uint8Array(N * N * 4);
  const over = (i: number, j: number) => (((i - j) % 4) + 4) % 4 < 2; // warp (along v) on top
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = Math.floor(x / P), j = Math.floor(y / P);
      const fx = (x + 0.5) / P - i, fy = (y + 0.5) / P - j;
      const warp = over(i, j);
      // across the tow (a rounded bundle) and along it (dives where the next cell is the other way)
      const across = warp ? fx : fy;
      const along = warp ? fy : fx;
      const prevSame = warp ? over(i, j - 1) : !over(i - 1, j);
      const nextSame = warp ? over(i, j + 1) : !over(i + 1, j);
      let dive = 1;
      if (!prevSame) dive *= 0.55 + 0.45 * smooth(0, 0.35, along);
      if (!nextSame) dive *= 0.55 + 0.45 * smooth(0, 0.35, 1 - along);
      const profile = Math.sqrt(Math.max(0, Math.sin(Math.PI * across)));
      const fibres = 0.035 * Math.sin(across * Math.PI * 2 * 11 + hash2(i, j) * 6.28);
      h[y * N + x] = (profile * 0.9 + fibres) * dive;
      const o = (y * N + x) * 4;
      data[o + 2] = warp ? 0 : 255;
      // the tows running one way read lighter than the others in soft light (the checker of carbon)
      const tone = (warp ? 1 : 0.58) * (0.9 + 0.1 * hash2(i * 7 + 3, j * 13 + 1)) * (0.75 + 0.25 * dive) * (0.85 + 0.15 * profile);
      data[o + 3] = Math.round(tone * 255);
    }
  }
  encodeNormals(h, N, N, 3.2, data);
  return makeTexture(data, N, N, 'detail_carbon');
}

/**
 * Honeycomb, pointy-top hexagons, one tile = two rows (aspect 1 : sqrt 3). RG = normal of the
 * rounded bars, B = depth into the cell (0 on the bars, 1 at the back: the rough, unlit cavity),
 * A = solid (1 on the bars, 0 in the openings, antialiased).
 */
function buildGrille(): THREE.DataTexture {
  const W = 128, H = 222; // 128 / 222 ≈ 1 / sqrt(3)
  const R = W / Math.sqrt(3); // hexagon circumradius in pixels
  const bar = 0.13 * R; // half bar width
  const h = new Float32Array(W * H);
  const data = new Uint8Array(W * H * 4);
  const centres: Array<[number, number]> = [];
  for (let row = -1; row <= 2; row++) {
    for (let col = -1; col <= 2; col++) {
      centres.push([col * W + (row % 2 ? W / 2 : 0), row * 1.5 * R]);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // distance to the nearest hexagon edge: inside a pointy-top hexagon of apothem a
      let best = Infinity;
      for (const [cx, cy] of centres) {
        const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
        const d = Math.max(dx, dx * 0.5 + dy * (Math.sqrt(3) / 2)); // hex "radius" in apothem units
        best = Math.min(best, d);
      }
      const apothem = (Math.sqrt(3) / 2) * R;
      const edge = apothem - best; // distance inside the cell from its edge
      const solid = 1 - smooth(bar - 0.8, bar + 0.8, edge);
      const depth = smooth(bar, bar + 0.35 * R, edge);
      h[y * W + x] = solid > 0.5 ? 1 - Math.pow(Math.max(0, edge) / bar, 2) * 0.35 : 0.55 - 0.55 * depth;
      const o = (y * W + x) * 4;
      data[o + 2] = Math.round(depth * 255);
      data[o + 3] = Math.round(solid * 255);
    }
  }
  encodeNormals(h, W, H, 2.4, data);
  return makeTexture(data, W, H, 'detail_grille');
}

/**
 * Pebble grain (cellular): rounded pebbles with fine creases between them. RG = normal,
 * B = crease (rougher, darker in the valleys), A = tone.
 */
function buildGrain(): THREE.DataTexture {
  const N = 256, CELLS = 24;
  const C = N / CELLS;
  const pts: Array<[number, number]> = [];
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) pts.push([(i + 0.15 + 0.7 * hash2(i, j)) * C, (j + 0.15 + 0.7 * hash2(j + 101, i + 37)) * C]);
  }
  const h = new Float32Array(N * N);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ci = Math.floor(x / C), cj = Math.floor(y / C);
      let f1 = Infinity, f2 = Infinity;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di, jj = cj + dj;
          const p = pts[((jj + CELLS) % CELLS) * CELLS + ((ii + CELLS) % CELLS)];
          const px = p[0] + (ii < 0 ? -N : ii >= CELLS ? N : 0);
          const py = p[1] + (jj < 0 ? -N : jj >= CELLS ? N : 0);
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      }
      const crease = 1 - smooth(0, 0.22 * C, f2 - f1);
      h[y * N + x] = (1 - crease) * (0.7 + 0.3 * Math.cos(Math.min(1, f1 / C) * Math.PI * 0.5)) + 0.04 * hash2(x, y);
      const o = (y * N + x) * 4;
      data[o + 2] = Math.round(crease * 255);
      data[o + 3] = Math.round((0.93 + 0.07 * (1 - crease)) * 255);
    }
  }
  encodeNormals(h, N, N, 1.6, data);
  return makeTexture(data, N, N, 'detail_grain');
}

const textureCache: Partial<Record<'carbon' | 'grille' | 'grain', THREE.DataTexture>> = {};
/** The shared texture behind a detail kind (built on first use; leather and alcantara share one). */
export function detailTexture(kind: DetailKind): THREE.DataTexture {
  const key = kind === 'leather' || kind === 'alcantara' ? 'grain' : kind;
  let tex = textureCache[key];
  if (!tex) {
    tex = key === 'carbon' ? buildCarbon() : key === 'grille' ? buildGrille() : buildGrain();
    textureCache[key] = tex;
  }
  return tex;
}

// ---------------------------------------------------------------------------
// What a car texture holds: one colour, a fine material tile, or real content
// ---------------------------------------------------------------------------

export interface TextureStats {
  width: number;
  height: number;
  /** mean of each channel, 0..1, in the texture's own encoding (raw values) */
  mean: [number, number, number, number];
  /** mean colour of an sRGB-encoded texture, decoded to linear first (what mipmapping averages to) */
  linear: [number, number, number];
  /** per-channel spread of single pixels (0.5th to 99.5th percentile), 0..255 */
  range: number;
  /** spread of 32x32 block means, 0..255: low means no visible structure, only grain or noise */
  lowRange: number;
}

const SRGB_TO_LINEAR = Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
});

const statsCache = new WeakMap<object, TextureStats | null>();
const MAX_READ = 2048 * 2048;
/** spread of the 32x32 probe above which a texture is real content (callers only act below ~16) */
const PROBE_LIMIT = 28;
/** largest grid read in full */
const SAMPLE = 256;

/**
 * Reads a car texture's pixels once (cached per image) to tell a solid swatch (one colour), a
 * material tile (grain, weave or noise with no structure at a 32x32 scale) and real content (an
 * atlas, a decal). Returns null when the pixels can't be read.
 */
export function textureStats(tex: THREE.Texture | null | undefined): TextureStats | null {
  const img = readableImage(tex);
  if (!img) return null;
  if (statsCache.has(img)) return statsCache.get(img) ?? null;
  let stats: TextureStats | null = null;
  try {
    const w = img.width, h = img.height;
    let px: ArrayLike<number> | null = null;
    let sw = w, sh = h;
    // structure at a 32x32 scale: from the filtered probe (point samples would count the grain)
    let lowRange = -1;
    if (img.data) px = img.data.length === w * h * 4 ? img.data : null;
    else {
      const g = scratch(32, 32);
      if (g) {
        // Cheap probe first: a filtered 32x32 copy. Anything with visible structure (an atlas,
        // a decal: nearly every texture) stops here, without reading the full image.
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, 32, 32);
        const probe = measure(g.getImageData(0, 0, 32, 32).data, 32, 32);
        lowRange = probe.range;
        if (probe.range > PROBE_LIMIT) {
          stats = { ...probe, width: w, height: h, range: 255 };
        } else {
          // then the pixels themselves: every pixel up to 256², point samples on a 256² grid above
          // that (statistics, not a picture: 65k samples settle a spread and a mean)
          sw = Math.min(w, SAMPLE);
          sh = Math.min(h, SAMPLE);
          const full = scratch(sw, sh);
          if (full) {
            full.imageSmoothingEnabled = false;
            full.drawImage(img, 0, 0, sw, sh);
            px = full.getImageData(0, 0, sw, sh).data;
          }
        }
      }
    }
    if (px) {
      const m = measure(px, sw, sh);
      stats = { ...m, width: w, height: h, lowRange: lowRange >= 0 ? lowRange : m.lowRange };
    }
  } catch {
    stats = null; // tainted or unsupported image: leave the texture as it is
  }
  statsCache.set(img, stats);
  return stats;
}

const extentCache = new WeakMap<object, number>();
/**
 * Darkest to brightest texel over every pixel and channel, for a decision that must not change
 * the look (folding a one-colour texture into its factor): a small logo or a thin line on an
 * otherwise plain texture shows here, where sampled or percentile statistics would miss it. Stops
 * as soon as the spread passes `limit`. Only called on textures maybeSolid() passed.
 */
export function exactExtent(tex: THREE.Texture | null | undefined, limit = 12): number {
  const img = readableImage(tex);
  if (!img) return 255;
  const cached = extentCache.get(img);
  if (cached !== undefined) return cached;
  let extent = 255;
  try {
    const w = img.width, h = img.height;
    let px: ArrayLike<number> | null = null;
    if (img.data) px = img.data.length === w * h * 4 ? img.data : null;
    else {
      const g = scratch(w, h);
      if (g) {
        g.drawImage(img, 0, 0);
        px = g.getImageData(0, 0, w, h).data;
      }
    }
    if (px) {
      const lo = [255, 255, 255, 255], hi = [0, 0, 0, 0];
      extent = 0;
      for (let i = 0; i < px.length && extent <= limit; i += 4) {
        for (let k = 0; k < 4; k++) {
          const v = px[i + k];
          if (v < lo[k]) lo[k] = v;
          if (v > hi[k]) hi[k] = v;
          if (hi[k] - lo[k] > extent) extent = hi[k] - lo[k];
        }
      }
    }
  } catch {
    extent = 255;
  }
  extentCache.set(img, extent);
  return extent;
}

const spreadCache = new WeakMap<object, number>();
/**
 * Whether a texture can be a single colour, from 16x16 point samples (no filtering, so it costs
 * next to nothing even on a 2048² image). One colour within `limit` levels passes; anything with
 * content fails at once. Only what passes is read in full (textureStats).
 */
export function maybeSolid(tex: THREE.Texture | null | undefined, limit = 12): boolean {
  const img = readableImage(tex);
  if (!img) return false;
  let spread = spreadCache.get(img);
  if (spread === undefined) {
    spread = 255;
    try {
      if (img.data) spread = 0; // generated data: let textureStats decide
      else {
        const g = scratch(16, 16);
        if (g) {
          g.imageSmoothingEnabled = false;
          g.drawImage(img, 0, 0, 16, 16);
          spread = measure(g.getImageData(0, 0, 16, 16).data, 16, 16).range;
        }
      }
    } catch {
      spread = 255;
    }
    spreadCache.set(img, spread);
  }
  return spread <= limit;
}

type ReadableImage = CanvasImageSource & { width: number; height: number; data?: ArrayLike<number> };
function readableImage(tex: THREE.Texture | null | undefined): ReadableImage | null {
  const img = tex?.image as ReadableImage | undefined;
  if (!img || typeof img !== 'object' || typeof document === 'undefined') return null;
  if (!img.width || !img.height || img.width * img.height > MAX_READ) return null;
  return img;
}

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
/** One reusable 2D canvas for all the reads (cleared to the size asked). */
function scratch(w: number, h: number): CanvasRenderingContext2D | null {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!scratchCtx) return null;
  scratchCanvas.width = w; // resizing also clears it
  scratchCanvas.height = h;
  return scratchCtx;
}

function measure(px: ArrayLike<number>, w: number, h: number): TextureStats {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const B = 32;
  const blocks = new Float64Array(B * B * 4);
  const counts = new Uint32Array(B * B);
  const sum = [0, 0, 0, 0];
  const lin = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const by = Math.min(B - 1, Math.floor((y * B) / h));
    for (let x = 0; x < w; x++) {
      const bi = by * B + Math.min(B - 1, Math.floor((x * B) / w));
      const o = (y * w + x) * 4;
      counts[bi]++;
      for (let k = 0; k < 4; k++) {
        const v = px[o + k];
        hist[k][v]++;
        sum[k] += v;
        blocks[bi * 4 + k] += v;
        if (k < 3) lin[k] += SRGB_TO_LINEAR[v];
      }
    }
  }
  const n = w * h;
  const lo = n * 0.005, hi = n * 0.995;
  let range = 0;
  for (let k = 0; k < 4; k++) {
    let acc = 0, a = 0, b = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[k][v];
      if (acc <= lo) a = v + 1;
      if (acc >= hi) { b = v; break; }
    }
    range = Math.max(range, Math.max(0, b - Math.min(a, b)));
  }
  let lowRange = 0;
  for (let k = 0; k < 4; k++) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < B * B; i++) {
      if (!counts[i]) continue;
      const v = blocks[i * 4 + k] / counts[i];
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
    lowRange = Math.max(lowRange, mx - mn);
  }
  return {
    width: w,
    height: h,
    mean: [sum[0] / n / 255, sum[1] / n / 255, sum[2] / n / 255, sum[3] / n / 255],
    linear: [lin[0] / n, lin[1] / n, lin[2] / n],
    range,
    lowRange
  };
}

// ---------------------------------------------------------------------------
// Shader: box projection in metre-scaled object space
// ---------------------------------------------------------------------------

type DetailUniforms = Record<string, THREE.IUniform>;
const uniformCache: Partial<Record<DetailKind, DetailUniforms>> = {};
function detailUniforms(kind: DetailKind): DetailUniforms {
  let u = uniformCache[kind];
  if (!u) {
    const look = DETAIL_LOOKS[kind];
    u = {
      uDetMap: { value: detailTexture(kind) },
      uDetTile: { value: new THREE.Vector2(1 / look.tile[0], 1 / look.tile[1]) },
      uDetFeature: { value: look.feature },
      uDetNormal: { value: look.normal },
      uDetTone: { value: look.tone },
      uDetRough: { value: look.rough },
      uDetAniso: { value: look.aniso }
    };
    uniformCache[kind] = u;
  }
  return u;
}

const VERT_PARS = /* glsl */ `
varying vec3 vDetPos;
varying vec3 vDetNrm;
varying vec3 vDetAx;
varying vec3 vDetAy;
varying vec3 vDetAz;`;

const VERT_MAIN = /* glsl */ `
{
  // metres in the part's own frame: the pattern is a real size and moves with the part
  vec3 detS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  vDetPos = transformed * detS;
  vDetNrm = objectNormal / detS;
  vDetAx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
  vDetAy = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
  vDetAz = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
}`;

const FRAG_PARS = /* glsl */ `
varying vec3 vDetPos;
varying vec3 vDetNrm;
varying vec3 vDetAx;
varying vec3 vDetAy;
varying vec3 vDetAz;
uniform sampler2D uDetMap;
uniform vec2 uDetTile;
uniform float uDetFeature;
uniform float uDetNormal;
uniform float uDetTone;
uniform float uDetRough;
uniform float uDetAniso;
vec3 detObjN;      // perturbed object-space normal
vec3 detObjT;      // fibre direction, object space (carbon)
float detFade;     // 1 up close, 0 once features are smaller than a few pixels
float detB;        // blue channel, blended
float detA;        // alpha channel, blended`;

/**
 * Samples the three projections, blends them by the surface normal (sharpened, so the blend band
 * is narrow and seams don't show) and combines the normals with a whiteout blend.
 */
const FRAG_SAMPLE = /* glsl */ `
{
  // (a mesh without normals has a zero normal attribute: fall back to any axis instead of NaN)
  vec3 n = dot(vDetNrm, vDetNrm) > 1e-12 ? normalize(vDetNrm) : vec3(0.0, 0.0, 1.0);
  vec3 w = pow(abs(n), vec3(6.0));
  w /= (w.x + w.y + w.z + 1e-5);
  vec3 sgn = vec3(n.x < 0.0 ? -1.0 : 1.0, n.y < 0.0 ? -1.0 : 1.0, n.z < 0.0 ? -1.0 : 1.0);
  vec2 uvX = vec2(vDetPos.z * sgn.x, vDetPos.y) * uDetTile;
  vec2 uvY = vec2(vDetPos.x * sgn.y, vDetPos.z) * uDetTile;
  vec2 uvZ = vec2(-vDetPos.x * sgn.z, vDetPos.y) * uDetTile;
  vec4 tX = texture2D(uDetMap, uvX);
  vec4 tY = texture2D(uDetMap, uvY);
  vec4 tZ = texture2D(uDetMap, uvZ);
  // footprint of a pixel against the feature size: fade before the pattern can alias
  // (geometric mean of the two screen axes: at grazing angles mipmapping with anisotropic
  // filtering already handles the long axis, the short one says whether the pattern still reads)
  float px = sqrt(length(dFdx(vDetPos)) * length(dFdy(vDetPos)));
  detFade = 1.0 - smoothstep(0.25, 0.65, px / uDetFeature);
  vec2 nX = (tX.xy * 2.0 - 1.0) * uDetNormal;
  vec2 nY = (tY.xy * 2.0 - 1.0) * uDetNormal;
  vec2 nZ = (tZ.xy * 2.0 - 1.0) * uDetNormal;
  nX.x *= sgn.x; nY.x *= sgn.y; nZ.x *= -sgn.z;
  // whiteout blend per projection, back into object space
  vec3 bX = vec3(n.x, nX.y + n.y, nX.x + n.z);
  vec3 bY = vec3(nY.x + n.x, n.y, nY.y + n.z);
  vec3 bZ = vec3(nZ.x + n.x, nZ.y + n.y, n.z);
  detObjN = normalize(bX * w.x + bY * w.y + bZ * w.z);
  detB = tX.b * w.x + tY.b * w.y + tZ.b * w.z;
  detA = tX.a * w.x + tY.a * w.y + tZ.a * w.z;
  // fibre direction: u or v of the dominant projections, in object space
  vec3 tAlongX = tX.b > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 tAlongY = tY.b > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 tAlongZ = tZ.b > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  detObjT = tAlongX * w.x + tAlongY * w.y + tAlongZ * w.z;
}`;

/**
 * Installs the shared detail on a car part. `opts.cut` turns the honeycomb openings into real
 * holes (alpha test); otherwise they read as a dark, rough cavity.
 */
export function installDetail(material: THREE.MeshStandardMaterial, kind: DetailKind, opts: { cut?: boolean } = {}) {
  const uniforms = detailUniforms(kind);
  const cut = kind === 'grille' && !!opts.cut;
  const key = `forgedsa-detail-${kind}${cut ? '-cut' : ''}`;
  material.customProgramCacheKey = () => key;
  // for stats and debugging only (shared textures, never disposed with the car)
  material.userData.detailTextures = [uniforms.uDetMap.value];
  material.userData.detailKind = kind;
  if (cut) material.alphaTest = Math.max(material.alphaTest, 0.5);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_MAIN}`);
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${FRAG_SAMPLE}`);
    // tone: carbon tows and leather pebbles a touch different; the honeycomb's cavities dark
    frag = frag.replace(
      '#include <color_fragment>',
      kind === 'grille'
        ? `#include <color_fragment>
  diffuseColor.rgb *= mix(1.0, mix(1.0, 0.18, detB), detFade * uDetTone);
  ${cut ? 'diffuseColor.a *= mix(1.0, smoothstep(0.35, 0.65, detA), detFade);' : ''}`
        : `#include <color_fragment>
  diffuseColor.rgb *= mix(1.0, detA, detFade * uDetTone);`
    );
    frag = frag.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + ${kind === 'carbon' ? '0.0' : 'uDetRough * (detB - 0.3)'} * detFade, 0.04, 1.0);`
    );
    frag = frag.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
{
  mat3 detM = mat3(normalize(vDetAx), normalize(vDetAy), normalize(vDetAz));
  vec3 baseV = normalize(detM * (dot(vDetNrm, vDetNrm) > 1e-12 ? normalize(vDetNrm) : vec3(0.0, 0.0, 1.0)));
  vec3 detV = normalize(detM * detObjN);
  // added on top of the part's own normal; flipped with it on back faces
  float side = dot(normal, baseV) < 0.0 ? -1.0 : 1.0;
  normal = normalize(normal + (detV - baseV) * side * detFade);
}`
    );
    if (kind === 'carbon') {
      // anisotropic highlights stretched along the fibres of the tow on top
      frag = frag.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_ANISOTROPY
{
  mat3 detM = mat3(normalize(vDetAx), normalize(vDetAy), normalize(vDetAz));
  vec3 t = detM * detObjT;
  t = t - normal * dot(normal, t);
  float tl = length(t);
  t = tl > 1e-4 ? t / tl : normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + 1e-4);
  material.anisotropy = uDetAniso * detFade;
  material.alphaT = mix(pow2(material.roughness), 1.0, pow2(material.anisotropy));
  material.anisotropyT = t;
  material.anisotropyB = cross(normal, t);
}
#endif`
      );
    }
    shader.fragmentShader = frag;
  };
  material.needsUpdate = true;
}

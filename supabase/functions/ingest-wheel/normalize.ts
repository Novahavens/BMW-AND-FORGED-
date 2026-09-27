// Turns any rim cut-out into the exact image the configurator expects: the rim circle only (stands and
// stray pixels outside it removed), centred on a 2048px square with the lip touching all four edges,
// and neutral grey. The app multiplies the image by the chosen finish colour (CarConfiguratorEngine
// applyWheelFinish), so a coloured photo would tint every finish; a light neutral grey keeps the
// photo's shading and machining while letting Liquid Metal, Bronze, Black and Silver read correctly.

export const OUTPUT_SIDE = 2048;
// Grey range the shading is mapped into. The texture is sRGB and doubles as the metal reflectance, so
// it must stay light (median ~88% sRGB, ~75% linear) or Liquid Metal and Silver render near black.
const GREY_LOW = 120;
const GREY_HIGH = 255;
const TARGET_MID = 0.78;

export interface Normalized {
  rgba: Uint8Array;
  side: number;
  circle: { cx: number; cy: number; r: number };
}

export function findRimCircle(rgba: Uint8Array, w: number, h: number) {
  const solid = (x: number, y: number) => rgba[(y * w + x) * 4 + 3] >= 128;
  const minRun = Math.max(2, Math.round(Math.min(w, h) * 0.004));
  const colCount = new Uint32Array(w);
  const rowCount = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        colCount[x]++;
        rowCount[y]++;
      }
    }
  }
  let left = 0, right = w - 1, top = 0, bottom = h - 1;
  while (left < w && colCount[left] < minRun) left++;
  while (right > left && colCount[right] < minRun) right--;
  while (top < h && rowCount[top] < minRun) top++;
  while (bottom > top && rowCount[bottom] < minRun) bottom--;
  if (right <= left || bottom <= top) return null;

  const r = (right - left + 1) / 2;
  const cx = left + r;
  // A stand or shadow below the wheel makes it taller than wide: trust the top edge in that case.
  const tall = bottom - top + 1 > (right - left + 1) * 1.02;
  const cy = tall ? top + r : (top + bottom + 1) / 2;
  return { cx, cy, r };
}

export function normalizeRim(rgba: Uint8Array, w: number, h: number, side = OUTPUT_SIDE): Normalized | null {
  const circle = findRimCircle(rgba, w, h);
  if (!circle) return null;
  const { cx, cy, r } = circle;

  const out = new Uint8Array(side * side * 4);
  const scale = (2 * r) / side;
  const x0 = cx - r;
  const y0 = cy - r;
  const lum = new Float32Array(side * side);
  const hist = new Uint32Array(256);
  let solidCount = 0;

  const sample = (sx: number, sy: number, c: number) => {
    const fx = Math.min(Math.max(sx - 0.5, 0), w - 1);
    const fy = Math.min(Math.max(sy - 0.5, 0), h - 1);
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ax = fx - ix, ay = fy - iy;
    const ix1 = Math.min(ix + 1, w - 1), iy1 = Math.min(iy + 1, h - 1);
    const p = (x: number, y: number) => rgba[(y * w + x) * 4 + c];
    return (p(ix, iy) * (1 - ax) + p(ix1, iy) * ax) * (1 - ay) + (p(ix, iy1) * (1 - ax) + p(ix1, iy1) * ax) * ay;
  };

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      const dx = (x + 0.5) / side - 0.5, dy = (y + 0.5) / side - 0.5;
      const d = Math.hypot(dx, dy) * 2;
      if (d > 1) continue;
      const sx = x0 + (x + 0.5) * scale, sy = y0 + (y + 0.5) * scale;
      // Firm up soft matting: faint haze (e.g. a barrel glimpsed through the spokes) is dropped and
      // the spokes become fully solid, keeping a narrow ramp so edges stay smooth.
      let a = sample(sx, sy, 3) / 255;
      a = a <= 0.35 ? 0 : a >= 0.65 ? 255 : ((a - 0.35) / 0.3) * 255;
      // Soften the last half-pixel of the lip so the circle edge is anti-aliased.
      const edge = (1 - d) * side * 0.5;
      if (edge < 1) a *= edge;
      if (a < 1) continue;
      const l = 0.2126 * sample(sx, sy, 0) + 0.7152 * sample(sx, sy, 1) + 0.0722 * sample(sx, sy, 2);
      lum[i] = l;
      out[i * 4 + 3] = Math.round(a);
      if (a >= 128) {
        hist[Math.min(255, Math.round(l))]++;
        solidCount++;
      }
    }
  }

  const pct = (p: number) => {
    const target = solidCount * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const lo = pct(0.01);
  const hi = Math.max(lo + 1, pct(0.99));
  // Bring every wheel to the same mid-tone (a gloss-black photo would otherwise stay near black and
  // darken every finish): pick a gamma that puts the median shade at TARGET_MID.
  const mid = Math.min(0.95, Math.max(0.05, (pct(0.5) - lo) / (hi - lo)));
  const gamma = Math.min(2.5, Math.max(0.35, Math.log(TARGET_MID) / Math.log(mid)));
  for (let i = 0; i < side * side; i++) {
    if (!out[i * 4 + 3]) continue;
    const t = Math.pow(Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo))), gamma);
    const g = Math.round(GREY_LOW + t * (GREY_HIGH - GREY_LOW));
    out[i * 4] = g;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = g;
  }
  return { rgba: out, side, circle };
}

// Checks a decoded rim PNG against what services/rimExtrusion.ts needs to build 3D spokes
// (see traceRimShapes), with stricter margins so a passing image never falls back to a flat disc.

export interface RimCheck {
  ok: boolean;
  reasons: string[];
  metrics: {
    width: number;
    height: number;
    square: boolean;
    cornersTransparent: number;
    gapsTransparent: number;
    faceOpaque: number;
    lipOpaque: number;
    fillX: number;
    fillY: number;
  };
}

const MIN_SIDE = 1024;
const MAX_SIDE = 4096;
// The app itself only requires 2% see-through inside 92% of the radius.
const MIN_GAPS = 0.05;
const MIN_CORNERS = 0.97;
const MIN_FACE = 0.12;
const MIN_LIP = 0.85;
const MIN_FILL = 0.96;

export function checkRim(rgba: Uint8Array, width: number, height: number): RimCheck {
  const reasons: string[] = [];
  const square = width === height;
  if (!square) reasons.push(`image is ${width}×${height}, not square`);
  if (Math.min(width, height) < MIN_SIDE) reasons.push(`image is smaller than ${MIN_SIDE}px`);
  if (Math.max(width, height) > MAX_SIDE) reasons.push(`image is larger than ${MAX_SIDE}px`);

  const step = Math.max(1, Math.floor(Math.max(width, height) / 512));
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2;
  const alpha = (x: number, y: number) => rgba[(y * width + x) * 4 + 3] / 255;

  let corners = 0, cornersClear = 0;
  let inside = 0, insideClear = 0;
  let lip = 0, lipSolid = 0;
  let minX = width, maxX = -1, minY = height, maxY = -1;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const a = alpha(x, y);
      if (a >= 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1.04) {
        corners++;
        if (a < 0.5) cornersClear++;
      } else if (d < 0.92) {
        inside++;
        if (a < 0.5) insideClear++;
      } else if (d >= 0.93 && d <= 0.97) {
        lip++;
        if (a >= 0.5) lipSolid++;
      }
    }
  }

  const cornersTransparent = corners ? cornersClear / corners : 0;
  const gapsTransparent = inside ? insideClear / inside : 0;
  const faceOpaque = 1 - gapsTransparent;
  const lipOpaque = lip ? lipSolid / lip : 0;
  const fillX = maxX >= minX ? (maxX - minX + step) / width : 0;
  const fillY = maxY >= minY ? (maxY - minY + step) / height : 0;

  if (cornersTransparent < MIN_CORNERS) reasons.push(`background not removed (${pct(cornersTransparent)} of the corners are transparent)`);
  if (gapsTransparent < MIN_GAPS) reasons.push(`spoke gaps not transparent (${pct(gapsTransparent)} see-through; the 3D spokes need at least ${pct(MIN_GAPS)})`);
  if (faceOpaque < MIN_FACE) reasons.push(`rim face mostly missing (${pct(faceOpaque)} solid)`);
  if (lipOpaque < MIN_LIP) reasons.push(`outer rim lip is broken or cropped (${pct(lipOpaque)} solid)`);
  if (fillX < MIN_FILL || fillY < MIN_FILL) reasons.push(`rim does not reach all four edges (fills ${pct(fillX)} × ${pct(fillY)})`);

  return {
    ok: reasons.length === 0,
    reasons,
    metrics: { width, height, square, cornersTransparent, gapsTransparent, faceOpaque, lipOpaque, fillX, fillY },
  };
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

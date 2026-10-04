/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WheelDesign, WheelFinish } from '../types';
import { finishKind } from './wheelFinish';

/**
 * The 2D wheel stage: a side-on picture of the car with the wheel swapped by compositing images.
 * Layers, in order (all rendered by scripts/render/build-stage.cjs and packed into public/stage/):
 *   1. the plate: the car in its paint with no wheels,
 *   2. the wheel layer for the rim size: tyre, disc, caliper and barrel (body occludes it exactly),
 *   3. the rim photo, tinted to the finish, drawn into the projected rim-lip ellipse of each axle.
 */

export interface StageAxle {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface StageLayout {
  carId: string;
  crop: { w: number; h: number };
  sizes: Record<string, { front: StageAxle; rear: StageAxle }>;
  paints: string[];
}
interface Manifest {
  cars: Record<string, { paints: string[]; sizes: string[]; w: number; h: number }>;
}

const base = '/stage';
const sizeKey = (size: string) => size.replace('"', '');

let manifestPromise: Promise<Manifest> | null = null;
export const loadStageManifest = (): Promise<Manifest> => {
  manifestPromise ??= fetch(`${base}/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : { cars: {} }))
    .catch(() => ({ cars: {} }));
  return manifestPromise;
};

/** Whether a side-on picture exists for this car, paint and rim size. */
export const stageAvailable = (m: Manifest | null, carId: string, paintId: string, size: string): boolean => {
  const c = m?.cars[carId];
  return !!c && c.paints.includes(paintId) && c.sizes.includes(size);
};

const layouts = new Map<string, Promise<StageLayout>>();
export const loadStageLayout = (carId: string) => {
  let p = layouts.get(carId);
  if (!p) {
    p = fetch(`${base}/${carId}/layout.json`).then((r) => {
      if (!r.ok) throw new Error('no stage layout');
      return r.json() as Promise<StageLayout>;
    });
    p.catch(() => layouts.delete(carId));
    layouts.set(carId, p);
  }
  return p;
};

const images = new Map<string, Promise<HTMLImageElement>>();
export const loadStageImage = (url: string) => {
  let p = images.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not load ${url}`));
      img.src = url;
    });
    p.catch(() => images.delete(url));
    images.set(url, p);
  }
  return p;
};

export const platePath = (carId: string, paintId: string) => `${base}/${carId}/${paintId}.webp`;
export const wheelLayerPath = (carId: string, size: string) => `${base}/${carId}/wheels-${sizeKey(size)}.webp`;

// ------------------------------------------------------------------
// Finish tint
// ------------------------------------------------------------------
// A rim photo is one finish (the pipeline stores it as neutral light grey). To show it in another
// finish its luminance is re-mapped: shadows to a dark tone of the finish colour, highlights to its
// bright tone, with the kind of finish (polished, metallic paint, satin, gloss paint) setting how
// bright the highlights are and how soon they go white. A photo that already has the finish's look
// can be supplied as a ready sprite instead (the AI finish step) and is drawn as is.

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};

interface TintLook {
  unit: [number, number, number];
  bp: number;
  wp: number;
  gamma: number;
  hl: number;
}

export function tintLook(f: Pick<WheelFinish, 'hex' | 'metalness' | 'roughness' | 'clearcoat'>): TintLook {
  const [r, g, b] = hexToRgb(f.hex);
  const mx = Math.max(r, g, b, 1e-3);
  const unit: [number, number, number] = [r / mx, g / mx, b / mx];
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  switch (finishKind(f)) {
    case 'polished':
      return { unit, bp: 0.04, wp: 1.0, gamma: 0.9, hl: 0.35 };
    case 'gloss-paint':
      return { unit, bp: 0.015, wp: 0.8, gamma: 2.0, hl: 0.55 };
    case 'satin-metallic':
      return { unit, bp: 0.06, wp: Math.min(0.85, Math.max(0.4, 0.35 + luma * 1.1)), gamma: 1.1, hl: 0.1 };
    default:
      return { unit, bp: 0.08, wp: Math.min(1.05, Math.max(0.6, 0.5 + luma * 0.9)), gamma: 1.0, hl: 0.3 };
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Re-maps the luminance of a (grey) rim photo to a finish. Returns a canvas the size of the photo (capped). */
export function tintSprite(img: CanvasImageSource & { width: number; height: number }, finish: WheelFinish, maxSize = 1024): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const lum = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    lum[j] = l;
    if (px[i + 3] > 128) hist[Math.min(255, Math.round(l))]++;
  }
  let total = 0;
  hist.forEach((n) => (total += n));
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.01) { lo = v; break; }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * 0.01) { hi = v; break; }
  }
  const span = Math.max(24, hi - lo);
  const look = tintLook(finish);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const n = Math.min(1, Math.max(0, (lum[j] - lo) / span));
    const t = Math.pow(n, look.gamma);
    const base = look.bp + (look.wp - look.bp) * t;
    const hl = smooth(0.78, 1, t) * look.hl;
    for (let k = 0; k < 3; k++) {
      const col = look.unit[k] * base * (1 - hl) + base * hl;
      px[i + k] = Math.min(255, Math.max(0, Math.round(col * 255)));
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

const tinted = new Map<string, HTMLCanvasElement>();
/** The rim sprite for a wheel in a finish: the photo, tinted (cached per wheel and finish). */
export async function rimSprite(wheel: WheelDesign, finish: WheelFinish): Promise<HTMLCanvasElement | HTMLImageElement | null> {
  const ready = wheel.rimSprites?.[finish.id];
  if (ready) {
    try {
      return await loadStageImage(ready);
    } catch {
      /* fall back to the tint */
    }
  }
  if (!wheel.imageUrl) return null;
  const key = `${wheel.id}|${wheel.imageUrl}|${finish.id}|${finish.hex}|${finish.metalness}|${finish.roughness}|${finish.clearcoat}`;
  const hit = tinted.get(key);
  if (hit) return hit;
  const img = await loadStageImage(wheel.imageUrl);
  const out = tintSprite(img, finish);
  tinted.set(key, out);
  return out;
}

/** Draws a sprite (a square image of the rim, its lip touching the edges) into one axle's lip ellipse. */
export function drawRim(ctx: CanvasRenderingContext2D, sprite: CanvasImageSource, a: StageAxle) {
  ctx.drawImage(sprite, a.cx - a.rx, a.cy - a.ry, a.rx * 2, a.ry * 2);
}

import type { CameraViewPreset, PaintColor } from '../types';
import type { CarConfiguratorEngine } from './CarConfiguratorEngine';

/**
 * The car body as a pre-rendered Blender image (scripts/prerender), recoloured for any paint.
 * Each view has the paint rendered with a white and a black base colour (gloss and matte), so
 *   colour = black + (white - black) * paint   (in linear light)
 * gives every paint exactly, reflections and shadows included, then the dark studio's tone curve
 * (three.js NeutralToneMapping at exposure 1.6) is applied to that linear colour. The live engine
 * draws the wheels on top from the same camera (CarConfiguratorEngine.setRenderedBody).
 *
 * Everything that shows the pre-rendered car (the configurator stage, the summary stills, the PDF)
 * goes through here, so the tone curve and the backdrop cannot drift apart.
 */
export const RENDER_ASPECT = 1.6; // matches scripts/prerender/export-scene.cjs
export const RENDER_VIEWS: CameraViewPreset[] = ['frontThreeQuarter', 'side', 'rearThreeQuarter', 'frontWheel', 'top'];

let manifest: Promise<Record<string, string[]>> | null = null;
/** Car ids that have renders, with their views. */
export const loadRenderManifest = () =>
  (manifest ??= fetch('/renders/manifest.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));

const toLin = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const toSrgb = new Uint8ClampedArray(4096).map((_, i) => {
  const c = i / 4095;
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
});

/** The studio's exposure, applied to the linear colour before NeutralToneMapping (the bodies were rendered flat for it). */
export const BODY_EXPOSURE = 1.6;
/** toLin with the exposure folded in (the mix is linear, so scaling both bases scales the result). */
const toLinExposed = toLin.map((v) => v * BODY_EXPOSURE);
/** toSrgb padded to 8192 entries (the tone-mapped value can reach 1.0 and a bit over, so no clamp is needed per channel). */
const toSrgbWide = new Uint8ClampedArray(8192).map((_, i) => toSrgb[Math.min(4095, i)]);

/**
 * Khronos PBR Neutral, exactly as three.js NeutralToneMapping (tonemapping_pars_fragment), per pixel:
 * linear below 0.76 (so most of the car is untouched), then a hue-keeping roll-off and a little desaturation
 * towards white. The constants are folded: the 4095 LUT scale and the exposure are applied once per channel.
 */
const START = 0.8 - 0.04; // startCompression
const D = 1 - START; // compression range
const DESAT = 0.15;
const LUT = 4095;

/**
 * Recolours one frame into `out` (the same size as the white and black bases, which are RGBA).
 * The loop runs over ~1.3 M pixels, so it is plain scalar maths: no allocations, one branch for the
 * rare bright pixels.
 */
export function recolourInto(W: Uint8ClampedArray, B: Uint8ClampedArray, O: Uint8ClampedArray, r: number, g: number, bl: number) {
  const tl = toLinExposed, ts = toSrgbWide;
  for (let i = 0; i < W.length; i += 4) {
    const br = tl[B[i]], bg = tl[B[i + 1]], bb = tl[B[i + 2]];
    let cr = br + (tl[W[i]] - br) * r;
    let cg = bg + (tl[W[i + 1]] - bg) * g;
    let cb = bb + (tl[W[i + 2]] - bb) * bl;
    // the toe: off = x - 6.25 x^2 below x = 0.08 (x = the darkest channel) and 0.04 above, i.e. that curve at min(x, 0.08)
    let x = cr < cg ? cr : cg;
    if (cb < x) x = cb;
    if (x > 0.08) x = 0.08;
    const off = x - 6.25 * x * x;
    cr -= off;
    cg -= off;
    cb -= off;
    let peak = cr > cg ? cr : cg;
    if (cb > peak) peak = cb;
    if (peak >= START) {
      const np = 1 - (D * D) / (peak + D - START);
      const k = np / peak;
      const mix = 1 - 1 / (DESAT * (peak - np) + 1); // how far the highlight is pulled to white
      cr = cr * k * (1 - mix) + np * mix;
      cg = cg * k * (1 - mix) + np * mix;
      cb = cb * k * (1 - mix) + np * mix;
    }
    // (a branch-free pixel is faster than skipping the empty ones: the car's edge makes the skip unpredictable)
    O[i] = ts[(cr * LUT) | 0];
    O[i + 1] = ts[(cg * LUT) | 0];
    O[i + 2] = ts[(cb * LUT) | 0];
    O[i + 3] = W[i + 3];
  }
}

/**
 * Decoded base frames, most recently used last. About 5 MB each, so only one car and paint kind's
 * worth (every view, white and black base) is kept: they used to pile up for every car visited.
 */
const IMAGES_MAX = RENDER_VIEWS.length * 2;
const images = new Map<string, Promise<ImageData>>();
export function pixels(url: string): Promise<ImageData> {
  let p = images.get(url);
  if (p) {
    images.delete(url);
    images.set(url, p);
  } else {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        resolve(g.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = reject;
      img.src = url;
    });
    const pending = p;
    // a failed load (e.g. a dropped connection) is tried again next time, not remembered
    pending.catch(() => images.get(url) === pending && images.delete(url));
    images.set(url, pending);
    while (images.size > IMAGES_MAX) images.delete(images.keys().next().value!);
  }
  return p;
}

/**
 * Recoloured frames by car, view, paint and base, most recently used last: going back to a view
 * already seen (e.g. out of the wheel close-up) redraws it instead of recolouring 1.3 M pixels
 * again. About 5 MB each at 1440 x 900, so only the last few are kept.
 */
// ~5 MB each; phones and tablets keep fewer (switching to the wheel close-up and back needs 2-3)
const RECOLOURED_MAX = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px), (pointer: coarse)').matches ? 4 : 10;
const recoloured = new Map<string, ImageData>();
function rememberRecoloured(key: string, img: ImageData) {
  recoloured.delete(key);
  recoloured.set(key, img);
  while (recoloured.size > RECOLOURED_MAX) recoloured.delete(recoloured.keys().next().value!);
}

const hexLin = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => toLin[parseInt(h.slice(i, i + 2), 16) || 0]);
};

/** Frames of a paint: Frozen paints use the matte base, everything else (Pearl included) the gloss one. */
export const bodyBase = (carId: string, view: CameraViewPreset, paint: PaintColor) =>
  `/renders/${carId}/${view}/${paint.type === 'Frozen' ? 'matte' : 'gloss'}`;

/** The recoloured frame if it is already in memory (drawn at once), else undefined. */
export const recolouredNow = (carId: string, view: CameraViewPreset, paint: PaintColor): ImageData | undefined => {
  const key = `${bodyBase(carId, view, paint)}|${paint.hex}`;
  const seen = recoloured.get(key);
  if (seen) rememberRecoloured(key, seen);
  return seen;
};

/** The car in this view and paint, toned for the dark studio (straight alpha, as ImageData). */
export function recolouredBody(carId: string, view: CameraViewPreset, paint: PaintColor): Promise<ImageData> {
  const base = bodyBase(carId, view, paint);
  const key = `${base}|${paint.hex}`;
  const seen = recolouredNow(carId, view, paint);
  if (seen) return Promise.resolve(seen);
  return Promise.all([pixels(`${base}_w.webp`), pixels(`${base}_b.webp`)]).then(([w, b]) => {
    const out = new ImageData(w.width, w.height);
    const [r, g, bl] = hexLin(paint.hex);
    recolourInto(w.data, b.data, out.data, r, g, bl);
    rememberRecoloured(key, out);
    return out;
  });
}

/** Decodes the other views' frames in the background so switching is instant. */
export const warmBodies = (carId: string, paint: PaintColor) => {
  const kind = paint.type === 'Frozen' ? 'matte' : 'gloss';
  RENDER_VIEWS.forEach((v) => ['_w', '_b'].forEach((s) => pixels(`/renders/${carId}/${v}/${kind}${s}.webp`).catch(() => {})));
};

// ---------------------------------------------------------------------------------------------
// The dark studio backdrop behind the car ("backdrop A": charcoal radial gradient + the floor's pool of light)
// ---------------------------------------------------------------------------------------------

/** Where the 1.6:1 frame of the render sits in the box the backdrop paints, in px. */
export type Frame = { left: number; top: number; width: number; height: number };

/**
 * Backdrop layers, top first, with sizes and centres as fractions of the render frame (so the pool of
 * light always sits on the floor under the car, whatever the screen) - the same gradient as
 * `radial-gradient(ellipse 80% 24% at 50% 74%, rgba(212,215,224,.80), rgba(176,180,190,.42) 42%, rgba(120,124,132,0)),
 *  radial-gradient(ellipse 100% 34% at 50% 86%, rgba(120,124,134,.40), rgba(120,124,134,0)),
 *  radial-gradient(ellipse 85% 70% at 50% 38%, #444750, #26282d 50%, #0e0f11)` in the frame.
 */
const BACKDROP: { rx: number; ry: number; cx: number; cy: number; stops: [number, number, number, number, number][] }[] = [
  { rx: 0.8, ry: 0.24, cx: 0.5, cy: 0.74, stops: [[0, 212, 215, 224, 0.8], [0.42, 176, 180, 190, 0.42], [1, 120, 124, 132, 0]] },
  { rx: 1.0, ry: 0.34, cx: 0.5, cy: 0.86, stops: [[0, 120, 124, 134, 0.4], [1, 120, 124, 134, 0]] },
  { rx: 0.85, ry: 0.7, cx: 0.5, cy: 0.38, stops: [[0, 0x44, 0x47, 0x50, 1], [0.5, 0x26, 0x28, 0x2d, 1], [1, 0x0e, 0x0f, 0x11, 1]] }
];
/**
 * Looking straight down the floor is a disc under the car, not a band behind it: the pool is centred on the car
 * (the car sits mid-frame in the top view) and rounder.
 */
const BACKDROP_TOP: typeof BACKDROP = [
  { rx: 0.5, ry: 0.5, cx: 0.5, cy: 0.5, stops: [[0, 212, 215, 224, 0.7], [0.45, 176, 180, 190, 0.38], [1, 120, 124, 132, 0]] },
  { rx: 0.85, ry: 0.62, cx: 0.5, cy: 0.5, stops: [[0, 120, 124, 134, 0.38], [1, 120, 124, 134, 0]] },
  BACKDROP[2]
];
const layersFor = (view?: CameraViewPreset) => (view === 'top' ? BACKDROP_TOP : BACKDROP);

/** The colour outside every gradient (the last stop of the base layer). */
export const BACKDROP_EDGE = '#0e0f11';

const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const rgba = (r: number, g: number, b: number, a: number) => `rgba(${r},${g},${b},${a})`;

/** CSS `background` for a box that contains the render frame: the gradients are sized in px to the frame and continue past it. */
export function backdropCss(f: Frame, view?: CameraViewPreset): string {
  const layers = layersFor(view).map((l) => {
    const stops = l.stops.map(([p, r, g, b, a]) => `${rgba(r, g, b, a)} ${Math.round(p * 100)}%`).join(', ');
    return `radial-gradient(ellipse ${px(l.rx * f.width)} ${px(l.ry * f.height)} at ${px(f.left + l.cx * f.width)} ${px(f.top + l.cy * f.height)}, ${stops})`;
  });
  return `${layers.join(', ')}, ${BACKDROP_EDGE}`;
}

/**
 * The same backdrop on a canvas (for the summary stills). Browsers blend CSS gradient stops with
 * premultiplied alpha and canvas gradients without it, so each layer is resampled at 24 steps of
 * the premultiplied blend: the two come out the same.
 */
export function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, f: Frame, view?: CameraViewPreset) {
  const BACKDROP = layersFor(view);
  ctx.save();
  ctx.fillStyle = BACKDROP_EDGE;
  ctx.fillRect(0, 0, width, height);
  for (let li = BACKDROP.length - 1; li >= 0; li--) {
    const l = BACKDROP[li];
    ctx.save();
    ctx.translate(f.left + l.cx * f.width, f.top + l.cy * f.height);
    ctx.scale(l.rx * f.width, l.ry * f.height);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const N = 24;
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      let k = 1;
      while (k < l.stops.length - 1 && l.stops[k][0] < t) k++;
      const a = l.stops[k - 1], b = l.stops[k];
      const u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
      const al = a[4] + (b[4] - a[4]) * u;
      const pm = (c: number) => a[c] * a[4] + (b[c] * b[4] - a[c] * a[4]) * u; // premultiplied channel
      grad.addColorStop(t, al > 0 ? rgba(Math.round(pm(1) / al), Math.round(pm(2) / al), Math.round(pm(3) / al), +al.toFixed(4)) : rgba(0, 0, 0, 0));
    }
    ctx.fillStyle = grad;
    // the gradient lives in the unit circle: fill everything the layer can reach (past it, the last stop continues)
    ctx.fillRect(-1e4, -1e4, 2e4, 2e4);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Stills (summary page, PDF brochure): the same car, tone curve and backdrop as the configurator
// ---------------------------------------------------------------------------------------------

/** Cars whose manifest lists every one of these views have pre-rendered bodies for them. */
export const hasBodies = (manifest: Record<string, string[]>, carId: string, views: CameraViewPreset[]) => views.every((v) => manifest[carId]?.includes(v));

/**
 * 16:9 JPEG stills of the current configuration: the recoloured Blender body over the dark studio backdrop with the
 * live wheels on top, each view framed as in the configurator but scaled to cover the picture (the 1.6:1 render
 * loses a sliver top and bottom; the wheel close-up already fills its frame, so there is no seam at its sides).
 * Resolves to [] when the wheel layers are unavailable (the caller falls back to the live 3D stills).
 */
export async function renderedStills(engine: CarConfiguratorEngine, carId: string, paint: PaintColor, views: CameraViewPreset[], outW = 1600, outH = 900): Promise<string[]> {
  const bodies = await Promise.all(views.map((v) => recolouredBody(carId, v, paint)));
  const { width: bw, height: bh } = bodies[0];
  const k = Math.max(outW / bw, outH / bh);
  const frame: Frame = { left: (outW - bw * k) / 2, top: (outH - bh * k) / 2, width: bw * k, height: bh * k };
  const wheels = await engine.captureWheelLayers(views, Math.round(frame.width));
  if (wheels.length !== views.length) return [];
  return bodies.map((body, i) => {
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const g = c.getContext('2d')!;
    paintBackdrop(g, outW, outH, frame, views[i]);
    const layer = document.createElement('canvas'); // putImageData replaces pixels, so the body goes through a canvas to blend
    layer.width = bw;
    layer.height = bh;
    layer.getContext('2d')!.putImageData(body, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(layer, frame.left, frame.top, frame.width, frame.height);
    g.drawImage(wheels[i], frame.left, frame.top, frame.width, frame.height);
    return c.toDataURL('image/jpeg', 0.92);
  });
}

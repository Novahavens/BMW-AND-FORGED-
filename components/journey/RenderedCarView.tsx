import { useEffect, useRef, useState } from 'react';
import type { CameraViewPreset, PaintColor } from '../../types';

/**
 * The car body as a pre-rendered Blender image (scripts/prerender), recoloured for any paint.
 * Each view has the paint rendered with a white and a black base colour (gloss and matte), so
 *   colour = black + (white - black) * paint   (in linear light)
 * gives every paint exactly, reflections and shadows included. The live engine draws the wheels
 * on top from the same camera (CarConfiguratorEngine.setRenderedBody).
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

/**
 * Decoded base frames, most recently used last. About 5 MB each, so only one car and paint kind's
 * worth (every view, white and black base) is kept: they used to pile up for every car visited.
 */
const IMAGES_MAX = RENDER_VIEWS.length * 2;
const images = new Map<string, Promise<ImageData>>();
function pixels(url: string): Promise<ImageData> {
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

export default function RenderedCarView({ carId, view, paint, className }: { carId: string; view: CameraViewPreset; paint: PaintColor; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const kind = paint.type === 'Frozen' ? 'matte' : 'gloss';
    const base = `/renders/${carId}/${view}/${kind}`;
    const key = `${base}|${paint.hex}`;
    const show = (img: ImageData) => {
      const c = canvasRef.current!;
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.putImageData(img, 0, 0);
      setShown(true);
    };
    const seen = recoloured.get(key);
    if (seen) {
      rememberRecoloured(key, seen);
      show(seen);
    } else {
      recolour();
    }
    function recolour() {
      Promise.all([pixels(`${base}_w.webp`), pixels(`${base}_b.webp`)])
        .then(([w, b]) => {
          if (cancelled || !canvasRef.current) return;
          const out = new ImageData(w.width, w.height);
          const [r, g, bl] = hexLin(paint.hex);
          const W = w.data, B = b.data, O = out.data;
          for (let i = 0; i < W.length; i += 4) {
            const br = toLin[B[i]], bg = toLin[B[i + 1]], bb = toLin[B[i + 2]];
            O[i] = toSrgb[Math.min(4095, ((br + (toLin[W[i]] - br) * r) * 4095) | 0)];
            O[i + 1] = toSrgb[Math.min(4095, ((bg + (toLin[W[i + 1]] - bg) * g) * 4095) | 0)];
            O[i + 2] = toSrgb[Math.min(4095, ((bb + (toLin[W[i + 2]] - bb) * bl) * 4095) | 0)];
            O[i + 3] = W[i + 3];
          }
          rememberRecoloured(key, out);
          show(out);
        })
        .catch(() => setShown(false));
    }
    // warm the other views so switching is instant
    RENDER_VIEWS.forEach((v) => ['_w', '_b'].forEach((s) => pixels(`/renders/${carId}/${v}/${kind}${s}.webp`).catch(() => {})));
    return () => {
      cancelled = true;
    };
  }, [carId, view, paint.hex, paint.type]);

  return <canvas ref={canvasRef} className={`${className ?? ''} transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} style={{ width: '100%', height: '100%' }} />;
}

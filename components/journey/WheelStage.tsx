/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import { StageLayout, loadStageImage, loadStageLayout, platePath, rimSprite, wheelLayerPath } from '../../services/wheelStage';

interface Props {
  car: CarModel;
  paint: PaintColor;
  wheel: WheelDesign;
  finish: WheelFinish;
  size: string;
  /** 'car': the whole car side-on; 'wheel': a close-up of the front wheel. */
  framing: 'car' | 'wheel';
  /** Pixels of the screen the controls cover; the picture is centred in the rest. */
  inset: { right: number; bottom: number };
}

type Loaded = { layout: StageLayout; plate: HTMLImageElement; tyres: HTMLImageElement; sprite: CanvasImageSource | null };

/**
 * The car side-on, with the wheel swapped by compositing images (no WebGL): plate, tyre layer, rim
 * photo. Drawn at the screen's own resolution, so the rim photo stays sharp in the close-up even
 * though the car plate is enlarged. See services/wheelStage.ts.
 */
export const WheelStage: React.FC<Props> = ({ car, paint, wheel, finish, size, framing, inset }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loaded = useRef<Loaded | null>(null);
  const shown = useRef({ framing, k: 0, x: 0, y: 0 });
  const anim = useRef<number | null>(null);
  const token = useRef(0);

  // the view: scale and offset from stage pixels to canvas CSS pixels
  const target = (l: StageLayout, w: number, h: number, f: 'car' | 'wheel') => {
    const { crop } = l;
    if (f === 'wheel') {
      const a = l.sizes[size]?.front ?? Object.values(l.sizes)[0].front;
      const span = a.ry * 2 * 1.75; // tyre and a little arch around the rim
      const k = Math.min(w / span, (h * 0.86) / span);
      return { k, x: w / 2 - a.cx * k, y: h * 0.47 - a.cy * k };
    }
    const k = Math.min((w * 0.96) / crop.w, (h * 0.8) / crop.h);
    return { k, x: (w - crop.w * k) / 2, y: (h - crop.h * k) / 2 };
  };

  const draw = () => {
    const canvas = canvasRef.current, box = boxRef.current, L = loaded.current;
    if (!canvas || !box || !L) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = box.clientWidth, h = box.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const v = shown.current;
    ctx.setTransform(v.k * dpr, 0, 0, v.k * dpr, v.x * dpr, v.y * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const { crop } = L.layout;
    ctx.drawImage(L.plate, 0, 0, crop.w, crop.h);
    ctx.drawImage(L.tyres, 0, 0, crop.w, crop.h);
    const axles = L.layout.sizes[size];
    if (L.sprite && axles) {
      for (const a of [axles.front, axles.rear]) ctx.drawImage(L.sprite, a.cx - a.rx, a.cy - a.ry, a.rx * 2, a.ry * 2);
    }
  };

  // glide between framings (car <-> wheel); jump on the first frame
  const settle = (instant: boolean) => {
    const box = boxRef.current, L = loaded.current;
    if (!box || !L) return;
    const t = target(L.layout, box.clientWidth, box.clientHeight, framing);
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = { ...shown.current };
    if (instant || from.k === 0) {
      shown.current = { framing, ...t };
      draw();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 650);
      const e = 1 - Math.pow(1 - u, 3);
      // zoom in log space so the move feels even
      const k = Math.exp(Math.log(from.k) + (Math.log(t.k) - Math.log(from.k)) * e);
      shown.current = { framing, k, x: from.x + (t.x - from.x) * e, y: from.y + (t.y - from.y) * e };
      draw();
      if (u < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const mine = ++token.current;
    (async () => {
      try {
        const layout = await loadStageLayout(car.id);
        if (!layout.sizes[size]) return;
        const [plate, tyres, sprite] = await Promise.all([
          loadStageImage(platePath(car.id, paint.id)),
          loadStageImage(wheelLayerPath(car.id, size)),
          rimSprite(wheel, finish).catch(() => null)
        ]);
        if (mine !== token.current) return;
        const first = !loaded.current;
        loaded.current = { layout, plate, tyres, sprite };
        settle(first);
        if (!first) draw();
      } catch {
        /* the 3D view stays underneath */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car.id, paint.id, wheel, finish, size]);

  useEffect(() => {
    settle(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => settle(true));
    ro.observe(box);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inset.right, inset.bottom]);

  useEffect(() => () => { if (anim.current) cancelAnimationFrame(anim.current); }, []);

  return (
    <div ref={boxRef} className="absolute z-20 pointer-events-none animate-fade" style={{ left: 0, top: 0, right: inset.right, bottom: inset.bottom }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${car.name} in ${paint.name} with ${wheel.name} ${size} in ${finish.name}`}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
};

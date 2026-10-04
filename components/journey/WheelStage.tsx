/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import { drawRim, loadStageImage, loadStageLayout, platePath, rimSprite, wheelLayerPath } from '../../services/wheelStage';

interface Props {
  car: CarModel;
  paint: PaintColor;
  wheel: WheelDesign;
  finish: WheelFinish;
  size: string;
  /** Pixels of the screen the controls cover; the picture is centred in the rest. */
  inset: { right: number; bottom: number };
  onReady?: () => void;
}

/**
 * The car side-on, with the wheel swapped by compositing images (no WebGL): plate, tyre layer, rim photo.
 * See services/wheelStage.ts.
 */
export const WheelStage: React.FC<Props> = ({ car, paint, wheel, finish, size, inset, onReady }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const mine = ++token.current;
    (async () => {
      try {
        const layout = await loadStageLayout(car.id);
        const axles = layout.sizes[size];
        if (!axles) return;
        const [plate, tyres, sprite] = await Promise.all([
          loadStageImage(platePath(car.id, paint.id)),
          loadStageImage(wheelLayerPath(car.id, size)),
          rimSprite(wheel, finish)
        ]);
        if (mine !== token.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { w, h } = layout.crop;
        canvas.width = w;
        canvas.height = h;
        setDims({ w, h });
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(plate, 0, 0, w, h);
        ctx.drawImage(tyres, 0, 0, w, h);
        if (sprite) {
          ctx.imageSmoothingQuality = 'high';
          drawRim(ctx, sprite, axles.front);
          drawRim(ctx, sprite, axles.rear);
        }
        onReady?.();
      } catch {
        /* the 3D view stays underneath */
      }
    })();
  }, [car.id, paint.id, wheel, finish, size, onReady]);

  // Fit the picture in the free area, never upscaling past the render
  const aspect = dims ? dims.w / dims.h : 16 / 9;
  return (
    <div className="absolute z-20 pointer-events-none flex items-center justify-center" style={{ left: 0, top: 0, right: inset.right, bottom: inset.bottom }}>
      <canvas
        ref={canvasRef}
        aria-label={`${car.name} in ${paint.name} with ${wheel.name} ${size} in ${finish.name}`}
        className="max-w-[96%] max-h-[80%] w-auto h-auto"
        style={{ aspectRatio: String(aspect), visibility: dims ? 'visible' : 'hidden' }}
      />
    </div>
  );
};

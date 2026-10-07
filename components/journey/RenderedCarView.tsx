import { useEffect, useRef, useState } from 'react';
import type { CameraViewPreset, PaintColor } from '../../types';
import { RENDER_ASPECT, RENDER_VIEWS, loadRenderManifest, recolouredBody, recolouredNow, warmBodies } from '../../services/renderedBody';

/**
 * The car body as a pre-rendered Blender image (scripts/prerender), recoloured for any paint and
 * toned for the dark studio (services/renderedBody.ts). It is drawn on a transparent canvas over the
 * stage backdrop (App.tsx); the live engine draws the wheels on top from the same camera
 * (CarConfiguratorEngine.setRenderedBody).
 */
export { RENDER_ASPECT, RENDER_VIEWS, loadRenderManifest };

export default function RenderedCarView({ carId, view, paint, className }: { carId: string; view: CameraViewPreset; paint: PaintColor; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const show = (img: ImageData) => {
      const c = canvasRef.current;
      if (cancelled || !c) return;
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.putImageData(img, 0, 0);
      setShown(true);
    };
    const seen = recolouredNow(carId, view, paint);
    if (seen) show(seen);
    else recolouredBody(carId, view, paint).then(show).catch(() => setShown(false));
    // warm the other views so switching is instant
    warmBodies(carId, paint);
    return () => {
      cancelled = true;
    };
  }, [carId, view, paint.hex, paint.type]);

  return <canvas ref={canvasRef} className={`${className ?? ''} transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} style={{ width: '100%', height: '100%' }} />;
}

import { useEffect, useRef, useState, type PointerEvent } from 'react';

/**
 * Photoreal 360° spin of a rim from pre-rendered Blender frames (scripts/rim3d/turntable.py):
 * /renders/rims/<wheelId>/<finishId>/fNN.webp. Drag (or swipe) to turn it; `autoRotate` idles it round.
 */
let manifest: Promise<Record<string, { frames: number; finishes: string[] }>> | null = null;
/** Wheels with a rendered spin, with their frame count and finishes. */
export const loadRimSpinManifest = () =>
  (manifest ??= fetch('/renders/rims/manifest.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));

const frameUrl = (wheelId: string, finishId: string, i: number) => `/renders/rims/${wheelId}/${finishId}/f${String(i).padStart(2, '0')}.webp`;

export default function RimSpinView({ wheelId, finishId, frames, autoRotate, className, onError }: { wheelId: string; finishId: string; frames: number; autoRotate: boolean; className?: string; /** a frame failed to load: show the live 3D instead */ onError?: () => void }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const indexRef = useRef(0);
  const drag = useRef<{ x: number; start: number } | null>(null);

  // preload every frame of this finish; the first one shows as soon as it arrives
  useEffect(() => {
    let alive = true;
    setLoaded(0);
    Array.from({ length: frames }, (_, i) => {
      const img = new Image();
      img.onload = () => alive && setLoaded((n) => n + 1);
      // a missing frame (or the SPA rewrite answering it with index.html) must not leave a broken spin
      img.onerror = () => alive && onError?.();
      img.src = frameUrl(wheelId, finishId, i);
    });
    return () => {
      alive = false;
    };
  }, [wheelId, finishId, frames, onError]);

  useEffect(() => {
    if (!autoRotate) return;
    const t = setInterval(() => {
      if (drag.current) return;
      indexRef.current = (indexRef.current + 1) % frames;
      setIndex(indexRef.current);
    }, 110);
    return () => clearInterval(t);
  }, [autoRotate, frames]);

  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, start: indexRef.current };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const perFrame = Math.max(6, (e.currentTarget as HTMLElement).clientWidth / frames); // one full turn per width
    const next = (((drag.current.start + Math.round((e.clientX - drag.current.x) / perFrame)) % frames) + frames) % frames;
    if (next !== indexRef.current) {
      indexRef.current = next;
      setIndex(next);
    }
  };
  const onUp = () => (drag.current = null);

  return (
    <div className={`relative h-full w-full touch-none cursor-grab active:cursor-grabbing select-none ${className ?? ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <img src={frameUrl(wheelId, finishId, index)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      {loaded < frames && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 h-0.5 w-24 rounded bg-ink/10 overflow-hidden">
          <div className="h-full bg-gold transition-[width]" style={{ width: `${(100 * loaded) / frames}%` }} />
        </div>
      )}
    </div>
  );
}

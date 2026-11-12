/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cx } from './ui';

/** One car on the welcome stage: a Cycles still rendered in the reference studio (public/hero/<carId>-<w>.webp). */
export interface HeroSlide {
  carId: string;
  name: string;
  paint: string;
  /** The catalogue paint the still shows: the configurator opens the car in it, when the car offers it. */
  paintId: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  { carId: 'm2_g87', name: 'BMW M2 CS', paint: 'Portimao Blue Metallic', paintId: 'portimao_blue' },
  { carId: 'm4_cs_g82', name: 'BMW M4 CS', paint: 'São Paulo Yellow', paintId: 'sao_paulo_yellow' },
  { carId: 'm5_g90', name: 'BMW M5', paint: 'Fire Red Metallic', paintId: 'fire_red' },
  { carId: 'm5_touring_g99', name: 'BMW M5 Touring', paint: 'Frozen Pure Grey Metallic', paintId: 'frozen_pure_grey' },
  // Frames-only car: its still is the app's own (Cycles frame + live wheels, scripts/prerender/hero-from-frames.cjs)
  { carId: 'ix3_m60', name: 'BMW iX3 M60', paint: 'Storm Bay Metallic', paintId: 'storm_bay' },
  { carId: 'm3_g80', name: 'BMW M3', paint: 'Isle of Man Green Metallic', paintId: 'isle_of_man_green' }
];

const WHEEL_THRESHOLD = 40; // px of scroll in one gesture before it moves one car
const GESTURE_GAP_MS = 220; // a pause this long ends a scroll gesture (trackpad inertia stays one gesture)
const MIN_STEP_MS = 450; // never two steps closer together than this
const SWIPE_PX = 50;

/**
 * Which car is on stage, and the direction it arrived from. Arrows, scroll, keyboard and swipe all step it.
 * `initial` is the slide to open on (the car the visitor is building, when they come back to change it).
 */
export function useHeroCycle(count: number, initial = 0) {
  const [state, setState] = useState({ index: Math.min(Math.max(initial, 0), count - 1), prev: -1, dir: 1 as 1 | -1 });
  const step = useCallback(
    (dir: 1 | -1) => setState((s) => ({ index: (s.index + dir + count) % count, prev: s.index, dir })),
    [count]
  );
  const jump = useCallback(
    (i: number) => setState((s) => (i === s.index ? s : { index: i, prev: s.index, dir: i > s.index ? 1 : -1 })),
    []
  );
  const gesture = useRef({ acc: 0, last: 0, fired: false, lastStep: 0 });

  useEffect(() => {
    if (count < 2) return;
    const fire = (dir: 1 | -1) => {
      const now = performance.now();
      if (now - gesture.current.lastStep < MIN_STEP_MS) return;
      gesture.current.lastStep = now;
      step(dir);
    };
    const onWheel = (e: WheelEvent) => {
      const g = gesture.current;
      const now = performance.now();
      if (now - g.last > GESTURE_GAP_MS) {
        g.acc = 0;
        g.fired = false;
      }
      g.last = now;
      if (g.fired) return;
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // lines / pages -> px
      g.acc += (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * scale;
      if (Math.abs(g.acc) > WHEEL_THRESHOLD) {
        g.fired = true;
        fire(g.acc > 0 ? 1 : -1);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['SELECT', 'INPUT', 'TEXTAREA'].includes(t.tagName))) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') fire(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') fire(-1);
    };
    let start: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      if (Math.abs(d) > SWIPE_PX) fire(d < 0 ? 1 : -1);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [count, step]);

  return { ...state, step, jump };
}

const SIZES = '(orientation: landscape) and (max-height: 519px) min(62vw, 142vh), (orientation: landscape) min(80vw, 142vh), min(128vw, 104vh)';

/** The stills, stacked; the current one fades and slides in from the side it came from. */
export const HeroStage: React.FC<{ slides: HeroSlide[]; index: number; prev: number; dir: 1 | -1 }> = ({ slides, index, prev, dir }) => (
  // The stills' own backdrop colour (sampled rgb 1,1,3), so the image edges disappear into the page
  <div className="absolute inset-0 bg-[#010103]" aria-live="polite">
    {slides.map((s, i) => {
      const active = i === index;
      const shift = active ? 0 : (i === prev ? -dir : dir) * 4;
      return (
        <img
          key={s.carId}
          src={`/hero/${s.carId}-1600.webp`}
          srcSet={`/hero/${s.carId}-960.webp 960w, /hero/${s.carId}-1600.webp 1600w`}
          sizes={SIZES}
          alt={active ? `${s.name} in ${s.paint}` : ''}
          aria-hidden={!active}
          draggable={false}
          decoding="async"
          // A missing or unreadable still leaves the black stage, not a broken-image icon over it
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          className="hero-shot pointer-events-none select-none transition-[opacity,transform] duration-[900ms] ease-lux motion-reduce:transition-none"
          style={{ opacity: active ? 1 : 0, transform: `translateX(${shift}%) scale(${active ? 1 : 0.985})` }}
        />
      );
    })}
  </div>
);

/** Car name, paint and the prev / next controls with a position indicator. */
export const HeroControls: React.FC<{
  slides: HeroSlide[];
  index: number;
  onStep: (dir: 1 | -1) => void;
  onJump: (i: number) => void;
}> = ({ slides, index, onStep, onJump }) => {
  const s = slides[index];
  const n = slides.length;
  const arrow =
    'h-11 w-11 shrink-0 rounded-full bg-white/[0.06] backdrop-blur ring-1 ring-white/15 flex items-center justify-center text-ink hover:bg-white/[0.12] hover:scale-105 transition-all duration-300 ease-lux';
  return (
    <div className="hero-controls pointer-events-auto flex flex-col items-center landscape:items-end px-6 text-center landscape:text-right">
      <div key={s.carId} className="animate-rise">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-bronze">{s.paint}</div>
        <div className="mt-1.5 font-display text-[17px] sm:text-[20px] font-bold tracking-[-0.01em] text-ink">{s.name}</div>
      </div>
      {n > 1 && (
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => onStep(-1)} aria-label="Previous car" className={arrow}>
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
          <span className="font-mono text-[11px] text-mute tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <div className="-my-[18px] flex items-center" data-allow-small>
            {slides.map((x, i) => (
              <button key={x.carId} aria-label={x.name} onClick={() => onJump(i)} className="group flex h-10 items-center px-1">
                <span className={cx('block h-[3px] rounded-full transition-all duration-500 ease-lux', i === index ? 'w-8 bg-gold' : 'w-3 bg-white/20 group-hover:bg-white/40')} />
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-mute tabular-nums">{String(n).padStart(2, '0')}</span>
          <button onClick={() => onStep(1)} aria-label="Next car" className={arrow}>
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
};

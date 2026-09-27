/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { CarModel } from '../../types';
import { Button, Eyebrow, Modal, cx } from './ui';

/** "M4 G82" -> "M4", "X5 M F95" -> "X5 M": the model name without the chassis code. */
export const shortModelName = (car: CarModel) =>
  car.badge.split(' ').filter((t) => !/^[A-Z]\d{2}$/.test(t)).join(' ') || car.badge;

/** Giant model name, rendered behind the transparent 3D canvas so the car sits in front of it. */
export const ShowroomBackdrop: React.FC<{ car: CarModel; visible: boolean }> = ({ car, visible }) => (
  <div
    className={cx(
      'absolute inset-0 z-0 flex items-center justify-center overflow-hidden transition-opacity duration-700 ease-lux pointer-events-none',
      visible ? 'opacity-100' : 'opacity-0'
    )}
    aria-hidden
  >
    <div
      key={car.id}
      className="animate-giant font-display font-black leading-none whitespace-nowrap -translate-y-[6%] select-none"
      style={{
        fontSize: 'min(38vw, 62vh)',
        letterSpacing: '-0.045em',
        color: 'rgba(255,255,255,0.025)',
        WebkitTextStroke: '1px rgba(207,159,82,0.16)'
      }}
    >
      {shortModelName(car)}
    </div>
  </div>
);

export const Showroom: React.FC<{
  cars: CarModel[];
  index: number;
  busy: boolean;
  onStep: (direction: 1 | -1) => void;
  onJump: (index: number) => void;
  onBuild: () => void;
}> = ({ cars, index, busy, onStep, onJump, onBuild }) => {
  const car = cars[index];
  const [explore, setExplore] = useState(false);
  const [notice, setNotice] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (explore || notice) return;
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
      if (e.key === 'Enter') setNotice(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStep, explore, notice]);

  if (!car) return null;
  const n = cars.length;
  // Cars can be listed without specs; blank values are left out rather than shown as empty rows
  const headline = [
    { text: car.power, wide: false },
    { text: car.acceleration, wide: false },
    { text: car.engine, wide: true }
  ].filter((h) => h.text?.trim());
  const fit = car.recommendedWheelFitment ?? { front: '', rear: '', pcd: '', cb: '' };
  const specs = (
    [
      ['Engine', car.engine],
      ['Power', car.power],
      ['Torque', car.torque],
      ['0–100 km/h', (car.acceleration ?? '').replace(/^0-100 km\/h in /, '')],
      ['Front fitment', fit.front],
      ['Rear fitment', fit.rear],
      ['PCD', fit.pcd],
      ['Centre bore', fit.cb]
    ] as [string, string][]
  ).filter(([, v]) => v?.trim());

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Swipe surface over the car */}
      <div
        className="absolute inset-x-0 top-20 bottom-44 pointer-events-auto"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1);
        }}
      />

      <div className="absolute top-20 sm:top-24 inset-x-0 text-center animate-fade">
        <Eyebrow className="tracking-[0.42em]">{BRAND.tagline}</Eyebrow>
      </div>

      {/* Arrows */}
      {n > 1 && (
        <>
          <button
            onClick={() => onStep(-1)}
            disabled={busy}
            aria-label="Previous model"
            className="pointer-events-auto absolute left-3 sm:left-8 top-1/2 -translate-y-1/2 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-surface/70 backdrop-blur ring-1 ring-line flex items-center justify-center text-ink hover:bg-gunmetal hover:scale-105 transition-all duration-300 ease-lux disabled:opacity-40"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onStep(1)}
            disabled={busy}
            aria-label="Next model"
            className="pointer-events-auto absolute right-3 sm:right-8 top-1/2 -translate-y-1/2 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-surface/70 backdrop-blur ring-1 ring-line flex items-center justify-center text-ink hover:bg-gunmetal hover:scale-105 transition-all duration-300 ease-lux disabled:opacity-40"
          >
            <ArrowRight className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </>
      )}

      {/* Model card */}
      <div className="absolute inset-x-0 bottom-0 pb-8 sm:pb-12 px-6 flex flex-col items-center text-center pointer-events-auto">
        <div key={car.id} className="flex flex-col items-center">
          <Eyebrow className="animate-rise">{BRAND.vehicleLine} · {car.generation}</Eyebrow>
          <h2 className="mt-2 font-display text-[28px] sm:text-[40px] font-extrabold tracking-[-0.02em] text-ink animate-rise delay-100">
            {car.name}
          </h2>
          {headline.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-mute animate-rise delay-200">
              {headline.map((h, i) => (
                <React.Fragment key={h.text}>
                  {i > 0 && <span className={cx('h-3 w-px bg-line', h.wide && 'hidden sm:block')} />}
                  <span className={cx(h.wide && 'hidden sm:block')}>{h.text}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 flex items-center gap-3">
          <Button variant="secondary" onClick={() => setExplore(true)} icon={<Info className="h-4 w-4" strokeWidth={1.6} />}>
            Explore
          </Button>
          <Button onClick={() => setNotice(true)} icon={<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}>
            Build
          </Button>
        </div>

        {n > 1 && (
          <div className="mt-7 flex items-center gap-4">
            <span className="font-mono text-[11px] text-mute tabular-nums">{String(index + 1).padStart(2, '0')}</span>
            <div className="flex items-center gap-2">
              {cars.map((c, i) => (
                <button
                  key={c.id}
                  aria-label={c.name}
                  onClick={() => i !== index && onJump(i)}
                  disabled={busy}
                  className={cx('h-[3px] rounded-full transition-all duration-500 ease-lux', i === index ? 'w-8 bg-gold' : 'w-3 bg-ink/15 hover:bg-ink/35')}
                />
              ))}
            </div>
            <span className="font-mono text-[11px] text-mute tabular-nums">{String(n).padStart(2, '0')}</span>
          </div>
        )}
      </div>

      <Modal open={explore} onClose={() => setExplore(false)} title={car.name}>
        <p className="text-[14px] leading-relaxed text-mute">
          The {car.name}{car.chassisCode ? ` (${car.chassisCode})` : ''} with our forged wheels. Everything you see can be configured: paint, wheel design, size and finish.
        </p>
        {specs.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line">
            {specs.map(([k, v], i) => (
              // A lone last cell spans both columns so no empty grey cell shows
              <div key={k} className={cx('bg-surface p-4', i === specs.length - 1 && specs.length % 2 === 1 && 'col-span-2')}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{k}</dt>
                <dd className="mt-1.5 text-[13.5px] font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <Button
          className="mt-6 w-full"
          onClick={() => {
            setExplore(false);
            setNotice(true);
          }}
        >
          Build your {shortModelName(car)}
        </Button>
      </Modal>

      <Modal open={notice} onClose={() => setNotice(false)} title="Pre-curated vehicle" width="max-w-md">
        <p className="text-[14px] leading-relaxed text-mute">{BRAND.visualisationNotice}</p>
        <div className="mt-7 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setNotice(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            autoFocus
            onClick={() => {
              setNotice(false);
              onBuild();
            }}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
};

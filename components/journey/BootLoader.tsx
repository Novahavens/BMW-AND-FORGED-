/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BRAND } from '../../config/brand';
import { Logo, cx } from './ui';

/**
 * First paint: a wheel drawn in fine line while the studio, the lighting and the first car load.
 * Fades away once `ready`.
 */
export const BootLoader: React.FC<{ progress: number; ready: boolean }> = ({ progress, ready }) => {
  const spokes = 10;
  return (
    <div
      className={cx(
        'absolute inset-0 z-[70] flex flex-col items-center justify-center bg-carbon transition-opacity duration-[900ms] ease-lux',
        ready ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      aria-busy={!ready}
      aria-label="Loading"
    >
      <svg viewBox="-110 -110 220 220" className="h-40 w-40 sm:h-48 sm:w-48 text-gold" fill="none" stroke="currentColor">
        <circle r="100" strokeWidth="0.9" className="animate-draw" style={{ ['--len' as string]: 630 }} />
        <circle r="86" strokeWidth="0.6" className="animate-draw delay-200" style={{ ['--len' as string]: 541 }} opacity={0.6} />
        <circle r="24" strokeWidth="0.9" className="animate-draw delay-300" style={{ ['--len' as string]: 151 }} />
        <circle r="9" strokeWidth="0.9" className="animate-draw delay-500" style={{ ['--len' as string]: 57 }} />
        {Array.from({ length: spokes }).map((_, i) => {
          const a = (i / spokes) * Math.PI * 2 - Math.PI / 2;
          const b = a + 0.1;
          const p = (r: number, t: number) => `${(Math.cos(t) * r).toFixed(2)} ${(Math.sin(t) * r).toFixed(2)}`;
          return (
            <path
              key={i}
              d={`M${p(26, a - 0.12)} L${p(85, a - 0.05)} M${p(26, b + 0.02)} L${p(85, b - 0.03)}`}
              strokeWidth="0.8"
              className="animate-draw"
              style={{ ['--len' as string]: 130, animationDelay: `${300 + i * 70}ms` }}
            />
          );
        })}
        {Array.from({ length: 5 }).map((_, i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return <circle key={`l${i}`} cx={Math.cos(a) * 16} cy={Math.sin(a) * 16} r="2.2" strokeWidth="0.7" className="animate-draw delay-700" style={{ ['--len' as string]: 14 }} />;
        })}
      </svg>

      <div className="mt-10 flex flex-col items-center gap-3 animate-rise delay-300">
        <Logo size="md" />
        <div className="text-[10px] font-medium uppercase tracking-[0.34em] text-mute">{BRAND.descriptor}</div>
      </div>

      <div className="absolute bottom-14 left-1/2 w-40 -translate-x-1/2">
        <div className="h-px w-full bg-line overflow-hidden">
          <div
            className="h-px bg-gold transition-[width] duration-700 ease-lux"
            style={{ width: `${Math.round(Math.max(0.04, Math.min(1, progress)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

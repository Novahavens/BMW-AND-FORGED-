/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useMemo } from 'react';
import { WheelDesign } from '../../types';
import { proceduralRimShapes } from '../../services/proceduralRims';

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/**
 * Front-on drawing of a procedural rim, from the same outline the 3D face is extruded from, so
 * thumbnails always match what goes on the car.
 */
export const RimFaceSvg: React.FC<{
  wheel: Pick<WheelDesign, 'spokeType' | 'spokeCount'>;
  finishHex?: string;
  size?: number;
  className?: string;
  withTyre?: boolean;
}> = ({ wheel, finishHex = '#d6dde3', size = 96, className, withTyre = false }) => {
  const id = useId().replace(/:/g, '');
  const d = useMemo(() => {
    const [face] = proceduralRimShapes(wheel);
    const toPath = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 100).toFixed(2)} ${(-p.y * 100).toFixed(2)}`).join('') + 'Z';
    return [toPath(face.getPoints(64)), ...face.holes.map((h) => toPath(h.getPoints()))].join('');
  }, [wheel.spokeType, wheel.spokeCount]);
  const r = withTyre ? 100 / 0.74 : 100;
  return (
    <svg viewBox={`${-r - 4} ${-r - 4} ${2 * r + 8} ${2 * r + 8}`} width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}b`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#3a3d43" />
          <stop offset="100%" stopColor="#101114" />
        </radialGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={shade(finishHex, 0.6)} />
          <stop offset="38%" stopColor={finishHex} />
          <stop offset="55%" stopColor={shade(finishHex, -0.35)} />
          <stop offset="72%" stopColor={shade(finishHex, 0.25)} />
          <stop offset="100%" stopColor={shade(finishHex, -0.45)} />
        </linearGradient>
        <radialGradient id={`${id}t`} cx="50%" cy="40%" r="60%">
          <stop offset="70%" stopColor="#2a2c30" />
          <stop offset="100%" stopColor="#0e0f11" />
        </radialGradient>
      </defs>
      {withTyre && <circle r={r} fill={`url(#${id}t)`} />}
      <circle r={100} fill={`url(#${id}b)`} />
      <circle r={62} fill="#55595f" opacity={0.35} />
      <path d={d} fill={`url(#${id}m)`} fillRule="evenodd" stroke={shade(finishHex, 0.7)} strokeOpacity={0.5} strokeWidth={0.8} />
      <circle r={100} fill="none" stroke={shade(finishHex, 0.8)} strokeOpacity={0.7} strokeWidth={1.4} />
      <circle r={13} fill="#15171a" stroke={shade(finishHex, 0.4)} strokeWidth={1.2} />
    </svg>
  );
};

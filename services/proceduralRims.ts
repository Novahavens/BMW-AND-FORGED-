/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { WheelDesign } from '../types';

/**
 * Rim faces as 2D outlines on a unit disc: a solid face with the windows between the spokes cut
 * out. buildRimFaceGeometry() turns these into bevelled, dished 3D faces, the same path an
 * uploaded rim PNG takes, so procedural and uploaded rims look alike on the car.
 */

const RING = 0.86; // inner edge of the outer ring (the face's lip)
const HUB = 0.3; // outer edge of the hub
const BORE = 0.13; // centre bore (the centre cap covers it)
const LUG_R = 0.306; // lug bolt circle (matches the engine's lug bolts)

const polar = (r: number, a: number) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);

/** Rounds polygon corners (Chaikin), so windows look machined rather than cut with scissors. */
function smooth(points: THREE.Vector2[], iterations = 3): THREE.Vector2[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const next: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    pts = next;
  }
  return pts;
}

function arc(r: number, from: number, to: number, steps = 18): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) out.push(polar(r, from + ((to - from) * i) / steps));
  return out;
}

const halfAngle = (width: number, r: number) => Math.asin(Math.min(0.99, width / 2 / r));

/** Window between two straight (optionally curved) spokes. */
function spokeWindow(
  a0: number,
  a1: number,
  widthHub: number,
  widthRing: number,
  twist = 0,
  inner = HUB,
  outer = RING
): THREE.Vector2[] {
  const steps = 10;
  const pts: THREE.Vector2[] = [];
  // Right edge of spoke a0, hub -> ring
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = inner + (outer - inner) * t;
    const w = widthHub + (widthRing - widthHub) * t;
    pts.push(polar(r, a0 + twist * t + halfAngle(w, r)));
  }
  pts.push(...arc(outer, a0 + twist + halfAngle(widthRing, outer), a1 + twist - halfAngle(widthRing, outer)).slice(1, -1));
  // Left edge of spoke a1, ring -> hub
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const r = inner + (outer - inner) * t;
    const w = widthHub + (widthRing - widthHub) * t;
    pts.push(polar(r, a1 + twist * t - halfAngle(w, r)));
  }
  pts.push(...arc(inner, a1 - halfAngle(widthHub, inner), a0 + halfAngle(widthHub, inner)).slice(1, -1));
  return smooth(pts);
}

function spokedWindows(count: number, widthHub: number, widthRing: number, twist = 0): THREE.Vector2[][] {
  const out: THREE.Vector2[][] = [];
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2 + Math.PI / 2;
    out.push(spokeWindow(a0, a0 + (Math.PI * 2) / count, widthHub, widthRing, twist));
  }
  return out;
}

/** Y-spokes: a stem from the hub that splits into two branches before the ring. */
function ySpokeWindows(count: number): THREE.Vector2[][] {
  const out: THREE.Vector2[][] = [];
  const split = 0.56;
  const stemW = 0.15;
  const branchW = 0.085;
  const spread = 0.2; // branch angle either side of the stem, at the ring
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / 2;
    const b = a + (Math.PI * 2) / count;
    // Large window between Y a and Y b
    const big: THREE.Vector2[] = [];
    big.push(polar(HUB, a + halfAngle(stemW, HUB)));
    big.push(polar(split, a + halfAngle(stemW, split)));
    big.push(...arc(RING, a + spread + halfAngle(branchW, RING), b - spread - halfAngle(branchW, RING)));
    big.push(polar(split, b - halfAngle(stemW, split)));
    big.push(...arc(HUB, b - halfAngle(stemW, HUB), a + halfAngle(stemW, HUB), 10).slice(0, -1));
    out.push(smooth(big));
    // Small window inside each Y, between its branches
    const small: THREE.Vector2[] = [];
    small.push(polar(split + 0.1, a));
    small.push(...arc(RING, a + spread - halfAngle(branchW, RING), a - spread + halfAngle(branchW, RING), 8));
    out.push(smooth(small));
  }
  return out;
}

function circle(cx: number, cy: number, r: number, steps = 20): THREE.Path {
  const p = new THREE.Path();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < steps; i++) pts.push(new THREE.Vector2(cx + Math.cos((i / steps) * Math.PI * 2) * r, cy + Math.sin((i / steps) * Math.PI * 2) * r));
  p.setFromPoints(pts);
  return p;
}

/** Unit-radius face outline for a procedural design. `mirror` flips directional designs for the left side. */
export function proceduralRimShapes(wheel: Pick<WheelDesign, 'spokeType' | 'spokeCount'>, mirror = false): THREE.Shape[] {
  let windows: THREE.Vector2[][];
  switch (wheel.spokeType) {
    case 'multi':
      windows = spokedWindows(Math.max(5, wheel.spokeCount || 9), 0.13, 0.075);
      break;
    case 'mesh':
      windows = spokedWindows(Math.max(8, wheel.spokeCount || 15), 0.085, 0.05);
      break;
    case 'y_spoke':
      windows = ySpokeWindows(5);
      break;
    case 'directional':
      windows = spokedWindows(Math.max(6, wheel.spokeCount || 10), 0.11, 0.07, mirror ? -0.42 : 0.42);
      break;
    case 'aerodisc':
      windows = spokedWindows(12, 0.07, 0.06, mirror ? -0.28 : 0.28);
      break;
    case 'clubsport':
      windows = spokedWindows(5, 0.3, 0.2);
      break;
    default:
      windows = spokedWindows(10, 0.12, 0.07);
  }

  const face = new THREE.Shape();
  face.absarc(0, 0, 1, 0, Math.PI * 2, false);
  face.holes.push(...windows.map((w) => new THREE.Path(w.map((p) => p.clone()).reverse())));
  face.holes.push(circle(0, 0, BORE, 32));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2; // lines up with the engine's lug bolts
    face.holes.push(circle(Math.cos(a) * LUG_R, Math.sin(a) * LUG_R, 0.045, 14));
  }
  return [face];
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { traceMaskShapes } from './rimExtrusion';
import { FACE_FRACTION, RimFaceMask, SPOKE_BEVEL, buildSpokeFace, rimLayout } from './wheelKit';

/**
 * Spoke mask -> 3D spoke faces, the second half of turning a rim photo into spokes (the first is
 * wheelKit's processRimPhoto). DOM-free, so it runs in rimFaceWorker.ts as well as on the page,
 * and the geometry crosses back as transferable typed arrays (serializeGeometry).
 */

export interface RimFaceGeometries {
  front: THREE.BufferGeometry;
  rear: THREE.BufferGeometry;
}

/** The mask's outlines as shapes on a unit disc (1 = the spoke ends); null if it has none. */
export function traceRimFaceShapes(mask: RimFaceMask): THREE.Shape[] | null {
  // outlines smoothed along their length (6 px) with the corners kept, then simplified to
  // 2 px: straight spoke edges come out as straight lines
  const raw = traceMaskShapes(mask.data, mask.size, mask.size, 0.5, 2.0, 6);
  if (!raw) return null;
  // traced radius 1 = mask edge; rescale so 1 = the spoke ends
  const k = 1 / FACE_FRACTION;
  return raw.map((sh) => {
    const out = new THREE.Shape(sh.getPoints().map((pt) => pt.multiplyScalar(k)));
    // Specks in the cut-out (about 35 mm²) would show as pin-holes in the spokes; the
    // smallest real window is about 25 times larger.
    out.holes = sh.holes
      .map((h) => h.getPoints().map((pt) => pt.multiplyScalar(k)))
      .filter((pts) => Math.abs(THREE.ShapeUtils.area(pts)) > 0.003)
      .map((pts) => new THREE.Path(pts));
    return out;
  });
}

/** The front or rear wheels' spoke face (they differ in dish), built for a 20" rim. */
export function buildRimFace(shapes: THREE.Shape[], isFront: boolean): THREE.BufferGeometry {
  const L = rimLayout({ tyreRadius: 0.35, tyreWidth: isFront ? 0.265 : 0.295, rimScale: 1, isFront });
  return buildSpokeFace(shapes, { radius: L.faceRadius, depth: L.spokeDepth, dish: L.dish, bevel: SPOKE_BEVEL });
}

// ---------------------------------------------------------------------------
// Geometry across a worker boundary
// ---------------------------------------------------------------------------

type TypedArray = Float32Array | Uint32Array | Uint16Array | Int32Array | Int16Array | Uint8Array | Int8Array;

export interface GeometryData {
  attributes: Record<string, { array: TypedArray; itemSize: number; normalized: boolean }>;
  index: Uint32Array | Uint16Array | null;
  groups: { start: number; count: number; materialIndex?: number }[];
  /** Bounding sphere: centre x, y, z and radius (null when it was never computed). */
  sphere: [number, number, number, number] | null;
}

/** Plain typed arrays of a geometry, plus the buffers to transfer (the geometry gives them up). */
export function serializeGeometry(geo: THREE.BufferGeometry): { data: GeometryData; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  const attributes: GeometryData['attributes'] = {};
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const array = a.array as TypedArray;
    attributes[name] = { array, itemSize: a.itemSize, normalized: a.normalized };
    if (!transfer.includes(array.buffer as ArrayBuffer)) transfer.push(array.buffer as ArrayBuffer);
  }
  const index = geo.index ? (geo.index.array as Uint32Array | Uint16Array) : null;
  if (index && !transfer.includes(index.buffer as ArrayBuffer)) transfer.push(index.buffer as ArrayBuffer);
  const s = geo.boundingSphere;
  return {
    data: {
      attributes,
      index,
      groups: geo.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex })),
      sphere: s ? [s.center.x, s.center.y, s.center.z, s.radius] : null
    },
    transfer
  };
}

export function deserializeGeometry(d: GeometryData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(d.attributes)) geo.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  if (d.index) geo.setIndex(new THREE.BufferAttribute(d.index, 1));
  d.groups.forEach((g) => geo.addGroup(g.start, g.count, g.materialIndex));
  if (d.sphere) geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(d.sphere[0], d.sphere[1], d.sphere[2]), d.sphere[3]);
  return geo;
}

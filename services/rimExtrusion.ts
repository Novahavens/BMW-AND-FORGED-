/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Turns a front-on rim PNG (transparent background and spoke gaps) into solid 3D spokes:
 * the opaque area is traced into outlines (marching squares), extruded with a bevel,
 * dished towards the hub, and textured with the photo itself.
 */

type Loop = number[]; // flat [x0, y0, x1, y1, ...] in image pixels

const MAX_RES = 512;

/** Traces iso-contours of `mask` at `threshold` into closed loops (image pixel coordinates). */
function traceLoops(mask: Float32Array, w: number, h: number, threshold: number): Loop[] {
  // Pad with an empty border so every contour closes.
  const W = w + 2;
  const H = h + 2;
  const v = new Float32Array(W * H);
  for (let y = 0; y < h; y++) v.set(mask.subarray(y * w, y * w + w), (y + 1) * W + 1);

  // Edge ids: horizontal edge (i,j)->(i+1,j) = 2*(j*W+i); vertical edge (i,j)->(i,j+1) = 2*(j*W+i)+1
  const edgeCount = W * H * 2;
  const link = new Int32Array(edgeCount * 2).fill(-1);
  const px = new Float32Array(edgeCount);
  const py = new Float32Array(edgeCount);

  const at = (i: number, j: number) => v[j * W + i];
  const hEdge = (i: number, j: number) => {
    const id = 2 * (j * W + i);
    const a = at(i, j), b = at(i + 1, j);
    px[id] = i + (threshold - a) / (b - a || 1e-6);
    py[id] = j;
    return id;
  };
  const vEdge = (i: number, j: number) => {
    const id = 2 * (j * W + i) + 1;
    const a = at(i, j), b = at(i, j + 1);
    px[id] = i;
    py[id] = j + (threshold - a) / (b - a || 1e-6);
    return id;
  };
  const connect = (e1: number, e2: number) => {
    link[e1 * 2 + (link[e1 * 2] === -1 ? 0 : 1)] = e2;
    link[e2 * 2 + (link[e2 * 2] === -1 ? 0 : 1)] = e1;
  };

  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const c =
        (at(i, j) > threshold ? 8 : 0) |
        (at(i + 1, j) > threshold ? 4 : 0) |
        (at(i + 1, j + 1) > threshold ? 2 : 0) |
        (at(i, j + 1) > threshold ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = () => hEdge(i, j);
      const B = () => hEdge(i, j + 1);
      const L = () => vEdge(i, j);
      const R = () => vEdge(i + 1, j);
      switch (c) {
        case 1: case 14: connect(L(), B()); break;
        case 2: case 13: connect(B(), R()); break;
        case 3: case 12: connect(L(), R()); break;
        case 4: case 11: connect(T(), R()); break;
        case 6: case 9: connect(T(), B()); break;
        case 7: case 8: connect(L(), T()); break;
        case 5: connect(L(), T()); connect(B(), R()); break;
        case 10: connect(T(), R()); connect(L(), B()); break;
      }
    }
  }

  const visited = new Uint8Array(edgeCount);
  const loops: Loop[] = [];
  for (let start = 0; start < edgeCount; start++) {
    if (visited[start] || link[start * 2] === -1) continue;
    const loop: Loop = [];
    let prev = -1;
    let cur = start;
    while (cur !== -1 && !visited[cur]) {
      visited[cur] = 1;
      loop.push(px[cur] - 0.5, py[cur] - 0.5); // padded grid index -> continuous image coords
      const n0 = link[cur * 2];
      const n1 = link[cur * 2 + 1];
      const next = n0 !== prev ? n0 : n1;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 8) loops.push(loop);
  }
  return loops;
}

/** Douglas–Peucker on a closed loop. */
function simplify(loop: Loop, tolerance: number): Loop {
  const n = loop.length / 2;
  if (n < 8) return loop;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = loop[a * 2], ay = loop[a * 2 + 1];
    const dx = loop[b * 2] - ax, dy = loop[b * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let maxD = 0, idx = -1;
    for (let k = a + 1; k < b; k++) {
      const qx = loop[k * 2] - ax, qy = loop[k * 2 + 1] - ay;
      const cross = qx * dy - qy * dx;
      const d2 = (cross * cross) / len2;
      if (d2 > maxD) { maxD = d2; idx = k; }
    }
    if (idx !== -1 && maxD > t2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: Loop = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(loop[k * 2], loop[k * 2 + 1]);
  return out;
}

const signedArea = (l: Loop) => {
  let s = 0;
  for (let i = 0, n = l.length; i < n; i += 2) {
    const j = (i + 2) % n;
    s += l[i] * l[j + 1] - l[j] * l[i + 1];
  }
  return s / 2;
};

const contains = (l: Loop, x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = l.length - 2; i < l.length; j = i, i += 2) {
    const xi = l[i], yi = l[i + 1], xj = l[j], yj = l[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * Reads the image's alpha and returns rim outlines in rim-plane units (radius = 1),
 * or null when the image has no usable transparency (it is then shown as a flat disc).
 */
export function traceRimShapes(image: CanvasImageSource & { width: number; height: number }, threshold = 0.5): THREE.Shape[] | null {
  const scale = Math.min(1, MAX_RES / Math.max(image.width, image.height));
  const w = Math.max(8, Math.round(image.width * scale));
  const h = Math.max(8, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h); // throws on a tainted (non-CORS) image

  const mask = new Float32Array(w * h);
  let transparentInside = 0, insideCount = 0;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3] / 255;
      mask[y * w + x] = a;
      if ((x - cx) ** 2 + (y - cy) ** 2 < (r * 0.92) ** 2) {
        insideCount++;
        if (a < threshold) transparentInside++;
      }
    }
  }
  // Nothing see-through between the spokes: not a cut-out image.
  if (insideCount === 0 || transparentInside / insideCount < 0.02) return null;

  const minArea = (w * h) * 0.00008;
  const loops = traceLoops(mask, w, h, threshold)
    .map((l) => simplify(l, 0.6))
    .map((l) => ({ l, area: Math.abs(signedArea(l)) }))
    .filter(({ area, l }) => area > minArea && l.length >= 6)
    .sort((a, b) => b.area - a.area);
  if (loops.length === 0) return null;

  // Nesting: even depth = solid outline, odd depth = hole in its parent.
  const half = Math.max(w, h) / 2;
  const toPath = (l: Loop) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < l.length; i += 2) pts.push(new THREE.Vector2((l[i] - w / 2) / half, -(l[i + 1] - h / 2) / half));
    return pts;
  };
  const nodes: { l: Loop; area: number; depth: number; shape?: THREE.Shape; parent?: number }[] = [];
  loops.forEach(({ l, area }) => {
    let parent = -1;
    for (let k = nodes.length - 1; k >= 0; k--) {
      if (nodes[k].area > area && contains(nodes[k].l, l[0], l[1])) { parent = k; break; }
    }
    const depth = parent === -1 ? 0 : nodes[parent].depth + 1;
    const node: (typeof nodes)[number] = { l, area, depth, parent };
    if (depth % 2 === 0) node.shape = new THREE.Shape(toPath(l));
    else nodes[parent].shape!.holes.push(new THREE.Path(toPath(l)));
    nodes.push(node);
  });
  return nodes.filter((n) => n.shape).map((n) => n.shape!);
}

/**
 * Solid rim face: extruded along +Z (front face at z = 0), dished so the hub sits `dish` deeper
 * than the rim edge, then turned so the front faces +X (the wheel's outward axis).
 */
export function buildRimFaceGeometry(shapes: THREE.Shape[], opts: { radius: number; depth: number; dish: number }): THREE.BufferGeometry {
  const { radius, depth, dish } = opts;
  const scaled = shapes.map((s) => {
    const shape = new THREE.Shape(s.getPoints().map((p) => p.clone().multiplyScalar(radius)));
    shape.holes = s.holes.map((hole) => new THREE.Path(hole.getPoints().map((p) => p.clone().multiplyScalar(radius))));
    return shape;
  });

  // Photo UVs from the face-plane position, so the front, back and walls all sample the image
  const uvAt = (vertices: ArrayLike<number>, i: number) =>
    new THREE.Vector2(vertices[i * 3] / (2 * radius) + 0.5, vertices[i * 3 + 1] / (2 * radius) + 0.5);
  const UVGenerator = {
    generateTopUV: (_g: unknown, v: ArrayLike<number>, a: number, b: number, c: number) => [uvAt(v, a), uvAt(v, b), uvAt(v, c)],
    generateSideWallUV: (_g: unknown, v: ArrayLike<number>, a: number, b: number, c: number, d: number) =>
      [uvAt(v, a), uvAt(v, b), uvAt(v, c), uvAt(v, d)]
  };

  const bevel = Math.min(0.0025, depth * 0.15);
  const geo = new THREE.ExtrudeGeometry(scaled, {
    depth,
    curveSegments: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    UVGenerator: UVGenerator as unknown as THREE.UVGenerator
  });

  // Front at z = 0, then dish: z drops linearly towards the hub
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.min(1, Math.hypot(x, y) / radius);
    pos.setZ(i, pos.getZ(i) - depth - bevel - dish * (1 - r));
  }
  pos.needsUpdate = true;
  geo.rotateY(Math.PI / 2); // (x, y, z) -> (z, y, -x): front faces +X, image right stays on screen-right
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { PaintColor } from '../types';

/**
 * The studio of the four-car viewer (car_viewer_web/index.html, the "vehicle spec viewer"), ported as
 * the engine's 'viewer' look: a gradient dome behind the car, a floor that fogs into the
 * dome's horizon, a soft pool of shadow around the footprint, and two reflection coves built from
 * feathered light panels. Glossy paints get the dark "gloss cove" (overhead softbox, two crisp rails
 * along the car, a ring of wrap panels, low kickers); Frozen paints get the soft grey cove.
 * Numbers are the viewer's, verbatim.
 *
 * The configurator screen no longer shows this look. It shows the stage look (STAGE, further down), which
 * reuses the shadow pool, the soft cove and the paint finish table from here. The viewer look is kept for
 * comparison (?look=viewer in the render harness).
 */

/** Soft-edged light panel: real softboxes fall off at the edges, which gives natural highlight edges on paint. */
function softboxTexture(feather = 0.22): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = Math.abs(x / 63.5 - 1), v = Math.abs(y / 63.5 - 1);
      const e = Math.min(1, (1 - Math.max(u, v)) / feather); // feathered border (wide = soft wraps, tight = crisp strips)
      const k = Math.pow(Math.max(0, e), 1.6) * (0.85 + 0.15 * (1 - v)); // slight hot-spot
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gradientTexture(stops: [number, string][], w = 4, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([t, col]) => gr.addColorStop(t, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const H = Math.PI / 2;

/** Soft cove (satin and Frozen paints): a dark room lit by one very large overhead softbox plus weak, wide side wraps. */
export const SOFT_COVE = { wallTop: '#333333', wallMid: '#969696', wallBot: '#0f0f0f', overhead: 11.06, side: 0.194, sideLow: 6.56, rear: 1.0, front: 0.074, floor: 0.101, floorColor: 0x404040, exposure: 1.0 };
/** Gloss cove (solid, metallic, pearl): a near-black cove with defined softboxes, so a clear coat has something to mirror. */
export const GLOSS_COVE = { ceil: '#050505', wall: '#101010', horizon: '#3c3c3c', floorC: '#0a0a0a', overhead: 8.0, rails: 6.0, ring: 7.0, kicker: 2.5, exposure: 1.0, floorGain: 2.5, glass: 0.3, glassRough: 0.2, whiteComp: 0.22 };

export function buildSoftCove(): THREE.Scene {
  const soft = softboxTexture();
  const env = new THREE.Scene();
  const wall = gradientTexture([[0, SOFT_COVE.wallTop], [0.5, SOFT_COVE.wallMid], [1, SOFT_COVE.wallBot]]);
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.MeshBasicMaterial({ map: wall, side: THREE.BackSide })));
  const panel = (w: number, h: number, pos: [number, number, number], k: number, rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: soft, color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
  };
  panel(12, 24, [0, 11, 0], SOFT_COVE.overhead, [H, 0, 0]); // huge overhead softbox
  panel(3.0, 22, [12, 3.2, 0], SOFT_COVE.side, [0, H, H]); // side wrap, camera side
  panel(3.0, 22, [-12, 3.2, 0], SOFT_COVE.side, [0, H, H]); // side wrap, far side
  panel(22, 2.4, [12, 0.9, 0], SOFT_COVE.sideLow, [0, H, 0]); // low side strips at door height
  panel(22, 2.4, [-12, 0.9, 0], SOFT_COVE.sideLow, [0, H, 0]);
  panel(14, 4, [0, 2.0, -15], SOFT_COVE.rear, [0, 0, 0]); // rear kicker
  panel(10, 5, [0, 3.0, 14], SOFT_COVE.front, [0, 0, 0]); // front fill
  panel(60, 60, [0, -0.3, 0], SOFT_COVE.floor, [H, 0, 0]); // floor bounce
  return env;
}

export function buildGlossCove(): THREE.Scene {
  const wide = softboxTexture(0.34), tight = softboxTexture(0.07);
  const env = new THREE.Scene();
  const wall = gradientTexture([[0, GLOSS_COVE.ceil], [0.4, GLOSS_COVE.wall], [0.485, GLOSS_COVE.horizon], [0.505, GLOSS_COVE.floorC], [1, GLOSS_COVE.floorC]]);
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.MeshBasicMaterial({ map: wall, side: THREE.BackSide })));
  const box = (w: number, h: number, pos: [number, number, number], k: number, tex: THREE.Texture, rot?: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    else m.lookAt(0, pos[1], 0);
    env.add(m);
    return m;
  };
  box(9, 20, [0, 11, 0], GLOSS_COVE.overhead, wide, [H, 0, 0]); // main overhead softbox
  box(1.1, 20, [-3.6, 10.2, 0], GLOSS_COVE.rails, tight, [H, 0, 0]); // two crisp light rails along the car:
  box(1.1, 20, [3.6, 10.2, 0], GLOSS_COVE.rails, tight, [H, 0, 0]); // the long lines on bonnet, roof and boot
  for (let i = 0; i < 6; i++) {
    // ring of tall wrap panels, dark gaps between
    const a = THREE.MathUtils.degToRad(30 + i * 60), R = 10.5;
    box(3.6, 2.8, [Math.sin(a) * R, 1.9, Math.cos(a) * R], GLOSS_COVE.ring, wide);
  }
  box(16, 1.1, [0, 0.45, -14], GLOSS_COVE.kicker, tight, [0, 0, 0]); // low rear strip: sills and rear bumper edge
  box(16, 1.1, [0, 0.45, 14], GLOSS_COVE.kicker, tight, [0, 0, 0]); // and the front splitter
  return env;
}

/**
 * Stage look: the Cycles hero stills (public/hero/*, the welcome carousel), which the owner asked every scene to
 * match. A black backdrop, a pale studio floor lit by a pool of light that fades out, and a black cove with one
 * large overhead softbox for the paint to mirror (the white sweep over bonnet and roof in the stills). The numbers
 * can be overridden from the URL for comparison renders: ?stagePeak= ?stageRx= ?stageRz= ?stageOver= ?stageRails=
 * ?stageRing= ?stageFloorEnv= ?stageExp= ?stageParts=
 */
const urlNum = (key: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback;
  const raw = new URLSearchParams(window.location.search).get(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};
// Chosen against public/hero/m2_g87-1600.webp (M2 CS, Portimao Blue, front three-quarter), Nov 2026. A ring above
// about 2 lit the body evenly and flattened it; the stills' contrast is one overhead key over a black room.
// Overhead 12, 18 and 32 look the same from the front three-quarter; from above, 18 and 32 wash the bonnet and
// roof paint out to pale blue, so the key stays at 12.
export const STAGE = {
  /** Floor brightness at the centre of the pool, as an sRGB level (0..1). */
  peak: urlNum('stagePeak', 0.97),
  /** Pool spread across the car and along it (m): the Gaussian's sigma on each axis. */
  rx: urlNum('stageRx', 2.2),
  rz: urlNum('stageRz', 3.4),
  /** Overhead softbox, the two light rails, and the wrap ring in the reflection cove. */
  overhead: urlNum('stageOver', 12),
  rails: urlNum('stageRails', 6),
  ring: urlNum('stageRing', 1),
  /** The lit floor as the paint sees it in the cove (sills and lower doors pick it up). */
  floorEnv: urlNum('stageFloorEnv', 0.5),
  exposure: urlNum('stageExp', 1.2),
  /**
   * How much of the cove the non-paint parts mirror (glass, carbon, chrome, trim, lamps). Paint needs the strong
   * overhead key to read; a mirror-like part shows the same box at full strength and clips to white (the M2 CS's
   * windscreen and carbon roof, seen from above). 0.35 of the key leaves the carbon roof a grey, as in the stills.
   */
  parts: urlNum('stageParts', 0.35),
  /** Floor plane size (m); the pool has faded out well before its edge. */
  size: 40
};

/** The stage floor's pool of light: brightness in the colour channels, the fade-out in alpha. */
export function stageFloorTexture(): THREE.CanvasTexture {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * STAGE.size, z = (j / (N - 1) - 0.5) * STAGE.size;
      const r2 = (x / STAGE.rx) ** 2 + (z / STAGE.rz) ** 2;
      const k = Math.exp(-0.5 * r2); // 1 under the car, fading out across the floor
      const q = (j * N + i) * 4;
      img.data[q] = img.data[q + 1] = img.data[q + 2] = 255 * STAGE.peak;
      img.data[q + 3] = 255 * k;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The stage floor: unlit, so its brightness is the stills' whatever the paint's exposure, and transparent where the
 * pool fades, so it melts into the black backdrop behind it (the stage dome, which the engine always shows with it).
 */
export function buildStageFloor(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE.size, STAGE.size),
    new THREE.MeshBasicMaterial({ map: stageFloorTexture(), transparent: true, depthWrite: false, toneMapped: false, fog: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 0; // under the shadow pool (renderOrder 1) and the car
  floor.name = 'stageFloor';
  return floor;
}

/** The stage backdrop: black, untouched by tone mapping or fog. */
export function buildStageDome(): THREE.Mesh {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(70, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = 'stageDome';
  return dome;
}

/**
 * The stage's reflection cove for glossy paints: black walls, one big overhead softbox with the gloss cove's two
 * light rails, a faint wrap ring, and a lit floor below, as in the stills' studio.
 */
export function buildStageCove(): THREE.Scene {
  const wide = softboxTexture(0.34), tight = softboxTexture(0.07);
  const env = new THREE.Scene();
  const f = Math.round(255 * STAGE.floorEnv).toString(16).padStart(2, '0');
  const wall = gradientTexture([[0, '#000000'], [0.44, '#020202'], [0.495, '#0c0c0c'], [0.51, `#${f}${f}${f}`], [0.62, `#${f}${f}${f}`], [1, '#000000']]);
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.MeshBasicMaterial({ map: wall, side: THREE.BackSide })));
  const box = (w: number, h: number, pos: [number, number, number], k: number, tex: THREE.Texture, rot?: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    else m.lookAt(0, pos[1], 0);
    env.add(m);
  };
  box(11, 22, [0, 11, 0], STAGE.overhead, wide, [H, 0, 0]); // the big overhead softbox
  box(1.1, 20, [-3.6, 10.2, 0], STAGE.rails, tight, [H, 0, 0]); // the crisp lines along bonnet, roof and boot
  box(1.1, 20, [3.6, 10.2, 0], STAGE.rails, tight, [H, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = THREE.MathUtils.degToRad(30 + i * 60), R = 10.5;
    box(3.6, 2.8, [Math.sin(a) * R, 1.9, Math.cos(a) * R], STAGE.ring, wide);
  }
  return env;
}

/** Frees a cove scene once its PMREM has been taken. */
export function disposeCove(env: THREE.Scene) {
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.MeshBasicMaterial | undefined;
    mat?.map?.dispose();
    mat?.dispose();
  });
}

/** The backdrop's horizon colour; the floor fogs into it, so the two never show a seam. */
export const DOME_HORIZON = 0x707070;

/** Backdrop: a gradient dome rendered without tone mapping or fog, so it stays the same whatever the paint's exposure. */
export function buildDome(): THREE.Mesh {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(70, 32, 16),
    new THREE.MeshBasicMaterial({
      map: gradientTexture([[0, '#323232'], [0.3, '#353535'], [0.4, '#383838'], [0.47, '#454545'], [0.49, '#5c5c5c'], [0.5, '#707070'], [1, '#707070']]),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = 'viewerDome';
  return dome;
}

/** Polished dark floor that shows a soft reflection of the car; the engine's fog melts it into the dome. */
export function buildFloor(): THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial> {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c5c5c, roughness: 0.7, metalness: 0, envMapIntensity: 0.5 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'viewerFloor';
  return floor;
}

/** The floor colour for a cove: the gloss cove is darker, so the floor is lifted to still melt into the backdrop. */
export function floorColorFor(gloss: boolean, exposure: number): THREE.Color {
  return gloss ? new THREE.Color().setScalar((0.0513 * GLOSS_COVE.floorGain) / exposure) : new THREE.Color(SOFT_COVE.floorColor);
}

/**
 * Soft pool of shadow around the whole car: a studio floor under one big overhead softbox goes dark all
 * around the footprint, not just under the tyres. A broad pool plus a tighter, darker core hugging the
 * footprint (halfL, halfW in metres, measured from the car's bounding box).
 */
export function poolTexture(halfL: number, halfW: number): THREE.CanvasTexture {
  const P = { sigma: 0.66, strength: 0.063, coreSigma: 0.611, coreStrength: 1.0, coreInset: 0.729, size: POOL_SIZE };
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * P.size, z = (j / (N - 1) - 0.5) * P.size;
      const dx = Math.max(0, Math.abs(x) - halfW), dz = Math.max(0, Math.abs(z) - halfL), d = Math.hypot(dx, dz); // distance outside the footprint
      const k = Math.exp(-(d * d) / (2 * P.sigma * P.sigma)), q = (j * N + i) * 4;
      const ex = Math.max(0, Math.abs(x) - (halfW - P.coreInset)), ez = Math.max(0, Math.abs(z) - (halfL - P.coreInset)), e = Math.hypot(ex, ez);
      const k2 = Math.exp(-(e * e) / (2 * P.coreSigma * P.coreSigma));
      const a = 1 - (1 - P.strength * k) * (1 - P.coreStrength * k2); // two shadow layers combined
      img.data[q] = img.data[q + 1] = img.data[q + 2] = 255 * a;
      img.data[q + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
export const POOL_SIZE = 16;

export function buildPool(halfL = 2.4, halfW = 1.32): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(POOL_SIZE, POOL_SIZE), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: poolTexture(halfL, halfW), transparent: true, depthWrite: false, opacity: 1, fog: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.001;
  pool.renderOrder = 1;
  pool.name = 'viewerPool';
  return pool;
}

/**
 * The viewer's paint finish table (paints.js FINISH) by the catalogue's paint type: aluminium flakes in a tinted base
 * under a glossy clear coat for Metallic, mica (iridescence) for Pearl, a matte coat for Frozen.
 */
export const VIEWER_FINISH: Record<PaintColor['type'], { metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number; iridescence: number; iridescenceIOR: number }> = {
  Uni: { metalness: 0.0, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.02, iridescence: 0, iridescenceIOR: 1.5 },
  Metallic: { metalness: 0.75, roughness: 0.34, clearcoat: 1.0, clearcoatRoughness: 0.03, iridescence: 0, iridescenceIOR: 1.5 },
  Pearl: { metalness: 0.45, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.03, iridescence: 0.5, iridescenceIOR: 1.6 },
  Frozen: { metalness: 0.55, roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.55, iridescence: 0, iridescenceIOR: 1.5 }
};

/** Everything but Frozen is a clear-coated gloss and gets the gloss cove. */
export const isGlossPaint = (paint: Pick<PaintColor, 'type'> | null | undefined) => !!paint && paint.type !== 'Frozen';

/** Light paints sit lower, so panel shading does not clip to white (the viewer's studioExposure). */
export function studioExposure(paint: PaintColor | null | undefined): number {
  if (!isGlossPaint(paint)) return SOFT_COVE.exposure;
  const c = new THREE.Color(paint!.hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear luminance of the paint
  return GLOSS_COVE.exposure * (1 - GLOSS_COVE.whiteComp * THREE.MathUtils.smoothstep(lum, 0.2, 0.8));
}

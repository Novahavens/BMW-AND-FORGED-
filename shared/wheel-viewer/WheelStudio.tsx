import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  BRAKE_PARTS,
  FINISH_PARTS,
  cameraDistanceScale,
  classifyStudioPart,
  explodeOffsets,
  prefersReducedMotion,
  type StudioPart,
} from './wheelStudioParts';
import { NEUTRAL_FINISH, defaultPaintRenderer, type PaintRenderer, type StudioFinish } from './paint';
import './wheel-viewer.css';

/**
 * The FORGED 3D wheel viewer, shared by the website and the BMW configurator.
 *
 * ONE SOURCE: this folder is edited in the website repo (src/wheel-viewer/) and copied, unchanged, into
 * the configurator (shared/wheel-viewer/) by scripts/wheel-viewer-sync.mjs. Do not edit the copy; see
 * README.md in this folder.
 *
 * A light product-photography stage: studio reflections built in code (no HDR download), a soft contact
 * shadow, physically based paint, fixed camera views, an exploded view, and a Front / Rear switch for
 * wheels with a second model. It knows nothing about either app's catalogue: finishes arrive as
 * `StudioFinish` rows and the paint is made by a `PaintRenderer` (see paint.ts).
 *
 * The default (simple) stage is for customers: views, Front / Rear, the exploded view and an optional
 * Close 3D button. `advanced` adds the wireframe, bolts, cap and brake-check toggles.
 *
 * Rim files may be meshopt-compressed, quantized or Draco-compressed, in metres or in other units, and
 * stand on any axis: the loader carries the decoders and the rig stands the wheel up and sizes it.
 */

export type StudioViewId = 'face' | 'three' | 'side' | 'back' | 'top';

export interface StudioToggles {
  orbit: boolean;
  spin: boolean;
  explode: boolean;
  wire: boolean;
  bolts: boolean;
  cap: boolean;
  brakes: boolean;
}

export const DEFAULT_STUDIO_TOGGLES: StudioToggles = {
  orbit: true,
  spin: false,
  explode: false,
  wire: false,
  bolts: true,
  cap: true,
  brakes: false,
};

export interface WheelStudioProps {
  wheelModel: string;
  /** Shown under the name on the advanced stage only. */
  wheelSeries?: string;
  /**
   * The paint choices offered. Fewer than two shows no finish row, which is how a page keeps the stage
   * to the one finish that is actually in stock.
   */
  finishes: StudioFinish[];
  selectedFinish?: StudioFinish;
  onSelectFinish: (finish: StudioFinish) => void;
  /** Served path to the wheel's .glb, e.g. "/models/wheels/stf399-front.glb". */
  modelUrl: string;
  /** Optional second model for the rear axle of a staggered set. */
  rearModelUrl?: string | null;
  /** Only read when the file does not say which side is the face (unnamed meshes). */
  modelFlip?: boolean;
  /** One-line spec shown in the badge on the advanced stage, e.g. "19 × 9.5 · ET 17 · 5×112". */
  specFront?: string;
  specRear?: string;
  initialView?: StudioViewId;
  initialToggles?: Partial<StudioToggles>;
  /** Shows a visible "Close 3D" button (and closes on Escape) when given. */
  onClose?: () => void;
  /** Shows an accent "Enquire" button beside the Front / Rear switch when given. */
  onEnquire?: () => void;
  /** Adds the wireframe, bolts, cap and brake toggles (the exploded view is on both stages). */
  advanced?: boolean;
  /**
   * Makes the paint. Pass a module-level constant: it is read once, when the stage is created.
   * Defaults to plain physically based paint.
   */
  paint?: PaintRenderer;
  /** Where the Draco decoder files are served. Only fetched if a model is Draco-compressed. */
  dracoDecoderPath?: string;
  /** Sizing and theme classes for the stage (the --wv-* variables in wheel-viewer.css). */
  className?: string;
}

interface LoadedModelInfo {
  /** Null when the file is not in metres (it was resized to fit, so its size says nothing). */
  diameterMm: number | null;
  widthMm: number | null;
  hasBrakes: boolean;
  hasBolts: boolean;
  hasCap: boolean;
  /** At least two kinds of part: with one, the exploded view would only move the wheel. */
  canExplode: boolean;
}

interface StudioEngine {
  load: (url: string, flip: boolean) => void;
  setFinish: (finish: StudioFinish) => void;
  setToggles: (toggles: StudioToggles) => void;
  goView: (view: StudioViewId, instant?: boolean) => void;
  /** Height in CSS pixels of the control panel covering the bottom of the stage. */
  setBottomInset: (px: number) => void;
  dispose: () => void;
}

interface EngineCallbacks {
  onLoaded: (info: LoadedModelInfo) => void;
  onError: (message: string) => void;
  onUserDrag: () => void;
}

interface EngineOptions {
  ariaLabel: string;
  paint: PaintRenderer;
  dracoDecoderPath: string;
}

const VIEWS: { id: StudioViewId; label: string }[] = [
  { id: 'face', label: 'Face' },
  { id: 'three', label: '3/4' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'top', label: 'Top' },
];

const TOGGLE_LABELS: { id: keyof StudioToggles; label: string }[] = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'spin', label: 'Spin wheel' },
  { id: 'explode', label: 'Exploded' },
  { id: 'wire', label: 'Wireframe' },
  { id: 'bolts', label: 'Bolts' },
  { id: 'cap', label: 'Cap' },
  { id: 'brakes', label: 'Brake check' },
];

/** A rim between these diameters is taken to be in metres (a 17" to 24" rim is 0.45 to 0.65 m across). */
const METRE_RANGE: [number, number] = [0.25, 1.2];
/** Diameter given to a file in other units: a 20" rim. */
const FALLBACK_DIAMETER = 0.52;

/** Studio reflections: a gradient dome with bright softboxes and dark flags, prefiltered once. */
function buildStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(50, 48, 24);
  const top = new THREE.Color(0.78, 0.82, 0.9);
  const horizon = new THREE.Color(0.3, 0.32, 0.35);
  const bottom = new THREE.Color(0.13, 0.13, 0.15);
  const tmp = new THREE.Color();
  const colours: number[] = [];
  const pos = dome.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) / 50) * 0.5 + 0.5;
    if (h > 0.5) tmp.copy(horizon).lerp(top, (h - 0.5) * 2);
    else tmp.copy(bottom).lerp(horizon, h * 2);
    colours.push(tmp.r, tmp.g, tmp.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const disposables: { dispose: () => void }[] = [dome];
  const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  disposables.push(domeMat);
  envScene.add(new THREE.Mesh(dome, domeMat));

  const addPanel = (w: number, h: number, at: [number, number, number], brightness: number) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(brightness, brightness, brightness),
      side: THREE.DoubleSide
    });
    disposables.push(geo, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at[0], at[1], at[2]);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };
  addPanel(40, 14, [0, 40, 8], 7); // overhead softbox
  addPanel(12, 34, [-38, 10, 6], 5); // left strip
  addPanel(12, 34, [38, 10, -8], 4); // right strip
  addPanel(46, 7, [0, 6, -42], 3); // back horizon strip
  addPanel(30, 6, [0, 5, 40], 2.2); // front fill
  // dark flags give mirror finishes something to contrast against
  addPanel(26, 30, [26, 4, 30], 0.01);
  addPanel(26, 30, [-28, 2, -26], 0.01);
  addPanel(60, 10, [0, -12, 0], 0.02);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return texture;
}

function createStudioEngine(mount: HTMLDivElement, callbacks: EngineCallbacks, options: EngineOptions): StudioEngine {
  const reduceMotion = prefersReducedMotion();
  const paint = options.paint;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  // Dragging the picture must not scroll the page. A page that mounts the viewer only on request (the
  // website's "View in 3D") keeps this safe; a page that always shows it should leave room to scroll past.
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', options.ariaLabel);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const envTexture = buildStudioEnvironment(renderer);
  scene.environment = envTexture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.35;
  controls.maxDistance = 4;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.enablePan = false;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 1.2;

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
  keyLight.position.set(1.2, 2.2, 1.0);
  keyLight.castShadow = true;
  const shadowSize = window.innerWidth < 768 ? 1024 : 2048; // lighter on phones
  keyLight.shadow.mapSize.set(shadowSize, shadowSize);
  keyLight.shadow.camera.left = -0.9;
  keyLight.shadow.camera.right = 0.9;
  keyLight.shadow.camera.top = 0.9;
  keyLight.shadow.camera.bottom = -0.9;
  keyLight.shadow.camera.near = 0.2;
  keyLight.shadow.camera.far = 6;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.radius = 6;
  scene.add(keyLight);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.4));

  const floorGeo = new THREE.PlaneGeometry(12, 12);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.28 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  let currentFinish: StudioFinish = NEUTRAL_FINISH;

  interface Rig {
    spinGroup: THREE.Group;
    staticGroup: THREE.Group;
    parts: Record<StudioPart, THREE.Mesh[]>;
    homes: Map<THREE.Mesh, THREE.Vector3>;
    /** Paint materials made for this rig. The barrel's are separate so the brake check can ghost it alone. */
    finishMaterials: { material: THREE.MeshPhysicalMaterial; part: StudioPart }[];
    ownMaterials: THREE.Material[];
    axis: THREE.Vector3;
    centre: THREE.Vector3;
    diameter: number;
  }

  // The same decoders as the car engine, so every rim file the car accepts opens here too.
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(options.dracoDecoderPath);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const modelCache = new Map<string, THREE.Group>();
  let rig: Rig | null = null;
  let loadToken = 0;
  let toggles: StudioToggles = { ...DEFAULT_STUDIO_TOGGLES };
  let currentView: StudioViewId = 'three';
  let explodeNow = 0;
  let tween: {
    start: number;
    duration: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;
  let disposed = false;
  let stageWidth = 1;
  let stageHeight = 1;
  let bottomInset = 0;
  /** Something changed that the next frame must draw. */
  let dirty = true;

  // Shift the picture up by half the covered height so the wheel sits in the visible area.
  const applyViewOffset = () => {
    const inset = Math.min(bottomInset, stageHeight * 0.6);
    if (inset > 0) camera.setViewOffset(stageWidth, stageHeight, 0, inset / 2, stageWidth, stageHeight);
    else camera.clearViewOffset();
  };

  const emptyParts = (): Record<StudioPart, THREE.Mesh[]> => ({
    barrel: [],
    face: [],
    bolts: [],
    cap: [],
    rotor: [],
    caliper: []
  });

  const removeRig = () => {
    if (!rig) return;
    scene.remove(rig.spinGroup);
    scene.remove(rig.staticGroup);
    rig.finishMaterials.forEach(({ material }) => material.dispose());
    rig = null;
    dirty = true;
  };

  const applyExplode = () => {
    if (!rig) return;
    const offsets = explodeOffsets(rig.diameter);
    (Object.keys(rig.parts) as StudioPart[]).forEach((part) => {
      for (const mesh of rig!.parts[part]) {
        const home = rig!.homes.get(mesh);
        if (home) mesh.position.copy(home).addScaledVector(rig!.axis, offsets[part] * explodeNow);
      }
    });
  };

  const applyToggles = () => {
    dirty = true;
    controls.autoRotate = toggles.orbit && !reduceMotion;
    if (!rig) return;
    rig.parts.bolts.forEach((m) => (m.visible = toggles.bolts));
    rig.parts.cap.forEach((m) => (m.visible = toggles.cap));
    BRAKE_PARTS.forEach((part) => rig!.parts[part].forEach((m) => (m.visible = toggles.brakes)));
    // Brake check: ghost the barrel so the caliper is visible against the spokes.
    const hasBrakes = rig.parts.rotor.length + rig.parts.caliper.length > 0;
    rig.finishMaterials.forEach(({ material, part }) => {
      const ghost = part === 'barrel' && toggles.brakes && hasBrakes;
      material.transparent = ghost;
      material.opacity = ghost ? 0.22 : 1;
      material.depthWrite = !ghost;
      material.wireframe = toggles.wire;
      material.needsUpdate = true;
    });
    rig.ownMaterials.forEach((m) => {
      if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = toggles.wire;
    });
  };

  const viewPose = (view: StudioViewId) => {
    const r = rig!;
    const visibleFraction = 1 - Math.min(bottomInset, stageHeight * 0.6) / stageHeight;
    const d = r.diameter * 2.75 * cameraDistanceScale(camera.aspect, visibleFraction);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(up, r.axis).normalize();
    if (side.lengthSq() < 0.5) side.set(1, 0, 0);
    const c = r.centre;
    const poses: Record<StudioViewId, THREE.Vector3> = {
      face: c.clone().addScaledVector(r.axis, d),
      back: c.clone().addScaledVector(r.axis, -d),
      side: c.clone().addScaledVector(side, d * 1.05).add(new THREE.Vector3(0, 0.02, 0)),
      three: c
        .clone()
        .addScaledVector(r.axis, d * 0.78)
        .addScaledVector(side, d * 0.62)
        .add(new THREE.Vector3(0, d * 0.1, 0)),
      top: c.clone().add(new THREE.Vector3(0, d * 1.05, 0)).addScaledVector(r.axis, d * 0.15)
    };
    return { pos: poses[view], target: c.clone().add(new THREE.Vector3(0, -0.01, 0)) };
  };

  const goView = (view: StudioViewId, instant = false) => {
    currentView = view;
    if (!rig) return;
    const pose = viewPose(view);
    dirty = true;
    if (instant || reduceMotion) {
      tween = null;
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      controls.update();
      return;
    }
    tween = {
      start: performance.now(),
      duration: 650,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: pose.pos,
      toTarget: pose.target
    };
  };

  const buildRig = (source: THREE.Group, flip: boolean) => {
    const root = source.clone(true);
    scene.add(root);
    root.updateMatrixWorld(true);

    const parts = emptyParts();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) parts[classifyStudioPart(mesh.name || mesh.parent?.name || '')].push(mesh);
    });

    const rimMeshes = parts.barrel.length ? parts.barrel : [...parts.face, ...parts.cap];
    const rimBox = new THREE.Box3();
    const measureRim = () => {
      root.updateMatrixWorld(true);
      rimBox.makeEmpty();
      rimMeshes.forEach((m) => rimBox.expandByObject(m));
      if (rimBox.isEmpty()) rimBox.setFromObject(root);
      return rimBox.getSize(new THREE.Vector3());
    };
    let size = measureRim();
    if (rimBox.isEmpty()) {
      scene.remove(root);
      throw new Error('the rim file has no geometry');
    }

    // The axle is the direction in which the rim is shortest. The rim files stand on +Y with the face
    // toward +Z; a file lying on another axis is turned to match, the way the engine reads it on the car.
    if (size.y < size.x && size.y < size.z) root.rotation.x = -Math.PI / 2;
    else if (size.x < size.y && size.x < size.z) root.rotation.y = -Math.PI / 2;
    size = measureRim();

    // Rim files are in metres. One in millimetres or centimetres (a CAD export) is sized like a 20"
    // rim, as on the car, and its measurements are not reported.
    const fileDiameter = Math.max(size.x, size.y);
    const inMetres = fileDiameter >= METRE_RANGE[0] && fileDiameter <= METRE_RANGE[1];
    if (!inMetres) {
      root.scale.multiplyScalar(FALLBACK_DIAMETER / (fileDiameter || 1));
      measureRim();
    }

    // Rest the rim on the floor, then measure it.
    root.position.y -= rimBox.min.y;
    size = measureRim();
    const centre = rimBox.getCenter(new THREE.Vector3());

    // Point the axle at the outboard side: where the cap (or the spoke face) sits. A file that does
    // not say (unnamed meshes) faces +Z, unless the catalogue's modelFlip turns it round.
    const axis = new THREE.Vector3(0, 0, 1);
    const outboard = parts.cap.length ? parts.cap : parts.face;
    const outboardBox = new THREE.Box3();
    outboard.forEach((m) => outboardBox.expandByObject(m));
    const lean = outboardBox.isEmpty() ? 0 : outboardBox.getCenter(new THREE.Vector3()).sub(centre).dot(axis);
    if (Math.abs(lean) > size.z * 0.02 ? lean < 0 : flip) axis.negate();

    const spinGroup = new THREE.Group();
    const staticGroup = new THREE.Group();
    spinGroup.position.copy(centre);
    staticGroup.position.copy(centre);
    scene.add(spinGroup, staticGroup);

    const homes = new Map<THREE.Mesh, THREE.Vector3>();
    const ownMaterials: THREE.Material[] = [];
    const finishMaterials: Rig['finishMaterials'] = [];
    const shared = new Map<string, THREE.MeshPhysicalMaterial>();
    const unit = new THREE.Vector3();
    (Object.keys(parts) as StudioPart[]).forEach((part) => {
      for (const mesh of parts[part]) {
        unit.setFromMatrixScale(mesh.matrixWorld);
        const unitScale = (unit.x + unit.y + unit.z) / 3;
        // The caliper is bolted to the car, so it must not turn with the wheel.
        (part === 'caliper' ? staticGroup : spinGroup).attach(mesh);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        homes.set(mesh, mesh.position.clone());
        if (FINISH_PARTS.includes(part)) {
          // One paint material per part, sidedness and unit (FSA001's barrel is an open, double-sided
          // shell); a mesh that brings its own texture or normal map keeps it on a copy.
          const old = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
          const side = old?.side ?? THREE.FrontSide;
          const group = part === 'barrel' ? 'barrel' : 'face';
          if (old?.map || old?.normalMap) {
            const material = paint.create(side, unitScale, currentFinish);
            material.map = old.map ?? null;
            material.normalMap = old.normalMap ?? null;
            finishMaterials.push({ material, part });
            mesh.material = material;
            continue;
          }
          const key = `${group}|${side}|${unitScale.toFixed(4)}`;
          let material = shared.get(key);
          if (!material) {
            material = paint.create(side, unitScale, currentFinish);
            shared.set(key, material);
            finishMaterials.push({ material, part });
          }
          mesh.material = material;
        } else {
          const own = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          own.forEach((m) => {
            if ('envMapIntensity' in m) (m as THREE.MeshStandardMaterial).envMapIntensity = 1;
            ownMaterials.push(m);
          });
        }
      }
    });
    scene.remove(root);

    removeRig();
    const diameter = Math.max(size.x, size.y);
    rig = { spinGroup, staticGroup, parts, homes, finishMaterials, ownMaterials, axis, centre, diameter };
    applyToggles();
    explodeNow = toggles.explode ? 1 : 0;
    applyExplode();
    goView(currentView, true);
    const kinds = (Object.keys(parts) as StudioPart[]).filter((p) => !BRAKE_PARTS.includes(p) && parts[p].length > 0).length;
    callbacks.onLoaded({
      diameterMm: inMetres ? Math.round(diameter * 1000) : null,
      widthMm: inMetres ? Math.round(size.z * 1000) : null,
      hasBrakes: parts.rotor.length + parts.caliper.length > 0,
      hasBolts: parts.bolts.length > 0,
      hasCap: parts.cap.length > 0,
      canExplode: kinds > 1
    });
  };

  const load = (url: string, flip: boolean) => {
    const token = ++loadToken;
    const cached = modelCache.get(url);
    const showModel = (model: THREE.Group) => {
      try {
        buildRig(model, flip);
      } catch (err) {
        console.error('WheelStudio: could not prepare model', url, err);
        callbacks.onError('This 3D model could not be displayed.');
      }
    };
    if (cached) {
      showModel(cached);
      return;
    }
    loader.load(
      url,
      (gltf) => {
        if (disposed || token !== loadToken) return; // a newer request superseded this one
        modelCache.set(url, gltf.scene);
        showModel(gltf.scene);
      },
      undefined,
      (err) => {
        if (disposed || token !== loadToken) return;
        console.error('WheelStudio: could not load model', url, err);
        callbacks.onError('The 3D model could not be loaded. Check your connection and try again.');
      }
    );
  };

  const resize = () => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    stageWidth = w;
    stageHeight = h;
    camera.aspect = w / h;
    applyViewOffset();
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  // Only draw while the stage is on screen and the tab is visible.
  let onScreen = true;
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      dirty = true;
    },
    { threshold: 0.01 }
  );
  visibilityObserver.observe(mount);
  const onVisibilityChange = () => {
    dirty = true;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const onPointerDown = () => {
    tween = null;
    callbacks.onUserDrag();
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  let last = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!onScreen || document.hidden) return;
    let moving = false;
    if (tween) {
      const k = Math.min(1, (now - tween.start) / tween.duration);
      const eased = k * k * (3 - 2 * k);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      if (k >= 1) tween = null;
      moving = true;
    }
    const explodeTarget = toggles.explode ? 1 : 0;
    if (Math.abs(explodeTarget - explodeNow) > 0.001) {
      explodeNow = reduceMotion ? explodeTarget : explodeNow + (explodeTarget - explodeNow) * Math.min(1, dt * 6);
      applyExplode();
      moving = true;
    }
    if (rig && toggles.spin) {
      rig.spinGroup.rotateOnWorldAxis(rig.axis, -dt * 1.6);
      moving = true;
    }
    // (with the frame time, so the orbit takes as long on a 120 Hz screen as on a 60 Hz one)
    if (controls.update(dt)) moving = true;
    // A still stage is not drawn again: the car's engine may be running under this page too.
    if (!moving && !dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);

  return {
    load,
    goView,
    setFinish: (finish) => {
      currentFinish = finish;
      rig?.finishMaterials.forEach(({ material }) => paint.apply(material, finish));
      dirty = true;
    },
    setToggles: (next) => {
      toggles = { ...next };
      applyToggles();
    },
    setBottomInset: (px) => {
      const next = Math.max(0, Math.round(px));
      if (next === bottomInset) return;
      const firstMeasure = bottomInset === 0;
      bottomInset = next;
      applyViewOffset();
      camera.updateProjectionMatrix();
      dirty = true;
      // Re-frame once the panel has been measured; later changes only shift the picture.
      if (firstMeasure && rig && !tween) goView(currentView, true);
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      removeRig();
      modelCache.forEach((model) => {
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m?.dispose());
        });
      });
      modelCache.clear();
      dracoLoader.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      envTexture.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
      // Stepping through the wheels makes a new stage each time. A disposed context is only freed at
      // garbage collection (iOS keeps its GPU memory until then), and the browser drops the oldest
      // context, the car's, once too many are alive: release this one now.
      renderer.forceContextLoss();
    }
  };
}


export const WheelStudio = ({
  wheelModel,
  wheelSeries,
  finishes,
  selectedFinish,
  onSelectFinish,
  modelUrl,
  rearModelUrl,
  modelFlip = false,
  specFront,
  specRear,
  initialView = 'three',
  initialToggles,
  onClose,
  onEnquire,
  advanced = false,
  paint = defaultPaintRenderer,
  dracoDecoderPath = '/draco/',
  className = 'h-[76vh] min-h-[540px] max-h-[860px]',
}: WheelStudioProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StudioEngine | null>(null);

  const [axle, setAxle] = useState<'front' | 'rear'>('front');
  const [view, setView] = useState<StudioViewId>(initialView);
  const [toggles, setToggles] = useState<StudioToggles>(() => ({
    ...DEFAULT_STUDIO_TOGGLES,
    orbit: !prefersReducedMotion(),
    ...initialToggles,
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<LoadedModelInfo | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const hasRear = !!rearModelUrl && rearModelUrl !== modelUrl;
  const activeUrl = axle === 'rear' && hasRear ? rearModelUrl! : modelUrl;

  // Create the engine once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let engine: StudioEngine;
    try {
      engine = createStudioEngine(
        mount,
        {
          onLoaded: (loaded) => {
            setInfo(loaded);
            setLoading(false);
            setError(null);
          },
          onError: (message) => {
            setError(message);
            setLoading(false);
          },
          onUserDrag: () => {
            setHintVisible(false);
            setToggles((t) => (t.orbit ? { ...t, orbit: false } : t));
          },
        },
        {
          ariaLabel: `Interactive 3D view of ${wheelModel}. Drag to rotate, pinch to zoom.`,
          paint,
          dracoDecoderPath,
        }
      );
    } catch (err) {
      console.error('WheelStudio: WebGL is not available', err);
      setError('3D view is not available on this device.');
      setLoading(false);
      return;
    }
    engineRef.current = engine;
    engine.goView(initialView, true);

    // Tell the engine how much of the stage the control panel covers.
    const panel = panelRef.current;
    const measurePanel = () => {
      if (panel) engine.setBottomInset(panel.offsetHeight + 8);
    };
    const panelObserver = new ResizeObserver(measurePanel);
    if (panel) panelObserver.observe(panel);
    measurePanel();

    return () => {
      panelObserver.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
    // initialView, the label, the paint renderer and the decoder path are read once on mount by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The finish has to be on the engine before a model is built from it, so it is set first.
  const finish = selectedFinish ?? NEUTRAL_FINISH;
  const paintKey = JSON.stringify([finish.name, finish.paint]);
  useEffect(() => {
    engineRef.current?.setFinish(finish);
    // by value: a catalogue reload hands over new objects with the same numbers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintKey]);

  // Load (or switch) the model.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setLoading(true);
    setError(null);
    engine.load(activeUrl, modelFlip);
  }, [activeUrl, modelFlip, retryCount]);

  useEffect(() => {
    engineRef.current?.setToggles(toggles);
  }, [toggles]);

  const chooseView = (next: StudioViewId) => {
    setView(next);
    setToggles((t) => ({ ...t, orbit: false }));
    engineRef.current?.goView(next);
  };

  const flipToggle = (id: keyof StudioToggles) => setToggles((t) => ({ ...t, [id]: !t[id] }));

  const specLine = axle === 'rear' && hasRear ? specRear ?? specFront : specFront;
  // A toggle is only offered when the model has the parts it acts on.
  const canShow = (id: keyof StudioToggles) =>
    (id !== 'brakes' || !!info?.hasBrakes) &&
    (id !== 'bolts' || !info || info.hasBolts) &&
    (id !== 'cap' || !info || info.hasCap) &&
    (id !== 'explode' || !info || info.canExplode);
  const visibleToggles = TOGGLE_LABELS.filter((t) => canShow(t.id));
  const measured = info && info.diameterMm !== null && info.widthMm !== null;
  const showWheelRow = hasRear || !!onEnquire || (!advanced && canShow('explode'));

  return (
    <div
      className={`wv-stage ${className}`}
      data-studio-state={error ? 'error' : loading ? 'loading' : 'ready'}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) onClose();
      }}
    >
      <div ref={mountRef} className="wv-mount" />

      {/* Name, spec badge (advanced only) and the always-visible Close 3D button */}
      <div className="wv-top">
        <div className="wv-title">
          <div className="wv-name">{wheelModel}</div>
          {advanced && wheelSeries && <div className="wv-series">{wheelSeries}</div>}
        </div>
        <div className="wv-badges">
          {advanced && (specLine || measured) && (
            <div className="wv-spec">
              {specLine && (
                <div>
                  {hasRear && <b>{axle === 'rear' ? 'Rear ' : 'Front '}</b>}
                  {specLine}
                </div>
              )}
              {measured && (
                <div className="wv-nowrap">
                  Model: ⌀{info.diameterMm} × {info.widthMm} mm
                </div>
              )}
            </div>
          )}
          {onClose && (
            <button type="button" onClick={onClose} autoFocus className="wv-close">
              <X className="wv-icon" style={{ color: 'inherit' }} aria-hidden="true" />
              Close 3D
            </button>
          )}
        </div>
      </div>

      {hintVisible && !loading && !error && (
        <div className="wv-hint">
          <span>Drag to rotate · pinch or scroll to zoom</span>
        </div>
      )}

      {/* Controls */}
      <div ref={panelRef} role="group" aria-label="3D view controls" className="wv-panel">
        <div className="wv-panel-body">
          {showWheelRow && (
            <ControlRow label="Wheel" showLabel={advanced}>
              {hasRear &&
                (['front', 'rear'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={axle === a}
                    onClick={() => setAxle(a)}
                    className="wv-chip"
                  >
                    {a === 'front' ? 'Front' : 'Rear'}
                  </button>
                ))}
              {onEnquire && (
                <button type="button" onClick={onEnquire} className="wv-chip wv-chip--primary">
                  Enquire
                </button>
              )}
              {/* The simple stage offers the exploded view on its own; the advanced stage keeps it
                  with the other toggles in the Show row. */}
              {!advanced && canShow('explode') && (
                <button
                  type="button"
                  aria-pressed={toggles.explode}
                  onClick={() => flipToggle('explode')}
                  className={`wv-chip ${hasRear || onEnquire ? 'wv-chip--end' : ''}`}
                >
                  <span className="wv-dot" />
                  Exploded
                </button>
              )}
            </ControlRow>
          )}

          <ControlRow label="View" showLabel={advanced}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={view === v.id}
                onClick={() => chooseView(v.id)}
                className="wv-chip"
              >
                {v.label}
              </button>
            ))}
          </ControlRow>

          {finishes.length > 1 && (
            <ControlRow label="Finish" showLabel={advanced}>
              {finishes.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={selectedFinish?.id === f.id}
                  aria-label={`Select ${f.name} finish`}
                  onClick={() => onSelectFinish(f)}
                  className="wv-chip"
                >
                  <span className="wv-swatch" style={{ background: f.swatchHex }} />
                  {f.name}
                </button>
              ))}
            </ControlRow>
          )}

          {advanced && (
            <ControlRow label="Show" showLabel>
              {visibleToggles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={toggles[t.id]}
                  onClick={() => flipToggle(t.id)}
                  className="wv-chip"
                >
                  <span className="wv-dot" />
                  {t.label}
                </button>
              ))}
            </ControlRow>
          )}
        </div>
      </div>

      {loading && !error && (
        <div role="status" className="wv-veil">
          <div className="wv-status">
            <Loader2 className="wv-icon wv-spin" />
            Loading wheel…
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="wv-veil">
          <div className="wv-error">
            <AlertTriangle className="wv-icon" />
            <p>{error}</p>
            {engineRef.current && (
              <button type="button" onClick={() => setRetryCount((n) => n + 1)} className="wv-chip">
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// (typed arrow functions, not React.FC: the configurator has no React type package, and this file is shared)
const ControlRow = ({ label, showLabel, children }: { label: string; showLabel: boolean; children: React.ReactNode }) => (
  <div className="wv-row">
    {showLabel && <div className="wv-row-label">{label}</div>}
    <div className="wv-chips">{children}</div>
  </div>
);

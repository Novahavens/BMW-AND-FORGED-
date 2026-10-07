/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyPaintLayers, installPaintLayers } from './paintShader';
import { buildSoftboxStudio, ROOM_DARK, ROOM_LIGHT, ROOM_WALLS, ROOM_WHITE } from './studioSoftbox';
import { bindEnvironment, blackenGrilleChrome, glassReflectionMaterial, passMaterial } from './carMaterials';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { traceRimShapes, buildRimFaceGeometry } from './rimExtrusion';
import {
  barrelAoMap,
  installWheelShading,
  wheelShadingUniforms,
  LipStyle,
  WheelDims,
  RimPhotoOptions,
  WheelKitMaterials,
  buildCaliper,
  buildDisc,
  buildHub,
  buildRimShell,
  buildTyre,
  createWheelKitMaterials,
  lipStyleFor,
  prepareSidewallMaps,
  rimLayout,
  tyreSizeLabel
} from './wheelKit';
import { buildRimFacesAsync, promoteRimFace, RimFacePriority } from './rimFaceAsync';
import { finishLook, installFinishLayers, applyFinishLook } from './wheelFinish';
import { RIM_FACE_MASKS, RIM_FACE_OPTIONS } from './rimFaces';
import { proceduralRimShapes } from './proceduralRims';
import { 
  CarModel, 
  PaintColor, 
  WheelDesign, 
  WheelFinish, 
  CaliperColor, 
  CameraViewPreset,
  StudioTheme,
  Custom2DWheelConfig
} from '../types';

/**
 * The placeholder body has three shapes; other body styles use the nearest one:
 * a convertible the short coupe cabin, a touring or gran coupe the long sedan cabin.
 */
export const proceduralShape = (style: CarModel['bodyStyle']): 'coupe' | 'sedan' | 'suv' =>
  style === 'convertible' ? 'coupe' : style === 'touring' || style === 'gran_coupe' ? 'sedan' : style;

export class CarConfiguratorEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;
  private clock: THREE.Clock;

  // Car Hierarchy
  private carGroup: THREE.Group;
  private bodyMeshGroup: THREE.Group;
  private wheelsGroup: THREE.Group;
  private wheelAssemblies: {
    group: THREE.Group;
    /** Rotates around the axle: tyre, rim, spokes, hub and disc. The caliper stays put. */
    spinGroup: THREE.Group;
    spokeMeshGroup: THREE.Group;
    tyre: THREE.Group | null;
    /** Lip + barrel (+ lip bolts); rebuilt when the rim size or lip style changes. */
    rim: THREE.Group | null;
    /** Lug nuts + centre cap; hidden when a GLB rim brings its own. */
    hub: THREE.Group;
    disc: THREE.Group;
    caliper: THREE.Group;
    dims: WheelDims;
    isFront: boolean;
    isRight: boolean;
  }[] = [];
  private kit!: WheelKitMaterials;
  /** Inside of the barrel: the finish, a touch darker and less polished. */
  private barrelMaterial!: THREE.MeshPhysicalMaterial;
  private lipStyle: LipStyle = 'mono';
  private wheelMode: 'model' | 'image' | 'procedural' = 'procedural';
  private rimFaceCache = new Map<string, Promise<{ front: THREE.BufferGeometry; rear: THREE.BufferGeometry } | null>>();
  /**
   * Tyres and rim shells, kept per size (and lip style) instead of being rebuilt: a size or lip
   * change swaps groups. Disposing a tyre's materials also freed their shader programs, so every
   * rebuild compiled them again (seconds on a phone GPU). Templates own the GPU resources; the
   * other side of the axle shares them through a clone. Keys: `front|scale` / `lip|front|scale`
   * for templates, `assembly group id|…` for what each wheel shows.
   */
  private tyreTemplates = new Map<string, THREE.Group>();
  private shellTemplates = new Map<string, THREE.Group>();
  private wheelPartCache = new Map<string, THREE.Group>();
  private sizesPreloaded = new Set<number>();
  /** Rim sizes whose tyres are built and whose textures are on the GPU. */
  private readyScales = new Set<number>();
  private sizeJobs = new Map<number, { urgent: boolean; promise: Promise<void> }>();
  /** The wheel design whose spokes are still being prepared (its lip and size wait with it). */
  private pendingWheelToken: number | null = null;
  /** Replaced GLB / flat-image face materials, disposed once their successors have drawn. */
  private retiredMaterials: THREE.Material[] = [];

  // Materials Cache
  private carBodyMaterial!: THREE.MeshPhysicalMaterial;
  /** Copies of the paint for body parts whose own material carried surface detail (normal/AO maps). */
  private paintVariants = new Set<THREE.MeshPhysicalMaterial>();
  private pendingVariants = new Set<THREE.MeshPhysicalMaterial>();
  private wheelMaterial!: THREE.MeshPhysicalMaterial;
  /** Frames still to draw after a change (render on demand: an idle scene is not redrawn). */
  private renderFrames = 2;
  private lastRenderAt = 0;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private carbonMaterial!: THREE.MeshPhysicalMaterial;
  private glassMaterial!: THREE.MeshPhysicalMaterial;
  private chromeMaterial!: THREE.MeshStandardMaterial;
  private lightMaterial!: THREE.MeshBasicMaterial;
  private redLightMaterial!: THREE.MeshBasicMaterial;

  // Environment & Studio
  private groundMesh!: THREE.Mesh;
  private studioLightsGroup: THREE.Group;
  private softboxLight!: THREE.DirectionalLight;
  private rimLight1!: THREE.DirectionalLight;
  private rimLight2!: THREE.DirectionalLight;
  private fillLight!: THREE.AmbientLight;

  // Interactive State
  private isAutoRotate: boolean = false;
  private isSpinningWheels: boolean = false;
  private spinSpeed: number = 0;
  private rideHeightOffset: number = 0;

  // Camera Controls (Smooth lerping + mouse dragging)
  private targetCameraPos: THREE.Vector3 = new THREE.Vector3(3.6, 1.4, 3.8);
  private targetLookAt: THREE.Vector3 = new THREE.Vector3(0, 0.45, 0);
  private currentLookAt: THREE.Vector3 = new THREE.Vector3(0, 0.45, 0);
  private isUserInteracting: boolean = false;
  private pointerDownPos = { x: 0, y: 0 };
  private spherical = { radius: 5.5, theta: 0.8, phi: 1.25 };
  private targetSpherical = { radius: 5.5, theta: 0.8, phi: 1.25 };

  // 2D rim textures (uploaded PNGs and the 2D guide), cached by URL
  private wheelTextureCache = new Map<string, THREE.Texture>();
  private rimShapeCache = new Map<string, THREE.Shape[] | null>();
  private rimFaceGeometryCache = new Map<string, THREE.BufferGeometry>();
  private rimModelCache = new Map<string, Promise<THREE.Object3D>>();
  private customFaceMaterials: THREE.MeshPhysicalMaterial[] = [];
  private wheelDesignToken = 0;

  // Uploaded GLB car models
  private gltfLoader: GLTFLoader | null = null;
  private carLoadToken = 0;
  private dracoLoader: DRACOLoader | null = null;
  private defaultWheelLayout: { x: number; y: number; z: number }[] = [];
  /** Procedural-body wheel scale (SUVs run taller tyres). */
  private proceduralWheelScale = 1;
  /** Rim diameter relative to the 20" base geometry; the tyre's outer size stays fixed. */
  private rimScale = 1;

  // Showcase mode: one wheel on the turntable, no car (rim detail pages)
  private isShowcase = false;
  private showcaseSwayTime = 0;
  private isPaused = false;
  private zoomRange = { min: 1.0, max: 9.0 };

  // Event Listeners for cleanup
  private boundOnPointerDown?: (e: MouseEvent | TouchEvent) => void;
  private boundOnPointerMove?: (e: MouseEvent | TouchEvent) => void;
  private boundOnPointerUp?: () => void;
  private boundOnWheel?: (e: WheelEvent) => void;
  private boundOnContextRestored?: () => void;

  // Callbacks
  private onReady?: () => void;

  // Studio extras
  static HDRI_URL = '/env/studio_small_09_1k.hdr';
  /**
   * Reflections for the car body: 'softbox' (generated car-photography studio: big overhead
   * softbox and long side strips) or 'hdri' (the original Poly Haven studio). ?studio=hdri compares.
   */
  static STUDIO: 'softbox' | 'hdri' =
    typeof window !== 'undefined' && /[?&]studio=hdri/.test(window.location.search) ? 'hdri' : 'softbox';
  /** The reflected studio room: 'walls' (default: dark room with tall side panels), 'dark' or 'light'; ?room= compares. */
  static ROOM: 'dark' | 'light' | 'walls' | 'white' = (() => {
    const m = typeof window !== 'undefined' ? /[?&]room=(light|walls|dark|white)/.exec(window.location.search) : null;
    return (m?.[1] as 'dark' | 'light' | 'walls' | 'white') ?? 'white';
  })();
  /** Tone mapping: 'aces' (default), 'agx' or 'neutral'; ?tone=agx compares. */
  static TONE: 'aces' | 'agx' | 'neutral' = (() => {
    const m = typeof window !== 'undefined' ? /[?&]tone=(agx|neutral|aces)/.exec(window.location.search) : null;
    return (m?.[1] as 'aces' | 'agx' | 'neutral') ?? 'aces';
  })();
  static EXPOSURE: number | undefined = (() => {
    const m = typeof window !== 'undefined' ? /[?&]exposure=([0-9.]+)/.exec(window.location.search) : null;
    return m ? +m[1] : undefined;
  })();
  static DEFAULT_HIDE = '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)';
  private isDisposed = false;
  private contactShadow: {
    group: THREE.Group;
    plane: THREE.Mesh;
    blurPlane: THREE.Mesh;
    cam: THREE.OrthographicCamera;
    rt: THREE.WebGLRenderTarget;
    rtBlur: THREE.WebGLRenderTarget;
    depthMaterial: THREE.MeshDepthMaterial;
    hBlur: THREE.ShaderMaterial;
    vBlur: THREE.ShaderMaterial;
  } | null = null;
  private shadowFrames = 0;
  /** The contact shadow missed changes while hidden (pre-rendered body mode). */
  private shadowStale = false;
  // Car GLBs by URL, least recently used first. Resolved scenes are also kept in modelScenes so they
  // can be disposed when evicted; mountedModelUrl is the car on screen and is never evicted.
  private modelCache = new Map<string, Promise<THREE.Object3D>>();
  private modelScenes = new Map<string, THREE.Object3D>();
  private mountedModelUrl: string | null = null;
  private static readonly MODEL_CACHE_MAX = 4;
  private drive: {
    from: number;
    to: number;
    t: number;
    duration: number;
    easeIn: boolean;
    resolve: () => void;
  } | null = null;
  private cameraDamping = 0.12;
  private viewInset = { right: 0, bottom: 0 };
  private currentInset = { right: 0, bottom: 0 };

  constructor(container: HTMLElement, onReady?: () => void, options: { showcase?: boolean } = {}) {
    this.container = container;
    this.isShowcase = !!options.showcase;
    this.onReady = onReady;
    this.clock = new THREE.Clock();

    // Scene
    // The canvas is transparent: the page behind it is the studio backdrop, so UI can layer
    // typography behind the car and the floor is just a soft contact shadow.
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // Safe Dimensions
    const w = container.clientWidth || window.innerWidth || 800;
    const h = container.clientHeight || window.innerHeight || 600;
    const aspect = w / (h > 0 ? h : 1);

    // Camera
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
    this.camera.position.copy(this.targetCameraPos);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(w, h);
    // Phones: 1.5x is still sharp on a ~400 px wide canvas and renders half the pixels of 2x
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, w < 700 ? 1.5 : 2));
    const tone = CarConfiguratorEngine.TONE;
    this.renderer.toneMapping = tone === 'agx' ? THREE.AgXToneMapping : tone === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CarConfiguratorEngine.EXPOSURE ?? (tone === 'agx' ? 1.25 : tone === 'neutral' ? 0.95 : 1.08);
    this.container.appendChild(this.renderer.domElement);

    // A phone can take the GPU away (app backgrounded, memory pressure) and hand it back empty.
    // three.js re-creates its own state and re-uploads textures and geometry on demand, but the
    // two things that only ever lived on the GPU are gone: the reflection environment and the
    // contact shadow. Without this the car comes back dark with no studio reflections.
    this.boundOnContextRestored = () => {
      this.environmentTarget = null; // its GPU objects died with the old context; nothing to free
      this.generateStudioEnvironment();
      this.markShadowDirty();
      this.requestRender();
    };
    this.renderer.domElement.addEventListener('webglcontextrestored', this.boundOnContextRestored);

    // Groups
    this.carGroup = new THREE.Group();
    this.bodyMeshGroup = new THREE.Group();
    this.wheelsGroup = new THREE.Group();
    this.studioLightsGroup = new THREE.Group();

    this.carGroup.add(this.bodyMeshGroup);
    this.carGroup.add(this.wheelsGroup);
    this.scene.add(this.carGroup);
    this.scene.add(this.studioLightsGroup);

    // Init components
    this.setupMaterials();
    this.setupStudioEnvironment();
    this.setupStudioLighting('studio_light');
    if (this.isShowcase) {
      this.setupShowcase();
    } else {
      this.buildBMWCarBody('coupe');
      this.buildWheels();
    }
    this.setupInputHandlers();

    // Generate procedural studio environment reflection
    this.generateStudioEnvironment();

    // Start loop
    this.animate = this.animate.bind(this);
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (this.onReady) {
      setTimeout(() => this.onReady?.(), 100);
    }
  }

  // ----------------------------------------------------
  // MATERIALS SETUP
  // ----------------------------------------------------
  private setupMaterials() {
    // Car paint (default Isle of Man Green)
    this.carBodyMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0d4332'),
      metalness: 0.72,
      roughness: 0.18,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
      reflectivity: 0.9
    });
    installPaintLayers(this.carBodyMaterial);

    // Wheel Forged Material (default Liquid Metal)
    this.wheelMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#d6dde3'),
      metalness: 0.98,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    // Inside of the barrel, seen through the spokes
    this.barrelMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#b9c0c6'),
      metalness: 0.98,
      roughness: 0.22,
      clearcoat: 0.5,
      side: THREE.DoubleSide,
      envMapIntensity: 0.45, // deep inside the wheel: far less of the studio reaches it
      aoMap: barrelAoMap(),
      aoMapIntensity: 1
    });
    this.wheelMaterial.side = THREE.DoubleSide;
    // under the wheel arch, the spokes' top and the barrel are in the fender's shade
    installWheelShading(this.wheelMaterial, { arch: 0.3 });
    installWheelShading(this.barrelMaterial, { arch: 0.5 });
    // face/flop and flake sparkle for metallic-paint finishes (see wheelFinish.ts)
    installFinishLayers(this.wheelMaterial);

    // Tyres, discs, calipers, lip, nuts and cap
    this.kit = createWheelKitMaterials();

    // Carbon Fiber Aerodynamic Components
    this.carbonMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#161719'),
      metalness: 0.45,
      roughness: 0.3,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1
    });

    // Automotive Glass (Deep Smoke tint)
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#080a0d'),
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.7,
      transparent: true,
      opacity: 0.82
    });

    // Chrome/Exhaust
    this.chromeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c0c8cf'),
      metalness: 0.95,
      roughness: 0.15
    });

    // Headlight DRLs (Iconic BMW Hexagonal LED white-blue)
    this.lightMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#cceeff')
    });

    // Taillight LEDs
    this.redLightMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff1828')
    });
  }

  // ----------------------------------------------------
  // PROCEDURAL STUDIO ENVIRONMENT & LIGHTING
  // ----------------------------------------------------
  private setupStudioEnvironment() {
    // No visible floor: the car sits on a soft blurred contact shadow over the page backdrop.
    // The ground mesh stays as an invisible shadow catcher for the directional key light.
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    this.groundMesh = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({ opacity: 0 }));
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.visible = false;
    this.scene.add(this.groundMesh);
    this.setupContactShadow();
  }

  // ----------------------------------------------------
  // CONTACT SHADOW (rendered from below, blurred; lives in the car's space so it drives with it)
  // ----------------------------------------------------
  private setupContactShadow() {
    const W = 3.4; // across the car (x)
    const L = 6.4; // along the car (z)
    const H = 1.4; // how far up the car still darkens the floor
    const rtOpts = { type: THREE.HalfFloatType } as const;
    const rt = new THREE.WebGLRenderTarget(256, 512, rtOpts);
    rt.texture.generateMipmaps = false;
    const rtBlur = new THREE.WebGLRenderTarget(256, 512, rtOpts);
    rtBlur.texture.generateMipmaps = false;

    const group = new THREE.Group();
    group.position.y = 0.002;

    const planeGeo = new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2);
    const plane = new THREE.Mesh(
      planeGeo,
      new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity: 0.85, depthWrite: false })
    );
    plane.renderOrder = 1;
    plane.scale.y = -1; // the texture is rendered looking up; flip it to face the camera
    group.add(plane);

    const blurPlane = new THREE.Mesh(planeGeo);
    blurPlane.visible = false;
    group.add(blurPlane);

    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, L / 2, -L / 2, 0, H);
    cam.rotation.x = Math.PI / 2; // look up at the underside
    group.add(cam);

    const depthMaterial = new THREE.MeshDepthMaterial();
    depthMaterial.userData.darkness = { value: 1.1 };
    depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = depthMaterial.userData.darkness;
      shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'
      )}`;
    };
    depthMaterial.depthTest = false;
    depthMaterial.depthWrite = false;

    const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
    hBlur.depthTest = false;
    const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
    vBlur.depthTest = false;

    this.carGroup.add(group);
    this.contactShadow = { group, plane, blurPlane, cam, rt, rtBlur, depthMaterial, hBlur, vBlur };
    this.markShadowDirty();
  }

  /** Re-render the contact shadow for the next few frames (async wheel/model loads settle in that time). */
  private markShadowDirty(frames = 45) {
    if (this.renderedBody) {
      // the pre-rendered body hides the contact shadow: draw the change, redo the shadow when it shows
      this.shadowStale = true;
      this.requestRender();
      return;
    }
    this.shadowFrames = Math.max(this.shadowFrames, frames);
    this.requestRender();
  }

  /** Something in the scene changed: draw the next few frames (the loop skips an idle scene). */
  public requestRender(frames = 2) {
    this.renderFrames = Math.max(this.renderFrames, frames);
  }

  private renderContactShadow() {
    const cs = this.contactShadow;
    if (!cs) return;
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAlpha = r.getClearAlpha();
    r.setClearAlpha(0);
    cs.plane.visible = false;
    this.scene.overrideMaterial = cs.depthMaterial;
    r.setRenderTarget(cs.rt);
    r.clear();
    r.render(this.scene, cs.cam);
    this.scene.overrideMaterial = null;

    const blur = (amount: number) => {
      cs.blurPlane.visible = true;
      cs.blurPlane.material = cs.hBlur;
      cs.hBlur.uniforms.tDiffuse.value = cs.rt.texture;
      cs.hBlur.uniforms.h.value = amount / 256;
      r.setRenderTarget(cs.rtBlur);
      r.render(cs.blurPlane, cs.cam);
      cs.blurPlane.material = cs.vBlur;
      cs.vBlur.uniforms.tDiffuse.value = cs.rtBlur.texture;
      cs.vBlur.uniforms.v.value = amount / 512;
      r.setRenderTarget(cs.rt);
      r.render(cs.blurPlane, cs.cam);
      cs.blurPlane.visible = false;
    };
    blur(3.2);
    blur(1.2);

    r.setRenderTarget(prevTarget);
    r.setClearAlpha(prevAlpha);
    cs.plane.visible = true;
  }

  public setupStudioLighting(theme: StudioTheme) {
    // Clear existing
    while (this.studioLightsGroup.children.length > 0) {
      this.studioLightsGroup.remove(this.studioLightsGroup.children[0]);
    }

    if (theme === 'studio_light') {
      // Image-based light (the HDRI) does most of the work; these sculpt the body so its
      // curves read clearly instead of flattening into one grey gradient.
      this.fillLight = new THREE.AmbientLight(0xffffff, 0.28);
      this.studioLightsGroup.add(this.fillLight);

      // Near-neutral key and sheen: warmer lights tinted dark metallics (Black Sapphire, Carbon
      // Black) bronze-brown on the flanks, which BMW's own renders never show.
      // Kept low: on a clearcoat a strong overhead key reads as a white-hot bonnet, not a studio.
      this.softboxLight = new THREE.DirectionalLight(0xfffcf8, 0.6);
      this.softboxLight.position.set(1.5, 8, 2.5);
      this.studioLightsGroup.add(this.softboxLight);

      // Key-side sheen
      this.rimLight1 = new THREE.DirectionalLight(0xfffaf4, 0.55);
      this.rimLight1.position.set(6, 2.2, 3);
      this.studioLightsGroup.add(this.rimLight1);

      // Cool opposite-side sheen, so the two flanks separate instead of matching tone
      this.rimLight2 = new THREE.DirectionalLight(0xdce8ff, 0.45);
      this.rimLight2.position.set(-6, 1.8, -3);
      this.studioLightsGroup.add(this.rimLight2);

      // Low, near-horizontal kicker along the sills/lower body so the lower half doesn't
      // read as a flat black silhouette against the shadow.
      const lowKicker = new THREE.DirectionalLight(0xffffff, 0.4);
      lowKicker.position.set(-2, 0.6, 5);
      this.studioLightsGroup.add(lowKicker);
    } else if (theme === 'studio_dark') {
      this.scene.background = new THREE.Color(0x0a0b0d);
      if (this.scene.fog) (this.scene.fog as THREE.FogExp2).color.set(0x0a0b0d);

      this.fillLight = new THREE.AmbientLight(0xffffff, 0.7);
      this.studioLightsGroup.add(this.fillLight);

      // Key Softbox Overhead (simulating large studio diffuser)
      this.softboxLight = new THREE.DirectionalLight(0xffffff, 2.2);
      this.softboxLight.position.set(0, 7, 1);
      this.softboxLight.castShadow = true;
      this.softboxLight.shadow.mapSize.width = 2048;
      this.softboxLight.shadow.mapSize.height = 2048;
      this.softboxLight.shadow.camera.near = 0.5;
      this.softboxLight.shadow.camera.far = 15;
      this.softboxLight.shadow.camera.left = -4;
      this.softboxLight.shadow.camera.right = 4;
      this.softboxLight.shadow.camera.top = 4;
      this.softboxLight.shadow.camera.bottom = -4;
      this.softboxLight.shadow.bias = -0.0004;
      this.studioLightsGroup.add(this.softboxLight);

      // Side Rim Light (to sculpt wheel reflections)
      this.rimLight1 = new THREE.DirectionalLight(0xb0d0ff, 2.4);
      this.rimLight1.position.set(5, 1.8, 2.5);
      this.studioLightsGroup.add(this.rimLight1);

      // Opposite Rim Light
      this.rimLight2 = new THREE.DirectionalLight(0xffdfba, 1.8);
      this.rimLight2.position.set(-5, 1.8, -2.5);
      this.studioLightsGroup.add(this.rimLight2);

      // Front low accent for kidney grille & lower lip
      const frontLowLight = new THREE.DirectionalLight(0xffffff, 1.2);
      frontLowLight.position.set(0, 0.8, 5.5);
      this.studioLightsGroup.add(frontLowLight);

      // Rear low accent for quad exhaust
      const rearLowLight = new THREE.DirectionalLight(0xffffff, 1.0);
      rearLowLight.position.set(0, 0.8, -5.5);
      this.studioLightsGroup.add(rearLowLight);
    } else if (theme === 'studio_pure') {
      this.scene.background = new THREE.Color(0xdde3ea);
      if (this.scene.fog) (this.scene.fog as THREE.FogExp2).color.set(0xdde3ea);

      this.fillLight = new THREE.AmbientLight(0xffffff, 1.3);
      this.studioLightsGroup.add(this.fillLight);

      this.softboxLight = new THREE.DirectionalLight(0xffffff, 2.0);
      this.softboxLight.position.set(2, 8, 3);
      this.softboxLight.castShadow = true;
      this.studioLightsGroup.add(this.softboxLight);

      this.rimLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
      this.rimLight1.position.set(-4, 2, -2);
      this.studioLightsGroup.add(this.rimLight1);
    } else {
      // Night runway
      this.scene.background = new THREE.Color(0x050608);
      if (this.scene.fog) (this.scene.fog as THREE.FogExp2).color.set(0x050608);

      this.fillLight = new THREE.AmbientLight(0x303b4f, 0.5);
      this.studioLightsGroup.add(this.fillLight);

      this.softboxLight = new THREE.DirectionalLight(0x7090ff, 1.8);
      this.softboxLight.position.set(2, 6, 2);
      this.softboxLight.castShadow = true;
      this.studioLightsGroup.add(this.softboxLight);

      this.rimLight1 = new THREE.DirectionalLight(0xff2a48, 3.2);
      this.rimLight1.position.set(5, 1.2, -2);
      this.studioLightsGroup.add(this.rimLight1);

      this.rimLight2 = new THREE.DirectionalLight(0x00f0ff, 3.0);
      this.rimLight2.position.set(-5, 1.2, 2);
      this.studioLightsGroup.add(this.rimLight2);
    }
  }

  /**
   * Reflections: a neutral procedural room right away, then a real studio HDRI (Poly Haven, CC0)
   * once it has downloaded. Metallic paint and polished rims live or die by this.
   */
  private generateStudioEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const roomTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = roomTarget.texture;
    this.scene.environmentIntensity = 0.9;
    room.dispose?.();

    if (CarConfiguratorEngine.STUDIO === 'softbox') {
      const baseRoom = CarConfiguratorEngine.ROOM === 'white' ? ROOM_WHITE : CarConfiguratorEngine.ROOM === 'light' ? ROOM_LIGHT : CarConfiguratorEngine.ROOM === 'walls' ? ROOM_WALLS : ROOM_DARK;
      // Tuning switches: ?gain= ?edge= ?base= ?side= ?floor= ?horizon= override the room's numbers
      const num = (k: string) => {
        const m = typeof window !== 'undefined' ? new RegExp(`[?&]${k}=([0-9.]+)`).exec(window.location.search) : null;
        return m ? +m[1] : undefined;
      };
      const room = { ...baseRoom };
      const o = { panelGain: num('gain'), edge: num('edge'), base: num('base'), sideWalls: num('side'), floor: num('floor'), horizon: num('horizon'), flank: num('flank') };
      (Object.keys(o) as Array<keyof typeof o>).forEach((k) => { if (o[k] !== undefined) (room as any)[k] = o[k]; });
      const studio = buildSoftboxStudio(room);
      const studioTarget = pmrem.fromScene(studio, 0.02, 0.1, 100, { size: 512 });
      studio.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      this.scene.environment = studioTarget.texture;
      this.scene.environmentIntensity = CarConfiguratorEngine.SOFTBOX_INTENSITY;
      this.scene.environmentRotation.set(0, 0, 0);
      this.environmentTarget = studioTarget;
      roomTarget.dispose(); // replaced before the first frame
      pmrem.dispose();
      this.requestRender();
      return;
    }

    new HDRLoader()
      .loadAsync(CarConfiguratorEngine.HDRI_URL)
      .then((hdr) => {
        if (this.isDisposed) return;
        const envTarget = pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        this.scene.environment = envTarget.texture;
        roomTarget.dispose();
        this.environmentTarget = envTarget;
        this.requestRender();
        this.scene.environmentIntensity = 1.0;
        this.scene.environmentRotation.set(0, Math.PI * 0.35, 0);
        pmrem.dispose();
      })
      .catch((err) => {
        console.warn('Studio HDRI unavailable; keeping the procedural studio reflections.', err);
        pmrem.dispose();
      });
  }

  // ----------------------------------------------------
  // PROCEDURAL BMW M PERFORMANCE 3D MODEL
  // ----------------------------------------------------
  public buildBMWCarBody(style: CarModel['bodyStyle'] = 'coupe') {
    const bodyStyle = proceduralShape(style);
    // Clear existing car body
    this.disposeBody();

    const mainBody = new THREE.Group();

    // Dimensions: length ~ 4.7m (Z: -2.3 to +2.4), width ~ 1.9m (X: -0.95 to +0.95), height ~ 1.35m
    const carYBase = 0.28; // ground clearance above wheels

    // 1. Lower Chassis & Underbody
    const underbodyGeo = new THREE.BoxGeometry(1.72, 0.12, 4.4);
    const underbodyMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
    const underbody = new THREE.Mesh(underbodyGeo, underbodyMat);
    underbody.position.set(0, carYBase + 0.06, 0);
    underbody.castShadow = true;
    mainBody.add(underbody);

    // 2. Main Aerodynamic Fuselage / Cabin Lower Tub
    const mainTubGeo = new THREE.BoxGeometry(1.82, 0.42, 4.25);
    const mainTub = new THREE.Mesh(mainTubGeo, this.carBodyMaterial);
    mainTub.position.set(0, carYBase + 0.28, 0);
    mainTub.castShadow = true;
    mainTub.receiveShadow = true;
    mainBody.add(mainTub);

    // 3. Sculpted Hood (BMW Power Bulge + Dual Character Grooves)
    const hoodGeo = new THREE.BoxGeometry(1.70, 0.18, 1.45);
    const hood = new THREE.Mesh(hoodGeo, this.carBodyMaterial);
    hood.position.set(0, carYBase + 0.44, 1.35);
    hood.rotation.x = -0.06;
    hood.castShadow = true;
    mainBody.add(hood);

    // Central hood powerdome crease
    const domeGeo = new THREE.BoxGeometry(0.72, 0.05, 1.15);
    const dome = new THREE.Mesh(domeGeo, this.carBodyMaterial);
    dome.position.set(0, carYBase + 0.53, 1.32);
    dome.rotation.x = -0.07;
    mainBody.add(dome);

    // Carbon Hood Heat Vents
    const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.4), this.carbonMaterial);
    ventL.position.set(-0.42, carYBase + 0.52, 1.25);
    const ventR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.4), this.carbonMaterial);
    ventR.position.set(0.42, carYBase + 0.52, 1.25);
    mainBody.add(ventL, ventR);

    // 4. Iconic BMW M Double Kidney Grille
    const grilleFrameGeo = new THREE.BoxGeometry(0.38, 0.36, 0.08);
    const grilleFrameMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0.8 });
    
    const grilleLeft = new THREE.Mesh(grilleFrameGeo, grilleFrameMat);
    grilleLeft.position.set(-0.24, carYBase + 0.32, 2.18);
    const grilleRight = new THREE.Mesh(grilleFrameGeo, grilleFrameMat);
    grilleRight.position.set(0.24, carYBase + 0.32, 2.18);

    // Slat horizontal bars for M Performance aggressive nose
    for (let i = -2; i <= 2; i++) {
      const slatL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.03), grilleFrameMat);
      slatL.position.set(-0.24, carYBase + 0.32 + i * 0.06, 2.21);
      const slatR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.03), grilleFrameMat);
      slatR.position.set(0.24, carYBase + 0.32 + i * 0.06, 2.21);
      mainBody.add(slatL, slatR);
    }

    // BMW Roundel Hood Emblem
    const roundelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24);
    const roundelMat = new THREE.MeshStandardMaterial({ color: 0x0055b8, metalness: 0.5, roughness: 0.2 });
    const roundel = new THREE.Mesh(roundelGeo, roundelMat);
    roundel.rotation.x = Math.PI / 2 - 0.06;
    roundel.position.set(0, carYBase + 0.51, 2.08);
    mainBody.add(grilleLeft, grilleRight, roundel);

    // 5. Front Aerodynamic Bumper & Lower Carbon Splitter
    const frontBumperGeo = new THREE.BoxGeometry(1.86, 0.28, 0.35);
    const frontBumper = new THREE.Mesh(frontBumperGeo, this.carBodyMaterial);
    frontBumper.position.set(0, carYBase + 0.22, 2.12);
    frontBumper.castShadow = true;
    mainBody.add(frontBumper);

    // Carbon fiber front splitter
    const splitterGeo = new THREE.BoxGeometry(1.92, 0.04, 0.42);
    const splitter = new THREE.Mesh(splitterGeo, this.carbonMaterial);
    splitter.position.set(0, carYBase + 0.05, 2.18);
    splitter.castShadow = true;
    mainBody.add(splitter);

    // 6. Iconic Hexagonal LED Headlights
    const headlightGeo = new THREE.BoxGeometry(0.42, 0.12, 0.18);
    const hlLeft = new THREE.Mesh(headlightGeo, this.lightMaterial);
    hlLeft.position.set(-0.68, carYBase + 0.42, 2.06);
    hlLeft.rotation.y = -0.22;
    const hlRight = new THREE.Mesh(headlightGeo, this.lightMaterial);
    hlRight.position.set(0.68, carYBase + 0.42, 2.06);
    hlRight.rotation.y = 0.22;
    mainBody.add(hlLeft, hlRight);

    // 7. Muscular Flared Wheel Arches (Fenders)
    // Front Fenders (flared wide for wide forged stance)
    // They sit above the tyres (bottom edge at y 0.72, just over a 0.35 m tyre) as arch lips;
    // centred on the wheels they used to hide the upper half of every wheel behind a flat slab.
    const fenderGeo = new THREE.BoxGeometry(0.18, 0.16, 0.95);
    const fenderFL = new THREE.Mesh(fenderGeo, this.carBodyMaterial);
    fenderFL.position.set(-0.95, carYBase + 0.52, 1.45);
    const fenderFR = new THREE.Mesh(fenderGeo, this.carBodyMaterial);
    fenderFR.position.set(0.95, carYBase + 0.52, 1.45);

    // Rear Fenders (extreme widebody hips for deep concave wheel fitment)
    const rearFenderGeo = new THREE.BoxGeometry(0.22, 0.18, 1.05);
    const fenderRL = new THREE.Mesh(rearFenderGeo, this.carBodyMaterial);
    fenderRL.position.set(-0.98, carYBase + 0.53, -1.35);
    const fenderRR = new THREE.Mesh(rearFenderGeo, this.carBodyMaterial);
    fenderRR.position.set(0.98, carYBase + 0.53, -1.35);

    mainBody.add(fenderFL, fenderFR, fenderRL, fenderRR);

    // 8. Carbon Fiber Side Skirts / Blades
    const sideSkirtL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 2.1), this.carbonMaterial);
    sideSkirtL.position.set(-0.93, carYBase + 0.06, 0.05);
    const sideSkirtR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 2.1), this.carbonMaterial);
    sideSkirtR.position.set(0.93, carYBase + 0.06, 0.05);
    mainBody.add(sideSkirtL, sideSkirtR);

    // 9. Aerodynamic Greenhouse (Cabin, Windows, Windshield)
    // Cabin Pillar Structure
    const cabinLength = bodyStyle === 'coupe' ? 2.1 : 2.3; // sedan & SUV share the long cabin
    const cabinGeo = new THREE.BoxGeometry(1.52, 0.46, cabinLength);
    const cabin = new THREE.Mesh(cabinGeo, this.glassMaterial);
    cabin.position.set(0, carYBase + 0.68, bodyStyle === 'coupe' ? -0.12 : -0.05);
    cabin.castShadow = true;
    mainBody.add(cabin);

    // Carbon Fiber Roof with Signature M Double-Bubble Center Channel
    const roofGeo = new THREE.BoxGeometry(1.44, 0.04, cabinLength * 0.92);
    const roof = new THREE.Mesh(roofGeo, this.carbonMaterial);
    roof.position.set(0, carYBase + 0.91, bodyStyle === 'coupe' ? -0.12 : -0.05);
    roof.castShadow = true;
    mainBody.add(roof);

    // Roof Center Indentation strip
    const roofStrip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, cabinLength * 0.9), this.carbonMaterial);
    roofStrip.position.set(0, carYBase + 0.89, bodyStyle === 'coupe' ? -0.12 : -0.05);
    mainBody.add(roofStrip);

    // 10. M Stalk Aero Side Mirrors
    const mirrorStemGeo = new THREE.BoxGeometry(0.04, 0.04, 0.12);
    const mirrorHousingGeo = new THREE.BoxGeometry(0.24, 0.12, 0.14);
    
    // Left mirror
    const mirLGroup = new THREE.Group();
    const stemL = new THREE.Mesh(mirrorStemGeo, this.carbonMaterial);
    const housingL = new THREE.Mesh(mirrorHousingGeo, this.carbonMaterial);
    housingL.position.set(-0.1, 0.05, 0);
    housingL.rotation.y = 0.15;
    mirLGroup.add(stemL, housingL);
    mirLGroup.position.set(-0.88, carYBase + 0.58, 0.62);

    // Right mirror
    const mirRGroup = new THREE.Group();
    const stemR = new THREE.Mesh(mirrorStemGeo, this.carbonMaterial);
    const housingR = new THREE.Mesh(mirrorHousingGeo, this.carbonMaterial);
    housingR.position.set(0.1, 0.05, 0);
    housingR.rotation.y = -0.15;
    mirRGroup.add(stemR, housingR);
    mirRGroup.position.set(0.88, carYBase + 0.58, 0.62);

    mainBody.add(mirLGroup, mirRGroup);

    // 11. Rear Decklid, Trunk & Carbon Ducktail Spoiler
    const trunkGeo = new THREE.BoxGeometry(1.65, 0.28, 0.85);
    const trunk = new THREE.Mesh(trunkGeo, this.carBodyMaterial);
    trunk.position.set(0, carYBase + 0.48, -1.78);
    trunk.rotation.x = 0.08;
    trunk.castShadow = true;
    mainBody.add(trunk);

    // Carbon ducktail lip spoiler
    const spoilerGeo = new THREE.BoxGeometry(1.68, 0.05, 0.18);
    const spoiler = new THREE.Mesh(spoilerGeo, this.carbonMaterial);
    spoiler.position.set(0, carYBase + 0.62, -2.18);
    spoiler.rotation.x = -0.18;
    spoiler.castShadow = true;
    mainBody.add(spoiler);

    // 12. Rear Fascia, L-Shaped LED Taillights & Carbon Diffuser
    const rearBumperGeo = new THREE.BoxGeometry(1.84, 0.32, 0.25);
    const rearBumper = new THREE.Mesh(rearBumperGeo, this.carBodyMaterial);
    rearBumper.position.set(0, carYBase + 0.26, -2.22);
    rearBumper.castShadow = true;
    mainBody.add(rearBumper);

    // LED Taillights (L-Shaped Signature)
    const tlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.08), this.redLightMaterial);
    tlLeft.position.set(-0.58, carYBase + 0.46, -2.28);
    const tlRight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.08), this.redLightMaterial);
    tlRight.position.set(0.58, carYBase + 0.46, -2.28);
    mainBody.add(tlLeft, tlRight);

    // Rear Carbon Diffuser with Vertical Aero Fins
    const diffuserGeo = new THREE.BoxGeometry(1.65, 0.16, 0.38);
    const diffuser = new THREE.Mesh(diffuserGeo, this.carbonMaterial);
    diffuser.position.set(0, carYBase + 0.08, -2.18);
    diffuser.castShadow = true;
    mainBody.add(diffuser);

    for (let i = -2; i <= 2; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.28), this.carbonMaterial);
      fin.position.set(i * 0.28, carYBase + 0.06, -2.22);
      mainBody.add(fin);
    }

    // Quad Titanium Exhaust Tips (M Performance hallmark)
    const exhaustGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.22, 24);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({ 
      color: 0x405060, 
      metalness: 0.95, 
      roughness: 0.18 
    });

    const exhaust1 = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust1.position.set(-0.52, carYBase + 0.10, -2.32);
    const exhaust2 = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust2.position.set(-0.38, carYBase + 0.10, -2.32);
    const exhaust3 = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust3.position.set(0.38, carYBase + 0.10, -2.32);
    const exhaust4 = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust4.position.set(0.52, carYBase + 0.10, -2.32);
    mainBody.add(exhaust1, exhaust2, exhaust3, exhaust4);

    // SUV placeholder until a GLB is uploaded: the sedan body raised and bulked up, on taller wheels.
    if (bodyStyle === 'suv') mainBody.scale.set(1.05, 1.32, 1.04);
    this.proceduralWheelScale = bodyStyle === 'suv' ? 1.14 : 1;

    this.bodyMeshGroup.add(mainBody);
  }

  // ----------------------------------------------------
  // UPLOADED GLB CAR MODELS
  // ----------------------------------------------------

  /**
   * Shows the car's uploaded GLB, or the procedural body when it has none (or it fails to load).
   * Resolves to which one ended up on screen.
   */
  public async loadCar(car: CarModel): Promise<'model' | 'procedural'> {
    const token = ++this.carLoadToken;
    this.proceduralWheelScale = car.bodyStyle === 'suv' ? 1.14 : 1;
    if (car.modelUrl) {
      try {
        const template = await this.loadCarTemplate(car.modelUrl);
        if (token === this.carLoadToken) {
          this.mountCarModel(template.clone(true), car);
          this.mountedModelUrl = car.modelUrl;
        }
        return 'model';
      } catch (err) {
        console.warn(`Failed to load 3D model for ${car.name}; using procedural body.`, err);
      }
    }
    if (token === this.carLoadToken) {
      this.mountedModelUrl = null;
      this.buildBMWCarBody(car.bodyStyle);
      this.resetWheelLayout();
      this.markShadowDirty();
    }
    return 'procedural';
  }

  /** Downloads a car GLB once; every later mount clones the cached scene (geometry is shared). */
  private loadCarTemplate(url: string): Promise<THREE.Object3D> {
    let p = this.modelCache.get(url);
    if (p) {
      // Most recently used goes last
      this.modelCache.delete(url);
      this.modelCache.set(url, p);
    } else {
      p = this.getGltfLoader()
        .loadAsync(url)
        .then((gltf) => {
          gltf.scene.userData.cachedModel = true;
          if (this.isDisposed) {
            CarConfiguratorEngine.disposeScene(gltf.scene);
          } else {
            this.modelScenes.set(url, gltf.scene);
            this.evictModels(url);
          }
          return gltf.scene;
        });
      p.catch(() => this.modelCache.delete(url));
      this.modelCache.set(url, p);
    }
    this.evictModels(url);
    return p;
  }

  /** Keeps the cache to a few cars so browsing the showroom doesn't pile up GPU memory. */
  private evictModels(keep: string) {
    for (const url of this.modelCache.keys()) {
      if (this.modelCache.size <= CarConfiguratorEngine.MODEL_CACHE_MAX) break;
      if (url === keep || url === this.mountedModelUrl) continue;
      const scene = this.modelScenes.get(url);
      if (!scene) continue; // still downloading
      this.modelCache.delete(url);
      this.modelScenes.delete(url);
      CarConfiguratorEngine.disposeScene(scene);
    }
  }

  /** Drops every cached car except the one on screen (e.g. while another page has the GPU). */
  private trimModelCache() {
    for (const url of [...this.modelCache.keys()]) {
      if (url === this.mountedModelUrl) continue;
      const scene = this.modelScenes.get(url);
      if (!scene) continue; // still downloading
      this.modelCache.delete(url);
      this.modelScenes.delete(url);
      CarConfiguratorEngine.disposeScene(scene);
    }
  }

  /** Frees the GPU buffers and textures of a cached car scene that is no longer on screen. */
  private static disposeScene(scene: THREE.Object3D) {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if (!mat) return;
        Object.values(mat).forEach((v) => {
          if (v instanceof THREE.Texture) v.dispose();
        });
        mat.dispose();
      });
    });
  }

  /** Warms the model cache so switching to this car is instant. Runs when the browser is idle. */
  public preloadCar(car: CarModel) {
    const url = car.modelUrl;
    if (!url) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const run = () => {
      if (!this.isDisposed) this.loadCarTemplate(url).catch(() => {});
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 300);
  }

  /**
   * Showroom change: the current car drives out of frame, the next one drives in and stops on its
   * mark. direction 1 = forwards (next), -1 = reversing (previous).
   */
  public async driveToCar(car: CarModel, direction: 1 | -1 = 1): Promise<void> {
    const distance = 11;
    const loading = car.modelUrl ? this.loadCarTemplate(car.modelUrl).catch(() => null) : Promise.resolve(null);
    await this.animateDrive(this.carGroup.position.z, direction * distance, 0.85, true);
    await loading;
    this.carGroup.position.z = -direction * distance;
    await this.loadCar(car);
    await this.animateDrive(-direction * distance, 0, 1.25, false);
  }

  private animateDrive(from: number, to: number, duration: number, easeIn: boolean): Promise<void> {
    this.drive?.resolve();
    return new Promise((resolve) => {
      if (Math.abs(to - from) < 1e-3) {
        this.carGroup.position.z = to;
        resolve();
        return;
      }
      this.drive = { from, to, t: 0, duration, easeIn, resolve };
    });
  }

  private stepDrive(delta: number) {
    const d = this.drive;
    if (!d) return;
    d.t = Math.min(1, d.t + delta / d.duration);
    const k = d.easeIn ? d.t * d.t * d.t : 1 - Math.pow(1 - d.t, 3);
    const prevZ = this.carGroup.position.z;
    this.carGroup.position.z = d.from + (d.to - d.from) * k;
    const dz = this.carGroup.position.z - prevZ;
    // Roll the wheels by the distance travelled
    this.wheelAssemblies.forEach((a) => {
      const radius = 0.35 * a.group.scale.x;
      a.spinGroup.rotation.x += (dz / radius) * (a.isRight ? 1 : -1);
    });
    if (d.t >= 1) {
      this.drive = null;
      d.resolve();
    }
  }

  private getGltfLoader(): GLTFLoader {
    if (!this.gltfLoader) {
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath('/draco/');
      this.gltfLoader = new GLTFLoader();
      this.gltfLoader.setDRACOLoader(this.dracoLoader);
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    return this.gltfLoader;
  }

  private static safeRegex(pattern: string | undefined, fallback: string): RegExp {
    try {
      return new RegExp(pattern?.trim() || fallback, 'i');
    } catch {
      return new RegExp(fallback, 'i');
    }
  }

  private mountCarModel(model: THREE.Object3D, car: CarModel) {
    // Orient: this scene drives along Z, so turn models authored along X first.
    model.updateMatrixWorld(true);
    const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const autoTurn = rawSize.x > rawSize.z ? Math.PI / 2 : 0;
    model.rotation.y += autoTurn + THREE.MathUtils.degToRad(car.modelRotationDeg ?? 0);

    // Scale to the real car length, centre on the turntable, sit the tyres on the floor.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.multiplyScalar((car.modelLengthM || 4.7) / (Math.max(size.x, size.z) || 1));
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);

    const carBox = new THREE.Box3().setFromObject(model);
    const paintRe = CarConfiguratorEngine.safeRegex(car.paintMeshMatch, 'paint|body|carpaint|exterior');
    // Whole words only by default, so "trim" or "brim" never count as a rim.
    const legacyHide = 'wheel|rim|tyre|tire|brake|caliper|rotor';
    const hidePattern = !car.hideMeshMatch || car.hideMeshMatch.trim() === legacyHide ? CarConfiguratorEngine.DEFAULT_HIDE : car.hideMeshMatch;
    const hideRe = CarConfiguratorEngine.safeRegex(hidePattern, CarConfiguratorEngine.DEFAULT_HIDE);
    const notPaintRe = /glass|window|light|lamp|chrome|trim|rubber|interior|carbon|grille|badge|logo|plastic/i;
    const notWheelRe = /steer|arch|well|house|liner|mudguard|fender/i;
    const wheelRe = /wheel|(^|[^a-z])(rim|tyre|tire)/i;

    // Wheel bounds per corner, keyed by side of the car's centre line: front/rear + left/right.
    const corners = new Map<string, THREE.Box3>();
    const unmatched: string[] = [];
    const wheelMeshes: THREE.Mesh[] = [];
    let modelCalipers = false;

    const usedVariants = new Set<THREE.MeshPhysicalMaterial>();
    this.pendingVariants = usedVariants;
    model.traverse((obj) => {
      // SketchUp/Collada conversions carry their edge outlines as line primitives; drawn over a
      // shaded body they read as heavy black seams, so only triangle meshes are kept.
      if ((obj as THREE.Line).isLine || (obj as THREE.Points).isPoints) {
        obj.visible = false;
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.isOverlay) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materialNames = materials.map((m) => m.name).join(' ');
      const ancestry: string[] = [];
      for (let o: THREE.Object3D | null = mesh; o && o !== model.parent; o = o.parent) ancestry.push(o.name);
      const partNames = `${ancestry.join(' ')} ${materialNames}`;

      if (hideRe.test(partNames) && !notWheelRe.test(partNames)) {
        if (wheelRe.test(partNames)) wheelMeshes.push(mesh);
        if (wheelRe.test(partNames)) {
          const meshBox = new THREE.Box3().setFromObject(mesh);
          const c = meshBox.getCenter(new THREE.Vector3());
          const key = `${c.z >= 0 ? 'front' : 'rear'}-${c.x >= 0 ? 'right' : 'left'}`;
          corners.set(key, corners.get(key)?.union(meshBox) ?? meshBox);
        }
        mesh.visible = false;
        return;
      }

      const ownNames = `${mesh.name} ${materialNames}`;
      // A car whose hide pattern leaves its own calipers visible keeps them: the painted body of the
      // caliper takes the caliper colour (like ours), its hardware keeps a metal look
      if (/caliper|calliper/i.test(materialNames)) {
        mesh.material = this.kit.caliper;
        mesh.userData.modelCaliper = true;
        modelCalipers = true;
        return;
      }
      if (paintRe.test(ownNames) && !notPaintRe.test(ownNames)) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => this.paintMaterialFor(m))
          : this.paintMaterialFor(mesh.material);
      } else {
        unmatched.push(mesh.name || '(unnamed)');
        // Studio-plausible values for glass, lenses, chrome, carbon, trim, interior (services/carMaterials.ts)
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => passMaterial(m, partNames))
          : passMaterial(mesh.material, partNames);
        if (!Array.isArray(mesh.material)) {
          const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
          mesh.material = blackenGrilleChrome(mesh.material, c, carBox);
        }
        bindEnvironment(mesh.material, this.scene.environment, this.scene.environmentIntensity);
        // Full-strength Fresnel reflections on single-material glazing (see glassReflectionMaterial)
        // (a cached model mounted again arrives with the overlay child cloned along: never twice)
        const glass = !Array.isArray(mesh.material) && mesh.material.userData.partKind === 'glass';
        if (glass && !mesh.children.some((c) => c.userData.isOverlay)) {
          const glassMat = glassReflectionMaterial();
          bindEnvironment(glassMat, this.scene.environment, this.scene.environmentIntensity);
          const overlay = new THREE.Mesh(mesh.geometry, glassMat);
          overlay.name = 'glass_reflection';
          overlay.renderOrder = mesh.renderOrder + 1;
          overlay.userData.isOverlay = true;
          overlay.castShadow = false;
          mesh.add(overlay);
        }
      }
    });

    // Leftover pieces of the model's own wheels filed under other materials (the M3's hub discs
    // are part of a body-paint mesh): triangles inside a tyre cylinder are cut away, and parts
    // made only of such triangles are hidden. A cylinder, not the wheel's box: fender lips sit
    // inside the box corners but outside the tyre. (Same space as the wheel boxes: before the
    // model joins the scene.)
    // All four wheels merged into one mesh: split its vertices by side of the car instead.
    if (corners.size < 4 && wheelMeshes.length) {
      const byVertex = CarConfiguratorEngine.cornersFromVertices(wheelMeshes);
      if (byVertex.size === 4) byVertex.forEach((box, key) => corners.set(key, box));
    }
    if (corners.size === 4) CarConfiguratorEngine.stripLeftoverWheelParts(model, [...corners.values()]);

    // The model's own calipers replace ours (they match its brakes and arches)
    this.wheelAssemblies.forEach((a) => (a.caliper.visible = !modelCalipers));

    this.disposeBody();
    this.bodyMeshGroup.add(model);
    this.paintVariants = usedVariants;
    this.markShadowDirty();
    this.syncRenderedBody();


    if (corners.size === 4) {
      this.wheelAssemblies.forEach((a) => {
        const key = `${a.isFront ? 'front' : 'rear'}-${a.isRight ? 'right' : 'left'}`;
        const cornerBox = corners.get(key)!;
        const c = cornerBox.getCenter(new THREE.Vector3());
        const tyreRadius = cornerBox.getSize(new THREE.Vector3()).y / 2;
        a.group.position.set(c.x, c.y, c.z);
        a.group.scale.setScalar(tyreRadius / 0.35); // procedural tyre radius
      });
    } else {
      this.resetWheelLayout();
      console.warn(
        `${car.name}: found ${corners.size}/4 wheels by name, so default wheel positions are used. ` +
        'Adjust "Hide mesh names" in the admin. Unpainted meshes:', unmatched.slice(0, 40)
      );
    }
  }

  private static stripLeftoverWheelParts(model: THREE.Object3D, wheelBoxes: THREE.Box3[]) {
    const wheels = wheelBoxes.map((b) => {
      const size = b.getSize(new THREE.Vector3());
      return { c: b.getCenter(new THREE.Vector3()), r2: (size.y * 0.485) ** 2, hx: size.x / 2 + 0.01 };
    });
    const inWheel = (v: THREE.Vector3) =>
      wheels.some((w) => Math.abs(v.x - w.c.x) <= w.hx && (v.y - w.c.y) ** 2 + (v.z - w.c.z) ** 2 <= w.r2);
    const v = new THREE.Vector3();
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || mesh.userData.isOverlay || mesh.userData.modelCaliper) return;
      const geo = mesh.geometry;
      // Decided once per geometry: a cached model is mounted as a clone whose userData is a copy,
      // but whose geometry is shared, so the decision lives on the geometry
      const done = geo.userData.wheelStripped as 'hidden' | 'kept' | undefined;
      if (done) {
        if (done === 'hidden') mesh.visible = false;
        return;
      }
      const pos = geo.attributes.position;
      if (!pos) return;
      const inside = new Uint8Array(pos.count);
      let any = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (inWheel(v)) { inside[i] = 1; any++; }
      }
      geo.userData.wheelStripped = any === pos.count ? 'hidden' : 'kept';
      if (!any) return;
      if (any === pos.count) {
        mesh.visible = false;
        return;
      }
      if (geo.groups.length > 1) return; // multi-material: leave the index (and its groups) alone
      const index = geo.index;
      const tri = index ? index.count : pos.count;
      const keep: number[] = [];
      for (let t = 0; t < tri; t += 3) {
        const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
        if (inside[a] && inside[b] && inside[c]) continue;
        keep.push(a, b, c);
      }
      if (keep.length < tri) {
        geo.setIndex(keep);
        geo.clearGroups();
      }
    });
  }

  private static cornersFromVertices(meshes: THREE.Mesh[]): Map<string, THREE.Box3> {
    const corners = new Map<string, THREE.Box3>();
    const v = new THREE.Vector3();
    meshes.forEach((mesh) => {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 20000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const key = `${v.z >= 0 ? 'front' : 'rear'}-${v.x >= 0 ? 'right' : 'left'}`;
        const box = corners.get(key) ?? new THREE.Box3();
        box.expandByPoint(v);
        corners.set(key, box);
      }
    });
    return corners;
  }

  private resetWheelLayout() {
    if (this.isShowcase) return;
    const k = this.proceduralWheelScale;
    this.wheelAssemblies.forEach((a, i) => {
      const p = this.defaultWheelLayout[i];
      if (p) a.group.position.set(p.x * (1 + (k - 1) * 0.5), p.y * k, p.z);
      a.group.scale.setScalar(k);
    });
  }

  // ----------------------------------------------------
  // SHOWCASE MODE (single rim detail page)
  // ----------------------------------------------------
  private setupShowcase() {
    this.buildWheels();
    // Keep one right-hand wheel (its face points at +X, towards the camera) and centre it.
    const keep = this.wheelAssemblies.find((a) => a.isFront && a.isRight)!;
    this.wheelAssemblies
      .filter((a) => a !== keep)
      .forEach((a) => this.wheelsGroup.remove(a.group));
    this.wheelAssemblies = [keep];
    keep.group.position.set(0, 0.35, 0);
    this.zoomRange = { min: 0.6, max: 3.0 };
    this.targetLookAt.set(0, 0.35, 0);
    this.currentLookAt.set(0, 0.35, 0);
    this.spherical = { radius: 1.5, theta: Math.PI / 2, phi: 1.42 };
    this.targetSpherical = { ...this.spherical };
  }

  /** Stops rendering while the canvas is hidden (e.g. another page is on top). */
  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (paused) this.trimModelCache();
    else this.requestRender();
  }

  /** Removes the current body; GLB geometry is disposed, shared studio materials are kept. */
  private disposeBody() {
    // hand a cached model back with its own materials (see syncRenderedBody)
    this.bodyMeshGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.userData.liveMaterial) {
        mesh.material = mesh.userData.liveMaterial;
        delete mesh.userData.liveMaterial;
        mesh.renderOrder = 0;
      }
    });
    this.bodyMeshGroup.children.forEach((child) => {
      if (child.userData.cachedModel) return; // geometry shared with the cached GLB
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
    });
    this.bodyMeshGroup.clear();
  }

  // ----------------------------------------------------
  // HIGH-DETAIL FORGED WHEEL ASSEMBLIES
  // ----------------------------------------------------
  private buildWheels() {
    // Clear existing (tyres and rim shells stay in their caches)
    while (this.wheelsGroup.children.length > 0) {
      this.wheelsGroup.remove(this.wheelsGroup.children[0]);
    }
    this.wheelAssemblies = [];

    // BMW M Wheelbase & Track Specs
    const wheelPositions = [
      { x: -0.92, y: 0.35, z: 1.45, isFront: true, isRight: false },  // Front Left
      { x: 0.92, y: 0.35, z: 1.45, isFront: true, isRight: true },    // Front Right
      { x: -0.94, y: 0.35, z: -1.38, isFront: false, isRight: false }, // Rear Left (wider track)
      { x: 0.94, y: 0.35, z: -1.38, isFront: false, isRight: true }    // Rear Right (wider track)
    ];

    this.defaultWheelLayout = wheelPositions.map(({ x, y, z }) => ({ x, y, z }));

    wheelPositions.forEach((wp) => {
      const group = new THREE.Group();
      group.position.set(wp.x, wp.y, wp.z);
      // Right-hand wheels face +X; left-hand ones are turned round so their face points -X
      group.rotation.y = wp.isRight ? 0 : Math.PI;

      // 265/35 front, 295/35 rear on a 20" rim (outer radius 0.35 m); the spin group turns on X
      const dims: WheelDims = { tyreRadius: 0.35, tyreWidth: wp.isFront ? 0.265 : 0.295, rimScale: this.rimScale, isFront: wp.isFront };
      const spinGroup = new THREE.Group();
      group.add(spinGroup);

      const spokeMeshGroup = new THREE.Group();
      spokeMeshGroup.position.x = rimLayout(dims).faceEdgeX;
      spinGroup.add(spokeMeshGroup);

      const hub = buildHub(dims, this.kit);
      const disc = buildDisc(dims, this.kit);
      spinGroup.add(hub, disc);
      const caliper = buildCaliper(dims, this.kit, wp.isRight);
      group.add(caliper);

      this.wheelsGroup.add(group);
      this.wheelAssemblies.push({
        group,
        spinGroup,
        spokeMeshGroup,
        tyre: null,
        rim: null,
        hub,
        disc,
        caliper,
        dims,
        isFront: wp.isFront,
        isRight: wp.isRight
      });
    });

    this.syncWheelShells();
    this.readyScales.add(this.rimScale); // built here; its textures go up with the first frame
  }

  /** A tyre per rim size; the two wheels of an axle share one (a clone of the same meshes). */
  private tyreFor(a: (typeof this.wheelAssemblies)[number], s: number): THREE.Group {
    const key = `${a.group.id}|${s}`;
    let g = this.wheelPartCache.get(`tyre|${key}`);
    if (!g) {
      const tk = `${a.isFront}|${s}`;
      const template = this.tyreTemplates.get(tk);
      if (template) g = template.clone();
      else {
        g = buildTyre({ ...a.dims, rimScale: s }, this.kit);
        this.tyreTemplates.set(tk, g);
      }
      this.wheelPartCache.set(`tyre|${key}`, g);
    }
    return g;
  }

  /** Lip + barrel (+ lip bolts) per lip style and rim size; shared across an axle like the tyre. */
  private rimShellFor(a: (typeof this.wheelAssemblies)[number], lip: LipStyle, s: number): THREE.Group {
    const key = `${a.group.id}|${lip}|${s}`;
    let g = this.wheelPartCache.get(`rim|${key}`);
    if (!g) {
      const tk = `${lip}|${a.isFront}|${s}`;
      const template = this.shellTemplates.get(tk);
      if (template) g = template.clone();
      else {
        const shell = buildRimShell({ ...a.dims, rimScale: s }, lip, this.wheelMaterial, this.barrelMaterial, this.kit);
        g = new THREE.Group();
        g.name = 'rim_shell';
        g.add(shell.lipMesh, shell.barrelMesh);
        if (shell.bolts) g.add(shell.bolts);
        this.shellTemplates.set(tk, g);
      }
      this.wheelPartCache.set(`rim|${key}`, g);
    }
    return g;
  }

  /**
   * Shows the tyre and rim shell for the current rim size and lip style (cached: a change swaps
   * groups, nothing is rebuilt once seen) and scales the spoke faces to the rim.
   */
  private syncWheelShells() {
    const s = this.rimScale;
    this.wheelAssemblies.forEach((a) => {
      a.dims = { ...a.dims, rimScale: s };
      const tyre = this.tyreFor(a, s);
      if (a.tyre !== tyre) {
        if (a.tyre) a.spinGroup.remove(a.tyre);
        a.tyre = tyre;
        a.spinGroup.add(tyre);
      }
      const rim = this.rimShellFor(a, this.lipStyle, s);
      if (a.rim !== rim) {
        if (a.rim) a.spinGroup.remove(a.rim);
        a.rim = rim;
        a.spinGroup.add(rim);
      }
      rim.visible = this.wheelMode !== 'model';
      // Spoke faces are built for 20"; they scale across the face, not in depth
      a.spokeMeshGroup.scale.set(1, s, s);
    });
  }

  /** Frees every cached tyre and rim shell (engine cleanup). */
  private disposeWheelShells() {
    this.wheelAssemblies.forEach((a) => {
      if (a.tyre) a.spinGroup.remove(a.tyre);
      if (a.rim) a.spinGroup.remove(a.rim);
      a.tyre = a.rim = null;
    });
    this.tyreTemplates.forEach((t) => (t.userData.dispose as (() => void) | undefined)?.());
    this.shellTemplates.forEach((g) =>
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      })
    );
    // instanced bolts: each clone has its own instance matrix on the GPU
    this.wheelPartCache.forEach((g) => g.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose()));
    this.shellTemplates.forEach((g) => g.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose()));
    this.tyreTemplates.clear();
    this.shellTemplates.clear();
    this.wheelPartCache.clear();
  }

  /** Resizes the rim inside a fixed tyre, e.g. '21"'. Bigger rim = thinner sidewall, like a real upgrade. */
  public setRimSize(size: string) {
    const scale = CarConfiguratorEngine.rimScaleFor(size);
    if (Math.abs(scale - this.rimScale) < 1e-6 && this.wheelAssemblies.every((a) => a.tyre)) return;
    this.rimScale = scale;
    // A wheel picked with a new size changes size when its spokes arrive, all in one frame
    if (this.pendingWheelToken !== null) return;
    // A size seen (or prepared) before swaps meshes now; a new one is prepared a slice at a time
    // first, with the current size staying on screen until it is ready
    const apply = () => {
      if (this.isDisposed || this.pendingWheelToken !== null || scale !== this.rimScale) return;
      this.syncWheelShells();
      this.markShadowDirty(3);
    };
    if (this.readyScales.has(scale)) apply();
    else this.prepareRimSize(scale, true).then(apply);
  }

  private static rimScaleFor(size: string) {
    const inches = parseFloat(size);
    return THREE.MathUtils.clamp(Number.isFinite(inches) ? inches / 20 : 1, 0.8, 1.2);
  }

  /**
   * Gets a rim size ready to show without a long task: the sidewall lettering a slice per idle
   * moment, then each tyre, then each new texture sent to the GPU on its own (the first frame of
   * a new size used to upload four 4096 x 256 maps at once). `urgent` (the customer picked it)
   * shortens the idle waits; a background preparation already running is hurried along.
   */
  private prepareRimSize(s: number, urgent: boolean): Promise<void> {
    if (this.readyScales.has(s)) return Promise.resolve();
    const running = this.sizeJobs.get(s);
    if (running) {
      if (urgent) running.urgent = true;
      return running.promise;
    }
    const job = { urgent, promise: Promise.resolve() };
    const idle = () => new Promise<IdleDeadline | undefined>((resolve) => CarConfiguratorEngine.whenIdle(resolve, job.urgent ? 50 : 3000));
    job.promise = (async () => {
      const assemblies = this.wheelAssemblies;
      for (const a of assemblies.filter((x) => x.isRight)) {
        await prepareSidewallMaps(tyreSizeLabel({ ...a.dims, rimScale: s }), () => job.urgent);
      }
      // the tyres themselves (lathes; the lettering is ready): as many per idle moment as fit
      const todo = assemblies.slice();
      while (todo.length) {
        const deadline = await idle();
        if (this.isDisposed) return;
        do this.tyreFor(todo.shift()!, s);
        while (todo.length && deadline && deadline.timeRemaining() > 12);
      }
      const textures = new Set<THREE.Texture>();
      assemblies.forEach((a) =>
        this.tyreFor(a, s).traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (mat && !Array.isArray(mat)) [mat.map, mat.normalMap, mat.roughnessMap].forEach((t) => t && textures.add(t));
        })
      );
      for (const t of textures) {
        await idle();
        if (this.isDisposed) return;
        this.renderer.initTexture(t);
      }
      this.readyScales.add(s);
    })();
    job.promise = job.promise.catch((err) => {
      // shown anyway: the tyres are then built when the size is shown, as they used to be
      console.warn('Could not prepare the rim size ahead; building it when shown.', err);
      this.readyScales.add(s);
    });
    job.promise.finally(() => this.sizeJobs.delete(s));
    this.sizeJobs.set(s, job);
    return job.promise;
  }

  /**
   * Prepares the tyres and rim shells for these sizes ahead of time, in idle time and the sizes
   * next to the current one first, so a size change only swaps meshes.
   */
  public preloadRimSizes(sizes: string[]) {
    if (this.isDisposed) return;
    // Only the current size and its two nearest: each size's sidewall lettering costs ~8 MB of page
    // memory and ~10 MB on the GPU, too much to hold for every size on older phones. Further sizes
    // are still prepared in idle slices when picked.
    const scales = [...new Set([this.rimScale, ...sizes.map((s) => CarConfiguratorEngine.rimScaleFor(s))])]
      .sort((x, y) => Math.abs(x - this.rimScale) - Math.abs(y - this.rimScale))
      .slice(0, 3)
      .filter((s) => !this.sizesPreloaded.has(s));
    scales.forEach((s) => this.sizesPreloaded.add(s));
    (async () => {
      for (const s of scales) {
        await this.prepareRimSize(s, false);
        // the rim shells of every lip style (a pick can change lip and size together)
        const shells = (['mono', 'two', 'three'] as LipStyle[]).flatMap((lip) => this.wheelAssemblies.map((a) => () => this.rimShellFor(a, lip, s)));
        while (shells.length) {
          const deadline = await new Promise<IdleDeadline | undefined>((resolve) => CarConfiguratorEngine.whenIdle(resolve));
          if (this.isDisposed) return;
          do shells.shift()!();
          while (shells.length && deadline && deadline.timeRemaining() > 12);
        }
      }
    })();
  }

  private static whenIdle(fn: (deadline?: IdleDeadline) => void, timeout = 3000) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback((d) => fn(d), { timeout });
    else setTimeout(() => fn(), Math.min(timeout, 200));
  }

  // ----------------------------------------------------
  // PROCEDURAL SPOKE GENERATION FOR FORGED WHEEL DESIGNS
  // ----------------------------------------------------
  public applyWheelDesign(wheel: WheelDesign, custom2DConfig?: Custom2DWheelConfig) {
    const token = ++this.wheelDesignToken;

    // A 2D guide image wins; otherwise an uploaded rim PNG replaces the procedural spokes.
    const imageConfig: Custom2DWheelConfig | null = custom2DConfig?.imageUrl
      ? custom2DConfig
      : wheel.imageUrl
        ? { imageUrl: wheel.imageUrl, name: wheel.name, bumpScale: 0.006, invertAlpha: false, spokeThreshold: 0.15, extrude: wheel.imageExtrude !== false }
        : null;
    const modelUrl = custom2DConfig?.imageUrl ? null : wheel.modelUrl;
    const mode = modelUrl ? 'model' : imageConfig ? 'image' : 'procedural';
    // Two- and three-piece designs get a polished, bolted lip
    const lip = lipStyleFor(wheel.style, wheel.name);

    // The wheel on screen stays as it is until the new one is ready; then spokes, lip, size and
    // the hub change together, in one frame. A newer pick (token) makes an older result stale.
    this.pendingWheelToken = token;
    const commit = (mount: () => void) => {
      if (token !== this.wheelDesignToken || this.isDisposed) return;
      if (!this.readyScales.has(this.rimScale)) {
        // picked together with a size not prepared yet: both arrive together
        this.prepareRimSize(this.rimScale, true).then(() => commit(mount));
        return;
      }
      this.pendingWheelToken = null;
      this.wheelMode = mode;
      this.lipStyle = lip;
      this.clearSpokes();
      this.syncWheelShells();
      this.wheelAssemblies.forEach((a) => {
        // A GLB rim brings its own barrel, lip and centre
        if (a.rim) a.rim.visible = mode !== 'model';
        a.hub.visible = mode !== 'model';
      });
      mount();
      this.markShadowDirty(3);
    };

    if (modelUrl) {
      this.loadRimModel(modelUrl).then(
        (template) => commit(() => this.wheelAssemblies.forEach((a) => this.mountRimModel(a.spokeMeshGroup, template, !!wheel.modelFlip))),
        (err) => {
          console.warn(`Failed to load 3D rim for ${wheel.name}; falling back.`, err);
          if (token === this.wheelDesignToken) this.applyWheelDesign({ ...wheel, modelUrl: null });
        }
      );
      return;
    }

    if (imageConfig && imageConfig.extrude !== false) {
      // Photo -> cleaned, symmetric spoke mask -> bevelled concave 3D face in the wheel's finish
      // (built in a worker; cached per image, and usually prepared ahead by preloadWheels)
      this.loadRimFace(imageConfig.imageUrl, RIM_FACE_MASKS[wheel.id], RIM_FACE_OPTIONS[wheel.id]).then(
        (faces) =>
          commit(() => {
            if (!faces) {
              this.wheelAssemblies.forEach((a) => this.applyCustom2DSpokeTexture(a.spokeMeshGroup, { ...imageConfig, extrude: false }, a.isFront, token));
              return;
            }
            this.wheelAssemblies.forEach((a) => {
              const face = new THREE.Mesh(a.isFront ? faces.front : faces.rear, this.wheelMaterial);
              face.name = 'rim_spokes';
              a.spokeMeshGroup.add(face);
            });
          }),
        (err) => {
          console.warn('Failed to build the rim face from its image:', err);
          commit(() => {});
        }
      );
      return;
    }

    commit(() =>
      this.wheelAssemblies.forEach((assembly) => {
        if (imageConfig) {
          this.applyCustom2DSpokeTexture(assembly.spokeMeshGroup, imageConfig, assembly.isFront, token);
          return;
        }
        const concavity = rimLayout(assembly.dims).dish;
        const mirror = !assembly.isRight && (wheel.spokeType === 'directional' || wheel.spokeType === 'aerodisc');
        const face = new THREE.Mesh(this.getProceduralFaceGeometry(wheel, mirror, concavity), this.wheelMaterial);
        assembly.spokeMeshGroup.add(face);
        if (wheel.spokeType === 'clubsport') this.addLipBolts(assembly.spokeMeshGroup);
      })
    );
  }

  /**
   * Takes the current spokes off. Geometry made for one mount (flat image discs, lip bolts) is
   * freed; cached geometry is kept. GLB / flat-image face materials are disposed after the next
   * frame, so a successor with the same shader takes the program over instead of recompiling it.
   */
  private clearSpokes() {
    this.wheelAssemblies.forEach((a) => {
      for (const child of a.spokeMeshGroup.children.slice()) {
        a.spokeMeshGroup.remove(child);
        child.traverse((o) => {
          if (o.userData.ownGeometry) (o as THREE.Mesh).geometry.dispose();
        });
      }
    });
    this.retiredMaterials.push(...this.customFaceMaterials);
    this.customFaceMaterials = [];
  }

  /**
   * Prepares the 3D spokes of every photo wheel in the background, nearest to the current one in
   * the list first, one at a time in idle time (rimFaceAsync's queue), so picking one later only
   * swaps meshes. A pick jumps the queue.
   */
  public preloadWheels(wheels: WheelDesign[], currentId?: string) {
    if (this.isDisposed || this.isShowcase) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const list = wheels.filter((w) => w.imageUrl && w.imageExtrude !== false && !w.modelUrl);
    const at = Math.max(0, list.findIndex((w) => w.id === currentId));
    const order: WheelDesign[] = [];
    // from d = 0: when the current wheel isn't a photo wheel, list[at] still needs preparing
    for (let d = 0; d < list.length; d++) {
      for (const i of [at + d, at - d]) {
        const w = list[((i % list.length) + list.length) % list.length];
        if (w && w.id !== currentId && !order.includes(w)) order.push(w);
      }
    }
    order.forEach((w) => this.loadRimFace(w.imageUrl!, RIM_FACE_MASKS[w.id], RIM_FACE_OPTIONS[w.id], 'low').catch(() => {}));
  }

  /** 3D spoke faces (front and rear dish) from a rim photo; cached per image. */
  private loadRimFace(photoUrl: string, faceMaskUrl?: string, options: RimPhotoOptions = {}, priority: RimFacePriority = 'high') {
    // a prepared face mask (rimFaces.ts) replaces the photo for the 3D spokes
    const url = faceMaskUrl ?? photoUrl;
    const opts: RimPhotoOptions = { ...options, cleanFace: !!faceMaskUrl };
    const key = `${url}|${JSON.stringify(opts)}`;
    let p = this.rimFaceCache.get(key);
    if (!p) {
      // fetch, decode, mask, trace and extrude, all in the rim face worker
      p = buildRimFacesAsync(url, opts, priority);
      p.catch(() => this.rimFaceCache.delete(key));
      this.rimFaceCache.set(key, p);
    } else if (priority === 'high') {
      promoteRimFace(url, opts); // queued for the background: now it is wanted
    }
    return p;
  }

  private getProceduralFaceGeometry(wheel: WheelDesign, mirror: boolean, dish: number): THREE.BufferGeometry {
    const key = `proc|${wheel.spokeType}|${wheel.spokeCount}|${mirror}|${dish}`;
    let geo = this.rimFaceGeometryCache.get(key);
    if (!geo) {
      // curveSegments: the outer face is a full-circle curve; the default of 1 samples only
      // two (coincident) points around it, leaving the rim's outer boundary undefined for
      // triangulation. A real segment count gives every procedural design a round, not
      // degenerate, outer edge.
      geo = buildRimFaceGeometry(proceduralRimShapes(wheel, mirror), {
        radius: 0.245,
        depth: 0.028,
        dish,
        bevel: 0.0045,
        curveSegments: 64
      });
      this.rimFaceGeometryCache.set(key, geo);
    }
    return geo;
  }

  /** Two-piece look: a ring of titanium bolts around the face's outer lip. */
  private addLipBolts(parent: THREE.Group) {
    const boltGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 8);
    boltGeo.rotateZ(Math.PI / 2);
    for (let b = 0; b < 24; b++) {
      const a = (b * Math.PI * 2) / 24;
      const bolt = new THREE.Mesh(boltGeo, this.chromeMaterial);
      bolt.userData.ownGeometry = true; // made for this mount: freed when the spokes change
      bolt.position.set(0.003, Math.cos(a) * 0.245 * 0.93, Math.sin(a) * 0.245 * 0.93);
      parent.add(bolt);
    }
  }

  // ----------------------------------------------------
  // 2D-TO-3D WHEEL IMAGE PROJECTION PIPELINE
  // ----------------------------------------------------
  private loadWheelTexture(url: string): Promise<THREE.Texture> {
    const cached = this.wheelTextureCache.get(url);
    if (cached) return Promise.resolve(cached);
    return new THREE.TextureLoader().loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.wheelTextureCache.set(url, texture);
      return texture;
    });
  }

  /** Solid spokes traced from the image's transparency; null if it has none (or can't be read). */
  private getRimFaceGeometry(url: string, texture: THREE.Texture, dish: number): THREE.BufferGeometry | null {
    if (!this.rimShapeCache.has(url)) {
      let shapes: THREE.Shape[] | null = null;
      try {
        shapes = traceRimShapes(texture.image as HTMLImageElement, 0.5);
      } catch (err) {
        console.warn('Could not read rim image pixels (CORS?); showing it flat.', err);
      }
      this.rimShapeCache.set(url, shapes);
    }
    const shapes = this.rimShapeCache.get(url);
    if (!shapes) return null;
    const key = `${url}|${dish}`;
    let geo = this.rimFaceGeometryCache.get(key);
    if (!geo) {
      geo = buildRimFaceGeometry(shapes, { radius: 0.245, depth: 0.03, dish });
      this.rimFaceGeometryCache.set(key, geo);
    }
    return geo;
  }

  private loadRimModel(url: string): Promise<THREE.Object3D> {
    let p = this.rimModelCache.get(url);
    if (!p) {
      p = this.getGltfLoader().loadAsync(url).then((g) => g.scene);
      p.catch(() => this.rimModelCache.delete(url));
      this.rimModelCache.set(url, p);
    }
    return p;
  }

  /**
   * Fits a GLB rim into the wheel: its thinnest axis becomes the axle, it is scaled to the rim
   * diameter, centred, and its face placed at the outer face of the tyre. Materials take the finish.
   */
  private mountRimModel(parent: THREE.Group, template: THREE.Object3D, flip: boolean) {
    const rim = template.clone(true);
    const align = new THREE.Group();
    align.add(rim);
    const raw = new THREE.Box3().setFromObject(rim).getSize(new THREE.Vector3());
    if (raw.y <= raw.x && raw.y <= raw.z) align.rotation.z = Math.PI / 2; // thin along Y -> X
    else if (raw.z <= raw.x && raw.z <= raw.y) align.rotation.y = Math.PI / 2; // thin along Z -> X
    const holder = new THREE.Group();
    holder.add(align);
    // Left-hand assemblies are already turned 180°, so +X is outward on both sides of the car.
    if (flip) holder.rotation.y = Math.PI;

    holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    holder.scale.setScalar((2 * 0.26) / (Math.max(size.y, size.z) || 1)); // 20" base rim diameter
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    holder.position.set(-box.max.x + 0.01, -c.y, -c.z);

    // One finish material per mounted rim: CAD exports can hold hundreds of bodies. A per-mesh copy is
    // kept only where the GLB brings its own texture or normal map.
    const shared = new THREE.MeshPhysicalMaterial({
      color: this.wheelMaterial.color.clone(),
      metalness: this.wheelMaterial.metalness,
      roughness: this.wheelMaterial.roughness,
      clearcoat: this.wheelMaterial.clearcoat,
      clearcoatRoughness: this.wheelMaterial.clearcoatRoughness,
      envMap: this.wheelMaterial.envMap
    });
    this.customFaceMaterials.push(shared);
    rim.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true; // spokes shade the barrel, as on the procedural and photo rims
      const old = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      if (old?.map || old?.normalMap) {
        const mat = shared.clone();
        mat.map = old.map ?? null;
        mat.normalMap = old.normalMap ?? null;
        this.customFaceMaterials.push(mat);
        mesh.material = mat;
      } else {
        mesh.material = shared;
      }
    });
    parent.add(holder);
  }

  private applyCustom2DSpokeTexture(parent: THREE.Group, config: Custom2DWheelConfig, isFront: boolean, token: number) {
    this.loadWheelTexture(config.imageUrl).then(
      (texture) => {
        // A newer design was selected while this image loaded.
        if (token !== this.wheelDesignToken) return;

        const outerR = 0.245;
        const concavity = isFront ? 0.025 : 0.055;

        const solid = config.extrude !== false ? this.getRimFaceGeometry(config.imageUrl, texture, concavity) : null;
        if (solid) {
          const mat = new THREE.MeshPhysicalMaterial({
            map: texture,
            metalness: this.wheelMaterial.metalness,
            roughness: this.wheelMaterial.roughness,
            clearcoat: this.wheelMaterial.clearcoat,
            clearcoatRoughness: this.wheelMaterial.clearcoatRoughness,
            color: this.wheelMaterial.color.clone(),
            envMap: this.wheelMaterial.envMap,
            bumpMap: texture,
            bumpScale: 0.002
          });
          this.customFaceMaterials.push(mat);
          const face = new THREE.Mesh(solid, mat);
          face.castShadow = true;
          face.receiveShadow = true;
          parent.add(face);
          this.markShadowDirty(3);
          return;
        }

        // No usable cut-out (or extrusion off): dual-sided circular face disc with alpha cutout
        const faceGeo = new THREE.CircleGeometry(outerR, 64);
        faceGeo.rotateY(Math.PI / 2);

        const customMat = new THREE.MeshPhysicalMaterial({
          map: texture,
          transparent: true,
          alphaTest: config.spokeThreshold || 0.15,
          metalness: this.wheelMaterial.metalness,
          roughness: this.wheelMaterial.roughness,
          clearcoat: this.wheelMaterial.clearcoat,
          clearcoatRoughness: this.wheelMaterial.clearcoatRoughness,
          color: this.wheelMaterial.color,
          envMap: this.wheelMaterial.envMap,
          bumpMap: texture,
          bumpScale: config.bumpScale || 0.012,
          side: THREE.DoubleSide
        });

        this.customFaceMaterials.push(customMat);
        const faceMesh = new THREE.Mesh(faceGeo, customMat);
        faceMesh.userData.ownGeometry = true;
        faceMesh.position.x = -concavity * 0.5;
        parent.add(faceMesh);

        // Add 3D structural back support ring
        const supportRing = new THREE.Mesh(
          new THREE.TorusGeometry(outerR * 0.95, 0.01, 16, 48),
          this.wheelMaterial
        );
        supportRing.userData.ownGeometry = true;
        supportRing.position.x = -concavity * 0.6;
        supportRing.rotation.y = Math.PI / 2;
        parent.add(supportRing);
        this.markShadowDirty(3);
      },
      (err) => {
        console.warn('Failed to load custom 2D wheel texture:', err);
      }
    );
  }

  // ----------------------------------------------------
  // COLOR & FINISH UPDATES
  // ----------------------------------------------------
  /**
   * How strongly the painted body reflects the studio HDRI. At 1 the overhead softbox washes the bonnet
   * and roof out to flat white; ~0.45 keeps a crisp softbox reflection with the paint colour showing
   * through, which is how BMW's own studio renders read.
   */
  static BODY_ENV_INTENSITY: number = (() => {
    const m = typeof window !== 'undefined' ? /[?&]bodyenv=([0-9.]+)/.exec(window.location.search) : null;
    return m ? +m[1] : 0.45;
  })();
  /** Overall strength of the generated softbox studio (scene.environmentIntensity). */
  static SOFTBOX_INTENSITY: number = (() => {
    const m = typeof window !== 'undefined' ? /[?&]envi=([0-9.]+)/.exec(window.location.search) : null;
    return m ? +m[1] : 0.28;
  })();
  /** Paint gloss: the base coat's roughness is scaled and the clear coat made sharper (?gloss= compares). */
  static GLOSS: number = (() => {
    const m = typeof window !== 'undefined' ? /[?&]gloss=([0-9.]+)/.exec(window.location.search) : null;
    return m ? +m[1] : 0.65;
  })();

  private currentPaint: PaintColor | null = null;

  public applyPaintColor(paint: PaintColor) {
    this.currentPaint = paint;
    for (const m of [this.carBodyMaterial, ...this.paintVariants]) {
      applyPaintLayers(m, paint);
      m.envMapIntensity = CarConfiguratorEngine.BODY_ENV_INTENSITY;
      m.color.set(paint.hex);
      // Gloss: a sharper clear coat and a smoother base coat for glossy paints; Frozen stays matte
      const glossy = paint.type !== 'Frozen';
      const g = glossy ? CarConfiguratorEngine.GLOSS : 1;
      m.roughness = paint.roughness * g;
      m.metalness = paint.metalness;
      m.clearcoat = paint.clearcoat;
      m.clearcoatRoughness = glossy ? Math.min(paint.clearcoatRoughness, 0.025) : paint.clearcoatRoughness;
      m.needsUpdate = true;
    }
    this.requestRender();
  }

  /**
   * The paint for one body material. The model's own colour map is dropped (it is the baked original
   * colour), but its surface detail (panel-gap normal map, ambient occlusion) is kept on a copy of the
   * paint, so painted panels keep the shading the artist baked in.
   */
  private paintMaterialFor(src: THREE.Material): THREE.MeshPhysicalMaterial {
    const own = src as THREE.MeshPhysicalMaterial;
    if (own === this.carBodyMaterial) return own;
    if (own.userData?.paintVariant) {
      this.pendingVariants.add(own); // cached model mounted again
      return own;
    }
    if (!own.normalMap && !own.aoMap) return this.carBodyMaterial;
    const m = this.carBodyMaterial.clone();
    m.userData = { paintVariant: true };
    installPaintLayers(m);
    if (this.currentPaint) applyPaintLayers(m, this.currentPaint);
    if (own.normalMap) {
      m.normalMap = own.normalMap;
      m.normalMapType = own.normalMapType;
      if (own.normalScale) m.normalScale.copy(own.normalScale);
    }
    if (own.aoMap) {
      m.aoMap = own.aoMap;
      m.aoMapIntensity = own.aoMapIntensity ?? 1;
    }
    this.pendingVariants.add(m);
    return m;
  }

  public applyWheelFinish(finish: WheelFinish) {
    // The admin's four numbers are read as a layered coating (polished metal, gloss paint, satin
    // metallic or metallic paint): see wheelFinish.ts
    const look = finishLook(finish);
    applyFinishLook(this.wheelMaterial, look);

    // The barrel's inside: same finish, a little darker and less polished (it is also in shadow)
    // (direct studio lights reach it unshadowed, so it is darkened well below the face colour)
    this.barrelMaterial.color.copy(look.color).multiplyScalar(0.4);
    this.barrelMaterial.roughness = Math.min(1, look.roughness + 0.15);
    this.barrelMaterial.metalness = look.metalness;
    this.barrelMaterial.clearcoat = look.clearcoat * 0.5;
    this.barrelMaterial.clearcoatRoughness = Math.min(1, look.clearcoatRoughness + 0.1);
    this.barrelMaterial.specularIntensity = look.kind === 'gloss-paint' ? 0 : 1; // see applyFinishLook
    this.barrelMaterial.needsUpdate = true;

    // GLB and flat image rim faces take the finish too (without flake: their units vary)
    this.customFaceMaterials.forEach((m) => applyFinishLook(m, look));
    this.requestRender(); // a still camera would otherwise show it on the next heartbeat (up to 1 s)
  }

  public applyCaliperColor(caliper: CaliperColor) {
    this.kit.caliper.color.set(caliper.hex);
    this.kit.caliper.needsUpdate = true;
  }

  public setRideHeight(dropMeters: number) {
    this.rideHeightOffset = dropMeters;
    // Lower car chassis relative to wheels
    this.bodyMeshGroup.position.y = dropMeters;
    this.markShadowDirty(10);
  }

  // ----------------------------------------------------
  // CAMERA VIEW PRESETS (Aston Martin style)
  // ----------------------------------------------------
  public setCameraPreset(view: CameraViewPreset, opts: { instant?: boolean; aspect?: number } = {}) {
    if (this.renderedBody) opts = { instant: true, aspect: CarConfiguratorEngine.RENDER_ASPECT };
    // Whole-car views back off on narrow screens (or when UI covers part of it) so the car always fits.
    // `aspect` frames for a fixed picture (the summary stills) instead of the screen.
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const visibleAspect = opts.aspect ?? Math.max(w - Math.abs(this.viewInset.right), 1) / Math.max(h - this.viewInset.bottom, 1);
    const fit = THREE.MathUtils.clamp(1.78 / Math.max(visibleAspect, 0.3), 1, 2.6);
    switch (view) {
      case 'showroom':
        this.targetLookAt.set(0, 0.55, 0);
        this.targetCameraPos.set(6.6 * fit, 1.05, 1.1 * fit);
        break;

      case 'hero':
        this.targetLookAt.set(0, 0.5, 0.2);
        this.targetCameraPos.set(4.6 * fit, 1.25, 4.4 * fit);
        break;

      case 'frontThreeQuarter':
        this.targetLookAt.set(0, 0.5, 0.2);
        this.targetCameraPos.set(4.1 * fit, 1.3, 4.0 * fit);
        break;

      case 'side':
        this.targetLookAt.set(0, 0.5, 0.0);
        this.targetCameraPos.set(5.9 * fit, 0.95, 0.0);
        break;

      case 'frontWheel':
      case 'rearWheel': {
        // Close-up on the right-hand wheel, wherever the current car's wheels sit
        const isFront = view === 'frontWheel';
        const wheel = this.wheelAssemblies.find((a) => a.isRight && a.isFront === isFront);
        const c = wheel ? wheel.group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0.92, 0.35, isFront ? 1.45 : -1.38);
        const s = wheel ? wheel.group.scale.x : 1;
        const near = THREE.MathUtils.clamp(1.25 / Math.max(visibleAspect, 0.3), 1, 2.2);
        this.targetLookAt.copy(c);
        this.targetCameraPos.set(c.x + 1.55 * s * near, c.y + 0.16, c.z + (isFront ? 0.55 : 0.3) * s * near);
        break;
      }

      case 'rearThreeQuarter':
        this.targetLookAt.set(0, 0.5, -0.3);
        this.targetCameraPos.set(4.2 * fit, 1.3, -4.0 * fit);
        break;

      case 'top':
        this.targetLookAt.set(0, 0.2, 0);
        this.targetCameraPos.set(0.1, 7.2 * fit, 0.1);
        break;
    }

    // Convert targetCameraPos to spherical coordinates for seamless orbit continuity
    const offset = new THREE.Vector3().subVectors(this.targetCameraPos, this.targetLookAt);
    this.targetSpherical.radius = offset.length();
    const theta = Math.atan2(offset.x, offset.z);
    // Take the short way round from wherever the turntable has spun to
    const turn = theta - this.spherical.theta;
    this.targetSpherical.theta = this.spherical.theta + Math.atan2(Math.sin(turn), Math.cos(turn));
    this.targetSpherical.phi = Math.acos(THREE.MathUtils.clamp(offset.y / this.targetSpherical.radius, -1, 1));
    this.zoomRange = { min: Math.min(1.0, this.targetSpherical.radius), max: Math.max(12, this.targetSpherical.radius) };
    this.cameraDamping = 0.045; // slow, cinematic glide for programmatic moves

    if (opts.instant) {
      this.spherical = { ...this.targetSpherical };
      this.currentLookAt.copy(this.targetLookAt);
      this.updateCameraTransform();
      // already settled, so nothing else asks for a frame (rendered mode: the body changes view at once)
      this.requestRender();
    }
  }

  /** Starts wide and glides into the current preset: use when a stage first appears. */
  public playReveal() {
    if (this.renderedBody) return;
    this.spherical.radius = this.targetSpherical.radius * 1.7;
    this.spherical.theta = this.targetSpherical.theta - 0.9;
    this.spherical.phi = Math.max(0.5, this.targetSpherical.phi - 0.25);
    this.cameraDamping = 0.03;
  }

  /**
   * Keeps the car centred in the part of the screen not covered by UI (e.g. a right-hand panel or
   * a bottom sheet). Pixels in CSS units; animates.
   */
  /**
   * Pre-rendered body mode (components/journey/RenderedCarView.tsx): a Blender render of the car
   * sits under the canvas, so the engine draws only our wheels and calipers, on a transparent
   * background, from the exact camera the render used (fixed aspect, no orbit).
   */
  static RENDER_ASPECT = 1.6;
  /**
   * The Blender studio the bodies were rendered in, as an HDR panorama (scripts/prerender/studio_hdri.py):
   * the live wheels are lit by it in this mode, so wheel and body read as one photo. ?renvi= tunes.
   */
  static RENDER_ENV_URL = '/env/forgedsa_studio.hdr';
  static RENDER_ENV_INTENSITY: number = (() => {
    const m = typeof window !== 'undefined' ? /[?&]renvi=([0-9.]+)/.exec(window.location.search) : null;
    // The dark-studio bodies (scripts/prerender/render_car.py --studio dark) are toned in the browser at exposure 1.6; the
    // wheels are drawn by this engine's own tone mapping, so they get less light than the old 0.33: at 0.18 the tyres read
    // as dark rubber and the spokes keep their contrast on a dark body (matched by eye in the test rounds, ?renvi= tunes)
    return m ? +m[1] : 0.18;
  })();
  private static DEPTH_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false });
  private renderedBody = false;
  private renderEnvTarget: THREE.WebGLRenderTarget | null = null;
  private renderEnvLoading: Promise<THREE.WebGLRenderTarget | null> | null = null;
  private liveEnv: { env: THREE.Texture | null; intensity: number; rotation: THREE.Euler } | null = null;
  public setRenderedBody(on: boolean) {
    if (on === this.renderedBody) return;
    this.renderedBody = on;
    this.syncRenderedBody();
    this.applyRenderedEnvironment(on);
    if (on) this.isAutoRotate = false;
    if (!on && this.shadowStale) {
      this.shadowStale = false;
      this.markShadowDirty();
    }
    this.requestRender();
  }
  private applyRenderedEnvironment(on: boolean) {
    if (!on) {
      if (this.liveEnv) {
        this.scene.environment = this.liveEnv.env;
        this.scene.environmentIntensity = this.liveEnv.intensity;
        this.scene.environmentRotation.copy(this.liveEnv.rotation);
        this.liveEnv = null;
      }
      return;
    }
    if (!this.liveEnv) this.liveEnv = { env: this.scene.environment, intensity: this.scene.environmentIntensity, rotation: this.scene.environmentRotation.clone() };
    if (this.renderEnvTarget) return this.useRenderEnv(this.renderEnvTarget);
    this.loadRenderEnv().then((target) => target && this.renderedBody && this.useRenderEnv(target));
  }
  private useRenderEnv(target: THREE.WebGLRenderTarget) {
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = CarConfiguratorEngine.RENDER_ENV_INTENSITY;
    // Blender's car ran along X with the side strips at +/-Y; here the car runs along Z
    this.scene.environmentRotation.set(0, Math.PI / 2, 0);
    this.requestRender();
  }
  /** The Blender studio as a prefiltered environment (loaded once); null if it is unavailable. */
  private loadRenderEnv(): Promise<THREE.WebGLRenderTarget | null> {
    if (this.renderEnvTarget) return Promise.resolve(this.renderEnvTarget);
    return (this.renderEnvLoading ??= new HDRLoader()
      .loadAsync(CarConfiguratorEngine.RENDER_ENV_URL)
      .then((hdr) => {
        if (this.isDisposed) return null;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.renderEnvTarget = pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        pmrem.dispose();
        return this.renderEnvTarget;
      })
      .catch((err) => {
        console.warn('Rendered-body studio HDR unavailable; wheels keep the live studio.', err);
        return null;
      })
      .finally(() => (this.renderEnvLoading = null)));
  }
  private syncRenderedBody() {
    const on = this.renderedBody;
    // The body stays as an invisible depth mask, so the far-side wheels hide behind the rendered car
    this.bodyMeshGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (on && !mesh.userData.liveMaterial) {
        mesh.userData.liveMaterial = mesh.material;
        mesh.material = CarConfiguratorEngine.DEPTH_ONLY;
        mesh.renderOrder = -1;
      } else if (!on && mesh.userData.liveMaterial) {
        mesh.material = mesh.userData.liveMaterial;
        delete mesh.userData.liveMaterial;
        mesh.renderOrder = 0;
      }
    });
    if (this.contactShadow) this.contactShadow.group.visible = !on;
    this.wheelAssemblies.forEach((a) => {
      if (on) a.caliper.visible = true;
    });
  }

  public setViewInset(right: number, bottom = 0) {
    this.viewInset = { right, bottom: Math.max(0, bottom) }; // negative right = shift the car right
  }

  private applyViewInset(delta: number) {
    const k = 1 - Math.pow(1 - 0.1, delta * 60);
    const cur = this.currentInset;
    cur.right += (this.viewInset.right - cur.right) * k;
    cur.bottom += (this.viewInset.bottom - cur.bottom) * k;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    if (Math.abs(cur.right) < 0.5 && Math.abs(cur.bottom) < 0.5 && Math.abs(this.viewInset.right) < 0.5 && this.viewInset.bottom < 0.5) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(w, h, cur.right / 2, cur.bottom / 2, w, h);
  }

  private updateCameraTransform() {
    const { radius, theta, phi } = this.spherical;
    this.camera.position.set(
      this.currentLookAt.x + radius * Math.sin(phi) * Math.sin(theta),
      this.currentLookAt.y + radius * Math.cos(phi),
      this.currentLookAt.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Stills of the current configuration from the given angles, as JPEG data URLs on the dark studio
   * backdrop (a pool of light on Matte Carbon, as on the page). Used by the summary page and the PDF.
   * The live view is restored afterwards.
   */
  public captureViews(views: CameraViewPreset[], background: [string, string] = ['#2e2e2e', '#101010']): string[] {
    // The stills are always 16:9 (the summary page and the PDF lay them out that way), whatever the
    // screen: a phone's portrait canvas used to be cropped into a 16:9 frame, cutting the car off.
    const outW = 1600, outH = 900;
    const wasRendered = this.renderedBody; // stills need the 3D body
    if (wasRendered) {
      this.renderedBody = false;
      this.syncRenderedBody();
    }
    const saved = {
      spherical: { ...this.spherical },
      target: { ...this.targetSpherical },
      look: this.currentLookAt.clone(),
      targetLook: this.targetLookAt.clone(),
      targetPos: this.targetCameraPos.clone(),
      damping: this.cameraDamping,
      zoom: { ...this.zoomRange },
      size: this.renderer.getSize(new THREE.Vector2()),
      pixelRatio: this.renderer.getPixelRatio(),
      aspect: this.camera.aspect
    };
    const savedInset = { ...this.viewInset };
    this.viewInset = { right: 0, bottom: 0 }; // stills are framed for the full image, not around the UI
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(outW, outH, false); // the canvas on screen keeps its CSS size
    this.camera.aspect = outW / outH;
    this.camera.updateProjectionMatrix();
    if (this.shadowFrames > 0 || (wasRendered && this.shadowStale)) {
      this.renderContactShadow();
      if (wasRendered) this.shadowStale = false;
    }

    const src = this.renderer.domElement;
    const shots = views.map((view) => {
      this.setCameraPreset(view, { instant: true, aspect: outW / outH });
      this.renderer.render(this.scene, this.camera);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext('2d')!;
      const g = ctx.createRadialGradient(outW / 2, outH * 0.6, 0, outW / 2, outH * 0.6, Math.max(outW, outH) * 0.75);
      g.addColorStop(0, background[0]);
      g.addColorStop(1, background[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(src, 0, 0, outW, outH);
      return out.toDataURL('image/jpeg', 0.9);
    });

    this.renderer.setPixelRatio(saved.pixelRatio);
    this.renderer.setSize(saved.size.x, saved.size.y, false);
    if (wasRendered) {
      this.renderedBody = true;
      this.syncRenderedBody();
    }
    this.camera.aspect = saved.aspect;
    this.camera.updateProjectionMatrix();
    this.spherical = saved.spherical;
    this.targetSpherical = saved.target;
    this.currentLookAt.copy(saved.look);
    this.targetLookAt.copy(saved.targetLook);
    this.targetCameraPos.copy(saved.targetPos);
    this.cameraDamping = saved.damping;
    this.zoomRange = saved.zoom;
    this.viewInset = savedInset;
    this.currentInset = { right: 0, bottom: 0 }; // re-applied smoothly on the next frame
    this.updateCameraTransform();
    this.requestRender();
    return shots;
  }

  /**
   * The live wheels (and calipers) alone, from the pre-rendered body's camera, as transparent canvases of the render's
   * size: the summary stills and the PDF lay them over the recoloured Blender body (services/renderedBody.ts), exactly
   * as the configurator does. Needs the studio HDR the wheels are lit with, so it waits for it; the live view is
   * restored afterwards. Resolves to [] if the studio is unavailable (callers then use captureViews).
   */
  public async captureWheelLayers(views: CameraViewPreset[], width = 1440): Promise<HTMLCanvasElement[]> {
    const target = await this.loadRenderEnv();
    if (!target || this.isDisposed) return [];
    const outW = width, outH = Math.round(width / CarConfiguratorEngine.RENDER_ASPECT);
    const wasRendered = this.renderedBody;
    const saved = {
      spherical: { ...this.spherical },
      target: { ...this.targetSpherical },
      look: this.currentLookAt.clone(),
      targetLook: this.targetLookAt.clone(),
      targetPos: this.targetCameraPos.clone(),
      damping: this.cameraDamping,
      zoom: { ...this.zoomRange },
      size: this.renderer.getSize(new THREE.Vector2()),
      pixelRatio: this.renderer.getPixelRatio(),
      aspect: this.camera.aspect
    };
    const savedInset = { ...this.viewInset };
    if (!wasRendered) {
      this.renderedBody = true;
      this.syncRenderedBody();
      this.applyRenderedEnvironment(true); // the HDR is loaded: lit at once
    }
    this.viewInset = { right: 0, bottom: 0 };
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(outW, outH, false); // the canvas on screen keeps its CSS size
    this.camera.aspect = outW / outH;
    this.camera.updateProjectionMatrix();
    const layers = views.map((view) => {
      this.setCameraPreset(view, { instant: true }); // rendered mode frames every view for RENDER_ASPECT
      this.renderer.render(this.scene, this.camera);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      out.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0, outW, outH);
      return out;
    });
    this.renderer.setPixelRatio(saved.pixelRatio);
    this.renderer.setSize(saved.size.x, saved.size.y, false);
    if (!wasRendered) {
      this.renderedBody = false;
      this.syncRenderedBody();
      this.applyRenderedEnvironment(false);
    }
    this.camera.aspect = saved.aspect;
    this.camera.updateProjectionMatrix();
    this.spherical = saved.spherical;
    this.targetSpherical = saved.target;
    this.currentLookAt.copy(saved.look);
    this.targetLookAt.copy(saved.targetLook);
    this.targetCameraPos.copy(saved.targetPos);
    this.cameraDamping = saved.damping;
    this.zoomRange = saved.zoom;
    this.viewInset = savedInset;
    this.currentInset = { right: 0, bottom: 0 }; // re-applied smoothly on the next frame
    this.updateCameraTransform();
    this.requestRender();
    return layers;
  }

  public setAutoRotate(enabled: boolean) {
    if (this.renderedBody) enabled = false;
    this.isAutoRotate = enabled;
    this.requestRender();
  }

  public setSpinningWheels(enabled: boolean, kmh: number = 50) {
    this.isSpinningWheels = enabled;
    // Calculate angular velocity rad/sec based on tire circumference ~ 2.2m
    this.spinSpeed = enabled ? (kmh * 1000 / 3600) / 0.35 : 0;
  }

  // ----------------------------------------------------
  // INPUT HANDLERS (Smooth orbital rotation & zoom)
  // ----------------------------------------------------
  private setupInputHandlers() {
    const el = this.container;
    // The canvas is a drag surface: stop the browser turning touches on it into page scrolls,
    // pull-to-refresh or pinch/double-tap zoom of the whole page.
    el.style.touchAction = 'none';

    this.boundOnPointerDown = (e: MouseEvent | TouchEvent) => {
      if (this.renderedBody) return;
      this.isUserInteracting = true;
      this.cameraDamping = 0.12;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      this.pointerDownPos.x = clientX;
      this.pointerDownPos.y = clientY;
    };

    this.boundOnPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isUserInteracting) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - this.pointerDownPos.x;
      const deltaY = clientY - this.pointerDownPos.y;

      this.pointerDownPos.x = clientX;
      this.pointerDownPos.y = clientY;

      // Orbit sensitivity
      this.targetSpherical.theta -= deltaX * 0.007;
      this.targetSpherical.phi = THREE.MathUtils.clamp(
        this.targetSpherical.phi - deltaY * 0.007,
        0.15,
        Math.PI / 2 - 0.05 // don't go below ground
      );
    };

    this.boundOnPointerUp = () => {
      this.isUserInteracting = false;
    };

    this.boundOnWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.renderedBody) return;
      this.cameraDamping = 0.12;
      this.targetSpherical.radius = THREE.MathUtils.clamp(
        this.targetSpherical.radius + e.deltaY * 0.0035,
        this.zoomRange.min,
        this.zoomRange.max
      );
    };

    el.addEventListener('mousedown', this.boundOnPointerDown);
    window.addEventListener('mousemove', this.boundOnPointerMove);
    window.addEventListener('mouseup', this.boundOnPointerUp);

    el.addEventListener('touchstart', this.boundOnPointerDown, { passive: true });
    window.addEventListener('touchmove', this.boundOnPointerMove, { passive: true });
    window.addEventListener('touchend', this.boundOnPointerUp);

    el.addEventListener('wheel', this.boundOnWheel, { passive: false });
  }

  public handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth || window.innerWidth || 800;
    const h = this.container.clientHeight || window.innerHeight || 600;
    if (h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.currentInset = { right: this.currentInset.right + 0.01, bottom: this.currentInset.bottom };
    this.requestRender();
  }

  // ----------------------------------------------------
  // ANIMATION LOOP
  // ----------------------------------------------------
  private animate() {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    if (this.isPaused) return;

    // Auto turntable rotation if idle. The rim showcase sways in front of the rim face
    // rather than orbiting, so the spokes stay in view.
    if (this.isAutoRotate && !this.isUserInteracting) {
      if (this.isShowcase) {
        this.showcaseSwayTime += delta;
        this.targetSpherical.theta = Math.PI / 2 + Math.sin(this.showcaseSwayTime * 0.45) * 0.7;
      } else {
        this.targetSpherical.theta += 0.25 * delta;
      }
    }

    // Frame-rate independent glide towards the target orbit
    const k = 1 - Math.pow(1 - this.cameraDamping, Math.min(delta, 0.1) * 60);
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * k;
    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * k;
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * k;
    this.currentLookAt.lerp(this.targetLookAt, k);
    this.updateCameraTransform();
    this.applyViewInset(Math.min(delta, 0.1));

    // Render on demand. A still scene (camera settled, nothing animating, nothing changed) is not
    // redrawn: on a phone a full-screen frame every 16 ms left nothing for the UI. A heartbeat frame
    // each second covers any change that forgot to ask.
    const settled =
      Math.abs(this.targetSpherical.radius - this.spherical.radius) < 1e-3 * this.spherical.radius &&
      Math.abs(this.targetSpherical.theta - this.spherical.theta) < 5e-4 &&
      Math.abs(this.targetSpherical.phi - this.spherical.phi) < 5e-4 &&
      this.currentLookAt.distanceToSquared(this.targetLookAt) < 1e-7 &&
      Math.abs(this.viewInset.right - this.currentInset.right) < 0.5 &&
      Math.abs(this.viewInset.bottom - this.currentInset.bottom) < 0.5;
    const now = performance.now();
    const busy =
      !settled || this.isUserInteracting || (this.isAutoRotate && !this.isUserInteracting) || !!this.drive ||
      this.shadowFrames > 0 || this.isSpinningWheels || this.renderFrames > 0 || now - this.lastRenderAt > 1000;
    if (!busy) return;
    if (this.renderFrames > 0) this.renderFrames--;
    this.lastRenderAt = now;

    this.stepDrive(Math.min(delta, 0.1));
    if (this.shadowFrames > 0) {
      this.shadowFrames--;
      if (this.renderedBody) this.shadowStale = true; // hidden: not worth a pass now
      else this.renderContactShadow();
    }

    // Wheel spin animation
    if (this.isSpinningWheels) {
      this.wheelAssemblies.forEach((assembly) => {
        // Spin around the axle (local X; the tyre cylinder is rotated onto X)
        assembly.spinGroup.rotation.x += this.spinSpeed * delta * (assembly.isRight ? -1 : 1);
      });
    }

    // Wheel shading uniforms are shared by every engine; set them for the one rendering now
    // (the rim showcase has no car: no wheel arch, no floor under the tyre)
    wheelShadingUniforms.uArchStrength.value = this.isShowcase ? 0 : 1;
    wheelShadingUniforms.uFloorY.value = this.isShowcase ? -10 : 0;

    this.renderer.render(this.scene, this.camera);

    // replaced face materials: their successors have drawn and hold the shader programs now
    if (this.retiredMaterials.length) {
      this.retiredMaterials.forEach((m) => m.dispose());
      this.retiredMaterials = [];
    }
  }

  // ----------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------
  public cleanup() {
    this.isDisposed = true;
    this.drive?.resolve();
    this.drive = null;
    if (this.contactShadow) {
      this.contactShadow.rt.dispose();
      this.contactShadow.rtBlur.dispose();
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Detach event listeners
    if (this.container && this.boundOnPointerDown) {
      this.container.removeEventListener('mousedown', this.boundOnPointerDown);
      this.container.removeEventListener('touchstart', this.boundOnPointerDown);
    }
    if (this.boundOnPointerMove) {
      window.removeEventListener('mousemove', this.boundOnPointerMove);
      window.removeEventListener('touchmove', this.boundOnPointerMove);
    }
    if (this.boundOnPointerUp) {
      window.removeEventListener('mouseup', this.boundOnPointerUp);
      window.removeEventListener('touchend', this.boundOnPointerUp);
    }
    if (this.container && this.boundOnWheel) {
      this.container.removeEventListener('wheel', this.boundOnWheel);
    }
    if (this.boundOnContextRestored) {
      this.renderer?.domElement.removeEventListener('webglcontextrestored', this.boundOnContextRestored);
    }

    if (this.renderer) {
      if (this.renderer.domElement && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      // iOS keeps a disposed context's GPU memory until garbage collection; release it now
      this.renderer.forceContextLoss();
    }
    this.modelScenes.forEach((scene) => CarConfiguratorEngine.disposeScene(scene));
    this.modelScenes.clear();
    this.modelCache.clear();
    this.wheelTextureCache.forEach((t) => t.dispose());
    this.wheelTextureCache.clear();
    this.rimFaceGeometryCache.forEach((g) => g.dispose());
    this.rimFaceGeometryCache.clear();
    // Per-engine wheel resources (the rim page makes a new engine per visit): spoke faces, tyres and
    // rim shells, the kit's materials and the paint copies
    this.rimFaceCache.forEach((p) => p.then((f) => { f?.front.dispose(); f?.rear.dispose(); }).catch(() => {}));
    this.rimFaceCache.clear();
    this.disposeWheelShells();
    this.retiredMaterials.forEach((m) => m.dispose());
    this.customFaceMaterials.forEach((m) => m.dispose());
    for (const m of Object.values(this.kit ?? {})) (m as THREE.Material | undefined)?.dispose?.();
    this.barrelMaterial?.dispose();
    this.wheelMaterial?.dispose();
    this.carBodyMaterial?.dispose();
    this.paintVariants.forEach((m) => m.dispose());
    this.environmentTarget?.dispose();
    this.renderEnvTarget?.dispose();
    this.dracoLoader?.dispose();
  }
}

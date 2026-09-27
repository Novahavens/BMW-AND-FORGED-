/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { traceRimShapes, buildRimFaceGeometry } from './rimExtrusion';
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

  // Post-Processing Bloom Pipeline
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private isBloomEnabled: boolean = false; // UnrealBloomPass isn't alpha-aware; it breaks the transparent canvas

  // Car Hierarchy
  private carGroup: THREE.Group;
  private bodyMeshGroup: THREE.Group;
  private wheelsGroup: THREE.Group;
  private wheelAssemblies: {
    group: THREE.Group;
    spinGroup: THREE.Group;
    spokeMeshGroup: THREE.Group;
    caliperMesh: THREE.Mesh;
    discMesh: THREE.Mesh;
    tireMesh: THREE.Mesh;
    barrelMesh: THREE.Mesh;
    lipMesh: THREE.Mesh;
    /** Generic centre cap + bolts; hidden when a real rim (image or GLB) brings its own. */
    hubParts: THREE.Object3D[];
    sidewalls: THREE.Mesh[];
    tireWidth: number;
    isFront: boolean;
    isRight: boolean;
  }[] = [];

  // Materials Cache
  private carBodyMaterial!: THREE.MeshPhysicalMaterial;
  private wheelMaterial!: THREE.MeshPhysicalMaterial;
  /** Bright neutral room reflections for the rims only; the studio HDRI is too dark behind the camera for chrome. */
  private wheelEnvMap: THREE.Texture | null = null;
  private caliperMaterial!: THREE.MeshStandardMaterial;
  private brakeDiscMaterial!: THREE.MeshStandardMaterial;
  private tireMaterial!: THREE.MeshStandardMaterial;
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

  // Callbacks
  private onReady?: () => void;

  // Studio extras
  static HDRI_URL = '/env/studio_small_09_1k.hdr';
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
  private modelCache = new Map<string, Promise<THREE.Object3D>>();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    // Setup Post-Processing Specular Bloom Pass Pipeline
    this.setupPostProcessing(w, h);

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
  // POST-PROCESSING BLOOM PIPELINE
  // ----------------------------------------------------
  private setupPostProcessing(width: number, height: number) {
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      samples: 4
    });

    this.composer = new EffectComposer(this.renderer, renderTarget);

    // 1. Base Scene Pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 2. Unreal Bloom Pass: a restrained sheen on real hotspots (chrome, clearcoat highlights),
    // tuned for the light studio backdrop so it doesn't just glow the whole car.
    // strength: 0.30 - a sheen, not a glow
    // radius: 0.32 - tight, so it reads as gloss rather than haze
    // threshold: 0.92 - only the brightest specular hits bloom
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.30, // strength
      0.32, // radius
      0.92  // threshold
    );
    this.bloomPass.enabled = this.isBloomEnabled;
    this.composer.addPass(this.bloomPass);

    // 3. Final Output Pass with ACES Tone Mapping
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
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

    // Wheel Forged Material (default Liquid Metal)
    this.wheelMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#d6dde3'),
      metalness: 0.98,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    // Caliper Material (default M Blue)
    this.caliperMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1c1e22'),
      metalness: 0.55,
      roughness: 0.35
    });

    // Brake Disc Rotor (Ceramic Slotted)
    this.brakeDiscMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#787d82'),
      metalness: 0.88,
      roughness: 0.32
    });

    // High Performance Tires
    this.tireMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#141416'),
      roughness: 0.85,
      metalness: 0.08
    });

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
    this.shadowFrames = Math.max(this.shadowFrames, frames);
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
    this.wheelEnvMap = roomTarget.texture;
    this.wheelMaterial.envMap = this.wheelEnvMap;
    this.wheelMaterial.needsUpdate = true;
    this.scene.environmentIntensity = 0.9;
    room.dispose?.();

    new HDRLoader()
      .loadAsync(CarConfiguratorEngine.HDRI_URL)
      .then((hdr) => {
        if (this.isDisposed) return;
        const envTarget = pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        this.scene.environment = envTarget.texture;
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
        if (token === this.carLoadToken) this.mountCarModel(template.clone(true), car);
        return 'model';
      } catch (err) {
        console.warn(`Failed to load 3D model for ${car.name}; using procedural body.`, err);
      }
    }
    if (token === this.carLoadToken) {
      this.buildBMWCarBody(car.bodyStyle);
      this.resetWheelLayout();
      this.markShadowDirty();
    }
    return 'procedural';
  }

  /** Downloads a car GLB once; every later mount clones the cached scene (geometry is shared). */
  private loadCarTemplate(url: string): Promise<THREE.Object3D> {
    let p = this.modelCache.get(url);
    if (!p) {
      p = this.getGltfLoader()
        .loadAsync(url)
        .then((gltf) => {
          gltf.scene.userData.cachedModel = true;
          return gltf.scene;
        });
      p.catch(() => this.modelCache.delete(url));
      this.modelCache.set(url, p);
    }
    return p;
  }

  /** Warms the model cache so switching to this car is instant. */
  public preloadCar(car: CarModel) {
    if (car.modelUrl) this.loadCarTemplate(car.modelUrl).catch(() => {});
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

  /**
   * Some free/scraped GLBs omit metallicFactor/roughnessFactor on trim materials (window
   * pillars, chrome, engine bay, lens covers). Per the glTF spec that defaults to fully
   * metallic *and* fully rough, which under real environment lighting reads as flat, matte,
   * "unfinished" plastic instead of the gloss it was clearly meant to have. Nudge only the
   * exact-default combination (metalness 0, roughness ~1) down to a plausible gloss; anything
   * with an authored value (a real matte fabric at 0.72, say) is left alone.
   */
  private static fixDefaultedMaterial(material: THREE.Material | null | undefined) {
    const m = material as THREE.MeshStandardMaterial;
    if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    // See-through glass exported without a roughness value renders frosted (rough), which makes
    // the whole cabin read as a milky, washed-out block. Real glazing is a near-perfect mirror.
    // Near-clear cabin glass also shows the light-grey interior of these uploads straight through,
    // so the glasshouse reads milky; production BMW glazing is tinted, so give it a floor of tint.
    if ((m.transparent || m.opacity < 1) && /glass|window|windscreen|windshield/i.test(m.name) && !/head|tail|lamp|light|lens/i.test(m.name)) {
      if (m.roughness > 0.08) m.roughness = 0.04;
      m.metalness = 0;
      if (m.opacity < 0.7) m.opacity = 0.7;
      const hsl = { h: 0, s: 0, l: 0 };
      m.color.getHSL(hsl);
      if (hsl.l > 0.03) m.color.setHSL(hsl.h, hsl.s, 0.03);
      m.needsUpdate = true;
      return;
    }
    if (m.metalness === 0 && m.roughness >= 0.98) {
      m.roughness = 0.45;
      m.envMapIntensity = 1;
      m.needsUpdate = true;
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

    model.traverse((obj) => {
      // SketchUp/Collada conversions carry their edge outlines as line primitives; drawn over a
      // shaded body they read as heavy black seams, so only triangle meshes are kept.
      if ((obj as THREE.Line).isLine || (obj as THREE.Points).isPoints) {
        obj.visible = false;
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
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
      if (paintRe.test(ownNames) && !notPaintRe.test(ownNames)) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(() => this.carBodyMaterial)
          : this.carBodyMaterial;
      } else {
        unmatched.push(mesh.name || '(unnamed)');
        materials.forEach(CarConfiguratorEngine.fixDefaultedMaterial);
      }
    });

    this.disposeBody();
    this.bodyMeshGroup.add(model);
    this.markShadowDirty();

    // All four wheels merged into one mesh: split its vertices by side of the car instead.
    if (corners.size < 4 && wheelMeshes.length) {
      const byVertex = CarConfiguratorEngine.cornersFromVertices(wheelMeshes);
      if (byVertex.size === 4) byVertex.forEach((box, key) => corners.set(key, box));
    }

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
  }

  /** Removes the current body; GLB geometry is disposed, shared studio materials are kept. */
  private disposeBody() {
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
    // Clear existing
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
      const assemblyGroup = new THREE.Group();
      assemblyGroup.position.set(wp.x, wp.y, wp.z);

      // Rotation orientation: wheels on right side face outward along +X, left face outward along -X
      if (wp.isRight) {
        assemblyGroup.rotation.y = 0; // facing +X
      } else {
        assemblyGroup.rotation.y = Math.PI; // facing -X
      }

      // Spin group rotates around Z-axis in local space (or X in world)
      const spinGroup = new THREE.Group();

      // 1. TIRE (Low profile ultra-high performance Pilot Sport Cup 2 style)
      // Radius: 0.35m (~27.5 inch outer diameter), width ~ 0.28m
      const tireWidth = wp.isFront ? 0.26 : 0.30;
      const tireRadius = 0.35;
      const rimRadius = 0.26; // 20-inch rim

      // Tread with rounded shoulders (lathed profile), flat sidewalls down to the rim
      const tireGeo = CarConfiguratorEngine.buildTreadGeometry(tireRadius, tireWidth);
      const tireMesh = new THREE.Mesh(tireGeo, this.tireMaterial);
      tireMesh.castShadow = true;
      spinGroup.add(tireMesh);

      const sidewallGeo1 = new THREE.RingGeometry(rimRadius, tireRadius - 0.04, 64);
      sidewallGeo1.rotateY(Math.PI / 2);
      const sidewallOuter = new THREE.Mesh(sidewallGeo1.clone(), this.tireMaterial);
      sidewallOuter.position.x = tireWidth / 2 - 0.004;
      const sidewallInner = new THREE.Mesh(sidewallGeo1, this.tireMaterial);
      sidewallInner.position.x = -tireWidth / 2 + 0.004;
      sidewallInner.rotation.y = Math.PI;
      spinGroup.add(sidewallOuter, sidewallInner);

      // 2. FORGED WHEEL BARREL / RIM LIP
      const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius * 0.96, tireWidth * 0.95, 48, 1, true);
      barrelGeo.rotateZ(Math.PI / 2);
      const barrelMesh = new THREE.Mesh(barrelGeo, this.wheelMaterial);
      spinGroup.add(barrelMesh);

      // Stepped polished outer rim lip ring
      const lipGeo = new THREE.TorusGeometry(rimRadius * 0.98, 0.012, 16, 48);
      lipGeo.rotateY(Math.PI / 2);
      const lipMesh = new THREE.Mesh(lipGeo, this.wheelMaterial);
      lipMesh.position.x = tireWidth / 2 - 0.01;
      spinGroup.add(lipMesh);

      // 3. SPOKE MESH GROUP (Replaced dynamically when wheel design changes)
      const spokeMeshGroup = new THREE.Group();
      spokeMeshGroup.position.x = tireWidth / 2 - 0.025; // outer face of wheel
      spinGroup.add(spokeMeshGroup);

      // 4. CENTER CAP & TITANIUM LUG BOLTS
      const centerCapGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.02, 32);
      centerCapGeo.rotateZ(Math.PI / 2);
      const centerCapMat = new THREE.MeshStandardMaterial({
        color: 0x0f1114,
        metalness: 0.9,
        roughness: 0.2
      });
      const centerCap = new THREE.Mesh(centerCapGeo, centerCapMat);
      centerCap.position.x = tireWidth / 2 - 0.015;
      spinGroup.add(centerCap);
      const hubParts: THREE.Object3D[] = [centerCap];

      // 5 Lug Bolts (Titanium star pattern)
      for (let l = 0; l < 5; l++) {
        const angle = (l * Math.PI * 2) / 5;
        const boltGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.015, 12);
        boltGeo.rotateZ(Math.PI / 2);
        const bolt = new THREE.Mesh(boltGeo, this.chromeMaterial);
        bolt.position.set(tireWidth / 2 - 0.02, Math.cos(angle) * 0.075, Math.sin(angle) * 0.075);
        spinGroup.add(bolt);
        hubParts.push(bolt);
      }

      assemblyGroup.add(spinGroup);

      // 5. STATIONARY BRAKE ROTOR DISC (Inside the wheel)
      const rotorRadius = wp.isFront ? 0.21 : 0.19; // huge 400mm carbon ceramic discs
      const discGeo = new THREE.CylinderGeometry(rotorRadius, rotorRadius, 0.025, 36);
      discGeo.rotateZ(Math.PI / 2);
      const discMesh = new THREE.Mesh(discGeo, this.brakeDiscMaterial);
      discMesh.position.x = 0.02;
      assemblyGroup.add(discMesh);

      // Slotted Cross-Drilled Rotor Hat (Center bell)
      const hatGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.035, 24);
      hatGeo.rotateZ(Math.PI / 2);
      const hatMesh = new THREE.Mesh(hatGeo, this.chromeMaterial);
      hatMesh.position.x = 0.035;
      assemblyGroup.add(hatMesh);

      // 6. STATIONARY MONOBLOCK BRAKE CALIPER (M Performance 6-Piston)
      // Curved monoblock caliper hugging the top-front of the disc
      const cInner = rotorRadius - 0.075;
      const cOuter = rotorRadius + 0.022;
      const a0 = THREE.MathUtils.degToRad(100);
      const a1 = THREE.MathUtils.degToRad(165);
      const caliperShape = new THREE.Shape();
      caliperShape.absarc(0, 0, cOuter, a0, a1, false);
      caliperShape.absarc(0, 0, cInner, a1, a0, true);
      caliperShape.closePath();
      const caliperDepth = 0.075;
      const caliperGeo = new THREE.ExtrudeGeometry(caliperShape, {
        depth: caliperDepth,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 3,
        curveSegments: 24
      });
      caliperGeo.rotateY(Math.PI / 2); // shape plane -> disc plane, extrusion -> axle
      caliperGeo.translate(0.02 - caliperDepth / 2, 0, 0);
      const caliperMesh = new THREE.Mesh(caliperGeo, this.caliperMaterial);
      caliperMesh.castShadow = true;
      assemblyGroup.add(caliperMesh);

      this.wheelsGroup.add(assemblyGroup);

      this.wheelAssemblies.push({
        group: assemblyGroup,
        spinGroup,
        spokeMeshGroup,
        caliperMesh,
        discMesh,
        tireMesh,
        barrelMesh,
        lipMesh,
        hubParts,
        sidewalls: [sidewallOuter, sidewallInner],
        tireWidth,
        isFront: wp.isFront,
        isRight: wp.isRight
      });
    });

    this.applyRimScale();
  }

  /** Tyre tread: a lathed profile with rounded shoulders, axle along X. */
  private static buildTreadGeometry(radius: number, width: number): THREE.BufferGeometry {
    const half = width / 2;
    const shoulder = 0.035;
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(radius - 0.045, -half + 0.004));
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * (Math.PI / 2); // inner shoulder
      pts.push(new THREE.Vector2(radius - shoulder + Math.sin(t) * shoulder, -half + shoulder - Math.cos(t) * shoulder));
    }
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * (Math.PI / 2); // outer shoulder
      pts.push(new THREE.Vector2(radius - shoulder + Math.cos(t) * shoulder, half - shoulder + Math.sin(t) * shoulder));
    }
    pts.push(new THREE.Vector2(radius - 0.045, half - 0.004));
    const geo = new THREE.LatheGeometry(pts, 72);
    geo.rotateZ(Math.PI / 2); // lathe axis Y -> axle X
    return geo;
  }

  /** Resizes the rim inside a fixed tyre, e.g. '21"'. Bigger rim = thinner sidewall, like a real upgrade. */
  public setRimSize(size: string) {
    const inches = parseFloat(size);
    this.rimScale = THREE.MathUtils.clamp(Number.isFinite(inches) ? inches / 20 : 1, 0.8, 1.2);
    this.applyRimScale();
    this.markShadowDirty(10);
  }

  private applyRimScale() {
    const s = this.rimScale;
    const rimRadius = 0.26 * s; // 20" base rim radius
    const tireRadius = 0.35;
    this.wheelAssemblies.forEach((a) => {
      a.spokeMeshGroup.scale.set(1, s, s);
      a.barrelMesh.scale.set(1, s, s);
      a.lipMesh.scale.set(1, s, s); // ring geometry is baked into the YZ plane
      a.hubParts.forEach((p) => {
        p.userData.baseYZ ??= [p.position.y, p.position.z];
        p.position.y = p.userData.baseYZ[0] * s;
        p.position.z = p.userData.baseYZ[1] * s;
      });
      a.sidewalls.forEach((wall) => {
        wall.geometry.dispose();
        const g = new THREE.RingGeometry(rimRadius, tireRadius - 0.04, 64);
        g.rotateY(Math.PI / 2);
        wall.geometry = g;
      });
    });
  }

  // ----------------------------------------------------
  // PROCEDURAL SPOKE GENERATION FOR FORGED WHEEL DESIGNS
  // ----------------------------------------------------
  public applyWheelDesign(wheel: WheelDesign, custom2DConfig?: Custom2DWheelConfig) {
    const token = ++this.wheelDesignToken;
    this.markShadowDirty(90);
    this.customFaceMaterials = [];

    // A 2D guide image wins; otherwise an uploaded rim PNG replaces the procedural spokes.
    const imageConfig: Custom2DWheelConfig | null = custom2DConfig?.imageUrl
      ? custom2DConfig
      : wheel.imageUrl
        ? { imageUrl: wheel.imageUrl, name: wheel.name, bumpScale: 0.006, invertAlpha: false, spokeThreshold: 0.15, extrude: wheel.imageExtrude !== false }
        : null;
    const modelUrl = custom2DConfig?.imageUrl ? null : wheel.modelUrl;
    const mode = modelUrl ? 'model' : imageConfig ? 'image' : 'procedural';

    this.wheelAssemblies.forEach((assembly) => {
      // Clear spokes
      while (assembly.spokeMeshGroup.children.length > 0) {
        assembly.spokeMeshGroup.remove(assembly.spokeMeshGroup.children[0]);
      }
      // A GLB rim brings its own barrel and lip; any real rim brings its own centre cap.
      assembly.barrelMesh.visible = mode !== 'model';
      assembly.lipMesh.visible = mode !== 'model';
      assembly.hubParts.forEach((p) => (p.visible = mode === 'procedural'));
    });

    if (modelUrl) {
      this.loadRimModel(modelUrl).then(
        (template) => {
          if (token !== this.wheelDesignToken) return;
          this.wheelAssemblies.forEach((a) => this.mountRimModel(a.spokeMeshGroup, template, !!wheel.modelFlip));
        },
        (err) => {
          console.warn(`Failed to load 3D rim for ${wheel.name}; falling back.`, err);
          if (token === this.wheelDesignToken) this.applyWheelDesign({ ...wheel, modelUrl: null });
        }
      );
      return;
    }

    this.wheelAssemblies.forEach((assembly) => {
      if (imageConfig) {
        this.applyCustom2DSpokeTexture(assembly.spokeMeshGroup, imageConfig, assembly.isFront, token);
        return;
      }

      const concavity = assembly.isFront ? 0.03 : 0.05; // deeper dish on the wider rear rims
      const mirror = !assembly.isRight && (wheel.spokeType === 'directional' || wheel.spokeType === 'aerodisc');
      const face = new THREE.Mesh(this.getProceduralFaceGeometry(wheel, mirror, concavity), this.wheelMaterial);
      face.castShadow = true;
      face.receiveShadow = true;
      assembly.spokeMeshGroup.add(face);
      if (wheel.spokeType === 'clubsport') this.addLipBolts(assembly.spokeMeshGroup);
      // Seat the centre cap and lug bolts on the dished hub
      assembly.hubParts.forEach((p) => {
        p.userData.baseX ??= p.position.x;
        p.position.x = p.userData.baseX - concavity * 0.7;
      });
    });
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
          color: this.wheelMaterial.color,
          envMap: this.wheelMaterial.envMap,
          bumpMap: texture,
          bumpScale: config.bumpScale || 0.012,
          side: THREE.DoubleSide
        });

        this.customFaceMaterials.push(customMat);
        const faceMesh = new THREE.Mesh(faceGeo, customMat);
        faceMesh.position.x = -concavity * 0.5;
        parent.add(faceMesh);

        // Add 3D structural back support ring
        const supportRing = new THREE.Mesh(
          new THREE.TorusGeometry(outerR * 0.95, 0.01, 16, 48),
          this.wheelMaterial
        );
        supportRing.position.x = -concavity * 0.6;
        supportRing.rotation.y = Math.PI / 2;
        parent.add(supportRing);
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
  static BODY_ENV_INTENSITY = 0.45;

  public applyPaintColor(paint: PaintColor) {
    this.carBodyMaterial.envMapIntensity = CarConfiguratorEngine.BODY_ENV_INTENSITY;
    this.carBodyMaterial.color.set(paint.hex);
    this.carBodyMaterial.roughness = paint.roughness;
    this.carBodyMaterial.metalness = paint.metalness;
    this.carBodyMaterial.clearcoat = paint.clearcoat;
    this.carBodyMaterial.clearcoatRoughness = paint.clearcoatRoughness;
    this.carBodyMaterial.needsUpdate = true;
  }

  public applyWheelFinish(finish: WheelFinish) {
    this.wheelMaterial.color.set(finish.hex);
    this.wheelMaterial.roughness = finish.roughness;
    this.wheelMaterial.metalness = finish.metalness;
    this.wheelMaterial.clearcoat = finish.clearcoat;
    this.wheelMaterial.needsUpdate = true;

    // Also update barrel meshes
    this.wheelAssemblies.forEach((a) => {
      a.barrelMesh.material = this.wheelMaterial;
    });

    // Image-based rim faces tint with the finish too
    this.customFaceMaterials.forEach((m) => {
      m.color.copy(this.wheelMaterial.color);
      m.roughness = finish.roughness;
      m.metalness = finish.metalness;
      m.clearcoat = finish.clearcoat;
      m.needsUpdate = true;
    });
  }

  public applyCaliperColor(caliper: CaliperColor) {
    this.caliperMaterial.color.set(caliper.hex);
    this.caliperMaterial.needsUpdate = true;
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
  public setCameraPreset(view: CameraViewPreset, opts: { instant?: boolean } = {}) {
    // Whole-car views back off on narrow screens (or when UI covers part of it) so the car always fits.
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const visibleAspect = Math.max(w - Math.abs(this.viewInset.right), 1) / Math.max(h - this.viewInset.bottom, 1);
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
    }
  }

  /** Starts wide and glides into the current preset: use when a stage first appears. */
  public playReveal() {
    this.spherical.radius = this.targetSpherical.radius * 1.7;
    this.spherical.theta = this.targetSpherical.theta - 0.9;
    this.spherical.phi = Math.max(0.5, this.targetSpherical.phi - 0.25);
    this.cameraDamping = 0.03;
  }

  /**
   * Keeps the car centred in the part of the screen not covered by UI (e.g. a right-hand panel or
   * a bottom sheet). Pixels in CSS units; animates.
   */
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
    const saved = {
      spherical: { ...this.spherical },
      target: { ...this.targetSpherical },
      look: this.currentLookAt.clone(),
      targetLook: this.targetLookAt.clone(),
      targetPos: this.targetCameraPos.clone(),
      damping: this.cameraDamping,
      zoom: { ...this.zoomRange }
    };
    const savedInset = { ...this.viewInset };
    this.viewInset = { right: 0, bottom: 0 }; // stills are framed for the full image, not around the UI
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
    if (this.shadowFrames > 0) this.renderContactShadow();

    const src = this.renderer.domElement;
    const shots = views.map((view) => {
      this.setCameraPreset(view, { instant: true });
      this.renderer.render(this.scene, this.camera);
      const out = document.createElement('canvas');
      out.width = src.width;
      out.height = src.height;
      const ctx = out.getContext('2d')!;
      const g = ctx.createRadialGradient(
        out.width / 2, out.height * 0.6, 0,
        out.width / 2, out.height * 0.6, Math.max(out.width, out.height) * 0.75
      );
      g.addColorStop(0, background[0]);
      g.addColorStop(1, background[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(src, 0, 0);
      return out.toDataURL('image/jpeg', 0.9);
    });

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
    return shots;
  }

  public setAutoRotate(enabled: boolean) {
    this.isAutoRotate = enabled;
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

    this.boundOnPointerDown = (e: MouseEvent | TouchEvent) => {
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
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    this.currentInset = { right: this.currentInset.right + 0.01, bottom: this.currentInset.bottom };
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
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

    this.stepDrive(Math.min(delta, 0.1));
    if (this.shadowFrames > 0) {
      this.shadowFrames--;
      this.renderContactShadow();
    }

    // Wheel spin animation
    if (this.isSpinningWheels) {
      this.wheelAssemblies.forEach((assembly) => {
        // Spin around the axle (local X; the tyre cylinder is rotated onto X)
        assembly.spinGroup.rotation.x += this.spinSpeed * delta * (assembly.isRight ? -1 : 1);
      });
    }

    // Render frame through Post-Processing Bloom composer or direct WebGL fallback
    if (this.isBloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
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

    if (this.composer) {
      this.composer.dispose();
    }

    if (this.renderer) {
      if (this.renderer.domElement && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
    }
    this.wheelTextureCache.forEach((t) => t.dispose());
    this.wheelTextureCache.clear();
    this.rimFaceGeometryCache.forEach((g) => g.dispose());
    this.rimFaceGeometryCache.clear();
    this.dracoLoader?.dispose();
  }

  // ----------------------------------------------------
  // PUBLIC BLOOM PASS CONTROLS
  // ----------------------------------------------------
  public setBloomEnabled(enabled: boolean) {
    this.isBloomEnabled = enabled;
    if (this.bloomPass) {
      this.bloomPass.enabled = enabled;
    }
  }

  public getBloomEnabled(): boolean {
    return this.isBloomEnabled;
  }

  public setBloomStrength(strength: number) {
    if (this.bloomPass) {
      this.bloomPass.strength = strength;
    }
  }

  public setBloomThreshold(threshold: number) {
    if (this.bloomPass) {
      this.bloomPass.threshold = threshold;
    }
  }

  public setBloomRadius(radius: number) {
    if (this.bloomPass) {
      this.bloomPass.radius = radius;
    }
  }
}

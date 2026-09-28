/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';

/**
 * Photoreal mode: when the camera comes to rest, the studio is path traced (real reflections, soft
 * contact shadows, light bouncing between car and floor) and refines over a few seconds. While the
 * customer drags, the normal real-time render is used, so interaction stays fast.
 *
 * Proof of concept: enabled with ?photoreal=1 (or CarConfiguratorEngine.PHOTOREAL = true).
 */
export class PhotorealRenderer {
  readonly pathTracer: WebGLPathTracer;
  private floor: THREE.Mesh;
  private lastCam = new THREE.Matrix4();
  private lastProj = new THREE.Matrix4();
  private stillSince = 0;
  private builtVersion = -1;
  private building = false;
  private tracing = false;
  private canBuildAsync = false;

  /** Samples to accumulate before the image is considered finished (stops spending GPU). */
  maxSamples = 400;
  /** How long the camera must be still before path tracing starts, in ms. */
  settleMs = 350;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    /** Equirectangular studio HDRI (the path tracer can't use the PMREM cube the rasterizer uses). */
    private getEnvironment: () => THREE.Texture | null,
    /** Objects that only make sense for the rasterizer (baked contact shadow etc.), hidden while tracing. */
    private getRasterOnly: () => THREE.Object3D[]
  ) {
    const pt = new WebGLPathTracer(renderer);
    pt.bounces = 6;
    pt.transmissiveBounces = 4;
    pt.filterGlossyFactor = 0.4; // fewer fireflies on the clearcoat
    pt.minSamples = 3;
    pt.renderDelay = 0;
    pt.fadeDuration = 450;
    pt.tiles.set(2, 2);
    pt.renderScale = Math.min(1, 1.25 / Math.max(1, renderer.getPixelRatio()));
    try {
      // Builds the ray-tracing acceleration structure off the main thread, so the page doesn't freeze
      pt.setBVHWorker(new GenerateMeshBVHWorker());
      this.canBuildAsync = true;
    } catch (err) {
      console.warn('BVH worker unavailable; building the photoreal scene on the main thread.', err);
    }
    this.pathTracer = pt;

    // Seamless studio floor: dark satin concrete that catches real reflections and shadows.
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x0b0b0b, roughness: 0.55, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6 })
    );
    this.floor.name = 'photoreal_floor';
    this.floor.visible = false;
    scene.add(this.floor);
  }

  /** True while path tracing is refining the current still. */
  get isTracing() {
    return this.tracing;
  }

  get samples() {
    return this.pathTracer.samples;
  }

  /**
   * Called once per animation frame. Returns true if it drew the frame (the caller should then skip
   * its normal render). `sceneVersion` changes whenever paint, wheels, size or car change.
   */
  frame(now: number, sceneVersion: number, floorY: number): boolean {
    this.camera.updateMatrixWorld();
    const moved = !this.lastCam.equals(this.camera.matrixWorld) || !this.lastProj.equals(this.camera.projectionMatrix);
    if (moved) {
      this.lastCam.copy(this.camera.matrixWorld);
      this.lastProj.copy(this.camera.projectionMatrix);
      this.stillSince = now;
      if (this.tracing) this.stop();
      return false;
    }
    if (now - this.stillSince < this.settleMs) return false;

    if (sceneVersion !== this.builtVersion) {
      if (!this.building) this.rebuild(sceneVersion, floorY);
      return false;
    }
    if (this.building) return false;

    if (!this.tracing) {
      this.tracing = true;
      this.setRasterOnlyVisible(false);
      this.floor.visible = true;
      this.pathTracer.updateCamera();
    }
    if (this.pathTracer.samples < this.maxSamples) this.pathTracer.renderSample();
    else this.pathTracer.renderSample(); // keeps the finished image on screen (no new samples past max)
    return true;
  }

  /** Hand control back to the rasterizer (camera moved, car changed, page hidden). */
  stop() {
    this.tracing = false;
    this.floor.visible = false;
    this.setRasterOnlyVisible(true);
    this.pathTracer.reset();
  }

  /** Force a rebuild of the traced scene on the next still frame. */
  invalidate() {
    this.builtVersion = -1;
    if (this.tracing) this.stop();
  }

  private rebuild(version: number, floorY: number) {
    this.building = true;
    if (this.tracing) this.stop();
    const prevEnv = this.scene.environment;
    const prevBg = this.scene.background;
    const env = this.getEnvironment();
    if (env) this.scene.environment = env;
    this.scene.background = new THREE.Color(0x121212);
    this.floor.position.y = floorY;
    this.floor.visible = true;
    this.setRasterOnlyVisible(false);
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) dequantize((o as THREE.Mesh).geometry);
    });
    const build: Promise<unknown> = this.canBuildAsync
      ? this.pathTracer.setSceneAsync(this.scene, this.camera)
      : Promise.resolve().then(() => this.pathTracer.setScene(this.scene, this.camera));
    build
      .catch((err: unknown) => console.warn('Photoreal mode unavailable:', err))
      .finally(() => {
        this.scene.environment = prevEnv;
        this.scene.background = prevBg;
        this.floor.visible = false;
        this.setRasterOnlyVisible(true);
        this.builtVersion = version;
        this.building = false;
      });
  }

  private setRasterOnlyVisible(v: boolean) {
    for (const o of this.getRasterOnly()) o.visible = v;
  }

  dispose() {
    this.pathTracer.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.scene.remove(this.floor);
  }
}

/**
 * The car GLBs are compressed with meshopt quantization (positions/normals/UVs stored as normalized,
 * interleaved Int16/Int8). The path tracer reads attribute arrays directly, so expand them to plain
 * Float32 once. The rasterizer renders either form identically.
 */
function dequantize(geometry: THREE.BufferGeometry) {
  if (geometry.userData.photorealDequantized) return;
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.attributes[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const interleaved = (attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute;
    if (!interleaved && !attr.normalized && attr.array instanceof Float32Array) continue;
    const { count, itemSize } = attr;
    const out = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < itemSize; c++) out[i * itemSize + c] = attr.getComponent(i, c);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, itemSize));
  }
  geometry.userData.photorealDequantized = true;
}

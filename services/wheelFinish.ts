/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { WheelFinish } from '../types';

/**
 * Wheel finishes, built the way the real coatings are layered.
 *
 * The admin stores four numbers per finish (colour, metalness, roughness, clear coat). Real
 * finishes are layers (bare metal, paint, clear coat), so the numbers are read as a recipe of one
 * of four kinds, picked from the numbers themselves (no per-finish code, so admin-made finishes
 * work the same way):
 *
 * - **polished** (Liquid Metal, chrome, polished): bare polished metal. Metalness >= 0.95 and
 *   roughness <= 0.16. The colour is the metal's reflectance; any clear coat stays mirror-smooth.
 * - **gloss paint** (Black Gloss, any solid gloss colour): paint or powder coat under a gloss
 *   clear coat. Colour luminance below 0.03 (linear) or metalness below 0.3, and roughness
 *   <= 0.35. The paint is a non-metal: at metalness 0.7 a near-black colour reflects almost
 *   nothing and the spokes go flat. The sharp reflections come from the clear coat.
 * - **satin metallic** (Bronze Matte): metallic paint under a matte clear coat. Roughness >= 0.42.
 *   Broad soft highlights and no sharp reflections: the clear coat is rough too, otherwise it
 *   adds a mirror reflection at grazing angles. With metalness below 0.3 it is a matte solid
 *   paint (satin black): no flake or flop.
 * - **metallic paint** (Silver and everything else): metallic paint under a gloss clear coat.
 *   Face/flop (darker where the surface turns away) and fine flake sparkle under a smooth clear
 *   coat.
 */
export type FinishKind = 'polished' | 'gloss-paint' | 'satin-metallic' | 'metallic-paint';

export interface FinishLook {
  kind: FinishKind;
  /** Base colour (linear). For metals this is the reflectance. */
  color: THREE.Color;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** Metallic flake: normal tilt per ~1 mm cell (0 = none). Fades out when cells are sub-pixel. */
  flake: number;
  /** Face/flop: base colour at grazing angles relative to face-on (1 = none). */
  flop: number;
}

type FinishInput = Pick<WheelFinish, 'hex' | 'metalness' | 'roughness' | 'clearcoat'>;

export function finishKind(f: FinishInput): FinishKind {
  const c = new THREE.Color(f.hex); // sRGB hex -> linear working colour
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  // near-black is always paint: a near-black metal reflects nothing and renders as a hole
  const dark = lum < 0.03;
  if (f.metalness >= 0.95 && f.roughness <= 0.16 && !dark) return 'polished';
  if ((dark || f.metalness < 0.3) && f.roughness < 0.42) return 'gloss-paint';
  if (f.roughness >= 0.42) return 'satin-metallic';
  return 'metallic-paint';
}

export function finishLook(f: FinishInput): FinishLook {
  const kind = finishKind(f);
  const color = new THREE.Color(f.hex);
  const clamp = THREE.MathUtils.clamp;
  switch (kind) {
    case 'polished':
      // a little roughness keeps thin spoke edges from sparkling between frames
      return { kind, color, metalness: 1, roughness: clamp(f.roughness, 0.05, 0.1), clearcoat: f.clearcoat, clearcoatRoughness: 0.02, flake: 0, flop: 1 };
    case 'gloss-paint':
      // the paint film under the clear coat is a little rough; the clear coat is not
      return { kind, color, metalness: 0, roughness: 0.4, clearcoat: Math.max(f.clearcoat, 0.9), clearcoatRoughness: 0.03, flake: 0, flop: 1 };
    case 'satin-metallic': {
      // a matte solid paint (metalness < 0.3, or near-black, e.g. satin black) has no flake or flop
      const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      const metal = f.metalness >= 0.3 && lum >= 0.03;
      // A matte metallic under a soft studio reads as one flat colour unless its form is drawn
      // another way: strong flop (sides turning away go dark), coarser flake grain, and a faint
      // satin sheen on the clear coat (real matte powder coat is not perfectly dead)
      return { kind, color, metalness: metal ? Math.max(f.metalness, 0.75) : 0, roughness: clamp(f.roughness, 0.42, 0.7), clearcoat: f.clearcoat, clearcoatRoughness: 0.5, flake: metal ? 0.09 : 0, flop: metal ? 0.5 : 1 };
    }
    case 'metallic-paint':
    default:
      return { kind, color, metalness: f.metalness, roughness: Math.max(f.roughness, 0.3), clearcoat: f.clearcoat, clearcoatRoughness: 0.04, flake: 0.06, flop: 0.7 };
  }
}

export interface FinishLayerUniforms {
  uFinishFlake: THREE.IUniform<number>;
  uFinishFlakeScale: THREE.IUniform<number>;
  uFinishFlop: THREE.IUniform<number>;
}

/** Flake cells per metre of wheel (1 mm). */
export const FINISH_FLAKE_SCALE = 1000;

/**
 * Adds face/flop and flake sparkle to a wheel material, on top of whatever shader changes it
 * already has (e.g. the wheel-arch shading). Flake cells are in the mesh's own space (metres for
 * the generated and photo wheels), so the sparkle turns with the wheel. The clear coat keeps the
 * unperturbed normal, as on the car paint.
 */
export function installFinishLayers(material: THREE.MeshPhysicalMaterial): FinishLayerUniforms {
  const uniforms: FinishLayerUniforms = {
    uFinishFlake: { value: 0 },
    uFinishFlakeScale: { value: FINISH_FLAKE_SCALE },
    uFinishFlop: { value: 1 }
  };
  material.userData.finishLayers = uniforms;
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${prevKey.call(material)}|forgedsa-finish-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFinishPos;\nvarying vec3 vFinishN0;\nvarying vec3 vFinishN1;\nvarying vec3 vFinishN2;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFinishPos = transformed;\nvFinishN0 = normalMatrix[0];\nvFinishN1 = normalMatrix[1];\nvFinishN2 = normalMatrix[2];'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFinishPos;
varying vec3 vFinishN0;
varying vec3 vFinishN1;
varying vec3 vFinishN2;
uniform float uFinishFlake;
uniform float uFinishFlakeScale;
uniform float uFinishFlop;
vec3 finishHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // face/flop: metallic paint darkens as the surface turns away from the viewer
  float ndvF = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  diffuseColor.rgb *= mix(uFinishFlop, 1.0, pow(ndvF, 0.55));
  // flake: one random tilt per cell, in the mesh's space (turns with the wheel), faded out once
  // a cell is smaller than a pixel so distant wheels don't shimmer
  if (uFinishFlake > 0.0) {
    vec3 fp = vFinishPos * uFinishFlakeScale;
    float visible = 1.0 - smoothstep(0.35, 0.9, length(fwidth(fp)));
    if (visible > 0.0) {
      vec3 tilt = finishHash3(floor(fp)) * 2.0 - 1.0;
      vec3 tiltView = normalize(mat3(vFinishN0, vFinishN1, vFinishN2) * tilt);
      normal = normalize(normal + tiltView * uFinishFlake * visible);
    }
  }
}`
      );
  };
  material.needsUpdate = true;
  return uniforms;
}

/** Sets a finish look on a wheel material (and its flake/flop, when it has the finish layers). */
export function applyFinishLook(material: THREE.MeshPhysicalMaterial, look: FinishLook) {
  material.color.copy(look.color);
  material.metalness = look.metalness;
  material.roughness = look.roughness;
  material.clearcoat = look.clearcoat;
  material.clearcoatRoughness = look.clearcoatRoughness;
  // Gloss paint: only the clear coat reflects. The paint film's own (rough) reflection would
  // spread a grey haze over the whole wheel and turn gloss black into gunmetal.
  material.specularIntensity = look.kind === 'gloss-paint' ? 0 : 1;
  const u = material.userData.finishLayers as FinishLayerUniforms | undefined;
  if (u) {
    u.uFinishFlake.value = look.flake;
    u.uFinishFlop.value = look.flop;
  }
  material.needsUpdate = true;
}

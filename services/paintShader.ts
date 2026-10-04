/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { PaintColor } from '../types';

/**
 * Car paint layers on top of MeshPhysicalMaterial, without any per-colour textures:
 *
 * - **Metallic flake:** aluminium flakes in the base coat, each tilted a little differently, so
 *   close up the paint sparkles under the smooth clear coat. Computed from the model-space
 *   position (no UVs needed, so it works on any car file) and faded out when a flake is smaller
 *   than a pixel, so distant views stay clean instead of shimmering.
 * - **Flop:** metallic paint is bright where the panel faces you and darker where it turns away
 *   (the "face/flop" travel that makes a metallic read as metallic, not as a solid colour).
 *
 * The clear coat keeps the unperturbed normal (three.js uses it for the clear-coat layer), so
 * reflections stay mirror-smooth on top of the sparkle, like real paint.
 */
export interface PaintLayerUniforms {
  uFlakeStrength: THREE.IUniform<number>;
  uFlakeScale: THREE.IUniform<number>;
  uFlop: THREE.IUniform<number>;
  uCoatBoost: THREE.IUniform<number>;
}

/** Look per BMW paint type. Exposed so tuning sessions can adjust them live. */
export const PAINT_LAYERS: Record<PaintColor['type'], { flake: number; flop: number }> = {
  Metallic: { flake: 0.07, flop: 0.66 },
  // Frozen (matte) paints are metallic underneath, but the matte clear coat diffuses the sparkle.
  Frozen: { flake: 0.03, flop: 0.78 },
  Uni: { flake: 0, flop: 0.92 }
};

/**
 * Strength of the clear coat's reflection of the studio. A real clear coat reflects a bright, high
 * contrast studio so sharply that the whole panel reads as glass over colour; in a soft white room
 * the plain physical 4% reflection barely shows and the paint looks matte, so it is multiplied.
 * ?coat= compares.
 */
export const COAT_BOOST: number = (() => {
  const m = typeof window !== 'undefined' ? /[?&]coat=([0-9.]+)/.exec(window.location.search) : null;
  return m ? +m[1] : 1.0;
})();

/** Flake cells per metre (about 0.7 mm: a fine sparkle up close that fades out with distance). */
export const FLAKE_SCALE = 1400;

export function installPaintLayers(material: THREE.MeshPhysicalMaterial): PaintLayerUniforms {
  const uniforms: PaintLayerUniforms = {
    uFlakeStrength: { value: PAINT_LAYERS.Metallic.flake },
    uFlakeScale: { value: FLAKE_SCALE },
    uFlop: { value: PAINT_LAYERS.Metallic.flop },
    uCoatBoost: { value: COAT_BOOST }
  };
  material.userData.paintLayers = uniforms;
  material.customProgramCacheKey = () => 'forgedsa-paint-v3';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      // world space, so flakes are a real size whatever units the car file uses
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPaintPos;
uniform float uFlakeStrength;
uniform float uFlakeScale;
uniform float uFlop;
uniform float uCoatBoost;
vec3 paintHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
#ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= uCoatBoost;
#endif`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // Face/flop: darker as the panel turns away from the viewer
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  diffuseColor.rgb *= mix(uFlop, 1.0, pow(ndv, 0.55));

  // Flakes: one random tilt per cell, faded out once cells are smaller than a pixel
  vec3 fp = vPaintPos * uFlakeScale;
  float footprint = length(fwidth(fp));
  float visible = 1.0 - smoothstep(0.35, 0.9, footprint);
  if (uFlakeStrength > 0.0 && visible > 0.0) {
    vec3 tilt = paintHash3(floor(fp)) * 2.0 - 1.0;
    vec3 tiltView = normalize((viewMatrix * vec4(tilt, 0.0)).xyz);
    normal = normalize(normal + tiltView * uFlakeStrength * visible);
  }
}`
      );
  };
  return uniforms;
}

/** Sets the flake and flop for a paint on every material carrying the paint layers. */
export function applyPaintLayers(material: THREE.Material, paint: Pick<PaintColor, 'type'>) {
  const u = material.userData.paintLayers as PaintLayerUniforms | undefined;
  if (!u) return;
  const look = PAINT_LAYERS[paint.type] ?? PAINT_LAYERS.Metallic;
  u.uFlakeStrength.value = look.flake;
  u.uFlop.value = look.flop;
}

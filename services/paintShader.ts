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

/**
 * Look per BMW paint finish, on top of the per-paint numbers in the catalogue (base colour, roughness,
 * metalness, clear coat). Values from the Khronos car-paint samples, Arnold/VRED car-paint docs and BMW's
 * finish descriptions (docs/bmw-factory-paints.md, "Material values"):
 *
 * - Uni (solid): no flakes and no face/flop travel (the coat's Fresnel does the edges). The base coat sits
 *   under lacquer of nearly the same index, so its own specular is mostly hidden (specularIntensity 0.2).
 * - Metallic: aluminium flakes (real ones are 5-45 um; cells of 0.3 mm fade out below a pixel).
 * - Pearl: mica/xirallic effect pigments ("Pearl effect", "Brilliant Effect", "Amber effect"): sparser,
 *   brighter glints and a thin-film colour shift with angle (iridescence).
 * - Frozen: a satin (matted) clear coat over a metallic base, giving a broad, untinted sheen. The base must
 *   be at least as rough as the coat (three.js doesn't roughen it under a rough coat).
 */
export interface PaintLook {
  flake: number;
  flop: number;
  specularIntensity: number;
  coatBoost: number;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThickness?: [number, number];
  sheen?: number;
}

/**
 * Strength of the clear coat's reflection of the studio. A real clear coat reflects a bright, high
 * contrast studio so sharply that the whole panel reads as glass over colour; in a soft white room
 * the plain physical 4% reflection barely shows and the paint looks matte, so it is multiplied.
 * ?coat= compares.
 */
export const COAT_BOOST: number = (() => {
  const m = typeof window !== 'undefined' ? /[?&]coat=([0-9.]+)/.exec(window.location.search) : null;
  return m ? +m[1] : 1.2;
})();

export const PAINT_LAYERS: Record<PaintColor['type'], PaintLook> = {
  Uni: { flake: 0, flop: 1, specularIntensity: 0.2, coatBoost: COAT_BOOST },
  Metallic: { flake: 0.1, flop: 0.65, specularIntensity: 0.5, coatBoost: COAT_BOOST },
  Pearl: {
    flake: 0.14,
    flop: 0.7,
    specularIntensity: 0.5,
    coatBoost: COAT_BOOST,
    iridescence: 0.2,
    iridescenceIOR: 1.9,
    iridescenceThickness: [250, 450]
  },
  // The satin coat is the whole look: no extra boost, a soft white sheen at grazing angles
  Frozen: { flake: 0.02, flop: 0.78, specularIntensity: 0.5, coatBoost: 1, sheen: 0.25 }
};

/** Single paints whose effect differs from their finish class (by BMW paint code). */
export const PAINT_CODE_LOOKS: Record<string, Partial<PaintLook>> = {
  // Mineral White: tri-coat pearl over a white base, a faint pearl shimmer rather than glints
  A96: { flake: 0.03, flop: 0.85, iridescence: 0.12, iridescenceThickness: [300, 400] },
  // Bernina Grey Amber effect: the pearl turns gold towards the light
  C3E: { iridescenceThickness: [380, 520] },
  // Frozen Brilliant White: a metallic base this light would read as chrome; little flop or flake
  X16: { flake: 0, flop: 0.92, sheen: 0.2 }
};

export function paintLook(paint: Pick<PaintColor, 'type' | 'code'>): PaintLook {
  return { ...(PAINT_LAYERS[paint.type] ?? PAINT_LAYERS.Metallic), ...(PAINT_CODE_LOOKS[paint.code] ?? {}) };
}

/** Flake cells per metre (about 0.3 mm: real flakes only resolve up close, and fade out below a pixel). */
export const FLAKE_SCALE = 3200;

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

/** Sets the finish (flake, flop, specular, pearl shift, satin sheen) for a paint on a paint material. */
export function applyPaintLayers(material: THREE.Material, paint: Pick<PaintColor, 'type' | 'code'>) {
  const u = material.userData.paintLayers as PaintLayerUniforms | undefined;
  if (!u) return;
  const look = paintLook(paint);
  u.uFlakeStrength.value = look.flake;
  u.uFlop.value = look.flop;
  u.uCoatBoost.value = look.coatBoost;
  const m = material as THREE.MeshPhysicalMaterial;
  if (!m.isMeshPhysicalMaterial) return;
  m.specularIntensity = look.specularIntensity;
  m.iridescence = look.iridescence ?? 0;
  m.iridescenceIOR = look.iridescenceIOR ?? 1.3;
  if (look.iridescenceThickness) m.iridescenceThicknessRange = [...look.iridescenceThickness];
  m.sheen = look.sheen ?? 0;
  m.sheenRoughness = 0.7;
  m.sheenColor.setRGB(1, 1, 1);
}

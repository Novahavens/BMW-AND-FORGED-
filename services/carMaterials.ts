/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Material pass for downloaded car models (everything except the body paint, which the engine
 * replaces). Community and game-derived GLBs ship with defaulted or wrong PBR values: frosted
 * glass, matte "chrome", lenses that are fully transparent, near-opaque parts flagged as
 * transparent (which sorts badly), interiors lit as brightly as the bodywork. This pass sets
 * plausible studio values by part name, so the same rules lift every car.
 *
 * Idempotent: a material is only adjusted once (cached models are mounted again on revisits).
 */

export type PartKind =
  | 'glass'
  | 'lens'
  | 'tailLens'
  | 'chrome'
  | 'carbon'
  | 'interior'
  | 'blackTrim'
  | 'rubber'
  | 'badge'
  | 'emissive'
  | 'other';

const RE = {
  lightish: /head|tail|lamp|light|lens|beam|signal|indicator|drl|fog|reverse|brake_?l|stop/i,
  glass: /glass|window|windscreen|windshield|wind_?shield|glazing/i,
  tail: /tail|rear_?l|redlight|glass_red|red_?glass|stop|brake_?light|reverse/i,
  chrome: /chrome|mirror(?!.*cap)|polish|\balu\b|aluminium|aluminum|silver|exhaust|(^|[^a-z])tips?([^a-z]|$)/i,
  carbon: /carbon|cfrp|carb_/i,
  // "int" only as its own word ("st_int", "carbon_int"), never inside "Paint_0"
  interior: /interior|seat|dash|steer|(^|[^a-z])int([^a-z]|$)|gauge|hud|carpet|cabin|alcantara|leather|stitch|console|door_?card|headliner|pedal|screen|display|button/i,
  rubber: /rubber|seal|gasket|tyre|tire|wiper/i,
  black: /black|blk|trim|plastic|base|grille|grill|diffuser|splitter|undertray|bumper_?low|matte/i,
  badge: /badge|logo|emblem|roundel|lettering|script/i
};

export function classifyPart(names: string, m: THREE.MeshStandardMaterial): PartKind {
  const transparent = m.transparent || m.opacity < 1;
  const emissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b > 0.5 || !!m.emissiveMap);
  if (RE.interior.test(names)) return 'interior';
  // red glass is a tail-light lens whatever the file calls it ("glass_red" on the M5)
  if (RE.glass.test(names) && (isRed(m.color) || /red/i.test(names))) return 'tailLens';
  if (RE.glass.test(names) && !RE.lightish.test(names)) return 'glass';
  if (RE.lightish.test(names)) {
    if (emissive) return 'emissive';
    // Only a genuinely red lens is a tail light: some files name other glass after the lamps
    // (the M3's front windows use "Taillightglass"). A dark, fairly opaque lens is smoked
    // glass; textured lamp parts (DRL light guides, reflectors) keep their texture.
    if (isRed(m.color)) return transparent || RE.tail.test(names) ? 'tailLens' : 'other';
    if (transparent && !m.map) {
      const dark = luminance(m.color) < 0.1 && m.opacity >= 0.4;
      if (dark && !/head|beam|fog|drl/i.test(names)) return 'glass';
      return 'lens';
    }
    return 'other';
  }
  if (RE.badge.test(names)) return 'badge';
  if (RE.carbon.test(names)) return 'carbon';
  if (RE.chrome.test(names)) return 'chrome';
  if (RE.rubber.test(names)) return 'rubber';
  if (RE.black.test(names) || (!m.map && luminance(m.color) < 0.05)) return 'blackTrim';
  return 'other';
}

function luminance(c: THREE.Color) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
function isRed(c: THREE.Color) {
  return c.r > 0.1 && c.r > c.g * 3 && c.r > c.b * 3;
}

/** Physical copy of a standard material, keeping every map and value it already had. */
function toPhysical(m: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  if ((m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return m as THREE.MeshPhysicalMaterial;
  const p = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(p, m);
  p.name = m.name;
  return p;
}

/**
 * Returns the adjusted material for a part (the same object when it can be changed in place; a
 * physical copy when the look needs clear coat or specular controls).
 */
export function passMaterial(material: THREE.Material, names: string): THREE.Material {
  const m0 = material as THREE.MeshStandardMaterial;
  if (!m0 || !m0.isMeshStandardMaterial) return material;
  if (m0.userData.forgedPass) return m0;
  // a material shared by several parts is converted once and the copy shared
  if (m0.userData.forgedReplacement) return m0.userData.forgedReplacement as THREE.Material;
  const kind = classifyPart(`${names} ${m0.name}`, m0);
  let m: THREE.MeshStandardMaterial = m0;

  // Nearly opaque parts flagged as transparent sort badly against the glass; draw them solid
  // (alpha-tested where the texture has cut-outs, e.g. grille meshes and badges).
  if (m.transparent && m.opacity >= 0.95 && kind !== 'glass' && kind !== 'lens' && kind !== 'tailLens') {
    m.transparent = false;
    m.depthWrite = true;
    if (m.map) m.alphaTest = 0.5;
  }

  switch (kind) {
    case 'glass': {
      // Tinted, mirror-smooth glazing; reflections are added by a separate overlay layer
      m.roughness = 0.02;
      m.metalness = 0;
      m.transparent = true;
      m.opacity = THREE.MathUtils.clamp(m.opacity, 0.62, 0.82);
      const hsl = { h: 0, s: 0, l: 0 };
      m.color.getHSL(hsl);
      m.color.setHSL(hsl.h, Math.min(hsl.s, 0.2), Math.min(hsl.l, 0.035));
      m.depthWrite = false;
      m.envMapIntensity = 0.6;
      break;
    }
    case 'lens': {
      // Clear polycarbonate cover over the lamp: barely tinted, glossy, see-through
      m.transparent = true;
      m.opacity = THREE.MathUtils.clamp(m.opacity || 0.2, 0.12, 0.3);
      m.color.setRGB(0.9, 0.92, 0.95);
      m.roughness = 0.02;
      m.metalness = 0;
      m.depthWrite = false;
      m.envMapIntensity = 1.2;
      break;
    }
    case 'tailLens': {
      // Deep red lens with a faint inner glow, as in studio photos with the lamps on
      m.transparent = true;
      m.opacity = THREE.MathUtils.clamp(m.opacity < 0.2 ? 0.75 : m.opacity, 0.55, 0.9);
      m.color.setRGB(0.45, 0.01, 0.015);
      m.roughness = 0.05;
      m.metalness = 0;
      m.emissive = new THREE.Color(0.35, 0.0, 0.01);
      m.emissiveIntensity = 0.6;
      m.depthWrite = false;
      break;
    }
    case 'chrome': {
      const p = toPhysical(m);
      if (!p.map) {
        // neutral bright metal (some exports tint "chrome" green or brown)
        const l = Math.max(0.55, luminance(p.color));
        p.color.setRGB(l, l, l * 1.02);
      }
      p.metalness = 1;
      p.roughness = Math.min(p.roughness, 0.1);
      m = p;
      break;
    }
    case 'carbon': {
      // Gloss clear-coated carbon fibre
      const p = toPhysical(m);
      if (!p.map && luminance(p.color) > 0.06) p.color.setRGB(0.03, 0.03, 0.032);
      p.metalness = 0.25;
      p.roughness = 0.38;
      p.clearcoat = 1;
      p.clearcoatRoughness = 0.04;
      m = p;
      break;
    }
    case 'blackTrim': {
      // High-gloss "shadow line" black, the default on M cars
      const p = toPhysical(m);
      if (!p.map && luminance(p.color) > 0.08) p.color.multiplyScalar(0.6);
      p.metalness = Math.min(p.metalness, 0.1);
      p.roughness = THREE.MathUtils.clamp(p.roughness, 0.22, 0.4);
      p.clearcoat = 0.6;
      p.clearcoatRoughness = 0.08;
      m = p;
      break;
    }
    case 'rubber':
      m.metalness = 0;
      m.roughness = Math.max(m.roughness, 0.75);
      break;
    case 'interior':
      // The cabin is in shadow under the roof: far less of the studio reaches it
      if (m.roughness >= 0.98) m.roughness = 0.6;
      m.envMapIntensity = 0.35;
      break;
    case 'badge':
      if (m.roughness > 0.5) m.roughness = 0.25;
      break;
    case 'emissive':
    case 'other':
    default:
      // glTF default (metallic 1 / rough 1, or authored rough 1) reads as unfinished plastic
      if (m.metalness <= 0.06 && m.roughness >= 0.98) m.roughness = 0.45;
      break;
  }
  // An emissive map is multiplied by the emissive colour. Exporters often attach one with the
  // colour left at the glTF default (black), which adds nothing but still costs a texture upload
  // (the M3 carries about 90 MB of them). Tail lenses set a red emissive colour above and keep theirs.
  if (m.emissiveMap && m.emissive.r + m.emissive.g + m.emissive.b === 0) m.emissiveMap = null;
  m.userData.forgedPass = true;
  m.userData.partKind = kind;
  m.needsUpdate = true;
  if (m !== m0) m0.userData.forgedReplacement = m;
  return m;
}

let glassReflectionMat: THREE.MeshPhysicalMaterial | null = null;
/**
 * Reflection layer for glazing: a black, mirror-smooth surface drawn additively over the tinted
 * glass. A transparent material scales its own reflections by its opacity, which leaves glass
 * looking dull; added separately, the Fresnel reflection stays full strength (faint head-on,
 * strong at grazing angles) while the cabin still shows through.
 */
export function glassReflectionMaterial(): THREE.MeshPhysicalMaterial {
  if (glassReflectionMat) return glassReflectionMat;
  glassReflectionMat = new THREE.MeshPhysicalMaterial({
    name: 'glass_reflection',
    color: 0x000000,
    metalness: 0,
    roughness: 0.015,
    ior: 1.52,
    specularIntensity: 1,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    envMapIntensity: 1.15
  });
  return glassReflectionMat;
}

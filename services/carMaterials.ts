/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { exactExtent, installDetail, maybeSolid, textureStats, type TextureStats } from './detailTextures';

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
  carbonWord: /(^|[^a-z])carbon([^a-z]|$)|carbon_?fib|cfrp/i,
  // "int" only as its own word ("st_int", "carbon_int"), never inside "Paint_0"
  interior: /interior|seat|dash|steer|(^|[^a-z])int([^a-z]|$)|gauge|hud|carpet|cabin|alcantara|leather|stitch|console|door_?card|headliner|pedal|screen|display|button/i,
  rubber: /rubber|seal|gasket|tyre|tire|wiper/i,
  black: /black|blk|trim|plastic|base|grille|grill|diffuser|splitter|undertray|bumper_?low|matte/i,
  badge: /badge|logo|emblem|roundel|lettering|script/i
};

/**
 * Known quirks of specific model files that no name rule can guess. Matched against the part's own
 * names; the first hit wins. Add a line here (with the model) instead of loosening the general rules.
 */
const NAME_OVERRIDES: Array<[RegExp, PartKind]> = [
  // bmw-m4-competition.glb: the kidney grille bars are an untextured pure-white material
  [/Mesheswhite41Mtl/, 'blackTrim'],
  // bmw-m4-cs-vr46.glb: the yellow grille outline is VR46 livery; the stock car has a black one
  [/RED_PAINT\.012/, 'blackTrim'],
  // the radiator / engine-bay material seen through the grille is a bright grey on several files; it should read black
  [/engine(?!.*(alpha)?_?int)|radiator/i, 'blackTrim'],
  // bmw-m3-competition.glb (game rip): atlas materials are named after the first part that used
  // them ("Steeringwheel...", "Interiorgrille...") and every node is Object_N, so the names send
  // them to the cabin wherever they sit. Placed from their position on the car:
  // - kidney-grille slats (untextured light grey) and the rear diffuser's diamond mesh
  [/Meshesstraight11Mtl|Interiorgrille1opac1Mtl_0\b/, 'blackTrim'],
  // - the front bumper's honeycomb intakes (a light-grey atlas region, darkened like other grilles)
  [/Steeringwheelcarbon11Mtl_1\b/, 'blackTrim'],
  //   (the "Steeringwheelgloss1Mtl*" blacks stay as they are: they are the wheel-arch liners and the
  //   dashboard, matte and in shade, which the interior values suit)
  // - the carbon dash trim, a carbon swatch
  [/Steeringwheelcarbon11Mtl_22\b/, 'carbon'],
  // - the roundels (bonnet, boot, steering wheel), the front-wing badge and the rear roundel's backing
  [/Steeringwheelcarbon11Mtl_(5|13|21)\b/, 'badge'],
  // - lamp internals, rear reflectors and the third brake light: outside, in full studio light
  [/Steeringwheelcarbon11Mtl(_(3|10|11))?\b/, 'other']
];

/** Grilles drawn light (an atlas of light bars, light-grey slats): tinted down to gloss black, keeping the pattern. */
const DARKEN_RE = /grille|grill|engine|radiator|RED_PAINT\.012|Steeringwheelcarbon11Mtl_1\b|Meshesstraight11Mtl/i;

export function classifyPart(names: string, m: THREE.MeshStandardMaterial): PartKind {
  for (const [re, kind] of NAME_OVERRIDES) if (re.test(names)) return kind;
  const transparent = m.transparent || m.opacity < 1;
  const emissive = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b > 0.5 || !!m.emissiveMap);
  // carbon as a word ("Carbon_int", "carbon_int") is carbon trim inside the cabin too, but not
  // inside other words ("Steeringwheelcarbon11Mtl" is an atlas named after a steering wheel)
  if (RE.carbonWord.test(names)) return 'carbon';
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

// ---------------------------------------------------------------------------
// Car textures that carry no picture: solid swatches and material tiles
// ---------------------------------------------------------------------------

const DETAIL_RE = {
  // a grille that gets the shared honeycomb when it has no texture of its own
  grilleMesh: /grill|honeycomb/i,
  upholstery: /leather|alcantara|suede|seat|upholster|fabric|carpet|cloth|headliner/i,
  notUpholstery: /belt|logo|sign|stitch|alpha|badge|screen|button|buckle|metal|alu|chrome|plastic|rubber/i,
  suede: /alcantara|suede|fabric|carpet|cloth|headliner/i
};

/** A carbon swatch: any small tile, or a bigger one with no structure beyond the weave. */
const CARBON_TILE = (s: TextureStats) => Math.max(s.width, s.height) <= 256 || s.lowRange <= 12;
/** A grain tile (leather, suede, carpet): a big texture that is the same everywhere at a 32x32 scale. */
const GRAIN_TILE = (s: TextureStats) => s.width * s.height >= 256 * 256 && s.lowRange <= 12 && s.range <= 120;
/** No picture at all, only noise or one colour: a grille drawn with it gets the honeycomb instead. */
const PLAIN = (s: TextureStats) => s.lowRange <= 16;
/** One colour: no structure (mipmapped, it is one value); every pixel within 12 levels is checked
 * exactly on top (exactExtent), so a small logo on a plain texture keeps it. */
const SOLID = (s: TextureStats) => s.range <= 12 && s.lowRange <= 5;

/** Whether the colour map's alpha cuts or fades the part (decals, cut-out meshes). */
function mapAlphaMatters(m: THREE.MeshStandardMaterial) {
  if (!m.map || !(m.transparent || m.alphaTest > 0)) return false;
  const s = textureStats(m.map);
  return !s || s.mean[3] < 0.99 || s.range > 12;
}

/**
 * Replaces a texture that is only a material tile (carbon swatch, leather grain) with its mean
 * value, for a shared detail to take over. Returns whether it did.
 */
function dropTile(m: THREE.MeshStandardMaterial, slot: 'map' | 'normalMap', isTile: (s: TextureStats) => boolean): boolean {
  const tex = m[slot];
  if (!tex) return false;
  if (slot === 'map' && mapAlphaMatters(m)) return false;
  const s = textureStats(tex);
  if (!s || !isTile(s)) return false;
  if (slot === 'map') {
    m.color.multiply(new THREE.Color(s.linear[0], s.linear[1], s.linear[2]));
    m.alphaTest = 0;
  }
  m[slot] = null;
  return true;
}

/**
 * A texture of one colour costs a texture unit, an upload and its memory for nothing: fold its
 * value into the material's factor and drop it (looks the same: the factor times the texel).
 */
function flattenSolidMaps(m: THREE.MeshStandardMaterial) {
  const solid = (tex: THREE.Texture | null) => {
    if (!tex || !maybeSolid(tex)) return null;
    const s = textureStats(tex);
    return s && SOLID(s) && exactExtent(tex) <= 12 ? s : null;
  };
  const lin = (s: TextureStats) => new THREE.Color(s.linear[0], s.linear[1], s.linear[2]);
  let s = solid(m.map);
  if (s) {
    m.color.multiply(lin(s));
    if (m.transparent || m.alphaTest > 0) m.opacity *= s.mean[3];
    m.map = null;
  }
  s = solid(m.emissiveMap);
  if (s) {
    m.emissive.multiply(lin(s));
    m.emissiveMap = null;
  }
  s = solid(m.normalMap);
  if (s && Math.abs(s.mean[0] - 0.5) < 0.02 && Math.abs(s.mean[1] - 0.5) < 0.02 && s.mean[2] > 0.95) m.normalMap = null;
  // glTF packs roughness (G) and metalness (B) in one texture
  const rough = solid(m.roughnessMap), metal = solid(m.metalnessMap);
  if (rough) {
    m.roughness *= rough.mean[1];
    m.roughnessMap = null;
  }
  if (metal) {
    m.metalness *= metal.mean[2];
    m.metalnessMap = null;
  }
  const p = m as THREE.MeshPhysicalMaterial;
  if (p.isMeshPhysicalMaterial) {
    s = solid(p.specularIntensityMap);
    if (s) {
      p.specularIntensity *= s.mean[3];
      p.specularIntensityMap = null;
    }
    s = solid(p.specularColorMap);
    if (s) {
      p.specularColor.multiply(lin(s));
      p.specularColorMap = null;
    }
    s = solid(p.clearcoatMap);
    if (s) {
      p.clearcoat *= s.mean[0];
      p.clearcoatMap = null;
    }
    s = solid(p.clearcoatRoughnessMap);
    if (s) {
      p.clearcoatRoughness *= s.mean[1];
      p.clearcoatRoughnessMap = null;
    }
  }
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
  let kind = classifyPart(`${names} ${m0.name}`, m0);
  // The names of parent groups ("chrome", "silver") must not turn a black plastic into a mirror:
  // an untextured, dark, non-metal material is black trim whatever its ancestors are called
  if (kind === 'chrome' && !m0.map && luminance(m0.color) < 0.1 && m0.metalness < 0.3) kind = 'blackTrim';
  let m: THREE.MeshStandardMaterial = m0;
  // drawn see-through by the file itself (a mesh grille may then get real holes)
  const wasSeeThrough = m0.opacity < 0.95 || m0.alphaTest > 0;

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
      // Gloss clear-coated carbon fibre: a dark, slightly metallic weave whose tows catch the light
      // one way or the other (anisotropic, along the fibres) under a smooth clear coat. The car's
      // own little carbon swatch is replaced by the shared twill (services/detailTextures.ts).
      const p = toPhysical(m);
      dropTile(p, 'map', CARBON_TILE);
      dropTile(p, 'normalMap', CARBON_TILE);
      // graphite fibres in clear resin: near-black, a little metallic; the shared twill darkens
      // every other tow, which gives the checker
      if (!p.map) p.color.setRGB(0.055, 0.055, 0.058);
      p.metalness = 0.25;
      p.roughness = 0.32;
      p.roughnessMap = p.metalnessMap = null;
      p.anisotropy = 0.45;
      p.clearcoat = 1;
      p.clearcoatRoughness = 0.03;
      // carbon trim in the cabin is in the shade of the roof, like the rest of the interior
      if (RE.interior.test(`${names} ${m0.name}`)) p.envMapIntensity = 0.5;
      installDetail(p, 'carbon');
      m = p;
      break;
    }
    case 'blackTrim': {
      // High-gloss "shadow line" black, the default on M cars
      const p = toPhysical(m);
      if (!p.map && luminance(p.color) > 0.08) p.color.multiplyScalar(0.6);
      // A textured grille is a light bar pattern on some files: tint it down to gloss black, keeping the bars
      if (DARKEN_RE.test(`${names} ${m0.name}`)) p.color.multiplyScalar(0.07);
      p.metalness = Math.min(p.metalness, 0.1);
      p.roughness = THREE.MathUtils.clamp(p.roughness, 0.22, 0.4);
      p.clearcoat = 0.6;
      p.clearcoatRoughness = 0.08;
      // An untextured grille mesh gets the shared honeycomb: gloss bars, dark openings (real
      // holes where the file already drew the part see-through)
      const grille = DETAIL_RE.grilleMesh.test(`${names} ${m0.name}`);
      if (grille) {
        dropTile(p, 'map', PLAIN);
        if (!p.map) dropTile(p, 'normalMap', PLAIN);
      }
      if (grille && !p.map && !p.normalMap) {
        installDetail(p, 'grille', { cut: wasSeeThrough });
        if (wasSeeThrough) {
          // the openings are real holes now: the bars themselves are solid
          p.opacity = 1;
          p.transparent = false;
          p.depthWrite = true;
        }
      }
      m = p;
      break;
    }
    case 'rubber':
      m.metalness = 0;
      m.roughness = Math.max(m.roughness, 0.75);
      break;
    case 'interior': {
      // The cabin is in shadow under the roof: far less of the studio reaches it
      if (m.roughness >= 0.98) m.roughness = 0.6;
      m.envMapIntensity = 0.35;
      // Leather, suede and carpet: the car's own grain tiles (often 1024² each, colour and normal)
      // become their mean colour plus the shared grain, which is projected at a real size
      if (!m.transparent && !mapAlphaMatters(m)) {
        const own = `${names} ${m0.name}`;
        // only when every texture it has is a tile: a seat whose colour map carries perforations or
        // stitching keeps both its maps (the normal map belongs with them)
        const tile = (t: THREE.Texture | null) => {
          const st = t ? textureStats(t) : null;
          return !t || (!!st && GRAIN_TILE(st));
        };
        const replaced = !!(m.map || m.normalMap) && tile(m.map) && tile(m.normalMap);
        if (replaced) {
          dropTile(m, 'map', GRAIN_TILE);
          dropTile(m, 'normalMap', GRAIN_TILE);
        }
        const upholstery = DETAIL_RE.upholstery.test(own) && !DETAIL_RE.notUpholstery.test(own);
        if (!m.normalMap && (replaced || (upholstery && !m.map))) {
          const suede = DETAIL_RE.suede.test(own);
          if (!m.roughnessMap) m.roughness = suede ? Math.max(m.roughness, 0.85) : THREE.MathUtils.clamp(m.roughness, 0.5, 0.7);
          installDetail(m, suede ? 'alcantara' : 'leather');
        }
      }
      break;
    }
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
  flattenSolidMaps(m);
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

/**
 * three.js (r163+) ignores `material.envMapIntensity` for reflections that come from `scene.environment`:
 * only `scene.environmentIntensity` counts. A part's own intensity (dark cabin, tinted glass...) only takes
 * effect when the material carries the environment itself, so give it the scene's and scale by the scene's
 * intensity (once per material: cached models are mounted again).
 */
export function bindEnvironment(
  material: THREE.Material | THREE.Material[],
  env: THREE.Texture | null,
  sceneIntensity: number,
  rotation?: THREE.Euler
) {
  if (!env) return;
  for (const m of Array.isArray(material) ? material : [material]) bindOne(m, env, sceneIntensity, rotation);
}

/** Environment maps the engines generate (studio, room, HDRI). A material carrying any other envMap chose it on purpose. */
const engineEnvironments = new WeakSet<THREE.Texture>();
export function registerEnvironment(env: THREE.Texture) {
  engineEnvironments.add(env);
}

/**
 * Binds every lit material under `root` to the current environment (see bindEnvironment): paint, wheel kit,
 * rim faces, decals and car trim alike, so each part's own envMapIntensity is honoured. Run before each drawn
 * frame: it picks up materials created later (a new car, an async rim face) and re-binds everything when the
 * environment is rebuilt (WebGL context restore, HDRI loaded). Only out-of-date materials are touched.
 */
export function syncEnvironment(root: THREE.Object3D, env: THREE.Texture | null, sceneIntensity: number, rotation?: THREE.Euler) {
  if (!env) return;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => bindOne(m, env, sceneIntensity, rotation));
    else bindOne(mesh.material, env, sceneIntensity, rotation);
  });
}

function bindOne(material: THREE.Material, env: THREE.Texture, sceneIntensity: number, rotation?: THREE.Euler) {
  const m = material as THREE.MeshStandardMaterial;
  if (!m || !m.isMeshStandardMaterial) return;
  if (m.envMap && m.envMap !== env && !engineEnvironments.has(m.envMap)) return;
  const u = m.userData;
  // The part's own (relative) intensity; re-read when code has set envMapIntensity since the last bind
  if (u.envApplied === undefined || m.envMapIntensity !== u.envApplied) u.envBase = m.envMapIntensity;
  const want = u.envBase * sceneIntensity;
  // A material's own envMap ignores scene.environmentRotation (the HDRI studio is turned 0.35π)
  if (rotation && !m.envMapRotation.equals(rotation)) m.envMapRotation.copy(rotation);
  if (m.envMap === env && m.envMapIntensity === want) return;
  const hadEnv = !!m.envMap;
  m.envMap = env;
  m.envMapIntensity = want;
  u.envApplied = want;
  if (!hadEnv) m.needsUpdate = true;
}

let grilleBlackCache = new WeakMap<THREE.Material, THREE.Material>();
/**
 * Some files model the kidney-grille bars as real chrome (the old M4 and the M3 Touring). On a modern M
 * car the grille is gloss black: a "chrome" part sitting in the middle of the front fascia becomes
 * black, whatever the file calls it. `centre` is in car space (metres, wheels on y = 0, nose to +z).
 */
export function blackenGrilleChrome(
  material: THREE.Material,
  centre: THREE.Vector3,
  carBox: THREE.Box3
): THREE.Material {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial || m.userData.partKind !== 'chrome') return material;
  const len = carBox.max.z - carBox.min.z;
  const wid = carBox.max.x - carBox.min.x;
  const inFront = centre.z > carBox.max.z - 0.2 * len;
  const grilleHeight = centre.y > 0.25 && centre.y < 0.85;
  const middle = Math.abs(centre.x) < 0.3 * wid;
  if (!(inFront && grilleHeight && middle)) return material;
  let black = grilleBlackCache.get(material);
  if (!black) {
    const p = new THREE.MeshPhysicalMaterial({
      name: `${m.name}_grille_black`,
      color: 0x050505,
      metalness: 0.1,
      roughness: 0.28,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08
    });
    p.userData.forgedPass = true;
    p.userData.partKind = 'blackTrim';
    black = p;
    grilleBlackCache.set(material, black);
  }
  return black;
}

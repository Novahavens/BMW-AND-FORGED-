import * as THREE from 'three';
import { isMatteFinishName } from './wheelStudioParts';

/**
 * How the viewer paints a wheel. The viewer knows nothing about either app's catalogue: it is handed
 * `StudioFinish` rows (a name, a swatch and the paint numbers) and a `PaintRenderer` that turns them
 * into materials. The default renderer is plain physically based paint; an app that wants its own
 * coating model (the configurator's layered finishes) passes its own renderer.
 */

/** The paint numbers for one finish. */
export interface StudioPaint {
  /** Base colour as sRGB hex. */
  hex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  /** Defaults to 0.08. */
  clearcoatRoughness?: number;
  /** How strongly the stage's softboxes show in the paint. Defaults to 1.1. */
  envMapIntensity?: number;
  /** Force a matte or gloss reading. Without it, a matte name ("Black Matte", "Satin Bronze") reads as matte. */
  matte?: boolean;
}

/** One choice in the Finish row. */
export interface StudioFinish {
  id: string;
  name: string;
  /** The dot on the finish chip. */
  swatchHex: string;
  paint: StudioPaint;
}

export interface PaintRenderer {
  /**
   * A new paint material for one part of the rim, already dressed in `finish`. `unitScale` is the
   * mesh's own unit in metres (quantized rim files carry a scale per mesh), for renderers that size
   * detail in real units.
   */
  create(side: THREE.Side, unitScale: number, finish: StudioFinish): THREE.MeshPhysicalMaterial;
  /** Re-dress a material this renderer made when the visitor picks another finish. */
  apply(material: THREE.MeshPhysicalMaterial, finish: StudioFinish): void;
}

/** Shown until the page hands over a finish. */
export const NEUTRAL_FINISH: StudioFinish = {
  id: 'neutral',
  name: 'Silver',
  swatchHex: '#c3c8cd',
  paint: { hex: '#d9dce1', metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1.1 },
};

/** Plain physically based paint, tuned against the SIXNINE reference renders under the studio's lighting. */
export const defaultPaintRenderer: PaintRenderer = {
  create(side, _unitScale, finish) {
    const material = new THREE.MeshPhysicalMaterial({ side });
    defaultPaintRenderer.apply(material, finish);
    return material;
  },
  apply(material, finish) {
    const p = finish.paint;
    const matte = p.matte ?? isMatteFinishName(finish.name);
    const clearcoatRoughness = p.clearcoatRoughness ?? 0.08;
    material.color.set(p.hex);
    material.metalness = matte ? Math.min(p.metalness, 0.2) : p.metalness;
    material.roughness = matte ? Math.max(p.roughness, 0.6) : p.roughness;
    material.clearcoat = matte ? Math.min(p.clearcoat, 0.05) : p.clearcoat;
    material.clearcoatRoughness = matte ? 0.6 : clearcoatRoughness;
    material.envMapIntensity = p.envMapIntensity ?? 1.1;
    material.needsUpdate = true;
  },
};

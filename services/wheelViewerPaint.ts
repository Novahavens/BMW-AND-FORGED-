/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { PaintRenderer } from '../shared/wheel-viewer';
import { FINISH_FLAKE_SCALE, applyFinishLook, finishLook, installFinishLayers } from './wheelFinish';

/**
 * Paints the shared wheel viewer's rims the way the car's wheels are painted (services/wheelFinish.ts),
 * so a finish is the same coating on the rim page and on the car: polished metal, gloss paint, satin or
 * metallic with face/flop and flake. The viewer (shared/wheel-viewer) only knows the finish's four
 * numbers; this is the configurator's reading of them.
 *
 * A module-level constant on purpose: the viewer reads its `paint` prop once, when the stage is made.
 */

/** How strongly the stage's softboxes show in the paint (the viewer's own setting for its stage). */
const STAGE_ENV_INTENSITY = 1.1;

export const configuratorPaint: PaintRenderer = {
  create(side, unitScale, finish) {
    const material = new THREE.MeshPhysicalMaterial({ side });
    material.envMapIntensity = STAGE_ENV_INTENSITY;
    // The packed rim files are quantized, so each mesh has its own unit: scale the flake cells by it to
    // keep them about 1 mm, as on the car.
    installFinishLayers(material).uFinishFlakeScale.value = FINISH_FLAKE_SCALE * (unitScale > 0 ? unitScale : 1);
    configuratorPaint.apply(material, finish);
    return material;
  },
  apply(material, finish) {
    applyFinishLook(material, finishLook(finish.paint));
  },
};

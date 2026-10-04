/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RimPhotoOptions } from './wheelKit';

/**
 * Prepared face masks for photo wheels the automatic photo reading can't get right on its own
 * (e.g. a photo taken at an angle, or crossed spokes in front of the barrel). A face mask is a
 * PNG whose alpha is the spoke face only: solid spokes, hub and lip, see-through everywhere else
 * out to the lip (no barrel). It replaces the photo for building the 3D spokes; the photo is
 * still shown in the catalogue. How to make one: the `wheel3d` skill (make-bar-face.py for
 * straight-bar designs, make-face-mask.py otherwise).
 */
export const RIM_FACE_MASKS: Record<string, string> = {
  forged_fsa_07: '/rim-faces/forged_fsa_07.png',
  forged_fsa_10: '/rim-faces/forged_fsa_10.png',
  forged_fsa_11: '/rim-faces/forged_fsa_11.png',
  forged_fsa_12: '/rim-faces/forged_fsa_12.png', // bar faces drawn from the photos (docs/rim-template/fsa_NN-spec.json)
  forged_fsa_13: '/rim-faces/forged_fsa_13.png',
  forged_fsa_14: '/rim-faces/forged_fsa_14.png'
};

/**
 * Per-wheel overrides of how the photo is read (wheelKit RimPhotoOptions), for a design the
 * defaults don't suit, e.g. { straightArms: false } for curved arms.
 */
export const RIM_FACE_OPTIONS: Record<string, RimPhotoOptions> = {
  forged_fsa_14: { fold: 25 } // 25 spokes: symmetry detection stops at 24
};

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
 * straight-bar designs, make-face-mask.py otherwise). Empty now: the six stocked wheels are 3D rim
 * files, and the photo-traced designs were deleted in Nov 2026 (archive.legacy_wheels in Supabase).
 */
export const RIM_FACE_MASKS: Record<string, string> = {};

/**
 * Per-wheel overrides of how the photo is read (wheelKit RimPhotoOptions), for a design the
 * defaults don't suit, e.g. { straightArms: false } for curved arms.
 */
export const RIM_FACE_OPTIONS: Record<string, RimPhotoOptions> = {};

/**
 * Lettering on a wheel's centre cap, for designs whose real cap carries a word instead of the FSA
 * monogram (the cap is black with a gold ring and gold lettering). The Blender spin of the same
 * wheel (scripts/rim3d, "cap": {"text": ...} in its spec) shows the same word.
 */
export const RIM_CAP_TEXT: Record<string, string> = {};

/**
 * Pure helpers for the 3D wheel studio: which part a mesh is, and how far each part
 * moves in the exploded view. Kept free of three.js so they can be unit tested.
 */

export type StudioPart = 'barrel' | 'face' | 'bolts' | 'cap' | 'rotor' | 'caliper';

/**
 * Classify a mesh by its glTF node name. Accepts the documented names
 * (Rim_Barrel, Rim_Face_Spokes, Hardware_Bolts, Center_Cap, Brake_Rotor, Brake_Caliper)
 * and the short names older exports used (barrel, face, bolts, cap, rotor, caliper).
 * Anything unrecognised is treated as part of the face, so it still follows the finish.
 */
export function classifyStudioPart(meshName: string): StudioPart {
  const n = (meshName || '').toLowerCase();
  if (n.includes('caliper')) return 'caliper';
  if (n.includes('rotor') || n.includes('disc')) return 'rotor';
  if (n.includes('barrel') || n.includes('lip')) return 'barrel';
  if (n.includes('bolt') || n.includes('lug') || n.includes('hardware')) return 'bolts';
  if (n.includes('cap')) return 'cap';
  return 'face';
}

/** Parts that take the selected paint finish. Bolts and brakes keep their own materials. */
export const FINISH_PARTS: readonly StudioPart[] = ['barrel', 'face', 'cap'];

/** Parts that only exist for the brake clearance check. */
export const BRAKE_PARTS: readonly StudioPart[] = ['rotor', 'caliper'];

/**
 * Offset of each part along the axle in the exploded view, in metres.
 * Positive is outboard (toward the viewer of the wheel face).
 */
export function explodeOffsets(wheelDiameterM: number): Record<StudioPart, number> {
  const unit = wheelDiameterM * 0.4;
  return {
    face: unit * 0.55,
    bolts: unit * 0.3,
    cap: unit * 1.15,
    barrel: -unit * 0.5,
    rotor: -unit * 0.95,
    caliper: -unit * 1.25,
  };
}

/**
 * Camera distance multiplier so the wheel always fits the stage.
 * A phone-width stage needs the camera further back so the wheel is not cropped at the
 * sides, and a stage partly covered by the control panel needs it further back so the
 * wheel fits the height that is still visible.
 *
 * @param aspect stage width / height
 * @param visibleHeightFraction share of the stage height not covered by controls (0-1)
 */
export function cameraDistanceScale(aspect: number, visibleHeightFraction = 1): number {
  const widthFit = 0.85 / Math.max(0.2, aspect);
  const heightFit = 0.78 / Math.min(1, Math.max(0.35, visibleHeightFraction));
  return Math.max(1, widthFit, heightFit);
}

/**
 * Whether a finish name describes a matte or satin paint ("Black Matte", "Satin Bronze").
 * The studio paints each catalogue finish with one gloss setting; a matte name flattens it so a
 * matte wheel is not shown with a gloss clear coat.
 */
export function isMatteFinishName(finishName?: string | null): boolean {
  return /\b(matte|matt|satin|flat)\b/i.test(finishName ?? '');
}

/** True when the visitor has asked their device to reduce motion. False outside a browser. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

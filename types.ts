/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CarModel {
  id: string;
  name: string;
  badge: string;
  generation: string;
  chassisCode: string;
  engine: string;
  power: string;
  torque: string;
  acceleration: string;
  recommendedWheelFitment: {
    front: string;
    rear: string;
    pcd: string;
    cb: string;
  };
  /** Fallback body when no GLB: convertible uses the coupe shape, touring/gran_coupe the sedan shape. */
  bodyStyle: 'coupe' | 'sedan' | 'suv' | 'convertible' | 'touring' | 'gran_coupe';
  /** Factory paints this car offers, in BMW's order (paint ids). Empty = every active paint. */
  paintIds?: string[];
  /** Uploaded GLB; the procedural body is used when absent. */
  modelUrl?: string | null;
  modelRotationDeg?: number;
  modelLengthM?: number;
  /** Regex (case-insensitive) matched against mesh/material names to receive the paint. */
  paintMeshMatch?: string;
  /** Regex for the GLB's own wheels/brakes, hidden so the configurable wheels replace them. */
  hideMeshMatch?: string;
}

export interface PaintColor {
  id: string;
  name: string;
  code: string;
  hex: string;
  type: 'Metallic' | 'Frozen' | 'Uni';
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** false = hidden from the configurator (e.g. no reliable colour yet). */
  active?: boolean;
}

// Finishes are editable in the admin, so any id is allowed; these are the seeded ones.
export type FinishVariantKey = 'liquid_metal' | 'bronze' | 'black' | 'silver' | (string & {});

export interface WheelFinish {
  id: FinishVariantKey;
  name: string;
  colorName: string;
  hex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  description: string;
  badge: string;
}

export interface WheelDesign {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  style: string;
  spokeType: 'multi' | 'y_spoke' | 'directional' | 'mesh' | 'aerodisc' | 'clubsport';
  spokeCount: number;
  weightFrontKg: number;
  weightRearKg: number;
  weightSavingsKg: number;
  standardSizes: string[];
  pricePerSet: number;
  /** Set price per rim size, e.g. { '20"': 7800 }. Keys are the sizes offered. */
  priceBySize?: Record<string, number>;
  description: string;
  highlights: string[];
  availableVariants: FinishVariantKey[];
  defaultVariant: FinishVariantKey;
  /** Uploaded front-on rim PNG (transparent background); turned into 3D spokes on the car. */
  imageUrl?: string | null;
  /** false = show the PNG as a flat disc instead of extruding it into 3D spokes. */
  imageExtrude?: boolean;
  /** Uploaded 3D rim (.glb): wins over the image. */
  modelUrl?: string | null;
  /** Turn the GLB rim around when its face points into the car. */
  modelFlip?: boolean;
}

export interface CaliperColor {
  id: string;
  name: string;
  hex: string;
  logo: string;
}

export type CameraViewPreset =
  | 'showroom'
  | 'hero'
  | 'frontThreeQuarter' 
  | 'side' 
  | 'frontWheel' 
  | 'rearWheel' 
  | 'rearThreeQuarter' 
  | 'top';

export type StudioTheme = 'studio_light' | 'studio_dark' | 'studio_pure' | 'night_runway';

export interface BrochureLead {
  id: string;
  name: string;
  surname: string;
  email: string;
  cellNumber: string;
  carModel: string;
  paintColor: string;
  wheelModel: string;
  wheelFinish: string;
  wheelSize: string;
  caliperColor: string;
  requestFitmentConsultation: boolean;
  timestamp: string;
  notes?: string;
}

export interface Custom2DWheelConfig {
  imageUrl: string;
  name: string;
  bumpScale: number;
  invertAlpha: boolean;
  spokeThreshold: number;
  /** Trace the cut-out and build solid 3D spokes (default); false shows a flat textured disc. */
  extrude?: boolean;
}

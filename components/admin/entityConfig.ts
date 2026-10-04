/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatalogTable } from '../../services/catalogService';
import { ASSET_BUCKETS } from '../../services/supabaseClient';

// Field keys are the Postgres column names; the editor works on raw rows.
export type FieldSpec =
  | { key: string; label: string; type: 'text' | 'textarea' | 'color' | 'bool'; hint?: string }
  | { key: string; label: string; type: 'number'; step?: number; hint?: string }
  | { key: string; label: string; type: 'select'; options: string[]; hint?: string }
  | { key: string; label: string; type: 'list'; hint?: string }
  | { key: string; label: string; type: 'finishes'; hint?: string }
  | { key: string; label: string; type: 'paints'; hint?: string }
  | { key: string; label: string; type: 'fitment'; hint?: string }
  | { key: string; label: string; type: 'sizePrices'; hint?: string }
  | { key: string; label: string; type: 'asset'; bucket: string; accept: string; hint?: string };

export interface EntitySpec {
  table: CatalogTable;
  label: string;
  fields: FieldSpec[];
  defaults: Record<string, unknown>;
}

const common: FieldSpec[] = [
  { key: 'sort_order', label: 'Sort order', type: 'number', step: 1 },
  { key: 'active', label: 'Visible in configurator', type: 'bool' }
];

export const ENTITIES: EntitySpec[] = [
  {
    table: 'cars',
    label: 'Cars',
    fields: [
      { key: 'id', label: 'ID (slug)', type: 'text', hint: 'Unique, e.g. m4_g82. Cannot be changed after saving.' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'badge', label: 'Badge', type: 'text' },
      { key: 'generation', label: 'Generation', type: 'text' },
      { key: 'chassis_code', label: 'Chassis code', type: 'text' },
      { key: 'engine', label: 'Engine', type: 'text' },
      { key: 'power', label: 'Power', type: 'text' },
      { key: 'torque', label: 'Torque', type: 'text' },
      { key: 'acceleration', label: 'Acceleration', type: 'text' },
      { key: 'recommended_wheel_fitment', label: 'Recommended fitment', type: 'fitment' },
      { key: 'body_style', label: 'Fallback body style', type: 'select', options: ['coupe', 'sedan', 'suv', 'convertible', 'touring', 'gran_coupe'], hint: 'Used when no 3D model is uploaded (convertible looks like the coupe; touring and gran_coupe like the sedan).' },
      { key: 'paint_ids', label: 'Factory paints', type: 'paints', hint: 'The paints this car is offered in, in the order ticked. None ticked = every visible paint.' },
      { key: 'model_url', label: '3D model (.glb)', type: 'asset', bucket: ASSET_BUCKETS.carModels, accept: '.glb,model/gltf-binary', hint: 'Max 50 MB. Compress with gltf-transform for fast loading.' },
      { key: 'model_rotation_deg', label: 'Model rotation (°)', type: 'number', step: 90, hint: 'Rotate until the nose faces the camera in the front 3/4 view.' },
      { key: 'model_length_m', label: 'Real car length (m)', type: 'number', step: 0.01, hint: 'The model is scaled to this length.' },
      { key: 'paint_mesh_match', label: 'Paint mesh/material names', type: 'text', hint: 'Regex, case-insensitive. Matching parts receive the paint colour.' },
      { key: 'hide_mesh_match', label: 'Hide mesh names', type: 'text', hint: 'Regex. The model’s own wheels/brakes, replaced by configurable wheels.' },
      ...common
    ],
    defaults: {
      id: '', name: '', badge: '', generation: '', chassis_code: '', engine: '', power: '', torque: '', acceleration: '',
      recommended_wheel_fitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
      body_style: 'coupe', paint_ids: [], model_url: null, model_rotation_deg: 0, model_length_m: 4.7,
      paint_mesh_match: 'paint|body|carpaint|exterior', hide_mesh_match: 'wheel|rim|tyre|tire|brake|caliper|rotor',
      sort_order: 99, active: true
    }
  },
  {
    table: 'wheels',
    label: 'Wheels',
    fields: [
      { key: 'id', label: 'ID (slug)', type: 'text', hint: 'Unique. Cannot be changed after saving.' },
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'style', label: 'Style', type: 'text' },
      { key: 'image_url', label: 'Rim image (.png)', type: 'asset', bucket: ASSET_BUCKETS.rimImages, accept: 'image/png,image/webp', hint: 'Front-on shot, transparent background AND transparent gaps between spokes, rim edge touching the image edge. Automatically turned into 3D spokes.' },
      { key: 'image_extrude', label: 'Build 3D spokes from the image', type: 'bool', hint: 'Untick to show the image flat (e.g. if the background could not be removed cleanly).' },
      { key: 'model_url', label: 'Rim 3D model (.glb) – optional', type: 'asset', bucket: ASSET_BUCKETS.rimModels, accept: '.glb,model/gltf-binary', hint: 'Best quality: your manufacturer\'s CAD file. Upload .glb here; a STEP/STP, IGES, STL or OBJ file is converted to .glb automatically first. Replaces the image on the car. Rim only (no tyre); size and orientation are fitted automatically. Tick "Flip" if the spokes face into the car.' },
      { key: 'model_flip', label: 'Flip 3D rim', type: 'bool', hint: 'Tick if the rim face points into the car.' },
      { key: 'spoke_type', label: 'Procedural spokes (no image)', type: 'select', options: ['multi', 'y_spoke', 'directional', 'mesh', 'aerodisc', 'clubsport'] },
      { key: 'spoke_count', label: 'Spoke count', type: 'number', step: 1 },
      { key: 'price_by_size', label: 'Sizes & set prices (USD, 4 wheels)', type: 'sizePrices', hint: 'Only sizes listed here are offered. The size visibly changes the rim on the car.' },
      { key: 'available_variants', label: 'Available finishes', type: 'finishes' },
      { key: 'default_variant', label: 'Default finish ID', type: 'text' },
      { key: 'weight_front_kg', label: 'Front weight (kg)', type: 'number', step: 0.1 },
      { key: 'weight_rear_kg', label: 'Rear weight (kg)', type: 'number', step: 0.1 },
      { key: 'weight_savings_kg', label: 'Weight saving (kg)', type: 'number', step: 0.1 },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'highlights', label: 'Highlights', type: 'list', hint: 'One per line' },
      ...common
    ],
    defaults: {
      id: '', code: '', name: '', subtitle: '', style: '', image_url: null, image_extrude: true, model_url: null, model_flip: false, spoke_type: 'multi', spoke_count: 10,
      price_by_size: { '19"': 0, '20"': 0, '21"': 0, '22"': 0 }, available_variants: ['liquid_metal'], default_variant: 'liquid_metal',
      weight_front_kg: 0, weight_rear_kg: 0, weight_savings_kg: 0, description: '', highlights: [],
      sort_order: 99, active: true
    }
  },
  {
    table: 'wheel_finishes',
    label: 'Finishes',
    fields: [
      { key: 'id', label: 'ID (slug)', type: 'text', hint: 'Unique. Referenced by wheels.' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'color_name', label: 'Colour name', type: 'text' },
      { key: 'hex', label: 'Colour', type: 'color' },
      { key: 'metalness', label: 'Metalness (0–1)', type: 'number', step: 0.01 },
      { key: 'roughness', label: 'Roughness (0–1)', type: 'number', step: 0.01 },
      { key: 'clearcoat', label: 'Clearcoat (0–1)', type: 'number', step: 0.01 },
      { key: 'badge', label: 'Badge', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      ...common
    ],
    defaults: {
      id: '', name: '', color_name: '', hex: '#cccccc', metalness: 0.9, roughness: 0.2, clearcoat: 0.8,
      badge: '', description: '', sort_order: 99, active: true
    }
  },
  {
    table: 'paints',
    label: 'Paints',
    fields: [
      { key: 'id', label: 'ID (slug)', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'code', label: 'Paint code', type: 'text' },
      { key: 'hex', label: 'Colour', type: 'color' },
      { key: 'type', label: 'Type', type: 'select', options: ['Metallic', 'Pearl', 'Frozen', 'Uni'] },
      { key: 'metalness', label: 'Metalness (0–1)', type: 'number', step: 0.01 },
      { key: 'roughness', label: 'Roughness (0–1)', type: 'number', step: 0.01 },
      { key: 'clearcoat', label: 'Clearcoat (0–1)', type: 'number', step: 0.01 },
      { key: 'clearcoat_roughness', label: 'Clearcoat roughness (0–1)', type: 'number', step: 0.01 },
      ...common
    ],
    defaults: {
      // Calibrated Metallic finish (docs/bmw-factory-paints.md, "Renderer calibration"); Uni uses
      // metalness 0 / roughness 0.35, Frozen roughness 0.55 / metalness 0.4 / clearcoat 0.
      id: '', name: '', code: '', hex: '#888888', type: 'Metallic', metalness: 0.45, roughness: 0.32,
      clearcoat: 1, clearcoat_roughness: 0.04, sort_order: 99, active: true
    }
  }
];

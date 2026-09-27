/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarModel, PaintColor, WheelDesign, WheelFinish, CaliperColor, FinishVariantKey } from '../types';

export const BMW_MODELS: CarModel[] = [
  {
    id: 'm4_g82',
    name: 'BMW M4 Competition',
    badge: 'M4 G82',
    generation: 'G82',
    chassisCode: 'G82 M4',
    engine: '3.0L S58 Twin-Turbo Inline-6',
    power: '503 HP / 510 PS',
    torque: '650 Nm (479 lb-ft)',
    acceleration: '0-100 km/h in 3.5s',
    recommendedWheelFitment: {
      front: '20 x 9.5J ET15',
      rear: '21 x 10.5J ET18',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'coupe',
    paintIds: [
      'skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red',
      'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii',
      'dravit_grey', 'san_marino_blue', 'velvet_blue', 'java_green', 'frozen_dark_grey_ii', 'speed_yellow',
      'frozen_pure_grey', 'frozen_black', 'marina_bay_blue', 'frozen_portimao_blue',
      'frozen_brilliant_white'
    ],
    modelUrl: '/models/bmw-m4-competition.glb',
    modelLengthM: 4.79,
    paintMeshMatch: 'zx1mtl|body151mtl|pillars1mtl|livery1mtl',
    hideMeshMatch: '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|rotor)'
  },
  {
    id: 'm4_convertible_g83',
    name: 'BMW M4 Competition Convertible',
    badge: 'M4 Convertible G83',
    generation: 'G83',
    chassisCode: 'G83 M4 Convertible',
    // Specs intentionally blank (not needed by the client); blank rows are hidden in the UI.
    engine: '',
    power: '',
    torque: '',
    acceleration: '',
    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
    bodyStyle: 'convertible',
    paintIds: [
      'skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red',
      'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii',
      'dravit_grey', 'frozen_deep_grey', 'velvet_orchid_ii', 'frozen_portimao_blue',
      'frozen_brilliant_white'
    ]
  },
  {
    id: 'm3_g80',
    name: 'BMW M3 Competition',
    badge: 'M3 G80',
    generation: 'G80',
    chassisCode: 'G80 M3',
    engine: '3.0L S58 Twin-Turbo Inline-6',
    power: '503 HP / 510 PS',
    torque: '650 Nm (479 lb-ft)',
    acceleration: '0-100 km/h in 3.5s',
    recommendedWheelFitment: {
      front: '19 x 9.5J ET14',
      rear: '20 x 10.5J ET16',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'sedan',
    paintIds: [
      'skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red',
      'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii',
      'dravit_grey', 'san_marino_blue', 'wildberry', 'ruby_black', 'frozen_deep_green',
      'frozen_dark_grey_ii', 'fire_orange_iii', 'frozen_black', 'thunder', 'mineral_white', 'riviera_blue',
      'marina_bay_blue', 'mint_green', 'sepia_iii', 'twilight_purple', 'frozen_tanzanite_blue',
      'frozen_portimao_blue', 'frozen_pure_grey_ii', 'anglesey_green', 'ruby_star', 'frozen_brilliant_white',
      'frozen_preciosa_red'
    ],
    modelUrl: '/models/bmw-m3-competition.glb',
    modelRotationDeg: 180,
    modelLengthM: 4.79,
    paintMeshMatch: 'merged_materials',
    hideMeshMatch: '(^|[^a-z])(wheelcolor1mtl|lugs1mtl|calliperpaintrl1mtl|union2mtl|stem1mtl|tyre1mtl)'
  },
  {
    id: 'm3_touring_g81',
    name: 'BMW M3 Competition Touring',
    badge: 'M3 Touring G81',
    generation: 'G81',
    chassisCode: 'G81 M3 Touring',
    // Specs intentionally blank (not needed by the client); blank rows are hidden in the UI.
    engine: '',
    power: '',
    torque: '',
    acceleration: '',
    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
    bodyStyle: 'touring',
    paintIds: [
      'skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red',
      'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii',
      'dravit_grey', 'malachite_green_ii', 'speed_yellow', 'frozen_black', 'riviera_blue', 'brewster_green',
      'sepia_iii', 'twilight_purple', 'frozen_portimao_blue', 'frozen_pure_grey_ii', 'anglesey_green',
      'urban_green_ii', 'ruby_star', 'frozen_brilliant_white', 'lagoon_green', 'le_mans_blue'
    ],
    modelUrl: '/models/bmw-m3-touring-g81.glb',
    modelLengthM: 4.8,
    paintMeshMatch: '(^|\\s)m3g81law$',
    hideMeshMatch: 'rim_04|3_wheel|amdb11'
  },
  {
    id: 'm2_g87',
    name: 'BMW M2 Coupe',
    badge: 'M2 G87',
    generation: 'G87',
    chassisCode: 'G87 M2',
    engine: '3.0L S58 Twin-Turbo Inline-6',
    power: '453 HP / 460 PS',
    torque: '550 Nm (406 lb-ft)',
    acceleration: '0-100 km/h in 3.9s',
    recommendedWheelFitment: {
      front: '19 x 9.5J ET12',
      rear: '20 x 10.5J ET14',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'coupe',
    paintIds: [
      'fire_red', 'skyscraper_grey', 'brooklyn_grey', 'black_sapphire', 'portimao_blue', 'zandvoort_blue',
      'sao_paulo_yellow', 'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey', 'java_green',
      'grigio_telesto', 'twilight_purple', 'voodoo_blue'
    ],
    modelUrl: '/models/bmw-m2-competition.glb',
    modelLengthM: 4.58,
    paintMeshMatch: 'm2g87undg_paint',
    hideMeshMatch: '(^|[^a-z])(rimslaw|tire_01|calliper|caliper|brakedisc|rotor)'
  },
  {
    id: 'm235_f74',
    name: 'BMW M235 xDrive Gran Coupé',
    badge: 'M235 F74',
    generation: 'F74',
    chassisCode: 'F74 M235',
    // Specs intentionally blank (not needed by the client); blank rows are hidden in the UI.
    engine: '',
    power: '',
    torque: '',
    acceleration: '',
    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
    bodyStyle: 'gran_coupe',
    paintIds: [
      'fire_red', 'skyscraper_grey', 'thundernight', 'brooklyn_grey', 'black_sapphire', 'portimao_blue',
      'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey', 'storm_bay'
    ],
    modelUrl: '/models/bmw-m235-gran-coupe.glb',
    modelRotationDeg: 180,
    modelLengthM: 4.54,
    paintMeshMatch: '(^|\\s)paint$',
    hideMeshMatch: 'wheel_lf'
  },
  {
    id: 'm5_g90',
    name: 'BMW M5',
    badge: 'M5 G90',
    generation: 'G90',
    chassisCode: 'G90 M5',
    engine: '4.4L S68 Twin-Turbo V8 M Hybrid',
    power: '727 HP / 535 kW',
    torque: '1,000 Nm (738 lb-ft)',
    acceleration: '0-100 km/h in 3.5s',
    recommendedWheelFitment: {
      front: '20 x 9.5J',
      rear: '21 x 10.5J',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'sedan',
    paintIds: [
      'carbon_black', 'fire_red', 'marina_bay_blue', 'brooklyn_grey', 'sophisto_grey_brilliant_effect',
      'isle_of_man_green', 'black_sapphire', 'damast_red', 'fire_orange_iii', 'imola_red', 'speed_yellow',
      'frozen_black', 'nardo_grey', 'mineral_white', 'oxford_green_ii', 'bernina_grey_amber_effect',
      'alpine_white', 'storm_bay', 'frozen_deep_grey_c64'
    ],
    modelUrl: '/models/bmw-m5-g90-cc-by.glb',
    modelLengthM: 5.1,
    paintMeshMatch: 'm5g90_body_paint',
    hideMeshMatch: '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)'
  },
  {
    id: 'm5_touring_g99',
    name: 'BMW M5 Touring',
    badge: 'M5 Touring G99',
    generation: 'G99',
    chassisCode: 'G99 M5 Touring',
    // Specs intentionally blank (not needed by the client); blank rows are hidden in the UI.
    engine: '',
    power: '',
    torque: '',
    acceleration: '',
    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
    bodyStyle: 'touring',
    paintIds: [
      'carbon_black', 'fire_red', 'marina_bay_blue', 'brooklyn_grey', 'sophisto_grey_brilliant_effect',
      'isle_of_man_green', 'black_sapphire', 'urban_green_ii', 'barcelona_blue', 'alpine_white', 'storm_bay',
      'frozen_deep_grey_c64'
    ]
  },
  {
    id: 'm8_f92',
    name: 'BMW M8 Competition Coupé',
    badge: 'M8 F92',
    generation: 'F92',
    chassisCode: 'F92 M8',
    // Specs intentionally blank (not needed by the client); blank rows are hidden in the UI.
    engine: '',
    power: '',
    torque: '',
    acceleration: '',
    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
    bodyStyle: 'coupe',
    paintIds: [
      'alpine_white', 'aventurin_red', 'black_sapphire', 'brooklyn_grey', 'dravit_grey', 'frozen_pure_grey',
      'frozen_tanzanite_blue', 'isle_of_man_green', 'marina_bay_blue', 'skyscraper_grey',
      'tanzanite_blue_ii'
    ],
    modelUrl: '/models/bmw-m8-competition-f92.glb',
    modelLengthM: 4.87,
    paintMeshMatch: 'carpaint',
    hideMeshMatch: 'm8f92_(wheel|caliper|brakedisc)'
  },
  {
    id: 'x3m50_g45',
    name: 'BMW X3 M50 xDrive',
    badge: 'X3 M50 G45',
    generation: 'G45',
    chassisCode: 'G45 X3 M50',
    // Specs intentionally blank (not needed by the client); blank rows are hidden in the UI.
    engine: '',
    power: '',
    torque: '',
    acceleration: '',
    recommendedWheelFitment: { front: '', rear: '', pcd: '5x112', cb: '66.6mm' },
    bodyStyle: 'suv',
    paintIds: [
      'fire_red', 'brooklyn_grey', 'sophisto_grey_brilliant_effect', 'arctic_race_blue', 'black_sapphire',
      'dune_grey', 'alpine_white', 'tanzanite_blue_ii', 'frozen_deep_grey_c64', 'frozen_pure_grey'
    ],
    modelUrl: '/models/bmw-x3-m50-g45.glb',
    modelRotationDeg: 180,
    modelLengthM: 4.76,
    paintMeshMatch: 'paint_|^object_86\\s',
    hideMeshMatch: 'wheel_'
  },
  {
    id: 'x5m_f95',
    name: 'BMW X5 M Competition',
    badge: 'X5 M F95',
    generation: 'F95 LCI',
    chassisCode: 'F95 X5 M',
    engine: '4.4L S68 Twin-Turbo V8 Mild Hybrid',
    power: '617 HP / 625 PS',
    torque: '750 Nm (553 lb-ft)',
    acceleration: '0-100 km/h in 3.8s',
    recommendedWheelFitment: {
      front: '21 x 10.5J',
      rear: '22 x 11.5J',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'suv',
    paintIds: [
      'carbon_black', 'mineral_white', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red',
      'fire_red_ii', 'anglesey_green', 'sepang_bronze', 'alpine_white', 'dravit_grey'
    ],
    modelUrl: '/models/bmw-x5m-f95.glb',
    modelLengthM: 4.94,
    paintMeshMatch: 'marina_bay',
    hideMeshMatch: '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)|csb_paint1mtl'
  }
];

// BMW South Africa factory paints (docs/bmw-factory-paints.md). Hex values are renderer-calibrated base
// colours (matched to BMW's own car renders), not the raw swatch samples in the doc.
// Mirrors supabase/migrations/20260927030000_factory_paints.sql; each car lists its own in paintIds.
export const BMW_PAINTS: PaintColor[] = [
  { id: 'fire_red', name: 'Fire Red', code: 'C68', hex: '#8c2226', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'skyscraper_grey', name: 'Skyscraper Grey', code: 'C4W', hex: '#555a5d', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'brooklyn_grey', name: 'Brooklyn Grey', code: 'C4P', hex: '#889296', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'black_sapphire', name: 'Black Sapphire', code: '475', hex: '#151617', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'portimao_blue', name: 'Portimao Blue', code: 'C31', hex: '#1e3066', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'zandvoort_blue', name: 'Zandvoort Blue', code: 'C6E', hex: '#547bad', type: 'Uni', roughness: 0.35, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'sao_paulo_yellow', name: 'São Paulo Yellow', code: 'C4H', hex: '#88a11c', type: 'Uni', roughness: 0.35, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'alpine_white', name: 'Alpine White III', code: '300', hex: '#c8c8c9', type: 'Uni', roughness: 0.35, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'frozen_portimao_blue_c6r', name: 'Frozen Portimao Blue', code: 'C6R', hex: '#0e2357', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_pure_grey', name: 'Frozen Pure Grey', code: 'C5A', hex: '#44494c', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'java_green', name: 'Java Green', code: 'P7V', hex: '#638954', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'grigio_telesto', name: 'Grigio Telesto', code: 'P6M', hex: '#555858', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'twilight_purple', name: 'Twilight Purple', code: 'P28', hex: '#5a2c4d', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'voodoo_blue', name: 'Voodoo Blue', code: 'P7L', hex: '#888888', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04, active: false }, // finish unverified; no colour in the BMW data yet
  { id: 'thundernight', name: 'Thundernight', code: 'C56', hex: '#3a1f3d', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'storm_bay', name: 'Storm Bay', code: 'C3N', hex: '#5f686e', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'isle_of_man_green', name: 'Isle of Man Green', code: 'C4G', hex: '#0f5444', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'toronto_red', name: 'Toronto Red', code: 'C3G', hex: '#9d3307', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'aventurine_red_iii', name: 'Aventurine Red III', code: 'C57', hex: '#630f1c', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'tanzanite_blue_ii', name: 'Tanzanite Blue II', code: 'C3Z', hex: '#151f32', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'dravit_grey', name: 'Dravit Grey', code: 'C36', hex: '#3c4041', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'san_marino_blue', name: 'San Marino Blue', code: 'B51', hex: '#092455', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'wildberry', name: 'Wildberry', code: 'T09', hex: '#5a2834', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'ruby_black', name: 'Ruby Black', code: 'X03', hex: '#24181c', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'frozen_deep_green', name: 'Frozen Deep Green', code: 'P80', hex: '#3f4d3c', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_dark_grey_ii', name: 'Frozen Dark Grey II', code: 'P79', hex: '#2a3235', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'fire_orange_iii', name: 'Fire Orange III', code: 'P7E', hex: '#975305', type: 'Uni', roughness: 0.35, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'frozen_black', name: 'Frozen Black', code: 'U91', hex: '#18191b', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'thunder', name: 'Thunder', code: 'P6L', hex: '#373f43', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'mineral_white', name: 'Mineral White', code: 'A96', hex: '#ebeae9', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'riviera_blue', name: 'Riviera Blue', code: 'P5C', hex: '#028fc1', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'marina_bay_blue', name: 'Marina Bay Blue', code: 'C1K', hex: '#1c4085', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'mint_green', name: 'Mint Green', code: 'W97', hex: '#409084', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'sepia_iii', name: 'Sepia III', code: 'S0N', hex: '#4b494b', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'frozen_tanzanite_blue', name: 'Frozen Tanzanite Blue', code: 'X1G', hex: '#02023f', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_portimao_blue', name: 'Frozen Portimao Blue', code: 'X1E', hex: '#0e2357', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_pure_grey_ii', name: 'Frozen Pure Grey II', code: 'X1F', hex: '#717e82', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'anglesey_green', name: 'Anglesey Green', code: 'P9R', hex: '#024b3a', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'ruby_star', name: 'Ruby Star', code: 'P9L', hex: '#75084c', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'frozen_brilliant_white', name: 'Frozen Brilliant White', code: 'X16', hex: '#cbcec4', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_preciosa_red', name: 'Frozen Preciosa Red', code: 'P9C', hex: '#510202', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'malachite_green_ii', name: 'Malachite Green II', code: 'P85', hex: '#31433a', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'speed_yellow', name: 'Speed Yellow', code: 'U96', hex: '#b09918', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'brewster_green', name: 'Brewster Green', code: 'T42', hex: '#1a2c26', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'urban_green_ii', name: 'Urban Green II', code: 'P9P', hex: '#485037', type: 'Uni', roughness: 0.35, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'lagoon_green', name: 'Lagoon Green', code: '266', hex: '#135861', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'le_mans_blue', name: 'Le Mans Blue', code: '381', hex: '#1c5185', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'velvet_blue', name: 'Velvet Blue', code: '379', hex: '#342f58', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'frozen_deep_grey', name: 'Frozen Deep Grey', code: 'P7X', hex: '#25292f', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'velvet_orchid_ii', name: 'Velvet Orchid II', code: 'L74', hex: '#806c72', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'carbon_black', name: 'Carbon Black', code: '416', hex: '#0e1b2b', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'sophisto_grey_brilliant_effect', name: 'Sophisto Grey Brilliant Effect', code: 'A90', hex: '#2b2c2b', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'damast_red', name: 'Damast Red', code: 'B03', hex: '#45231f', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'imola_red', name: 'Imola Red', code: '405', hex: '#6e1b0d', type: 'Uni', roughness: 0.35, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'nardo_grey', name: 'Nardo Grey', code: 'P6K', hex: '#666869', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'oxford_green_ii', name: 'Oxford Green II', code: '430', hex: '#1b3330', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'bernina_grey_amber_effect', name: 'Bernina Grey Amber Effect', code: 'C3E', hex: '#575852', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'frozen_deep_grey_c64', name: 'Frozen Deep Grey', code: 'C64', hex: '#242628', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'barcelona_blue', name: 'Barcelona Blue', code: 'C38', hex: '#636f78', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'arctic_race_blue', name: 'Arctic Race Blue', code: 'C4F', hex: '#30495b', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'dune_grey', name: 'Dune Grey', code: 'C7A', hex: '#adada6', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'fire_red_ii', name: 'Fire Red II', code: '375', hex: '#742002', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 }, // finish unverified
  { id: 'sepang_bronze', name: 'Sepang Bronze', code: 'A32', hex: '#636054', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  { id: 'aventurin_red', name: 'Aventurin Red', code: 'X15', hex: '#530202', type: 'Metallic', roughness: 0.32, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.04 },
];

export const WHEEL_FINISHES: Record<FinishVariantKey, WheelFinish> = {
  liquid_metal: {
    id: 'liquid_metal',
    name: 'Liquid Metal',
    colorName: 'Hyper-Reflective Mirror Silver',
    hex: '#d6dde3',
    metalness: 0.98,
    roughness: 0.12,
    clearcoat: 1.0,
    description: 'Triple-plated high-vacuum liquid chrome finish delivering mirror-like reflections and high-speed optical sheen.',
    badge: 'Signature'
  },
  bronze: {
    id: 'bronze',
    name: 'Satin Bronze',
    colorName: 'Motorsport Matte Bronze',
    hex: '#8f6738',
    metalness: 0.88,
    roughness: 0.38,
    clearcoat: 0.50,
    description: 'Warm brushed endurance racing bronze with a matte frosted topcoat that resists extreme track brake dust.',
    badge: 'Popular'
  },
  black: {
    id: 'black',
    name: 'Gloss Black',
    colorName: 'Phantom Piano Black',
    hex: '#141618',
    metalness: 0.70,
    roughness: 0.15,
    clearcoat: 0.95,
    description: 'Deep obsidian black with high-depth clearcoat gloss, highlighting the raw machined geometric spoke edges.',
    badge: 'Classic'
  },
  titanium: {
    id: 'titanium',
    name: 'Brushed Titanium',
    colorName: 'Directional Machine Raw Titanium',
    hex: '#9aa0a6',
    metalness: 0.92,
    roughness: 0.24,
    clearcoat: 0.85,
    description: 'Hand-brushed radial directional lines beneath a smoke-tinted aerospace clearcoat.',
    badge: 'Artisan'
  },
  champagne_gold: {
    id: 'champagne_gold',
    name: 'Frozen Gold',
    colorName: 'Heritage CSL Champagne Gold',
    hex: '#bda165',
    metalness: 0.85,
    roughness: 0.32,
    clearcoat: 0.60,
    description: 'Inspired by BMW M Motorsport works cars; soft champagne gold with a delicate satin metallic flake.',
    badge: 'Heritage'
  },
  rose_gold: {
    id: 'rose_gold',
    name: 'Rose Forged',
    colorName: 'Bespoke Copper Rose Metallic',
    hex: '#9e625a',
    metalness: 0.90,
    roughness: 0.25,
    clearcoat: 0.80,
    description: 'Exotic bespoke alloy treatment infusing warm copper and rose hues under dynamic sunlight.',
    badge: 'Limited'
  }
};

export const WHEEL_DESIGNS: WheelDesign[] = [
  {
    id: 'fw_01_monoblock_gt3',
    code: 'FW-01 GT3',
    name: 'Apex Monoblock GT3',
    subtitle: 'Ultra-Lightweight 9-Spoke Forged Magnesium',
    style: 'Monoblock 9-Spoke',
    spokeType: 'multi',
    spokeCount: 9,
    weightFrontKg: 7.8,
    weightRearKg: 8.3,
    weightSavingsKg: 4.8,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 7800,
    priceBySize: { '19"': 7200, '20"': 7800, '21"': 8500, '22"': 9300 },
    description: 'Forged from a single solid billet of 6061-T6 magnesium-aluminum aerospace alloy with hollow pocket spoke milling to cut unsprung rotational mass by up to 19.2 kg across all 4 corners.',
    highlights: [
      '7.8 kg front wheel mass',
      'I-Beam spoke cross-section for maximum lateral stiffness',
      'Engineered for BMW M Carbon Ceramic Brakes clearance',
      'Knurled bead seats to prevent tire slippage during launch control'
    ],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'titanium', 'champagne_gold'],
    defaultVariant: 'liquid_metal'
  },
  {
    id: 'fw_02_aerodisc_gt',
    code: 'FW-02 AERO',
    name: 'AeroDisc Forged Motorsport',
    subtitle: 'Split 5-Spoke with Forged Carbon Turbofan Ring',
    style: 'Aero Turbofan Split 5',
    spokeType: 'aerodisc',
    spokeCount: 10,
    weightFrontKg: 8.2,
    weightRearKg: 8.7,
    weightSavingsKg: 4.1,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 8600,
    priceBySize: { '19"': 8000, '20"': 8600, '21"': 9300, '22"': 10100 },
    description: 'Directly derived from endurance GT3 racecars. Features functional aero evacuation channels that actively draw cooling air through the brake caliper assembly at speeds over 120 km/h.',
    highlights: [
      'Bespoke carbon fiber turbofan extraction ring',
      'Reduces front axle aerodynamic drag by 4.2%',
      'Direct OE BMW center cap compatible or centerlock nut look',
      'High-load rated for track attack days'
    ],
    availableVariants: ['bronze', 'liquid_metal', 'black', 'titanium'],
    defaultVariant: 'bronze'
  },
  {
    id: 'fw_03_csl_yspoke',
    code: 'FW-03 CSL',
    name: 'Competition CSL Y-Spoke',
    subtitle: 'Deep Concave Heritage Lightweight Y-Pattern',
    style: 'Deep Concave Y-Spoke',
    spokeType: 'y_spoke',
    spokeCount: 10,
    weightFrontKg: 7.6,
    weightRearKg: 8.1,
    weightSavingsKg: 5.2,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 7400,
    priceBySize: { '19"': 6800, '20"': 7400, '21"': 8100, '22"': 8900 },
    description: 'A homage to legendary BMW M heritage wheels re-imagined with extreme deep concave rear profile and thin, chiseled spoke faces that accentuate aggressive BMW M wheel arches.',
    highlights: [
      'Extreme 85mm deep concave rear wheel drop',
      'Featherweight 7.6 kg per front wheel',
      'Optically extends to the outermost lip edge for a larger appearance',
      'Tested under 10,000,000 cycle dynamic cornering fatigue loads'
    ],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'champagne_gold', 'titanium'],
    defaultVariant: 'champagne_gold'
  },
  {
    id: 'fw_04_twin_turbine',
    code: 'FW-04 TURBO',
    name: 'Vortex Directional Turbine',
    subtitle: 'Asymmetric Directional Multi-Blade Forged',
    style: 'Directional 10-Spoke',
    spokeType: 'directional',
    spokeCount: 10,
    weightFrontKg: 8.0,
    weightRearKg: 8.5,
    weightSavingsKg: 4.4,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 8200,
    priceBySize: { '19"': 7600, '20"': 8200, '21"': 8900, '22"': 9700 },
    description: 'Left and right vehicle side dedicated directional blade profiles. Machined with complex 5-axis CNC passes to sculpt a sculptural turbine vortex effect that rotates forward on both sides.',
    highlights: [
      'Left/Right dedicated side asymmetric tooling',
      '5-Axis CNC machined undercut spoke side cavities',
      'Optimal airflow extraction over brake discs',
      'Ultra-deep lip barrel with laser-engraved serial number'
    ],
    availableVariants: ['liquid_metal', 'black', 'bronze', 'titanium', 'rose_gold'],
    defaultVariant: 'black'
  },
  {
    id: 'fw_05_dtm_multispoke',
    code: 'FW-05 DTM',
    name: 'DTM Racing Multi-Spoke',
    subtitle: '15-Spoke High-Density Magnesium Monoblock',
    style: '15-Spoke DTM Grid',
    spokeType: 'mesh',
    spokeCount: 15,
    weightFrontKg: 7.9,
    weightRearKg: 8.4,
    weightSavingsKg: 4.7,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 7600,
    priceBySize: { '19"': 7000, '20"': 7600, '21"': 8300, '22"': 9100 },
    description: 'Inspired by European touring car championships. Provides uniform stress distribution across 15 radiating spokes, allowing paper-thin walls and remarkable structural rigidity.',
    highlights: [
      'Maximum structural rigidity for curb striking on race tracks',
      'Center-lock aesthetics with security hex locknut cover',
      'Signature BMW M tricolor engraved emblem slot',
      'Supports extreme 305-width rear track slicks'
    ],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'titanium'],
    defaultVariant: 'bronze'
  },
  {
    id: 'fw_06_clubsport_deep',
    code: 'FW-06 CS',
    name: 'Clubsport 2-Piece Modular',
    subtitle: 'Stepped Lip with Hidden Titanium Hardware',
    style: 'Modular Stepped 5-Spoke',
    spokeType: 'clubsport',
    spokeCount: 5,
    weightFrontKg: 8.4,
    weightRearKg: 8.9,
    weightSavingsKg: 3.8,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 9200,
    priceBySize: { '19"': 8600, '20"': 9200, '21"': 9900, '22"': 10700 },
    description: 'Two-piece forged modular construction pairing a forged magnesium center face with a spun 6061-T6 aircraft aluminum stepped outer barrel joined by ARP aerospace titanium bolts.',
    highlights: [
      'Genuine 2-Piece modular architecture with 90mm stepped lip',
      'Aerospace grade Grade-5 Titanium M8 assembly hardware',
      'Customizable dual-tone barrel and center face finishes',
      'Maximum stance and deep-dish lip presence'
    ],
    availableVariants: ['liquid_metal', 'black', 'bronze', 'titanium', 'rose_gold'],
    defaultVariant: 'liquid_metal'
  }
];

export const CALIPER_COLORS: CaliperColor[] = [
  {
    id: 'm_blue',
    name: 'M Performance Blue',
    hex: '#0055b8',
    logo: 'BMW M'
  },
  {
    id: 'm_red',
    name: 'M Competition Red',
    hex: '#c01824',
    logo: 'BMW M'
  },
  {
    id: 'carbon_gold',
    name: 'M Carbon Ceramic Gold',
    hex: '#e2ab34',
    logo: 'BMW Carbon Ceramic'
  },
  {
    id: 'acid_green',
    name: 'Electrified Acid Green',
    hex: '#7ef82a',
    logo: 'BMW M Hybrid'
  },
  {
    id: 'stealth_black',
    name: 'Phantom Shadow Black',
    hex: '#1c1f22',
    logo: 'BMW M'
  }
];

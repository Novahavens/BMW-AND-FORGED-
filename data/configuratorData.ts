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
    id: 'm4_cs_g82',
    name: 'BMW M4 CS',
    badge: 'M4 CS G82',
    generation: 'G82',
    chassisCode: 'G82 M4 CS',
    engine: '3.0L S58 Twin-Turbo Inline-6',
    power: '543 HP / 550 PS',
    torque: '650 Nm (479 lb-ft)',
    acceleration: '0-100 km/h in 3.4s',
    recommendedWheelFitment: {
      front: '20 x 9.5J ET15',
      rear: '21 x 10.5J ET18',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'coupe',
    paintIds: [
      'riviera_blue', 'frozen_isle_of_man_green', 'brooklyn_grey', 'black_sapphire'
    ],
    modelUrl: '/models/bmw-m4-cs-vr46.glb',
    modelLengthM: 4.79,
    // Body, hood, kit and spoiler take the paint. The model's own wheels are hidden; its calipers are kept
    // (not in the hide pattern), so the configurator uses them and recolours them.
    paintMeshMatch: 'm4car_body1|m4car_hood1|m4car_bodykit1|m4car_spoiler1',
    hideMeshMatch: 'wheel1a|phong11|phong23'
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
      'grigio_telesto', 'twilight_purple', 'voodoo_blue', 'borusan_turkish_blue'
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
      'alpine_white', 'aventurine_red_iii', 'black_sapphire', 'brooklyn_grey', 'dravit_grey',
      'frozen_pure_grey', 'frozen_tanzanite_blue', 'isle_of_man_green', 'marina_bay_blue',
      'skyscraper_grey', 'tanzanite_blue_ii'
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
    modelUrl: '/models/bmw-x5m-f95-lci.glb',
    modelLengthM: 4.94,
    paintMeshMatch: 'x5m_paint',
    hideMeshMatch: '^wheel_'
  }
];

// BMW South Africa factory paints (docs/bmw-factory-paints.md). Hex values are the paint's true sRGB
// albedo (the car renders are recoloured in linear light, so nothing is darkened or brightened to
// compensate), estimated from the doc's swatches and BMW's names; they are not colour-managed data.
// Mirrors supabase/migrations/20261007090000_bmw_paint_corrections.sql (on top of
// 20260927030000_factory_paints.sql); each car lists its own in paintIds.
export const BMW_PAINTS: PaintColor[] = [
  { id: 'fire_red', name: 'Fire Red', code: 'C68', hex: '#b0282e', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'skyscraper_grey', name: 'Skyscraper Grey', code: 'C4W', hex: '#7f8587', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'brooklyn_grey', name: 'Brooklyn Grey', code: 'C4P', hex: '#a4a9ac', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'black_sapphire', name: 'Black Sapphire', code: '475', hex: '#15171b', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'portimao_blue', name: 'Portimao Blue', code: 'C31', hex: '#2f4f94', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'zandvoort_blue', name: 'Zandvoort Blue', code: 'C6E', hex: '#8fb1d8', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'sao_paulo_yellow', name: 'São Paulo Yellow', code: 'C4H', hex: '#f5c900', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'alpine_white', name: 'Alpine White III', code: '300', hex: '#f0f0ee', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'frozen_portimao_blue_c6r', name: 'Frozen Portimao Blue', code: 'C6R', hex: '#34478a', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_pure_grey', name: 'Frozen Pure Grey', code: 'C5A', hex: '#8a9091', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'java_green', name: 'Java Green', code: 'P7V', hex: '#7fa35f', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'grigio_telesto', name: 'Grigio Telesto', code: 'P6M', hex: '#6f716d', type: 'Pearl', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'twilight_purple', name: 'Twilight Purple', code: 'P28', hex: '#6b3f6e', type: 'Pearl', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'voodoo_blue', name: 'Voodoo Blue', code: 'P7L', hex: '#1f7ac8', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'thundernight', name: 'Thundernight', code: 'C56', hex: '#483652', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'storm_bay', name: 'Storm Bay', code: 'C3N', hex: '#6c747b', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'isle_of_man_green', name: 'Isle of Man Green', code: 'C4G', hex: '#1b6a55', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'toronto_red', name: 'Toronto Red', code: 'C3G', hex: '#c0302a', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'aventurine_red_iii', name: 'Aventurine Red III', code: 'C57', hex: '#7a1f2b', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'tanzanite_blue_ii', name: 'Tanzanite Blue II', code: 'C3Z', hex: '#1c2b4d', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'dravit_grey', name: 'Dravit Grey', code: 'C36', hex: '#55575a', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'san_marino_blue', name: 'San Marino Blue', code: 'B51', hex: '#2a3a6e', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'wildberry', name: 'Wildberry', code: 'T09', hex: '#6a2c47', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'ruby_black', name: 'Ruby Black', code: 'X03', hex: '#2a1c20', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'frozen_deep_green', name: 'Frozen Deep Green', code: 'P80', hex: '#4d5b47', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_dark_grey_ii', name: 'Frozen Dark Grey II', code: 'P79', hex: '#4c5052', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'fire_orange_iii', name: 'Fire Orange III', code: 'P7E', hex: '#e2621a', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'frozen_black', name: 'Frozen Black', code: 'U91', hex: '#252627', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'thunder', name: 'Thunder', code: 'P6L', hex: '#4e5558', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'mineral_white', name: 'Mineral White', code: 'A96', hex: '#e6e4df', type: 'Pearl', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'riviera_blue', name: 'Riviera Blue', code: 'P5C', hex: '#22a6d6', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'marina_bay_blue', name: 'Marina Bay Blue', code: 'C1K', hex: '#2d4a8e', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'mint_green', name: 'Mint Green', code: 'W97', hex: '#70b8a2', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'sepia_iii', name: 'Sepia III', code: 'S0N', hex: '#6a625e', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'frozen_tanzanite_blue', name: 'Frozen Tanzanite Blue', code: 'X1G', hex: '#27345f', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_portimao_blue', name: 'Frozen Portimao Blue', code: 'X1E', hex: '#34478a', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_pure_grey_ii', name: 'Frozen Pure Grey II', code: 'X1F', hex: '#a8b0b3', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'anglesey_green', name: 'Anglesey Green', code: 'P9R', hex: '#2d6a52', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'ruby_star', name: 'Ruby Star', code: 'P9L', hex: '#a02a6b', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // finish unverified (BMW does not state it)
  { id: 'frozen_brilliant_white', name: 'Frozen Brilliant White', code: 'X16', hex: '#dcdcd6', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'frozen_preciosa_red', name: 'Frozen Preciosa Red', code: 'P9C', hex: '#7a2427', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'malachite_green_ii', name: 'Malachite Green II', code: 'P85', hex: '#4b5d4e', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'speed_yellow', name: 'Speed Yellow', code: 'U96', hex: '#f0b800', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // finish unverified (BMW does not state it)
  { id: 'brewster_green', name: 'Brewster Green', code: 'T42', hex: '#2a352f', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // finish unverified (BMW does not state it)
  { id: 'urban_green_ii', name: 'Urban Green II', code: 'P9P', hex: '#5a5d43', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'lagoon_green', name: 'Laguna Green', code: '266', hex: '#2e7480', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // BMW's name is Laguna Green
  { id: 'le_mans_blue', name: 'Le Mans Blue', code: '381', hex: '#3a66a6', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'velvet_blue', name: 'Velvet Blue', code: '379', hex: '#4a4b78', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'frozen_deep_grey', name: 'Frozen Deep Grey', code: 'P7X', hex: '#515356', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'velvet_orchid_ii', name: 'Velvet Orchid II', code: 'L74', hex: '#a58a96', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'carbon_black', name: 'Carbon Black', code: '416', hex: '#1f2127', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'sophisto_grey_brilliant_effect', name: 'Sophisto Grey Brilliant Effect', code: 'A90', hex: '#484a4e', type: 'Pearl', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'damast_red', name: 'Damast Red', code: 'B03', hex: '#5c2a2a', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // finish third-party only
  { id: 'imola_red', name: 'Imola Red', code: '405', hex: '#b01c1f', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'nardo_grey', name: 'Nardo Grey', code: 'P6K', hex: '#808284', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // finish unverified (BMW does not state it)
  { id: 'oxford_green_ii', name: 'Oxford Green II', code: '430', hex: '#2f4540', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'bernina_grey_amber_effect', name: 'Bernina Grey Amber Effect', code: 'C3E', hex: '#77756d', type: 'Pearl', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'frozen_deep_grey_c64', name: 'Frozen Deep Grey', code: 'C64', hex: '#515356', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'barcelona_blue', name: 'Barcelona Blue', code: 'C38', hex: '#8697a6', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'arctic_race_blue', name: 'Arctic Race Blue', code: 'C4F', hex: '#5b7d92', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'dune_grey', name: 'Dune Grey', code: 'C7A', hex: '#aeaba0', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'fire_red_ii', name: 'Fire Red II', code: '375', hex: '#c0282c', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // finish unverified (BMW does not state it)
  { id: 'sepang_bronze', name: 'Sepang Bronze', code: 'A32', hex: '#7b6850', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
  { id: 'aventurin_red', name: 'Aventurin Red', code: 'X15', hex: '#6a1612', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05, active: false }, // M8 now uses C57 (aventurine_red_iii); kept inactive so saved builds still open
  { id: 'frozen_isle_of_man_green', name: 'Frozen Isle of Man Green', code: 'P92', hex: '#1d5a45', type: 'Frozen', roughness: 0.55, metalness: 0.4, clearcoat: 0.0, clearcoatRoughness: 0.5 },
  { id: 'borusan_turkish_blue', name: 'Borusan Turkish Blue', code: 'P9E', hex: '#25aed4', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 },
];

export const WHEEL_FINISHES: Record<FinishVariantKey, WheelFinish> = {
  liquid_metal: {
    id: 'liquid_metal',
    name: 'Liquid Metal',
    colorName: 'Chrome',
    hex: '#dfe4e8',
    metalness: 0.98,
    roughness: 0.12,
    clearcoat: 1.0,
    description: 'Mirror chrome finish with deep, liquid reflections.',
    badge: 'Signature'
  },
  bronze: {
    id: 'bronze',
    name: 'Bronze Matte',
    colorName: 'Matte Bronze',
    hex: '#8f6738',
    metalness: 0.8,
    roughness: 0.55,
    clearcoat: 0.1,
    description: 'Warm motorsport bronze with a flat, low-sheen matte finish.',
    badge: 'Popular'
  },
  black: {
    id: 'black',
    name: 'Black Gloss',
    colorName: 'Gloss Black',
    hex: '#141618',
    metalness: 0.7,
    roughness: 0.15,
    clearcoat: 0.95,
    description: 'Deep gloss black under a high-depth clearcoat.',
    badge: 'Classic'
  },
  silver: {
    id: 'silver',
    name: 'Silver',
    colorName: 'Silver',
    hex: '#c3c8cd',
    metalness: 0.9,
    roughness: 0.28,
    clearcoat: 0.7,
    description: 'Classic bright silver with a soft metallic sheen.',
    badge: 'Classic'
  },
  satin_gold: {
    id: 'satin_gold',
    name: 'Satin Gold',
    colorName: 'Champagne Gold',
    hex: '#c4aa7f',
    metalness: 0.85,
    roughness: 0.45,
    clearcoat: 0.35,
    description: 'Champagne gold metallic under a soft satin clear coat.',
    badge: 'New'
  },
  gunmetal: {
    id: 'gunmetal',
    name: 'Gunmetal Matte',
    colorName: 'Matte Gunmetal',
    hex: '#4a4d52',
    metalness: 0.85,
    roughness: 0.5,
    clearcoat: 0.2,
    description: 'Dark satin gunmetal metallic with a soft, low-sheen finish.',
    badge: 'New'
  }
};

// FORGED's own designs, mirrored from the live catalogue (Supabase is the source of truth; this is the
// offline fallback). Images live in the rim-images bucket and are extruded into 3D spokes on the car.
export const WHEEL_DESIGNS: WheelDesign[] = [
  {
    id: 'forged_fsa_01',
    code: 'FSA-01',
    name: 'Killarney S5',
    subtitle: 'Two-piece split five-spoke',
    style: 'Two-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"', '22"'],
    pricePerSet: 4725.27,
    priceBySize: { '20"': 4725.27, '21"': 5164.84, '22"': 5714.29 },
    description: 'Five slender split spokes float over a deep, polished outer lip, with exposed assembly bolts around the barrel.',
    highlights: ['Two-piece construction', 'Split five-spoke face', 'Deep polished lip'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_01-1790526477908.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_02',
    code: 'FSA-02',
    name: 'Zwartkops Branch',
    subtitle: 'Branched multi-spoke monoblock',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Ten spokes divide into fine branches as they reach the rim, creating an intricate, airy face with a flush centre cap.',
    highlights: ['Branched ten-spoke design', 'Open, airy face', 'Flush centre cap'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_02-1790526479977.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_03',
    code: 'FSA-03',
    name: 'Kyalami 15',
    subtitle: 'Fifteen-spoke classic',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 15,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Fifteen straight, evenly spaced spokes run from a crisp five-lug hub to a slim outer lip for a clean motorsport look.',
    highlights: ['Fifteen straight spokes', 'Slim outer lip', 'Timeless motorsport style'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_03-1790526482896.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_04',
    code: 'FSA-04',
    name: 'Scribante 3P',
    subtitle: 'Riveted multi-piece split spoke',
    style: 'Three-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"', '22"'],
    pricePerSet: 4725.27,
    priceBySize: { '20"': 4725.27, '21"': 5164.84, '22"': 5714.29 },
    description: 'Twisted split spokes sit inside a stepped, polished lip ringed with exposed rivets for a bold multi-piece look.',
    highlights: ['Multi-piece look', 'Twisted split spokes', 'Exposed rivet ring'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_04-1790526486272.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_05',
    code: 'FSA-05',
    name: 'Phakisa Twin',
    subtitle: 'Slim twin five-spoke',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Five pairs of razor-thin spokes stretch from the hub to a broad lip, leaving large open windows.',
    highlights: ['Twin five-spoke layout', 'Razor-thin spokes', 'Large open windows'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_05-1790526488573.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_06',
    code: 'FSA-06',
    name: 'Aldo Fork 15',
    subtitle: 'Forked fifteen-spoke',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Fifteen fine spokes fork just before the lip, framing the rim with a delicate lattice of windows.',
    highlights: ['Spokes fork at the lip', 'Delicate lattice windows', 'Clean five-lug hub'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_06-1790526491193.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_07',
    code: 'FSA-07',
    name: 'Dezzi Star',
    subtitle: 'Split-star two-piece',
    style: 'Two-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"', '22"'],
    pricePerSet: 4725.27,
    priceBySize: { '20"': 4725.27, '21"': 5164.84, '22"': 5714.29 },
    description: 'Sharp split spokes form a layered star around the hub, set inside a bright stepped lip.',
    highlights: ['Layered star pattern', 'Two-piece stepped lip', 'Sharp split spokes'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_07-1790526493764.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_08',
    code: 'FSA-08',
    name: 'Red Star 3P',
    subtitle: 'Riveted Y-spoke multi-piece',
    style: 'Three-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"', '22"'],
    pricePerSet: 4725.27,
    priceBySize: { '20"': 4725.27, '21"': 5164.84, '22"': 5714.29 },
    description: 'Branching Y-spokes meet a pentagon centre, wrapped by a polished lip studded with exposed rivets.',
    highlights: ['Branching Y-spokes', 'Pentagon centre', 'Polished riveted lip'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_08-1790526496586.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_09',
    code: 'FSA-09',
    name: 'Heritage Mesh',
    subtitle: 'Classic cross-spoke mesh',
    style: 'Two-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"', '22"'],
    pricePerSet: 4725.27,
    priceBySize: { '20"': 4725.27, '21"': 5164.84, '22"': 5714.29 },
    description: 'A dense cross-spoke mesh radiates from a large centre cap, framed by a riveted step lip for a heritage racing look.',
    highlights: ['Cross-spoke mesh', 'Riveted step lip', 'Heritage racing style'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    imageUrl: 'https://qxlfkfhzpqbxffuqqewg.supabase.co/storage/v1/object/public/rim-images/pipeline/forged_fsa_09-1790526498397.png',
    imageExtrude: true
  }
,
  {
    id: 'forged_fsa_12',
    code: 'FSA-12',
    name: 'Forged SA Twin-Y',
    subtitle: 'Polished twin-Y five-spoke',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Five pairs of slim spokes leave the hub together and open toward the lip, cut from a single forged monoblock and hand-polished.',
    highlights: ['Twin-Y five-spoke layout', 'True 3D rim model', 'Hand-polished monoblock'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    // PLACEHOLDER name, sizes and prices (copied from FSA-05) until the owner confirms them in /admin.
    // The car shows the bar face drawn from the photo (docs/rim-template/fsa_12-spec.json); the rim page
    // uses the rendered 360° spin (scripts/rim3d).
    imageUrl: '/rim-faces/forged_fsa_12.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_13',
    code: 'FSA-13',
    name: 'Forged SA Star 6',
    subtitle: 'Brushed six-point split star',
    style: 'Two-Piece Forged',
    spokeType: 'multi',
    spokeCount: 12,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Six pairs of slim brushed spokes form a star around a centre-lock hub, inside a polished two-piece lip.',
    highlights: ['Six-point split star', 'Centre-lock hub', 'Polished two-piece lip'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    // PLACEHOLDER name, sizes and prices (copied from FSA-05) until the owner confirms them in /admin.
    // Photo rectified front-on (scripts/rim3d/rectify.py); the car uses the bar face drawn from it
    // (services/rimFaces.ts, docs/rim-template/fsa_13-spec.json). The rim page uses the rendered spin.
    imageUrl: '/rim-images/forged_fsa_13.png',
    imageExtrude: true
  },
  {
    id: 'forged_fsa_14',
    code: 'FSA-14',
    name: 'Forged SA Turbine 25',
    subtitle: 'Gloss black 25-spoke turbine',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 25,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"', '21"', '22"'],
    pricePerSet: 3736.26,
    priceBySize: { '19"': 3736.26, '20"': 4065.93, '21"': 4505.49, '22"': 5054.95 },
    description: 'Twenty-five swept spokes spiral out from the hub like a turbine, cut from one forged monoblock.',
    highlights: ['25 swept spokes', 'Directional turbine face', 'Forged monoblock'],
    availableVariants: ['liquid_metal', 'bronze', 'black', 'silver', 'satin_gold'],
    defaultVariant: 'liquid_metal',
    // PLACEHOLDER name, sizes and prices (copied from FSA-05) until the owner confirms them in /admin.
    // Photo rectified front-on (scripts/rim3d/rectify.py); the car uses the bar face drawn from it
    // (services/rimFaces.ts, docs/rim-template/fsa_14-spec.json). The rim page uses the rendered spin.
    imageUrl: '/rim-images/forged_fsa_14.png',
    imageExtrude: true
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

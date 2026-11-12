/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarModel, PaintColor, WheelDesign, WheelFinish, CaliperColor, FinishVariantKey } from '../types';

export const BMW_MODELS: CarModel[] = [
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
    modelUrl: '/models/m4_cs_g82.glb',
    modelRotationDeg: 0,
    modelLengthM: 4.79,
    paintMeshMatch: '(^|[^a-z])paint($|[^a-z])',
    hideMeshMatch: '(^|[^a-z])rim($|[^a-z])'
  },
  {
    id: 'm2_g87',
    name: 'BMW M2 CS',
    badge: 'M2 CS G87',
    generation: 'G87',
    chassisCode: 'G87 M2',
    // BMW M2 CS (G87, 2025) published figures: S58, 530 PS (390 kW) / 523 hp, 650 Nm, 0-100 km/h 3.8 s.
    // Owner to confirm. Fitment kept from the M2 (19"/20" staggered forged wheels, as on the CS).
    engine: '3.0L S58 Twin-Turbo Inline-6',
    power: '523 HP / 530 PS',
    torque: '650 Nm (479 lb-ft)',
    acceleration: '0-100 km/h in 3.8s',
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
    modelUrl: '/models/m2_g87.glb',
    modelRotationDeg: 0,
    modelLengthM: 4.58,
    paintMeshMatch: '(^|[^a-z])paint($|[^a-z])',
    hideMeshMatch: '(^|[^a-z])rim($|[^a-z])'
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
    modelUrl: '/models/m5_g90.glb',
    modelRotationDeg: 0,
    modelLengthM: 5.09,
    paintMeshMatch: '(^|[^a-z])paint($|[^a-z])',
    hideMeshMatch: '(^|[^a-z])rim($|[^a-z])'
  },
  {
    id: 'm5_touring_g99',
    name: 'BMW M5 Touring',
    badge: 'M5 Touring G99',
    generation: 'G99',
    chassisCode: 'G99 M5 Touring',
    // BMW M5 Touring (G99) published figures: S68 V8 plug-in hybrid, 727 PS (535 kW), 1000 Nm, 0-100 km/h 3.6 s;
    // same chassis family as the M5 G90, so the same factory fitment. Owner to confirm.
    engine: '4.4L S68 Twin-Turbo V8 M Hybrid',
    power: '727 HP / 535 kW',
    torque: '1,000 Nm (738 lb-ft)',
    acceleration: '0-100 km/h in 3.6s',
    recommendedWheelFitment: {
      front: '20 x 9.5J',
      rear: '21 x 10.5J',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'touring',
    paintIds: [
      'carbon_black', 'fire_red', 'marina_bay_blue', 'brooklyn_grey', 'sophisto_grey_brilliant_effect',
      'isle_of_man_green', 'black_sapphire', 'urban_green_ii', 'barcelona_blue', 'alpine_white', 'storm_bay',
      'frozen_deep_grey_c64'
    ],
    modelUrl: '/models/m5_touring_g99.glb',
    modelRotationDeg: 0,
    modelLengthM: 5.09,
    paintMeshMatch: '(^|[^a-z])paint($|[^a-z])',
    hideMeshMatch: '(^|[^a-z])rim($|[^a-z])'
  },
  {
    // Frames-only: a Blendkit Royalty Free model, so the browser never gets its GLB (no modelUrl). The body is the
    // Cycles frames in public/renders/ix3_m60 and the wheel layout in public/renders/manifest.json
    // (docs/ADD_PREPARED_CAR.md, "Frames-only cars").
    id: 'ix3_m60',
    name: 'BMW iX3 M60',
    badge: 'iX3 M60 xDrive',
    generation: 'NA5',
    chassisCode: 'NA5 iX3 M60',
    // BMW Group press release, 8 Oct 2026 (figures provisional): one motor per axle, 450 kW / 612 hp, 875 Nm,
    // 0-100 km/h 3.9 s; 21-inch M wheels standard (22-inch optional). Rim width and offset are not published:
    // 21 x 9J is the 21-inch iX3 50 xDrive fitment in the tyre guides; hub 5x112 / 66.6 mm. Owner to confirm.
    engine: 'Dual-motor electric (one per axle)',
    power: '612 HP / 450 kW',
    torque: '875 Nm (645 lb-ft)',
    acceleration: '0-100 km/h in 3.9s',
    recommendedWheelFitment: {
      front: '21 x 9J',
      rear: '21 x 9J',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'suv',
    // From the existing palette until the owner picks the iX3's own colours
    paintIds: [
      'alpine_white', 'mineral_white', 'black_sapphire', 'carbon_black', 'brooklyn_grey', 'fire_red', 'storm_bay',
      'frozen_deep_grey_c64'
    ],
    modelUrl: null,
    modelLengthM: 4.79
  },
  {
    // Frames-only (Blendkit Royalty Free "BMW M3 Sedan 2025", Zifir3D): no modelUrl, see the iX3 above
    id: 'm3_g80',
    name: 'BMW M3',
    badge: 'M3 Competition G80',
    generation: 'G80',
    chassisCode: 'G80 M3',
    // 2024 facelift (LCI), Competition M xDrive: 530 PS / 390 kW, 650 Nm, 0-100 km/h 3.5 s. Fitment from BMW's G80
    // M3 Competition xDrive press kit (05/2021): 9.5J x 19 front, 10.5J x 20 rear. Owner to confirm for the LCI.
    engine: '3.0L S58 Twin-Turbo Inline-6',
    power: '523 HP / 530 PS',
    torque: '650 Nm (479 lb-ft)',
    acceleration: '0-100 km/h in 3.5s',
    recommendedWheelFitment: {
      front: '19 x 9.5J',
      rear: '20 x 10.5J',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'sedan',
    paintIds: [
      'isle_of_man_green', 'brooklyn_grey', 'portimao_blue', 'sao_paulo_yellow', 'toronto_red', 'fire_red',
      'skyscraper_grey', 'black_sapphire', 'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey'
    ],
    modelUrl: null,
    modelLengthM: 4.79
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
  { id: 'ruby_star', name: 'Ruby Star', code: 'P9L', hex: '#cf1272', type: 'Uni', roughness: 0.5, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 }, // solid ("Sternrubin Uni"); hex from BMW Welt photos
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
  { id: 'velvet_orchid_ii', name: 'Velvet Orchid II', code: 'L74', hex: '#8e7183', type: 'Metallic', roughness: 0.45, metalness: 0.8, clearcoat: 1.0, clearcoatRoughness: 0.05 },
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
    name: 'Gloss Black',
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
  },
  // The finishes on the Nov 2026 stock sheet (BMW M / M Performance wheel inventory). Numbers follow
  // services/wheelFinish.ts: gold, hyper black and pure bronze read as gloss metallic paint; polished
  // face as bare polished metal; black matte as a satin solid paint (no flake, no flop).
  gold: {
    id: 'gold',
    name: 'Gold',
    colorName: 'Gold',
    hex: '#c9a24e',
    metalness: 0.9,
    roughness: 0.32,
    clearcoat: 0.85,
    description: 'Rich metallic gold under a gloss clear coat: bright on the spoke faces, deeper in the pockets.',
    badge: 'In stock'
  },
  hyper_black: {
    id: 'hyper_black',
    name: 'Hyper Black',
    colorName: 'Hyper Black',
    hex: '#3a3e44',
    metalness: 0.9,
    roughness: 0.24,
    clearcoat: 0.9,
    description: 'Dark hyper-black metallic: a bright flop on the spoke faces, near black where they turn away.',
    badge: 'In stock'
  },
  polished_face: {
    id: 'polished_face',
    name: 'Polished Face',
    colorName: 'Polished Aluminium',
    hex: '#e6e9ec',
    metalness: 1.0,
    roughness: 0.08,
    clearcoat: 0.6,
    description: 'Machine-polished bright aluminium face under a clear protective coat.',
    badge: 'In stock'
  },
  pure_bronze: {
    id: 'pure_bronze',
    name: 'Pure Bronze',
    colorName: 'Satin Bronze',
    hex: '#75523f',
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 0.7,
    description: 'Deep bronze metallic with a soft sheen, the FF-3 signature finish.',
    badge: 'In stock'
  },
  black_matte: {
    id: 'black_matte',
    name: 'Black Matte',
    colorName: 'Satin Black',
    hex: '#26282b',
    metalness: 0.0,
    roughness: 0.5,
    clearcoat: 0.0,
    description: 'Satin black powder coat with no gloss: the FSA001 two-piece finish.',
    badge: 'In stock'
  }
};

// FORGED's own designs, mirrored from the live catalogue (Supabase is the source of truth; this is the
// offline fallback). Images live in the rim-images bucket and are extruded into 3D spokes on the car.
export const WHEEL_DESIGNS: WheelDesign[] = [
  // The Nov 2026 stock sheet (BMW M / M Performance wheel inventory, docs/WHEEL_INVENTORY.md) is the source of
  // the names, sizes, finishes and prices of these six wheels. The older photo-traced designs and the legacy
  // cars were deleted on 2026-11-11 at the owner's request; their database rows are kept in the private
  // archive schema (archive.legacy_wheels, archive.legacy_cars), and the code is in git history.
  {
    id: 'forged_fsa001',
    code: 'FSA001',
    name: 'FSA001',
    subtitle: 'Two-piece ten-spoke',
    style: 'Two-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['19"', '20"'],
    pricePerSet: 4945.05,
    priceBySize: { '19"': 4945.05, '20"': 4945.05 },
    description: 'Two-piece forged ten-spoke in Black Matte with a staggered front and rear profile. In stock for the M3 Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
    highlights: ['Two-piece construction', 'Staggered front and rear', 'Black Matte', 'PCD 5×112 · ET8/15 · CB 66.6'],
    availableVariants: ['black_matte'],
    defaultVariant: 'black_matte',
    imageUrl: '/rim-images/forged_fsa001.webp', // cut-out of a Blender front view of the rim file (thumbnail only; the car uses the GLB)
    imageExtrude: false,
    modelUrl: '/models/rims/forged_fsa001.glb',
    rearModelUrl: '/models/rims/forged_fsa001-rear.glb',
    modelFlip: false
  },
  {
    id: 'forged_fsa002',
    code: 'FSA002',
    name: 'FSA002',
    subtitle: 'Fifteen-spoke monoblock',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 15,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"'],
    pricePerSet: 4120.88,
    priceBySize: { '20"': 4120.88, '21"': 4120.88 },
    priceByFinish: { polished_face: 4670.33 },
    description: 'Fifteen-spoke forged monoblock in Gold, Hyper Black or Polished Face. In stock for the M3 Competition Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
    highlights: ['Forged monoblock', 'Gold, Hyper Black or Polished Face', 'PCD 5×112 · ET8/15 · CB 66.6'],
    availableVariants: ['gold', 'hyper_black', 'polished_face'],
    defaultVariant: 'gold',
    imageUrl: '/rim-images/forged_fsa002.webp',
    imageExtrude: false,
    modelUrl: '/models/rims/forged_fsa002.glb',
    modelFlip: false
  },
  {
    id: 'forged_fsa_03',
    code: 'FSA003',
    name: 'FSA003',
    subtitle: 'Fifteen-spoke classic',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 15,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"'],
    pricePerSet: 4120.88,
    priceBySize: { '20"': 4120.88, '21"': 4120.88 },
    description: 'Fifteen straight, evenly spaced spokes from a five-lug hub to a slim outer lip, in Silver or Hyper Black. In stock for the M3 Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
    highlights: ['Fifteen straight spokes', 'Silver or Hyper Black', 'PCD 5×112 · ET8/15 · CB 66.6'],
    availableVariants: ['silver', 'hyper_black'],
    defaultVariant: 'silver',
    imageUrl: '/rim-images/forged_fsa_03.webp', // cut-out of the website's FSA003 photo (thumbnail only; the car uses the GLB)
    imageExtrude: false,
    modelUrl: '/models/rims/forged_fsa_03.glb',
    modelFlip: false
  },
  {
    id: 'forged_fsa004',
    code: 'FSA004',
    name: 'FSA004',
    subtitle: 'Twelve-spoke monoblock',
    style: 'Monoblock Forged',
    spokeType: 'multi',
    spokeCount: 12,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"'],
    pricePerSet: 3846.15,
    priceBySize: { '20"': 3846.15, '21"': 3846.15 },
    description: 'Twelve-spoke forged monoblock in Silver, Hyper Black or Gloss Black. In stock for the M3 Sedan and M3 Competition Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
    highlights: ['Forged monoblock', 'Silver, Hyper Black or Gloss Black', 'PCD 5×112 · ET8/15 · CB 66.6'],
    availableVariants: ['silver', 'hyper_black', 'black'],
    defaultVariant: 'silver',
    imageUrl: '/rim-images/forged_fsa004.webp',
    imageExtrude: false,
    modelUrl: '/models/rims/forged_fsa004.glb',
    modelFlip: false
  },
  {
    id: 'sixnine_ff1',
    code: 'FF-1',
    name: 'FF-1',
    subtitle: 'Split five-spoke, two-piece',
    style: 'Two-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"'],
    pricePerSet: 4395.60,
    priceBySize: { '20"': 4395.60, '21"': 4395.60 },
    priceByFinish: { liquid_metal: 5219.78 },
    description: 'Split five-spoke two-piece forged wheel in Silver or Liquid Metal. In stock for the M3 Sedan and M3 Competition Sedan (G80): PCD 5×112 · ET15/20 (Silver) · ET15/17 (Liquid Metal) · CB 66.6.',
    highlights: ['Two-piece construction', 'Silver or Liquid Metal', 'PCD 5×112 · ET15/20 (Silver) · ET15/17 (Liquid Metal) · CB 66.6'],
    availableVariants: ['silver', 'liquid_metal'],
    defaultVariant: 'silver',
    imageUrl: '/rim-images/sixnine_ff1.webp',
    imageExtrude: false,
    modelUrl: '/models/rims/sixnine_ff1.glb',
    modelFlip: false
  },
  {
    id: 'sixnine_ff3',
    code: 'FF-3',
    name: 'FF-3',
    subtitle: 'Twin five-spoke, three-piece',
    style: 'Three-Piece Forged',
    spokeType: 'multi',
    spokeCount: 10,
    weightFrontKg: 0,
    weightRearKg: 0,
    weightSavingsKg: 0,
    standardSizes: ['20"', '21"'],
    pricePerSet: 4395.60,
    priceBySize: { '20"': 4395.60, '21"': 4395.60 },
    priceByFinish: { liquid_metal: 5219.78 },
    description: 'Twin five-spoke three-piece forged wheel in Pure Bronze, Gloss Black or Liquid Metal. In stock for the M3 Competition Sedan (G80): PCD 5×112 · ET15/17 · CB 66.6.',
    highlights: ['Three-piece construction', 'Pure Bronze, Gloss Black or Liquid Metal', 'PCD 5×112 · ET15/17 · CB 66.6'],
    availableVariants: ['pure_bronze', 'black', 'liquid_metal'],
    defaultVariant: 'pure_bronze',
    imageUrl: '/rim-images/sixnine_ff3.webp',
    imageExtrude: false,
    modelUrl: '/models/rims/sixnine_ff3.glb',
    modelFlip: false
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

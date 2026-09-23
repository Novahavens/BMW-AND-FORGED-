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
    bodyStyle: 'coupe'
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
    bodyStyle: 'sedan'
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
    bodyStyle: 'coupe'
  },
  {
    id: 'm5_f90',
    name: 'BMW M5 CS',
    badge: 'M5 F90 CS',
    generation: 'F90',
    chassisCode: 'F90 M5',
    engine: '4.4L S63 Twin-Turbo V8',
    power: '627 HP / 635 PS',
    torque: '750 Nm (553 lb-ft)',
    acceleration: '0-100 km/h in 3.0s',
    recommendedWheelFitment: {
      front: '20 x 9.5J ET20',
      rear: '20 x 10.5J ET24',
      pcd: '5x112',
      cb: '66.6mm'
    },
    bodyStyle: 'sedan'
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
    modelLengthM: 4.94
  }
];

export const BMW_PAINTS: PaintColor[] = [
  {
    id: 'isle_of_man_green',
    name: 'Isle of Man Green',
    code: 'C4G',
    hex: '#0d4332',
    type: 'Metallic',
    roughness: 0.18,
    metalness: 0.72,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08
  },
  {
    id: 'brooklyn_grey',
    name: 'Brooklyn Grey',
    code: 'C4P',
    hex: '#7e8388',
    type: 'Metallic',
    roughness: 0.28,
    metalness: 0.45,
    clearcoat: 0.90,
    clearcoatRoughness: 0.10
  },
  {
    id: 'frozen_deep_grey',
    name: 'Frozen Deep Grey',
    code: 'P7X',
    hex: '#2d3135',
    type: 'Frozen',
    roughness: 0.58,
    metalness: 0.35,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45
  },
  {
    id: 'black_sapphire',
    name: 'Black Sapphire',
    code: '475',
    hex: '#101214',
    type: 'Metallic',
    roughness: 0.14,
    metalness: 0.85,
    clearcoat: 0.98,
    clearcoatRoughness: 0.04
  },
  {
    id: 'marina_bay_blue',
    name: 'Marina Bay Blue',
    code: 'C1K',
    hex: '#0b3c85',
    type: 'Metallic',
    roughness: 0.16,
    metalness: 0.78,
    clearcoat: 0.95,
    clearcoatRoughness: 0.06
  },
  {
    id: 'sao_paulo_yellow',
    name: 'São Paulo Yellow',
    code: 'C4H',
    hex: '#b4cf17',
    type: 'Uni',
    roughness: 0.22,
    metalness: 0.20,
    clearcoat: 0.90,
    clearcoatRoughness: 0.08
  },
  {
    id: 'toronto_red',
    name: 'Toronto Red',
    code: 'C3G',
    hex: '#a3171e',
    type: 'Metallic',
    roughness: 0.17,
    metalness: 0.65,
    clearcoat: 0.95,
    clearcoatRoughness: 0.06
  },
  {
    id: 'alpine_white',
    name: 'Alpine White',
    code: '300',
    hex: '#eceeed',
    type: 'Uni',
    roughness: 0.20,
    metalness: 0.15,
    clearcoat: 0.90,
    clearcoatRoughness: 0.10
  }
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

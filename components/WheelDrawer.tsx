/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  WheelDesign, 
  WheelFinish, 
  FinishVariantKey,
  CarModel 
} from '../types';
import { 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  CircleDot, 
  Check, 
  Flame, 
  Info, 
  Sliders,
  ShieldCheck,
  Feather,
  Zap,
  CheckCircle2,
  FileText,
  HelpCircle,
  Eye
} from 'lucide-react';
import { WheelVisual } from './WheelVisual';
import { TechnicalTooltip } from './TechnicalTooltip';

interface WheelDrawerProps {
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  selectedWheel: WheelDesign;
  selectedFinish: WheelFinish;
  selectedSize: string;
  car: CarModel;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectWheel: (wheel: WheelDesign) => void;
  onSelectFinish: (finish: WheelFinish) => void;
  onSelectSize: (size: string) => void;
  onFocusWheelCamera: () => void;
  onOpenBrochure?: () => void;
  onOpen2DGuide?: () => void;
}

export const WheelDrawer: React.FC<WheelDrawerProps> = ({
  wheels,
  finishes,
  selectedWheel,
  selectedFinish,
  selectedSize,
  car,
  isOpen,
  onToggleOpen,
  onSelectWheel,
  onSelectFinish,
  onSelectSize,
  onFocusWheelCamera,
  onOpenBrochure,
  onOpen2DGuide
}) => {
  const [activeTab, setActiveTab] = useState<'collection' | 'specs'>('collection');

  return (
    <>
      {/* Floating Drawer Handle / Toggle Tab on Right Edge */}
      <button
        onClick={onToggleOpen}
        className={`fixed top-[62%] md:top-[64%] -translate-y-1/2 z-20 flex items-center gap-1.5 bg-black/90 hover:bg-neutral-900 text-white border border-white/[0.12] hover:border-white/[0.22] rounded-l-xl px-2 py-3.5 shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
          isOpen ? 'right-[360px] md:right-[420px]' : 'right-0'
        }`}
        title={isOpen ? 'Collapse Wheels Panel' : 'Explore Forged Wheels'}
      >
        {isOpen ? (
          <ChevronRight className="w-5 h-5 text-[#FF5500]" />
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <ChevronLeft className="w-4 h-4 text-[#FF5500] animate-pulse" />
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase [writing-mode:vertical-lr] rotate-180 text-neutral-300">
              Forged Wheels
            </span>
          </div>
        )}
      </button>

      {/* Sliding Drawer Container */}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-20 w-full max-w-[360px] md:max-w-[420px] bg-black/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header (Vercel Style) */}
        <div className="p-4 md:p-5 border-b border-white/[0.08] bg-black flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-sm tracking-tight uppercase">
                Forged Wheel Options
              </h2>
              <span className="bg-[#FF5500]/15 text-[#FF5500] text-[9px] font-mono font-bold px-2 py-0.5 rounded border border-[#FF5500]/30 shadow-[0_0_8px_rgba(255,85,0,0.15)]">
                BMW M Spec
              </span>
            </div>
            <p className="text-neutral-400 text-xs font-mono mt-0.5">
              Select wheel architecture & custom finish variants
            </p>
          </div>

          <button
            onClick={onToggleOpen}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher Tabs (Segmented Vercel Style) */}
        <div className="p-2.5 bg-black border-b border-white/[0.08]">
          <div className="grid grid-cols-2 gap-1 bg-neutral-950 p-1 rounded-xl border border-white/[0.08] font-mono text-[11px]">
            <button
              onClick={() => setActiveTab('collection')}
              className={`py-1.5 rounded-lg font-semibold tracking-wide uppercase transition-all text-center ${
                activeTab === 'collection'
                  ? 'bg-neutral-900 text-[#FF5500] border border-white/[0.12] shadow-sm font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Wheel Designs ({wheels.length})
            </button>
            <button
              onClick={() => setActiveTab('specs')}
              className={`py-1.5 rounded-lg font-semibold tracking-wide uppercase transition-all text-center ${
                activeTab === 'specs'
                  ? 'bg-neutral-900 text-[#FF5500] border border-white/[0.12] shadow-sm font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Fitment & Tech
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'collection' ? (
            <>
              <div className="flex items-center justify-between text-xs text-neutral-400 pb-1 font-mono">
                <span>Select a design to reveal finishes</span>
                <button
                  onClick={onFocusWheelCamera}
                  className="text-[#FF5500] hover:text-[#FF7722] flex items-center gap-1 font-semibold transition-colors"
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  Zoom to Wheel
                </button>
              </div>

              {wheels.map((wheel) => {
                const isSelected = selectedWheel.id === wheel.id;
                const displayFinishHex = isSelected 
                  ? selectedFinish.hex 
                  : (finishes[wheel.defaultVariant]?.hex || '#d6dde3');

                return (
                  <div
                    key={wheel.id}
                    className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                      isSelected
                        ? 'bg-neutral-950 border-[#FF5500] shadow-[0_0_25px_rgba(255,85,0,0.18)]'
                        : 'bg-neutral-950/80 hover:bg-neutral-900/80 border-white/[0.08] hover:border-white/[0.18]'
                    }`}
                  >
                    {/* Wheel Card Header - Shows the Actual Mag Wheel and Key Specs */}
                    <div
                      onClick={() => onSelectWheel(wheel)}
                      className="p-3 cursor-pointer flex items-center gap-3.5 select-none transition-colors hover:bg-white/[0.02]"
                    >
                      {/* The Actual Mag Wheel Visual with Hover Technical Specs Tooltip */}
                      <TechnicalTooltip
                        title={wheel.name}
                        subtitle={`${wheel.code} • ${wheel.style}`}
                        badge="Forged 6061-T6"
                        badgeColor="orange"
                        description={wheel.description}
                        metrics={[
                          { label: 'Front Mass', value: `${wheel.weightFrontKg} kg`, highlight: true },
                          { label: 'Rear Mass', value: `${wheel.weightRearKg} kg` },
                          { label: 'Weight Delta', value: `-${(wheel.weightSavingsKg * 4).toFixed(1)} kg net`, highlight: true },
                          { label: 'Spoke Design', value: `${wheel.spokeCount} Spokes` },
                        ]}
                        footnote="BMW M Carbon Ceramic Brake (400mm) Certified Clearance"
                        position="bottom-left"
                        width="w-76"
                        className="shrink-0"
                      >
                        <div className="relative shrink-0 p-1 rounded-xl bg-black border border-white/[0.1] shadow-lg flex items-center justify-center hover:border-[#FF5500]/60 transition-colors">
                          <WheelVisual
                            wheel={wheel}
                            finishHex={displayFinishHex}
                            size={70}
                          />
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#FF5500] text-black flex items-center justify-center shadow-[0_0_8px_rgba(255,85,0,0.6)]">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </TechnicalTooltip>

                      {/* Wheel Typography and Badges */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-white font-bold text-sm tracking-tight truncate">
                              {wheel.name}
                            </span>
                            <span className="text-[10px] bg-white/[0.06] text-[#FF5500] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 border border-white/[0.08]">
                              {wheel.code}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected ? (
                              <span className="bg-[#FF5500]/15 text-[#FF5500] text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-[#FF5500]/30 shadow-[0_0_8px_rgba(255,85,0,0.15)]">
                                Active
                              </span>
                            ) : (
                              <span className="text-[10px] text-neutral-500 font-mono">
                                {wheel.availableVariants.length} Finishes
                              </span>
                            )}
                            <ChevronDown
                              className={`w-4 h-4 text-neutral-400 transition-transform duration-300 ${
                                isSelected ? 'rotate-180 text-[#FF5500]' : ''
                              }`}
                            />
                          </div>
                        </div>

                        <p className="text-neutral-400 text-xs line-clamp-1 mb-1.5">
                          {wheel.subtitle}
                        </p>

                        {/* Quick Specs Pill Row with Technical Spec Tooltips */}
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
                          <TechnicalTooltip
                            title="Front Axle Unsprung Mass"
                            badge="6061-T6 Monoblock"
                            badgeColor="emerald"
                            subtitle={`${wheel.weightFrontKg} kg front / ${wheel.weightRearKg} kg rear`}
                            description="Direct reduction in unsprung mass lowers rotational inertia, improving damper responsiveness and steering turn-in velocity."
                            metrics={[
                              { label: 'Front Mass', value: `${wheel.weightFrontKg} kg (${(wheel.weightFrontKg * 2.20462).toFixed(1)} lbs)` },
                              { label: 'Corner Savings', value: `-${wheel.weightSavingsKg} kg vs OEM`, highlight: true }
                            ]}
                            position="top-left"
                            width="w-68"
                          >
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold hover:text-emerald-300 transition-colors cursor-help">
                              <Feather className="w-3 h-3" />
                              {wheel.weightFrontKg} kg
                            </span>
                          </TechnicalTooltip>

                          <span>•</span>

                          <TechnicalTooltip
                            title="Spoke Topology & Structural Milling"
                            badge="FEA Certified"
                            badgeColor="neutral"
                            subtitle={`${wheel.style} (${wheel.spokeCount} Spokes)`}
                            description="FEA optimized pocket-milled spoke architecture maximizes lateral torsional rigidity under heavy track braking."
                            position="top-center"
                            width="w-64"
                          >
                            <span className="text-neutral-300 hover:text-white transition-colors truncate cursor-help">
                              {wheel.style}
                            </span>
                          </TechnicalTooltip>

                          <TechnicalTooltip
                            title="Complete Forged Set Investment"
                            badge="Set of 4"
                            badgeColor="orange"
                            subtitle={`$${wheel.pricePerSet.toLocaleString()} USD MSRP`}
                            description="Includes 4 CNC-machined monoblock wheels engineered to bespoke BMW hub specs, titanium valve stems, and laser-engraved hub caps."
                            position="top-right"
                            width="w-68"
                          >
                            <span className="ml-auto text-[#FF5500] font-bold shrink-0 hover:text-[#FF7722] transition-colors cursor-help">
                              ${wheel.pricePerSet.toLocaleString()}
                            </span>
                          </TechnicalTooltip>
                        </div>
                      </div>
                    </div>

                    {/* REVEALED VARIANT OPTIONS UNDERNEATH (when clicked / selected) */}
                    {isSelected && (
                      <div className="px-3.5 pb-4 pt-3 border-t border-white/[0.08] bg-black/90 space-y-4 animate-fadeIn">
                        {/* Selected Wheel & Active Variant Showcase */}
                        <div className="bg-neutral-950 p-3 rounded-xl border border-white/[0.1] flex items-center gap-3.5 shadow-inner">
                          <TechnicalTooltip
                            title={`${wheel.name}`}
                            badge={selectedFinish.badge}
                            badgeColor="orange"
                            subtitle={`${selectedFinish.name} • ${selectedFinish.colorName}`}
                            description={selectedFinish.description}
                            metrics={[
                              { label: 'Selected Size', value: selectedSize, highlight: true },
                              { label: 'Front Mass', value: `${wheel.weightFrontKg} kg` },
                              { label: 'PVD Metalness', value: `${Math.round(selectedFinish.metalness * 100)}%` },
                              { label: 'Gloss Rating', value: `${Math.round(selectedFinish.clearcoat * 100)}%` },
                            ]}
                            footnote="5-Year Aerospace Warranty against Flaking & Oxidation"
                            position="bottom-left"
                            width="w-76"
                            className="shrink-0"
                          >
                            <div className="shrink-0 p-1 bg-black rounded-xl border border-white/[0.1] cursor-pointer hover:border-[#FF5500]/50 transition-colors">
                              <WheelVisual
                                wheel={wheel}
                                finishHex={selectedFinish.hex}
                                size={80}
                              />
                            </div>
                          </TechnicalTooltip>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-mono tracking-wider text-[#FF5500] font-bold">
                                Current Configuration
                              </span>
                              <TechnicalTooltip
                                title="Macro 3D Camera Orbit"
                                description="Locks the studio camera into a 0.8m macro close-up view of the front wheel to inspect CNC spoke bevels and surface reflections."
                                position="bottom-right"
                                width="w-60"
                              >
                                <button
                                  onClick={onFocusWheelCamera}
                                  className="text-[10px] text-[#FF5500] hover:text-[#FF7722] flex items-center gap-1 font-mono font-medium"
                                >
                                  <Eye className="w-3 h-3" />
                                  3D View
                                </button>
                              </TechnicalTooltip>
                            </div>
                            <div className="text-white font-bold text-xs truncate">
                              {wheel.name} in {selectedFinish.name}
                            </div>
                            <p className="text-[10px] text-neutral-400 line-clamp-2">
                              {selectedFinish.description}
                            </p>
                          </div>
                        </div>

                        {/* Variants Selector Underneath */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                              <Flame className="w-3.5 h-3.5 text-[#FF5500]" />
                              Select Finish Variant ({wheel.availableVariants.length}):
                            </span>
                            <span className="text-xs text-[#FF5500] font-mono font-semibold">
                              {selectedFinish.name}
                            </span>
                          </div>

                          {/* Finish Variant Buttons with Mini Rendered Mag Wheel & Technical Hover Tooltips */}
                          <div className="grid grid-cols-2 gap-2">
                            {wheel.availableVariants.map((variantKey: FinishVariantKey, idx: number) => {
                              const finishObj = finishes[variantKey];
                              if (!finishObj) return null;
                              const isFinishActive = selectedFinish.id === finishObj.id;

                              return (
                                <TechnicalTooltip
                                  key={finishObj.id}
                                  title={finishObj.name}
                                  badge={finishObj.badge}
                                  badgeColor={finishObj.badge === 'Signature' ? 'orange' : finishObj.badge === 'Popular' ? 'emerald' : finishObj.badge === 'Heritage' ? 'orange' : 'cyan'}
                                  subtitle={finishObj.colorName}
                                  description={finishObj.description}
                                  metrics={[
                                    { label: 'PVD Metalness', value: `${Math.round(finishObj.metalness * 100)}%`, highlight: true },
                                    { label: 'Specular Gloss', value: `${Math.round(finishObj.clearcoat * 100)}%` },
                                    { label: 'Surface Texture', value: finishObj.roughness < 0.2 ? 'Mirror Gloss' : finishObj.roughness < 0.3 ? 'Satin Flake' : 'Frosted Matte' },
                                    { label: 'Brake Dust Shield', value: 'Ceramic Coating' },
                                  ]}
                                  footnote="5-Year Anti-Oxidation & Hydrophobic Barrier Guarantee"
                                  position={idx % 2 === 0 ? 'top-left' : 'top-right'}
                                  width="w-72"
                                  className="w-full"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectFinish(finishObj);
                                    }}
                                    className={`w-full flex items-center gap-2 p-2 rounded-xl border text-left transition-all group ${
                                      isFinishActive
                                        ? 'bg-neutral-900 border-[#FF5500] shadow-[0_0_12px_rgba(255,85,0,0.25)] ring-1 ring-[#FF5500]/50'
                                        : 'bg-neutral-950/80 hover:bg-neutral-900 border-white/[0.08] hover:border-white/[0.18]'
                                    }`}
                                  >
                                    {/* Miniature Mag Wheel in this exact finish */}
                                    <div className="shrink-0 w-8 h-8 rounded-full border border-white/20 overflow-hidden relative shadow-sm flex items-center justify-center bg-black">
                                      <WheelVisual
                                        wheel={wheel}
                                        finishHex={finishObj.hex}
                                        size={32}
                                      />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold text-white truncate group-hover:text-[#FF5500] transition-colors">
                                        {finishObj.name}
                                      </div>
                                      <div className="text-[10px] text-neutral-400 truncate font-mono">
                                        {finishObj.badge}
                                      </div>
                                    </div>
                                  </button>
                                </TechnicalTooltip>
                              );
                            })}
                          </div>
                        </div>

                        {/* Diameter Size selector with Fitment Tooltips */}
                        <div>
                          <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider block mb-1.5 font-mono">
                            Staggered Diameter:
                          </span>
                          <div className="flex gap-2">
                            {wheel.standardSizes.map((size) => {
                              const isSizeSelected = selectedSize === size;
                              const sizeSpecs = size === '19"' 
                                ? {
                                    title: '19" Track Attack Fitment',
                                    badge: 'Max Compliance',
                                    badgeColor: 'emerald' as const,
                                    subtitle: '19 x 9.5J ET20 / 19 x 10.5J ET24',
                                    desc: 'Maximum tire sidewall deflection and lowest rotational inertia. Recommended for rough track curbs and autocross.',
                                    metrics: [
                                      { label: 'Rotational Inertia', value: 'Minimum', highlight: true },
                                      { label: 'Ride Compliance', value: 'Highest' }
                                    ],
                                    pos: 'top-left' as const
                                  }
                                : size === '20"'
                                ? {
                                    title: '20" M-Performance Staggered',
                                    badge: 'Factory Standard',
                                    badgeColor: 'orange' as const,
                                    subtitle: '20 x 9.5J ET20 / 20 x 10.5J ET24',
                                    desc: 'The benchmark factory balance. Delivers razor-sharp steering turn-in velocity with optimal clearance for 400mm CCB rotors.',
                                    metrics: [
                                      { label: 'Chassis Balance', value: 'Optimized', highlight: true },
                                      { label: 'Brake Cooling', value: 'High Flow' }
                                    ],
                                    pos: 'top-center' as const
                                  }
                                : {
                                    title: '21" Concave Show & Stance',
                                    badge: 'Flush Arch',
                                    badgeColor: 'cyan' as const,
                                    subtitle: '21 x 10.0J ET18 / 21 x 11.0J ET22',
                                    desc: 'Exaggerated deep-dish spoke concavity, flush with fender arches for an imposing, muscular supercar stance.',
                                    metrics: [
                                      { label: 'Spoke Concavity', value: 'Maximum', highlight: true },
                                      { label: 'Arch Gap', value: 'Flush Fit' }
                                    ],
                                    pos: 'top-right' as const
                                  };

                              return (
                                <TechnicalTooltip
                                  key={size}
                                  title={sizeSpecs.title}
                                  badge={sizeSpecs.badge}
                                  badgeColor={sizeSpecs.badgeColor}
                                  subtitle={sizeSpecs.subtitle}
                                  description={sizeSpecs.desc}
                                  metrics={sizeSpecs.metrics}
                                  position={sizeSpecs.pos}
                                  width="w-68"
                                  className="flex-1"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectSize(size);
                                    }}
                                    className={`w-full py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
                                      isSizeSelected
                                        ? 'bg-[#FF5500] text-black border-[#FF5500] font-bold shadow-[0_0_15px_rgba(255,85,0,0.35)]'
                                        : 'bg-neutral-950 text-neutral-300 border-white/[0.08] hover:border-white/[0.18]'
                                    }`}
                                  >
                                    {size}
                                  </button>
                                </TechnicalTooltip>
                              );
                            })}
                          </div>
                        </div>

                        {/* Selected Finish Highlights with Protective Chemistry Tooltip */}
                        <TechnicalTooltip
                          title="Aerospace Surface Chemistry"
                          badge="Track Tested"
                          badgeColor="orange"
                          subtitle="Electrostatic Acrylic Thermoset Clearcoat"
                          description="High-temperature baked polymer clearcoat tested up to 320°C brake caliper heat. Provides hydrophobic protection against corrosive track brake dust and road salt."
                          footnote="Covered by 5-Year Anti-Oxidation & Flaking Guarantee"
                          position="top-center"
                          width="w-76"
                          className="w-full"
                        >
                          <div className="bg-neutral-950 rounded-xl p-2.5 border border-white/[0.08] text-[11px] text-neutral-300 space-y-1 cursor-help hover:border-white/[0.18] transition-colors">
                            <p className="text-neutral-400">
                              {selectedFinish.description}
                            </p>
                            <div className="flex items-center gap-1.5 text-neutral-200 font-medium pt-0.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#FF5500] shrink-0" />
                              <span className="font-mono text-[10px]">Aerospace clearcoat with 5-year anti-oxidation warranty</span>
                            </div>
                          </div>
                        </TechnicalTooltip>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            /* Fitment & Technical Specs Tab */
            <div className="space-y-4 text-xs text-neutral-300">
              <div className="bg-neutral-950 rounded-xl p-4 border border-white/[0.08] space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#FF5500]" />
                  Bespoke BMW Fitment Profile
                </h3>

                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between py-1 border-b border-white/[0.06]">
                    <span className="text-neutral-400">Chassis</span>
                    <span className="text-white font-semibold">{car.chassisCode}</span>
                  </div>

                  <TechnicalTooltip
                    title="Pitch Circle Diameter (PCD)"
                    badge="Hub-Centric"
                    badgeColor="neutral"
                    subtitle="5 x 112mm Bolt Pattern"
                    description="Standard BMW G8X/G20 high-tensile 5-lug bolt circle. High-grade M14x1.25 forged lug bolts or racing stud conversion kit compatible."
                    position="top-left"
                    width="w-72"
                    className="w-full"
                  >
                    <div className="flex justify-between py-1 border-b border-white/[0.06] hover:bg-white/[0.02] px-1 -mx-1 rounded cursor-help">
                      <span className="text-neutral-400">Bolt Pattern (PCD)</span>
                      <span className="text-white">{car.recommendedWheelFitment.pcd}</span>
                    </div>
                  </TechnicalTooltip>

                  <TechnicalTooltip
                    title="Center Bore Diameter (CB)"
                    badge="Vibration-Free"
                    badgeColor="emerald"
                    subtitle="66.6mm Precision Registration"
                    description="CNC machined precisely to BMW OEM hub spigot dimensions (66.6mm) without requiring plastic centering rings, eliminating wheel vibration at high speeds."
                    position="top-left"
                    width="w-72"
                    className="w-full"
                  >
                    <div className="flex justify-between py-1 border-b border-white/[0.06] hover:bg-white/[0.02] px-1 -mx-1 rounded cursor-help">
                      <span className="text-neutral-400">Center Bore</span>
                      <span className="text-white">{car.recommendedWheelFitment.cb}</span>
                    </div>
                  </TechnicalTooltip>

                  <TechnicalTooltip
                    title="Front Axle Offset (ET)"
                    badge="Bespoke Offset"
                    badgeColor="orange"
                    subtitle={car.recommendedWheelFitment.front}
                    description="Front wheel width and offset optimized to clear massive 400mm 6-piston brake calipers with zero fender rub at full steering lock."
                    position="top-left"
                    width="w-72"
                    className="w-full"
                  >
                    <div className="flex justify-between py-1 border-b border-white/[0.06] hover:bg-white/[0.02] px-1 -mx-1 rounded cursor-help">
                      <span className="text-neutral-400">Recommended Front</span>
                      <span className="text-[#FF5500] font-semibold">{car.recommendedWheelFitment.front}</span>
                    </div>
                  </TechnicalTooltip>

                  <TechnicalTooltip
                    title="Rear Axle Staggered Fitment"
                    badge="Flush Track"
                    badgeColor="orange"
                    subtitle={car.recommendedWheelFitment.rear}
                    description="Wider rear track widens vehicle footprint to maximize rear tire contact patch during launch control and heavy acceleration out of corners."
                    position="top-left"
                    width="w-72"
                    className="w-full"
                  >
                    <div className="flex justify-between py-1 hover:bg-white/[0.02] px-1 -mx-1 rounded cursor-help">
                      <span className="text-neutral-400">Recommended Rear</span>
                      <span className="text-[#FF5500] font-semibold">{car.recommendedWheelFitment.rear}</span>
                    </div>
                  </TechnicalTooltip>
                </div>
              </div>

              {/* Weight savings calculation with Hover Tooltip */}
              <TechnicalTooltip
                title="Rotational Physics & Inertia"
                badge="Suspension Dynamics"
                badgeColor="emerald"
                subtitle="Unsprung Mass Multiplier Effect"
                description="Reducing unsprung weight has roughly 4 times the dynamic effect of shedding sprung chassis weight. Wheels accelerate, brake, and change direction with significantly lower polar moment of inertia."
                position="top-center"
                width="w-80"
                className="w-full"
              >
                <div className="bg-gradient-to-br from-emerald-950/20 via-neutral-950 to-neutral-950 rounded-xl p-4 border border-emerald-500/25 space-y-2 cursor-help hover:border-emerald-500/40 transition-colors">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-xs font-mono">
                    <Zap className="w-4 h-4" />
                    Unsprung Mass Reduction
                  </div>
                  <p className="text-neutral-300 text-[11px] leading-relaxed">
                    Replacing factory cast OEM wheels with our <span className="text-white font-semibold">{selectedWheel.name}</span> reduces unsprung rotational mass by approximately <strong className="text-emerald-400">{(selectedWheel.weightSavingsKg * 4).toFixed(1)} kg ({(selectedWheel.weightSavingsKg * 4 * 2.20462).toFixed(1)} lbs)</strong> across all four axles.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-2 font-mono">
                    <div className="bg-black/80 p-2 rounded-lg border border-white/[0.08]">
                      <div className="text-[10px] text-neutral-400">Front Wheel Mass</div>
                      <div className="text-white font-mono font-bold text-sm">{selectedWheel.weightFrontKg} kg</div>
                    </div>
                    <div className="bg-black/80 p-2 rounded-lg border border-white/[0.08]">
                      <div className="text-[10px] text-neutral-400">Rear Wheel Mass</div>
                      <div className="text-white font-mono font-bold text-sm">{selectedWheel.weightRearKg} kg</div>
                    </div>
                  </div>
                </div>
              </TechnicalTooltip>

              {/* Engineering Highlights */}
              <div className="space-y-2 font-mono text-[11px]">
                <span className="font-bold text-white uppercase tracking-wider block">
                  Manufacturing Standard:
                </span>
                <ul className="space-y-2 text-neutral-400">
                  {selectedWheel.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#FF5500] shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer CTA */}
        <div className="p-4 border-t border-white/[0.08] bg-black flex flex-col gap-3">
          <div className="flex items-center justify-between font-mono">
            <div>
              <span className="text-[11px] text-neutral-400 block uppercase">Set Price (4 Wheels)</span>
              <div className="text-white font-extrabold text-base tracking-tight">
                ${selectedWheel.pricePerSet.toLocaleString()} USD
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                In Stock & Custom Machined
              </span>
              <div className="text-[11px] text-neutral-400">Lead time: 2-3 weeks</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpen2DGuide && (
              <button
                onClick={onOpen2DGuide}
                className="flex items-center justify-center gap-1.5 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs font-mono transition-all"
                title="2D Rim Images to 3D Pipeline Guide"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#FF5500]" />
                <span className="hidden sm:inline">2D Guide</span>
              </button>
            )}

            {onOpenBrochure && (
              <button
                onClick={onOpenBrochure}
                className="flex-1 flex items-center justify-center gap-2 bg-[#FF5500] hover:bg-[#FF6600] active:scale-[0.99] text-black font-bold text-xs py-2.5 px-4 rounded-xl shadow-[0_0_20px_rgba(255,85,0,0.35)] transition-all font-mono"
              >
                <FileText className="w-4 h-4 text-black stroke-[2.5]" />
                <span>Get Brochure & Build Specs</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

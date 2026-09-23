/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  CarModel, 
  PaintColor
} from '../types';
import { 
  Palette, 
  Disc, 
  ChevronLeft, 
  ChevronRight, 
  Car, 
  Sparkles, 
  Check, 
  Sliders, 
  Gauge, 
  Zap, 
  X,
  Layers,
  ArrowRight
} from 'lucide-react';

interface BottomColorBarProps {
  cars: CarModel[];
  paints: PaintColor[];
  selectedCar: CarModel;
  selectedPaint: PaintColor;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  onSelectCar: (car: CarModel) => void;
  onSelectPaint: (paint: PaintColor) => void;
  onOpenWheelDrawer?: () => void;
}

export const BottomColorBar: React.FC<BottomColorBarProps> = ({
  cars,
  paints,
  selectedCar,
  selectedPaint,
  isOpen = true,
  onToggleOpen,
  onSelectCar,
  onSelectPaint,
  onOpenWheelDrawer
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'paint' | 'model'>('all');
  const [paintFilter, setPaintFilter] = useState<'all' | 'Metallic' | 'Frozen Satin' | 'Individual'>('all');

  const filteredPaints = paints.filter((p) => {
    if (paintFilter === 'all') return true;
    if (paintFilter === 'Individual') return p.name.includes('Frozen') || p.name.includes('Isle of Man') || p.name.includes('São Paulo');
    return p.type === paintFilter;
  });

  return (
    <div className="pointer-events-none">
      {/* 1st Child: Floating Side Drawer Toggle Tab on Right Edge */}
      <div className="pointer-events-auto">
        <button
          onClick={onToggleOpen}
          className={`fixed top-[24%] md:top-[26%] -translate-y-1/2 z-20 flex items-center gap-1.5 bg-black/90 hover:bg-neutral-900 text-white border border-white/[0.12] hover:border-white/[0.22] rounded-l-xl px-2 py-3.5 shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
            isOpen ? 'right-[360px] md:right-[420px]' : 'right-0'
          }`}
          title={isOpen ? 'Collapse Vehicle Panel' : 'Vehicle Specification & Paint'}
        >
          {isOpen ? (
            <ChevronRight className="w-5 h-5 text-[#FF5500]" />
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <ChevronLeft className="w-4 h-4 text-[#FF5500] animate-pulse" />
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase [writing-mode:vertical-lr] rotate-180 text-neutral-300">
                Vehicle & Paint
              </span>
            </div>
          )}
        </button>
      </div>

      {/* 2nd Child: Sliding Side Drawer Container on Right Edge */}
      <div
        className={`pointer-events-auto fixed top-0 right-0 bottom-0 z-20 w-full max-w-[360px] md:max-w-[420px] bg-black/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header (Vercel Style) */}
        <div className="p-4 md:p-5 border-b border-white/[0.08] bg-black flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#FF5500]/10 border border-[#FF5500]/30 flex items-center justify-center">
              <Car className="w-4 h-4 text-[#FF5500]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight uppercase">
                  Vehicle Specification
                </h2>
                <span className="bg-[#FF5500] text-black text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(255,85,0,0.3)]">
                  BMW M
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                Car &amp; Paint
              </p>
            </div>
          </div>

          <button
            onClick={onToggleOpen}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Close Drawer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Vercel Segmented Control Navigation Filter */}
        <div className="p-2.5 bg-black border-b border-white/[0.08]">
          <div className="grid grid-cols-3 gap-1 bg-neutral-950 p-1 rounded-xl border border-white/[0.08] font-mono text-[10px]">
            <button
              onClick={() => setActiveCategory('all')}
              className={`py-1.5 rounded-lg font-semibold tracking-wide uppercase transition-all text-center ${
                activeCategory === 'all'
                  ? 'bg-neutral-900 text-[#FF5500] border border-white/[0.12] shadow-sm font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveCategory('model')}
              className={`py-1.5 rounded-lg font-semibold tracking-wide uppercase transition-all text-center ${
                activeCategory === 'model'
                  ? 'bg-neutral-900 text-[#FF5500] border border-white/[0.12] shadow-sm font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Chassis
            </button>
            <button
              onClick={() => setActiveCategory('paint')}
              className={`py-1.5 rounded-lg font-semibold tracking-wide uppercase transition-all text-center ${
                activeCategory === 'paint'
                  ? 'bg-neutral-900 text-[#FF5500] border border-white/[0.12] shadow-sm font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Paint
            </button>
          </div>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-6">
          {/* SECTION 1: BMW Performance Chassis */}
          {(activeCategory === 'all' || activeCategory === 'model') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                  <Car className="w-3.5 h-3.5 text-[#FF5500]" />
                  <span>BMW M Performance Chassis</span>
                </div>
                <span className="text-[10px] text-[#FF5500] font-mono font-medium">
                  {selectedCar.badge}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {cars.map((car) => {
                  const isSelected = selectedCar.id === car.id;
                  return (
                    <div
                      key={car.id}
                      onClick={() => onSelectCar(car)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 relative ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#FF5500]/12 via-neutral-950 to-neutral-950 border-[#FF5500] shadow-[0_0_20px_rgba(255,85,0,0.15)]'
                          : 'bg-neutral-950/80 hover:bg-neutral-900/80 border-white/[0.08] hover:border-white/[0.18]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wide">
                            {car.name}
                          </span>
                          <span className="bg-white/[0.06] text-[#FF5500] text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border border-white/[0.08]">
                            {car.badge}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[#FF5500] text-black flex items-center justify-center shadow-[0_0_8px_rgba(255,85,0,0.5)]">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[10px] text-neutral-400 mt-2 pt-2 border-t border-white/[0.06] font-mono">
                        <div>
                          <span className="text-neutral-500 block text-[9px]">POWER</span>
                          <span className="text-neutral-200 font-semibold">{car.power.split('/')[0]}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[9px]">ENGINE</span>
                          <span className="text-neutral-200 font-semibold truncate">{car.engine.split(' ')[0]} {car.engine.split(' ')[1]}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[9px]">0-100 KM/H</span>
                          <span className="text-[#FF5500] font-semibold">{car.acceleration.replace('0-100 km/h in ', '')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 2: Exterior Paint Finishes */}
          {(activeCategory === 'all' || activeCategory === 'paint') && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                  <Palette className="w-3.5 h-3.5 text-[#FF5500]" />
                  <span>Bespoke Exterior Paint</span>
                </div>
                <span className="text-[11px] text-[#FF5500] font-medium truncate max-w-[150px] font-mono">
                  {selectedPaint.name}
                </span>
              </div>

              {/* Paint Sub-filter Tabs */}
              <div className="flex items-center gap-1.5 text-[11px] pb-1">
                {(['all', 'Metallic', 'Frozen Satin', 'Individual'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setPaintFilter(filter)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      paintFilter === filter
                        ? 'bg-neutral-900 text-[#FF5500] font-bold border border-white/[0.12]'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {filter === 'all' ? 'All (8)' : filter}
                  </button>
                ))}
              </div>

              {/* Paint Swatches Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {filteredPaints.map((paint) => {
                  const isSelected = selectedPaint.id === paint.id;
                  return (
                    <button
                      key={paint.id}
                      onClick={() => onSelectPaint(paint)}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-neutral-950 border-[#FF5500] ring-1 ring-[#FF5500]/50 shadow-[0_0_15px_rgba(255,85,0,0.18)]'
                          : 'bg-neutral-950/80 hover:bg-neutral-900 border-white/[0.08] hover:border-white/[0.18]'
                      }`}
                    >
                      {/* Realistic circular color swatch with clearcoat gloss highlight */}
                      <div
                        className={`w-9 h-9 rounded-full shrink-0 border-2 relative shadow-md overflow-hidden ${
                          isSelected ? 'border-[#FF5500] ring-2 ring-[#FF5500]/30' : 'border-white/20'
                        }`}
                        style={{ backgroundColor: paint.hex }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-white/70 pointer-events-none" />
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white text-[11px] truncate">
                          {paint.name}
                        </div>
                        <div className="text-[9px] text-neutral-400 flex items-center gap-1 font-mono">
                          <span>{paint.code}</span>
                          <span>•</span>
                          <span className="text-[#FF5500]/90">{paint.type}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Paint Spec Callout */}
              <div className="bg-neutral-950/90 rounded-xl p-3 border border-white/[0.08] text-[11px] flex items-center justify-between font-mono">
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase">Formulation:</span>
                  <span className="text-white font-medium">{selectedPaint.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-neutral-500 block text-[10px] uppercase">Finish:</span>
                  <span className="text-[#FF5500] font-semibold">{selectedPaint.type}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer CTA with Neon Orange Energy */}
        <div className="p-4 border-t border-white/[0.08] bg-black flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
            <span>Configured:</span>
            <span className="text-white font-bold truncate max-w-[200px]">
              {selectedCar.badge} • {selectedPaint.name}
            </span>
          </div>

          {onOpenWheelDrawer && (
            <button
              onClick={onOpenWheelDrawer}
              className="w-full flex items-center justify-center gap-2 bg-[#FF5500] hover:bg-[#FF6600] active:scale-[0.99] text-black font-bold text-xs py-2.5 px-4 rounded-xl shadow-[0_0_20px_rgba(255,85,0,0.35)] transition-all font-mono"
            >
              <span>Next: Customize Forged Wheels</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Car, Rotate3d, Loader2 } from 'lucide-react';
import { CarConfiguratorEngine } from '../services/CarConfiguratorEngine';
import { WheelDesign, WheelFinish } from '../types';
import { formatPrice, nearestRimSize, rimPrice, rimSizes } from '../services/pricing';

interface RimDetailPageProps {
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  wheelId: string;
  initialFinishId?: string;
  initialSize?: string;
  onBack: () => void;
  onOpenRim: (wheelId: string) => void;
  /** Puts this rim, finish and size on the car in the studio. */
  onConfigure: (wheel: WheelDesign, finish: WheelFinish, size: string) => void;
}

export const RimDetailPage: React.FC<RimDetailPageProps> = ({
  wheels,
  finishes,
  wheelId,
  initialFinishId,
  initialSize,
  onBack,
  onOpenRim,
  onConfigure
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CarConfiguratorEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  const index = Math.max(0, wheels.findIndex((w) => w.id === wheelId));
  const wheel = wheels[index];
  const availableFinishes = wheel ? wheel.availableVariants.map((id) => finishes[id]).filter(Boolean) : [];
  const defaultFinish =
    availableFinishes.find((f) => f.id === initialFinishId) ??
    finishes[wheel?.defaultVariant ?? ''] ??
    availableFinishes[0];
  const [finish, setFinish] = useState<WheelFinish | undefined>(defaultFinish);
  const [size, setSize] = useState<string>(() => (wheel ? nearestRimSize(wheel, initialSize ?? '20"') : '20"'));

  // One showcase engine for the page's lifetime
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new CarConfiguratorEngine(containerRef.current, () => setReady(true), { showcase: true });
    engineRef.current = engine;
    engine.setAutoRotate(true);
    const onResize = () => engine.handleResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.cleanup();
      engineRef.current = null;
    };
  }, []);

  // Switching rims keeps the finish/size when the new rim offers them
  useEffect(() => {
    if (!wheel) return;
    setFinish((f) => (f && wheel.availableVariants.includes(f.id) ? f : finishes[wheel.defaultVariant] ?? availableFinishes[0]));
    setSize((s) => nearestRimSize(wheel, s));
  }, [wheel?.id]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !wheel) return;
    engine.applyWheelDesign(wheel);
    if (finish) engine.applyWheelFinish(finish);
    engine.setRimSize(size);
  }, [wheel, finish, size]);

  if (!wheel) {
    return (
      <div className="absolute inset-0 bg-black flex items-center justify-center text-neutral-400 text-sm">
        Rim not found.
        <button onClick={onBack} className="ml-3 text-[#FF5500]">Back</button>
      </div>
    );
  }

  const prev = wheels[(index - 1 + wheels.length) % wheels.length];
  const next = wheels[(index + 1) % wheels.length];

  return (
    <div className="absolute inset-0 bg-[#0a0b0d] text-neutral-200 flex flex-col md:flex-row select-none">
      {/* 3D turntable */}
      <div className="relative flex-1 min-h-[50vh]">
        <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF5500]" />
          </div>
        )}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 flex items-center gap-2 bg-black/80 border border-white/10 rounded-lg px-3 py-2 text-xs uppercase tracking-widest hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Studio
        </button>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <button onClick={() => onOpenRim(prev.id)} className="bg-black/80 border border-white/10 rounded-lg p-2 hover:border-white/30" title={prev.name}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => { const v = !autoRotate; setAutoRotate(v); engineRef.current?.setAutoRotate(v); }}
            className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-xs ${autoRotate ? 'border-[#FF5500] text-[#FF5500] bg-[#FF5500]/10' : 'border-white/10 bg-black/80'}`}
          >
            <Rotate3d className="w-4 h-4" /> Rotate
          </button>
          <button onClick={() => onOpenRim(next.id)} className="bg-black/80 border border-white/10 rounded-lg p-2 hover:border-white/30" title={next.name}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <p className="absolute bottom-16 left-1/2 -translate-x-1/2 text-[11px] text-neutral-500 whitespace-nowrap">
          Drag to rotate • Scroll to zoom
        </p>
      </div>

      {/* Details */}
      <aside className="w-full md:w-[400px] shrink-0 border-t md:border-t-0 md:border-l border-white/10 bg-black overflow-y-auto p-6 space-y-6">
        <div>
          <div className="text-[11px] text-[#FF5500] font-bold tracking-widest uppercase">{wheel.code}</div>
          <h1 className="text-2xl font-extrabold text-white mt-1">{wheel.name}</h1>
          <p className="text-sm text-neutral-400 mt-1">{wheel.subtitle}</p>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Colour: <span className="text-white">{finish?.name}</span></div>
          <div className="flex flex-wrap gap-2">
            {availableFinishes.map((f) => (
              <button
                key={f.id}
                onClick={() => setFinish(f)}
                title={f.name}
                className={`w-10 h-10 rounded-full border-2 ${finish?.id === f.id ? 'border-[#FF5500] scale-110' : 'border-white/15 hover:border-white/40'} transition-all`}
                style={{ background: `radial-gradient(circle at 35% 30%, #ffffffaa, ${f.hex} 45%, #000 120%)` }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Size</div>
          <div className="grid grid-cols-4 gap-2">
            {rimSizes(wheel).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`rounded-lg border py-2 text-sm font-bold ${size === s ? 'bg-[#FF5500] text-black border-[#FF5500]' : 'border-white/10 hover:border-white/30'}`}
              >
                {s}
                <span className={`block text-[10px] font-normal ${size === s ? 'text-black/70' : 'text-neutral-500'}`}>
                  {formatPrice(rimPrice(wheel, s))}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between border-y border-white/10 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">Set of 4</div>
            <div className="text-2xl font-extrabold text-white">{formatPrice(rimPrice(wheel, size))}</div>
          </div>
          <div className="text-right text-xs text-neutral-400">
            {wheel.weightFrontKg} kg front<br />{wheel.weightRearKg} kg rear
          </div>
        </div>

        <button
          onClick={() => finish && onConfigure(wheel, finish, size)}
          className="w-full flex items-center justify-center gap-2 bg-[#FF5500] hover:bg-[#FF6600] text-black font-bold text-sm rounded-xl py-3"
        >
          <Car className="w-4 h-4" /> See it on my car
        </button>

        {wheel.description && <p className="text-sm text-neutral-300 leading-relaxed">{wheel.description}</p>}
        {wheel.highlights.length > 0 && (
          <ul className="space-y-2">
            {wheel.highlights.map((h) => (
              <li key={h} className="text-sm text-neutral-400 flex gap-2">
                <span className="text-[#FF5500]">•</span> {h}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
};

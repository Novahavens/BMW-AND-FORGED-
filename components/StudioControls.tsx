/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CameraViewPreset } from '../types';
import { 
  Rotate3d, 
  ArrowUpRight,
  Car,
  ArrowDownRight,
  Disc3,
  Box
} from 'lucide-react';

interface StudioControlsProps {
  currentView: CameraViewPreset;
  isAutoRotate: boolean;
  isLeftDrawerOpen?: boolean;
  isDrawerOpen?: boolean;
  onSelectView: (view: CameraViewPreset) => void;
  onToggleAutoRotate: () => void;
}

export const StudioControls: React.FC<StudioControlsProps> = ({
  currentView,
  isAutoRotate,
  isLeftDrawerOpen,
  isDrawerOpen = false,
  onSelectView,
  onToggleAutoRotate
}) => {
  const cameraFiveIcons: { 
    id: CameraViewPreset; 
    label: string; 
    altIds?: CameraViewPreset[];
    icon: React.ComponentType<{ className?: string }>; 
  }[] = [
    { id: 'frontThreeQuarter', label: '3/4 Front', icon: ArrowUpRight },
    { id: 'side', label: 'Side Profile', icon: Car },
    { id: 'rearThreeQuarter', label: '3/4 Rear', icon: ArrowDownRight },
    { id: 'frontWheel', altIds: ['rearWheel'], label: 'Forged Rim', icon: Disc3 },
    { id: 'top', label: 'Top Aerial', icon: Box },
  ];

  const drawerActive = isDrawerOpen || isLeftDrawerOpen;

  return (
    <div className="pointer-events-none">
      {/* 1st Child: 5 Camera Presets Dock (Bottom Right) - Responsive across mobile, tablet, and desktop */}
      <div
        id="camera-controls-dock"
        className={`fixed bottom-3 sm:bottom-4 md:bottom-6 z-20 pointer-events-none transition-all duration-300 ease-out ${
          drawerActive
            ? 'right-3 sm:right-5 md:right-[380px] lg:right-[440px]'
            : 'right-3 sm:right-4 md:right-6'
        }`}
      >
        <div 
          id="camera-controls-bar"
          className="pointer-events-auto bg-black/90 backdrop-blur-2xl border border-white/[0.12] hover:border-white/[0.22] rounded-xl sm:rounded-2xl p-1 sm:p-1.5 md:p-2 shadow-2xl flex items-center gap-1 sm:gap-1.5 md:gap-2 transition-all"
        >
          {cameraFiveIcons.map((v) => {
            const IconComponent = v.icon;
            const isActive = currentView === v.id || (v.altIds && v.altIds.includes(currentView));
            return (
              <button
                key={v.id}
                id={`camera-btn-${v.id}`}
                onClick={() => onSelectView(v.id)}
                aria-label={v.label}
                title={v.label}
                className={`group relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-lg sm:rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5500] ${
                  isActive
                    ? 'bg-[#FF5500] text-black shadow-[0_0_16px_rgba(255,85,0,0.55)] scale-105 sm:scale-110 font-bold border border-[#FF5500]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                <IconComponent className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5 transition-transform group-hover:scale-110" />

                {/* Desktop hover tooltip */}
                <span className="hidden sm:block absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/95 text-[10px] font-sans text-neutral-200 px-2 py-0.5 rounded-md border border-white/10 pointer-events-none whitespace-nowrap shadow-xl z-30">
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2nd Child: Turntable toggle (Top Left) */}
      <div 
        id="studio-tools-hud"
        className="absolute top-20 md:top-24 left-3 md:left-5 z-10 pointer-events-none flex flex-col gap-2"
      >
        {/* Turntable rotation */}
        <div className="pointer-events-auto bg-black/85 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-[136px] md:w-[150px] transition-colors">
          {/* 360 Turntable */}
          <button
            onClick={onToggleAutoRotate}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
              isAutoRotate
                ? 'bg-[#FF5500]/15 text-[#FF5500] border border-[#FF5500]/40 font-bold shadow-[0_0_12px_rgba(255,85,0,0.2)]'
                : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Toggle 360° Studio Turntable Rotation"
          >
            <div className="flex items-center gap-2">
              <Rotate3d className={`w-3.5 h-3.5 ${isAutoRotate ? 'animate-spin text-[#FF5500]' : 'text-neutral-400'}`} />
              <span>Turntable</span>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full ${isAutoRotate ? 'bg-[#FF5500] animate-pulse shadow-[0_0_6px_#FF5500]' : 'bg-neutral-600'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

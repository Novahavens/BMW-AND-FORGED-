/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WheelDesign, WheelFinish } from '../types';

interface WheelVisualProps {
  wheel: WheelDesign;
  finishHex?: string;
  finishName?: string;
  size?: number; // width & height in px
  className?: string;
  interactive?: boolean;
}

export const WheelVisual: React.FC<WheelVisualProps> = ({
  wheel,
  finishHex = '#d6dde3',
  finishName = 'Liquid Metal',
  size = 120,
  className = '',
  interactive = false
}) => {
  const cx = 150;
  const cy = 150;
  const outerR = 142;
  const barrelR = 128;
  const hubR = 34;

  // Derive highlight and shadow tones from finishHex
  const isDarkFinish = finishHex.toLowerCase() === '#141517' || finishHex.toLowerCase() === '#121214';
  const rimStroke = isDarkFinish ? '#333538' : finishHex;
  const spokeFill = finishHex;
  const spokeStroke = isDarkFinish ? '#444' : '#ffffff44';
  const highlightColor = isDarkFinish ? '#555' : '#ffffff88';

  const renderSpokes = () => {
    switch (wheel.spokeType) {
      case 'aerodisc':
        return (
          <g>
            {/* Outer Aero Disc Carbon Ring */}
            <circle cx={cx} cy={cy} r={barrelR - 4} fill="#18181b" stroke={spokeStroke} strokeWidth="2" />
            <circle cx={cx} cy={cy} r={95} fill="none" stroke={highlightColor} strokeWidth="1.5" strokeDasharray="6 3" />
            
            {/* 12 Directional Aero Turbine Slots */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 360) / 12;
              return (
                <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
                  <path
                    d={`M 142 50 L 158 50 L 154 110 L 146 110 Z`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  <rect x="148" y="58" width="4" height="42" rx="2" fill="#00000088" />
                </g>
              );
            })}

            {/* Inner Center Lock Nut in Anodized Contrast */}
            <circle cx={cx} cy={cy} r={42} fill="#0d0d0f" stroke={spokeFill} strokeWidth="3" />
            <polygon 
              points={`${cx},${cy - 26} ${cx + 22},${cy - 13} ${cx + 22},${cy + 13} ${cx},${cy + 26} ${cx - 22},${cy + 13} ${cx - 22},${cy - 13}`}
              fill="#c53030" 
              stroke="#ffffff88" 
              strokeWidth="1.5"
            />
          </g>
        );

      case 'y_spoke':
        // CSL 5-Split Y-Spoke
        return (
          <g>
            {Array.from({ length: 5 }).map((_, i) => {
              const angle = (i * 360) / 5;
              return (
                <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
                  {/* Stem from hub */}
                  <polygon
                    points={`145,${cy - hubR + 4} 155,${cy - hubR + 4} 155,88 145,88`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  {/* Left branch */}
                  <polygon
                    points={`145,88 150,88 126,22 118,24`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  {/* Right branch */}
                  <polygon
                    points={`150,88 155,88 182,24 174,22`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  {/* Chamfer highlight */}
                  <line x1="150" y1={cy - hubR} x2="150" y2="88" stroke={highlightColor} strokeWidth="1" />
                </g>
              );
            })}
          </g>
        );

      case 'directional':
        // Vortex 9-Turbine
        return (
          <g>
            {Array.from({ length: 9 }).map((_, i) => {
              const angle = (i * 360) / 9;
              return (
                <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
                  <path
                    d={`M 143,${cy - hubR + 2} Q 130,75 120,22 L 134,18 Q 146,72 157,${cy - hubR + 2} Z`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  <path
                    d={`M 146,${cy - hubR + 2} Q 136,75 125,20`}
                    stroke={highlightColor}
                    strokeWidth="1.5"
                    fill="none"
                  />
                </g>
              );
            })}
          </g>
        );

      case 'clubsport':
        // Clubsport 2-Piece with 24 assembly perimeter bolts
        return (
          <g>
            {/* 24 Perimeter Titanium assembly bolts */}
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 360) / 24;
              const rad = (angle * Math.PI) / 180;
              const bx = cx + Math.cos(rad) * 122;
              const by = cy + Math.sin(rad) * 122;
              return (
                <g key={`bolt-${i}`}>
                  <circle cx={bx} cy={by} r="2.8" fill="#e2e8f0" stroke="#475569" strokeWidth="0.8" />
                  <circle cx={bx} cy={by} r="1" fill="#1e293b" />
                </g>
              );
            })}

            {/* Aggressive 5-Star Modular Face */}
            {Array.from({ length: 5 }).map((_, i) => {
              const angle = (i * 360) / 5;
              return (
                <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
                  <polygon
                    points={`134,${cy - hubR + 4} 166,${cy - hubR + 4} 160,34 140,34`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  {/* Fluted recess down the middle */}
                  <rect x="146" y="44" width="8" height="60" rx="3" fill="#00000055" />
                  <line x1="150" y1="44" x2="150" y2="104" stroke={highlightColor} strokeWidth="1" />
                </g>
              );
            })}
          </g>
        );

      case 'multi':
      default:
        // 10-Spoke GT3 Monoblock Twin Spoke
        return (
          <g>
            {Array.from({ length: 10 }).map((_, i) => {
              const angle = (i * 360) / 10;
              return (
                <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
                  <polygon
                    points={`144,${cy - hubR + 2} 156,${cy - hubR + 2} 153,19 147,19`}
                    fill={spokeFill}
                    stroke={spokeStroke}
                    strokeWidth="1"
                  />
                  {/* CNC pocket groove */}
                  <line x1="150" y1={cy - hubR + 6} x2="150" y2="24" stroke={highlightColor} strokeWidth="1.2" />
                </g>
              );
            })}
          </g>
        );
    }
  };

  if (wheel.imageUrl) {
    return (
      <div
        className={`relative flex items-center justify-center shrink-0 select-none ${className}`}
        style={{ width: size, height: size }}
        title={`${wheel.name} – ${finishName}`}
      >
        <img src={wheel.imageUrl} alt={wheel.name} className="w-full h-full object-contain" draggable={false} />
      </div>
    );
  }

  return (
    <div 
      className={`relative flex items-center justify-center shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 300 300"
        className="w-full h-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
      >
        <defs>
          {/* Radial metallic rim sheen */}
          <radialGradient id={`rim-gradient-${wheel.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0b0c0e" />
            <stop offset="70%" stopColor="#1a1c22" />
            <stop offset="85%" stopColor={spokeFill} stopOpacity="0.4" />
            <stop offset="96%" stopColor={spokeFill} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2a2e36" />
          </radialGradient>

          {/* Deep concave drop shadow */}
          <radialGradient id={`concave-shadow-${wheel.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#000000" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* Chamfer highlight arc */}
          <linearGradient id={`chamfer-sheen-${wheel.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Outer Wheel Rim Barrel */}
        <circle cx={cx} cy={cy} r={outerR} fill={`url(#rim-gradient-${wheel.id})`} stroke={rimStroke} strokeWidth="6" />
        
        {/* Chamfered lip highlight */}
        <circle cx={cx} cy={cy} r={outerR - 4} fill="none" stroke={`url(#chamfer-sheen-${wheel.id})`} strokeWidth="2.5" />
        
        {/* Stepped barrel interior */}
        <circle cx={cx} cy={cy} r={barrelR} fill="#0d0e12" stroke={spokeStroke} strokeWidth="1.5" />
        
        {/* Subtle brake rotor shadow behind spokes */}
        <circle cx={cx} cy={cy} r={barrelR - 8} fill="#14151a" />
        <circle cx={cx} cy={cy} r={105} fill="none" stroke="#22252c" strokeWidth="24" strokeDasharray="3 4" />

        {/* Spoke Architecture */}
        {renderSpokes()}

        {/* Deep Center Hub Drop & Shadow */}
        <circle cx={cx} cy={cy} r={hubR + 8} fill={`url(#concave-shadow-${wheel.id})`} />
        <circle cx={cx} cy={cy} r={hubR} fill="#121316" stroke={rimStroke} strokeWidth="3" />
        <circle cx={cx} cy={cy} r={hubR - 2} fill="#181a20" stroke={highlightColor} strokeWidth="1" />

        {/* 5-Lug Titanium Bolt Circle */}
        {Array.from({ length: 5 }).map((_, i) => {
          const angle = (i * 360) / 5;
          const rad = (angle * Math.PI) / 180;
          const lx = cx + Math.cos(rad) * 21;
          const ly = cy + Math.sin(rad) * 21;
          return (
            <g key={`lug-${i}`}>
              <circle cx={lx} ly={ly} r="3.2" fill="#090a0c" stroke="#4a505b" strokeWidth="0.8" />
              <polygon
                points={`${lx},${ly - 2} ${lx + 1.8},${ly - 1} ${lx + 1.8},${ly + 1} ${lx},${ly + 2} ${lx - 1.8},${ly + 1} ${lx - 1.8},${ly - 1}`}
                fill="#cbd5e1"
              />
            </g>
          );
        })}

        {/* Center Cap with Apex / M Emblem */}
        <circle cx={cx} cy={cy} r="12" fill="#0f1115" stroke="#333842" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="10" fill="#0055b8" />
        <path d="M 146 145 L 152 145 L 150 155 L 144 155 Z" fill="#e52421" />
        <path d="M 148 145 L 154 145 L 152 155 L 146 155 Z" fill="#009fe3" />
      </svg>
    </div>
  );
};

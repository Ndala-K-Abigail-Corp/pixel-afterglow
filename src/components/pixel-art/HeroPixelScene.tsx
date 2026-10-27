/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const HeroPixelScene: React.FC = () => {
  return (
    <div className="relative w-full max-w-lg mx-auto flex items-center justify-center select-none" aria-label="Pixel art arcade cabinet visual illustration">
      {/* Outer ambient glow */}
      <div 
        aria-hidden="true" 
        className="absolute -inset-2 sm:-inset-4 bg-gradient-to-r from-[#FF776E]/20 via-[#56E0CB]/20 to-[#FFC66D]/20 blur-2xl opacity-70 rounded-3xl pointer-events-none" 
      />

      {/* Retro Arcade Machine Art */}
      <div className="relative w-full bg-[#201A36] border-2 border-[#3D345F] rounded-2xl p-3.5 sm:p-5 md:p-6 shadow-2xl retro-box-coral">
        {/* Arcade Marquee Header */}
        <div className="bg-[#292342] border border-[#56E0CB]/40 rounded-lg p-2 sm:p-2.5 mb-3 sm:mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FF776E] animate-pulse" />
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FFC66D]" />
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#56E0CB]" />
          </div>
          <span className="font-pixel text-[8px] sm:text-[10px] md:text-xs text-[#FFC66D] tracking-wider uppercase truncate">
            ARCADE UNIT 1994
          </span>
          <span className="font-pixel text-[8px] sm:text-[9px] text-[#56E0CB] bg-[#171329] px-1.5 sm:px-2 py-0.5 rounded border border-[#56E0CB]/30 shrink-0 whitespace-nowrap">
            HI-SCORE 99990
          </span>
        </div>

        {/* CRT Screen Display */}
        <div className="relative bg-[#171329] border-4 border-[#292342] rounded-xl overflow-hidden p-2.5 sm:p-4 min-h-[190px] sm:min-h-[220px] md:min-h-[260px] flex flex-col items-center justify-center">
          {/* Subtle CRT Screen Scanlines */}
          <div className="absolute inset-0 crt-subtle-overlay pointer-events-none z-10" />

          {/* Pixel Artwork Canvas */}
          <svg
            viewBox="0 0 320 200"
            className="w-full h-auto max-h-[220px] relative z-0"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Starry Night Pixel Horizon */}
            <rect x="20" y="30" width="4" height="4" fill="#FFC66D" />
            <rect x="70" y="45" width="3" height="3" fill="#FFF0D7" />
            <rect x="140" y="20" width="4" height="4" fill="#56E0CB" />
            <rect x="220" y="35" width="4" height="4" fill="#FF776E" />
            <rect x="280" y="50" width="3" height="3" fill="#FFF0D7" />
            <rect x="290" y="20" width="4" height="4" fill="#FFC66D" />

            {/* Retro Mountain Silhouette in Arcade Purple */}
            <polygon points="0,180 60,110 110,180" fill="#292342" />
            <polygon points="90,180 160,95 240,180" fill="#322B50" />
            <polygon points="210,180 270,120 320,180" fill="#292342" />

            {/* Checkerboard Retro Floor */}
            <g fill="#201A36">
              <rect x="0" y="170" width="320" height="30" />
              <line x1="0" y1="170" x2="320" y2="170" stroke="#56E0CB" strokeWidth="2" />
              <line x1="0" y1="185" x2="320" y2="185" stroke="#3D345F" strokeWidth="1" />
              <line x1="40" y1="170" x2="20" y2="200" stroke="#3D345F" strokeWidth="1" />
              <line x1="100" y1="170" x2="90" y2="200" stroke="#3D345F" strokeWidth="1" />
              <line x1="160" y1="170" x2="160" y2="200" stroke="#3D345F" strokeWidth="1" />
              <line x1="220" y1="170" x2="230" y2="200" stroke="#3D345F" strokeWidth="1" />
              <line x1="280" y1="170" x2="300" y2="200" stroke="#3D345F" strokeWidth="1" />
            </g>

            {/* Glowing Retro Sun / Moon Disk */}
            <circle cx="160" cy="75" r="32" fill="#FF776E" opacity="0.9" />
            <circle cx="160" cy="75" r="28" fill="#FFC66D" />
            <line x1="128" y1="80" x2="192" y2="80" stroke="#171329" strokeWidth="3" />
            <line x1="133" y1="88" x2="187" y2="88" stroke="#171329" strokeWidth="3" />
            <line x1="140" y1="95" x2="180" y2="95" stroke="#171329" strokeWidth="3" />

            {/* Pixel Mascot Character: "Pip the 8-bit Joy Goblin / Explorer" */}
            <g transform="translate(138, 115)">
              {/* Antenna / Star */}
              <rect x="18" y="0" width="8" height="6" fill="#FFC66D" />
              <rect x="20" y="6" width="4" height="6" fill="#56E0CB" />

              {/* Head */}
              <rect x="10" y="12" width="24" height="20" rx="3" fill="#56E0CB" />
              {/* Visor / Eyes */}
              <rect x="14" y="18" width="6" height="6" fill="#171329" />
              <rect x="24" y="18" width="6" height="6" fill="#171329" />
              <rect x="16" y="20" width="2" height="2" fill="#FFF0D7" />
              <rect x="26" y="20" width="2" height="2" fill="#FFF0D7" />

              {/* Cheeks */}
              <rect x="12" y="26" width="3" height="3" fill="#FF776E" />
              <rect x="29" y="26" width="3" height="3" fill="#FF776E" />

              {/* Torso */}
              <rect x="12" y="32" width="20" height="18" rx="2" fill="#292342" stroke="#56E0CB" strokeWidth="1.5" />
              {/* Chest gem */}
              <rect x="19" y="38" width="6" height="6" fill="#FF776E" />

              {/* Arms (Joyful thumbs-up / waving) */}
              <rect x="2" y="30" width="10" height="6" fill="#56E0CB" />
              <rect x="0" y="24" width="6" height="8" fill="#56E0CB" />
              <rect x="32" y="36" width="10" height="6" fill="#56E0CB" />

              {/* Legs */}
              <rect x="14" y="50" width="6" height="10" fill="#292342" />
              <rect x="24" y="50" width="6" height="10" fill="#292342" />
              {/* Pixel boots */}
              <rect x="12" y="56" width="10" height="6" rx="1" fill="#FFC66D" />
              <rect x="24" y="56" width="10" height="6" rx="1" fill="#FFC66D" />
            </g>

            {/* Little Pixel Game Symbols Floating */}
            {/* Mini X */}
            <g transform="translate(65, 85)" fill="#FF776E">
              <rect x="0" y="0" width="4" height="4" />
              <rect x="12" y="0" width="4" height="4" />
              <rect x="4" y="4" width="8" height="4" />
              <rect x="6" y="8" width="4" height="4" />
              <rect x="4" y="12" width="8" height="4" />
              <rect x="0" y="16" width="4" height="4" />
              <rect x="12" y="16" width="4" height="4" />
            </g>

            {/* Mini O */}
            <g transform="translate(235, 90)" fill="#56E0CB">
              <rect x="4" y="0" width="10" height="4" />
              <rect x="0" y="4" width="4" height="10" />
              <rect x="14" y="4" width="4" height="10" />
              <rect x="4" y="14" width="10" height="4" />
            </g>

            {/* Level / Status Text */}
            <text
              x="160"
              y="194"
              fill="#FFC66D"
              fontSize="9"
              fontFamily="'Press Start 2P', monospace"
              textAnchor="middle"
            >
              READY PLAYER ONE
            </text>
          </svg>
        </div>

        {/* Physical Arcade Control Deck Panel */}
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[#3D345F] flex items-center justify-between px-1 sm:px-2 gap-2">
          {/* Joystick Art */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#171329] border border-[#3D345F]" />
              <div className="absolute w-2 h-4 bg-[#6A5E95] bottom-3 rounded-t-sm" />
              <div className="absolute top-0 w-4 h-4 rounded-full bg-[#FF776E] shadow-sm retro-box-coral" />
            </div>
            <div className="hidden sm:block">
              <span className="block text-[9px] font-pixel text-[#FFF0D7]/60">CONTROL</span>
              <span className="block text-xs font-semibold text-[#56E0CB]">TACTILE 8-WAY</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div className="w-5 h-5 rounded-full bg-[#FF776E] border border-[#FFF0D7]/40 shadow-sm" />
              <span className="text-[8px] font-pixel text-[#FFF0D7]/60 mt-1">A</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-5 h-5 rounded-full bg-[#56E0CB] border border-[#FFF0D7]/40 shadow-sm" />
              <span className="text-[8px] font-pixel text-[#FFF0D7]/60 mt-1">B</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-5 h-5 rounded-full bg-[#FFC66D] border border-[#FFF0D7]/40 shadow-sm" />
              <span className="text-[8px] font-pixel text-[#FFF0D7]/60 mt-1">C</span>
            </div>
          </div>

          {/* Coin Slot */}
          <div className="border border-[#FFC66D]/40 bg-[#171329] px-2 sm:px-2.5 py-1 rounded text-right shrink-0">
            <div className="w-6 h-1 bg-[#FFC66D] mx-auto mb-1 rounded-sm opacity-80" />
            <span className="font-pixel text-[8px] text-[#FFC66D]">FREE PLAY</span>
          </div>
        </div>
      </div>
    </div>
  );
};

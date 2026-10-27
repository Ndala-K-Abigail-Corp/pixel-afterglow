/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Custom illustrated pixel thumbnail for Tic-Tac-Toe
 */
export const TicTacToeArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Background canvas */}
      <rect width="200" height="130" fill="#201A36" />
      {/* Subtle pixel grid pattern */}
      <pattern id="ttt-grid" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill="#2D254C" />
      </pattern>
      <rect width="200" height="130" fill="url(#ttt-grid)" />

      {/* Retro 3x3 Board Frame */}
      <rect x="50" y="15" width="100" height="100" rx="4" fill="#292342" stroke="#3D345F" strokeWidth="2" />

      {/* Grid Lines */}
      <line x1="83" y1="20" x2="83" y2="110" stroke="#56E0CB" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <line x1="117" y1="20" x2="117" y2="110" stroke="#56E0CB" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <line x1="55" y1="50" x2="145" y2="50" stroke="#56E0CB" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <line x1="55" y1="80" x2="145" y2="80" stroke="#56E0CB" strokeWidth="3" strokeLinecap="round" opacity="0.8" />

      {/* Top Left: Pixel X (Coral) */}
      <g fill="#FF776E">
        <rect x="62" y="27" width="4" height="4" />
        <rect x="74" y="27" width="4" height="4" />
        <rect x="66" y="31" width="8" height="4" />
        <rect x="68" y="35" width="4" height="4" />
        <rect x="66" y="39" width="8" height="4" />
        <rect x="62" y="43" width="4" height="4" />
        <rect x="74" y="43" width="4" height="4" />
      </g>

      {/* Center: Pixel O (Electric Teal) */}
      <g fill="#56E0CB">
        <rect x="96" y="57" width="8" height="4" />
        <rect x="92" y="61" width="4" height="8" />
        <rect x="104" y="61" width="4" height="8" />
        <rect x="96" y="69" width="8" height="4" />
      </g>

      {/* Bottom Right: Pixel X (Coral) */}
      <g fill="#FF776E">
        <rect x="126" y="87" width="4" height="4" />
        <rect x="138" y="87" width="4" height="4" />
        <rect x="130" y="91" width="8" height="4" />
        <rect x="132" y="95" width="4" height="4" />
        <rect x="130" y="99" width="8" height="4" />
        <rect x="126" y="103" width="4" height="4" />
        <rect x="138" y="103" width="4" height="4" />
      </g>

      {/* Middle Right: Pixel O (Teal) */}
      <g fill="#56E0CB" opacity="0.85">
        <rect x="130" y="57" width="8" height="4" />
        <rect x="126" y="61" width="4" height="8" />
        <rect x="138" y="61" width="4" height="8" />
        <rect x="130" y="69" width="8" height="4" />
      </g>

      {/* Diagonal Winning Accent Line */}
      <line x1="56" y1="21" x2="144" y2="109" stroke="#FFC66D" strokeWidth="2.5" strokeDasharray="4 2" />

      {/* Corner Pixel Sparkles */}
      <rect x="25" y="30" width="4" height="4" fill="#FFC66D" />
      <rect x="170" y="85" width="5" height="5" fill="#56E0CB" />
      <rect x="165" y="25" width="3" height="3" fill="#FFF0D7" />
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Memory Match
 */
export const MemoryMatchArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />
      {/* Floating 8-bit Cards */}
      {/* Card 1: Open Heart */}
      <g transform="translate(25, 25)">
        <rect width="42" height="58" rx="3" fill="#292342" stroke="#56E0CB" strokeWidth="2" />
        {/* Pixel Heart */}
        <path d="M12 18 h6 v4 h-6 z M24 18 h6 v4 h-6 z M9 22 h24 v6 h-24 z M12 28 h18 v4 h-18 z M15 32 h12 v4 h-12 z M18 36 h6 v4 h-6 z" fill="#FF776E" />
        <rect x="15" y="22" width="3" height="3" fill="#FFF0D7" opacity="0.8" />
      </g>

      {/* Card 2: Open Gem / Diamond */}
      <g transform="translate(79, 25)">
        <rect width="42" height="58" rx="3" fill="#292342" stroke="#56E0CB" strokeWidth="2" />
        {/* Pixel Diamond Gem */}
        <path d="M18 16 h6 v4 h-6 z M15 20 h12 v4 h-12 z M12 24 h18 v4 h-18 z M15 28 h12 v4 h-12 z M18 32 h6 v4 h-6 z" fill="#56E0CB" />
        <rect x="18" y="20" width="4" height="4" fill="#FFF0D7" />
      </g>

      {/* Card 3: Face Down / Star Back */}
      <g transform="translate(133, 25)">
        <rect width="42" height="58" rx="3" fill="#292342" stroke="#3D345F" strokeWidth="2" />
        <rect x="6" y="6" width="30" height="46" fill="#201A36" stroke="#56E0CB" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        {/* Question mark / pixel badge */}
        <text x="21" y="34" fill="#FFC66D" fontSize="18" fontFamily="monospace" fontWeight="bold" textAnchor="middle">?</text>
      </g>

      {/* Mini sparkling stars */}
      <rect x="74" y="95" width="4" height="4" fill="#FFC66D" />
      <rect x="122" y="100" width="3" height="3" fill="#FF776E" />
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Snake
 */
export const SnakeArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />
      {/* Pixel Grid Border */}
      <rect x="25" y="15" width="150" height="100" fill="#171329" stroke="#292342" strokeWidth="2" />
      
      {/* Snake segments (Teal with Golden head) */}
      {/* Body */}
      <rect x="50" y="75" width="12" height="12" fill="#3AA897" />
      <rect x="50" y="63" width="12" height="12" fill="#44BEAB" />
      <rect x="50" y="51" width="12" height="12" fill="#56E0CB" />
      <rect x="62" y="51" width="12" height="12" fill="#56E0CB" />
      <rect x="74" y="51" width="12" height="12" fill="#56E0CB" />
      <rect x="86" y="51" width="12" height="12" fill="#56E0CB" />
      <rect x="98" y="51" width="12" height="12" fill="#56E0CB" />
      <rect x="98" y="39" width="12" height="12" fill="#56E0CB" />
      {/* Head with eyes */}
      <rect x="110" y="39" width="14" height="12" fill="#56E0CB" />
      <rect x="118" y="41" width="3" height="3" fill="#171329" />
      <rect x="118" y="47" width="3" height="3" fill="#171329" />
      {/* Tongue */}
      <rect x="124" y="45" width="5" height="2" fill="#FF776E" />

      {/* Target Pixel Apple (Coral + Gold leaf) */}
      <g transform="translate(145, 55)">
        <rect x="4" y="0" width="3" height="4" fill="#56E0CB" />
        <rect x="0" y="4" width="12" height="10" rx="1" fill="#FF776E" />
        <rect x="2" y="5" width="3" height="3" fill="#FFF0D7" opacity="0.7" />
      </g>

      {/* Dotted target path */}
      <line x1="126" y1="45" x2="142" y2="60" stroke="#FFC66D" strokeWidth="2" strokeDasharray="2 3" opacity="0.6" />
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Word Guessing
 */
export const WordGuessArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />

      {/* Word Slots Row 1: Correct letters (Teal & Gold) */}
      <g transform="translate(25, 28)">
        {/* P */}
        <rect x="0" y="0" width="26" height="30" rx="3" fill="#56E0CB" />
        <text x="13" y="21" fill="#171329" fontSize="15" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">P</text>

        {/* I */}
        <rect x="31" y="0" width="26" height="30" rx="3" fill="#56E0CB" />
        <text x="44" y="21" fill="#171329" fontSize="15" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">I</text>

        {/* X */}
        <rect x="62" y="0" width="26" height="30" rx="3" fill="#FFC66D" />
        <text x="75" y="21" fill="#171329" fontSize="15" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">X</text>

        {/* E */}
        <rect x="93" y="0" width="26" height="30" rx="3" fill="#292342" stroke="#483D6E" strokeWidth="1.5" />
        <text x="106" y="21" fill="#FFF0D7" fontSize="15" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">E</text>

        {/* L */}
        <rect x="124" y="0" width="26" height="30" rx="3" fill="#56E0CB" />
        <text x="137" y="21" fill="#171329" fontSize="15" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">L</text>
      </g>

      {/* Word Slots Row 2 (Ghost/Previous row) */}
      <g transform="translate(25, 68)" opacity="0.6">
        <rect x="0" y="0" width="26" height="26" rx="2" fill="#292342" />
        <text x="13" y="18" fill="#FFF0D7" fontSize="13" fontFamily="'Space Grotesk', monospace" textAnchor="middle">G</text>

        <rect x="31" y="0" width="26" height="26" rx="2" fill="#FFC66D" />
        <text x="44" y="18" fill="#171329" fontSize="13" fontFamily="'Space Grotesk', monospace" textAnchor="middle">A</text>

        <rect x="62" y="0" width="26" height="26" rx="2" fill="#292342" />
        <text x="75" y="18" fill="#FFF0D7" fontSize="13" fontFamily="'Space Grotesk', monospace" textAnchor="middle">M</text>

        <rect x="93" y="0" width="26" height="26" rx="2" fill="#56E0CB" />
        <text x="106" y="18" fill="#171329" fontSize="13" fontFamily="'Space Grotesk', monospace" textAnchor="middle">E</text>

        <rect x="124" y="0" width="26" height="26" rx="2" fill="#292342" />
        <text x="137" y="18" fill="#FFF0D7" fontSize="13" fontFamily="'Space Grotesk', monospace" textAnchor="middle">S</text>
      </g>

      {/* Little micro cursor indicator */}
      <rect x="119" y="48" width="8" height="3" fill="#FF776E" />
    </svg>
  );
};

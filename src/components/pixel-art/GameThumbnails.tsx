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

/**
 * Custom illustrated pixel thumbnail for Brick Breaker
 */
export const BrickBreakerArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />
      <rect x="20" y="12" width="160" height="106" rx="4" fill="#171329" stroke="#292342" strokeWidth="2" />

      {/* Top Brick Rows */}
      {/* Row 1: Pixel Coral */}
      <g fill="#FF776E">
        <rect x="30" y="22" width="24" height="8" rx="1" />
        <rect x="58" y="22" width="24" height="8" rx="1" />
        <rect x="86" y="22" width="24" height="8" rx="1" />
        <rect x="114" y="22" width="24" height="8" rx="1" />
        <rect x="142" y="22" width="24" height="8" rx="1" />
      </g>

      {/* Row 2: Golden Continue */}
      <g fill="#FFC66D">
        <rect x="30" y="34" width="24" height="8" rx="1" />
        <rect x="58" y="34" width="24" height="8" rx="1" />
        <rect x="86" y="34" width="24" height="8" rx="1" />
        <rect x="142" y="34" width="24" height="8" rx="1" />
      </g>

      {/* Row 3: Electric Teal (with shattered gap) */}
      <g fill="#56E0CB">
        <rect x="30" y="46" width="24" height="8" rx="1" />
        <rect x="58" y="46" width="24" height="8" rx="1" />
        <rect x="142" y="46" width="24" height="8" rx="1" />
      </g>

      {/* Shattered Brick Particles */}
      <rect x="116" y="44" width="4" height="4" fill="#FFC66D" />
      <rect x="128" y="49" width="3" height="3" fill="#56E0CB" />
      <rect x="121" y="54" width="3" height="3" fill="#FF776E" />

      {/* Ricochet Trajectory & Ball */}
      <polyline
        points="92,100 122,52 146,78"
        fill="none"
        stroke="#FFC66D"
        strokeWidth="2"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <rect x="142" y="74" width="8" height="8" rx="2" fill="#FFF0D7" />

      {/* Arcade Paddle */}
      <rect x="68" y="102" width="52" height="8" rx="3" fill="#56E0CB" />
      <rect x="78" y="104" width="32" height="4" rx="1" fill="#171329" opacity="0.4" />
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Whack-a-Mole
 */
export const WhackAMoleArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />
      <rect x="20" y="12" width="160" height="106" rx="4" fill="#171329" stroke="#292342" strokeWidth="2" />

      {/* Empty Arcade Burrows */}
      <ellipse cx="55" cy="52" rx="18" ry="7" fill="#292342" stroke="#3D345F" strokeWidth="1.5" />
      <ellipse cx="145" cy="52" rx="18" ry="7" fill="#292342" stroke="#3D345F" strokeWidth="1.5" />
      <ellipse cx="55" cy="94" rx="18" ry="7" fill="#292342" stroke="#3D345F" strokeWidth="1.5" />
      <ellipse cx="100" cy="94" rx="18" ry="7" fill="#292342" stroke="#3D345F" strokeWidth="1.5" />
      <ellipse cx="145" cy="94" rx="18" ry="7" fill="#292342" stroke="#3D345F" strokeWidth="1.5" />

      {/* Center Pop-up Mole Target */}
      <ellipse cx="100" cy="60" rx="20" ry="8" fill="#292342" stroke="#56E0CB" strokeWidth="1.5" />
      <rect x="86" y="32" width="28" height="28" rx="6" fill="#FFC66D" />
      {/* Eyes & Nose */}
      <rect x="92" y="40" width="4" height="4" fill="#171329" />
      <rect x="104" y="40" width="4" height="4" fill="#171329" />
      <rect x="97" y="46" width="6" height="4" rx="1" fill="#FF776E" />

      {/* Impact Star Sparks */}
      <rect x="74" y="24" width="5" height="5" fill="#FF776E" />
      <rect x="120" y="22" width="5" height="5" fill="#56E0CB" />
      <rect x="98" y="18" width="4" height="4" fill="#FFF0D7" />
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Space Shooter
 */
export const SpaceShooterArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#171329" />

      {/* Background Starfield */}
      <rect x="28" y="24" width="3" height="3" fill="#FFF0D7" opacity="0.5" />
      <rect x="165" y="32" width="3" height="3" fill="#FFC66D" opacity="0.7" />
      <rect x="42" y="88" width="2" height="2" fill="#56E0CB" opacity="0.6" />
      <rect x="154" y="96" width="3" height="3" fill="#FFF0D7" opacity="0.4" />

      {/* Enemy Pixel Invaders */}
      {/* Invader 1 (Left) */}
      <g transform="translate(46, 24)" fill="#FF776E">
        <rect x="4" y="0" width="12" height="4" />
        <rect x="0" y="4" width="20" height="8" />
        <rect x="4" y="6" width="3" height="3" fill="#171329" />
        <rect x="13" y="6" width="3" height="3" fill="#171329" />
        <rect x="2" y="12" width="4" height="4" />
        <rect x="14" y="12" width="4" height="4" />
      </g>

      {/* Invader 2 (Center) */}
      <g transform="translate(90, 20)" fill="#FFC66D">
        <rect x="4" y="0" width="12" height="4" />
        <rect x="0" y="4" width="20" height="8" />
        <rect x="4" y="6" width="3" height="3" fill="#171329" />
        <rect x="13" y="6" width="3" height="3" fill="#171329" />
        <rect x="0" y="12" width="4" height="4" />
        <rect x="16" y="12" width="4" height="4" />
      </g>

      {/* Invader 3 (Right) */}
      <g transform="translate(134, 24)" fill="#FF776E">
        <rect x="4" y="0" width="12" height="4" />
        <rect x="0" y="4" width="20" height="8" />
        <rect x="4" y="6" width="3" height="3" fill="#171329" />
        <rect x="13" y="6" width="3" height="3" fill="#171329" />
        <rect x="2" y="12" width="4" height="4" />
        <rect x="14" y="12" width="4" height="4" />
      </g>

      {/* Laser Projectiles */}
      <rect x="98" y="46" width="4" height="10" rx="1" fill="#FF776E" />
      <rect x="98" y="64" width="4" height="10" rx="1" fill="#FFC66D" />

      {/* Player Starfighter */}
      <g transform="translate(86, 86)">
        <rect x="12" y="0" width="4" height="6" fill="#FFF0D7" />
        <rect x="8" y="6" width="12" height="12" fill="#56E0CB" />
        <rect x="0" y="12" width="28" height="8" fill="#56E0CB" />
        <rect x="11" y="10" width="6" height="6" fill="#171329" />
        <rect x="6" y="20" width="4" height="4" fill="#FF776E" />
        <rect x="18" y="20" width="4" height="4" fill="#FF776E" />
      </g>
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Hangman
 */
export const HangmanArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />

      {/* Pixel Frame / Gallows */}
      <g fill="#56E0CB">
        <rect x="28" y="96" width="44" height="5" rx="1" />
        <rect x="40" y="24" width="5" height="74" />
        <rect x="40" y="24" width="34" height="5" />
        <rect x="70" y="24" width="4" height="12" fill="#FFC66D" />
      </g>

      {/* Pixel Character Silhouette */}
      <rect x="64" y="36" width="16" height="14" rx="2" fill="#292342" stroke="#FF776E" strokeWidth="2" />
      <line x1="72" y1="50" x2="72" y2="70" stroke="#FF776E" strokeWidth="3" />
      <line x1="62" y1="58" x2="82" y2="58" stroke="#FF776E" strokeWidth="3" />

      {/* Word Letter Blanks */}
      <g transform="translate(96, 42)">
        <text x="8" y="14" fill="#FFF0D7" fontSize="14" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">A</text>
        <rect x="0" y="18" width="16" height="3" fill="#56E0CB" />

        <text x="28" y="14" fill="#FFC66D" fontSize="14" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">?</text>
        <rect x="20" y="18" width="16" height="3" fill="#FFC66D" />

        <text x="48" y="14" fill="#FFF0D7" fontSize="14" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">C</text>
        <rect x="40" y="18" width="16" height="3" fill="#56E0CB" />

        <text x="68" y="14" fill="#FFF0D7" fontSize="14" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">E</text>
        <rect x="60" y="18" width="16" height="3" fill="#56E0CB" />
      </g>

      {/* Keyboard / Letter Bank Pills */}
      <g transform="translate(96, 76)">
        <rect x="0" y="0" width="22" height="20" rx="3" fill="#292342" stroke="#56E0CB" strokeWidth="1.5" />
        <text x="11" y="14" fill="#56E0CB" fontSize="11" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">R</text>

        <rect x="27" y="0" width="22" height="20" rx="3" fill="#292342" stroke="#FF776E" strokeWidth="1.5" />
        <text x="38" y="14" fill="#FF776E" fontSize="11" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">Z</text>

        <rect x="54" y="0" width="22" height="20" rx="3" fill="#292342" stroke="#3D345F" strokeWidth="1.5" />
        <text x="65" y="14" fill="#FFF0D7" fontSize="11" fontFamily="'Space Grotesk', monospace" fontWeight="bold" textAnchor="middle">T</text>
      </g>
    </svg>
  );
};

/**
 * Custom illustrated pixel thumbnail for Letter Rush
 */
export const LetterRushArt: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 200 130" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="200" height="130" fill="#201A36" />

      {/* Target Letter Badge on Left */}
      <g transform="translate(24, 34)">
        <rect width="54" height="62" rx="6" fill="#292342" stroke="#FFC66D" strokeWidth="2.5" />
        <text x="27" y="42" fill="#FFC66D" fontSize="30" fontFamily="'Press Start 2P', monospace" textAnchor="middle">S</text>
      </g>

      {/* Fast-Fire Category Rows on Right */}
      <g transform="translate(90, 24)">
        {/* Category 1: Country */}
        <rect x="0" y="0" width="86" height="18" rx="3" fill="#171329" stroke="#56E0CB" strokeWidth="1.5" />
        <rect x="5" y="5" width="8" height="8" rx="1" fill="#56E0CB" />
        <rect x="18" y="7" width="44" height="4" rx="1" fill="#FFF0D7" opacity="0.85" />

        {/* Category 2: Animal */}
        <rect x="0" y="24" width="86" height="18" rx="3" fill="#171329" stroke="#FF776E" strokeWidth="1.5" />
        <rect x="5" y="29" width="8" height="8" rx="1" fill="#FF776E" />
        <rect x="18" y="31" width="52" height="4" rx="1" fill="#FFF0D7" opacity="0.85" />

        {/* Category 3: Food */}
        <rect x="0" y="48" width="86" height="18" rx="3" fill="#171329" stroke="#FFC66D" strokeWidth="1.5" />
        <rect x="5" y="53" width="8" height="8" rx="1" fill="#FFC66D" />
        <rect x="18" y="55" width="36" height="4" rx="1" fill="#FFF0D7" opacity="0.85" />

        {/* Category 4: Object */}
        <rect x="0" y="72" width="86" height="18" rx="3" fill="#171329" stroke="#3D345F" strokeWidth="1.5" />
        <rect x="5" y="77" width="8" height="8" rx="1" fill="#3D345F" />
        <rect x="18" y="79" width="24" height="4" rx="1" fill="#56E0CB" />
      </g>
    </svg>
  );
};

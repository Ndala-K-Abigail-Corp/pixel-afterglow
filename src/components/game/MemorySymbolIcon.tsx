/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface MemorySymbolIconProps {
  symbolId: string;
  color: string;
  className?: string;
}

/**
 * Renders 50 genuinely distinct, cohesive 16x16 retro pixel-art SVG icons
 * for single-player (10 pairs) and multiplayer (up to 50 pairs / 100 cards) Memory Match.
 */
export const MemorySymbolIcon: React.FC<MemorySymbolIconProps> = ({
  symbolId,
  color,
  className = 'w-8 h-8',
}) => {
  switch (symbolId) {
    case 'heart':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h3v2H3z M10 2h3v2h-3z M2 4h12v3H2z M3 7h10v2H3z M4 9h8v2H4z M5 11h6v2H5z M7 13h2v2H7z" />
          <rect x="4" y="4" width="2" height="2" fill="#FFF0D7" opacity="0.85" />
        </svg>
      );
    case 'gem':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 2h6v2H5z M3 4h10v2H3z M2 6h12v2H2z M3 8h10v2H3z M5 10h6v2H5z M7 12h2v2H7z" />
          <rect x="5" y="4" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v3H7z M3 5h10v2H3z M5 7h6v2H5z M4 9h8v2H4z M2 11h4v2H2z M10 11h4v2h-4z M1 13h3v2H1z M12 13h3v2h-3z" />
          <rect x="7" y="5" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'potion':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M6 1h4v2H6z M7 3h2v3H7z M4 6h8v2H4z M3 8h10v6H3z M5 14h6v2H5z" />
          <rect x="5" y="9" width="2" height="2" fill="#FFF0D7" opacity="0.85" />
          <rect x="8" y="11" width="2" height="2" fill="#FFF0D7" opacity="0.6" />
        </svg>
      );
    case 'gamepad':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 4h12v8H2z M1 5h1v6H1z M14 5h1v6h-1z" />
          <rect x="4" y="6" width="3" height="1" fill="#171329" />
          <rect x="5" y="5" width="1" height="3" fill="#171329" />
          <rect x="10" y="6" width="1" height="1" fill="#171329" />
          <rect x="12" y="7" width="1" height="1" fill="#171329" />
        </svg>
      );
    case 'ghost':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 1h6v2H5z M3 3h10v9H3z M2 5h12v7H2z M3 14h2v1H3z M7 14h2v1H7z M11 14h2v1h-2z" />
          <rect x="5" y="6" width="2" height="2" fill="#171329" />
          <rect x="9" y="6" width="2" height="2" fill="#171329" />
        </svg>
      );
    case 'key':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M10 2h4v4h-4z M11 3h2v2h-2z M7 5h4v2H7z M3 7h5v2H3z M4 9h2v2H4z M7 9h2v2H7z" />
          <rect x="11" y="3" width="2" height="2" fill="#171329" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M8 1h3v4H8z M6 5h5v2H6z M4 7h6v2H4z M2 9h6v2H2z M4 11h3v2H4z M5 13h2v2H5z" />
          <rect x="7" y="6" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'crown':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 4h2v3h2V4h4v3h2V4h2v8H2z M3 13h10v1H3z" />
          <rect x="4" y="8" width="2" height="2" fill="#FF776E" />
          <rect x="7" y="7" width="2" height="2" fill="#56E0CB" />
          <rect x="10" y="8" width="2" height="2" fill="#FF776E" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h10v6H3z M4 8h8v3H4z M6 11h4v2H6z M7 13h2v2H7z" />
          <rect x="7" y="4" width="2" height="7" fill="#FFF0D7" opacity="0.85" />
          <rect x="5" y="6" width="6" height="2" fill="#FFF0D7" opacity="0.85" />
        </svg>
      );
    case 'alien':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h2v2H3z M11 2h2v2h-2z M4 4h8v2H4z M2 6h12v4H2z M1 8h2v4H1z M13 8h2v4h-2z M4 10h2v3H4z M10 10h2v3h-2z" />
          <rect x="5" y="7" width="2" height="2" fill="#171329" />
          <rect x="9" y="7" width="2" height="2" fill="#171329" />
        </svg>
      );
    case 'monster':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 1h2v3H2z M12 1h2v3h-2z M3 4h10v8H3z M2 6h12v5H2z M4 12h2v2H4z M10 12h2v2h-2z" />
          <rect x="5" y="6" width="2" height="2" fill="#FFF0D7" />
          <rect x="9" y="6" width="2" height="2" fill="#FFF0D7" />
          <rect x="5" y="10" width="6" height="1" fill="#171329" />
        </svg>
      );
    case 'slime':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 2h2v2H7z M5 4h6v2H5z M3 6h10v3H3z M2 9h12v4H2z M3 13h10v1H3z" />
          <rect x="5" y="9" width="2" height="2" fill="#171329" />
          <rect x="9" y="9" width="2" height="2" fill="#171329" />
          <rect x="5" y="6" width="2" height="1" fill="#FFF0D7" opacity="0.8" />
        </svg>
      );
    case 'robot':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v2H7z M3 3h10v9H3z M1 6h2v3H1z M13 6h2v3h-2z M5 12h2v2H5z M9 12h2v2H9z" />
          <rect x="5" y="5" width="2" height="2" fill="#56E0CB" />
          <rect x="9" y="5" width="2" height="2" fill="#56E0CB" />
          <rect x="5" y="9" width="6" height="1" fill="#171329" />
        </svg>
      );
    case 'rocket':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v2H7z M6 3h4v2H6z M5 5h6v6H5z M3 9h2v3H3z M11 9h2v3h-2z M6 11h4v2H6z" />
          <rect x="7" y="6" width="2" height="2" fill="#56E0CB" />
          <rect x="7" y="13" width="2" height="2" fill="#FFC66D" />
        </svg>
      );
    case 'ufo':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 3h6v3H5z M2 6h12v3H2z M1 7h14v2H1z M4 9h8v2H4z" />
          <rect x="6" y="4" width="4" height="2" fill="#FFF0D7" opacity="0.85" />
          <rect x="4" y="7" width="2" height="1" fill="#FFC66D" />
          <rect x="10" y="7" width="2" height="1" fill="#FFC66D" />
        </svg>
      );
    case 'chest':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 4h12v4H2z M2 9h12v5H2z" />
          <rect x="2" y="8" width="12" height="1" fill="#171329" />
          <rect x="7" y="7" width="2" height="3" fill="#FFC66D" />
        </svg>
      );
    case 'coin':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 2h6v1H5z M3 3h10v2H3z M2 5h12v6H2z M3 11h10v2H3z M5 13h6v1H5z" />
          <rect x="7" y="5" width="2" height="6" fill="#FFF0D7" />
        </svg>
      );
    case 'crystal':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v2H7z M6 3h4v3H6z M5 6h6v4H5z M6 10h4v3H6z M7 13h2v2H7z" />
          <rect x="7" y="4" width="1" height="6" fill="#FFF0D7" opacity="0.9" />
        </svg>
      );
    case 'joystick':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M6 2h4v4H6z M7 6h2v5H7z M3 11h10v3H3z" />
          <rect x="7" y="3" width="1" height="1" fill="#FFF0D7" />
          <rect x="4" y="12" width="2" height="1" fill="#FF776E" />
        </svg>
      );
    case 'arcade':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M4 1h8v3H4z M3 4h10v5H3z M4 9h8v6H4z" />
          <rect x="5" y="5" width="6" height="3" fill="#56E0CB" />
          <rect x="6" y="10" width="1" height="1" fill="#FF776E" />
          <rect x="9" y="10" width="1" height="1" fill="#FFC66D" />
        </svg>
      );
    case 'cherry':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M9 2h3v2H9z M7 4h2v3H7z M9 6h2v3H9z M3 8h5v5H3z M9 9h5v5H9z" />
          <rect x="4" y="9" width="1" height="1" fill="#FFF0D7" />
          <rect x="10" y="10" width="1" height="1" fill="#FFF0D7" />
        </svg>
      );
    case 'mushroom':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 2h6v2H5z M3 4h10v5H3z M2 6h12v3H2z M5 9h6v5H5z" />
          <rect x="5" y="4" width="2" height="2" fill="#FFF0D7" />
          <rect x="9" y="5" width="2" height="2" fill="#FFF0D7" />
          <rect x="6" y="10" width="4" height="3" fill="#FFF0D7" opacity="0.85" />
        </svg>
      );
    case 'pizza':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 2h12v2H2z M3 4h10v3H3z M5 7h6v3H5z M6 10h4v2H6z M7 12h2v2H7z" />
          <rect x="5" y="5" width="2" height="2" fill="#FF776E" />
          <rect x="9" y="6" width="2" height="2" fill="#FF776E" />
          <rect x="7" y="9" width="2" height="2" fill="#FF776E" />
        </svg>
      );
    case 'sword':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M12 2h2v2h-2z M10 4h2v2h-2z M8 6h2v2H8z M6 8h2v2H6z M3 9h3v2H3z M5 11h2v3H5z M2 12h2v2H2z" />
          <rect x="11" y="3" width="1" height="1" fill="#FFF0D7" />
        </svg>
      );
    case 'bomb':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M10 2h2v2h-2z M8 4h2v2H8z M4 6h8v7H4z M3 7h10v5H3z" />
          <rect x="12" y="1" width="2" height="2" fill="#FFC66D" />
          <rect x="5" y="8" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
        </svg>
      );
    case 'skull':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M4 2h8v2H4z M3 4h10v6H3z M5 10h6v4H5z" />
          <rect x="5" y="6" width="2" height="2" fill="#171329" />
          <rect x="9" y="6" width="2" height="2" fill="#171329" />
          <rect x="6" y="12" width="1" height="2" fill="#171329" />
          <rect x="9" y="12" width="1" height="2" fill="#171329" />
        </svg>
      );
    case 'dragon':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h3v2H3z M8 2h3v2H8z M4 4h8v4H4z M2 6h11v4H2z M5 10h7v4H5z" />
          <rect x="9" y="6" width="2" height="2" fill="#FFC66D" />
          <rect x="13" y="7" width="2" height="2" fill="#FF776E" />
        </svg>
      );
    case 'cat':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h2v3H3z M11 2h2v3h-2z M3 5h10v8H3z M2 7h12v4H2z" />
          <rect x="5" y="7" width="2" height="2" fill="#171329" />
          <rect x="9" y="7" width="2" height="2" fill="#171329" />
          <rect x="7" y="9" width="2" height="1" fill="#FF776E" />
        </svg>
      );
    case 'owl':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h3v2H3z M10 2h3v2h-3z M3 4h10v9H3z M5 13h2v2H5z M9 13h2v2H9z" />
          <rect x="4" y="5" width="3" height="3" fill="#FFF0D7" />
          <rect x="9" y="5" width="3" height="3" fill="#FFF0D7" />
          <rect x="5" y="6" width="1" height="1" fill="#171329" />
          <rect x="10" y="6" width="1" height="1" fill="#171329" />
          <rect x="7" y="8" width="2" height="2" fill="#FFC66D" />
        </svg>
      );
    case 'crab':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 3h2v3H2z M12 3h2v3h-2z M4 6h8v5H4z M1 8h3v2H1z M12 8h3v2h-3z M3 11h2v3H3z M11 11h2v3h-2z" />
          <rect x="5" y="7" width="2" height="2" fill="#171329" />
          <rect x="9" y="7" width="2" height="2" fill="#171329" />
        </svg>
      );
    case 'fish':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 4h6v2H5z M3 6h9v4H3z M12 5h3v6h-3z M5 10h6v2H5z" />
          <rect x="5" y="7" width="2" height="2" fill="#171329" />
          <rect x="8" y="6" width="2" height="1" fill="#FFF0D7" opacity="0.8" />
        </svg>
      );
    case 'moon':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M6 2h5v2H6z M4 4h5v2H4z M3 6h5v4H3z M4 10h5v2H4z M6 12h5v2H6z" />
          <rect x="5" y="6" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
        </svg>
      );
    case 'sun':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v2H7z M7 13h2v2H7z M1 7h2v2H1z M13 7h2v2h-2z M4 4h8v8H4z M2 2h2v2H2z M12 2h2v2h-2z M2 12h2v2H2z M12 12h2v2h-2z" />
          <rect x="6" y="6" width="4" height="4" fill="#FFF0D7" />
        </svg>
      );
    case 'planet':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 3h6v2H5z M3 5h10v6H3z M5 11h6v2H5z M1 8h14v2H1z" />
          <rect x="1" y="8" width="14" height="1" fill="#FFF0D7" opacity="0.85" />
        </svg>
      );
    case 'comet':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M10 2h4v4h-4z M8 4h4v4H8z M5 7h4v3H5z M3 10h3v2H3z M1 12h3v2H1z" />
          <rect x="10" y="3" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'wand':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M10 1h2v3h3v2h-3v3h-2V6H7V4h3z M6 8h2v2H6z M4 10h2v2H4z M2 12h2v2H2z" />
          <rect x="10" y="4" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'scroll':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h10v2H3z M4 4h8v8H4z M3 12h10v2H3z" />
          <rect x="6" y="6" width="4" height="1" fill="#171329" />
          <rect x="6" y="9" width="4" height="1" fill="#171329" />
        </svg>
      );
    case 'hourglass':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h10v2H3z M4 4h8v2H4z M6 6h4v4H6z M4 10h8v2H4z M3 12h10v2H3z" />
          <rect x="6" y="4" width="4" height="2" fill="#FFF0D7" opacity="0.8" />
          <rect x="6" y="10" width="4" height="2" fill="#FFC66D" />
        </svg>
      );
    case 'cauldron':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 5h10v2H3z M2 7h12v5H2z M4 12h8v2H4z M4 14h2v1H4z M10 14h2v1h-2z" />
          <rect x="5" y="3" width="2" height="2" fill="#56E0CB" />
          <rect x="9" y="2" width="2" height="2" fill="#56E0CB" />
        </svg>
      );
    case 'trophy':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M4 2h8v6H4z M2 3h2v3H2z M12 3h2v3h-2z M6 8h4v2H6z M7 10h2v3H7z M4 13h8v2H4z" />
          <rect x="6" y="4" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'cartridge':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h10v12H3z M5 1h6v1H5z" />
          <rect x="5" y="4" width="6" height="4" fill="#FFF0D7" />
          <rect x="5" y="11" width="6" height="2" fill="#171329" />
        </svg>
      );
    case 'cassette':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 4h12v8H2z" />
          <rect x="4" y="6" width="2" height="2" fill="#171329" />
          <rect x="10" y="6" width="2" height="2" fill="#171329" />
          <rect x="5" y="10" width="6" height="1" fill="#FFF0D7" />
        </svg>
      );
    case 'apple':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v3H7z M4 4h8v2H4z M3 6h10v5H3z M4 11h8v3H4z" />
          <rect x="9" y="2" width="2" height="2" fill="#56E0CB" />
          <rect x="5" y="6" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
        </svg>
      );
    case 'burger':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M4 3h8v2H4z M2 5h12v2H2z M2 8h12v2H2z M3 11h10v3H3z" />
          <rect x="2" y="7" width="12" height="1" fill="#56E0CB" />
          <rect x="2" y="10" width="12" height="1" fill="#FF776E" />
        </svg>
      );
    case 'icecream':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 2h6v2H5z M4 4h8v4H4z M5 8h6v3H5z M6 11h4v2H6z M7 13h2v2H7z" />
          <rect x="5" y="8" width="6" height="6" fill="#FFC66D" opacity="0.85" />
          <rect x="7" y="1" width="2" height="2" fill="#FF776E" />
        </svg>
      );
    case 'axe':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M4 2h7v5H4z M2 3h2v3H2z M7 7h2v7H7z" />
          <rect x="4" y="3" width="2" height="3" fill="#FFF0D7" opacity="0.85" />
        </svg>
      );
    case 'bow':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M4 2h3v2H4z M7 4h2v2H7z M9 6h2v4H9z M7 10h2v2H7z M4 12h3v2H4z M4 4h1v8H4z" />
          <rect x="3" y="7" width="9" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'helmet':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 2h6v2H5z M3 4h10v9H3z M7 1h2v2H7z" />
          <rect x="5" y="7" width="6" height="2" fill="#171329" />
          <rect x="7" y="7" width="2" height="5" fill="#171329" />
        </svg>
      );
    case 'anchor':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M6 2h4v3H6z M7 5h2v8H7z M4 6h8v2H4z M2 10h3v3H2z M11 10h3v3h-3z M4 12h8v2H4z" />
          <rect x="7" y="3" width="2" height="1" fill="#171329" />
        </svg>
      );
    default:
      return null;
  }
};

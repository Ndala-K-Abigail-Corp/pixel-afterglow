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
 * Render custom cohesive retro pixel SVG icons for all 10 card symbols.
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
          <rect x="4" y="4" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
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
          <rect x="5" y="9" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
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
    default:
      return null;
  }
};

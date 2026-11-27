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

const OUTLINE = '#0E0A1E';
const CREAM = '#FFF0D7';
const GOLD = '#FFC66D';
const TEAL = '#56E0CB';
const CORAL = '#FF776E';
const LIME = '#69F0AE';

interface PixelSpriteProps {
  className: string;
  children: React.ReactNode;
}

/**
 * Shared 16-bit arcade pixel sprite wrapper:
 * - 18x18 viewBox with 1px bleed margin so outlines never clip at SVG bounds
 * - crispEdges rendering for razor-sharp pixels at both small mobile and desktop sizes
 * - subtle 1px dark drop shadow for clean separation on dark purple and player-tinted cards
 */
const PixelSprite: React.FC<PixelSpriteProps> = ({ className, children }) => (
  <svg
    viewBox="0 0 18 18"
    className={className}
    shapeRendering="crispEdges"
    style={{ filter: 'drop-shadow(0 1px 0 rgba(14, 10, 30, 0.85))' }}
    aria-hidden="true"
  >
    <g transform="translate(1, 1)">{children}</g>
  </svg>
);

const outlineProps = {
  stroke: OUTLINE,
  strokeWidth: 1.6,
  strokeLinejoin: 'miter' as const,
  paintOrder: 'stroke fill' as const,
};

/**
 * Renders 50 genuinely distinct, cohesive 16-bit retro pixel-art SVG sprites
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
        <PixelSprite className={className}>
          <path
            d="M3 2h3v1h1v1h2V3h1V2h3v1h1v4h-1v2h-1v2h-2v2H9v1H7v-1H6v-2H4V9H3V7H2V3h1z"
            fill={color}
            {...outlineProps}
          />
          <path d="M12 4h1v3h-1v2h-1v2H9v2H7v-1h2v-2h2V8h1z" fill={OUTLINE} opacity="0.26" />
          <rect x="4" y="4" width="2" height="2" fill={CREAM} />
          <rect x="3" y="6" width="1" height="1" fill={CREAM} opacity="0.8" />
        </PixelSprite>
      );
    case 'gem':
      return (
        <PixelSprite className={className}>
          <path
            d="M4 2h8v2h2v3h-1v2h-2v2H9v3H7v-3H5V9H3V7H2V4h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="3" width="8" height="2" fill={CREAM} opacity="0.45" />
          <rect x="5" y="5" width="2" height="2" fill={CREAM} />
          <path d="M10 5h3v2h-1v2h-2v2H8v2H7v-2h2V9h1z" fill={OUTLINE} opacity="0.24" />
        </PixelSprite>
      );
    case 'star':
      return (
        <PixelSprite className={className}>
          <path
            d="M7 1h2v4h5v2h-2v2h-1v2h2v4h-3v-2H6v2H3v-4h2V9H4V7H2V5h5z"
            fill={color}
            {...outlineProps}
          />
          <rect x="7" y="4" width="2" height="3" fill={CREAM} />
          <rect x="5" y="6" width="2" height="1" fill={CREAM} opacity="0.8" />
          <rect x="9" y="8" width="2" height="3" fill={OUTLINE} opacity="0.22" />
        </PixelSprite>
      );
    case 'potion':
      return (
        <PixelSprite className={className}>
          <path
            d="M6 1h4v2H9v3h3v2h1v5h-1v2H4v-2H3V8h1V6h3V3H6z"
            fill={color}
            {...outlineProps}
          />
          <rect x="6" y="1" width="4" height="2" fill={GOLD} />
          <rect x="7" y="3" width="2" height="3" fill={CREAM} opacity="0.75" />
          <rect x="10" y="8" width="2" height="6" fill={OUTLINE} opacity="0.28" />
          <rect x="5" y="9" width="2" height="2" fill={CREAM} />
          <rect x="8" y="11" width="2" height="2" fill={CREAM} opacity="0.8" />
        </PixelSprite>
      );
    case 'gamepad':
      return (
        <PixelSprite className={className}>
          <path
            d="M3 4h10v1h2v6h-1v2h-3v-2H5v2H2v-2H1V5h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="3" y="4" width="10" height="1" fill={CREAM} opacity="0.55" />
          <rect x="3" y="7" width="3" height="1" fill={OUTLINE} />
          <rect x="4" y="6" width="1" height="3" fill={OUTLINE} />
          <rect x="10" y="6" width="2" height="2" fill={CORAL} />
          <rect x="12" y="8" width="2" height="2" fill={GOLD} />
          <rect x="7" y="9" width="2" height="1" fill={OUTLINE} opacity="0.6" />
        </PixelSprite>
      );
    case 'ghost':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 1h6v2h2v3h1v8h-2v-2h-2v2H8v-2H6v2H4v-2H2V6h1V3h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="2" width="4" height="2" fill={CREAM} opacity="0.5" />
          <rect x="4" y="5" width="3" height="3" fill={CREAM} />
          <rect x="9" y="5" width="3" height="3" fill={CREAM} />
          <rect x="5" y="6" width="2" height="2" fill={OUTLINE} />
          <rect x="10" y="6" width="2" height="2" fill={OUTLINE} />
        </PixelSprite>
      );
    case 'key':
      return (
        <PixelSprite className={className}>
          <path
            d="M9 2h5v5h-3v2H9v2H7v2H5v-2H3v2H1v-4h6V7h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="11" y="4" width="2" height="2" fill={OUTLINE} />
          <rect x="10" y="3" width="3" height="1" fill={CREAM} opacity="0.7" />
          <rect x="2" y="9" width="6" height="1" fill={CREAM} opacity="0.65" />
        </PixelSprite>
      );
    case 'bolt':
      return (
        <PixelSprite className={className}>
          <path
            d="M8 1h4v4h-2v2h4v2h-2v2h-2v2H8v2H5v-4h2V9H3V7h2V5h3z"
            fill={color}
            {...outlineProps}
          />
          <rect x="8" y="3" width="2" height="4" fill={CREAM} />
          <rect x="6" y="7" width="3" height="2" fill={GOLD} />
        </PixelSprite>
      );
    case 'crown':
      return (
        <PixelSprite className={className}>
          <path
            d="M1 4h2v3h2V3h2v4h2V3h2v4h2V4h2v8H1z M2 13h12v2H2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="2" y="12" width="12" height="1" fill={OUTLINE} opacity="0.35" />
          <rect x="3" y="8" width="2" height="2" fill={CORAL} />
          <rect x="7" y="7" width="2" height="3" fill={TEAL} />
          <rect x="11" y="8" width="2" height="2" fill={CORAL} />
          <rect x="5" y="4" width="1" height="2" fill={CREAM} opacity="0.85" />
        </PixelSprite>
      );
    case 'shield':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 2h12v6h-1v3h-2v2H9v2H7v-2H5v-2H3V8H2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="3" y="3" width="10" height="1" fill={CREAM} opacity="0.5" />
          <rect x="7" y="4" width="2" height="8" fill={CREAM} />
          <rect x="4" y="6" width="8" height="2" fill={CREAM} />
          <rect x="11" y="4" width="2" height="6" fill={OUTLINE} opacity="0.22" />
        </PixelSprite>
      );
    case 'alien':
      return (
        <PixelSprite className={className}>
          <path
            d="M3 2h2v2H3z M11 2h2v2h-2z M4 4h8v2h2v4h1v3h-2v-2h-2v2H9v-2H7v2H5v-2H3v2H1v-3h1V6h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="6" width="2" height="2" fill={OUTLINE} />
          <rect x="9" y="6" width="2" height="2" fill={OUTLINE} />
          <rect x="5" y="5" width="6" height="1" fill={CREAM} opacity="0.45" />
          <rect x="6" y="9" width="4" height="1" fill={OUTLINE} opacity="0.55" />
        </PixelSprite>
      );
    case 'monster':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 1h2v3h8V1h2v5h1v6h-2v3h-3v-2H6v2H3v-3H1V6h1z"
            fill={color}
            {...outlineProps}
          />
          <rect x="2" y="1" width="2" height="2" fill={GOLD} />
          <rect x="12" y="1" width="2" height="2" fill={GOLD} />
          <rect x="4" y="6" width="3" height="2" fill={CREAM} />
          <rect x="9" y="6" width="3" height="2" fill={CREAM} />
          <rect x="5" y="7" width="1" height="1" fill={OUTLINE} />
          <rect x="10" y="7" width="1" height="1" fill={OUTLINE} />
          <rect x="4" y="10" width="8" height="2" fill={OUTLINE} />
          <rect x="5" y="10" width="1" height="1" fill={CREAM} />
          <rect x="10" y="10" width="1" height="1" fill={CREAM} />
        </PixelSprite>
      );
    case 'slime':
      return (
        <PixelSprite className={className}>
          <path
            d="M6 2h4v2h2v2h2v3h1v4h-2v1H3v-1H1V9h1V6h2V4h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="5" width="2" height="2" fill={CREAM} />
          <rect x="4" y="7" width="1" height="1" fill={CREAM} opacity="0.8" />
          <rect x="4" y="9" width="2" height="2" fill={OUTLINE} />
          <rect x="10" y="9" width="2" height="2" fill={OUTLINE} />
          <rect x="3" y="12" width="10" height="2" fill={OUTLINE} opacity="0.25" />
        </PixelSprite>
      );
    case 'robot':
      return (
        <PixelSprite className={className}>
          <path
            d="M7 1h2v2h4v3h2v3h-2v3h-2v2H9v-2H7v2H5v-2H3V9H1V6h2V3h4z"
            fill={color}
            {...outlineProps}
          />
          <rect x="7" y="1" width="2" height="2" fill={CORAL} />
          <rect x="4" y="4" width="8" height="1" fill={CREAM} opacity="0.65" />
          <rect x="4" y="5" width="8" height="3" fill={OUTLINE} />
          <rect x="5" y="6" width="2" height="2" fill={TEAL} />
          <rect x="9" y="6" width="2" height="2" fill={TEAL} />
          <rect x="5" y="10" width="6" height="1" fill={OUTLINE} />
          <rect x="6" y="10" width="1" height="1" fill={GOLD} />
          <rect x="9" y="10" width="1" height="1" fill={GOLD} />
        </PixelSprite>
      );
    case 'rocket':
      return (
        <PixelSprite className={className}>
          <path
            d="M7 1h2v2h1v2h1v4h2v3h-3v1H6v-1H3V9h2V5h1V3h1z"
            fill={CREAM}
            {...outlineProps}
          />
          <path d="M7 1h2v2h1v2H6V3h1z" fill={color} />
          <rect x="3" y="9" width="2" height="3" fill={color} />
          <rect x="11" y="9" width="2" height="3" fill={color} />
          <rect x="6" y="6" width="4" height="3" fill={OUTLINE} />
          <rect x="7" y="6" width="2" height="2" fill={TEAL} />
          <rect x="6" y="13" width="4" height="2" fill={GOLD} />
          <rect x="7" y="14" width="2" height="2" fill={color} />
        </PixelSprite>
      );
    case 'ufo':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 3h6v3h3v2h1v2h-3v2H4v-2H1V8h1V6h3z"
            fill={color}
            {...outlineProps}
          />
          <rect x="6" y="4" width="4" height="2" fill={CREAM} />
          <rect x="2" y="8" width="12" height="2" fill={OUTLINE} opacity="0.3" />
          <rect x="3" y="8" width="2" height="1" fill={GOLD} />
          <rect x="7" y="8" width="2" height="1" fill={CORAL} />
          <rect x="11" y="8" width="2" height="1" fill={GOLD} />
          <rect x="6" y="12" width="4" height="2" fill={LIME} opacity="0.7" />
        </PixelSprite>
      );
    case 'chest':
      return (
        <PixelSprite className={className}>
          <path d="M3 3h10v1h1v10H2V4h1z" fill="#D97706" {...outlineProps} />
          <rect x="3" y="4" width="10" height="3" fill={color} />
          <rect x="4" y="4" width="8" height="1" fill={CREAM} opacity="0.55" />
          <rect x="2" y="7" width="12" height="2" fill={OUTLINE} />
          <rect x="3" y="7" width="2" height="7" fill={GOLD} opacity="0.8" />
          <rect x="11" y="7" width="2" height="7" fill={GOLD} opacity="0.8" />
          <rect x="6" y="6" width="4" height="4" fill={GOLD} />
          <rect x="7" y="7" width="2" height="2" fill={OUTLINE} />
        </PixelSprite>
      );
    case 'coin':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="3" width="8" height="10" fill={OUTLINE} opacity="0.18" />
          <rect x="5" y="3" width="6" height="1" fill={CREAM} opacity="0.75" />
          <rect x="7" y="4" width="2" height="8" fill={CREAM} />
          <rect x="6" y="5" width="1" height="2" fill={CREAM} />
        </PixelSprite>
      );
    case 'crystal':
      return (
        <PixelSprite className={className}>
          <path
            d="M7 1h2v2h2v3h1v4h-1v3H9v2H7v-2H5v-3H4V6h1V3h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="6" y="3" width="2" height="7" fill={CREAM} opacity="0.85" />
          <rect x="9" y="5" width="2" height="6" fill={OUTLINE} opacity="0.28" />
        </PixelSprite>
      );
    case 'joystick':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 1h6v5H9v4h5v4H2v-4h5V6H5z"
            fill="#475569"
            {...outlineProps}
          />
          <rect x="5" y="1" width="6" height="5" fill={color} />
          <rect x="6" y="2" width="2" height="2" fill={CREAM} />
          <rect x="7" y="6" width="2" height="4" fill="#CBD5E1" />
          <rect x="3" y="11" width="10" height="2" fill={OUTLINE} opacity="0.4" />
          <rect x="3" y="11" width="2" height="2" fill={CORAL} />
          <rect x="11" y="11" width="2" height="2" fill={TEAL} />
        </PixelSprite>
      );
    case 'arcade':
      return (
        <PixelSprite className={className}>
          <path d="M3 1h10v3h1v5h-1v6H3V9H2V4h1z" fill={color} {...outlineProps} />
          <rect x="4" y="2" width="8" height="2" fill={GOLD} />
          <rect x="4" y="5" width="8" height="4" fill={OUTLINE} />
          <rect x="5" y="6" width="6" height="2" fill={TEAL} />
          <rect x="5" y="10" width="2" height="1" fill={CORAL} />
          <rect x="9" y="10" width="2" height="1" fill={GOLD} />
          <rect x="6" y="12" width="4" height="2" fill={OUTLINE} opacity="0.45" />
        </PixelSprite>
      );
    case 'cherry':
      return (
        <PixelSprite className={className}>
          <path
            d="M8 2h5v2h-2v2h-1v2H9V5H7v3H6V4h2z"
            fill="#22C55E"
            stroke={OUTLINE}
            strokeWidth={1.4}
            paintOrder="stroke fill"
          />
          <path d="M3 8h4v1h1v4H7v1H3v-1H2V9h1z" fill={color} {...outlineProps} />
          <path d="M10 9h4v1h1v4h-1v1h-4v-1H9v-4h1z" fill={color} {...outlineProps} />
          <rect x="3" y="9" width="2" height="2" fill={CREAM} />
          <rect x="10" y="10" width="2" height="2" fill={CREAM} />
        </PixelSprite>
      );
    case 'mushroom':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 2h6v1h2v2h1v4h-3v5H5V9H2V5h1V3h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="4" width="2" height="2" fill={CREAM} />
          <rect x="10" y="4" width="2" height="2" fill={CREAM} />
          <rect x="7" y="6" width="2" height="2" fill={CREAM} />
          <rect x="5" y="9" width="6" height="5" fill={CREAM} />
          <rect x="6" y="10" width="1" height="2" fill={OUTLINE} />
          <rect x="9" y="10" width="1" height="2" fill={OUTLINE} />
        </PixelSprite>
      );
    case 'pizza':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 2h12v3h-1v2h-1v2h-1v2H9v2H7v-2H5V9H4V7H3V5H2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="2" y="2" width="12" height="2" fill="#D97706" />
          <rect x="4" y="5" width="2" height="2" fill={CORAL} />
          <rect x="9" y="5" width="2" height="2" fill={CORAL} />
          <rect x="7" y="9" width="2" height="2" fill={CORAL} />
          <rect x="6" y="5" width="2" height="1" fill={CREAM} opacity="0.65" />
        </PixelSprite>
      );
    case 'sword':
      return (
        <PixelSprite className={className}>
          <path
            d="M10 1h5v5h-2v2h-2v2H9v1H7V9h1V7h2V5h2V3h-2z"
            fill={color}
            {...outlineProps}
          />
          <path d="M11 2h3v3h-2v2h-2v2H8V7h2V5h2V3h-1z" fill={CREAM} opacity="0.7" />
          <path
            d="M3 7h2v2h2v2h2v2H7v-2H5V9H3z"
            fill={GOLD}
            stroke={OUTLINE}
            strokeWidth={1.4}
            paintOrder="stroke fill"
          />
          <path
            d="M2 11h3v3H2z"
            fill={CORAL}
            stroke={OUTLINE}
            strokeWidth={1.4}
            paintOrder="stroke fill"
          />
        </PixelSprite>
      );
    case 'bomb':
      return (
        <PixelSprite className={className}>
          <path
            d="M10 2h2v2h-2v2h2v1h2v5h-2v2H4v-2H2V7h2V6h4V4h2z"
            fill="#64748B"
            {...outlineProps}
          />
          <rect x="4" y="7" width="8" height="5" fill={color} opacity="0.55" />
          <rect x="12" y="1" width="3" height="3" fill={GOLD} />
          <rect x="13" y="2" width="1" height="1" fill={CORAL} />
          <rect x="4" y="8" width="2" height="2" fill={CREAM} />
        </PixelSprite>
      );
    case 'skull':
      return (
        <PixelSprite className={className}>
          <path
            d="M4 2h8v2h2v6h-2v4H4v-4H2V4h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="5" width="3" height="3" fill={OUTLINE} />
          <rect x="9" y="5" width="3" height="3" fill={OUTLINE} />
          <rect x="5" y="6" width="1" height="1" fill={TEAL} />
          <rect x="10" y="6" width="1" height="1" fill={TEAL} />
          <rect x="7" y="9" width="2" height="1" fill={OUTLINE} />
          <rect x="6" y="12" width="1" height="2" fill={OUTLINE} />
          <rect x="9" y="12" width="1" height="2" fill={OUTLINE} />
        </PixelSprite>
      );
    case 'dragon':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 2h3v2h3V2h3v3h2v2h2v3h-3v4H5v-2H3V9H1V5h1z"
            fill={color}
            {...outlineProps}
          />
          <rect x="3" y="2" width="2" height="2" fill={GOLD} />
          <rect x="8" y="2" width="2" height="2" fill={GOLD} />
          <rect x="8" y="5" width="3" height="2" fill={CREAM} />
          <rect x="9" y="6" width="1" height="1" fill={OUTLINE} />
          <rect x="13" y="7" width="2" height="2" fill={GOLD} />
          <rect x="5" y="11" width="5" height="2" fill={GOLD} opacity="0.8" />
        </PixelSprite>
      );
    case 'cat':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 2h3v3h6V2h3v10h-2v2H4v-2H2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="3" y="3" width="1" height="2" fill={CORAL} />
          <rect x="12" y="3" width="1" height="2" fill={CORAL} />
          <rect x="4" y="7" width="2" height="2" fill={OUTLINE} />
          <rect x="10" y="7" width="2" height="2" fill={OUTLINE} />
          <rect x="4" y="7" width="1" height="1" fill={LIME} />
          <rect x="10" y="7" width="1" height="1" fill={LIME} />
          <rect x="7" y="9" width="2" height="1" fill={CORAL} />
          <rect x="6" y="11" width="4" height="1" fill={CREAM} opacity="0.8" />
        </PixelSprite>
      );
    case 'owl':
      return (
        <PixelSprite className={className}>
          <path d="M2 2h3v2h6V2h3v10h-2v2H4v-2H2z" fill={color} {...outlineProps} />
          <rect x="5" y="10" width="6" height="3" fill={CREAM} opacity="0.65" />
          <rect x="3" y="5" width="4" height="4" fill={CREAM} />
          <rect x="9" y="5" width="4" height="4" fill={CREAM} />
          <rect x="4" y="6" width="2" height="2" fill={OUTLINE} />
          <rect x="10" y="6" width="2" height="2" fill={OUTLINE} />
          <rect x="7" y="8" width="2" height="2" fill={GOLD} />
          <rect x="4" y="13" width="2" height="2" fill={GOLD} />
          <rect x="10" y="13" width="2" height="2" fill={GOLD} />
        </PixelSprite>
      );
    case 'crab':
      return (
        <PixelSprite className={className}>
          <path
            d="M1 2h3v4H3v1h10V6h-1V2h3v5h-1v4h1v3h-3v-2H4v2H1v-3h1V7H1z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="7" width="2" height="2" fill={CREAM} />
          <rect x="9" y="7" width="2" height="2" fill={CREAM} />
          <rect x="6" y="8" width="1" height="1" fill={OUTLINE} />
          <rect x="10" y="8" width="1" height="1" fill={OUTLINE} />
          <rect x="5" y="10" width="6" height="1" fill={OUTLINE} opacity="0.35" />
        </PixelSprite>
      );
    case 'fish':
      return (
        <PixelSprite className={className}>
          <path
            d="M4 4h6v2h2V4h3v8h-3v-2h-2v2H4v-2H2V6h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="6" width="2" height="2" fill={CREAM} />
          <rect x="4" y="7" width="1" height="1" fill={OUTLINE} />
          <rect x="8" y="5" width="2" height="6" fill={GOLD} opacity="0.85" />
          <rect x="12" y="6" width="2" height="4" fill={CREAM} opacity="0.4" />
        </PixelSprite>
      );
    case 'moon':
      return (
        <PixelSprite className={className}>
          <path
            d="M6 1h6v2H9v2H8v6h1v2h3v2H6v-1H4v-2H3V4h1V2h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="4" width="2" height="5" fill={CREAM} opacity="0.85" />
          <rect x="12" y="5" width="2" height="2" fill={GOLD} />
        </PixelSprite>
      );
    case 'sun':
      return (
        <PixelSprite className={className}>
          <path
            d="M7 1h2v2H7z M7 13h2v2H7z M1 7h2v2H1z M13 7h2v2h-2z M2 2h2v2H2z M12 2h2v2h-2z M2 12h2v2H2z M12 12h2v2h-2z M4 4h8v8H4z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="5" width="6" height="6" fill={GOLD} />
          <rect x="6" y="6" width="3" height="3" fill={CREAM} />
        </PixelSprite>
      );
    case 'planet':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 3h6v2h2v6h-2v2H5v-2H3V5h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="5" y="4" width="3" height="2" fill={CREAM} opacity="0.6" />
          <path
            d="M1 8h14v2H1z"
            fill={GOLD}
            stroke={OUTLINE}
            strokeWidth={1.2}
            paintOrder="stroke fill"
          />
          <rect x="2" y="8" width="12" height="1" fill={CREAM} opacity="0.75" />
        </PixelSprite>
      );
    case 'comet':
      return (
        <PixelSprite className={className}>
          <path
            d="M9 1h6v6h-2v2h-2v2H8v2H5v2H1v-4h2V9h2V7h2V5h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="10" y="2" width="4" height="4" fill={CREAM} />
          <rect x="7" y="6" width="3" height="2" fill={GOLD} />
          <rect x="4" y="9" width="3" height="2" fill={GOLD} opacity="0.8" />
        </PixelSprite>
      );
    case 'wand':
      return (
        <PixelSprite className={className}>
          <path
            d="M9 1h2v3h3v2h-3v3H9V6H6V4h3z"
            fill={GOLD}
            {...outlineProps}
          />
          <path
            d="M6 8h2v2H6v2H4v2H2v-2h2v-2h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="9" y="4" width="2" height="2" fill={CREAM} />
          <rect x="13" y="1" width="2" height="2" fill={TEAL} />
        </PixelSprite>
      );
    case 'scroll':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 2h12v3h-1v6h1v3H2v-3h1V5H2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="3" y="2" width="10" height="2" fill={CREAM} opacity="0.65" />
          <rect x="3" y="12" width="10" height="2" fill="#D97706" opacity="0.7" />
          <rect x="5" y="6" width="6" height="1" fill={OUTLINE} />
          <rect x="5" y="8" width="5" height="1" fill={OUTLINE} />
          <rect x="5" y="10" width="4" height="1" fill={CORAL} />
        </PixelSprite>
      );
    case 'hourglass':
      return (
        <PixelSprite className={className}>
          <path
            d="M2 1h12v3h-2v2h-2v4h2v2h2v3H2v-3h2v-2h2V6H4V4H2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="2" y="1" width="12" height="2" fill={GOLD} />
          <rect x="2" y="13" width="12" height="2" fill={GOLD} />
          <rect x="5" y="4" width="6" height="2" fill={CREAM} />
          <rect x="7" y="7" width="2" height="2" fill={GOLD} />
          <rect x="5" y="10" width="6" height="2" fill={GOLD} />
        </PixelSprite>
      );
    case 'cauldron':
      return (
        <PixelSprite className={className}>
          <rect
            x="4"
            y="2"
            width="2"
            height="2"
            fill={TEAL}
            stroke={OUTLINE}
            strokeWidth={1}
            paintOrder="stroke fill"
          />
          <rect
            x="9"
            y="1"
            width="3"
            height="2"
            fill={LIME}
            stroke={OUTLINE}
            strokeWidth={1}
            paintOrder="stroke fill"
          />
          <path
            d="M3 5h10v2h1v5h-2v2h1v1h-3v-1H6v1H3v-1h1v-2H2V7h1z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="5" width="8" height="2" fill={TEAL} />
          <rect x="4" y="8" width="2" height="3" fill={CREAM} opacity="0.6" />
          <rect x="11" y="7" width="2" height="5" fill={OUTLINE} opacity="0.3" />
        </PixelSprite>
      );
    case 'trophy':
      return (
        <PixelSprite className={className}>
          <path
            d="M3 2h10v2h2v4h-2v1h-2v2H9v2h3v2H4v-2h3v-2H5V9H3V8H1V4h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="2" y="5" width="1" height="2" fill={OUTLINE} />
          <rect x="13" y="5" width="1" height="2" fill={OUTLINE} />
          <rect x="5" y="3" width="2" height="4" fill={CREAM} />
          <rect x="5" y="13" width="6" height="1" fill="#D97706" />
        </PixelSprite>
      );
    case 'cartridge':
      return (
        <PixelSprite className={className}>
          <path d="M3 1h10v14H3z" fill={color} {...outlineProps} />
          <rect x="5" y="2" width="6" height="1" fill={OUTLINE} opacity="0.4" />
          <rect x="4" y="4" width="8" height="5" fill={CREAM} />
          <rect x="5" y="5" width="6" height="2" fill={CORAL} />
          <rect x="5" y="11" width="6" height="3" fill={OUTLINE} />
          <rect x="6" y="12" width="4" height="1" fill={GOLD} />
        </PixelSprite>
      );
    case 'cassette':
      return (
        <PixelSprite className={className}>
          <path d="M1 3h14v10H1z" fill={color} {...outlineProps} />
          <rect x="2" y="4" width="12" height="3" fill={CREAM} />
          <rect x="3" y="5" width="10" height="1" fill={CORAL} />
          <rect x="3" y="7" width="10" height="3" fill={OUTLINE} />
          <rect x="4" y="8" width="2" height="2" fill={TEAL} />
          <rect x="10" y="8" width="2" height="2" fill={TEAL} />
          <rect x="4" y="11" width="8" height="2" fill={OUTLINE} opacity="0.45" />
          <rect x="6" y="11" width="4" height="1" fill={GOLD} />
        </PixelSprite>
      );
    case 'apple':
      return (
        <PixelSprite className={className}>
          <rect
            x="7"
            y="1"
            width="2"
            height="3"
            fill="#A16207"
            stroke={OUTLINE}
            strokeWidth={1.2}
            paintOrder="stroke fill"
          />
          <rect
            x="9"
            y="1"
            width="3"
            height="2"
            fill={LIME}
            stroke={OUTLINE}
            strokeWidth={1.2}
            paintOrder="stroke fill"
          />
          <path
            d="M4 4h8v1h2v6h-1v3H3v-3H2V5h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="6" width="2" height="3" fill={CREAM} />
          <rect x="11" y="6" width="2" height="6" fill={OUTLINE} opacity="0.25" />
        </PixelSprite>
      );
    case 'burger':
      return (
        <PixelSprite className={className}>
          <path d="M3 3h10v2h2v7h-1v2H2v-2H1V5h2z" fill={color} {...outlineProps} />
          <rect x="4" y="4" width="2" height="1" fill={CREAM} />
          <rect x="9" y="4" width="2" height="1" fill={CREAM} />
          <rect x="1" y="7" width="14" height="2" fill={LIME} />
          <rect x="2" y="9" width="12" height="2" fill="#7C2D12" />
          <rect x="2" y="11" width="12" height="1" fill={GOLD} />
        </PixelSprite>
      );
    case 'icecream':
      return (
        <PixelSprite className={className}>
          <path
            d="M5 3h6v1h2v4h-2v3h-1v2H9v2H7v-2H6v-2H5V8H3V4h2z"
            fill={GOLD}
            {...outlineProps}
          />
          <path d="M5 3h6v1h2v4H3V4h2z" fill={color} />
          <rect x="5" y="4" width="2" height="2" fill={CREAM} />
          <rect x="7" y="1" width="2" height="2" fill={CORAL} />
          <rect x="6" y="9" width="4" height="1" fill="#D97706" opacity="0.65" />
          <rect x="7" y="11" width="2" height="1" fill="#D97706" opacity="0.65" />
        </PixelSprite>
      );
    case 'axe':
      return (
        <PixelSprite className={className}>
          <path
            d="M7 2h2v13H7z"
            fill="#D97706"
            stroke={OUTLINE}
            strokeWidth={1.4}
            paintOrder="stroke fill"
          />
          <path
            d="M3 2h9v5H9v1H3V6H2V3h1z"
            fill={color}
            {...outlineProps}
          />
          <rect x="3" y="3" width="2" height="4" fill={CREAM} />
          <rect x="7" y="12" width="2" height="2" fill={GOLD} />
        </PixelSprite>
      );
    case 'bow':
      return (
        <PixelSprite className={className}>
          <path
            d="M4 1h4v2h2v2h2v6h-2v2H8v2H4v-2h3v-2h2V5H7V3H4z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="3" width="1" height="10" fill={CREAM} opacity="0.8" />
          <rect x="2" y="7" width="11" height="2" fill={GOLD} />
          <rect x="12" y="6" width="2" height="4" fill={CREAM} />
        </PixelSprite>
      );
    case 'helmet':
      return (
        <PixelSprite className={className}>
          <rect
            x="6"
            y="1"
            width="4"
            height="2"
            fill={CORAL}
            stroke={OUTLINE}
            strokeWidth={1.2}
            paintOrder="stroke fill"
          />
          <path
            d="M4 3h8v2h2v9H2V5h2z"
            fill={color}
            {...outlineProps}
          />
          <rect x="4" y="4" width="8" height="1" fill={CREAM} opacity="0.7" />
          <rect x="4" y="7" width="8" height="2" fill={OUTLINE} />
          <rect x="7" y="7" width="2" height="6" fill={OUTLINE} />
          <rect x="5" y="7" width="2" height="1" fill={TEAL} />
          <rect x="9" y="7" width="2" height="1" fill={TEAL} />
        </PixelSprite>
      );
    case 'anchor':
      return (
        <PixelSprite className={className}>
          <path
            d="M6 1h4v4H9v1h3v2H9v4h3v-2h2v4h-2v1H4v-1H2v-4h2v2h3V8H4V6h3V5H6z"
            fill={color}
            {...outlineProps}
          />
          <rect x="7" y="2" width="2" height="2" fill={OUTLINE} />
          <rect x="7" y="6" width="2" height="6" fill={CREAM} opacity="0.45" />
          <rect x="4" y="13" width="8" height="1" fill={GOLD} />
        </PixelSprite>
      );
    default:
      return null;
  }
};

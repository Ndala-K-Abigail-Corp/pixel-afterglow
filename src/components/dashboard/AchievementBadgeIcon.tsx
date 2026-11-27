/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { AchievementArtworkId } from '../../types/arcadePlatform';

interface AchievementBadgeIconProps {
  artworkId: AchievementArtworkId;
  unlocked: boolean;
  accentColor: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Custom 16x16 crisp-edge pixel-art SVG badges for Pixel Afterglow achievements.
 * Never uses generic default emoji tiles.
 */
export const AchievementBadgeIcon: React.FC<AchievementBadgeIconProps> = ({
  artworkId,
  unlocked,
  accentColor,
  size = 'md',
}) => {
  const dim =
    size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';
  const primary = unlocked ? accentColor : '#6B628A';
  const highlight = unlocked ? '#FFF0D7' : '#8E84AE';
  const gold = unlocked ? '#FFC66D' : '#7B719A';
  const dark = '#171329';

  const renderArtwork = () => {
    switch (artworkId) {
      case 'welcome-cabinet':
        return (
          <>
            <rect x="3" y="1" width="10" height="14" fill={primary} />
            <rect x="4" y="2" width="8" height="2" fill={gold} />
            <rect x="4" y="5" width="8" height="5" fill={dark} />
            <rect x="5" y="6" width="2" height="2" fill={highlight} />
            <rect x="9" y="7" width="2" height="2" fill={primary} />
            <rect x="5" y="11" width="2" height="2" fill="#FF776E" />
            <rect x="9" y="11" width="2" height="1" fill={gold} />
          </>
        );
      case 'room-key':
        return (
          <>
            <rect x="2" y="5" width="6" height="6" fill={gold} />
            <rect x="4" y="7" width="2" height="2" fill={dark} />
            <rect x="8" y="7" width="6" height="2" fill={gold} />
            <rect x="11" y="9" width="2" height="3" fill={gold} />
            <rect x="13" y="9" width="1" height="2" fill={highlight} />
          </>
        );
      case 'social-spark':
        return (
          <>
            <rect x="2" y="3" width="4" height="4" fill={primary} />
            <rect x="1" y="8" width="6" height="5" fill={primary} />
            <rect x="10" y="3" width="4" height="4" fill={gold} />
            <rect x="9" y="8" width="6" height="5" fill={gold} />
            <rect x="7" y="5" width="2" height="2" fill={highlight} />
          </>
        );
      case 'calendar-star':
        return (
          <>
            <rect x="2" y="3" width="12" height="11" fill={primary} />
            <rect x="4" y="1" width="2" height="3" fill={highlight} />
            <rect x="10" y="1" width="2" height="3" fill={highlight} />
            <rect x="3" y="6" width="10" height="7" fill={dark} />
            <rect x="7" y="7" width="2" height="5" fill={gold} />
            <rect x="5" y="9" width="6" height="1" fill={gold} />
          </>
        );
      case 'cartridge-rack':
        return (
          <>
            <rect x="2" y="2" width="12" height="12" fill={primary} />
            <rect x="4" y="4" width="8" height="4" fill={dark} />
            <rect x="5" y="5" width="6" height="2" fill={gold} />
            <rect x="4" y="11" width="2" height="3" fill={dark} />
            <rect x="7" y="11" width="2" height="3" fill={dark} />
            <rect x="10" y="11" width="2" height="3" fill={dark} />
          </>
        );
      case 'heart-burst':
        return (
          <>
            <rect x="3" y="4" width="4" height="4" fill={primary} />
            <rect x="9" y="4" width="4" height="4" fill={primary} />
            <rect x="2" y="5" width="12" height="4" fill={primary} />
            <rect x="4" y="9" width="8" height="2" fill={primary} />
            <rect x="6" y="11" width="4" height="2" fill={primary} />
            <rect x="7" y="13" width="2" height="1" fill={primary} />
            <rect x="4" y="5" width="2" height="2" fill={highlight} />
          </>
        );
      case 'memory-brain':
        return (
          <>
            <rect x="2" y="3" width="5" height="10" fill={primary} />
            <rect x="9" y="3" width="5" height="10" fill={gold} />
            <rect x="3" y="5" width="3" height="6" fill={dark} />
            <rect x="10" y="5" width="3" height="6" fill={dark} />
            <rect x="4" y="7" width="1" height="2" fill={highlight} />
            <rect x="11" y="7" width="1" height="2" fill={highlight} />
          </>
        );
      case 'lightning-timer':
        return (
          <>
            <rect x="8" y="1" width="4" height="3" fill={gold} />
            <rect x="6" y="4" width="4" height="3" fill={gold} />
            <rect x="4" y="7" width="8" height="2" fill={highlight} />
            <rect x="6" y="9" width="4" height="3" fill={gold} />
            <rect x="4" y="12" width="4" height="3" fill={gold} />
          </>
        );
      case 'perfect-diamond':
        return (
          <>
            <rect x="7" y="1" width="2" height="2" fill={highlight} />
            <rect x="5" y="3" width="6" height="2" fill={primary} />
            <rect x="3" y="5" width="10" height="4" fill={primary} />
            <rect x="5" y="9" width="6" height="3" fill={primary} />
            <rect x="7" y="12" width="2" height="3" fill={primary} />
            <rect x="6" y="5" width="2" height="2" fill={highlight} />
          </>
        );
      case 'memory-crown':
        return (
          <>
            <rect x="2" y="4" width="2" height="8" fill={gold} />
            <rect x="7" y="2" width="2" height="10" fill={gold} />
            <rect x="12" y="4" width="2" height="8" fill={gold} />
            <rect x="2" y="8" width="12" height="5" fill={gold} />
            <rect x="4" y="10" width="2" height="2" fill={primary} />
            <rect x="10" y="10" width="2" height="2" fill="#FF776E" />
          </>
        );
      case 'pair-master':
        return (
          <>
            <rect x="1" y="2" width="6" height="8" fill={primary} />
            <rect x="3" y="4" width="2" height="4" fill={highlight} />
            <rect x="9" y="6" width="6" height="8" fill={gold} />
            <rect x="11" y="8" width="2" height="4" fill={dark} />
          </>
        );
      case 'ttt-first-win':
        return (
          <>
            <rect x="2" y="2" width="2" height="2" fill={primary} />
            <rect x="4" y="4" width="2" height="2" fill={primary} />
            <rect x="6" y="6" width="4" height="4" fill={gold} />
            <rect x="10" y="10" width="2" height="2" fill={primary} />
            <rect x="12" y="12" width="2" height="2" fill={primary} />
            <rect x="12" y="2" width="2" height="2" fill={primary} />
            <rect x="10" y="4" width="2" height="2" fill={primary} />
            <rect x="4" y="10" width="2" height="2" fill={primary} />
            <rect x="2" y="12" width="2" height="2" fill={primary} />
          </>
        );
      case 'ttt-shield':
        return (
          <>
            <rect x="3" y="2" width="10" height="7" fill={primary} />
            <rect x="4" y="9" width="8" height="3" fill={primary} />
            <rect x="6" y="12" width="4" height="2" fill={primary} />
            <rect x="5" y="4" width="6" height="5" fill={dark} />
            <rect x="7" y="5" width="2" height="3" fill={gold} />
          </>
        );
      case 'ttt-flame':
        return (
          <>
            <rect x="7" y="1" width="2" height="3" fill={gold} />
            <rect x="5" y="4" width="6" height="4" fill="#FF776E" />
            <rect x="4" y="8" width="8" height="5" fill="#FF776E" />
            <rect x="6" y="8" width="4" height="4" fill={gold} />
            <rect x="7" y="10" width="2" height="3" fill={highlight} />
          </>
        );
      case 'ttt-balance':
        return (
          <>
            <rect x="7" y="2" width="2" height="12" fill={highlight} />
            <rect x="2" y="4" width="12" height="2" fill={primary} />
            <rect x="2" y="6" width="4" height="4" fill={gold} />
            <rect x="10" y="6" width="4" height="4" fill={gold} />
            <rect x="4" y="13" width="8" height="2" fill={primary} />
          </>
        );
      default:
        return (
          <>
            <rect x="4" y="3" width="8" height="10" fill={primary} />
            <rect x="6" y="5" width="4" height="4" fill={gold} />
            <rect x="5" y="13" width="6" height="2" fill={highlight} />
          </>
        );
    }
  };

  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={`${dim} shrink-0`}
      aria-hidden="true"
    >
      {renderArtwork()}
    </svg>
  );
};

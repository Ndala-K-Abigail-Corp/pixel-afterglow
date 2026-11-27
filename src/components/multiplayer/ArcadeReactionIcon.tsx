/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ReactionEmoji } from '../../types/multiplayer';

export interface ArcadeReactionIconProps {
  emoji: ReactionEmoji;
  className?: string;
}

/**
 * Custom 16x16 retro pixel-art SVG illustrations for all 9 Pixel Afterglow reactions:
 * Laugh (😂), Clap (👏), Fire (🔥), Shock (😮), Cry (😭), Party (🎉), Love (❤️), Cool (😎), Angry (😡).
 * Uses crisp pixel geometry with neon arcade highlights instead of raw system emojis.
 */
export const ArcadeReactionIcon: React.FC<ArcadeReactionIconProps> = ({
  emoji,
  className = 'w-6 h-6',
}) => {
  switch (emoji) {
    case '😂': // Laugh — joyful gold pixel face with squinting happy eyes & cyan tears
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          <rect x="4" y="1" width="8" height="1" fill="#FFC66D" />
          <rect x="2" y="2" width="12" height="1" fill="#FFC66D" />
          <rect x="1" y="3" width="14" height="10" fill="#FFC66D" />
          <rect x="2" y="13" width="12" height="1" fill="#E5A23C" />
          <rect x="4" y="14" width="8" height="1" fill="#E5A23C" />
          {/* Highlight */}
          <rect x="4" y="2" width="4" height="1" fill="#FFF0D7" />
          {/* Laughing squinting eyes */}
          <rect x="4" y="5" width="2" height="1" fill="#171329" />
          <rect x="3" y="6" width="1" height="1" fill="#171329" />
          <rect x="6" y="6" width="1" height="1" fill="#171329" />
          <rect x="10" y="5" width="2" height="1" fill="#171329" />
          <rect x="9" y="6" width="1" height="1" fill="#171329" />
          <rect x="12" y="6" width="1" height="1" fill="#171329" />
          {/* Cyan joy tears */}
          <rect x="1" y="7" width="2" height="2" fill="#56E0CB" />
          <rect x="0" y="8" width="1" height="2" fill="#56E0CB" />
          <rect x="13" y="7" width="2" height="2" fill="#56E0CB" />
          <rect x="15" y="8" width="1" height="2" fill="#56E0CB" />
          {/* Big open laughing mouth */}
          <rect x="4" y="9" width="8" height="1" fill="#FFF0D7" />
          <rect x="4" y="10" width="8" height="2" fill="#171329" />
          <rect x="6" y="11" width="4" height="1" fill="#FF776E" />
        </svg>
      );

    case '👏': // Clap — twin glowing pixel hands with arcade burst sparks
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Neon clap sparks */}
          <rect x="7" y="0" width="2" height="2" fill="#56E0CB" />
          <rect x="3" y="1" width="2" height="1" fill="#FFC66D" />
          <rect x="11" y="1" width="2" height="1" fill="#FFC66D" />
          <rect x="2" y="3" width="1" height="1" fill="#FF776E" />
          <rect x="13" y="3" width="1" height="1" fill="#FF776E" />
          {/* Left hand */}
          <rect x="3" y="6" width="4" height="6" fill="#FFC66D" />
          <rect x="4" y="4" width="2" height="3" fill="#FFC66D" />
          <rect x="2" y="8" width="2" height="3" fill="#E5A23C" />
          <rect x="4" y="12" width="3" height="3" fill="#E5A23C" />
          {/* Right hand */}
          <rect x="9" y="6" width="4" height="6" fill="#FFF0D7" />
          <rect x="10" y="4" width="2" height="3" fill="#FFF0D7" />
          <rect x="12" y="8" width="2" height="3" fill="#FFC66D" />
          <rect x="9" y="12" width="3" height="3" fill="#FFC66D" />
          {/* Impact flash between hands */}
          <rect x="7" y="5" width="2" height="6" fill="#56E0CB" />
        </svg>
      );

    case '🔥': // Fire — multi-tone neon arcade flame
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Outer crimson/coral flame */}
          <rect x="7" y="1" width="2" height="2" fill="#FF776E" />
          <rect x="6" y="3" width="4" height="2" fill="#FF776E" />
          <rect x="4" y="5" width="8" height="3" fill="#FF776E" />
          <rect x="3" y="7" width="10" height="5" fill="#F97316" />
          <rect x="4" y="12" width="8" height="2" fill="#EF4444" />
          <rect x="6" y="14" width="4" height="1" fill="#EF4444" />
          {/* Side flicker */}
          <rect x="11" y="4" width="2" height="2" fill="#FF776E" />
          <rect x="3" y="5" width="1" height="2" fill="#F97316" />
          {/* Golden inner flame */}
          <rect x="6" y="6" width="4" height="6" fill="#FFC66D" />
          <rect x="5" y="8" width="6" height="4" fill="#FFC66D" />
          {/* Hot cream core */}
          <rect x="7" y="9" width="2" height="4" fill="#FFF0D7" />
        </svg>
      );

    case '😮': // Shock — wide-eyed neon teal face with O-mouth & surprise sparks
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          <rect x="4" y="1" width="8" height="1" fill="#56E0CB" />
          <rect x="2" y="2" width="12" height="1" fill="#56E0CB" />
          <rect x="1" y="3" width="14" height="10" fill="#56E0CB" />
          <rect x="2" y="13" width="12" height="1" fill="#2AA89B" />
          <rect x="4" y="14" width="8" height="1" fill="#2AA89B" />
          {/* Highlight */}
          <rect x="4" y="2" width="4" height="1" fill="#FFF0D7" />
          {/* Wide shocked eyes */}
          <rect x="3" y="5" width="3" height="3" fill="#FFF0D7" />
          <rect x="4" y="6" width="1" height="1" fill="#171329" />
          <rect x="10" y="5" width="3" height="3" fill="#FFF0D7" />
          <rect x="11" y="6" width="1" height="1" fill="#171329" />
          {/* Open O mouth */}
          <rect x="6" y="9" width="4" height="4" fill="#171329" />
          <rect x="7" y="10" width="2" height="2" fill="#FF776E" />
        </svg>
      );

    case '😭': // Cry — expressive indigo face with twin cyan pixel waterfalls
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          <rect x="4" y="1" width="8" height="1" fill="#818CF8" />
          <rect x="2" y="2" width="12" height="1" fill="#818CF8" />
          <rect x="1" y="3" width="14" height="10" fill="#818CF8" />
          <rect x="2" y="13" width="12" height="1" fill="#6366F1" />
          <rect x="4" y="14" width="8" height="1" fill="#6366F1" />
          {/* Closed crying eyes */}
          <rect x="3" y="5" width="3" height="1" fill="#171329" />
          <rect x="10" y="5" width="3" height="1" fill="#171329" />
          {/* Streaming pixel tears */}
          <rect x="3" y="6" width="2" height="8" fill="#56E0CB" />
          <rect x="11" y="6" width="2" height="8" fill="#56E0CB" />
          <rect x="4" y="7" width="1" height="6" fill="#FFF0D7" />
          <rect x="12" y="7" width="1" height="6" fill="#FFF0D7" />
          {/* Wailing mouth */}
          <rect x="6" y="9" width="4" height="3" fill="#171329" />
          <rect x="7" y="11" width="2" height="1" fill="#FF776E" />
        </svg>
      );

    case '🎉': // Party — retro party popper bursting with neon pixel confetti
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Confetti burst */}
          <rect x="7" y="1" width="2" height="2" fill="#FF776E" />
          <rect x="11" y="2" width="2" height="2" fill="#56E0CB" />
          <rect x="13" y="5" width="2" height="2" fill="#FFC66D" />
          <rect x="4" y="2" width="2" height="1" fill="#A855F7" />
          <rect x="10" y="6" width="2" height="1" fill="#FFF0D7" />
          <rect x="13" y="9" width="2" height="1" fill="#FF776E" />
          {/* Popper cone */}
          <rect x="2" y="12" width="3" height="2" fill="#FFC66D" />
          <rect x="3" y="10" width="4" height="3" fill="#FFC66D" />
          <rect x="5" y="8" width="4" height="3" fill="#FF776E" />
          <rect x="7" y="6" width="3" height="3" fill="#56E0CB" />
          {/* Stripe highlights */}
          <rect x="4" y="11" width="2" height="1" fill="#FFF0D7" />
          <rect x="6" y="9" width="2" height="1" fill="#FFC66D" />
        </svg>
      );

    case '❤️': // Love — gleaming 8-bit arcade heart
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          <rect x="3" y="2" width="4" height="1" fill="#FF776E" />
          <rect x="9" y="2" width="4" height="1" fill="#FF776E" />
          <rect x="2" y="3" width="6" height="2" fill="#FF4D6D" />
          <rect x="8" y="3" width="6" height="2" fill="#FF4D6D" />
          <rect x="1" y="5" width="14" height="3" fill="#FF4D6D" />
          <rect x="2" y="8" width="12" height="2" fill="#E11D48" />
          <rect x="4" y="10" width="8" height="2" fill="#E11D48" />
          <rect x="6" y="12" width="4" height="2" fill="#BE123C" />
          <rect x="7" y="14" width="2" height="1" fill="#BE123C" />
          {/* Specular pixel gleam */}
          <rect x="3" y="4" width="2" height="2" fill="#FFF0D7" />
          <rect x="4" y="6" width="1" height="1" fill="#FFC66D" />
        </svg>
      );

    case '😎': // Cool — gold arcade face with neon-teal pixelated shades
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          <rect x="4" y="1" width="8" height="1" fill="#FFC66D" />
          <rect x="2" y="2" width="12" height="1" fill="#FFC66D" />
          <rect x="1" y="3" width="14" height="10" fill="#FFC66D" />
          <rect x="2" y="13" width="12" height="1" fill="#E5A23C" />
          <rect x="4" y="14" width="8" height="1" fill="#E5A23C" />
          {/* Pixel shades frame */}
          <rect x="1" y="5" width="14" height="1" fill="#171329" />
          <rect x="2" y="6" width="5" height="3" fill="#171329" />
          <rect x="9" y="6" width="5" height="3" fill="#171329" />
          <rect x="7" y="6" width="2" height="1" fill="#171329" />
          {/* Neon cyan lens glare */}
          <rect x="3" y="6" width="2" height="1" fill="#56E0CB" />
          <rect x="10" y="6" width="2" height="1" fill="#56E0CB" />
          <rect x="4" y="7" width="1" height="1" fill="#FFF0D7" />
          <rect x="11" y="7" width="1" height="1" fill="#FFF0D7" />
          {/* Confident smirk */}
          <rect x="5" y="11" width="5" height="1" fill="#171329" />
          <rect x="10" y="10" width="2" height="1" fill="#171329" />
        </svg>
      );

    case '😡': // Angry — fiery crimson pixel face with furrowed brows, clenched teeth & steam
    default:
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Steam puffs */}
          <rect x="1" y="1" width="2" height="1" fill="#FFF0D7" />
          <rect x="13" y="1" width="2" height="1" fill="#FFF0D7" />
          {/* Fiery red head */}
          <rect x="4" y="2" width="8" height="1" fill="#FF5A5F" />
          <rect x="2" y="3" width="12" height="1" fill="#EF4444" />
          <rect x="1" y="4" width="14" height="9" fill="#EF4444" />
          <rect x="2" y="13" width="12" height="1" fill="#B91C1C" />
          <rect x="4" y="14" width="8" height="1" fill="#B91C1C" />
          {/* Furrowed V eyebrows */}
          <rect x="3" y="5" width="2" height="1" fill="#171329" />
          <rect x="5" y="6" width="2" height="1" fill="#171329" />
          <rect x="11" y="5" width="2" height="1" fill="#171329" />
          <rect x="9" y="6" width="2" height="1" fill="#171329" />
          {/* Glowing gold angry eyes */}
          <rect x="4" y="7" width="2" height="2" fill="#FFC66D" />
          <rect x="10" y="7" width="2" height="2" fill="#FFC66D" />
          <rect x="5" y="7" width="1" height="1" fill="#171329" />
          <rect x="10" y="7" width="1" height="1" fill="#171329" />
          {/* Gritted teeth */}
          <rect x="4" y="10" width="8" height="2" fill="#171329" />
          <rect x="5" y="10" width="2" height="2" fill="#FFF0D7" />
          <rect x="9" y="10" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
  }
};

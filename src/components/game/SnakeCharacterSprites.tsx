/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SnakeDirection } from '../../logic/snake';

export interface SnakeHeadSpriteProps {
  color: string;
  direction: SnakeDirection;
  showTongue?: boolean;
  isEating?: boolean;
  className?: string;
}

const DIRECTION_ROTATION: Record<SnakeDirection, number> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270,
};

/**
 * Lightweight 16x16 pixel-art snake head with directional eyes, subtle head highlight,
 * occasional flicking forked tongue (respects prefers-reduced-motion), and brief
 * eating reaction when collecting an apple.
 */
export const SnakeHeadSprite: React.FC<SnakeHeadSpriteProps> = ({
  color,
  direction,
  showTongue = false,
  isEating = false,
  className = 'w-full h-full',
}) => {
  const rotation = DIRECTION_ROTATION[direction];

  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={`${className} overflow-visible transition-transform duration-100 ${
        isEating ? 'motion-safe:scale-110' : ''
      }`}
      data-testid="snake-head-sprite"
      data-direction={direction}
      data-tongue={showTongue ? 'visible' : 'hidden'}
      data-eating={isEating ? 'true' : 'false'}
      aria-hidden="true"
    >
      <g transform={`rotate(${rotation} 8 8)`}>
        {/* Optional flicking forked tongue extending in movement direction */}
        {showTongue && !isEating && (
          <g className="motion-reduce:hidden" data-testid="snake-tongue">
            <rect x="15" y="7" width="2" height="2" fill="#FF5E7E" />
            <rect x="17" y="6" width="2" height="1" fill="#FF776E" />
            <rect x="17" y="9" width="2" height="1" fill="#FF776E" />
          </g>
        )}

        {/* Rounded pixel-art head silhouette */}
        <rect x="1" y="2" width="13" height="12" fill={color} />
        <rect x="2" y="1" width="11" height="14" fill={color} />
        <rect x="14" y="3" width="1" height="10" fill={color} />

        {/* Subtle pixel top highlight & bottom depth shading */}
        <rect x="3" y="2" width="8" height="2" fill="#FFFFFF" fillOpacity="0.28" />
        <rect x="2" y="13" width="10" height="1" fill="#120E24" fillOpacity="0.25" />

        {/* Expressive directional eyes */}
        <rect x="9" y="3" width="3" height="3" fill="#FFF8EC" />
        <rect x="10" y="4" width="2" height="2" fill="#171329" />
        <rect x="10" y="3" width="1" height="1" fill="#FFFFFF" />

        <rect x="9" y="10" width="3" height="3" fill="#FFF8EC" />
        <rect x="10" y="10" width="2" height="2" fill="#171329" />
        <rect x="10" y="10" width="1" height="1" fill="#FFFFFF" />

        {/* Brief eating animation mouth reaction on apple collection */}
        {isEating && (
          <g data-testid="snake-eating-mouth">
            <rect x="13" y="6" width="2" height="4" fill="#171329" />
            <rect x="13" y="7" width="1" height="2" fill="#FF776E" />
          </g>
        )}
      </g>
    </svg>
  );
};

export interface SnakeBodySpriteProps {
  color: string;
  isTail?: boolean;
  className?: string;
}

/**
 * Lightweight 16x16 pixel-art snake body/tail segment with subtle rounded corners
 * and retro arcade shading.
 */
export const SnakeBodySprite: React.FC<SnakeBodySpriteProps> = ({
  color,
  isTail = false,
  className = 'w-full h-full',
}) => {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      data-testid={isTail ? 'snake-tail-sprite' : 'snake-body-sprite'}
      aria-hidden="true"
    >
      {isTail ? (
        <>
          <rect x="3" y="3" width="10" height="10" fill={color} />
          <rect x="4" y="2" width="8" height="12" fill={color} />
          <rect x="2" y="4" width="12" height="8" fill={color} />
          <rect x="5" y="4" width="5" height="2" fill="#FFFFFF" fillOpacity="0.22" />
          <rect x="4" y="11" width="7" height="1" fill="#120E24" fillOpacity="0.22" />
        </>
      ) : (
        <>
          <rect x="1" y="2" width="14" height="12" fill={color} />
          <rect x="2" y="1" width="12" height="14" fill={color} />
          <rect x="3" y="2" width="9" height="2" fill="#FFFFFF" fillOpacity="0.22" />
          <rect x="3" y="12" width="10" height="2" fill="#120E24" fillOpacity="0.2" />
          <rect x="6" y="7" width="4" height="2" fill="#FFFFFF" fillOpacity="0.14" />
        </>
      )}
    </svg>
  );
};

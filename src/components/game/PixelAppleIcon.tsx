/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Custom 16×16 crisp-edge pixel-art apple for Pixel Afterglow Snake arenas.
 * Features a warm coral/red silhouette, bright pixel highlight, stem, and green leaf.
 */
export const PixelAppleIcon: React.FC<{ className?: string }> = ({
  className = 'w-full h-full',
}) => (
  <svg
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    className={className}
    aria-hidden="true"
  >
    {/* Stem */}
    <rect x="7" y="1" width="2" height="3" fill="#FFC66D" />
    {/* Green Leaf */}
    <rect x="9" y="2" width="3" height="2" fill="#84CC16" />
    <rect x="11" y="1" width="2" height="1" fill="#A3E635" />
    {/* Apple Silhouette (Warm Coral/Red) */}
    <rect x="4" y="4" width="3" height="1" fill="#FF5A5F" />
    <rect x="9" y="4" width="3" height="1" fill="#FF5A5F" />
    <rect x="3" y="5" width="10" height="2" fill="#FF5A5F" />
    <rect x="2" y="7" width="12" height="4" fill="#FF5A5F" />
    <rect x="3" y="11" width="10" height="2" fill="#E0434B" />
    <rect x="4" y="13" width="8" height="1" fill="#E0434B" />
    <rect x="5" y="14" width="2" height="1" fill="#C92E3A" />
    <rect x="9" y="14" width="2" height="1" fill="#C92E3A" />
    {/* Crisp Pixel Highlight */}
    <rect x="4" y="6" width="2" height="2" fill="#FFF0D7" />
    <rect x="4" y="8" width="1" height="1" fill="#FFD6CC" />
  </svg>
);

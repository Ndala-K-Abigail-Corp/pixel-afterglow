/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SnakeDirection } from './snake';

export interface TouchPoint {
  x: number;
  y: number;
}

/** Minimum distance in pixels before a touch movement registers as a directional swipe. */
export const MIN_SWIPE_DISTANCE_PX = 24;

/**
 * Pure swipe direction detector for Snake touch controls.
 * Returns null if movement is shorter than `minDistance` (preventing accidental turns).
 */
export function detectSwipeDirection(
  start: TouchPoint,
  end: TouchPoint,
  minDistance: number = MIN_SWIPE_DISTANCE_PX
): SnakeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < minDistance) {
    return null;
  }

  if (absX >= absY) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

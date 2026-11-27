/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ViewportPoint {
  x: number;
  y: number;
}

export const MEMORY_BOARD_MIN_ZOOM = 1;
export const MEMORY_BOARD_MAX_ZOOM = 2.75;
export const MEMORY_BOARD_ZOOM_STEP = 0.35;
export const MEMORY_BOARD_DOUBLE_TAP_ZOOM = 1.85;
export const DRAG_THRESHOLD_PX = 8;
export const DOUBLE_TAP_DELAY_MS = 280;
export const DOUBLE_TAP_MAX_DISTANCE_PX = 28;

/**
 * Clamps a zoom scale factor within the safe Memory Match board limits.
 */
export function clampZoom(
  scale: number,
  minZoom: number = MEMORY_BOARD_MIN_ZOOM,
  maxZoom: number = MEMORY_BOARD_MAX_ZOOM
): number {
  if (!Number.isFinite(scale)) return minZoom;
  const clamped = Math.min(maxZoom, Math.max(minZoom, scale));
  return Math.round(clamped * 100) / 100;
}

/**
 * Clamps pan offsets (for a center-origin transform) so the zoomed board never
 * leaves blank gaps or disappears outside the viewport, while keeping every edge
 * card reachable.
 */
export function clampPan(
  pan: ViewportPoint,
  scale: number,
  viewportWidth: number,
  viewportHeight: number
): ViewportPoint {
  if (scale <= MEMORY_BOARD_MIN_ZOOM || viewportWidth <= 0 || viewportHeight <= 0) {
    return { x: 0, y: 0 };
  }

  const maxPanX = ((scale - 1) * viewportWidth) / 2;
  const maxPanY = ((scale - 1) * viewportHeight) / 2;

  return {
    x: Math.round(Math.min(maxPanX, Math.max(-maxPanX, pan.x)) * 10) / 10,
    y: Math.round(Math.min(maxPanY, Math.max(-maxPanY, pan.y)) * 10) / 10,
  };
}

/**
 * Computes the next pan offset so zooming stays focused around `focalPoint`
 * (relative to the viewport container's top-left corner).
 */
export function computeZoomAroundPoint(params: {
  currentScale: number;
  nextScale: number;
  currentPan: ViewportPoint;
  focalPoint: ViewportPoint;
  viewportWidth: number;
  viewportHeight: number;
}): ViewportPoint {
  const { currentScale, nextScale, currentPan, focalPoint, viewportWidth, viewportHeight } = params;
  const safeNext = clampZoom(nextScale);
  if (safeNext <= MEMORY_BOARD_MIN_ZOOM || viewportWidth <= 0 || viewportHeight <= 0) {
    return { x: 0, y: 0 };
  }

  const ox = focalPoint.x - viewportWidth / 2;
  const oy = focalPoint.y - viewportHeight / 2;

  const worldX = (ox - currentPan.x) / currentScale;
  const worldY = (oy - currentPan.y) / currentScale;

  const rawNextPan: ViewportPoint = {
    x: ox - worldX * safeNext,
    y: oy - worldY * safeNext,
  };

  return clampPan(rawNextPan, safeNext, viewportWidth, viewportHeight);
}

/** Euclidean distance between two touch points. */
export function getTouchDistance(p1: ViewportPoint, p2: ViewportPoint): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Midpoint between two touch points. */
export function getTouchMidpoint(p1: ViewportPoint, p2: ViewportPoint): ViewportPoint {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Determines whether the subtle landscape rotation suggestion should be shown.
 * Only displayed for large boards (60+ cards) on mobile portrait viewports until dismissed.
 */
export function shouldShowRotateSuggestion(params: {
  totalCards: number;
  isPortrait: boolean;
  isMobileViewport: boolean;
  isDismissed: boolean;
}): boolean {
  return params.totalCards >= 60 && params.isPortrait && params.isMobileViewport && !params.isDismissed;
}

/**
 * Computes responsive grid classes for Multiplayer Memory Match boards (20, 40, 60, 100 cards),
 * adapting efficiently when a mobile device is rotated to landscape orientation.
 */
export function getMultiplayerMemoryGridClasses(params: {
  totalCards: number;
  isCompactLandscape: boolean;
}): {
  gridClasses: string;
  cardAspectClass: string;
  iconSizeClass: string;
} {
  const { totalCards, isCompactLandscape } = params;

  if (isCompactLandscape) {
    if (totalCards <= 20) {
      return {
        gridClasses: 'grid-cols-5 sm:grid-cols-10 w-full max-w-[780px] gap-1.5',
        cardAspectClass: 'aspect-square rounded-lg',
        iconSizeClass: 'w-6 h-6 sm:w-7 sm:h-7',
      };
    }
    if (totalCards <= 40) {
      return {
        gridClasses: 'grid-cols-8 sm:grid-cols-10 w-full max-w-[860px] gap-1',
        cardAspectClass: 'aspect-square rounded-lg',
        iconSizeClass: 'w-5 h-5 sm:w-6 sm:h-6',
      };
    }
    return {
      gridClasses: 'grid-cols-10 w-full max-w-[920px] gap-1',
      cardAspectClass: 'aspect-square rounded-md',
      iconSizeClass: 'w-5 h-5 sm:w-6 sm:h-6',
    };
  }

  // Portrait & Desktop default layout (preserves existing responsive breakpoints)
  const gridClasses =
    totalCards <= 20
      ? 'grid-cols-4 sm:grid-cols-5 w-full max-w-[380px] sm:max-w-[540px] gap-1.5 sm:gap-2.5'
      : totalCards <= 40
      ? 'grid-cols-5 sm:grid-cols-8 w-full max-w-[460px] sm:max-w-[740px] gap-1 sm:gap-2'
      : totalCards <= 60
      ? 'grid-cols-5 sm:grid-cols-8 md:grid-cols-10 w-full sm:max-w-[740px] md:max-w-[880px] gap-1 sm:gap-1.5'
      : 'grid-cols-5 sm:grid-cols-8 md:grid-cols-10 w-full sm:max-w-[760px] md:max-w-[920px] gap-1 sm:gap-1.5 lg:gap-2';

  const cardAspectClass =
    totalCards <= 20
      ? 'aspect-square rounded-lg sm:rounded-xl'
      : totalCards <= 40
      ? 'aspect-[5/4] min-h-[42px] sm:min-h-0 sm:aspect-square rounded-lg sm:rounded-xl'
      : 'aspect-[4/3] min-h-[42px] sm:min-h-0 sm:aspect-square rounded-md sm:rounded-xl';

  const iconSizeClass =
    totalCards <= 20
      ? 'w-8 h-8 sm:w-10 sm:h-10'
      : totalCards <= 40
      ? 'w-6 h-6 sm:w-8 sm:h-8'
      : 'w-6 h-6 sm:w-7 sm:h-7';

  return { gridClasses, cardAspectClass, iconSizeClass };
}

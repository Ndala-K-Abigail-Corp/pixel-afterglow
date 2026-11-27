/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Smartphone,
  X,
} from 'lucide-react';
import {
  MEMORY_BOARD_MIN_ZOOM,
  MEMORY_BOARD_MAX_ZOOM,
  MEMORY_BOARD_ZOOM_STEP,
  MEMORY_BOARD_DOUBLE_TAP_ZOOM,
  DRAG_THRESHOLD_PX,
  DOUBLE_TAP_DELAY_MS,
  DOUBLE_TAP_MAX_DISTANCE_PX,
  clampZoom,
  clampPan,
  computeZoomAroundPoint,
  getTouchDistance,
  getTouchMidpoint,
  shouldShowRotateSuggestion,
  type ViewportPoint,
} from '../../logic/memoryBoardViewport';

export interface ViewportOrientationState {
  width: number;
  height: number;
  isLandscape: boolean;
  isPortrait: boolean;
  isMobileViewport: boolean;
  isCompactLandscape: boolean;
}

/**
 * Tracks viewport orientation & compact landscape state without resetting game state.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useViewportOrientation(): ViewportOrientationState {
  const readMetrics = useCallback((): ViewportOrientationState => {
    if (typeof window === 'undefined') {
      return {
        width: 1024,
        height: 768,
        isLandscape: true,
        isPortrait: false,
        isMobileViewport: false,
        isCompactLandscape: false,
      };
    }
    const width = window.innerWidth || 1024;
    const height = window.innerHeight || 768;
    const isLandscape = width > height;
    const isPortrait = !isLandscape;
    const isMobileViewport = Math.min(width, height) < 768;
    const isCompactLandscape = isLandscape && height <= 540 && width <= 1024;

    return {
      width,
      height,
      isLandscape,
      isPortrait,
      isMobileViewport,
      isCompactLandscape,
    };
  }, []);

  const [metrics, setMetrics] = useState<ViewportOrientationState>(readMetrics);

  useEffect(() => {
    const update = () => setMetrics(readMetrics());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [readMetrics]);

  return metrics;
}

export interface MemoryBoardViewportProps {
  totalCards: number;
  /** Optional key that resets zoom/pan when a brand new round starts (not on orientation change). */
  resetKey?: string | number;
  /** Optional orientation metrics passed from parent to stay in sync. */
  orientation?: ViewportOrientationState;
  children: React.ReactNode;
}

/**
 * Interactive local-only zoom, pan, orientation-aware & optional fullscreen wrapper
 * for Memory Match boards (20, 40, 60, 100 cards).
 *
 * - Two-finger pinch-to-zoom focused around gesture midpoint
 * - Single-finger drag-to-pan when zoomed > 1x (normal page scroll at 1x)
 * - Double-tap zoom toggle
 * - Mouse wheel zoom (Ctrl/Cmd+wheel or while zoomed) & click-drag pan on desktop
 * - Suppresses accidental card clicks after pinch, pan, or double-tap gestures
 * - Strictly local presentation state (never synced via Firestore)
 */
export const MemoryBoardViewport: React.FC<MemoryBoardViewportProps> = ({
  totalCards,
  resetKey,
  orientation: externalOrientation,
  children,
}) => {
  const internalOrientation = useViewportOrientation();
  const orientation = externalOrientation ?? internalOrientation;

  const [scale, setScale] = useState<number>(MEMORY_BOARD_MIN_ZOOM);
  const [pan, setPan] = useState<ViewportPoint>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [rotateDismissed, setRotateDismissed] = useState<boolean>(false);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Refs synced with latest state for non-passive native touch listeners
  const scaleRef = useRef<number>(scale);
  const panRef = useRef<ViewportPoint>(pan);
  scaleRef.current = scale;
  panRef.current = pan;

  const suppressClickUntilRef = useRef<number>(0);
  const lastTapRef = useRef<{ time: number; point: ViewportPoint } | null>(null);
  const pinchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initialPan: ViewportPoint;
    initialMidpoint: ViewportPoint;
  } | null>(null);
  const touchPanRef = useRef<{
    startPoint: ViewportPoint;
    startPan: ViewportPoint;
    moved: boolean;
  } | null>(null);
  const mousePanRef = useRef<{
    startPoint: ViewportPoint;
    startPan: ViewportPoint;
    moved: boolean;
  } | null>(null);

  const supportsFullscreen =
    typeof document !== 'undefined' &&
    Boolean(
      document.fullscreenEnabled ||
        (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
    );

  // Reset zoom/pan when starting a fresh board/round
  useEffect(() => {
    setScale(MEMORY_BOARD_MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }, [resetKey]);

  // Re-clamp pan cleanly when viewport resizes or rotates (preserves active game & zoom)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPan((prev) => clampPan(prev, scaleRef.current, rect.width, rect.height));
  }, [orientation.width, orientation.height, isFullscreen]);

  // Listen to native fullscreenchange events
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;
      setIsFullscreen(Boolean(fsEl && shellRef.current && fsEl === shellRef.current));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const applyZoom = useCallback((nextScaleRaw: number, focalPoint?: ViewportPoint) => {
    const el = viewportRef.current;
    const rect = el?.getBoundingClientRect();
    const width = rect?.width || 360;
    const height = rect?.height || 360;
    const nextScale = clampZoom(nextScaleRaw);

    if (nextScale <= MEMORY_BOARD_MIN_ZOOM) {
      setScale(MEMORY_BOARD_MIN_ZOOM);
      setPan({ x: 0, y: 0 });
      return;
    }

    const focus = focalPoint ?? { x: width / 2, y: height / 2 };
    const nextPan = computeZoomAroundPoint({
      currentScale: scaleRef.current,
      nextScale,
      currentPan: panRef.current,
      focalPoint: focus,
      viewportWidth: width,
      viewportHeight: height,
    });

    setScale(nextScale);
    setPan(nextPan);
  }, []);

  const handleZoomIn = () => applyZoom(scale + MEMORY_BOARD_ZOOM_STEP);
  const handleZoomOut = () => applyZoom(scale - MEMORY_BOARD_ZOOM_STEP);
  const handleResetZoom = () => {
    setScale(MEMORY_BOARD_MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const handleToggleFullscreen = async () => {
    const target = shellRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (!target || typeof document === 'undefined') return;

    try {
      const docWithWebkit = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      if (document.fullscreenElement || docWithWebkit.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (docWithWebkit.webkitExitFullscreen) {
          await docWithWebkit.webkitExitFullscreen();
        }
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      }
    } catch {
      // Graceful fallback when browser denies or doesn't support fullscreen
    }
  };

  // Native non-passive touch listeners for smooth pinch-to-zoom, drag-to-pan, and double-tap zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const getLocalPoint = (clientX: number, clientY: number): ViewportPoint => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two-finger pinch gesture begins
        if (e.cancelable) e.preventDefault();
        const p1 = getLocalPoint(e.touches[0].clientX, e.touches[0].clientY);
        const p2 = getLocalPoint(e.touches[1].clientX, e.touches[1].clientY);
        pinchRef.current = {
          initialDistance: Math.max(10, getTouchDistance(p1, p2)),
          initialScale: scaleRef.current,
          initialPan: panRef.current,
          initialMidpoint: getTouchMidpoint(p1, p2),
        };
        touchPanRef.current = null;
        lastTapRef.current = null;
        suppressClickUntilRef.current = Date.now() + 400;
        return;
      }

      if (e.touches.length === 1) {
        pinchRef.current = null;
        const point = getLocalPoint(e.touches[0].clientX, e.touches[0].clientY);
        touchPanRef.current = {
          startPoint: point,
          startPan: panRef.current,
          moved: false,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        if (e.cancelable) e.preventDefault();
        const rect = el.getBoundingClientRect();
        const p1 = getLocalPoint(e.touches[0].clientX, e.touches[0].clientY);
        const p2 = getLocalPoint(e.touches[1].clientX, e.touches[1].clientY);
        const dist = getTouchDistance(p1, p2);
        const mid = getTouchMidpoint(p1, p2);

        const nextScale = clampZoom(
          pinchRef.current.initialScale * (dist / pinchRef.current.initialDistance)
        );

        const zoomedPan = computeZoomAroundPoint({
          currentScale: pinchRef.current.initialScale,
          nextScale,
          currentPan: pinchRef.current.initialPan,
          focalPoint: pinchRef.current.initialMidpoint,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
        });

        const shiftedPan = clampPan(
          {
            x: zoomedPan.x + (mid.x - pinchRef.current.initialMidpoint.x),
            y: zoomedPan.y + (mid.y - pinchRef.current.initialMidpoint.y),
          },
          nextScale,
          rect.width,
          rect.height
        );

        setScale(nextScale);
        setPan(shiftedPan);
        suppressClickUntilRef.current = Date.now() + 400;
        return;
      }

      if (e.touches.length === 1 && touchPanRef.current && scaleRef.current > MEMORY_BOARD_MIN_ZOOM) {
        const current = getLocalPoint(e.touches[0].clientX, e.touches[0].clientY);
        const dx = current.x - touchPanRef.current.startPoint.x;
        const dy = current.y - touchPanRef.current.startPoint.y;

        if (!touchPanRef.current.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          touchPanRef.current.moved = true;
          setIsDragging(true);
        }

        if (touchPanRef.current.moved) {
          if (e.cancelable) e.preventDefault();
          const rect = el.getBoundingClientRect();
          const nextPan = clampPan(
            {
              x: touchPanRef.current.startPan.x + dx,
              y: touchPanRef.current.startPan.y + dy,
            },
            scaleRef.current,
            rect.width,
            rect.height
          );
          setPan(nextPan);
          suppressClickUntilRef.current = Date.now() + 350;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchRef.current) {
        if (e.touches.length < 2) {
          pinchRef.current = null;
          suppressClickUntilRef.current = Date.now() + 350;
        }
        return;
      }

      const panState = touchPanRef.current;
      touchPanRef.current = null;
      setIsDragging(false);

      if (panState?.moved) {
        suppressClickUntilRef.current = Date.now() + 350;
        lastTapRef.current = null;
        return;
      }

      // Check for double-tap zoom gesture (only when tapping non-interactive or rapid double-tap)
      if (panState && e.changedTouches.length === 1) {
        const now = Date.now();
        const tapPoint = getLocalPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        const prevTap = lastTapRef.current;

        if (
          prevTap &&
          now - prevTap.time <= DOUBLE_TAP_DELAY_MS &&
          getTouchDistance(prevTap.point, tapPoint) <= DOUBLE_TAP_MAX_DISTANCE_PX
        ) {
          lastTapRef.current = null;
          suppressClickUntilRef.current = now + 400;
          if (e.cancelable) e.preventDefault();
          if (scaleRef.current > MEMORY_BOARD_MIN_ZOOM + 0.05) {
            setScale(MEMORY_BOARD_MIN_ZOOM);
            setPan({ x: 0, y: 0 });
          } else {
            applyZoom(MEMORY_BOARD_DOUBLE_TAP_ZOOM, tapPoint);
          }
          return;
        }

        lastTapRef.current = { time: now, point: tapPoint };
      }
    };

    const onTouchCancel = () => {
      pinchRef.current = null;
      touchPanRef.current = null;
      setIsDragging(false);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [applyZoom]);

  // Desktop mouse wheel zoom (Ctrl/Meta + wheel, or wheel while already zoomed)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && scale <= MEMORY_BOARD_MIN_ZOOM) {
      return;
    }
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const focalPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    applyZoom(scale + delta, focalPoint);
  };

  // Desktop click-and-drag panning when zoomed > 1x
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || scale <= MEMORY_BOARD_MIN_ZOOM) return;
    mousePanRef.current = {
      startPoint: { x: e.clientX, y: e.clientY },
      startPan: pan,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const state = mousePanRef.current;
    if (!state || scale <= MEMORY_BOARD_MIN_ZOOM) return;
    const dx = e.clientX - state.startPoint.x;
    const dy = e.clientY - state.startPoint.y;

    if (!state.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      state.moved = true;
      setIsDragging(true);
    }

    if (state.moved) {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPan(
        clampPan(
          { x: state.startPan.x + dx, y: state.startPan.y + dy },
          scale,
          rect.width,
          rect.height
        )
      );
      suppressClickUntilRef.current = Date.now() + 300;
    }
  };

  const handleMouseUpOrLeave = () => {
    if (mousePanRef.current?.moved) {
      suppressClickUntilRef.current = Date.now() + 300;
    }
    mousePanRef.current = null;
    setIsDragging(false);
  };

  // Capture-phase click guard: prevents pinch, pan, or double-tap from flipping a card
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const showRotateBanner = shouldShowRotateSuggestion({
    totalCards,
    isPortrait: orientation.isPortrait,
    isMobileViewport: orientation.isMobileViewport,
    isDismissed: rotateDismissed,
  });

  const zoomPercent = Math.round(scale * 100);
  const isZoomed = scale > MEMORY_BOARD_MIN_ZOOM;

  return (
    <div
      ref={shellRef}
      data-testid="memory-board-viewport-shell"
      data-orientation={orientation.isLandscape ? 'landscape' : 'portrait'}
      className={`w-full ${
        isFullscreen
          ? 'bg-[#171329] p-2 sm:p-4 flex flex-col justify-center overflow-auto'
          : ''
      }`}
    >
      {/* Subtle Rotation Suggestion for 60 & 100 card boards on mobile portrait */}
      {showRotateBanner && (
        <div
          role="status"
          data-testid="memory-rotate-suggestion"
          className="max-w-4xl mx-auto mb-2 px-3 py-1.5 rounded-xl bg-[#201A36] border border-[#FFC66D]/50 text-[#FFC66D] text-[11px] flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-3.5 h-3.5 shrink-0 rotate-90 text-[#56E0CB]" aria-hidden="true" />
            <span className="truncate">Rotate your device for a better playing experience.</span>
          </span>
          <button
            type="button"
            onClick={() => setRotateDismissed(true)}
            aria-label="Dismiss rotation suggestion"
            data-testid="memory-rotate-dismiss-btn"
            className="p-1 rounded-md hover:bg-[#292342] text-[#FFF0D7]/70 hover:text-[#FFF0D7] shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Compact Zoom & View Controls Bar (never covers cards or HUD) */}
      <div
        className="max-w-4xl mx-auto mb-2 flex flex-wrap items-center justify-between gap-2 px-1"
        data-testid="memory-zoom-controls"
      >
        <div className="inline-flex items-center gap-1 bg-[#201A36] border border-[#3D345F] rounded-xl p-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= MEMORY_BOARD_MIN_ZOOM}
            aria-label="Zoom out board"
            data-testid="memory-zoom-out-btn"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#171329] hover:bg-[#292342] border border-[#3D345F] text-[#56E0CB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
          >
            <ZoomOut className="w-4 h-4" aria-hidden="true" />
          </button>

          <span
            data-testid="memory-zoom-level"
            aria-live="polite"
            className="px-2 min-w-[48px] text-center font-mono text-xs font-bold text-[#FFC66D]"
          >
            {zoomPercent}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= MEMORY_BOARD_MAX_ZOOM}
            aria-label="Zoom in board"
            data-testid="memory-zoom-in-btn"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#171329] hover:bg-[#292342] border border-[#3D345F] text-[#56E0CB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
          >
            <ZoomIn className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            disabled={!isZoomed && pan.x === 0 && pan.y === 0}
            aria-label="Reset board zoom"
            data-testid="memory-zoom-reset-btn"
            className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg bg-[#171329] hover:bg-[#292342] border border-[#3D345F] text-[11px] font-semibold text-[#FFF0D7] hover:text-[#56E0CB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Fit</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] text-[#FFF0D7]/55">
            {isZoomed ? 'Drag board to pan' : 'Pinch or use + / − to zoom'}
          </span>

          {supportsFullscreen && (
            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
              data-testid="memory-fullscreen-btn"
              className="inline-flex items-center justify-center gap-1.5 px-2.5 h-9 rounded-xl bg-[#201A36] hover:bg-[#292342] border border-[#3D345F] hover:border-[#56E0CB]/60 text-[11px] font-semibold text-[#FFF0D7] hover:text-[#56E0CB] cursor-pointer touch-manipulation"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-[#56E0CB]" aria-hidden="true" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-[#56E0CB]" aria-hidden="true" />
              )}
              <span className="hidden xs:inline sm:inline">
                {isFullscreen ? 'Exit' : 'Fullscreen'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Zoom / Pan Viewport Container */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onClickCapture={handleClickCapture}
        data-testid="memory-board-viewport"
        data-zoom-scale={scale}
        className={`relative w-full overflow-hidden rounded-xl sm:rounded-2xl ${
          isZoomed
            ? isDragging
              ? 'cursor-grabbing touch-none'
              : 'cursor-grab touch-none'
            : 'touch-pan-y'
        }`}
      >
        <div
          data-testid="memory-board-transform-layer"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            transformOrigin: '50% 50%',
            transition: isDragging || pinchRef.current ? 'none' : 'transform 120ms ease-out',
            willChange: isZoomed ? 'transform' : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AudioProvider } from '../context/AudioContext';
import { Navbar } from '../components/common/Navbar';
import { Hero } from '../components/home/Hero';
import { SnakeGame } from '../components/game/SnakeGame';
import { MemoryBoardViewport } from '../components/game/MemoryBoardViewport';
import {
  detectSwipeDirection,
  MIN_SWIPE_DISTANCE_PX,
} from './snakeTouchControls';
import {
  clampZoom,
  clampPan,
  computeZoomAroundPoint,
  shouldShowRotateSuggestion,
  getMultiplayerMemoryGridClasses,
  MEMORY_BOARD_MIN_ZOOM,
  MEMORY_BOARD_MAX_ZOOM,
} from './memoryBoardViewport';
import type { UserProfile } from '../types/profile';

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getFirestoreDb: vi.fn(() => null),
  getFirebaseAuth: vi.fn(() => null),
}));

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const TEST_PROFILE: UserProfile = {
  uid: 'uid-mobile-test',
  username: 'MobilePlayer',
  usernameLower: 'mobileplayer',
  displayName: 'MobilePlayer',
  email: 'mobile@example.com',
  emailVerified: true,
  countryCode: 'ZM',
  countryName: 'Zambia',
  avatarId: 'star',
  authProvider: 'password',
  accountStatus: 'active',
  createdAt: Date.UTC(2026, 0, 1),
  updatedAt: Date.UTC(2026, 0, 1),
  stats: { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gameRecords: {} },
};

describe('Responsive Mobile Navigation & Public Homepage Simplification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      uid: null,
      profile: null,
      isSignedInAccount: false,
      isAdmin: false,
      setProfileState: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('simplifies Hero to one primary CTA without Explore Collection button', () => {
    const onLetsPlay = vi.fn();
    render(
      <AudioProvider>
        <Hero onLetsPlay={onLetsPlay} />
      </AudioProvider>
    );

    const playBtn = screen.getByRole('button', { name: /Let's Play/i });
    expect(playBtn).toBeTruthy();
    expect(screen.queryByText(/Explore Collection/i)).toBeNull();

    fireEvent.click(playBtn);
    expect(onLetsPlay).toHaveBeenCalledTimes(1);
  });

  it('removes Games and Rooms from desktop top nav while keeping single-line brand wordmark and hamburger menu', () => {
    render(
      <AudioProvider>
        <Navbar
          currentView="home"
          onNavigateHome={vi.fn()}
          onOpenGames={vi.fn()}
          onOpenArcadeRooms={vi.fn()}
          onOpenLeaderboard={vi.fn()}
          onOpenWhatsNew={vi.fn()}
          onOpenFeedback={vi.fn()}
          onOpenAbout={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AudioProvider>
    );

    // Brand text stays single-line (whitespace-nowrap)
    const brandText = screen.getByText('PIXEL AFTERGLOW');
    expect(brandText.className).toContain('whitespace-nowrap');

    // Desktop nav omits Games and Rooms
    const desktopNav = screen.getByTestId('desktop-navbar-nav');
    expect(desktopNav.textContent).not.toContain('Games');
    expect(desktopNav.textContent).not.toContain('Rooms');
    expect(screen.getByTestId('navbar-leaderboard-btn')).toBeTruthy();
    expect(screen.getByTestId('navbar-whats-new-btn')).toBeTruthy();
    expect(screen.getByTestId('navbar-feedback-btn')).toBeTruthy();

    // Hamburger button has proper ARIA attributes
    const hamburger = screen.getByTestId('navbar-hamburger-btn');
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
    expect(hamburger.getAttribute('aria-controls')).toBe('mobile-nav-drawer');
  });

  it('opens/closes the mobile drawer via hamburger, close button, Escape key, and destination clicks', () => {
    const onOpenLeaderboard = vi.fn();
    const onOpenArcadeRooms = vi.fn();
    render(
      <AudioProvider>
        <Navbar
          currentView="home"
          onNavigateHome={vi.fn()}
          onOpenGames={vi.fn()}
          onOpenArcadeRooms={onOpenArcadeRooms}
          onOpenLeaderboard={onOpenLeaderboard}
          onOpenWhatsNew={vi.fn()}
          onOpenFeedback={vi.fn()}
          onOpenAbout={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AudioProvider>
    );

    const hamburger = screen.getByTestId('navbar-hamburger-btn');
    fireEvent.click(hamburger);
    expect(hamburger.getAttribute('aria-expanded')).toBe('true');

    const drawer = screen.getByTestId('mobile-nav-drawer');
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');

    // Selecting destination closes menu and triggers callback
    fireEvent.click(screen.getByTestId('mobile-menu-leaderboard-btn'));
    expect(onOpenLeaderboard).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mobile-nav-drawer')).toBeNull();

    // Reopen and close with Escape
    fireEvent.click(hamburger);
    expect(screen.getByTestId('mobile-nav-drawer')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('mobile-nav-drawer')).toBeNull();

    // Reopen and close with visible X button
    fireEvent.click(hamburger);
    fireEvent.click(screen.getByTestId('mobile-nav-close-btn'));
    expect(screen.queryByTestId('mobile-nav-drawer')).toBeNull();
  });

  it('enforces navigation permissions: hides Admin Dashboard from players and shows it only to verified admins', () => {
    // Signed-in regular player
    mockUseAuth.mockReturnValue({
      uid: TEST_PROFILE.uid,
      profile: TEST_PROFILE,
      isSignedInAccount: true,
      isAdmin: false,
      setProfileState: vi.fn(),
    });

    const onOpenDashboard = vi.fn();
    const { rerender } = render(
      <AudioProvider>
        <Navbar
          currentView="home"
          onNavigateHome={vi.fn()}
          onOpenGames={vi.fn()}
          onOpenArcadeRooms={vi.fn()}
          onOpenLeaderboard={vi.fn()}
          onOpenWhatsNew={vi.fn()}
          onOpenFeedback={vi.fn()}
          onOpenDashboard={onOpenDashboard}
          onOpenAbout={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AudioProvider>
    );

    fireEvent.click(screen.getByTestId('navbar-hamburger-btn'));
    expect(screen.getByTestId('mobile-menu-achievements-btn')).toBeTruthy();
    expect(screen.getByTestId('mobile-menu-my-reports-btn')).toBeTruthy();
    expect(screen.getByTestId('mobile-menu-my-profile-btn')).toBeTruthy();
    expect(screen.getByTestId('mobile-menu-country-section')).toBeTruthy();
    expect(screen.getByTestId('mobile-menu-audio-btn')).toBeTruthy();
    expect(screen.queryByTestId('mobile-menu-admin-btn')).toBeNull();

    // Verified administrator
    mockUseAuth.mockReturnValue({
      uid: TEST_PROFILE.uid,
      profile: TEST_PROFILE,
      isSignedInAccount: true,
      isAdmin: true,
      setProfileState: vi.fn(),
    });
    rerender(
      <AudioProvider>
        <Navbar
          currentView="home"
          onNavigateHome={vi.fn()}
          onOpenGames={vi.fn()}
          onOpenArcadeRooms={vi.fn()}
          onOpenLeaderboard={vi.fn()}
          onOpenWhatsNew={vi.fn()}
          onOpenFeedback={vi.fn()}
          onOpenDashboard={onOpenDashboard}
          onOpenAbout={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AudioProvider>
    );

    const adminBtn = screen.getByTestId('mobile-menu-admin-btn');
    expect(adminBtn).toBeTruthy();
    fireEvent.click(adminBtn);
    expect(onOpenDashboard).toHaveBeenCalledWith('admin');
  });
});

describe('Snake Mobile Swipe Controls & Preserved Keyboard Behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      uid: null,
      profile: null,
      isSignedInAccount: false,
      isAdmin: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('detects all four swipe directions reliably and ignores taps below minimum threshold', () => {
    expect(detectSwipeDirection({ x: 100, y: 100 }, { x: 100, y: 100 - MIN_SWIPE_DISTANCE_PX })).toBe('up');
    expect(detectSwipeDirection({ x: 100, y: 100 }, { x: 100, y: 100 + MIN_SWIPE_DISTANCE_PX + 10 })).toBe('down');
    expect(detectSwipeDirection({ x: 100, y: 100 }, { x: 100 - MIN_SWIPE_DISTANCE_PX - 5, y: 105 })).toBe('left');
    expect(detectSwipeDirection({ x: 100, y: 100 }, { x: 100 + MIN_SWIPE_DISTANCE_PX + 5, y: 98 })).toBe('right');
    // Below threshold returns null
    expect(detectSwipeDirection({ x: 100, y: 100 }, { x: 112, y: 108 })).toBeNull();
  });

  it('removes visible mobile D-pad, supports board swipes, and preserves keyboard & pause/restart controls', () => {
    render(
      <AudioProvider>
        <SnakeGame onBackToHome={vi.fn()} />
      </AudioProvider>
    );

    // Start single-player game
    fireEvent.click(screen.getByTestId('snake-start-btn'));
    const grid = screen.getByTestId('snake-grid');
    expect(grid.className).toContain('touch-none');

    // Mobile directional arrow pad is removed
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move down' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move left' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move right' })).toBeNull();

    // Swipe down on the game board (valid turn from initial 'right' direction)
    fireEvent.touchStart(grid, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(grid, { touches: [{ clientX: 100, clientY: 150 }] });
    fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 100, clientY: 150 }] });

    // Pause & resume via keyboard Space works
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('PAUSED')).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByText('PAUSED')).toBeNull();

    // Restart button works cleanly
    fireEvent.click(screen.getByTestId('snake-restart-btn'));
    expect(screen.getByTestId('snake-score').textContent).toBe('0');
  });
});

describe('Memory Match Zoom, Pan, Orientation & Card Protection', () => {
  afterEach(() => {
    cleanup();
  });

  it('clamps zoom levels and pan boundaries accurately around focal points', () => {
    expect(clampZoom(0.4)).toBe(MEMORY_BOARD_MIN_ZOOM);
    expect(clampZoom(5)).toBe(MEMORY_BOARD_MAX_ZOOM);
    expect(clampZoom(1.75)).toBe(1.75);

    // At 1x zoom, pan is always (0, 0)
    expect(clampPan({ x: 100, y: -50 }, 1, 400, 400)).toEqual({ x: 0, y: 0 });

    // At 2x zoom on 400x400 viewport, max pan is +/-200
    expect(clampPan({ x: 350, y: -350 }, 2, 400, 400)).toEqual({ x: 200, y: -200 });

    // Zooming around top-left keeps pan clamped within valid range
    const nextPan = computeZoomAroundPoint({
      currentScale: 1,
      nextScale: 2,
      currentPan: { x: 0, y: 0 },
      focalPoint: { x: 50, y: 50 },
      viewportWidth: 400,
      viewportHeight: 400,
    });
    expect(nextPan.x).toBeGreaterThan(0);
    expect(nextPan.y).toBeGreaterThan(0);
    expect(nextPan.x).toBeLessThanOrEqual(200);
    expect(nextPan.y).toBeLessThanOrEqual(200);
  });

  it('adapts multiplayer grid classes for 20, 40, 60, and 100 cards in portrait vs compact landscape', () => {
    const portrait100 = getMultiplayerMemoryGridClasses({
      totalCards: 100,
      isCompactLandscape: false,
    });
    expect(portrait100.gridClasses).toContain('grid-cols-5');
    expect(portrait100.gridClasses).toContain('sm:grid-cols-8');
    expect(portrait100.gridClasses).toContain('md:grid-cols-10');

    const landscape100 = getMultiplayerMemoryGridClasses({
      totalCards: 100,
      isCompactLandscape: true,
    });
    expect(landscape100.gridClasses).toContain('grid-cols-10');

    const landscape40 = getMultiplayerMemoryGridClasses({
      totalCards: 40,
      isCompactLandscape: true,
    });
    expect(landscape40.gridClasses).toContain('grid-cols-8');
  });

  it('shows dismissible rotation suggestion only on mobile portrait for 60 and 100 cards and hides in landscape', () => {
    expect(
      shouldShowRotateSuggestion({
        totalCards: 60,
        isPortrait: true,
        isMobileViewport: true,
        isDismissed: false,
      })
    ).toBe(true);
    expect(
      shouldShowRotateSuggestion({
        totalCards: 40,
        isPortrait: true,
        isMobileViewport: true,
        isDismissed: false,
      })
    ).toBe(false);
    expect(
      shouldShowRotateSuggestion({
        totalCards: 100,
        isPortrait: false,
        isMobileViewport: true,
        isDismissed: false,
      })
    ).toBe(false);

    const onCardClick = vi.fn();
    const { rerender } = render(
      <MemoryBoardViewport
        totalCards={100}
        orientation={{
          width: 390,
          height: 844,
          isLandscape: false,
          isPortrait: true,
          isMobileViewport: true,
          isCompactLandscape: false,
        }}
      >
        <button type="button" onClick={onCardClick} data-testid="sample-card">
          Card 1
        </button>
      </MemoryBoardViewport>
    );

    expect(screen.getByTestId('memory-rotate-suggestion')).toBeTruthy();

    // Zoom in, zoom out, reset controls work and display percentage
    expect(screen.getByTestId('memory-zoom-level').textContent).toBe('100%');
    fireEvent.click(screen.getByTestId('memory-zoom-in-btn'));
    expect(screen.getByTestId('memory-zoom-level').textContent).toBe('135%');
    fireEvent.click(screen.getByTestId('memory-zoom-reset-btn'));
    expect(screen.getByTestId('memory-zoom-level').textContent).toBe('100%');

    // Normal card click works at any zoom level
    fireEvent.click(screen.getByTestId('sample-card'));
    expect(onCardClick).toHaveBeenCalledTimes(1);

    // Dragging while zoomed suppresses accidental card click
    fireEvent.click(screen.getByTestId('memory-zoom-in-btn'));
    const viewport = screen.getByTestId('memory-board-viewport');
    fireEvent.mouseDown(viewport, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(viewport);
    fireEvent.click(screen.getByTestId('sample-card'));
    expect(onCardClick).toHaveBeenCalledTimes(1); // Still 1 — accidental flip blocked!

    // Rotating to landscape automatically hides rotation suggestion
    rerender(
      <MemoryBoardViewport
        totalCards={100}
        orientation={{
          width: 844,
          height: 390,
          isLandscape: true,
          isPortrait: false,
          isMobileViewport: true,
          isCompactLandscape: true,
        }}
      >
        <button type="button" onClick={onCardClick} data-testid="sample-card">
          Card 1
        </button>
      </MemoryBoardViewport>
    );
    expect(screen.queryByTestId('memory-rotate-suggestion')).toBeNull();
  });
});

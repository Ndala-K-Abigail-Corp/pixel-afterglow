// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AudioProvider } from '../context/AudioContext';
import { calculateArcadeXpProgress } from './arcadeProgression';

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

import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import {
  DashboardSidebar,
  DashboardMobileBottomNav,
} from '../components/dashboard/DashboardNavigation';
import { getDashboardNavItems } from '../components/dashboard/dashboardNavItems';
import type { UserProfile } from '../types/profile';

const PROFILE = {
  uid: 'uid-layout',
  username: 'LayoutHero',
  countryCode: 'ZM',
  avatarId: 'star',
} as unknown as UserProfile;

function renderShell(section: string, isAdmin = false) {
  mockUseAuth.mockReturnValue({ isAdmin, uid: 'uid-layout', profile: PROFILE, isSignedInAccount: true });
  const onSelect = vi.fn();
  const onHome = vi.fn();
  const utils = render(
    <AudioProvider>
      <DashboardLayout
        scrollResetKey={section}
        sidebar={
          <DashboardSidebar
            activeSection={section as never}
            onSelectSection={onSelect}
            onVisitPublicHome={onHome}
            profile={PROFILE}
            xpProgress={calculateArcadeXpProgress(0)}
          />
        }
        mobileNav={
          <DashboardMobileBottomNav
            activeSection={section as never}
            onSelectSection={onSelect}
            onVisitPublicHome={onHome}
          />
        }
      >
        <div data-testid="page-content" style={{ height: 4000 }}>
          Long page
        </div>
      </DashboardLayout>
    </AudioProvider>
  );
  return { ...utils, onSelect, onHome };
}

describe('Shared Dashboard Layout & Sidebar Structure', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('locks the shell to the viewport and scrolls page content in a dedicated region', () => {
    renderShell('arcade-home');
    const shell = screen.getByTestId('authenticated-dashboard-shell');
    expect(shell.className).toContain('overflow-hidden');
    expect(shell.className).toContain('h-screen');

    const scrollRegion = screen.getByTestId('dashboard-scroll-region');
    expect(scrollRegion.tagName).toBe('MAIN');
    expect(scrollRegion.className).toContain('overflow-y-auto');
    expect(scrollRegion.className).toContain('min-h-0');
    expect(scrollRegion.contains(screen.getByTestId('page-content'))).toBe(true);
  });

  it('stretches the sidebar to full height with utilities anchored after a flexible nav', () => {
    renderShell('feedback');
    const sidebar = screen.getByTestId('dashboard-desktop-sidebar');
    expect(sidebar.className).toContain('h-full');
    expect(sidebar.className).toContain('flex-col');
    expect(sidebar.className).not.toContain('sticky');
    expect(sidebar.className).not.toContain('100dvh');

    const nav = screen.getByTestId('dashboard-sidebar-primary-nav');
    const utilities = screen.getByTestId('dashboard-sidebar-utilities');
    expect(nav.className).toContain('flex-1');
    expect(utilities.className).toContain('mt-auto');
    expect(utilities.className).toContain('shrink-0');
    // Utilities are the last block in the sidebar column
    expect(sidebar.lastElementChild).toBe(utilities);
    expect(utilities.textContent).toContain('Retro Audio');
    expect(utilities.textContent).toContain('Back to Homepage');
    expect(screen.getByTestId('sidebar-nav-feedback').getAttribute('aria-current')).toBe('page');
  });

  it('keeps Feedback and My Reports for players and shows Admin only to verified admins', () => {
    renderShell('arcade-home', false);
    expect(screen.getByTestId('sidebar-nav-feedback')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-my-reports')).toBeTruthy();
    expect(screen.queryByTestId('sidebar-nav-admin')).toBeNull();
    cleanup();

    renderShell('arcade-home', true);
    expect(screen.getByTestId('sidebar-nav-admin')).toBeTruthy();

    expect(getDashboardNavItems(false).some((i) => i.id === 'admin')).toBe(false);
    expect(getDashboardNavItems(true).some((i) => i.id === 'admin')).toBe(true);
  });

  it('exposes every remaining section plus utilities through the mobile More drawer', () => {
    const { onSelect, onHome } = renderShell('arcade-home', false);
    expect(screen.queryByTestId('dashboard-mobile-more-drawer')).toBeNull();

    fireEvent.click(screen.getByTestId('mobile-nav-more'));
    const drawer = screen.getByTestId('dashboard-mobile-more-drawer');
    expect(drawer).toBeTruthy();
    for (const id of ['achievements', 'whats-new', 'feedback', 'my-reports', 'my-profile']) {
      expect(screen.getByTestId(`mobile-more-nav-${id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('mobile-more-nav-admin')).toBeNull();

    fireEvent.click(screen.getByTestId('mobile-more-nav-my-reports'));
    expect(onSelect).toHaveBeenCalledWith('my-reports');
    expect(screen.queryByTestId('dashboard-mobile-more-drawer')).toBeNull();

    fireEvent.click(screen.getByTestId('mobile-nav-more'));
    fireEvent.click(screen.getByTestId('mobile-more-public-home-btn'));
    expect(onHome).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mobile-nav-more'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('dashboard-mobile-more-drawer')).toBeNull();
  });

  it('shows the Admin entry in the mobile drawer only for verified admins', () => {
    renderShell('arcade-home', true);
    fireEvent.click(screen.getByTestId('mobile-nav-more'));
    expect(screen.getByTestId('mobile-more-nav-admin')).toBeTruthy();
  });

  it('resets the content scroll position when switching dashboard sections', () => {
    const scrollToSpy = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollToSpy as unknown as typeof HTMLElement.prototype.scrollTo;
    try {
      const { rerender } = renderShell('arcade-home');
      const initialCalls = scrollToSpy.mock.calls.length;
      rerender(
        <AudioProvider>
          <DashboardLayout scrollResetKey="admin" sidebar={<div />}>
            <div />
          </DashboardLayout>
        </AudioProvider>
      );
      expect(scrollToSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });
});

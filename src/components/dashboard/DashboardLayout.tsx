/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

export interface DashboardLayoutProps {
  /** Persistent sidebar (rendered from the `md` breakpoint upwards). */
  sidebar: React.ReactNode;
  /** Compact header shown only below the `md` breakpoint. */
  mobileHeader?: React.ReactNode;
  /** Compact bottom navigation shown only below the `md` breakpoint. */
  mobileNav?: React.ReactNode;
  /** When this value changes, the content scroll region resets to the top. */
  scrollResetKey?: string;
  children: React.ReactNode;
}

/**
 * Shared authenticated dashboard application shell.
 *
 * Structure (viewport-locked app shell):
 *
 *   ┌──────────┬───────────────────────────────┐
 *   │ sidebar  │ mobile header (md:hidden)     │
 *   │ (h-full) ├───────────────────────────────┤
 *   │          │ <main> — the ONLY scroll      │
 *   │          │ region for dashboard content  │
 *   │          ├───────────────────────────────┤
 *   │          │ mobile bottom nav (md:hidden) │
 *   └──────────┴───────────────────────────────┘
 *
 * The shell is exactly one viewport tall and never scrolls itself, so the
 * sidebar always stretches to the full available height (with its utility
 * controls anchored at the bottom) regardless of how long a dashboard page is.
 * Page content scrolls independently inside `<main>`. This does not depend on
 * `position: sticky`, which is easily broken by ancestor overflow settings.
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  sidebar,
  mobileHeader,
  mobileNav,
  scrollResetKey,
  children,
}) => {
  const scrollRegionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = scrollRegionRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0 });
    }
  }, [scrollResetKey]);

  return (
    <div
      className="flex w-full max-w-full h-screen supports-[height:100dvh]:h-[100dvh] overflow-hidden"
      data-testid="authenticated-dashboard-shell"
    >
      {sidebar}

      <div className="flex-1 min-w-0 min-h-0 flex flex-col" data-testid="dashboard-content-column">
        {mobileHeader}

        <main
          ref={scrollRegionRef}
          className="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden overscroll-contain arcade-scrollbar pb-6 md:pb-8"
          data-testid="dashboard-scroll-region"
        >
          {children}
        </main>

        {mobileNav}
      </div>
    </div>
  );
};

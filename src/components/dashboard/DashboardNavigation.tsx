/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Home, ArrowLeft, Volume2, VolumeX, MoreHorizontal, X } from 'lucide-react';
import type { DashboardSection, ArcadeXpProgress } from '../../types/arcadePlatform';
import { PROFILE_AVATARS, type UserProfile } from '../../types/profile';
import { getCountryByCode } from '../../data/countries';
import { MemorySymbolIcon } from '../game/MemorySymbolIcon';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import { getDashboardNavItems, MOBILE_BAR_SECTION_IDS } from './dashboardNavItems';

interface DashboardNavigationProps {
  activeSection: DashboardSection;
  onSelectSection: (section: DashboardSection) => void;
  onVisitPublicHome: () => void;
  profile: UserProfile | null;
  xpProgress: ArcadeXpProgress;
  hasUnreadWhatsNew?: boolean;
}

const WhatsNewBadge: React.FC<{ testId: string }> = ({ testId }) => (
  <span
    data-testid={testId}
    className="px-1.5 py-0.5 rounded-full bg-[#FF776E] text-[#171329] text-[9px] font-extrabold uppercase shrink-0"
  >
    New
  </span>
);

/** Shared Retro Audio + Back to Homepage utility controls. */
const DashboardUtilityActions: React.FC<{
  onVisitPublicHome: () => void;
  homeButtonTestId: string;
}> = ({ onVisitPublicHome, homeButtonTestId }) => {
  const { isMuted, toggleMute, playClick } = useAudio();

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={!isMuted}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#201A36] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7]/85 hover:border-[#56E0CB] cursor-pointer"
      >
        <span className="flex items-center gap-2">
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-[#FF776E]" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#56E0CB]" />
          )}
          <span>Retro Audio</span>
        </span>
        <span className="font-mono text-[10px] text-[#56E0CB]">{isMuted ? 'MUTED' : 'ON'}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          playClick();
          onVisitPublicHome();
        }}
        data-testid={homeButtonTestId}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#56E0CB]/55 text-xs font-bold text-[#FFF0D7] hover:text-[#56E0CB] transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5 text-[#56E0CB]" />
        <Home className="w-3.5 h-3.5 text-[#FFC66D]" />
        <span>Back to Homepage</span>
      </button>
    </div>
  );
};

/**
 * Persistent desktop/tablet sidebar.
 *
 * Full-height vertical flex column: brand + player summary (fixed), primary
 * navigation (flexible, scrolls internally if the list ever outgrows short
 * screens), and utility actions anchored at the bottom. Height comes from the
 * parent `DashboardLayout` shell (`h-full`), never from a hardcoded value.
 */
export const DashboardSidebar: React.FC<DashboardNavigationProps> = ({
  activeSection,
  onSelectSection,
  onVisitPublicHome,
  profile,
  xpProgress,
  hasUnreadWhatsNew = false,
}) => {
  const { playClick } = useAudio();
  const { isAdmin } = useAuth();
  const country = profile ? getCountryByCode(profile.countryCode) : null;
  const navItems = getDashboardNavItems(isAdmin);

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-56 lg:w-60 shrink-0 h-full min-h-0 bg-[#1B1630] border-r border-[#2E264A]"
      aria-label="Arcade Dashboard Navigation"
      data-testid="dashboard-desktop-sidebar"
    >
      {/* Brand Header */}
      <div className="shrink-0 px-4 py-4 border-b border-[#2E264A]">
        <button
          type="button"
          onClick={() => {
            playClick();
            onSelectSection('arcade-home');
          }}
          className="flex items-center gap-2.5 text-left w-full group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-[#292342] border-2 border-[#56E0CB] flex items-center justify-center text-[#56E0CB] group-hover:border-[#FF776E] group-hover:text-[#FF776E] transition-colors shrink-0">
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor" aria-hidden="true">
              <rect x="7" y="1" width="2" height="4" />
              <rect x="7" y="11" width="2" height="4" />
              <rect x="1" y="7" width="4" height="2" />
              <rect x="11" y="7" width="4" height="2" />
              <rect x="5" y="5" width="6" height="6" />
              <rect x="6" y="6" width="4" height="4" fill="#171329" />
              <rect x="7" y="7" width="2" height="2" fill="#FFC66D" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="font-['Press_Start_2P'] text-[10px] text-[#FFF0D7] block leading-tight">
              PIXEL AFTERGLOW
            </span>
            <span className="text-[11px] text-[#56E0CB] block mt-1">Personal Arcade</span>
          </div>
        </button>
      </div>

      {/* Compact Player Summary */}
      {profile && (
        <button
          type="button"
          onClick={() => {
            playClick();
            onSelectSection('my-profile');
          }}
          className="shrink-0 mx-3 mt-3 p-2.5 rounded-xl bg-[#201A36] border border-[#3D345F] hover:border-[#56E0CB]/60 transition-colors flex items-center gap-2.5 text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-[#171329] border border-[#FFC66D]/60 flex items-center justify-center shrink-0">
            <MemorySymbolIcon
              symbolId={profile.avatarId}
              color={PROFILE_AVATARS.find((a) => a.id === profile.avatarId)?.color ?? '#FFC66D'}
              className="w-5 h-5"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#FFF0D7] truncate">{profile.username}</p>
            <p className="text-[11px] text-[#FFC66D] truncate">
              {country?.flag ?? '🌍'} Lvl {xpProgress.level} · {xpProgress.totalXp} XP
            </p>
          </div>
        </button>
      )}

      {/* Primary Navigation (flexible region between header and utilities) */}
      <nav
        className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-y-auto arcade-scrollbar"
        aria-label="Dashboard Sections"
        data-testid="dashboard-sidebar-primary-nav"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                playClick();
                onSelectSection(item.id);
              }}
              data-testid={`sidebar-nav-${item.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#292342] text-[#56E0CB] border border-[#56E0CB]/60'
                  : 'text-[#FFF0D7]/80 hover:text-[#FFF0D7] hover:bg-[#241E3D] border border-transparent'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#56E0CB]' : 'text-[#FFC66D]/80'}`}
              />
              <span className="truncate flex-1 text-left">{item.label}</span>
              {item.id === 'whats-new' && hasUnreadWhatsNew && (
                <WhatsNewBadge testId="sidebar-whats-new-badge" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Utility Actions anchored at the bottom */}
      <div
        className="shrink-0 mt-auto p-3 border-t border-[#2E264A]"
        data-testid="dashboard-sidebar-utilities"
      >
        <DashboardUtilityActions
          onVisitPublicHome={onVisitPublicHome}
          homeButtonTestId="sidebar-public-home-btn"
        />
      </div>
    </aside>
  );
};

interface MobileBottomNavProps {
  activeSection: DashboardSection;
  onSelectSection: (section: DashboardSection) => void;
  onVisitPublicHome?: () => void;
  hasUnreadWhatsNew?: boolean;
}

/**
 * Compact mobile navigation (below `md`): four pinned sections plus a "More"
 * drawer that exposes every remaining section (including Feedback, My Reports,
 * Admin for verified admins) and the Retro Audio / Back to Homepage utilities.
 * Rendered in normal document flow at the bottom of the dashboard shell.
 */
export const DashboardMobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  onSelectSection,
  onVisitPublicHome,
  hasUnreadWhatsNew = false,
}) => {
  const { playClick } = useAudio();
  const { isAdmin } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState<boolean>(false);

  const allItems = getDashboardNavItems(isAdmin);
  const barItems = allItems.filter((i) => MOBILE_BAR_SECTION_IDS.includes(i.id));
  const moreItems = allItems.filter((i) => !MOBILE_BAR_SECTION_IDS.includes(i.id));
  const isMoreSectionActive = moreItems.some((i) => i.id === activeSection);

  useEffect(() => {
    if (!isMoreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMoreOpen]);

  const handleSelect = (section: DashboardSection) => {
    playClick();
    setIsMoreOpen(false);
    onSelectSection(section);
  };

  return (
    <>
      <nav
        aria-label="Mobile Arcade Navigation"
        data-testid="dashboard-mobile-bottom-nav"
        className="md:hidden shrink-0 relative z-40 bg-[#1B1630] border-t border-[#3D345F] px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-lg mx-auto grid grid-cols-5 gap-1">
          {barItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                data-testid={`mobile-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg min-h-[44px] transition-colors cursor-pointer ${
                  isActive ? 'text-[#56E0CB] bg-[#292342]' : 'text-[#FFF0D7]/70 hover:text-[#FFF0D7]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-none truncate max-w-full">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              playClick();
              setIsMoreOpen((v) => !v);
            }}
            data-testid="mobile-nav-more"
            aria-expanded={isMoreOpen}
            aria-controls="dashboard-mobile-more-drawer"
            aria-haspopup="dialog"
            className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg min-h-[44px] transition-colors cursor-pointer ${
              isMoreOpen || isMoreSectionActive
                ? 'text-[#56E0CB] bg-[#292342]'
                : 'text-[#FFF0D7]/70 hover:text-[#FFF0D7]'
            }`}
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" />
            <span className="text-[10px] font-semibold leading-none">More</span>
            {hasUnreadWhatsNew && (
              <span
                className="absolute top-1 right-3 w-2 h-2 rounded-full bg-[#FF776E]"
                aria-label="New release available"
              />
            )}
          </button>
        </div>
      </nav>

      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50" data-testid="dashboard-mobile-more-overlay">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsMoreOpen(false)}
            className="absolute inset-0 w-full h-full bg-[#0D0A18]/70 cursor-default"
          />
          <div
            id="dashboard-mobile-more-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="More dashboard sections"
            data-testid="dashboard-mobile-more-drawer"
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] flex flex-col bg-[#1B1630] border-t-2 border-[#56E0CB]/60 rounded-t-2xl"
          >
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#2E264A]">
              <span className="font-['Press_Start_2P'] text-[10px] text-[#FFF0D7]">MORE</span>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-[#FFF0D7]/75 hover:text-[#FFF0D7] hover:bg-[#292342] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto arcade-scrollbar px-3 py-3 grid grid-cols-2 gap-2 content-start">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    data-testid={`mobile-more-nav-${item.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#292342] text-[#56E0CB] border border-[#56E0CB]/60'
                        : 'bg-[#201A36] text-[#FFF0D7]/85 border border-[#3D345F] hover:text-[#FFF0D7]'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#56E0CB]' : 'text-[#FFC66D]/80'}`}
                    />
                    <span className="truncate flex-1 text-left">{item.mobileLabel}</span>
                    {item.id === 'whats-new' && hasUnreadWhatsNew && (
                      <WhatsNewBadge testId="mobile-whats-new-badge" />
                    )}
                  </button>
                );
              })}
            </div>

            {onVisitPublicHome && (
              <div className="shrink-0 p-3 border-t border-[#2E264A] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <DashboardUtilityActions
                  onVisitPublicHome={() => {
                    setIsMoreOpen(false);
                    onVisitPublicHome();
                  }}
                  homeButtonTestId="mobile-more-public-home-btn"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

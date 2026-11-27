/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Gamepad2,
  Info,
  UserCircle2,
  DoorOpen,
  Trophy,
  Sparkles,
  MessageSquarePlus,
  Menu,
  X,
  Home,
  Award,
  FileText,
  Shield,
  Globe,
} from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import { getCountryByCode } from '../../data/countries';
import { updateUserProfileAtomic } from '../../logic/userProfile';
import type { DashboardSection } from '../../types/arcadePlatform';
import { CountrySelector } from '../auth/CountrySelector';
import { PWAInstallButton } from './PWAInstallButton';

export type AppView =
  | 'home'
  | 'dashboard'
  | 'leaderboard'
  | 'whats-new'
  | 'feedback'
  | 'arcade-rooms'
  | 'game-tic-tac-toe'
  | 'game-memory-match'
  | 'game-snake';

interface NavbarProps {
  currentView: AppView;
  onNavigateHome: () => void;
  onOpenGames: () => void;
  onOpenArcadeRooms?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenWhatsNew?: () => void;
  onOpenFeedback?: () => void;
  hasUnreadWhatsNew?: boolean;
  onOpenDashboard?: (section?: DashboardSection) => void;
  onOpenAbout: () => void;
  onOpenAuth?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigateHome,
  onOpenGames,
  onOpenArcadeRooms,
  onOpenLeaderboard,
  onOpenWhatsNew,
  onOpenFeedback,
  hasUnreadWhatsNew = false,
  onOpenDashboard,
  onOpenAbout,
  onOpenAuth,
}) => {
  const { isMuted, toggleMute, playClick } = useAudio();
  const { profile, isSignedInAccount, isAdmin, setProfileState } = useAuth();
  const country = profile ? getCountryByCode(profile.countryCode) : null;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isUpdatingCountry, setIsUpdatingCountry] = useState<boolean>(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close drawer on Escape and manage focus / body scroll lock
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMobileMenuOpen(false);
        hamburgerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const closeMenuAndRun = (action?: () => void) => {
    playClick();
    setIsMobileMenuOpen(false);
    action?.();
  };

  const handleCountryChange = async (nextCode: string) => {
    if (!profile || !isSignedInAccount || isUpdatingCountry || nextCode === profile.countryCode) {
      return;
    }
    setIsUpdatingCountry(true);
    try {
      const updated = await updateUserProfileAtomic({
        uid: profile.uid,
        username: profile.username,
        displayName: profile.displayName,
        countryCode: nextCode,
        avatarId: profile.avatarId,
      });
      setProfileState(updated);
    } catch {
      // Non-fatal: user can also edit country in My Profile
    } finally {
      setIsUpdatingCountry(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#171329]/95 backdrop-blur-md border-b border-[#292342] px-3 sm:px-6 md:px-8 py-2.5 sm:py-3.5 transition-colors">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Wordmark & Pixel Icon (never wraps letter by letter) */}
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              onNavigateHome();
            }}
            className="flex items-center gap-2 sm:gap-3 text-left group focus-visible:ring-2 focus-visible:ring-[#56E0CB] rounded-lg p-1 transition-transform shrink-0 cursor-pointer"
            aria-label="Pixel Afterglow Homepage"
          >
            {/* Custom Pixel Retro Badge */}
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#292342] border-2 border-[#56E0CB] flex items-center justify-center text-[#56E0CB] group-hover:border-[#FF776E] group-hover:text-[#FF776E] transition-colors shadow-sm shrink-0">
              <svg viewBox="0 0 16 16" className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" aria-hidden="true">
                {/* Retro 8-bit star/gem mark */}
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
              <span className="font-pixel text-[10px] sm:text-xs md:text-sm text-[#FFF0D7] tracking-tight group-hover:text-[#FFC66D] transition-colors block whitespace-nowrap leading-none">
                PIXEL AFTERGLOW
              </span>
              <span className="text-[11px] text-[#56E0CB] font-medium tracking-wide hidden sm:block mt-1 font-sans whitespace-nowrap">
                Old-school joy. New ways to play.
              </span>
            </div>
          </button>

          {/* Desktop Horizontal Navigation (md and up) */}
          <nav
            className="hidden md:flex items-center gap-1.5 lg:gap-2.5 shrink-0"
            aria-label="Main Navigation"
            data-testid="desktop-navbar-nav"
          >
            {/* Dedicated Arcade Leaderboard link */}
            {onOpenLeaderboard && (
              <button
                type="button"
                onClick={onOpenLeaderboard}
                data-testid="navbar-leaderboard-btn"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  currentView === 'leaderboard'
                    ? 'bg-[#FFC66D]/20 text-[#FFC66D] border border-[#FFC66D]/60'
                    : 'text-[#FFF0D7] hover:text-[#FFC66D] hover:bg-[#292342]'
                }`}
                aria-label="Open Arcade Leaderboard"
              >
                <Trophy className="w-4 h-4 text-[#FFC66D] shrink-0" />
                <span>Leaderboard</span>
              </button>
            )}

            {/* What's New release announcements link */}
            {onOpenWhatsNew && (
              <button
                type="button"
                onClick={onOpenWhatsNew}
                data-testid="navbar-whats-new-btn"
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  currentView === 'whats-new'
                    ? 'bg-[#56E0CB]/20 text-[#56E0CB] border border-[#56E0CB]/60'
                    : 'text-[#FFF0D7] hover:text-[#56E0CB] hover:bg-[#292342]'
                }`}
                aria-label="Open What's New"
              >
                <Sparkles className="w-4 h-4 text-[#56E0CB] shrink-0" />
                <span className="hidden lg:inline">What&apos;s New</span>
                {hasUnreadWhatsNew && (
                  <span
                    data-testid="navbar-whats-new-dot"
                    className="w-2 h-2 rounded-full bg-[#FF776E] shrink-0"
                    aria-label="New release available"
                  />
                )}
              </button>
            )}

            {/* Feedback & Bug Report link */}
            {onOpenFeedback && (
              <button
                type="button"
                onClick={onOpenFeedback}
                data-testid="navbar-feedback-btn"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  currentView === 'feedback'
                    ? 'bg-[#56E0CB]/20 text-[#56E0CB] border border-[#56E0CB]/60'
                    : 'text-[#FFF0D7] hover:text-[#56E0CB] hover:bg-[#292342]'
                }`}
                aria-label="Submit Feedback or Report a Bug"
              >
                <MessageSquarePlus className="w-4 h-4 text-[#56E0CB] shrink-0" />
                <span className="hidden xl:inline">Feedback</span>
              </button>
            )}

            {/* About link */}
            <button
              type="button"
              onClick={onOpenAbout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-[#FFF0D7] hover:text-[#FFC66D] hover:bg-[#292342] transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4 text-[#FFC66D] shrink-0" />
              <span className="hidden lg:inline">About</span>
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Authenticated Arcade Home shortcut when viewing public homepage */}
            {isSignedInAccount && profile && onOpenDashboard && (
              <button
                type="button"
                onClick={() => onOpenDashboard('arcade-home')}
                data-testid="navbar-arcade-home-btn"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#56E0CB]/15 text-[#56E0CB] border border-[#56E0CB]/60 hover:bg-[#56E0CB]/25 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Arcade Home</span>
              </button>
            )}

            {/* Account / Profile Button */}
            {onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                data-testid="navbar-account-btn"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isSignedInAccount && profile
                    ? 'bg-[#FFC66D]/15 text-[#FFC66D] border-[#FFC66D]/50 hover:bg-[#FFC66D]/25'
                    : 'bg-[#292342] text-[#FFF0D7] border-[#3D345F] hover:border-[#56E0CB] hover:text-[#56E0CB]'
                }`}
                aria-label={isSignedInAccount && profile ? `Open profile for ${profile.username}` : 'Sign in or create account'}
              >
                {isSignedInAccount && profile ? (
                  <>
                    <span aria-hidden="true">{country?.flag ?? '🎮'}</span>
                    <span className="max-w-[90px] truncate">{profile.username}</span>
                  </>
                ) : (
                  <>
                    <UserCircle2 className="w-4 h-4 text-[#FFC66D] shrink-0" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            )}

            {/* Sound Mute/Unmute Toggle Button */}
            <button
              type="button"
              onClick={toggleMute}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isMuted
                  ? 'bg-[#292342] text-[#FFF0D7]/75 border-[#3D345F] hover:text-[#FFF0D7] hover:border-[#56E0CB]'
                  : 'bg-[#56E0CB]/15 text-[#56E0CB] border-[#56E0CB] shadow-sm'
              }`}
              title={isMuted ? 'Sound is muted. Click to enable 8-bit sound effects.' : 'Sound is enabled. Click to mute.'}
              aria-label={isMuted ? 'Turn retro sound ON' : 'Turn retro sound OFF'}
              aria-pressed={!isMuted}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-[#FF776E] shrink-0" />
                  <span className="hidden lg:inline font-mono">MUTED</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-[#56E0CB] animate-pulse shrink-0" />
                  <span className="hidden lg:inline font-mono">SFX ON</span>
                </>
              )}
            </button>
          </nav>

          {/* Mobile Compact Action Bar (< md) */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => {
                playClick();
                setIsMobileMenuOpen((prev) => !prev);
              }}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              aria-haspopup="dialog"
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              data-testid="navbar-hamburger-btn"
              className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#56E0CB]/55 text-[#FFF0D7] hover:text-[#56E0CB] transition-colors cursor-pointer touch-manipulation"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-[#FF776E]" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5 text-[#56E0CB]" aria-hidden="true" />
              )}
              {hasUnreadWhatsNew && !isMobileMenuOpen && (
                <span
                  data-testid="mobile-hamburger-unread-dot"
                  className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF776E]"
                  aria-label="New release available"
                />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer (< md) */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex justify-end"
          data-testid="mobile-nav-overlay"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation menu"
            data-testid="mobile-nav-backdrop"
            onClick={() => {
              setIsMobileMenuOpen(false);
              hamburgerRef.current?.focus();
            }}
            className="absolute inset-0 w-full h-full bg-[#0D0A18]/75 backdrop-blur-[2px] cursor-default"
          />

          {/* Slide-over Drawer Panel */}
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
            data-testid="mobile-nav-drawer"
            className="relative z-10 w-[min(320px,88vw)] h-full bg-[#1B1630] border-l-2 border-[#56E0CB]/60 shadow-[-12px_0_36px_rgba(10,7,22,0.85)] flex flex-col overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3.5 border-b border-[#2E264A] bg-[#171329]">
              <span className="font-pixel text-[10px] text-[#FFC66D] whitespace-nowrap">
                PIXEL AFTERGLOW
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => {
                  playClick();
                  setIsMobileMenuOpen(false);
                  hamburgerRef.current?.focus();
                }}
                aria-label="Close navigation menu"
                data-testid="mobile-nav-close-btn"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#292342] border border-[#3D345F] text-[#FFF0D7] hover:text-[#FF776E] hover:border-[#FF776E]/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable Grouped Menu Content */}
            <nav
              aria-label="Mobile Navigation Destinations"
              className="flex-1 min-h-0 overflow-y-auto arcade-scrollbar px-3 py-3 space-y-4"
            >
              {/* Group 1: Arcade */}
              <div>
                <p className="px-2.5 mb-1.5 font-pixel text-[8px] text-[#56E0CB]/80 uppercase tracking-wider">
                  Arcade
                </p>
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      closeMenuAndRun(() => {
                        if (isSignedInAccount && profile && onOpenDashboard) {
                          onOpenDashboard('arcade-home');
                        } else {
                          onNavigateHome();
                        }
                      })
                    }
                    data-testid="mobile-menu-arcade-home-btn"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                      currentView === 'home' || currentView === 'dashboard'
                        ? 'bg-[#292342] text-[#56E0CB] border border-[#56E0CB]/50'
                        : 'text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent'
                    }`}
                  >
                    <Home className="w-4 h-4 text-[#56E0CB] shrink-0" />
                    <span className="truncate">Arcade Home</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      closeMenuAndRun(() => {
                        if (isSignedInAccount && profile && onOpenDashboard) {
                          onOpenDashboard('games');
                        } else {
                          onOpenGames();
                        }
                      })
                    }
                    data-testid="mobile-menu-games-btn"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent transition-colors cursor-pointer"
                  >
                    <Gamepad2 className="w-4 h-4 text-[#56E0CB] shrink-0" />
                    <span className="truncate">Games</span>
                  </button>

                  {onOpenArcadeRooms && (
                    <button
                      type="button"
                      onClick={() => closeMenuAndRun(onOpenArcadeRooms)}
                      data-testid="mobile-menu-arcade-rooms-btn"
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                        currentView === 'arcade-rooms'
                          ? 'bg-[#292342] text-[#56E0CB] border border-[#56E0CB]/50'
                          : 'text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent'
                      }`}
                    >
                      <DoorOpen className="w-4 h-4 text-[#56E0CB] shrink-0" />
                      <span className="truncate">Arcade Rooms</span>
                    </button>
                  )}

                  {onOpenLeaderboard && (
                    <button
                      type="button"
                      onClick={() => closeMenuAndRun(onOpenLeaderboard)}
                      data-testid="mobile-menu-leaderboard-btn"
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                        currentView === 'leaderboard'
                          ? 'bg-[#292342] text-[#FFC66D] border border-[#FFC66D]/50'
                          : 'text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent'
                      }`}
                    >
                      <Trophy className="w-4 h-4 text-[#FFC66D] shrink-0" />
                      <span className="truncate">Leaderboard</span>
                    </button>
                  )}

                  {isSignedInAccount && profile && onOpenDashboard && (
                    <button
                      type="button"
                      onClick={() => closeMenuAndRun(() => onOpenDashboard('achievements'))}
                      data-testid="mobile-menu-achievements-btn"
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent transition-colors cursor-pointer"
                    >
                      <Award className="w-4 h-4 text-[#FFC66D] shrink-0" />
                      <span className="truncate">Achievements</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Group 2: Community & Account */}
              <div>
                <p className="px-2.5 mb-1.5 font-pixel text-[8px] text-[#FFC66D]/80 uppercase tracking-wider">
                  Community &amp; Account
                </p>
                <div className="space-y-0.5">
                  {onOpenWhatsNew && (
                    <button
                      type="button"
                      onClick={() => closeMenuAndRun(onOpenWhatsNew)}
                      data-testid="mobile-menu-whats-new-btn"
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                        currentView === 'whats-new'
                          ? 'bg-[#292342] text-[#56E0CB] border border-[#56E0CB]/50'
                          : 'text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Sparkles className="w-4 h-4 text-[#56E0CB] shrink-0" />
                        <span className="truncate">What&apos;s New</span>
                      </span>
                      {hasUnreadWhatsNew && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#FF776E] text-[#171329] text-[9px] font-extrabold uppercase shrink-0">
                          New
                        </span>
                      )}
                    </button>
                  )}

                  {onOpenFeedback && (
                    <button
                      type="button"
                      onClick={() => closeMenuAndRun(onOpenFeedback)}
                      data-testid="mobile-menu-feedback-btn"
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                        currentView === 'feedback'
                          ? 'bg-[#292342] text-[#56E0CB] border border-[#56E0CB]/50'
                          : 'text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent'
                      }`}
                    >
                      <MessageSquarePlus className="w-4 h-4 text-[#56E0CB] shrink-0" />
                      <span className="truncate">Feedback &amp; Bug Reports</span>
                    </button>
                  )}

                  {isSignedInAccount && profile && onOpenDashboard && (
                    <>
                      <button
                        type="button"
                        onClick={() => closeMenuAndRun(() => onOpenDashboard('my-reports'))}
                        data-testid="mobile-menu-my-reports-btn"
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent transition-colors cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-[#FFC66D] shrink-0" />
                        <span className="truncate">My Reports</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => closeMenuAndRun(() => onOpenDashboard('my-profile'))}
                        data-testid="mobile-menu-my-profile-btn"
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent transition-colors cursor-pointer"
                      >
                        <UserCircle2 className="w-4 h-4 text-[#FFC66D] shrink-0" />
                        <span className="truncate">My Profile</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenAbout)}
                    data-testid="mobile-menu-about-btn"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#FFF0D7]/90 hover:bg-[#241E3D] border border-transparent transition-colors cursor-pointer"
                  >
                    <Info className="w-4 h-4 text-[#FFC66D] shrink-0" />
                    <span className="truncate">About</span>
                  </button>
                </div>
              </div>

              {/* Group 3: Administration (ONLY for verified administrators) */}
              {isAdmin && isSignedInAccount && profile && onOpenDashboard && (
                <div data-testid="mobile-menu-admin-section">
                  <p className="px-2.5 mb-1.5 font-pixel text-[8px] text-[#FF776E]/90 uppercase tracking-wider">
                    Administration
                  </p>
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(() => onOpenDashboard('admin'))}
                    data-testid="mobile-menu-admin-btn"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#FF776E] bg-[#FF776E]/10 hover:bg-[#FF776E]/20 border border-[#FF776E]/40 transition-colors cursor-pointer"
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span className="truncate">Admin Dashboard</span>
                  </button>
                </div>
              )}
            </nav>

            {/* Drawer Footer: Country, Retro Audio & Auth Controls */}
            <div className="shrink-0 p-3 border-t border-[#2E264A] bg-[#171329] space-y-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {/* Country Selector (signed-in players can switch country directly) */}
              {isSignedInAccount && profile && (
                <div className="space-y-1" data-testid="mobile-menu-country-section">
                  <label
                    htmlFor="mobile-nav-country-selector"
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#FFF0D7]/65 px-1"
                  >
                    <Globe className="w-3 h-3 text-[#56E0CB]" />
                    <span>Country</span>
                  </label>
                  <CountrySelector
                    id="mobile-nav-country-selector"
                    value={profile.countryCode}
                    onChange={(code) => void handleCountryChange(code)}
                    disabled={isUpdatingCountry}
                    required={false}
                  />
                </div>
              )}

              {/* Retro Audio Toggle */}
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={!isMuted}
                data-testid="mobile-menu-audio-btn"
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#201A36] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] hover:border-[#56E0CB] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-[#FF776E]" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-[#56E0CB]" />
                  )}
                  <span>Retro Audio</span>
                </span>
                <span className={`font-mono text-[10px] ${isMuted ? 'text-[#FF776E]' : 'text-[#56E0CB]'}`}>
                  {isMuted ? 'MUTED' : 'SFX ON'}
                </span>
              </button>

              {/* Auth Action */}
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => closeMenuAndRun(onOpenAuth)}
                  data-testid="mobile-menu-auth-btn"
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isSignedInAccount && profile
                      ? 'bg-[#FFC66D]/15 text-[#FFC66D] border-[#FFC66D]/50 hover:bg-[#FFC66D]/25'
                      : 'bg-[#56E0CB] text-[#171329] border-[#56E0CB] hover:bg-[#6eead8]'
                  }`}
                >
                  {isSignedInAccount && profile ? (
                    <>
                      <span aria-hidden="true">{country?.flag ?? '🎮'}</span>
                      <span className="truncate">{profile.username} · Account</span>
                    </>
                  ) : (
                    <>
                      <UserCircle2 className="w-4 h-4 shrink-0" />
                      <span>Sign In / Create Account</span>
                    </>
                  )}
                </button>
              )}

              <div className="flex justify-center">
                <PWAInstallButton />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

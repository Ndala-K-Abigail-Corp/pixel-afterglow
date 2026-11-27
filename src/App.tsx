/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { DoorOpen, MessageSquarePlus } from 'lucide-react';
import { Navbar, AppView } from './components/common/Navbar';
import { Hero } from './components/home/Hero';
import { GameCollection } from './components/home/GameCollection';
import { BrandPersonality } from './components/home/BrandPersonality';
import { Footer } from './components/common/Footer';
import type { ActiveArcadeLaunchContext } from './components/arcade/ArcadeRoomsView';
import { AboutModal } from './components/common/AboutModal';
import { AuthProfileModal } from './components/auth/AuthProfileModal';
import { AudioProvider } from './context/AudioContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  DashboardSidebar,
  DashboardMobileBottomNav,
} from './components/dashboard/DashboardNavigation';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import type { FeedbackAffectedArea } from './types/feedback';
import { hasUnreadRelease } from './data/releases';
import { usePlayerArcadeData } from './hooks/usePlayerArcadeData';
import type { DashboardSection } from './types/arcadePlatform';

// Route/view-level lazy loading to keep the initial homepage bundle fast
const TicTacToeGame = lazy(() =>
  import('./components/game/TicTacToeGame').then((m) => ({ default: m.TicTacToeGame }))
);
const MemoryMatchGame = lazy(() =>
  import('./components/game/MemoryMatchGame').then((m) => ({ default: m.MemoryMatchGame }))
);
const SnakeGame = lazy(() =>
  import('./components/game/SnakeGame').then((m) => ({ default: m.SnakeGame }))
);
const ArcadeRoomsView = lazy(() =>
  import('./components/arcade/ArcadeRoomsView').then((m) => ({ default: m.ArcadeRoomsView }))
);
const ArcadeHomeView = lazy(() =>
  import('./components/dashboard/ArcadeHomeView').then((m) => ({ default: m.ArcadeHomeView }))
);
const DashboardGamesView = lazy(() =>
  import('./components/dashboard/DashboardGamesView').then((m) => ({ default: m.DashboardGamesView }))
);
const AchievementsView = lazy(() =>
  import('./components/dashboard/AchievementsView').then((m) => ({ default: m.AchievementsView }))
);
const LeaderboardsView = lazy(() =>
  import('./components/dashboard/LeaderboardsView').then((m) => ({ default: m.LeaderboardsView }))
);
const MyProfileView = lazy(() =>
  import('./components/dashboard/MyProfileView').then((m) => ({ default: m.MyProfileView }))
);
const WhatsNewView = lazy(() =>
  import('./components/common/WhatsNewView').then((m) => ({ default: m.WhatsNewView }))
);
const FeedbackFormView = lazy(() =>
  import('./components/feedback/FeedbackFormView').then((m) => ({ default: m.FeedbackFormView }))
);
const MyReportsView = lazy(() =>
  import('./components/feedback/MyReportsView').then((m) => ({ default: m.MyReportsView }))
);
const AdminDashboardView = lazy(() =>
  import('./components/admin/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);

const RouteLoadingFallback: React.FC = () => (
  <div
    className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3"
    role="status"
    aria-live="polite"
    data-testid="route-loading-fallback"
  >
    <div className="w-8 h-8 rounded-lg border-2 border-[#56E0CB] border-t-transparent animate-spin" />
    <p className="font-['Press_Start_2P'] text-[10px] text-[#56E0CB]">LOADING ARCADE…</p>
  </div>
);
import {
  parseRoomInvitationFromUrl,
  clearRoomInvitationFromUrl,
  detectActiveRoomSessionGameType,
} from './logic/multiplayerRoom';
import {
  parseArcadeRoomInvitationFromUrl,
  clearArcadeRoomInvitationFromUrl,
} from './logic/arcadeRooms';

function AppShell() {
  const { isSignedInAccount, profile, needsProfileCompletion } = useAuth();
  const arcadeData = usePlayerArcadeData();

  const [arcadeInviteCode, setArcadeInviteCode] = useState<string | null>(() =>
    parseArcadeRoomInvitationFromUrl()
  );
  const [activeArcadeContext, setActiveArcadeContext] =
    useState<ActiveArcadeLaunchContext | null>(null);
  const [returnToArcadeRoomId, setReturnToArcadeRoomId] = useState<string | null>(null);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('arcade-home');

  const [currentView, setCurrentView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'leaderboard') {
        return 'leaderboard';
      }
    }
    if (parseArcadeRoomInvitationFromUrl()) {
      return 'arcade-rooms';
    }
    const invitation = parseRoomInvitationFromUrl();
    if (invitation) {
      return invitation.gameType === 'tic-tac-toe'
        ? 'game-tic-tac-toe'
        : 'game-memory-match';
    }
    const activeSessionGame = detectActiveRoomSessionGameType();
    if (activeSessionGame) {
      return activeSessionGame === 'tic-tac-toe'
        ? 'game-tic-tac-toe'
        : 'game-memory-match';
    }
    return 'home';
  });

  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [feedbackContext, setFeedbackContext] = useState<{
    area: FeedbackAffectedArea;
    gameType?: 'memory-match' | 'tic-tac-toe' | 'snake' | null;
  }>({ area: 'other', gameType: null });
  const [hasUnreadWhatsNew, setHasUnreadWhatsNew] = useState<boolean>(() =>
    hasUnreadRelease(profile?.uid ?? null)
  );

  useEffect(() => {
    setHasUnreadWhatsNew(hasUnreadRelease(profile?.uid ?? null));
  }, [profile?.uid]);

  // Track whether the registered user explicitly chose to visit the public homepage
  const optedIntoPublicHomeRef = useRef<boolean>(false);
  const prevSignedInRef = useRef<boolean>(false);

  useEffect(() => {
    if (needsProfileCompletion) {
      setIsAuthModalOpen(true);
    }
  }, [needsProfileCompletion]);

  // Default landing screen after registered user successfully signs in -> Arcade Home
  useEffect(() => {
    const justSignedIn = isSignedInAccount && Boolean(profile) && !prevSignedInRef.current;
    prevSignedInRef.current = Boolean(isSignedInAccount && profile);

    if (justSignedIn && currentView === 'home' && !optedIntoPublicHomeRef.current) {
      setDashboardSection('arcade-home');
      setCurrentView('dashboard');
      setIsAuthModalOpen(false);
    }

    // If user signs out while on dashboard, return cleanly to public homepage
    if (!isSignedInAccount && currentView === 'dashboard') {
      optedIntoPublicHomeRef.current = false;
      setCurrentView('home');
    }
  }, [isSignedInAccount, profile, currentView]);

  // Sync window scroll when switching views
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentView, dashboardSection]);

  // Listen for browser back/forward navigation with invitation URLs
  useEffect(() => {
    const handlePopState = () => {
      const arcCode = parseArcadeRoomInvitationFromUrl();
      if (arcCode) {
        setArcadeInviteCode(arcCode);
        setCurrentView('arcade-rooms');
        return;
      }
      const invitation = parseRoomInvitationFromUrl();
      if (invitation) {
        setCurrentView(
          invitation.gameType === 'tic-tac-toe'
            ? 'game-tic-tac-toe'
            : 'game-memory-match'
        );
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleStartGame = (gameId: string) => {
    if (gameId === 'tic-tac-toe') {
      setCurrentView('game-tic-tac-toe');
    } else if (gameId === 'memory-match') {
      setCurrentView('game-memory-match');
    } else if (gameId === 'snake') {
      setCurrentView('game-snake');
    }
  };

  const handleNavigatePublicHome = () => {
    clearRoomInvitationFromUrl();
    clearArcadeRoomInvitationFromUrl();
    setActiveArcadeContext(null);
    setReturnToArcadeRoomId(null);
    optedIntoPublicHomeRef.current = true;
    setCurrentView('home');
  };

  const handleNavigateBackFromGame = () => {
    clearRoomInvitationFromUrl();
    setActiveArcadeContext(null);
    if (isSignedInAccount && profile) {
      setCurrentView('dashboard');
      void arcadeData.refresh();
    } else {
      setCurrentView('home');
    }
  };

  const handleOpenDashboard = (section: DashboardSection = 'arcade-home') => {
    if (!isSignedInAccount || !profile) {
      setIsAuthModalOpen(true);
      return;
    }
    optedIntoPublicHomeRef.current = false;
    setDashboardSection(section);
    setCurrentView('dashboard');
  };

  const handleOpenFeedback = (
    area: FeedbackAffectedArea = 'other',
    gameType: 'memory-match' | 'tic-tac-toe' | 'snake' | null = null
  ) => {
    setFeedbackContext({ area, gameType });
    if (isSignedInAccount && profile) {
      optedIntoPublicHomeRef.current = false;
      setDashboardSection('feedback');
      setCurrentView('dashboard');
    } else {
      setCurrentView('feedback');
    }
  };

  const handleOpenArcadeRooms = () => {
    setReturnToArcadeRoomId(activeArcadeContext?.arcadeRoomId ?? null);
    if (isSignedInAccount && profile) {
      setDashboardSection('my-rooms');
      setCurrentView('dashboard');
    } else {
      setCurrentView('arcade-rooms');
    }
  };

  const handleLaunchArcadeGameSession = (ctx: ActiveArcadeLaunchContext) => {
    setActiveArcadeContext(ctx);
    setReturnToArcadeRoomId(ctx.arcadeRoomId);
    setCurrentView(
      ctx.gameType === 'tic-tac-toe'
        ? 'game-tic-tac-toe'
        : ctx.gameType === 'snake'
          ? 'game-snake'
          : 'game-memory-match'
    );
  };

  const handleReturnToArcadeRoom = () => {
    if (!activeArcadeContext) {
      handleOpenArcadeRooms();
      return;
    }
    setReturnToArcadeRoomId(activeArcadeContext.arcadeRoomId);
    setActiveArcadeContext(null);
    if (isSignedInAccount && profile) {
      setDashboardSection('my-rooms');
      setCurrentView('dashboard');
    } else {
      setCurrentView('arcade-rooms');
    }
  };

  const handleScrollToGames = () => {
    if (currentView !== 'home') {
      optedIntoPublicHomeRef.current = true;
      setCurrentView('home');
      setTimeout(() => {
        const el = document.getElementById('game-collection');
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById('game-collection');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isAuthenticatedDashboardView =
    currentView === 'dashboard' && isSignedInAccount && Boolean(profile);

  const handleSelectDashboardSection = (sec: DashboardSection) => {
    setReturnToArcadeRoomId(null);
    setDashboardSection(sec);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#171329] text-[#FFF0D7] flex flex-col font-sans selection:bg-[#FF776E] selection:text-[#171329]">
      {/* Authenticated Dashboard Application Layout (no public footer) */}
      {isAuthenticatedDashboardView && profile ? (
        <DashboardLayout
          scrollResetKey={dashboardSection}
          sidebar={
            <DashboardSidebar
              activeSection={dashboardSection}
              onSelectSection={handleSelectDashboardSection}
              onVisitPublicHome={handleNavigatePublicHome}
              profile={profile}
              xpProgress={arcadeData.xpProgress}
              hasUnreadWhatsNew={hasUnreadWhatsNew}
            />
          }
          mobileHeader={
            /* Compact Mobile Top Brand Header (outside the scroll region, always visible) */
            <header className="md:hidden shrink-0 z-30 bg-[#1B1630] border-b border-[#2E264A] px-3 py-2.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleSelectDashboardSection('arcade-home')}
                className="font-['Press_Start_2P'] text-[10px] text-[#FFF0D7] truncate cursor-pointer"
              >
                PIXEL AFTERGLOW
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleNavigatePublicHome}
                  data-testid="mobile-back-to-homepage-btn"
                  className="px-2 py-1 rounded-lg bg-[#292342] border border-[#56E0CB]/50 text-[10px] font-semibold text-[#56E0CB] cursor-pointer"
                >
                  Homepage
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDashboardSection('achievements')}
                  className="px-2 py-1 rounded-lg bg-[#292342] border border-[#FFC66D]/50 text-[10px] font-bold text-[#FFC66D] cursor-pointer"
                >
                  Lvl {arcadeData.xpProgress.level}
                </button>
              </div>
            </header>
          }
          mobileNav={
            <DashboardMobileBottomNav
              activeSection={dashboardSection}
              onSelectSection={handleSelectDashboardSection}
              onVisitPublicHome={handleNavigatePublicHome}
              hasUnreadWhatsNew={hasUnreadWhatsNew}
            />
          }
        >
          <Suspense fallback={<RouteLoadingFallback />}>
              {dashboardSection === 'arcade-home' && (
                <ArcadeHomeView
                  profile={profile}
                  rooms={arcadeData.rooms}
                  gameHistory={arcadeData.gameHistory}
                  multiplayerStats={arcadeData.multiplayerStats}
                  privateRecords={arcadeData.privateRecords}
                  xpProgress={arcadeData.xpProgress}
                  achievements={arcadeData.achievements}
                  onNavigateSection={(sec) => setDashboardSection(sec)}
                  onOpenArcadeRoom={(roomId) => {
                    setReturnToArcadeRoomId(roomId);
                    setDashboardSection('my-rooms');
                  }}
                  onCreateArcadeRoom={() => {
                    setReturnToArcadeRoomId(null);
                    setDashboardSection('my-rooms');
                  }}
                  onPlayGame={(gameId) => handleStartGame(gameId)}
                />
              )}

              {dashboardSection === 'games' && (
                <DashboardGamesView onPlayGame={(gameId) => handleStartGame(gameId)} />
              )}

              {dashboardSection === 'my-rooms' && (
                <ArcadeRoomsView
                  onBackToHome={() => setDashboardSection('arcade-home')}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                  onPlayTemporaryGame={(gameType) => handleStartGame(gameType)}
                  onLaunchGameSession={handleLaunchArcadeGameSession}
                  initialInviteCode={arcadeInviteCode}
                  initialOpenRoomId={returnToArcadeRoomId}
                  onClearInviteCode={() => {
                    clearArcadeRoomInvitationFromUrl();
                    setArcadeInviteCode(null);
                  }}
                />
              )}

              {dashboardSection === 'leaderboards' && (
                <LeaderboardsView
                  profile={profile}
                  multiplayerStats={arcadeData.multiplayerStats}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                />
              )}

              {dashboardSection === 'achievements' && (
                <AchievementsView achievements={arcadeData.achievements} />
              )}

              {dashboardSection === 'whats-new' && (
                <WhatsNewView onAcknowledged={() => setHasUnreadWhatsNew(false)} />
              )}

              {dashboardSection === 'feedback' && (
                <FeedbackFormView
                  initialArea={feedbackContext.area}
                  initialGameType={feedbackContext.gameType ?? null}
                  currentRoute="/dashboard/feedback"
                  onViewMyReports={() => setDashboardSection('my-reports')}
                />
              )}

              {dashboardSection === 'my-reports' && (
                <MyReportsView
                  onNewReport={() => {
                    setFeedbackContext({ area: 'other', gameType: null });
                    setDashboardSection('feedback');
                  }}
                />
              )}

              {dashboardSection === 'admin' && <AdminDashboardView />}

              {dashboardSection === 'my-profile' && (
                <MyProfileView
                  profile={profile}
                  xpProgress={arcadeData.xpProgress}
                  multiplayerStats={arcadeData.multiplayerStats}
                  privateRecords={arcadeData.privateRecords}
                  achievements={arcadeData.achievements}
                  gameHistory={arcadeData.gameHistory}
                  onSignedOut={handleNavigatePublicHome}
                />
              )}
          </Suspense>
        </DashboardLayout>
      ) : (
        <>
          {/* Public & Game Navigation Bar */}
          <Navbar
            currentView={currentView}
            onNavigateHome={handleNavigatePublicHome}
            onOpenGames={handleScrollToGames}
            onOpenArcadeRooms={handleOpenArcadeRooms}
            onOpenLeaderboard={() => {
              if (isSignedInAccount && profile) {
                handleOpenDashboard('leaderboards');
              } else {
                setCurrentView('leaderboard');
              }
            }}
            onOpenWhatsNew={() => {
              if (isSignedInAccount && profile) {
                handleOpenDashboard('whats-new');
              } else {
                setCurrentView('whats-new');
              }
            }}
            onOpenFeedback={() => handleOpenFeedback('other', null)}
            hasUnreadWhatsNew={hasUnreadWhatsNew}
            onOpenDashboard={() => handleOpenDashboard('arcade-home')}
            onOpenAbout={() => setIsAboutOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />

          {/* Persistent Arcade Room Return Strip when playing a Level-2 Game Session */}
          {activeArcadeContext &&
            (currentView === 'game-memory-match' || currentView === 'game-tic-tac-toe') && (
              <div
                className="w-full bg-[#201A36] border-b border-[#56E0CB]/40 px-3 sm:px-6 py-1.5"
                data-testid="active-arcade-return-banner"
              >
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-[#56E0CB] font-semibold truncate">
                    <DoorOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Arcade Room:{' '}
                      <strong className="text-[#FFF0D7]">
                        {activeArcadeContext.arcadeRoomName}
                      </strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleReturnToArcadeRoom}
                    data-testid="return-to-arcade-room-btn"
                    className="px-2.5 py-1 rounded-lg bg-[#56E0CB] text-[#171329] font-bold text-[11px] shrink-0 cursor-pointer"
                  >
                    Return to Arcade Room
                  </button>
                </div>
              </div>
            )}

          {/* Main View Area */}
          <main className="flex-1 w-full max-w-full">
            <Suspense fallback={<RouteLoadingFallback />}>
            {currentView === 'home' && (
              <>
                <Hero onLetsPlay={handleScrollToGames} />
                <GameCollection onPlayGame={handleStartGame} />
                <BrandPersonality />
              </>
            )}

            {currentView === 'leaderboard' && (
              <div className="py-4">
                <div className="max-w-5xl mx-auto px-3 sm:px-6 mb-2">
                  <button
                    type="button"
                    onClick={handleNavigatePublicHome}
                    className="px-3 py-1.5 rounded-xl bg-[#292342] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] hover:text-[#56E0CB] cursor-pointer"
                  >
                    ← Back to Home
                  </button>
                </div>
                <LeaderboardsView
                  profile={profile}
                  multiplayerStats={arcadeData.multiplayerStats}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                />
              </div>
            )}

            {currentView === 'whats-new' && (
              <WhatsNewView
                onBack={handleNavigatePublicHome}
                onAcknowledged={() => setHasUnreadWhatsNew(false)}
              />
            )}

            {currentView === 'feedback' && (
              <FeedbackFormView
                initialArea={feedbackContext.area}
                initialGameType={feedbackContext.gameType ?? null}
                currentRoute="/feedback"
                onBack={handleNavigatePublicHome}
                onViewMyReports={
                  isSignedInAccount && profile
                    ? () => handleOpenDashboard('my-reports')
                    : undefined
                }
              />
            )}

            {currentView === 'arcade-rooms' && (
              <ArcadeRoomsView
                onBackToHome={handleNavigatePublicHome}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                onPlayTemporaryGame={(gameType) => handleStartGame(gameType)}
                onLaunchGameSession={handleLaunchArcadeGameSession}
                initialInviteCode={arcadeInviteCode}
                initialOpenRoomId={returnToArcadeRoomId}
                onClearInviteCode={() => {
                  clearArcadeRoomInvitationFromUrl();
                  setArcadeInviteCode(null);
                }}
              />
            )}

            {currentView === 'game-tic-tac-toe' && (
              <>
                <TicTacToeGame onBackToHome={handleNavigateBackFromGame} />
                <div className="max-w-4xl mx-auto px-4 pb-6 text-center">
                  <button
                    type="button"
                    onClick={() => handleOpenFeedback('tic-tac-toe', 'tic-tac-toe')}
                    data-testid="game-screen-feedback-btn"
                    className="inline-flex items-center gap-1.5 text-xs text-[#FFF0D7]/55 hover:text-[#56E0CB] transition-colors cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Report an issue or send feedback for Tic-Tac-Toe</span>
                  </button>
                </div>
              </>
            )}

            {currentView === 'game-memory-match' && (
              <>
                <MemoryMatchGame onBackToHome={handleNavigateBackFromGame} />
                <div className="max-w-4xl mx-auto px-4 pb-6 text-center">
                  <button
                    type="button"
                    onClick={() => handleOpenFeedback('memory-match', 'memory-match')}
                    data-testid="game-screen-feedback-btn"
                    className="inline-flex items-center gap-1.5 text-xs text-[#FFF0D7]/55 hover:text-[#56E0CB] transition-colors cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Report an issue or send feedback for Memory Match</span>
                  </button>
                </div>
              </>
            )}

            {currentView === 'game-snake' && (
              <>
                <SnakeGame onBackToHome={handleNavigateBackFromGame} />
                <div className="max-w-4xl mx-auto px-4 pb-6 text-center">
                  <button
                    type="button"
                    onClick={() => handleOpenFeedback('snake', 'snake')}
                    data-testid="game-screen-feedback-btn"
                    className="inline-flex items-center gap-1.5 text-xs text-[#FFF0D7]/55 hover:text-[#56E0CB] transition-colors cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Report an issue or send feedback for Snake</span>
                  </button>
                </div>
              </>
            )}
            </Suspense>
          </main>

          {/* Footer: displayed ONLY on the public homepage */}
          {currentView === 'home' && <Footer onOpenAbout={() => setIsAboutOpen(true)} />}
        </>
      )}

      {/* Accessible About Modal */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      {/* Authentication & Player Profile Modal */}
      <AuthProfileModal
        isOpen={isAuthModalOpen || needsProfileCompletion}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AudioProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </AudioProvider>
  );
}

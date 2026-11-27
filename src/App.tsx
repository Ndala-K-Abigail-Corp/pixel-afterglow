/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DoorOpen } from 'lucide-react';
import { Navbar, AppView } from './components/common/Navbar';
import { Hero } from './components/home/Hero';
import { GameCollection } from './components/home/GameCollection';
import { BrandPersonality } from './components/home/BrandPersonality';
import { Footer } from './components/common/Footer';
import { TicTacToeGame } from './components/game/TicTacToeGame';
import { MemoryMatchGame } from './components/game/MemoryMatchGame';
import {
  ArcadeRoomsView,
  type ActiveArcadeLaunchContext,
} from './components/arcade/ArcadeRoomsView';
import { AboutModal } from './components/common/AboutModal';
import { AuthProfileModal } from './components/auth/AuthProfileModal';
import { AudioProvider } from './context/AudioContext';
import { AuthProvider, useAuth } from './context/AuthContext';
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
  const { needsProfileCompletion } = useAuth();
  const [arcadeInviteCode, setArcadeInviteCode] = useState<string | null>(() =>
    parseArcadeRoomInvitationFromUrl()
  );
  const [activeArcadeContext, setActiveArcadeContext] =
    useState<ActiveArcadeLaunchContext | null>(null);
  const [returnToArcadeRoomId, setReturnToArcadeRoomId] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<AppView>(() => {
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

  useEffect(() => {
    if (needsProfileCompletion) {
      setIsAuthModalOpen(true);
    }
  }, [needsProfileCompletion]);

  // Sync window scroll when switching views
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

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
    }
  };

  const handleNavigateHome = () => {
    clearRoomInvitationFromUrl();
    clearArcadeRoomInvitationFromUrl();
    setActiveArcadeContext(null);
    setReturnToArcadeRoomId(null);
    setCurrentView('home');
  };

  const handleOpenArcadeRooms = () => {
    setReturnToArcadeRoomId(activeArcadeContext?.arcadeRoomId ?? null);
    setCurrentView('arcade-rooms');
  };

  const handleLaunchArcadeGameSession = (ctx: ActiveArcadeLaunchContext) => {
    setActiveArcadeContext(ctx);
    setReturnToArcadeRoomId(ctx.arcadeRoomId);
    setCurrentView(
      ctx.gameType === 'tic-tac-toe' ? 'game-tic-tac-toe' : 'game-memory-match'
    );
  };

  const handleReturnToArcadeRoom = () => {
    if (!activeArcadeContext) {
      setCurrentView('arcade-rooms');
      return;
    }
    setReturnToArcadeRoomId(activeArcadeContext.arcadeRoomId);
    setActiveArcadeContext(null);
    setCurrentView('arcade-rooms');
  };

  const handleScrollToGames = () => {
    if (currentView !== 'home') {
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

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#171329] text-[#FFF0D7] flex flex-col font-sans selection:bg-[#FF776E] selection:text-[#171329]">
      {/* Navigation Bar */}
      <Navbar
        currentView={currentView}
        onNavigateHome={handleNavigateHome}
        onOpenGames={handleScrollToGames}
        onOpenArcadeRooms={handleOpenArcadeRooms}
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
                  Arcade Room: <strong className="text-[#FFF0D7]">{activeArcadeContext.arcadeRoomName}</strong>
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
        {currentView === 'home' && (
          <>
            <Hero onLetsPlay={handleScrollToGames} />
            <GameCollection onPlayGame={handleStartGame} />
            <BrandPersonality />
          </>
        )}

        {currentView === 'arcade-rooms' && (
          <ArcadeRoomsView
            onBackToHome={handleNavigateHome}
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
          <TicTacToeGame onBackToHome={handleNavigateHome} />
        )}

        {currentView === 'game-memory-match' && (
          <MemoryMatchGame onBackToHome={handleNavigateHome} />
        )}
      </main>

      {/* Footer: displayed ONLY on the homepage so game, lobby, arcade room & auth screens maximize viewport height */}
      {currentView === 'home' && (
        <Footer onOpenAbout={() => setIsAboutOpen(true)} />
      )}

      {/* Accessible About Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar, AppView } from './components/common/Navbar';
import { Hero } from './components/home/Hero';
import { GameCollection } from './components/home/GameCollection';
import { BrandPersonality } from './components/home/BrandPersonality';
import { Footer } from './components/common/Footer';
import { TicTacToeGame } from './components/game/TicTacToeGame';
import { MemoryMatchGame } from './components/game/MemoryMatchGame';
import { AboutModal } from './components/common/AboutModal';
import { AudioProvider } from './context/AudioContext';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  // Sync window scroll when switching views
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

  const handleStartGame = (gameId: string) => {
    if (gameId === 'tic-tac-toe') {
      setCurrentView('game-tic-tac-toe');
    } else if (gameId === 'memory-match') {
      setCurrentView('game-memory-match');
    }
  };

  const handleNavigateHome = () => {
    setCurrentView('home');
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
    <AudioProvider>
      <div className="min-h-screen bg-[#171329] text-[#FFF0D7] flex flex-col font-sans selection:bg-[#FF776E] selection:text-[#171329]">
        {/* Navigation Bar */}
        <Navbar
          currentView={currentView}
          onNavigateHome={handleNavigateHome}
          onOpenGames={handleScrollToGames}
          onOpenAbout={() => setIsAboutOpen(true)}
        />

        {/* Main View Area */}
        <main className="flex-1">
          {currentView === 'home' && (
            <>
              <Hero onLetsPlay={handleScrollToGames} />
              <GameCollection onPlayGame={handleStartGame} />
              <BrandPersonality />
            </>
          )}

          {currentView === 'game-tic-tac-toe' && (
            <TicTacToeGame onBackToHome={handleNavigateHome} />
          )}

          {currentView === 'game-memory-match' && (
            <MemoryMatchGame onBackToHome={handleNavigateHome} />
          )}
        </main>

        {/* Footer */}
        <Footer onOpenAbout={() => setIsAboutOpen(true)} />

        {/* Accessible About Modal */}
        <AboutModal
          isOpen={isAboutOpen}
          onClose={() => setIsAboutOpen(false)}
        />
      </div>
    </AudioProvider>
  );
}

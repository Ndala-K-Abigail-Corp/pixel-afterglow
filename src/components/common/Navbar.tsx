/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Volume2, VolumeX, Gamepad2, Info } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { PWAInstallButton } from './PWAInstallButton';

export type AppView = 'home' | 'game-tic-tac-toe' | 'game-memory-match';

interface NavbarProps {
  currentView: AppView;
  onNavigateHome: () => void;
  onOpenGames: () => void;
  onOpenAbout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigateHome,
  onOpenGames,
  onOpenAbout,
}) => {
  const { isMuted, toggleMute } = useAudio();

  return (
    <header className="sticky top-0 z-40 bg-[#171329]/95 backdrop-blur-md border-b border-[#292342] px-4 md:px-8 py-3.5 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
        {/* Brand Wordmark & Pixel Icon */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-3 text-left group focus-visible:ring-2 focus-visible:ring-[#56E0CB] rounded-lg p-1 transition-transform"
          aria-label="Pixel Afterglow Homepage"
        >
          {/* Custom Pixel Retro Badge */}
          <div className="w-9 h-9 rounded-lg bg-[#292342] border-2 border-[#56E0CB] flex items-center justify-center text-[#56E0CB] group-hover:border-[#FF776E] group-hover:text-[#FF776E] transition-colors shadow-sm shrink-0">
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
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

          <div>
            <span className="font-pixel text-xs sm:text-sm text-[#FFF0D7] tracking-tight group-hover:text-[#FFC66D] transition-colors block leading-none">
              PIXEL AFTERGLOW
            </span>
            <span className="text-[11px] text-[#56E0CB] font-medium tracking-wide hidden sm:block mt-1 font-sans">
              Old-school joy. New ways to play.
            </span>
          </div>
        </button>

        {/* Navigation Items & Controls */}
        <nav className="flex items-center gap-1.5 sm:gap-3" aria-label="Main Navigation">
          {/* Games link */}
          <button
            onClick={onOpenGames}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              currentView === 'home'
                ? 'text-[#FFF0D7] hover:text-[#56E0CB] hover:bg-[#292342]'
                : 'text-[#FFF0D7] hover:text-[#56E0CB] bg-[#292342]/60 hover:bg-[#292342]'
            }`}
          >
            <Gamepad2 className="w-4 h-4 text-[#56E0CB]" />
            <span>Games</span>
          </button>

          {/* About link */}
          <button
            onClick={onOpenAbout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-[#FFF0D7] hover:text-[#FFC66D] hover:bg-[#292342] transition-colors"
          >
            <Info className="w-4 h-4 text-[#FFC66D]" />
            <span>About</span>
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Sound Mute/Unmute Toggle Button */}
          <button
            onClick={toggleMute}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
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
                <VolumeX className="w-4 h-4 text-[#FF776E]" />
                <span className="hidden sm:inline font-mono">MUTED</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-[#56E0CB] animate-pulse" />
                <span className="hidden sm:inline font-mono">SFX ON</span>
              </>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
};

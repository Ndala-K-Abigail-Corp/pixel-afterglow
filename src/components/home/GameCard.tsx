/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Play, Lock } from 'lucide-react';
import { GameMetadata } from '../../types/game';
import {
  TicTacToeArt,
  MemoryMatchArt,
  SnakeArt,
  WordGuessArt,
} from '../pixel-art/GameThumbnails';
import { useAudio } from '../../context/AudioContext';

interface GameCardProps {
  game: GameMetadata;
  onPlay: (gameId: string) => void;
  featured?: boolean;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onPlay }) => {
  const { playClick } = useAudio();
  const isPlayable = game.status === 'playable';

  const renderThumbnail = () => {
    switch (game.id) {
      case 'tic-tac-toe':
        return <TicTacToeArt />;
      case 'memory-match':
        return <MemoryMatchArt />;
      case 'snake':
        return <SnakeArt />;
      case 'word-guessing':
        return <WordGuessArt />;
      default:
        return null;
    }
  };

  const handleAction = () => {
    if (isPlayable) {
      playClick();
      onPlay(game.id);
    }
  };

  if (isPlayable) {
    const isTealAccent = game.accentColor === '#56E0CB';
    const borderClass = isTealAccent ? 'border-[#56E0CB] hover:border-[#68e9d5]' : 'border-[#FF776E] hover:border-[#ff8f87]';
    const shadowClass = isTealAccent ? 'retro-box-teal' : 'retro-box-coral';
    const btnBgClass = isTealAccent ? 'bg-[#56E0CB] hover:bg-[#68e9d5]' : 'bg-[#FF776E] hover:bg-[#ff8f87]';
    const badgeColor = isTealAccent ? 'text-[#56E0CB]' : 'text-[#FF776E]';

    return (
      <div
        className={`relative group bg-[#201A36] border-2 ${borderClass} rounded-2xl overflow-hidden shadow-xl ${shadowClass} flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 min-w-0`}
      >
        {/* Visual Thumbnail Area */}
        <div className="w-full bg-[#171329] p-3 sm:p-4 flex items-center justify-center border-b border-[#3D345F]">
          <div className="w-full aspect-[16/10] overflow-hidden rounded-xl border border-[#292342] shadow-inner">
            {renderThumbnail()}
          </div>
        </div>

        {/* Info & Action Area */}
        <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] sm:text-[11px] font-pixel text-[#56E0CB] tracking-wide uppercase">
                {game.category}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold ${badgeColor} shrink-0`}>
                <span className={`w-2 h-2 rounded-full ${isTealAccent ? 'bg-[#56E0CB]' : 'bg-[#FF776E]'} animate-pulse`} />
                PLAYABLE NOW
              </span>
            </div>

            <h3 className="font-pixel text-base sm:text-lg md:text-xl text-[#FFF0D7] tracking-tight mb-2 group-hover:text-[#FFC66D] transition-colors leading-snug">
              {game.title}
            </h3>

            <p className="text-xs md:text-sm text-[#FFC66D] font-medium mb-3">
              {game.tagline}
            </p>

            <p className="text-xs md:text-sm text-[#FFF0D7]/75 leading-relaxed mb-5 sm:mb-6">
              {game.description}
            </p>
          </div>

          <div className="pt-4 border-t border-[#3D345F] flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-[#FFF0D7]/60 font-mono">
              {game.id === 'tic-tac-toe' ? 'PvP / PvC Modes' : 'Solo Arcade Recall'}
            </div>

            <button
              onClick={handleAction}
              className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 ${btnBgClass} text-[#171329] font-bold text-xs uppercase tracking-wider rounded-xl font-pixel cursor-pointer transition-colors shadow-md focus-visible:ring-2 focus-visible:ring-[#FFF0D7] retro-btn`}
              aria-label={`Play ${game.title} now`}
            >
              <Play className="w-3.5 h-3.5 fill-[#171329] shrink-0" />
              <span>PLAY NOW</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Cards for Coming Soon pipeline entries
  return (
    <div className="relative group bg-[#201A36]/80 border border-[#292342] rounded-2xl overflow-hidden flex flex-col justify-between opacity-80 hover:opacity-95 transition-opacity min-w-0">
      {/* Thumbnail */}
      <div className="relative bg-[#171329] p-3 border-b border-[#292342]">
        <div className="w-full aspect-[16/10] overflow-hidden rounded-xl border border-[#201A36]">
          {renderThumbnail()}
        </div>

        {/* Lock Overlay Badge */}
        <div className="absolute top-5 right-5 bg-[#171329]/95 border border-[#3D345F] px-2.5 py-1 rounded-lg text-[10px] font-pixel text-[#FFF0D7]/70 flex items-center gap-1.5 shadow-sm">
          <Lock className="w-2.5 h-2.5 text-[#FFC66D]" />
          <span>COMING SOON</span>
        </div>
      </div>

      {/* Card Info */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="text-[10px] font-pixel text-[#56E0CB]/80 uppercase mb-1">
            {game.category}
          </div>

          <h3 className="font-pixel text-sm text-[#FFF0D7] tracking-tight mb-1.5 leading-snug">
            {game.title}
          </h3>

          <p className="text-xs text-[#FFC66D]/80 font-medium mb-2">
            {game.tagline}
          </p>

          <p className="text-xs text-[#FFF0D7]/65 leading-relaxed">
            {game.description}
          </p>
        </div>

        <div className="mt-5 pt-3 border-t border-[#292342] flex items-center justify-between text-[11px] text-[#FFF0D7]/50 font-mono">
          <span>In development</span>
          <span className="text-[#56E0CB]/70">Phase 2</span>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Play, Sparkles, Clock } from 'lucide-react';
import { GAMES_CATALOG } from '../../data/games';
import { TicTacToeArt, MemoryMatchArt, SnakeArt } from '../pixel-art/GameThumbnails';
import { useAudio } from '../../context/AudioContext';

interface DashboardGamesViewProps {
  onPlayGame: (gameId: 'memory-match' | 'tic-tac-toe' | 'snake') => void;
}

export const DashboardGamesView: React.FC<DashboardGamesViewProps> = ({ onPlayGame }) => {
  const { playClick } = useAudio();
  const playableGames = GAMES_CATALOG.filter((g) => g.status === 'playable');
  const upcomingGames = GAMES_CATALOG.filter((g) => g.status !== 'playable');

  return (
    <div
      className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-6"
      data-testid="dashboard-games-view"
    >
      <div>
        <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#FFF0D7]">
          ARCADE GAMES
        </h1>
        <p className="text-xs sm:text-sm text-[#FFF0D7]/70 mt-1.5">
          Launch single-player practice or verified multiplayer matches directly from your arcade.
        </p>
      </div>

      {/* Playable Games */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {playableGames.map((game) => (
          <div
            key={game.id}
            className="rounded-2xl bg-[#201A36] border-2 border-[#3D345F] hover:border-[#56E0CB]/60 transition-colors overflow-hidden flex flex-col"
          >
            <div className="h-36 sm:h-40 bg-[#171329] relative overflow-hidden">
              {game.id === 'tic-tac-toe' ? (
                <TicTacToeArt />
              ) : game.id === 'snake' ? (
                <SnakeArt />
              ) : (
                <MemoryMatchArt />
              )}
              <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#171329]/90 border border-[#56E0CB]/60 text-[10px] font-bold text-[#56E0CB] inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Play Now
              </span>
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#FFC66D]">
                  {game.category}
                </p>
                <h2 className="text-base font-bold text-[#FFF0D7] mt-0.5">{game.title}</h2>
                <p className="text-xs text-[#FFF0D7]/75 mt-1 leading-relaxed">
                  {game.description}
                </p>
              </div>

              <button
                type="button"
                  onClick={() => {
                    playClick();
                    onPlayGame(game.id as 'memory-match' | 'tic-tac-toe' | 'snake');
                  }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-['Press_Start_2P'] text-[10px] uppercase text-[#171329] cursor-pointer"
                style={{ backgroundColor: game.accentColor }}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Play {game.title}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Coming Soon Preview */}
      <div className="space-y-3">
        <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] uppercase flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          <span>Coming Soon</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {upcomingGames.slice(0, 3).map((game) => (
            <div
              key={game.id}
              className="p-4 rounded-xl bg-[#201A36]/75 border border-[#3D345F] space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#FFF0D7]">{game.title}</h3>
                <span className="px-2 py-0.5 rounded-full bg-[#171329] border border-[#3D345F] text-[10px] text-[#FFC66D]">
                  Soon
                </span>
              </div>
              <p className="text-xs text-[#FFF0D7]/65">{game.tagline}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GAMES_CATALOG } from '../../data/games';
import { GameCard } from './GameCard';

interface GameCollectionProps {
  onPlayGame: (gameId: string) => void;
}

export const GameCollection: React.FC<GameCollectionProps> = ({ onPlayGame }) => {
  const playableGames = GAMES_CATALOG.filter((g) => g.status === 'playable');
  const upcomingGames = GAMES_CATALOG.filter((g) => g.status === 'coming-soon');

  return (
    <section id="game-collection" className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-4 border-b border-[#292342]">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 bg-[#FF776E] inline-block" />
            <span className="font-pixel text-xs text-[#56E0CB] tracking-wider uppercase">
              CARTRIDGE COLLECTION
            </span>
          </div>
          <h2 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#FFF0D7] tracking-tight">
            PICK YOUR NEXT OBSESSION
          </h2>
        </div>

        <p className="text-xs sm:text-sm text-[#FFF0D7]/75 max-w-sm">
          Both cartridges below are fully playable in your browser right now. Zero downloads, instant fun.
        </p>
      </div>

      {/* Playable Games Grid: 2 Columns on Tablet/Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {playableGames.map((game) => (
          <GameCard key={game.id} game={game} onPlay={onPlayGame} featured={true} />
        ))}
      </div>

      {/* Upcoming Roadmap Grid */}
      <div>
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-[#292342]/60">
          <h3 className="font-pixel text-xs text-[#FFC66D] tracking-wide uppercase flex items-center gap-2">
            <span>UPCOMING CARTRIDGES</span>
            <span className="text-[10px] text-[#FFF0D7]/50 font-sans font-normal">(In Pipeline)</span>
          </h3>
          <span className="text-xs text-[#FFF0D7]/50 font-mono">2 TITLES IN QUEUE</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl">
          {upcomingGames.map((game) => (
            <GameCard key={game.id} game={game} onPlay={onPlayGame} featured={false} />
          ))}
        </div>
      </div>
    </section>
  );
};

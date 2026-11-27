/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Trophy, Crown, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import {
  fetchLeaderboardEntries,
  MIN_LEADERBOARD_GAMES,
} from '../../logic/leaderboards';
import type { RankedLeaderboardEntry } from '../../types/arcadePlatform';
import { CountryFlag } from '../common/CountryFlag';
import { useAudio } from '../../context/AudioContext';

export interface HomepageLeaderboardSectionProps {
  onOpenFullLeaderboard: () => void;
  /** Optional preloaded entries for deterministic tests */
  initialEntries?: RankedLeaderboardEntry[];
}

/**
 * Public homepage ARCADE LEADERBOARD preview section.
 * Displays genuine verified multiplayer rankings (never fabricated) and a link
 * to the full public leaderboard view.
 */
export const HomepageLeaderboardSection: React.FC<HomepageLeaderboardSectionProps> = ({
  onOpenFullLeaderboard,
  initialEntries,
}) => {
  const { playClick } = useAudio();
  const [entries, setEntries] = useState<RankedLeaderboardEntry[]>(initialEntries ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialEntries);

  useEffect(() => {
    if (initialEntries) {
      setEntries(initialEntries);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void fetchLeaderboardEntries({
      gameId: 'all',
      period: 'all-time',
      scope: 'global',
      pageSize: 5,
    }).then((res) => {
      if (cancelled) return;
      setEntries(res.entries.slice(0, 5));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [initialEntries]);

  return (
    <section
      id="arcade-leaderboard"
      aria-labelledby="arcade-leaderboard-heading"
      data-testid="homepage-arcade-leaderboard"
      className="py-12 sm:py-16 px-4 sm:px-6 md:px-8 border-t border-[#292342] bg-[#171329]"
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Heading Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFC66D]/12 border border-[#FFC66D]/45 text-[10px] font-bold uppercase tracking-wider text-[#FFC66D]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Multiplayer Rankings
            </span>
            <h2
              id="arcade-leaderboard-heading"
              className="font-['Press_Start_2P'] text-base sm:text-xl text-[#FFF0D7] flex items-center gap-2.5"
            >
              <Trophy className="w-5 h-5 text-[#FFC66D] shrink-0" />
              <span>ARCADE LEADERBOARD</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#FFF0D7]/70">
              See who&apos;s dominating the arcade.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              playClick();
              onOpenFullLeaderboard();
            }}
            data-testid="homepage-view-full-leaderboard-btn"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#292342] hover:bg-[#322B50] border-2 border-[#56E0CB]/60 text-[#56E0CB] font-bold text-xs sm:text-sm cursor-pointer shrink-0 transition-colors"
          >
            <span>View Full Leaderboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Preview Card */}
        <div className="rounded-2xl bg-[#201A36] border-2 border-[#3D345F] overflow-hidden">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center gap-2 text-xs text-[#FFF0D7]/70">
              <Loader2 className="w-5 h-5 animate-spin text-[#56E0CB]" />
              <span>Loading Arcade Leaderboard…</span>
            </div>
          ) : entries.length === 0 ? (
            <div
              className="py-10 px-4 text-center space-y-2"
              data-testid="homepage-leaderboard-empty"
            >
              <Trophy className="w-8 h-8 text-[#FFC66D] mx-auto" />
              <p className="text-sm font-bold text-[#FFF0D7]">
                No Qualified Competitors Yet
              </p>
              <p className="text-xs text-[#FFF0D7]/70 max-w-md mx-auto">
                Sign in and complete at least {MIN_LEADERBOARD_GAMES} verified multiplayer matches in any game to claim your spot on the Arcade Leaderboard.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#171329] text-[#FFF0D7]/65 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4 text-right">MP Wins</th>
                    <th className="py-3 px-4 text-right">Win %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E264A]">
                  {entries.map((entry) => {
                    const isTop3 = entry.rank <= 3;
                    const rankColor =
                      entry.rank === 1
                        ? 'text-[#FFC66D]'
                        : entry.rank === 2
                          ? 'text-[#56E0CB]'
                          : entry.rank === 3
                            ? 'text-[#FF776E]'
                            : 'text-[#FFF0D7]/75';
                    return (
                      <tr
                        key={entry.entryId}
                        className={isTop3 ? 'bg-[#251E40]/60' : 'hover:bg-[#241E3D]'}
                        data-testid={`homepage-lb-row-${entry.rank}`}
                      >
                        <td className={`py-3 px-4 font-['Press_Start_2P'] text-[10px] sm:text-xs ${rankColor}`}>
                          <span className="inline-flex items-center gap-1.5">
                            {entry.rank === 1 && <Crown className="w-3.5 h-3.5 text-[#FFC66D]" />}
                            #{entry.rank}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#FFF0D7] truncate max-w-[160px]">
                          {entry.username}
                        </td>
                        <td className="py-3 px-4 text-[#FFF0D7]/80 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CountryFlag code={entry.countryCode} name={entry.countryName} size="xs" />
                            <span className="hidden sm:inline">{entry.countryName}</span>
                            <span className="sm:hidden">{entry.countryCode}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#56E0CB]">
                          {entry.wins}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#FFC66D]">
                          {entry.winPercentage}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

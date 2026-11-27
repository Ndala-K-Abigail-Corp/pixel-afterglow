/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Globe,
  Flag,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Crown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PROFILE_AVATARS, type UserProfile } from '../../types/profile';
import type {
  LeaderboardPeriod,
  LeaderboardScope,
  MultiplayerGameStats,
  PlatformGameId,
  RankedLeaderboardEntry,
} from '../../types/arcadePlatform';
import {
  fetchLeaderboardEntries,
  getLeaderboardQualificationStatus,
  MIN_LEADERBOARD_GAMES,
  type LeaderboardGameFilter,
} from '../../logic/leaderboards';
import { getCountryByCode } from '../../data/countries';
import { CountryFlag } from '../common/CountryFlag';
import { MemorySymbolIcon } from '../game/MemorySymbolIcon';
import { useAudio } from '../../context/AudioContext';

interface LeaderboardsViewProps {
  profile: UserProfile | null;
  multiplayerStats: Record<PlatformGameId, MultiplayerGameStats>;
  /** Optional callback for signed-out visitors to create an account */
  onOpenAuth?: () => void;
  /** Optional preloaded entries for deterministic UI tests */
  initialEntries?: RankedLeaderboardEntry[];
}

const PAGE_SIZE = 10;

export const LeaderboardsView: React.FC<LeaderboardsViewProps> = ({
  profile,
  multiplayerStats,
  onOpenAuth,
  initialEntries,
}) => {
  const { playClick } = useAudio();
  const [selectedGame, setSelectedGame] = useState<LeaderboardGameFilter>('memory-match');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all-time');
  const [entries, setEntries] = useState<RankedLeaderboardEntry[]>(initialEntries ?? []);
  const [rawPeriodEntries, setRawPeriodEntries] = useState<
    import('../../types/arcadePlatform').LeaderboardEntryDoc[]
  >([]);
  const [periodKey, setPeriodKey] = useState<string>('all-time');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);

  const userCountry = profile ? getCountryByCode(profile.countryCode) : null;

  useEffect(() => {
    if (initialEntries) {
      setEntries(initialEntries);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);
    setPage(1);

    void fetchLeaderboardEntries({
      gameId: selectedGame,
      period,
      scope,
      countryCode: scope === 'country' ? profile?.countryCode : undefined,
      pageSize: 50,
    }).then((res) => {
      if (cancelled) return;
      setEntries(res.entries);
      setRawPeriodEntries(res.rawPeriodEntries ?? []);
      setPeriodKey(res.periodKey);
      setIsUnavailable(res.unavailable);
      setErrorMsg(res.error);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedGame, period, scope, profile?.countryCode, initialEntries]);

  const qualification = useMemo(() => {
    const getGamesForPeriod = (gameId: PlatformGameId): number => {
      const periodEntry = profile
        ? rawPeriodEntries.find(
            (e) => e.uid === profile.uid && e.gameId === gameId && e.period === period
          )
        : undefined;
      if (period === 'all-time') {
        return Math.max(
          periodEntry?.gamesPlayed ?? 0,
          multiplayerStats[gameId]?.gamesPlayed ?? 0
        );
      }
      return periodEntry?.gamesPlayed ?? 0;
    };

    // Qualification is strictly per game (never combines matches across different games).
    if (selectedGame === 'all') {
      const perGameCounts: Array<{ gameId: PlatformGameId; count: number }> = [
        { gameId: 'memory-match', count: getGamesForPeriod('memory-match') },
        { gameId: 'tic-tac-toe', count: getGamesForPeriod('tic-tac-toe') },
        { gameId: 'snake', count: getGamesForPeriod('snake') },
      ];
      perGameCounts.sort((a, b) => b.count - a.count);
      const best = perGameCounts[0];
      return getLeaderboardQualificationStatus(best.gameId, best.count, MIN_LEADERBOARD_GAMES);
    }
    return getLeaderboardQualificationStatus(
      selectedGame,
      getGamesForPeriod(selectedGame),
      MIN_LEADERBOARD_GAMES
    );
  }, [selectedGame, period, profile, rawPeriodEntries, multiplayerStats]);

  const currentUserEntry = useMemo(
    () => (profile ? entries.find((e) => e.uid === profile.uid) ?? null : null),
    [entries, profile]
  );

  const podiumEntries = entries.slice(0, 3);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div
      className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5"
      data-testid="dashboard-leaderboards-view"
    >
      {/* Header */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border-2 border-[#3D345F] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#56E0CB] flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#FFC66D] shrink-0" />
            <span>MULTIPLAYER LEADERBOARDS</span>
          </h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#171329] border border-[#3D345F] text-[10px] text-[#FFF0D7]/75">
            <ShieldCheck className="w-3.5 h-3.5 text-[#56E0CB]" />
            Verified Registered Players Only
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#FFF0D7]/70">
          Ranked by verified multiplayer wins, with win percentage and draws as tiebreakers. Single-player records remain private.
        </p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Game Selector */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'All Games' },
              { id: 'memory-match', label: 'Memory Match' },
              { id: 'tic-tac-toe', label: 'Tic-Tac-Toe' },
              { id: 'snake', label: 'Snake' },
            ] as const
          ).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                playClick();
                setSelectedGame(g.id);
              }}
              data-testid={`leaderboard-game-${g.id}`}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                selectedGame === g.id
                  ? 'bg-[#56E0CB]/20 text-[#56E0CB] border-[#56E0CB]'
                  : 'bg-[#201A36] text-[#FFF0D7]/75 border-[#3D345F]'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Global / Country Scope */}
          <div className="inline-flex rounded-xl bg-[#171329] border border-[#3D345F] p-0.5">
            <button
              type="button"
              onClick={() => {
                playClick();
                setScope('global');
              }}
              data-testid="leaderboard-scope-global"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                scope === 'global'
                  ? 'bg-[#292342] text-[#56E0CB]'
                  : 'text-[#FFF0D7]/70'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Global</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playClick();
                setScope('country');
              }}
              data-testid="leaderboard-scope-country"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                scope === 'country'
                  ? 'bg-[#292342] text-[#FFC66D]'
                  : 'text-[#FFF0D7]/70'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {userCountry ? (
                <span className="inline-flex items-center gap-1">
                  <CountryFlag code={userCountry.code} name={userCountry.name} size="xs" />
                  <span>{userCountry.code}</span>
                </span>
              ) : (
                <span>Country</span>
              )}
            </button>
          </div>

          {/* Period Filter */}
          <div className="inline-flex rounded-xl bg-[#171329] border border-[#3D345F] p-0.5">
            {(
              [
                { id: 'weekly', label: 'Weekly' },
                { id: 'monthly', label: 'Monthly' },
                { id: 'all-time', label: 'All Time' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  playClick();
                  setPeriod(p.id);
                }}
                data-testid={`leaderboard-period-${p.id}`}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  period === p.id
                    ? 'bg-[#292342] text-[#FFC66D]'
                    : 'text-[#FFF0D7]/70'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Signed-out Visitor Invitation Banner */}
      {!profile && (
        <div
          className="p-4 rounded-2xl bg-[#201A36] border border-[#56E0CB]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          data-testid="leaderboard-guest-cta"
        >
          <p className="text-xs sm:text-sm text-[#FFF0D7]/90">
            Want to compete? Create an account and start climbing the Arcade Leaderboard.
          </p>
          {onOpenAuth && (
            <button
              type="button"
              onClick={() => {
                playClick();
                onOpenAuth();
              }}
              className="px-4 py-2 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs shrink-0 cursor-pointer"
            >
              Sign In / Create Account
            </button>
          )}
        </div>
      )}

      {/* Player Qualification & Current Standing Banner */}
      {profile && (
        <div
          className="p-4 rounded-2xl bg-[#201A36] border border-[#FFC66D]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          data-testid="leaderboard-qualification-banner"
        >
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#FFC66D] uppercase tracking-wide">
              Your Standing · {periodKey}
            </p>
            {currentUserEntry ? (
              <p className="text-sm font-bold text-[#FFF0D7]">
                Rank #{currentUserEntry.rank} — {currentUserEntry.wins} wins ({currentUserEntry.winPercentage}% win rate)
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-[#FFF0D7]/85">{qualification.message}</p>
            )}
          </div>
          {!qualification.isQualified && (
            <div className="w-full sm:w-44 space-y-1 shrink-0">
              <div className="flex justify-between text-[10px] text-[#FFF0D7]/65">
                <span>Qualification</span>
                <span>
                  {qualification.completedGames}/{qualification.requiredGames}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#171329] overflow-hidden">
                <div
                  className="h-full bg-[#FFC66D]"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((qualification.completedGames / qualification.requiredGames) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content States */}
      {isLoading ? (
        <div className="p-8 rounded-2xl bg-[#201A36] border border-[#3D345F] flex flex-col items-center gap-2 text-xs text-[#FFF0D7]/75">
          <Loader2 className="w-6 h-6 animate-spin text-[#56E0CB]" />
          <span>Loading verified rankings…</span>
        </div>
      ) : errorMsg ? (
        <div className="p-5 rounded-2xl bg-[#FF776E]/10 border border-[#FF776E]/50 flex items-start gap-3 text-xs text-[#FF776E] overflow-hidden">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{errorMsg}</span>
        </div>
      ) : isUnavailable ? (
        <div className="p-8 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center space-y-2">
          <Globe className="w-8 h-8 text-[#56E0CB] mx-auto" />
          <p className="text-sm font-bold text-[#FFF0D7]">Online Rankings Unavailable</p>
          <p className="text-xs text-[#FFF0D7]/70 max-w-md mx-auto">
            Connect Firebase to load live verified multiplayer leaderboards.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div
          className="p-8 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center space-y-2"
          data-testid="leaderboard-empty-state"
        >
          <Trophy className="w-8 h-8 text-[#FFC66D] mx-auto" />
          <p className="text-sm font-bold text-[#FFF0D7]">No Qualified Competitors Yet</p>
          <p className="text-xs text-[#FFF0D7]/70 max-w-md mx-auto">
            Complete {MIN_LEADERBOARD_GAMES} verified multiplayer matches in this game to claim the #1 spot on the podium.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top-3 Podium */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="leaderboard-podium">
            {podiumEntries.map((entry) => {
              const c = getCountryByCode(entry.countryCode);
              const podiumBorder =
                entry.rank === 1
                  ? 'border-[#FFC66D]'
                  : entry.rank === 2
                    ? 'border-[#56E0CB]'
                    : 'border-[#FF776E]';
              return (
                <div
                  key={entry.entryId}
                  className={`p-4 rounded-2xl bg-[#201A36] border-2 ${podiumBorder} flex flex-col items-center text-center gap-2`}
                >
                  <span className="inline-flex items-center gap-1 font-['Press_Start_2P'] text-[10px] text-[#FFC66D]">
                    {entry.rank === 1 && <Crown className="w-3.5 h-3.5" />}
                    #{entry.rank}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-[#171329] border border-[#3D345F] flex items-center justify-center">
                    <MemorySymbolIcon
                      symbolId={entry.avatarId}
                      color={PROFILE_AVATARS.find((a) => a.id === entry.avatarId)?.color ?? '#FFC66D'}
                      className="w-6 h-6"
                    />
                  </div>
                  <p className="text-sm font-bold text-[#FFF0D7] truncate max-w-full">
                    {entry.username}
                  </p>
                  <p className="text-[11px] text-[#FFF0D7]/70 inline-flex items-center gap-1.5">
                    <CountryFlag code={c?.code ?? entry.countryCode} name={c?.name ?? entry.countryName} size="xs" />
                    <span>{entry.countryName}</span>
                  </p>
                  <div className="flex items-center gap-3 text-xs pt-1">
                    <span className="font-bold text-[#56E0CB]">{entry.wins} W</span>
                    <span className="text-[#FFF0D7]/70">{entry.winPercentage}%</span>
                    <span className="text-[#FFC66D]">{entry.draws} D</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ranked List */}
          <div className="rounded-2xl bg-[#201A36] border border-[#3D345F] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#171329] text-[#FFF0D7]/65 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3">Rank</th>
                    <th className="py-3 px-3">Player</th>
                    <th className="py-3 px-3">Country</th>
                    <th className="py-3 px-3 text-right">Wins</th>
                    <th className="py-3 px-3 text-right">Win %</th>
                    <th className="py-3 px-3 text-right">Draws</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E264A]">
                  {pagedEntries.map((entry) => {
                    const c = getCountryByCode(entry.countryCode);
                    const isSelf = profile?.uid === entry.uid;
                    return (
                      <tr
                        key={entry.entryId}
                        className={isSelf ? 'bg-[#56E0CB]/10' : 'hover:bg-[#241E3D]'}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-[#FFC66D]">
                          #{entry.rank}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#FFF0D7]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{entry.username}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded bg-[#56E0CB]/20 text-[#56E0CB] text-[9px] font-bold">
                                YOU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[#FFF0D7]/80 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CountryFlag code={c?.code ?? entry.countryCode} name={c?.name ?? entry.countryName} size="xs" />
                            <span>{entry.countryCode}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#56E0CB]">
                          {entry.wins}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#FFF0D7]">
                          {entry.winPercentage}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#FFF0D7]/70">
                          {entry.draws}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#171329] border-t border-[#2E264A] text-xs">
                <span className="text-[#FFF0D7]/65">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-[#201A36] border border-[#3D345F] disabled:opacity-40 cursor-pointer"
                    aria-label="Previous leaderboard page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-[#201A36] border border-[#3D345F] disabled:opacity-40 cursor-pointer"
                    aria-label="Next leaderboard page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

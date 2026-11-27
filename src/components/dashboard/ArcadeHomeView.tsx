/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  DoorOpen,
  Plus,
  Settings,
  Trophy,
  Award,
  Sparkles,
  Users,
  Clock,
  Lock,
  Globe,
  Trash2,
  Link2,
  Check,
  ArrowRight,
  Crown,
} from 'lucide-react';
import { PROFILE_AVATARS, type UserProfile } from '../../types/profile';
import type { PersistentArcadeRoom } from '../../types/arcadeRoom';
import type {
  ArcadeXpProgress,
  DashboardSection,
  EvaluatedAchievement,
  GameResultRecord,
  MultiplayerGameStats,
  PlatformGameId,
  PrivateSinglePlayerRecords,
} from '../../types/arcadePlatform';
import { getCountryByCode } from '../../data/countries';
import { CountryFlag } from '../common/CountryFlag';
import { MemorySymbolIcon } from '../game/MemorySymbolIcon';
import { ArcadeXpBar } from './ArcadeXpBar';
import {
  buildArcadeRoomInvitationUrl,
  deletePersistentArcadeRoom,
} from '../../logic/arcadeRooms';
import { useAudio } from '../../context/AudioContext';

export interface ArcadeHomeViewProps {
  profile: UserProfile;
  rooms: PersistentArcadeRoom[];
  gameHistory: GameResultRecord[];
  multiplayerStats: Record<PlatformGameId, MultiplayerGameStats>;
  privateRecords: PrivateSinglePlayerRecords;
  xpProgress: ArcadeXpProgress;
  achievements: EvaluatedAchievement[];
  onNavigateSection: (section: DashboardSection) => void;
  onOpenArcadeRoom: (roomId: string) => void;
  onCreateArcadeRoom: () => void;
  onPlayGame: (gameId: 'memory-match' | 'tic-tac-toe') => void;
}

function formatRelativeTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export const ArcadeHomeView: React.FC<ArcadeHomeViewProps> = ({
  profile,
  rooms,
  gameHistory,
  multiplayerStats,
  privateRecords,
  xpProgress,
  achievements,
  onNavigateSection,
  onOpenArcadeRoom,
  onCreateArcadeRoom,
  onPlayGame,
}) => {
  const { playClick } = useAudio();
  const country = getCountryByCode(profile.countryCode);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  const totalMpGames =
    multiplayerStats['memory-match'].gamesPlayed +
    multiplayerStats['tic-tac-toe'].gamesPlayed;
  const totalMpWins =
    multiplayerStats['memory-match'].wins + multiplayerStats['tic-tac-toe'].wins;
  const totalMpDraws =
    multiplayerStats['memory-match'].draws + multiplayerStats['tic-tac-toe'].draws;
  const totalMpLosses =
    multiplayerStats['memory-match'].losses + multiplayerStats['tic-tac-toe'].losses;

  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const activeSessionRooms = rooms.filter((r) => Boolean(r.activeSessionId));
  const recentRooms = [...rooms].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const hasAnyActivity =
    totalMpGames > 0 ||
    privateRecords.memoryMatch.gamesPlayed > 0 ||
    privateRecords.ticTacToe.gamesPlayed > 0 ||
    gameHistory.length > 0;

  const handleCopyInvite = async (room: PersistentArcadeRoom) => {
    playClick();
    const url = buildArcadeRoomInvitationUrl(room.inviteCode);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRoomId(room.id);
      setTimeout(() => setCopiedRoomId(null), 2000);
    } catch {
      setCopiedRoomId(null);
    }
  };

  const handleDeleteRoom = async (room: PersistentArcadeRoom) => {
    playClick();
    setRoomError(null);
    setDeletingRoomId(room.id);
    try {
      await deletePersistentArcadeRoom(room.id);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to delete room.');
    } finally {
      setDeletingRoomId(null);
    }
  };

  return (
    <div
      className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-6"
      data-testid="arcade-home-dashboard"
    >
      {/* Welcome Banner */}
      <section
        className="p-4 sm:p-6 rounded-2xl bg-[#201A36] border-2 border-[#3D345F] space-y-4"
        data-testid="arcade-home-welcome"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#171329] border-2 border-[#56E0CB] flex items-center justify-center shrink-0">
              <MemorySymbolIcon
                symbolId={profile.avatarId}
                color={PROFILE_AVATARS.find((a) => a.id === profile.avatarId)?.color ?? '#FFC66D'}
                className="w-9 h-9"
              />
            </div>
            <div className="min-w-0">
              <p className="font-['Press_Start_2P'] text-[9px] text-[#56E0CB] uppercase tracking-wider">
                Welcome Back to Your Arcade
              </p>
              <h1 className="text-lg sm:text-2xl font-bold text-[#FFF0D7] truncate mt-1">
                {profile.username}
              </h1>
              <p className="text-xs sm:text-sm text-[#FFF0D7]/75 flex items-center gap-1.5 mt-0.5 flex-wrap">
                <CountryFlag code={country?.code ?? profile.countryCode} name={country?.name ?? profile.countryName} size="xs" />
                <span>{country?.name ?? profile.countryName}</span>
                <span className="text-[#3D345F]">•</span>
                <span className="text-[#FFC66D] font-semibold">
                  Level {xpProgress.level} {xpProgress.title}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playClick();
              onNavigateSection('my-profile');
            }}
            data-testid="arcade-home-profile-settings-btn"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#3D345F] hover:border-[#56E0CB] text-xs font-semibold text-[#FFF0D7] cursor-pointer shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-[#56E0CB]" />
            <span>Profile &amp; Settings</span>
          </button>
        </div>

        <ArcadeXpBar progress={xpProgress} />
      </section>

      {/* Section A: Continue Playing */}
      <section className="space-y-3" data-testid="dashboard-continue-playing">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-['Press_Start_2P'] text-[11px] sm:text-xs text-[#FFC66D] uppercase tracking-wide">
            Continue Playing
          </h2>
          <button
            type="button"
            onClick={() => {
              playClick();
              onNavigateSection('games');
            }}
            className="text-xs text-[#56E0CB] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>All Games</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {activeSessionRooms.length === 0 && recentRooms.length === 0 && gameHistory.length === 0 ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#FFF0D7]">Ready for your first match?</p>
              <p className="text-xs text-[#FFF0D7]/70 mt-1">
                Jump straight into Memory Match or Tic-Tac-Toe, or create a persistent room for friends.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onPlayGame('memory-match');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer"
              >
                Play Memory Match
              </button>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onPlayGame('tic-tac-toe');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#FF776E] text-[#171329] font-bold text-xs cursor-pointer"
              >
                Play Tic-Tac-Toe
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeSessionRooms.map((room) => (
              <div
                key={`active-${room.id}`}
                className="p-4 rounded-2xl bg-[#201A36] border-2 border-[#56E0CB]/60 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[#56E0CB]">
                    <Sparkles className="w-3 h-3" /> Active Session
                  </span>
                  <p className="text-sm font-bold text-[#FFF0D7] truncate mt-0.5">{room.name}</p>
                  <p className="text-xs text-[#FFF0D7]/70">
                    {room.activeSessionGameType === 'tic-tac-toe' ? 'Tic-Tac-Toe' : 'Memory Match'} · Code {room.activeSessionRoomCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    onOpenArcadeRoom(room.id);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs shrink-0 cursor-pointer"
                >
                  Resume
                </button>
              </div>
            ))}

            {recentRooms
              .filter((r) => !r.activeSessionId)
              .slice(0, 2)
              .map((room) => (
                <div
                  key={`recent-${room.id}`}
                  className="p-4 rounded-2xl bg-[#201A36] border border-[#3D345F] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-semibold text-[#FFC66D]">
                      Recent Room
                    </span>
                    <p className="text-sm font-bold text-[#FFF0D7] truncate mt-0.5">{room.name}</p>
                    <p className="text-xs text-[#FFF0D7]/65">
                      {room.memberUids.length} member{room.memberUids.length === 1 ? '' : 's'} · Active {formatRelativeTime(room.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      onOpenArcadeRoom(room.id);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] shrink-0 cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Section B: My Arcade Rooms */}
      <section className="space-y-3" data-testid="dashboard-my-rooms">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-['Press_Start_2P'] text-[11px] sm:text-xs text-[#56E0CB] uppercase tracking-wide">
            My Arcade Rooms
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playClick();
                onCreateArcadeRoom();
              }}
              data-testid="dashboard-create-room-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFC66D] hover:bg-[#ffd285] text-[#171329] font-bold text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Room</span>
            </button>
          </div>
        </div>

        {roomError && (
          <div className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E]/50 text-xs text-[#FF776E]">
            {roomError}
          </div>
        )}

        {rooms.length === 0 ? (
          <div
            className="p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center space-y-2.5"
            data-testid="dashboard-rooms-empty"
          >
            <DoorOpen className="w-8 h-8 text-[#56E0CB] mx-auto" />
            <p className="text-sm font-bold text-[#FFF0D7]">No Persistent Arcade Rooms Yet</p>
            <p className="text-xs text-[#FFF0D7]/70 max-w-md mx-auto">
              Create your own permanent retro gaming space, invite friends once, and launch Memory Match or Tic-Tac-Toe whenever you return.
            </p>
            <button
              type="button"
              onClick={() => {
                playClick();
                onCreateArcadeRoom();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Your First Room</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {rooms.slice(0, 4).map((room) => {
              const isOwner = room.ownerUid === profile.uid;
              return (
                <div
                  key={room.id}
                  className="p-4 rounded-2xl bg-[#201A36] border border-[#3D345F] hover:border-[#56E0CB]/60 transition-colors flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#FFF0D7] truncate">{room.name}</h3>
                        <p className="text-[11px] text-[#FFF0D7]/65 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[#FFC66D]">
                            {isOwner && <Crown className="w-3 h-3" />}
                            {isOwner ? 'Owner' : 'Member'}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {room.memberUids.length}
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            {room.visibility === 'private' ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Globe className="w-3 h-3" />
                            )}
                            {room.visibility === 'private' ? 'Private' : 'Invite-only'}
                          </span>
                        </p>
                      </div>
                      <span className="text-[10px] text-[#FFF0D7]/55 inline-flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(room.updatedAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {room.availableGames.map((gid) => (
                        <span
                          key={gid}
                          className="px-2 py-0.5 rounded-md bg-[#171329] border border-[#3D345F] text-[10px] text-[#FFF0D7]/80"
                        >
                          {gid === 'memory-match'
                            ? 'Memory Match'
                            : gid === 'tic-tac-toe'
                              ? 'Tic-Tac-Toe'
                              : 'Snake'}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#2E264A]">
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        onOpenArcadeRoom(room.id);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer"
                    >
                      Open Room
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyInvite(room)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#292342] hover:bg-[#322B50] border border-[#3D345F] text-xs text-[#FFF0D7] inline-flex items-center gap-1 cursor-pointer"
                      aria-label={`Copy invite link for ${room.name}`}
                    >
                      {copiedRoomId === room.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#56E0CB]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5 text-[#FFC66D]" />
                          <span>Invite</span>
                        </>
                      )}
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteRoom(room)}
                        disabled={deletingRoomId === room.id}
                        className="p-1.5 rounded-lg bg-[#292342] hover:bg-[#FF776E]/20 border border-[#3D345F] hover:border-[#FF776E] text-[#FF776E] cursor-pointer disabled:opacity-50"
                        aria-label={`Delete room ${room.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section C: Gaming Activity */}
      <section className="space-y-3" data-testid="dashboard-gaming-activity">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-['Press_Start_2P'] text-[11px] sm:text-xs text-[#FFC66D] uppercase tracking-wide">
            Gaming Activity
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                playClick();
                onNavigateSection('achievements');
              }}
              className="text-xs text-[#FFC66D] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Achievements ({unlockedAchievements.length}/{achievements.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playClick();
                onNavigateSection('leaderboards');
              }}
              className="text-xs text-[#56E0CB] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Rankings</span>
            </button>
          </div>
        </div>

        {!hasAnyActivity ? (
          <div
            className="p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center space-y-2"
            data-testid="dashboard-activity-empty"
          >
            <Trophy className="w-8 h-8 text-[#FFC66D] mx-auto" />
            <p className="text-sm font-bold text-[#FFF0D7]">Your Arcade Record Awaits</p>
            <p className="text-xs text-[#FFF0D7]/70 max-w-md mx-auto">
              Complete multiplayer matches to earn verified wins, Arcade XP, and leaderboard eligibility, or set private personal bests in single-player mode.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[11px] text-[#FFF0D7]/65">MP Games</p>
              <p className="text-xl font-bold text-[#FFF0D7] mt-1">{totalMpGames}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[11px] text-[#FFF0D7]/65">MP Wins</p>
              <p className="text-xl font-bold text-[#56E0CB] mt-1">{totalMpWins}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[11px] text-[#FFF0D7]/65">Draws / Losses</p>
              <p className="text-xl font-bold text-[#FFC66D] mt-1">
                {totalMpDraws} / {totalMpLosses}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[11px] text-[#FFF0D7]/65">Solo Best (Memory)</p>
              <p className="text-xl font-bold text-[#FF776E] mt-1">
                {privateRecords.memoryMatch.fastestCompletionSeconds !== null
                  ? `${privateRecords.memoryMatch.fastestCompletionSeconds}s`
                  : '—'}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

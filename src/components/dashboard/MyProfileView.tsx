/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Edit3,
  LogOut,
  ShieldCheck,
  Trophy,
  Award,
  Clock,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  PROFILE_AVATARS,
  type ProfileAvatarId,
  type UserProfile,
} from '../../types/profile';
import type {
  ArcadeXpProgress,
  EvaluatedAchievement,
  GameResultRecord,
  MultiplayerGameStats,
  PlatformGameId,
  PrivateSinglePlayerRecords,
} from '../../types/arcadePlatform';
import { getCountryByCode } from '../../data/countries';
import { updateUserProfileAtomic } from '../../logic/userProfile';
import {
  buildPublicPlayerProfile,
  loadLocalPrivacySettings,
  syncPublicPlayerProfile,
  type ProfilePrivacySettings,
} from '../../logic/publicProfiles';
import { MemorySymbolIcon } from '../game/MemorySymbolIcon';
import { CountrySelector } from '../auth/CountrySelector';
import { ArcadeXpBar } from './ArcadeXpBar';
import { AchievementBadgeIcon } from './AchievementBadgeIcon';
import { useAudio } from '../../context/AudioContext';

interface MyProfileViewProps {
  profile: UserProfile;
  xpProgress: ArcadeXpProgress;
  multiplayerStats: Record<PlatformGameId, MultiplayerGameStats>;
  privateRecords: PrivateSinglePlayerRecords;
  achievements: EvaluatedAchievement[];
  gameHistory: GameResultRecord[];
  onSignedOut: () => void;
}

export const MyProfileView: React.FC<MyProfileViewProps> = ({
  profile,
  xpProgress,
  multiplayerStats,
  privateRecords,
  achievements,
  gameHistory,
  onSignedOut,
}) => {
  const { playClick } = useAudio();
  const { setProfileState, signOut } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [countryCode, setCountryCode] = useState(profile.countryCode);
  const [avatarId, setAvatarId] = useState<ProfileAvatarId>(profile.avatarId);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<ProfilePrivacySettings>(() =>
    loadLocalPrivacySettings(profile.uid)
  );
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  const handleTogglePrivacy = async (key: keyof ProfilePrivacySettings) => {
    playClick();
    const nextPrivacy: ProfilePrivacySettings = {
      ...privacy,
      [key]: !privacy[key],
    };
    setPrivacy(nextPrivacy);
    setIsSavingPrivacy(true);
    setErrorMsg(null);
    try {
      const projection = buildPublicPlayerProfile({
        profile,
        xpProgress,
        privacy: nextPrivacy,
        privateRecords,
        achievements,
      });
      await syncPublicPlayerProfile(projection);
      setSuccessMsg('Public profile privacy settings updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save privacy settings.');
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  const country = getCountryByCode(profile.countryCode);
  const memberSince = new Date(profile.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const recentUnlocked = achievements.filter((a) => a.unlocked).slice(0, 4);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSaving(true);
    try {
      const updated = await updateUserProfileAtomic({
        uid: profile.uid,
        username,
        displayName,
        countryCode,
        avatarId,
      });
      setProfileState(updated);
      setIsEditing(false);
      setSuccessMsg('Profile updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    playClick();
    await signOut();
    onSignedOut();
  };

  return (
    <div
      className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-6"
      data-testid="dashboard-my-profile-view"
    >
      {/* Profile Header Card */}
      <section className="p-5 rounded-2xl bg-[#201A36] border-2 border-[#3D345F] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-[#171329] border-2 border-[#FFC66D] flex items-center justify-center shrink-0">
              <MemorySymbolIcon
                symbolId={profile.avatarId}
                color={PROFILE_AVATARS.find((a) => a.id === profile.avatarId)?.color ?? '#FFC66D'}
                className="w-9 h-9"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#FFF0D7] truncate">{profile.username}</h1>
              <p className="text-xs text-[#FFF0D7]/75 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span>{country?.flag ?? '🌍'}</span>
                <span>{country?.name ?? profile.countryName}</span>
                <span>•</span>
                <span>Member since {memberSince}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                playClick();
                setIsEditing((v) => !v);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              data-testid="profile-edit-toggle-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#56E0CB]" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              data-testid="profile-signout-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF776E]/15 hover:bg-[#FF776E]/25 border border-[#FF776E]/50 text-xs font-semibold text-[#FF776E] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <ArcadeXpBar progress={xpProgress} />

        {successMsg && (
          <div className="p-3 rounded-xl bg-[#56E0CB]/15 border border-[#56E0CB]/50 text-xs text-[#56E0CB] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E]/50 text-xs text-[#FF776E] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Editable Profile Form (never edits protected stats/XP/achievements) */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="pt-4 border-t border-[#2E264A] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#FFF0D7]/80 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-sm text-[#FFF0D7] outline-none focus:border-[#56E0CB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#FFF0D7]/80 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={32}
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-sm text-[#FFF0D7] outline-none focus:border-[#56E0CB]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#FFF0D7]/80 mb-1">
                Country
              </label>
              <CountrySelector value={countryCode} onChange={setCountryCode} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#FFF0D7]/80 mb-1.5">
                Arcade Avatar
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {PROFILE_AVATARS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setAvatarId(av.id)}
                    className={`p-2 rounded-xl bg-[#171329] border-2 flex items-center justify-center cursor-pointer ${
                      avatarId === av.id ? 'border-[#56E0CB]' : 'border-[#3D345F]'
                    }`}
                    title={av.label}
                  >
                    <MemorySymbolIcon symbolId={av.id} color={av.color} className="w-6 h-6" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-[#FFF0D7]/60 inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#56E0CB]" />
                Wins, XP, and achievements are server-protected.
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Multiplayer Stats vs Private Single-Player Records */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Verified Multiplayer Stats */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#56E0CB] uppercase flex items-center gap-1.5">
              <Trophy className="w-4 h-4" />
              <span>Multiplayer Stats</span>
            </h2>
            <span className="text-[10px] text-[#FFF0D7]/55">Competitive</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] flex items-center justify-between">
              <div>
                <p className="font-bold text-[#FFF0D7]">Memory Match</p>
                <p className="text-[11px] text-[#FFF0D7]/65">
                  {multiplayerStats['memory-match'].gamesPlayed} played ·{' '}
                  {multiplayerStats['memory-match'].totalPairsMatched} pairs matched
                </p>
              </div>
              <div className="text-right font-mono">
                <p className="text-[#56E0CB] font-bold">
                  {multiplayerStats['memory-match'].wins}W / {multiplayerStats['memory-match'].draws}D /{' '}
                  {multiplayerStats['memory-match'].losses}L
                </p>
                <p className="text-[11px] text-[#FFC66D]">
                  {multiplayerStats['memory-match'].winPercentage}% win rate
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] flex items-center justify-between">
              <div>
                <p className="font-bold text-[#FFF0D7]">Tic-Tac-Toe</p>
                <p className="text-[11px] text-[#FFF0D7]/65">
                  {multiplayerStats['tic-tac-toe'].gamesPlayed} played · Best streak{' '}
                  {multiplayerStats['tic-tac-toe'].bestWinStreak}
                </p>
              </div>
              <div className="text-right font-mono">
                <p className="text-[#FF776E] font-bold">
                  {multiplayerStats['tic-tac-toe'].wins}W / {multiplayerStats['tic-tac-toe'].draws}D /{' '}
                  {multiplayerStats['tic-tac-toe'].losses}L
                </p>
                <p className="text-[11px] text-[#FFC66D]">
                  {multiplayerStats['tic-tac-toe'].winPercentage}% win rate
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Private Single-Player Records */}
        <section
          className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3"
          data-testid="profile-private-records"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] uppercase flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Private Solo Records</span>
            </h2>
            <span className="text-[10px] text-[#FFF0D7]/55">Private Only</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] space-y-1">
              <p className="font-bold text-[#FFF0D7]">Memory Match Personal Bests</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#FFF0D7]/75">
                <span>
                  Fastest:{' '}
                  <strong className="text-[#56E0CB]">
                    {privateRecords.memoryMatch.fastestCompletionSeconds !== null
                      ? `${privateRecords.memoryMatch.fastestCompletionSeconds}s`
                      : '—'}
                  </strong>
                </span>
                <span>
                  Fewest Attempts:{' '}
                  <strong className="text-[#56E0CB]">
                    {privateRecords.memoryMatch.fewestAttempts ?? '—'}
                  </strong>
                </span>
                <span>
                  Best Board:{' '}
                  <strong className="text-[#FFC66D]">
                    {privateRecords.memoryMatch.highestBoardSizeCompleted
                      ? `${privateRecords.memoryMatch.highestBoardSizeCompleted} cards`
                      : '—'}
                  </strong>
                </span>
                <span>
                  Solo Wins:{' '}
                  <strong className="text-[#FFF0D7]">
                    {privateRecords.memoryMatch.gamesWon}
                  </strong>
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] space-y-1">
              <p className="font-bold text-[#FFF0D7]">Tic-Tac-Toe Personal Bests</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#FFF0D7]/75">
                <span>
                  Solo Wins:{' '}
                  <strong className="text-[#FF776E]">{privateRecords.ticTacToe.wins}</strong>
                </span>
                <span>
                  Best Streak:{' '}
                  <strong className="text-[#FFC66D]">
                    {privateRecords.ticTacToe.bestWinStreak}
                  </strong>
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] space-y-1">
              <p className="font-bold text-[#FFF0D7]">Snake Personal Bests</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#FFF0D7]/75">
                <span>
                  High Score:{' '}
                  <strong className="text-[#56E0CB]">{privateRecords.snake.highestScore}</strong>
                </span>
                <span>
                  Longest:{' '}
                  <strong className="text-[#FFC66D]">
                    {privateRecords.snake.longestSnakeLength ?? '—'}
                  </strong>
                </span>
                <span>
                  Best Time:{' '}
                  <strong className="text-[#FFF0D7]">
                    {privateRecords.snake.bestSurvivalTimeSeconds !== null
                      ? `${privateRecords.snake.bestSurvivalTimeSeconds}s`
                      : '—'}
                  </strong>
                </span>
                <span>
                  Solo Games:{' '}
                  <strong className="text-[#FFF0D7]">{privateRecords.snake.gamesPlayed}</strong>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Public Profile Privacy Settings (Both OFF by default) */}
      <section
        className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3"
        data-testid="profile-privacy-settings"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#56E0CB] uppercase flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Public Profile Sharing</span>
          </h2>
          <span className="text-[10px] text-[#FFF0D7]/60">Private by default</span>
        </div>

        <div className="space-y-2.5">
          <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#FFF0D7]">Share My Personal Bests</p>
              <p className="text-[11px] text-[#FFF0D7]/65 mt-0.5">
                Allow other players to view your personal best records for supported games on your public player profile.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacy.sharePersonalBests}
              disabled={isSavingPrivacy}
              onClick={() => void handleTogglePrivacy('sharePersonalBests')}
              data-testid="toggle-share-personal-bests"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 cursor-pointer transition-colors ${
                privacy.sharePersonalBests
                  ? 'bg-[#56E0CB] text-[#171329] border-[#56E0CB]'
                  : 'bg-[#292342] text-[#FFF0D7]/70 border-[#3D345F]'
              }`}
            >
              {privacy.sharePersonalBests ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#FFF0D7]">Share My Achievement Summary</p>
              <p className="text-[11px] text-[#FFF0D7]/65 mt-0.5">
                Allow other players to see your earned achievements and overall achievement progress.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacy.shareAchievementSummary}
              disabled={isSavingPrivacy}
              onClick={() => void handleTogglePrivacy('shareAchievementSummary')}
              data-testid="toggle-share-achievement-summary"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 cursor-pointer transition-colors ${
                privacy.shareAchievementSummary
                  ? 'bg-[#FFC66D] text-[#171329] border-[#FFC66D]'
                  : 'bg-[#292342] text-[#FFF0D7]/70 border-[#3D345F]'
              }`}
            >
              {privacy.shareAchievementSummary ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </section>

      {/* Recent Achievements */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3">
        <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] uppercase flex items-center gap-1.5">
          <Award className="w-4 h-4" />
          <span>Recent Achievements</span>
        </h2>
        {recentUnlocked.length === 0 ? (
          <p className="text-xs text-[#FFF0D7]/65">
            Play games and create arcade rooms to unlock your first badges.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {recentUnlocked.map((ach) => (
              <div
                key={ach.definition.id}
                className="p-3 rounded-xl bg-[#171329] border border-[#FFC66D]/50 flex items-center gap-2.5"
              >
                <AchievementBadgeIcon
                  artworkId={ach.definition.artworkId}
                  unlocked={true}
                  accentColor={ach.definition.accentColor}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#FFF0D7] truncate">
                    {ach.definition.name}
                  </p>
                  <p className="text-[10px] text-[#FFC66D]">+{ach.definition.xpReward} XP</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Game History */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3">
        <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#56E0CB] uppercase flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          <span>Game History</span>
        </h2>
        {gameHistory.length === 0 ? (
          <p className="text-xs text-[#FFF0D7]/65">
            No completed validated matches recorded yet. Your match history will appear here automatically.
          </p>
        ) : (
          <div className="space-y-2">
            {gameHistory.slice(0, 10).map((item) => (
              <div
                key={item.resultId}
                className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-[#FFF0D7]">
                    {item.gameId === 'memory-match' ? 'Memory Match' : 'Tic-Tac-Toe'}
                  </span>
                  <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#292342] text-[#FFF0D7]/75">
                    {item.mode}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-bold uppercase text-[11px] ${
                      item.outcome === 'win'
                        ? 'text-[#56E0CB]'
                        : item.outcome === 'draw'
                          ? 'text-[#FFC66D]'
                          : 'text-[#FF776E]'
                    }`}
                  >
                    {item.outcome}
                  </span>
                  <span className="text-[11px] text-[#FFF0D7]/60">
                    {new Date(item.completedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

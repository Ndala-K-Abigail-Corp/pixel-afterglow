/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchDocument, setDocument } from '../lib/firestore';
import { isFirebaseConfigured } from '../lib/firebase';
import type { ProfileAvatarId, UserProfile } from '../types/profile';
import type {
  ArcadeXpProgress,
  EvaluatedAchievement,
  PrivateSinglePlayerRecords,
} from '../types/arcadePlatform';

export const PUBLIC_PROFILES_COLLECTION = 'publicProfiles';

export interface ProfilePrivacySettings {
  sharePersonalBests: boolean;
  shareAchievementSummary: boolean;
}

export const DEFAULT_PROFILE_PRIVACY: Readonly<ProfilePrivacySettings> = {
  sharePersonalBests: false,
  shareAchievementSummary: false,
};

export interface SharedPersonalBests {
  memoryMatch: {
    fastestCompletionSeconds: number | null;
    fewestAttempts: number | null;
    highestBoardSizeCompleted: number | null;
    gamesWon: number;
  };
  ticTacToe: {
    wins: number;
    bestWinStreak: number;
  };
  snake: {
    highestScore: number;
    longestSnakeLength: number | null;
    bestSurvivalTimeSeconds: number | null;
  };
}

export interface SharedAchievementSummary {
  unlockedCount: number;
  totalActiveCount: number;
  recentUnlocked: Array<{
    id: string;
    name: string;
    category: string;
    xpReward: number;
  }>;
}

/**
 * Restricted public projection stored at `publicProfiles/{uid}`.
 * Strictly omits email, private account metadata, detailed game history,
 * locked achievements, and room membership information.
 */
export interface PublicPlayerProfile {
  uid: string;
  username: string;
  avatarId: ProfileAvatarId;
  countryCode: string;
  countryName: string;
  arcadeLevel: number;
  arcadeLevelTitle: string;
  totalXp: number;
  sharePersonalBests: boolean;
  shareAchievementSummary: boolean;
  sharedPersonalBests: SharedPersonalBests | null;
  sharedAchievementSummary: SharedAchievementSummary | null;
  updatedAt: number;
}

const LOCAL_PRIVACY_PREFIX = 'pixel_afterglow_privacy_v1_';

export function loadLocalPrivacySettings(uid: string): ProfilePrivacySettings {
  if (!uid || typeof window === 'undefined') return { ...DEFAULT_PROFILE_PRIVACY };
  try {
    const raw = window.localStorage.getItem(`${LOCAL_PRIVACY_PREFIX}${uid}`);
    if (!raw) return { ...DEFAULT_PROFILE_PRIVACY };
    const parsed = JSON.parse(raw) as Partial<ProfilePrivacySettings>;
    return {
      sharePersonalBests: Boolean(parsed.sharePersonalBests),
      shareAchievementSummary: Boolean(parsed.shareAchievementSummary),
    };
  } catch {
    return { ...DEFAULT_PROFILE_PRIVACY };
  }
}

export function saveLocalPrivacySettings(uid: string, settings: ProfilePrivacySettings): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LOCAL_PRIVACY_PREFIX}${uid}`, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Pure builder for the restricted public player profile projection.
 * Enforces privacy by stripping personal bests and achievement summaries whenever disabled.
 */
export function buildPublicPlayerProfile(params: {
  profile: UserProfile;
  xpProgress: ArcadeXpProgress;
  privacy: ProfilePrivacySettings;
  privateRecords: PrivateSinglePlayerRecords;
  achievements: EvaluatedAchievement[];
  nowMs?: number;
}): PublicPlayerProfile {
  const { profile, xpProgress, privacy, privateRecords, achievements } = params;
  const unlocked = achievements.filter((a) => a.unlocked);

  return {
    uid: profile.uid,
    username: profile.username,
    avatarId: profile.avatarId,
    countryCode: profile.countryCode,
    countryName: profile.countryName,
    arcadeLevel: xpProgress.level,
    arcadeLevelTitle: xpProgress.title,
    totalXp: xpProgress.totalXp,
    sharePersonalBests: privacy.sharePersonalBests,
    shareAchievementSummary: privacy.shareAchievementSummary,
    sharedPersonalBests: privacy.sharePersonalBests
      ? {
          memoryMatch: {
            fastestCompletionSeconds: privateRecords.memoryMatch.fastestCompletionSeconds,
            fewestAttempts: privateRecords.memoryMatch.fewestAttempts,
            highestBoardSizeCompleted: privateRecords.memoryMatch.highestBoardSizeCompleted,
            gamesWon: privateRecords.memoryMatch.gamesWon,
          },
          ticTacToe: {
            wins: privateRecords.ticTacToe.wins,
            bestWinStreak: privateRecords.ticTacToe.bestWinStreak,
          },
          snake: {
            highestScore: privateRecords.snake.highestScore,
            longestSnakeLength: privateRecords.snake.longestSnakeLength,
            bestSurvivalTimeSeconds: privateRecords.snake.bestSurvivalTimeSeconds,
          },
        }
      : null,
    sharedAchievementSummary: privacy.shareAchievementSummary
      ? {
          unlockedCount: unlocked.length,
          totalActiveCount: achievements.length,
          recentUnlocked: unlocked.slice(0, 4).map((a) => ({
            id: a.definition.id,
            name: a.definition.name,
            category: a.definition.category,
            xpReward: a.definition.xpReward,
          })),
        }
      : null,
    updatedAt: params.nowMs ?? Date.now(),
  };
}

/**
 * Persists the owner's restricted public projection to `publicProfiles/{uid}`.
 */
export async function syncPublicPlayerProfile(
  publicProfile: PublicPlayerProfile
): Promise<void> {
  saveLocalPrivacySettings(publicProfile.uid, {
    sharePersonalBests: publicProfile.sharePersonalBests,
    shareAchievementSummary: publicProfile.shareAchievementSummary,
  });

  if (!isFirebaseConfigured()) return;
  await setDocument<PublicPlayerProfile>(
    PUBLIC_PROFILES_COLLECTION,
    publicProfile.uid,
    publicProfile
  );
}

/**
 * Reads another player's restricted public projection from `publicProfiles/{uid}`.
 */
export async function fetchPublicPlayerProfile(
  uid: string
): Promise<PublicPlayerProfile | null> {
  if (!uid || !isFirebaseConfigured()) return null;
  try {
    return await fetchDocument<PublicPlayerProfile>(PUBLIC_PROFILES_COLLECTION, uid);
  } catch {
    return null;
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProfileAvatarId } from './profile';

export type PlatformGameId = 'memory-match' | 'tic-tac-toe' | 'snake';
export type PlayablePlatformGameId = 'memory-match' | 'tic-tac-toe';
export type GameModeCategory = 'multiplayer' | 'single-player';
export type MatchOutcome = 'win' | 'loss' | 'draw';

/**
 * Validated game result stored at `users/{uid}/gameHistory/{resultId}`.
 * Deterministic `resultId` guarantees idempotent processing and prevents duplicates.
 */
export interface GameResultRecord {
  resultId: string;
  gameId: PlatformGameId;
  sessionId: string;
  playerUid: string;
  completedAt: number; // UTC epoch ms
  mode: GameModeCategory;
  outcome: MatchOutcome;
  score: number;
  durationSeconds: number | null;
  validated: boolean;
  arcadeRoomId?: string | null;
  roomCode?: string | null;
  opponentUids?: string[];
  metrics?: {
    pairsMatched?: number;
    totalPairs?: number;
    mismatches?: number;
    attempts?: number;
    cardCount?: number;
    difficulty?: string;
    survivalSeconds?: number;
    snakeLength?: number;
  };
}

/**
 * Competitive multiplayer statistics for a single game (strictly separate from single-player).
 * Stored at `users/{uid}/gameStats/{gameId}` (server-authoritative for competitive integrity).
 */
export interface MultiplayerGameStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number; // 0-100 rounded to 1 decimal
  totalPairsMatched: number;
  highestScore: number;
  currentWinStreak: number;
  bestWinStreak: number;
  lastPlayedAt: number | null;
}

/**
 * Private single-player personal bests (never mixed into competitive multiplayer leaderboards).
 */
export interface SinglePlayerMemoryRecords {
  gamesPlayed: number;
  gamesWon: number;
  fastestCompletionSeconds: number | null;
  fewestAttempts: number | null;
  fewestMismatches: number | null;
  highestBoardSizeCompleted: number | null;
  lastPlayedAt: number | null;
}

export interface SinglePlayerTicTacToeRecords {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  currentWinStreak: number;
  bestWinStreak: number;
  difficultiesCompleted: string[];
  lastPlayedAt: number | null;
}

export interface SinglePlayerSnakeRecords {
  gamesPlayed: number;
  highestScore: number;
  bestSurvivalTimeSeconds: number | null;
  longestSnakeLength: number | null;
  lastPlayedAt: number | null;
}

export interface PrivateSinglePlayerRecords {
  uid: string;
  memoryMatch: SinglePlayerMemoryRecords;
  ticTacToe: SinglePlayerTicTacToeRecords;
  snake: SinglePlayerSnakeRecords;
  updatedAt: number;
}

export interface PlayerGameStatsDoc {
  uid: string;
  gameId: PlatformGameId;
  multiplayer: MultiplayerGameStats;
  lastResultId?: string;
  updatedAt: number;
}

/**
 * Arcade XP & Level Progression (`users/{uid}/progression/arcade`).
 */
export interface ArcadeLevelDefinition {
  level: number;
  title: string;
  minXp: number;
}

export interface ArcadeXpProgress {
  level: number;
  title: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevel: number | null;
  nextLevelTitle: string | null;
  nextLevelMinXp: number | null;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number;
  progressPercent: number;
  isMaxDefinedLevel: boolean;
}

export interface PlayerProgressionDoc {
  uid: string;
  totalXp: number;
  level: number;
  levelTitle: string;
  processedEventIds: string[];
  distinctOpponentUids: string[];
  activeDayKeys: string[]; // YYYY-MM-DD (UTC)
  playedGameIds: PlatformGameId[];
  reactionsReceived: number;
  persistentRoomsCreated: number;
  updatedAt: number;
}

/**
 * Achievements (`users/{uid}/achievements/{achievementId}`).
 */
export type AchievementCategory = 'platform' | 'memory-match' | 'tic-tac-toe' | 'snake';

export type AchievementArtworkId =
  | 'welcome-cabinet'
  | 'room-key'
  | 'social-spark'
  | 'calendar-star'
  | 'cartridge-rack'
  | 'heart-burst'
  | 'memory-brain'
  | 'lightning-timer'
  | 'perfect-diamond'
  | 'memory-crown'
  | 'pair-master'
  | 'ttt-first-win'
  | 'ttt-shield'
  | 'ttt-flame'
  | 'ttt-balance'
  | 'snake-apple'
  | 'snake-coil'
  | 'snake-hourglass'
  | 'snake-trophy';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  artworkId: AchievementArtworkId;
  accentColor: string;
  xpReward: number;
  target: number;
  active: boolean;
}

export interface PlayerAchievementDoc {
  achievementId: string;
  uid: string;
  unlocked: boolean;
  progress: number;
  target: number;
  unlockedAt: number | null;
  xpAwarded: number;
}

export interface EvaluatedAchievement {
  definition: AchievementDefinition;
  unlocked: boolean;
  progress: number;
  target: number;
  progressPercent: number;
  unlockedAt: number | null;
}

/**
 * Competitive Multiplayer Leaderboards (`leaderboardEntries/{entryId}`).
 */
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all-time';
export type LeaderboardScope = 'global' | 'country';

export interface LeaderboardEntryDoc {
  entryId: string;
  uid: string;
  username: string;
  avatarId: ProfileAvatarId;
  countryCode: string;
  countryName: string;
  gameId: PlatformGameId;
  period: LeaderboardPeriod;
  periodKey: string; // 'all-time' | 'YYYY-MM' | 'YYYY-Www'
  isAnonymous: false;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  lastResultId?: string;
  updatedAt: number;
}

export interface RankedLeaderboardEntry extends LeaderboardEntryDoc {
  rank: number;
}

export interface LeaderboardQualificationStatus {
  gameId: PlatformGameId;
  completedGames: number;
  requiredGames: number;
  remainingGames: number;
  isQualified: boolean;
  message: string;
}

/**
 * Authenticated Dashboard Navigation Views.
 */
export type DashboardSection =
  | 'arcade-home'
  | 'games'
  | 'my-rooms'
  | 'leaderboards'
  | 'achievements'
  | 'whats-new'
  | 'feedback'
  | 'my-reports'
  | 'admin'
  | 'my-profile';

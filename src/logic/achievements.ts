/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type {
  AchievementDefinition,
  EvaluatedAchievement,
  GameResultRecord,
  MultiplayerGameStats,
  PlatformGameId,
  PlayerAchievementDoc,
  PlayerProgressionDoc,
  PrivateSinglePlayerRecords,
} from '../types/arcadePlatform';

export const ACHIEVEMENTS_SUBCOLLECTION = 'achievements';

/** Configurable threshold constants for gameplay achievements */
export const ACHIEVEMENT_THRESHOLDS = {
  socialButterflyOpponents: 10,
  arcadeRegularDays: 5,
  crowdFavouriteReactions: 50,
  quickThinkerMaxSeconds: 60,
  masterOfPairsTarget: 100,
  tttUnbeatableWins: 10,
  tttWinningStreakTarget: 5,
  tttDrawSpecialistTarget: 10,
  playableGamesCount: 3, // Memory Match + Tic-Tac-Toe + Snake
} as const;

/**
 * Complete Achievement Catalog.
 * Snake achievements are defined with `active: false` until Snake gameplay is implemented.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  // Platform Achievements
  {
    id: 'welcome-to-the-arcade',
    name: 'Welcome to the Arcade',
    description: 'Create a registered Pixel Afterglow account and complete your player profile.',
    category: 'platform',
    artworkId: 'welcome-cabinet',
    accentColor: '#56E0CB',
    xpReward: 50,
    target: 1,
    active: true,
  },
  {
    id: 'room-host',
    name: 'Room Host',
    description: 'Create your own persistent user-owned arcade room.',
    category: 'platform',
    artworkId: 'room-key',
    accentColor: '#FFC66D',
    xpReward: 75,
    target: 1,
    active: true,
  },
  {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Play multiplayer matches with 10 different registered players.',
    category: 'platform',
    artworkId: 'social-spark',
    accentColor: '#FF776E',
    xpReward: 150,
    target: ACHIEVEMENT_THRESHOLDS.socialButterflyOpponents,
    active: true,
  },
  {
    id: 'arcade-regular',
    name: 'Arcade Regular',
    description: 'Play validated games on 5 different days.',
    category: 'platform',
    artworkId: 'calendar-star',
    accentColor: '#FFC66D',
    xpReward: 120,
    target: ACHIEVEMENT_THRESHOLDS.arcadeRegularDays,
    active: true,
  },
  {
    id: 'game-collector',
    name: 'Game Collector',
    description: 'Play every currently available game in Pixel Afterglow.',
    category: 'platform',
    artworkId: 'cartridge-rack',
    accentColor: '#56E0CB',
    xpReward: 100,
    target: ACHIEVEMENT_THRESHOLDS.playableGamesCount,
    active: true,
  },
  {
    id: 'crowd-favourite',
    name: 'Crowd Favourite',
    description: 'Receive 50 arcade reactions from other players in multiplayer rooms.',
    category: 'platform',
    artworkId: 'heart-burst',
    accentColor: '#FF776E',
    xpReward: 125,
    target: ACHIEVEMENT_THRESHOLDS.crowdFavouriteReactions,
    active: true,
  },

  // Memory Match Achievements
  {
    id: 'sharp-memory',
    name: 'Sharp Memory',
    description: 'Complete your first Memory Match game.',
    category: 'memory-match',
    artworkId: 'memory-brain',
    accentColor: '#56E0CB',
    xpReward: 40,
    target: 1,
    active: true,
  },
  {
    id: 'quick-thinker',
    name: 'Quick Thinker',
    description: `Complete a Memory Match game in ${ACHIEVEMENT_THRESHOLDS.quickThinkerMaxSeconds} seconds or less.`,
    category: 'memory-match',
    artworkId: 'lightning-timer',
    accentColor: '#FFC66D',
    xpReward: 100,
    target: 1,
    active: true,
  },
  {
    id: 'perfect-recall',
    name: 'Perfect Recall',
    description: 'Complete a Memory Match game with zero mismatches.',
    category: 'memory-match',
    artworkId: 'perfect-diamond',
    accentColor: '#56E0CB',
    xpReward: 160,
    target: 1,
    active: true,
  },
  {
    id: 'memory-champion',
    name: 'Memory Champion',
    description: 'Win a verified multiplayer Memory Match game.',
    category: 'memory-match',
    artworkId: 'memory-crown',
    accentColor: '#FFC66D',
    xpReward: 100,
    target: 1,
    active: true,
  },
  {
    id: 'master-of-pairs',
    name: 'Master of Pairs',
    description: `Match ${ACHIEVEMENT_THRESHOLDS.masterOfPairsTarget} pairs across Memory Match games.`,
    category: 'memory-match',
    artworkId: 'pair-master',
    accentColor: '#56E0CB',
    xpReward: 150,
    target: ACHIEVEMENT_THRESHOLDS.masterOfPairsTarget,
    active: true,
  },

  // Tic-Tac-Toe Achievements
  {
    id: 'first-victory',
    name: 'First Victory',
    description: 'Win your first Tic-Tac-Toe game.',
    category: 'tic-tac-toe',
    artworkId: 'ttt-first-win',
    accentColor: '#FF776E',
    xpReward: 40,
    target: 1,
    active: true,
  },
  {
    id: 'unbeatable',
    name: 'Unbeatable',
    description: `Win ${ACHIEVEMENT_THRESHOLDS.tttUnbeatableWins} Tic-Tac-Toe games.`,
    category: 'tic-tac-toe',
    artworkId: 'ttt-shield',
    accentColor: '#FF776E',
    xpReward: 120,
    target: ACHIEVEMENT_THRESHOLDS.tttUnbeatableWins,
    active: true,
  },
  {
    id: 'winning-streak',
    name: 'Winning Streak',
    description: `Win ${ACHIEVEMENT_THRESHOLDS.tttWinningStreakTarget} consecutive Tic-Tac-Toe games.`,
    category: 'tic-tac-toe',
    artworkId: 'ttt-flame',
    accentColor: '#FFC66D',
    xpReward: 150,
    target: ACHIEVEMENT_THRESHOLDS.tttWinningStreakTarget,
    active: true,
  },
  {
    id: 'draw-specialist',
    name: 'Draw Specialist',
    description: `Complete ${ACHIEVEMENT_THRESHOLDS.tttDrawSpecialistTarget} Tic-Tac-Toe draws.`,
    category: 'tic-tac-toe',
    artworkId: 'ttt-balance',
    accentColor: '#56E0CB',
    xpReward: 100,
    target: ACHIEVEMENT_THRESHOLDS.tttDrawSpecialistTarget,
    active: true,
  },

  // Snake Single-Player Achievements (Active)
  {
    id: 'snake-first-bite',
    name: 'First Bite',
    description: 'Complete your first Snake game.',
    category: 'snake',
    artworkId: 'snake-apple',
    accentColor: '#FFC66D',
    xpReward: 40,
    target: 1,
    active: true,
  },
  {
    id: 'snake-growing-strong',
    name: 'Growing Strong',
    description: 'Reach a snake length of 10 in a single run.',
    category: 'snake',
    artworkId: 'snake-coil',
    accentColor: '#56E0CB',
    xpReward: 60,
    target: 10,
    active: true,
  },
  {
    id: 'snake-hungry',
    name: 'Hungry Snake',
    description: 'Collect 25 apples in a single Snake game.',
    category: 'snake',
    artworkId: 'snake-apple',
    accentColor: '#FF776E',
    xpReward: 110,
    target: 25,
    active: true,
  },
  {
    id: 'snake-survivor',
    name: 'Snake Survivor',
    description: 'Survive for 2 minutes (120 seconds) in a Snake run.',
    category: 'snake',
    artworkId: 'snake-hourglass',
    accentColor: '#FF776E',
    xpReward: 100,
    target: 120,
    active: true,
  },
  {
    id: 'snake-getting-faster',
    name: 'Getting Faster',
    description: 'Reach a score of 50 in Snake.',
    category: 'snake',
    artworkId: 'lightning-timer',
    accentColor: '#FFC66D',
    xpReward: 70,
    target: 50,
    active: true,
  },
  {
    id: 'snake-master',
    name: 'Snake Master',
    description: 'Reach a score of 100 in Snake.',
    category: 'snake',
    artworkId: 'snake-trophy',
    accentColor: '#FFC66D',
    xpReward: 130,
    target: 100,
    active: true,
  },
  {
    id: 'snake-high-score-hero',
    name: 'High Score Hero',
    description: 'Beat your previous personal best score in Snake.',
    category: 'snake',
    artworkId: 'perfect-diamond',
    accentColor: '#56E0CB',
    xpReward: 80,
    target: 1,
    active: true,
  },

  // Snake Multiplayer Achievements (Active)
  {
    id: 'snake-social',
    name: 'Snake Social',
    description: 'Complete your first multiplayer Snake match.',
    category: 'snake',
    artworkId: 'social-spark',
    accentColor: '#56E0CB',
    xpReward: 50,
    target: 1,
    active: true,
  },
  {
    id: 'snake-first-victory',
    name: 'First Snake Victory',
    description: 'Win your first multiplayer Snake match.',
    category: 'snake',
    artworkId: 'memory-crown',
    accentColor: '#FFC66D',
    xpReward: 90,
    target: 1,
    active: true,
  },
  {
    id: 'snake-arena-champion',
    name: 'Arena Champion',
    description: 'Win 10 multiplayer Snake matches.',
    category: 'snake',
    artworkId: 'snake-trophy',
    accentColor: '#FFC66D',
    xpReward: 180,
    target: 10,
    active: true,
  },
  {
    id: 'snake-last-standing',
    name: 'Last Snake Standing',
    description: 'Win a multiplayer Snake match with at least 3 participants.',
    category: 'snake',
    artworkId: 'ttt-shield',
    accentColor: '#FF776E',
    xpReward: 120,
    target: 1,
    active: true,
  },
  {
    id: 'snake-competitive-spirit',
    name: 'Competitive Spirit',
    description: 'Complete 25 multiplayer Snake matches.',
    category: 'snake',
    artworkId: 'calendar-star',
    accentColor: '#56E0CB',
    xpReward: 150,
    target: 25,
    active: true,
  },
  {
    id: 'snake-winning-streak',
    name: 'Snake Winning Streak',
    description: 'Win 3 consecutive multiplayer Snake matches.',
    category: 'snake',
    artworkId: 'ttt-flame',
    accentColor: '#FF776E',
    xpReward: 140,
    target: 3,
    active: true,
  },
] as const;

export function getActiveAchievements(): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((a) => a.active);
}

export interface AchievementEvaluationContext {
  hasCompletedProfile: boolean;
  persistentRoomsCreated: number;
  progression: PlayerProgressionDoc;
  multiplayerStats: Record<PlatformGameId, MultiplayerGameStats>;
  privateRecords: PrivateSinglePlayerRecords;
  recentHistory?: GameResultRecord[];
  storedAchievements?: Record<string, PlayerAchievementDoc>;
}

/**
 * Computes progress and unlock status for all active achievements.
 * Never activates inactive achievements (such as Snake before launch).
 */
export function evaluatePlayerAchievements(
  ctx: AchievementEvaluationContext
): EvaluatedAchievement[] {
  const mmMp = ctx.multiplayerStats['memory-match'];
  const tttMp = ctx.multiplayerStats['tic-tac-toe'];
  const snakeMp = ctx.multiplayerStats.snake;
  const mmSp = ctx.privateRecords.memoryMatch;
  const tttSp = ctx.privateRecords.ticTacToe;
  const snakeSp = ctx.privateRecords.snake;
  const history = ctx.recentHistory ?? [];
  const stored = ctx.storedAchievements ?? {};

  const playedPlayableGames = new Set<PlatformGameId>(
    ctx.progression.playedGameIds.filter(
      (g) => g === 'memory-match' || g === 'tic-tac-toe' || g === 'snake'
    )
  );
  if (mmMp.gamesPlayed > 0 || mmSp.gamesPlayed > 0) playedPlayableGames.add('memory-match');
  if (tttMp.gamesPlayed > 0 || tttSp.gamesPlayed > 0) playedPlayableGames.add('tic-tac-toe');
  if (snakeMp.gamesPlayed > 0 || snakeSp.gamesPlayed > 0) playedPlayableGames.add('snake');

  const hasQuickMemoryWin =
    (mmSp.fastestCompletionSeconds !== null &&
      mmSp.fastestCompletionSeconds <= ACHIEVEMENT_THRESHOLDS.quickThinkerMaxSeconds) ||
    history.some(
      (h) =>
        h.gameId === 'memory-match' &&
        h.outcome === 'win' &&
        h.durationSeconds !== null &&
        h.durationSeconds <= ACHIEVEMENT_THRESHOLDS.quickThinkerMaxSeconds
    );

  const hasPerfectRecall =
    mmSp.fewestMismatches === 0 ||
    history.some(
      (h) =>
        h.gameId === 'memory-match' &&
        h.outcome === 'win' &&
        h.metrics?.mismatches === 0
    );

  const totalMemoryPairs =
    mmMp.totalPairsMatched +
    history
      .filter((h) => h.gameId === 'memory-match' && h.mode === 'single-player')
      .reduce((acc, h) => acc + Math.max(0, h.metrics?.pairsMatched ?? 0), 0);

  const totalTttWins = tttMp.wins + tttSp.wins;
  const bestTttStreak = Math.max(tttMp.bestWinStreak, tttSp.bestWinStreak);
  const totalTttDraws = tttMp.draws + tttSp.draws;

  const snakeBestScore = Math.max(snakeSp.highestScore, snakeMp.highestScore);
  const snakeLongestLen = snakeSp.longestSnakeLength ?? 0;
  const snakeBestSurvival = snakeSp.bestSurvivalTimeSeconds ?? 0;
  const snakeBestApplesInRun = Math.max(
    Math.floor(snakeBestScore / 10),
    ...history
      .filter((h) => h.gameId === 'snake')
      .map((h) => Math.floor(h.score / 10))
  );
  const wonThreePlusSnakeMp = history.some(
    (h) =>
      h.gameId === 'snake' &&
      h.mode === 'multiplayer' &&
      h.outcome === 'win' &&
      (h.opponentUids?.length ?? 0) >= 2
  );

  const progressById: Record<string, number> = {
    'welcome-to-the-arcade': ctx.hasCompletedProfile ? 1 : 0,
    'room-host': Math.max(ctx.persistentRoomsCreated, ctx.progression.persistentRoomsCreated),
    'social-butterfly': ctx.progression.distinctOpponentUids.length,
    'arcade-regular': ctx.progression.activeDayKeys.length,
    'game-collector': playedPlayableGames.size,
    'crowd-favourite': ctx.progression.reactionsReceived,
    'sharp-memory': mmMp.gamesPlayed + mmSp.gamesPlayed > 0 ? 1 : 0,
    'quick-thinker': hasQuickMemoryWin ? 1 : 0,
    'perfect-recall': hasPerfectRecall ? 1 : 0,
    'memory-champion': mmMp.wins > 0 ? 1 : 0,
    'master-of-pairs': totalMemoryPairs,
    'first-victory': totalTttWins > 0 ? 1 : 0,
    unbeatable: totalTttWins,
    'winning-streak': bestTttStreak,
    'draw-specialist': totalTttDraws,
    // Snake Single-Player
    'snake-first-bite': snakeSp.gamesPlayed > 0 ? 1 : 0,
    'snake-growing-strong': snakeLongestLen,
    'snake-hungry': snakeBestApplesInRun,
    'snake-survivor': snakeBestSurvival,
    'snake-getting-faster': snakeBestScore,
    'snake-master': snakeBestScore,
    'snake-high-score-hero': snakeSp.gamesPlayed >= 2 && snakeSp.highestScore > 0 ? 1 : 0,
    // Snake Multiplayer
    'snake-social': snakeMp.gamesPlayed > 0 ? 1 : 0,
    'snake-first-victory': snakeMp.wins > 0 ? 1 : 0,
    'snake-arena-champion': snakeMp.wins,
    'snake-last-standing': wonThreePlusSnakeMp ? 1 : 0,
    'snake-competitive-spirit': snakeMp.gamesPlayed,
    'snake-winning-streak': snakeMp.bestWinStreak,
  };

  return getActiveAchievements().map((definition) => {
    const existing = stored[definition.id];
    const computedProgress = Math.min(definition.target, Math.max(0, progressById[definition.id] ?? 0));
    const progress = existing?.unlocked
      ? definition.target
      : Math.max(existing?.progress ?? 0, computedProgress);
    const unlocked = Boolean(existing?.unlocked || progress >= definition.target);
    const progressPercent = Math.min(100, Math.round((progress / definition.target) * 100));

    return {
      definition,
      unlocked,
      progress,
      target: definition.target,
      progressPercent,
      unlockedAt: existing?.unlockedAt ?? null,
    };
  });
}

/**
 * Pure server-side helper to identify newly unlocked achievements that have NOT yet been granted.
 * Guarantees one-time unlock and prevents duplicate XP awards.
 */
export function computeNewlyUnlockedAchievements(
  evaluated: readonly EvaluatedAchievement[],
  existingStored: Record<string, PlayerAchievementDoc>,
  uid: string,
  nowMs = Date.now()
): { newlyUnlocked: PlayerAchievementDoc[]; totalXpReward: number } {
  const newlyUnlocked: PlayerAchievementDoc[] = [];
  let totalXpReward = 0;

  for (const item of evaluated) {
    if (!item.definition.active || !item.unlocked) continue;
    const prev = existingStored[item.definition.id];
    if (prev?.unlocked) continue;

    newlyUnlocked.push({
      achievementId: item.definition.id,
      uid,
      unlocked: true,
      progress: item.definition.target,
      target: item.definition.target,
      unlockedAt: nowMs,
      xpAwarded: item.definition.xpReward,
    });
    totalXpReward += item.definition.xpReward;
  }

  return { newlyUnlocked, totalXpReward };
}

/**
 * Reads stored server-validated achievements from `users/{uid}/achievements`.
 */
export async function fetchStoredPlayerAchievements(
  uid: string
): Promise<Record<string, PlayerAchievementDoc>> {
  if (!uid || !isFirebaseConfigured()) return {};
  try {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, `users/${uid}/${ACHIEVEMENTS_SUBCOLLECTION}`));
    const map: Record<string, PlayerAchievementDoc> = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as PlayerAchievementDoc;
      map[data.achievementId || docSnap.id] = data;
    });
    return map;
  } catch {
    return {};
  }
}

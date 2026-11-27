/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trusted Backend Validation & Aggregation Engine (Firebase Cloud Functions Reference).
 *
 * SECURITY ARCHITECTURE:
 * - Firestore Security Rules strictly DENY client writes to:
 *     - `users/{uid}/gameStats/{gameId}`
 *     - `users/{uid}/gameHistory/{resultId}`
 *     - `users/{uid}/achievements/{achievementId}`
 *     - `users/{uid}/progression/{docId}`
 *     - `leaderboardEntries/{entryId}`
 * - Only a trusted server environment (Firebase Cloud Functions using Admin SDK) should
 *   invoke this processor when a multiplayer match transitions to `status == 'completed'`.
 * - No Firebase Admin credentials or privileged service keys exist in frontend code.
 *
 * KNOWN ARCHITECTURAL LIMITATION (Documented Explicitly):
 * - Multiplayer Memory Match currently evaluates card flips client-side inside Firestore
 *   transactions (with Security Rules capping `pairDelta <= 1`, enforcing turn ownership,
 *   and preventing pair-ownership overwrites). Full server-authoritative anti-cheat for
 *   Memory Match requires moving the hidden deck into a server-only subcollection and
 *   resolving card flips via a Callable Cloud Function. Until then, the backend processor
 *   verifies room integrity, player membership, non-anonymous auth status, and idempotency
 *   keys before crediting competitive leaderboard entries, XP, and achievements.
 */

import type {
  GameResultRecord,
  LeaderboardEntryDoc,
  LeaderboardPeriod,
  MultiplayerGameStats,
  PlatformGameId,
  PlayerAchievementDoc,
  PlayerProgressionDoc,
  PrivateSinglePlayerRecords,
} from '../types/arcadePlatform';
import type { ProfileAvatarId } from '../types/profile';
import {
  applyMultiplayerResultToStats,
  buildGameResultId,
  calculateWinPercentage,
  createEmptyMultiplayerGameStats,
} from '../logic/gameHistory';
import {
  ARCADE_XP_REWARDS,
  applyIdempotentXpAward,
  getUtcDayKey,
} from '../logic/arcadeProgression';
import {
  computeNewlyUnlockedAchievements,
  evaluatePlayerAchievements,
} from '../logic/achievements';
import {
  buildLeaderboardEntryId,
  getLeaderboardPeriodKey,
} from '../logic/leaderboards';

export interface TrustedPlayerSnapshot {
  uid: string;
  username: string;
  avatarId: ProfileAvatarId;
  countryCode: string;
  countryName: string;
  isAnonymous: boolean;
  hasCompletedProfile: boolean;
  persistentRoomsCreated: number;
  progression: PlayerProgressionDoc;
  multiplayerStats: Record<PlatformGameId, MultiplayerGameStats>;
  privateRecords: PrivateSinglePlayerRecords;
  storedAchievements: Record<string, PlayerAchievementDoc>;
  processedResultIds: ReadonlySet<string>;
  existingLeaderboardEntries: Record<string, LeaderboardEntryDoc>;
}

export interface CompletedMultiplayerMatchInput {
  sessionId: string;
  gameId: PlatformGameId;
  completedAt: number;
  arcadeRoomId?: string | null;
  roomCode?: string | null;
  participants: Array<{
    uid: string;
    outcome: 'win' | 'loss' | 'draw';
    score: number;
    pairsMatched?: number;
    totalPairs?: number;
    mismatches?: number;
    cardCount?: number;
  }>;
  durationSeconds: number | null;
}

export interface ProcessedPlayerResultBundle {
  uid: string;
  skippedReason?: 'anonymous' | 'duplicate';
  resultRecord?: GameResultRecord;
  updatedMultiplayerStats?: MultiplayerGameStats;
  updatedProgression?: PlayerProgressionDoc;
  newlyUnlockedAchievements: PlayerAchievementDoc[];
  xpAwardedTotal: number;
  leveledUp: boolean;
  updatedLeaderboardEntries: LeaderboardEntryDoc[];
}

/**
 * Pure, deterministic trusted backend processor for a completed multiplayer match.
 * Designed to run inside a Cloud Function Firestore trigger (`onDocumentUpdated('rooms/{roomCode}')`)
 * within a Firestore transaction using Admin SDK.
 */
export function processCompletedMultiplayerMatchForPlayer(
  player: TrustedPlayerSnapshot,
  match: CompletedMultiplayerMatchInput
): ProcessedPlayerResultBundle {
  // 1. Anonymous players are excluded from permanent progression and public leaderboards.
  if (player.isAnonymous || !player.uid) {
    return {
      uid: player.uid,
      skippedReason: 'anonymous',
      newlyUnlockedAchievements: [],
      xpAwardedTotal: 0,
      leveledUp: false,
      updatedLeaderboardEntries: [],
    };
  }

  const participant = match.participants.find((p) => p.uid === player.uid);
  if (!participant) {
    return {
      uid: player.uid,
      skippedReason: 'duplicate',
      newlyUnlockedAchievements: [],
      xpAwardedTotal: 0,
      leveledUp: false,
      updatedLeaderboardEntries: [],
    };
  }

  // 2. Deterministic result ID guarantees idempotency across retries.
  const resultId = buildGameResultId({
    gameId: match.gameId,
    mode: 'multiplayer',
    sessionId: match.sessionId,
    playerUid: player.uid,
  });

  if (player.processedResultIds.has(resultId)) {
    return {
      uid: player.uid,
      skippedReason: 'duplicate',
      newlyUnlockedAchievements: [],
      xpAwardedTotal: 0,
      leveledUp: false,
      updatedLeaderboardEntries: [],
    };
  }

  const opponentUids = match.participants
    .map((p) => p.uid)
    .filter((id) => id && id !== player.uid);

  const resultRecord: GameResultRecord = {
    resultId,
    gameId: match.gameId,
    sessionId: match.sessionId,
    playerUid: player.uid,
    completedAt: match.completedAt,
    mode: 'multiplayer',
    outcome: participant.outcome,
    score: Math.max(0, participant.score),
    durationSeconds: match.durationSeconds,
    validated: true,
    arcadeRoomId: match.arcadeRoomId ?? null,
    roomCode: match.roomCode ?? null,
    opponentUids,
    metrics: {
      pairsMatched: participant.pairsMatched,
      totalPairs: participant.totalPairs,
      mismatches: participant.mismatches,
      cardCount: participant.cardCount,
    },
  };

  // 3. Update competitive multiplayer stats (strictly separate from single-player).
  const currentGameStats =
    player.multiplayerStats[match.gameId] ?? createEmptyMultiplayerGameStats();
  const { stats: nextGameStats } = applyMultiplayerResultToStats(
    currentGameStats,
    resultRecord,
    player.processedResultIds
  );

  const nextAllMpStats: Record<PlatformGameId, MultiplayerGameStats> = {
    ...player.multiplayerStats,
    [match.gameId]: nextGameStats,
  };

  // 4. Update progression metadata (distinct opponents, active UTC days, played games).
  const dayKey = getUtcDayKey(match.completedAt);
  const nextOpponents = Array.from(
    new Set([...player.progression.distinctOpponentUids, ...opponentUids])
  );
  const nextDays = Array.from(new Set([...player.progression.activeDayKeys, dayKey]));
  const isNewGame = !player.progression.playedGameIds.includes(match.gameId);
  const nextPlayedGames = isNewGame
    ? [...player.progression.playedGameIds, match.gameId]
    : player.progression.playedGameIds;

  let workingProgression: PlayerProgressionDoc = {
    ...player.progression,
    distinctOpponentUids: nextOpponents,
    activeDayKeys: nextDays,
    playedGameIds: nextPlayedGames,
    updatedAt: match.completedAt,
  };

  // 5. Award match XP idempotently.
  const baseMatchXp =
    ARCADE_XP_REWARDS.completeMultiplayerGame +
    (participant.outcome === 'win'
      ? ARCADE_XP_REWARDS.winMultiplayerGame
      : participant.outcome === 'draw'
        ? ARCADE_XP_REWARDS.drawMultiplayerGame
        : 0) +
    (isNewGame ? ARCADE_XP_REWARDS.tryNewGameBonus : 0);

  const matchXpOutcome = applyIdempotentXpAward(workingProgression, {
    eventId: `match_${resultId}`,
    xpDelta: baseMatchXp,
    nowMs: match.completedAt,
  });
  workingProgression = matchXpOutcome.progression;
  let totalXpAwarded = matchXpOutcome.xpAdded;
  let leveledUp = matchXpOutcome.leveledUp;

  // 6. Evaluate achievements and grant one-time achievement XP.
  const evaluated = evaluatePlayerAchievements({
    hasCompletedProfile: player.hasCompletedProfile,
    persistentRoomsCreated: player.persistentRoomsCreated,
    progression: workingProgression,
    multiplayerStats: nextAllMpStats,
    privateRecords: player.privateRecords,
    recentHistory: [resultRecord],
    storedAchievements: player.storedAchievements,
  });

  const { newlyUnlocked } = computeNewlyUnlockedAchievements(
    evaluated,
    player.storedAchievements,
    player.uid,
    match.completedAt
  );

  for (const ach of newlyUnlocked) {
    const achXpOutcome = applyIdempotentXpAward(workingProgression, {
      eventId: `ach_${ach.achievementId}_${player.uid}`,
      xpDelta: ach.xpAwarded,
      nowMs: match.completedAt,
    });
    workingProgression = achXpOutcome.progression;
    totalXpAwarded += achXpOutcome.xpAdded;
    if (achXpOutcome.leveledUp) leveledUp = true;
  }

  // 7. Update weekly, monthly, and all-time competitive leaderboard entries.
  const periods: LeaderboardPeriod[] = ['weekly', 'monthly', 'all-time'];
  const updatedLeaderboardEntries: LeaderboardEntryDoc[] = periods.map((period) => {
    const periodKey = getLeaderboardPeriodKey(period, match.completedAt);
    const entryId = buildLeaderboardEntryId({
      gameId: match.gameId,
      period,
      periodKey,
      uid: player.uid,
    });
    const prev = player.existingLeaderboardEntries[entryId];
    const gamesPlayed = (prev?.gamesPlayed ?? 0) + 1;
    const wins = (prev?.wins ?? 0) + (participant.outcome === 'win' ? 1 : 0);
    const losses = (prev?.losses ?? 0) + (participant.outcome === 'loss' ? 1 : 0);
    const draws = (prev?.draws ?? 0) + (participant.outcome === 'draw' ? 1 : 0);

    return {
      entryId,
      uid: player.uid,
      username: player.username,
      avatarId: player.avatarId,
      countryCode: player.countryCode,
      countryName: player.countryName,
      gameId: match.gameId,
      period,
      periodKey,
      isAnonymous: false,
      gamesPlayed,
      wins,
      losses,
      draws,
      winPercentage: calculateWinPercentage(wins, gamesPlayed),
      updatedAt: match.completedAt,
    };
  });

  return {
    uid: player.uid,
    resultRecord,
    updatedMultiplayerStats: nextGameStats,
    updatedProgression: workingProgression,
    newlyUnlockedAchievements: newlyUnlocked,
    xpAwardedTotal: totalXpAwarded,
    leveledUp,
    updatedLeaderboardEntries,
  };
}

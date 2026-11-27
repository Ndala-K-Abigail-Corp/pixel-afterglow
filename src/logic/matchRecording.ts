/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../lib/firebase';
import { runFirestoreTransaction } from '../lib/firestore';
import { getCurrentUid } from '../lib/auth';
import type {
  GameResultRecord,
  LeaderboardEntryDoc,
  LeaderboardPeriod,
  MatchOutcome,
  PlatformGameId,
  PlayerGameStatsDoc,
} from '../types/arcadePlatform';
import type { UserProfile } from '../types/profile';
import type { MultiplayerRoomDocument } from '../types/multiplayer';
import {
  applyMultiplayerResultToStats,
  buildGameResultId,
  calculateWinPercentage,
  createEmptyMultiplayerGameStats,
  GAME_HISTORY_SUBCOLLECTION,
  GAME_STATS_SUBCOLLECTION,
} from './gameHistory';
import {
  buildLeaderboardEntryId,
  getLeaderboardPeriodKey,
  LEADERBOARD_ENTRIES_COLLECTION,
} from './leaderboards';
import { ROOMS_COLLECTION } from './multiplayerRoom';

export interface SnakeRoomMatchResult {
  sessionId: string;
  roundNumber: number;
  winnerUids: string[];
  isDraw: boolean;
  scores: Record<string, number>;
  completedAt: number;
}

export interface RecordMultiplayerMatchParams {
  roomCode: string;
  gameId: PlatformGameId;
  roundNumber: number;
  playerUid: string;
  profile: UserProfile | null;
  isRegisteredAccount: boolean;
  outcome: MatchOutcome;
  score: number;
  durationSeconds?: number | null;
  opponentUids: string[];
  completedAt?: number;
  metrics?: GameResultRecord['metrics'];
}

export interface RecordMultiplayerMatchOutcome {
  recorded: boolean;
  resultId?: string;
  reason?: 'anonymous' | 'invalid-participants' | 'offline' | 'duplicate' | 'error';
  error?: string;
}

/**
 * Transitions a Snake multiplayer room from `waiting` to `in_progress` in Firestore
 * so match completion can be validated against the real multiplayer room document.
 */
export async function startSnakeMultiplayerRoom(roomCode: string): Promise<MultiplayerRoomDocument | null> {
  if (!isFirebaseConfigured()) return null;
  const uid = getCurrentUid();
  if (!uid) return null;

  const db = getFirestoreDb();
  const roomRef = doc(db, ROOMS_COLLECTION, roomCode.trim().toUpperCase());

  return runFirestoreTransaction(async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) return null;
    const room = snap.data() as MultiplayerRoomDocument;
    if (room.hostUid !== uid || room.status !== 'waiting' || room.playerOrder.length < 2) {
      return room;
    }

    const nowMs = Date.now();
    const updated: MultiplayerRoomDocument = {
      ...room,
      status: 'in_progress',
      currentTurnUid: room.playerOrder[0],
      lastActivityAt: nowMs,
    };
    tx.set(roomRef, updated);
    return updated;
  });
}

/**
 * Transitions an active Snake multiplayer room from `in_progress` to `completed` in Firestore,
 * persisting the authoritative `snakeMatchResult` summary for participant verification.
 */
export async function completeSnakeMultiplayerRoom(
  roomCode: string,
  result: SnakeRoomMatchResult
): Promise<MultiplayerRoomDocument | null> {
  if (!isFirebaseConfigured()) return null;
  const uid = getCurrentUid();
  if (!uid) return null;

  const db = getFirestoreDb();
  const roomRef = doc(db, ROOMS_COLLECTION, roomCode.trim().toUpperCase());

  return runFirestoreTransaction(async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) return null;
    const room = snap.data() as MultiplayerRoomDocument & { snakeMatchResult?: SnakeRoomMatchResult | null };
    if (room.hostUid !== uid || room.status !== 'in_progress') {
      return room;
    }

    const updated = {
      ...room,
      status: 'completed' as const,
      snakeMatchResult: result,
      lastActivityAt: result.completedAt,
    };
    tx.set(roomRef, updated);
    return updated;
  });
}

/**
 * Atomically records a verified completed multiplayer match for a registered player:
 * 1. Writes immutable `users/{uid}/gameHistory/{resultId}` (cross-checked by Firestore rules
 *    against the completed `rooms/{roomCode}` document).
 * 2. Increments `users/{uid}/gameStats/{gameId}` (`+1` game, exact outcome increment).
 * 3. Increments `leaderboardEntries/{entryId}` for `weekly`, `monthly`, and `all-time`.
 *
 * Strictly excludes anonymous users, single-player games, and duplicate session submissions.
 */
export async function recordVerifiedMultiplayerMatchForPlayer(
  params: RecordMultiplayerMatchParams
): Promise<RecordMultiplayerMatchOutcome> {
  // 1. Exclude anonymous players from permanent competitive records
  if (!params.isRegisteredAccount || !params.profile || !params.playerUid) {
    return { recorded: false, reason: 'anonymous' };
  }

  // 2. Require at least one opponent (multiplayer only, never single-player)
  const validOpponents = params.opponentUids.filter((id) => id && id !== params.playerUid);
  if (validOpponents.length < 1) {
    return { recorded: false, reason: 'invalid-participants' };
  }

  const normalizedRoomCode = params.roomCode.trim().toUpperCase();
  const sessionId = `${normalizedRoomCode}_r${Math.max(1, Math.floor(params.roundNumber))}`;
  const resultId = buildGameResultId({
    gameId: params.gameId,
    mode: 'multiplayer',
    sessionId,
    playerUid: params.playerUid,
  });

  if (!isFirebaseConfigured()) {
    return { recorded: false, resultId, reason: 'offline' };
  }

  const completedAt = params.completedAt ?? Date.now();
  const db = getFirestoreDb();
  const historyRef = doc(db, 'users', params.playerUid, GAME_HISTORY_SUBCOLLECTION, resultId);
  const statsRef = doc(db, 'users', params.playerUid, GAME_STATS_SUBCOLLECTION, params.gameId);

  const periods: LeaderboardPeriod[] = ['weekly', 'monthly', 'all-time'];
  const periodRefs = periods.map((period) => {
    const periodKey = getLeaderboardPeriodKey(period, completedAt);
    const entryId = buildLeaderboardEntryId({
      gameId: params.gameId,
      period,
      periodKey,
      uid: params.playerUid,
    });
    return {
      period,
      periodKey,
      entryId,
      ref: doc(db, LEADERBOARD_ENTRIES_COLLECTION, entryId),
    };
  });

  try {
    const outcome = await runFirestoreTransaction(async (tx) => {
      const [historySnap, statsSnap, ...lbSnaps] = await Promise.all([
        tx.get(historyRef),
        tx.get(statsRef),
        ...periodRefs.map((p) => tx.get(p.ref)),
      ]);

      // Idempotency guard: never double-count an already recorded match
      if (historySnap.exists()) {
        return { recorded: false, resultId, reason: 'duplicate' as const };
      }

      const resultRecord: GameResultRecord = {
        resultId,
        gameId: params.gameId,
        sessionId,
        playerUid: params.playerUid,
        completedAt,
        mode: 'multiplayer',
        outcome: params.outcome,
        score: Math.max(0, Math.floor(params.score)),
        durationSeconds: params.durationSeconds ?? null,
        validated: true,
        roomCode: normalizedRoomCode,
        opponentUids: validOpponents,
        metrics: params.metrics,
      };

      const prevStatsDoc = statsSnap.exists() ? (statsSnap.data() as PlayerGameStatsDoc) : null;
      const prevMpStats = prevStatsDoc?.multiplayer ?? createEmptyMultiplayerGameStats();
      const { stats: nextMpStats } = applyMultiplayerResultToStats(
        prevMpStats,
        resultRecord,
        new Set<string>()
      );

      const nextStatsDoc: PlayerGameStatsDoc = {
        uid: params.playerUid,
        gameId: params.gameId,
        multiplayer: nextMpStats,
        lastResultId: resultId,
        updatedAt: completedAt,
      };

      tx.set(historyRef, resultRecord);
      tx.set(statsRef, nextStatsDoc);

      periodRefs.forEach((p, idx) => {
        const prevEntry = lbSnaps[idx]?.exists()
          ? (lbSnaps[idx].data() as LeaderboardEntryDoc)
          : null;
        const gamesPlayed = (prevEntry?.gamesPlayed ?? 0) + 1;
        const wins = (prevEntry?.wins ?? 0) + (params.outcome === 'win' ? 1 : 0);
        const losses = (prevEntry?.losses ?? 0) + (params.outcome === 'loss' ? 1 : 0);
        const draws = (prevEntry?.draws ?? 0) + (params.outcome === 'draw' ? 1 : 0);

        const nextEntry: LeaderboardEntryDoc = {
          entryId: p.entryId,
          uid: params.playerUid,
          username: params.profile!.username,
          avatarId: params.profile!.avatarId,
          countryCode: params.profile!.countryCode,
          countryName: params.profile!.countryName,
          gameId: params.gameId,
          period: p.period,
          periodKey: p.periodKey,
          isAnonymous: false,
          gamesPlayed,
          wins,
          losses,
          draws,
          winPercentage: calculateWinPercentage(wins, gamesPlayed),
          lastResultId: resultId,
          updatedAt: completedAt,
        };
        tx.set(p.ref, nextEntry);
      });

      return { recorded: true, resultId };
    });

    return outcome;
  } catch (err) {
    return {
      recorded: false,
      resultId,
      reason: 'error',
      error: err instanceof Error ? err.message : 'Unable to record match result.',
    };
  }
}

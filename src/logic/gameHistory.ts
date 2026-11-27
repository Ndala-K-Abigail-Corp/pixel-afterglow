/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../lib/firebase';
import { fetchDocument, setDocument } from '../lib/firestore';
import type {
  GameModeCategory,
  GameResultRecord,
  MultiplayerGameStats,
  PlatformGameId,
  PlayerGameStatsDoc,
  PrivateSinglePlayerRecords,
} from '../types/arcadePlatform';

export const GAME_HISTORY_SUBCOLLECTION = 'gameHistory';
export const GAME_STATS_SUBCOLLECTION = 'gameStats';
export const PRIVATE_RECORDS_SUBCOLLECTION = 'privateRecords';
export const PRIVATE_RECORDS_DOC_ID = 'summary';

const LOCAL_PRIVATE_RECORDS_PREFIX = 'pixel_afterglow_private_records_v1_';

export function buildGameResultId(params: {
  gameId: PlatformGameId;
  mode: GameModeCategory;
  sessionId: string;
  playerUid: string;
}): string {
  const cleanSession = params.sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const cleanUid = params.playerUid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48);
  return `${params.gameId}_${params.mode}_${cleanSession}_${cleanUid}`;
}

export function createEmptyMultiplayerGameStats(): MultiplayerGameStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winPercentage: 0,
    totalPairsMatched: 0,
    highestScore: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    lastPlayedAt: null,
  };
}

export function createEmptyPrivateSinglePlayerRecords(
  uid: string,
  nowMs = Date.now()
): PrivateSinglePlayerRecords {
  return {
    uid,
    memoryMatch: {
      gamesPlayed: 0,
      gamesWon: 0,
      fastestCompletionSeconds: null,
      fewestAttempts: null,
      fewestMismatches: null,
      highestBoardSizeCompleted: null,
      lastPlayedAt: null,
    },
    ticTacToe: {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      difficultiesCompleted: [],
      lastPlayedAt: null,
    },
    snake: {
      gamesPlayed: 0,
      highestScore: 0,
      bestSurvivalTimeSeconds: null,
      longestSnakeLength: null,
      lastPlayedAt: null,
    },
    updatedAt: nowMs,
  };
}

export function calculateWinPercentage(wins: number, gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0;
  return Math.round((wins / gamesPlayed) * 1000) / 10;
}

/**
 * Pure, idempotent reducer for competitive multiplayer statistics.
 * Never accepts single-player results or duplicate result IDs.
 */
export function applyMultiplayerResultToStats(
  current: MultiplayerGameStats,
  result: GameResultRecord,
  processedResultIds: ReadonlySet<string>
): { stats: MultiplayerGameStats; applied: boolean } {
  if (result.mode !== 'multiplayer' || !result.validated) {
    return { stats: current, applied: false };
  }
  if (processedResultIds.has(result.resultId)) {
    return { stats: current, applied: false };
  }

  const gamesPlayed = current.gamesPlayed + 1;
  const wins = current.wins + (result.outcome === 'win' ? 1 : 0);
  const losses = current.losses + (result.outcome === 'loss' ? 1 : 0);
  const draws = current.draws + (result.outcome === 'draw' ? 1 : 0);
  const currentWinStreak = result.outcome === 'win' ? current.currentWinStreak + 1 : 0;
  const bestWinStreak = Math.max(current.bestWinStreak, currentWinStreak);
  const pairsAdded = Math.max(0, result.metrics?.pairsMatched ?? 0);

  return {
    applied: true,
    stats: {
      gamesPlayed,
      wins,
      losses,
      draws,
      winPercentage: calculateWinPercentage(wins, gamesPlayed),
      totalPairsMatched: current.totalPairsMatched + pairsAdded,
      highestScore: Math.max(current.highestScore, Math.max(0, result.score)),
      currentWinStreak,
      bestWinStreak,
      lastPlayedAt: Math.max(current.lastPlayedAt ?? 0, result.completedAt),
    },
  };
}

/**
 * Pure reducer for private single-player records.
 * Strictly ignores multiplayer records and never touches competitive leaderboard stats.
 */
export function applySinglePlayerResultToPrivateRecords(
  current: PrivateSinglePlayerRecords,
  result: GameResultRecord
): { records: PrivateSinglePlayerRecords; isPersonalBest: boolean } {
  if (result.mode !== 'single-player') {
    return { records: current, isPersonalBest: false };
  }

  let isPersonalBest = false;

  if (result.gameId === 'memory-match') {
    const prev = current.memoryMatch;
    const won = result.outcome === 'win';
    const nextFastest =
      won && result.durationSeconds !== null
        ? prev.fastestCompletionSeconds === null
          ? result.durationSeconds
          : Math.min(prev.fastestCompletionSeconds, result.durationSeconds)
        : prev.fastestCompletionSeconds;

    if (won && result.durationSeconds !== null && (prev.fastestCompletionSeconds === null || result.durationSeconds < prev.fastestCompletionSeconds)) {
      isPersonalBest = true;
    }

    const attempts = result.metrics?.attempts;
    const nextFewestAttempts =
      won && typeof attempts === 'number'
        ? prev.fewestAttempts === null
          ? attempts
          : Math.min(prev.fewestAttempts, attempts)
        : prev.fewestAttempts;

    if (won && typeof attempts === 'number' && (prev.fewestAttempts === null || attempts < prev.fewestAttempts)) {
      isPersonalBest = true;
    }

    const mismatches = result.metrics?.mismatches;
    const nextFewestMismatches =
      won && typeof mismatches === 'number'
        ? prev.fewestMismatches === null
          ? mismatches
          : Math.min(prev.fewestMismatches, mismatches)
        : prev.fewestMismatches;

    const cardCount = result.metrics?.cardCount;
    const nextHighestBoard =
      won && typeof cardCount === 'number'
        ? prev.highestBoardSizeCompleted === null
          ? cardCount
          : Math.max(prev.highestBoardSizeCompleted, cardCount)
        : prev.highestBoardSizeCompleted;

    if (won && typeof cardCount === 'number' && (prev.highestBoardSizeCompleted === null || cardCount > prev.highestBoardSizeCompleted)) {
      isPersonalBest = true;
    }

    return {
      isPersonalBest,
      records: {
        ...current,
        memoryMatch: {
          gamesPlayed: prev.gamesPlayed + 1,
          gamesWon: prev.gamesWon + (won ? 1 : 0),
          fastestCompletionSeconds: nextFastest,
          fewestAttempts: nextFewestAttempts,
          fewestMismatches: nextFewestMismatches,
          highestBoardSizeCompleted: nextHighestBoard,
          lastPlayedAt: result.completedAt,
        },
        updatedAt: result.completedAt,
      },
    };
  }

  if (result.gameId === 'tic-tac-toe') {
    const prev = current.ticTacToe;
    const won = result.outcome === 'win';
    const nextStreak = won ? prev.currentWinStreak + 1 : 0;
    const nextBestStreak = Math.max(prev.bestWinStreak, nextStreak);
    if (nextBestStreak > prev.bestWinStreak) {
      isPersonalBest = true;
    }
    const difficulty = result.metrics?.difficulty;
    const difficultiesCompleted =
      won && difficulty && !prev.difficultiesCompleted.includes(difficulty)
        ? [...prev.difficultiesCompleted, difficulty]
        : prev.difficultiesCompleted;

    return {
      isPersonalBest,
      records: {
        ...current,
        ticTacToe: {
          gamesPlayed: prev.gamesPlayed + 1,
          wins: prev.wins + (won ? 1 : 0),
          losses: prev.losses + (result.outcome === 'loss' ? 1 : 0),
          draws: prev.draws + (result.outcome === 'draw' ? 1 : 0),
          currentWinStreak: nextStreak,
          bestWinStreak: nextBestStreak,
          difficultiesCompleted,
          lastPlayedAt: result.completedAt,
        },
        updatedAt: result.completedAt,
      },
    };
  }

  // Snake (schema-ready for future release)
  const prevSnake = current.snake;
  const nextHigh = Math.max(prevSnake.highestScore, Math.max(0, result.score));
  if (nextHigh > prevSnake.highestScore) {
    isPersonalBest = true;
  }
  const survival = result.metrics?.survivalSeconds ?? result.durationSeconds;
  const nextSurvival =
    typeof survival === 'number'
      ? Math.max(prevSnake.bestSurvivalTimeSeconds ?? 0, survival)
      : prevSnake.bestSurvivalTimeSeconds;
  const snakeLen = result.metrics?.snakeLength;
  const nextLen =
    typeof snakeLen === 'number'
      ? Math.max(prevSnake.longestSnakeLength ?? 0, snakeLen)
      : prevSnake.longestSnakeLength;

  return {
    isPersonalBest,
    records: {
      ...current,
      snake: {
        gamesPlayed: prevSnake.gamesPlayed + 1,
        highestScore: nextHigh,
        bestSurvivalTimeSeconds: nextSurvival,
        longestSnakeLength: nextLen,
        lastPlayedAt: result.completedAt,
      },
      updatedAt: result.completedAt,
    },
  };
}

/**
 * Fetches paginated game history records for a signed-in user (`users/{uid}/gameHistory`).
 */
export async function fetchPlayerGameHistory(
  uid: string,
  pageSize = 20
): Promise<GameResultRecord[]> {
  if (!uid || !isFirebaseConfigured()) return [];
  try {
    const db = getFirestoreDb();
    const q = query(
      collection(db, `users/${uid}/${GAME_HISTORY_SUBCOLLECTION}`),
      orderBy('completedAt', 'desc'),
      limit(Math.min(Math.max(1, pageSize), 50))
    );
    const snap = await getDocs(q);
    return snap.docs.map((d: QueryDocumentSnapshot) => d.data() as GameResultRecord);
  } catch {
    return [];
  }
}

/**
 * Fetches server-maintained multiplayer stats per game from `users/{uid}/gameStats/{gameId}`.
 */
export async function fetchPlayerMultiplayerStats(
  uid: string
): Promise<Record<PlatformGameId, MultiplayerGameStats>> {
  const defaults: Record<PlatformGameId, MultiplayerGameStats> = {
    'memory-match': createEmptyMultiplayerGameStats(),
    'tic-tac-toe': createEmptyMultiplayerGameStats(),
    snake: createEmptyMultiplayerGameStats(),
  };

  if (!uid || !isFirebaseConfigured()) return defaults;

  try {
    const [mm, ttt, snake] = await Promise.all([
      fetchDocument<PlayerGameStatsDoc>(`users/${uid}/${GAME_STATS_SUBCOLLECTION}`, 'memory-match'),
      fetchDocument<PlayerGameStatsDoc>(`users/${uid}/${GAME_STATS_SUBCOLLECTION}`, 'tic-tac-toe'),
      fetchDocument<PlayerGameStatsDoc>(`users/${uid}/${GAME_STATS_SUBCOLLECTION}`, 'snake'),
    ]);

    return {
      'memory-match': mm?.multiplayer ?? defaults['memory-match'],
      'tic-tac-toe': ttt?.multiplayer ?? defaults['tic-tac-toe'],
      snake: snake?.multiplayer ?? defaults.snake,
    };
  } catch {
    return defaults;
  }
}

function readLocalPrivateRecords(uid: string): PrivateSinglePlayerRecords | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_PRIVATE_RECORDS_PREFIX}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as PrivateSinglePlayerRecords;
  } catch {
    return null;
  }
}

function writeLocalPrivateRecords(records: PrivateSinglePlayerRecords): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${LOCAL_PRIVATE_RECORDS_PREFIX}${records.uid}`,
      JSON.stringify(records)
    );
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Fetches private single-player personal bests for a signed-in registered user.
 */
export async function fetchPrivateSinglePlayerRecords(
  uid: string
): Promise<PrivateSinglePlayerRecords> {
  if (!uid) return createEmptyPrivateSinglePlayerRecords('guest');
  const localFallback = readLocalPrivateRecords(uid) ?? createEmptyPrivateSinglePlayerRecords(uid);
  if (!isFirebaseConfigured()) return localFallback;

  try {
    const remote = await fetchDocument<PrivateSinglePlayerRecords>(
      `users/${uid}/${PRIVATE_RECORDS_SUBCOLLECTION}`,
      PRIVATE_RECORDS_DOC_ID
    );
    if (remote) {
      writeLocalPrivateRecords(remote);
      return remote;
    }
    return localFallback;
  } catch {
    return localFallback;
  }
}

/**
 * Records a private single-player completion for a registered user (`users/{uid}/privateRecords/summary`).
 * Private single-player records never alter competitive multiplayer stats or public leaderboards.
 */
export async function recordPrivateSinglePlayerCompletion(
  uid: string,
  result: GameResultRecord
): Promise<{ records: PrivateSinglePlayerRecords; isPersonalBest: boolean }> {
  const current = await fetchPrivateSinglePlayerRecords(uid);
  const { records, isPersonalBest } = applySinglePlayerResultToPrivateRecords(current, result);
  writeLocalPrivateRecords(records);

  if (isFirebaseConfigured()) {
    try {
      await setDocument<PrivateSinglePlayerRecords>(
        `users/${uid}/${PRIVATE_RECORDS_SUBCOLLECTION}`,
        PRIVATE_RECORDS_DOC_ID,
        records
      );
    } catch {
      // Keep local cache if offline; never block gameplay
    }
  }

  return { records, isPersonalBest };
}

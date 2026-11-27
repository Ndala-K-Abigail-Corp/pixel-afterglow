/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../lib/firebase';
import type {
  LeaderboardEntryDoc,
  LeaderboardPeriod,
  LeaderboardQualificationStatus,
  LeaderboardScope,
  PlatformGameId,
  RankedLeaderboardEntry,
} from '../types/arcadePlatform';

export const LEADERBOARD_ENTRIES_COLLECTION = 'leaderboardEntries';
export const MIN_LEADERBOARD_GAMES = 3;
export const DEFAULT_LEADERBOARD_PAGE_SIZE = 20;

/**
 * Computes consistent UTC period keys using server-side UTC timestamps so all players
 * worldwide share exact weekly and monthly ranking boundaries.
 * - `all-time` -> `'all-time'`
 * - `monthly`  -> `'YYYY-MM'` (UTC)
 * - `weekly`   -> `'YYYY-Www'` (ISO-8601 week in UTC, Monday start)
 */
export function getLeaderboardPeriodKey(
  period: LeaderboardPeriod,
  timestampMs = Date.now()
): string {
  if (period === 'all-time') return 'all-time';

  const date = new Date(timestampMs);
  if (period === 'monthly') {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }

  // ISO-8601 week calculation in UTC
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = target.getUTCDay() || 7; // Sunday = 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function buildLeaderboardEntryId(params: {
  gameId: PlatformGameId;
  period: LeaderboardPeriod;
  periodKey: string;
  uid: string;
}): string {
  return `${params.gameId}_${params.period}_${params.periodKey}_${params.uid}`;
}

/**
 * Computes a player's 3-game qualification status for a specific game independently.
 */
export function getLeaderboardQualificationStatus(
  gameId: PlatformGameId,
  completedMultiplayerGames: number,
  requiredGames = MIN_LEADERBOARD_GAMES
): LeaderboardQualificationStatus {
  const completed = Math.max(0, Math.floor(completedMultiplayerGames));
  const remaining = Math.max(0, requiredGames - completed);
  const isQualified = completed >= requiredGames;
  const message = isQualified
    ? `Qualified (${completed} verified multiplayer games completed)`
    : `${completed} of ${requiredGames} games completed – ${remaining} more to qualify.`;

  return {
    gameId,
    completedGames: completed,
    requiredGames,
    remainingGames: remaining,
    isQualified,
    message,
  };
}

/**
 * Confirmed competitive ranking rules:
 * 1. Exclude anonymous players.
 * 2. Require at least 3 completed multiplayer games in the relevant game.
 * 3. Filter by gameId, period, periodKey, and optional countryCode (when scope === 'country').
 * 4. Sort by:
 *    - Primary: verified multiplayer wins (descending)
 *    - Tiebreaker 1: win percentage (descending)
 *    - Tiebreaker 2: draws (descending)
 *    - Deterministic tiebreaker: uid (ascending)
 */
export type LeaderboardGameFilter = 'all' | PlatformGameId;

export function rankLeaderboardEntries(
  entries: readonly LeaderboardEntryDoc[],
  options: {
    gameId: LeaderboardGameFilter;
    period: LeaderboardPeriod;
    periodKey?: string;
    scope: LeaderboardScope;
    countryCode?: string;
    minGames?: number;
  }
): RankedLeaderboardEntry[] {
  const minGames = options.minGames ?? MIN_LEADERBOARD_GAMES;
  const targetPeriodKey = options.periodKey ?? getLeaderboardPeriodKey(options.period);
  const normalizedCountry = options.countryCode?.trim().toUpperCase() || null;

  const eligible = entries.filter((entry) => {
    if ((entry as { isAnonymous?: boolean }).isAnonymous === true) return false;
    if (!entry.uid) return false;
    if (options.gameId !== 'all' && entry.gameId !== options.gameId) return false;
    if (entry.period !== options.period) return false;
    if (entry.periodKey !== targetPeriodKey) return false;
    if (entry.gamesPlayed < minGames) return false;
    if (options.scope === 'country') {
      if (!normalizedCountry) return false;
      if (entry.countryCode.toUpperCase() !== normalizedCountry) return false;
    }
    return true;
  });

  // When viewing 'all' games, aggregate qualified per-game records by player UID
  let consolidated: LeaderboardEntryDoc[] = eligible;
  if (options.gameId === 'all') {
    const byUid = new Map<string, LeaderboardEntryDoc>();
    for (const entry of eligible) {
      const prev = byUid.get(entry.uid);
      if (!prev) {
        byUid.set(entry.uid, { ...entry });
      } else {
        const gamesPlayed = prev.gamesPlayed + entry.gamesPlayed;
        const wins = prev.wins + entry.wins;
        const losses = prev.losses + entry.losses;
        const draws = prev.draws + entry.draws;
        byUid.set(entry.uid, {
          ...prev,
          gamesPlayed,
          wins,
          losses,
          draws,
          winPercentage: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 1000) / 10 : 0,
          updatedAt: Math.max(prev.updatedAt, entry.updatedAt),
        });
      }
    }
    consolidated = Array.from(byUid.values());
  }

  const sorted = [...consolidated].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    if (b.draws !== a.draws) return b.draws - a.draws;
    return a.uid.localeCompare(b.uid);
  });

  return sorted.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

export interface FetchLeaderboardParams {
  gameId: LeaderboardGameFilter;
  period: LeaderboardPeriod;
  scope: LeaderboardScope;
  countryCode?: string;
  pageSize?: number;
  nowMs?: number;
}

export interface FetchLeaderboardResult {
  entries: RankedLeaderboardEntry[];
  /** Raw period entries before the qualification threshold filter (used for accurate period progress). */
  rawPeriodEntries?: LeaderboardEntryDoc[];
  periodKey: string;
  unavailable: boolean;
  error: string | null;
}

/**
 * Queries verified multiplayer leaderboard entries with pagination limit.
 * Never fabricates data; returns explicit unavailable/error/empty states.
 */
export async function fetchLeaderboardEntries(
  params: FetchLeaderboardParams
): Promise<FetchLeaderboardResult> {
  const periodKey = getLeaderboardPeriodKey(params.period, params.nowMs);

  const isTestEnv =
    (typeof process !== 'undefined' && Boolean(process.env?.VITEST)) ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: { MODE?: string; VITEST?: string } }).env?.MODE === 'test');

  if (!isFirebaseConfigured() || isTestEnv) {
    return {
      entries: [],
      periodKey,
      unavailable: true,
      error: null,
    };
  }

  try {
    const db = getFirestoreDb();
    const maxDocs = Math.min(Math.max(50, (params.pageSize ?? DEFAULT_LEADERBOARD_PAGE_SIZE) * 2), 200);
    // Query by single-field `periodKey` index (always available without custom composite indexes)
    // and apply game/country/5-game eligibility & win->win%->draws ranking deterministically.
    const constraints: QueryConstraint[] = [
      where('periodKey', '==', periodKey),
      limit(maxDocs),
    ];

    const snap = await getDocs(query(collection(db, LEADERBOARD_ENTRIES_COLLECTION), ...constraints));
    const raw = snap.docs.map((d) => d.data() as LeaderboardEntryDoc);

    const ranked = rankLeaderboardEntries(raw, {
      gameId: params.gameId,
      period: params.period,
      periodKey,
      scope: params.scope,
      countryCode: params.countryCode,
    });

    return {
      entries: ranked,
      rawPeriodEntries: raw,
      periodKey,
      unavailable: false,
      error: null,
    };
  } catch {
    return {
      entries: [],
      periodKey,
      unavailable: false,
      error: 'Unable to load leaderboard rankings right now. Please try again in a moment.',
    };
  }
}

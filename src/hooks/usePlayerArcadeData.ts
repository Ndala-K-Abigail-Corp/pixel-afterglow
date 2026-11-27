/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserArcadeRooms } from '../logic/arcadeRooms';
import {
  createEmptyMultiplayerGameStats,
  createEmptyPrivateSinglePlayerRecords,
  fetchPlayerGameHistory,
  fetchPlayerMultiplayerStats,
  fetchPrivateSinglePlayerRecords,
} from '../logic/gameHistory';
import {
  calculateArcadeXpProgress,
  createEmptyProgression,
  fetchPlayerProgression,
} from '../logic/arcadeProgression';
import {
  evaluatePlayerAchievements,
  fetchStoredPlayerAchievements,
} from '../logic/achievements';
import type { PersistentArcadeRoom } from '../types/arcadeRoom';
import type {
  ArcadeXpProgress,
  EvaluatedAchievement,
  GameResultRecord,
  MultiplayerGameStats,
  PlatformGameId,
  PlayerAchievementDoc,
  PlayerProgressionDoc,
  PrivateSinglePlayerRecords,
} from '../types/arcadePlatform';

export interface PlayerArcadeDataState {
  rooms: PersistentArcadeRoom[];
  gameHistory: GameResultRecord[];
  multiplayerStats: Record<PlatformGameId, MultiplayerGameStats>;
  privateRecords: PrivateSinglePlayerRecords;
  progression: PlayerProgressionDoc;
  xpProgress: ArcadeXpProgress;
  achievements: EvaluatedAchievement[];
  storedAchievements: Record<string, PlayerAchievementDoc>;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_MP_STATS: Record<PlatformGameId, MultiplayerGameStats> = {
  'memory-match': createEmptyMultiplayerGameStats(),
  'tic-tac-toe': createEmptyMultiplayerGameStats(),
  snake: createEmptyMultiplayerGameStats(),
};

/**
 * Centralized, cached data hook for the authenticated Pixel Afterglow dashboard.
 * Subscribes only to the signed-in user's persistent arcade rooms and fetches
 * bounded history, stats, progression, and achievements with clean teardown.
 */
export function usePlayerArcadeData(): PlayerArcadeDataState {
  const { uid, profile, isSignedInAccount } = useAuth();

  const [rooms, setRooms] = useState<PersistentArcadeRoom[]>([]);
  const [gameHistory, setGameHistory] = useState<GameResultRecord[]>([]);
  const [multiplayerStats, setMultiplayerStats] =
    useState<Record<PlatformGameId, MultiplayerGameStats>>(DEFAULT_MP_STATS);
  const [privateRecords, setPrivateRecords] = useState<PrivateSinglePlayerRecords>(() =>
    createEmptyPrivateSinglePlayerRecords(uid ?? 'guest')
  );
  const [progression, setProgression] = useState<PlayerProgressionDoc>(() =>
    createEmptyProgression(uid ?? 'guest')
  );
  const [storedAchievements, setStoredAchievements] = useState<
    Record<string, PlayerAchievementDoc>
  >({});
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadAccountData = useCallback(async () => {
    if (!uid || !isSignedInAccount) {
      setGameHistory([]);
      setMultiplayerStats(DEFAULT_MP_STATS);
      setPrivateRecords(createEmptyPrivateSinglePlayerRecords('guest'));
      setProgression(createEmptyProgression('guest'));
      setStoredAchievements({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [historyRes, mpStatsRes, privateRes, progRes, achRes] = await Promise.all([
        fetchPlayerGameHistory(uid, 20),
        fetchPlayerMultiplayerStats(uid),
        fetchPrivateSinglePlayerRecords(uid),
        fetchPlayerProgression(uid),
        fetchStoredPlayerAchievements(uid),
      ]);
      setGameHistory(historyRes);
      setMultiplayerStats(mpStatsRes);
      setPrivateRecords(privateRes);
      setProgression(progRes);
      setStoredAchievements(achRes);
    } finally {
      setIsLoading(false);
    }
  }, [uid, isSignedInAccount]);

  useEffect(() => {
    void loadAccountData();
  }, [loadAccountData]);

  useEffect(() => {
    if (!uid || !isSignedInAccount) {
      setRooms([]);
      return;
    }
    const unsub = subscribeToUserArcadeRooms(uid, {
      onData: (nextRooms) => {
        setRooms(nextRooms);
      },
    });
    return () => unsub();
  }, [uid, isSignedInAccount]);

  const xpProgress = useMemo(
    () => calculateArcadeXpProgress(progression.totalXp),
    [progression.totalXp]
  );

  const ownedRoomsCount = useMemo(
    () => (uid ? rooms.filter((r) => r.ownerUid === uid).length : 0),
    [rooms, uid]
  );

  const achievements = useMemo(
    () =>
      evaluatePlayerAchievements({
        hasCompletedProfile: Boolean(isSignedInAccount && profile),
        persistentRoomsCreated: ownedRoomsCount,
        progression,
        multiplayerStats,
        privateRecords,
        recentHistory: gameHistory,
        storedAchievements,
      }),
    [
      isSignedInAccount,
      profile,
      ownedRoomsCount,
      progression,
      multiplayerStats,
      privateRecords,
      gameHistory,
      storedAchievements,
    ]
  );

  return {
    rooms,
    gameHistory,
    multiplayerStats,
    privateRecords,
    progression,
    xpProgress,
    achievements,
    storedAchievements,
    isLoading,
    refresh: loadAccountData,
  };
}

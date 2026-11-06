/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MultiplayerGameType,
  MultiplayerRoomDocument,
  MemoryMultiplayerPlayerCount,
  ROOM_EXPIRY_POLICIES_MS,
  isRoomExpired,
} from '../types/multiplayer';
import {
  createMultiplayerRoom,
  joinMultiplayerRoom,
  reconnectToMultiplayerRoom,
  leaveMultiplayerRoom,
  closeMultiplayerRoom,
  updatePlayerConnectionStatus,
  subscribeToMultiplayerRoom,
  checkAndExpireRoomIfNeeded,
  loadActiveRoomSession,
  clearActiveRoomSession,
  loadPreferredNickname,
} from '../logic/multiplayerRoom';
import { isFirebaseConfigured, formatFirebaseError } from '../lib/firebase';
import { ensureAnonymousSession } from '../lib/auth';

export interface UseMultiplayerRoomResult {
  room: MultiplayerRoomDocument | null;
  uid: string | null;
  isHost: boolean;
  isLoading: boolean;
  isReconnecting: boolean;
  isConnected: boolean;
  error: string | null;
  preferredNickname: string;
  createRoom: (params: {
    nickname: string;
    maxPlayers?: MemoryMultiplayerPlayerCount;
  }) => Promise<MultiplayerRoomDocument | null>;
  joinRoom: (params: {
    roomCode: string;
    nickname: string;
  }) => Promise<MultiplayerRoomDocument | null>;
  leaveRoom: () => Promise<void>;
  closeRoom: () => Promise<void>;
  clearError: () => void;
}

export function useMultiplayerRoom(
  gameType: MultiplayerGameType,
  isEnabled: boolean
): UseMultiplayerRoomResult {
  const [room, setRoom] = useState<MultiplayerRoomDocument | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [preferredNickname, setPreferredNickname] = useState<string>(() =>
    loadPreferredNickname()
  );

  const activeRoomCodeRef = useRef<string | null>(null);
  const attemptedReconnectRef = useRef<boolean>(false);
  const roomRef = useRef<MultiplayerRoomDocument | null>(null);
  roomRef.current = room;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize anonymous session and attempt automatic reconnection when multiplayer mode is active
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    if (!isFirebaseConfigured()) {
      setError(
        'Firebase is not configured. Add your VITE_FIREBASE_* keys to .env.local to play online.'
      );
      return;
    }

    let isMounted = true;

    async function initAuthAndReconnect() {
      try {
        const user = await ensureAnonymousSession();
        if (!isMounted) return;
        setUid(user.uid);

        if (!attemptedReconnectRef.current && !activeRoomCodeRef.current) {
          attemptedReconnectRef.current = true;
          const savedRoomCode = loadActiveRoomSession(gameType);
          if (savedRoomCode) {
            setIsReconnecting(true);
            try {
              const reconnected = await reconnectToMultiplayerRoom({
                roomCode: savedRoomCode,
                expectedGameType: gameType,
              });
              if (isMounted && reconnected) {
                activeRoomCodeRef.current = reconnected.room.roomCode;
                setRoom(reconnected.room);
                setUid(reconnected.uid);
              }
            } catch {
              clearActiveRoomSession(gameType);
            } finally {
              if (isMounted) {
                setIsReconnecting(false);
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to initialize anonymous multiplayer session.'
          );
        }
      }
    }

    void initAuthAndReconnect();

    return () => {
      isMounted = false;
    };
  }, [gameType, isEnabled]);

  // Subscribe to real-time Firestore updates whenever we have an active room code
  const currentRoomCode = room?.roomCode ?? null;

  useEffect(() => {
    if (!isEnabled || !currentRoomCode) {
      return;
    }

    activeRoomCodeRef.current = currentRoomCode;

    const unsubscribe = subscribeToMultiplayerRoom(currentRoomCode, {
      onRoomChange: (nextRoom, closedOrExpiredReason) => {
        if (!nextRoom) {
          activeRoomCodeRef.current = null;
          clearActiveRoomSession(gameType);
          setRoom(null);

          if (closedOrExpiredReason === 'closed') {
            setError('The room was closed by the host.');
          } else if (closedOrExpiredReason === 'expired') {
            setError('This room has expired due to inactivity.');
          }
          return;
        }

        // If current user was removed from waiting room
        if (uid && !(uid in nextRoom.players)) {
          activeRoomCodeRef.current = null;
          clearActiveRoomSession(gameType);
          setRoom(null);
          return;
        }

        setRoom(nextRoom);
      },
      onError: (err) => {
        setError(err.message || 'Lost connection to multiplayer room.');
      },
    });

    return () => {
      unsubscribe();
    };
  }, [isEnabled, currentRoomCode, gameType, uid]);

  // Heartbeat and network listeners (avoids tab-switch thrashing and redundant writes)
  useEffect(() => {
    if (!isEnabled || !currentRoomCode || !uid) {
      return;
    }

    const sendHeartbeat = (status: 'connected' | 'disconnected') => {
      setIsConnected(status === 'connected');
      void updatePlayerConnectionStatus({
        roomCode: currentRoomCode,
        connectionStatus: status,
        currentRoom: roomRef.current,
      }).catch(() => {});
    };

    const heartbeatInterval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        sendHeartbeat('connected');
      }
    }, ROOM_EXPIRY_POLICIES_MS.HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      // Do not mark 'disconnected' when switching tabs/windows on desktop;
      // only refresh 'connected' if returning after a stale interval or offline state.
      if (document.visibilityState === 'visible') {
        sendHeartbeat('connected');
      }
    };

    const handleOnline = () => sendHeartbeat('connected');
    const handleOffline = () => sendHeartbeat('disconnected');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isEnabled, currentRoomCode, uid]);

  // Local expiry watchdog so expired rooms immediately transition even without external writes
  useEffect(() => {
    if (!isEnabled || !room) {
      return;
    }

    const expiryCheckInterval = setInterval(() => {
      if (isRoomExpired(room, Date.now())) {
        void checkAndExpireRoomIfNeeded(room, Date.now());
        activeRoomCodeRef.current = null;
        clearActiveRoomSession(gameType);
        setRoom(null);
        setError('This room has expired.');
      }
    }, 5000);

    return () => {
      clearInterval(expiryCheckInterval);
    };
  }, [isEnabled, room, gameType]);

  const createRoom = useCallback(
    async (params: {
      nickname: string;
      maxPlayers?: MemoryMultiplayerPlayerCount;
    }): Promise<MultiplayerRoomDocument | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createMultiplayerRoom({
          gameType,
          hostNickname: params.nickname,
          maxPlayers: params.maxPlayers,
        });
        activeRoomCodeRef.current = result.room.roomCode;
        setUid(result.uid);
        setRoom(result.room);
        setPreferredNickname(loadPreferredNickname());
        return result.room;
      } catch (err) {
        setError(formatFirebaseError(err).formatted);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [gameType]
  );

  const joinRoom = useCallback(
    async (params: {
      roomCode: string;
      nickname: string;
    }): Promise<MultiplayerRoomDocument | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await joinMultiplayerRoom({
          roomCode: params.roomCode,
          nickname: params.nickname,
          expectedGameType: gameType,
        });
        activeRoomCodeRef.current = result.room.roomCode;
        setUid(result.uid);
        setRoom(result.room);
        setPreferredNickname(loadPreferredNickname());
        return result.room;
      } catch (err) {
        setError(formatFirebaseError(err).formatted);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [gameType]
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    const code = activeRoomCodeRef.current ?? room?.roomCode;
    activeRoomCodeRef.current = null;
    setRoom(null);
    setError(null);
    if (code) {
      await leaveMultiplayerRoom({ roomCode: code, gameType }).catch(() => {});
    } else {
      clearActiveRoomSession(gameType);
    }
  }, [room?.roomCode, gameType]);

  const closeRoom = useCallback(async (): Promise<void> => {
    const code = activeRoomCodeRef.current ?? room?.roomCode;
    activeRoomCodeRef.current = null;
    setRoom(null);
    setError(null);
    if (code) {
      await closeMultiplayerRoom({ roomCode: code, gameType }).catch(() => {});
    } else {
      clearActiveRoomSession(gameType);
    }
  }, [room?.roomCode, gameType]);

  const isHost = Boolean(room && uid && room.hostUid === uid);

  return {
    room,
    uid,
    isHost,
    isLoading,
    isReconnecting,
    isConnected,
    error,
    preferredNickname,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    clearError,
  };
}

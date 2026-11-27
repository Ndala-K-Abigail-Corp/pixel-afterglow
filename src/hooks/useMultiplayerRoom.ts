/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MultiplayerGameType,
  MultiplayerRoomDocument,
  MemoryMultiplayerPlayerCount,
  MemoryRoomSettings,
  RoomConnectionState,
  ROOM_EXPIRY_POLICIES_MS,
  isRoomExpired,
} from '../types/multiplayer';
import {
  createMultiplayerRoom,
  joinMultiplayerRoom,
  reconnectToMultiplayerRoom,
  leaveMultiplayerRoom,
  closeMultiplayerRoom,
  updateMemoryRoomSettings,
  updatePlayerConnectionStatus,
  subscribeToMultiplayerRoom,
  fetchLatestMultiplayerRoom,
  checkAndExpireRoomIfNeeded,
  shouldAcceptIncomingRoomState,
  loadActiveRoomSession,
  clearActiveRoomSession,
  loadPreferredNickname,
  parseRoomInvitationFromUrl,
  clearRoomInvitationFromUrl,
  validateRoomInvitation,
  MULTIPLAYER_USER_MESSAGES,
  getUserFriendlyMultiplayerError,
  logMultiplayerDiagnostic,
} from '../logic/multiplayerRoom';
import { isFirebaseConfigured } from '../lib/firebase';
import { ensureAnonymousSession } from '../lib/auth';

export interface InvitationRoomInfo {
  roomCode: string;
  joinedCount: number;
  maxPlayers: number;
  hostNickname: string;
}

export type InvitationValidationState =
  | 'idle'
  | 'checking'
  | 'joinable'
  | 'invalid'
  | 'unavailable';

export interface UseMultiplayerRoomResult {
  room: MultiplayerRoomDocument | null;
  uid: string | null;
  isHost: boolean;
  isLoading: boolean;
  isReconnecting: boolean;
  isSynchronizing: boolean;
  isConnected: boolean;
  connectionState: RoomConnectionState;
  failedReconnectRoomCode: string | null;
  retryReconnect: () => Promise<void>;
  error: string | null;
  preferredNickname: string;
  invitedRoomCode: string | null;
  invitationStatus: InvitationValidationState;
  invitationRoomInfo: InvitationRoomInfo | null;
  dismissInvitation: () => void;
  createRoom: (params: {
    nickname: string;
    maxPlayers?: MemoryMultiplayerPlayerCount;
    memorySettings?: Partial<MemoryRoomSettings>;
  }) => Promise<MultiplayerRoomDocument | null>;
  joinRoom: (params: {
    roomCode: string;
    nickname: string;
  }) => Promise<MultiplayerRoomDocument | null>;
  updateRoomSettings: (
    settings: MemoryRoomSettings
  ) => Promise<MultiplayerRoomDocument | null>;
  refreshRoom: () => Promise<MultiplayerRoomDocument | null>;
  syncRoom: (nextRoom: MultiplayerRoomDocument | null) => void;
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
  const [isSynchronizing, setIsSynchronizing] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [failedReconnectRoomCode, setFailedReconnectRoomCode] = useState<string | null>(null);
  const [subscriptionVersion, setSubscriptionVersion] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [preferredNickname, setPreferredNickname] = useState<string>(() =>
    loadPreferredNickname()
  );
  const [invitedRoomCode, setInvitedRoomCode] = useState<string | null>(() => {
    const inv = parseRoomInvitationFromUrl();
    if (!inv || inv.gameType !== gameType) return null;
    return inv.normalizedRoomCode || inv.rawRoomParam.toUpperCase();
  });
  const [invitationStatus, setInvitationStatus] =
    useState<InvitationValidationState>('idle');
  const [invitationRoomInfo, setInvitationRoomInfo] =
    useState<InvitationRoomInfo | null>(null);

  const activeRoomCodeRef = useRef<string | null>(null);
  const attemptedReconnectRef = useRef<boolean>(false);
  const roomRef = useRef<MultiplayerRoomDocument | null>(null);
  roomRef.current = room;
  const uidRef = useRef<string | null>(null);
  uidRef.current = uid;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const dismissInvitation = useCallback(() => {
    clearRoomInvitationFromUrl();
    setInvitedRoomCode(null);
    setInvitationStatus('idle');
    setInvitationRoomInfo(null);
    setError(null);
  }, []);

  const syncRoom = useCallback((nextRoom: MultiplayerRoomDocument | null) => {
    if (!nextRoom) {
      roomRef.current = null;
      setRoom(null);
      return;
    }
    setRoom((prev) => {
      if (!shouldAcceptIncomingRoomState(prev, nextRoom)) {
        return prev;
      }
      roomRef.current = nextRoom;
      return nextRoom;
    });
  }, []);

  // Initialize anonymous session and attempt automatic reconnection when multiplayer mode is active
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    if (!isFirebaseConfigured()) {
      setError(MULTIPLAYER_USER_MESSAGES.FIREBASE_UNAVAILABLE);
      return;
    }

    let isMounted = true;

    async function initAuthAndReconnect() {
      try {
        const invitation = parseRoomInvitationFromUrl();
        const hasMatchingInvitation = Boolean(
          invitation && invitation.gameType === gameType
        );

        // If an invitation link has an invalid format, surface the friendly error immediately
        if (hasMatchingInvitation && invitation && !invitation.isValidFormat) {
          setInvitedRoomCode(
            invitation.normalizedRoomCode || invitation.rawRoomParam.toUpperCase()
          );
          setInvitationStatus('invalid');
          setInvitationRoomInfo(null);
          setError(MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_CODE);
        }

        const user = await ensureAnonymousSession();
        if (!isMounted) return;
        uidRef.current = user.uid;
        setUid(user.uid);

        if (!attemptedReconnectRef.current && !activeRoomCodeRef.current) {
          attemptedReconnectRef.current = true;
          const savedRoomCode = loadActiveRoomSession(gameType);

          // Only auto-reconnect to saved session if there is no different invitation code in the URL
          const shouldTrySavedReconnect = Boolean(
            savedRoomCode &&
              (!hasMatchingInvitation ||
                savedRoomCode === invitation?.normalizedRoomCode)
          );

          let didReconnect = false;

          if (shouldTrySavedReconnect && savedRoomCode) {
            setIsReconnecting(true);
            try {
              const reconnected = await reconnectToMultiplayerRoom({
                roomCode: savedRoomCode,
                expectedGameType: gameType,
              });
              if (isMounted && reconnected) {
                didReconnect = true;
                setFailedReconnectRoomCode(null);
                activeRoomCodeRef.current = reconnected.room.roomCode;
                uidRef.current = reconnected.uid;
                roomRef.current = reconnected.room;
                setRoom(reconnected.room);
                setUid(reconnected.uid);
              }
            } catch (reconnectErr) {
              // Do NOT clear the saved room session on transient network errors — allow manual retry!
              if (isMounted) {
                setFailedReconnectRoomCode(savedRoomCode);
                setIsConnected(false);
                setError(getUserFriendlyMultiplayerError(reconnectErr, 'subscription'));
              }
            } finally {
              if (isMounted) {
                setIsReconnecting(false);
              }
            }
          }

          // If opened via an invitation URL and not already in the room, validate the invitation
          // without automatically joining (the recipient must enter a nickname and click Join Room)
          if (isMounted && !didReconnect && hasMatchingInvitation && invitation) {
            setInvitedRoomCode(
              invitation.normalizedRoomCode ||
                invitation.rawRoomParam.toUpperCase()
            );

            if (!invitation.isValidFormat) {
              setInvitationStatus('invalid');
              setInvitationRoomInfo(null);
              setError(MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_CODE);
              return;
            }

            setInvitationStatus('checking');
            const validation = await validateRoomInvitation({
              rawRoomCode: invitation.rawRoomParam,
              expectedGameType: gameType,
            });
            if (!isMounted) return;

            if (validation.status === 'joinable' && validation.room) {
              setInvitationStatus('joinable');
              setInvitationRoomInfo({
                roomCode: validation.normalizedRoomCode,
                joinedCount: validation.room.playerOrder.length,
                maxPlayers: validation.room.maxPlayers,
                hostNickname:
                  validation.room.players[validation.room.hostUid]?.nickname ||
                  'Host',
              });
              setError(null);
            } else {
              setInvitationStatus(validation.status);
              setInvitationRoomInfo(null);
              setError(
                validation.userMessage ??
                  MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR
              );
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          logMultiplayerDiagnostic('initAuthAndReconnect', err);
          setError(getUserFriendlyMultiplayerError(err, 'subscription'));
        }
      }
    }

    void initAuthAndReconnect();

    return () => {
      isMounted = false;
    };
  }, [gameType, isEnabled]);

  const refreshRoom = useCallback(async (): Promise<MultiplayerRoomDocument | null> => {
    const code = activeRoomCodeRef.current ?? roomRef.current?.roomCode;
    if (!code) return null;
    setIsSynchronizing(true);
    try {
      const latest = await fetchLatestMultiplayerRoom(code);
      if (!latest) return null;
      const currentUid = uidRef.current;
      if (latest.status === 'closed' || isRoomExpired(latest, Date.now())) {
        activeRoomCodeRef.current = null;
        roomRef.current = null;
        clearActiveRoomSession(gameType);
        setRoom(null);
        setError(
          latest.status === 'closed'
            ? MULTIPLAYER_USER_MESSAGES.ROOM_CLOSED
            : MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED
        );
        return null;
      }
      if (currentUid && !(currentUid in latest.players)) {
        return null;
      }
      setRoom((prev) => {
        if (!shouldAcceptIncomingRoomState(prev, latest)) {
          return prev;
        }
        roomRef.current = latest;
        return latest;
      });
      setError(null);
      return latest;
    } catch (err) {
      logMultiplayerDiagnostic('refreshRoom', err, { roomCode: code });
      return null;
    } finally {
      setIsSynchronizing(false);
    }
  }, [gameType]);

  // Subscribe to real-time Firestore updates whenever we have an active room code.
  // Uses uidRef rather than depending on `uid` so the listener is never torn down on auth state updates.
  const currentRoomCode = room?.roomCode ?? null;

  useEffect(() => {
    if (!isEnabled || !currentRoomCode) {
      return;
    }

    activeRoomCodeRef.current = currentRoomCode;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    const unsubscribe = subscribeToMultiplayerRoom(currentRoomCode, {
      onRoomChange: (nextRoom, closedOrExpiredReason, metadata) => {
        if (!isActive) return;
        setIsSynchronizing(Boolean(metadata?.fromCache));

        if (!nextRoom) {
          // Ignore transient empty cache snapshots when we already hold a valid room
          if (metadata?.fromCache && !metadata.hasPendingWrites && roomRef.current) {
            return;
          }
          activeRoomCodeRef.current = null;
          roomRef.current = null;
          clearActiveRoomSession(gameType);
          setRoom(null);

          if (closedOrExpiredReason === 'closed') {
            setError(MULTIPLAYER_USER_MESSAGES.ROOM_CLOSED);
          } else if (closedOrExpiredReason === 'expired') {
            setError(MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED);
          }
          return;
        }

        // Ignore stale pre-join cached snapshots (e.g. cached during invite validation right before join)
        // so a newly joined guest is never falsely evicted before the server snapshot arrives.
        const currentUid = uidRef.current;
        if (currentUid && !(currentUid in nextRoom.players)) {
          if (metadata?.fromCache && !metadata.hasPendingWrites) {
            return;
          }
          activeRoomCodeRef.current = null;
          roomRef.current = null;
          clearActiveRoomSession(gameType);
          setRoom(null);
          return;
        }

        setRoom((prev) => {
          if (!shouldAcceptIncomingRoomState(prev, nextRoom, metadata)) {
            return prev;
          }
          roomRef.current = nextRoom;
          return nextRoom;
        });
      },
      onError: (err) => {
        if (!isActive) return;
        logMultiplayerDiagnostic('onSnapshot', err, { roomCode: currentRoomCode });
        setError(getUserFriendlyMultiplayerError(err, 'subscription'));
        // Automatically re-establish the listener after a brief backoff so rooms recover without refresh
        if (!retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (isActive && activeRoomCodeRef.current === currentRoomCode) {
              setSubscriptionVersion((v) => v + 1);
            }
          }, 2500);
        }
      },
    });

    return () => {
      isActive = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      unsubscribe();
    };
  }, [isEnabled, currentRoomCode, gameType, subscriptionVersion]);

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
      if (document.visibilityState === 'visible') {
        sendHeartbeat('connected');
        void refreshRoom();
      }
    };

    const handleOnline = () => {
      setIsSynchronizing(false);
      sendHeartbeat('connected');
      void refreshRoom();
    };
    const handleOffline = () => {
      setIsSynchronizing(true);
      sendHeartbeat('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isEnabled, currentRoomCode, uid, refreshRoom]);

  // Local expiry watchdog so expired rooms immediately transition even without external writes
  useEffect(() => {
    if (!isEnabled || !room) {
      return;
    }

    const expiryCheckInterval = setInterval(() => {
      if (isRoomExpired(room, Date.now())) {
        void checkAndExpireRoomIfNeeded(room, Date.now());
        activeRoomCodeRef.current = null;
        roomRef.current = null;
        clearActiveRoomSession(gameType);
        setRoom(null);
        setError(MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED);
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
      memorySettings?: Partial<MemoryRoomSettings>;
    }): Promise<MultiplayerRoomDocument | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createMultiplayerRoom({
          gameType,
          hostNickname: params.nickname,
          maxPlayers: params.maxPlayers,
          memorySettings: params.memorySettings,
        });
        clearRoomInvitationFromUrl();
        setInvitedRoomCode(null);
        setInvitationStatus('idle');
        setInvitationRoomInfo(null);
        activeRoomCodeRef.current = result.room.roomCode;
        uidRef.current = result.uid;
        roomRef.current = result.room;
        setUid(result.uid);
        setRoom(result.room);
        setPreferredNickname(loadPreferredNickname());
        return result.room;
      } catch (err) {
        logMultiplayerDiagnostic('createRoom', err);
        setError(getUserFriendlyMultiplayerError(err, 'create-room'));
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
        clearRoomInvitationFromUrl();
        setInvitedRoomCode(null);
        setInvitationStatus('idle');
        setInvitationRoomInfo(null);
        activeRoomCodeRef.current = result.room.roomCode;
        uidRef.current = result.uid;
        roomRef.current = result.room;
        setUid(result.uid);
        setRoom(result.room);
        setPreferredNickname(loadPreferredNickname());
        return result.room;
      } catch (err) {
        logMultiplayerDiagnostic('joinRoom', err, { roomCode: params.roomCode });
        setError(getUserFriendlyMultiplayerError(err, 'join-room'));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [gameType]
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    const code = activeRoomCodeRef.current ?? room?.roomCode;
    clearRoomInvitationFromUrl();
    setInvitedRoomCode(null);
    setInvitationStatus('idle');
    setInvitationRoomInfo(null);
    activeRoomCodeRef.current = null;
    roomRef.current = null;
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
    clearRoomInvitationFromUrl();
    setInvitedRoomCode(null);
    setInvitationStatus('idle');
    setInvitationRoomInfo(null);
    activeRoomCodeRef.current = null;
    roomRef.current = null;
    setRoom(null);
    setError(null);
    if (code) {
      await closeMultiplayerRoom({ roomCode: code, gameType }).catch(() => {});
    } else {
      clearActiveRoomSession(gameType);
    }
  }, [room?.roomCode, gameType]);

  const updateRoomSettings = useCallback(
    async (settings: MemoryRoomSettings): Promise<MultiplayerRoomDocument | null> => {
      const code = activeRoomCodeRef.current ?? room?.roomCode;
      if (!code) return null;
      setError(null);
      try {
        const updated = await updateMemoryRoomSettings({
          roomCode: code,
          settings,
        });
        roomRef.current = updated;
        setRoom(updated);
        return updated;
      } catch (err) {
        logMultiplayerDiagnostic('updateRoomSettings', err, { roomCode: code });
        setError(getUserFriendlyMultiplayerError(err, 'update-settings'));
        return null;
      }
    },
    [room?.roomCode]
  );

  const retryReconnect = useCallback(async (): Promise<void> => {
    const code = failedReconnectRoomCode ?? loadActiveRoomSession(gameType);
    if (!code) return;
    setIsReconnecting(true);
    setError(null);
    try {
      const reconnected = await reconnectToMultiplayerRoom({
        roomCode: code,
        expectedGameType: gameType,
      });
      if (reconnected) {
        setFailedReconnectRoomCode(null);
        setIsConnected(true);
        activeRoomCodeRef.current = reconnected.room.roomCode;
        uidRef.current = reconnected.uid;
        roomRef.current = reconnected.room;
        setRoom(reconnected.room);
        setUid(reconnected.uid);
      } else {
        setFailedReconnectRoomCode(null);
        clearActiveRoomSession(gameType);
        setError(MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED);
      }
    } catch (err) {
      logMultiplayerDiagnostic('retryReconnect', err, { roomCode: code });
      setIsConnected(false);
      setError(getUserFriendlyMultiplayerError(err, 'subscription'));
    } finally {
      setIsReconnecting(false);
    }
  }, [failedReconnectRoomCode, gameType]);

  const isHost = Boolean(room && uid && room.hostUid === uid);
  const connectionState: RoomConnectionState = isReconnecting
    ? 'reconnecting'
    : !isConnected
    ? 'disconnected'
    : isLoading || isSynchronizing
    ? 'connecting'
    : 'connected';

  return {
    room,
    uid,
    isHost,
    isLoading,
    isReconnecting,
    isSynchronizing,
    isConnected,
    connectionState,
    failedReconnectRoomCode,
    retryReconnect,
    error,
    preferredNickname,
    invitedRoomCode,
    invitationStatus,
    invitationRoomInfo,
    dismissInvitation,
    createRoom,
    joinRoom,
    updateRoomSettings,
    refreshRoom,
    syncRoom,
    leaveRoom,
    closeRoom,
    clearError,
  };
}

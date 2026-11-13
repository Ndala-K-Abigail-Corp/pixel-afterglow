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
  error: string | null;
  preferredNickname: string;
  invitedRoomCode: string | null;
  invitationStatus: InvitationValidationState;
  invitationRoomInfo: InvitationRoomInfo | null;
  dismissInvitation: () => void;
  createRoom: (params: {
    nickname: string;
    maxPlayers?: MemoryMultiplayerPlayerCount;
  }) => Promise<MultiplayerRoomDocument | null>;
  joinRoom: (params: {
    roomCode: string;
    nickname: string;
  }) => Promise<MultiplayerRoomDocument | null>;
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
                activeRoomCodeRef.current = reconnected.room.roomCode;
                uidRef.current = reconnected.uid;
                roomRef.current = reconnected.room;
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

  // Subscribe to real-time Firestore updates whenever we have an active room code.
  // Uses uidRef rather than depending on `uid` so the listener is never torn down on auth state updates.
  const currentRoomCode = room?.roomCode ?? null;

  useEffect(() => {
    if (!isEnabled || !currentRoomCode) {
      return;
    }

    activeRoomCodeRef.current = currentRoomCode;

    const unsubscribe = subscribeToMultiplayerRoom(currentRoomCode, {
      onRoomChange: (nextRoom, closedOrExpiredReason, metadata) => {
        setIsSynchronizing(Boolean(metadata?.fromCache));

        if (!nextRoom) {
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

        // If current user was removed from waiting room
        const currentUid = uidRef.current;
        if (currentUid && !(currentUid in nextRoom.players)) {
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
        logMultiplayerDiagnostic('onSnapshot', err, { roomCode: currentRoomCode });
        setError(getUserFriendlyMultiplayerError(err, 'subscription'));
      },
    });

    return () => {
      unsubscribe();
    };
  }, [isEnabled, currentRoomCode, gameType]);

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
      }
    };

    const handleOnline = () => {
      setIsSynchronizing(false);
      sendHeartbeat('connected');
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
    }): Promise<MultiplayerRoomDocument | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createMultiplayerRoom({
          gameType,
          hostNickname: params.nickname,
          maxPlayers: params.maxPlayers,
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

  const isHost = Boolean(room && uid && room.hostUid === uid);

  return {
    room,
    uid,
    isHost,
    isLoading,
    isReconnecting,
    isSynchronizing,
    isConnected,
    error,
    preferredNickname,
    invitedRoomCode,
    invitationStatus,
    invitationRoomInfo,
    dismissInvitation,
    createRoom,
    joinRoom,
    syncRoom,
    leaveRoom,
    closeRoom,
    clearError,
  };
}

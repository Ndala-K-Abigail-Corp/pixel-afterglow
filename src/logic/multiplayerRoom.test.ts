/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MultiplayerRoomDocument } from '../types/multiplayer';

const mockEnsureAnonymousSession = vi.fn();
const mockGetDocRef = vi.fn();
const mockFetchDocument = vi.fn();
const mockUpdateDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockSubscribeToDocument = vi.fn();
const mockRunFirestoreTransaction = vi.fn();
const mockIsTransactionInFlight = vi.fn(() => false);

vi.mock('../lib/auth', () => ({
  ensureAnonymousSession: (...args: unknown[]) => {
    void args;
    return mockEnsureAnonymousSession();
  },
}));

vi.mock('../lib/firestore', () => ({
  getDocRef: (...args: unknown[]) => {
    void args;
    return mockGetDocRef();
  },
  fetchDocument: (...args: unknown[]) => {
    void args;
    return mockFetchDocument();
  },
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
  deleteDocument: (...args: unknown[]) => {
    void args;
    return mockDeleteDocument();
  },
  subscribeToDocument: (...args: unknown[]) => mockSubscribeToDocument(...args),
  runFirestoreTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
    mockRunFirestoreTransaction(fn),
  isTransactionInFlight: () => mockIsTransactionInFlight(),
}));

import {
  normalizeRoomCode,
  isValidRoomCodeFormat,
  generateRoomCode,
  sanitizeNickname,
  isValidNickname,
  isPlayerEffectivelyConnected,
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
  validateHostCanStartGame,
  applyPlayerLeaveOrClose,
  createMultiplayerRoom,
  joinMultiplayerRoom,
  updatePlayerConnectionStatus,
  shouldAcceptIncomingRoomState,
  subscribeToMultiplayerRoom,
  buildRoomInvitationUrl,
  buildRoomInvitationShareData,
  parseRoomInvitationFromUrl,
  validateRoomInvitation,
  MultiplayerRoomError,
  MULTIPLAYER_USER_MESSAGES,
  resolveMultiplayerError,
  getUserFriendlyMultiplayerError,
} from './multiplayerRoom';
import {
  RoomCodeSchema,
  PlayerNicknameSchema,
  RoomCreationRequestSchema,
  RoomJoinRequestSchema,
  MultiplayerRoomDocumentSchema,
  parseFirestoreRoomDocument,
} from '../schemas/multiplayerSchemas';
import { ROOM_EXPIRY_POLICIES_MS } from '../types/multiplayer';

describe('Phase 2 – Shared Multiplayer Room Infrastructure', () => {
  const BASE_NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Room codes & Nicknames', () => {
    it('normalizes room codes case-insensitively and validates 6-char format', () => {
      expect(normalizeRoomCode('  ab7-k9p ')).toBe('AB7K9P');
      expect(isValidRoomCodeFormat('ab7k9p')).toBe(true);
      expect(isValidRoomCodeFormat('ABC12')).toBe(false);
    });

    it('generates valid 6-character unambiguous room codes', () => {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(isValidRoomCodeFormat(code)).toBe(true);
      expect(code).not.toMatch(/[0O1IL]/);
    });

    it('sanitizes and validates temporary player nicknames', () => {
      expect(sanitizeNickname('  Arcade   Hero  ')).toBe('Arcade Hero');
      expect(isValidNickname('A')).toBe(false);
      expect(isValidNickname('Player 1')).toBe(true);
    });
  });

  describe('Room creation & Joining validation', () => {
    it('builds a waiting room with host as first player', () => {
      const room = buildInitialRoomDocument({
        roomCode: 'pxl789',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        nowMs: BASE_NOW,
      });

      expect(room.roomCode).toBe('PXL789');
      expect(room.status).toBe('waiting');
      expect(room.hostUid).toBe('host-1');
      expect(room.maxPlayers).toBe(2);
      expect(room.playerOrder).toEqual(['host-1']);
      expect(room.players['host-1'].symbol).toBe('X');
      expect(room.expiresAt).toBe(BASE_NOW + ROOM_EXPIRY_POLICIES_MS.WAITING_INACTIVITY_MS);
    });

    it('allows a second player to join a waiting room and prevents duplicate entries', () => {
      const room = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        nowMs: BASE_NOW,
      });

      const joined = applyPlayerJoinOrReconnect({
        room,
        uid: 'guest-2',
        nickname: 'GuestTwo',
        nowMs: BASE_NOW + 1000,
      });

      expect(joined.playerOrder).toEqual(['host-1', 'guest-2']);
      expect(joined.players['guest-2'].symbol).toBe('O');
      expect(joined.players['guest-2'].isHost).toBe(false);

      // Re-joining with the same UID reconnects without duplicating playerOrder
      const reconnected = applyPlayerJoinOrReconnect({
        room: {
          ...joined,
          players: {
            ...joined.players,
            'guest-2': {
              ...joined.players['guest-2'],
              connectionStatus: 'disconnected',
            },
          },
        },
        uid: 'guest-2',
        nickname: 'GuestTwo',
        nowMs: BASE_NOW + 5000,
      });

      expect(reconnected.playerOrder).toEqual(['host-1', 'guest-2']);
      expect(reconnected.players['guest-2'].connectionStatus).toBe('connected');
    });

    it('rejects joining when the room is full, already started, closed, or expired', () => {
      const baseRoom = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        nowMs: BASE_NOW,
      });

      const fullRoom = applyPlayerJoinOrReconnect({
        room: baseRoom,
        uid: 'guest-2',
        nickname: 'GuestTwo',
        nowMs: BASE_NOW + 1000,
      });

      // Full room rejection for a 3rd player
      expect(() =>
        applyPlayerJoinOrReconnect({
          room: fullRoom,
          uid: 'guest-3',
          nickname: 'ThirdWheel',
          nowMs: BASE_NOW + 2000,
        })
      ).toThrowError(MultiplayerRoomError);

      // Started game rejection for new player
      const startedRoom: MultiplayerRoomDocument = {
        ...baseRoom,
        status: 'in_progress',
      };
      expect(() =>
        applyPlayerJoinOrReconnect({
          room: startedRoom,
          uid: 'guest-3',
          nickname: 'LatePlayer',
          nowMs: BASE_NOW + 2000,
        })
      ).toThrow(/already started/i);

      // Existing player CAN reconnect to an in_progress room after browser refresh
      const reconnectedInProgress = applyPlayerJoinOrReconnect({
        room: { ...fullRoom, status: 'in_progress' },
        uid: 'guest-2',
        nowMs: BASE_NOW + 3000,
      });
      expect(reconnectedInProgress.players['guest-2'].connectionStatus).toBe('connected');

      // Expired room rejection
      expect(() =>
        applyPlayerJoinOrReconnect({
          room: baseRoom,
          uid: 'guest-2',
          nickname: 'GuestTwo',
          nowMs: baseRoom.expiresAt + 1,
        })
      ).toThrow(/expired/i);

      // Closed room rejection
      expect(() =>
        applyPlayerJoinOrReconnect({
          room: { ...baseRoom, status: 'closed' },
          uid: 'guest-2',
          nickname: 'GuestTwo',
          nowMs: BASE_NOW + 1000,
        })
      ).toThrow(/closed/i);
    });
  });

  describe('Host permissions, Disconnection, and Expiry Policies', () => {
    it('enforces that only the host can start and only when the minimum player requirement is met', () => {
      const room = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        maxPlayers: 8,
        nowMs: BASE_NOW,
      });

      // Host cannot start when only 1/8 players joined (min 3 required)
      expect(() => validateHostCanStartGame(room, 'host-1', BASE_NOW)).toThrow(
        /Waiting for players/i
      );

      const with2 = applyPlayerJoinOrReconnect({
        room,
        uid: 'guest-2',
        nickname: 'Guest2',
        nowMs: BASE_NOW,
      });

      // Host still cannot start when 2/8 players joined (min 3 required)
      expect(() => validateHostCanStartGame(with2, 'host-1', BASE_NOW)).toThrow(
        /Waiting for players/i
      );

      const with3 = applyPlayerJoinOrReconnect({
        room: with2,
        uid: 'guest-3',
        nickname: 'Guest3',
        nowMs: BASE_NOW,
      });

      // Non-host cannot start even when 3/8 joined
      expect(() => validateHostCanStartGame(with3, 'guest-2', BASE_NOW)).toThrow(
        /Only the room host/i
      );

      // Host can start once minimum 3 players joined in an 8-player room
      expect(() => validateHostCanStartGame(with3, 'host-1', BASE_NOW)).not.toThrow();
    });

    it('detects stale heartbeat disconnections and handles host/guest departure accurately', () => {
      const room = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        nowMs: BASE_NOW,
      });
      const fullRoom = applyPlayerJoinOrReconnect({
        room,
        uid: 'guest-2',
        nickname: 'Guest2',
        nowMs: BASE_NOW,
      });

      expect(isPlayerEffectivelyConnected(fullRoom.players['host-1'], BASE_NOW + 10_000)).toBe(
        true
      );
      expect(
        isPlayerEffectivelyConnected(
          fullRoom.players['host-1'],
          BASE_NOW + ROOM_EXPIRY_POLICIES_MS.DISCONNECT_THRESHOLD_MS + 1000
        )
      ).toBe(false);

      // Guest leaving during waiting frees their slot
      const afterGuestLeft = applyPlayerLeaveOrClose({
        room: fullRoom,
        callerUid: 'guest-2',
        nowMs: BASE_NOW + 5000,
      });
      expect(afterGuestLeft.shouldDelete).toBe(false);
      expect(afterGuestLeft.nextRoom.playerOrder).toEqual(['host-1']);

      // Host leaving closes the room immediately and marks it for deletion
      const afterHostLeft = applyPlayerLeaveOrClose({
        room: fullRoom,
        callerUid: 'host-1',
        nowMs: BASE_NOW + 5000,
      });
      expect(afterHostLeft.nextRoom.status).toBe('closed');
      expect(afterHostLeft.shouldDelete).toBe(true);
    });

    it('retries room code generation if a collision occurs in Firestore transaction', async () => {
      mockEnsureAnonymousSession.mockResolvedValue({ uid: 'host-1' });
      mockGetDocRef.mockReturnValue({});

      let callCount = 0;
      mockRunFirestoreTransaction.mockImplementation(async (callback) => {
        callCount++;
        const fakeTx = {
          get: async () => ({
            exists: () => callCount === 1, // First attempt collides with an active room
            data: () =>
              buildInitialRoomDocument({
                roomCode: 'ABCDEF',
                gameType: 'tic-tac-toe',
                hostUid: 'other-host',
                hostNickname: 'Other',
                nowMs: Date.now(),
              }),
          }),
          set: vi.fn(),
        };
        return callback(fakeTx);
      });

      const result = await createMultiplayerRoom({
        gameType: 'tic-tac-toe',
        hostNickname: 'HostOne',
      });

      expect(callCount).toBe(2);
      expect(result.room.hostUid).toBe('host-1');
    });

    it('cleans up an expired room document when a player attempts to join it', async () => {
      mockEnsureAnonymousSession.mockResolvedValue({ uid: 'guest-2' });
      mockGetDocRef.mockReturnValue({});
      mockDeleteDocument.mockResolvedValue(undefined);

      const expiredRoom = buildInitialRoomDocument({
        roomCode: 'EXP234',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        nowMs: 1_000_000,
      });

      mockRunFirestoreTransaction.mockImplementation(async (callback) => {
        const fakeTx = {
          get: async () => ({
            exists: () => true,
            data: () => expiredRoom,
          }),
          set: vi.fn(),
        };
        return callback(fakeTx);
      });

      await expect(
        joinMultiplayerRoom({
          roomCode: 'exp234',
          nickname: 'GuestTwo',
        })
      ).rejects.toThrow(/expired/i);

      expect(mockDeleteDocument).toHaveBeenCalledTimes(1);
    });

    it('throttles redundant presence updates and uses targeted dot-notation field updates instead of transactions', async () => {
      mockEnsureAnonymousSession.mockResolvedValue({ uid: 'host-1' });
      mockUpdateDocument.mockResolvedValue(undefined);
      mockIsTransactionInFlight.mockReturnValue(false);

      const now = Date.now();
      const freshRoom = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        nowMs: now - 5_000, // Only 5s old (< HEARTBEAT_MIN_WRITE_INTERVAL_MS)
      });

      // 1. Skips write when status is unchanged and lastSeenAt is recent
      await updatePlayerConnectionStatus({
        roomCode: 'PXL789',
        connectionStatus: 'connected',
        currentRoom: freshRoom,
      });
      expect(mockUpdateDocument).not.toHaveBeenCalled();
      expect(mockRunFirestoreTransaction).not.toHaveBeenCalled();

      // 2. Performs targeted dot-notation update when lastSeenAt is older than threshold
      const olderRoom = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        nowMs: now - (ROOM_EXPIRY_POLICIES_MS.HEARTBEAT_MIN_WRITE_INTERVAL_MS + 5_000),
      });

      await updatePlayerConnectionStatus({
        roomCode: 'PXL789',
        connectionStatus: 'connected',
        currentRoom: olderRoom,
      });

      expect(mockRunFirestoreTransaction).not.toHaveBeenCalled();
      expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
      const [collectionName, docId, payload] = mockUpdateDocument.mock.calls[0];
      expect(collectionName).toBe('rooms');
      expect(docId).toBe('PXL789');
      expect(payload).toHaveProperty(['players.host-1.connectionStatus'], 'connected');
      expect(payload).toHaveProperty(['players.host-1.lastSeenAt']);
      expect(payload).not.toHaveProperty('ticTacToeState');
      expect(payload).not.toHaveProperty('memoryMatchState');
    });
  });

  describe('Zod Validation, Centralised Error Handling & Stale Snapshot Protection', () => {
    it('validates room creation requests, room codes, nicknames, and Firestore room documents with Zod', () => {
      // Valid room code & nickname
      expect(RoomCodeSchema.safeParse('  ab7k9p ').success).toBe(true);
      expect(RoomCodeSchema.safeParse('INVALID!').success).toBe(false);
      expect(PlayerNicknameSchema.safeParse('  Pixel_Hero  ').success).toBe(true);
      expect(PlayerNicknameSchema.safeParse('A').success).toBe(false);

      // Valid & invalid room creation requests
      expect(
        RoomCreationRequestSchema.safeParse({
          gameType: 'memory-match',
          hostNickname: 'ArcadeHost',
          maxPlayers: 8,
        }).success
      ).toBe(true);
      expect(
        RoomCreationRequestSchema.safeParse({
          gameType: 'memory-match',
          hostNickname: 'ArcadeHost',
          maxPlayers: 9,
        }).success
      ).toBe(false);

      // Valid & invalid room join requests
      expect(
        RoomJoinRequestSchema.safeParse({
          roomCode: 'pxl234',
          nickname: 'PlayerTwo',
        }).success
      ).toBe(true);
      expect(
        RoomJoinRequestSchema.safeParse({
          roomCode: '12',
          nickname: '',
        }).success
      ).toBe(false);

      // Valid & malformed Firestore room documents
      const validRoom = buildInitialRoomDocument({
        roomCode: 'ZOD234',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        maxPlayers: 4,
        nowMs: BASE_NOW,
      });
      expect(MultiplayerRoomDocumentSchema.safeParse(validRoom).success).toBe(true);
      const parsedValid = parseFirestoreRoomDocument(validRoom, 'ZOD234');
      expect(parsedValid?.roomCode).toBe('ZOD234');

      // Malformed Firestore document (e.g., hostUid not in playerOrder or negative expiresAt) is safely rejected
      const malformedRoom = {
        ...validRoom,
        playerOrder: ['someone-else'],
      };
      expect(MultiplayerRoomDocumentSchema.safeParse(malformedRoom).success).toBe(false);
      expect(parseFirestoreRoomDocument(malformedRoom, 'ZOD234')).toBeNull();
    });

    it('rejects duplicate nicknames within the same room with DUPLICATE_NICKNAME friendly message', () => {
      const room = buildInitialRoomDocument({
        roomCode: 'DUP234',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'PixelAce',
        maxPlayers: 4,
        nowMs: BASE_NOW,
      });

      expect(() =>
        applyPlayerJoinOrReconnect({
          room,
          uid: 'guest-2',
          nickname: 'pixelace',
          nowMs: BASE_NOW + 500,
        })
      ).toThrowError(
        new MultiplayerRoomError(
          'DUPLICATE_NICKNAME',
          MULTIPLAYER_USER_MESSAGES.DUPLICATE_NICKNAME
        )
      );
    });

    it('maps all multiplayer and Firebase error conditions to clear, user-friendly messages and never exposes raw FirebaseError text', () => {
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('ROOM_NOT_FOUND'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND);
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('ROOM_FULL'))
      ).toBe('This room is full. Try joining another room.');
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('ROOM_EXPIRED'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED);
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('GAME_ALREADY_STARTED'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.GAME_ALREADY_STARTED);
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('INVALID_NICKNAME'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.INVALID_NICKNAME);
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('DUPLICATE_NICKNAME'))
      ).toBe('This nickname is already being used in this room.');
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('INVALID_ROOM_CODE'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_CODE);
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('NOT_HOST'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.NOT_HOST);
      expect(
        getUserFriendlyMultiplayerError(new MultiplayerRoomError('INVALID_MOVE'))
      ).toBe(MULTIPLAYER_USER_MESSAGES.INVALID_MOVE);

      // Raw Firebase permission-denied error must never show "FirebaseError: Missing or insufficient permissions"
      const rawFirebasePermError = {
        code: 'permission-denied',
        message: 'FirebaseError: Missing or insufficient permissions.',
      };
      const resolvedPerm = resolveMultiplayerError(rawFirebasePermError, 'join-room');
      expect(resolvedPerm.code).toBe('PERMISSION_DENIED');
      expect(resolvedPerm.userMessage).toBe(MULTIPLAYER_USER_MESSAGES.PERMISSION_DENIED);
      expect(resolvedPerm.userMessage).not.toMatch(/FirebaseError|insufficient permissions/i);

      // Network & Firebase unavailability
      expect(
        getUserFriendlyMultiplayerError({
          code: 'unavailable',
          message: 'Cloud Firestore backend unavailable',
        })
      ).toBe(MULTIPLAYER_USER_MESSAGES.NETWORK_DISCONNECTED);
      expect(
        getUserFriendlyMultiplayerError({
          code: 'auth/invalid-api-key',
          message: 'Invalid API key',
        })
      ).toBe(MULTIPLAYER_USER_MESSAGES.FIREBASE_UNAVAILABLE);
      expect(getUserFriendlyMultiplayerError(new Error('Some internal stack trace'))).toBe(
        MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR
      );
    });

    it('translates concurrent join permission-denied / conflict on the last slot into ROOM_FULL on the first attempt', async () => {
      mockEnsureAnonymousSession.mockResolvedValue({ uid: 'guest-3' });
      mockGetDocRef.mockReturnValue({});

      // Build a 2-player room that just became full on the server when guest-2 joined concurrently
      const baseRoom = buildInitialRoomDocument({
        roomCode: 'FUL234',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: Date.now(),
      });
      const fullServerRoom = applyPlayerJoinOrReconnect({
        room: baseRoom,
        uid: 'guest-2',
        nickname: 'GuestTwo',
        nowMs: Date.now() + 100,
      });

      // Simulate Firestore transaction commit rejecting with FirebaseError: Missing or insufficient permissions
      // because guest-2 filled the final slot right as guest-3 committed
      mockRunFirestoreTransaction.mockRejectedValueOnce({
        code: 'permission-denied',
        message: 'FirebaseError: Missing or insufficient permissions.',
      });
      mockFetchDocument.mockResolvedValueOnce(fullServerRoom);

      await expect(
        joinMultiplayerRoom({
          roomCode: 'FUL234',
          nickname: 'GuestThree',
        })
      ).rejects.toMatchObject({
        code: 'ROOM_FULL',
        message: 'This room is full. Try joining another room.',
      });
    });

    it('rejects stale cached snapshots and older rounds in shouldAcceptIncomingRoomState and subscribeToMultiplayerRoom', () => {
      const round1Room: MultiplayerRoomDocument = {
        ...buildInitialRoomDocument({
          roomCode: 'SYN234',
          gameType: 'memory-match',
          hostUid: 'host-1',
          hostNickname: 'HostOne',
          maxPlayers: 2,
          nowMs: BASE_NOW,
        }),
        status: 'completed',
        lastActivityAt: BASE_NOW + 5000,
        memoryMatchState: {
          cards: [],
          flippedCardIds: [],
          matchedPairs: 10,
          totalPairs: 10,
          matchedByPairKey: {},
          turnOrderUids: ['host-1', 'guest-2'],
          currentTurnIndex: 0,
          currentTurnUid: 'host-1',
          pendingResetAt: null,
          winnerUids: ['host-1'],
          isTie: false,
          roundNumber: 1,
        },
      };

      const round2Room: MultiplayerRoomDocument = {
        ...round1Room,
        status: 'in_progress',
        lastActivityAt: BASE_NOW + 6000,
        memoryMatchState: {
          ...round1Room.memoryMatchState!,
          matchedPairs: 0,
          winnerUids: [],
          roundNumber: 2,
        },
      };

      // Accepting round 2 over round 1 succeeds
      expect(shouldAcceptIncomingRoomState(round1Room, round2Room)).toBe(true);

      // Stale round 1 snapshot arriving after round 2 has started is rejected
      expect(shouldAcceptIncomingRoomState(round2Room, round1Room)).toBe(false);

      // Cached snapshot with fewer matchedPairs within the same round is rejected
      const round2WithMatch: MultiplayerRoomDocument = {
        ...round2Room,
        lastActivityAt: BASE_NOW + 7000,
        memoryMatchState: {
          ...round2Room.memoryMatchState!,
          matchedPairs: 1,
        },
      };
      expect(
        shouldAcceptIncomingRoomState(round2WithMatch, round2Room, {
          fromCache: true,
          hasPendingWrites: false,
        })
      ).toBe(false);

      // Verify subscribeToMultiplayerRoom validates and deep-clones incoming documents
      let capturedOnData: ((data: MultiplayerRoomDocument | null, id: string) => void) | null =
        null;
      mockSubscribeToDocument.mockImplementation(
        (_col, _id, callbacks: { onData: (data: MultiplayerRoomDocument | null, id: string) => void }) => {
          capturedOnData = callbacks.onData;
          return vi.fn();
        }
      );

      const received: (MultiplayerRoomDocument | null)[] = [];
      subscribeToMultiplayerRoom('SYN234', {
        onRoomChange: (room) => received.push(room),
      });

      const liveNow = Date.now();
      const validWaiting = buildInitialRoomDocument({
        roomCode: 'SYN234',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: liveNow,
      });
      capturedOnData!(validWaiting, 'SYN234');
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(validWaiting);
      expect(received[0]).not.toBe(validWaiting); // Deep-cloned so React state always detects changes
    });

    it('generates shareable room invitation URLs and parses room codes across query and path formats', () => {
      const url = buildRoomInvitationUrl(
        'nfgn-tr',
        'memory-match',
        'https://pixel-afterglow.vercel.app/'
      );
      expect(url).toBe('https://pixel-afterglow.vercel.app/?game=memory-match&room=NFGNTR');

      const shareData = buildRoomInvitationShareData({
        roomCode: 'nfgntr',
        gameType: 'memory-match',
        gameTitle: 'Memory Match',
        baseOrigin: 'https://pixel-afterglow.vercel.app',
      });
      expect(shareData.roomCode).toBe('NFGNTR');
      expect(shareData.invitationUrl).toBe(
        'https://pixel-afterglow.vercel.app/?game=memory-match&room=NFGNTR'
      );
      expect(shareData.message).toContain(
        "You're invited to play Memory Match on Pixel Afterglow!"
      );
      expect(shareData.message).toContain(shareData.invitationUrl);
      expect(shareData.message).toContain('Enter your arcade nickname to join.');

      // 1. Query param format: /?game=memory-match&room=NFGNTR
      const parsedQuery = parseRoomInvitationFromUrl(
        'https://pixel-afterglow.vercel.app/?game=memory-match&room=nfgntr'
      );
      expect(parsedQuery).toEqual({
        rawRoomParam: 'nfgntr',
        normalizedRoomCode: 'NFGNTR',
        isValidFormat: true,
        gameType: 'memory-match',
      });

      // 2. Path + query format: /games/memory-match?room=NFGNTR
      const parsedPathQuery = parseRoomInvitationFromUrl(
        'https://pixel-afterglow.vercel.app/games/memory-match?room=NFGNTR'
      );
      expect(parsedPathQuery).toEqual({
        rawRoomParam: 'NFGNTR',
        normalizedRoomCode: 'NFGNTR',
        isValidFormat: true,
        gameType: 'memory-match',
      });

      // 3. Invalid room code in URL is detected and marked isValidFormat: false
      const parsedInvalid = parseRoomInvitationFromUrl(
        'https://pixel-afterglow.vercel.app/?game=memory-match&room=BAD!'
      );
      expect(parsedInvalid).toEqual({
        rawRoomParam: 'BAD!',
        normalizedRoomCode: 'BAD',
        isValidFormat: false,
        gameType: 'memory-match',
      });

      // 4. Normal home URL without room parameter returns null
      expect(parseRoomInvitationFromUrl('https://pixel-afterglow.vercel.app/')).toBeNull();
    });

    it('validates invited rooms before joining: joinable, invalid code, missing, expired, full, and already started', async () => {
      mockEnsureAnonymousSession.mockResolvedValue({ uid: 'guest-new' });

      // 1. Invalid room code format -> friendly INVALID_ROOM_CODE without querying Firestore
      const invalidRes = await validateRoomInvitation({
        rawRoomCode: '12!',
        expectedGameType: 'memory-match',
      });
      expect(invalidRes.status).toBe('invalid');
      expect(invalidRes.errorCode).toBe('INVALID_ROOM_CODE');
      expect(invalidRes.userMessage).toBe(MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_CODE);
      expect(mockFetchDocument).not.toHaveBeenCalled();

      // 2. Non-existent room -> ROOM_NOT_FOUND
      mockFetchDocument.mockResolvedValueOnce(null);
      const missingRes = await validateRoomInvitation({
        rawRoomCode: 'NFGNTR',
        expectedGameType: 'memory-match',
      });
      expect(missingRes.status).toBe('unavailable');
      expect(missingRes.errorCode).toBe('ROOM_NOT_FOUND');
      expect(missingRes.userMessage).toBe(MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND);

      // 3. Expired room -> ROOM_EXPIRED and cleans up document
      const expiredRoom = buildInitialRoomDocument({
        roomCode: 'EXP789',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 4,
        nowMs: BASE_NOW,
      });
      mockFetchDocument.mockResolvedValueOnce(expiredRoom);
      mockDeleteDocument.mockResolvedValueOnce(undefined);
      const expiredRes = await validateRoomInvitation({
        rawRoomCode: 'EXP789',
        expectedGameType: 'memory-match',
        nowMs: expiredRoom.expiresAt + 1000,
      });
      expect(expiredRes.status).toBe('unavailable');
      expect(expiredRes.errorCode).toBe('ROOM_EXPIRED');
      expect(expiredRes.userMessage).toBe(MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED);

      // 4. Full room -> ROOM_FULL
      const room2P = buildInitialRoomDocument({
        roomCode: 'FUL789',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: BASE_NOW,
      });
      const fullRoom2P = applyPlayerJoinOrReconnect({
        room: room2P,
        uid: 'guest-2',
        nickname: 'GuestTwo',
        nowMs: BASE_NOW + 100,
      });
      mockFetchDocument.mockResolvedValueOnce(fullRoom2P);
      const fullRes = await validateRoomInvitation({
        rawRoomCode: 'FUL789',
        expectedGameType: 'memory-match',
        nowMs: BASE_NOW + 500,
      });
      expect(fullRes.status).toBe('unavailable');
      expect(fullRes.errorCode).toBe('ROOM_FULL');
      expect(fullRes.userMessage).toBe(MULTIPLAYER_USER_MESSAGES.ROOM_FULL);

      // 5. Already-started room -> GAME_ALREADY_STARTED
      const startedRoom: MultiplayerRoomDocument = {
        ...room2P,
        status: 'in_progress',
      };
      mockFetchDocument.mockResolvedValueOnce(startedRoom);
      const startedRes = await validateRoomInvitation({
        rawRoomCode: 'FUL789',
        expectedGameType: 'memory-match',
        nowMs: BASE_NOW + 500,
      });
      expect(startedRes.status).toBe('unavailable');
      expect(startedRes.errorCode).toBe('GAME_ALREADY_STARTED');
      expect(startedRes.userMessage).toBe(MULTIPLAYER_USER_MESSAGES.GAME_ALREADY_STARTED);

      // 6. Open waiting room -> joinable
      mockFetchDocument.mockResolvedValueOnce(room2P);
      const joinableRes = await validateRoomInvitation({
        rawRoomCode: 'ful789',
        expectedGameType: 'memory-match',
        nowMs: BASE_NOW + 500,
      });
      expect(joinableRes.status).toBe('joinable');
      expect(joinableRes.errorCode).toBeNull();
      expect(joinableRes.normalizedRoomCode).toBe('FUL789');
      expect(joinableRes.room?.roomCode).toBe('FUL789');
    });
  });
});

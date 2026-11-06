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
  subscribeToDocument: (...args: unknown[]) => {
    void args;
    return mockSubscribeToDocument();
  },
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
  MultiplayerRoomError,
} from './multiplayerRoom';
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
    it('enforces that only the host can start and only when the room is full', () => {
      const room = buildInitialRoomDocument({
        roomCode: 'PXL789',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostAce',
        maxPlayers: 3,
        nowMs: BASE_NOW,
      });

      // Host cannot start when only 1/3 players joined
      expect(() => validateHostCanStartGame(room, 'host-1', BASE_NOW)).toThrow(
        /Waiting for players/i
      );

      const with2 = applyPlayerJoinOrReconnect({
        room,
        uid: 'guest-2',
        nickname: 'Guest2',
        nowMs: BASE_NOW,
      });
      const with3 = applyPlayerJoinOrReconnect({
        room: with2,
        uid: 'guest-3',
        nickname: 'Guest3',
        nowMs: BASE_NOW,
      });

      // Non-host cannot start even when 3/3 joined
      expect(() => validateHostCanStartGame(with3, 'guest-2', BASE_NOW)).toThrow(
        /Only the room host/i
      );

      // Host can start when 3/3 joined and connected
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
});

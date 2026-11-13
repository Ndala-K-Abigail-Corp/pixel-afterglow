/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MultiplayerGameType,
  MultiplayerRoomDocument,
  RoomPlayer,
  RoomStatus,
  MemoryMultiplayerPlayerCount,
  MEMORY_MULTIPLAYER_CONFIGS,
  ROOM_EXPIRY_POLICIES_MS,
  getMinimumPlayersToStart,
  computeRoomExpiresAt,
  isRoomExpired,
  isValidRoomStateTransition,
} from '../types/multiplayer';
import { ensureAnonymousSession } from '../lib/auth';
import {
  getDocRef,
  fetchDocument,
  updateDocument,
  deleteDocument,
  subscribeToDocument,
  runFirestoreTransaction,
  isTransactionInFlight,
  type FirestoreSnapshotMetadata,
} from '../lib/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import {
  MultiplayerRoomError,
  type MultiplayerErrorCode,
  MULTIPLAYER_USER_MESSAGES,
  resolveMultiplayerError,
  getUserFriendlyMultiplayerError,
  logMultiplayerDiagnostic,
} from '../utils/multiplayerErrors';
import {
  validateRoomCreationInput,
  validateRoomJoinInput,
  parseFirestoreRoomDocument,
} from '../schemas/multiplayerSchemas';

export {
  MultiplayerRoomError,
  type MultiplayerErrorCode,
  MULTIPLAYER_USER_MESSAGES,
  resolveMultiplayerError,
  getUserFriendlyMultiplayerError,
  logMultiplayerDiagnostic,
};

export const ROOMS_COLLECTION = 'rooms';
export const ROOM_CODE_LENGTH = 6;
// Unambiguous uppercase alphanumeric characters (excludes 0, O, 1, I, L)
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Normalizes a user-entered room code (trims whitespace and converts to uppercase)
 * so room codes are always case-insensitive.
 */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Validates that a normalized room code matches the 6-character alphanumeric format.
 */
export function isValidRoomCodeFormat(input: string): boolean {
  const normalized = normalizeRoomCode(input);
  return /^[A-Z0-9]{6}$/.test(normalized);
}

/**
 * Generates a short, easy-to-share 6-character room code.
 */
export function generateRoomCode(randomFn: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.floor(randomFn() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

/**
 * Sanitizes a temporary player nickname (collapses whitespace, trims to 16 chars).
 */
export function sanitizeNickname(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, 16);
}

/**
 * Checks whether a nickname is valid (between 2 and 16 characters after sanitization).
 */
export function isValidNickname(input: string): boolean {
  const sanitized = sanitizeNickname(input);
  return sanitized.length >= 2 && sanitized.length <= 16;
}

/**
 * Determines whether a player is currently considered connected based on both their
 * reported status and their last heartbeat timestamp.
 */
export function isPlayerEffectivelyConnected(
  player: Pick<RoomPlayer, 'connectionStatus' | 'lastSeenAt'>,
  nowMs: number = Date.now()
): boolean {
  if (player.connectionStatus !== 'connected') {
    return false;
  }
  return nowMs - player.lastSeenAt <= ROOM_EXPIRY_POLICIES_MS.DISCONNECT_THRESHOLD_MS;
}

/**
 * Builds the initial MultiplayerRoomDocument when a host creates a room.
 */
export function buildInitialRoomDocument(params: {
  roomCode: string;
  gameType: MultiplayerGameType;
  hostUid: string;
  hostNickname: string;
  maxPlayers?: MemoryMultiplayerPlayerCount;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const nowMs = params.nowMs ?? Date.now();
  const roomCode = normalizeRoomCode(params.roomCode);
  const nickname = sanitizeNickname(params.hostNickname);

  if (!isValidNickname(nickname)) {
    throw new MultiplayerRoomError(
      'INVALID_NICKNAME',
      'Nickname must be between 2 and 16 characters.'
    );
  }

  if (!isValidRoomCodeFormat(roomCode)) {
    throw new MultiplayerRoomError(
      'INVALID_ROOM_CODE',
      'Room code must be 6 alphanumeric characters.'
    );
  }

  const maxPlayers =
    params.gameType === 'tic-tac-toe'
      ? 2
      : (params.maxPlayers ?? 2);

  if (
    params.gameType === 'memory-match' &&
    !(maxPlayers in MEMORY_MULTIPLAYER_CONFIGS)
  ) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Memory Match rooms must be configured for 2 to 8 players.'
    );
  }

  const hostPlayer: RoomPlayer = {
    uid: params.hostUid,
    nickname,
    isHost: true,
    joinedAt: nowMs,
    lastSeenAt: nowMs,
    connectionStatus: 'connected',
    symbol: params.gameType === 'tic-tac-toe' ? 'X' : null,
    score: 0,
    rematchAccepted: false,
  };

  return {
    roomCode,
    gameType: params.gameType,
    status: 'waiting',
    hostUid: params.hostUid,
    maxPlayers,
    players: {
      [params.hostUid]: hostPlayer,
    },
    playerOrder: [params.hostUid],
    currentTurnUid: null,
    createdAt: nowMs,
    lastActivityAt: nowMs,
    startedAt: null,
    completedAt: null,
    expiresAt: computeRoomExpiresAt('waiting', nowMs),
    ticTacToeState: null,
    memoryMatchState: null,
  };
}

/**
 * Checks whether another player in the room is already using the candidate nickname (case-insensitive).
 */
export function hasDuplicateNicknameInRoom(
  room: Pick<MultiplayerRoomDocument, 'players'>,
  candidateNickname: string,
  excludeUid?: string
): boolean {
  const normalizedCandidate = sanitizeNickname(candidateNickname).toLowerCase();
  if (!normalizedCandidate) return false;
  return Object.values(room.players).some(
    (player) =>
      player.uid !== excludeUid &&
      sanitizeNickname(player.nickname).toLowerCase() === normalizedCandidate
  );
}

/**
 * Pure validator & state reducer for a player joining or reconnecting to a room.
 * Prevents duplicate entries, rejects duplicate nicknames, rejects full rooms,
 * rejects started games (for new players), and rejects expired/closed rooms.
 */
export function applyPlayerJoinOrReconnect(params: {
  room: MultiplayerRoomDocument;
  uid: string;
  nickname?: string;
  expectedGameType?: MultiplayerGameType;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room, uid, expectedGameType } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room was closed by the host.');
  }

  if (isRoomExpired(room, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired due to inactivity.');
  }

  if (expectedGameType && room.gameType !== expectedGameType) {
    throw new MultiplayerRoomError(
      'INVALID_ROOM_CODE',
      `Room ${room.roomCode} is for ${
        room.gameType === 'tic-tac-toe' ? 'Tic-Tac-Toe' : 'Memory Match'
      }.`
    );
  }

  const existingPlayer = room.players[uid];

  // Reconnection path: player is already a member of this room
  if (existingPlayer) {
    const candidateNickname =
      params.nickname && isValidNickname(params.nickname)
        ? sanitizeNickname(params.nickname)
        : existingPlayer.nickname;

    const updatedNickname = hasDuplicateNicknameInRoom(room, candidateNickname, uid)
      ? existingPlayer.nickname
      : candidateNickname;

    const updatedPlayers: Record<string, RoomPlayer> = {
      ...room.players,
      [uid]: {
        ...existingPlayer,
        nickname: updatedNickname,
        lastSeenAt: nowMs,
        connectionStatus: 'connected',
      },
    };

    return {
      ...room,
      players: updatedPlayers,
      lastActivityAt: nowMs,
      expiresAt: computeRoomExpiresAt(room.status, nowMs),
    };
  }

  // New player joining path
  if (room.status !== 'waiting') {
    throw new MultiplayerRoomError(
      'GAME_ALREADY_STARTED',
      'This game has already started. New players can no longer join.'
    );
  }

  if (room.playerOrder.length >= room.maxPlayers) {
    throw new MultiplayerRoomError(
      'ROOM_FULL',
      'This room is full. Try joining another room.'
    );
  }

  const sanitizedNickname = sanitizeNickname(params.nickname ?? '');
  if (!isValidNickname(sanitizedNickname)) {
    throw new MultiplayerRoomError(
      'INVALID_NICKNAME',
      'Please enter a valid arcade nickname.'
    );
  }

  if (hasDuplicateNicknameInRoom(room, sanitizedNickname, uid)) {
    throw new MultiplayerRoomError(
      'DUPLICATE_NICKNAME',
      'This nickname is already being used in this room.'
    );
  }

  const newPlayer: RoomPlayer = {
    uid,
    nickname: sanitizedNickname,
    isHost: false,
    joinedAt: nowMs,
    lastSeenAt: nowMs,
    connectionStatus: 'connected',
    symbol: room.gameType === 'tic-tac-toe' ? 'O' : null,
    score: 0,
    rematchAccepted: false,
  };

  const nextOrder = room.playerOrder.includes(uid)
    ? room.playerOrder
    : [...room.playerOrder, uid];

  return {
    ...room,
    players: {
      ...room.players,
      [uid]: newPlayer,
    },
    playerOrder: nextOrder,
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('waiting', nowMs),
  };
}

/**
 * Validates that the host is permitted to start the game in the room.
 */
export function validateHostCanStartGame(
  room: MultiplayerRoomDocument,
  callerUid: string,
  nowMs: number = Date.now()
): void {
  if (room.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is closed.');
  }
  if (isRoomExpired(room, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired.');
  }
  if (room.hostUid !== callerUid) {
    throw new MultiplayerRoomError('NOT_HOST', 'Only the room host can start the game.');
  }
  if (!isValidRoomStateTransition(room.status, 'in_progress')) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      `Cannot start game from room status "${room.status}".`
    );
  }
  const minPlayers = getMinimumPlayersToStart(room.maxPlayers, room.gameType);
  if (room.playerOrder.length < minPlayers) {
    throw new MultiplayerRoomError(
      'NOT_ENOUGH_PLAYERS',
      `Waiting for players (${room.playerOrder.length}/${room.maxPlayers} joined, minimum ${minPlayers} required).`
    );
  }
  if (room.playerOrder.length > room.maxPlayers) {
    throw new MultiplayerRoomError(
      'ROOM_FULL',
      `Room exceeds maximum capacity (${room.playerOrder.length}/${room.maxPlayers}).`
    );
  }

  const caller = room.players[callerUid];
  if (!caller || !isPlayerEffectivelyConnected(caller, nowMs)) {
    throw new MultiplayerRoomError(
      'PLAYER_DISCONNECTED',
      'You are currently disconnected. Reconnect before starting.'
    );
  }
}

/**
 * Pure state reducer for when a player leaves or the host closes the room.
 * Policy:
 * - If the host leaves permanently or closes the room, the room transitions to 'closed'.
 * - If a guest leaves while the room is 'waiting', they are removed from `players` and `playerOrder`.
 * - If a guest leaves during 'in_progress', they are marked 'disconnected'.
 * - If all players have left or are disconnected and nobody remains, the room is marked 'expired'.
 */
export function applyPlayerLeaveOrClose(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  forceCloseByHost?: boolean;
  nowMs?: number;
}): { nextRoom: MultiplayerRoomDocument; shouldDelete: boolean } {
  const { room, callerUid, forceCloseByHost = false } = params;
  const nowMs = params.nowMs ?? Date.now();

  // Host departure or explicit host close -> close room immediately
  if (room.hostUid === callerUid || forceCloseByHost) {
    if (forceCloseByHost && room.hostUid !== callerUid) {
      throw new MultiplayerRoomError('NOT_HOST', 'Only the room host can close the room.');
    }

    const closedRoom: MultiplayerRoomDocument = {
      ...room,
      status: 'closed',
      lastActivityAt: nowMs,
      expiresAt: computeRoomExpiresAt('closed', nowMs),
    };
    return { nextRoom: closedRoom, shouldDelete: true };
  }

  if (!(callerUid in room.players)) {
    return { nextRoom: room, shouldDelete: false };
  }

  // Non-host leaving during waiting room -> remove their slot so another player can join
  if (room.status === 'waiting') {
    const remainingPlayers = { ...room.players };
    delete remainingPlayers[callerUid];
    const remainingOrder = room.playerOrder.filter((id) => id !== callerUid);

    if (remainingOrder.length === 0) {
      return {
        nextRoom: {
          ...room,
          status: 'expired',
          players: {},
          playerOrder: [],
          lastActivityAt: nowMs,
          expiresAt: nowMs,
        },
        shouldDelete: true,
      };
    }

    return {
      nextRoom: {
        ...room,
        players: remainingPlayers,
        playerOrder: remainingOrder,
        lastActivityAt: nowMs,
        expiresAt: computeRoomExpiresAt('waiting', nowMs),
      },
      shouldDelete: false,
    };
  }

  // Non-host leaving during active/completed game -> mark disconnected
  const updatedPlayers: Record<string, RoomPlayer> = {
    ...room.players,
    [callerUid]: {
      ...room.players[callerUid],
      connectionStatus: 'disconnected',
      lastSeenAt: nowMs,
    },
  };

  const anyConnected = Object.values(updatedPlayers).some(
    (p) => p.connectionStatus === 'connected'
  );

  if (!anyConnected && nowMs >= room.expiresAt) {
    return {
      nextRoom: {
        ...room,
        status: 'expired',
        players: updatedPlayers,
        lastActivityAt: nowMs,
        expiresAt: nowMs,
      },
      shouldDelete: true,
    };
  }

  return {
    nextRoom: {
      ...room,
      players: updatedPlayers,
      lastActivityAt: nowMs,
      expiresAt: computeRoomExpiresAt(room.status, nowMs),
    },
    shouldDelete: false,
  };
}

/**
 * Creates a new multiplayer room in Firestore with collision checking.
 */
export async function createMultiplayerRoom(params: {
  gameType: MultiplayerGameType;
  hostNickname: string;
  maxPlayers?: MemoryMultiplayerPlayerCount;
}): Promise<{ room: MultiplayerRoomDocument; uid: string }> {
  const validated = validateRoomCreationInput(params);
  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateCode = generateRoomCode();
    const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, candidateCode);

    try {
      const createdRoom = await runFirestoreTransaction(async (transaction) => {
        const existingSnap = await transaction.get(roomRef);
        const nowMs = Date.now();

        if (existingSnap.exists()) {
          const existingData = existingSnap.data();
          if (!isRoomExpired(existingData, nowMs)) {
            throw new Error('CODE_COLLISION');
          }
        }

        const newRoom = buildInitialRoomDocument({
          roomCode: candidateCode,
          gameType: validated.gameType,
          hostUid: uid,
          hostNickname: validated.hostNickname,
          maxPlayers: validated.maxPlayers,
          nowMs,
        });

        transaction.set(roomRef, newRoom);
        return newRoom;
      });

      saveActiveRoomSession(validated.gameType, createdRoom.roomCode);
      savePreferredNickname(validated.hostNickname);
      return { room: createdRoom, uid };
    } catch (err) {
      if (err instanceof Error && err.message === 'CODE_COLLISION') {
        continue;
      }
      throw err;
    }
  }

  throw new MultiplayerRoomError(
    'INVALID_ROOM_CODE',
    'Unable to generate a unique room code. Please try again.'
  );
}

/**
 * Joins an existing multiplayer room by room code (or reconnects if already in the room).
 * Performs Zod input validation, atomic transactional verification, and post-conflict
 * state inspection so concurrent joins to the final slot always report ROOM_FULL
 * rather than raw Firestore permission errors.
 */
export async function joinMultiplayerRoom(params: {
  roomCode: string;
  nickname: string;
  expectedGameType?: MultiplayerGameType;
}): Promise<{ room: MultiplayerRoomDocument; uid: string }> {
  const validated = validateRoomJoinInput(params);
  const normalizedCode = validated.roomCode;

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  const maxJoinAttempts = 3;

  for (let attempt = 0; attempt < maxJoinAttempts; attempt++) {
    let expiredRoomToCleanUp = false;
    try {
      const updatedRoom = await runFirestoreTransaction(async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) {
          throw new MultiplayerRoomError(
            'ROOM_NOT_FOUND',
            MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND
          );
        }

        const rawData = snap.data();
        const currentRoom = parseFirestoreRoomDocument(rawData, normalizedCode) ?? rawData;
        if (
          !currentRoom ||
          typeof currentRoom !== 'object' ||
          !currentRoom.players ||
          !Array.isArray(currentRoom.playerOrder)
        ) {
          throw new MultiplayerRoomError(
            'INVALID_ROOM_DATA',
            MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_DATA
          );
        }

        const nowMs = Date.now();

        if (isRoomExpired(currentRoom, nowMs)) {
          expiredRoomToCleanUp = true;
          throw new MultiplayerRoomError(
            currentRoom.status === 'closed' ? 'ROOM_CLOSED' : 'ROOM_EXPIRED',
            currentRoom.status === 'closed'
              ? MULTIPLAYER_USER_MESSAGES.ROOM_CLOSED
              : MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED
          );
        }

        const nextRoom = applyPlayerJoinOrReconnect({
          room: currentRoom,
          uid,
          nickname: validated.nickname,
          expectedGameType: validated.expectedGameType,
          nowMs,
        });

        if (typeof transaction.update === 'function') {
          transaction.update(roomRef, {
            players: nextRoom.players,
            playerOrder: nextRoom.playerOrder,
            lastActivityAt: nextRoom.lastActivityAt,
            expiresAt: nextRoom.expiresAt,
          });
        } else {
          transaction.set(roomRef, nextRoom);
        }
        return nextRoom;
      });

      saveActiveRoomSession(updatedRoom.gameType, updatedRoom.roomCode);
      savePreferredNickname(validated.nickname);
      return { room: updatedRoom, uid };
    } catch (err) {
      if (expiredRoomToCleanUp) {
        await deleteDocument(ROOMS_COLLECTION, normalizedCode).catch(() => {});
      }

      if (err instanceof MultiplayerRoomError) {
        throw err;
      }

      // Inspect latest room state when a concurrent commit or security-rule diff collision occurred
      const latestRoom = await fetchDocument<MultiplayerRoomDocument>(
        ROOMS_COLLECTION,
        normalizedCode
      ).catch(() => null);

      if (latestRoom) {
        const validatedLatest =
          parseFirestoreRoomDocument(latestRoom, normalizedCode) ?? latestRoom;
        // Throws ROOM_FULL, GAME_ALREADY_STARTED, ROOM_EXPIRED, ROOM_CLOSED, or DUPLICATE_NICKNAME
        applyPlayerJoinOrReconnect({
          room: validatedLatest,
          uid,
          nickname: validated.nickname,
          expectedGameType: validated.expectedGameType,
          nowMs: Date.now(),
        });

        if (attempt < maxJoinAttempts - 1) {
          continue;
        }
      }

      throw err;
    }
  }

  throw new MultiplayerRoomError(
    'UNEXPECTED_ERROR',
    MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR
  );
}

/**
 * Attempts to reconnect a returning player to a previously active room after refresh.
 */
export async function reconnectToMultiplayerRoom(params: {
  roomCode: string;
  expectedGameType?: MultiplayerGameType;
}): Promise<{ room: MultiplayerRoomDocument; uid: string } | null> {
  const normalizedCode = normalizeRoomCode(params.roomCode);
  if (!isValidRoomCodeFormat(normalizedCode)) {
    return null;
  }

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const existing = await fetchDocument<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  if (!existing) {
    if (params.expectedGameType) {
      clearActiveRoomSession(params.expectedGameType);
    }
    return null;
  }

  const nowMs = Date.now();
  if (isRoomExpired(existing, nowMs) || !(uid in existing.players)) {
    if (isRoomExpired(existing, nowMs)) {
      await deleteDocument(ROOMS_COLLECTION, normalizedCode).catch(() => {});
    }
    if (params.expectedGameType) {
      clearActiveRoomSession(params.expectedGameType);
    }
    return null;
  }

  const existingPlayer = existing.players[uid];
  if (
    existingPlayer.connectionStatus === 'connected' &&
    nowMs - existingPlayer.lastSeenAt < ROOM_EXPIRY_POLICIES_MS.HEARTBEAT_MIN_WRITE_INTERVAL_MS
  ) {
    saveActiveRoomSession(existing.gameType, existing.roomCode);
    return { room: existing, uid };
  }

  return joinMultiplayerRoom({
    roomCode: normalizedCode,
    nickname: existingPlayer.nickname,
    expectedGameType: params.expectedGameType,
  });
}

/**
 * Updates a player's connection status and heartbeat timestamp in the room.
 * Uses targeted dot-notation field updates (never overwriting game state) and skips
 * redundant writes when a transaction is in flight or when status is already fresh.
 */
export async function updatePlayerConnectionStatus(params: {
  roomCode: string;
  connectionStatus: 'connected' | 'disconnected';
  currentRoom?: MultiplayerRoomDocument | null;
}): Promise<void> {
  if (isTransactionInFlight()) {
    return;
  }

  const normalizedCode = normalizeRoomCode(params.roomCode);
  if (!isValidRoomCodeFormat(normalizedCode)) return;

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const nowMs = Date.now();

  if (params.currentRoom) {
    if (
      isRoomExpired(params.currentRoom, nowMs) ||
      params.currentRoom.status === 'closed' ||
      params.currentRoom.status === 'expired' ||
      !(uid in params.currentRoom.players)
    ) {
      return;
    }

    const currentPlayer = params.currentRoom.players[uid];
    const isSameStatus = currentPlayer.connectionStatus === params.connectionStatus;
    const isFresh =
      nowMs - currentPlayer.lastSeenAt <
      ROOM_EXPIRY_POLICIES_MS.HEARTBEAT_MIN_WRITE_INTERVAL_MS;

    if (isSameStatus && isFresh) {
      return;
    }
  }

  await updateDocument<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode, {
    [`players.${uid}.connectionStatus`]: params.connectionStatus,
    [`players.${uid}.lastSeenAt`]: nowMs,
    lastActivityAt: nowMs,
  });
}

/**
 * Leaves a multiplayer room (or closes it if the caller is the host).
 */
export async function leaveMultiplayerRoom(params: {
  roomCode: string;
  gameType?: MultiplayerGameType;
}): Promise<void> {
  const normalizedCode = normalizeRoomCode(params.roomCode);
  if (params.gameType) {
    clearActiveRoomSession(params.gameType);
  }
  if (!isValidRoomCodeFormat(normalizedCode)) return;

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  let deleteAfterTransaction = false;

  await runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return;

    const room = snap.data();
    const { nextRoom, shouldDelete } = applyPlayerLeaveOrClose({
      room,
      callerUid: uid,
      forceCloseByHost: false,
      nowMs: Date.now(),
    });

    deleteAfterTransaction = shouldDelete;
    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        players: nextRoom.players,
        playerOrder: nextRoom.playerOrder,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
  });

  if (deleteAfterTransaction) {
    await deleteDocument(ROOMS_COLLECTION, normalizedCode).catch(() => {});
  }
}

/**
 * Host-only action to close and clean up the room immediately.
 */
export async function closeMultiplayerRoom(params: {
  roomCode: string;
  gameType?: MultiplayerGameType;
}): Promise<void> {
  const normalizedCode = normalizeRoomCode(params.roomCode);
  if (params.gameType) {
    clearActiveRoomSession(params.gameType);
  }
  if (!isValidRoomCodeFormat(normalizedCode)) return;

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  await runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return;

    const room = snap.data();
    const { nextRoom } = applyPlayerLeaveOrClose({
      room,
      callerUid: uid,
      forceCloseByHost: true,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
  });

  await deleteDocument(ROOMS_COLLECTION, normalizedCode).catch(() => {});
}

/**
 * Checks if a room is expired and deletes it from Firestore so orphaned data is cleaned up.
 */
export async function checkAndExpireRoomIfNeeded(
  room: MultiplayerRoomDocument,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!isRoomExpired(room, nowMs)) {
    return false;
  }

  await deleteDocument(ROOMS_COLLECTION, room.roomCode).catch(() => {});
  return true;
}

/**
 * Extracts the current monotonic round number from a room document (0 while in waiting room).
 */
export function getRoomRoundNumber(room: MultiplayerRoomDocument | null | undefined): number {
  if (!room) return 0;
  if (room.gameType === 'memory-match') {
    return room.memoryMatchState?.roundNumber ?? (room.status === 'waiting' ? 0 : 1);
  }
  return room.ticTacToeState?.roundNumber ?? (room.status === 'waiting' ? 0 : 1);
}

/**
 * Determines whether an incoming room document snapshot should be accepted over the current
 * React state. Prevents stale cached snapshots or out-of-order updates from an older round
 * from overwriting a newly started round or fresher game state.
 */
export function shouldAcceptIncomingRoomState(
  currentRoom: MultiplayerRoomDocument | null,
  incomingRoom: MultiplayerRoomDocument,
  metadata?: FirestoreSnapshotMetadata
): boolean {
  if (!currentRoom || currentRoom.roomCode !== incomingRoom.roomCode) {
    return true;
  }

  const currentRound = getRoomRoundNumber(currentRoom);
  const incomingRound = getRoomRoundNumber(incomingRoom);

  // Never allow a previous round to overwrite a newer round
  if (incomingRound < currentRound) {
    return false;
  }

  // Always accept a newly started round
  if (incomingRound > currentRound) {
    return true;
  }

  // Within the same round, prevent regressing from active/completed back to waiting
  if (currentRoom.status !== 'waiting' && incomingRoom.status === 'waiting') {
    return false;
  }

  // Within the same round, prevent regressing from completed back to in_progress
  if (currentRoom.status === 'completed' && incomingRoom.status === 'in_progress') {
    return false;
  }

  // Within the same Memory Match round, matchedPairs is monotonically non-decreasing
  if (
    currentRoom.memoryMatchState &&
    incomingRoom.memoryMatchState &&
    incomingRoom.memoryMatchState.matchedPairs < currentRoom.memoryMatchState.matchedPairs
  ) {
    return false;
  }

  // Do not replace fresher state with an older cached snapshot
  if (
    metadata?.fromCache &&
    !metadata.hasPendingWrites &&
    incomingRoom.lastActivityAt < currentRoom.lastActivityAt
  ) {
    return false;
  }

  return true;
}

/**
 * Subscribes to real-time updates on a multiplayer room document.
 * Validates incoming documents with Zod, tracks snapshot metadata, and intercepts expired rooms.
 */
export function subscribeToMultiplayerRoom(
  roomCode: string,
  callbacks: {
    onRoomChange: (
      room: MultiplayerRoomDocument | null,
      expiredOrClosedReason?: RoomStatus,
      metadata?: FirestoreSnapshotMetadata
    ) => void;
    onError?: (error: Error) => void;
  }
): Unsubscribe {
  const normalizedCode = normalizeRoomCode(roomCode);
  let latestMetadata: FirestoreSnapshotMetadata | undefined;

  return subscribeToDocument<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode, {
    onMetadata: (meta) => {
      latestMetadata = meta;
    },
    onData: (rawRoom) => {
      if (!rawRoom) {
        callbacks.onRoomChange(null, undefined, latestMetadata);
        return;
      }

      const validated = parseFirestoreRoomDocument(rawRoom, normalizedCode) ?? rawRoom;
      if (
        !validated ||
        typeof validated !== 'object' ||
        !validated.players ||
        !Array.isArray(validated.playerOrder)
      ) {
        return;
      }

      const nowMs = Date.now();
      if (validated.status === 'closed') {
        callbacks.onRoomChange(null, 'closed', latestMetadata);
        return;
      }
      if (isRoomExpired(validated, nowMs)) {
        void checkAndExpireRoomIfNeeded(validated, nowMs);
        callbacks.onRoomChange(null, 'expired', latestMetadata);
        return;
      }

      // Clone top-level and nested state references so React always detects updates
      const freshRoom: MultiplayerRoomDocument = {
        ...validated,
        players: { ...validated.players },
        playerOrder: [...validated.playerOrder],
        ticTacToeState: validated.ticTacToeState
          ? {
              ...validated.ticTacToeState,
              board: [...validated.ticTacToeState.board],
              scores: { ...validated.ticTacToeState.scores },
            }
          : null,
        memoryMatchState: validated.memoryMatchState
          ? {
              ...validated.memoryMatchState,
              cards: validated.memoryMatchState.cards.map((c) => ({ ...c })),
              matchedByPairKey: { ...(validated.memoryMatchState.matchedByPairKey ?? {}) },
              turnOrderUids: [...validated.memoryMatchState.turnOrderUids],
              flippedCardIds: [...validated.memoryMatchState.flippedCardIds],
              winnerUids: [...validated.memoryMatchState.winnerUids],
            }
          : null,
      };

      callbacks.onRoomChange(freshRoom, undefined, latestMetadata);
    },
    onError: callbacks.onError,
  });
}

/**
 * Session storage helpers for automatic reconnection on refresh and nickname convenience.
 */
const ACTIVE_ROOM_KEY_PREFIX = 'pixel_afterglow_active_room_';
const NICKNAME_STORAGE_KEY = 'pixel_afterglow_preferred_nickname';

function getSessionStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

export function saveActiveRoomSession(gameType: MultiplayerGameType, roomCode: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(`${ACTIVE_ROOM_KEY_PREFIX}${gameType}`, normalizeRoomCode(roomCode));
  } catch {
    // ignore
  }
}

export function loadActiveRoomSession(gameType: MultiplayerGameType): string | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    return storage.getItem(`${ACTIVE_ROOM_KEY_PREFIX}${gameType}`);
  } catch {
    return null;
  }
}

export function clearActiveRoomSession(gameType: MultiplayerGameType): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(`${ACTIVE_ROOM_KEY_PREFIX}${gameType}`);
  } catch {
    // ignore
  }
}

export function savePreferredNickname(nickname: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(NICKNAME_STORAGE_KEY, sanitizeNickname(nickname));
  } catch {
    // ignore
  }
}

export function loadPreferredNickname(): string {
  const storage = getSessionStorage();
  if (!storage) return '';
  try {
    return storage.getItem(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

// ============================================================================
// Direct Room Invitations, Shareable URLs & Pre-Join Invitation Validation
// ============================================================================

export interface ParsedRoomInvitation {
  rawRoomParam: string;
  normalizedRoomCode: string;
  isValidFormat: boolean;
  gameType: MultiplayerGameType;
}

export interface RoomInvitationShareData {
  roomCode: string;
  invitationUrl: string;
  title: string;
  message: string;
}

export interface RoomInvitationValidationResult {
  status: 'joinable' | 'invalid' | 'unavailable';
  normalizedRoomCode: string;
  errorCode: MultiplayerErrorCode | null;
  userMessage: string | null;
  room: MultiplayerRoomDocument | null;
}

/**
 * Generates a direct shareable invitation URL containing the normalized room code.
 * Uses the actual runtime origin (window.location.origin) rather than hardcoding
 * a development URL, and falls back to https://pixel-afterglow.vercel.app in SSR/test contexts.
 */
export function buildRoomInvitationUrl(
  roomCode: string,
  gameType: MultiplayerGameType = 'memory-match',
  baseOrigin?: string
): string {
  const normalizedCode = normalizeRoomCode(roomCode);
  const resolvedOrigin =
    baseOrigin ??
    (typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin !== 'null'
      ? window.location.origin
      : 'https://pixel-afterglow.vercel.app');
  const cleanOrigin = resolvedOrigin.replace(/\/+$/, '');
  const params = new URLSearchParams({
    game: gameType,
    room: normalizedCode,
  });
  return `${cleanOrigin}/?${params.toString()}`;
}

/**
 * Builds the complete share payload (room code, direct invitation link, title, and message)
 * for Web Share API and clipboard fallback.
 */
export function buildRoomInvitationShareData(params: {
  roomCode: string;
  gameType?: MultiplayerGameType;
  gameTitle?: string;
  baseOrigin?: string;
}): RoomInvitationShareData {
  const normalizedCode = normalizeRoomCode(params.roomCode);
  const gameType = params.gameType ?? 'memory-match';
  const gameTitle =
    params.gameTitle ??
    (gameType === 'tic-tac-toe' ? 'Tic-Tac-Toe' : 'Memory Match');
  const invitationUrl = buildRoomInvitationUrl(
    normalizedCode,
    gameType,
    params.baseOrigin
  );
  const title = `Pixel Afterglow – ${gameTitle} Room ${normalizedCode}`;
  const message = `You're invited to play ${gameTitle} on Pixel Afterglow! Join my room (${normalizedCode}) using this link: ${invitationUrl}. Enter your arcade nickname to join.`;

  return {
    roomCode: normalizedCode,
    invitationUrl,
    title,
    message,
  };
}

/**
 * Parses a room invitation from a URL string or Location-like object (defaults to window.location).
 * Supports both root query params (`/?game=memory-match&room=NFGNTR` or `/?room=NFGNTR`)
 * and path-based routes (`/games/memory-match?room=NFGNTR` or `/games/memory-match/NFGNTR`).
 */
export function parseRoomInvitationFromUrl(
  input?:
    | string
    | {
        search?: string;
        pathname?: string;
        hash?: string;
        href?: string;
      }
): ParsedRoomInvitation | null {
  let pathname: string;
  let search: string;

  if (typeof input === 'string') {
    try {
      const parsed = new URL(input, 'https://pixel-afterglow.vercel.app');
      pathname = parsed.pathname;
      search = parsed.search;
    } catch {
      return null;
    }
  } else if (input && typeof input === 'object') {
    pathname = input.pathname ?? '';
    search = input.search ?? '';
  } else if (typeof window !== 'undefined' && window.location) {
    pathname = window.location.pathname ?? '';
    search = window.location.search ?? '';
  } else {
    return null;
  }

  const params = new URLSearchParams(search);
  let rawRoomParam =
    params.get('room') ?? params.get('code') ?? params.get('invite') ?? '';

  // Also support path segment e.g. /games/memory-match/NFGNTR
  if (!rawRoomParam && pathname) {
    const pathMatch = pathname.match(
      /^\/(?:games\/)?(?:memory-match|tic-tac-toe)\/([^/?#]+)$/i
    );
    if (pathMatch?.[1]) {
      rawRoomParam = decodeURIComponent(pathMatch[1]);
    }
  }

  if (!rawRoomParam || !rawRoomParam.trim()) {
    return null;
  }

  const rawGameParam = (params.get('game') ?? '').trim().toLowerCase();
  const lowerPath = pathname.toLowerCase();
  const gameType: MultiplayerGameType =
    rawGameParam === 'tic-tac-toe' ||
    rawGameParam === 'tictactoe' ||
    lowerPath.includes('tic-tac-toe') ||
    lowerPath.includes('tictactoe')
      ? 'tic-tac-toe'
      : 'memory-match';

  const normalizedRoomCode = normalizeRoomCode(rawRoomParam);
  const isValidFormat = isValidRoomCodeFormat(normalizedRoomCode);

  return {
    rawRoomParam: rawRoomParam.trim(),
    normalizedRoomCode,
    isValidFormat,
    gameType,
  };
}

/**
 * Checks whether the current browser URL contains a room invitation for the given game type.
 */
export function hasRoomInvitationInUrl(
  expectedGameType?: MultiplayerGameType
): boolean {
  const invitation = parseRoomInvitationFromUrl();
  if (!invitation) return false;
  if (expectedGameType && invitation.gameType !== expectedGameType) {
    return false;
  }
  return true;
}

/**
 * Removes room invitation query parameters from the current browser URL without reloading.
 */
export function clearRoomInvitationFromUrl(): void {
  if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) {
    return;
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('code');
    url.searchParams.delete('invite');
    url.searchParams.delete('game');
    const cleanRelative =
      url.pathname.startsWith('/games/')
        ? '/'
        : `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', cleanRelative || '/');
  } catch {
    // ignore URL manipulation errors in non-standard environments
  }
}

/**
 * Validates an invited room code against Firestore before the recipient clicks Join Room.
 * Checks format, room existence, expiration, closed status, game-already-started status,
 * and room capacity, returning a user-friendly status without ever exposing raw Firebase errors.
 */
export async function validateRoomInvitation(params: {
  rawRoomCode: string;
  expectedGameType?: MultiplayerGameType;
  nowMs?: number;
}): Promise<RoomInvitationValidationResult> {
  const normalizedRoomCode = normalizeRoomCode(params.rawRoomCode);

  if (!isValidRoomCodeFormat(normalizedRoomCode)) {
    return {
      status: 'invalid',
      normalizedRoomCode,
      errorCode: 'INVALID_ROOM_CODE',
      userMessage: MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_CODE,
      room: null,
    };
  }

  try {
    const user = await ensureAnonymousSession();
    const uid = user.uid;
    const rawData = await fetchDocument<MultiplayerRoomDocument>(
      ROOMS_COLLECTION,
      normalizedRoomCode
    );

    if (!rawData) {
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'ROOM_NOT_FOUND',
        userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND,
        room: null,
      };
    }

    const room = parseFirestoreRoomDocument(rawData, normalizedRoomCode) ?? rawData;
    if (
      !room ||
      typeof room !== 'object' ||
      !room.players ||
      !Array.isArray(room.playerOrder)
    ) {
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'ROOM_NOT_FOUND',
        userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND,
        room: null,
      };
    }

    if (params.expectedGameType && room.gameType !== params.expectedGameType) {
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'ROOM_NOT_FOUND',
        userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND,
        room: null,
      };
    }

    const nowMs = params.nowMs ?? Date.now();

    if (room.status === 'closed') {
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'ROOM_CLOSED',
        userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_CLOSED,
        room: null,
      };
    }

    if (isRoomExpired(room, nowMs)) {
      await deleteDocument(ROOMS_COLLECTION, normalizedRoomCode).catch(() => {});
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'ROOM_EXPIRED',
        userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_EXPIRED,
        room: null,
      };
    }

    const isAlreadyInRoom = Boolean(room.players[uid]);

    if (room.status !== 'waiting' && !isAlreadyInRoom) {
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'GAME_ALREADY_STARTED',
        userMessage: MULTIPLAYER_USER_MESSAGES.GAME_ALREADY_STARTED,
        room: null,
      };
    }

    if (!isAlreadyInRoom && room.playerOrder.length >= room.maxPlayers) {
      return {
        status: 'unavailable',
        normalizedRoomCode,
        errorCode: 'ROOM_FULL',
        userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_FULL,
        room: null,
      };
    }

    return {
      status: 'joinable',
      normalizedRoomCode,
      errorCode: null,
      userMessage: null,
      room,
    };
  } catch (err) {
    logMultiplayerDiagnostic('validateRoomInvitation', err, {
      roomCode: normalizedRoomCode,
    });
    const resolved = resolveMultiplayerError(err, 'join-room');
    return {
      status: 'unavailable',
      normalizedRoomCode,
      errorCode: resolved.code,
      userMessage: resolved.userMessage,
      room: null,
    };
  }
}

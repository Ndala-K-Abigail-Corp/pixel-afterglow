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
} from '../lib/firestore';
import type { Unsubscribe } from 'firebase/firestore';

export const ROOMS_COLLECTION = 'rooms';
export const ROOM_CODE_LENGTH = 6;
// Unambiguous uppercase alphanumeric characters (excludes 0, O, 1, I, L)
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type MultiplayerErrorCode =
  | 'INVALID_NICKNAME'
  | 'INVALID_ROOM_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_CLOSED'
  | 'ROOM_EXPIRED'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYER_DISCONNECTED'
  | 'INVALID_STATE_TRANSITION'
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE';

export class MultiplayerRoomError extends Error {
  public readonly code: MultiplayerErrorCode;

  constructor(code: MultiplayerErrorCode, message: string) {
    super(message);
    this.name = 'MultiplayerRoomError';
    this.code = code;
  }
}

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
      'Memory Match rooms must be configured for 2, 3, or 4 players.'
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
 * Pure validator & state reducer for a player joining or reconnecting to a room.
 * Prevents duplicate entries, rejects full rooms, rejects started games (for new players),
 * and rejects expired/closed rooms.
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
    const updatedNickname =
      params.nickname && isValidNickname(params.nickname)
        ? sanitizeNickname(params.nickname)
        : existingPlayer.nickname;

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
      'Cannot join because this game has already started.'
    );
  }

  if (room.playerOrder.length >= room.maxPlayers) {
    throw new MultiplayerRoomError(
      'ROOM_FULL',
      `This room is already full (${room.maxPlayers}/${room.maxPlayers} players).`
    );
  }

  const sanitizedNickname = sanitizeNickname(params.nickname ?? '');
  if (!isValidNickname(sanitizedNickname)) {
    throw new MultiplayerRoomError(
      'INVALID_NICKNAME',
      'Nickname must be between 2 and 16 characters.'
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
  if (room.playerOrder.length < room.maxPlayers) {
    throw new MultiplayerRoomError(
      'NOT_ENOUGH_PLAYERS',
      `Waiting for players (${room.playerOrder.length}/${room.maxPlayers} joined).`
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
          gameType: params.gameType,
          hostUid: uid,
          hostNickname: params.hostNickname,
          maxPlayers: params.maxPlayers,
          nowMs,
        });

        transaction.set(roomRef, newRoom);
        return newRoom;
      });

      saveActiveRoomSession(params.gameType, createdRoom.roomCode);
      savePreferredNickname(params.hostNickname);
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
 */
export async function joinMultiplayerRoom(params: {
  roomCode: string;
  nickname: string;
  expectedGameType?: MultiplayerGameType;
}): Promise<{ room: MultiplayerRoomDocument; uid: string }> {
  const normalizedCode = normalizeRoomCode(params.roomCode);
  if (!isValidRoomCodeFormat(normalizedCode)) {
    throw new MultiplayerRoomError(
      'INVALID_ROOM_CODE',
      'Please enter a valid 6-character room code.'
    );
  }

  const user = await ensureAnonymousSession();
  const uid = user.uid;
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  let expiredRoomToCleanUp = false;

  try {
    const updatedRoom = await runFirestoreTransaction(async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) {
        throw new MultiplayerRoomError(
          'ROOM_NOT_FOUND',
          `Room "${normalizedCode}" was not found. Check the code and try again.`
        );
      }

      const currentRoom = snap.data();
      const nowMs = Date.now();

      if (isRoomExpired(currentRoom, nowMs)) {
        expiredRoomToCleanUp = true;
        throw new MultiplayerRoomError(
          currentRoom.status === 'closed' ? 'ROOM_CLOSED' : 'ROOM_EXPIRED',
          currentRoom.status === 'closed'
            ? 'This room was closed by the host.'
            : 'This room has expired due to inactivity.'
        );
      }

      const nextRoom = applyPlayerJoinOrReconnect({
        room: currentRoom,
        uid,
        nickname: params.nickname,
        expectedGameType: params.expectedGameType,
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
    if (isValidNickname(params.nickname)) {
      savePreferredNickname(params.nickname);
    }
    return { room: updatedRoom, uid };
  } catch (err) {
    if (expiredRoomToCleanUp) {
      await deleteDocument(ROOMS_COLLECTION, normalizedCode).catch(() => {});
    }
    throw err;
  }
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
 * Subscribes to real-time updates on a multiplayer room document.
 * Automatically intercepts expired rooms at the application layer.
 */
export function subscribeToMultiplayerRoom(
  roomCode: string,
  callbacks: {
    onRoomChange: (room: MultiplayerRoomDocument | null, expiredOrClosedReason?: RoomStatus) => void;
    onError?: (error: Error) => void;
  }
): Unsubscribe {
  const normalizedCode = normalizeRoomCode(roomCode);
  return subscribeToDocument<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode, {
    onData: (room) => {
      if (!room) {
        callbacks.onRoomChange(null);
        return;
      }

      const nowMs = Date.now();
      if (room.status === 'closed') {
        callbacks.onRoomChange(null, 'closed');
        return;
      }
      if (isRoomExpired(room, nowMs)) {
        void checkAndExpireRoomIfNeeded(room, nowMs);
        callbacks.onRoomChange(null, 'expired');
        return;
      }

      callbacks.onRoomChange(room);
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

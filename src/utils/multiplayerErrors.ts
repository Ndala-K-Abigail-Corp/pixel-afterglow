/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FirebaseConfigurationError } from '../lib/firebase';

export type MultiplayerErrorCode =
  | 'INVALID_NICKNAME'
  | 'DUPLICATE_NICKNAME'
  | 'INVALID_ROOM_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_CLOSED'
  | 'ROOM_EXPIRED'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYER_DISCONNECTED'
  | 'NETWORK_DISCONNECTED'
  | 'PERMISSION_DENIED'
  | 'FIREBASE_UNAVAILABLE'
  | 'INVALID_STATE_TRANSITION'
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE'
  | 'INVALID_ROOM_DATA'
  | 'UNEXPECTED_ERROR';

/**
 * Canonical user-facing messages for all multiplayer conditions.
 * Never exposes raw Firebase error codes, stack traces, or internal database paths.
 */
export const MULTIPLAYER_USER_MESSAGES: Readonly<Record<MultiplayerErrorCode, string>> = {
  ROOM_NOT_FOUND: "We couldn't find that room. Check the room code and try again.",
  ROOM_FULL: 'This room is full. Try joining another room.',
  ROOM_EXPIRED: 'This room has expired. Ask the host to create a new one.',
  ROOM_CLOSED: 'This room was closed by the host.',
  GAME_ALREADY_STARTED: 'This game has already started. New players can no longer join.',
  INVALID_NICKNAME: 'Please enter a valid arcade nickname.',
  DUPLICATE_NICKNAME: 'This nickname is already being used in this room.',
  INVALID_ROOM_CODE: 'Please check the room code and try again.',
  PERMISSION_DENIED: "You don't have permission to perform this action.",
  PLAYER_DISCONNECTED: 'Connection lost. Reconnecting...',
  NETWORK_DISCONNECTED: 'Connection lost. Reconnecting...',
  FIREBASE_UNAVAILABLE: 'Online multiplayer is temporarily unavailable.',
  INVALID_MOVE: "That move isn't valid. Please try again.",
  INVALID_STATE_TRANSITION: "That move isn't valid. Please try again.",
  NOT_YOUR_TURN: "That move isn't valid. Please try again.",
  NOT_HOST: 'Only the room host can perform this action.',
  NOT_ENOUGH_PLAYERS: 'Not enough players have joined to start the game yet.',
  INVALID_ROOM_DATA: 'Something went wrong. Please try again.',
  UNEXPECTED_ERROR: 'Something went wrong. Please try again.',
} as const;

export class MultiplayerRoomError extends Error {
  public readonly code: MultiplayerErrorCode;
  public readonly userMessage: string;

  constructor(code: MultiplayerErrorCode, message?: string) {
    const fallbackUserMessage = MULTIPLAYER_USER_MESSAGES[code] ?? MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR;
    super(message ?? fallbackUserMessage);
    this.name = 'MultiplayerRoomError';
    this.code = code;
    this.userMessage = fallbackUserMessage;
  }
}

export interface ResolvedMultiplayerError {
  code: MultiplayerErrorCode;
  userMessage: string;
  isRetryable: boolean;
}

const KNOWN_MULTIPLAYER_ERROR_CODES = new Set<string>(Object.keys(MULTIPLAYER_USER_MESSAGES));

/**
 * Normalizes a Firebase SDK error code (e.g. "firestore/permission-denied" -> "permission-denied").
 */
function normalizeFirebaseCode(rawCode: string): string {
  const trimmed = rawCode.trim().toLowerCase();
  const slashIdx = trimmed.indexOf('/');
  return slashIdx >= 0 ? trimmed.slice(slashIdx + 1) : trimmed;
}

/**
 * Maps any thrown error (MultiplayerRoomError, FirebaseError, ZodError, or unknown)
 * into a single, structured, user-friendly multiplayer error.
 */
export function resolveMultiplayerError(
  error: unknown,
  context?: 'join-room' | 'create-room' | 'start-game' | 'game-action' | 'rematch' | 'subscription'
): ResolvedMultiplayerError {
  if (error instanceof FirebaseConfigurationError) {
    return {
      code: 'FIREBASE_UNAVAILABLE',
      userMessage: MULTIPLAYER_USER_MESSAGES.FIREBASE_UNAVAILABLE,
      isRetryable: false,
    };
  }

  if (error instanceof MultiplayerRoomError) {
    return {
      code: error.code,
      userMessage: MULTIPLAYER_USER_MESSAGES[error.code] ?? MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR,
      isRetryable:
        error.code === 'NETWORK_DISCONNECTED' ||
        error.code === 'PLAYER_DISCONNECTED' ||
        error.code === 'FIREBASE_UNAVAILABLE',
    };
  }

  if (error && typeof error === 'object') {
    const maybeName = (error as { name?: unknown }).name;
    const maybeCode = (error as { code?: unknown }).code;
    const maybeMessage =
      typeof (error as { message?: unknown }).message === 'string'
        ? ((error as { message: string }).message)
        : '';

    // Duck-typed MultiplayerRoomError across module boundaries
    if (
      typeof maybeCode === 'string' &&
      KNOWN_MULTIPLAYER_ERROR_CODES.has(maybeCode)
    ) {
      const code = maybeCode as MultiplayerErrorCode;
      return {
        code,
        userMessage: MULTIPLAYER_USER_MESSAGES[code],
        isRetryable:
          code === 'NETWORK_DISCONNECTED' ||
          code === 'PLAYER_DISCONNECTED' ||
          code === 'FIREBASE_UNAVAILABLE',
      };
    }

    // Zod validation errors
    if (maybeName === 'ZodError' || Array.isArray((error as { issues?: unknown }).issues)) {
      const issues = (error as { issues?: Array<{ path?: Array<string | number>; message?: string }> }).issues ?? [];
      const firstPath = issues[0]?.path?.join('.') ?? '';
      if (firstPath.includes('nickname') || firstPath.includes('hostNickname')) {
        return {
          code: 'INVALID_NICKNAME',
          userMessage: MULTIPLAYER_USER_MESSAGES.INVALID_NICKNAME,
          isRetryable: false,
        };
      }
      if (firstPath.includes('roomCode')) {
        return {
          code: 'INVALID_ROOM_CODE',
          userMessage: MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_CODE,
          isRetryable: false,
        };
      }
      return {
        code: 'INVALID_ROOM_DATA',
        userMessage: MULTIPLAYER_USER_MESSAGES.INVALID_ROOM_DATA,
        isRetryable: false,
      };
    }

    // Firebase SDK error codes
    if (typeof maybeCode === 'string' && maybeCode.length > 0) {
      const normalized = normalizeFirebaseCode(maybeCode);

      switch (normalized) {
        case 'not-found':
          return {
            code: 'ROOM_NOT_FOUND',
            userMessage: MULTIPLAYER_USER_MESSAGES.ROOM_NOT_FOUND,
            isRetryable: false,
          };
        case 'permission-denied':
        case 'unauthenticated':
          return {
            code: 'PERMISSION_DENIED',
            userMessage: MULTIPLAYER_USER_MESSAGES.PERMISSION_DENIED,
            isRetryable: false,
          };
        case 'unavailable':
        case 'network-request-failed':
        case 'deadline-exceeded':
          return {
            code: 'NETWORK_DISCONNECTED',
            userMessage:
              context === 'create-room' || context === 'join-room'
                ? MULTIPLAYER_USER_MESSAGES.FIREBASE_UNAVAILABLE
                : MULTIPLAYER_USER_MESSAGES.NETWORK_DISCONNECTED,
            isRetryable: true,
          };
        case 'failed-precondition':
        case 'aborted':
          return {
            code: context === 'game-action' ? 'INVALID_MOVE' : 'UNEXPECTED_ERROR',
            userMessage:
              context === 'game-action'
                ? MULTIPLAYER_USER_MESSAGES.INVALID_MOVE
                : MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR,
            isRetryable: true,
          };
        case 'resource-exhausted':
        case 'internal':
        case 'invalid-api-key':
        case 'app-not-authorized':
        case 'operation-not-allowed':
          return {
            code: 'FIREBASE_UNAVAILABLE',
            userMessage: MULTIPLAYER_USER_MESSAGES.FIREBASE_UNAVAILABLE,
            isRetryable: true,
          };
        default:
          break;
      }
    }

    // Message-level fallback classification (never exposing raw FirebaseError strings)
    const lowerMsg = maybeMessage.toLowerCase();
    if (lowerMsg.includes('permission-denied') || lowerMsg.includes('insufficient permissions')) {
      return {
        code: 'PERMISSION_DENIED',
        userMessage: MULTIPLAYER_USER_MESSAGES.PERMISSION_DENIED,
        isRetryable: false,
      };
    }
    if (lowerMsg.includes('offline') || lowerMsg.includes('network') || lowerMsg.includes('unavailable')) {
      return {
        code: 'NETWORK_DISCONNECTED',
        userMessage: MULTIPLAYER_USER_MESSAGES.NETWORK_DISCONNECTED,
        isRetryable: true,
      };
    }
  }

  return {
    code: 'UNEXPECTED_ERROR',
    userMessage: MULTIPLAYER_USER_MESSAGES.UNEXPECTED_ERROR,
    isRetryable: true,
  };
}

/**
 * Convenience helper returning the single user-facing message string for UI display.
 */
export function getUserFriendlyMultiplayerError(
  error: unknown,
  context?: 'join-room' | 'create-room' | 'start-game' | 'game-action' | 'rematch' | 'subscription'
): string {
  return resolveMultiplayerError(error, context).userMessage;
}

/**
 * Logs safe diagnostic metadata in development without exposing credentials, tokens, or PII.
 */
export function logMultiplayerDiagnostic(
  operation: string,
  error: unknown,
  safeMeta?: { roomCode?: string; errorCode?: string }
): void {
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  if (!isDev) {
    return;
  }
  const resolved = resolveMultiplayerError(error);
  console.warn(`[Multiplayer:${operation}] code=${resolved.code}`, safeMeta ?? {});
}

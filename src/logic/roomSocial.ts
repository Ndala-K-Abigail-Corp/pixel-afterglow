/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Unsubscribe } from 'firebase/firestore';
import {
  ReactionEmoji,
  RoomReaction,
  RoomChatMessage,
  REACTION_COOLDOWN_MS,
  CHAT_COOLDOWN_MS,
  MultiplayerRoomDocument,
} from '../types/multiplayer';
import {
  RoomReactionSchema,
  RoomChatMessageSchema,
  validateReactionInput,
  validateChatMessageInput,
} from '../schemas/multiplayerSchemas';
import {
  ROOMS_COLLECTION,
  normalizeRoomCode,
  isValidRoomCodeFormat,
  sanitizeNickname,
  MultiplayerRoomError,
} from './multiplayerRoom';
import { ensureAnonymousSession } from '../lib/auth';
import { isFirebaseConfigured } from '../lib/firebase';
import {
  addSubcollectionDocument,
  deleteSubcollectionDocument,
  subscribeToSubcollection,
} from '../lib/firestore';

export const ROOM_REACTIONS_SUBCOLLECTION = 'reactions';
export const ROOM_MESSAGES_SUBCOLLECTION = 'messages';

const REACTION_WINDOW_MS = 30_000;
const MAX_REACTIONS_PER_WINDOW = 8;
const CHAT_WINDOW_MS = 30_000;
const MAX_MESSAGES_PER_WINDOW = 10;

/**
 * Simple sliding-window + minimum-interval rate limiter for reactions and chat messages.
 */
export class SocialRateLimiter {
  private timestamps: number[] = [];
  private readonly cooldownMs: number;
  private readonly windowMs: number;
  private readonly maxPerWindow: number;

  constructor(cooldownMs: number, windowMs: number, maxPerWindow: number) {
    this.cooldownMs = cooldownMs;
    this.windowMs = windowMs;
    this.maxPerWindow = maxPerWindow;
  }

  public check(nowMs: number = Date.now()): { allowed: boolean; retryAfterMs: number } {
    this.timestamps = this.timestamps.filter((t) => nowMs - t < this.windowMs);
    const last = this.timestamps[this.timestamps.length - 1];
    if (last !== undefined && nowMs - last < this.cooldownMs) {
      return { allowed: false, retryAfterMs: this.cooldownMs - (nowMs - last) };
    }
    if (this.timestamps.length >= this.maxPerWindow) {
      const oldest = this.timestamps[0];
      return { allowed: false, retryAfterMs: Math.max(250, this.windowMs - (nowMs - oldest)) };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  public record(nowMs: number = Date.now()): void {
    this.timestamps = this.timestamps.filter((t) => nowMs - t < this.windowMs);
    this.timestamps.push(nowMs);
  }

  public reset(): void {
    this.timestamps = [];
  }
}

const reactionLimiter = new SocialRateLimiter(
  REACTION_COOLDOWN_MS,
  REACTION_WINDOW_MS,
  MAX_REACTIONS_PER_WINDOW
);

const chatLimiter = new SocialRateLimiter(
  CHAT_COOLDOWN_MS,
  CHAT_WINDOW_MS,
  MAX_MESSAGES_PER_WINDOW
);

export function resetSocialRateLimitersForTesting(): void {
  reactionLimiter.reset();
  chatLimiter.reset();
}

/**
 * Validates that the caller is an active member of the room (never allows non-members or closed rooms).
 */
export function assertRoomMembershipForSocial(
  room: Pick<MultiplayerRoomDocument, 'roomCode' | 'status' | 'players'> | null | undefined,
  callerUid: string
): { roomCode: string; nickname: string } {
  if (!room || room.status === 'closed' || room.status === 'expired') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is no longer active.');
  }
  const member = room.players[callerUid];
  if (!member) {
    throw new MultiplayerRoomError(
      'PERMISSION_DENIED',
      'Only members of this room can chat or send reactions.'
    );
  }
  return {
    roomCode: normalizeRoomCode(room.roomCode),
    nickname: sanitizeNickname(member.nickname) || 'Player',
  };
}

/**
 * Sends a real-time player reaction into `rooms/{roomCode}/reactions`.
 * Never touches `rooms/{roomCode}` (cannot alter scores, turns, or game state).
 */
export async function sendRoomReaction(params: {
  room: Pick<MultiplayerRoomDocument, 'roomCode' | 'status' | 'players'>;
  emoji: ReactionEmoji;
  nowMs?: number;
}): Promise<RoomReaction> {
  const nowMs = params.nowMs ?? Date.now();
  const validatedEmoji = validateReactionInput(params.emoji);

  const rateCheck = reactionLimiter.check(nowMs);
  if (!rateCheck.allowed) {
    throw new MultiplayerRoomError(
      'INVALID_MOVE',
      'Easy there! Wait a moment before sending another reaction.'
    );
  }

  const user = await ensureAnonymousSession();
  const { roomCode, nickname } = assertRoomMembershipForSocial(params.room, user.uid);

  const payload = {
    roomCode,
    uid: user.uid,
    nickname,
    emoji: validatedEmoji,
    createdAt: nowMs,
  };

  const id = await addSubcollectionDocument(
    ROOMS_COLLECTION,
    roomCode,
    ROOM_REACTIONS_SUBCOLLECTION,
    payload
  );
  reactionLimiter.record(nowMs);

  return { id, ...payload };
}

/**
 * Subscribes to the latest reactions in `rooms/{roomCode}/reactions`.
 */
export function subscribeToRoomReactions(
  roomCode: string,
  callbacks: {
    onReactions: (reactions: RoomReaction[]) => void;
    onError?: (error: Error) => void;
  }
): Unsubscribe {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (!isValidRoomCodeFormat(normalizedCode) || !isFirebaseConfigured()) {
    return () => {};
  }

  return subscribeToSubcollection<Omit<RoomReaction, 'id'>>(
    ROOMS_COLLECTION,
    normalizedCode,
    ROOM_REACTIONS_SUBCOLLECTION,
    {
      orderByField: 'createdAt',
      direction: 'desc',
      maxItems: 20,
      onData: (rawItems) => {
        const valid: RoomReaction[] = [];
        for (const item of rawItems) {
          const parsed = RoomReactionSchema.safeParse(item);
          if (parsed.success && parsed.data.roomCode === normalizedCode) {
            valid.push({
              ...parsed.data,
              roomCode: normalizedCode,
            });
          }
        }
        // Return in chronological order (oldest -> newest)
        valid.sort((a, b) => a.createdAt - b.createdAt);
        callbacks.onReactions(valid);
      },
      onError: callbacks.onError,
    }
  );
}

/**
 * Sends a validated, sanitized real-time chat message into `rooms/{roomCode}/messages`.
 * Persists across rounds while the room remains active; never modifies room game state.
 */
export async function sendRoomChatMessage(params: {
  room: Pick<MultiplayerRoomDocument, 'roomCode' | 'status' | 'players'>;
  text: string;
  nowMs?: number;
}): Promise<RoomChatMessage> {
  const nowMs = params.nowMs ?? Date.now();
  const sanitizedText = validateChatMessageInput(params.text);

  const rateCheck = chatLimiter.check(nowMs);
  if (!rateCheck.allowed) {
    throw new MultiplayerRoomError(
      'INVALID_MOVE',
      'You are sending messages too quickly. Please wait a second.'
    );
  }

  const user = await ensureAnonymousSession();
  const { roomCode, nickname } = assertRoomMembershipForSocial(params.room, user.uid);

  const payload = {
    roomCode,
    uid: user.uid,
    nickname,
    text: sanitizedText,
    createdAt: nowMs,
  };

  const id = await addSubcollectionDocument(
    ROOMS_COLLECTION,
    roomCode,
    ROOM_MESSAGES_SUBCOLLECTION,
    payload
  );
  chatLimiter.record(nowMs);

  return { id, ...payload };
}

/**
 * Deletes a chat message (allowed for the room host for moderation, or the message author).
 */
export async function deleteRoomChatMessage(params: {
  roomCode: string;
  messageId: string;
}): Promise<void> {
  const normalizedCode = normalizeRoomCode(params.roomCode);
  if (!isValidRoomCodeFormat(normalizedCode) || !params.messageId) return;
  await ensureAnonymousSession();
  await deleteSubcollectionDocument(
    ROOMS_COLLECTION,
    normalizedCode,
    ROOM_MESSAGES_SUBCOLLECTION,
    params.messageId
  );
}

/**
 * Subscribes to chronological room chat history in `rooms/{roomCode}/messages`.
 */
export function subscribeToRoomChat(
  roomCode: string,
  callbacks: {
    onMessages: (messages: RoomChatMessage[]) => void;
    onError?: (error: Error) => void;
  }
): Unsubscribe {
  const normalizedCode = normalizeRoomCode(roomCode);
  if (!isValidRoomCodeFormat(normalizedCode) || !isFirebaseConfigured()) {
    return () => {};
  }

  return subscribeToSubcollection<Omit<RoomChatMessage, 'id'>>(
    ROOMS_COLLECTION,
    normalizedCode,
    ROOM_MESSAGES_SUBCOLLECTION,
    {
      orderByField: 'createdAt',
      direction: 'asc',
      maxItems: 100,
      onData: (rawItems) => {
        const valid: RoomChatMessage[] = [];
        for (const item of rawItems) {
          const parsed = RoomChatMessageSchema.safeParse(item);
          if (parsed.success && parsed.data.roomCode === normalizedCode) {
            valid.push({
              ...parsed.data,
              roomCode: normalizedCode,
            });
          }
        }
        valid.sort((a, b) => a.createdAt - b.createdAt);
        callbacks.onMessages(valid);
      },
      onError: callbacks.onError,
    }
  );
}

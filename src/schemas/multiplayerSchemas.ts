/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  MEMORY_MIN_CARD_COUNT,
  MEMORY_MAX_CARD_COUNT,
  MEMORY_CARD_COUNT_STEP,
  MEMORY_MIN_PLAYER_LIMIT,
  MEMORY_MAX_PLAYER_LIMIT,
  DEFAULT_MEMORY_ROOM_SETTINGS,
  ALLOWED_REACTION_EMOJIS,
  CHAT_MESSAGE_MAX_LENGTH,
  type MemoryRoomSettings,
  type MultiplayerRoomDocument,
  type MultiplayerGameType,
  type ReactionEmoji,
} from '../types/multiplayer';
import { MultiplayerRoomError } from '../utils/multiplayerErrors';

/**
 * 1. Room Code Schema:
 * Normalizes whitespace/hyphens and validates a 6-character uppercase alphanumeric code.
 */
export const RoomCodeSchema = z
  .string()
  .transform((val) => val.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((val) => /^[A-Z0-9]{6}$/.test(val), {
    message: 'Room code must be 6 alphanumeric characters.',
  });

/**
 * 2. Player Nickname Schema:
 * Collapses repeated whitespace, trims, and enforces 2–16 characters.
 */
export const PlayerNicknameSchema = z
  .string()
  .transform((val) => val.replace(/\s+/g, ' ').trim().slice(0, 16))
  .refine((val) => val.length >= 2 && val.length <= 16, {
    message: 'Nickname must be between 2 and 16 characters.',
  });

/**
 * 3. Player Identity (UID) Schema:
 * Non-empty Firebase Anonymous Auth UID or player identifier.
 */
export const PlayerIdentitySchema = z
  .string()
  .trim()
  .min(1, 'Player UID is required.')
  .max(128, 'Player UID exceeds maximum length.');

/**
 * 4. Player Score Schema:
 * Non-negative integer score.
 */
export const PlayerScoreSchema = z.number().int().min(0).max(500);

/**
 * 5. Room Capacity & Game Type Schemas:
 */
export const MultiplayerGameTypeSchema = z.enum(['tic-tac-toe', 'memory-match']);

export const RoomStatusSchema = z.enum([
  'waiting',
  'in_progress',
  'completed',
  'closed',
  'expired',
]);

export const PlayerConnectionStatusSchema = z.enum(['connected', 'disconnected']);

export const MemoryPlayerCapacitySchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

export const RoomCapacitySchema = z.number().int().min(2).max(8);

/**
 * 6. Memory Match Room Settings Schema (board size independent of player count):
 * - cardCount: integer 10–100, divisible by 2
 * - minPlayers / maxPlayers: integers 2–8, minPlayers <= maxPlayers
 */
export const MemoryCardCountSchema = z
  .number()
  .int('Card count must be a whole number.')
  .min(MEMORY_MIN_CARD_COUNT, `Card count must be at least ${MEMORY_MIN_CARD_COUNT}.`)
  .max(MEMORY_MAX_CARD_COUNT, `Card count cannot exceed ${MEMORY_MAX_CARD_COUNT}.`)
  .refine((n) => n % MEMORY_CARD_COUNT_STEP === 0, {
    message: 'Card count must be an even number.',
  });

export const MemoryPlayerLimitSchema = z
  .number()
  .int()
  .min(MEMORY_MIN_PLAYER_LIMIT, `Player limits must be at least ${MEMORY_MIN_PLAYER_LIMIT}.`)
  .max(MEMORY_MAX_PLAYER_LIMIT, `Player limits cannot exceed ${MEMORY_MAX_PLAYER_LIMIT}.`);

export const MemoryRoomSettingsSchema = z
  .object({
    cardCount: MemoryCardCountSchema,
    minPlayers: MemoryPlayerLimitSchema,
    maxPlayers: MemoryPlayerLimitSchema,
  })
  .refine((s) => s.minPlayers <= s.maxPlayers, {
    message: 'Minimum players cannot exceed maximum players.',
    path: ['minPlayers'],
  });

/**
 * 7. Room Creation & Join Request Schemas:
 */
export const RoomCreationRequestSchema = z
  .object({
    gameType: MultiplayerGameTypeSchema,
    hostNickname: PlayerNicknameSchema,
    maxPlayers: RoomCapacitySchema.optional(),
    memorySettings: z
      .object({
        cardCount: z.number().optional(),
        minPlayers: z.number().optional(),
        maxPlayers: z.number().optional(),
      })
      .optional(),
  })
  .transform((val) => {
    if (val.gameType === 'tic-tac-toe') {
      return {
        gameType: val.gameType,
        hostNickname: val.hostNickname,
        maxPlayers: 2,
        memorySettings: null as MemoryRoomSettings | null,
      };
    }
    const maxPlayers =
      val.memorySettings?.maxPlayers ?? val.maxPlayers ?? DEFAULT_MEMORY_ROOM_SETTINGS.maxPlayers;
    const memorySettings = {
      cardCount: val.memorySettings?.cardCount ?? DEFAULT_MEMORY_ROOM_SETTINGS.cardCount,
      minPlayers:
        val.memorySettings?.minPlayers ??
        Math.min(DEFAULT_MEMORY_ROOM_SETTINGS.minPlayers, maxPlayers),
      maxPlayers,
    };
    return {
      gameType: val.gameType,
      hostNickname: val.hostNickname,
      maxPlayers,
      memorySettings: memorySettings as MemoryRoomSettings | null,
    };
  })
  .refine(
    (val) =>
      val.gameType === 'tic-tac-toe'
        ? val.maxPlayers === 2
        : MemoryRoomSettingsSchema.safeParse(val.memorySettings).success,
    {
      message: 'Invalid room settings for the selected game.',
      path: ['memorySettings'],
    }
  );

export const RoomJoinRequestSchema = z.object({
  roomCode: RoomCodeSchema,
  nickname: PlayerNicknameSchema,
  expectedGameType: MultiplayerGameTypeSchema.optional(),
});

/**
 * 8. Room Player & Room Membership Schemas:
 */
export const RoomPlayerSchema = z.object({
  uid: PlayerIdentitySchema,
  nickname: z.string().min(1).max(32),
  isHost: z.boolean(),
  joinedAt: z.number().nonnegative(),
  lastSeenAt: z.number().nonnegative(),
  connectionStatus: PlayerConnectionStatusSchema,
  symbol: z.enum(['X', 'O']).nullable().optional(),
  score: PlayerScoreSchema,
  rematchAccepted: z.boolean(),
});

export const RoomMembershipSchema = z
  .object({
    players: z.record(z.string(), RoomPlayerSchema),
    playerOrder: z.array(PlayerIdentitySchema).min(0).max(8),
    maxPlayers: RoomCapacitySchema,
  })
  .refine(
    (data) => {
      const uniqueOrder = new Set(data.playerOrder);
      if (uniqueOrder.size !== data.playerOrder.length) {
        return false;
      }
      if (data.playerOrder.length > data.maxPlayers) {
        return false;
      }
      return data.playerOrder.every((uid) => Boolean(data.players[uid]));
    },
    {
      message: 'Room membership order must match registered players and respect room capacity.',
    }
  );

/**
 * 9. Card and Symbol Identifiers & Multiplayer Memory Card Schema:
 */
export const CardSymbolIdSchema = z.string().min(1).max(40);
export const CardIdSchema = z.number().int().min(0).max(99);

export const MultiplayerMemoryCardSchema = z.object({
  id: CardIdSchema,
  pairKey: CardSymbolIdSchema,
  symbolId: CardSymbolIdSchema,
  name: z.string().min(1).max(60),
  color: z.string().min(1).max(32),
  badgeLabel: z.string().optional(),
  isFlipped: z.boolean(),
  isMatched: z.boolean(),
  matchedByUid: PlayerIdentitySchema.nullable(),
});

/**
 * 10. Matched-Card Ownership Schema:
 */
export const MatchedCardOwnershipSchema = z.record(CardSymbolIdSchema, PlayerIdentitySchema);

/**
 * 11. Turn Information Schema:
 */
export const TurnInfoSchema = z.object({
  turnOrderUids: z.array(PlayerIdentitySchema).min(2).max(8),
  currentTurnIndex: z.number().int().min(0).max(7),
  currentTurnUid: PlayerIdentitySchema,
});

/**
 * 12. Rematch and Round State Schema:
 */
export const RematchAndRoundStateSchema = z.object({
  roundNumber: z.number().int().min(1).default(1),
  pendingResetAt: z.number().nullable(),
  winnerUids: z.array(PlayerIdentitySchema),
  isTie: z.boolean(),
});

/**
 * 13. Memory Match Board & Game State Schema:
 */
export const MemoryMatchBoardStateSchema = z
  .object({
    cards: z.array(MultiplayerMemoryCardSchema).refine(
      (cards) =>
        cards.length >= MEMORY_MIN_CARD_COUNT &&
        cards.length <= MEMORY_MAX_CARD_COUNT &&
        cards.length % 2 === 0,
      { message: 'Memory Match board must have an even number of cards between 10 and 100.' }
    ),
    totalPairs: z.number().int().min(MEMORY_MIN_CARD_COUNT / 2).max(MEMORY_MAX_CARD_COUNT / 2),
    matchedPairs: z.number().int().min(0).max(MEMORY_MAX_CARD_COUNT / 2),
    roundNumber: z.number().int().min(1).optional(),
    matchedByPairKey: MatchedCardOwnershipSchema.optional(),
    lastMatchedPairKey: CardSymbolIdSchema.nullable().optional(),
    turnOrderUids: z.array(PlayerIdentitySchema).min(2).max(8),
    currentTurnIndex: z.number().int().min(0).max(7),
    currentTurnUid: PlayerIdentitySchema,
    flippedCardIds: z.array(CardIdSchema).max(2),
    pendingResetAt: z.number().nullable(),
    winnerUids: z.array(PlayerIdentitySchema),
    isTie: z.boolean(),
    matchSettings: MemoryRoomSettingsSchema.optional(),
    turnSequence: z.number().int().min(0).optional(),
    turnStartedAt: z.number().nonnegative().optional(),
    lastSkippedTurn: z
      .object({
        skippedUid: PlayerIdentitySchema,
        skippedNickname: z.string().min(1).max(32),
        skippedByUid: PlayerIdentitySchema,
        skippedByNickname: z.string().min(1).max(32),
        roundNumber: z.number().int().min(1),
        turnSequence: z.number().int().min(1),
        skippedAt: z.number().nonnegative(),
      })
      .nullable()
      .optional(),
  })
  .refine((mm) => mm.cards.length === mm.totalPairs * 2, {
    message: 'Memory Match card count must equal totalPairs * 2.',
  })
  .refine((mm) => !mm.matchSettings || mm.matchSettings.cardCount === mm.cards.length, {
    message: 'Active match settings must describe the dealt board.',
  })
  .refine((mm) => mm.matchedPairs <= mm.totalPairs, {
    message: 'matchedPairs cannot exceed totalPairs.',
  })
  .refine((mm) => mm.currentTurnIndex < mm.turnOrderUids.length, {
    message: 'currentTurnIndex must be within turnOrderUids bounds.',
  });

/**
 * 14. Tic-Tac-Toe Multiplayer State Schema:
 */
export const TicTacToeMultiplayerStateSchema = z.object({
  board: z.array(z.enum(['X', 'O']).nullable()).length(9),
  currentTurnSymbol: z.enum(['X', 'O']),
  currentTurnUid: PlayerIdentitySchema,
  playerXUid: PlayerIdentitySchema,
  playerOUid: PlayerIdentitySchema,
  winnerSymbol: z.enum(['X', 'O']).nullable(),
  winnerUid: PlayerIdentitySchema.nullable(),
  isDraw: z.boolean(),
  winningLine: z
    .object({
      indices: z.tuple([z.number(), z.number(), z.number()]),
      direction: z.enum(['row', 'col', 'diag']),
    })
    .nullable(),
  roundNumber: z.number().int().min(1),
  scores: z.object({
    xWins: PlayerScoreSchema,
    oWins: PlayerScoreSchema,
    draws: PlayerScoreSchema,
  }),
});

/**
 * 15. Complete Firestore Room Document Schema:
 */
export const MultiplayerRoomDocumentSchema = z
  .object({
    roomCode: RoomCodeSchema,
    gameType: MultiplayerGameTypeSchema,
    status: RoomStatusSchema,
    hostUid: PlayerIdentitySchema,
    maxPlayers: RoomCapacitySchema,
    players: z.record(z.string(), RoomPlayerSchema),
    playerOrder: z.array(PlayerIdentitySchema).max(8),
    currentTurnUid: PlayerIdentitySchema.nullable(),
    createdAt: z.number().nonnegative(),
    lastActivityAt: z.number().nonnegative(),
    startedAt: z.number().nullable(),
    completedAt: z.number().nullable(),
    expiresAt: z.number().nonnegative(),
    ticTacToeState: TicTacToeMultiplayerStateSchema.nullable(),
    memoryMatchState: MemoryMatchBoardStateSchema.nullable(),
    memoryRoomSettings: MemoryRoomSettingsSchema.nullable().optional(),
  })
  .refine(
    (doc) =>
      doc.gameType !== 'memory-match' ||
      !doc.memoryRoomSettings ||
      doc.memoryRoomSettings.maxPlayers === doc.maxPlayers,
    {
      message: 'Room capacity must mirror the configured maximum players.',
    }
  )
  .refine(
    (doc) => {
      if (doc.status === 'expired' && doc.playerOrder.length === 0) {
        return true;
      }
      if (doc.playerOrder.length > doc.maxPlayers) {
        return false;
      }
      return doc.playerOrder.every((uid) => Boolean(doc.players[uid]));
    },
    {
      message: 'Room playerOrder must reference valid players and not exceed maxPlayers.',
    }
  );

export type ValidatedRoomCreationRequest = z.infer<typeof RoomCreationRequestSchema>;
export type ValidatedRoomJoinRequest = z.infer<typeof RoomJoinRequestSchema>;
export type ValidatedMultiplayerRoomDocument = z.infer<typeof MultiplayerRoomDocumentSchema>;

/**
 * Validates host-submitted Memory Match room settings before any Firebase call.
 * When `joinedPlayerCount` is provided, the maximum cannot drop below current membership.
 * Throws a user-friendly MultiplayerRoomError on invalid input.
 */
export function validateMemoryRoomSettingsInput(
  input: unknown,
  joinedPlayerCount?: number
): MemoryRoomSettings {
  const parsed = MemoryRoomSettingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new MultiplayerRoomError(
      'INVALID_ROOM_SETTINGS',
      parsed.error.issues[0]?.message ?? 'Invalid room settings.'
    );
  }
  if (joinedPlayerCount !== undefined && parsed.data.maxPlayers < joinedPlayerCount) {
    throw new MultiplayerRoomError(
      'INVALID_ROOM_SETTINGS',
      `Maximum players cannot be lower than the ${joinedPlayerCount} players already in the room.`
    );
  }
  return parsed.data;
}

/**
 * Validates room creation input before any Firebase call.
 * Throws a user-friendly MultiplayerRoomError on invalid input.
 */
export function validateRoomCreationInput(input: {
  gameType: MultiplayerGameType;
  hostNickname: string;
  maxPlayers?: number;
  memorySettings?: Partial<MemoryRoomSettings>;
}): ValidatedRoomCreationRequest {
  const parsed = RoomCreationRequestSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path?.join('.') ?? '';
    if (path.includes('hostNickname')) {
      throw new MultiplayerRoomError(
        'INVALID_NICKNAME',
        'Nickname must be between 2 and 16 characters.'
      );
    }
    if (path.includes('memorySettings')) {
      throw new MultiplayerRoomError(
        'INVALID_ROOM_SETTINGS',
        firstIssue?.message ?? 'Invalid room settings.'
      );
    }
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      firstIssue?.message ?? 'Invalid room creation configuration.'
    );
  }
  return parsed.data;
}

/**
 * Validates room join input before any Firebase call.
 * Throws a user-friendly MultiplayerRoomError on invalid input.
 */
export function validateRoomJoinInput(input: {
  roomCode: string;
  nickname: string;
  expectedGameType?: MultiplayerGameType;
}): ValidatedRoomJoinRequest {
  const codeCheck = RoomCodeSchema.safeParse(input.roomCode);
  if (!codeCheck.success) {
    throw new MultiplayerRoomError(
      'INVALID_ROOM_CODE',
      'Room code must be 6 alphanumeric characters.'
    );
  }

  const nickCheck = PlayerNicknameSchema.safeParse(input.nickname);
  if (!nickCheck.success) {
    throw new MultiplayerRoomError(
      'INVALID_NICKNAME',
      'Nickname must be between 2 and 16 characters.'
    );
  }

  return {
    roomCode: codeCheck.data,
    nickname: nickCheck.data,
    expectedGameType: input.expectedGameType,
  };
}

/**
 * Validates raw Firestore document data before using it in application state.
 * Returns the validated MultiplayerRoomDocument or null if malformed/incomplete.
 */
export function parseFirestoreRoomDocument(
  raw: unknown,
  expectedRoomCode?: string
): MultiplayerRoomDocument | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = MultiplayerRoomDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  if (
    expectedRoomCode &&
    parsed.data.roomCode !== expectedRoomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  ) {
    return null;
  }

  return parsed.data as MultiplayerRoomDocument;
}

/**
 * 16. Real-Time Reactions & Room Chat Schemas:
 */
export const ReactionEmojiSchema = z.enum(ALLOWED_REACTION_EMOJIS);

export const RoomReactionSchema = z.object({
  id: z.string().min(1).max(128),
  roomCode: RoomCodeSchema,
  uid: PlayerIdentitySchema,
  nickname: z.string().min(1).max(32),
  emoji: ReactionEmojiSchema,
  createdAt: z.number().nonnegative(),
});

/**
 * Strips control characters, collapses excessive whitespace, and trims chat input.
 * React renders text nodes safely without HTML interpretation, and stripping control chars
 * prevents spoofing / layout corruption.
 */
export function sanitizeChatMessageText(raw: string): string {
  let cleaned = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      cleaned += ' ';
    } else {
      cleaned += raw[i];
    }
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

export const ChatMessageTextSchema = z
  .string()
  .transform(sanitizeChatMessageText)
  .refine((val) => val.length >= 1, {
    message: 'Message cannot be empty.',
  })
  .refine((val) => val.length <= CHAT_MESSAGE_MAX_LENGTH, {
    message: `Message cannot exceed ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
  });

export const RoomChatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  roomCode: RoomCodeSchema,
  uid: PlayerIdentitySchema,
  nickname: z.string().min(1).max(32),
  text: z.string().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  createdAt: z.number().nonnegative(),
});

export function validateReactionInput(emoji: unknown): ReactionEmoji {
  const parsed = ReactionEmojiSchema.safeParse(emoji);
  if (!parsed.success) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'Invalid reaction emoji.');
  }
  return parsed.data;
}

export function validateChatMessageInput(rawText: unknown): string {
  const parsed = ChatMessageTextSchema.safeParse(rawText);
  if (!parsed.success) {
    throw new MultiplayerRoomError(
      'INVALID_MOVE',
      parsed.error.issues[0]?.message ?? 'Invalid chat message.'
    );
  }
  return parsed.data;
}

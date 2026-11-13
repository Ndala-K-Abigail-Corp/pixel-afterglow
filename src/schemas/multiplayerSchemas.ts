/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  MEMORY_MULTIPLAYER_CONFIGS,
  type MultiplayerRoomDocument,
  type MemoryMultiplayerPlayerCount,
  type MultiplayerGameType,
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

export const MemorySelectableRoomCapacitySchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(8),
]);

export const RoomCapacitySchema = z.number().int().min(2).max(8);

/**
 * 6. Game Configuration Schema (Memory Match board config per player count):
 */
export const GameConfigurationSchema = z.object({
  maxPlayers: MemoryPlayerCapacitySchema,
  minPlayersToStart: z.union([z.literal(2), z.literal(3)]),
  totalCards: z.union([z.literal(20), z.literal(40), z.literal(60), z.literal(100)]),
  matchingPairs: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
});

/**
 * 7. Room Creation & Join Request Schemas:
 */
export const RoomCreationRequestSchema = z
  .object({
    gameType: MultiplayerGameTypeSchema,
    hostNickname: PlayerNicknameSchema,
    maxPlayers: RoomCapacitySchema.optional(),
  })
  .transform((val) => ({
    gameType: val.gameType,
    hostNickname: val.hostNickname,
    maxPlayers: (val.gameType === 'tic-tac-toe'
      ? 2
      : (val.maxPlayers ?? 2)) as MemoryMultiplayerPlayerCount,
  }))
  .refine(
    (val) =>
      val.gameType === 'tic-tac-toe'
        ? val.maxPlayers === 2
        : val.maxPlayers in MEMORY_MULTIPLAYER_CONFIGS,
    {
      message: 'Invalid room player capacity for the selected game.',
      path: ['maxPlayers'],
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
        cards.length === 20 ||
        cards.length === 40 ||
        cards.length === 60 ||
        cards.length === 100,
      { message: 'Memory Match board must have 20, 40, 60, or 100 cards.' }
    ),
    totalPairs: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
    matchedPairs: z.number().int().min(0).max(50),
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
  })
  .refine((mm) => mm.cards.length === mm.totalPairs * 2, {
    message: 'Memory Match card count must equal totalPairs * 2.',
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
  })
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
 * Validates room creation input before any Firebase call.
 * Throws a user-friendly MultiplayerRoomError on invalid input.
 */
export function validateRoomCreationInput(input: {
  gameType: MultiplayerGameType;
  hostNickname: string;
  maxPlayers?: number;
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

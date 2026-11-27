/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BoardState, Player, WinningLine } from './game';

/**
 * Supported multiplayer game types in Pixel Afterglow.
 */
export type MultiplayerGameType = 'tic-tac-toe' | 'memory-match';

/**
 * Strictly defined lifecycle states for a multiplayer room.
 */
export type RoomStatus =
  | 'waiting'
  | 'in_progress'
  | 'completed'
  | 'closed'
  | 'expired';

/**
 * Allowed state transitions to prevent invalid room lifecycle mutations.
 */
export const VALID_ROOM_STATE_TRANSITIONS: Readonly<Record<RoomStatus, ReadonlyArray<RoomStatus>>> = {
  waiting: ['in_progress', 'closed', 'expired'],
  in_progress: ['completed', 'closed', 'expired'],
  completed: ['in_progress', 'closed', 'expired'], // completed -> in_progress used for consensused rematch
  closed: ['expired'],
  expired: [],
};

/**
 * Expiry policy durations in milliseconds.
 */
export const ROOM_EXPIRY_POLICIES_MS = {
  WAITING_INACTIVITY_MS: 30 * 60 * 1000, // 30 minutes
  INTERRUPTED_INACTIVITY_MS: 30 * 60 * 1000, // 30 minutes
  COMPLETED_RETENTION_MS: 5 * 60 * 1000, // 5 minutes after completion
  HEARTBEAT_INTERVAL_MS: 60 * 1000, // 60 seconds periodic presence check
  HEARTBEAT_MIN_WRITE_INTERVAL_MS: 45 * 1000, // Minimum 45s elapsed before writing a heartbeat
  DISCONNECT_THRESHOLD_MS: 3 * 60 * 1000, // 3 minutes without activity marks player disconnected
} as const;

/**
 * Allowed player counts for Memory Match multiplayer rooms (2 to 8 players).
 */
export type MemoryMultiplayerPlayerCount = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Flexible Memory Match board & player limits.
 * Board size is fully independent of the number of players:
 * - Card count: 10–100 in steps of 2 (always even, pairs = cardCount / 2)
 * - Player limits: minimum 2–8, maximum 2–8, minimum <= maximum
 */
export const MEMORY_MIN_CARD_COUNT = 10;
export const MEMORY_MAX_CARD_COUNT = 100;
export const MEMORY_CARD_COUNT_STEP = 2;
export const MEMORY_MIN_PLAYER_LIMIT = 2;
export const MEMORY_MAX_PLAYER_LIMIT = 8;
/** Boards at or above this size show the "Large game board" recommendation notice. */
export const MEMORY_LARGE_BOARD_THRESHOLD = 60;

/**
 * Persistent host-controlled Memory Match room settings (stored as `memoryRoomSettings`).
 * These describe the NEXT match. They are editable by the host only while the room is
 * `waiting` or `completed`, and are locked while a match is `in_progress`.
 */
export interface MemoryRoomSettings {
  cardCount: number;
  minPlayers: number;
  maxPlayers: number;
}

export const DEFAULT_MEMORY_ROOM_SETTINGS: Readonly<MemoryRoomSettings> = {
  cardCount: 20,
  minPlayers: 2,
  maxPlayers: 8,
};

/**
 * Authoritative per-game player limits (automatically enforced by app logic & Firestore Rules).
 * Room creation does not ask the host to pick min/max player counts.
 */
export const GAME_PLAYER_LIMITS: Readonly<
  Record<MultiplayerGameType, { minPlayers: number; maxPlayers: number }>
> = {
  'tic-tac-toe': { minPlayers: 2, maxPlayers: 2 },
  'memory-match': { minPlayers: 2, maxPlayers: 8 },
};

/** Every selectable card count: 10, 12, 14 … 98, 100. */
export const MEMORY_VALID_CARD_COUNTS: ReadonlyArray<number> = Array.from(
  { length: (MEMORY_MAX_CARD_COUNT - MEMORY_MIN_CARD_COUNT) / MEMORY_CARD_COUNT_STEP + 1 },
  (_, i) => MEMORY_MIN_CARD_COUNT + i * MEMORY_CARD_COUNT_STEP
);

export function isValidMemoryCardCount(cardCount: unknown): cardCount is number {
  return (
    typeof cardCount === 'number' &&
    Number.isInteger(cardCount) &&
    cardCount >= MEMORY_MIN_CARD_COUNT &&
    cardCount <= MEMORY_MAX_CARD_COUNT &&
    cardCount % MEMORY_CARD_COUNT_STEP === 0
  );
}

export function isValidMemoryPlayerLimit(limit: unknown): limit is number {
  return (
    typeof limit === 'number' &&
    Number.isInteger(limit) &&
    limit >= MEMORY_MIN_PLAYER_LIMIT &&
    limit <= MEMORY_MAX_PLAYER_LIMIT
  );
}

/**
 * Pure structural validation of a settings object (independent of current room membership).
 */
export function isValidMemoryRoomSettings(
  settings: Partial<MemoryRoomSettings> | null | undefined
): settings is MemoryRoomSettings {
  return Boolean(
    settings &&
      isValidMemoryCardCount(settings.cardCount) &&
      isValidMemoryPlayerLimit(settings.minPlayers) &&
      isValidMemoryPlayerLimit(settings.maxPlayers) &&
      (settings.minPlayers as number) <= (settings.maxPlayers as number)
  );
}

/** Number of unique symbol pairs for a card count (always cardCount / 2). */
export function getMemoryPairCount(cardCount: number): number {
  return cardCount / 2;
}

export function isLargeMemoryBoard(cardCount: number): boolean {
  return cardCount >= MEMORY_LARGE_BOARD_THRESHOLD;
}

const LARGE_BOARD_ACK_STORAGE_KEY = 'pixel-afterglow:large-board-notice-ack';

export function isLargeBoardNoticeAcknowledged(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(LARGE_BOARD_ACK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeLargeBoardNotice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LARGE_BOARD_ACK_STORAGE_KEY, '1');
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function resetLargeBoardNoticeAcknowledgement(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LARGE_BOARD_ACK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Resolves the persistent Memory Match settings for a room, falling back to defaults
 * synchronised with the room's `maxPlayers` capacity for legacy rooms without settings.
 */
export function getRoomMemorySettings(
  room: Pick<MultiplayerRoomDocument, 'maxPlayers'> & {
    memoryRoomSettings?: MemoryRoomSettings | null;
  }
): MemoryRoomSettings {
  if (room.memoryRoomSettings && isValidMemoryRoomSettings(room.memoryRoomSettings)) {
    return { ...room.memoryRoomSettings };
  }
  const maxPlayers = isValidMemoryPlayerLimit(room.maxPlayers)
    ? room.maxPlayers
    : DEFAULT_MEMORY_ROOM_SETTINGS.maxPlayers;
  return {
    cardCount: DEFAULT_MEMORY_ROOM_SETTINGS.cardCount,
    minPlayers: Math.min(DEFAULT_MEMORY_ROOM_SETTINGS.minPlayers, maxPlayers),
    maxPlayers,
  };
}

/**
 * Returns the minimum number of joined players required for the host to start a match.
 * - Tic-Tac-Toe -> always 2
 * - Memory Match -> the host-configured `memoryRoomSettings.minPlayers` (default 2)
 */
export function getRoomMinimumPlayers(
  room: Pick<MultiplayerRoomDocument, 'gameType' | 'maxPlayers'> & {
    memoryRoomSettings?: MemoryRoomSettings | null;
  }
): number {
  if (room.gameType === 'tic-tac-toe') {
    return 2;
  }
  return getRoomMemorySettings(room).minPlayers;
}

/**
 * Player connection status tracked in a room.
 */
export type PlayerConnectionStatus = 'connected' | 'disconnected';

/**
 * Temporary player identity stored inside a multiplayer room document.
 */
export interface RoomPlayer {
  uid: string;
  nickname: string;
  isHost: boolean;
  joinedAt: number;
  lastSeenAt: number;
  connectionStatus: PlayerConnectionStatus;
  /** Assigned symbol ('X' for host, 'O' for guest) in Tic-Tac-Toe, or null in Memory Match */
  symbol?: Player | null;
  /** Player score in Memory Match (or round wins in Tic-Tac-Toe) */
  score: number;
  /** Whether the player has voted to accept a rematch after game completion */
  rematchAccepted: boolean;
}

/**
 * Multiplayer Tic-Tac-Toe game state embedded in the room document.
 */
export interface TicTacToeMultiplayerState {
  board: BoardState; // 9 elements ('X' | 'O' | null)
  currentTurnSymbol: Player;
  currentTurnUid: string;
  playerXUid: string;
  playerOUid: string;
  winnerSymbol: Player | null;
  winnerUid: string | null;
  isDraw: boolean;
  winningLine: WinningLine | null;
  roundNumber: number;
  scores: {
    xWins: number;
    oWins: number;
    draws: number;
  };
}

/**
 * Single card on a shared Multiplayer Memory Match board.
 */
export interface MultiplayerMemoryCard {
  id: number;
  pairKey: string;
  symbolId: string;
  name: string;
  color: string;
  badgeLabel?: string;
  isFlipped: boolean;
  isMatched: boolean;
  matchedByUid: string | null;
}

/**
 * Multiplayer Memory Match game state embedded in the room document.
 */
export interface MemoryMatchMultiplayerState {
  cards: MultiplayerMemoryCard[];
  totalPairs: number;
  matchedPairs: number;
  /** Current round within this room (starts at 1, incremented on each rematch). Scores are per-round. */
  roundNumber?: number;
  /** Map of pairKey -> UID of the player who matched that pair (immutable per pair once set) */
  matchedByPairKey?: Record<string, string>;
  /** The pairKey matched on the most recent matching move, or null */
  lastMatchedPairKey?: string | null;
  turnOrderUids: string[];
  currentTurnIndex: number;
  currentTurnUid: string;
  /** Indices of cards flipped during the current turn (max 2) */
  flippedCardIds: number[];
  /** Timestamp when a non-matching pair was revealed so clients can briefly show before hiding */
  pendingResetAt: number | null;
  /** UID(s) of the winning player(s) when all pairs are matched (>1 UID indicates a tie) */
  winnerUids: string[];
  isTie: boolean;
  /**
   * Immutable snapshot of the settings this match was dealt with. Kept separate from the
   * room's persistent `memoryRoomSettings` so editing the NEXT match never alters this one.
   */
  matchSettings?: MemoryRoomSettings;
  /** Monotonic turn counter within the current round (prevents duplicate skips / stale moves) */
  turnSequence?: number;
  /** Epoch ms when the current turn started (used to determine skip-turn eligibility) */
  turnStartedAt?: number;
  /** Details of the most recently skipped turn so all players see a clear notification */
  lastSkippedTurn?: SkippedTurnInfo | null;
}

/**
 * Metadata recorded when an inactive player's turn is skipped.
 */
export interface SkippedTurnInfo {
  skippedUid: string;
  skippedNickname: string;
  skippedByUid: string;
  skippedByNickname: string;
  roundNumber: number;
  turnSequence: number;
  skippedAt: number;
}

/** Inactivity duration (ms) before a connected turn player becomes eligible to be skipped. */
export const SKIP_TURN_INACTIVITY_MS = 30_000;

/**
 * Real-time player reactions & room chat types (stored in Firestore subcollections).
 */
export const ALLOWED_REACTION_EMOJIS = [
  '😂',
  '👏',
  '🔥',
  '😮',
  '😭',
  '🎉',
  '❤️',
  '😎',
  '😡',
] as const;

export type ReactionEmoji = (typeof ALLOWED_REACTION_EMOJIS)[number];

export interface ArcadeReactionMeta {
  emoji: ReactionEmoji;
  label: string;
  accentHex: string;
  glowRgba: string;
}

export const ARCADE_REACTION_CATALOG: ReadonlyArray<ArcadeReactionMeta> = [
  { emoji: '😂', label: 'Laugh', accentHex: '#FFC66D', glowRgba: 'rgba(255, 198, 109, 0.45)' },
  { emoji: '👏', label: 'Clap', accentHex: '#56E0CB', glowRgba: 'rgba(86, 224, 203, 0.45)' },
  { emoji: '🔥', label: 'Fire', accentHex: '#F97316', glowRgba: 'rgba(249, 115, 22, 0.48)' },
  { emoji: '😮', label: 'Shock', accentHex: '#38BDF8', glowRgba: 'rgba(56, 189, 248, 0.45)' },
  { emoji: '😭', label: 'Cry', accentHex: '#60A5FA', glowRgba: 'rgba(96, 165, 250, 0.45)' },
  { emoji: '🎉', label: 'Party', accentHex: '#A855F7', glowRgba: 'rgba(168, 85, 247, 0.48)' },
  { emoji: '❤️', label: 'Love', accentHex: '#FF776E', glowRgba: 'rgba(255, 119, 110, 0.48)' },
  { emoji: '😎', label: 'Cool', accentHex: '#22C55E', glowRgba: 'rgba(34, 197, 94, 0.45)' },
  { emoji: '😡', label: 'Angry', accentHex: '#EF4444', glowRgba: 'rgba(239, 68, 68, 0.5)' },
];

export type RoomConnectionState =
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'disconnected';

export interface RoomReaction {
  id: string;
  roomCode: string;
  uid: string;
  nickname: string;
  emoji: ReactionEmoji;
  createdAt: number;
}

export interface RoomChatMessage {
  id: string;
  roomCode: string;
  uid: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export const CHAT_MESSAGE_MAX_LENGTH = 200;
export const REACTION_COOLDOWN_MS = 1500;
export const CHAT_COOLDOWN_MS = 1200;

/**
 * Shared Firestore document structure for a room in `rooms/{roomCode}`.
 */
export interface MultiplayerRoomDocument {
  roomCode: string;
  gameType: MultiplayerGameType;
  status: RoomStatus;
  hostUid: string;
  maxPlayers: number;
  /** Map of Firebase Anonymous Auth UID -> RoomPlayer */
  players: Record<string, RoomPlayer>;
  /** Ordered list of player UIDs by join order */
  playerOrder: string[];
  /** Active turn player UID when status === 'in_progress' */
  currentTurnUid: string | null;
  /** Epoch milliseconds timestamps for lifecycle and application-level expiry checks */
  createdAt: number;
  lastActivityAt: number;
  startedAt: number | null;
  completedAt: number | null;
  expiresAt: number;
  /** Game-specific state payloads */
  ticTacToeState: TicTacToeMultiplayerState | null;
  memoryMatchState: MemoryMatchMultiplayerState | null;
  /**
   * Persistent host-controlled Memory Match settings used for the NEXT match
   * (null for Tic-Tac-Toe). `maxPlayers` above always mirrors `memoryRoomSettings.maxPlayers`.
   */
  memoryRoomSettings?: MemoryRoomSettings | null;
}

/**
 * Validates whether transitioning a room from `fromStatus` to `toStatus` is legal.
 */
export function isValidRoomStateTransition(
  fromStatus: RoomStatus,
  toStatus: RoomStatus
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }
  return VALID_ROOM_STATE_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * Computes the next `expiresAt` timestamp (in epoch ms) based on room status and activity time.
 */
export function computeRoomExpiresAt(
  status: RoomStatus,
  referenceTimeMs: number = Date.now()
): number {
  switch (status) {
    case 'waiting':
      return referenceTimeMs + ROOM_EXPIRY_POLICIES_MS.WAITING_INACTIVITY_MS;
    case 'in_progress':
      return referenceTimeMs + ROOM_EXPIRY_POLICIES_MS.INTERRUPTED_INACTIVITY_MS;
    case 'completed':
      return referenceTimeMs + ROOM_EXPIRY_POLICIES_MS.COMPLETED_RETENTION_MS;
    case 'closed':
    case 'expired':
      return referenceTimeMs;
  }
}

/**
 * Checks at the application level whether a room has expired or been closed.
 */
export function isRoomExpired(
  room: Pick<MultiplayerRoomDocument, 'status' | 'expiresAt' | 'players'>,
  nowMs: number = Date.now()
): boolean {
  if (room.status === 'expired' || room.status === 'closed') {
    return true;
  }
  if (nowMs >= room.expiresAt) {
    return true;
  }
  const playerCount = Object.keys(room.players).length;
  if (playerCount === 0) {
    return true;
  }
  return false;
}

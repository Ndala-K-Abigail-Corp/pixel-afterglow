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
 * Allowed player counts for Memory Match multiplayer rooms.
 */
export type MemoryMultiplayerPlayerCount = 2 | 3 | 4;

/**
 * Board configuration per player count for Multiplayer Memory Match.
 */
export interface MemoryMultiplayerBoardConfig {
  maxPlayers: MemoryMultiplayerPlayerCount;
  totalCards: 20 | 40 | 60;
  matchingPairs: 10 | 20 | 30;
}

export const MEMORY_MULTIPLAYER_CONFIGS: Readonly<
  Record<MemoryMultiplayerPlayerCount, MemoryMultiplayerBoardConfig>
> = {
  2: { maxPlayers: 2, totalCards: 20, matchingPairs: 10 },
  3: { maxPlayers: 3, totalCards: 40, matchingPairs: 20 },
  4: { maxPlayers: 4, totalCards: 60, matchingPairs: 30 },
};

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
}

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

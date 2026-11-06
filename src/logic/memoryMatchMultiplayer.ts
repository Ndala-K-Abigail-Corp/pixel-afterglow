/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MultiplayerRoomDocument,
  RoomPlayer,
  MultiplayerMemoryCard,
  MemoryMatchMultiplayerState,
  MemoryMultiplayerPlayerCount,
  MEMORY_MULTIPLAYER_CONFIGS,
  computeRoomExpiresAt,
  isRoomExpired,
} from '../types/multiplayer';
import { MEMORY_CARD_SYMBOLS } from './memoryMatch';
import {
  ROOMS_COLLECTION,
  MultiplayerRoomError,
  isPlayerEffectivelyConnected,
  normalizeRoomCode,
  validateHostCanStartGame,
} from './multiplayerRoom';
import { ensureAnonymousSession } from '../lib/auth';
import { getDocRef, runFirestoreTransaction } from '../lib/firestore';

export const MISMATCH_REVEAL_DELAY_MS = 1100;

/**
 * Canonical player colour theme for Multiplayer Memory Match.
 * Derived deterministically from the player's slot index (0..3) in the room.
 */
export interface MemoryPlayerColorTheme {
  playerNumber: 1 | 2 | 3 | 4;
  label: 'P1' | 'P2' | 'P3' | 'P4';
  name: 'Blue' | 'Red' | 'Green' | 'Purple';
  hex: '#3B82F6' | '#EF4444' | '#22C55E' | '#A855F7';
  glowRgba: string;
  tintRgba: string;
  badgeBgRgba: string;
}

/**
 * Fixed player colour assignments:
 * - Player 1 (Host): Blue #3B82F6
 * - Player 2: Red #EF4444
 * - Player 3: Green #22C55E
 * - Player 4: Purple #A855F7
 */
export const MEMORY_PLAYER_COLOR_PALETTE: ReadonlyArray<MemoryPlayerColorTheme> = [
  {
    playerNumber: 1,
    label: 'P1',
    name: 'Blue',
    hex: '#3B82F6',
    glowRgba: 'rgba(59, 130, 246, 0.38)',
    tintRgba: 'rgba(59, 130, 246, 0.16)',
    badgeBgRgba: 'rgba(59, 130, 246, 0.22)',
  },
  {
    playerNumber: 2,
    label: 'P2',
    name: 'Red',
    hex: '#EF4444',
    glowRgba: 'rgba(239, 68, 68, 0.38)',
    tintRgba: 'rgba(239, 68, 68, 0.16)',
    badgeBgRgba: 'rgba(239, 68, 68, 0.22)',
  },
  {
    playerNumber: 3,
    label: 'P3',
    name: 'Green',
    hex: '#22C55E',
    glowRgba: 'rgba(34, 197, 94, 0.38)',
    tintRgba: 'rgba(34, 197, 94, 0.16)',
    badgeBgRgba: 'rgba(34, 197, 94, 0.22)',
  },
  {
    playerNumber: 4,
    label: 'P4',
    name: 'Purple',
    hex: '#A855F7',
    glowRgba: 'rgba(168, 85, 247, 0.38)',
    tintRgba: 'rgba(168, 85, 247, 0.16)',
    badgeBgRgba: 'rgba(168, 85, 247, 0.22)',
  },
] as const;

/**
 * Resolves a player's assigned colour theme deterministically from their position
 * in the room's ordered player list (`turnOrderUids` / `playerOrder`).
 */
export function getMemoryPlayerColor(
  playerUid: string | null | undefined,
  orderedPlayerUids: ReadonlyArray<string>
): MemoryPlayerColorTheme | null {
  if (!playerUid) {
    return null;
  }
  const index = orderedPlayerUids.indexOf(playerUid);
  if (index < 0 || index >= MEMORY_PLAYER_COLOR_PALETTE.length) {
    return null;
  }
  return MEMORY_PLAYER_COLOR_PALETTE[index];
}

/**
 * Resolves the colour theme for a card based on its `isMatched` flag and `matchedByUid`.
 * Unmatched cards and cards temporarily revealed during a turn/mismatch always return `null`.
 */
export function getMatchedCardOwnerColor(
  card: Pick<MultiplayerMemoryCard, 'isMatched' | 'matchedByUid'> & { pairKey?: string },
  orderedPlayerUids: ReadonlyArray<string>,
  matchedByPairKey?: Readonly<Record<string, string>>
): MemoryPlayerColorTheme | null {
  if (!card.isMatched) {
    return null;
  }
  const ownerUid =
    (card.pairKey && matchedByPairKey ? matchedByPairKey[card.pairKey] : undefined) ??
    card.matchedByUid;
  if (!ownerUid) {
    return null;
  }
  return getMemoryPlayerColor(ownerUid, orderedPlayerUids);
}

const SERIES_VARIANTS: ReadonlyArray<{
  seriesIndex: number;
  badgeLabel?: string;
  colorOverride?: Record<string, string>;
}> = [
  {
    seriesIndex: 1,
    badgeLabel: undefined,
  },
  {
    seriesIndex: 2,
    badgeLabel: 'II',
    colorOverride: {
      heart: '#FF9E80',
      gem: '#64FFDA',
      star: '#FFE57F',
      potion: '#EA80FC',
      gamepad: '#80D8FF',
      ghost: '#FF80AB',
      key: '#CCFF90',
      bolt: '#84FFFF',
      crown: '#FFD180',
      shield: '#B9F6CA',
    },
  },
  {
    seriesIndex: 3,
    badgeLabel: 'III',
    colorOverride: {
      heart: '#FF5252',
      gem: '#1DE9B6',
      star: '#FFD740',
      potion: '#D500F9',
      gamepad: '#00E5FF',
      ghost: '#FF4081',
      key: '#AEEA00',
      bolt: '#00B0FF',
      crown: '#FFAB40',
      shield: '#69F0AE',
    },
  },
];

/**
 * Generates and shuffles the shared multiplayer Memory Match board for 2, 3, or 4 players:
 * - 2 players -> 20 cards (10 pairs)
 * - 3 players -> 40 cards (20 pairs)
 * - 4 players -> 60 cards (30 pairs)
 */
export function createMultiplayerMemoryDeck(
  playerCount: MemoryMultiplayerPlayerCount,
  randomFn: () => number = Math.random
): MultiplayerMemoryCard[] {
  const config = MEMORY_MULTIPLAYER_CONFIGS[playerCount];
  if (!config) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Memory Match requires 2, 3, or 4 players.'
    );
  }

  const pairTemplates: Array<{
    pairKey: string;
    symbolId: string;
    name: string;
    color: string;
    badgeLabel?: string;
  }> = [];

  for (const variant of SERIES_VARIANTS) {
    for (const sym of MEMORY_CARD_SYMBOLS) {
      if (pairTemplates.length >= config.matchingPairs) {
        break;
      }
      const useSeriesBadge = config.matchingPairs > 10 ? (variant.badgeLabel ?? 'I') : undefined;
      const color = variant.colorOverride?.[sym.symbolId] ?? sym.color;
      pairTemplates.push({
        pairKey: `${sym.symbolId}-${variant.seriesIndex}`,
        symbolId: sym.symbolId,
        name: useSeriesBadge ? `${sym.name} ${useSeriesBadge}` : sym.name,
        color,
        badgeLabel: useSeriesBadge,
      });
    }
  }

  const unshuffled: MultiplayerMemoryCard[] = [];
  let nextId = 0;

  for (const tpl of pairTemplates) {
    for (let copy = 0; copy < 2; copy++) {
      unshuffled.push({
        id: nextId++,
        pairKey: tpl.pairKey,
        symbolId: tpl.symbolId,
        name: tpl.name,
        color: tpl.color,
        ...(tpl.badgeLabel ? { badgeLabel: tpl.badgeLabel } : {}),
        isFlipped: false,
        isMatched: false,
        matchedByUid: null,
      });
    }
  }

  // Fisher-Yates shuffle
  const shuffled = unshuffled.map((card) => ({ ...card }));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  // Normalize sequential card.id to match board slot index (0..N-1) for fast lookup
  return shuffled.map((card, index) => ({
    ...card,
    id: index,
  }));
}

/**
 * Helper to select the next turn index, preferring connected players if any player disconnected.
 */
function getNextTurnCursor(
  turnOrderUids: string[],
  currentIndex: number,
  players: Record<string, RoomPlayer>,
  nowMs: number
): { nextIndex: number; nextUid: string } {
  const count = turnOrderUids.length;
  for (let offset = 1; offset <= count; offset++) {
    const candidateIndex = (currentIndex + offset) % count;
    const candidateUid = turnOrderUids[candidateIndex];
    const candidatePlayer = players[candidateUid];
    if (candidatePlayer && isPlayerEffectivelyConnected(candidatePlayer, nowMs)) {
      return { nextIndex: candidateIndex, nextUid: candidateUid };
    }
  }
  const fallbackIndex = (currentIndex + 1) % count;
  return {
    nextIndex: fallbackIndex,
    nextUid: turnOrderUids[fallbackIndex],
  };
}

/**
 * Pure state transition for the host starting a Multiplayer Memory Match game.
 */
export function applyStartMemoryMatchGame(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  nowMs?: number;
  randomFn?: () => number;
}): MultiplayerRoomDocument {
  const { room, callerUid, randomFn = Math.random } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.gameType !== 'memory-match') {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Room is not configured for Memory Match.'
    );
  }

  validateHostCanStartGame(room, callerUid, nowMs);

  const playerCount = room.maxPlayers as MemoryMultiplayerPlayerCount;
  const config = MEMORY_MULTIPLAYER_CONFIGS[playerCount];
  if (!config) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Invalid player count for Memory Match.'
    );
  }

  // Ensure all required players are connected
  for (const playerUid of room.playerOrder) {
    const p = room.players[playerUid];
    if (!p || !isPlayerEffectivelyConnected(p, nowMs)) {
      throw new MultiplayerRoomError(
        'PLAYER_DISCONNECTED',
        'All players must be connected before starting the match.'
      );
    }
  }

  const cards = createMultiplayerMemoryDeck(playerCount, randomFn);
  const turnOrderUids = [...room.playerOrder];
  const firstTurnUid = turnOrderUids[0];

  const resetPlayers: Record<string, RoomPlayer> = {};
  for (const [uidKey, player] of Object.entries(room.players)) {
    resetPlayers[uidKey] = {
      ...player,
      score: 0,
      rematchAccepted: false,
    };
  }

  const memoryMatchState: MemoryMatchMultiplayerState = {
    cards,
    totalPairs: config.matchingPairs,
    matchedPairs: 0,
    matchedByPairKey: {},
    lastMatchedPairKey: null,
    turnOrderUids,
    currentTurnIndex: 0,
    currentTurnUid: firstTurnUid,
    flippedCardIds: [],
    pendingResetAt: null,
    winnerUids: [],
    isTie: false,
  };

  return {
    ...room,
    status: 'in_progress',
    players: resetPlayers,
    currentTurnUid: firstTurnUid,
    startedAt: nowMs,
    completedAt: null,
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('in_progress', nowMs),
    memoryMatchState,
  };
}

/**
 * Resolves a pending mismatched pair by turning the two revealed cards face down
 * and passing the turn to the next player.
 */
export function applyResolveMemoryMatchMismatch(params: {
  room: MultiplayerRoomDocument;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.status !== 'in_progress' || !room.memoryMatchState) {
    return room;
  }

  const mm = room.memoryMatchState;
  if (mm.flippedCardIds.length < 2 || mm.pendingResetAt === null) {
    return room;
  }

  const flippedSet = new Set(mm.flippedCardIds);
  const nextCards = mm.cards.map((card) =>
    flippedSet.has(card.id) && !card.isMatched
      ? { ...card, isFlipped: false }
      : card
  );

  const { nextIndex, nextUid } = getNextTurnCursor(
    mm.turnOrderUids,
    mm.currentTurnIndex,
    room.players,
    nowMs
  );

  return {
    ...room,
    currentTurnUid: nextUid,
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('in_progress', nowMs),
    memoryMatchState: {
      ...mm,
      cards: nextCards,
      matchedByPairKey: mm.matchedByPairKey ?? {},
      lastMatchedPairKey: null,
      currentTurnIndex: nextIndex,
      currentTurnUid: nextUid,
      flippedCardIds: [],
      pendingResetAt: null,
    },
  };
}

/**
 * Pure validator & reducer for a player flipping a card in Multiplayer Memory Match.
 */
export function applySelectMemoryMatchCard(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  cardId: number;
  nowMs?: number;
}): {
  nextRoom: MultiplayerRoomDocument;
  turnOutcome: 'first-card' | 'match' | 'mismatch' | 'game-over';
} {
  const { callerUid, cardId } = params;
  const nowMs = params.nowMs ?? Date.now();
  let workingRoom = params.room;

  if (workingRoom.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is closed.');
  }
  if (isRoomExpired(workingRoom, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired.');
  }
  if (workingRoom.status !== 'in_progress' || !workingRoom.memoryMatchState) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Cannot select cards when the game is not in progress.'
    );
  }

  // If a previous mismatch reveal has already passed its timer, auto-resolve it first
  if (workingRoom.memoryMatchState.pendingResetAt !== null) {
    if (nowMs < workingRoom.memoryMatchState.pendingResetAt) {
      throw new MultiplayerRoomError(
        'INVALID_MOVE',
        'Wait for the revealed cards to turn face down.'
      );
    }
    workingRoom = applyResolveMemoryMatchMismatch({ room: workingRoom, nowMs });
  }

  const caller = workingRoom.players[callerUid];
  if (!caller) {
    throw new MultiplayerRoomError('NOT_YOUR_TURN', 'You are not a player in this room.');
  }
  if (!isPlayerEffectivelyConnected(caller, nowMs)) {
    throw new MultiplayerRoomError(
      'PLAYER_DISCONNECTED',
      'You appear to be disconnected. Reconnect before making a move.'
    );
  }

  const mm = workingRoom.memoryMatchState!;
  if (workingRoom.currentTurnUid !== callerUid || mm.currentTurnUid !== callerUid) {
    throw new MultiplayerRoomError('NOT_YOUR_TURN', 'Wait for your turn to select a card.');
  }

  if (mm.flippedCardIds.length >= 2) {
    throw new MultiplayerRoomError(
      'INVALID_MOVE',
      'You can only select two cards per turn.'
    );
  }

  const existingMatchedByPairKey = mm.matchedByPairKey ?? {};

  const targetCard = mm.cards.find((c) => c.id === cardId);
  if (!targetCard) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'Invalid card selection.');
  }
  if (
    targetCard.isMatched ||
    targetCard.matchedByUid !== null ||
    Boolean(existingMatchedByPairKey[targetCard.pairKey])
  ) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'That card has already been matched.');
  }
  if (targetCard.isFlipped || mm.flippedCardIds.includes(cardId)) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'That card is already face up.');
  }

  // First card of the turn
  if (mm.flippedCardIds.length === 0) {
    const nextCards = mm.cards.map((c) =>
      c.id === cardId && !c.isMatched
        ? { ...c, isFlipped: true, matchedByUid: null }
        : c
    );

    return {
      turnOutcome: 'first-card',
      nextRoom: {
        ...workingRoom,
        players: {
          ...workingRoom.players,
          [callerUid]: {
            ...caller,
            lastSeenAt: nowMs,
            connectionStatus: 'connected',
          },
        },
        lastActivityAt: nowMs,
        expiresAt: computeRoomExpiresAt('in_progress', nowMs),
        memoryMatchState: {
          ...mm,
          cards: nextCards,
          matchedByPairKey: existingMatchedByPairKey,
          lastMatchedPairKey: null,
          flippedCardIds: [cardId],
          pendingResetAt: null,
        },
      },
    };
  }

  // Second card of the turn
  const firstCardId = mm.flippedCardIds[0];
  const firstCard = mm.cards.find((c) => c.id === firstCardId);
  if (
    !firstCard ||
    firstCard.isMatched ||
    firstCard.matchedByUid !== null ||
    Boolean(existingMatchedByPairKey[firstCard.pairKey])
  ) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'First selected card was not found.');
  }

  const isMatch =
    firstCard.pairKey === targetCard.pairKey && firstCard.id !== targetCard.id;

  if (isMatch) {
    const nextCards = mm.cards.map((c) =>
      (c.id === firstCardId || c.id === cardId) && !c.isMatched
        ? {
            ...c,
            isFlipped: true,
            isMatched: true,
            matchedByUid: c.matchedByUid ?? callerUid,
          }
        : c
    );
    const nextMatchedPairs = mm.matchedPairs + 1;
    const nextMatchedByPairKey: Record<string, string> = {
      ...existingMatchedByPairKey,
      [firstCard.pairKey]: existingMatchedByPairKey[firstCard.pairKey] ?? callerUid,
    };
    const updatedPlayers: Record<string, RoomPlayer> = {
      ...workingRoom.players,
      [callerUid]: {
        ...caller,
        score: caller.score + 1,
        lastSeenAt: nowMs,
        connectionStatus: 'connected',
      },
    };

    // Check if all pairs on the board have been found
    if (nextMatchedPairs >= mm.totalPairs) {
      let highestScore = -1;
      for (const pUid of mm.turnOrderUids) {
        const s = updatedPlayers[pUid]?.score ?? 0;
        if (s > highestScore) {
          highestScore = s;
        }
      }

      const winnerUids = mm.turnOrderUids.filter(
        (pUid) => (updatedPlayers[pUid]?.score ?? 0) === highestScore
      );
      const isTie = winnerUids.length > 1;

      return {
        turnOutcome: 'game-over',
        nextRoom: {
          ...workingRoom,
          status: 'completed',
          players: updatedPlayers,
          currentTurnUid: null,
          completedAt: nowMs,
          lastActivityAt: nowMs,
          expiresAt: computeRoomExpiresAt('completed', nowMs),
          memoryMatchState: {
            ...mm,
            cards: nextCards,
            matchedPairs: nextMatchedPairs,
            matchedByPairKey: nextMatchedByPairKey,
            lastMatchedPairKey: firstCard.pairKey,
            flippedCardIds: [],
            pendingResetAt: null,
            winnerUids,
            isTie,
          },
        },
      };
    }

    // Player who found a match receives another turn
    return {
      turnOutcome: 'match',
      nextRoom: {
        ...workingRoom,
        players: updatedPlayers,
        currentTurnUid: callerUid,
        lastActivityAt: nowMs,
        expiresAt: computeRoomExpiresAt('in_progress', nowMs),
        memoryMatchState: {
          ...mm,
          cards: nextCards,
          matchedPairs: nextMatchedPairs,
          matchedByPairKey: nextMatchedByPairKey,
          lastMatchedPairKey: firstCard.pairKey,
          flippedCardIds: [],
          pendingResetAt: null,
        },
      },
    };
  }

  // Mismatch: reveal both cards to all players briefly before turning face down
  const nextCards = mm.cards.map((c) =>
    c.id === cardId && !c.isMatched
      ? { ...c, isFlipped: true, matchedByUid: null }
      : c
  );

  return {
    turnOutcome: 'mismatch',
    nextRoom: {
      ...workingRoom,
      players: {
        ...workingRoom.players,
        [callerUid]: {
          ...caller,
          lastSeenAt: nowMs,
          connectionStatus: 'connected',
        },
      },
      lastActivityAt: nowMs,
      expiresAt: computeRoomExpiresAt('in_progress', nowMs),
      memoryMatchState: {
        ...mm,
        cards: nextCards,
        matchedByPairKey: existingMatchedByPairKey,
        lastMatchedPairKey: null,
        flippedCardIds: [firstCardId, cardId],
        pendingResetAt: nowMs + MISMATCH_REVEAL_DELAY_MS,
      },
    },
  };
}

/**
 * Firestore transaction: Host starts the Multiplayer Memory Match game.
 */
export async function startMemoryMatchMultiplayerGame(
  roomCode: string
): Promise<MultiplayerRoomDocument> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const user = await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      throw new MultiplayerRoomError('ROOM_NOT_FOUND', 'Room no longer exists.');
    }

    const nextRoom = applyStartMemoryMatchGame({
      room: snap.data(),
      callerUid: user.uid,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        players: nextRoom.players,
        currentTurnUid: nextRoom.currentTurnUid,
        startedAt: nextRoom.startedAt,
        completedAt: nextRoom.completedAt,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
        memoryMatchState: nextRoom.memoryMatchState,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return nextRoom;
  });
}

/**
 * Firestore transaction: Active turn player selects a card on the shared Memory Match board.
 */
export async function selectMemoryMatchMultiplayerCard(
  roomCode: string,
  cardId: number
): Promise<{
  room: MultiplayerRoomDocument;
  turnOutcome: 'first-card' | 'match' | 'mismatch' | 'game-over';
}> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const user = await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      throw new MultiplayerRoomError('ROOM_NOT_FOUND', 'Room no longer exists.');
    }

    const { nextRoom, turnOutcome } = applySelectMemoryMatchCard({
      room: snap.data(),
      callerUid: user.uid,
      cardId,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        players: nextRoom.players,
        currentTurnUid: nextRoom.currentTurnUid,
        completedAt: nextRoom.completedAt,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
        memoryMatchState: nextRoom.memoryMatchState,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return { room: nextRoom, turnOutcome };
  });
}

/**
 * Firestore transaction: Turns a mismatched pair face down and advances the turn.
 */
export async function resolveMemoryMatchMultiplayerMismatch(
  roomCode: string
): Promise<MultiplayerRoomDocument | null> {
  const normalizedCode = normalizeRoomCode(roomCode);
  await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      return null;
    }

    const currentRoom = snap.data();
    const mm = currentRoom.memoryMatchState;
    if (!mm || mm.pendingResetAt === null) {
      return currentRoom;
    }

    const nextRoom = applyResolveMemoryMatchMismatch({
      room: currentRoom,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        currentTurnUid: nextRoom.currentTurnUid,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
        memoryMatchState: nextRoom.memoryMatchState,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return nextRoom;
  });
}

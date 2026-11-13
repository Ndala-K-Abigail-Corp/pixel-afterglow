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
  getMinimumPlayersToStart,
  computeRoomExpiresAt,
  isRoomExpired,
} from '../types/multiplayer';
import { MEMORY_CARD_SYMBOLS, type CardSymbolDefinition } from './memoryMatch';
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
 * Derived deterministically from the player's slot index (0..7) in the room.
 */
export interface MemoryPlayerColorTheme {
  playerNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  label: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';
  name: 'Blue' | 'Red' | 'Green' | 'Purple' | 'Orange' | 'Pink' | 'Yellow' | 'Cyan';
  hex:
    | '#3B82F6'
    | '#EF4444'
    | '#22C55E'
    | '#A855F7'
    | '#F97316'
    | '#EC4899'
    | '#EAB308'
    | '#06B6D4';
  glowRgba: string;
  tintRgba: string;
  badgeBgRgba: string;
}

/**
 * Fixed player colour assignments for up to 8 players:
 * - Player 1 (Host): Blue #3B82F6
 * - Player 2: Red #EF4444
 * - Player 3: Green #22C55E
 * - Player 4: Purple #A855F7
 * - Player 5: Orange #F97316
 * - Player 6: Pink #EC4899
 * - Player 7: Yellow #EAB308
 * - Player 8: Cyan #06B6D4
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
  {
    playerNumber: 5,
    label: 'P5',
    name: 'Orange',
    hex: '#F97316',
    glowRgba: 'rgba(249, 115, 22, 0.38)',
    tintRgba: 'rgba(249, 115, 22, 0.16)',
    badgeBgRgba: 'rgba(249, 115, 22, 0.22)',
  },
  {
    playerNumber: 6,
    label: 'P6',
    name: 'Pink',
    hex: '#EC4899',
    glowRgba: 'rgba(236, 72, 153, 0.38)',
    tintRgba: 'rgba(236, 72, 153, 0.16)',
    badgeBgRgba: 'rgba(236, 72, 153, 0.22)',
  },
  {
    playerNumber: 7,
    label: 'P7',
    name: 'Yellow',
    hex: '#EAB308',
    glowRgba: 'rgba(234, 179, 8, 0.38)',
    tintRgba: 'rgba(234, 179, 8, 0.16)',
    badgeBgRgba: 'rgba(234, 179, 8, 0.22)',
  },
  {
    playerNumber: 8,
    label: 'P8',
    name: 'Cyan',
    hex: '#06B6D4',
    glowRgba: 'rgba(6, 182, 212, 0.38)',
    tintRgba: 'rgba(6, 182, 212, 0.16)',
    badgeBgRgba: 'rgba(6, 182, 212, 0.22)',
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
  card: Pick<MultiplayerMemoryCard, 'isMatched' | 'matchedByUid'> & {
    pairKey?: string;
    symbolId?: string;
  },
  orderedPlayerUids: ReadonlyArray<string>,
  matchedByPairKey?: Readonly<Record<string, string>>
): MemoryPlayerColorTheme | null {
  if (!card.isMatched) {
    return null;
  }
  const lookupKey = card.symbolId ?? card.pairKey;
  const ownerUid =
    (lookupKey && matchedByPairKey ? matchedByPairKey[lookupKey] : undefined) ??
    (card.pairKey && matchedByPairKey ? matchedByPairKey[card.pairKey] : undefined) ??
    card.matchedByUid;
  if (!ownerUid) {
    return null;
  }
  return getMemoryPlayerColor(ownerUid, orderedPlayerUids);
}

/**
 * Library of 50 genuinely distinct retro pixel-art card symbols for Multiplayer Memory Match.
 * Every symbol has a unique `symbolId`, recognizable arcade object, and distinct pixel SVG design
 * in `MemorySymbolIcon.tsx`—never relying on Roman numerals, letters, or numbers.
 */
export const MULTIPLAYER_MEMORY_SYMBOLS: ReadonlyArray<CardSymbolDefinition> = [
  ...MEMORY_CARD_SYMBOLS,
  { symbolId: 'alien', name: 'Space Invader', color: '#69F0AE' },
  { symbolId: 'monster', name: 'Horned Monster', color: '#FF5252' },
  { symbolId: 'slime', name: 'Dungeon Slime', color: '#00E676' },
  { symbolId: 'robot', name: 'Cyber Robot', color: '#90A4AE' },
  { symbolId: 'rocket', name: 'Retro Rocket', color: '#FF7043' },
  { symbolId: 'ufo', name: 'Flying Saucer', color: '#18FFFF' },
  { symbolId: 'chest', name: 'Treasure Chest', color: '#FFB74D' },
  { symbolId: 'coin', name: 'Arcade Token', color: '#FFD54F' },
  { symbolId: 'crystal', name: 'Prism Crystal', color: '#E040FB' },
  { symbolId: 'joystick', name: 'Arcade Joystick', color: '#FF8A65' },
  { symbolId: 'arcade', name: 'Arcade Cabinet', color: '#7C4DFF' },
  { symbolId: 'cherry', name: 'Pixel Cherries', color: '#FF1744' },
  { symbolId: 'mushroom', name: 'Power Mushroom', color: '#FF5252' },
  { symbolId: 'pizza', name: 'Arcade Pizza', color: '#FFCA28' },
  { symbolId: 'sword', name: 'Hero Sword', color: '#80DEEA' },
  { symbolId: 'bomb', name: 'Pixel Bomb', color: '#B0BEC5' },
  { symbolId: 'skull', name: 'Dungeon Skull', color: '#FFF0D7' },
  { symbolId: 'dragon', name: 'Fire Dragon', color: '#FF6E40' },
  { symbolId: 'cat', name: 'Lucky Pixel Cat', color: '#FFAB91' },
  { symbolId: 'owl', name: 'Night Owl', color: '#BCAAA4' },
  { symbolId: 'crab', name: 'Reef Crab', color: '#FF6E40' },
  { symbolId: 'fish', name: 'Neon Fish', color: '#26C6DA' },
  { symbolId: 'moon', name: 'Crescent Moon', color: '#FFF59D' },
  { symbolId: 'sun', name: 'Solar Burst', color: '#FFAB00' },
  { symbolId: 'planet', name: 'Ringed Planet', color: '#CE93D8' },
  { symbolId: 'comet', name: 'Blazing Comet', color: '#40C4FF' },
  { symbolId: 'wand', name: 'Star Wand', color: '#F48FB1' },
  { symbolId: 'scroll', name: 'Spell Scroll', color: '#FFE082' },
  { symbolId: 'hourglass', name: 'Time Hourglass', color: '#80CBC4' },
  { symbolId: 'cauldron', name: 'Witch Cauldron', color: '#9575CD' },
  { symbolId: 'trophy', name: 'High-Score Trophy', color: '#FFD740' },
  { symbolId: 'cartridge', name: 'Game Cartridge', color: '#7986CB' },
  { symbolId: 'cassette', name: 'Synth Cassette', color: '#F06292' },
  { symbolId: 'apple', name: 'Golden Apple', color: '#FF5252' },
  { symbolId: 'burger', name: 'Diner Burger', color: '#FFA726' },
  { symbolId: 'icecream', name: 'Pixel Cone', color: '#F8BBD0' },
  { symbolId: 'axe', name: 'Battle Axe', color: '#90CAF9' },
  { symbolId: 'bow', name: 'Ranger Bow', color: '#A5D6A7' },
  { symbolId: 'helmet', name: 'Paladin Helmet', color: '#CFD8DC' },
  { symbolId: 'anchor', name: 'Pirate Anchor', color: '#4FC3F7' },
] as const;

export const MEMORY_SYMBOL_ICON_IDS: ReadonlyArray<string> = MULTIPLAYER_MEMORY_SYMBOLS.map(
  (s) => s.symbolId
);

/**
 * Generates and shuffles the shared multiplayer Memory Match board for 2 to 8 players:
 * - 2 players -> 20 cards (10 unique pairs)
 * - 3 players -> 40 cards (20 unique pairs)
 * - 4 players -> 60 cards (30 unique pairs)
 * - 5 players -> 100 cards (50 unique pairs)
 * - 6 players -> 100 cards (50 unique pairs)
 * - 7 players -> 100 cards (50 unique pairs)
 * - 8 players -> 100 cards (50 unique pairs)
 */
export function createMultiplayerMemoryDeck(
  playerCount: MemoryMultiplayerPlayerCount,
  randomFn: () => number = Math.random
): MultiplayerMemoryCard[] {
  const config = MEMORY_MULTIPLAYER_CONFIGS[playerCount];
  if (!config) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Memory Match requires 2 to 8 players.'
    );
  }

  const selectedSymbols = MULTIPLAYER_MEMORY_SYMBOLS.slice(0, config.matchingPairs);

  const unshuffled: MultiplayerMemoryCard[] = [];
  let nextId = 0;

  for (const sym of selectedSymbols) {
    for (let copy = 0; copy < 2; copy++) {
      unshuffled.push({
        id: nextId++,
        pairKey: sym.symbolId,
        symbolId: sym.symbolId,
        name: sym.name,
        color: sym.color,
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

  const maxCapacity = room.maxPlayers as MemoryMultiplayerPlayerCount;
  if (!MEMORY_MULTIPLAYER_CONFIGS[maxCapacity]) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Invalid player capacity for Memory Match.'
    );
  }

  validateHostCanStartGame(room, callerUid, nowMs);

  // Ensure all joined players are connected
  for (const playerUid of room.playerOrder) {
    const p = room.players[playerUid];
    if (!p || !isPlayerEffectivelyConnected(p, nowMs)) {
      throw new MultiplayerRoomError(
        'PLAYER_DISCONNECTED',
        'All players must be connected before starting the match.'
      );
    }
  }

  // Use the actual participating player count (not necessarily the maximum room capacity)
  const turnOrderUids = [...room.playerOrder];
  const participatingPlayerCount = turnOrderUids.length as MemoryMultiplayerPlayerCount;
  const config = MEMORY_MULTIPLAYER_CONFIGS[participatingPlayerCount];
  if (!config) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Invalid participating player count for Memory Match.'
    );
  }

  const cards = createMultiplayerMemoryDeck(participatingPlayerCount, randomFn);
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
    roundNumber: 1,
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
 * If `expectedRoundNumber` is provided and does not match the room's current round,
 * returns the room unchanged so stale timers from a previous round never affect a new round.
 */
export function applyResolveMemoryMatchMismatch(params: {
  room: MultiplayerRoomDocument;
  expectedRoundNumber?: number;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room, expectedRoundNumber } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.status !== 'in_progress' || !room.memoryMatchState) {
    return room;
  }

  const mm = room.memoryMatchState;
  const currentRound = mm.roundNumber ?? 1;
  if (expectedRoundNumber !== undefined && currentRound !== expectedRoundNumber) {
    return room;
  }

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
 *
 * Security & Architectural Note (Client-Side Match Evaluation):
 * Match evaluation (`firstCard.pairKey === targetCard.pairKey`) runs inside an atomic client-side
 * Firestore transaction and is bounded by `firestore.rules` (`isValidMemoryMatchTurnMove` /
 * `isValidMemoryMatchPairOwnershipDiff`), which enforce turn ownership, cap `matchedPairs` and
 * caller `score` increments to at most `+1` per turn, and guarantee immutability of existing
 * `matchedByPairKey` ownership entries. Because Firestore Security Rules cannot iterate over the
 * 20–100 card array to independently compare hidden `pairKey` values, a modified client acting on
 * its own turn could theoretically submit a synthetic match (`pairDelta == 1`). Eliminating this
 * client-trust surface in a future competitive mode would require server-side match resolution
 * (e.g. Cloud Functions for Firebase reading card symbols from a restricted server-only document).
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
  const targetPairKey = targetCard.symbolId || targetCard.pairKey;
  if (
    targetCard.isMatched ||
    targetCard.matchedByUid !== null ||
    Boolean(existingMatchedByPairKey[targetPairKey]) ||
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
  const firstPairKey = firstCard ? (firstCard.symbolId || firstCard.pairKey) : '';
  if (
    !firstCard ||
    firstCard.isMatched ||
    firstCard.matchedByUid !== null ||
    Boolean(existingMatchedByPairKey[firstPairKey]) ||
    Boolean(existingMatchedByPairKey[firstCard.pairKey])
  ) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'First selected card was not found.');
  }

  const isMatch =
    firstCard.symbolId === targetCard.symbolId && firstCard.id !== targetCard.id;

  if (isMatch) {
    const matchedKey = firstCard.symbolId || firstCard.pairKey;
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
      [matchedKey]: existingMatchedByPairKey[matchedKey] ?? callerUid,
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
            lastMatchedPairKey: matchedKey,
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
          lastMatchedPairKey: matchedKey,
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
 * Host-only transition that immediately starts a brand new Memory Match round in the same room
 * without requiring other players to confirm readiness.
 * Re-uses the room code, host, membership and player order, builds a fresh shuffled board,
 * resets scores, ownership, turn, mismatch timers, and results, and increments the round.
 */
export function applyStartMemoryMatchRematch(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  nowMs?: number;
  randomFn?: () => number;
}): MultiplayerRoomDocument {
  const { room, callerUid, randomFn = Math.random } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.gameType !== 'memory-match') {
    throw new MultiplayerRoomError('INVALID_STATE_TRANSITION', 'Room is not configured for Memory Match.');
  }
  if (room.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is closed.');
  }
  if (isRoomExpired(room, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired.');
  }
  if (room.hostUid !== callerUid) {
    throw new MultiplayerRoomError('NOT_HOST', 'Only the room host can start the next round.');
  }
  if (room.status !== 'completed' || !room.memoryMatchState) {
    // Also guards against two concurrent starts: the second sees an in-progress room.
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'The next round can only be started from a completed game.'
    );
  }

  const maxCapacity = room.maxPlayers as MemoryMultiplayerPlayerCount;
  if (!MEMORY_MULTIPLAYER_CONFIGS[maxCapacity]) {
    throw new MultiplayerRoomError('INVALID_STATE_TRANSITION', 'Invalid player capacity for Memory Match.');
  }

  const minPlayers = getMinimumPlayersToStart(room.maxPlayers, room.gameType);
  const turnOrderUids = [...room.playerOrder];
  if (turnOrderUids.length < minPlayers) {
    throw new MultiplayerRoomError(
      'NOT_ENOUGH_PLAYERS',
      `At least ${minPlayers} players are required to start the next round.`
    );
  }

  const participatingPlayerCount = turnOrderUids.length as MemoryMultiplayerPlayerCount;
  const config = MEMORY_MULTIPLAYER_CONFIGS[participatingPlayerCount];
  if (!config) {
    throw new MultiplayerRoomError('INVALID_STATE_TRANSITION', 'Invalid player count for Memory Match.');
  }

  const firstTurnUid = turnOrderUids[0];

  const resetPlayers: Record<string, RoomPlayer> = {};
  for (const [uidKey, player] of Object.entries(room.players)) {
    resetPlayers[uidKey] = {
      ...player,
      score: 0,
      rematchAccepted: false,
      ...(uidKey === callerUid ? { lastSeenAt: nowMs, connectionStatus: 'connected' as const } : {}),
    };
  }

  const memoryMatchState: MemoryMatchMultiplayerState = {
    cards: createMultiplayerMemoryDeck(participatingPlayerCount, randomFn),
    totalPairs: config.matchingPairs,
    matchedPairs: 0,
    roundNumber: (room.memoryMatchState.roundNumber ?? 1) + 1,
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
 * Firestore transaction: the host starts the next round once everyone connected is ready.
 */
export async function startMemoryMatchRematch(
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

    const nextRoom = applyStartMemoryMatchRematch({
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
  roomCode: string,
  expectedRoundNumber?: number
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

    const currentRound = mm.roundNumber ?? 1;
    if (expectedRoundNumber !== undefined && currentRound !== expectedRoundNumber) {
      return currentRoom;
    }

    const nextRoom = applyResolveMemoryMatchMismatch({
      room: currentRoom,
      expectedRoundNumber,
      nowMs: Date.now(),
    });

    if (nextRoom === currentRoom) {
      return currentRoom;
    }

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

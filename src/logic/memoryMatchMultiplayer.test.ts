// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
  applyUpdateMemoryRoomSettings,
  shouldAcceptIncomingRoomState,
} from './multiplayerRoom';
import {
  MemoryMatchBoardStateSchema,
  MemoryRoomSettingsSchema,
} from '../schemas/multiplayerSchemas';
import {
  createMultiplayerMemoryDeck,
  applyStartMemoryMatchGame,
  applySelectMemoryMatchCard,
  applyResolveMemoryMatchMismatch,
  applyStartMemoryMatchRematch,
  MEMORY_PLAYER_COLOR_PALETTE,
  MULTIPLAYER_MEMORY_SYMBOLS,
  MEMORY_SYMBOL_ICON_IDS,
  getMemoryPlayerColor,
  getMatchedCardOwnerColor,
} from './memoryMatchMultiplayer';
import { MemorySymbolIcon } from '../components/game/MemorySymbolIcon';
import {
  MEMORY_VALID_CARD_COUNTS,
  resetLargeBoardNoticeAcknowledgement,
  type MemoryMultiplayerPlayerCount,
  type MultiplayerRoomDocument,
} from '../types/multiplayer';

const mockUseMultiplayerRoom = vi.fn();

vi.mock('../hooks/useMultiplayerRoom', () => ({
  useMultiplayerRoom: (...args: unknown[]) => mockUseMultiplayerRoom(...args),
}));

vi.mock('../hooks/useRoomSocial', () => ({
  useRoomSocial: () => ({
    activeReactions: [],
    messages: [],
    isLoadingChat: false,
    isSendingMessage: false,
    socialError: null,
    clearSocialError: vi.fn(),
    sendReaction: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn(),
  }),
}));

vi.mock('../context/AudioContext', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => children,
  useAudio: () => ({
    isMuted: false,
    toggleMute: vi.fn(),
    playFlip: vi.fn(),
    playMatch: vi.fn(),
    playMismatch: vi.fn(),
    playWin: vi.fn(),
    playDraw: vi.fn(),
    playReset: vi.fn(),
    playClick: vi.fn(),
    playMove: vi.fn(),
  }),
}));

import { MemoryMatchMultiplayerView } from '../components/game/MemoryMatchMultiplayerView';
import App from '../App';
import { MULTIPLAYER_USER_MESSAGES } from '../utils/multiplayerErrors';

describe('Phase 4 – Multiplayer Memory Match Logic', () => {
  const BASE_NOW = 1_700_000_000_000;

  function createReadyMemoryRoom(
    playerCount: MemoryMultiplayerPlayerCount,
    cardCount: number = playerCount <= 2 ? 20 : playerCount === 3 ? 40 : playerCount === 4 ? 60 : 100
  ) {
    let room = buildInitialRoomDocument({
      roomCode: 'MEM123',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      memorySettings: { cardCount, minPlayers: 2, maxPlayers: playerCount },
      nowMs: BASE_NOW,
    });

    for (let i = 2; i <= playerCount; i++) {
      room = applyPlayerJoinOrReconnect({
        room,
        uid: `p${i}`,
        nickname: `Player${i}`,
        nowMs: BASE_NOW + i * 100,
      });
    }
    return room;
  }

  it('creates valid decks for every even card count from 10 to 100 and rejects odd or out-of-range counts', () => {
    expect(MEMORY_VALID_CARD_COUNTS).toHaveLength(46);

    for (const cardCount of MEMORY_VALID_CARD_COUNTS) {
      const expectedPairs = cardCount / 2;
      const deck = createMultiplayerMemoryDeck(cardCount);
      expect(deck).toHaveLength(cardCount);

      const symbolCounts = new Map<string, number>();
      const cardIds = new Set<number>();

      for (const card of deck) {
        expect(card.badgeLabel).toBeUndefined();
        expect(card.name).not.toMatch(/\b(I|II|III)\b$/);
        expect(card.pairKey).toBe(card.symbolId);
        cardIds.add(card.id);
        symbolCounts.set(card.symbolId, (symbolCounts.get(card.symbolId) ?? 0) + 1);
      }

      // Every card has a unique cardId (0..N-1) and every symbolId appears on exactly 2 cards
      expect(cardIds.size).toBe(cardCount);
      expect(symbolCounts.size).toBe(expectedPairs);
      for (const count of symbolCounts.values()) {
        expect(count).toBe(2);
      }
    }

    // Reject odd counts, < 10, > 100, and non-integers
    for (const invalidCount of [-4, 0, 8, 9, 11, 15, 51, 99, 101, 102, 20.5]) {
      expect(() => createMultiplayerMemoryDeck(invalidCount)).toThrow(/even integer between 10 and 100/i);
    }
  });

  it('provides 50 genuinely distinct pixel-art symbols where every symbolId renders a unique SVG icon', () => {
    expect(MULTIPLAYER_MEMORY_SYMBOLS).toHaveLength(50);
    expect(MEMORY_SYMBOL_ICON_IDS).toHaveLength(50);

    const symbolIds = new Set<string>();
    const symbolNames = new Set<string>();
    const svgSignatures = new Set<string>();

    for (const sym of MULTIPLAYER_MEMORY_SYMBOLS) {
      expect(symbolIds.has(sym.symbolId)).toBe(false);
      expect(symbolNames.has(sym.name)).toBe(false);
      symbolIds.add(sym.symbolId);
      symbolNames.add(sym.name);

      const { container, unmount } = render(
        React.createElement(MemorySymbolIcon, {
          symbolId: sym.symbolId,
          color: sym.color,
        })
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const innerPaths = svg!.innerHTML;
      expect(svgSignatures.has(innerPaths)).toBe(false);
      svgSignatures.add(innerPaths);
      unmount();
    }
  });

  it('allows up to 8 players to join an 8-player room and prevents a 9th player from joining', () => {
    const room8P = createReadyMemoryRoom(8);
    expect(room8P.playerOrder).toHaveLength(8);
    expect(Object.keys(room8P.players)).toHaveLength(8);

    expect(() =>
      applyPlayerJoinOrReconnect({
        room: room8P,
        uid: 'p9',
        nickname: 'Player9',
        nowMs: BASE_NOW + 900,
      })
    ).toThrow(/This room is full\. Try joining another room\./i);
  });

  it.each([
    // Two players can play a 100-card game (board size completely independent of player count)
    { cardCount: 100, minPlayers: 2, maxPlayers: 2, joined: 2, canStart: true },
    { cardCount: 100, minPlayers: 2, maxPlayers: 8, joined: 2, canStart: true },
    // Eight players can play a 10-card game
    { cardCount: 10, minPlayers: 2, maxPlayers: 8, joined: 8, canStart: true },
    // Host-configured minimum players enforced accurately
    { cardCount: 40, minPlayers: 3, maxPlayers: 8, joined: 2, canStart: false },
    { cardCount: 40, minPlayers: 3, maxPlayers: 8, joined: 3, canStart: true },
    { cardCount: 64, minPlayers: 4, maxPlayers: 6, joined: 3, canStart: false },
    { cardCount: 64, minPlayers: 4, maxPlayers: 6, joined: 4, canStart: true },
    { cardCount: 20, minPlayers: 2, maxPlayers: 4, joined: 1, canStart: false },
  ])(
    'decouples card count ($cardCount) from player limits (min $minPlayers, max $maxPlayers, joined $joined -> canStart: $canStart)',
    ({ cardCount, minPlayers, maxPlayers, joined, canStart }) => {
      let room = buildInitialRoomDocument({
        roomCode: 'FLX123',
        gameType: 'memory-match',
        hostUid: 'p1',
        hostNickname: 'Player1',
        memorySettings: { cardCount, minPlayers, maxPlayers },
        nowMs: BASE_NOW,
      });

      for (let i = 2; i <= joined; i++) {
        room = applyPlayerJoinOrReconnect({
          room,
          uid: `p${i}`,
          nickname: `Player${i}`,
          nowMs: BASE_NOW + i * 100,
        });
      }

      if (!canStart) {
        expect(() =>
          applyStartMemoryMatchGame({
            room,
            callerUid: 'p1',
            nowMs: BASE_NOW + 1000,
          })
        ).toThrow(/Waiting for players/i);
        return;
      }

      const started = applyStartMemoryMatchGame({
        room,
        callerUid: 'p1',
        nowMs: BASE_NOW + 1000,
        randomFn: () => 0.5,
      });

      expect(started.status).toBe('in_progress');
      expect(started.maxPlayers).toBe(maxPlayers);
      expect(started.playerOrder).toHaveLength(joined);
      expect(started.memoryMatchState?.turnOrderUids).toEqual(started.playerOrder);
      expect(started.memoryMatchState?.cards).toHaveLength(cardCount);
      expect(started.memoryMatchState?.totalPairs).toBe(cardCount / 2);
      expect(started.memoryMatchState?.matchSettings).toEqual({
        cardCount,
        minPlayers,
        maxPlayers,
      });
      expect(started.currentTurnUid).toBe('p1');

      // New players cannot join once the game starts even if capacity had open slots
      expect(() =>
        applyPlayerJoinOrReconnect({
          room: started,
          uid: 'late-guest',
          nickname: 'LateGuest',
          nowMs: BASE_NOW + 1500,
        })
      ).toThrow(/already started/i);
    }
  );

  it('displays waiting room readiness status, host-editable settings, and enables Start Match once configured minimum is reached', () => {
    const liveNow = Date.now();
    let room = buildInitialRoomDocument({
      roomCode: 'WTR888',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      memorySettings: { cardCount: 40, minPlayers: 3, maxPlayers: 8 },
      nowMs: liveNow,
    });
    room = applyPlayerJoinOrReconnect({
      room,
      uid: 'p2',
      nickname: 'Player2',
      nowMs: liveNow + 100,
    });

    // 1. With 2 of 8 joined (< configured minimum 3), Start Match is disabled and waiting message is shown
    mockUseMultiplayerRoom.mockReturnValue({
      room,
      uid: 'p1',
      isHost: true,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'Player1',
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      updateRoomSettings: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const view2Of8 = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );
    expect(screen.getByTestId('waiting-room-player-count').textContent).toContain(
      '2 of 8 players joined'
    );
    expect(screen.getByTestId('waiting-room-capacity-info').textContent).toContain(
      'Max 8P · Min 3P Required'
    );
    expect(screen.getByTestId('waiting-room-status-banner').textContent).toContain(
      '2 of 8 players joined – Waiting for 1 more player (minimum 3 required)'
    );
    expect(
      (screen.getByTestId('host-start-game-btn') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      screen.getByTestId('memory-room-settings-panel').getAttribute('data-editable')
    ).toBe('true');
    view2Of8.unmount();

    // 2. When 3rd player joins (3 of 8), Start Match becomes enabled and guests see read-only settings
    const room3Of8 = applyPlayerJoinOrReconnect({
      room,
      uid: 'p3',
      nickname: 'Player3',
      nowMs: liveNow + 200,
    });
    mockUseMultiplayerRoom.mockReturnValue({
      room: room3Of8,
      uid: 'p1',
      isHost: true,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'Player1',
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      updateRoomSettings: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const view3Of8 = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );
    expect(screen.getByTestId('waiting-room-status-banner').textContent).toContain(
      '3 of 8 players joined – Ready to start!'
    );
    const startBtn = screen.getByTestId('host-start-game-btn') as HTMLButtonElement;
    expect(startBtn.disabled).toBe(false);
    expect(startBtn.textContent).toContain('Start Match');
    view3Of8.unmount();

    // 3. Guest sees read-only settings synced in real time
    mockUseMultiplayerRoom.mockReturnValue({
      room: room3Of8,
      uid: 'p2',
      isHost: false,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'Player2',
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      updateRoomSettings: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });
    const guestView = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );
    expect(
      screen.getByTestId('memory-room-settings-panel').getAttribute('data-editable')
    ).toBe('false');
    expect(screen.getByTestId('settings-card-count-display').textContent).toContain('40 Cards');
    guestView.unmount();
  });

  it('awards +1 point and an extra turn on a match, and passes turn after mismatch reveal', () => {
    // Use deterministic no-op shuffle so pair 0 is at cards[0] & cards[1], pair 1 is at cards[2] & cards[3]
    const room = applyStartMemoryMatchGame({
      room: createReadyMemoryRoom(2),
      callerUid: 'p1',
      nowMs: BASE_NOW,
      randomFn: () => 0.999999,
    });

    const cards = room.memoryMatchState!.cards;
    const firstCard = cards[0];
    const matchingCard = cards.find(
      (c) => c.pairKey === firstCard.pairKey && c.id !== firstCard.id
    )!;
    const nonMatchingCard = cards.find((c) => c.pairKey !== firstCard.pairKey)!;

    // P2 cannot select a card during P1's turn
    expect(() =>
      applySelectMemoryMatchCard({
        room,
        callerUid: 'p2',
        cardId: firstCard.id,
        nowMs: BASE_NOW + 100,
      })
    ).toThrow(/Wait for your turn/i);

    // P1 selects first card
    const step1 = applySelectMemoryMatchCard({
      room,
      callerUid: 'p1',
      cardId: firstCard.id,
      nowMs: BASE_NOW + 100,
    });
    expect(step1.turnOutcome).toBe('first-card');
    expect(step1.nextRoom.memoryMatchState?.flippedCardIds).toEqual([firstCard.id]);

    // P1 cannot select the same flipped card again
    expect(() =>
      applySelectMemoryMatchCard({
        room: step1.nextRoom,
        callerUid: 'p1',
        cardId: firstCard.id,
        nowMs: BASE_NOW + 150,
      })
    ).toThrow(/already face up/i);

    // P1 selects matching second card -> receives +1 point and keeps turn!
    const step2 = applySelectMemoryMatchCard({
      room: step1.nextRoom,
      callerUid: 'p1',
      cardId: matchingCard.id,
      nowMs: BASE_NOW + 200,
    });
    expect(step2.turnOutcome).toBe('match');
    expect(step2.nextRoom.players['p1'].score).toBe(1);
    expect(step2.nextRoom.currentTurnUid).toBe('p1');
    expect(step2.nextRoom.memoryMatchState?.matchedPairs).toBe(1);

    // Matched cards cannot be selected again
    expect(() =>
      applySelectMemoryMatchCard({
        room: step2.nextRoom,
        callerUid: 'p1',
        cardId: firstCard.id,
        nowMs: BASE_NOW + 250,
      })
    ).toThrow(/already been matched/i);

    // P1 now selects two non-matching cards on their extra turn
    const anotherCard = step2.nextRoom.memoryMatchState!.cards.find(
      (c) => !c.isMatched && c.id !== nonMatchingCard.id && c.pairKey !== nonMatchingCard.pairKey
    )!;

    const mismatchStep1 = applySelectMemoryMatchCard({
      room: step2.nextRoom,
      callerUid: 'p1',
      cardId: nonMatchingCard.id,
      nowMs: BASE_NOW + 300,
    });
    const mismatchStep2 = applySelectMemoryMatchCard({
      room: mismatchStep1.nextRoom,
      callerUid: 'p1',
      cardId: anotherCard.id,
      nowMs: BASE_NOW + 400,
    });

    expect(mismatchStep2.turnOutcome).toBe('mismatch');
    expect(mismatchStep2.nextRoom.memoryMatchState?.flippedCardIds).toEqual([
      nonMatchingCard.id,
      anotherCard.id,
    ]);
    expect(mismatchStep2.nextRoom.memoryMatchState?.pendingResetAt).not.toBeNull();

    // Selecting a 3rd card before the mismatch reveal finishes is blocked
    expect(() =>
      applySelectMemoryMatchCard({
        room: mismatchStep2.nextRoom,
        callerUid: 'p1',
        cardId: 19,
        nowMs: BASE_NOW + 500,
      })
    ).toThrow(/Wait for the revealed cards/i);

    // Resolving mismatch turns the 2 cards face down, keeps matched cards visible, and passes turn to P2
    const afterResolve = applyResolveMemoryMatchMismatch({
      room: mismatchStep2.nextRoom,
      nowMs: BASE_NOW + 2000,
    });

    expect(afterResolve.currentTurnUid).toBe('p2');
    expect(afterResolve.memoryMatchState?.flippedCardIds).toEqual([]);
    const resolvedCards = afterResolve.memoryMatchState!.cards;
    expect(resolvedCards.find((c) => c.id === nonMatchingCard.id)?.isFlipped).toBe(false);
    expect(resolvedCards.find((c) => c.id === firstCard.id)?.isMatched).toBe(true);
    expect(resolvedCards.find((c) => c.id === firstCard.id)?.isFlipped).toBe(true);
  });

  it('detects game completion, single highest-score winner, and multi-player ties', () => {
    let room = applyStartMemoryMatchGame({
      room: createReadyMemoryRoom(2),
      callerUid: 'p1',
      nowMs: BASE_NOW,
    });

    // Simulate 9 matched pairs already completed with P1: 5 points, P2: 4 points, leaving 1 final pair
    const allCards = room.memoryMatchState!.cards;
    const finalPairKey = allCards[0].pairKey;
    const finalPairCards = allCards.filter((c) => c.pairKey === finalPairKey);

    const preCompletedCards = allCards.map((c) =>
      c.pairKey === finalPairKey
        ? { ...c, isFlipped: false, isMatched: false }
        : { ...c, isFlipped: true, isMatched: true, matchedByUid: 'p1' }
    );

    room = {
      ...room,
      currentTurnUid: 'p2',
      players: {
        ...room.players,
        p1: { ...room.players['p1'], score: 5 },
        p2: { ...room.players['p2'], score: 4 },
      },
      memoryMatchState: {
        ...room.memoryMatchState!,
        cards: preCompletedCards,
        matchedPairs: 9,
        currentTurnIndex: 1,
        currentTurnUid: 'p2',
      },
    };

    // P2 finds the 10th pair -> P2 reaches 5 points, tying P1 at 5 - 5!
    const flip1 = applySelectMemoryMatchCard({
      room,
      callerUid: 'p2',
      cardId: finalPairCards[0].id,
      nowMs: BASE_NOW + 1000,
    });
    const flip2 = applySelectMemoryMatchCard({
      room: flip1.nextRoom,
      callerUid: 'p2',
      cardId: finalPairCards[1].id,
      nowMs: BASE_NOW + 1100,
    });

    expect(flip2.turnOutcome).toBe('game-over');
    expect(flip2.nextRoom.status).toBe('completed');
    expect(flip2.nextRoom.memoryMatchState?.isTie).toBe(true);
    expect(flip2.nextRoom.memoryMatchState?.winnerUids).toEqual(['p1', 'p2']);
  });

  describe('Player-owned matched card colours (2 to 8 players)', () => {
    const ALL_EIGHT_COLORS = [
      '#3B82F6',
      '#EF4444',
      '#22C55E',
      '#A855F7',
      '#F97316',
      '#EC4899',
      '#EAB308',
      '#06B6D4',
    ] as const;

    it.each([
      { playerCount: 2 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 2) },
      { playerCount: 3 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 3) },
      { playerCount: 4 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 4) },
      { playerCount: 5 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 5) },
      { playerCount: 6 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 6) },
      { playerCount: 7 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 7) },
      { playerCount: 8 as const, expectedColors: ALL_EIGHT_COLORS.slice(0, 8) },
    ])(
      'assigns deterministic colours for $playerCount players, applies identical colour to both cards in each matched pair, preserves ownership across subsequent turns & reconnects, and never colours mismatched or unmatched cards',
      ({ playerCount, expectedColors }) => {
        // Use deterministic no-op shuffle so identical pairs sit adjacent in the deck
        let room: MultiplayerRoomDocument = applyStartMemoryMatchGame({
          room: createReadyMemoryRoom(playerCount),
          callerUid: 'p1',
          nowMs: BASE_NOW,
          randomFn: () => 0.999999,
        });

        const turnOrder = room.memoryMatchState!.turnOrderUids;
        expect(turnOrder).toHaveLength(playerCount);

        // 1. Verify each player gets their exact assigned colour from position/identity
        turnOrder.forEach((uid, idx) => {
          const color = getMemoryPlayerColor(uid, turnOrder);
          expect(color).not.toBeNull();
          expect(color?.hex).toBe(expectedColors[idx]);
          expect(color?.hex).toBe(MEMORY_PLAYER_COLOR_PALETTE[idx].hex);
        });

        // Group pair card IDs by pairKey in order
        const pairMap = new Map<string, [number, number]>();
        for (const card of room.memoryMatchState!.cards) {
          const existing = pairMap.get(card.pairKey);
          if (!existing) {
            pairMap.set(card.pairKey, [card.id, -1]);
          } else {
            existing[1] = card.id;
          }
        }
        const pairs = Array.from(pairMap.values());

        // Have each player (p1 .. pN) match one pair on their turn, then miss so turn advances to the next player
        let stepTime = BASE_NOW + 1000;
        const matchedPairByPlayer = new Map<string, [number, number]>();

        for (let pIdx = 0; pIdx < playerCount; pIdx++) {
          const activeUid = `p${pIdx + 1}`;
          expect(room.currentTurnUid).toBe(activeUid);

          const [cardAId, cardBId] = pairs[pIdx];
          matchedPairByPlayer.set(activeUid, [cardAId, cardBId]);

          // First card flip: temporarily revealed card must NOT have a player colour
          const firstFlip = applySelectMemoryMatchCard({
            room,
            callerUid: activeUid,
            cardId: cardAId,
            nowMs: (stepTime += 100),
          });
          const flippedCardA = firstFlip.nextRoom.memoryMatchState!.cards.find(
            (c) => c.id === cardAId
          )!;
          expect(flippedCardA.isFlipped).toBe(true);
          expect(flippedCardA.isMatched).toBe(false);
          expect(flippedCardA.matchedByUid).toBeNull();
          expect(getMatchedCardOwnerColor(flippedCardA, turnOrder)).toBeNull();

          // Second card flip (Match!): both cards receive activeUid and resolve to identical player colour
          const secondFlip = applySelectMemoryMatchCard({
            room: firstFlip.nextRoom,
            callerUid: activeUid,
            cardId: cardBId,
            nowMs: (stepTime += 100),
          });
          expect(secondFlip.turnOutcome).toBe('match');
          room = secondFlip.nextRoom;

          const matchedCardA = room.memoryMatchState!.cards.find((c) => c.id === cardAId)!;
          const matchedCardB = room.memoryMatchState!.cards.find((c) => c.id === cardBId)!;
          expect(matchedCardA.isMatched).toBe(true);
          expect(matchedCardB.isMatched).toBe(true);
          expect(matchedCardA.matchedByUid).toBe(activeUid);
          expect(matchedCardB.matchedByUid).toBe(activeUid);

          const colorA = getMatchedCardOwnerColor(matchedCardA, turnOrder);
          const colorB = getMatchedCardOwnerColor(matchedCardB, turnOrder);
          expect(colorA?.hex).toBe(expectedColors[pIdx]);
          expect(colorB?.hex).toBe(expectedColors[pIdx]);
          expect(colorA).toEqual(colorB);

          // Now deliberately flip two mismatched cards so turn passes to next player
          const unmatchedPair1 = pairs[playerCount + pIdx];
          const unmatchedPair2 = pairs[playerCount + pIdx + 1];

          const miss1 = applySelectMemoryMatchCard({
            room,
            callerUid: activeUid,
            cardId: unmatchedPair1[0],
            nowMs: (stepTime += 100),
          });
          const miss2 = applySelectMemoryMatchCard({
            room: miss1.nextRoom,
            callerUid: activeUid,
            cardId: unmatchedPair2[0],
            nowMs: (stepTime += 100),
          });
          expect(miss2.turnOutcome).toBe('mismatch');

          // Cards temporarily revealed during a mismatch must NOT receive any player colour
          const tempRevealed1 = miss2.nextRoom.memoryMatchState!.cards.find(
            (c) => c.id === unmatchedPair1[0]
          )!;
          const tempRevealed2 = miss2.nextRoom.memoryMatchState!.cards.find(
            (c) => c.id === unmatchedPair2[0]
          )!;
          expect(tempRevealed1.isFlipped).toBe(true);
          expect(tempRevealed1.isMatched).toBe(false);
          expect(tempRevealed1.matchedByUid).toBeNull();
          expect(getMatchedCardOwnerColor(tempRevealed1, turnOrder)).toBeNull();
          expect(getMatchedCardOwnerColor(tempRevealed2, turnOrder)).toBeNull();

          room = applyResolveMemoryMatchMismatch({
            room: miss2.nextRoom,
            nowMs: (stepTime += 1500),
          });
        }

        // Verify that all previously matched pairs retained their original owner's colour after subsequent turns
        for (let pIdx = 0; pIdx < playerCount; pIdx++) {
          const ownerUid = `p${pIdx + 1}`;
          const [cardAId, cardBId] = matchedPairByPlayer.get(ownerUid)!;
          const cardA = room.memoryMatchState!.cards.find((c) => c.id === cardAId)!;
          const cardB = room.memoryMatchState!.cards.find((c) => c.id === cardBId)!;

          expect(cardA.matchedByUid).toBe(ownerUid);
          expect(cardB.matchedByUid).toBe(ownerUid);
          expect(getMatchedCardOwnerColor(cardA, turnOrder)?.hex).toBe(expectedColors[pIdx]);
          expect(getMatchedCardOwnerColor(cardB, turnOrder)?.hex).toBe(expectedColors[pIdx]);

          // Verify a later player cannot select or overwrite an already matched card
          const currentTurnUid = room.currentTurnUid!;
          expect(() =>
            applySelectMemoryMatchCard({
              room,
              callerUid: currentTurnUid,
              cardId: cardAId,
              nowMs: (stepTime += 100),
            })
          ).toThrow(/already been matched/i);
        }

        // Simulate browser refresh / reconnection for every player and verify colours & ownership persist
        for (let pIdx = 0; pIdx < playerCount; pIdx++) {
          const reconnectingUid = `p${pIdx + 1}`;
          room = applyPlayerJoinOrReconnect({
            room: {
              ...room,
              players: {
                ...room.players,
                [reconnectingUid]: {
                  ...room.players[reconnectingUid],
                  connectionStatus: 'disconnected',
                },
              },
            },
            uid: reconnectingUid,
            nowMs: (stepTime += 500),
          });
        }

        // After all players refresh/reconnect, every client reading the room state sees identical colours
        for (let pIdx = 0; pIdx < playerCount; pIdx++) {
          const ownerUid = `p${pIdx + 1}`;
          const [cardAId, cardBId] = matchedPairByPlayer.get(ownerUid)!;
          const cardA = room.memoryMatchState!.cards.find((c) => c.id === cardAId)!;
          const cardB = room.memoryMatchState!.cards.find((c) => c.id === cardBId)!;
          expect(
            getMatchedCardOwnerColor(cardA, room.memoryMatchState!.turnOrderUids)?.hex
          ).toBe(expectedColors[pIdx]);
          expect(
            getMatchedCardOwnerColor(cardB, room.memoryMatchState!.turnOrderUids)?.hex
          ).toBe(expectedColors[pIdx]);
        }
      }
    );

    it.each([2 as const, 3 as const, 4 as const, 5 as const, 6 as const, 7 as const, 8 as const])(
      'renders player score cards, colour legend, and matched card borders/tints/icons in MemoryMatchMultiplayerView for %i players',
      (playerCount) => {
        const expectedColors = ALL_EIGHT_COLORS.slice(0, playerCount);

        let room = applyStartMemoryMatchGame({
          room: createReadyMemoryRoom(playerCount),
          callerUid: 'p1',
          nowMs: BASE_NOW,
          randomFn: () => 0.999999,
        });

        // Mark one pair as matched by each player (p1..pN), and one card as temporarily flipped
        const pairKeys: string[] = [];
        for (const card of room.memoryMatchState!.cards) {
          if (!pairKeys.includes(card.pairKey)) {
            pairKeys.push(card.pairKey);
          }
        }

        const updatedCards = room.memoryMatchState!.cards.map((card) => {
          const pairIndex = pairKeys.indexOf(card.pairKey);
          if (pairIndex >= 0 && pairIndex < playerCount) {
            return {
              ...card,
              isFlipped: true,
              isMatched: true,
              matchedByUid: `p${pairIndex + 1}`,
            };
          }
          if (pairIndex === playerCount && card.id % 2 === 0) {
            // Temporarily flipped unmatched card
            return {
              ...card,
              isFlipped: true,
              isMatched: false,
              matchedByUid: null,
            };
          }
          return card;
        });

        room = {
          ...room,
          memoryMatchState: {
            ...room.memoryMatchState!,
            cards: updatedCards,
            matchedPairs: playerCount,
          },
        };

        mockUseMultiplayerRoom.mockReturnValue({
          room,
          uid: 'p1',
          isHost: true,
          isLoading: false,
          isReconnecting: false,
          error: null,
          preferredNickname: 'Player1',
          createRoom: vi.fn(),
          joinRoom: vi.fn(),
          leaveRoom: vi.fn(),
          closeRoom: vi.fn(),
          clearError: vi.fn(),
        });

        const { unmount } = render(
          React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
        );

        // Verify each player's score card uses their assigned colour (redundant colour legend removed in Phase 2)
        expect(screen.queryByTestId('mp-memory-color-legend')).toBeNull();
        expectedColors.forEach((hex, idx) => {
          const playerScoreCard = screen.getByTestId(`mp-memory-player-${idx}`);
          expect(playerScoreCard.getAttribute('data-player-color')).toBe(hex);
        });

        // Verify both cards of each player's matched pair have the player's colour and visible SVG icon
        for (let pIdx = 0; pIdx < playerCount; pIdx++) {
          const ownerUid = `p${pIdx + 1}`;
          const expectedHex = expectedColors[pIdx];
          const pairCards = updatedCards.filter((c) => c.matchedByUid === ownerUid);
          expect(pairCards).toHaveLength(2);

          for (const matchedCard of pairCards) {
            const cardBtn = screen.getByTestId(`mp-memory-card-${matchedCard.id}`);
            expect(cardBtn.getAttribute('data-matched-by')).toBe(ownerUid);
            expect(cardBtn.getAttribute('data-matched-color')).toBe(expectedHex);
            // Keep the matched card icon visible
            expect(cardBtn.querySelector('svg')).not.toBeNull();
          }
        }

        // Verify temporarily flipped unmatched cards and face-down cards do NOT get a player colour
        const unmatchedCards = updatedCards.filter((c) => !c.isMatched);
        for (const unmatched of unmatchedCards) {
          const cardBtn = screen.getByTestId(`mp-memory-card-${unmatched.id}`);
          expect(cardBtn.getAttribute('data-matched-color')).toBeNull();
          expect(cardBtn.getAttribute('data-matched-by')).toBeNull();
        }

        unmount();
      }
    );
  });
});

describe('Multiplayer Memory Match – Play Again / Rematch rounds', () => {
  const NOW = 1_700_000_000_000;

  function readyRoom(
    playerCount: MemoryMultiplayerPlayerCount,
    baseNow = NOW,
    cardCount: number = playerCount <= 2 ? 20 : playerCount === 3 ? 40 : playerCount === 4 ? 60 : 100
  ): MultiplayerRoomDocument {
    let room = buildInitialRoomDocument({
      roomCode: 'RND123',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      memorySettings: { cardCount, minPlayers: 2, maxPlayers: playerCount },
      nowMs: baseNow,
    });
    for (let i = 2; i <= playerCount; i++) {
      room = applyPlayerJoinOrReconnect({
        room,
        uid: `p${i}`,
        nickname: `Player${i}`,
        nowMs: baseNow + i * 10,
      });
    }
    return room;
  }

  /** Plays a whole round with the active player (p1) matching every pair in order. */
  function playRoundToCompletion(room: MultiplayerRoomDocument, startMs: number): MultiplayerRoomDocument {
    let current = room;
    let t = startMs;
    const cards = current.memoryMatchState!.cards;
    const seen = new Set<string>();
    for (const card of cards) {
      if (seen.has(card.pairKey)) continue;
      seen.add(card.pairKey);
      const other = cards.find((c) => c.pairKey === card.pairKey && c.id !== card.id)!;
      current = applySelectMemoryMatchCard({ room: current, callerUid: current.currentTurnUid!, cardId: card.id, nowMs: (t += 10) }).nextRoom;
      current = applySelectMemoryMatchCard({ room: current, callerUid: current.currentTurnUid!, cardId: other.id, nowMs: (t += 10) }).nextRoom;
    }
    return current;
  }

  it.each([
    { playerCount: 2 as const, cards: 20, pairs: 10 },
    { playerCount: 3 as const, cards: 40, pairs: 20 },
    { playerCount: 4 as const, cards: 60, pairs: 30 },
    { playerCount: 5 as const, cards: 100, pairs: 50 },
    { playerCount: 6 as const, cards: 100, pairs: 50 },
    { playerCount: 7 as const, cards: 100, pairs: 50 },
    { playerCount: 8 as const, cards: 100, pairs: 50 },
  ])(
    'allows the host to immediately start repeated rematch rounds without waiting for other players ($playerCount players)',
    ({ playerCount, cards, pairs }) => {
      let t = NOW + 1000;
      let room = applyStartMemoryMatchGame({
        room: readyRoom(playerCount),
        callerUid: 'p1',
        nowMs: t,
        randomFn: () => 0.5,
      });
      expect(room.memoryMatchState!.roundNumber).toBe(1);

      for (let round = 1; round <= 3; round++) {
        room = playRoundToCompletion(room, (t += 1000));
        expect(room.status).toBe('completed');
        expect(room.memoryMatchState!.matchedPairs).toBe(pairs);
        expect(room.players['p1'].score).toBe(pairs);
        expect(room.memoryMatchState!.winnerUids).toEqual(['p1']);

        const previousOrder = room.playerOrder;
        const previousBoard = room.memoryMatchState!.cards.map((c) => c.pairKey).join(',');
        const previousRound = room.memoryMatchState!.roundNumber!;

        // Non-host can never start the next round
        expect(() =>
          applyStartMemoryMatchRematch({ room, callerUid: 'p2', nowMs: t + 10 })
        ).toThrow(/Only the room host/i);

        // Host can immediately start the next round without requiring any guest readiness confirmation
        t += 2000;
        const next = applyStartMemoryMatchRematch({
          room,
          callerUid: 'p1',
          nowMs: t,
          randomFn: () => (round % 2 === 0 ? 0.5 : 0.1),
        });

        // Same room, host, membership and order; new round
        expect(next.roomCode).toBe('RND123');
        expect(next.hostUid).toBe('p1');
        expect(next.status).toBe('in_progress');
        expect(next.playerOrder).toEqual(previousOrder);
        expect(Object.keys(next.players).sort()).toEqual(Object.keys(room.players).sort());
        expect(next.memoryMatchState!.roundNumber).toBe(previousRound + 1);

        // Fresh board with correct size, reshuffled
        const nextMM = next.memoryMatchState!;
        expect(nextMM.cards).toHaveLength(cards);
        expect(nextMM.totalPairs).toBe(pairs);
        expect(nextMM.cards.map((c) => c.pairKey).join(',')).not.toBe(previousBoard);
        expect(nextMM.cards.every((c) => !c.isFlipped && !c.isMatched && c.matchedByUid === null)).toBe(true);

        // Everything else reset
        expect(nextMM.matchedPairs).toBe(0);
        expect(nextMM.matchedByPairKey).toEqual({});
        expect(nextMM.flippedCardIds).toEqual([]);
        expect(nextMM.pendingResetAt).toBeNull();
        expect(nextMM.winnerUids).toEqual([]);
        expect(nextMM.isTie).toBe(false);
        expect(next.currentTurnUid).toBe(previousOrder[0]);
        expect(nextMM.currentTurnUid).toBe(previousOrder[0]);
        for (const p of Object.values(next.players)) {
          expect(p.score).toBe(0);
          expect(p.rematchAccepted).toBe(false);
        }
        expect(next.completedAt).toBeNull();
        expect(next.expiresAt).toBeGreaterThan(room.expiresAt - 1);

        // A second (stale/concurrent) start against the new in-progress room is rejected
        expect(() =>
          applyStartMemoryMatchRematch({ room: next, callerUid: 'p1', nowMs: t + 5 })
        ).toThrow(/completed game/i);

        room = next;
      }
    }
  );

  it('displays host Play Again button immediately on completion and shows GET READY – ROUND 2! transition to all players', () => {
    const liveNow = Date.now();
    let room = applyStartMemoryMatchGame({
      room: readyRoom(3, liveNow),
      callerUid: 'p1',
      nowMs: liveNow + 100,
      randomFn: () => 0.5,
    });
    room = playRoundToCompletion(room, liveNow + 1000);
    expect(room.status).toBe('completed');

    // 1. Host sees prominent Play Again button immediately without any waiting-for-players screen
    mockUseMultiplayerRoom.mockReturnValue({
      room,
      uid: 'p1',
      isHost: true,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'Player1',
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const hostView = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );
    const playAgainBtn = screen.getByTestId('mp-memory-play-again-btn') as HTMLButtonElement;
    expect(playAgainBtn.disabled).toBe(false);
    expect(playAgainBtn.textContent).toContain('Return to Waiting Room');

    // 2. When host starts Round 2, all connected players automatically transition and see "GET READY – ROUND 2!"
    const round2Room = applyStartMemoryMatchRematch({
      room,
      callerUid: 'p1',
      nowMs: liveNow + 2000,
      randomFn: () => 0.2,
    });
    mockUseMultiplayerRoom.mockReturnValue({
      room: round2Room,
      uid: 'p2',
      isHost: false,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'Player2',
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    hostView.rerender(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );
    expect(screen.getByTestId('mp-memory-round-transition').textContent).toContain(
      'GET READY – ROUND 2!'
    );
    expect(screen.getByTestId('mp-memory-round-indicator').textContent).toContain('ROUND 2');
    hostView.unmount();
  });

  it('preserves original room maxPlayers capacity and generates board for actual participating players during rematches (e.g., 3 players in an 8-player room)', () => {
    let waiting8Cap = buildInitialRoomDocument({
      roomCode: 'CAP803',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      maxPlayers: 8,
      nowMs: NOW,
    });
    waiting8Cap = applyPlayerJoinOrReconnect({
      room: waiting8Cap,
      uid: 'p2',
      nickname: 'Player2',
      nowMs: NOW + 10,
    });
    waiting8Cap = applyPlayerJoinOrReconnect({
      room: waiting8Cap,
      uid: 'p3',
      nickname: 'Player3',
      nowMs: NOW + 20,
    });

    // Start Round 1 with 3 of 8 players using default 20-card settings
    let round1 = applyStartMemoryMatchGame({
      room: waiting8Cap,
      callerUid: 'p1',
      nowMs: NOW + 100,
      randomFn: () => 0.5,
    });
    expect(round1.maxPlayers).toBe(8);
    expect(round1.playerOrder).toEqual(['p1', 'p2', 'p3']);
    expect(round1.memoryMatchState!.cards).toHaveLength(20);
    expect(round1.memoryMatchState!.totalPairs).toBe(10);

    // Host CANNOT edit settings while match is in progress
    expect(() =>
      applyUpdateMemoryRoomSettings({
        room: round1,
        callerUid: 'p1',
        settings: { cardCount: 60, minPlayers: 2, maxPlayers: 8 },
        nowMs: NOW + 200,
      })
    ).toThrow(/locked while a match is in progress/i);

    round1 = playRoundToCompletion(round1, NOW + 500);
    expect(round1.status).toBe('completed');

    // Non-host CANNOT edit settings after completion
    expect(() =>
      applyUpdateMemoryRoomSettings({
        room: round1,
        callerUid: 'p2',
        settings: { cardCount: 60, minPlayers: 2, maxPlayers: 8 },
        nowMs: NOW + 5050,
      })
    ).toThrow(/Only the room host/i);

    // Host updates next-round settings to 60 cards (30 pairs) without altering Round 1's completed state
    const updatedAfterRound1 = applyUpdateMemoryRoomSettings({
      room: round1,
      callerUid: 'p1',
      settings: { cardCount: 60, minPlayers: 2, maxPlayers: 8 },
      nowMs: NOW + 5080,
    });
    expect(updatedAfterRound1.memoryMatchState!.cards).toHaveLength(20);
    expect(updatedAfterRound1.memoryRoomSettings).toEqual({
      cardCount: 60,
      minPlayers: 2,
      maxPlayers: 8,
    });
    // Connected clients accept the live settings update snapshot without refreshing
    expect(shouldAcceptIncomingRoomState(round1, updatedAfterRound1)).toBe(true);

    // Host starts Round 2 -> deals 60 cards (30 pairs) using latest saved settings while keeping room/players intact
    const round2 = applyStartMemoryMatchRematch({
      room: updatedAfterRound1,
      callerUid: 'p1',
      nowMs: NOW + 5100,
      randomFn: () => 0.2,
    });
    expect(round2.status).toBe('in_progress');
    expect(round2.roomCode).toBe(round1.roomCode);
    expect(round2.maxPlayers).toBe(8);
    expect(round2.playerOrder).toEqual(['p1', 'p2', 'p3']);
    expect(round2.memoryMatchState!.roundNumber).toBe(2);
    expect(round2.memoryMatchState!.cards).toHaveLength(60);
    expect(round2.memoryMatchState!.totalPairs).toBe(30);
    expect(round2.memoryMatchState!.matchSettings).toEqual({
      cardCount: 60,
      minPlayers: 2,
      maxPlayers: 8,
    });
    // Stale Round 1 snapshot cannot overwrite Round 2
    expect(shouldAcceptIncomingRoomState(round2, round1)).toBe(false);
  });

  it('renders flexible card-count & player-limit settings in lobby creation, displays dismissible Large Game Board notice at >= 60 cards, and submits independent settings', async () => {
    resetLargeBoardNoticeAcknowledgement();
    const mockCreateRoom = vi.fn().mockResolvedValue(null);
    mockUseMultiplayerRoom.mockReturnValue({
      room: null,
      uid: 'p1',
      isHost: false,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'HostHero',
      createRoom: mockCreateRoom,
      joinRoom: vi.fn(),
      updateRoomSettings: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const view = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );

    // Default settings: 20 cards (10 pairs), 2–8 Players (Auto) — player-limit selectors are hidden
    expect(screen.getByTestId('settings-card-count-display').textContent).toContain('20 Cards');
    expect(screen.getByTestId('settings-pair-count-display').textContent).toContain('10 Pairs');
    expect(screen.getByTestId('settings-player-limits-display').textContent).toContain(
      '2–8 Players (Auto)'
    );
    expect(screen.queryByTestId('settings-min-players-select')).toBeNull();
    expect(screen.queryByTestId('settings-max-players-select')).toBeNull();
    expect(screen.queryByTestId('large-board-notice')).toBeNull();

    // Selecting 100 cards shows the friendly Large game board notice without blocking creation
    fireEvent.click(screen.getByTestId('settings-card-preset-100'));
    expect(screen.getByTestId('settings-card-count-display').textContent).toContain('100 Cards');
    expect(screen.getByTestId('settings-pair-count-display').textContent).toContain('50 Pairs');
    const notice = screen.getByTestId('large-board-notice');
    expect(notice.textContent).toContain('Large game board');
    expect(notice.textContent).toContain('recommend using a desktop or tablet');

    // Acknowledging the notice hides it and prevents repeated interruptions
    fireEvent.click(screen.getByTestId('dismiss-large-board-notice'));
    expect(screen.queryByTestId('large-board-notice')).toBeNull();
    fireEvent.click(screen.getByTestId('settings-card-preset-60'));
    expect(screen.queryByTestId('large-board-notice')).toBeNull();

    // Select 100-card board via slider and submit — automatically uses 2–8 player limits
    fireEvent.change(screen.getByTestId('settings-card-count-slider'), { target: { value: '100' } });

    fireEvent.click(screen.getByTestId('submit-create-room'));
    expect(mockCreateRoom).toHaveBeenCalledWith({
      nickname: 'HostHero',
      maxPlayers: 8,
      memorySettings: {
        cardCount: 100,
        minPlayers: 2,
        maxPlayers: 8,
      },
    });

    // Zod schema rejects invalid settings directly
    expect(MemoryRoomSettingsSchema.safeParse({ cardCount: 15, minPlayers: 2, maxPlayers: 4 }).success).toBe(false);
    expect(MemoryRoomSettingsSchema.safeParse({ cardCount: 40, minPlayers: 5, maxPlayers: 3 }).success).toBe(false);

    view.unmount();
    resetLargeBoardNoticeAcknowledgement();
  });

  it('ignores stale mismatch resolution timers from an earlier round and validates all board sizes with Zod', () => {
    let round1 = applyStartMemoryMatchGame({
      room: readyRoom(2),
      callerUid: 'p1',
      nowMs: NOW,
      randomFn: () => 0.999999,
    });

    // Validate generated board states with Zod across 20, 40, 60, and 100 cards
    for (const pCount of [2, 3, 4, 8] as const) {
      const started = applyStartMemoryMatchGame({
        room: readyRoom(pCount),
        callerUid: 'p1',
        nowMs: NOW,
      });
      expect(MemoryMatchBoardStateSchema.safeParse(started.memoryMatchState).success).toBe(true);
    }

    round1 = playRoundToCompletion(round1, NOW + 500);
    const round2 = applyStartMemoryMatchRematch({
      room: round1,
      callerUid: 'p1',
      nowMs: NOW + 2000,
    });

    // Flip two mismatched cards in Round 2
    const c1 = round2.memoryMatchState!.cards[0];
    const c2 = round2.memoryMatchState!.cards.find((c) => c.pairKey !== c1.pairKey)!;
    const afterFlip1 = applySelectMemoryMatchCard({
      room: round2,
      callerUid: 'p1',
      cardId: c1.id,
      nowMs: NOW + 2100,
    }).nextRoom;
    const afterFlip2 = applySelectMemoryMatchCard({
      room: afterFlip1,
      callerUid: 'p1',
      cardId: c2.id,
      nowMs: NOW + 2200,
    }).nextRoom;

    expect(afterFlip2.memoryMatchState!.pendingResetAt).not.toBeNull();

    // A stale mismatch-resolution timer scoped to Round 1 must NOT touch Round 2's cards
    const afterStaleRound1Timer = applyResolveMemoryMatchMismatch({
      room: afterFlip2,
      nowMs: NOW + 2500,
      expectedRoundNumber: 1,
    });
    expect(afterStaleRound1Timer).toBe(afterFlip2);
    expect(afterStaleRound1Timer.memoryMatchState!.flippedCardIds).toHaveLength(2);

    // Resolving with the matching Round 2 number turns the mismatched cards face down
    const afterRound2Timer = applyResolveMemoryMatchMismatch({
      room: afterFlip2,
      nowMs: NOW + 2500,
      expectedRoundNumber: 2,
    });
    expect(afterRound2Timer.memoryMatchState!.flippedCardIds).toEqual([]);
  });

  it('opens directly into Multiplayer Memory Match Join with Code tab when an invitation URL is opened, prefills the room code without auto-joining, and joins when nickname is submitted', async () => {
    window.scrollTo = vi.fn();
    window.history.replaceState({}, '', '/?game=memory-match&room=NFGNTR');

    const mockJoinRoom = vi.fn().mockResolvedValue(null);
    mockUseMultiplayerRoom.mockReturnValue({
      room: null,
      uid: 'guest-uid',
      isHost: false,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: '',
      invitedRoomCode: 'NFGNTR',
      invitationStatus: 'joinable',
      invitationRoomInfo: {
        roomCode: 'NFGNTR',
        joinedCount: 1,
        maxPlayers: 4,
        hostNickname: 'HostAce',
      },
      dismissInvitation: vi.fn(),
      createRoom: vi.fn(),
      joinRoom: mockJoinRoom,
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const appView = render(React.createElement(App));

    // 1. Opens directly in Memory Match Online Multiplayer Join tab (lazy-loaded game view)
    expect((await screen.findByTestId('invitation-valid-banner')).textContent).toContain(
      'Invited to Room NFGNTR (1/4 players)'
    );
    const codeInput = screen.getByTestId('input-room-code') as HTMLInputElement;
    expect(codeInput.value).toBe('NFGNTR');

    // 2. Does NOT automatically join the room merely from opening the link
    expect(mockJoinRoom).not.toHaveBeenCalled();

    // 3. Recipient enters nickname and explicitly clicks Join Room
    const nicknameInput = screen.getByTestId('input-nickname') as HTMLInputElement;
    fireEvent.change(nicknameInput, { target: { value: 'PixelGuest' } });
    fireEvent.click(screen.getByTestId('submit-join-room'));

    expect(mockJoinRoom).toHaveBeenCalledWith({
      roomCode: 'NFGNTR',
      nickname: 'PixelGuest',
    });

    appView.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('displays friendly error and Enter Another Room Code reset button when an invitation room is unavailable, and supports Share Room + Copy Link in the waiting room', async () => {
    const mockDismissInvitation = vi.fn();
    const mockClearError = vi.fn();

    mockUseMultiplayerRoom.mockReturnValue({
      room: null,
      uid: 'guest-uid',
      isHost: false,
      isLoading: false,
      isReconnecting: false,
      error: MULTIPLAYER_USER_MESSAGES.ROOM_FULL,
      preferredNickname: 'GuestPlayer',
      invitedRoomCode: 'FUL999',
      invitationStatus: 'unavailable',
      invitationRoomInfo: null,
      dismissInvitation: mockDismissInvitation,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: mockClearError,
    });

    const unavailableView = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );

    expect(screen.getByTestId('multiplayer-error-banner').textContent).toContain(
      MULTIPLAYER_USER_MESSAGES.ROOM_FULL
    );
    const resetBtn = screen.getByTestId('invitation-reset-btn');
    fireEvent.click(resetBtn);
    expect(mockDismissInvitation).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId('input-room-code') as HTMLInputElement).value).toBe('');
    unavailableView.unmount();

    // Now test Waiting Room Share Room & Copy Link functionality
    const waitingRoom = buildInitialRoomDocument({
      roomCode: 'SHR234',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'HostPlayer',
      maxPlayers: 4,
      nowMs: Date.now(),
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
      share: undefined,
    });

    mockUseMultiplayerRoom.mockReturnValue({
      room: waitingRoom,
      uid: 'p1',
      isHost: true,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'HostPlayer',
      invitedRoomCode: null,
      invitationStatus: 'idle',
      invitationRoomInfo: null,
      dismissInvitation: vi.fn(),
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const waitingView = render(
      React.createElement(MemoryMatchMultiplayerView, { onBackToHome: vi.fn() })
    );

    // 1. Copy Link button copies the direct invitation URL with ?game=memory-match&room=SHR234
    fireEvent.click(screen.getByTestId('copy-invite-link-btn'));
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('/?game=memory-match&room=SHR234')
    );

    // 2. Share Room falls back to clipboard with invitation message + URL when navigator.share is unavailable
    fireEvent.click(screen.getByTestId('share-room-btn'));
    expect(writeTextMock).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "You're invited to play Memory Match on Pixel Afterglow!"
      )
    );
    expect(writeTextMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/?game=memory-match&room=SHR234')
    );

    waitingView.unmount();
  });

  it('uses responsive 5-col mobile / 8-col small-tablet / 10-col tablet-desktop classes, compact 2-row 8-player scoreboard, and sticky status bar on the 100-card board', () => {
    let readyRoom = buildInitialRoomDocument({
      roomCode: 'MOB100',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'HostAlpha',
      memorySettings: { cardCount: 100, minPlayers: 2, maxPlayers: 8 },
      nowMs: 1_700_000_000_000,
    });
    for (let i = 2; i <= 8; i++) {
      readyRoom = applyPlayerJoinOrReconnect({
        room: readyRoom,
        uid: `p${i}`,
        nickname: `Player${i}`,
        nowMs: 1_700_000_000_000 + i,
      });
    }
    const room = applyStartMemoryMatchGame({
      room: readyRoom,
      callerUid: 'p1',
      nowMs: 1_700_000_000_100,
    });

    const onActiveGameChange = vi.fn();
    mockUseMultiplayerRoom.mockReturnValue({
      room,
      uid: 'p1',
      isHost: true,
      isLoading: false,
      isReconnecting: false,
      error: null,
      preferredNickname: 'HostAlpha',
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn(),
      closeRoom: vi.fn(),
      clearError: vi.fn(),
    });

    const { unmount } = render(
      React.createElement(MemoryMatchMultiplayerView, {
        onBackToHome: vi.fn(),
        onActiveGameChange,
      })
    );

    expect(onActiveGameChange).toHaveBeenCalledWith(true);

    // 100-card board grid adapts: 5 cols on small mobile, 8 on sm, 10 on md+ desktop
    const grid = screen.getByRole('grid', {
      name: /Multiplayer Memory Match Board with 100 cards/i,
    });
    expect(grid.className).toContain('grid-cols-5');
    expect(grid.className).toContain('sm:grid-cols-8');
    expect(grid.className).toContain('md:grid-cols-10');
    expect(grid.className).toContain('w-full');

    // Every card uses dynamic width (w-full) and compact mobile height transitioning to square on sm+
    const firstCard = screen.getByTestId('mp-memory-card-0');
    expect(firstCard.className).toContain('w-full');
    expect(firstCard.className).toContain('aspect-[4/3]');
    expect(firstCard.className).toContain('sm:aspect-square');
    expect(firstCard.className).toContain('touch-manipulation');

    // 8-player scoreboard uses 4 columns (max 2 rows) on both mobile and desktop
    const scoreboard = screen.getByTestId('mp-memory-scoreboard');
    expect(scoreboard.className).toContain('grid-cols-4');
    for (let i = 0; i < 8; i++) {
      expect(screen.getByTestId(`mp-memory-player-${i}`)).toBeTruthy();
      expect(screen.getByTestId(`mp-memory-score-${i}`)).toBeTruthy();
    }

    // Sticky mobile status bar stays compact and does not use fullscreen transforms
    const turnBanner = screen.getByTestId('mp-memory-turn-banner');
    expect(turnBanner.parentElement?.className).toContain('sticky');
    expect(turnBanner.parentElement?.className).toContain('top-[52px]');
    expect(turnBanner.parentElement?.className).toContain('sm:static');

    unmount();
    expect(onActiveGameChange).toHaveBeenLastCalledWith(false);
  });
});

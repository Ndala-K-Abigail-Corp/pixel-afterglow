// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
} from './multiplayerRoom';
import {
  createMultiplayerMemoryDeck,
  applyStartMemoryMatchGame,
  applySelectMemoryMatchCard,
  applyResolveMemoryMatchMismatch,
  MEMORY_PLAYER_COLOR_PALETTE,
  getMemoryPlayerColor,
  getMatchedCardOwnerColor,
} from './memoryMatchMultiplayer';
import type {
  MemoryMultiplayerPlayerCount,
  MultiplayerRoomDocument,
} from '../types/multiplayer';

const mockUseMultiplayerRoom = vi.fn();

vi.mock('../hooks/useMultiplayerRoom', () => ({
  useMultiplayerRoom: (...args: unknown[]) => mockUseMultiplayerRoom(...args),
}));

vi.mock('../context/AudioContext', () => ({
  useAudio: () => ({
    playFlip: vi.fn(),
    playMatch: vi.fn(),
    playMismatch: vi.fn(),
    playWin: vi.fn(),
    playDraw: vi.fn(),
    playClick: vi.fn(),
  }),
}));

import { MemoryMatchMultiplayerView } from '../components/game/MemoryMatchMultiplayerView';

describe('Phase 4 – Multiplayer Memory Match Logic', () => {
  const BASE_NOW = 1_700_000_000_000;

  function createReadyMemoryRoom(playerCount: MemoryMultiplayerPlayerCount) {
    let room = buildInitialRoomDocument({
      roomCode: 'MEM123',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      maxPlayers: playerCount,
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

  it('creates 20 cards (10 pairs) for 2P, 40 cards (20 pairs) for 3P, and 60 cards (30 pairs) for 4P', () => {
    const deck2P = createMultiplayerMemoryDeck(2);
    expect(deck2P).toHaveLength(20);

    const deck3P = createMultiplayerMemoryDeck(3);
    expect(deck3P).toHaveLength(40);

    const deck4P = createMultiplayerMemoryDeck(4);
    expect(deck4P).toHaveLength(60);

    // Verify every pairKey in the 60-card deck has exactly 2 cards
    const pairCounts = new Map<string, number>();
    for (const card of deck4P) {
      pairCounts.set(card.pairKey, (pairCounts.get(card.pairKey) ?? 0) + 1);
    }
    expect(pairCounts.size).toBe(30);
    for (const count of pairCounts.values()) {
      expect(count).toBe(2);
    }
  });

  it('prevents host from starting until the selected player count (2, 3, or 4) has joined', () => {
    const waiting3P = buildInitialRoomDocument({
      roomCode: 'MEM333',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      maxPlayers: 3,
      nowMs: BASE_NOW,
    });
    const withTwoJoined = applyPlayerJoinOrReconnect({
      room: waiting3P,
      uid: 'p2',
      nickname: 'Player2',
      nowMs: BASE_NOW + 100,
    });

    // Only 2 of 3 players joined -> cannot start
    expect(() =>
      applyStartMemoryMatchGame({
        room: withTwoJoined,
        callerUid: 'p1',
        nowMs: BASE_NOW + 200,
      })
    ).toThrow(/Waiting for players/i);

    const withAllThreeJoined = applyPlayerJoinOrReconnect({
      room: withTwoJoined,
      uid: 'p3',
      nickname: 'Player3',
      nowMs: BASE_NOW + 300,
    });

    const started = applyStartMemoryMatchGame({
      room: withAllThreeJoined,
      callerUid: 'p1',
      nowMs: BASE_NOW + 400,
    });

    expect(started.status).toBe('in_progress');
    expect(started.memoryMatchState?.cards).toHaveLength(40);
    expect(started.memoryMatchState?.totalPairs).toBe(20);
    expect(started.currentTurnUid).toBe('p1');
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

  describe('Player-owned matched card colours (2, 3, and 4 players)', () => {
    it.each([
      { playerCount: 2 as const, expectedColors: ['#3B82F6', '#EF4444'] },
      { playerCount: 3 as const, expectedColors: ['#3B82F6', '#EF4444', '#22C55E'] },
      { playerCount: 4 as const, expectedColors: ['#3B82F6', '#EF4444', '#22C55E', '#A855F7'] },
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

    it.each([2 as const, 3 as const, 4 as const])(
      'renders player score cards, colour legend, and matched card borders/tints/icons in MemoryMatchMultiplayerView for %i players',
      (playerCount) => {
        const expectedColors = ['#3B82F6', '#EF4444', '#22C55E', '#A855F7'].slice(
          0,
          playerCount
        );

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

        // Verify each player's score card and legend entry uses their assigned colour
        expectedColors.forEach((hex, idx) => {
          const playerScoreCard = screen.getByTestId(`mp-memory-player-${idx}`);
          expect(playerScoreCard.getAttribute('data-player-color')).toBe(hex);
          expect(screen.getByTestId(`mp-memory-legend-item-${idx}`)).toBeTruthy();
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

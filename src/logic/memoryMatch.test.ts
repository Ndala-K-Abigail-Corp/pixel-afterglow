/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createMemoryDeck,
  shuffleDeck,
  initializeMemoryGame,
  isPairMatch,
  evaluateMemoryOutcome,
  getDifficultyConfig,
  formatSeconds,
  loadMemoryStats,
  saveMemoryRecord,
  clearMemoryStats,
  MEMORY_CARD_SYMBOLS,
} from './memoryMatch';

// Mock storage for Node runner
const memoryMockStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => memoryMockStore[k] || null,
  setItem: (k: string, v: string) => {
    memoryMockStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete memoryMockStore[k];
  },
  clear: () => {
    for (const k in memoryMockStore) delete memoryMockStore[k];
  },
  length: 0,
  key: () => null,
} as unknown as Storage;

describe('Memory Match Pure Logic', () => {
  it('defines 10 distinct symbols to support up to Hard (10 pairs)', () => {
    expect(MEMORY_CARD_SYMBOLS).toHaveLength(10);
    const uniqueIds = new Set(MEMORY_CARD_SYMBOLS.map((s) => s.symbolId));
    expect(uniqueIds.size).toBe(10);
  });

  it('provides accurate difficulty configurations for Easy, Medium, and Hard', () => {
    const easy = getDifficultyConfig('easy');
    expect(easy.pairs).toBe(6);
    expect(easy.totalCards).toBe(12);
    expect(easy.timeLimitSeconds).toBe(90);
    expect(easy.maxAttempts).toBe(15);

    const medium = getDifficultyConfig('medium');
    expect(medium.pairs).toBe(8);
    expect(medium.totalCards).toBe(16);
    expect(medium.timeLimitSeconds).toBe(75);
    expect(medium.maxAttempts).toBe(20);

    const hard = getDifficultyConfig('hard');
    expect(hard.pairs).toBe(10);
    expect(hard.totalCards).toBe(20);
    expect(hard.timeLimitSeconds).toBe(60);
    expect(hard.maxAttempts).toBe(25);
  });

  it('creates decks with the exact number of pairs for each difficulty', () => {
    const easyDeck = initializeMemoryGame('easy');
    expect(easyDeck).toHaveLength(12);

    const mediumDeck = initializeMemoryGame('medium');
    expect(mediumDeck).toHaveLength(16);

    const hardDeck = initializeMemoryGame('hard');
    expect(hardDeck).toHaveLength(20);

    // Verify each symbol in Hard appears exactly twice
    for (const sym of MEMORY_CARD_SYMBOLS) {
      const matches = hardDeck.filter((c) => c.symbolId === sym.symbolId);
      expect(matches).toHaveLength(2);
      expect(matches[0].name).toBe(sym.name);
      expect(matches[0].isFlipped).toBe(false);
      expect(matches[0].isMatched).toBe(false);
    }
  });

  it('shuffles the deck without losing or corrupting cards', () => {
    const deck = createMemoryDeck(8);
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(16);

    const originalIds = deck.map((c) => c.id).sort((a, b) => a - b);
    const shuffledIds = shuffled.map((c) => c.id).sort((a, b) => a - b);
    expect(shuffledIds).toEqual(originalIds);
  });

  it('correctly validates matching pairs and rejects same-card selection', () => {
    const deck = createMemoryDeck(6);
    const cardA1 = deck[0]; // first card of pair 1
    const cardA2 = deck[1]; // second card of pair 1
    const cardB1 = deck[2]; // card of pair 2

    expect(isPairMatch(cardA1, cardA2)).toBe(true);
    expect(isPairMatch(cardA1, cardB1)).toBe(false);
    expect(isPairMatch(cardA1, cardA1)).toBe(false);
  });

  it('evaluates Time Challenge win and loss states accurately', () => {
    // Still playing
    expect(
      evaluateMemoryOutcome({
        mode: 'time-challenge',
        matchedPairs: 4,
        totalPairs: 6,
        remainingSeconds: 30,
        attemptsUsed: 6,
        maxAttempts: 15,
      })
    ).toBe('playing');

    // Time ran out before matching all pairs -> lost-time
    expect(
      evaluateMemoryOutcome({
        mode: 'time-challenge',
        matchedPairs: 5,
        totalPairs: 6,
        remainingSeconds: 0,
        attemptsUsed: 18,
        maxAttempts: 15,
      })
    ).toBe('lost-time');

    // All pairs matched before time expires -> won
    expect(
      evaluateMemoryOutcome({
        mode: 'time-challenge',
        matchedPairs: 6,
        totalPairs: 6,
        remainingSeconds: 12,
        attemptsUsed: 19,
        maxAttempts: 15,
      })
    ).toBe('won');
  });

  it('evaluates Limited Moves win and loss states accurately', () => {
    // Still playing with attempts remaining
    expect(
      evaluateMemoryOutcome({
        mode: 'limited-moves',
        matchedPairs: 5,
        totalPairs: 6,
        remainingSeconds: 0,
        attemptsUsed: 14,
        maxAttempts: 15,
      })
    ).toBe('playing');

    // Final attempt matches the last pair -> won
    expect(
      evaluateMemoryOutcome({
        mode: 'limited-moves',
        matchedPairs: 6,
        totalPairs: 6,
        remainingSeconds: 0,
        attemptsUsed: 15,
        maxAttempts: 15,
      })
    ).toBe('won');

    // Attempts exhausted with pairs remaining -> lost-moves
    expect(
      evaluateMemoryOutcome({
        mode: 'limited-moves',
        matchedPairs: 5,
        totalPairs: 6,
        remainingSeconds: 90,
        attemptsUsed: 15,
        maxAttempts: 15,
      })
    ).toBe('lost-moves');
  });

  it('formats seconds to MM:SS string and clamps negative values to 00:00', () => {
    expect(formatSeconds(-5)).toBe('00:00');
    expect(formatSeconds(0)).toBe('00:00');
    expect(formatSeconds(5)).toBe('00:05');
    expect(formatSeconds(65)).toBe('01:05');
    expect(formatSeconds(90)).toBe('01:30');
    expect(formatSeconds(600)).toBe('10:00');
  });

  it('saves and tracks best records in localStorage', () => {
    clearMemoryStats();
    const initial = loadMemoryStats();
    expect(initial.bestTime).toBeNull();
    expect(initial.bestMoves).toBeNull();

    const record1 = saveMemoryRecord(45, 14);
    expect(record1.bestTime).toBe(45);
    expect(record1.bestMoves).toBe(14);
    expect(record1.gamesPlayed).toBe(1);

    const record2 = saveMemoryRecord(55, 12);
    expect(record2.bestTime).toBe(45);
    expect(record2.bestMoves).toBe(12);
    expect(record2.gamesPlayed).toBe(2);
  });
});

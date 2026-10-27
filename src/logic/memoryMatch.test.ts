/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createMemoryDeck,
  shuffleDeck,
  isPairMatch,
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
  it('creates a standard 16-card deck with 8 pairs', () => {
    const deck = createMemoryDeck();
    expect(deck).toHaveLength(16);
    expect(MEMORY_CARD_SYMBOLS).toHaveLength(8);

    // Each symbol should appear exactly twice
    for (const sym of MEMORY_CARD_SYMBOLS) {
      const matches = deck.filter((c) => c.symbolId === sym.symbolId);
      expect(matches).toHaveLength(2);
      expect(matches[0].name).toBe(sym.name);
      expect(matches[0].isFlipped).toBe(false);
      expect(matches[0].isMatched).toBe(false);
    }
  });

  it('shuffles the deck without losing or corrupting cards', () => {
    const deck = createMemoryDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(16);

    const originalIds = deck.map((c) => c.id).sort();
    const shuffledIds = shuffled.map((c) => c.id).sort();
    expect(shuffledIds).toEqual(originalIds);
  });

  it('correctly validates matching pairs', () => {
    const deck = createMemoryDeck();
    const cardA1 = deck[0]; // first card of pair 1
    const cardA2 = deck[1]; // second card of pair 1
    const cardB1 = deck[2]; // card of pair 2

    expect(isPairMatch(cardA1, cardA2)).toBe(true);
    expect(isPairMatch(cardA1, cardB1)).toBe(false);
    // Same card cannot match itself
    expect(isPairMatch(cardA1, cardA1)).toBe(false);
  });

  it('formats seconds to MM:SS string', () => {
    expect(formatSeconds(0)).toBe('00:00');
    expect(formatSeconds(5)).toBe('00:05');
    expect(formatSeconds(65)).toBe('01:05');
    expect(formatSeconds(600)).toBe('10:00');
  });

  it('saves and tracks best records in localStorage', () => {
    clearMemoryStats();
    const initial = loadMemoryStats();
    expect(initial.bestTime).toBeNull();
    expect(initial.bestMoves).toBeNull();

    // First game finished in 45s with 14 moves
    const record1 = saveMemoryRecord(45, 14);
    expect(record1.bestTime).toBe(45);
    expect(record1.bestMoves).toBe(14);
    expect(record1.gamesPlayed).toBe(1);

    // Second game slower (55s) but fewer moves (12 moves)
    const record2 = saveMemoryRecord(55, 12);
    expect(record2.bestTime).toBe(45); // remains 45
    expect(record2.bestMoves).toBe(12); // improved to 12
    expect(record2.gamesPlayed).toBe(2);
  });
});

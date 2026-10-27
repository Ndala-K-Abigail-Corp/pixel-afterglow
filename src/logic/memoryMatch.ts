/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryCard, MemoryStats } from '../types/game';

export interface CardSymbolDefinition {
  symbolId: string;
  name: string;
  color: string;
}

export const MEMORY_CARD_SYMBOLS: CardSymbolDefinition[] = [
  { symbolId: 'heart', name: 'Retro Heart', color: '#FF776E' },
  { symbolId: 'gem', name: 'Power Gem', color: '#56E0CB' },
  { symbolId: 'star', name: 'Star Coin', color: '#FFC66D' },
  { symbolId: 'potion', name: 'Health Potion', color: '#B388FF' },
  { symbolId: 'gamepad', name: 'Arcade Pad', color: '#4FD1C5' },
  { symbolId: 'ghost', name: 'Pixel Ghost', color: '#FF8A80' },
  { symbolId: 'key', name: 'Dungeon Key', color: '#FFE082' },
  { symbolId: 'bolt', name: 'Energy Bolt', color: '#80CBC4' },
];

/**
 * Creates 16 cards (8 pairs of 2) from the symbol definitions.
 */
export function createMemoryDeck(): MemoryCard[] {
  const deck: MemoryCard[] = [];
  let cardId = 0;

  for (const sym of MEMORY_CARD_SYMBOLS) {
    // Two cards for each symbol
    deck.push({
      id: cardId++,
      symbolId: sym.symbolId,
      name: sym.name,
      color: sym.color,
      isFlipped: false,
      isMatched: false,
    });
    deck.push({
      id: cardId++,
      symbolId: sym.symbolId,
      name: sym.name,
      color: sym.color,
      isFlipped: false,
      isMatched: false,
    });
  }

  return deck;
}

/**
 * Shuffles an array of cards using Fisher-Yates algorithm.
 */
export function shuffleDeck(cards: MemoryCard[], randomFn: () => number = Math.random): MemoryCard[] {
  const shuffled = cards.map((c) => ({ ...c }));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Creates and returns a freshly shuffled new game deck.
 */
export function initializeMemoryGame(): MemoryCard[] {
  return shuffleDeck(createMemoryDeck());
}

/**
 * Checks if two cards match by symbolId.
 */
export function isPairMatch(cardA: MemoryCard, cardB: MemoryCard): boolean {
  return cardA.symbolId === cardB.symbolId && cardA.id !== cardB.id;
}

/**
 * Formats seconds into MM:SS display string.
 */
export function formatSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * LocalStorage persistence for Memory Match personal records.
 */
const MEMORY_STORAGE_KEY = 'pixel_afterglow_memory_records_v1';

export const INITIAL_MEMORY_STATS: MemoryStats = {
  bestTime: null,
  bestMoves: null,
  gamesPlayed: 0,
};

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  return null;
}

export function loadMemoryStats(): MemoryStats {
  const storage = getStorage();
  if (!storage) return { ...INITIAL_MEMORY_STATS };
  try {
    const saved = storage.getItem(MEMORY_STORAGE_KEY);
    if (!saved) return { ...INITIAL_MEMORY_STATS };
    const parsed = JSON.parse(saved);
    return {
      bestTime: typeof parsed.bestTime === 'number' ? parsed.bestTime : null,
      bestMoves: typeof parsed.bestMoves === 'number' ? parsed.bestMoves : null,
      gamesPlayed: typeof parsed.gamesPlayed === 'number' ? parsed.gamesPlayed : 0,
    };
  } catch {
    return { ...INITIAL_MEMORY_STATS };
  }
}

export function saveMemoryRecord(timeSeconds: number, moves: number): MemoryStats {
  const current = loadMemoryStats();
  const next: MemoryStats = {
    bestTime: current.bestTime === null ? timeSeconds : Math.min(current.bestTime, timeSeconds),
    bestMoves: current.bestMoves === null ? moves : Math.min(current.bestMoves, moves),
    gamesPlayed: current.gamesPlayed + 1,
  };

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export function clearMemoryStats(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(MEMORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

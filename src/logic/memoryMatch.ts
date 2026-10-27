/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MemoryCard,
  MemoryDifficulty,
  MemoryDifficultyConfig,
  MemoryGameMode,
  MemoryGameOutcome,
  MemoryStats,
} from '../types/game';

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
  { symbolId: 'crown', name: 'Arcade Crown', color: '#FFD54F' },
  { symbolId: 'shield', name: 'Pixel Shield', color: '#FF80AB' },
];

export const MEMORY_DIFFICULTY_CONFIGS: Record<MemoryDifficulty, MemoryDifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    pairs: 6,
    totalCards: 12,
    timeLimitSeconds: 90,
    maxAttempts: 15,
    description: '6 pairs (12 cards) · Relaxed arcade warmup',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    pairs: 8,
    totalCards: 16,
    timeLimitSeconds: 75,
    maxAttempts: 20,
    description: '8 pairs (16 cards) · Classic arcade challenge',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    pairs: 10,
    totalCards: 20,
    timeLimitSeconds: 60,
    maxAttempts: 25,
    description: '10 pairs (20 cards) · High-speed master recall',
  },
};

export function getDifficultyConfig(difficulty: MemoryDifficulty): MemoryDifficultyConfig {
  return MEMORY_DIFFICULTY_CONFIGS[difficulty];
}

/**
 * Creates a deck of paired cards for the requested number of pairs (default 8 pairs = 16 cards).
 */
export function createMemoryDeck(pairCount = 8): MemoryCard[] {
  const clampedPairs = Math.max(1, Math.min(pairCount, MEMORY_CARD_SYMBOLS.length));
  const selectedSymbols = MEMORY_CARD_SYMBOLS.slice(0, clampedPairs);
  const deck: MemoryCard[] = [];
  let cardId = 0;

  for (const sym of selectedSymbols) {
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
 * Creates and returns a freshly shuffled new game deck for a given difficulty or pair count.
 */
export function initializeMemoryGame(
  difficultyOrPairs: MemoryDifficulty | number = 'medium',
  randomFn: () => number = Math.random
): MemoryCard[] {
  const pairCount =
    typeof difficultyOrPairs === 'number'
      ? difficultyOrPairs
      : MEMORY_DIFFICULTY_CONFIGS[difficultyOrPairs].pairs;
  return shuffleDeck(createMemoryDeck(pairCount), randomFn);
}

/**
 * Checks if two cards match by symbolId and are distinct card instances.
 */
export function isPairMatch(cardA: MemoryCard, cardB: MemoryCard): boolean {
  return cardA.symbolId === cardB.symbolId && cardA.id !== cardB.id;
}

/**
 * Evaluates the outcome of a Memory Match game after a turn or timer tick.
 */
export function evaluateMemoryOutcome(params: {
  mode: MemoryGameMode;
  matchedPairs: number;
  totalPairs: number;
  remainingSeconds: number;
  attemptsUsed: number;
  maxAttempts: number;
}): MemoryGameOutcome {
  const { mode, matchedPairs, totalPairs, remainingSeconds, attemptsUsed, maxAttempts } = params;

  // Win takes priority whenever all pairs are matched within allowed limits
  if (matchedPairs >= totalPairs && totalPairs > 0) {
    return 'won';
  }

  if (mode === 'time-challenge' && remainingSeconds <= 0) {
    return 'lost-time';
  }

  if (mode === 'limited-moves' && attemptsUsed >= maxAttempts) {
    return 'lost-moves';
  }

  return 'playing';
}

/**
 * Formats seconds into MM:SS display string (clamped at 0 to prevent negative display).
 */
export function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
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

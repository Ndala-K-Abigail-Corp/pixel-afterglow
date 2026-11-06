// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
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
import { MemoryMatchGame } from '../components/game/MemoryMatchGame';
import { AudioProvider } from '../context/AudioContext';

// Mock canvas-confetti so tests run cleanly in headless jsdom
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

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
    // Deterministic non-identity random generator
    let seed = 1;
    const pseudoRandom = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const shuffled = shuffleDeck(deck, pseudoRandom);
    expect(shuffled).toHaveLength(16);

    const originalIds = deck.map((c) => c.id);
    const shuffledIds = shuffled.map((c) => c.id);
    expect(shuffledIds).not.toEqual(originalIds);
    expect([...shuffledIds].sort((a, b) => a - b)).toEqual(originalIds);
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
    expect(
      evaluateMemoryOutcome({
        mode: 'limited-moves',
        matchedPairs: 5,
        totalPairs: 6,
        remainingSeconds: 0,
        attemptsSeconds: 0,
        attemptsUsed: 14,
        maxAttempts: 15,
      } as Parameters<typeof evaluateMemoryOutcome>[0])
    ).toBe('playing');

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

describe('Memory Match Interactive Gameplay & Fake Timer Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts Time Challenge countdown only after flipping the first card and triggers loss at 00:00', () => {
    render(
      React.createElement(
        AudioProvider,
        null,
        React.createElement(MemoryMatchGame, { onBackToHome: vi.fn() })
      )
    );

    // Select Easy (90s = 01:30) and start game
    fireEvent.click(screen.getByRole('radio', { name: /Easy/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Game/i }));

    // Before first card flip, advancing time does NOT decrement the countdown
    expect(screen.getByLabelText('Remaining time 01:30')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByLabelText('Remaining time 01:30')).toBeTruthy();

    // Flip first card -> starts the countdown
    const cards = screen.getAllByRole('gridcell');
    expect(cards).toHaveLength(12);
    fireEvent.click(cards[0]);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByLabelText('Remaining time 01:20')).toBeTruthy();

    // Advance remaining 80 seconds to expire timer -> triggers loss and clamps at 00:00
    act(() => {
      vi.advanceTimersByTime(85000);
    });
    expect(screen.getByLabelText('Remaining time 00:00')).toBeTruthy();
    expect(screen.getByText(/TIME'S UP! GAME OVER/i)).toBeTruthy();
  });

  it('resolves mismatched cards after 750ms delay, blocks a third card during lock, and counts 1 attempt per pair', () => {
    // Force Math.random to return 0 so Fisher-Yates shifts elements deterministically:
    // For createMemoryDeck(6): [A, A, B, B, C, C, D, D, E, E, F, F]
    // With Math.random() = 0, index 0 and index 1 have DIFFERENT symbols!
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      React.createElement(
        AudioProvider,
        null,
        React.createElement(MemoryMatchGame, { onBackToHome: vi.fn() })
      )
    );

    // Switch to Limited Moves + Easy (15 attempts, 12 cards)
    fireEvent.click(screen.getByRole('radio', { name: /Limited Moves/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Easy/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Game/i }));

    expect(screen.getByLabelText('15 attempts remaining')).toBeTruthy();

    const cards = screen.getAllByRole('gridcell');
    // Flip card 0 and card 1 (which are a mismatch when Math.random() === 0)
    fireEvent.click(cards[0]);
    // Selecting only 1 card does not consume an attempt yet
    expect(screen.getByLabelText('15 attempts remaining')).toBeTruthy();

    fireEvent.click(cards[1]);
    // Selecting the 2nd card consumes 1 attempt (14 remaining)
    expect(screen.getByLabelText('14 attempts remaining')).toBeTruthy();

    // While mismatch is being resolved (< 750ms), clicking a 3rd card is blocked
    fireEvent.click(cards[2]);
    expect(cards[2].getAttribute('aria-pressed')).toBe('false');

    // After 750ms, both mismatched cards flip back face down
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(cards[0].getAttribute('aria-pressed')).toBe('false');
    expect(cards[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('supports restarting and switching between Time Challenge and Limited Moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      React.createElement(
        AudioProvider,
        null,
        React.createElement(MemoryMatchGame, { onBackToHome: vi.fn() })
      )
    );

    // Start in Limited Moves · Medium (8 pairs = 16 cards, 20 attempts)
    fireEvent.click(screen.getByRole('radio', { name: /Limited Moves/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Game/i }));

    const cards = screen.getAllByRole('gridcell');
    expect(cards).toHaveLength(16);
    expect(screen.getByLabelText('20 attempts remaining')).toBeTruthy();

    // Make 1 attempt
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    expect(screen.getByLabelText('19 attempts remaining')).toBeTruthy();

    // Click Restart & Shuffle -> resets attempts back to 20
    fireEvent.click(screen.getByRole('button', { name: /Restart & Shuffle/i }));
    expect(screen.getByLabelText('20 attempts remaining')).toBeTruthy();

    // Return to Setup (no progress made since restart) and switch to Time Challenge · Hard (20 cards)
    fireEvent.click(screen.getByRole('button', { name: /Change Mode \/ Difficulty/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Time Challenge/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Hard/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Game/i }));

    expect(screen.getAllByRole('gridcell')).toHaveLength(20);
    expect(screen.getByLabelText('Remaining time 01:00')).toBeTruthy();
  });
});

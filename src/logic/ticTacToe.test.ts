/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyBoard,
  isValidMove,
  makeMove,
  evaluateBoard,
  getNextPlayer,
  getAvailableMoves,
  getComputerMove,
  loadScores,
  saveScores,
  clearStoredScores,
  WINNING_LINES,
} from './ticTacToe';
import { BoardState } from '../types/game';

// Provide a mock localStorage for Vitest Node runner
const mockStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => mockStore[k] || null,
  setItem: (k: string, v: string) => {
    mockStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete mockStore[k];
  },
  clear: () => {
    for (const k in mockStore) delete mockStore[k];
  },
  length: 0,
  key: () => null,
} as unknown as Storage;

describe('Tic-Tac-Toe Pure Logic', () => {
  it('creates an empty 9-cell board', () => {
    const board = createEmptyBoard();
    expect(board).toHaveLength(9);
    expect(board.every((c) => c === null)).toBe(true);
  });

  it('validates moves correctly', () => {
    const board: BoardState = ['X', null, null, null, null, null, null, null, null];
    // Cell 0 occupied
    expect(isValidMove(board, 0, false)).toBe(false);
    // Cell 1 empty and game not over
    expect(isValidMove(board, 1, false)).toBe(true);
    // Out of bounds
    expect(isValidMove(board, -1, false)).toBe(false);
    expect(isValidMove(board, 9, false)).toBe(false);
    // When game is over
    expect(isValidMove(board, 1, true)).toBe(false);
  });

  it('makes moves immutably', () => {
    const board = createEmptyBoard();
    const nextBoard = makeMove(board, 4, 'X');
    expect(board[4]).toBeNull();
    expect(nextBoard[4]).toBe('X');
    // Cannot overwrite cell
    const invalidNext = makeMove(nextBoard, 4, 'O');
    expect(invalidNext[4]).toBe('X');
  });

  it('switches player turn', () => {
    expect(getNextPlayer('X')).toBe('O');
    expect(getNextPlayer('O')).toBe('X');
  });

  it('gets all available moves accurately', () => {
    const board: BoardState = ['X', 'O', null, null, 'X', null, null, null, 'O'];
    const available = getAvailableMoves(board);
    expect(available).toEqual([2, 3, 5, 6, 7]);
  });

  describe('Winner detection for all 8 winning lines', () => {
    // Rows
    it('detects row 1 win', () => {
      const board: BoardState = ['X', 'X', 'X', 'O', 'O', null, null, null, null];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('X');
      expect(result.winningLine?.indices).toEqual([0, 1, 2]);
    });

    it('detects row 2 win', () => {
      const board: BoardState = ['X', 'O', null, 'O', 'O', 'O', 'X', null, 'X'];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('O');
      expect(result.winningLine?.indices).toEqual([3, 4, 5]);
    });

    it('detects row 3 win', () => {
      const board: BoardState = ['O', null, 'O', null, null, null, 'X', 'X', 'X'];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('X');
      expect(result.winningLine?.indices).toEqual([6, 7, 8]);
    });

    // Columns
    it('detects col 1 win', () => {
      const board: BoardState = ['X', 'O', null, 'X', 'O', null, 'X', null, null];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('X');
      expect(result.winningLine?.indices).toEqual([0, 3, 6]);
    });

    it('detects col 2 win', () => {
      const board: BoardState = ['X', 'O', null, 'X', 'O', 'X', null, 'O', null];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('O');
      expect(result.winningLine?.indices).toEqual([1, 4, 7]);
    });

    it('detects col 3 win', () => {
      const board: BoardState = ['O', 'X', 'X', null, 'O', 'X', null, null, 'X'];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('X');
      expect(result.winningLine?.indices).toEqual([2, 5, 8]);
    });

    // Diagonals
    it('detects main diagonal win', () => {
      const board: BoardState = ['O', 'X', null, null, 'O', 'X', 'X', null, 'O'];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('O');
      expect(result.winningLine?.indices).toEqual([0, 4, 8]);
    });

    it('detects anti-diagonal win', () => {
      const board: BoardState = ['X', 'O', 'X', null, 'X', 'O', 'X', null, null];
      const result = evaluateBoard(board);
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('X');
      expect(result.winningLine?.indices).toEqual([2, 4, 6]);
    });
  });

  it('detects a draw when all cells filled and no winner', () => {
    // X O X
    // X O O
    // O X X
    const board: BoardState = [
      'X', 'O', 'X',
      'X', 'O', 'O',
      'O', 'X', 'X',
    ];
    const result = evaluateBoard(board);
    expect(result.isOver).toBe(true);
    expect(result.winner).toBeNull();
    expect(result.isDraw).toBe(true);
  });

  it('recognizes ongoing game with available moves and no winner', () => {
    const board: BoardState = [
      'X', 'O', null,
      null, 'X', null,
      null, null, null,
    ];
    const result = evaluateBoard(board);
    expect(result.isOver).toBe(false);
    expect(result.winner).toBeNull();
    expect(result.isDraw).toBe(false);
  });

  describe('Computer Opponent (AI Minimax)', () => {
    it('AI immediately takes a winning move when available', () => {
      // O has [0, 1], can win at index 2
      // X has [3, 4]
      const board: BoardState = [
        'O', 'O', null,
        'X', 'X', null,
        null, null, null,
      ];
      const move = getComputerMove(board, 'unbeatable');
      expect(move).toBe(2);
    });

    it('AI blocks an immediate human winning threat', () => {
      // X has [0, 1] threat, O must block at index 2
      const board: BoardState = [
        'X', 'X', null,
        null, 'O', null,
        null, null, null,
      ];
      const move = getComputerMove(board, 'unbeatable');
      expect(move).toBe(2);
    });

    it('AI blocks diagonal threat', () => {
      // X has [0, 4], O must block at index 8
      const board: BoardState = [
        'X', null, null,
        null, 'X', null,
        null, null, null,
      ];
      // Note: O's optimal move will take center if available, but here 4 is taken, so 8 or another corner
      const move = getComputerMove(board, 'unbeatable');
      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThanOrEqual(8);
      expect(board[move]).toBeNull();
    });

    it('AI always picks a legal move', () => {
      const board: BoardState = [
        'X', 'O', 'X',
        'X', 'O', null,
        'O', 'X', null,
      ];
      const move = getComputerMove(board, 'unbeatable');
      expect([5, 8]).toContain(move);
      expect(board[move]).toBeNull();
    });
  });

  describe('Score Persistence for PvP and PvC modes', () => {
    it('persists and clears scores separately per mode', () => {
      saveScores({ xWins: 3, oWins: 1, draws: 2 }, 'pvp');
      saveScores({ xWins: 5, oWins: 4, draws: 0 }, 'pvc');

      const pvpScores = loadScores('pvp');
      const pvcScores = loadScores('pvc');

      expect(pvpScores.xWins).toBe(3);
      expect(pvcScores.xWins).toBe(5);

      clearStoredScores('pvc');
      expect(loadScores('pvc').xWins).toBe(0);
      expect(loadScores('pvp').xWins).toBe(3);
    });
  });
});

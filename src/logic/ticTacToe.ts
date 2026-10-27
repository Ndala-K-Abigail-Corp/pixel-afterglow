/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BoardState, CellValue, GameStatus, Player, TicTacToeMode, TicTacToeScores, WinningLine } from '../types/game';

export const WINNING_LINES: Array<{ indices: [number, number, number]; direction: 'row' | 'col' | 'diag-main' | 'diag-anti'; lineIndex: number }> = [
  // Rows
  { indices: [0, 1, 2], direction: 'row', lineIndex: 0 },
  { indices: [3, 4, 5], direction: 'row', lineIndex: 1 },
  { indices: [6, 7, 8], direction: 'row', lineIndex: 2 },
  // Columns
  { indices: [0, 3, 6], direction: 'col', lineIndex: 0 },
  { indices: [1, 4, 7], direction: 'col', lineIndex: 1 },
  { indices: [2, 5, 8], direction: 'col', lineIndex: 2 },
  // Diagonals
  { indices: [0, 4, 8], direction: 'diag-main', lineIndex: 0 },
  { indices: [2, 4, 6], direction: 'diag-anti', lineIndex: 0 },
];

/**
 * Creates a fresh 3x3 empty board.
 */
export function createEmptyBoard(): BoardState {
  return Array(9).fill(null);
}

/**
 * Checks whether a move to cell `index` is valid given current board and game status.
 */
export function isValidMove(board: BoardState, index: number, isGameOver: boolean): boolean {
  if (isGameOver) return false;
  if (index < 0 || index > 8) return false;
  return board[index] === null;
}

/**
 * Applies a move to the board, returning a new immutable board state.
 * Throws or returns original board if move is invalid.
 */
export function makeMove(board: BoardState, index: number, player: Player): BoardState {
  if (index < 0 || index >= board.length || board[index] !== null) {
    return board;
  }
  const next = [...board];
  next[index] = player;
  return next;
}

/**
 * Returns all unoccupied cell indices.
 */
export function getAvailableMoves(board: BoardState): number[] {
  const moves: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      moves.push(i);
    }
  }
  return moves;
}

/**
 * Pure evaluator to check for winner, winning line, draw, or ongoing game.
 */
export function evaluateBoard(board: BoardState): GameStatus {
  // Check winning lines
  for (const winLine of WINNING_LINES) {
    const [a, b, c] = winLine.indices;
    const valA = board[a];
    if (valA !== null && valA === board[b] && valA === board[c]) {
      return {
        isOver: true,
        winner: valA,
        winningLine: winLine,
        isDraw: false,
      };
    }
  }

  // Check draw: all cells occupied and no winner
  const isFull = board.every((cell) => cell !== null);
  if (isFull) {
    return {
      isOver: true,
      winner: null,
      winningLine: null,
      isDraw: true,
    };
  }

  // Ongoing
  return {
    isOver: false,
    winner: null,
    winningLine: null,
    isDraw: false,
  };
}

/**
 * Switches current player.
 */
export function getNextPlayer(current: Player): Player {
  return current === 'X' ? 'O' : 'X';
}

/**
 * Minimax recursive algorithm for Tic-Tac-Toe AI.
 * Computer is 'O' (maximizing player).
 * Human is 'X' (minimizing player).
 */
function minimax(
  board: BoardState,
  depth: number,
  isMaximizing: boolean
): { score: number; move: number } {
  const status = evaluateBoard(board);

  if (status.isOver) {
    if (status.winner === 'O') {
      return { score: 10 - depth, move: -1 };
    }
    if (status.winner === 'X') {
      return { score: depth - 10, move: -1 };
    }
    // Draw
    return { score: 0, move: -1 };
  }

  const available = getAvailableMoves(board);

  if (isMaximizing) {
    let bestScore = -Infinity;
    let bestMove = available[0] ?? -1;

    for (const move of available) {
      const nextBoard = makeMove(board, move, 'O');
      const result = minimax(nextBoard, depth + 1, false);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMove = move;
      }
    }
    return { score: bestScore, move: bestMove };
  } else {
    let bestScore = Infinity;
    let bestMove = available[0] ?? -1;

    for (const move of available) {
      const nextBoard = makeMove(board, move, 'X');
      const result = minimax(nextBoard, depth + 1, true);
      if (result.score < bestScore) {
        bestScore = result.score;
        bestMove = move;
      }
    }
    return { score: bestScore, move: bestMove };
  }
}

/**
 * Computes the optimal move for Computer (O) using Minimax.
 * Always plays legally and defends/attacks optimally.
 */
export function getComputerMove(
  board: BoardState,
  difficulty: 'unbeatable' | 'casual' = 'unbeatable'
): number {
  const available = getAvailableMoves(board);
  if (available.length === 0) return -1;

  // If casual, 30% chance to pick a random legal move
  if (difficulty === 'casual' && Math.random() < 0.3) {
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }

  // Quick heuristics for early game speed
  if (available.length === 9) {
    // Empty board - center or corner
    return 4;
  }
  if (available.length === 8 && board[4] === null) {
    // If center is available on first response, take center
    return 4;
  }

  const result = minimax(board, 0, true);
  return result.move !== -1 ? result.move : available[0];
}

/**
 * LocalStorage score persistence keys & helpers
 */
const SCORE_STORAGE_PREFIX = 'pixel_afterglow_tictactoe_scores_';

export const INITIAL_SCORES: TicTacToeScores = {
  xWins: 0,
  oWins: 0,
  draws: 0,
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

export function loadScores(mode: TicTacToeMode = 'pvp'): TicTacToeScores {
  const storage = getStorage();
  if (!storage) return { ...INITIAL_SCORES };
  try {
    const key = `${SCORE_STORAGE_PREFIX}${mode}`;
    const saved = storage.getItem(key) || (mode === 'pvp' ? storage.getItem('pixel_afterglow_tictactoe_scores_v1') : null);
    if (!saved) return { ...INITIAL_SCORES };
    const parsed = JSON.parse(saved);
    return {
      xWins: typeof parsed.xWins === 'number' ? parsed.xWins : 0,
      oWins: typeof parsed.oWins === 'number' ? parsed.oWins : 0,
      draws: typeof parsed.draws === 'number' ? parsed.draws : 0,
    };
  } catch {
    return { ...INITIAL_SCORES };
  }
}

export function saveScores(scores: TicTacToeScores, mode: TicTacToeMode = 'pvp'): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const key = `${SCORE_STORAGE_PREFIX}${mode}`;
    storage.setItem(key, JSON.stringify(scores));
  } catch {
    // ignore quota errors
  }
}

export function clearStoredScores(mode: TicTacToeMode = 'pvp'): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const key = `${SCORE_STORAGE_PREFIX}${mode}`;
    storage.removeItem(key);
    if (mode === 'pvp') {
      storage.removeItem('pixel_afterglow_tictactoe_scores_v1');
    }
  } catch {
    // ignore
  }
}

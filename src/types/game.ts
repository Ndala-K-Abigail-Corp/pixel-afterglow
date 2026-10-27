/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type BoardState = CellValue[]; // 9 cells

export type TicTacToeMode = 'pvp' | 'pvc';

export interface WinningLine {
  indices: [number, number, number];
  direction: 'row' | 'col' | 'diag-main' | 'diag-anti';
  lineIndex: number; // 0, 1, 2 for row/col, 0 for diags
}

export interface GameStatus {
  isOver: boolean;
  winner: Player | null;
  winningLine: WinningLine | null;
  isDraw: boolean;
}

export interface TicTacToeScores {
  xWins: number;
  oWins: number;
  draws: number;
}

export interface TicTacToeModeScores {
  pvp: TicTacToeScores;
  pvc: TicTacToeScores;
}

export interface GameMetadata {
  id: string;
  title: string;
  tagline: string;
  description: string;
  status: 'playable' | 'coming-soon';
  badge: string;
  accentColor: string;
  category: string;
}

export type MemoryGameMode = 'time-challenge' | 'limited-moves';
export type MemoryDifficulty = 'easy' | 'medium' | 'hard';
export type MemoryGameOutcome = 'playing' | 'won' | 'lost-time' | 'lost-moves';

export interface MemoryDifficultyConfig {
  id: MemoryDifficulty;
  label: string;
  pairs: number;
  totalCards: number;
  timeLimitSeconds: number;
  maxAttempts: number;
  description: string;
}

export interface MemoryCard {
  id: number;
  symbolId: string;
  name: string;
  color: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export interface MemoryStats {
  bestTime: number | null;
  bestMoves: number | null;
  gamesPlayed: number;
}

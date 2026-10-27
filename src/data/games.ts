/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameMetadata } from '../types/game';

export const GAMES_CATALOG: GameMetadata[] = [
  {
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    tagline: 'Classic 3×3 grid showdown vs Friend or Computer',
    description: 'The definitive duel of wits. Play local two-player pass & play or challenge the computer with instant win detection, score persistence, and winning line highlights.',
    status: 'playable',
    badge: 'Play Now',
    accentColor: '#FF776E', // Pixel Coral
    category: 'Grid Duel',
  },
  {
    id: 'memory-match',
    title: 'Memory Match',
    tagline: 'Flip, match and collect paired 8-bit sprites',
    description: 'Test your retro recall in a race against the clock. Uncover pairs of nostalgic pixel icons, track elapsed time, count moves, and beat your best records.',
    status: 'playable',
    badge: 'Play Now',
    accentColor: '#56E0CB', // Electric Teal
    category: 'Arcade Puzzle',
  },
  {
    id: 'snake',
    title: 'Snake',
    tagline: 'Greedy retro reptile eating pixel apples',
    description: 'Slither across the vintage phosphor grid, gobble energised power-pixels, and dodge your own tail as your speed increases.',
    status: 'coming-soon',
    badge: 'Coming Soon',
    accentColor: '#FFC66D', // Golden Continue
    category: 'Arcade Classic',
  },
  {
    id: 'word-guessing',
    title: 'Word Guessing',
    tagline: 'Crack the mystery 5-letter cartridge code',
    description: 'Deduce the secret keyword one attempt at a time with instant color-coded clues inspired by retro microcomputer terminals.',
    status: 'coming-soon',
    badge: 'Coming Soon',
    accentColor: '#56E0CB', // Electric Teal
    category: 'Word Puzzle',
  },
];

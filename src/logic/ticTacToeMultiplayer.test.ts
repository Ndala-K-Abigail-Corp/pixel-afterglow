/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
} from './multiplayerRoom';
import {
  applyStartTicTacToeGame,
  applyTicTacToeMultiplayerMove,
  applyVoteTicTacToeRematch,
  applyStartTicTacToeRematch,
} from './ticTacToeMultiplayer';
import { ROOM_EXPIRY_POLICIES_MS } from '../types/multiplayer';

describe('Phase 3 – Multiplayer Tic-Tac-Toe Logic', () => {
  const BASE_NOW = 1_700_000_000_000;

  function createReadyTwoPlayerRoom() {
    const created = buildInitialRoomDocument({
      roomCode: 'TTT123',
      gameType: 'tic-tac-toe',
      hostUid: 'host-x',
      hostNickname: 'HostX',
      nowMs: BASE_NOW,
    });
    return applyPlayerJoinOrReconnect({
      room: created,
      uid: 'guest-o',
      nickname: 'GuestO',
      nowMs: BASE_NOW + 1000,
    });
  }

  it('assigns X to host and O to guest when host starts the match', () => {
    const waitingRoom = createReadyTwoPlayerRoom();
    const started = applyStartTicTacToeGame({
      room: waitingRoom,
      callerUid: 'host-x',
      nowMs: BASE_NOW + 2000,
    });

    expect(started.status).toBe('in_progress');
    expect(started.currentTurnUid).toBe('host-x');
    expect(started.ticTacToeState).not.toBeNull();
    expect(started.ticTacToeState?.playerXUid).toBe('host-x');
    expect(started.ticTacToeState?.playerOUid).toBe('guest-o');
    expect(started.ticTacToeState?.currentTurnSymbol).toBe('X');
    expect(started.ticTacToeState?.board).toEqual(Array(9).fill(null));
  });

  it('enforces turn order, rejects occupied cells, and rejects disconnected player moves', () => {
    const started = applyStartTicTacToeGame({
      room: createReadyTwoPlayerRoom(),
      callerUid: 'host-x',
      nowMs: BASE_NOW + 2000,
    });

    // Guest O cannot move on Host X's turn
    expect(() =>
      applyTicTacToeMultiplayerMove({
        room: started,
        callerUid: 'guest-o',
        cellIndex: 0,
        nowMs: BASE_NOW + 3000,
      })
    ).toThrow(/Wait for your turn/i);

    // Host X makes a valid move at cell 0
    const afterMove1 = applyTicTacToeMultiplayerMove({
      room: started,
      callerUid: 'host-x',
      cellIndex: 0,
      nowMs: BASE_NOW + 3000,
    });

    expect(afterMove1.ticTacToeState?.board[0]).toBe('X');
    expect(afterMove1.currentTurnUid).toBe('guest-o');
    expect(afterMove1.ticTacToeState?.currentTurnSymbol).toBe('O');

    // Guest O cannot move on occupied cell 0
    expect(() =>
      applyTicTacToeMultiplayerMove({
        room: afterMove1,
        callerUid: 'guest-o',
        cellIndex: 0,
        nowMs: BASE_NOW + 4000,
      })
    ).toThrow(/occupied/i);

    // Disconnected player cannot make a move
    expect(() =>
      applyTicTacToeMultiplayerMove({
        room: afterMove1,
        callerUid: 'guest-o',
        cellIndex: 4,
        nowMs: BASE_NOW + 3000 + ROOM_EXPIRY_POLICIES_MS.DISCONNECT_THRESHOLD_MS + 5000,
      })
    ).toThrow(/disconnected/i);
  });

  it('detects a winning combination, updates scores, and blocks moves after completion', () => {
    let room = applyStartTicTacToeGame({
      room: createReadyTwoPlayerRoom(),
      callerUid: 'host-x',
      nowMs: BASE_NOW,
    });

    // X: 0, O: 3, X: 1, O: 4, X: 2 (X wins top row)
    const moves: Array<{ uid: string; cell: number }> = [
      { uid: 'host-x', cell: 0 },
      { uid: 'guest-o', cell: 3 },
      { uid: 'host-x', cell: 1 },
      { uid: 'guest-o', cell: 4 },
      { uid: 'host-x', cell: 2 },
    ];

    for (const m of moves) {
      room = applyTicTacToeMultiplayerMove({
        room,
        callerUid: m.uid,
        cellIndex: m.cell,
        nowMs: BASE_NOW + 1000,
      });
    }

    expect(room.status).toBe('completed');
    expect(room.ticTacToeState?.winnerSymbol).toBe('X');
    expect(room.ticTacToeState?.winnerUid).toBe('host-x');
    expect(room.ticTacToeState?.winningLine?.indices).toEqual([0, 1, 2]);
    expect(room.ticTacToeState?.scores).toEqual({ xWins: 1, oWins: 0, draws: 0 });
    expect(room.players['host-x'].score).toBe(1);

    // Further moves after game completion are rejected
    expect(() =>
      applyTicTacToeMultiplayerMove({
        room,
        callerUid: 'guest-o',
        cellIndex: 5,
        nowMs: BASE_NOW + 2000,
      })
    ).toThrow(/not in progress/i);
  });

  it('detects a full-board draw accurately', () => {
    let room = applyStartTicTacToeGame({
      room: createReadyTwoPlayerRoom(),
      callerUid: 'host-x',
      nowMs: BASE_NOW,
    });

    // Draw sequence:
    // X:0, O:1, X:2
    // O:4, X:3, O:5
    // X:7, O:6, X:8
    const drawMoves: Array<{ uid: string; cell: number }> = [
      { uid: 'host-x', cell: 0 },
      { uid: 'guest-o', cell: 1 },
      { uid: 'host-x', cell: 2 },
      { uid: 'guest-o', cell: 4 },
      { uid: 'host-x', cell: 3 },
      { uid: 'guest-o', cell: 5 },
      { uid: 'host-x', cell: 7 },
      { uid: 'guest-o', cell: 6 },
      { uid: 'host-x', cell: 8 },
    ];

    for (const m of drawMoves) {
      room = applyTicTacToeMultiplayerMove({
        room,
        callerUid: m.uid,
        cellIndex: m.cell,
        nowMs: BASE_NOW + 1000,
      });
    }

    expect(room.status).toBe('completed');
    expect(room.ticTacToeState?.isDraw).toBe(true);
    expect(room.ticTacToeState?.winnerSymbol).toBeNull();
    expect(room.ticTacToeState?.scores).toEqual({ xWins: 0, oWins: 0, draws: 1 });
  });

  it('requires both players to agree before host initiates a rematch and preserves scores', () => {
    let room = applyStartTicTacToeGame({
      room: createReadyTwoPlayerRoom(),
      callerUid: 'host-x',
      nowMs: BASE_NOW,
    });

    const winMoves = [
      { uid: 'host-x', cell: 0 },
      { uid: 'guest-o', cell: 3 },
      { uid: 'host-x', cell: 1 },
      { uid: 'guest-o', cell: 4 },
      { uid: 'host-x', cell: 2 },
    ];
    for (const m of winMoves) {
      room = applyTicTacToeMultiplayerMove({
        room,
        callerUid: m.uid,
        cellIndex: m.cell,
        nowMs: BASE_NOW + 1000,
      });
    }

    // Host cannot start rematch before guest agrees
    expect(() =>
      applyStartTicTacToeRematch({
        room,
        callerUid: 'host-x',
        nowMs: BASE_NOW + 2000,
      })
    ).toThrow(/Both players must agree/i);

    // Guest votes to accept rematch
    room = applyVoteTicTacToeRematch({
      room,
      callerUid: 'guest-o',
      nowMs: BASE_NOW + 2500,
    });
    expect(room.players['guest-o'].rematchAccepted).toBe(true);

    // Non-host cannot initiate rematch
    expect(() =>
      applyStartTicTacToeRematch({
        room,
        callerUid: 'guest-o',
        nowMs: BASE_NOW + 3000,
      })
    ).toThrow(/Only the room host/i);

    // Host votes & starts rematch
    room = applyVoteTicTacToeRematch({
      room,
      callerUid: 'host-x',
      nowMs: BASE_NOW + 3000,
    });
    const rematchRoom = applyStartTicTacToeRematch({
      room,
      callerUid: 'host-x',
      nowMs: BASE_NOW + 3500,
    });

    expect(rematchRoom.status).toBe('in_progress');
    expect(rematchRoom.ticTacToeState?.roundNumber).toBe(2);
    expect(rematchRoom.ticTacToeState?.board).toEqual(Array(9).fill(null));
    expect(rematchRoom.ticTacToeState?.currentTurnSymbol).toBe('X');
    expect(rematchRoom.ticTacToeState?.scores).toEqual({ xWins: 1, oWins: 0, draws: 0 });
    expect(rematchRoom.players['host-x'].rematchAccepted).toBe(false);
    expect(rematchRoom.players['guest-o'].rematchAccepted).toBe(false);
  });
});

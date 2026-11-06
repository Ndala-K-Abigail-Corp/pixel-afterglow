/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MultiplayerRoomDocument,
  RoomPlayer,
  TicTacToeMultiplayerState,
  computeRoomExpiresAt,
  isRoomExpired,
} from '../types/multiplayer';
import {
  createEmptyBoard,
  evaluateBoard,
  getNextPlayer,
  isValidMove,
  makeMove,
} from './ticTacToe';
import {
  ROOMS_COLLECTION,
  MultiplayerRoomError,
  isPlayerEffectivelyConnected,
  normalizeRoomCode,
  validateHostCanStartGame,
} from './multiplayerRoom';
import { ensureAnonymousSession } from '../lib/auth';
import { getDocRef, runFirestoreTransaction } from '../lib/firestore';

/**
 * Pure state transition for the host starting a 2-player Tic-Tac-Toe match.
 * Assigns X to the host and O to the second player.
 */
export function applyStartTicTacToeGame(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room, callerUid } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.gameType !== 'tic-tac-toe') {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Room is not configured for Tic-Tac-Toe.'
    );
  }

  validateHostCanStartGame(room, callerUid, nowMs);

  const playerXUid = room.hostUid;
  const playerOUid = room.playerOrder.find((id) => id !== room.hostUid);

  if (!playerOUid || !room.players[playerXUid] || !room.players[playerOUid]) {
    throw new MultiplayerRoomError(
      'NOT_ENOUGH_PLAYERS',
      'Both players must be present before starting Tic-Tac-Toe.'
    );
  }

  if (!isPlayerEffectivelyConnected(room.players[playerOUid], nowMs)) {
    throw new MultiplayerRoomError(
      'PLAYER_DISCONNECTED',
      'Cannot start while the second player is disconnected.'
    );
  }

  const updatedPlayers: Record<string, RoomPlayer> = {
    ...room.players,
    [playerXUid]: {
      ...room.players[playerXUid],
      symbol: 'X',
      rematchAccepted: false,
    },
    [playerOUid]: {
      ...room.players[playerOUid],
      symbol: 'O',
      rematchAccepted: false,
    },
  };

  const ticTacToeState: TicTacToeMultiplayerState = {
    board: createEmptyBoard(),
    currentTurnSymbol: 'X',
    currentTurnUid: playerXUid,
    playerXUid,
    playerOUid,
    winnerSymbol: null,
    winnerUid: null,
    isDraw: false,
    winningLine: null,
    roundNumber: 1,
    scores: {
      xWins: 0,
      oWins: 0,
      draws: 0,
    },
  };

  return {
    ...room,
    status: 'in_progress',
    players: updatedPlayers,
    currentTurnUid: playerXUid,
    startedAt: nowMs,
    completedAt: null,
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('in_progress', nowMs),
    ticTacToeState,
  };
}

/**
 * Pure validator & reducer for a player making a move in Multiplayer Tic-Tac-Toe.
 */
export function applyTicTacToeMultiplayerMove(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  cellIndex: number;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room, callerUid, cellIndex } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is closed.');
  }
  if (isRoomExpired(room, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired.');
  }
  if (room.status !== 'in_progress' || !room.ticTacToeState) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Cannot make a move when the game is not in progress.'
    );
  }

  const caller = room.players[callerUid];
  if (!caller) {
    throw new MultiplayerRoomError('NOT_YOUR_TURN', 'You are not a player in this room.');
  }
  if (!isPlayerEffectivelyConnected(caller, nowMs)) {
    throw new MultiplayerRoomError(
      'PLAYER_DISCONNECTED',
      'You appear to be disconnected. Reconnect before making a move.'
    );
  }

  const gameState = room.ticTacToeState;
  if (room.currentTurnUid !== callerUid || gameState.currentTurnUid !== callerUid) {
    throw new MultiplayerRoomError('NOT_YOUR_TURN', 'Wait for your turn to make a move.');
  }

  if (gameState.winnerSymbol !== null || gameState.isDraw) {
    throw new MultiplayerRoomError('INVALID_MOVE', 'This round has already finished.');
  }

  if (!isValidMove(gameState.board, cellIndex, false)) {
    throw new MultiplayerRoomError(
      'INVALID_MOVE',
      'That cell is already occupied or out of bounds.'
    );
  }

  const activeSymbol = gameState.currentTurnSymbol;
  const nextBoard = makeMove(gameState.board, cellIndex, activeSymbol);
  const evalStatus = evaluateBoard(nextBoard);

  if (evalStatus.isOver) {
    const winnerSymbol = evalStatus.winner;
    const winnerUid =
      winnerSymbol === 'X'
        ? gameState.playerXUid
        : winnerSymbol === 'O'
        ? gameState.playerOUid
        : null;

    const nextScores = {
      xWins: gameState.scores.xWins + (winnerSymbol === 'X' ? 1 : 0),
      oWins: gameState.scores.oWins + (winnerSymbol === 'O' ? 1 : 0),
      draws: gameState.scores.draws + (evalStatus.isDraw ? 1 : 0),
    };

    const updatedPlayers: Record<string, RoomPlayer> = {
      ...room.players,
      [callerUid]: {
        ...caller,
        score: caller.score + (winnerUid === callerUid ? 1 : 0),
        rematchAccepted: false,
        lastSeenAt: nowMs,
        connectionStatus: 'connected',
      },
    };

    return {
      ...room,
      status: 'completed',
      players: updatedPlayers,
      currentTurnUid: null,
      completedAt: nowMs,
      lastActivityAt: nowMs,
      expiresAt: computeRoomExpiresAt('completed', nowMs),
      ticTacToeState: {
        ...gameState,
        board: nextBoard,
        winnerSymbol,
        winnerUid,
        isDraw: evalStatus.isDraw,
        winningLine: evalStatus.winningLine,
        scores: nextScores,
      },
    };
  }

  const nextSymbol = getNextPlayer(activeSymbol);
  const nextTurnUid =
    nextSymbol === 'X' ? gameState.playerXUid : gameState.playerOUid;

  return {
    ...room,
    players: {
      ...room.players,
      [callerUid]: {
        ...caller,
        lastSeenAt: nowMs,
        connectionStatus: 'connected',
      },
    },
    currentTurnUid: nextTurnUid,
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('in_progress', nowMs),
    ticTacToeState: {
      ...gameState,
      board: nextBoard,
      currentTurnSymbol: nextSymbol,
      currentTurnUid: nextTurnUid,
    },
  };
}

/**
 * Records a player's agreement to a rematch after a completed Tic-Tac-Toe round.
 */
export function applyVoteTicTacToeRematch(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room, callerUid } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is closed.');
  }
  if (isRoomExpired(room, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired.');
  }
  if (room.status !== 'completed' || !room.ticTacToeState) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Rematch voting is only available after a round ends.'
    );
  }

  const caller = room.players[callerUid];
  if (!caller) {
    throw new MultiplayerRoomError('NOT_YOUR_TURN', 'You are not a player in this room.');
  }
  if (!isPlayerEffectivelyConnected(caller, nowMs)) {
    throw new MultiplayerRoomError(
      'PLAYER_DISCONNECTED',
      'Reconnect before voting for a rematch.'
    );
  }

  return {
    ...room,
    players: {
      ...room.players,
      [callerUid]: {
        ...caller,
        rematchAccepted: true,
        lastSeenAt: nowMs,
        connectionStatus: 'connected',
      },
    },
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('completed', nowMs),
  };
}

/**
 * Host-only action to start the new round once both players have agreed to a rematch.
 * Resets the board and turn state while preserving the room, player identities, and scores.
 */
export function applyStartTicTacToeRematch(params: {
  room: MultiplayerRoomDocument;
  callerUid: string;
  nowMs?: number;
}): MultiplayerRoomDocument {
  const { room, callerUid } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (room.status === 'closed') {
    throw new MultiplayerRoomError('ROOM_CLOSED', 'This room is closed.');
  }
  if (isRoomExpired(room, nowMs)) {
    throw new MultiplayerRoomError('ROOM_EXPIRED', 'This room has expired.');
  }
  if (room.hostUid !== callerUid) {
    throw new MultiplayerRoomError(
      'NOT_HOST',
      'Only the room host can initiate the rematch round.'
    );
  }
  if (room.status !== 'completed' || !room.ticTacToeState) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Can only start a rematch from a completed game.'
    );
  }

  const { playerXUid, playerOUid } = room.ticTacToeState;
  const playerX = room.players[playerXUid];
  const playerO = room.players[playerOUid];

  if (!playerX || !playerO) {
    throw new MultiplayerRoomError(
      'NOT_ENOUGH_PLAYERS',
      'Both players must remain in the room for a rematch.'
    );
  }

  // Host initiating the rematch implicitly counts as the host agreeing if only the guest had clicked first
  const hostAgreed = playerX.rematchAccepted || callerUid === playerXUid;
  const guestAgreed = playerO.rematchAccepted;

  if (!hostAgreed || !guestAgreed) {
    throw new MultiplayerRoomError(
      'INVALID_STATE_TRANSITION',
      'Both players must agree to a rematch before starting the next round.'
    );
  }

  const updatedPlayers: Record<string, RoomPlayer> = {
    ...room.players,
    [playerXUid]: {
      ...playerX,
      rematchAccepted: false,
      lastSeenAt: callerUid === playerXUid ? nowMs : playerX.lastSeenAt,
      connectionStatus: 'connected',
    },
    [playerOUid]: {
      ...playerO,
      rematchAccepted: false,
    },
  };

  return {
    ...room,
    status: 'in_progress',
    players: updatedPlayers,
    currentTurnUid: playerXUid,
    startedAt: nowMs,
    completedAt: null,
    lastActivityAt: nowMs,
    expiresAt: computeRoomExpiresAt('in_progress', nowMs),
    ticTacToeState: {
      ...room.ticTacToeState,
      board: createEmptyBoard(),
      currentTurnSymbol: 'X',
      currentTurnUid: playerXUid,
      winnerSymbol: null,
      winnerUid: null,
      isDraw: false,
      winningLine: null,
      roundNumber: room.ticTacToeState.roundNumber + 1,
    },
  };
}

/**
 * Firestore transaction: Host starts the Tic-Tac-Toe multiplayer match.
 */
export async function startTicTacToeMultiplayerGame(
  roomCode: string
): Promise<MultiplayerRoomDocument> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const user = await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      throw new MultiplayerRoomError('ROOM_NOT_FOUND', 'Room no longer exists.');
    }

    const nextRoom = applyStartTicTacToeGame({
      room: snap.data(),
      callerUid: user.uid,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        players: nextRoom.players,
        currentTurnUid: nextRoom.currentTurnUid,
        startedAt: nextRoom.startedAt,
        completedAt: nextRoom.completedAt,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
        ticTacToeState: nextRoom.ticTacToeState,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return nextRoom;
  });
}

/**
 * Firestore transaction: Active turn player submits a move on the 3x3 board.
 */
export async function makeTicTacToeMultiplayerMove(
  roomCode: string,
  cellIndex: number
): Promise<MultiplayerRoomDocument> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const user = await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      throw new MultiplayerRoomError('ROOM_NOT_FOUND', 'Room no longer exists.');
    }

    const nextRoom = applyTicTacToeMultiplayerMove({
      room: snap.data(),
      callerUid: user.uid,
      cellIndex,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        players: nextRoom.players,
        currentTurnUid: nextRoom.currentTurnUid,
        completedAt: nextRoom.completedAt,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
        ticTacToeState: nextRoom.ticTacToeState,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return nextRoom;
  });
}

/**
 * Firestore transaction: Player votes to accept a rematch.
 */
export async function voteTicTacToeRematch(
  roomCode: string
): Promise<MultiplayerRoomDocument> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const user = await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      throw new MultiplayerRoomError('ROOM_NOT_FOUND', 'Room no longer exists.');
    }

    const nextRoom = applyVoteTicTacToeRematch({
      room: snap.data(),
      callerUid: user.uid,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        [`players.${user.uid}.rematchAccepted`]: true,
        [`players.${user.uid}.lastSeenAt`]: nextRoom.lastActivityAt,
        [`players.${user.uid}.connectionStatus`]: 'connected',
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return nextRoom;
  });
}

/**
 * Firestore transaction: Host initiates the rematch round after both players agree.
 */
export async function startTicTacToeRematch(
  roomCode: string
): Promise<MultiplayerRoomDocument> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const user = await ensureAnonymousSession();
  const roomRef = getDocRef<MultiplayerRoomDocument>(ROOMS_COLLECTION, normalizedCode);

  return runFirestoreTransaction(async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) {
      throw new MultiplayerRoomError('ROOM_NOT_FOUND', 'Room no longer exists.');
    }

    const nextRoom = applyStartTicTacToeRematch({
      room: snap.data(),
      callerUid: user.uid,
      nowMs: Date.now(),
    });

    if (typeof transaction.update === 'function') {
      transaction.update(roomRef, {
        status: nextRoom.status,
        players: nextRoom.players,
        currentTurnUid: nextRoom.currentTurnUid,
        startedAt: nextRoom.startedAt,
        completedAt: nextRoom.completedAt,
        lastActivityAt: nextRoom.lastActivityAt,
        expiresAt: nextRoom.expiresAt,
        ticTacToeState: nextRoom.ticTacToeState,
      });
    } else {
      transaction.set(roomRef, nextRoom);
    }
    return nextRoom;
  });
}

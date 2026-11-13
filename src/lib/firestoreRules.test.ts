/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import type {
  MemoryMultiplayerPlayerCount,
  MultiplayerRoomDocument,
} from '../types/multiplayer';
import {
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
  applyPlayerLeaveOrClose,
} from '../logic/multiplayerRoom';
import {
  applyStartTicTacToeGame,
  applyTicTacToeMultiplayerMove,
  applyVoteTicTacToeRematch,
  applyStartTicTacToeRematch,
} from '../logic/ticTacToeMultiplayer';
import {
  applyStartMemoryMatchGame,
  applySelectMemoryMatchCard,
  applyResolveMemoryMatchMismatch,
  applyStartMemoryMatchRematch,
} from '../logic/memoryMatchMultiplayer';

/**
 * Faithful TypeScript evaluator for the Firestore Security Rules in `firestore.rules`
 * (`match /rooms/{roomCode}`), implementing Firestore Rules v2 `Map.diff()` (`addedKeys`,
 * `removedKeys`, `changedKeys`, `affectedKeys`) and `request.time.toMillis()` semantics
 * so every rule predicate can be unit-tested in Vitest without requiring a local JVM.
 */
interface RuleEvalContext {
  auth: { uid: string } | null;
  timeMs: number;
  roomCode: string;
  resourceData?: MultiplayerRoomDocument | null;
  requestResourceData?: MultiplayerRoomDocument | null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mapDiff(
  afterMap: Record<string, unknown> | undefined | null,
  beforeMap: Record<string, unknown> | undefined | null
) {
  const after = afterMap ?? {};
  const before = beforeMap ?? {};
  const afterKeys = Object.keys(after);
  const beforeKeys = Object.keys(before);

  const addedKeys = afterKeys.filter((k) => !(k in before));
  const removedKeys = beforeKeys.filter((k) => !(k in after));
  const changedKeys = afterKeys.filter(
    (k) => k in before && !deepEqual(after[k], before[k])
  );
  const affectedKeys = Array.from(new Set([...addedKeys, ...removedKeys, ...changedKeys]));

  const hasOnly = (keys: string[], allowed: string[]) =>
    keys.every((k) => allowed.includes(k));

  return {
    addedKeys,
    removedKeys,
    changedKeys,
    affectedKeys,
    addedHasOnly: (allowed: string[]) => hasOnly(addedKeys, allowed),
    removedHasOnly: (allowed: string[]) => hasOnly(removedKeys, allowed),
    changedHasOnly: (allowed: string[]) => hasOnly(changedKeys, allowed),
    affectedHasOnly: (allowed: string[]) => hasOnly(affectedKeys, allowed),
  };
}

function evaluateRoomsRule(
  operation: 'read' | 'create' | 'update' | 'delete',
  ctx: RuleEvalContext
): boolean {
  const isSignedIn = Boolean(ctx.auth && ctx.auth.uid);
  const authUid = ctx.auth?.uid ?? '';
  const res = ctx.resourceData ?? null;
  const req = ctx.requestResourceData ?? null;

  const isRoomMember = (roomData: MultiplayerRoomDocument) =>
    isSignedIn && authUid in roomData.players;

  const isRoomHost = (roomData: MultiplayerRoomDocument) =>
    isSignedIn && roomData.hostUid === authUid;

  const isValidTransition = (fromStatus: string, toStatus: string) =>
    fromStatus === toStatus ||
    (fromStatus === 'waiting' && ['in_progress', 'closed', 'expired'].includes(toStatus)) ||
    (fromStatus === 'in_progress' && ['completed', 'closed', 'expired'].includes(toStatus)) ||
    (fromStatus === 'completed' && ['in_progress', 'closed', 'expired'].includes(toStatus)) ||
    (fromStatus === 'closed' && toStatus === 'expired');

  if (operation === 'read') {
    return isSignedIn;
  }

  if (operation === 'create') {
    if (!isSignedIn || !req) return false;
    return (
      req.roomCode === ctx.roomCode &&
      req.hostUid === authUid &&
      req.status === 'waiting' &&
      ['tic-tac-toe', 'memory-match'].includes(req.gameType) &&
      [2, 3, 4, 5, 6, 7, 8].includes(req.maxPlayers) &&
      authUid in req.players &&
      req.players[authUid].uid === authUid &&
      req.players[authUid].isHost === true &&
      req.players[authUid].score === 0 &&
      req.playerOrder.length === 1 &&
      req.playerOrder[0] === authUid
    );
  }

  if (operation === 'delete') {
    if (!isSignedIn || !res) return false;
    return (
      isRoomHost(res) ||
      ['closed', 'expired'].includes(res.status) ||
      ctx.timeMs >= res.expiresAt ||
      res.playerOrder.length === 0
    );
  }

  // operation === 'update'
  if (!isSignedIn || !res || !req) return false;

  const immutableFieldsUnchanged =
    req.roomCode === res.roomCode &&
    req.gameType === res.gameType &&
    req.hostUid === res.hostUid &&
    req.maxPlayers === res.maxPlayers &&
    req.createdAt === res.createdAt;

  if (!immutableFieldsUnchanged) return false;
  if (!isValidTransition(res.status, req.status)) return false;
  if (['closed', 'expired'].includes(res.status)) return false;

  const playersDiff = mapDiff(req.players, res.players);

  const onlyCallerPlayerModified = () =>
    authUid in res.players &&
    authUid in req.players &&
    playersDiff.addedKeys.length === 0 &&
    playersDiff.removedKeys.length === 0 &&
    playersDiff.changedHasOnly([authUid]) &&
    req.players[authUid].uid === res.players[authUid].uid &&
    req.players[authUid].isHost === res.players[authUid].isHost &&
    req.players[authUid].joinedAt === res.players[authUid].joinedAt &&
    req.players[authUid].symbol === res.players[authUid].symbol;

  const callerScoreUnchanged = () =>
    onlyCallerPlayerModified() &&
    req.players[authUid].score === res.players[authUid].score;

  const isValidWaitingRoomJoin = () =>
    !(authUid in res.players) &&
    authUid in req.players &&
    playersDiff.addedHasOnly([authUid]) &&
    playersDiff.removedKeys.length === 0 &&
    playersDiff.changedKeys.length === 0 &&
    req.players[authUid].uid === authUid &&
    req.players[authUid].isHost === false &&
    req.players[authUid].score === 0 &&
    req.players[authUid].rematchAccepted === false &&
    req.playerOrder.length === res.playerOrder.length + 1 &&
    req.playerOrder.length <= res.maxPlayers &&
    req.playerOrder.includes(authUid);

  const isValidWaitingRoomLeave = () =>
    authUid in res.players &&
    !isRoomHost(res) &&
    !(authUid in req.players) &&
    playersDiff.addedKeys.length === 0 &&
    playersDiff.removedHasOnly([authUid]) &&
    playersDiff.changedKeys.length === 0 &&
    req.playerOrder.length === res.playerOrder.length - 1 &&
    !req.playerOrder.includes(authUid);

  const isValidMemoryMatchPairOwnershipDiff = () => {
    const prevMM = res.memoryMatchState;
    const nextMM = req.memoryMatchState;
    if (!prevMM || !nextMM) return false;
    const pairDelta = nextMM.matchedPairs - prevMM.matchedPairs;
    const ownerDiff = mapDiff(nextMM.matchedByPairKey ?? {}, prevMM.matchedByPairKey ?? {});
    return (
      pairDelta >= 0 &&
      pairDelta <= 1 &&
      ownerDiff.removedKeys.length === 0 &&
      ownerDiff.changedKeys.length === 0 &&
      ownerDiff.addedKeys.length === pairDelta &&
      (pairDelta === 0 ||
        (nextMM.lastMatchedPairKey !== null &&
          nextMM.lastMatchedPairKey !== undefined &&
          ownerDiff.addedHasOnly([nextMM.lastMatchedPairKey]) &&
          (nextMM.matchedByPairKey ?? {})[nextMM.lastMatchedPairKey] === authUid))
    );
  };

  const isValidMemoryMatchTurnMove = () => {
    const prevMM = res.memoryMatchState;
    const nextMM = req.memoryMatchState;
    if (res.gameType !== 'memory-match' || !prevMM || !nextMM) return false;
    const pairDelta = nextMM.matchedPairs - prevMM.matchedPairs;
    return (
      deepEqual(req.ticTacToeState, res.ticTacToeState) &&
      nextMM.totalPairs === prevMM.totalPairs &&
      deepEqual(nextMM.turnOrderUids, prevMM.turnOrderUids) &&
      nextMM.cards.length === prevMM.cards.length &&
      isValidMemoryMatchPairOwnershipDiff() &&
      onlyCallerPlayerModified() &&
      req.players[authUid].score === res.players[authUid].score + pairDelta
    );
  };

  const isValidTicTacToeTurnMove = () => {
    const prevTTT = res.ticTacToeState;
    const nextTTT = req.ticTacToeState;
    if (res.gameType !== 'tic-tac-toe' || !prevTTT || !nextTTT) return false;
    if (!onlyCallerPlayerModified()) return false;
    const scoreDelta = req.players[authUid].score - res.players[authUid].score;
    return (
      deepEqual(req.memoryMatchState, res.memoryMatchState) &&
      nextTTT.playerXUid === prevTTT.playerXUid &&
      nextTTT.playerOUid === prevTTT.playerOUid &&
      nextTTT.roundNumber === prevTTT.roundNumber &&
      nextTTT.board.length === 9 &&
      scoreDelta >= 0 &&
      scoreDelta <= 1 &&
      (scoreDelta === 0 || req.status === 'completed')
    );
  };

  const isValidMismatchReset = () => {
    const prevMM = res.memoryMatchState;
    const nextMM = req.memoryMatchState;
    if (res.gameType !== 'memory-match' || req.status !== 'in_progress' || !prevMM || !nextMM) {
      return false;
    }
    const mmDiff = mapDiff(
      nextMM as unknown as Record<string, unknown>,
      prevMM as unknown as Record<string, unknown>
    );
    return (
      prevMM.pendingResetAt !== null &&
      prevMM.flippedCardIds.length === 2 &&
      deepEqual(req.players, res.players) &&
      deepEqual(req.ticTacToeState, res.ticTacToeState) &&
      mmDiff.affectedHasOnly([
        'cards',
        'lastMatchedPairKey',
        'currentTurnIndex',
        'currentTurnUid',
        'flippedCardIds',
        'pendingResetAt',
      ]) &&
      nextMM.totalPairs === prevMM.totalPairs &&
      nextMM.matchedPairs === prevMM.matchedPairs &&
      deepEqual(nextMM.matchedByPairKey, prevMM.matchedByPairKey) &&
      deepEqual(nextMM.turnOrderUids, prevMM.turnOrderUids) &&
      deepEqual(nextMM.winnerUids, prevMM.winnerUids) &&
      nextMM.isTie === prevMM.isTie &&
      nextMM.flippedCardIds.length === 0 &&
      nextMM.pendingResetAt === null &&
      req.currentTurnUid === nextMM.currentTurnUid &&
      res.playerOrder.includes(req.currentTurnUid ?? '')
    );
  };

  const rematchPlayerReset = (uid: string): boolean =>
    req.players[uid].score === 0 && req.players[uid].rematchAccepted === false;

  const minPlayersForRoom = (roomData: MultiplayerRoomDocument): number =>
    roomData.gameType === 'tic-tac-toe' || roomData.maxPlayers <= 2 ? 2 : 3;

  const expectedPairsForPlayerCount = (playerCount: number): number =>
    playerCount === 2
      ? 10
      : playerCount === 3
      ? 20
      : playerCount === 4
      ? 30
      : 50;

  const isValidMemoryMatchRematchStart = (): boolean => {
    const order = res.playerOrder;
    const prevMM = res.memoryMatchState;
    const nextMM = req.memoryMatchState;
    if (res.gameType !== 'memory-match' || !prevMM || !nextMM || !isRoomHost(res)) return false;
    const expectedPairs = expectedPairsForPlayerCount(order.length);
    return (
      order.length >= minPlayersForRoom(res) &&
      order.length <= res.maxPlayers &&
      req.status === 'in_progress' &&
      req.currentTurnUid === order[0] &&
      nextMM.currentTurnUid === order[0] &&
      nextMM.currentTurnIndex === 0 &&
      deepEqual(nextMM.turnOrderUids, order) &&
      nextMM.roundNumber === (prevMM.roundNumber ?? 1) + 1 &&
      nextMM.matchedPairs === 0 &&
      Object.keys(nextMM.matchedByPairKey ?? {}).length === 0 &&
      nextMM.totalPairs === expectedPairs &&
      nextMM.cards.length === expectedPairs * 2 &&
      nextMM.totalPairs === prevMM.totalPairs &&
      nextMM.cards.length === prevMM.cards.length &&
      nextMM.flippedCardIds.length === 0 &&
      nextMM.pendingResetAt === null &&
      nextMM.winnerUids.length === 0 &&
      nextMM.isTie === false &&
      deepEqual(req.ticTacToeState, res.ticTacToeState) &&
      order.every((uid) => rematchPlayerReset(uid))
    );
  };

  // Branch 1: Expiry transition requires timestamp >= expiresAt
  if (req.status === 'expired' && ctx.timeMs >= res.expiresAt) {
    return true;
  }

  // Branch 2: Host closing the room
  if (
    req.status === 'closed' &&
    isRoomHost(res) &&
    deepEqual(req.playerOrder, res.playerOrder)
  ) {
    return true;
  }

  // Branch 3: Waiting room operations
  if (
    res.status === 'waiting' &&
    req.status === 'waiting' &&
    req.ticTacToeState === null &&
    req.memoryMatchState === null &&
    (isValidWaitingRoomJoin() ||
      (callerScoreUnchanged() && deepEqual(req.playerOrder, res.playerOrder)) ||
      isValidWaitingRoomLeave())
  ) {
    return true;
  }

  // Branch 4: Host starting the game
  if (
    res.status === 'waiting' &&
    req.status === 'in_progress' &&
    isRoomHost(res) &&
    res.playerOrder.length >= minPlayersForRoom(res) &&
    res.playerOrder.length <= res.maxPlayers &&
    deepEqual(req.playerOrder, res.playerOrder) &&
    playersDiff.addedKeys.length === 0 &&
    playersDiff.removedKeys.length === 0 &&
    req.currentTurnUid === res.playerOrder[0] &&
    (res.gameType !== 'memory-match' ||
      (req.memoryMatchState !== null &&
        req.memoryMatchState.matchedPairs === 0 &&
        Object.keys(req.memoryMatchState.matchedByPairKey ?? {}).length === 0 &&
        deepEqual(req.memoryMatchState.turnOrderUids, res.playerOrder) &&
        req.memoryMatchState.totalPairs ===
          expectedPairsForPlayerCount(res.playerOrder.length) &&
        req.memoryMatchState.cards.length ===
          expectedPairsForPlayerCount(res.playerOrder.length) * 2))
  ) {
    return true;
  }

  // Branch 5: Active gameplay updates
  if (
    res.status === 'in_progress' &&
    ['in_progress', 'completed'].includes(req.status) &&
    isRoomMember(res) &&
    deepEqual(req.playerOrder, res.playerOrder) &&
    ((res.currentTurnUid === authUid &&
      (isValidMemoryMatchTurnMove() || isValidTicTacToeTurnMove())) ||
      (req.status === 'in_progress' &&
        req.currentTurnUid === res.currentTurnUid &&
        deepEqual(req.ticTacToeState, res.ticTacToeState) &&
        deepEqual(req.memoryMatchState, res.memoryMatchState) &&
        callerScoreUnchanged()) ||
      isValidMismatchReset())
  ) {
    return true;
  }

  // Branch 6: Post-game rematch voting or host initiating rematch
  if (
    res.status === 'completed' &&
    isRoomMember(res) &&
    deepEqual(req.playerOrder, res.playerOrder) &&
    ((req.status === 'completed' &&
      deepEqual(req.ticTacToeState, res.ticTacToeState) &&
      deepEqual(req.memoryMatchState, res.memoryMatchState) &&
      callerScoreUnchanged()) ||
      (req.status === 'in_progress' &&
        isRoomHost(res) &&
        playersDiff.addedKeys.length === 0 &&
        playersDiff.removedKeys.length === 0 &&
        (res.gameType !== 'memory-match' || isValidMemoryMatchRematchStart())))
  ) {
    return true;
  }

  return false;
}

describe('Firestore Security Rules Verification (`firestore.rules`)', () => {
  const BASE_NOW = 1_700_000_000_000;
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  it('contains all required security functions and invariants in firestore.rules', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).not.toMatch(/allow\s+read,\s*write:\s*if\s*true/i);
    expect(rulesText).toContain('request.resource.data.hostUid == resource.data.hostUid');
    expect(rulesText).toContain('request.time.toMillis() >= resource.data.expiresAt');
    expect(rulesText).toContain('request.resource.data.playerOrder == resource.data.playerOrder');
    expect(rulesText).toContain('function onlyCallerPlayerModified()');
    expect(rulesText).toContain('function callerScoreUnchanged()');
    expect(rulesText).toContain('function isValidWaitingRoomJoin()');
    expect(rulesText).toContain('function isValidMemoryMatchPairOwnershipDiff()');
    expect(rulesText).toContain('function isValidMismatchReset()');
  });

  it('1. blocks unauthenticated users from reading, creating, updating, or deleting rooms', () => {
    const waitingRoom = buildInitialRoomDocument({
      roomCode: 'SEC123',
      gameType: 'memory-match',
      hostUid: 'host-1',
      hostNickname: 'HostOne',
      maxPlayers: 2,
      nowMs: BASE_NOW,
    });

    expect(
      evaluateRoomsRule('read', {
        auth: null,
        timeMs: BASE_NOW,
        roomCode: 'SEC123',
        resourceData: waitingRoom,
      })
    ).toBe(false);

    expect(
      evaluateRoomsRule('create', {
        auth: null,
        timeMs: BASE_NOW,
        roomCode: 'SEC123',
        requestResourceData: waitingRoom,
      })
    ).toBe(false);

    expect(
      evaluateRoomsRule('update', {
        auth: null,
        timeMs: BASE_NOW,
        roomCode: 'SEC123',
        resourceData: waitingRoom,
        requestResourceData: waitingRoom,
      })
    ).toBe(false);

    expect(
      evaluateRoomsRule('delete', {
        auth: null,
        timeMs: BASE_NOW,
        roomCode: 'SEC123',
        resourceData: waitingRoom,
      })
    ).toBe(false);
  });

  it('2. prevents guests from taking over rooms (modifying hostUid or setting isHost: true)', () => {
    const waitingRoom = buildInitialRoomDocument({
      roomCode: 'SEC123',
      gameType: 'memory-match',
      hostUid: 'host-1',
      hostNickname: 'HostOne',
      maxPlayers: 2,
      nowMs: BASE_NOW,
    });

    const validGuestJoin = applyPlayerJoinOrReconnect({
      room: waitingRoom,
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    // Valid join succeeds
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 100,
        roomCode: 'SEC123',
        resourceData: waitingRoom,
        requestResourceData: validGuestJoin,
      })
    ).toBe(true);

    // Attempt 1: Guest tries to overwrite hostUid to take over the room
    const hijackHostUid: MultiplayerRoomDocument = {
      ...validGuestJoin,
      hostUid: 'guest-2',
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 100,
        roomCode: 'SEC123',
        resourceData: waitingRoom,
        requestResourceData: hijackHostUid,
      })
    ).toBe(false);

    // Attempt 2: Guest tries to set isHost: true on their player entry
    const hijackIsHostFlag: MultiplayerRoomDocument = {
      ...validGuestJoin,
      players: {
        ...validGuestJoin.players,
        'guest-2': {
          ...validGuestJoin.players['guest-2'],
          isHost: true,
        },
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 100,
        roomCode: 'SEC123',
        resourceData: waitingRoom,
        requestResourceData: hijackIsHostFlag,
      })
    ).toBe(false);
  });

  it('3. prevents non-hosts from starting or closing rooms', () => {
    const waitingRoom = buildInitialRoomDocument({
      roomCode: 'SEC123',
      gameType: 'memory-match',
      hostUid: 'host-1',
      hostNickname: 'HostOne',
      maxPlayers: 2,
      nowMs: BASE_NOW,
    });
    const fullWaitingRoom = applyPlayerJoinOrReconnect({
      room: waitingRoom,
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    const startedByHost = applyStartMemoryMatchGame({
      room: fullWaitingRoom,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
      randomFn: () => 0.999999,
    });

    // Non-host attempting to commit the start-game state transition is rejected by rules
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 200,
        roomCode: 'SEC123',
        resourceData: fullWaitingRoom,
        requestResourceData: startedByHost,
      })
    ).toBe(false);

    // Host starting the game is allowed
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 200,
        roomCode: 'SEC123',
        resourceData: fullWaitingRoom,
        requestResourceData: startedByHost,
      })
    ).toBe(true);

    // Non-host attempting to close the room is rejected
    const closedAttempt: MultiplayerRoomDocument = {
      ...startedByHost,
      status: 'closed',
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 300,
        roomCode: 'SEC123',
        resourceData: startedByHost,
        requestResourceData: closedAttempt,
      })
    ).toBe(false);

    // Host closing the room is allowed
    const { nextRoom: closedByHost } = applyPlayerLeaveOrClose({
      room: startedByHost,
      callerUid: 'host-1',
      forceCloseByHost: true,
      nowMs: BASE_NOW + 300,
    });
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 300,
        roomCode: 'SEC123',
        resourceData: startedByHost,
        requestResourceData: closedByHost,
      })
    ).toBe(true);
  });

  it('4. prevents players from making out-of-turn moves or altering playerOrder once a game starts', () => {
    const waitingRoom = applyPlayerJoinOrReconnect({
      room: buildInitialRoomDocument({
        roomCode: 'SEC123',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: BASE_NOW,
      }),
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    const activeRoom = applyStartMemoryMatchGame({
      room: waitingRoom,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
      randomFn: () => 0.999999,
    });

    const hostMove = applySelectMemoryMatchCard({
      room: activeRoom,
      callerUid: 'host-1',
      cardId: 0,
      nowMs: BASE_NOW + 300,
    }).nextRoom;

    // Guest-2 trying to submit a card flip during host-1's turn is rejected
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 300,
        roomCode: 'SEC123',
        resourceData: activeRoom,
        requestResourceData: hostMove,
      })
    ).toBe(false);

    // Host-1 trying to reorder playerOrder during their valid turn is rejected
    const mutatedPlayerOrder: MultiplayerRoomDocument = {
      ...hostMove,
      playerOrder: ['guest-2', 'host-1'],
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 300,
        roomCode: 'SEC123',
        resourceData: activeRoom,
        requestResourceData: mutatedPlayerOrder,
      })
    ).toBe(false);
  });

  it('5. prevents players from modifying another player score or inflating their own score by >1 per move', () => {
    const waitingRoom = applyPlayerJoinOrReconnect({
      room: buildInitialRoomDocument({
        roomCode: 'SEC123',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: BASE_NOW,
      }),
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    const activeRoom = applyStartMemoryMatchGame({
      room: waitingRoom,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
      randomFn: () => 0.999999,
    });

    const step1 = applySelectMemoryMatchCard({
      room: activeRoom,
      callerUid: 'host-1',
      cardId: 0,
      nowMs: BASE_NOW + 300,
    }).nextRoom;

    const step2Match = applySelectMemoryMatchCard({
      room: step1,
      callerUid: 'host-1',
      cardId: 1,
      nowMs: BASE_NOW + 400,
    }).nextRoom;

    // Valid +1 match move by host-1 is allowed
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 400,
        roomCode: 'SEC123',
        resourceData: step1,
        requestResourceData: step2Match,
      })
    ).toBe(true);

    // Attack 1: Active turn player tries to modify guest-2's score
    const tamperOtherPlayerScore: MultiplayerRoomDocument = {
      ...step2Match,
      players: {
        ...step2Match.players,
        'guest-2': {
          ...step2Match.players['guest-2'],
          score: 99,
        },
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 400,
        roomCode: 'SEC123',
        resourceData: step1,
        requestResourceData: tamperOtherPlayerScore,
      })
    ).toBe(false);

    // Attack 2: Active turn player tries to award themselves +5 score or +5 matchedPairs in one move
    const inflatedScore: MultiplayerRoomDocument = {
      ...step2Match,
      players: {
        ...step2Match.players,
        'host-1': {
          ...step2Match.players['host-1'],
          score: 5,
        },
      },
      memoryMatchState: {
        ...step2Match.memoryMatchState!,
        matchedPairs: 5,
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 400,
        roomCode: 'SEC123',
        resourceData: step1,
        requestResourceData: inflatedScore,
      })
    ).toBe(false);

    // Attack 3: Non-turn player tries to modify their own score during a heartbeat update
    const nonTurnScoreTamper: MultiplayerRoomDocument = {
      ...activeRoom,
      players: {
        ...activeRoom.players,
        'guest-2': {
          ...activeRoom.players['guest-2'],
          score: 10,
          lastSeenAt: BASE_NOW + 500,
        },
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 500,
        roomCode: 'SEC123',
        resourceData: activeRoom,
        requestResourceData: nonTurnScoreTamper,
      })
    ).toBe(false);
  });

  it('6. prevents players from changing matched-pair ownership after a pair has been matched', () => {
    const waitingRoom = applyPlayerJoinOrReconnect({
      room: buildInitialRoomDocument({
        roomCode: 'SEC123',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: BASE_NOW,
      }),
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    const activeRoom = applyStartMemoryMatchGame({
      room: waitingRoom,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
      randomFn: () => 0.999999,
    });

    // Host-1 matches pair 0 (cards 0 and 1)
    const afterFlip1 = applySelectMemoryMatchCard({
      room: activeRoom,
      callerUid: 'host-1',
      cardId: 0,
      nowMs: BASE_NOW + 300,
    }).nextRoom;
    const afterHostMatch = applySelectMemoryMatchCard({
      room: afterFlip1,
      callerUid: 'host-1',
      cardId: 1,
      nowMs: BASE_NOW + 400,
    }).nextRoom;

    const matchedPairKey = afterHostMatch.memoryMatchState!.cards[0].pairKey;
    expect(afterHostMatch.memoryMatchState!.matchedByPairKey?.[matchedPairKey]).toBe('host-1');

    // Host-1 then misses on cards 2 and 4 so turn passes to guest-2
    const miss1 = applySelectMemoryMatchCard({
      room: afterHostMatch,
      callerUid: 'host-1',
      cardId: 2,
      nowMs: BASE_NOW + 500,
    }).nextRoom;
    const miss2 = applySelectMemoryMatchCard({
      room: miss1,
      callerUid: 'host-1',
      cardId: 4,
      nowMs: BASE_NOW + 600,
    }).nextRoom;
    const guestTurnRoom = applyResolveMemoryMatchMismatch({
      room: miss2,
      nowMs: BASE_NOW + 2000,
    });

    expect(guestTurnRoom.currentTurnUid).toBe('guest-2');

    // Guest-2 makes a valid flip on card 2
    const guestValidFlip = applySelectMemoryMatchCard({
      room: guestTurnRoom,
      callerUid: 'guest-2',
      cardId: 2,
      nowMs: BASE_NOW + 2100,
    }).nextRoom;

    // Attack: Guest-2 tries to overwrite matchedByPairKey[matchedPairKey] from 'host-1' to 'guest-2'
    const overwriteOwnershipAttempt: MultiplayerRoomDocument = {
      ...guestValidFlip,
      memoryMatchState: {
        ...guestValidFlip.memoryMatchState!,
        matchedByPairKey: {
          ...guestValidFlip.memoryMatchState!.matchedByPairKey,
          [matchedPairKey]: 'guest-2',
        },
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 2100,
        roomCode: 'SEC123',
        resourceData: guestTurnRoom,
        requestResourceData: overwriteOwnershipAttempt,
      })
    ).toBe(false);
  });

  it('7. prevents players from prematurely expiring active rooms before expiresAt', () => {
    const waitingRoom = applyPlayerJoinOrReconnect({
      room: buildInitialRoomDocument({
        roomCode: 'SEC123',
        gameType: 'tic-tac-toe',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        nowMs: BASE_NOW,
      }),
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    const activeRoom = applyStartTicTacToeGame({
      room: waitingRoom,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
    });

    const prematureExpireAttempt: MultiplayerRoomDocument = {
      ...activeRoom,
      status: 'expired',
    };

    // Before expiresAt, neither guest nor outsider can expire the room
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 1000,
        roomCode: 'SEC123',
        resourceData: activeRoom,
        requestResourceData: prematureExpireAttempt,
      })
    ).toBe(false);

    // Once request.time.toMillis() >= resource.data.expiresAt, expiring is allowed
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: activeRoom.expiresAt + 1,
        roomCode: 'SEC123',
        resourceData: activeRoom,
        requestResourceData: prematureExpireAttempt,
      })
    ).toBe(true);
  });

  it('8. permits valid mismatch resets while blocking score or matchedPairs tampering during reset', () => {
    const waitingRoom = applyPlayerJoinOrReconnect({
      room: buildInitialRoomDocument({
        roomCode: 'SEC123',
        gameType: 'memory-match',
        hostUid: 'host-1',
        hostNickname: 'HostOne',
        maxPlayers: 2,
        nowMs: BASE_NOW,
      }),
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });

    const activeRoom = applyStartMemoryMatchGame({
      room: waitingRoom,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
      randomFn: () => 0.999999,
    });

    const miss1 = applySelectMemoryMatchCard({
      room: activeRoom,
      callerUid: 'host-1',
      cardId: 0,
      nowMs: BASE_NOW + 300,
    }).nextRoom;
    const miss2 = applySelectMemoryMatchCard({
      room: miss1,
      callerUid: 'host-1',
      cardId: 2,
      nowMs: BASE_NOW + 400,
    }).nextRoom;

    const validReset = applyResolveMemoryMatchMismatch({
      room: miss2,
      nowMs: BASE_NOW + 2000,
    });

    // Both turn owner (host-1) and fallback member (guest-2) can execute a valid mismatch reset
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 2000,
        roomCode: 'SEC123',
        resourceData: miss2,
        requestResourceData: validReset,
      })
    ).toBe(true);
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 2000,
        roomCode: 'SEC123',
        resourceData: miss2,
        requestResourceData: validReset,
      })
    ).toBe(true);

    // Tampering with matchedPairs or player scores during a mismatch reset is rejected
    const tamperedReset: MultiplayerRoomDocument = {
      ...validReset,
      memoryMatchState: {
        ...validReset.memoryMatchState!,
        matchedPairs: 1,
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 2000,
        roomCode: 'SEC123',
        resourceData: miss2,
        requestResourceData: tamperedReset,
      })
    ).toBe(false);
  });

  it('9. permits complete valid Tic-Tac-Toe gameplay, win completion, rematch voting, and host rematch start', () => {
    const room0 = buildInitialRoomDocument({
      roomCode: 'TTT123',
      gameType: 'tic-tac-toe',
      hostUid: 'host-1',
      hostNickname: 'HostOne',
      nowMs: BASE_NOW,
    });

    expect(
      evaluateRoomsRule('create', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW,
        roomCode: 'TTT123',
        requestResourceData: room0,
      })
    ).toBe(true);

    const room1 = applyPlayerJoinOrReconnect({
      room: room0,
      uid: 'guest-2',
      nickname: 'GuestTwo',
      nowMs: BASE_NOW + 100,
    });
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: BASE_NOW + 100,
        roomCode: 'TTT123',
        resourceData: room0,
        requestResourceData: room1,
      })
    ).toBe(true);

    let current = applyStartTicTacToeGame({
      room: room1,
      callerUid: 'host-1',
      nowMs: BASE_NOW + 200,
    });
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: BASE_NOW + 200,
        roomCode: 'TTT123',
        resourceData: room1,
        requestResourceData: current,
      })
    ).toBe(true);

    // X: 0, O: 3, X: 1, O: 4, X: 2 (X wins top row)
    const moves: Array<{ uid: string; cell: number }> = [
      { uid: 'host-1', cell: 0 },
      { uid: 'guest-2', cell: 3 },
      { uid: 'host-1', cell: 1 },
      { uid: 'guest-2', cell: 4 },
      { uid: 'host-1', cell: 2 },
    ];

    let stepTime = BASE_NOW + 300;
    for (const move of moves) {
      const next = applyTicTacToeMultiplayerMove({
        room: current,
        callerUid: move.uid,
        cellIndex: move.cell,
        nowMs: (stepTime += 100),
      });
      expect(
        evaluateRoomsRule('update', {
          auth: { uid: move.uid },
          timeMs: stepTime,
          roomCode: 'TTT123',
          resourceData: current,
          requestResourceData: next,
        })
      ).toBe(true);
      current = next;
    }

    expect(current.status).toBe('completed');

    // Guest votes for rematch
    const afterGuestVote = applyVoteTicTacToeRematch({
      room: current,
      callerUid: 'guest-2',
      nowMs: (stepTime += 100),
    });
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'guest-2' },
        timeMs: stepTime,
        roomCode: 'TTT123',
        resourceData: current,
        requestResourceData: afterGuestVote,
      })
    ).toBe(true);

    // Host starts rematch
    const afterRematchStart = applyStartTicTacToeRematch({
      room: afterGuestVote,
      callerUid: 'host-1',
      nowMs: (stepTime += 100),
    });
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'host-1' },
        timeMs: stepTime,
        roomCode: 'TTT123',
        resourceData: afterGuestVote,
        requestResourceData: afterRematchStart,
      })
    ).toBe(true);
  });
});

describe('Firestore rules – Memory Match rematch (Play Again)', () => {
  const T0 = 1_700_000_000_000;

  function completedRoom(
    playerCount: MemoryMultiplayerPlayerCount
  ): MultiplayerRoomDocument {
    let room = buildInitialRoomDocument({
      roomCode: 'RMT123',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      maxPlayers: playerCount,
      nowMs: T0,
    });
    for (let i = 2; i <= playerCount; i++) {
      room = applyPlayerJoinOrReconnect({ room, uid: `p${i}`, nickname: `Player${i}`, nowMs: T0 + i });
    }
    room = applyStartMemoryMatchGame({ room, callerUid: 'p1', nowMs: T0 + 100, randomFn: () => 0.5 });
    let t = T0 + 200;
    const cards = room.memoryMatchState!.cards;
    const seen = new Set<string>();
    for (const card of cards) {
      if (seen.has(card.pairKey)) continue;
      seen.add(card.pairKey);
      const other = cards.find((c) => c.pairKey === card.pairKey && c.id !== card.id)!;
      room = applySelectMemoryMatchCard({ room, callerUid: 'p1', cardId: card.id, nowMs: (t += 5) }).nextRoom;
      room = applySelectMemoryMatchCard({ room, callerUid: 'p1', cardId: other.id, nowMs: (t += 5) }).nextRoom;
    }
    expect(room.status).toBe('completed');
    return room;
  }

  it.each([2 as const, 3 as const, 4 as const, 5 as const, 6 as const, 7 as const, 8 as const])(
    'allows the host to immediately start a rematch round without requiring guest readiness votes (%i players)',
    (playerCount) => {
      const done = completedRoom(playerCount);
      const t = done.lastActivityAt + 50;

      // Host immediately starts the next round without any prior guest readiness votes
      const next = applyStartMemoryMatchRematch({
        room: done,
        callerUid: 'p1',
        nowMs: t + 10,
        randomFn: () => 0.1,
      });
      expect(
        evaluateRoomsRule('update', {
          auth: { uid: 'p1' },
          timeMs: t + 10,
          roomCode: 'RMT123',
          resourceData: done,
          requestResourceData: next,
        })
      ).toBe(true);

      // A non-host cannot commit the same rematch start
      expect(
        evaluateRoomsRule('update', {
          auth: { uid: 'p2' },
          timeMs: t + 10,
          roomCode: 'RMT123',
          resourceData: done,
          requestResourceData: next,
        })
      ).toBe(false);

      // Host cannot carry scores / ownership / round count into the new round
      const carriedScore: MultiplayerRoomDocument = {
        ...next,
        players: { ...next.players, p1: { ...next.players['p1'], score: 5 } },
      };
      const carriedOwnership: MultiplayerRoomDocument = {
        ...next,
        memoryMatchState: {
          ...next.memoryMatchState!,
          matchedByPairKey: { x: 'p1' },
          matchedPairs: 1,
        },
      };
      const skippedRound: MultiplayerRoomDocument = {
        ...next,
        memoryMatchState: { ...next.memoryMatchState!, roundNumber: 7 },
      };
      const reorderedPlayers: MultiplayerRoomDocument = {
        ...next,
        playerOrder: [...next.playerOrder].reverse(),
      };
      for (const bad of [carriedScore, carriedOwnership, skippedRound, reorderedPlayers]) {
        expect(
          evaluateRoomsRule('update', {
            auth: { uid: 'p1' },
            timeMs: t + 10,
            roomCode: 'RMT123',
            resourceData: done,
            requestResourceData: bad,
          })
        ).toBe(false);
      }
    }
  );

  it('enforces flexible minimum player requirements in Firestore rules (e.g., 8-player capacity started with 3 players, rejecting start at 2 players or manipulated board sizes)', () => {
    const room8Cap = buildInitialRoomDocument({
      roomCode: 'FLX888',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'Player1',
      maxPlayers: 8,
      nowMs: T0,
    });
    const room2Of8 = applyPlayerJoinOrReconnect({
      room: room8Cap,
      uid: 'p2',
      nickname: 'Player2',
      nowMs: T0 + 10,
    });
    const room3Of8 = applyPlayerJoinOrReconnect({
      room: room2Of8,
      uid: 'p3',
      nickname: 'Player3',
      nowMs: T0 + 20,
    });

    const validStart3Of8 = applyStartMemoryMatchGame({
      room: room3Of8,
      callerUid: 'p1',
      nowMs: T0 + 100,
      randomFn: () => 0.5,
    });

    // 1. Valid start with 3 of 8 players (40 cards, 20 pairs) is permitted by Firestore rules
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'p1' },
        timeMs: T0 + 100,
        roomCode: 'FLX888',
        resourceData: room3Of8,
        requestResourceData: validStart3Of8,
      })
    ).toBe(true);

    // 2. Forging a start when only 2 of 8 players have joined is rejected by Firestore rules
    const forgedStart2Of8: MultiplayerRoomDocument = {
      ...validStart3Of8,
      players: room2Of8.players,
      playerOrder: room2Of8.playerOrder,
      memoryMatchState: {
        ...validStart3Of8.memoryMatchState!,
        turnOrderUids: room2Of8.playerOrder,
        totalPairs: 10,
        cards: validStart3Of8.memoryMatchState!.cards.slice(0, 20),
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'p1' },
        timeMs: T0 + 100,
        roomCode: 'FLX888',
        resourceData: room2Of8,
        requestResourceData: forgedStart2Of8,
      })
    ).toBe(false);

    // 3. Manipulating the board size (e.g., submitting a 100-card board when only 3 players are participating) is rejected
    const manipulatedBoardSize: MultiplayerRoomDocument = {
      ...validStart3Of8,
      memoryMatchState: {
        ...validStart3Of8.memoryMatchState!,
        totalPairs: 50,
      },
    };
    expect(
      evaluateRoomsRule('update', {
        auth: { uid: 'p1' },
        timeMs: T0 + 100,
        roomCode: 'FLX888',
        resourceData: room3Of8,
        requestResourceData: manipulatedBoardSize,
      })
    ).toBe(false);
  });
});

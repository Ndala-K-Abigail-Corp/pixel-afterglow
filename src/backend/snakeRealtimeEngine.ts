/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authoritative Multiplayer Snake Real-Time Simulation Engine (2–10 Players).
 *
 * REAL-TIME ARCHITECTURE (Phase 6):
 * - Control Plane: Cloud Firestore (`rooms/{roomCode}`) manages the universal
 *   waiting-room lifecycle (`waiting` -> `in_progress` -> `completed` -> `waiting`),
 *   player roster (2–10 players), ready states, room invitations, chat, and reactions.
 * - High-Frequency Data Plane: Movement ticks (~130ms) MUST NOT be written per-tick to
 *   Firestore. In production, this authoritative engine runs inside a dedicated real-time
 *   WebSocket game server (e.g. Cloud Run / Node.js WebSocket service or Firebase Realtime
 *   Database + worker). Clients send only validated direction inputs (`{ uid, direction }`),
 *   and the server broadcasts authoritative state snapshots.
 * - Competitive Rules Enforced Authoritatively:
 *   1. Shared 26×26 arena with consistent obstacle positions across all clients.
 *   2. Shared apples: at most 1 snake can collect any apple per tick; replacement spawns immediately.
 *   3. Snake-size comparison & eating mechanics:
 *      - Larger snake eats smaller snake (head-to-head or head-to-body when `attacker.length > defender.length`).
 *        Surviving larger snake receives +25 bonus score and +2 growth segments; smaller snake is eliminated.
 *      - Smaller snake colliding into a larger snake is eliminated; the larger snake receives +25 bonus score and +2 growth.
 *      - Equal-sized head-to-head collision eliminates BOTH snakes simultaneously (fair deterministic tie).
 *      - Equal-sized head-to-body collision eliminates the snake whose head struck the other's body.
 *   4. Eliminated snakes stop moving immediately, cannot collect food, and retain final score/placement.
 *   5. Last surviving snake wins (if last survivors eliminate on the same tick, highest score wins or draw).
 */

import {
  isOppositeDirection,
  movePoint,
  pointKey,
  spawnValidFood,
  type GridPoint,
  type SnakeDirection,
} from '../logic/snake';

export const MP_SNAKE_GRID_SIZE = 26;
export const MP_SNAKE_MIN_PLAYERS = 2;
export const MP_SNAKE_MAX_PLAYERS = 10;
export const MP_SNAKE_TICK_MS = 135;
export const MP_SNAKE_APPLE_COUNT = 4;
export const MP_SNAKE_APPLE_POINTS = 10;
export const MP_SNAKE_EAT_SNAKE_POINTS = 25;
export const MP_SNAKE_EAT_SNAKE_GROWTH = 2;

/**
 * Ten visually distinguishable multiplayer snake colours (Section 7):
 * Turquoise, Coral Red, Lime Green, Violet, Orange, Pink, Yellow, Cyan, Blue, Magenta.
 */
export const MP_SNAKE_PLAYER_COLORS = [
  '#56E0CB', // 1. Turquoise
  '#FF776E', // 2. Coral Red
  '#84CC16', // 3. Lime Green
  '#8B5CF6', // 4. Violet
  '#F97316', // 5. Orange
  '#EC4899', // 6. Pink
  '#FACC15', // 7. Yellow
  '#06B6D4', // 8. Cyan
  '#3B82F6', // 9. Blue
  '#D946EF', // 10. Magenta
] as const;

export interface MultiplayerSnakePlayer {
  uid: string;
  username: string;
  color: string;
  segments: GridPoint[]; // Index 0 = head
  direction: SnakeDirection;
  queuedDirection: SnakeDirection;
  pendingGrowth: number;
  score: number;
  applesCollected: number;
  snakesEaten: number;
  alive: boolean;
  eliminatedAtTick: number | null;
  eliminationReason: string | null;
  placement: number | null; // 1 = winner
}

export interface MultiplayerSnakeArenaState {
  sessionId: string;
  roundNumber: number;
  gridSize: number;
  tick: number;
  snakes: Record<string, MultiplayerSnakePlayer>;
  playerOrder: string[];
  apples: GridPoint[];
  obstacles: GridPoint[];
  status: 'in_progress' | 'completed';
  winnerUids: string[];
  isDraw: boolean;
  startedAtMs: number;
  completedAtMs: number | null;
}

const SPAWN_PRESETS: Array<{ head: GridPoint; dir: SnakeDirection }> = [
  { head: { x: 4, y: 4 }, dir: 'right' },
  { head: { x: 21, y: 21 }, dir: 'left' },
  { head: { x: 21, y: 4 }, dir: 'down' },
  { head: { x: 4, y: 21 }, dir: 'up' },
  { head: { x: 13, y: 3 }, dir: 'down' },
  { head: { x: 13, y: 22 }, dir: 'up' },
  { head: { x: 3, y: 13 }, dir: 'right' },
  { head: { x: 22, y: 13 }, dir: 'left' },
  { head: { x: 9, y: 4 }, dir: 'down' },
  { head: { x: 16, y: 21 }, dir: 'up' },
];

function buildInitialSegments(head: GridPoint, dir: SnakeDirection, length = 3): GridPoint[] {
  const segs: GridPoint[] = [head];
  const opposite: Record<SnakeDirection, SnakeDirection> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  };
  let cur = head;
  for (let i = 1; i < length; i++) {
    cur = movePoint(cur, opposite[dir]);
    segs.push(cur);
  }
  return segs;
}

/**
 * Generates a balanced, symmetric set of obstacles for the 26×26 multiplayer arena
 * away from all 10 spawn corridors.
 */
export function buildMultiplayerArenaObstacles(gridSize = MP_SNAKE_GRID_SIZE): GridPoint[] {
  const mid = Math.floor(gridSize / 2);
  return [
    { x: mid - 4, y: mid - 4 },
    { x: mid + 4, y: mid - 4 },
    { x: mid - 4, y: mid + 4 },
    { x: mid + 4, y: mid + 4 },
    { x: mid, y: mid - 5 },
    { x: mid, y: mid + 5 },
    { x: mid - 6, y: mid },
    { x: mid + 6, y: mid },
  ];
}

export function createMultiplayerSnakeArena(params: {
  sessionId: string;
  roundNumber?: number;
  players: Array<{ uid: string; username: string }>;
  startedAtMs?: number;
  randomFn?: () => number;
}): MultiplayerSnakeArenaState {
  if (
    params.players.length < MP_SNAKE_MIN_PLAYERS ||
    params.players.length > MP_SNAKE_MAX_PLAYERS
  ) {
    throw new Error(
      `Multiplayer Snake requires between ${MP_SNAKE_MIN_PLAYERS} and ${MP_SNAKE_MAX_PLAYERS} players.`
    );
  }

  const gridSize = MP_SNAKE_GRID_SIZE;
  const obstacles = buildMultiplayerArenaObstacles(gridSize);
  const snakes: Record<string, MultiplayerSnakePlayer> = {};
  const playerOrder: string[] = [];
  const occupied = new Set<string>(obstacles.map(pointKey));

  params.players.forEach((p, idx) => {
    const preset = SPAWN_PRESETS[idx % SPAWN_PRESETS.length];
    const segments = buildInitialSegments(preset.head, preset.dir, 3);
    segments.forEach((s) => occupied.add(pointKey(s)));
    playerOrder.push(p.uid);
    snakes[p.uid] = {
      uid: p.uid,
      username: p.username,
      color: MP_SNAKE_PLAYER_COLORS[idx % MP_SNAKE_PLAYER_COLORS.length],
      segments,
      direction: preset.dir,
      queuedDirection: preset.dir,
      pendingGrowth: 0,
      score: 0,
      applesCollected: 0,
      snakesEaten: 0,
      alive: true,
      eliminatedAtTick: null,
      eliminationReason: null,
      placement: null,
    };
  });

  const apples: GridPoint[] = [];
  for (let i = 0; i < MP_SNAKE_APPLE_COUNT; i++) {
    const food = spawnValidFood(gridSize, occupied, params.randomFn);
    if (food) {
      apples.push(food);
      occupied.add(pointKey(food));
    }
  }

  return {
    sessionId: params.sessionId,
    roundNumber: params.roundNumber ?? 1,
    gridSize,
    tick: 0,
    snakes,
    playerOrder,
    apples,
    obstacles,
    status: 'in_progress',
    winnerUids: [],
    isDraw: false,
    startedAtMs: params.startedAtMs ?? Date.now(),
    completedAtMs: null,
  };
}

/**
 * Validates and queues a single player's direction input.
 * Prevents controlling another player's snake or reversing 180 degrees.
 */
export function queueMultiplayerSnakeDirection(
  state: MultiplayerSnakeArenaState,
  actorUid: string,
  nextDirection: SnakeDirection
): MultiplayerSnakeArenaState {
  if (state.status !== 'in_progress') return state;
  const snake = state.snakes[actorUid];
  if (!snake || !snake.alive) return state;
  if (isOppositeDirection(snake.direction, nextDirection)) return state;

  return {
    ...state,
    snakes: {
      ...state.snakes,
      [actorUid]: {
        ...snake,
        queuedDirection: nextDirection,
      },
    },
  };
}

/**
 * Advances the authoritative multiplayer Snake arena by one tick.
 * Resolves movement, shared apples, obstacles, self-collision, and snake-size eating rules.
 */
export function stepMultiplayerSnakeTick(
  state: MultiplayerSnakeArenaState,
  nowMs: number = Date.now(),
  randomFn: () => number = Math.random
): MultiplayerSnakeArenaState {
  if (state.status !== 'in_progress') return state;

  const nextTick = state.tick + 1;
  const obstacleSet = new Set(state.obstacles.map(pointKey));
  const nextSnakes: Record<string, MultiplayerSnakePlayer> = {};
  for (const uid of state.playerOrder) {
    nextSnakes[uid] = {
      ...state.snakes[uid],
      segments: [...state.snakes[uid].segments],
    };
  }

  const aliveUids = state.playerOrder.filter((u) => nextSnakes[u].alive);
  const preTickLengths = new Map<string, number>(
    aliveUids.map((u) => [u, nextSnakes[u].segments.length])
  );

  // 1. Compute proposed next heads with MULTIPLAYER EDGE WRAPAROUND
  //    (Exiting any edge reappears on the opposite edge without eliminating the player.)
  const proposedHeads = new Map<string, GridPoint>();
  for (const uid of aliveUids) {
    const s = nextSnakes[uid];
    s.direction = s.queuedDirection;
    const rawNext = movePoint(s.segments[0], s.direction);
    const wrappedHead: GridPoint = {
      x: ((rawNext.x % state.gridSize) + state.gridSize) % state.gridSize,
      y: ((rawNext.y % state.gridSize) + state.gridSize) % state.gridSize,
    };
    proposedHeads.set(uid, wrappedHead);
  }

  // 2. Check obstacle collisions (walls wrap around in multiplayer, never eliminate)
  const eliminatedThisTick = new Map<string, string>(); // uid -> reason
  const rewardEatBonuses = new Map<string, number>(); // eaterUid -> count of snakes eaten

  for (const uid of aliveUids) {
    const head = proposedHeads.get(uid)!;
    if (obstacleSet.has(pointKey(head))) {
      eliminatedThisTick.set(uid, 'Hit an arena obstacle');
    }
  }

  // 3. Check head-to-head collisions among non-wall-eliminated snakes using size comparison
  const contenders = aliveUids.filter((u) => !eliminatedThisTick.has(u));
  const headsByTile = new Map<string, string[]>();
  for (const uid of contenders) {
    const key = pointKey(proposedHeads.get(uid)!);
    const list = headsByTile.get(key) ?? [];
    list.push(uid);
    headsByTile.set(key, list);
  }

  for (const group of headsByTile.values()) {
    if (group.length < 2) continue;
    let maxLen = -1;
    for (const uid of group) {
      const len = preTickLengths.get(uid) ?? 0;
      if (len > maxLen) maxLen = len;
    }
    const largest = group.filter((u) => (preTickLengths.get(u) ?? 0) === maxLen);

    if (largest.length === 1) {
      // Strictly larger snake eats all smaller snakes at that tile
      const winnerUid = largest[0];
      for (const uid of group) {
        if (uid !== winnerUid) {
          eliminatedThisTick.set(
            uid,
            `Eaten by larger snake (${nextSnakes[winnerUid].username})`
          );
          rewardEatBonuses.set(winnerUid, (rewardEatBonuses.get(winnerUid) ?? 0) + 1);
        }
      }
    } else {
      // Equal-sized head-to-head collision eliminates all tied contenders
      for (const uid of group) {
        eliminatedThisTick.set(uid, 'Equal-size head-to-head collision');
      }
    }
  }

  // 4. Advance non-eliminated snakes & check shared apples (at most 1 eater per apple)
  const remainingApples = [...state.apples];
  const ateAppleUids = new Set<string>();

  for (const uid of contenders) {
    if (eliminatedThisTick.has(uid)) continue;
    const head = proposedHeads.get(uid)!;
    const appleIdx = remainingApples.findIndex((a) => a.x === head.x && a.y === head.y);
    if (appleIdx !== -1) {
      remainingApples.splice(appleIdx, 1);
      ateAppleUids.add(uid);
      nextSnakes[uid].score += MP_SNAKE_APPLE_POINTS;
      nextSnakes[uid].applesCollected += 1;
      nextSnakes[uid].pendingGrowth += 1;
    }
  }

  // Move segments for surviving contenders
  for (const uid of contenders) {
    if (eliminatedThisTick.has(uid)) continue;
    const s = nextSnakes[uid];
    const head = proposedHeads.get(uid)!;
    const grow = s.pendingGrowth > 0;
    s.segments = grow ? [head, ...s.segments] : [head, ...s.segments.slice(0, -1)];
    if (grow) s.pendingGrowth -= 1;
  }

  // 5. Check self-collision and head-to-body collisions (with snake-size eating rules!)
  const movingAlive = contenders.filter((u) => !eliminatedThisTick.has(u));
  for (const attackerUid of movingAlive) {
    const attacker = nextSnakes[attackerUid];
    const headKey = pointKey(attacker.segments[0]);

    // Self collision
    if (attacker.segments.slice(1).some((seg) => pointKey(seg) === headKey)) {
      eliminatedThisTick.set(attackerUid, 'Collided with own tail');
      continue;
    }

    // Head-to-body collision against another alive snake
    for (const defenderUid of movingAlive) {
      if (defenderUid === attackerUid || eliminatedThisTick.has(defenderUid)) continue;
      const defender = nextSnakes[defenderUid];
      const hitBody = defender.segments.slice(1).some((seg) => pointKey(seg) === headKey);
      if (!hitBody) continue;

      const attackerLen = preTickLengths.get(attackerUid) ?? attacker.segments.length;
      const defenderLen = preTickLengths.get(defenderUid) ?? defender.segments.length;

      if (attackerLen > defenderLen) {
        // Larger snake eats smaller snake!
        eliminatedThisTick.set(
          defenderUid,
          `Eaten by larger snake (${attacker.username})`
        );
        rewardEatBonuses.set(attackerUid, (rewardEatBonuses.get(attackerUid) ?? 0) + 1);
      } else {
        // Smaller or equal snake cannot eat defender -> attacker eliminated
        eliminatedThisTick.set(
          attackerUid,
          attackerLen < defenderLen
            ? `Eliminated by larger snake (${defender.username})`
            : `Collided with ${defender.username}`
        );
        if (defenderLen > attackerLen) {
          rewardEatBonuses.set(defenderUid, (rewardEatBonuses.get(defenderUid) ?? 0) + 1);
        }
      }
    }
  }

  // 6. Apply eat-snake rewards to surviving eaters
  for (const [eaterUid, count] of rewardEatBonuses.entries()) {
    if (!eliminatedThisTick.has(eaterUid) && nextSnakes[eaterUid]?.alive) {
      nextSnakes[eaterUid].score += count * MP_SNAKE_EAT_SNAKE_POINTS;
      nextSnakes[eaterUid].snakesEaten += count;
      nextSnakes[eaterUid].pendingGrowth += count * MP_SNAKE_EAT_SNAKE_GROWTH;
    }
  }

  // 7. Mark newly eliminated snakes with placement
  const survivingAfterTick = aliveUids.filter((u) => !eliminatedThisTick.has(u));
  const eliminatedPlacement = survivingAfterTick.length + 1;
  for (const [uid, reason] of eliminatedThisTick.entries()) {
    nextSnakes[uid].alive = false;
    nextSnakes[uid].eliminatedAtTick = nextTick;
    nextSnakes[uid].eliminationReason = reason;
    nextSnakes[uid].placement = eliminatedPlacement;
  }

  // 8. Respawn eaten apples on unoccupied cells
  const occupiedNow = new Set<string>(state.obstacles.map(pointKey));
  for (const uid of survivingAfterTick) {
    nextSnakes[uid].segments.forEach((s) => occupiedNow.add(pointKey(s)));
  }
  remainingApples.forEach((a) => occupiedNow.add(pointKey(a)));

  while (remainingApples.length < MP_SNAKE_APPLE_COUNT) {
    const nextApple = spawnValidFood(state.gridSize, occupiedNow, randomFn);
    if (!nextApple) break;
    remainingApples.push(nextApple);
    occupiedNow.add(pointKey(nextApple));
  }

  // 9. Determine match completion (last surviving snake wins)
  let status: 'in_progress' | 'completed' = 'in_progress';
  let winnerUids: string[] = [];
  let isDraw = false;
  let completedAtMs: number | null = null;

  if (survivingAfterTick.length === 1) {
    status = 'completed';
    winnerUids = [survivingAfterTick[0]];
    nextSnakes[survivingAfterTick[0]].placement = 1;
    completedAtMs = nowMs;
  } else if (survivingAfterTick.length === 0) {
    status = 'completed';
    completedAtMs = nowMs;
    // Tiebreak among last-eliminated snakes by highest score
    const finalists = Array.from(eliminatedThisTick.keys());
    const topScore = Math.max(...finalists.map((u) => nextSnakes[u].score));
    winnerUids = finalists.filter((u) => nextSnakes[u].score === topScore);
    isDraw = winnerUids.length > 1;
    winnerUids.forEach((u) => {
      nextSnakes[u].placement = 1;
    });
  }

  return {
    ...state,
    tick: nextTick,
    snakes: nextSnakes,
    apples: remainingApples,
    status,
    winnerUids,
    isDraw,
    completedAtMs,
  };
}

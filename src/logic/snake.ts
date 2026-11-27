/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SnakeDirection = 'up' | 'down' | 'left' | 'right';
export type SnakeSpeedMode = 'slow' | 'fast' | 'flash';
export type SnakeDifficultyLevel = 'easy' | 'hard' | 'difficult';

export interface GridPoint {
  x: number;
  y: number;
}

export interface SnakeSpeedConfig {
  id: SnakeSpeedMode;
  label: string;
  description: string;
  tickMs: number;
  accentHex: string;
}

export interface SnakeDifficultyConfig {
  id: SnakeDifficultyLevel;
  label: string;
  description: string;
  obstacleCount: number;
  accentHex: string;
}

export const SNAKE_GRID_SIZE = 20;
export const SNAKE_POINTS_PER_APPLE = 10;

export const SNAKE_SPEED_CONFIGS: Readonly<Record<SnakeSpeedMode, SnakeSpeedConfig>> = {
  slow: {
    id: 'slow',
    label: 'Slow',
    description: 'Relaxed pace for steady control.',
    tickMs: 170,
    accentHex: '#56E0CB',
  },
  fast: {
    id: 'fast',
    label: 'Fast',
    description: 'Crisp arcade pace requiring quick reactions.',
    tickMs: 125,
    accentHex: '#FFC66D',
  },
  flash: {
    id: 'flash',
    label: 'Flash',
    description: 'Blistering speed for seasoned pros.',
    tickMs: 85,
    accentHex: '#FF776E',
  },
};

export const SNAKE_DIFFICULTY_CONFIGS: Readonly<
  Record<SnakeDifficultyLevel, SnakeDifficultyConfig>
> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    description: 'Open classic arena with no obstacles.',
    obstacleCount: 0,
    accentHex: '#56E0CB',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    description: 'A few hazard blocks placed across the arena.',
    obstacleCount: 8,
    accentHex: '#FFC66D',
  },
  difficult: {
    id: 'difficult',
    label: 'Difficult',
    description: 'Dense obstacle layout with tighter paths.',
    obstacleCount: 18,
    accentHex: '#FF776E',
  },
};

export interface SinglePlayerSnakeState {
  gridSize: number;
  speed: SnakeSpeedMode;
  difficulty: SnakeDifficultyLevel;
  snake: GridPoint[]; // Index 0 = head
  direction: SnakeDirection;
  queuedDirection: SnakeDirection;
  food: GridPoint;
  obstacles: GridPoint[];
  score: number;
  applesCollected: number;
  isGameOver: boolean;
  gameOverReason: 'wall' | 'self' | 'obstacle' | 'victory' | null;
  isPaused: boolean;
  startedAtMs: number | null;
  elapsedSeconds: number;
}

export interface LocalSnakeBestRecord {
  highestScore: number;
  gamesPlayed: number;
  totalFoodCollected: number;
  longestSnakeLength: number;
  bestSurvivalTimeSeconds: number;
}

const LOCAL_SNAKE_RECORD_KEY = 'pixel_afterglow_snake_local_record_v1';

export function pointKey(p: GridPoint): string {
  return `${p.x},${p.y}`;
}

export function isOppositeDirection(a: SnakeDirection, b: SnakeDirection): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}

export function movePoint(p: GridPoint, dir: SnakeDirection): GridPoint {
  switch (dir) {
    case 'up':
      return { x: p.x, y: p.y - 1 };
    case 'down':
      return { x: p.x, y: p.y + 1 };
    case 'left':
      return { x: p.x - 1, y: p.y };
    case 'right':
      return { x: p.x + 1, y: p.y };
  }
}

/**
 * Generates valid, non-trapping obstacle positions for the selected difficulty.
 * Guarantees obstacles never spawn inside the initial snake, in its forward spawn corridor,
 * or in patterns that disconnect the arena (verified via BFS reachability).
 */
export function generateSnakeObstacles(
  difficulty: SnakeDifficultyLevel,
  gridSize: number = SNAKE_GRID_SIZE,
  initialSnake: readonly GridPoint[] = [],
  randomFn: () => number = Math.random
): GridPoint[] {
  const targetCount = SNAKE_DIFFICULTY_CONFIGS[difficulty].obstacleCount;
  if (targetCount <= 0) return [];

  const forbidden = new Set<string>();
  // Protect initial snake & a 2-tile safety corridor ahead of the head
  for (const seg of initialSnake) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        forbidden.add(`${seg.x + dx},${seg.y + dy}`);
      }
    }
  }
  if (initialSnake.length > 0) {
    const head = initialSnake[0];
    for (let step = 1; step <= 4; step++) {
      forbidden.add(`${head.x + step},${head.y}`);
      forbidden.add(`${head.x + step},${head.y - 1}`);
      forbidden.add(`${head.x + step},${head.y + 1}`);
    }
  }

  // Keep outer border clear so players are never boxed into an unreachable edge trap
  const candidates: GridPoint[] = [];
  for (let x = 2; x < gridSize - 2; x++) {
    for (let y = 2; y < gridSize - 2; y++) {
      const key = `${x},${y}`;
      if (!forbidden.has(key)) {
        candidates.push({ x, y });
      }
    }
  }

  // Deterministic Fisher-Yates shuffle using randomFn
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const obstacles: GridPoint[] = [];
  const obstacleSet = new Set<string>();

  for (const cand of candidates) {
    if (obstacles.length >= targetCount) break;
    // Keep at least 1 empty orthogonal neighbor around each obstacle to prevent dead-end cages
    const hasAdjacentObstacle = [
      `${cand.x + 1},${cand.y}`,
      `${cand.x - 1},${cand.y}`,
      `${cand.x},${cand.y + 1}`,
      `${cand.x},${cand.y - 1}`,
    ].some((k) => obstacleSet.has(k));

    if (hasAdjacentObstacle && difficulty === 'hard') {
      continue;
    }

    obstacleSet.add(pointKey(cand));
    obstacles.push(cand);
  }

  return obstacles;
}

/**
 * Spawns food strictly on an unoccupied grid cell (never inside snake or obstacles).
 */
export function spawnValidFood(
  gridSize: number,
  occupiedKeys: ReadonlySet<string>,
  randomFn: () => number = Math.random
): GridPoint | null {
  const free: GridPoint[] = [];
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      if (!occupiedKeys.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }
  if (free.length === 0) return null;
  const index = Math.floor(randomFn() * free.length);
  return free[index];
}

export function createInitialSinglePlayerSnakeState(params: {
  speed: SnakeSpeedMode;
  difficulty: SnakeDifficultyLevel;
  gridSize?: number;
  randomFn?: () => number;
}): SinglePlayerSnakeState {
  const gridSize = params.gridSize ?? SNAKE_GRID_SIZE;
  const midY = Math.floor(gridSize / 2);
  const initialSnake: GridPoint[] = [
    { x: 6, y: midY },
    { x: 5, y: midY },
    { x: 4, y: midY },
  ];
  const obstacles = generateSnakeObstacles(
    params.difficulty,
    gridSize,
    initialSnake,
    params.randomFn
  );
  const occupied = new Set<string>([
    ...initialSnake.map(pointKey),
    ...obstacles.map(pointKey),
  ]);
  const food = spawnValidFood(gridSize, occupied, params.randomFn) ?? { x: gridSize - 3, y: midY };

  return {
    gridSize,
    speed: params.speed,
    difficulty: params.difficulty,
    snake: initialSnake,
    direction: 'right',
    queuedDirection: 'right',
    food,
    obstacles,
    score: 0,
    applesCollected: 0,
    isGameOver: false,
    gameOverReason: null,
    isPaused: false,
    startedAtMs: null,
    elapsedSeconds: 0,
  };
}

/**
 * Queues a direction change while strictly preventing immediate 180-degree self-reversal.
 */
export function queueSinglePlayerDirection(
  state: SinglePlayerSnakeState,
  nextDir: SnakeDirection
): SinglePlayerSnakeState {
  if (state.isGameOver || state.isPaused) return state;
  if (isOppositeDirection(state.direction, nextDir)) {
    return state;
  }
  return {
    ...state,
    queuedDirection: nextDir,
  };
}

/**
 * Advances single-player Snake by one deterministic tick.
 */
export function stepSinglePlayerSnake(
  state: SinglePlayerSnakeState,
  randomFn: () => number = Math.random
): SinglePlayerSnakeState {
  if (state.isGameOver || state.isPaused) return state;

  const direction = state.queuedDirection;
  const nextHead = movePoint(state.snake[0], direction);

  // 1. Wall collision
  if (
    nextHead.x < 0 ||
    nextHead.y < 0 ||
    nextHead.x >= state.gridSize ||
    nextHead.y >= state.gridSize
  ) {
    return {
      ...state,
      direction,
      isGameOver: true,
      gameOverReason: 'wall',
    };
  }

  // 2. Obstacle collision
  const obstacleSet = new Set(state.obstacles.map(pointKey));
  if (obstacleSet.has(pointKey(nextHead))) {
    return {
      ...state,
      direction,
      isGameOver: true,
      gameOverReason: 'obstacle',
    };
  }

  const willEat = nextHead.x === state.food.x && nextHead.y === state.food.y;
  // Tail vacates on non-eating ticks, so moving into the current tail is legal unless growing
  const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
  const bodySet = new Set(bodyToCheck.map(pointKey));

  // 3. Self collision
  if (bodySet.has(pointKey(nextHead))) {
    return {
      ...state,
      direction,
      isGameOver: true,
      gameOverReason: 'self',
    };
  }

  const nextSnake = willEat
    ? [nextHead, ...state.snake]
    : [nextHead, ...state.snake.slice(0, -1)];

  if (!willEat) {
    return {
      ...state,
      snake: nextSnake,
      direction,
    };
  }

  // 4. Apple collected -> grow, score, spawn next valid apple
  const occupied = new Set<string>([
    ...nextSnake.map(pointKey),
    ...state.obstacles.map(pointKey),
  ]);
  const nextFood = spawnValidFood(state.gridSize, occupied, randomFn);
  const nextScore = state.score + SNAKE_POINTS_PER_APPLE;
  const nextApples = state.applesCollected + 1;

  if (!nextFood) {
    return {
      ...state,
      snake: nextSnake,
      direction,
      score: nextScore,
      applesCollected: nextApples,
      isGameOver: true,
      gameOverReason: 'victory',
    };
  }

  return {
    ...state,
    snake: nextSnake,
    direction,
    food: nextFood,
    score: nextScore,
    applesCollected: nextApples,
  };
}

export function loadLocalSnakeRecord(): LocalSnakeBestRecord {
  const empty: LocalSnakeBestRecord = {
    highestScore: 0,
    gamesPlayed: 0,
    totalFoodCollected: 0,
    longestSnakeLength: 0,
    bestSurvivalTimeSeconds: 0,
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(LOCAL_SNAKE_RECORD_KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<LocalSnakeBestRecord>) };
  } catch {
    return empty;
  }
}

export function saveLocalSnakeRecord(params: {
  score: number;
  applesCollected: number;
  snakeLength: number;
  survivalSeconds: number;
}): { record: LocalSnakeBestRecord; isNewHighScore: boolean } {
  const prev = loadLocalSnakeRecord();
  const isNewHighScore = params.score > prev.highestScore;
  const next: LocalSnakeBestRecord = {
    highestScore: Math.max(prev.highestScore, params.score),
    gamesPlayed: prev.gamesPlayed + 1,
    totalFoodCollected: prev.totalFoodCollected + params.applesCollected,
    longestSnakeLength: Math.max(prev.longestSnakeLength, params.snakeLength),
    bestSurvivalTimeSeconds: Math.max(prev.bestSurvivalTimeSeconds, params.survivalSeconds),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCAL_SNAKE_RECORD_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }
  return { record: next, isNewHighScore };
}

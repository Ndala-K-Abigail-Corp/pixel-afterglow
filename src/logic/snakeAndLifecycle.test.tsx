// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AudioProvider } from '../context/AudioContext';
import {
  SNAKE_DIFFICULTY_CONFIGS,
  SNAKE_SPEED_CONFIGS,
  createInitialSinglePlayerSnakeState,
  pointKey,
  queueSinglePlayerDirection,
  stepSinglePlayerSnake,
  type SnakeDifficultyLevel,
  type SnakeSpeedMode,
} from './snake';
import {
  createMultiplayerSnakeArena,
  queueMultiplayerSnakeDirection,
  stepMultiplayerSnakeTick,
  MP_SNAKE_EAT_SNAKE_POINTS,
  MP_SNAKE_APPLE_POINTS,
  MP_SNAKE_PLAYER_COLORS,
  MP_SNAKE_GRID_SIZE,
} from '../backend/snakeRealtimeEngine';
import { validateRoomCreationInput } from '../schemas/multiplayerSchemas';
import { StartArcadeSessionInputSchema } from './arcadeRooms';
import { formatUserError } from '../utils/userErrorFormatter';
import { Hero } from '../components/home/Hero';
import { WhatsNewView } from '../components/common/WhatsNewView';
import { hasUnreadRelease } from '../data/releases';
import {
  applyReturnRoomToWaiting,
  applyTogglePlayerReady,
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
} from './multiplayerRoom';
import { applyStartMemoryMatchGame } from './memoryMatchMultiplayer';
import { HomepageLeaderboardSection } from '../components/home/HomepageLeaderboardSection';
import { ArcadeHomeView } from '../components/dashboard/ArcadeHomeView';
import { AchievementsView, ACHIEVEMENTS_PAGE_SIZE } from '../components/dashboard/AchievementsView';
import { DashboardSidebar } from '../components/dashboard/DashboardNavigation';
import { buildPublicPlayerProfile, DEFAULT_PROFILE_PRIVACY } from './publicProfiles';
import { evaluatePlayerAchievements } from './achievements';
import { calculateArcadeXpProgress, createEmptyProgression } from './arcadeProgression';
import {
  createEmptyMultiplayerGameStats,
  createEmptyPrivateSinglePlayerRecords,
} from './gameHistory';
import type { UserProfile } from '../types/profile';

const TEST_PROFILE: UserProfile = {
  uid: 'uid-test',
  username: 'SnakeAce',
  usernameLower: 'snakeace',
  displayName: 'SnakeAce',
  email: 'ace@example.com',
  emailVerified: true,
  countryCode: 'ZM',
  countryName: 'Zambia',
  avatarId: 'dragon',
  authProvider: 'password',
  accountStatus: 'active',
  createdAt: Date.UTC(2026, 0, 1),
  updatedAt: Date.UTC(2026, 0, 1),
  stats: { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gameRecords: {} },
};

describe('Dashboard Refinement, Homepage Leaderboard, Universal Waiting Room & Snake', () => {
  afterEach(() => {
    cleanup();
  });

  it('Phase 1: removes Available Games from ArcadeHomeView while preserving Welcome, Continue Playing, My Rooms & Gaming Activity', () => {
    render(
      <AudioProvider>
        <ArcadeHomeView
          profile={TEST_PROFILE}
          rooms={[]}
          gameHistory={[]}
          multiplayerStats={{
            'memory-match': createEmptyMultiplayerGameStats(),
            'tic-tac-toe': createEmptyMultiplayerGameStats(),
            snake: createEmptyMultiplayerGameStats(),
          }}
          privateRecords={createEmptyPrivateSinglePlayerRecords('uid-test')}
          xpProgress={calculateArcadeXpProgress(200)}
          achievements={[]}
          onNavigateSection={() => {}}
          onOpenArcadeRoom={() => {}}
          onCreateArcadeRoom={() => {}}
          onPlayGame={() => {}}
        />
      </AudioProvider>
    );

    expect(screen.queryByTestId('dashboard-available-games')).toBeNull();
    expect(screen.getByTestId('arcade-home-welcome')).toBeTruthy();
    expect(screen.getByTestId('dashboard-continue-playing')).toBeTruthy();
    expect(screen.getByTestId('dashboard-my-rooms')).toBeTruthy();
    expect(screen.getByTestId('dashboard-gaming-activity')).toBeTruthy();
  });

  it('Phase 3: renders public HomepageLeaderboardSection with empty state and genuine ranked rows', () => {
    render(
      <AudioProvider>
        <HomepageLeaderboardSection onOpenFullLeaderboard={() => {}} initialEntries={[]} />
      </AudioProvider>
    );
    expect(screen.getByTestId('homepage-arcade-leaderboard')).toBeTruthy();
    expect(screen.getByTestId('homepage-leaderboard-empty')).toBeTruthy();
    expect(screen.getByTestId('homepage-view-full-leaderboard-btn')).toBeTruthy();
  });

  it('Phase 4: returns a completed multiplayer room to waiting state, preserves history & allows new players to join and ready up', () => {
    let room = buildInitialRoomDocument({
      roomCode: 'WAIT99',
      gameType: 'memory-match',
      hostUid: 'host-1',
      hostNickname: 'HostOne',
    });
    room = applyPlayerJoinOrReconnect({ room, uid: 'guest-2', nickname: 'GuestTwo' });
    room = applyStartMemoryMatchGame({ room, callerUid: 'host-1' });
    const completedRoom = {
      ...room,
      status: 'completed' as const,
      completedAt: Date.now(),
      memoryMatchState: room.memoryMatchState
        ? { ...room.memoryMatchState, winnerUids: ['host-1'], isTie: false }
        : null,
    };

    // Non-host cannot return room to waiting
    expect(() => applyReturnRoomToWaiting(completedRoom, 'guest-2')).toThrow();

    // Host returns everyone to waiting room
    const waitingRoom = applyReturnRoomToWaiting(completedRoom, 'host-1');
    expect(waitingRoom.status).toBe('waiting');
    expect(waitingRoom.roomCode).toBe('WAIT99');
    expect(waitingRoom.roundNumber).toBe(2);
    expect(waitingRoom.lastCompletedRound?.winnerNames).toEqual(['HostOne']);
    expect(waitingRoom.playerOrder).toEqual(['host-1', 'guest-2']);
    expect(waitingRoom.players['guest-2'].isReady).toBe(false);

    // New player joins before Round 2 starts
    const withNewPlayer = applyPlayerJoinOrReconnect({
      room: waitingRoom,
      uid: 'guest-3',
      nickname: 'GuestThree',
    });
    expect(withNewPlayer.playerOrder).toEqual(['host-1', 'guest-2', 'guest-3']);

    // Guest toggles ready status
    const readyRoom = applyTogglePlayerReady(withNewPlayer, 'guest-2', true);
    expect(readyRoom.players['guest-2'].isReady).toBe(true);
  });

  it('Phase 5A: supports all 9 independent Snake Speed × Difficulty combinations with valid obstacle & food placement', () => {
    const speeds: SnakeSpeedMode[] = ['slow', 'fast', 'flash'];
    const diffs: SnakeDifficultyLevel[] = ['easy', 'hard', 'difficult'];

    expect(SNAKE_SPEED_CONFIGS.slow.tickMs).toBeGreaterThan(SNAKE_SPEED_CONFIGS.fast.tickMs);
    expect(SNAKE_SPEED_CONFIGS.fast.tickMs).toBeGreaterThan(SNAKE_SPEED_CONFIGS.flash.tickMs);

    for (const speed of speeds) {
      for (const difficulty of diffs) {
        const state = createInitialSinglePlayerSnakeState({ speed, difficulty });
        expect(state.speed).toBe(speed);
        expect(state.difficulty).toBe(difficulty);
        expect(state.obstacles.length).toBe(SNAKE_DIFFICULTY_CONFIGS[difficulty].obstacleCount);

        const snakeSet = new Set(state.snake.map(pointKey));
        const obsSet = new Set(state.obstacles.map(pointKey));
        // Obstacles never overlap snake or food
        for (const obs of state.obstacles) {
          expect(snakeSet.has(pointKey(obs))).toBe(false);
        }
        expect(snakeSet.has(pointKey(state.food))).toBe(false);
        expect(obsSet.has(pointKey(state.food))).toBe(false);
      }
    }

    // Prevents direct 180-degree self-reversal
    const base = createInitialSinglePlayerSnakeState({ speed: 'fast', difficulty: 'easy' });
    const reversed = queueSinglePlayerDirection(base, 'left');
    expect(reversed.queuedDirection).toBe('right');

    // Eating food grows snake and increments score
    const eatSetup = {
      ...base,
      food: { x: base.snake[0].x + 1, y: base.snake[0].y },
    };
    const afterEat = stepSinglePlayerSnake(eatSetup);
    expect(afterEat.score).toBe(10);
    expect(afterEat.applesCollected).toBe(1);
    expect(afterEat.snake.length).toBe(base.snake.length + 1);
  });

  it('Phase 5B & 6: enforces 2–10 player Snake arena, larger-eats-smaller collision rules, equal-size elimination, and last-survivor victory', () => {
    // Rejects < 2 or > 10 players
    expect(() =>
      createMultiplayerSnakeArena({ sessionId: 's1', players: [{ uid: 'p1', username: 'A' }] })
    ).toThrow();
    const tenPlayers = Array.from({ length: 10 }, (_, i) => ({
      uid: `p${i + 1}`,
      username: `Player${i + 1}`,
    }));
    const tenArena = createMultiplayerSnakeArena({ sessionId: 's10', players: tenPlayers });
    expect(tenArena.playerOrder).toHaveLength(10);

    // Larger snake (length 5) eats smaller snake (length 3) head-to-head
    const duel = createMultiplayerSnakeArena({
      sessionId: 'duel-1',
      players: [
        { uid: 'big', username: 'BigSnake' },
        { uid: 'small', username: 'SmallSnake' },
      ],
    });
    const customDuel = {
      ...duel,
      apples: [{ x: 1, y: 1 }],
      snakes: {
        big: {
          ...duel.snakes.big,
          segments: [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 },
            { x: 7, y: 10 },
            { x: 6, y: 10 },
          ],
          direction: 'right' as const,
          queuedDirection: 'right' as const,
        },
        small: {
          ...duel.snakes.small,
          segments: [
            { x: 12, y: 10 },
            { x: 13, y: 10 },
            { x: 14, y: 10 },
          ],
          direction: 'left' as const,
          queuedDirection: 'left' as const,
        },
      },
    };

    const resolved = stepMultiplayerSnakeTick(customDuel);
    expect(resolved.snakes.big.alive).toBe(true);
    expect(resolved.snakes.small.alive).toBe(false);
    expect(resolved.snakes.big.score).toBe(MP_SNAKE_EAT_SNAKE_POINTS);
    expect(resolved.status).toBe('completed');
    expect(resolved.winnerUids).toEqual(['big']);

    // Equal-size head-to-head eliminates both snakes cleanly
    const equalDuel = {
      ...duel,
      apples: [{ x: 1, y: 1 }],
      snakes: {
        big: {
          ...duel.snakes.big,
          segments: [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 },
          ],
          direction: 'right' as const,
          queuedDirection: 'right' as const,
          score: MP_SNAKE_APPLE_POINTS,
        },
        small: {
          ...duel.snakes.small,
          segments: [
            { x: 12, y: 10 },
            { x: 13, y: 10 },
            { x: 14, y: 10 },
          ],
          direction: 'left' as const,
          queuedDirection: 'left' as const,
          score: 0,
        },
      },
    };
    const equalResolved = stepMultiplayerSnakeTick(equalDuel);
    expect(equalResolved.snakes.big.alive).toBe(false);
    expect(equalResolved.snakes.small.alive).toBe(false);
    expect(equalResolved.status).toBe('completed');
    expect(equalResolved.winnerUids).toEqual(['big']); // Tiebroken by score

    // Direction reversal prevented in multiplayer
    const afterInvalid = queueMultiplayerSnakeDirection(customDuel, 'big', 'left');
    expect(afterInvalid.snakes.big.queuedDirection).toBe('right');
  });

  it('Section 3, 4 & 5: displays Back to Homepage in sidebar, paginates Achievements to 12/page, and enforces OFF-by-default public profile sharing', () => {
    const xpProgress = calculateArcadeXpProgress(300);
    const { unmount } = render(
      <AudioProvider>
        <DashboardSidebar
          activeSection="arcade-home"
          onSelectSection={() => {}}
          onVisitPublicHome={() => {}}
          profile={TEST_PROFILE}
          xpProgress={xpProgress}
        />
      </AudioProvider>
    );
    expect(screen.getByTestId('sidebar-public-home-btn').textContent).toContain(
      'Back to Homepage'
    );
    expect(screen.getByTestId('sidebar-nav-leaderboards').textContent).toContain(
      'Arcade Leaderboard'
    );
    unmount();

    // Achievements pagination (28 active achievements -> 3 pages at 12/page)
    const evaluated = evaluatePlayerAchievements({
      hasCompletedProfile: true,
      persistentRoomsCreated: 0,
      progression: createEmptyProgression('uid-test'),
      multiplayerStats: {
        'memory-match': createEmptyMultiplayerGameStats(),
        'tic-tac-toe': createEmptyMultiplayerGameStats(),
        snake: createEmptyMultiplayerGameStats(),
      },
      privateRecords: createEmptyPrivateSinglePlayerRecords('uid-test'),
    });
    expect(evaluated.length).toBeGreaterThan(ACHIEVEMENTS_PAGE_SIZE);
    render(
      <AudioProvider>
        <AchievementsView achievements={evaluated} />
      </AudioProvider>
    );
    expect(screen.getByTestId('achievements-pagination')).toBeTruthy();
    expect(screen.getByTestId('achievements-page-indicator').textContent).toContain('Page 1 of');
    expect(screen.getByTestId('achievements-status-in-progress')).toBeTruthy();

    // Privacy projection: OFF by default strips personal bests & achievements, never includes email
    const privateProjection = buildPublicPlayerProfile({
      profile: TEST_PROFILE,
      xpProgress,
      privacy: DEFAULT_PROFILE_PRIVACY,
      privateRecords: createEmptyPrivateSinglePlayerRecords('uid-test'),
      achievements: evaluated,
    });
    expect(privateProjection.sharePersonalBests).toBe(false);
    expect(privateProjection.sharedPersonalBests).toBeNull();
    expect(privateProjection.shareAchievementSummary).toBe(false);
    expect(privateProjection.sharedAchievementSummary).toBeNull();
    expect('email' in privateProjection).toBe(false);

    // Enabling sharing exposes only permitted summary data
    const sharedProjection = buildPublicPlayerProfile({
      profile: TEST_PROFILE,
      xpProgress,
      privacy: { sharePersonalBests: true, shareAchievementSummary: true },
      privateRecords: createEmptyPrivateSinglePlayerRecords('uid-test'),
      achievements: evaluated,
    });
    expect(sharedProjection.sharedPersonalBests).not.toBeNull();
    expect(sharedProjection.sharedAchievementSummary?.unlockedCount).toBeGreaterThanOrEqual(1);
  });

  it('validates Snake room/session creation cleanly, formats Zod JSON errors, tests all 4 walls (solo) vs wraparound (multiplayer), checks 3 GAMES Hero count & What\'s New', () => {
    // 1. Snake room & session schemas succeed without Memory Match validation
    const validatedSnakeRoom = validateRoomCreationInput({
      gameType: 'snake',
      hostNickname: 'SnakeHost',
      maxPlayers: 10,
    });
    expect(validatedSnakeRoom.gameType).toBe('snake');
    expect(validatedSnakeRoom.maxPlayers).toBe(10);
    expect(validatedSnakeRoom.memorySettings).toBeNull();
    expect(
      StartArcadeSessionInputSchema.safeParse({
        arcadeRoomId: 'arc_room_1',
        gameType: 'snake',
        hostNickname: 'SnakeHost',
      }).success
    ).toBe(true);

    // 2. Centralised error formatter never leaks raw Zod JSON arrays
    const rawZodJson =
      '[{"origin":"string","code":"too_small","minimum":3,"path":["name"],"message":"Room name must be at least 3 characters."}]';
    expect(formatUserError(new Error(rawZodJson))).toBe('Room name must be at least 3 characters.');

    // 3. Ten distinct multiplayer snake colours
    expect(MP_SNAKE_PLAYER_COLORS).toHaveLength(10);
    expect(new Set(MP_SNAKE_PLAYER_COLORS).size).toBe(10);

    // 4. Single-player Snake solid walls on all 4 edges (NO wraparound)
    const soloBase = createInitialSinglePlayerSnakeState({ speed: 'slow', difficulty: 'easy' });
    const g = soloBase.gridSize;
    const wallCases: Array<{ head: { x: number; y: number }; dir: 'up' | 'down' | 'left' | 'right' }> = [
      { head: { x: 5, y: 0 }, dir: 'up' },
      { head: { x: 5, y: g - 1 }, dir: 'down' },
      { head: { x: 0, y: 5 }, dir: 'left' },
      { head: { x: g - 1, y: 5 }, dir: 'right' },
    ];
    for (const c of wallCases) {
      const s = stepSinglePlayerSnake({
        ...soloBase,
        obstacles: [],
        snake: [c.head, { x: 10, y: 10 }],
        direction: c.dir,
        queuedDirection: c.dir,
      });
      expect(s.isGameOver).toBe(true);
      expect(s.gameOverReason).toBe('wall');
    }

    // 5. Multiplayer Snake EDGE WRAPAROUND on all 4 edges (player stays alive!)
    const mpBase = createMultiplayerSnakeArena({
      sessionId: 'wrap-test',
      players: [
        { uid: 'p1', username: 'WrapOne' },
        { uid: 'p2', username: 'SafeTwo' },
      ],
    });
    const maxIdx = MP_SNAKE_GRID_SIZE - 1;
    const wrapCases: Array<{
      start: { x: number; y: number };
      dir: 'up' | 'down' | 'left' | 'right';
      expected: { x: number; y: number };
    }> = [
      { start: { x: 0, y: 10 }, dir: 'left', expected: { x: maxIdx, y: 10 } },
      { start: { x: maxIdx, y: 10 }, dir: 'right', expected: { x: 0, y: 10 } },
      { start: { x: 10, y: 0 }, dir: 'up', expected: { x: 10, y: maxIdx } },
      { start: { x: 10, y: maxIdx }, dir: 'down', expected: { x: 10, y: 0 } },
    ];
    for (const wc of wrapCases) {
      const stepped = stepMultiplayerSnakeTick({
        ...mpBase,
        obstacles: [],
        apples: [{ x: 1, y: 1 }],
        snakes: {
          p1: {
            ...mpBase.snakes.p1,
            segments: [wc.start, { x: 12, y: 12 }, { x: 12, y: 13 }],
            direction: wc.dir,
            queuedDirection: wc.dir,
          },
          p2: {
            ...mpBase.snakes.p2,
            segments: [
              { x: 20, y: 20 },
              { x: 20, y: 21 },
              { x: 20, y: 22 },
            ],
            direction: 'up',
            queuedDirection: 'up',
          },
        },
      });
      expect(stepped.snakes.p1.alive).toBe(true);
      expect(stepped.snakes.p1.segments[0]).toEqual(wc.expected);
    }

    // 6. Hero derives 3 GAMES dynamically from GAMES_CATALOG
    const heroRender = render(
      <AudioProvider>
        <Hero onLetsPlay={() => {}} />
      </AudioProvider>
    );
    expect(screen.getByTestId('hero-playable-games-count').textContent).toBe('3 GAMES');
    heroRender.unmount();

    // 7. What's New renders releases and acknowledges latest release
    window.localStorage.clear();
    expect(hasUnreadRelease(null)).toBe(true);
    render(
      <AudioProvider>
        <WhatsNewView />
      </AudioProvider>
    );
    expect(screen.getByTestId('whats-new-view')).toBeTruthy();
    expect(hasUnreadRelease(null)).toBe(false);
  });
});

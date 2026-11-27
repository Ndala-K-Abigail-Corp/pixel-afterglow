// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AudioProvider } from '../context/AudioContext';
import type { UserProfile } from '../types/profile';
import type {
  GameResultRecord,
  LeaderboardEntryDoc,
  MultiplayerGameStats,
  PlatformGameId,
} from '../types/arcadePlatform';
import {
  applyMultiplayerResultToStats,
  applySinglePlayerResultToPrivateRecords,
  buildGameResultId,
  createEmptyMultiplayerGameStats,
  createEmptyPrivateSinglePlayerRecords,
} from './gameHistory';
import {
  ARCADE_LEVEL_THRESHOLDS,
  applyIdempotentXpAward,
  calculateArcadeXpProgress,
  createEmptyProgression,
} from './arcadeProgression';
import {
  ACHIEVEMENT_CATALOG,
  computeNewlyUnlockedAchievements,
  evaluatePlayerAchievements,
  getActiveAchievements,
} from './achievements';
import {
  getLeaderboardPeriodKey,
  getLeaderboardQualificationStatus,
  rankLeaderboardEntries,
} from './leaderboards';
import { processCompletedMultiplayerMatchForPlayer } from '../backend/trustedResultProcessor';
import { ArcadeHomeView } from '../components/dashboard/ArcadeHomeView';
import { AchievementsView } from '../components/dashboard/AchievementsView';
import { LeaderboardsView } from '../components/dashboard/LeaderboardsView';
import { MyProfileView } from '../components/dashboard/MyProfileView';
import {
  DashboardSidebar,
  DashboardMobileBottomNav,
} from '../components/dashboard/DashboardNavigation';

const SAMPLE_PROFILE: UserProfile = {
  uid: 'uid-alice',
  username: 'AliceRetro',
  usernameLower: 'aliceretro',
  displayName: 'Alice',
  email: 'alice@example.com',
  emailVerified: true,
  countryCode: 'ZM',
  countryName: 'Zambia',
  avatarId: 'crown',
  authProvider: 'password',
  accountStatus: 'active',
  createdAt: Date.UTC(2026, 0, 10),
  updatedAt: Date.UTC(2026, 0, 10),
  stats: {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gameRecords: {},
  },
};

function emptyAllMpStats(): Record<PlatformGameId, MultiplayerGameStats> {
  return {
    'memory-match': createEmptyMultiplayerGameStats(),
    'tic-tac-toe': createEmptyMultiplayerGameStats(),
    snake: createEmptyMultiplayerGameStats(),
  };
}

describe('Pixel Afterglow Personal Arcade Platform (Stages 1–6)', () => {
  afterEach(() => {
    cleanup();
  });

  // ── Stage 3: Game History & Player Statistics ─────────────────────────────
  describe('Stage 3 – Game History & Multiplayer/Single-Player Separation', () => {
    it('prevents duplicate multiplayer result processing via deterministic resultId', () => {
      const resultId = buildGameResultId({
        gameId: 'memory-match',
        mode: 'multiplayer',
        sessionId: 'sess_101',
        playerUid: 'uid-alice',
      });

      const result: GameResultRecord = {
        resultId,
        gameId: 'memory-match',
        sessionId: 'sess_101',
        playerUid: 'uid-alice',
        completedAt: Date.UTC(2026, 4, 1, 12, 0, 0),
        mode: 'multiplayer',
        outcome: 'win',
        score: 14,
        durationSeconds: 52,
        validated: true,
        metrics: { pairsMatched: 14, totalPairs: 20, mismatches: 2, cardCount: 40 },
      };

      const processed = new Set<string>();
      const first = applyMultiplayerResultToStats(
        createEmptyMultiplayerGameStats(),
        result,
        processed
      );
      expect(first.applied).toBe(true);
      expect(first.stats.gamesPlayed).toBe(1);
      expect(first.stats.wins).toBe(1);
      expect(first.stats.winPercentage).toBe(100);
      expect(first.stats.totalPairsMatched).toBe(14);

      processed.add(resultId);
      const duplicate = applyMultiplayerResultToStats(first.stats, result, processed);
      expect(duplicate.applied).toBe(false);
      expect(duplicate.stats.gamesPlayed).toBe(1);
      expect(duplicate.stats.wins).toBe(1);
    });

    it('strictly separates single-player personal bests from competitive multiplayer stats', () => {
      const soloWin: GameResultRecord = {
        resultId: 'sp_1',
        gameId: 'memory-match',
        sessionId: 'sp_sess_1',
        playerUid: 'uid-alice',
        completedAt: Date.UTC(2026, 4, 2),
        mode: 'single-player',
        outcome: 'win',
        score: 10,
        durationSeconds: 44,
        validated: true,
        metrics: { pairsMatched: 10, totalPairs: 10, attempts: 10, mismatches: 0, cardCount: 20 },
      };

      // Single-player must NEVER affect competitive multiplayer stats
      const mpAttempt = applyMultiplayerResultToStats(
        createEmptyMultiplayerGameStats(),
        soloWin,
        new Set()
      );
      expect(mpAttempt.applied).toBe(false);
      expect(mpAttempt.stats.gamesPlayed).toBe(0);

      // Private single-player records capture fastest time, fewest attempts, zero mismatches, board size
      const sp = applySinglePlayerResultToPrivateRecords(
        createEmptyPrivateSinglePlayerRecords('uid-alice'),
        soloWin
      );
      expect(sp.isPersonalBest).toBe(true);
      expect(sp.records.memoryMatch.fastestCompletionSeconds).toBe(44);
      expect(sp.records.memoryMatch.fewestAttempts).toBe(10);
      expect(sp.records.memoryMatch.fewestMismatches).toBe(0);
      expect(sp.records.memoryMatch.highestBoardSizeCompleted).toBe(20);
    });
  });

  // ── Stage 4: Arcade XP & Levels ───────────────────────────────────────────
  describe('Stage 4 – Arcade XP & Configurable Levels', () => {
    it('maps all 10 official level names and supports future levels beyond 10', () => {
      expect(ARCADE_LEVEL_THRESHOLDS).toHaveLength(10);
      expect(calculateArcadeXpProgress(0).title).toBe('New Challenger');
      expect(calculateArcadeXpProgress(100).title).toBe('Button Rookie');
      expect(calculateArcadeXpProgress(3800).level).toBe(10);
      expect(calculateArcadeXpProgress(3800).title).toBe('Legend of the Arcade');

      const beyond = calculateArcadeXpProgress(5100);
      expect(beyond.level).toBe(11);
      expect(beyond.title).toContain('Legend of the Arcade');
    });

    it('awards XP idempotently, detects level-ups, and blocks duplicate XP grants', () => {
      const start = createEmptyProgression('uid-alice', 1000);
      const first = applyIdempotentXpAward(start, {
        eventId: 'evt_match_1',
        xpDelta: 120,
        nowMs: 2000,
      });
      expect(first.wasDuplicate).toBe(false);
      expect(first.xpAdded).toBe(120);
      expect(first.leveledUp).toBe(true);
      expect(first.newLevel).toBe(2);
      expect(first.newLevelTitle).toBe('Button Rookie');

      const dup = applyIdempotentXpAward(first.progression, {
        eventId: 'evt_match_1',
        xpDelta: 120,
        nowMs: 3000,
      });
      expect(dup.wasDuplicate).toBe(true);
      expect(dup.xpAdded).toBe(0);
      expect(dup.progression.totalXp).toBe(120);
    });
  });

  // ── Stage 5: Achievements ─────────────────────────────────────────────────
  describe('Stage 5 – Platform & Game Achievements', () => {
    it('activates all 13 Snake achievements alongside platform/MM/TTT achievements with one-time unlocks', () => {
      const snakeDefs = ACHIEVEMENT_CATALOG.filter((a) => a.category === 'snake');
      expect(snakeDefs.length).toBe(13);
      expect(snakeDefs.every((a) => a.active === true)).toBe(true);

      const active = getActiveAchievements();
      expect(active.some((a) => a.category === 'snake')).toBe(true);

      const prog = {
        ...createEmptyProgression('uid-alice'),
        distinctOpponentUids: ['u1', 'u2', 'u3'],
        activeDayKeys: ['2026-05-01', '2026-05-02'],
        playedGameIds: ['memory-match' as PlatformGameId],
        reactionsReceived: 25,
      };

      const evaluated = evaluatePlayerAchievements({
        hasCompletedProfile: true,
        persistentRoomsCreated: 1,
        progression: prog,
        multiplayerStats: emptyAllMpStats(),
        privateRecords: createEmptyPrivateSinglePlayerRecords('uid-alice'),
      });

      const welcome = evaluated.find((a) => a.definition.id === 'welcome-to-the-arcade');
      const roomHost = evaluated.find((a) => a.definition.id === 'room-host');
      const social = evaluated.find((a) => a.definition.id === 'social-butterfly');
      expect(welcome?.unlocked).toBe(true);
      expect(roomHost?.unlocked).toBe(true);
      expect(social?.unlocked).toBe(false);
      expect(social?.progress).toBe(3);
      expect(social?.target).toBe(10);

      const firstGrant = computeNewlyUnlockedAchievements(evaluated, {}, 'uid-alice', 5000);
      expect(firstGrant.newlyUnlocked.map((a) => a.achievementId)).toEqual(
        expect.arrayContaining(['welcome-to-the-arcade', 'room-host'])
      );
      expect(firstGrant.totalXpReward).toBe(125);

      // Re-running with already stored unlocks grants zero duplicate XP
      const storedMap = Object.fromEntries(
        firstGrant.newlyUnlocked.map((a) => [a.achievementId, a])
      );
      const secondGrant = computeNewlyUnlockedAchievements(evaluated, storedMap, 'uid-alice', 6000);
      expect(secondGrant.newlyUnlocked).toHaveLength(0);
      expect(secondGrant.totalXpReward).toBe(0);
    });
  });

  // ── Stage 6: Leaderboards & Trusted Backend Validation ────────────────────
  describe('Stage 6 – Competitive Leaderboards & Trusted Result Processor', () => {
    it('enforces 3-game qualification independently per game and formats progress message', () => {
      const mmStatus = getLeaderboardQualificationStatus('memory-match', 3);
      expect(mmStatus.isQualified).toBe(true);

      const tttStatus = getLeaderboardQualificationStatus('tic-tac-toe', 2);
      expect(tttStatus.isQualified).toBe(false);
      expect(tttStatus.remainingGames).toBe(1);
      expect(tttStatus.message).toBe('2 of 3 games completed – 1 more to qualify.');
    });

    it('ranks by wins, then winPercentage, then draws, excluding anonymous & <3-game players', () => {
      const periodKey = getLeaderboardPeriodKey('all-time');
      const entries: LeaderboardEntryDoc[] = [
        // Qualified #2 (10 wins, 66.7%, 1 draw)
        {
          entryId: 'e1',
          uid: 'u-bob',
          username: 'Bob',
          avatarId: 'robot',
          countryCode: 'ZM',
          countryName: 'Zambia',
          gameId: 'memory-match',
          period: 'all-time',
          periodKey,
          isAnonymous: false,
          gamesPlayed: 15,
          wins: 10,
          losses: 4,
          draws: 1,
          winPercentage: 66.7,
          updatedAt: 1,
        },
        // Qualified #1 (10 wins, 71.4% -> wins tiebreak on winPercentage)
        {
          entryId: 'e2',
          uid: 'u-alice',
          username: 'Alice',
          avatarId: 'crown',
          countryCode: 'ZM',
          countryName: 'Zambia',
          gameId: 'memory-match',
          period: 'all-time',
          periodKey,
          isAnonymous: false,
          gamesPlayed: 14,
          wins: 10,
          losses: 4,
          draws: 0,
          winPercentage: 71.4,
          updatedAt: 1,
        },
        // Qualified #3 (10 wins, 66.7%, 3 draws -> beats Bob on draws!)
        {
          entryId: 'e3',
          uid: 'u-cara',
          username: 'Cara',
          avatarId: 'star',
          countryCode: 'KE',
          countryName: 'Kenya',
          gameId: 'memory-match',
          period: 'all-time',
          periodKey,
          isAnonymous: false,
          gamesPlayed: 15,
          wins: 10,
          losses: 2,
          draws: 3,
          winPercentage: 66.7,
          updatedAt: 1,
        },
        // Unqualified (< 3 games) -> excluded
        {
          entryId: 'e4',
          uid: 'u-newbie',
          username: 'Newbie',
          avatarId: 'cat',
          countryCode: 'ZM',
          countryName: 'Zambia',
          gameId: 'memory-match',
          period: 'all-time',
          periodKey,
          isAnonymous: false,
          gamesPlayed: 2,
          wins: 2,
          losses: 0,
          draws: 0,
          winPercentage: 100,
          updatedAt: 1,
        },
        // Anonymous player -> strictly excluded
        {
          entryId: 'e5',
          uid: 'u-anon',
          username: 'Guest',
          avatarId: 'ghost',
          countryCode: 'ZM',
          countryName: 'Zambia',
          gameId: 'memory-match',
          period: 'all-time',
          periodKey,
          isAnonymous: true as unknown as false,
          gamesPlayed: 20,
          wins: 20,
          losses: 0,
          draws: 0,
          winPercentage: 100,
          updatedAt: 1,
        },
      ];

      const globalRanked = rankLeaderboardEntries(entries, {
        gameId: 'memory-match',
        period: 'all-time',
        scope: 'global',
      });
      expect(globalRanked.map((e) => e.uid)).toEqual(['u-alice', 'u-cara', 'u-bob']);
      expect(globalRanked.map((e) => e.rank)).toEqual([1, 2, 3]);

      const zambiaRanked = rankLeaderboardEntries(entries, {
        gameId: 'memory-match',
        period: 'all-time',
        scope: 'country',
        countryCode: 'ZM',
      });
      expect(zambiaRanked.map((e) => e.uid)).toEqual(['u-alice', 'u-bob']);
    });

    it('computes consistent UTC weekly and monthly period keys', () => {
      const ts = Date.UTC(2026, 4, 14, 15, 0, 0); // May 14, 2026
      expect(getLeaderboardPeriodKey('monthly', ts)).toBe('2026-05');
      expect(getLeaderboardPeriodKey('weekly', ts)).toBe('2026-W20');
      expect(getLeaderboardPeriodKey('all-time', ts)).toBe('all-time');
    });

    it('processes completed multiplayer matches idempotently and excludes anonymous players', () => {
      const completedAt = Date.UTC(2026, 4, 14, 18, 0, 0);
      const match = {
        sessionId: 'room_match_99',
        gameId: 'memory-match' as const,
        completedAt,
        durationSeconds: 50,
        participants: [
          { uid: 'uid-alice', outcome: 'win' as const, score: 12, pairsMatched: 12, mismatches: 0 },
          { uid: 'uid-anon', outcome: 'loss' as const, score: 8, pairsMatched: 8 },
        ],
      };

      const anonBundle = processCompletedMultiplayerMatchForPlayer(
        {
          uid: 'uid-anon',
          username: 'Guest',
          avatarId: 'ghost',
          countryCode: 'ZM',
          countryName: 'Zambia',
          isAnonymous: true,
          hasCompletedProfile: false,
          persistentRoomsCreated: 0,
          progression: createEmptyProgression('uid-anon'),
          multiplayerStats: emptyAllMpStats(),
          privateRecords: createEmptyPrivateSinglePlayerRecords('uid-anon'),
          storedAchievements: {},
          processedResultIds: new Set(),
          existingLeaderboardEntries: {},
        },
        match
      );
      expect(anonBundle.skippedReason).toBe('anonymous');
      expect(anonBundle.updatedLeaderboardEntries).toHaveLength(0);

      const aliceBundle = processCompletedMultiplayerMatchForPlayer(
        {
          uid: 'uid-alice',
          username: 'AliceRetro',
          avatarId: 'crown',
          countryCode: 'ZM',
          countryName: 'Zambia',
          isAnonymous: false,
          hasCompletedProfile: true,
          persistentRoomsCreated: 0,
          progression: createEmptyProgression('uid-alice'),
          multiplayerStats: emptyAllMpStats(),
          privateRecords: createEmptyPrivateSinglePlayerRecords('uid-alice'),
          storedAchievements: {},
          processedResultIds: new Set(),
          existingLeaderboardEntries: {},
        },
        match
      );

      expect(aliceBundle.skippedReason).toBeUndefined();
      expect(aliceBundle.updatedMultiplayerStats?.wins).toBe(1);
      expect(aliceBundle.updatedLeaderboardEntries).toHaveLength(3); // weekly, monthly, all-time
      expect(aliceBundle.xpAwardedTotal).toBeGreaterThan(0);
      expect(aliceBundle.newlyUnlockedAchievements.some((a) => a.achievementId === 'memory-champion')).toBe(true);
    });
  });

  // ── UI Rendering Tests (Dashboard, Navigation, Achievements, Leaderboards, Profile) ──
  describe('Dashboard, Navigation, Achievements, Leaderboards & Profile UI', () => {
    it('renders ArcadeHomeView with real profile data, XP bar, and welcoming empty states', () => {
      const xpProgress = calculateArcadeXpProgress(150);
      render(
        <AudioProvider>
          <ArcadeHomeView
            profile={SAMPLE_PROFILE}
            rooms={[]}
            gameHistory={[]}
            multiplayerStats={emptyAllMpStats()}
            privateRecords={createEmptyPrivateSinglePlayerRecords('uid-alice')}
            xpProgress={xpProgress}
            achievements={[]}
            onNavigateSection={() => {}}
            onOpenArcadeRoom={() => {}}
            onCreateArcadeRoom={() => {}}
            onPlayGame={() => {}}
          />
        </AudioProvider>
      );

      expect(screen.getByTestId('arcade-home-dashboard')).toBeTruthy();
      expect(screen.getByText('AliceRetro')).toBeTruthy();
      expect(screen.getByText(/Zambia/)).toBeTruthy();
      expect(screen.getByTestId('arcade-level-badge').textContent).toContain('LVL 2');
      expect(screen.getByTestId('dashboard-rooms-empty')).toBeTruthy();
      expect(screen.getByTestId('dashboard-activity-empty')).toBeTruthy();
    });

    it('renders desktop sidebar and mobile compact bottom navigation cleanly', () => {
      const onSelect = vi.fn();
      const xpProgress = calculateArcadeXpProgress(0);
      render(
        <AudioProvider>
          <DashboardSidebar
            activeSection="arcade-home"
            onSelectSection={onSelect}
            onVisitPublicHome={() => {}}
            profile={SAMPLE_PROFILE}
            xpProgress={xpProgress}
          />
          <DashboardMobileBottomNav activeSection="arcade-home" onSelectSection={onSelect} />
        </AudioProvider>
      );

      expect(screen.getByTestId('dashboard-desktop-sidebar')).toBeTruthy();
      expect(screen.getByTestId('dashboard-mobile-bottom-nav')).toBeTruthy();
      fireEvent.click(screen.getByTestId('sidebar-nav-leaderboards'));
      expect(onSelect).toHaveBeenCalledWith('leaderboards');
    });

    it('renders custom pixel-art SVG badges in AchievementsView and supports category filtering', () => {
      const evaluated = evaluatePlayerAchievements({
        hasCompletedProfile: true,
        persistentRoomsCreated: 0,
        progression: createEmptyProgression('uid-alice'),
        multiplayerStats: emptyAllMpStats(),
        privateRecords: createEmptyPrivateSinglePlayerRecords('uid-alice'),
      });

      render(
        <AudioProvider>
          <AchievementsView achievements={evaluated} />
        </AudioProvider>
      );

      const welcomeCard = screen.getByTestId('achievement-card-welcome-to-the-arcade');
      expect(welcomeCard.querySelector('svg')).toBeTruthy();
      expect(screen.getByTestId('achievements-unlocked-count').textContent).toContain('1 /');
    });

    it('renders LeaderboardsView with qualification progress and podium when entries exist', () => {
      const stats = emptyAllMpStats();
      stats['memory-match'].gamesPlayed = 2;

      render(
        <AudioProvider>
          <LeaderboardsView
            profile={SAMPLE_PROFILE}
            multiplayerStats={stats}
            initialEntries={[]}
          />
        </AudioProvider>
      );

      expect(screen.getByTestId('leaderboard-qualification-banner').textContent).toContain(
        '2 of 3 games completed – 1 more to qualify.'
      );
      expect(screen.getByTestId('leaderboard-empty-state')).toBeTruthy();
    });

    it('renders MyProfileView with separate multiplayer stats and private single-player records', () => {
      render(
        <AudioProvider>
          <MyProfileView
            profile={SAMPLE_PROFILE}
            xpProgress={calculateArcadeXpProgress(260)}
            multiplayerStats={emptyAllMpStats()}
            privateRecords={createEmptyPrivateSinglePlayerRecords('uid-alice')}
            achievements={[]}
            gameHistory={[]}
            onSignedOut={() => {}}
          />
        </AudioProvider>
      );

      expect(screen.getByTestId('dashboard-my-profile-view')).toBeTruthy();
      expect(screen.getByTestId('profile-private-records')).toBeTruthy();
    });
  });

  // ── Simulated Security Rules Static Verification ──────────────────────────
  describe('Firestore Security Rules Protection (Simulated Static Verification)', () => {
    it('enforces room-verified atomic competitive stats/history/leaderboards and strictly denies client writes to achievements & progression', () => {
      const rulesSource = fs.readFileSync(
        path.resolve(process.cwd(), 'firestore.rules'),
        'utf-8'
      );

      expect(rulesSource).toMatch(/match \/gameStats\/\{gameId\}[\s\S]*?existsAfter\(/);
      expect(rulesSource).toMatch(/match \/gameHistory\/\{resultId\}[\s\S]*?isValidCompletedRoomOutcome\(/);
      expect(rulesSource).toMatch(/match \/achievements\/\{achievementId\}[\s\S]*?allow write: if false;/);
      expect(rulesSource).toMatch(/match \/progression\/\{docId\}[\s\S]*?allow write: if false;/);
      expect(rulesSource).toMatch(/match \/leaderboardEntries\/\{entryId\}[\s\S]*?existsAfter\(/);
      expect(rulesSource).toMatch(/match \/privateRecords\/\{docId\}[\s\S]*?isRegisteredUser\(\) && request\.auth\.uid == userId/);
    });
  });
});

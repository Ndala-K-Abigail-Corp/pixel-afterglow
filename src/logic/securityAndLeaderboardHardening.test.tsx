// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AudioProvider } from '../context/AudioContext';
import {
  MIN_LEADERBOARD_GAMES,
  getLeaderboardPeriodKey,
  getLeaderboardQualificationStatus,
  rankLeaderboardEntries,
} from './leaderboards';
import type { LeaderboardEntryDoc } from '../types/arcadePlatform';
import type { UserProfile } from '../types/profile';
import { createEmptyMultiplayerGameStats } from './gameHistory';

// In-memory Firestore mock for atomic matchRecording transaction verification
const mockStore = new Map<string, Record<string, unknown>>();
let shouldFailTransaction = false;

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getFirestoreDb: vi.fn(() => ({ __mockDb: true })),
  getFirebaseAuth: vi.fn(() => null),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
  };
});

vi.mock('../lib/firestore', () => ({
  runFirestoreTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    if (shouldFailTransaction) {
      throw new Error('permission-denied');
    }
    const tx = {
      get: async (ref: { path: string }) => {
        const data = mockStore.get(ref.path);
        return {
          exists: () => Boolean(data),
          data: () => data,
        };
      },
      set: (ref: { path: string }, value: Record<string, unknown>) => {
        mockStore.set(ref.path, structuredClone(value));
      },
    };
    return fn(tx);
  }),
}));

const mockRefreshAdminClaim = vi.fn(async () => false);
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    uid: 'uid-alice',
    profile: TEST_PROFILE,
    isSignedInAccount: true,
    isAdmin: false,
    isLoadingAuth: false,
    refreshAdminClaim: mockRefreshAdminClaim,
  }),
}));

import { recordVerifiedMultiplayerMatchForPlayer } from './matchRecording';
import { LeaderboardsView } from '../components/dashboard/LeaderboardsView';
import { AdminDashboardView } from '../components/admin/AdminDashboardView';

const TEST_PROFILE: UserProfile = {
  uid: 'uid-alice',
  username: 'AliceRetro',
  usernameLower: 'aliceretro',
  displayName: 'AliceRetro',
  email: 'alice@example.com',
  emailVerified: true,
  countryCode: 'ZM',
  countryName: 'Zambia',
  avatarId: 'crown',
  authProvider: 'password',
  accountStatus: 'active',
  createdAt: 1730000000000,
  updatedAt: 1730000000000,
  stats: { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gameRecords: {} },
};

describe('Security Hardening, Match Recording & 3-Match Leaderboard Qualification', () => {
  beforeEach(() => {
    mockStore.clear();
    shouldFailTransaction = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Repository, Security Headers & Firestore Rules Hardening', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const gitignore = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf8');
    const vercelConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
    ) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

    it('protects player emails in users/{userId}, scopes feedback activity, and restricts room listing', () => {
      // 1. Player email privacy
      expect(rules).toContain('allow get: if (isSignedIn() && request.auth.uid == userId) || isAdmin();');
      expect(rules).toContain('allow list: if isAdmin();');
      // 2. Feedback activity ownership
      expect(rules).toContain(
        'get(/databases/$(database)/documents/feedbackReports/$(reportId)).data.reporterUid == request.auth.uid'
      );
      // 3. Room enumeration protection
      expect(rules).toContain('allow list: if isSignedIn() && (request.auth.uid in resource.data.players);');
      expect(rules).toContain('request.query.limit <= 1');
      // 4. Validated match recording rules
      expect(rules).toContain('isValidSnakeRoomCompletion()');
      expect(rules).toContain('isValidCompletedRoomOutcome(');
    });

    it('excludes service account JSONs and private keys in .gitignore without ignoring package.json', () => {
      expect(gitignore).toContain('*serviceAccount*.json');
      expect(gitignore).toContain('*.pem');
      expect(gitignore).toContain('*.key');
      expect(gitignore).not.toMatch(/^\*\.json$/m);
    });

    it('configures Vercel production security headers preserving Google Sign-In popups', () => {
      const rootHeaders = vercelConfig.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
      const map = Object.fromEntries(rootHeaders.map((h) => [h.key, h.value]));
      expect(map['Cross-Origin-Opener-Policy']).toBe('same-origin-allow-popups');
      expect(map['X-Content-Type-Options']).toBe('nosniff');
      expect(map['X-Frame-Options']).toBe('DENY');
      expect(map['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('removes verified unused dependencies from package.json', () => {
      expect(pkg.dependencies?.['@google/genai']).toBeUndefined();
      expect(pkg.dependencies?.dotenv).toBeUndefined();
      expect(pkg.dependencies?.express).toBeUndefined();
      expect(pkg.devDependencies?.['@types/express']).toBeUndefined();
    });

    it('revalidates admin custom claim on AdminDashboardView mount', () => {
      render(
        <AudioProvider>
          <AdminDashboardView />
        </AudioProvider>
      );
      expect(mockRefreshAdminClaim).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('admin-access-denied')).toBeTruthy();
    });
  });

  describe('Multiplayer Match Recording (Snake, Memory Match, Tic-Tac-Toe)', () => {
    it('records Snake, Memory Match, and Tic-Tac-Toe matches atomically into history, stats & 3 periods', async () => {
      const fixedNow = Date.UTC(2026, 10, 27, 14, 0, 0);

      for (const gameId of ['snake', 'memory-match', 'tic-tac-toe'] as const) {
        const res = await recordVerifiedMultiplayerMatchForPlayer({
          roomCode: 'ABC123',
          gameId,
          roundNumber: 1,
          playerUid: TEST_PROFILE.uid,
          profile: TEST_PROFILE,
          isRegisteredAccount: true,
          outcome: gameId === 'tic-tac-toe' ? 'draw' : 'win',
          score: gameId === 'snake' ? 120 : 5,
          opponentUids: ['uid-bob'],
          completedAt: fixedNow,
        });

        expect(res.recorded).toBe(true);
        expect(res.resultId).toBeTruthy();

        const statsDoc = mockStore.get(`users/${TEST_PROFILE.uid}/gameStats/${gameId}`) as {
          multiplayer: { gamesPlayed: number; wins: number; draws: number };
        };
        expect(statsDoc.multiplayer.gamesPlayed).toBe(1);
        if (gameId === 'tic-tac-toe') {
          expect(statsDoc.multiplayer.draws).toBe(1);
          expect(statsDoc.multiplayer.wins).toBe(0);
        } else {
          expect(statsDoc.multiplayer.wins).toBe(1);
        }

        // Verify all 3 periods (weekly, monthly, all-time) created
        const allTimeKey = getLeaderboardPeriodKey('all-time', fixedNow);
        const monthlyKey = getLeaderboardPeriodKey('monthly', fixedNow);
        const weeklyKey = getLeaderboardPeriodKey('weekly', fixedNow);
        expect(mockStore.has(`leaderboardEntries/${gameId}_all-time_${allTimeKey}_${TEST_PROFILE.uid}`)).toBe(true);
        expect(mockStore.has(`leaderboardEntries/${gameId}_monthly_${monthlyKey}_${TEST_PROFILE.uid}`)).toBe(true);
        expect(mockStore.has(`leaderboardEntries/${gameId}_weekly_${weeklyKey}_${TEST_PROFILE.uid}`)).toBe(true);
      }
    });

    it('prevents duplicate submissions, excludes anonymous & single-player, and handles Firestore failures', async () => {
      // Duplicate prevention
      const first = await recordVerifiedMultiplayerMatchForPlayer({
        roomCode: 'SNAKE1',
        gameId: 'snake',
        roundNumber: 1,
        playerUid: TEST_PROFILE.uid,
        profile: TEST_PROFILE,
        isRegisteredAccount: true,
        outcome: 'win',
        score: 80,
        opponentUids: ['uid-bob'],
      });
      const dup = await recordVerifiedMultiplayerMatchForPlayer({
        roomCode: 'SNAKE1',
        gameId: 'snake',
        roundNumber: 1,
        playerUid: TEST_PROFILE.uid,
        profile: TEST_PROFILE,
        isRegisteredAccount: true,
        outcome: 'win',
        score: 80,
        opponentUids: ['uid-bob'],
      });
      expect(first.recorded).toBe(true);
      expect(dup.recorded).toBe(false);
      expect(dup.reason).toBe('duplicate');

      // Anonymous exclusion
      const anon = await recordVerifiedMultiplayerMatchForPlayer({
        roomCode: 'SNAKE2',
        gameId: 'snake',
        roundNumber: 1,
        playerUid: 'anon-1',
        profile: null,
        isRegisteredAccount: false,
        outcome: 'win',
        score: 50,
        opponentUids: ['uid-bob'],
      });
      expect(anon.recorded).toBe(false);
      expect(anon.reason).toBe('anonymous');

      // Single-player / 0-opponent exclusion
      const solo = await recordVerifiedMultiplayerMatchForPlayer({
        roomCode: 'SOLO01',
        gameId: 'snake',
        roundNumber: 1,
        playerUid: TEST_PROFILE.uid,
        profile: TEST_PROFILE,
        isRegisteredAccount: true,
        outcome: 'win',
        score: 50,
        opponentUids: [],
      });
      expect(solo.recorded).toBe(false);
      expect(solo.reason).toBe('invalid-participants');

      // Failed Firestore submission handled gracefully
      shouldFailTransaction = true;
      const failed = await recordVerifiedMultiplayerMatchForPlayer({
        roomCode: 'FAIL01',
        gameId: 'snake',
        roundNumber: 1,
        playerUid: TEST_PROFILE.uid,
        profile: TEST_PROFILE,
        isRegisteredAccount: true,
        outcome: 'loss',
        score: 10,
        opponentUids: ['uid-bob'],
      });
      expect(failed.recorded).toBe(false);
      expect(failed.reason).toBe('error');
    });
  });

  describe('3-Match Per-Game Leaderboard Qualification & Filtering', () => {
    it('tracks qualification at 0, 1, 2, and 3 matches independently per game', () => {
      expect(MIN_LEADERBOARD_GAMES).toBe(3);

      expect(getLeaderboardQualificationStatus('snake', 0)).toMatchObject({
        completedGames: 0,
        requiredGames: 3,
        remainingGames: 3,
        isQualified: false,
      });
      expect(getLeaderboardQualificationStatus('snake', 1)).toMatchObject({
        completedGames: 1,
        remainingGames: 2,
        isQualified: false,
      });
      expect(getLeaderboardQualificationStatus('snake', 2)).toMatchObject({
        completedGames: 2,
        remainingGames: 1,
        isQualified: false,
      });
      expect(getLeaderboardQualificationStatus('snake', 3)).toMatchObject({
        completedGames: 3,
        remainingGames: 0,
        isQualified: true,
      });
    });

    it('never combines matches from different games in LeaderboardsView All Games tab', () => {
      const stats = {
        'memory-match': { ...createEmptyMultiplayerGameStats(), gamesPlayed: 2 },
        'tic-tac-toe': { ...createEmptyMultiplayerGameStats(), gamesPlayed: 2 },
        snake: { ...createEmptyMultiplayerGameStats(), gamesPlayed: 1 },
      };

      render(
        <AudioProvider>
          <LeaderboardsView profile={TEST_PROFILE} multiplayerStats={stats} initialEntries={[]} />
        </AudioProvider>
      );

      fireEvent.click(screen.getByTestId('leaderboard-game-all'));
      // Max across individual games is 2 (NOT 2+2+1=5), so still not qualified!
      expect(screen.getByTestId('leaderboard-qualification-banner').textContent).toContain(
        '2 of 3 games completed – 1 more to qualify.'
      );

      fireEvent.click(screen.getByTestId('leaderboard-game-snake'));
      expect(screen.getByTestId('leaderboard-qualification-banner').textContent).toContain(
        '1 of 3 games completed – 2 more to qualify.'
      );
    });

    it('qualifies valid historical entries with 3 matches across weekly/monthly/all-time and country filters', () => {
      const ts = Date.UTC(2026, 10, 27, 12, 0, 0);
      const weekKey = getLeaderboardPeriodKey('weekly', ts);
      const historicalEntries: LeaderboardEntryDoc[] = [
        {
          entryId: `snake_weekly_${weekKey}_u1`,
          uid: 'u1',
          username: 'SnakeAce',
          avatarId: 'dragon',
          countryCode: 'ZM',
          countryName: 'Zambia',
          gameId: 'snake',
          period: 'weekly',
          periodKey: weekKey,
          isAnonymous: false,
          gamesPlayed: 3,
          wins: 2,
          losses: 0,
          draws: 1,
          winPercentage: 66.7,
          updatedAt: ts,
        },
        {
          entryId: `snake_weekly_${weekKey}_u2`,
          uid: 'u2',
          username: 'KenyanPro',
          avatarId: 'star',
          countryCode: 'KE',
          countryName: 'Kenya',
          gameId: 'snake',
          period: 'weekly',
          periodKey: weekKey,
          isAnonymous: false,
          gamesPlayed: 3,
          wins: 3,
          losses: 0,
          draws: 0,
          winPercentage: 100,
          updatedAt: ts,
        },
        {
          entryId: `snake_weekly_${weekKey}_u3`,
          uid: 'u3',
          username: 'TwoGamesOnly',
          avatarId: 'cat',
          countryCode: 'ZM',
          countryName: 'Zambia',
          gameId: 'snake',
          period: 'weekly',
          periodKey: weekKey,
          isAnonymous: false,
          gamesPlayed: 2,
          wins: 2,
          losses: 0,
          draws: 0,
          winPercentage: 100,
          updatedAt: ts,
        },
      ];

      const globalRanked = rankLeaderboardEntries(historicalEntries, {
        gameId: 'snake',
        period: 'weekly',
        periodKey: weekKey,
        scope: 'global',
      });
      expect(globalRanked.map((e) => e.uid)).toEqual(['u2', 'u1']);

      const zmRanked = rankLeaderboardEntries(historicalEntries, {
        gameId: 'snake',
        period: 'weekly',
        periodKey: weekKey,
        scope: 'country',
        countryCode: 'ZM',
      });
      expect(zmRanked.map((e) => e.uid)).toEqual(['u1']);
    });
  });
});

// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AudioProvider } from '../context/AudioContext';
import {
  buildFeedbackReport,
  collectSafeTechnicalContext,
  FeedbackSubmissionInputSchema,
  generateReportReferenceCode,
} from './feedback';
import type { FeedbackReportDocument } from '../types/feedback';
import { SnakeHeadSprite, SnakeBodySprite } from '../components/game/SnakeCharacterSprites';
import {
  createInitialSinglePlayerSnakeState,
  stepSinglePlayerSnake,
} from './snake';
import {
  createMultiplayerSnakeArena,
  stepMultiplayerSnakeTick,
} from '../backend/snakeRealtimeEngine';

// Mock Firebase so unit tests never open live Firestore gRPC channels
vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getFirestoreDb: vi.fn(() => null),
  getFirebaseAuth: vi.fn(() => null),
}));

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { FeedbackFormView } from '../components/feedback/FeedbackFormView';
import { MyReportsView } from '../components/feedback/MyReportsView';
import { AdminDashboardView } from '../components/admin/AdminDashboardView';
import { SnakeGame } from '../components/game/SnakeGame';

const SAMPLE_REPORT: FeedbackReportDocument = {
  reportId: 'rep_1',
  referenceCode: 'PA-123456',
  reporterUid: 'uid_registered_1',
  reporterUsername: 'PixelHero',
  isAnonymous: false,
  category: 'bug-report',
  title: 'Snake pause shortcut sticky',
  description: 'Pressing space twice quickly sometimes toggles pause unexpectedly.',
  affectedArea: 'snake',
  affectedGame: 'snake',
  reproductionSteps: '1. Start Snake\n2. Press Space quickly',
  expectedBehaviour: 'Game pauses cleanly once.',
  actualBehaviour: 'Pause overlay flickers.',
  frequency: 'sometimes',
  currentExperience: '',
  suggestedImprovement: '',
  technicalContext: {
    submittedAtIso: '2026-11-27T12:00:00.000Z',
    browser: 'Chrome',
    os: 'Windows',
    deviceType: 'desktop',
    screenDimensions: '1440x900',
    appVersion: '2.2.0',
    route: '/game/snake',
    gameType: 'snake',
    userType: 'registered',
    sessionRef: null,
  },
  status: 'in-progress',
  priority: 'high',
  createdAt: 1730000000000,
  updatedAt: 1730000100000,
  resolvedAt: null,
  assignedAdminUid: 'uid_admin_1',
  latestPublicResponse: {
    message: 'Thanks! We reproduced this and a fix is underway.',
    respondedAt: 1730000100000,
    adminUid: 'uid_admin_1',
  },
};

describe('Feedback System, Security Rules & Pixel-Art Snake Visuals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      uid: 'uid_registered_1',
      profile: {
        uid: 'uid_registered_1',
        username: 'PixelHero',
        countryCode: 'ZM',
        avatarId: 'star',
      },
      isSignedInAccount: true,
      isAdmin: false,
      isLoadingAuth: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Feedback validation & report builder', () => {
    it('generates PA-XXXXXX reference codes and validates required fields', () => {
      const code = generateReportReferenceCode();
      expect(code).toMatch(/^PA-[A-Z0-9]{6}$/);

      const invalid = FeedbackSubmissionInputSchema.safeParse({
        category: 'bug-report',
        title: 'Hi',
        description: 'Too short',
        affectedArea: 'snake',
      });
      expect(invalid.success).toBe(false);
    });

    it('binds registered user identity automatically and supports anonymous guest submissions', () => {
      const { report: regReport } = buildFeedbackReport({
        input: {
          category: 'improvement-suggestion',
          title: 'Add custom color palettes',
          description: 'Would love selectable retro CRT palettes in settings.',
          affectedArea: 'dashboard',
          suggestedImprovement: 'Include GameBoy green and amber modes.',
        },
        authenticatedUid: 'uid_registered_1',
        authenticatedProfileUsername: 'PixelHero',
        isRegisteredAccount: true,
        route: '/dashboard/feedback',
      });

      expect(regReport.isAnonymous).toBe(false);
      expect(regReport.reporterUid).toBe('uid_registered_1');
      expect(regReport.reporterUsername).toBe('PixelHero');
      expect(regReport.status).toBe('submitted');

      const { report: anonReport } = buildFeedbackReport({
        input: {
          category: 'general-feedback',
          title: 'Love the retro arcade vibe',
          description: 'Playing Memory Match with friends works super smoothly!',
          affectedArea: 'memory-match',
          anonymousNickname: 'RetroGuest',
        },
        authenticatedUid: null,
        authenticatedProfileUsername: null,
        isRegisteredAccount: false,
        route: '/feedback',
      });

      expect(anonReport.isAnonymous).toBe(true);
      expect(anonReport.reporterUid).toBeNull();
      expect(anonReport.reporterUsername).toContain('RetroGuest');
    });

    it('collects only non-sensitive technical context', () => {
      const ctx = collectSafeTechnicalContext({
        isRegistered: true,
        route: '/game/snake',
        gameType: 'snake',
      });
      expect(ctx.route).toBe('/game/snake');
      expect(ctx.gameType).toBe('snake');
      expect(Object.keys(ctx)).not.toContain('email');
      expect(Object.keys(ctx)).not.toContain('token');
      expect(Object.keys(ctx)).not.toContain('password');
    });
  });

  describe('FeedbackFormView UI', () => {
    it('auto-populates read-only username for registered users and submits cleanly', async () => {
      render(
        <AudioProvider>
          <FeedbackFormView initialArea="snake" initialGameType="snake" />
        </AudioProvider>
      );

      // Registered username is read-only; no editable username/email input
      expect(screen.getByTestId('feedback-authenticated-identity').textContent).toContain('PixelHero');
      expect(screen.queryByTestId('feedback-anon-nickname-input')).toBeNull();
      // Text-only notice present (no screenshot upload)
      expect(screen.getByText(/Text-only/i)).toBeTruthy();

      fireEvent.change(screen.getByTestId('feedback-title-input'), {
        target: { value: 'Snake audio volume dip' },
      });
      fireEvent.change(screen.getByTestId('feedback-description-input'), {
        target: { value: 'After eating 10 apples the sound effect is slightly quieter.' },
      });

      fireEvent.click(screen.getByTestId('feedback-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('feedback-confirmation')).toBeTruthy();
      });
      expect(screen.getByTestId('feedback-reference-code').textContent).toMatch(/^PA-[A-Z0-9]{6}$/);
    });

    it('allows anonymous guest submission without registration', async () => {
      mockUseAuth.mockReturnValue({
        uid: 'anon_session_99',
        profile: null,
        isSignedInAccount: false,
        isAdmin: false,
        isLoadingAuth: false,
      });

      render(
        <AudioProvider>
          <FeedbackFormView initialArea="other" />
        </AudioProvider>
      );

      expect(screen.queryByTestId('feedback-authenticated-identity')).toBeNull();
      expect(screen.getByTestId('feedback-anon-nickname-input')).toBeTruthy();

      fireEvent.change(screen.getByTestId('feedback-anon-nickname-input'), {
        target: { value: 'GuestPlayer1' },
      });
      fireEvent.change(screen.getByTestId('feedback-title-input'), {
        target: { value: 'Great homepage design' },
      });
      fireEvent.change(screen.getByTestId('feedback-description-input'), {
        target: { value: 'Everything loaded fast on mobile and feels super crisp.' },
      });

      fireEvent.click(screen.getByTestId('feedback-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('feedback-confirmation')).toBeTruthy();
      });
    });
  });

  describe('MyReportsView UI', () => {
    it('displays player reports, status, and latest public admin response', async () => {
      render(
        <AudioProvider>
          <MyReportsView onNewReport={vi.fn()} initialReports={[SAMPLE_REPORT]} />
        </AudioProvider>
      );

      expect(screen.getByTestId('my-reports-view')).toBeTruthy();
      expect(screen.getByText('PA-123456')).toBeTruthy();
      expect(screen.getByText('Snake pause shortcut sticky')).toBeTruthy();
      expect(screen.getByText('In Progress')).toBeTruthy();

      // Expand card to inspect the latest public admin response
      fireEvent.click(screen.getByText('Snake pause shortcut sticky'));
      await waitFor(() => {
        expect(screen.getByText(/Thanks! We reproduced this/i)).toBeTruthy();
      });
    });
  });

  describe('AdminDashboardView access control & management', () => {
    it('blocks non-admin users from accessing admin dashboard', () => {
      render(
        <AudioProvider>
          <AdminDashboardView forceIsAdmin={false} initialReports={[SAMPLE_REPORT]} />
        </AudioProvider>
      );

      expect(screen.getByTestId('admin-access-denied')).toBeTruthy();
      expect(screen.queryByTestId('admin-dashboard-view')).toBeNull();
    });

    it('allows verified admins to filter reports and toggle Public Response vs Internal Note', () => {
      render(
        <AudioProvider>
          <AdminDashboardView forceIsAdmin={true} initialReports={[SAMPLE_REPORT]} />
        </AudioProvider>
      );

      expect(screen.getByTestId('admin-dashboard-view')).toBeTruthy();
      expect(screen.getByText('PA-123456')).toBeTruthy();

      // Search filter
      fireEvent.change(screen.getByTestId('admin-search-input'), {
        target: { value: 'nonexistent-query' },
      });
      expect(screen.getByText(/No reports match the current filters/i)).toBeTruthy();

      fireEvent.change(screen.getByTestId('admin-search-input'), {
        target: { value: 'PA-123456' },
      });
      fireEvent.click(screen.getByTestId('admin-report-row-PA-123456'));

      expect(screen.getByTestId('admin-status-select')).toBeTruthy();
      expect(screen.getByTestId('admin-priority-select')).toBeTruthy();
      expect(screen.getByTestId('admin-mode-public')).toBeTruthy();
      expect(screen.getByTestId('admin-mode-internal')).toBeTruthy();
    });
  });

  describe('Firestore Security Rules static audit for feedback & admin', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    it('enforces custom-claim admin role and isolates private internal admin notes', () => {
      expect(rulesContent).toContain('request.auth.token.admin == true');
      expect(rulesContent).toContain('match /feedbackReports/{reportId}');
      expect(rulesContent).toContain("request.resource.data.status == 'submitted'");
      expect(rulesContent).toContain('match /activity/{activityId}');
      expect(rulesContent).toContain("resource.data.visibility == 'public'");
    });
  });

  describe('Pixel-art Snake character visuals & preserved gameplay rules', () => {
    it('renders directional SnakeHeadSprite with eyes, flicking forked tongue, and eating animation', () => {
      const { rerender } = render(
        <SnakeHeadSprite color="#56E0CB" direction="up" showTongue={true} isEating={false} />
      );

      const head = screen.getByTestId('snake-head-sprite');
      expect(head.getAttribute('data-direction')).toBe('up');
      expect(screen.getByTestId('snake-tongue')).toBeTruthy();
      expect(screen.queryByTestId('snake-eating-mouth')).toBeNull();

      rerender(
        <SnakeHeadSprite color="#56E0CB" direction="left" showTongue={false} isEating={true} />
      );
      expect(screen.getByTestId('snake-head-sprite').getAttribute('data-direction')).toBe('left');
      expect(screen.getByTestId('snake-eating-mouth')).toBeTruthy();
    });

    it('renders SnakeBodySprite for body and tapered tail segments', () => {
      render(
        <div>
          <SnakeBodySprite color="#34B8A5" isTail={false} />
          <SnakeBodySprite color="#34B8A5" isTail={true} />
        </div>
      );
      expect(screen.getByTestId('snake-body-sprite')).toBeTruthy();
      expect(screen.getByTestId('snake-tail-sprite')).toBeTruthy();
    });

    it('renders enhanced pixel-art snake sprites inside SnakeGame without altering core rules', () => {
      render(
        <AudioProvider>
          <SnakeGame onBackToHome={vi.fn()} />
        </AudioProvider>
      );

      fireEvent.click(screen.getByTestId('snake-start-btn'));
      expect(screen.getByTestId('snake-head-sprite')).toBeTruthy();
      expect(screen.getByTestId('snake-tail-sprite')).toBeTruthy();

      // Verify single-player solid wall collision still ends the game
      let sp = createInitialSinglePlayerSnakeState({ speed: 'fast', difficulty: 'easy' });
      sp = {
        ...sp,
        snake: [
          { x: sp.gridSize - 1, y: 5 },
          { x: sp.gridSize - 2, y: 5 },
        ],
        direction: 'right',
      };
      const afterWall = stepSinglePlayerSnake(sp);
      expect(afterWall.isGameOver).toBe(true);
      expect(afterWall.gameOverReason).toBe('wall');

      // Verify multiplayer edge wraparound still wraps cleanly
      const arena = createMultiplayerSnakeArena({
        sessionId: 'wrap_check',
        roundNumber: 1,
        players: [
          { uid: 'p1', username: 'Alpha' },
          { uid: 'p2', username: 'Beta' },
        ],
      });
      arena.snakes.p1.segments = [
        { x: arena.gridSize - 1, y: 2 },
        { x: arena.gridSize - 2, y: 2 },
        { x: arena.gridSize - 3, y: 2 },
      ];
      arena.snakes.p1.direction = 'right';
      arena.obstacles = [];
      const nextArena = stepMultiplayerSnakeTick(arena);
      expect(nextArena.snakes.p1.alive).toBe(true);
      expect(nextArena.snakes.p1.segments[0].x).toBe(0);
    });
  });
});

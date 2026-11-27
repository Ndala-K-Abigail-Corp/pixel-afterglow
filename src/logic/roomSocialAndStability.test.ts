// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
  shouldAcceptIncomingRoomState,
} from './multiplayerRoom';
import {
  applyStartMemoryMatchGame,
  applySelectMemoryMatchCard,
  canSkipCurrentMemoryMatchTurn,
  applySkipMemoryMatchTurn,
} from './memoryMatchMultiplayer';
import {
  SocialRateLimiter,
  assertRoomMembershipForSocial,
  resetSocialRateLimitersForTesting,
  sendRoomReaction,
  sendRoomChatMessage,
} from './roomSocial';
import {
  validateChatMessageInput,
  validateReactionInput,
  sanitizeChatMessageText,
} from '../schemas/multiplayerSchemas';
import {
  SKIP_TURN_INACTIVITY_MS,
  CHAT_MESSAGE_MAX_LENGTH,
  type MultiplayerRoomDocument,
} from '../types/multiplayer';

const mockAddSubcollectionDocument = vi.fn().mockResolvedValue('doc-1');
const mockDeleteSubcollectionDocument = vi.fn().mockResolvedValue(undefined);
const mockSubscribeToSubcollection = vi.fn().mockReturnValue(() => {});

vi.mock('../lib/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firestore')>();
  return {
    ...actual,
    addSubcollectionDocument: (...args: unknown[]) => mockAddSubcollectionDocument(...args),
    deleteSubcollectionDocument: (...args: unknown[]) => mockDeleteSubcollectionDocument(...args),
    subscribeToSubcollection: (...args: unknown[]) => mockSubscribeToSubcollection(...args),
  };
});

const mockEnsureAnonymousSession = vi.fn().mockResolvedValue({ uid: 'p1' });
vi.mock('../lib/auth', () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
}));

vi.mock('../lib/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firebase')>();
  return {
    ...actual,
    isFirebaseConfigured: () => true,
  };
});

vi.mock('../context/AudioContext', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => children,
  useAudio: () => ({
    isMuted: false,
    toggleMute: vi.fn(),
    playFlip: vi.fn(),
    playMatch: vi.fn(),
    playMismatch: vi.fn(),
    playWin: vi.fn(),
    playDraw: vi.fn(),
    playReset: vi.fn(),
    playClick: vi.fn(),
    playMove: vi.fn(),
  }),
}));

import { RoomSocialBar } from '../components/multiplayer/RoomSocialBar';

describe('Multiplayer Stability, Skip Turn, Reactions & Room Chat', () => {
  const BASE_NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSocialRateLimitersForTesting();
    mockEnsureAnonymousSession.mockResolvedValue({ uid: 'p1' });
  });

  function createStarted3PRoom(): MultiplayerRoomDocument {
    let room = buildInitialRoomDocument({
      roomCode: 'STB123',
      gameType: 'memory-match',
      hostUid: 'p1',
      hostNickname: 'HostOne',
      memorySettings: { cardCount: 20, minPlayers: 2, maxPlayers: 4 },
      nowMs: BASE_NOW,
    });
    room = applyPlayerJoinOrReconnect({ room, uid: 'p2', nickname: 'GuestTwo', nowMs: BASE_NOW + 10 });
    room = applyPlayerJoinOrReconnect({ room, uid: 'p3', nickname: 'GuestThree', nowMs: BASE_NOW + 20 });
    return applyStartMemoryMatchGame({
      room,
      callerUid: 'p1',
      nowMs: BASE_NOW + 100,
      randomFn: () => 0.999999,
    });
  }

  it('prevents arbitrary skipping during active play, allows skipping disconnected or inactive players, and blocks duplicate skips', () => {
    const started = createStarted3PRoom();
    expect(started.currentTurnUid).toBe('p1');
    expect(started.memoryMatchState!.turnSequence).toBe(1);

    // 1. Active player cannot skip themselves
    expect(canSkipCurrentMemoryMatchTurn(started, 'p1', BASE_NOW + 60_000).eligible).toBe(false);

    // 2. Non-member cannot skip
    expect(canSkipCurrentMemoryMatchTurn(started, 'outsider', BASE_NOW + 60_000).eligible).toBe(false);

    // 3. Another member cannot skip before inactivity threshold while active player is connected
    expect(canSkipCurrentMemoryMatchTurn(started, 'p2', BASE_NOW + 5000).eligible).toBe(false);
    expect(() =>
      applySkipMemoryMatchTurn({
        room: started,
        callerUid: 'p2',
        expectedRoundNumber: 1,
        expectedTurnUid: 'p1',
        expectedTurnSequence: 1,
        nowMs: BASE_NOW + 5000,
      })
    ).toThrow(/inactive/i);

    // 4. Flip one card as p1, then wait past SKIP_TURN_INACTIVITY_MS
    const afterFirstFlip = applySelectMemoryMatchCard({
      room: started,
      callerUid: 'p1',
      cardId: 0,
      nowMs: BASE_NOW + 200,
    }).nextRoom;
    expect(afterFirstFlip.memoryMatchState!.flippedCardIds).toEqual([0]);

    const skipTime = BASE_NOW + 200 + SKIP_TURN_INACTIVITY_MS + 1000;
    expect(canSkipCurrentMemoryMatchTurn(afterFirstFlip, 'p2', skipTime)).toEqual({
      eligible: true,
      reason: 'inactive',
      remainingMs: 0,
    });

    const skipped = applySkipMemoryMatchTurn({
      room: afterFirstFlip,
      callerUid: 'p2',
      expectedRoundNumber: 1,
      expectedTurnUid: 'p1',
      expectedTurnSequence: 1,
      nowMs: skipTime,
    });

    // Flipped unmatched card turned back face down, 0 points/matches awarded, turn advanced to p2
    expect(skipped.currentTurnUid).toBe('p2');
    expect(skipped.memoryMatchState!.currentTurnUid).toBe('p2');
    expect(skipped.memoryMatchState!.flippedCardIds).toEqual([]);
    expect(skipped.memoryMatchState!.cards[0].isFlipped).toBe(false);
    expect(skipped.memoryMatchState!.matchedPairs).toBe(0);
    expect(skipped.players['p1'].score).toBe(0);
    expect(skipped.players['p2'].score).toBe(0);
    expect(skipped.memoryMatchState!.turnSequence).toBe(2);
    expect(skipped.memoryMatchState!.lastSkippedTurn?.skippedUid).toBe('p1');
    expect(skipped.memoryMatchState!.lastSkippedTurn?.skippedByUid).toBe('p2');

    // 5. Duplicate skip on the same turnSequence (1) is rejected!
    expect(() =>
      applySkipMemoryMatchTurn({
        room: skipped,
        callerUid: 'p3',
        expectedRoundNumber: 1,
        expectedTurnUid: 'p1',
        expectedTurnSequence: 1,
        nowMs: skipTime + 50,
      })
    ).toThrow(/already ended or been skipped/i);

    // 6. Disconnected active player can be skipped immediately
    const disconnectedTurnRoom: MultiplayerRoomDocument = {
      ...skipped,
      players: {
        ...skipped.players,
        p2: { ...skipped.players['p2'], connectionStatus: 'disconnected' },
      },
    };
    expect(canSkipCurrentMemoryMatchTurn(disconnectedTurnRoom, 'p3', skipTime + 100)).toEqual({
      eligible: true,
      reason: 'disconnected',
      remainingMs: 0,
    });
  });

  it('rejects regressed turnSequence snapshots in shouldAcceptIncomingRoomState', () => {
    const started = createStarted3PRoom();
    const skipped = applySkipMemoryMatchTurn({
      room: started,
      callerUid: 'p2',
      expectedRoundNumber: 1,
      expectedTurnUid: 'p1',
      expectedTurnSequence: 1,
      nowMs: BASE_NOW + SKIP_TURN_INACTIVITY_MS + 1000,
    });

    expect(shouldAcceptIncomingRoomState(skipped, started)).toBe(false);
    expect(shouldAcceptIncomingRoomState(started, skipped)).toBe(true);
  });

  it('validates reactions, enforces membership and rate limiting, and never mutates room state', async () => {
    const room = createStarted3PRoom();
    const roomSnapshotBefore = JSON.stringify(room);

    expect(validateReactionInput('🔥')).toBe('🔥');
    expect(() => validateReactionInput('💣')).toThrow(/Invalid reaction/i);

    // Non-member rejected
    expect(() => assertRoomMembershipForSocial(room, 'stranger')).toThrow(/Only members/i);

    // First reaction succeeds and writes to rooms/STB123/reactions
    const sent = await sendRoomReaction({ room, emoji: '🔥', nowMs: BASE_NOW });
    expect(sent.emoji).toBe('🔥');
    expect(sent.uid).toBe('p1');
    expect(mockAddSubcollectionDocument).toHaveBeenCalledWith(
      'rooms',
      'STB123',
      'reactions',
      expect.objectContaining({ uid: 'p1', emoji: '🔥', roomCode: 'STB123' })
    );

    // Immediate repeated reaction blocked by rate limiter
    await expect(
      sendRoomReaction({ room, emoji: '😂', nowMs: BASE_NOW + 200 })
    ).rejects.toThrow(/Wait a moment/i);

    // Room document was never mutated
    expect(JSON.stringify(room)).toBe(roomSnapshotBefore);
  });

  it('validates & sanitizes chat messages, enforces length/membership/rate limits, and renders RoomSocialBar chat drawer', async () => {
    const room = createStarted3PRoom();

    expect(sanitizeChatMessageText('  Hello\n\tWorld!  ')).toBe('Hello World!');
    expect(() => validateChatMessageInput('   ')).toThrow(/cannot be empty/i);
    expect(() => validateChatMessageInput('a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1))).toThrow(
      /cannot exceed/i
    );

    const limiter = new SocialRateLimiter(1000, 10_000, 2);
    expect(limiter.check(1000).allowed).toBe(true);
    limiter.record(1000);
    expect(limiter.check(1500).allowed).toBe(false);
    expect(limiter.check(2500).allowed).toBe(true);
    limiter.record(2500);
    expect(limiter.check(4000).allowed).toBe(false); // 2-per-10s window hit

    const msg = await sendRoomChatMessage({ room, text: 'GG everyone!', nowMs: BASE_NOW });
    expect(msg.text).toBe('GG everyone!');
    expect(mockAddSubcollectionDocument).toHaveBeenCalledWith(
      'rooms',
      'STB123',
      'messages',
      expect.objectContaining({ uid: 'p1', text: 'GG everyone!', roomCode: 'STB123' })
    );

    // Test RoomSocialBar UI interaction: open chat drawer, see empty state, type & send
    mockSubscribeToSubcollection.mockImplementation((_col, _id, sub, opts) => {
      if (sub === 'messages') {
        opts.onData([
          {
            id: 'm1',
            roomCode: 'STB123',
            uid: 'p2',
            nickname: 'GuestTwo',
            text: 'Ready to play!',
            createdAt: BASE_NOW + 50,
          },
        ]);
      } else if (sub === 'reactions') {
        opts.onData([
          {
            id: 'r1',
            roomCode: 'STB123',
            uid: 'p2',
            nickname: 'GuestTwo',
            emoji: '🎉',
            createdAt: Date.now(),
          },
        ]);
      }
      return () => {};
    });

    const { unmount } = render(
      React.createElement(RoomSocialBar, { room, uid: 'p1', isHost: true })
    );

    // Floating reaction toast appears
    expect(screen.getByTestId('room-reaction-toast-r1').textContent).toContain('🎉');
    // Unread badge shows 1 before opening chat
    expect(screen.getByTestId('room-chat-unread-badge').textContent).toBe('1');

    // Open chat panel and verify chronological message + host moderation delete button
    fireEvent.click(screen.getByTestId('room-chat-toggle'));
    expect(screen.getByTestId('room-chat-panel')).toBeTruthy();
    expect(screen.getByTestId('room-chat-message-m1').textContent).toContain('Ready to play!');
    expect(screen.getByTestId('delete-chat-message-m1')).toBeTruthy();

    // Send reaction button works
    fireEvent.click(screen.getByTestId('reaction-btn-👏'));
    unmount();
  });
});

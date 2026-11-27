// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  buildPersistentArcadeRoom,
  buildArcadeRoomInvitationUrl,
  parseArcadeRoomInvitationFromUrl,
  CreateArcadeRoomInputSchema,
  UpdateArcadeRoomSettingsSchema,
  assertRegisteredArcadeUser,
} from './arcadeRooms';
import {
  isArcadeRoomOwner,
  isArcadeRoomManager,
  isArcadeRoomMember,
} from '../types/arcadeRoom';
import { ALLOWED_REACTION_EMOJIS } from '../types/multiplayer';
import { ArcadeReactionIcon } from '../components/multiplayer/ArcadeReactionIcon';
import { RoomSocialBar } from '../components/multiplayer/RoomSocialBar';
import { CountrySelector } from '../components/auth/CountrySelector';
import { ArcadeRoomsView } from '../components/arcade/ArcadeRoomsView';
import App from '../App';
import { AudioProvider } from '../context/AudioContext';
import { buildInitialRoomDocument } from './multiplayerRoom';

vi.mock('../lib/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firebase')>();
  return {
    ...actual,
    isFirebaseConfigured: vi.fn(() => false),
  };
});

vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>();
  return {
    ...actual,
    getCurrentUser: vi.fn(() => null),
  };
});

import { getCurrentUser } from '../lib/auth';

describe('Persistent Arcade Rooms, Board-Anchored Pixel Reactions, Country UI & Footer', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getCurrentUser).mockReturnValue(null);
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('builds a valid Level-1 persistent arcade room separate from Level-2 game sessions', () => {
    const { room, ownerMember } = buildPersistentArcadeRoom({
      id: 'arc_friday_1',
      inviteCode: 'frdy99',
      name: 'Friday Night Arcade',
      ownerUid: 'uid-owner',
      ownerUsername: 'NdalaHost',
      availableGames: ['memory-match', 'tic-tac-toe', 'snake'],
      visibility: 'invite-only',
      defaultMemoryCardCount: 40,
      countryCode: 'ZM',
    });

    expect(room.id).toBe('arc_friday_1');
    expect(room.inviteCode).toBe('FRDY99');
    expect(room.ownerUid).toBe('uid-owner');
    expect(room.memberUids).toEqual(['uid-owner']);
    expect(room.activeSessionId).toBeNull();
    expect(room.activeSessionRoomCode).toBeNull();
    expect(room.defaultMemoryCardCount).toBe(40);
    expect(ownerMember.role).toBe('owner');
    expect(ownerMember.countryCode).toBe('ZM');

    expect(isArcadeRoomOwner(room, 'uid-owner')).toBe(true);
    expect(isArcadeRoomOwner(room, 'uid-guest')).toBe(false);
    expect(isArcadeRoomManager(room, 'uid-owner')).toBe(true);
    expect(isArcadeRoomMember(room, 'uid-owner')).toBe(true);
  });

  it('validates persistent arcade room inputs and rejects invalid names or odd card counts', () => {
    expect(
      CreateArcadeRoomInputSchema.safeParse({
        name: 'AB',
        availableGames: ['memory-match'],
      }).success
    ).toBe(false);

    expect(
      CreateArcadeRoomInputSchema.safeParse({
        name: 'Friday Night Arcade',
        availableGames: [],
      }).success
    ).toBe(false);

    expect(
      UpdateArcadeRoomSettingsSchema.safeParse({
        defaultMemoryCardCount: 25,
      }).success
    ).toBe(false);

    expect(
      UpdateArcadeRoomSettingsSchema.safeParse({
        name: 'Saturday Retro Club',
        defaultMemoryCardCount: 60,
        visibility: 'private',
      }).success
    ).toBe(true);
  });

  it('strictly blocks anonymous or signed-out users from owning persistent arcade rooms', () => {
    vi.mocked(getCurrentUser).mockReturnValue(null);
    expect(() => assertRegisteredArcadeUser()).toThrow(/registered/i);

    vi.mocked(getCurrentUser).mockReturnValue({
      uid: 'anon-123',
      isAnonymous: true,
    } as never);
    expect(() => assertRegisteredArcadeUser()).toThrow(/registered/i);

    vi.mocked(getCurrentUser).mockReturnValue({
      uid: 'reg-456',
      isAnonymous: false,
    } as never);
    expect(assertRegisteredArcadeUser()).toEqual({ uid: 'reg-456', isAnonymous: false });
  });

  it('generates and parses persistent arcade room invitation URLs', () => {
    const url = buildArcadeRoomInvitationUrl('frdy99');
    expect(url).toContain('?arcade=FRDY99');
    window.history.replaceState({}, '', '/?arcade=FRDY99');
    expect(parseArcadeRoomInvitationFromUrl()).toBe('FRDY99');
  });

  it('renders custom pixel-art SVG illustrations for all 9 reactions including Angry and compact chat toggle', () => {
    const room = buildInitialRoomDocument({
      roomCode: 'REACT9',
      gameType: 'memory-match',
      hostUid: 'host-1',
      hostNickname: 'HostPlayer',
    });

    const { container } = render(
      <AudioProvider>
        <RoomSocialBar room={room} uid="host-1" isHost={true} anchorMode="board" />
      </AudioProvider>
    );

    expect(screen.getByTestId('board-reaction-toolbar')).toBeTruthy();
    // All 9 reaction buttons render custom SVG pixel art (not raw emoji characters)
    for (const emoji of ALLOWED_REACTION_EMOJIS) {
      const btn = screen.getByTestId(`reaction-btn-${emoji}`);
      expect(btn.querySelector('svg')).toBeTruthy();
    }
    expect(screen.getByTestId('reaction-btn-😡')).toBeTruthy();

    // Compact chat opens and closes cleanly
    expect(screen.queryByTestId('room-chat-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('room-chat-toggle'));
    expect(screen.getByTestId('room-chat-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('room-chat-close'));
    expect(screen.queryByTestId('room-chat-panel')).toBeNull();

    // Standalone ArcadeReactionIcon renders unique SVG shapes
    const { container: iconContainer } = render(<ArcadeReactionIcon emoji="😡" />);
    expect(iconContainer.querySelectorAll('rect').length).toBeGreaterThan(8);
    expect(container).toBeTruthy();
  });

  it('supports keyboard navigation and search in the custom CountrySelector', () => {
    const onChange = vi.fn();
    render(<CountrySelector value="" onChange={onChange} />);

    const trigger = screen.getByTestId('country-selector-trigger');
    fireEvent.click(trigger);

    const search = screen.getByTestId('country-search-input');
    fireEvent.change(search, { target: { value: 'Zambia' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('ZM');
  });

  it('shows guest notice and temporary room options to anonymous users in ArcadeRoomsView', () => {
    const onOpenAuth = vi.fn();
    const onPlayTemp = vi.fn();
    render(
      <AudioProvider>
        <ArcadeRoomsView
          onBackToHome={() => {}}
          onOpenAuth={onOpenAuth}
          onPlayTemporaryGame={onPlayTemp}
          onLaunchGameSession={() => {}}
        />
      </AudioProvider>
    );

    expect(screen.getByTestId('arcade-guest-notice')).toBeTruthy();
    expect(screen.queryByTestId('arcade-open-create-btn')).toBeNull();
    fireEvent.click(screen.getByTestId('arcade-guest-signin-btn'));
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
  });

  it('displays the footer ONLY on the homepage and removes it on game and arcade room views', async () => {
    render(<App />);
    // Homepage shows footer
    expect(document.querySelector('footer')).toBeTruthy();

    // Navigate to Arcade Rooms via mobile hamburger menu -> footer is removed (lazy-loaded view)
    fireEvent.click(screen.getByTestId('navbar-hamburger-btn'));
    fireEvent.click(screen.getByTestId('mobile-menu-arcade-rooms-btn'));
    expect(await screen.findByTestId('arcade-rooms-directory')).toBeTruthy();
    expect(document.querySelector('footer')).toBeNull();
  });
});

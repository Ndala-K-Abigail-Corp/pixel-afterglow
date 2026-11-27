// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ALL_COUNTRIES,
  countryCodeToFlag,
  getCountryByCode,
  isValidCountryCode,
  searchCountries,
} from '../data/countries';
import {
  ALLOWED_REACTION_EMOJIS,
  ARCADE_REACTION_CATALOG,
  GAME_PLAYER_LIMITS,
} from '../types/multiplayer';
import {
  saveActiveRoomSession,
  loadActiveRoomSession,
  clearActiveRoomSession,
  detectActiveRoomSessionGameType,
  buildInitialRoomDocument,
  applyPlayerJoinOrReconnect,
} from './multiplayerRoom';
import { applyStartMemoryMatchGame } from './memoryMatchMultiplayer';
import { applyStartTicTacToeGame } from './ticTacToeMultiplayer';
import { mapAuthErrorToMessage } from '../lib/auth';
import {
  validateUsername,
  validateCountrySelection,
  createUserProfileAtomic,
  updateUserProfileAtomic,
  ProfileValidationError,
} from './userProfile';
import { CountrySelector } from '../components/auth/CountrySelector';

// In-memory mock Firestore store for atomic profile & username uniqueness transactions
const mockStore = new Map<string, Record<string, unknown>>();

vi.mock('../lib/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firestore')>();
  return {
    ...actual,
    getDocRef: (col: string, id: string) => ({ path: `${col}/${id}` }),
    fetchDocument: async (col: string, id: string) => mockStore.get(`${col}/${id}`) ?? null,
    runFirestoreTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const val = mockStore.get(ref.path);
          return {
            exists: () => val !== undefined,
            data: () => val,
          };
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          mockStore.set(ref.path, { ...data });
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          const existing = mockStore.get(ref.path) ?? {};
          mockStore.set(ref.path, { ...existing, ...data });
        },
        delete: (ref: { path: string }) => {
          mockStore.delete(ref.path);
        },
      };
      return fn(tx);
    },
  };
});

describe('Part 1 & 2 – Reactions (9), Refresh Reconnection, Countries, Auth & Profiles', () => {
  beforeEach(() => {
    mockStore.clear();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('includes all 9 Pixel Afterglow reactions including Angry (😡) and enforces game player limits', () => {
    expect(ALLOWED_REACTION_EMOJIS).toHaveLength(9);
    expect(ALLOWED_REACTION_EMOJIS).toContain('😡');
    expect(ARCADE_REACTION_CATALOG).toHaveLength(9);
    expect(ARCADE_REACTION_CATALOG.find((r) => r.emoji === '😡')?.label).toBe('Angry');

    expect(GAME_PLAYER_LIMITS['memory-match']).toEqual({ minPlayers: 2, maxPlayers: 8 });
    expect(GAME_PLAYER_LIMITS['tic-tac-toe']).toEqual({ minPlayers: 2, maxPlayers: 2 });
  });

  it('persists active room sessions across browser refresh for Memory Match and Tic-Tac-Toe without duplicating players or resetting boards', () => {
    // 1. Memory Match session restoration (survives sessionStorage clear via localStorage fallback)
    saveActiveRoomSession('memory-match', 'MEM999');
    expect(loadActiveRoomSession('memory-match')).toBe('MEM999');
    expect(detectActiveRoomSessionGameType()).toBe('memory-match');

    window.sessionStorage.clear();
    expect(loadActiveRoomSession('memory-match')).toBe('MEM999');
    expect(detectActiveRoomSessionGameType()).toBe('memory-match');

    clearActiveRoomSession('memory-match');
    expect(loadActiveRoomSession('memory-match')).toBeNull();

    // 2. Tic-Tac-Toe session restoration
    saveActiveRoomSession('tic-tac-toe', 'TTT777');
    expect(detectActiveRoomSessionGameType()).toBe('tic-tac-toe');
    clearActiveRoomSession('tic-tac-toe');

    // 3. Reconnecting an existing player in an active Memory Match preserves board, scores, turn & membership
    const now = 1_700_000_000_000;
    let mmRoom = buildInitialRoomDocument({
      roomCode: 'REC123',
      gameType: 'memory-match',
      hostUid: 'u1',
      hostNickname: 'HostAce',
      nowMs: now,
    });
    mmRoom = applyPlayerJoinOrReconnect({ room: mmRoom, uid: 'u2', nickname: 'GuestTwo', nowMs: now + 10 });
    mmRoom = applyStartMemoryMatchGame({ room: mmRoom, callerUid: 'u1', nowMs: now + 20, randomFn: () => 0.5 });
    mmRoom.players['u2'].score = 3;
    mmRoom.players['u2'].connectionStatus = 'disconnected';

    const reconnectedMM = applyPlayerJoinOrReconnect({
      room: mmRoom,
      uid: 'u2',
      nickname: 'GuestTwo',
      nowMs: now + 5000,
    });
    expect(reconnectedMM.playerOrder).toEqual(['u1', 'u2']);
    expect(reconnectedMM.players['u2'].score).toBe(3);
    expect(reconnectedMM.players['u2'].connectionStatus).toBe('connected');
    expect(reconnectedMM.currentTurnUid).toBe('u1');
    expect(reconnectedMM.memoryMatchState!.cards).toEqual(mmRoom.memoryMatchState!.cards);

    // 4. Reconnecting an existing player in an active Tic-Tac-Toe match preserves board & turn
    let tttRoom = buildInitialRoomDocument({
      roomCode: 'TTT123',
      gameType: 'tic-tac-toe',
      hostUid: 'u1',
      hostNickname: 'HostAce',
      nowMs: now,
    });
    tttRoom = applyPlayerJoinOrReconnect({ room: tttRoom, uid: 'u2', nickname: 'GuestTwo', nowMs: now + 10 });
    tttRoom = applyStartTicTacToeGame({ room: tttRoom, callerUid: 'u1', nowMs: now + 20 });
    const reconnectedTTT = applyPlayerJoinOrReconnect({
      room: tttRoom,
      uid: 'u2',
      nowMs: now + 3000,
    });
    expect(reconnectedTTT.playerOrder).toEqual(['u1', 'u2']);
    expect(reconnectedTTT.ticTacToeState).toEqual(tttRoom.ticTacToeState);
  });

  it('supports searchable ISO 3166-1 alpha-2 country selection with flags (e.g. Zambia = ZM)', () => {
    expect(ALL_COUNTRIES.length).toBeGreaterThanOrEqual(240);
    expect(isValidCountryCode('ZM')).toBe(true);
    expect(isValidCountryCode('XX')).toBe(false);
    expect(countryCodeToFlag('ZM')).toBe('🇿🇲');

    const zambia = getCountryByCode('zm');
    expect(zambia?.code).toBe('ZM');
    expect(zambia?.name).toBe('Zambia');
    expect(zambia?.flag).toBe('🇿🇲');

    const matches = searchCountries('zambia');
    expect(matches.some((c) => c.code === 'ZM')).toBe(true);

    // UI test for CountrySelector
    const onChange = vi.fn();
    const { unmount } = render(React.createElement(CountrySelector, { value: '', onChange }));
    fireEvent.click(screen.getByTestId('country-selector-trigger'));
    fireEvent.change(screen.getByTestId('country-search-input'), { target: { value: 'Zambia' } });
    fireEvent.click(screen.getByTestId('country-option-ZM'));
    expect(onChange).toHaveBeenCalledWith('ZM');
    unmount();
  });

  it('validates usernames & countries, enforces atomic username uniqueness, and preserves protected profile fields on update', async () => {
    expect(validateUsername('Pixel_Ace-1')).toEqual({
      username: 'Pixel_Ace-1',
      usernameLower: 'pixel_ace-1',
    });
    expect(() => validateUsername('ab')).toThrow(ProfileValidationError);
    expect(() => validateUsername('bad name!')).toThrow(ProfileValidationError);
    expect(validateCountrySelection('zm')).toEqual({ countryCode: 'ZM', countryName: 'Zambia' });
    expect(() => validateCountrySelection('ZZ')).toThrow(ProfileValidationError);

    // User 1 creates profile and reserves "neonhero"
    const p1 = await createUserProfileAtomic({
      uid: 'uid-1',
      username: 'NeonHero',
      email: 'hero@pixel.gg',
      emailVerified: true,
      countryCode: 'ZM',
      avatarId: 'crown',
      authProvider: 'google',
      nowMs: 1000,
    });
    expect(p1.username).toBe('NeonHero');
    expect(p1.countryCode).toBe('ZM');
    expect(p1.countryName).toBe('Zambia');
    expect(p1.stats.gamesPlayed).toBe(0);

    // User 2 cannot claim "neonhero" (case-insensitive duplicate rejection)
    await expect(
      createUserProfileAtomic({
        uid: 'uid-2',
        username: 'neonhero',
        email: 'other@pixel.gg',
        emailVerified: false,
        countryCode: 'ZA',
        avatarId: 'ghost',
        authProvider: 'password',
        nowMs: 2000,
      })
    ).rejects.toThrow(/already taken/i);

    // User 1 updates username & country; old reservation is released and protected createdAt/uid remain unchanged
    const updatedP1 = await updateUserProfileAtomic({
      uid: 'uid-1',
      username: 'RetroLegend',
      countryCode: 'ZA',
      avatarId: 'dragon',
      nowMs: 3000,
    });
    expect(updatedP1.uid).toBe('uid-1');
    expect(updatedP1.createdAt).toBe(1000);
    expect(updatedP1.updatedAt).toBe(3000);
    expect(updatedP1.username).toBe('RetroLegend');
    expect(updatedP1.countryCode).toBe('ZA');

    // Now User 2 CAN claim "NeonHero" since User 1 released it
    const p2 = await createUserProfileAtomic({
      uid: 'uid-2',
      username: 'NeonHero',
      email: 'other@pixel.gg',
      emailVerified: false,
      countryCode: 'ZM',
      avatarId: 'star',
      authProvider: 'password',
      nowMs: 4000,
    });
    expect(p2.uid).toBe('uid-2');
    expect(p2.username).toBe('NeonHero');
  });

  it('maps Firebase Auth error codes to friendly user-facing messages', () => {
    expect(mapAuthErrorToMessage({ code: 'auth/invalid-credential' })).toContain(
      'Incorrect email or password'
    );
    expect(mapAuthErrorToMessage({ code: 'auth/email-already-in-use' })).toContain(
      'already exists'
    );
    expect(mapAuthErrorToMessage({ code: 'auth/weak-password' })).toContain('at least 8');
    expect(mapAuthErrorToMessage({ code: 'auth/popup-blocked' })).toContain('popup was blocked');
  });
});

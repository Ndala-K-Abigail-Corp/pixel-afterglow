/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MultiplayerGameType } from './multiplayer';

export type ArcadeGameId = 'memory-match' | 'tic-tac-toe' | 'snake';

export type ArcadeRoomVisibility = 'invite-only' | 'private';

export type ArcadeRoomStatus = 'active' | 'archived';

export type ArcadeMemberRole = 'owner' | 'manager' | 'member';

export type ArcadeSessionStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

export interface ArcadeGameCatalogEntry {
  id: ArcadeGameId;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  playable: boolean;
  accentHex: string;
}

export const ARCADE_GAME_CATALOG: readonly ArcadeGameCatalogEntry[] = [
  {
    id: 'memory-match',
    title: 'Memory Match',
    description: 'Real-time 2–8 player card matching with custom 10–100 card boards.',
    minPlayers: 2,
    maxPlayers: 8,
    playable: true,
    accentHex: '#56E0CB',
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    description: 'Classic head-to-head 2-player neon duel with rematch rounds.',
    minPlayers: 2,
    maxPlayers: 2,
    playable: true,
    accentHex: '#FF776E',
  },
  {
    id: 'snake',
    title: 'Snake',
    description: 'Multiplayer neon arena Snake (coming soon).',
    minPlayers: 2,
    maxPlayers: 4,
    playable: false,
    accentHex: '#FFC66D',
  },
] as const;

export const PLAYABLE_ARCADE_GAMES: readonly MultiplayerGameType[] = [
  'memory-match',
  'tic-tac-toe',
] as const;

/**
 * Level 1: Persistent user-owned Arcade Room document (`arcadeRooms/{arcadeRoomId}`).
 * Exists permanently across sign-outs, browser restarts, and multiple game sessions.
 */
export interface PersistentArcadeRoom {
  id: string;
  inviteCode: string;
  name: string;
  ownerUid: string;
  ownerUsername: string;
  availableGames: ArcadeGameId[];
  visibility: ArcadeRoomVisibility;
  status: ArcadeRoomStatus;
  memberUids: string[];
  managerUids: string[];
  defaultMemoryCardCount: number;
  activeSessionId: string | null;
  activeSessionRoomCode: string | null;
  activeSessionGameType: MultiplayerGameType | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Subcollection document (`arcadeRooms/{arcadeRoomId}/members/{uid}`).
 */
export interface ArcadeRoomMember {
  uid: string;
  username: string;
  role: ArcadeMemberRole;
  countryCode?: string;
  avatarId?: string;
  joinedAt: number;
  lastVisitedAt: number;
}

/**
 * Level 2: Individual Game Session document (`arcadeRooms/{arcadeRoomId}/sessions/{sessionId}`).
 * Links cleanly to an isolated `rooms/{roomCode}` match document so game state never leaks
 * between sessions while preserving the parent persistent arcade room.
 */
export interface ArcadeGameSession {
  sessionId: string;
  arcadeRoomId: string;
  roomCode: string;
  gameType: MultiplayerGameType;
  status: ArcadeSessionStatus;
  createdByUid: string;
  createdByUsername: string;
  cardCount?: number;
  playerUids: string[];
  winnerUids?: string[];
  createdAt: number;
  completedAt?: number | null;
}

export function isArcadeRoomOwner(room: PersistentArcadeRoom, uid: string | null): boolean {
  return Boolean(uid && room.ownerUid === uid);
}

export function isArcadeRoomManager(room: PersistentArcadeRoom, uid: string | null): boolean {
  return Boolean(uid && (room.ownerUid === uid || room.managerUids.includes(uid)));
}

export function isArcadeRoomMember(room: PersistentArcadeRoom, uid: string | null): boolean {
  return Boolean(uid && room.memberUids.includes(uid));
}

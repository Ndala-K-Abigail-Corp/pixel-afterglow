/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const PROFILE_AVATARS = [
  { id: 'star', label: 'Star Coin', color: '#FFC66D' },
  { id: 'crown', label: 'Arcade Crown', color: '#FFD54F' },
  { id: 'ghost', label: 'Pixel Ghost', color: '#FF8A80' },
  { id: 'rocket', label: 'Retro Rocket', color: '#FF7043' },
  { id: 'cat', label: 'Lucky Cat', color: '#FFAB91' },
  { id: 'robot', label: 'Cyber Robot', color: '#B0C4DE' },
  { id: 'gem', label: 'Power Gem', color: '#56E0CB' },
  { id: 'dragon', label: 'Fire Dragon', color: '#FF6E40' },
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATARS)[number]['id'];

export const PROFILE_AVATAR_IDS: ReadonlyArray<ProfileAvatarId> = PROFILE_AVATARS.map((a) => a.id);

export type ProfileAuthProvider = 'google' | 'password' | 'anonymous';
export type AccountStatus = 'active' | 'suspended';

/**
 * Future-ready persistent gaming records structure (kept server-protected from arbitrary client edits).
 */
export interface GameRecordStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  highestScore: number;
  bestTimeSeconds: number | null;
}

export interface PlayerRecordSummary {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gameRecords: Partial<Record<'memory-match' | 'tic-tac-toe', GameRecordStats>>;
}

export const EMPTY_PLAYER_RECORD_SUMMARY: PlayerRecordSummary = {
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  gameRecords: {},
};

/**
 * Persistent user profile stored in Firestore at `users/{uid}`.
 */
export interface UserProfile {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  countryCode: string; // ISO 3166-1 alpha-2 (e.g. "ZM")
  countryName: string; // e.g. "Zambia"
  avatarId: ProfileAvatarId;
  authProvider: ProfileAuthProvider;
  accountStatus: AccountStatus;
  createdAt: number;
  updatedAt: number;
  stats: PlayerRecordSummary;
}

/**
 * Atomic username reservation document stored in Firestore at `usernames/{usernameLower}`.
 */
export interface UsernameReservation {
  uid: string;
  username: string;
  createdAt: number;
}

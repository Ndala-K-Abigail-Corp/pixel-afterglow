/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  UserProfile,
  UsernameReservation,
  ProfileAvatarId,
  ProfileAuthProvider,
  PROFILE_AVATAR_IDS,
  EMPTY_PLAYER_RECORD_SUMMARY,
} from '../types/profile';
import {
  isValidCountryCode,
  getCountryByCode,
} from '../data/countries';
import {
  fetchDocument,
  getDocRef,
  runFirestoreTransaction,
} from '../lib/firestore';
import { savePreferredNickname } from './multiplayerRoom';

export const USERS_COLLECTION = 'users';
export const USERNAMES_COLLECTION = 'usernames';

export class ProfileValidationError extends Error {
  public readonly code:
    | 'INVALID_USERNAME'
    | 'USERNAME_TAKEN'
    | 'INVALID_COUNTRY'
    | 'INVALID_AVATAR'
    | 'UNAUTHORIZED'
    | 'PROFILE_NOT_FOUND';

  constructor(code: ProfileValidationError['code'], message: string) {
    super(message);
    this.name = 'ProfileValidationError';
    this.code = code;
  }
}

export function normalizeUsernameKey(username: string): string {
  return username.trim().toLowerCase();
}

export const UsernameSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length >= 3 && v.length <= 20, {
    message: 'Username must be between 3 and 20 characters.',
  })
  .refine((v) => /^[A-Za-z0-9_-]+$/.test(v), {
    message: 'Username can only contain letters, numbers, underscores, and hyphens.',
  });

export const CountryCodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => isValidCountryCode(v), {
    message: 'Please select a valid country.',
  });

export const AvatarIdSchema = z.enum(PROFILE_AVATAR_IDS as [ProfileAvatarId, ...ProfileAvatarId[]]);

export const EmailSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: 'Please enter a valid email address.',
  });

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.');

export function validateUsername(raw: string): { username: string; usernameLower: string } {
  const parsed = UsernameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProfileValidationError(
      'INVALID_USERNAME',
      parsed.error.issues[0]?.message ?? 'Invalid username.'
    );
  }
  return {
    username: parsed.data,
    usernameLower: normalizeUsernameKey(parsed.data),
  };
}

export function validateCountrySelection(rawCode: string): {
  countryCode: string;
  countryName: string;
} {
  const parsed = CountryCodeSchema.safeParse(rawCode);
  if (!parsed.success) {
    throw new ProfileValidationError(
      'INVALID_COUNTRY',
      parsed.error.issues[0]?.message ?? 'Please select a valid country.'
    );
  }
  const country = getCountryByCode(parsed.data);
  if (!country) {
    throw new ProfileValidationError('INVALID_COUNTRY', 'Please select a valid country.');
  }
  return {
    countryCode: country.code,
    countryName: country.name,
  };
}

/**
 * Fetches a user's persistent profile from `users/{uid}`.
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  return fetchDocument<UserProfile>(USERS_COLLECTION, uid);
}

/**
 * Checks whether a username is currently available (or already owned by `currentUid`).
 */
export async function isUsernameAvailable(
  rawUsername: string,
  currentUid?: string
): Promise<boolean> {
  const { usernameLower } = validateUsername(rawUsername);
  const existing = await fetchDocument<UsernameReservation>(USERNAMES_COLLECTION, usernameLower);
  if (!existing) return true;
  return Boolean(currentUid && existing.uid === currentUid);
}

/**
 * Creates or completes a persistent player profile in Firestore using an atomic transaction
 * that reserves `usernames/{usernameLower}` and writes `users/{uid}` together.
 * Guarantees duplicate usernames are impossible even under concurrent sign-ups.
 */
export async function createUserProfileAtomic(params: {
  uid: string;
  username: string;
  displayName?: string;
  email: string | null;
  emailVerified: boolean;
  countryCode: string;
  avatarId?: ProfileAvatarId;
  authProvider: ProfileAuthProvider;
  nowMs?: number;
}): Promise<UserProfile> {
  const { username, usernameLower } = validateUsername(params.username);
  const { countryCode, countryName } = validateCountrySelection(params.countryCode);
  const avatarParsed = AvatarIdSchema.safeParse(params.avatarId ?? 'star');
  if (!avatarParsed.success) {
    throw new ProfileValidationError('INVALID_AVATAR', 'Please select a valid arcade avatar.');
  }

  const nowMs = params.nowMs ?? Date.now();
  const userRef = getDocRef<UserProfile>(USERS_COLLECTION, params.uid);
  const usernameRef = getDocRef<UsernameReservation>(USERNAMES_COLLECTION, usernameLower);

  const profile = await runFirestoreTransaction(async (transaction) => {
    const [existingUserSnap, existingUsernameSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(usernameRef),
    ]);

    if (existingUsernameSnap.exists()) {
      const holder = existingUsernameSnap.data();
      if (holder.uid !== params.uid) {
        throw new ProfileValidationError(
          'USERNAME_TAKEN',
          `Username "${username}" is already taken. Please choose another.`
        );
      }
    }

    const existingProfile = existingUserSnap.exists() ? existingUserSnap.data() : null;
    const nextProfile: UserProfile = {
      uid: params.uid,
      username,
      usernameLower,
      displayName: (params.displayName?.trim() || username).slice(0, 32),
      email: params.email,
      emailVerified: params.emailVerified,
      countryCode,
      countryName,
      avatarId: avatarParsed.data,
      authProvider: params.authProvider,
      accountStatus: 'active',
      createdAt: existingProfile?.createdAt ?? nowMs,
      updatedAt: nowMs,
      stats: existingProfile?.stats ?? { ...EMPTY_PLAYER_RECORD_SUMMARY },
    };

    // If user previously had a different username, release old reservation
    if (existingProfile && existingProfile.usernameLower !== usernameLower) {
      const oldUsernameRef = getDocRef<UsernameReservation>(
        USERNAMES_COLLECTION,
        existingProfile.usernameLower
      );
      transaction.delete(oldUsernameRef);
    }

    transaction.set(usernameRef, {
      uid: params.uid,
      username,
      createdAt: nowMs,
    });
    transaction.set(userRef, nextProfile);

    return nextProfile;
  });

  savePreferredNickname(profile.username);
  return profile;
}

/**
 * Updates editable profile fields (username, displayName, country, avatar) atomically.
 * Never modifies protected fields (`uid`, `createdAt`, `accountStatus`, `stats`).
 */
export async function updateUserProfileAtomic(params: {
  uid: string;
  username: string;
  displayName?: string;
  countryCode: string;
  avatarId: ProfileAvatarId;
  nowMs?: number;
}): Promise<UserProfile> {
  const { username, usernameLower } = validateUsername(params.username);
  const { countryCode, countryName } = validateCountrySelection(params.countryCode);
  const avatarParsed = AvatarIdSchema.safeParse(params.avatarId);
  if (!avatarParsed.success) {
    throw new ProfileValidationError('INVALID_AVATAR', 'Please select a valid arcade avatar.');
  }

  const nowMs = params.nowMs ?? Date.now();
  const userRef = getDocRef<UserProfile>(USERS_COLLECTION, params.uid);
  const newUsernameRef = getDocRef<UsernameReservation>(USERNAMES_COLLECTION, usernameLower);

  const updated = await runFirestoreTransaction(async (transaction) => {
    const [userSnap, usernameSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(newUsernameRef),
    ]);

    if (!userSnap.exists()) {
      throw new ProfileValidationError('PROFILE_NOT_FOUND', 'Profile not found. Please complete setup first.');
    }

    const currentProfile = userSnap.data();

    if (usernameSnap.exists()) {
      const holder = usernameSnap.data();
      if (holder.uid !== params.uid) {
        throw new ProfileValidationError(
          'USERNAME_TAKEN',
          `Username "${username}" is already taken. Please choose another.`
        );
      }
    }

    if (currentProfile.usernameLower !== usernameLower) {
      const oldUsernameRef = getDocRef<UsernameReservation>(
        USERNAMES_COLLECTION,
        currentProfile.usernameLower
      );
      transaction.delete(oldUsernameRef);
      transaction.set(newUsernameRef, {
        uid: params.uid,
        username,
        createdAt: nowMs,
      });
    }

    const nextProfile: UserProfile = {
      ...currentProfile,
      uid: currentProfile.uid,
      createdAt: currentProfile.createdAt,
      accountStatus: currentProfile.accountStatus,
      stats: currentProfile.stats,
      username,
      usernameLower,
      displayName: (params.displayName?.trim() || username).slice(0, 32),
      countryCode,
      countryName,
      avatarId: avatarParsed.data,
      updatedAt: nowMs,
    };

    if (typeof transaction.update === 'function') {
      transaction.update(userRef, {
        username: nextProfile.username,
        usernameLower: nextProfile.usernameLower,
        displayName: nextProfile.displayName,
        countryCode: nextProfile.countryCode,
        countryName: nextProfile.countryName,
        avatarId: nextProfile.avatarId,
        updatedAt: nextProfile.updatedAt,
      });
    } else {
      transaction.set(userRef, nextProfile);
    }

    return nextProfile;
  });

  savePreferredNickname(updated.username);
  return updated;
}

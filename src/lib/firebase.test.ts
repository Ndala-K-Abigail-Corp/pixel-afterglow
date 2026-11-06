/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FirebaseEnvConfig } from './firebase';

const mockApp = { name: '[DEFAULT]' };
const mockAuthInstance = { currentUser: null as { uid: string; isAnonymous: boolean } | null };
const mockDbInstance = { type: 'firestore' };

const mockInitializeApp = vi.fn((..._args: unknown[]) => {
  void _args;
  return mockApp;
});
const mockGetApps = vi.fn(() => [] as unknown[]);
const mockGetApp = vi.fn(() => mockApp);
const mockGetAuth = vi.fn((..._args: unknown[]) => {
  void _args;
  return mockAuthInstance;
});
const mockGetFirestore = vi.fn((..._args: unknown[]) => {
  void _args;
  return mockDbInstance;
});
const mockSignInAnonymously = vi.fn((..._args: unknown[]) => {
  void _args;
  return Promise.resolve({ user: null });
});
const mockOnAuthStateChanged = vi.fn((..._args: unknown[]) => {
  void _args;
  return () => {};
});
const mockCollection = vi.fn((..._args: unknown[]) => {
  void _args;
  return {};
});
const mockDoc = vi.fn((..._args: unknown[]) => {
  void _args;
  return {};
});
const mockGetDoc = vi.fn((..._args: unknown[]) => {
  void _args;
  return Promise.resolve({});
});
const mockSetDoc = vi.fn((..._args: unknown[]) => {
  void _args;
  return Promise.resolve();
});
const mockUpdateDoc = vi.fn((..._args: unknown[]) => {
  void _args;
  return Promise.resolve();
});
const mockDeleteDoc = vi.fn((..._args: unknown[]) => {
  void _args;
  return Promise.resolve();
});
const mockOnSnapshot = vi.fn((..._args: unknown[]) => {
  void _args;
  return () => {};
});
const mockRunTransaction = vi.fn((..._args: unknown[]): Promise<unknown> => {
  void _args;
  return Promise.resolve();
});
const mockServerTimestamp = vi.fn(() => ({ _methodName: 'serverTimestamp' }));

vi.mock('firebase/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
  getApp: () => mockGetApp(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: (...args: unknown[]) => mockGetFirestore(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

import {
  getMissingFirebaseEnvVars,
  isFirebaseConfigured,
  buildFirebaseOptions,
  FirebaseConfigurationError,
  getFirebaseApp,
  resetFirebaseSingletonsForTesting,
  formatFirebaseError,
} from './firebase';
import { ensureAnonymousSession } from './auth';
import { subscribeToDocument, fetchDocument, runFirestoreTransaction } from './firestore';
import {
  isValidRoomStateTransition,
  computeRoomExpiresAt,
  isRoomExpired,
  MEMORY_MULTIPLAYER_CONFIGS,
  ROOM_EXPIRY_POLICIES_MS,
} from '../types/multiplayer';

const VALID_ENV: FirebaseEnvConfig = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test-project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
};

describe('Firebase configuration helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirebaseSingletonsForTesting();
    mockAuthInstance.currentUser = null;
    mockGetApps.mockReturnValue([]);
  });

  it('identifies missing environment variables when empty', () => {
    const missing = getMissingFirebaseEnvVars({});
    expect(missing).toHaveLength(6);
    expect(isFirebaseConfigured({})).toBe(false);
  });

  it('detects complete Firebase environment configuration and builds options', () => {
    expect(getMissingFirebaseEnvVars(VALID_ENV)).toEqual([]);
    expect(isFirebaseConfigured(VALID_ENV)).toBe(true);

    const options = buildFirebaseOptions(VALID_ENV);
    expect(options).toEqual({
      apiKey: 'test-api-key',
      authDomain: 'test-project.firebaseapp.com',
      projectId: 'test-project',
      storageBucket: 'test-project.appspot.com',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abcdef',
    });
  });

  it('reuses an existing Firebase app instance when already initialized', () => {
    mockGetApps.mockReturnValue([mockApp]);
    const app = getFirebaseApp();
    expect(app).toBe(mockApp);
    expect(mockGetApp).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('throws FirebaseConfigurationError when initializing without env vars and no existing app', () => {
    mockGetApps.mockReturnValue([]);
    expect(() => getFirebaseApp({})).toThrow(FirebaseConfigurationError);
  });
});

describe('Phase 1 shared multiplayer room data structures & policies', () => {
  it('enforces valid room state transitions and rejects illegal transitions', () => {
    expect(isValidRoomStateTransition('waiting', 'in_progress')).toBe(true);
    expect(isValidRoomStateTransition('waiting', 'closed')).toBe(true);
    expect(isValidRoomStateTransition('in_progress', 'completed')).toBe(true);
    expect(isValidRoomStateTransition('completed', 'in_progress')).toBe(true); // rematch
    expect(isValidRoomStateTransition('waiting', 'completed')).toBe(false);
    expect(isValidRoomStateTransition('closed', 'in_progress')).toBe(false);
    expect(isValidRoomStateTransition('expired', 'waiting')).toBe(false);
  });

  it('computes expiry timestamps according to room status policies', () => {
    const now = 1_700_000_000_000;
    expect(computeRoomExpiresAt('waiting', now)).toBe(
      now + ROOM_EXPIRY_POLICIES_MS.WAITING_INACTIVITY_MS
    );
    expect(computeRoomExpiresAt('in_progress', now)).toBe(
      now + ROOM_EXPIRY_POLICIES_MS.INTERRUPTED_INACTIVITY_MS
    );
    expect(computeRoomExpiresAt('completed', now)).toBe(
      now + ROOM_EXPIRY_POLICIES_MS.COMPLETED_RETENTION_MS
    );
    expect(computeRoomExpiresAt('closed', now)).toBe(now);
  });

  it('evaluates application-level room expiry accurately', () => {
    const now = 1_700_000_000_000;
    const activePlayer = {
      uid: 'u1',
      nickname: 'Player1',
      isHost: true,
      joinedAt: now,
      lastSeenAt: now,
      connectionStatus: 'connected' as const,
      score: 0,
      rematchAccepted: false,
    };

    expect(
      isRoomExpired(
        { status: 'waiting', expiresAt: now + 60_000, players: { u1: activePlayer } },
        now
      )
    ).toBe(false);

    expect(
      isRoomExpired(
        { status: 'waiting', expiresAt: now - 1, players: { u1: activePlayer } },
        now
      )
    ).toBe(true);

    expect(
      isRoomExpired({ status: 'closed', expiresAt: now + 60_000, players: { u1: activePlayer } }, now)
    ).toBe(true);

    expect(isRoomExpired({ status: 'waiting', expiresAt: now + 60_000, players: {} }, now)).toBe(
      true
    );
  });

  it('defines Memory Match board sizes for 2, 3, and 4 players', () => {
    expect(MEMORY_MULTIPLAYER_CONFIGS[2]).toEqual({
      maxPlayers: 2,
      totalCards: 20,
      matchingPairs: 10,
    });
    expect(MEMORY_MULTIPLAYER_CONFIGS[3]).toEqual({
      maxPlayers: 3,
      totalCards: 40,
      matchingPairs: 20,
    });
    expect(MEMORY_MULTIPLAYER_CONFIGS[4]).toEqual({
      maxPlayers: 4,
      totalCards: 60,
      matchingPairs: 30,
    });
  });
});

describe('Anonymous Authentication helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirebaseSingletonsForTesting();
    mockGetApps.mockReturnValue([mockApp]);
    mockAuthInstance.currentUser = null;
  });

  it('reuses the currently signed-in user without calling signInAnonymously', async () => {
    const existingUser = { uid: 'existing-uid-123', isAnonymous: true };
    mockAuthInstance.currentUser = existingUser;

    const user = await ensureAnonymousSession();
    expect(user).toBe(existingUser);
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when no active session exists', async () => {
    const newUser = { uid: 'anon-uid-456', isAnonymous: true };
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, onNext: (u: null) => void) => {
      onNext(null);
      return () => {};
    });
    mockSignInAnonymously.mockResolvedValue({ user: newUser });

    const user = await ensureAnonymousSession();
    expect(user).toEqual(newUser);
    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  });
});

describe('Firestore utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirebaseSingletonsForTesting();
    mockGetApps.mockReturnValue([mockApp]);
  });

  it('fetches document data or returns null when document does not exist', async () => {
    mockDoc.mockReturnValue({ id: 'doc-1' });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'waiting' }),
    });

    const found = await fetchDocument<{ status: string }>('testCollection', 'doc-1');
    expect(found).toEqual({ status: 'waiting' });

    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    });

    const missing = await fetchDocument<{ status: string }>('testCollection', 'doc-2');
    expect(missing).toBeNull();
  });

  it('subscribes to document snapshots and forwards data to callbacks', () => {
    const unsubscribeMock = vi.fn();
    mockDoc.mockReturnValue({ id: 'doc-live' });
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        onNext: (snap: { exists: () => boolean; id: string; data: () => { turn: string } }) => void
      ) => {
        onNext({
          exists: () => true,
          id: 'doc-live',
          data: () => ({ turn: 'X' }),
        });
        return unsubscribeMock;
      }
    );

    const onData = vi.fn();
    const unsubscribe = subscribeToDocument<{ turn: string }>('testCollection', 'doc-live', {
      onData,
    });

    expect(onData).toHaveBeenCalledWith({ turn: 'X' }, 'doc-live');
    unsubscribe();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('formats FirebaseError with both error.code and error.message', () => {
    const firebaseErr = Object.assign(new Error('Transaction failed precondition'), {
      code: 'failed-precondition',
    });
    expect(formatFirebaseError(firebaseErr)).toEqual({
      code: 'failed-precondition',
      message: 'Transaction failed precondition',
      formatted: '[failed-precondition] Transaction failed precondition',
    });
  });

  it('retries transient failed-precondition errors in runFirestoreTransaction and succeeds', async () => {
    let attempts = 0;
    mockRunTransaction.mockImplementation(async (...args: unknown[]) => {
      const updateFn = args[1] as (tx: unknown) => Promise<unknown>;
      attempts++;
      if (attempts < 3) {
        const err = Object.assign(new Error('Document version mismatch'), {
          code: 'failed-precondition',
        });
        throw err;
      }
      return updateFn({});
    });

    const result = await runFirestoreTransaction(async () => 'committed-ok');
    expect(result).toBe('committed-ok');
    expect(attempts).toBe(3);
  });
});

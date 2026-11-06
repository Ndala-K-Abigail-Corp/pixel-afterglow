/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  signInAnonymously,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';

export interface AnonymousAuthState {
  user: User | null;
  uid: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  signIn: () => Promise<User | null>;
}

let inFlightSignInPromise: Promise<User> | null = null;

/**
 * Returns the currently authenticated Firebase user if available synchronously.
 */
export function getCurrentUser(): User | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
}

/**
 * Returns the current player's anonymous UID if authenticated.
 */
export function getCurrentUid(): string | null {
  return getCurrentUser()?.uid ?? null;
}

/**
 * Waits for Firebase Auth to restore any existing persisted session before
 * deciding whether a new anonymous sign-in is required.
 */
function waitForInitialAuthUser(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise<User | null>((resolve, reject) => {
    let settled = false;
    let unsubscribe: Unsubscribe | null = null;

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (settled) return;
        settled = true;
        if (unsubscribe) {
          unsubscribe();
        }
        resolve(user);
      },
      (error) => {
        if (settled) return;
        settled = true;
        if (unsubscribe) {
          unsubscribe();
        }
        reject(error);
      }
    );

    if (settled) {
      unsubscribe();
    }
  });
}

/**
 * Ensures the player has an active anonymous Firebase session.
 * Reuses an existing session if one is already active or persisted,
 * and deduplicates concurrent sign-in requests.
 */
export async function ensureAnonymousSession(): Promise<User> {
  const auth = getFirebaseAuth();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (inFlightSignInPromise) {
    return inFlightSignInPromise;
  }

  inFlightSignInPromise = (async () => {
    try {
      const existingUser = await waitForInitialAuthUser();
      if (existingUser) {
        return existingUser;
      }

      const credential = await signInAnonymously(auth);
      return credential.user;
    } finally {
      inFlightSignInPromise = null;
    }
  })();

  return inFlightSignInPromise;
}

/**
 * Subscribes to Firebase Authentication state changes.
 */
export function subscribeToAuthChanges(
  onChange: (user: User | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, onChange, onError);
}

/**
 * Reusable React hook for multiplayer features that require an anonymous player session.
 * Does not run automatically unless mounted by a component that uses it.
 */
export function useAnonymousAuth(options: { autoSignIn?: boolean } = {}): AnonymousAuthState {
  const { autoSignIn = true } = options;
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  const [isLoading, setIsLoading] = useState<boolean>(autoSignIn);
  const [error, setError] = useState<Error | null>(null);

  const signIn = useCallback(async (): Promise<User | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const signedInUser = await ensureAnonymousSession();
      setUser(signedInUser);
      return signedInUser;
    } catch (err) {
      const normalizedError =
        err instanceof Error ? err : new Error('Failed to sign in anonymously.');
      setError(normalizedError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      if (autoSignIn) {
        try {
          // Surface the specific FirebaseConfigurationError
          getFirebaseAuth();
        } catch (err) {
          setError(err instanceof Error ? err : new Error('Firebase is not configured.'));
        }
      }
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const unsubscribe = subscribeToAuthChanges(
      (nextUser) => {
        if (!isMounted) return;
        setUser(nextUser);
        if (nextUser) {
          setIsLoading(false);
        }
      },
      (authError) => {
        if (!isMounted) return;
        setError(authError);
        setIsLoading(false);
      }
    );

    if (autoSignIn) {
      ensureAnonymousSession()
        .then((resolvedUser) => {
          if (isMounted) {
            setUser(resolvedUser);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof Error ? err : new Error('Anonymous sign-in failed.'));
            setIsLoading(false);
          }
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [autoSignIn]);

  return {
    user,
    uid: user?.uid ?? null,
    isLoading,
    isAuthenticated: user !== null,
    error,
    signIn,
  };
}

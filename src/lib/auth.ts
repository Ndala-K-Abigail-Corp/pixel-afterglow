/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  linkWithPopup,
  linkWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
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

export interface AuthActionResult {
  user: User;
  linkedFromAnonymous: boolean;
  hadLinkingConflict?: boolean;
}

/**
 * Maps Firebase Auth error codes into friendly, non-technical player messages.
 */
export function mapAuthErrorToMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in popup was closed before completing. Please try again.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication service. Please check your connection.';
    default:
      if (error instanceof Error && error.message && !error.message.includes('Firebase:')) {
        return error.message;
      }
      return 'Authentication could not be completed. Please try again.';
  }
}

/**
 * Signs in with Google. If the user currently has an anonymous guest session,
 * attempts `linkWithPopup` first so their UID and active multiplayer rooms are preserved.
 * If the Google account already exists (`auth/credential-already-in-use`), falls back
 * safely to signing in with that Google account and signals `hadLinkingConflict: true`.
 */
export async function signInWithGoogle(): Promise<AuthActionResult> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    try {
      const linked = await linkWithPopup(current, provider);
      return { user: linked.user, linkedFromAnonymous: true };
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        const signedIn = await signInWithPopup(auth, provider);
        return {
          user: signedIn.user,
          linkedFromAnonymous: false,
          hadLinkingConflict: true,
        };
      }
      throw new Error(mapAuthErrorToMessage(err), { cause: err });
    }
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return { user: result.user, linkedFromAnonymous: false };
  } catch (err) {
    throw new Error(mapAuthErrorToMessage(err), { cause: err });
  }
}

/**
 * Registers a new Email & Password account. If currently signed in anonymously,
 * links the email/password credential to preserve the existing Firebase UID & active rooms.
 * Automatically sends an email verification link.
 */
export async function registerWithEmailAndPassword(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthActionResult> {
  const auth = getFirebaseAuth();
  const trimmedEmail = params.email.trim();
  const current = auth.currentUser;

  try {
    let user: User;
    let linkedFromAnonymous = false;

    if (current && current.isAnonymous) {
      const credential = EmailAuthProvider.credential(trimmedEmail, params.password);
      const linked = await linkWithCredential(current, credential);
      user = linked.user;
      linkedFromAnonymous = true;
    } else {
      const created = await createUserWithEmailAndPassword(auth, trimmedEmail, params.password);
      user = created.user;
    }

    if (params.displayName?.trim()) {
      await updateProfile(user, { displayName: params.displayName.trim() }).catch(() => {});
    }
    await sendEmailVerification(user).catch(() => {});

    return { user, linkedFromAnonymous };
  } catch (err) {
    throw new Error(mapAuthErrorToMessage(err), { cause: err });
  }
}

/**
 * Signs in with an existing Email & Password account.
 */
export async function signInWithEmailPassword(params: {
  email: string;
  password: string;
}): Promise<User> {
  const auth = getFirebaseAuth();
  try {
    const result = await signInWithEmailAndPassword(auth, params.email.trim(), params.password);
    return result.user;
  } catch (err) {
    throw new Error(mapAuthErrorToMessage(err), { cause: err });
  }
}

/**
 * Sends a Firebase password reset email.
 */
export async function sendAccountPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(mapAuthErrorToMessage(err), { cause: err });
  }
}

/**
 * Resends the verification email for the currently signed-in non-anonymous user.
 */
export async function resendVerificationEmail(): Promise<void> {
  const user = getCurrentUser();
  if (!user || user.isAnonymous) {
    throw new Error('Sign in with an email account to request email verification.');
  }
  try {
    await sendEmailVerification(user);
  } catch (err) {
    throw new Error(mapAuthErrorToMessage(err), { cause: err });
  }
}

/**
 * Signs out the current Firebase user.
 */
export async function signOutUser(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  await signOut(auth);
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

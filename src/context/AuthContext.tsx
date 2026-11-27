/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { isFirebaseConfigured } from '../lib/firebase';
import { subscribeToAuthChanges, signOutUser } from '../lib/auth';
import { fetchUserProfile } from '../logic/userProfile';
import { savePreferredNickname } from '../logic/multiplayerRoom';
import type { UserProfile } from '../types/profile';

export interface AuthContextValue {
  user: User | null;
  uid: string | null;
  profile: UserProfile | null;
  isAnonymous: boolean;
  isSignedInAccount: boolean;
  isLoadingAuth: boolean;
  needsProfileCompletion: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  setProfileState: (next: UserProfile | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(() => isFirebaseConfigured());

  const loadProfileForUser = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser || firebaseUser.isAnonymous) {
      setProfile(null);
      return null;
    }
    try {
      const loaded = await fetchUserProfile(firebaseUser.uid);
      setProfile(loaded);
      if (loaded?.username) {
        savePreferredNickname(loaded.username);
      }
      return loaded;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setIsLoadingAuth(false);
      return;
    }

    let isMounted = true;
    const unsubscribe = subscribeToAuthChanges(
      (nextUser) => {
        if (!isMounted) return;
        setUser(nextUser);
        if (!nextUser || nextUser.isAnonymous) {
          setProfile(null);
          setIsLoadingAuth(false);
          return;
        }
        void loadProfileForUser(nextUser).finally(() => {
          if (isMounted) {
            setIsLoadingAuth(false);
          }
        });
      },
      () => {
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadProfileForUser]);

  const refreshProfile = useCallback(async () => {
    return loadProfileForUser(user);
  }, [loadProfileForUser, user]);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
    setProfile(null);
  }, []);

  const isAnonymous = Boolean(user?.isAnonymous);
  const isSignedInAccount = Boolean(user && !user.isAnonymous);
  const needsProfileCompletion = Boolean(isSignedInAccount && !isLoadingAuth && !profile);

  return (
    <AuthContext.Provider
      value={{
        user,
        uid: user?.uid ?? null,
        profile,
        isAnonymous,
        isSignedInAccount,
        isLoadingAuth,
        needsProfileCompletion,
        refreshProfile,
        setProfileState: setProfile,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Graceful fallback for isolated component tests rendered outside AuthProvider
    return {
      user: null,
      uid: null,
      profile: null,
      isAnonymous: false,
      isSignedInAccount: false,
      isLoadingAuth: false,
      needsProfileCompletion: false,
      refreshProfile: async () => null,
      setProfileState: () => {},
      signOut: async () => {},
    };
  }
  return ctx;
}

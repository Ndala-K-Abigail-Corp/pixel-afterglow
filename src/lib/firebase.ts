/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseEnvConfig {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
}

export const REQUIRED_FIREBASE_ENV_KEYS: ReadonlyArray<keyof FirebaseEnvConfig> = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

export class FirebaseConfigurationError extends Error {
  public readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(
      `Missing required Firebase environment variables: ${missingKeys.join(
        ', '
      )}. Configure them in .env.local or your deployment environment.`
    );
    this.name = 'FirebaseConfigurationError';
    this.missingKeys = missingKeys;
  }
}

function readEnvSource(customEnv?: FirebaseEnvConfig): FirebaseEnvConfig {
  if (customEnv) {
    return customEnv;
  }
  const metaEnv = (import.meta as unknown as { env?: FirebaseEnvConfig }).env ?? {};
  return {
    VITE_FIREBASE_API_KEY: metaEnv.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: metaEnv.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: metaEnv.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: metaEnv.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: metaEnv.VITE_FIREBASE_APP_ID,
  };
}

/**
 * Returns a list of any required VITE_FIREBASE_* keys that are missing or empty.
 */
export function getMissingFirebaseEnvVars(customEnv?: FirebaseEnvConfig): string[] {
  const env = readEnvSource(customEnv);
  return REQUIRED_FIREBASE_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

/**
 * Checks whether all required Firebase environment variables are present.
 */
export function isFirebaseConfigured(customEnv?: FirebaseEnvConfig): boolean {
  return getMissingFirebaseEnvVars(customEnv).length === 0;
}

/**
 * Builds the FirebaseOptions object from Vite environment variables.
 */
export function buildFirebaseOptions(customEnv?: FirebaseEnvConfig): FirebaseOptions {
  const env = readEnvSource(customEnv);
  return {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() || undefined,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || undefined,
    projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() || undefined,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    appId: env.VITE_FIREBASE_APP_ID?.trim() || undefined,
  };
}

export const firebaseConfig: FirebaseOptions = buildFirebaseOptions();

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

/**
 * Returns the singleton FirebaseApp instance, initializing it on first access.
 * Throws FirebaseConfigurationError if required environment variables are missing.
 */
export function getFirebaseApp(customEnv?: FirebaseEnvConfig): FirebaseApp {
  if (cachedApp) {
    return cachedApp;
  }

  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  const missing = getMissingFirebaseEnvVars(customEnv);
  if (missing.length > 0) {
    throw new FirebaseConfigurationError(missing);
  }

  cachedApp = initializeApp(buildFirebaseOptions(customEnv));
  return cachedApp;
}

/**
 * Returns the singleton Firebase Auth instance.
 */
export function getFirebaseAuth(): Auth {
  if (!cachedAuth) {
    cachedAuth = getAuth(getFirebaseApp());
  }
  return cachedAuth;
}

/**
 * Returns the singleton Cloud Firestore instance.
 */
export function getFirestoreDb(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore(getFirebaseApp());
  }
  return cachedDb;
}

/**
 * Extracts and formats the full Firebase error details, including `error.code` and `error.message`.
 */
export function formatFirebaseError(error: unknown): {
  code: string;
  message: string;
  formatted: string;
} {
  if (error && typeof error === 'object') {
    const maybeCode = (error as { code?: unknown }).code;
    const maybeMessage = (error as { message?: unknown }).message;
    const code = typeof maybeCode === 'string' && maybeCode.length > 0 ? maybeCode : 'unknown';
    const message =
      typeof maybeMessage === 'string' && maybeMessage.length > 0
        ? maybeMessage
        : 'An unexpected Firebase error occurred.';
    const formatted = code !== 'unknown' && !message.includes(code)
      ? `[${code}] ${message}`
      : message;
    return { code, message, formatted };
  }

  const fallback = typeof error === 'string' ? error : 'An unexpected Firebase error occurred.';
  return { code: 'unknown', message: fallback, formatted: fallback };
}

/**
 * Resets cached singleton references (used in unit tests).
 */
export function resetFirebaseSingletonsForTesting(): void {
  cachedApp = null;
  cachedAuth = null;
  cachedDb = null;
}

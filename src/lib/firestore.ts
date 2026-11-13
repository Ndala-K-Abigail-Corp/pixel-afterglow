/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type CollectionReference,
  type DocumentReference,
  type DocumentData,
  type WithFieldValue,
  type UpdateData,
  type SetOptions,
  type Unsubscribe,
  type FieldValue,
  type Transaction,
} from 'firebase/firestore';
import { getFirestoreDb, formatFirebaseError } from './firebase';

export interface FirestoreSnapshotMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface FirestoreSubscriptionCallbacks<T> {
  onData: (data: T | null, docId: string) => void;
  onMetadata?: (meta: FirestoreSnapshotMetadata) => void;
  onError?: (error: Error) => void;
}

/**
 * Returns the initialized Cloud Firestore instance.
 */
export function getDb(): Firestore {
  return getFirestoreDb();
}

/**
 * Creates a typed Firestore CollectionReference.
 */
export function getCollectionRef<T = DocumentData>(
  collectionPath: string
): CollectionReference<T> {
  return collection(getFirestoreDb(), collectionPath) as CollectionReference<T>;
}

/**
 * Creates a typed Firestore DocumentReference.
 */
export function getDocRef<T = DocumentData>(
  collectionPath: string,
  docId: string
): DocumentReference<T> {
  return doc(getFirestoreDb(), collectionPath, docId) as DocumentReference<T>;
}

/**
 * Fetches a single document by collection path and document ID.
 * Returns null if the document does not exist.
 */
export async function fetchDocument<T = DocumentData>(
  collectionPath: string,
  docId: string
): Promise<T | null> {
  const ref = getDocRef<T>(collectionPath, docId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data();
}

/**
 * Creates or overwrites a single Firestore document (or merges when options are provided).
 */
export async function setDocument<T extends DocumentData>(
  collectionPath: string,
  docId: string,
  data: WithFieldValue<T>,
  options?: SetOptions
): Promise<void> {
  const ref = getDocRef<T>(collectionPath, docId);
  if (options) {
    await setDoc(ref, data, options);
  } else {
    await setDoc(ref, data);
  }
}

/**
 * Updates fields on an existing Firestore document.
 */
export async function updateDocument<T extends DocumentData>(
  collectionPath: string,
  docId: string,
  data: UpdateData<T> | Record<string, unknown>
): Promise<void> {
  const ref = getDocRef<T>(collectionPath, docId);
  await updateDoc(ref, data as UpdateData<T>);
}

/**
 * Deletes a document from Firestore.
 */
export async function deleteDocument(
  collectionPath: string,
  docId: string
): Promise<void> {
  const ref = getDocRef(collectionPath, docId);
  await deleteDoc(ref);
}

/**
 * Subscribes to real-time updates on a single Firestore document via onSnapshot.
 * Returns an Unsubscribe function to clean up the listener.
 */
export function subscribeToDocument<T = DocumentData>(
  collectionPath: string,
  docId: string,
  callbacks: FirestoreSubscriptionCallbacks<T>
): Unsubscribe {
  const ref = getDocRef<T>(collectionPath, docId);
  return onSnapshot(
    ref,
    (snapshot) => {
      const snapshotId = snapshot.id;
      const rawMeta = (snapshot as { metadata?: { fromCache?: boolean; hasPendingWrites?: boolean } })
        .metadata;
      if (rawMeta && callbacks.onMetadata) {
        callbacks.onMetadata({
          fromCache: Boolean(rawMeta.fromCache),
          hasPendingWrites: Boolean(rawMeta.hasPendingWrites),
        });
      }
      if (!snapshot.exists()) {
        callbacks.onData(null, snapshotId);
        return;
      }
      callbacks.onData(snapshot.data(), snapshotId);
    },
    (error) => {
      callbacks.onError?.(error);
    }
  );
}

let inFlightTransactionCount = 0;
let clientTransactionQueue: Promise<unknown> = Promise.resolve();

/**
 * Returns true if a Firestore transaction is currently in flight on this client.
 * Used to suppress background presence heartbeats while a game action is executing.
 */
export function isTransactionInFlight(): boolean {
  return inFlightTransactionCount > 0;
}

function isTransientTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === 'failed-precondition' ||
    code === 'aborted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded'
  );
}

/**
 * Executes an atomic Firestore transaction to prevent race conditions during
 * concurrent room joins, state transitions, and turn-based game moves.
 * Serializes local client transactions and retries transient precondition conflicts.
 */
export async function runFirestoreTransaction<T>(
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  const executeWithRetry = async (): Promise<T> => {
    const maxRetries = 4;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await runTransaction(getFirestoreDb(), updateFunction, {
          maxAttempts: 10,
        });
      } catch (err) {
        lastError = err;
        if (!isTransientTransactionError(err) || attempt === maxRetries) {
          if (err && typeof err === 'object' && 'code' in err && !(err instanceof Error && err.name === 'MultiplayerRoomError')) {
            const details = formatFirebaseError(err);
            const wrapped = new Error(details.formatted) as Error & { code?: string };
            wrapped.code = details.code;
            throw wrapped;
          }
          throw err;
        }
        // Jittered backoff (40ms - 160ms) before retrying a transient conflict
        const delayMs = 40 * (attempt + 1) + Math.floor(Math.random() * 40);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  };

  inFlightTransactionCount += 1;
  const scheduled = clientTransactionQueue.then(executeWithRetry, executeWithRetry);
  clientTransactionQueue = scheduled.then(
    () => undefined,
    () => undefined
  );

  try {
    return await scheduled;
  } finally {
    inFlightTransactionCount = Math.max(0, inFlightTransactionCount - 1);
  }
}

/**
 * Returns a Firestore server timestamp sentinel for consistent server-side time ordering.
 */
export function getServerTimestamp(): FieldValue {
  return serverTimestamp();
}

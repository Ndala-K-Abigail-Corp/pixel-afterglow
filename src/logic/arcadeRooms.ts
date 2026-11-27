/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../lib/firebase';
import { getCurrentUser } from '../lib/auth';
import {
  runFirestoreTransaction,
  subscribeToDocument,
  subscribeToSubcollection,
} from '../lib/firestore';
import {
  ARCADE_GAME_CATALOG,
  type ArcadeGameId,
  type ArcadeGameSession,
  type ArcadeMemberRole,
  type ArcadeRoomMember,
  type ArcadeRoomVisibility,
  type ArcadeSessionStatus,
  type PersistentArcadeRoom,
} from '../types/arcadeRoom';
import {
  GAME_PLAYER_LIMITS,
  MEMORY_MAX_CARD_COUNT,
  MEMORY_MIN_CARD_COUNT,
  MEMORY_CARD_COUNT_STEP,
  type MultiplayerGameType,
} from '../types/multiplayer';
import {
  createMultiplayerRoom,
  generateRoomCode,
  normalizeRoomCode,
  isValidRoomCodeFormat,
  saveActiveRoomSession,
  closeMultiplayerRoom,
} from './multiplayerRoom';

export const ARCADE_ROOMS_COLLECTION = 'arcadeRooms';
export const ARCADE_MEMBERS_SUBCOLLECTION = 'members';
export const ARCADE_SESSIONS_SUBCOLLECTION = 'sessions';

export const ArcadeRoomNameSchema = z
  .string()
  .trim()
  .min(3, 'Room name must be at least 3 characters.')
  .max(40, 'Room name cannot exceed 40 characters.')
  .regex(
    /^[A-Za-z0-9 _\-!'&.]+$/,
    'Room name contains unsupported characters.'
  );

export const ArcadeAvailableGamesSchema = z
  .array(z.enum(['memory-match', 'tic-tac-toe', 'snake']))
  .min(1, 'Select at least one game for your arcade room.')
  .refine(
    (games) => new Set(games).size === games.length,
    'Duplicate games are not allowed.'
  );

export const ArcadeMemoryCardCountSchema = z
  .number()
  .int()
  .min(MEMORY_MIN_CARD_COUNT)
  .max(MEMORY_MAX_CARD_COUNT)
  .refine((n) => n % MEMORY_CARD_COUNT_STEP === 0, {
    message: 'Card count must be an even number between 10 and 100.',
  });

export const CreateArcadeRoomInputSchema = z.object({
  name: ArcadeRoomNameSchema,
  availableGames: ArcadeAvailableGamesSchema,
  visibility: z.enum(['invite-only', 'private']).default('invite-only'),
  defaultMemoryCardCount: ArcadeMemoryCardCountSchema.default(20),
});

export const UpdateArcadeRoomSettingsSchema = z.object({
  name: ArcadeRoomNameSchema.optional(),
  availableGames: ArcadeAvailableGamesSchema.optional(),
  visibility: z.enum(['invite-only', 'private']).optional(),
  defaultMemoryCardCount: ArcadeMemoryCardCountSchema.optional(),
});

export const StartArcadeSessionInputSchema = z.object({
  arcadeRoomId: z.string().min(3),
  gameType: z.enum(['memory-match', 'tic-tac-toe', 'snake']),
  cardCount: ArcadeMemoryCardCountSchema.optional(),
  hostNickname: z.string().trim().min(2).max(20),
});

/**
 * Ensures the caller is a registered (non-anonymous) authenticated user.
 * Anonymous guests are strictly prevented from creating persistent user-owned arcade rooms.
 */
export function assertRegisteredArcadeUser(): { uid: string; isAnonymous: boolean } {
  const user = getCurrentUser();
  if (!user || user.isAnonymous) {
    throw new Error(
      'Sign in with a registered Pixel Afterglow account to create or own persistent arcade rooms. Guests can still play in temporary multiplayer rooms.'
    );
  }
  return { uid: user.uid, isAnonymous: false };
}

/**
 * Builds a shareable invitation URL for a persistent arcade room.
 */
export function buildArcadeRoomInvitationUrl(inviteCode: string): string {
  const normalized = normalizeRoomCode(inviteCode);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://pixel-afterglow.vercel.app';
  return `${origin}/?arcade=${encodeURIComponent(normalized)}`;
}

/**
 * Parses an arcade room invitation code from `?arcade=CODE` in the current URL.
 */
export function parseArcadeRoomInvitationFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('arcade');
    if (!raw) return null;
    const normalized = normalizeRoomCode(raw);
    return isValidRoomCodeFormat(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function clearArcadeRoomInvitationFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('arcade')) {
      url.searchParams.delete('arcade');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // Ignore history API restrictions
  }
}

/**
 * Pure builder for a new persistent arcade room document and its owner member record.
 */
export function buildPersistentArcadeRoom(params: {
  id: string;
  inviteCode: string;
  name: string;
  ownerUid: string;
  ownerUsername: string;
  availableGames: ArcadeGameId[];
  visibility?: ArcadeRoomVisibility;
  defaultMemoryCardCount?: number;
  countryCode?: string;
  avatarId?: string;
  nowMs?: number;
}): { room: PersistentArcadeRoom; ownerMember: ArcadeRoomMember } {
  const parsed = CreateArcadeRoomInputSchema.parse({
    name: params.name,
    availableGames: params.availableGames,
    visibility: params.visibility ?? 'invite-only',
    defaultMemoryCardCount: params.defaultMemoryCardCount ?? 20,
  });

  const nowMs = params.nowMs ?? Date.now();
  const room: PersistentArcadeRoom = {
    id: params.id,
    inviteCode: normalizeRoomCode(params.inviteCode),
    name: parsed.name,
    ownerUid: params.ownerUid,
    ownerUsername: params.ownerUsername,
    availableGames: parsed.availableGames,
    visibility: parsed.visibility,
    status: 'active',
    memberUids: [params.ownerUid],
    managerUids: [],
    defaultMemoryCardCount: parsed.defaultMemoryCardCount,
    activeSessionId: null,
    activeSessionRoomCode: null,
    activeSessionGameType: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  };

  const ownerMember: ArcadeRoomMember = {
    uid: params.ownerUid,
    username: params.ownerUsername,
    role: 'owner',
    ...(params.countryCode ? { countryCode: params.countryCode } : {}),
    ...(params.avatarId ? { avatarId: params.avatarId } : {}),
    joinedAt: nowMs,
    lastVisitedAt: nowMs,
  };

  return { room, ownerMember };
}

/**
 * Creates a new persistent user-owned arcade room in Firestore (`arcadeRooms/{id}` + `members/{ownerUid}`).
 * Strictly restricted to registered (non-anonymous) authenticated accounts.
 */
export async function createPersistentArcadeRoom(params: {
  name: string;
  availableGames: ArcadeGameId[];
  visibility?: ArcadeRoomVisibility;
  defaultMemoryCardCount?: number;
  ownerUsername: string;
  countryCode?: string;
  avatarId?: string;
}): Promise<PersistentArcadeRoom> {
  const { uid } = assertRegisteredArcadeUser();
  const db = getFirestoreDb();
  const inviteCode = generateRoomCode();
  const roomId = `arc_${inviteCode.toLowerCase()}_${Date.now().toString(36)}`;

  const { room, ownerMember } = buildPersistentArcadeRoom({
    id: roomId,
    inviteCode,
    name: params.name,
    ownerUid: uid,
    ownerUsername: params.ownerUsername,
    availableGames: params.availableGames,
    visibility: params.visibility,
    defaultMemoryCardCount: params.defaultMemoryCardCount,
    countryCode: params.countryCode,
    avatarId: params.avatarId,
  });

  const roomRef = doc(db, ARCADE_ROOMS_COLLECTION, roomId);
  const memberRef = doc(db, ARCADE_ROOMS_COLLECTION, roomId, ARCADE_MEMBERS_SUBCOLLECTION, uid);

  try {
    // Commit parent room document first so both `get()` and `getAfter()` Firestore rules
    // immediately verify ownership when creating the owner member document.
    await setDoc(roomRef, room);
    try {
      await setDoc(memberRef, ownerMember);
    } catch (memberErr) {
      // Roll back parent room so we never leave a partially created room
      await deleteDoc(roomRef).catch(() => {});
      throw memberErr;
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : '';
    if (code === 'permission-denied') {
      throw new Error(
        'Unable to create your Arcade Room due to missing permissions. Please ensure you are signed in with a registered account and try again.',
        { cause: err }
      );
    }
    throw err;
  }

  return room;
}

/**
 * Subscribes in real time to all persistent arcade rooms that a user owns or belongs to.
 */
export function subscribeToUserArcadeRooms(
  uid: string,
  callbacks: {
    onData: (rooms: PersistentArcadeRoom[]) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  if (!isFirebaseConfigured() || !uid) {
    callbacks.onData([]);
    return () => {};
  }
  const db = getFirestoreDb();
  const q = query(
    collection(db, ARCADE_ROOMS_COLLECTION),
    where('memberUids', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: PersistentArcadeRoom[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as PersistentArcadeRoom;
        if (data && data.status !== 'archived') {
          items.push({ ...data, id: docSnap.id });
        }
      });
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      callbacks.onData(items);
    },
    (error) => {
      callbacks.onError?.(error);
    }
  );
}

/**
 * Subscribes in real time to a single persistent arcade room document.
 */
export function subscribeToArcadeRoom(
  arcadeRoomId: string,
  callbacks: {
    onData: (room: PersistentArcadeRoom | null) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  if (!isFirebaseConfigured() || !arcadeRoomId) {
    callbacks.onData(null);
    return () => {};
  }
  return subscribeToDocument<PersistentArcadeRoom>(ARCADE_ROOMS_COLLECTION, arcadeRoomId, {
    onData: (data, docId) => {
      callbacks.onData(data ? { ...data, id: docId } : null);
    },
    onError: callbacks.onError,
  });
}

/**
 * Subscribes to members of a persistent arcade room.
 */
export function subscribeToArcadeRoomMembers(
  arcadeRoomId: string,
  callbacks: {
    onData: (members: ArcadeRoomMember[]) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  if (!isFirebaseConfigured() || !arcadeRoomId) {
    callbacks.onData([]);
    return () => {};
  }
  return subscribeToSubcollection<ArcadeRoomMember>(
    ARCADE_ROOMS_COLLECTION,
    arcadeRoomId,
    ARCADE_MEMBERS_SUBCOLLECTION,
    {
      orderByField: 'joinedAt',
      direction: 'asc',
      maxItems: 50,
      onData: (items) => callbacks.onData(items),
      onError: callbacks.onError,
    }
  );
}

/**
 * Subscribes to game sessions of a persistent arcade room (most recent first).
 */
export function subscribeToArcadeRoomSessions(
  arcadeRoomId: string,
  callbacks: {
    onData: (sessions: ArcadeGameSession[]) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  if (!isFirebaseConfigured() || !arcadeRoomId) {
    callbacks.onData([]);
    return () => {};
  }
  return subscribeToSubcollection<ArcadeGameSession>(
    ARCADE_ROOMS_COLLECTION,
    arcadeRoomId,
    ARCADE_SESSIONS_SUBCOLLECTION,
    {
      orderByField: 'createdAt',
      direction: 'desc',
      maxItems: 25,
      onData: (items) => callbacks.onData(items),
      onError: callbacks.onError,
    }
  );
}

/**
 * Joins an existing persistent arcade room using its 6-character invite code.
 */
export async function joinPersistentArcadeRoomByCode(params: {
  inviteCode: string;
  username: string;
  countryCode?: string;
  avatarId?: string;
}): Promise<PersistentArcadeRoom> {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Please sign in before joining an arcade room.');
  }
  const normalized = normalizeRoomCode(params.inviteCode);
  if (!isValidRoomCodeFormat(normalized)) {
    throw new Error('Enter a valid 6-character arcade room code.');
  }

  const db = getFirestoreDb();
  const q = query(
    collection(db, ARCADE_ROOMS_COLLECTION),
    where('inviteCode', '==', normalized),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error('No persistent arcade room was found with that invite code.');
  }

  const targetDoc = snap.docs[0];
  const arcadeRoomId = targetDoc.id;

  return runFirestoreTransaction(async (tx) => {
    const roomRef = doc(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId);
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('This arcade room no longer exists.');
    }
    const room = roomSnap.data() as PersistentArcadeRoom;
    if (room.status !== 'active') {
      throw new Error('This arcade room is currently archived.');
    }
    if (room.visibility === 'private' && !room.memberUids.includes(user.uid)) {
      throw new Error('This arcade room is private. Ask the owner to enable invite-code access.');
    }

    const nowMs = Date.now();
    const memberRef = doc(
      db,
      ARCADE_ROOMS_COLLECTION,
      arcadeRoomId,
      ARCADE_MEMBERS_SUBCOLLECTION,
      user.uid
    );
    const alreadyMember = room.memberUids.includes(user.uid);
    const nextMemberUids = alreadyMember ? room.memberUids : [...room.memberUids, user.uid];

    if (!alreadyMember) {
      tx.update(roomRef, {
        memberUids: nextMemberUids,
        updatedAt: nowMs,
      });
      const memberRecord: ArcadeRoomMember = {
        uid: user.uid,
        username: params.username.trim() || 'Player',
        role: 'member',
        countryCode: params.countryCode,
        avatarId: params.avatarId,
        joinedAt: nowMs,
        lastVisitedAt: nowMs,
      };
      tx.set(memberRef, memberRecord);
    } else {
      tx.set(
        memberRef,
        { lastVisitedAt: nowMs },
        { merge: true }
      );
    }

    return { ...room, id: arcadeRoomId, memberUids: nextMemberUids, updatedAt: nowMs };
  });
}

/**
 * Updates protected persistent arcade room settings (owner or authorized manager only).
 */
export async function updatePersistentArcadeRoomSettings(
  arcadeRoomId: string,
  updates: {
    name?: string;
    availableGames?: ArcadeGameId[];
    visibility?: ArcadeRoomVisibility;
    defaultMemoryCardCount?: number;
  }
): Promise<PersistentArcadeRoom> {
  const user = getCurrentUser();
  if (!user || user.isAnonymous) {
    throw new Error('Only registered room owners or managers can update room settings.');
  }
  const parsed = UpdateArcadeRoomSettingsSchema.parse(updates);
  const db = getFirestoreDb();

  return runFirestoreTransaction(async (tx) => {
    const roomRef = doc(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId);
    const snap = await tx.get(roomRef);
    if (!snap.exists()) {
      throw new Error('Arcade room not found.');
    }
    const room = snap.data() as PersistentArcadeRoom;
    const isAuthorized =
      room.ownerUid === user.uid || room.managerUids.includes(user.uid);
    if (!isAuthorized) {
      throw new Error('You do not have permission to edit this arcade room.');
    }

    const nowMs = Date.now();
    const nextRoom: PersistentArcadeRoom = {
      ...room,
      id: arcadeRoomId,
      name: parsed.name ?? room.name,
      availableGames: parsed.availableGames ?? room.availableGames,
      visibility: parsed.visibility ?? room.visibility,
      defaultMemoryCardCount:
        parsed.defaultMemoryCardCount ?? room.defaultMemoryCardCount,
      updatedAt: nowMs,
    };

    tx.update(roomRef, {
      name: nextRoom.name,
      availableGames: nextRoom.availableGames,
      visibility: nextRoom.visibility,
      defaultMemoryCardCount: nextRoom.defaultMemoryCardCount,
      updatedAt: nowMs,
    });
    return nextRoom;
  });
}

/**
 * Updates a member's role (`manager` vs `member`). Owner only.
 */
export async function setArcadeMemberRole(
  arcadeRoomId: string,
  targetUid: string,
  role: Exclude<ArcadeMemberRole, 'owner'>
): Promise<void> {
  const { uid } = assertRegisteredArcadeUser();
  const db = getFirestoreDb();

  await runFirestoreTransaction(async (tx) => {
    const roomRef = doc(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId);
    const snap = await tx.get(roomRef);
    if (!snap.exists()) throw new Error('Arcade room not found.');
    const room = snap.data() as PersistentArcadeRoom;
    if (room.ownerUid !== uid) {
      throw new Error('Only the room owner can change member roles.');
    }
    if (targetUid === room.ownerUid) {
      throw new Error('The room owner role cannot be reassigned.');
    }
    if (!room.memberUids.includes(targetUid)) {
      throw new Error('Selected user is not a member of this room.');
    }

    const nextManagers =
      role === 'manager'
        ? Array.from(new Set([...room.managerUids, targetUid]))
        : room.managerUids.filter((id) => id !== targetUid);

    tx.update(roomRef, {
      managerUids: nextManagers,
      updatedAt: Date.now(),
    });
    const memberRef = doc(
      db,
      ARCADE_ROOMS_COLLECTION,
      arcadeRoomId,
      ARCADE_MEMBERS_SUBCOLLECTION,
      targetUid
    );
    tx.set(memberRef, { role }, { merge: true });
  });
}

/**
 * Removes a member from a persistent arcade room (owner/manager moderation, or self-leave).
 */
export async function removeArcadeRoomMember(
  arcadeRoomId: string,
  targetUid: string
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in required.');
  const db = getFirestoreDb();

  await runFirestoreTransaction(async (tx) => {
    const roomRef = doc(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId);
    const snap = await tx.get(roomRef);
    if (!snap.exists()) throw new Error('Arcade room not found.');
    const room = snap.data() as PersistentArcadeRoom;

    if (targetUid === room.ownerUid) {
      throw new Error('The room owner cannot be removed. Delete the room instead.');
    }

    const isSelf = user.uid === targetUid;
    const isOwner = room.ownerUid === user.uid;
    const isManager = room.managerUids.includes(user.uid);
    const targetIsManager = room.managerUids.includes(targetUid);

    if (!isSelf && !isOwner && !(isManager && !targetIsManager)) {
      throw new Error('You do not have permission to remove this member.');
    }

    const nextMembers = room.memberUids.filter((id) => id !== targetUid);
    const nextManagers = room.managerUids.filter((id) => id !== targetUid);

    tx.update(roomRef, {
      memberUids: nextMembers,
      managerUids: nextManagers,
      updatedAt: Date.now(),
    });

    const memberRef = doc(
      db,
      ARCADE_ROOMS_COLLECTION,
      arcadeRoomId,
      ARCADE_MEMBERS_SUBCOLLECTION,
      targetUid
    );
    tx.delete(memberRef);
  });
}

/**
 * Safely deletes an owned persistent arcade room and cleans up its subcollections
 * (`members`, `sessions`) and any active linked match room.
 */
export async function deletePersistentArcadeRoom(arcadeRoomId: string): Promise<void> {
  const { uid } = assertRegisteredArcadeUser();
  const db = getFirestoreDb();

  let activeSessionRoomCode: string | null = null;
  await runFirestoreTransaction(async (tx) => {
    const roomRef = doc(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId);
    const snap = await tx.get(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as PersistentArcadeRoom;
    if (room.ownerUid !== uid) {
      throw new Error('Only the room owner can delete this persistent arcade room.');
    }
    activeSessionRoomCode = room.activeSessionRoomCode;
  });

  if (activeSessionRoomCode) {
    await closeMultiplayerRoom({ roomCode: activeSessionRoomCode }).catch(() => {});
  }

  // Delete members & sessions subcollections in a batch before removing the parent doc
  const [membersSnap, sessionsSnap] = await Promise.all([
    getDocs(collection(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId, ARCADE_MEMBERS_SUBCOLLECTION)),
    getDocs(collection(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId, ARCADE_SESSIONS_SUBCOLLECTION)),
  ]);

  const batch = writeBatch(db);
  membersSnap.forEach((docSnap) => batch.delete(docSnap.ref));
  sessionsSnap.forEach((docSnap) => batch.delete(docSnap.ref));
  batch.delete(doc(db, ARCADE_ROOMS_COLLECTION, arcadeRoomId));
  await batch.commit();
}

/**
 * Level 2: Starts a new, isolated Game Session inside a Persistent Arcade Room.
 * - Enforces single active session per persistent room (prevents accidental duplicate sessions).
 * - Automatically enforces per-game player limits (Memory Match 2-8, Tic-Tac-Toe 2-2).
 * - Links the new session to a clean `rooms/{roomCode}` gameplay document.
 */
export async function startArcadeRoomGameSession(params: {
  arcadeRoomId: string;
  gameType: MultiplayerGameType;
  cardCount?: number;
  hostNickname: string;
}): Promise<{ session: ArcadeGameSession; roomCode: string }> {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Sign in required to start a game session.');
  }

  const parsed = StartArcadeSessionInputSchema.parse(params);
  const gameEntry = ARCADE_GAME_CATALOG.find((g) => g.id === parsed.gameType);
  if (!gameEntry || !gameEntry.playable) {
    throw new Error('Selected game is not yet playable.');
  }

  const db = getFirestoreDb();

  // Pre-validate room membership and single-active-session invariant
  const limits = GAME_PLAYER_LIMITS[parsed.gameType];
  let resolvedCardCount = parsed.cardCount ?? 20;

  // Create the isolated Level-2 multiplayer gameplay room first (with auto player limits)
  const createdMatchRoom = await createMultiplayerRoom({
    gameType: parsed.gameType,
    hostNickname: parsed.hostNickname,
    maxPlayers: limits.maxPlayers,
    memorySettings:
      parsed.gameType === 'memory-match'
        ? {
            cardCount: resolvedCardCount,
            minPlayers: limits.minPlayers,
            maxPlayers: limits.maxPlayers,
          }
        : undefined,
  });

  const createdRoomCode = createdMatchRoom.room.roomCode;
  const sessionId = `sess_${createdRoomCode.toLowerCase()}_${Date.now().toString(36)}`;
  const nowMs = Date.now();

  try {
    const session = await runFirestoreTransaction(async (tx) => {
      const arcadeRef = doc(db, ARCADE_ROOMS_COLLECTION, parsed.arcadeRoomId);
      const snap = await tx.get(arcadeRef);
      if (!snap.exists()) {
        throw new Error('Persistent arcade room not found.');
      }
      const arcadeRoom = snap.data() as PersistentArcadeRoom;
      if (!arcadeRoom.memberUids.includes(user.uid)) {
        throw new Error('Only room members can start a game session.');
      }
      if (!arcadeRoom.availableGames.includes(parsed.gameType)) {
        throw new Error('This game is not enabled in this arcade room.');
      }
      if (arcadeRoom.activeSessionId && arcadeRoom.activeSessionRoomCode) {
        throw new Error(
          `A game session (${arcadeRoom.activeSessionRoomCode}) is already active in this arcade room. Join it or end it before starting a new one.`
        );
      }

      resolvedCardCount =
        parsed.gameType === 'memory-match'
          ? parsed.cardCount ?? arcadeRoom.defaultMemoryCardCount
          : (undefined as unknown as number);

      const nextSession: ArcadeGameSession = {
        sessionId,
        arcadeRoomId: parsed.arcadeRoomId,
        roomCode: createdRoomCode,
        gameType: parsed.gameType,
        status: 'waiting',
        createdByUid: user.uid,
        createdByUsername: parsed.hostNickname,
        ...(parsed.gameType === 'memory-match' ? { cardCount: resolvedCardCount } : {}),
        playerUids: [user.uid],
        createdAt: nowMs,
        completedAt: null,
      };

      const sessionRef = doc(
        db,
        ARCADE_ROOMS_COLLECTION,
        parsed.arcadeRoomId,
        ARCADE_SESSIONS_SUBCOLLECTION,
        sessionId
      );
      tx.set(sessionRef, nextSession);
      tx.update(arcadeRef, {
        activeSessionId: sessionId,
        activeSessionRoomCode: createdRoomCode,
        activeSessionGameType: parsed.gameType,
        updatedAt: nowMs,
      });

      return nextSession;
    });

    saveActiveRoomSession(parsed.gameType, createdRoomCode);
    return { session, roomCode: createdRoomCode };
  } catch (err) {
    // Roll back the orphaned match room if the arcade room already had an active session
    await closeMultiplayerRoom({ roomCode: createdRoomCode }).catch(() => {});
    throw err;
  }
}

/**
 * Ends or completes the active game session in a persistent arcade room,
 * leaving the persistent arcade room intact and ready for another game session.
 */
export async function finishArcadeRoomGameSession(params: {
  arcadeRoomId: string;
  sessionId: string;
  status?: Extract<ArcadeSessionStatus, 'completed' | 'cancelled'>;
  winnerUids?: string[];
}): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in required.');
  const db = getFirestoreDb();
  const finalStatus = params.status ?? 'completed';
  const nowMs = Date.now();

  let linkedRoomCode: string | null = null;

  await runFirestoreTransaction(async (tx) => {
    const arcadeRef = doc(db, ARCADE_ROOMS_COLLECTION, params.arcadeRoomId);
    const snap = await tx.get(arcadeRef);
    if (!snap.exists()) return;
    const arcadeRoom = snap.data() as PersistentArcadeRoom;
    if (!arcadeRoom.memberUids.includes(user.uid)) {
      throw new Error('Only room members can update session status.');
    }

    const sessionRef = doc(
      db,
      ARCADE_ROOMS_COLLECTION,
      params.arcadeRoomId,
      ARCADE_SESSIONS_SUBCOLLECTION,
      params.sessionId
    );
    const sessionSnap = await tx.get(sessionRef);
    if (sessionSnap.exists()) {
      const sessionData = sessionSnap.data() as ArcadeGameSession;
      linkedRoomCode = sessionData.roomCode;
      tx.update(sessionRef, {
        status: finalStatus,
        completedAt: nowMs,
        ...(params.winnerUids ? { winnerUids: params.winnerUids } : {}),
      });
    }

    if (arcadeRoom.activeSessionId === params.sessionId) {
      tx.update(arcadeRef, {
        activeSessionId: null,
        activeSessionRoomCode: null,
        activeSessionGameType: null,
        updatedAt: nowMs,
      });
    }
  });

  if (finalStatus === 'cancelled' && linkedRoomCode) {
    await closeMultiplayerRoom({ roomCode: linkedRoomCode }).catch(() => {});
  }
}

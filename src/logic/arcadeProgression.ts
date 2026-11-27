/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchDocument } from '../lib/firestore';
import { isFirebaseConfigured } from '../lib/firebase';
import type {
  ArcadeLevelDefinition,
  ArcadeXpProgress,
  PlayerProgressionDoc,
} from '../types/arcadePlatform';

export const PROGRESSION_SUBCOLLECTION = 'progression';
export const PROGRESSION_DOC_ID = 'arcade';

/**
 * Configurable Arcade XP award table.
 * Designed to reward meaningful play without allowing spam or XP farming.
 */
export const ARCADE_XP_REWARDS = {
  completeSinglePlayerGame: 15,
  completeMultiplayerGame: 30,
  winMultiplayerGame: 45,
  drawMultiplayerGame: 20,
  personalBestAchieved: 25,
  tryNewGameBonus: 40,
  createFirstPersistentRoom: 50,
} as const;

/**
 * Configurable Arcade Level thresholds (Levels 1–10 + automatic extension beyond Level 10).
 */
export const ARCADE_LEVEL_THRESHOLDS: readonly ArcadeLevelDefinition[] = [
  { level: 1, title: 'New Challenger', minXp: 0 },
  { level: 2, title: 'Button Rookie', minXp: 100 },
  { level: 3, title: 'Pixel Adventurer', minXp: 250 },
  { level: 4, title: 'Arcade Explorer', minXp: 450 },
  { level: 5, title: 'Retro Regular', minXp: 700 },
  { level: 6, title: 'Combo Master', minXp: 1050 },
  { level: 7, title: 'Pixel Pro', minXp: 1500 },
  { level: 8, title: 'Arcade Veteran', minXp: 2100 },
  { level: 9, title: 'High Score Hero', minXp: 2850 },
  { level: 10, title: 'Legend of the Arcade', minXp: 3800 },
] as const;

/** Extra XP per level beyond Level 10 so progression can grow smoothly in future seasons. */
export const POST_MAX_LEVEL_XP_STEP = 1200;

export function createEmptyProgression(uid: string, nowMs = Date.now()): PlayerProgressionDoc {
  return {
    uid,
    totalXp: 0,
    level: 1,
    levelTitle: ARCADE_LEVEL_THRESHOLDS[0].title,
    processedEventIds: [],
    distinctOpponentUids: [],
    activeDayKeys: [],
    playedGameIds: [],
    reactionsReceived: 0,
    persistentRoomsCreated: 0,
    updatedAt: nowMs,
  };
}

/**
 * Calculates the player's current Arcade Level, title, and progress bar metrics from total XP.
 */
export function calculateArcadeXpProgress(
  rawTotalXp: number,
  thresholds: readonly ArcadeLevelDefinition[] = ARCADE_LEVEL_THRESHOLDS
): ArcadeXpProgress {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(rawTotalXp) ? rawTotalXp : 0));
  const sorted = [...thresholds].sort((a, b) => a.minXp - b.minXp);
  const lastDefined = sorted[sorted.length - 1];

  if (totalXp >= lastDefined.minXp) {
    const extraXp = totalXp - lastDefined.minXp;
    const extraLevels = Math.floor(extraXp / POST_MAX_LEVEL_XP_STEP);
    const currentLevel = lastDefined.level + extraLevels;
    const currentMinXp = lastDefined.minXp + extraLevels * POST_MAX_LEVEL_XP_STEP;
    const nextMinXp = currentMinXp + POST_MAX_LEVEL_XP_STEP;
    const xpIntoLevel = totalXp - currentMinXp;
    const progressPercent = Math.min(
      100,
      Math.round((xpIntoLevel / POST_MAX_LEVEL_XP_STEP) * 100)
    );

    return {
      level: currentLevel,
      title:
        extraLevels === 0
          ? lastDefined.title
          : `${lastDefined.title} +${extraLevels}`,
      totalXp,
      currentLevelMinXp: currentMinXp,
      nextLevel: currentLevel + 1,
      nextLevelTitle: `${lastDefined.title} +${extraLevels + 1}`,
      nextLevelMinXp: nextMinXp,
      xpIntoLevel,
      xpRequiredForNextLevel: POST_MAX_LEVEL_XP_STEP,
      progressPercent,
      isMaxDefinedLevel: true,
    };
  }

  let currentIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (totalXp >= sorted[i].minXp) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const currentDef = sorted[currentIndex];
  const nextDef = sorted[currentIndex + 1] ?? null;
  const xpIntoLevel = totalXp - currentDef.minXp;
  const xpRequiredForNextLevel = nextDef ? nextDef.minXp - currentDef.minXp : 0;
  const progressPercent =
    nextDef && xpRequiredForNextLevel > 0
      ? Math.min(100, Math.round((xpIntoLevel / xpRequiredForNextLevel) * 100))
      : 100;

  return {
    level: currentDef.level,
    title: currentDef.title,
    totalXp,
    currentLevelMinXp: currentDef.minXp,
    nextLevel: nextDef ? nextDef.level : null,
    nextLevelTitle: nextDef ? nextDef.title : null,
    nextLevelMinXp: nextDef ? nextDef.minXp : null,
    xpIntoLevel,
    xpRequiredForNextLevel,
    progressPercent,
    isMaxDefinedLevel: false,
  };
}

export interface XpAwardOutcome {
  progression: PlayerProgressionDoc;
  xpAdded: number;
  wasDuplicate: boolean;
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  newLevelTitle: string;
}

/**
 * Pure, idempotent XP award processor.
 * Guarantees the same `eventId` can never grant XP twice.
 */
export function applyIdempotentXpAward(
  current: PlayerProgressionDoc,
  params: {
    eventId: string;
    xpDelta: number;
    nowMs?: number;
  }
): XpAwardOutcome {
  const nowMs = params.nowMs ?? Date.now();
  const safeDelta = Math.max(0, Math.floor(params.xpDelta));

  if (!params.eventId || current.processedEventIds.includes(params.eventId)) {
    return {
      progression: current,
      xpAdded: 0,
      wasDuplicate: true,
      leveledUp: false,
      previousLevel: current.level,
      newLevel: current.level,
      newLevelTitle: current.levelTitle,
    };
  }

  const prevProgress = calculateArcadeXpProgress(current.totalXp);
  const nextTotalXp = current.totalXp + safeDelta;
  const nextProgress = calculateArcadeXpProgress(nextTotalXp);

  // Keep most recent 500 event IDs in memory/doc (server-side subcollection holds full ledger)
  const nextProcessedIds = [...current.processedEventIds, params.eventId].slice(-500);

  const nextDoc: PlayerProgressionDoc = {
    ...current,
    totalXp: nextTotalXp,
    level: nextProgress.level,
    levelTitle: nextProgress.title,
    processedEventIds: nextProcessedIds,
    updatedAt: nowMs,
  };

  return {
    progression: nextDoc,
    xpAdded: safeDelta,
    wasDuplicate: false,
    leveledUp: nextProgress.level > prevProgress.level,
    previousLevel: prevProgress.level,
    newLevel: nextProgress.level,
    newLevelTitle: nextProgress.title,
  };
}

/**
 * Formats a UTC date key (`YYYY-MM-DD`) for consistent cross-timezone daily activity tracking.
 */
export function getUtcDayKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Reads a player's server-maintained progression document from `users/{uid}/progression/arcade`.
 * Falls back cleanly to an empty Level 1 state when not yet created or offline.
 */
export async function fetchPlayerProgression(uid: string): Promise<PlayerProgressionDoc> {
  if (!uid || !isFirebaseConfigured()) {
    return createEmptyProgression(uid || 'guest');
  }
  try {
    const docData = await fetchDocument<PlayerProgressionDoc>(
      `users/${uid}/${PROGRESSION_SUBCOLLECTION}`,
      PROGRESSION_DOC_ID
    );
    return docData ?? createEmptyProgression(uid);
  } catch {
    return createEmptyProgression(uid);
  }
}

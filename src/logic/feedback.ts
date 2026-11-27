/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../lib/firebase';
import { ensureAnonymousSession } from '../lib/auth';
import type {
  FeedbackActivityEntry,
  FeedbackAffectedArea,
  FeedbackCategory,
  FeedbackFrequency,
  FeedbackPriority,
  FeedbackReportDocument,
  FeedbackStatus,
  FeedbackTechnicalContext,
} from '../types/feedback';

export const FEEDBACK_REPORTS_COLLECTION = 'feedbackReports';
export const FEEDBACK_ACTIVITY_SUBCOLLECTION = 'activity';
export const APP_VERSION = '2.2.0';

export const FEEDBACK_LIMITS = {
  titleMin: 5,
  titleMax: 100,
  descriptionMin: 15,
  descriptionMax: 1500,
  detailFieldMax: 800,
  nicknameMax: 24,
  adminMessageMax: 1200,
} as const;

export const FeedbackSubmissionInputSchema = z.object({
  category: z.enum([
    'bug-report',
    'game-issue',
    'improvement-suggestion',
    'feature-request',
    'general-feedback',
    'performance-issue',
  ]),
  title: z
    .string()
    .trim()
    .min(FEEDBACK_LIMITS.titleMin, `Title must be at least ${FEEDBACK_LIMITS.titleMin} characters.`)
    .max(FEEDBACK_LIMITS.titleMax, `Title cannot exceed ${FEEDBACK_LIMITS.titleMax} characters.`),
  description: z
    .string()
    .trim()
    .min(
      FEEDBACK_LIMITS.descriptionMin,
      `Description must be at least ${FEEDBACK_LIMITS.descriptionMin} characters.`
    )
    .max(
      FEEDBACK_LIMITS.descriptionMax,
      `Description cannot exceed ${FEEDBACK_LIMITS.descriptionMax} characters.`
    ),
  affectedArea: z
    .enum([
      'registration',
      'login',
      'dashboard',
      'player-profile',
      'virtual-arcade-rooms',
      'memory-match',
      'tic-tac-toe',
      'snake',
      'multiplayer',
      'chat-and-reactions',
      'achievements',
      'arcade-leaderboard',
      'other',
    ])
    .default('other'),
  reproductionSteps: z.string().trim().max(FEEDBACK_LIMITS.detailFieldMax).default(''),
  expectedBehaviour: z.string().trim().max(FEEDBACK_LIMITS.detailFieldMax).default(''),
  actualBehaviour: z.string().trim().max(FEEDBACK_LIMITS.detailFieldMax).default(''),
  frequency: z.enum(['always', 'often', 'sometimes', 'once']).nullable().default(null),
  currentExperience: z.string().trim().max(FEEDBACK_LIMITS.detailFieldMax).default(''),
  suggestedImprovement: z.string().trim().max(FEEDBACK_LIMITS.detailFieldMax).default(''),
  anonymousNickname: z.string().trim().max(FEEDBACK_LIMITS.nicknameMax).optional(),
});

export type FeedbackSubmissionInput = z.input<typeof FeedbackSubmissionInputSchema>;

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReportReferenceCode(randomFn: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += REF_ALPHABET[Math.floor(randomFn() * REF_ALPHABET.length)];
  }
  return `PA-${code}`;
}

export function generateAnonymousReporterLabel(
  nickname?: string,
  randomFn: () => number = Math.random
): string {
  const clean = nickname?.trim().slice(0, FEEDBACK_LIMITS.nicknameMax);
  if (clean) return `${clean} (Guest)`;
  let tag = '';
  for (let i = 0; i < 4; i++) {
    tag += REF_ALPHABET[Math.floor(randomFn() * REF_ALPHABET.length)];
  }
  return `Guest-${tag}`;
}

/**
 * Collects strictly non-sensitive technical context to assist reproduction.
 * Never collects passwords, auth tokens, private messages, geolocation, or private invite codes.
 */
export function collectSafeTechnicalContext(params: {
  isRegistered: boolean;
  route: string;
  gameType?: string | null;
  sessionRef?: string | null;
  nowMs?: number;
}): FeedbackTechnicalContext {
  const nowMs = params.nowMs ?? Date.now();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

  let browser = 'Unknown Browser';
  if (/Edg\/([\d.]+)/.test(ua)) browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''}`.trim();
  else if (/Chrome\/([\d.]+)/.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''}`.trim();
  else if (/Firefox\/([\d.]+)/.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''}`.trim();
  else if (/Safari\/([\d.]+)/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight : 720;
  const deviceType: 'desktop' | 'tablet' | 'mobile' =
    width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';

  return {
    submittedAtIso: new Date(nowMs).toISOString(),
    browser,
    os,
    deviceType,
    screenDimensions: `${width}×${height}`,
    appVersion: APP_VERSION,
    route: params.route.split('?')[0] || '/',
    gameType: params.gameType ?? null,
    userType: params.isRegistered ? 'registered' : 'anonymous',
    sessionRef: params.sessionRef ?? null,
  };
}

/**
 * Pure builder for a new FeedbackReportDocument + initial public activity entry.
 * For registered users, identity is sourced strictly from authenticated UID & profile username.
 */
export function buildFeedbackReport(params: {
  input: FeedbackSubmissionInput;
  authenticatedUid: string | null;
  authenticatedProfileUsername: string | null;
  isRegisteredAccount: boolean;
  route: string;
  gameType?: string | null;
  sessionRef?: string | null;
  nowMs?: number;
  randomFn?: () => number;
}): { report: FeedbackReportDocument; initialActivity: FeedbackActivityEntry } {
  const parsed = FeedbackSubmissionInputSchema.parse(params.input);
  const nowMs = params.nowMs ?? Date.now();
  const refCode = generateReportReferenceCode(params.randomFn);
  const reportId = `fb_${refCode.toLowerCase().replace('-', '_')}_${nowMs.toString(36)}`;

  const isAnonymous = !params.isRegisteredAccount;
  const reporterUid = isAnonymous ? params.authenticatedUid : params.authenticatedUid;
  const reporterUsername = isAnonymous
    ? generateAnonymousReporterLabel(parsed.anonymousNickname, params.randomFn)
    : (params.authenticatedProfileUsername || 'Registered Player');

  const affectedGame: 'memory-match' | 'tic-tac-toe' | 'snake' | null =
    parsed.affectedArea === 'memory-match' ||
    parsed.affectedArea === 'tic-tac-toe' ||
    parsed.affectedArea === 'snake'
      ? parsed.affectedArea
      : params.gameType === 'memory-match' ||
          params.gameType === 'tic-tac-toe' ||
          params.gameType === 'snake'
        ? params.gameType
        : null;

  const technicalContext = collectSafeTechnicalContext({
    isRegistered: !isAnonymous,
    route: params.route,
    gameType: affectedGame,
    sessionRef: params.sessionRef,
    nowMs,
  });

  const report: FeedbackReportDocument = {
    reportId,
    referenceCode: refCode,
    reporterUid,
    reporterUsername,
    isAnonymous,
    category: parsed.category as FeedbackCategory,
    title: parsed.title,
    description: parsed.description,
    affectedArea: parsed.affectedArea as FeedbackAffectedArea,
    affectedGame,
    reproductionSteps: parsed.reproductionSteps,
    expectedBehaviour: parsed.expectedBehaviour,
    actualBehaviour: parsed.actualBehaviour,
    frequency: parsed.frequency as FeedbackFrequency | null,
    currentExperience: parsed.currentExperience,
    suggestedImprovement: parsed.suggestedImprovement,
    technicalContext,
    status: 'submitted',
    priority: 'medium',
    createdAt: nowMs,
    updatedAt: nowMs,
    resolvedAt: null,
    assignedAdminUid: null,
    latestPublicResponse: null,
  };

  const initialActivity: FeedbackActivityEntry = {
    activityId: `act_${nowMs.toString(36)}_init`,
    reportId,
    type: 'submitted',
    visibility: 'public',
    authorUid: reporterUid ?? 'anonymous',
    authorLabel: reporterUsername,
    newValue: 'submitted',
    message: 'Report submitted.',
    createdAt: nowMs,
  };

  return { report, initialActivity };
}

/**
 * Submits a validated feedback report to Firestore (`feedbackReports/{reportId}`).
 * Ensures anonymous visitors have an active anonymous Firebase Auth session so security rules
 * can verify rate/schema integrity without requiring registration.
 */
export async function submitFeedbackReport(params: {
  input: FeedbackSubmissionInput;
  authenticatedUid: string | null;
  authenticatedProfileUsername: string | null;
  isRegisteredAccount: boolean;
  route: string;
  gameType?: string | null;
  sessionRef?: string | null;
}): Promise<FeedbackReportDocument> {
  let effectiveUid = params.authenticatedUid;
  if (!effectiveUid && isFirebaseConfigured()) {
    const anonUser = await ensureAnonymousSession();
    effectiveUid = anonUser.uid;
  }

  const { report, initialActivity } = buildFeedbackReport({
    ...params,
    authenticatedUid: effectiveUid,
  });

  if (!isFirebaseConfigured()) {
    return report;
  }

  const db = getFirestoreDb();
  const reportRef = doc(db, FEEDBACK_REPORTS_COLLECTION, report.reportId);
  await setDoc(reportRef, report);

  const actRef = doc(
    db,
    FEEDBACK_REPORTS_COLLECTION,
    report.reportId,
    FEEDBACK_ACTIVITY_SUBCOLLECTION,
    initialActivity.activityId
  );
  await setDoc(actRef, initialActivity).catch(() => {
    // Non-fatal if activity log fails after report is saved
  });

  return report;
}

/**
 * Fetches reports submitted by the currently signed-in registered user (`My Reports`).
 */
export async function fetchMyFeedbackReports(uid: string): Promise<FeedbackReportDocument[]> {
  if (!uid || !isFirebaseConfigured()) return [];
  const db = getFirestoreDb();
  const q = query(
    collection(db, FEEDBACK_REPORTS_COLLECTION),
    where('reporterUid', '==', uid),
    limit(50)
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => d.data() as FeedbackReportDocument);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Fetches public activity entries for a player's own report (never returns internal notes).
 */
export async function fetchPublicReportActivity(
  reportId: string
): Promise<FeedbackActivityEntry[]> {
  if (!reportId || !isFirebaseConfigured()) return [];
  const db = getFirestoreDb();
  const q = query(
    collection(db, FEEDBACK_REPORTS_COLLECTION, reportId, FEEDBACK_ACTIVITY_SUBCOLLECTION),
    where('visibility', '==', 'public'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as FeedbackActivityEntry)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Admin-only: fetches all feedback reports (up to bounded limit).
 */
export async function fetchAllFeedbackReportsAdmin(
  maxDocs = 200
): Promise<FeedbackReportDocument[]> {
  if (!isFirebaseConfigured()) return [];
  const db = getFirestoreDb();
  const q = query(
    collection(db, FEEDBACK_REPORTS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(maxDocs)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as FeedbackReportDocument);
}

/**
 * Admin-only: fetches ALL activity entries (both public responses and private internal notes).
 */
export async function fetchAllReportActivityAdmin(
  reportId: string
): Promise<FeedbackActivityEntry[]> {
  if (!reportId || !isFirebaseConfigured()) return [];
  const db = getFirestoreDb();
  const q = query(
    collection(db, FEEDBACK_REPORTS_COLLECTION, reportId, FEEDBACK_ACTIVITY_SUBCOLLECTION),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as FeedbackActivityEntry)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Admin-only: updates a report's status and/or priority and records a timestamped activity entry.
 */
export async function adminUpdateFeedbackReport(params: {
  report: FeedbackReportDocument;
  adminUid: string;
  adminLabel: string;
  nextStatus?: FeedbackStatus;
  nextPriority?: FeedbackPriority;
}): Promise<FeedbackReportDocument> {
  const nowMs = Date.now();
  const nextStatus = params.nextStatus ?? params.report.status;
  const nextPriority = params.nextPriority ?? params.report.priority;
  const resolvedAt =
    nextStatus === 'resolved' || nextStatus === 'closed'
      ? params.report.resolvedAt ?? nowMs
      : null;

  const updated: FeedbackReportDocument = {
    ...params.report,
    status: nextStatus,
    priority: nextPriority,
    assignedAdminUid: params.adminUid,
    resolvedAt,
    updatedAt: nowMs,
  };

  if (!isFirebaseConfigured()) return updated;

  const db = getFirestoreDb();
  await updateDoc(doc(db, FEEDBACK_REPORTS_COLLECTION, params.report.reportId), {
    status: nextStatus,
    priority: nextPriority,
    assignedAdminUid: params.adminUid,
    resolvedAt,
    updatedAt: nowMs,
  });

  if (nextStatus !== params.report.status) {
    const act: FeedbackActivityEntry = {
      activityId: `act_${nowMs.toString(36)}_status`,
      reportId: params.report.reportId,
      type: 'status-change',
      visibility: 'public',
      authorUid: params.adminUid,
      authorLabel: params.adminLabel,
      previousValue: params.report.status,
      newValue: nextStatus,
      message: `Status changed from ${params.report.status} to ${nextStatus}.`,
      createdAt: nowMs,
    };
    await setDoc(
      doc(
        db,
        FEEDBACK_REPORTS_COLLECTION,
        params.report.reportId,
        FEEDBACK_ACTIVITY_SUBCOLLECTION,
        act.activityId
      ),
      act
    );
  }

  if (nextPriority !== params.report.priority) {
    const act: FeedbackActivityEntry = {
      activityId: `act_${(nowMs + 1).toString(36)}_prio`,
      reportId: params.report.reportId,
      type: 'priority-change',
      visibility: 'internal',
      authorUid: params.adminUid,
      authorLabel: params.adminLabel,
      previousValue: params.report.priority,
      newValue: nextPriority,
      message: `Priority set to ${nextPriority}.`,
      createdAt: nowMs + 1,
    };
    await setDoc(
      doc(
        db,
        FEEDBACK_REPORTS_COLLECTION,
        params.report.reportId,
        FEEDBACK_ACTIVITY_SUBCOLLECTION,
        act.activityId
      ),
      act
    );
  }

  return updated;
}

/**
 * Admin-only: posts either a PUBLIC response (visible in player's My Reports)
 * or a PRIVATE internal note (strictly restricted to verified administrators).
 */
export async function adminPostReportNoteOrResponse(params: {
  report: FeedbackReportDocument;
  adminUid: string;
  adminLabel: string;
  visibility: 'public' | 'internal';
  message: string;
}): Promise<{ activity: FeedbackActivityEntry; updatedReport: FeedbackReportDocument }> {
  const cleanMessage = params.message.trim().slice(0, FEEDBACK_LIMITS.adminMessageMax);
  if (!cleanMessage) {
    throw new Error('Please enter a message before posting.');
  }
  const nowMs = Date.now();
  const activity: FeedbackActivityEntry = {
    activityId: `act_${nowMs.toString(36)}_${params.visibility}`,
    reportId: params.report.reportId,
    type: params.visibility === 'public' ? 'public-response' : 'internal-note',
    visibility: params.visibility,
    authorUid: params.adminUid,
    authorLabel: params.adminLabel,
    message: cleanMessage,
    createdAt: nowMs,
  };

  const updatedReport: FeedbackReportDocument = {
    ...params.report,
    updatedAt: nowMs,
    assignedAdminUid: params.adminUid,
    latestPublicResponse:
      params.visibility === 'public'
        ? { message: cleanMessage, respondedAt: nowMs, adminUid: params.adminUid }
        : params.report.latestPublicResponse,
  };

  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    await setDoc(
      doc(
        db,
        FEEDBACK_REPORTS_COLLECTION,
        params.report.reportId,
        FEEDBACK_ACTIVITY_SUBCOLLECTION,
        activity.activityId
      ),
      activity
    );

    if (params.visibility === 'public') {
      await updateDoc(doc(db, FEEDBACK_REPORTS_COLLECTION, params.report.reportId), {
        latestPublicResponse: updatedReport.latestPublicResponse,
        assignedAdminUid: params.adminUid,
        updatedAt: nowMs,
      });
    } else {
      await updateDoc(doc(db, FEEDBACK_REPORTS_COLLECTION, params.report.reportId), {
        updatedAt: nowMs,
      });
    }
  }

  return { activity, updatedReport };
}

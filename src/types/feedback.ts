/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FeedbackCategory =
  | 'bug-report'
  | 'game-issue'
  | 'improvement-suggestion'
  | 'feature-request'
  | 'general-feedback'
  | 'performance-issue';

export type FeedbackAffectedArea =
  | 'registration'
  | 'login'
  | 'dashboard'
  | 'player-profile'
  | 'virtual-arcade-rooms'
  | 'memory-match'
  | 'tic-tac-toe'
  | 'snake'
  | 'multiplayer'
  | 'chat-and-reactions'
  | 'achievements'
  | 'arcade-leaderboard'
  | 'other';

export type FeedbackFrequency = 'always' | 'often' | 'sometimes' | 'once';

export type FeedbackStatus =
  | 'submitted'
  | 'under-review'
  | 'in-progress'
  | 'resolved'
  | 'closed';

export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';

export type FeedbackActivityVisibility = 'public' | 'internal';

export type FeedbackActivityType =
  | 'submitted'
  | 'status-change'
  | 'priority-change'
  | 'public-response'
  | 'internal-note';

export interface FeedbackTechnicalContext {
  submittedAtIso: string;
  browser: string;
  os: string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
  screenDimensions: string;
  appVersion: string;
  route: string;
  gameType: string | null;
  userType: 'registered' | 'anonymous';
  sessionRef: string | null;
}

export interface FeedbackPublicResponseSummary {
  message: string;
  respondedAt: number;
  adminUid: string;
}

/**
 * Stored in Firestore at `feedbackReports/{reportId}`.
 */
export interface FeedbackReportDocument {
  reportId: string;
  referenceCode: string; // Human-friendly reference e.g. PA-7K2M9Q
  reporterUid: string | null;
  reporterUsername: string;
  isAnonymous: boolean;
  category: FeedbackCategory;
  title: string;
  description: string;
  affectedArea: FeedbackAffectedArea;
  affectedGame: 'memory-match' | 'tic-tac-toe' | 'snake' | null;
  reproductionSteps: string;
  expectedBehaviour: string;
  actualBehaviour: string;
  frequency: FeedbackFrequency | null;
  currentExperience: string;
  suggestedImprovement: string;
  technicalContext: FeedbackTechnicalContext;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  assignedAdminUid: string | null;
  latestPublicResponse: FeedbackPublicResponseSummary | null;
}

/**
 * Stored in Firestore at `feedbackReports/{reportId}/activity/{activityId}`.
 */
export interface FeedbackActivityEntry {
  activityId: string;
  reportId: string;
  type: FeedbackActivityType;
  visibility: FeedbackActivityVisibility;
  authorUid: string;
  authorLabel: string;
  previousValue?: string | null;
  newValue?: string | null;
  message?: string | null;
  createdAt: number;
}

export const FEEDBACK_CATEGORIES: ReadonlyArray<{
  id: FeedbackCategory;
  label: string;
  shortDesc: string;
  group: 'bug' | 'improvement' | 'general';
}> = [
  { id: 'bug-report', label: 'Bug Report', shortDesc: 'Something is broken or behaving unexpectedly', group: 'bug' },
  { id: 'game-issue', label: 'Game Issue', shortDesc: 'Problem inside Memory Match, Tic-Tac-Toe, or Snake', group: 'bug' },
  { id: 'improvement-suggestion', label: 'Improvement Suggestion', shortDesc: 'Make an existing feature better', group: 'improvement' },
  { id: 'feature-request', label: 'Feature Request', shortDesc: 'Suggest a new game or platform feature', group: 'improvement' },
  { id: 'general-feedback', label: 'General Feedback', shortDesc: 'Share thoughts about your arcade experience', group: 'general' },
  { id: 'performance-issue', label: 'Performance Issue', shortDesc: 'Lag, slow loading, or visual stutter', group: 'bug' },
];

export const FEEDBACK_AFFECTED_AREAS: ReadonlyArray<{
  id: FeedbackAffectedArea;
  label: string;
}> = [
  { id: 'registration', label: 'Registration' },
  { id: 'login', label: 'Login' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'player-profile', label: 'Player Profile' },
  { id: 'virtual-arcade-rooms', label: 'Virtual Arcade Rooms' },
  { id: 'memory-match', label: 'Memory Match' },
  { id: 'tic-tac-toe', label: 'Tic-Tac-Toe' },
  { id: 'snake', label: 'Snake' },
  { id: 'multiplayer', label: 'Multiplayer' },
  { id: 'chat-and-reactions', label: 'Chat and Reactions' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'arcade-leaderboard', label: 'Arcade Leaderboard' },
  { id: 'other', label: 'Other' },
];

export const FEEDBACK_STATUS_LABELS: Readonly<Record<FeedbackStatus, string>> = {
  submitted: 'Submitted',
  'under-review': 'Under Review',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const FEEDBACK_PRIORITY_LABELS: Readonly<Record<FeedbackPriority, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

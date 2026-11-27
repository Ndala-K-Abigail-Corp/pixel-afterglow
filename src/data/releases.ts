/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReleaseItemCategory = 'New Feature' | 'Improvement' | 'Fix' | 'Security';

export interface ReleaseHighlight {
  category: ReleaseItemCategory;
  title: string;
  details: string[];
}

export interface ArcadeRelease {
  id: string;
  version: string;
  title: string;
  publishedAt: string; // YYYY-MM-DD
  published: boolean;
  intro: string;
  highlights: ReleaseHighlight[];
}

/**
 * Structured Pixel Afterglow release announcements.
 * Only entries with `published: true` are visible to players.
 */
export const ARCADE_RELEASES: readonly ArcadeRelease[] = [
  {
    id: 'release-2026-11-snake-arcade',
    version: 'v2.2',
    title: 'Neon Snake, Virtual Arcade Rooms & Public Leaderboards',
    publishedAt: '2026-11-27',
    published: true,
    intro:
      'Welcome to one of our biggest arcade updates yet — Neon Snake is now playable in solo and 2–10 player online arenas, alongside smoother multiplayer rooms and public leaderboards.',
    highlights: [
      {
        category: 'New Feature',
        title: 'Neon Snake (Single-Player & 2–10P Online)',
        details: [
          'Play solo with independent Speed (Slow, Fast, Flash) and Difficulty (Easy, Hard, Difficult) settings.',
          'Battle up to 10 friends in a shared multiplayer arena with edge wraparound and larger-eats-smaller snake mechanics.',
          'Unlock 13 brand-new Snake achievements and climb the Snake multiplayer leaderboard.',
        ],
      },
      {
        category: 'New Feature',
        title: 'Public Arcade Leaderboard & Optional Profile Sharing',
        details: [
          'Anyone can now browse Global, Country, Weekly, Monthly, and All-Time multiplayer rankings without signing in.',
          'Registered players can optionally share Personal Bests and Achievement Summaries from My Profile (private by default).',
        ],
      },
      {
        category: 'Improvement',
        title: 'Universal Waiting Room & Cleaner Chat',
        details: [
          'After every multiplayer round across Memory Match, Tic-Tac-Toe, and Snake, players return to the waiting room so new friends can join and ready up.',
          'Upgraded room chat typography, larger launcher button, and paginated Achievements (12 per page).',
        ],
      },
      {
        category: 'Fix',
        title: 'Room Creation, Snake Sessions & Visual Country Flags',
        details: [
          'Simplified Virtual Arcade Room creation to just Room Name and Access Setting.',
          'Fixed Snake session validation and upgraded country badges to display crisp visual flags across Windows and all browsers.',
        ],
      },
    ],
  },
  {
    id: 'release-2026-10-personal-arcade',
    version: 'v2.1',
    title: 'Arcade Home, XP Levels & Pixel Reactions',
    publishedAt: '2026-10-15',
    published: true,
    intro:
      'Introducing your personal Arcade Home dashboard, Arcade XP progression across 10 retro ranks, and custom pixel-art reactions.',
    highlights: [
      {
        category: 'New Feature',
        title: 'Personal Arcade Dashboard & XP Ranks',
        details: [
          'Track your Arcade Level from New Challenger all the way to Legend of the Arcade.',
          'Create persistent Virtual Arcade Rooms that stay saved across visits.',
        ],
      },
      {
        category: 'Security',
        title: 'Server-Protected Competitive Integrity',
        details: [
          'Verified multiplayer wins, XP, and achievements are protected against unauthorised tampering.',
        ],
      },
    ],
  },
] as const;

export function getPublishedReleases(): ArcadeRelease[] {
  return ARCADE_RELEASES.filter((r) => r.published);
}

export function getLatestPublishedRelease(): ArcadeRelease | null {
  const published = getPublishedReleases();
  return published[0] ?? null;
}

const RELEASE_ACK_KEY_PREFIX = 'pixel_afterglow_seen_release_v1_';

function getStorageKey(uid: string | null): string {
  return `${RELEASE_ACK_KEY_PREFIX}${uid || 'guest'}`;
}

export function getAcknowledgedReleaseId(uid: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(getStorageKey(uid));
  } catch {
    return null;
  }
}

export function hasUnreadRelease(uid: string | null): boolean {
  const latest = getLatestPublishedRelease();
  if (!latest) return false;
  return getAcknowledgedReleaseId(uid) !== latest.id;
}

export function acknowledgeLatestRelease(uid: string | null): void {
  const latest = getLatestPublishedRelease();
  if (!latest || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(uid), latest.id);
  } catch {
    // Ignore storage quota errors
  }
}

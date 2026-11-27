/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  Home,
  Gamepad2,
  DoorOpen,
  Trophy,
  Award,
  UserCircle2,
  Sparkles,
  MessageSquarePlus,
  FileText,
  Shield,
} from 'lucide-react';
import type { DashboardSection } from '../../types/arcadePlatform';

export interface DashboardNavItem {
  id: DashboardSection;
  label: string;
  mobileLabel: string;
  icon: React.FC<{ className?: string }>;
}

/**
 * Single source of truth for dashboard navigation entries, shared by the
 * desktop/tablet sidebar and the mobile bottom bar + "More" drawer.
 */
const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { id: 'arcade-home', label: 'Home', mobileLabel: 'Home', icon: Home },
  { id: 'games', label: 'Games', mobileLabel: 'Games', icon: Gamepad2 },
  { id: 'my-rooms', label: 'My Rooms', mobileLabel: 'Rooms', icon: DoorOpen },
  { id: 'leaderboards', label: 'Arcade Leaderboard', mobileLabel: 'Rankings', icon: Trophy },
  { id: 'achievements', label: 'Achievements', mobileLabel: 'Achievements', icon: Award },
  { id: 'whats-new', label: "What's New", mobileLabel: "What's New", icon: Sparkles },
  { id: 'feedback', label: 'Feedback', mobileLabel: 'Feedback', icon: MessageSquarePlus },
  { id: 'my-reports', label: 'My Reports', mobileLabel: 'My Reports', icon: FileText },
  { id: 'my-profile', label: 'My Profile', mobileLabel: 'Profile', icon: UserCircle2 },
];

const ADMIN_NAV_ITEM: DashboardNavItem = {
  id: 'admin',
  label: 'Admin Dashboard',
  mobileLabel: 'Admin',
  icon: Shield,
};

/** Admin entry is appended ONLY for verified administrators (custom claim). */
export function getDashboardNavItems(isAdmin: boolean): DashboardNavItem[] {
  return isAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;
}

/** Sections pinned to the compact mobile bottom bar; the rest live in "More". */
export const MOBILE_BAR_SECTION_IDS: DashboardSection[] = [
  'arcade-home',
  'games',
  'my-rooms',
  'leaderboards',
];

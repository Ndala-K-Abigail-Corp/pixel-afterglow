/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sparkles, X } from 'lucide-react';
import type { ArcadeXpProgress } from '../../types/arcadePlatform';

interface ArcadeXpBarProps {
  progress: ArcadeXpProgress;
  compact?: boolean;
}

export const ArcadeXpBar: React.FC<ArcadeXpBarProps> = ({ progress, compact = false }) => {
  const xpRemaining = Math.max(0, progress.xpRequiredForNextLevel - progress.xpIntoLevel);

  return (
    <div
      className={`${
        compact ? 'space-y-1.5' : 'p-3.5 rounded-xl bg-[#171329]/90 border border-[#3D345F] space-y-2'
      }`}
      data-testid="arcade-xp-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFC66D]/15 border border-[#FFC66D]/60 text-[#FFC66D] font-['Press_Start_2P'] text-[9px] shrink-0"
            data-testid="arcade-level-badge"
          >
            LVL {progress.level}
          </span>
          <span
            className="text-xs sm:text-sm font-bold text-[#FFF0D7] truncate"
            data-testid="arcade-level-title"
          >
            {progress.title}
          </span>
        </div>
        <span
          className="text-[11px] sm:text-xs font-mono text-[#56E0CB] shrink-0"
          data-testid="arcade-total-xp"
        >
          {progress.totalXp.toLocaleString()} XP
        </span>
      </div>

      <div
        className="w-full h-2.5 rounded-full bg-[#292342] border border-[#3D345F] overflow-hidden"
        role="progressbar"
        aria-valuenow={progress.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${progress.level} XP progress`}
      >
        <div
          className="h-full bg-[#56E0CB] transition-all duration-500 ease-out"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>

      {!compact && progress.nextLevel && progress.nextLevelTitle && (
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#FFF0D7]/70">
          <span>
            {xpRemaining.toLocaleString()} XP to Level {progress.nextLevel}
          </span>
          <span className="text-[#FFC66D]/90">
            Next: {progress.nextLevelTitle}
          </span>
        </div>
      )}
    </div>
  );
};

interface LevelUpBannerProps {
  level: number;
  title: string;
  onDismiss: () => void;
}

/**
 * Subtle, non-blocking level-up toast notification (never interrupts active multiplayer play).
 */
export const LevelUpBanner: React.FC<LevelUpBannerProps> = ({ level, title, onDismiss }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="arcade-level-up-banner"
      className="fixed bottom-20 lg:bottom-6 right-4 z-50 max-w-xs w-[calc(100vw-2rem)] p-3.5 rounded-xl bg-[#201A36] border-2 border-[#FFC66D] shadow-xl flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-lg bg-[#FFC66D]/15 border border-[#FFC66D] flex items-center justify-center shrink-0 text-[#FFC66D]">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-['Press_Start_2P'] text-[9px] text-[#FFC66D] uppercase">
          Level Up!
        </p>
        <p className="text-xs font-bold text-[#FFF0D7] mt-1">
          Level {level} — {title}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss level up notice"
        className="text-[#FFF0D7]/60 hover:text-[#FFF0D7] p-0.5 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

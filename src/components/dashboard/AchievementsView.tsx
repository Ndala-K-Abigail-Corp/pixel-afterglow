/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Award, CheckCircle2, Lock, Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  AchievementCategory,
  EvaluatedAchievement,
} from '../../types/arcadePlatform';
import { AchievementBadgeIcon } from './AchievementBadgeIcon';
import { useAudio } from '../../context/AudioContext';

interface AchievementsViewProps {
  achievements: EvaluatedAchievement[];
}

type StatusFilter = 'all' | 'unlocked' | 'in-progress' | 'locked';

export const ACHIEVEMENTS_PAGE_SIZE = 12;

const CATEGORY_TABS: Array<{ id: 'all' | AchievementCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'platform', label: 'Platform' },
  { id: 'memory-match', label: 'Memory Match' },
  { id: 'tic-tac-toe', label: 'Tic-Tac-Toe' },
  { id: 'snake', label: 'Snake' },
];

export const AchievementsView: React.FC<AchievementsViewProps> = ({ achievements }) => {
  const { playClick } = useAudio();
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selected, setSelected] = useState<EvaluatedAchievement | null>(null);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter]);

  const unlockedCount = useMemo(
    () => achievements.filter((a) => a.unlocked).length,
    [achievements]
  );

  const totalXpEarned = useMemo(
    () =>
      achievements
        .filter((a) => a.unlocked)
        .reduce((sum, a) => sum + a.definition.xpReward, 0),
    [achievements]
  );

  const filtered = useMemo(() => {
    return achievements.filter((item) => {
      if (categoryFilter !== 'all' && item.definition.category !== categoryFilter) {
        return false;
      }
      if (statusFilter === 'unlocked' && !item.unlocked) return false;
      if (statusFilter === 'in-progress' && (item.unlocked || item.progress <= 0)) return false;
      if (statusFilter === 'locked' && (item.unlocked || item.progress > 0)) return false;
      return true;
    });
  }, [achievements, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ACHIEVEMENTS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * ACHIEVEMENTS_PAGE_SIZE;
    return filtered.slice(start, start + ACHIEVEMENTS_PAGE_SIZE);
  }, [filtered, safePage]);

  return (
    <div
      className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5"
      data-testid="dashboard-achievements-view"
    >
      {/* Header & Summary */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border-2 border-[#3D345F] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#FFC66D] flex items-center gap-2">
            <Award className="w-5 h-5 shrink-0" />
            <span>ACHIEVEMENTS</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/70 mt-1.5">
            Collect pixel-art arcade badges through validated gameplay milestones and earn bonus Arcade XP.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="px-3.5 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-center">
            <p className="text-[10px] uppercase text-[#FFF0D7]/60">Unlocked</p>
            <p className="text-sm font-bold text-[#56E0CB]" data-testid="achievements-unlocked-count">
              {unlockedCount} / {achievements.length}
            </p>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-center">
            <p className="text-[10px] uppercase text-[#FFF0D7]/60">Badge XP</p>
            <p className="text-sm font-bold text-[#FFC66D]">+{totalXpEarned} XP</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Achievement categories">
          {CATEGORY_TABS.map((tab) => {
            const active = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  playClick();
                  setCategoryFilter(tab.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#56E0CB]/20 text-[#56E0CB] border-[#56E0CB]'
                    : 'bg-[#201A36] text-[#FFF0D7]/75 border-[#3D345F] hover:text-[#FFF0D7]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'unlocked', label: 'Unlocked' },
              { id: 'in-progress', label: 'In Progress' },
              { id: 'locked', label: 'Locked' },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                playClick();
                setStatusFilter(st.id);
              }}
              data-testid={`achievements-status-${st.id}`}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-[#FFC66D]/20 text-[#FFC66D] border-[#FFC66D]'
                  : 'bg-[#201A36] text-[#FFF0D7]/70 border-[#3D345F]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Badge Grid (12 per page) */}
      {paginated.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center text-xs text-[#FFF0D7]/70">
          No achievements match the selected filter yet. Keep playing to unlock badges!
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {paginated.map((item) => (
            <button
              key={item.definition.id}
              type="button"
              onClick={() => {
                playClick();
                setSelected(item);
              }}
              data-testid={`achievement-card-${item.definition.id}`}
              className={`text-left p-4 rounded-2xl border-2 transition-colors flex flex-col justify-between gap-3 cursor-pointer ${
                item.unlocked
                  ? 'bg-[#201A36] border-[#FFC66D]/60 hover:border-[#FFC66D]'
                  : 'bg-[#1B1630] border-[#2E264A] hover:border-[#3D345F]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 shrink-0 ${
                    item.unlocked
                      ? 'bg-[#171329] border-[#FFC66D]/70'
                      : 'bg-[#171329]/70 border-[#3D345F]'
                  }`}
                >
                  <AchievementBadgeIcon
                    artworkId={item.definition.artworkId}
                    unlocked={item.unlocked}
                    accentColor={item.definition.accentColor}
                    size="md"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <h3 className="text-sm font-bold text-[#FFF0D7] truncate">
                      {item.definition.name}
                    </h3>
                    {item.unlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-[#56E0CB] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#FFF0D7]/40 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-[#FFF0D7]/70 mt-1 line-clamp-2">
                    {item.definition.description}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#FFF0D7]/65">
                    Progress: {item.progress}/{item.target}
                  </span>
                  <span className="font-mono text-[#FFC66D] inline-flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" />+{item.definition.xpReward} XP
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#171329] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      item.unlocked ? 'bg-[#FFC66D]' : 'bg-[#56E0CB]/70'
                    }`}
                    style={{ width: `${item.progressPercent}%` }}
                  />
                </div>
              </div>
            </button>
          ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <nav
              aria-label="Achievements pagination"
              data-testid="achievements-pagination"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-xs"
            >
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => {
                  playClick();
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                data-testid="achievements-prev-page"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#171329] border border-[#3D345F] hover:border-[#56E0CB] text-[#FFF0D7] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="font-mono text-[#FFC66D]" data-testid="achievements-page-indicator">
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => {
                  playClick();
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                }}
                data-testid="achievements-next-page"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#171329] border border-[#3D345F] hover:border-[#56E0CB] text-[#FFF0D7] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          )}
        </div>
      )}

      {/* Achievement Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={selected.definition.name}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md p-5 rounded-2xl bg-[#201A36] border-2 border-[#FFC66D]/70 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-[#171329] border-2 border-[#FFC66D]/70 flex items-center justify-center">
                  <AchievementBadgeIcon
                    artworkId={selected.definition.artworkId}
                    unlocked={selected.unlocked}
                    accentColor={selected.definition.accentColor}
                    size="lg"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#56E0CB]">
                    {selected.definition.category}
                  </span>
                  <h2 className="text-base font-bold text-[#FFF0D7]">
                    {selected.definition.name}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close achievement details"
                className="p-1 text-[#FFF0D7]/60 hover:text-[#FFF0D7] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#FFF0D7]/80 leading-relaxed">
              {selected.definition.description}
            </p>

            <div className="p-3 rounded-xl bg-[#171329] border border-[#3D345F] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#FFF0D7]/65">Status</span>
                <span className={selected.unlocked ? 'text-[#56E0CB] font-bold' : 'text-[#FFC66D]'}>
                  {selected.unlocked ? 'Unlocked' : 'Locked'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#FFF0D7]/65">Progress</span>
                <span className="text-[#FFF0D7] font-mono">
                  {selected.progress} / {selected.target}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#FFF0D7]/65">Reward</span>
                <span className="text-[#FFC66D] font-mono">+{selected.definition.xpReward} XP</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

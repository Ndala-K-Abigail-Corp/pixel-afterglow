/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  Search,
  Loader2,
  Lock,
  MessageSquare,
  Send,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import {
  adminPostReportNoteOrResponse,
  adminUpdateFeedbackReport,
  fetchAllFeedbackReportsAdmin,
  fetchAllReportActivityAdmin,
} from '../../logic/feedback';
import {
  FEEDBACK_AFFECTED_AREAS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackActivityEntry,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackReportDocument,
  type FeedbackStatus,
} from '../../types/feedback';
import { formatUserError } from '../../utils/userErrorFormatter';

export interface AdminDashboardViewProps {
  /** Optional preloaded reports for deterministic tests */
  initialReports?: FeedbackReportDocument[];
  /** Optional override for unit testing admin view */
  forceIsAdmin?: boolean;
}

const ADMIN_PAGE_SIZE = 10;

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  initialReports,
  forceIsAdmin,
}) => {
  const { uid, profile, isAdmin: authIsAdmin, refreshAdminClaim } = useAuth();
  const { playClick } = useAudio();
  const isAdmin = forceIsAdmin ?? authIsAdmin;

  // Force-refresh Firebase Auth ID token on Admin Dashboard mount so revoked claims fail closed
  useEffect(() => {
    if (forceIsAdmin !== undefined || initialReports || typeof refreshAdminClaim !== 'function') {
      return;
    }
    void refreshAdminClaim();
  }, [forceIsAdmin, initialReports, refreshAdminClaim]);

  const [reports, setReports] = useState<FeedbackReportDocument[]>(initialReports ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialReports && isAdmin);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FeedbackCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | FeedbackPriority>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Selected Report Inspector
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<FeedbackActivityEntry[]>([]);
  const [noteVisibility, setNoteVisibility] = useState<'public' | 'internal'>('public');
  const [noteText, setNoteText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!isAdmin || initialReports) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);
    void fetchAllFeedbackReportsAdmin(200)
      .then((items) => {
        if (!cancelled) setReports(items);
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(formatUserError(err, 'Unable to load reports.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, initialReports]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.reportId === selectedId) ?? null,
    [reports, selectedId]
  );

  useEffect(() => {
    if (!selectedId || !isAdmin) {
      setActivity([]);
      return;
    }
    let cancelled = false;
    void fetchAllReportActivityAdmin(selectedId).then((entries) => {
      if (!cancelled) setActivity(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, isAdmin]);

  const stats = useMemo(() => {
    const counts = {
      total: reports.length,
      submitted: 0,
      'under-review': 0,
      'in-progress': 0,
      resolved: 0,
      closed: 0,
    };
    for (const r of reports) {
      counts[r.status] += 1;
    }
    return counts;
  }, [reports]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
      if (areaFilter !== 'all' && r.affectedArea !== areaFilter) return false;
      if (q) {
        const hay = `${r.referenceCode} ${r.title} ${r.reporterUsername} ${r.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, searchQuery, categoryFilter, statusFilter, priorityFilter, areaFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedReports = filtered.slice(
    (safePage - 1) * ADMIN_PAGE_SIZE,
    safePage * ADMIN_PAGE_SIZE
  );

  if (!isAdmin) {
    return (
      <div
        className="max-w-xl mx-auto px-4 py-12 text-center space-y-3"
        data-testid="admin-access-denied"
      >
        <Lock className="w-10 h-10 text-[#FF776E] mx-auto" />
        <h1 className="font-['Press_Start_2P'] text-sm text-[#FF776E]">
          ADMINISTRATOR ACCESS REQUIRED
        </h1>
        <p className="text-xs sm:text-sm text-[#FFF0D7]/75">
          This dashboard is restricted to verified Pixel Afterglow administrators.
        </p>
      </div>
    );
  }

  const handleUpdateStatusOrPriority = async (
    nextStatus?: FeedbackStatus,
    nextPriority?: FeedbackPriority
  ) => {
    if (!selectedReport || isUpdating) return;
    playClick();
    setIsUpdating(true);
    setErrorMsg(null);
    try {
      const updated = await adminUpdateFeedbackReport({
        report: selectedReport,
        adminUid: uid ?? 'admin',
        adminLabel: profile?.username ?? 'Admin',
        nextStatus,
        nextPriority,
      });
      setReports((prev) =>
        prev.map((r) => (r.reportId === updated.reportId ? updated : r))
      );
      const nextAct = await fetchAllReportActivityAdmin(updated.reportId);
      setActivity(nextAct);
    } catch (err) {
      setErrorMsg(formatUserError(err, 'Failed to update report.'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport || !noteText.trim() || isUpdating) return;
    playClick();
    setIsUpdating(true);
    setErrorMsg(null);
    try {
      const { activity: createdAct, updatedReport } = await adminPostReportNoteOrResponse({
        report: selectedReport,
        adminUid: uid ?? 'admin',
        adminLabel: profile?.username ?? 'Admin',
        visibility: noteVisibility,
        message: noteText,
      });
      setReports((prev) =>
        prev.map((r) => (r.reportId === updatedReport.reportId ? updatedReport : r))
      );
      setActivity((prev) => [...prev, createdAct]);
      setNoteText('');
    } catch (err) {
      setErrorMsg(formatUserError(err, 'Failed to post note.'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5"
      data-testid="admin-dashboard-view"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#FFC66D] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#56E0CB] shrink-0" />
            <span>ADMIN DASHBOARD</span>
          </h1>
          <p className="text-xs text-[#FFF0D7]/70 mt-1">
            Review player bug reports, manage priorities, add internal notes, and send public responses.
          </p>
        </div>
      </div>

      {/* Overview Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center">
        {(
          [
            { label: 'Total', value: stats.total, color: 'text-[#FFF0D7]' },
            { label: 'Submitted', value: stats.submitted, color: 'text-[#FF776E]' },
            { label: 'Under Review', value: stats['under-review'], color: 'text-[#C4B5FD]' },
            { label: 'In Progress', value: stats['in-progress'], color: 'text-[#FFC66D]' },
            { label: 'Resolved', value: stats.resolved, color: 'text-[#56E0CB]' },
            { label: 'Closed', value: stats.closed, color: 'text-[#FFF0D7]/60' },
          ] as const
        ).map((s) => (
          <div
            key={s.label}
            className="p-3 rounded-xl bg-[#201A36] border border-[#3D345F]"
          >
            <p className="text-[10px] uppercase text-[#FFF0D7]/60">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-3.5 rounded-2xl bg-[#201A36] border border-[#3D345F] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#56E0CB] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search ref, title, user…"
            data-testid="admin-search-input"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-[#FFF0D7] outline-none focus:border-[#56E0CB]"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value as 'all' | FeedbackCategory);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-[#FFF0D7]"
        >
          <option value="all">All Categories</option>
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as 'all' | FeedbackStatus);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-[#FFF0D7]"
        >
          <option value="all">All Statuses</option>
          {Object.entries(FEEDBACK_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value as 'all' | FeedbackPriority);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-[#FFF0D7]"
        >
          <option value="all">All Priorities</option>
          {Object.entries(FEEDBACK_PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={areaFilter}
          onChange={(e) => {
            setAreaFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-[#FFF0D7]"
        >
          <option value="all">All Areas</option>
          {FEEDBACK_AFFECTED_AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reports Table + Selected Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#201A36] border border-[#3D345F] overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#56E0CB]" />
            </div>
          ) : pagedReports.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#FFF0D7]/65">
              No reports match the current filters.
            </div>
          ) : (
            <div className="divide-y divide-[#2E264A]">
              {pagedReports.map((rep) => (
                <button
                  key={rep.reportId}
                  type="button"
                  onClick={() => {
                    playClick();
                    setSelectedId(rep.reportId);
                  }}
                  data-testid={`admin-report-row-${rep.referenceCode}`}
                  className={`w-full p-3.5 text-left flex items-center justify-between gap-3 hover:bg-[#241E3D] cursor-pointer ${
                    selectedId === rep.reportId ? 'bg-[#292342]' : ''
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="font-mono font-bold text-[#FFC66D]">
                        {rep.referenceCode}
                      </span>
                      <span className="text-[#56E0CB] font-semibold">
                        {FEEDBACK_STATUS_LABELS[rep.status]}
                      </span>
                      <span className="text-[#FFF0D7]/60">
                        · {FEEDBACK_PRIORITY_LABELS[rep.priority]}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-[#FFF0D7] truncate">
                      {rep.title}
                    </p>
                    <p className="text-[11px] text-[#FFF0D7]/60">
                      {rep.reporterUsername} {rep.isAnonymous ? '(Anonymous)' : ''} ·{' '}
                      {new Date(rep.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#171329] border-t border-[#2E264A] text-xs">
              <span className="text-[#FFF0D7]/65">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg bg-[#201A36] border border-[#3D345F] disabled:opacity-40 cursor-pointer"
                  aria-label="Previous reports page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg bg-[#201A36] border border-[#3D345F] disabled:opacity-40 cursor-pointer"
                  aria-label="Next reports page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Report Detail Inspector */}
        <div className="lg:col-span-5 rounded-2xl bg-[#201A36] border border-[#3D345F] p-4 space-y-4">
          {!selectedReport ? (
            <p className="text-xs text-[#FFF0D7]/60 text-center py-10">
              Select a report to view details, technical context, internal notes, and send a public response.
            </p>
          ) : (
            <div className="space-y-4 text-xs" data-testid="admin-report-detail">
              <div>
                <p className="font-mono text-[#FFC66D] font-bold">
                  {selectedReport.referenceCode}
                </p>
                <h2 className="text-sm font-bold text-[#FFF0D7] mt-0.5">
                  {selectedReport.title}
                </h2>
                <p className="text-[11px] text-[#FFF0D7]/65 mt-0.5">
                  By {selectedReport.reporterUsername} · Area: {selectedReport.affectedArea}
                </p>
              </div>

              {/* Status & Priority Controls */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase text-[#FFF0D7]/60 mb-1">
                    Status
                  </label>
                  <select
                    value={selectedReport.status}
                    disabled={isUpdating}
                    onChange={(e) =>
                      void handleUpdateStatusOrPriority(e.target.value as FeedbackStatus, undefined)
                    }
                    data-testid="admin-status-select"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#171329] border border-[#3D345F] text-[#FFF0D7]"
                  >
                    {Object.entries(FEEDBACK_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[#FFF0D7]/60 mb-1">
                    Priority
                  </label>
                  <select
                    value={selectedReport.priority}
                    disabled={isUpdating}
                    onChange={(e) =>
                      void handleUpdateStatusOrPriority(
                        undefined,
                        e.target.value as FeedbackPriority
                      )
                    }
                    data-testid="admin-priority-select"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#171329] border border-[#3D345F] text-[#FFF0D7]"
                  >
                    {Object.entries(FEEDBACK_PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] space-y-2">
                <p className="text-[#FFF0D7]/90 whitespace-pre-wrap leading-relaxed">
                  {selectedReport.description}
                </p>
                {selectedReport.reproductionSteps && (
                  <p className="text-[11px] text-[#FFF0D7]/70">
                    <strong>Steps:</strong> {selectedReport.reproductionSteps}
                  </p>
                )}
                {selectedReport.expectedBehaviour && (
                  <p className="text-[11px] text-[#FFF0D7]/70">
                    <strong>Expected:</strong> {selectedReport.expectedBehaviour}
                  </p>
                )}
                {selectedReport.actualBehaviour && (
                  <p className="text-[11px] text-[#FFF0D7]/70">
                    <strong>Actual:</strong> {selectedReport.actualBehaviour}
                  </p>
                )}
              </div>

              {/* Technical Context */}
              <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] text-[11px] text-[#FFF0D7]/70 space-y-0.5 font-mono">
                <p className="text-[10px] uppercase text-[#56E0CB] font-sans font-bold mb-1">
                  Technical Context
                </p>
                <p>
                  {selectedReport.technicalContext.browser} · {selectedReport.technicalContext.os} (
                  {selectedReport.technicalContext.deviceType})
                </p>
                <p>
                  Screen: {selectedReport.technicalContext.screenDimensions} · App v
                  {selectedReport.technicalContext.appVersion}
                </p>
                <p>Route: {selectedReport.technicalContext.route}</p>
              </div>

              {/* Public Response vs Private Internal Note Composer */}
              <form onSubmit={(e) => void handlePostNote(e)} className="space-y-2">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNoteVisibility('public')}
                    data-testid="admin-mode-public"
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer inline-flex items-center justify-center gap-1 ${
                      noteVisibility === 'public'
                        ? 'bg-[#56E0CB]/20 text-[#56E0CB] border-[#56E0CB]'
                        : 'bg-[#171329] text-[#FFF0D7]/65 border-[#3D345F]'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" /> Public Response
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteVisibility('internal')}
                    data-testid="admin-mode-internal"
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer inline-flex items-center justify-center gap-1 ${
                      noteVisibility === 'internal'
                        ? 'bg-[#FFC66D]/20 text-[#FFC66D] border-[#FFC66D]'
                        : 'bg-[#171329] text-[#FFF0D7]/65 border-[#3D345F]'
                    }`}
                  >
                    <Lock className="w-3 h-3" /> Private Note
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={
                    noteVisibility === 'public'
                      ? 'Reply visible to the reporter in My Reports…'
                      : 'Private internal note (never visible to players)…'
                  }
                  data-testid="admin-note-input"
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] text-xs text-[#FFF0D7] outline-none focus:border-[#56E0CB]"
                />
                <button
                  type="submit"
                  disabled={isUpdating || !noteText.trim()}
                  data-testid="admin-note-submit"
                  className="w-full py-2 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {noteVisibility === 'public' ? 'Send Public Response' : 'Save Internal Note'}
                  </span>
                </button>
              </form>

              {/* Activity Timeline */}
              {activity.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#2E264A]">
                  <p className="text-[10px] uppercase font-bold text-[#FFF0D7]/60">
                    Activity History
                  </p>
                  {activity.map((entry) => (
                    <div
                      key={entry.activityId}
                      className={`p-2 rounded-lg border text-[11px] ${
                        entry.visibility === 'internal'
                          ? 'bg-[#FFC66D]/10 border-[#FFC66D]/40'
                          : 'bg-[#171329] border-[#2E264A]'
                      }`}
                    >
                      <div className="flex justify-between gap-2 text-[10px] mb-0.5">
                        <span
                          className={
                            entry.visibility === 'internal'
                              ? 'text-[#FFC66D] font-bold'
                              : 'text-[#56E0CB] font-bold'
                          }
                        >
                          {entry.visibility === 'internal' ? 'INTERNAL NOTE' : 'PUBLIC'} ·{' '}
                          {entry.authorLabel}
                        </span>
                        <span className="text-[#FFF0D7]/45 font-mono">
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[#FFF0D7]/90">{entry.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

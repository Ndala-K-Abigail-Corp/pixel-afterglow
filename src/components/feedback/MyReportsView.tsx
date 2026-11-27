/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { FileText, Loader2, MessageSquare, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import {
  fetchMyFeedbackReports,
  fetchPublicReportActivity,
} from '../../logic/feedback';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackActivityEntry,
  type FeedbackReportDocument,
  type FeedbackStatus,
} from '../../types/feedback';

export interface MyReportsViewProps {
  onNewReport: () => void;
  initialReports?: FeedbackReportDocument[];
}

function statusPillClasses(status: FeedbackStatus): string {
  switch (status) {
    case 'resolved':
      return 'bg-[#56E0CB]/15 text-[#56E0CB] border-[#56E0CB]/50';
    case 'in-progress':
      return 'bg-[#FFC66D]/15 text-[#FFC66D] border-[#FFC66D]/50';
    case 'under-review':
      return 'bg-[#8B5CF6]/20 text-[#C4B5FD] border-[#8B5CF6]/50';
    case 'closed':
      return 'bg-[#3D345F]/50 text-[#FFF0D7]/65 border-[#3D345F]';
    default:
      return 'bg-[#FF776E]/15 text-[#FF776E] border-[#FF776E]/50';
  }
}

export const MyReportsView: React.FC<MyReportsViewProps> = ({
  onNewReport,
  initialReports,
}) => {
  const { uid } = useAuth();
  const { playClick } = useAudio();

  const [reports, setReports] = useState<FeedbackReportDocument[]>(initialReports ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialReports);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activityByReport, setActivityByReport] = useState<
    Record<string, FeedbackActivityEntry[]>
  >({});

  useEffect(() => {
    if (initialReports) {
      setReports(initialReports);
      setIsLoading(false);
      return;
    }
    if (!uid) {
      setReports([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void fetchMyFeedbackReports(uid)
      .then((items) => {
        if (!cancelled) setReports(items);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, initialReports]);

  const handleToggleExpand = async (reportId: string) => {
    playClick();
    if (expandedId === reportId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reportId);
    if (!activityByReport[reportId]) {
      const entries = await fetchPublicReportActivity(reportId);
      setActivityByReport((prev) => ({ ...prev, [reportId]: entries }));
    }
  };

  return (
    <div
      className="max-w-4xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5"
      data-testid="my-reports-view"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#56E0CB] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#FFC66D] shrink-0" />
            <span>MY REPORTS</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/70 mt-1.5">
            Track the status of bug reports and suggestions you have submitted.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            playClick();
            onNewReport();
          }}
          data-testid="my-reports-new-btn"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFC66D] hover:bg-[#ffd285] text-[#171329] font-bold text-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Report</span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 rounded-2xl bg-[#201A36] border border-[#3D345F] flex flex-col items-center gap-2 text-xs text-[#FFF0D7]/70">
          <Loader2 className="w-5 h-5 animate-spin text-[#56E0CB]" />
          <span>Loading your reports…</span>
        </div>
      ) : reports.length === 0 ? (
        <div
          className="p-8 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center space-y-2.5"
          data-testid="my-reports-empty"
        >
          <FileText className="w-8 h-8 text-[#56E0CB] mx-auto" />
          <p className="text-sm font-bold text-[#FFF0D7]">No Reports Submitted Yet</p>
          <p className="text-xs text-[#FFF0D7]/70 max-w-md mx-auto">
            Spotted a bug or have an idea for Pixel Afterglow? Submit a report and track its progress here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((rep) => {
            const isExpanded = expandedId === rep.reportId;
            const catLabel =
              FEEDBACK_CATEGORIES.find((c) => c.id === rep.category)?.label ?? rep.category;
            const publicTimeline = activityByReport[rep.reportId] ?? [];

            return (
              <div
                key={rep.reportId}
                data-testid={`my-report-card-${rep.referenceCode}`}
                className="rounded-2xl bg-[#201A36] border border-[#3D345F] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => void handleToggleExpand(rep.reportId)}
                  className="w-full p-4 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#241E3D] cursor-pointer"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#FFC66D]">
                        {rep.referenceCode}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#171329] border border-[#3D345F] text-[10px] text-[#FFF0D7]/75">
                        {catLabel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusPillClasses(
                          rep.status
                        )}`}
                      >
                        {FEEDBACK_STATUS_LABELS[rep.status]}
                      </span>
                    </div>
                    <h2 className="text-sm font-bold text-[#FFF0D7] truncate">{rep.title}</h2>
                    <p className="text-[11px] text-[#FFF0D7]/60">
                      Submitted {new Date(rep.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-[#56E0CB]">
                    {rep.latestPublicResponse && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#56E0CB]/15 text-[10px] font-bold">
                        <MessageSquare className="w-3 h-3" /> Response
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-[#2E264A] space-y-3 text-xs">
                    <p className="text-[#FFF0D7]/85 whitespace-pre-wrap leading-relaxed">
                      {rep.description}
                    </p>

                    {rep.latestPublicResponse && (
                      <div className="p-3 rounded-xl bg-[#56E0CB]/12 border border-[#56E0CB]/50 space-y-1">
                        <p className="text-[10px] font-bold uppercase text-[#56E0CB]">
                          Latest Admin Response
                        </p>
                        <p className="text-[#FFF0D7]">{rep.latestPublicResponse.message}</p>
                      </div>
                    )}

                    {publicTimeline.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[10px] font-bold uppercase text-[#FFF0D7]/60">
                          Public Updates
                        </p>
                        {publicTimeline.map((entry) => (
                          <div
                            key={entry.activityId}
                            className="p-2.5 rounded-lg bg-[#171329] border border-[#2E264A] flex items-start justify-between gap-2"
                          >
                            <span className="text-[#FFF0D7]/85">{entry.message}</span>
                            <span className="text-[10px] font-mono text-[#FFF0D7]/50 shrink-0">
                              {new Date(entry.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

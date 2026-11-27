/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  MessageSquarePlus,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Info,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import {
  FEEDBACK_AFFECTED_AREAS,
  FEEDBACK_CATEGORIES,
  type FeedbackAffectedArea,
  type FeedbackCategory,
  type FeedbackFrequency,
  type FeedbackReportDocument,
} from '../../types/feedback';
import {
  FEEDBACK_LIMITS,
  submitFeedbackReport,
} from '../../logic/feedback';
import { formatUserError } from '../../utils/userErrorFormatter';

export interface FeedbackFormViewProps {
  initialArea?: FeedbackAffectedArea;
  initialGameType?: 'memory-match' | 'tic-tac-toe' | 'snake' | null;
  currentRoute?: string;
  onBack?: () => void;
  onViewMyReports?: () => void;
}

export const FeedbackFormView: React.FC<FeedbackFormViewProps> = ({
  initialArea = 'other',
  initialGameType = null,
  currentRoute = '/',
  onBack,
  onViewMyReports,
}) => {
  const { playClick } = useAudio();
  const { uid, profile, isSignedInAccount, isLoadingAuth } = useAuth();

  const [category, setCategory] = useState<FeedbackCategory>('bug-report');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [affectedArea, setAffectedArea] = useState<FeedbackAffectedArea>(initialArea);
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [expectedBehaviour, setExpectedBehaviour] = useState('');
  const [actualBehaviour, setActualBehaviour] = useState('');
  const [frequency, setFrequency] = useState<FeedbackFrequency | ''>('');
  const [currentExperience, setCurrentExperience] = useState('');
  const [suggestedImprovement, setSuggestedImprovement] = useState('');
  const [anonymousNickname, setAnonymousNickname] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedReport, setSubmittedReport] = useState<FeedbackReportDocument | null>(null);

  const selectedCategoryMeta = FEEDBACK_CATEGORIES.find((c) => c.id === category);
  const isBugLike = selectedCategoryMeta?.group === 'bug';
  const isImprovementLike = selectedCategoryMeta?.group === 'improvement';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isLoadingAuth) return;
    playClick();
    setErrorMsg(null);

    if (title.trim().length < FEEDBACK_LIMITS.titleMin) {
      setErrorMsg(`Please enter a title of at least ${FEEDBACK_LIMITS.titleMin} characters.`);
      return;
    }
    if (description.trim().length < FEEDBACK_LIMITS.descriptionMin) {
      setErrorMsg(
        `Please provide a description of at least ${FEEDBACK_LIMITS.descriptionMin} characters.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await submitFeedbackReport({
        input: {
          category,
          title,
          description,
          affectedArea,
          reproductionSteps: isBugLike ? reproductionSteps : '',
          expectedBehaviour: isBugLike ? expectedBehaviour : '',
          actualBehaviour: isBugLike ? actualBehaviour : '',
          frequency: isBugLike && frequency ? frequency : null,
          currentExperience: isImprovementLike ? currentExperience : '',
          suggestedImprovement: isImprovementLike ? suggestedImprovement : '',
          anonymousNickname: !isSignedInAccount ? anonymousNickname : undefined,
        },
        authenticatedUid: uid,
        authenticatedProfileUsername: profile?.username ?? null,
        isRegisteredAccount: isSignedInAccount,
        route: currentRoute,
        gameType: initialGameType,
      });
      setSubmittedReport(report);
    } catch (err) {
      setErrorMsg(formatUserError(err, 'Unable to submit your report right now. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedReport) {
    return (
      <div
        className="max-w-2xl mx-auto px-3 sm:px-6 py-6"
        data-testid="feedback-confirmation"
      >
        <div className="p-6 rounded-2xl bg-[#201A36] border-2 border-[#56E0CB]/70 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-[#56E0CB] mx-auto" />
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#56E0CB]">
            REPORT SUBMITTED
          </h1>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/80">
            Thank you for helping improve Pixel Afterglow! Your report has been logged for review.
          </p>
          <div className="inline-flex flex-col items-center px-5 py-3 rounded-xl bg-[#171329] border border-[#3D345F]">
            <span className="text-[10px] uppercase text-[#FFF0D7]/60">Reference Number</span>
            <span
              className="font-['Press_Start_2P'] text-sm text-[#FFC66D] mt-1"
              data-testid="feedback-reference-code"
            >
              {submittedReport.referenceCode}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {isSignedInAccount && onViewMyReports && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onViewMyReports();
                }}
                className="px-4 py-2.5 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer"
              >
                View My Reports
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playClick();
                setSubmittedReport(null);
                setTitle('');
                setDescription('');
                setReproductionSteps('');
                setExpectedBehaviour('');
                setActualBehaviour('');
                setCurrentExperience('');
                setSuggestedImprovement('');
              }}
              className="px-4 py-2.5 rounded-xl bg-[#292342] border border-[#3D345F] text-[#FFF0D7] font-semibold text-xs cursor-pointer"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-3xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5"
      data-testid="feedback-form-view"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#FFC66D] flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-[#56E0CB] shrink-0" />
            <span>FEEDBACK &amp; BUG REPORTS</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/75 mt-1.5">
            Spot a bug, have a game issue, or want to suggest an improvement? Let us know below.
          </p>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={() => {
              playClick();
              onBack();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#292342] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        )}
      </div>

      {/* Authenticated Identity Banner (Read-only, never asks for username/email again) */}
      {isSignedInAccount ? (
        <div
          className="p-3.5 rounded-xl bg-[#201A36] border border-[#56E0CB]/45 flex items-center justify-between gap-2 text-xs"
          data-testid="feedback-authenticated-identity"
        >
          <span className="inline-flex items-center gap-2 text-[#FFF0D7]">
            <UserCheck className="w-4 h-4 text-[#56E0CB] shrink-0" />
            <span>
              Submitting as{' '}
              <strong className="text-[#56E0CB]">{profile?.username ?? 'Registered Player'}</strong>
            </span>
          </span>
          <span className="text-[11px] text-[#FFF0D7]/60">Linked to your account</span>
        </div>
      ) : (
        <div
          className="p-3.5 rounded-xl bg-[#201A36] border border-[#FFC66D]/45 space-y-2 text-xs"
          data-testid="feedback-anonymous-identity"
        >
          <p className="text-[#FFC66D] font-semibold">
            Submitting as Guest (Anonymous) — no account required.
          </p>
          <div>
            <label
              htmlFor="feedback-anon-nickname"
              className="block text-[11px] text-[#FFF0D7]/75 mb-1"
            >
              Optional Guest Nickname
            </label>
            <input
              id="feedback-anon-nickname"
              type="text"
              maxLength={FEEDBACK_LIMITS.nicknameMax}
              value={anonymousNickname}
              onChange={(e) => setAnonymousNickname(e.target.value)}
              placeholder="e.g. RetroVisitor (optional)"
              data-testid="feedback-anon-nickname-input"
              className="w-full sm:w-72 px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] focus:border-[#FFC66D] text-xs text-[#FFF0D7] outline-none"
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          data-testid="feedback-form-error"
          className="p-3.5 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="p-4 sm:p-6 rounded-2xl bg-[#201A36] border-2 border-[#3D345F] space-y-4"
        data-testid="feedback-form"
      >
        {/* Category Selector */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#FFC66D]">
            Category *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {FEEDBACK_CATEGORIES.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    playClick();
                    setCategory(cat.id);
                  }}
                  data-testid={`feedback-category-${cat.id}`}
                  aria-pressed={active}
                  className={`p-2.5 rounded-xl border-2 text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#292342] border-[#56E0CB]'
                      : 'bg-[#171329] border-[#3D345F] hover:border-[#56E0CB]/50'
                  }`}
                >
                  <p className="text-xs font-bold text-[#FFF0D7]">{cat.label}</p>
                  <p className="text-[10px] text-[#FFF0D7]/65 mt-0.5">{cat.shortDesc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <label htmlFor="feedback-title" className="font-bold uppercase text-[#FFF0D7]/80">
              Title *
            </label>
            <span className="font-mono text-[#FFF0D7]/55">
              {title.length}/{FEEDBACK_LIMITS.titleMax}
            </span>
          </div>
          <input
            id="feedback-title"
            type="text"
            maxLength={FEEDBACK_LIMITS.titleMax}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary of your report or suggestion"
            data-testid="feedback-title-input"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-sm text-[#FFF0D7] outline-none"
          />
        </div>

        {/* Affected Area */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="feedback-area"
              className="block text-[11px] font-bold uppercase text-[#FFF0D7]/80 mb-1"
            >
              Affected Game or Area
            </label>
            <select
              id="feedback-area"
              value={affectedArea}
              onChange={(e) => setAffectedArea(e.target.value as FeedbackAffectedArea)}
              data-testid="feedback-area-select"
              className="w-full px-3 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
            >
              {FEEDBACK_AFFECTED_AREAS.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
                </option>
              ))}
            </select>
          </div>

          {isBugLike && (
            <div>
              <label
                htmlFor="feedback-frequency"
                className="block text-[11px] font-bold uppercase text-[#FFF0D7]/80 mb-1"
              >
                How Often Does This Happen?
              </label>
              <select
                id="feedback-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as FeedbackFrequency | '')}
                className="w-full px-3 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
              >
                <option value="">Select frequency (optional)</option>
                <option value="always">Every time</option>
                <option value="often">Often</option>
                <option value="sometimes">Sometimes</option>
                <option value="once">Happened once</option>
              </select>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <label htmlFor="feedback-description" className="font-bold uppercase text-[#FFF0D7]/80">
              Description *
            </label>
            <span className="font-mono text-[#FFF0D7]/55">
              {description.length}/{FEEDBACK_LIMITS.descriptionMax}
            </span>
          </div>
          <textarea
            id="feedback-description"
            rows={4}
            maxLength={FEEDBACK_LIMITS.descriptionMax}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened or share your feedback in detail..."
            data-testid="feedback-description-input"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-sm text-[#FFF0D7] outline-none resize-y"
          />
        </div>

        {/* Conditional Bug Fields */}
        {isBugLike && (
          <div className="space-y-3 pt-2 border-t border-[#2E264A]">
            <div>
              <label
                htmlFor="feedback-repro"
                className="block text-[11px] font-bold uppercase text-[#FFF0D7]/75 mb-1"
              >
                Steps to Reproduce (Optional)
              </label>
              <textarea
                id="feedback-repro"
                rows={2}
                maxLength={FEEDBACK_LIMITS.detailFieldMax}
                value={reproductionSteps}
                onChange={(e) => setReproductionSteps(e.target.value)}
                placeholder="1. Open Snake... 2. Click Online..."
                className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] focus:border-[#56E0CB] text-xs text-[#FFF0D7] outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="feedback-expected"
                  className="block text-[11px] font-bold uppercase text-[#FFF0D7]/75 mb-1"
                >
                  Expected Behaviour (Optional)
                </label>
                <input
                  id="feedback-expected"
                  type="text"
                  maxLength={FEEDBACK_LIMITS.detailFieldMax}
                  value={expectedBehaviour}
                  onChange={(e) => setExpectedBehaviour(e.target.value)}
                  placeholder="What did you expect to happen?"
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] focus:border-[#56E0CB] text-xs text-[#FFF0D7] outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="feedback-actual"
                  className="block text-[11px] font-bold uppercase text-[#FFF0D7]/75 mb-1"
                >
                  Actual Behaviour (Optional)
                </label>
                <input
                  id="feedback-actual"
                  type="text"
                  maxLength={FEEDBACK_LIMITS.detailFieldMax}
                  value={actualBehaviour}
                  onChange={(e) => setActualBehaviour(e.target.value)}
                  placeholder="What actually happened?"
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] focus:border-[#56E0CB] text-xs text-[#FFF0D7] outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Conditional Improvement / Feature Request Fields */}
        {isImprovementLike && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#2E264A]">
            <div>
              <label
                htmlFor="feedback-current"
                className="block text-[11px] font-bold uppercase text-[#FFF0D7]/75 mb-1"
              >
                Current Experience (Optional)
              </label>
              <textarea
                id="feedback-current"
                rows={2}
                maxLength={FEEDBACK_LIMITS.detailFieldMax}
                value={currentExperience}
                onChange={(e) => setCurrentExperience(e.target.value)}
                placeholder="How does it work today?"
                className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] focus:border-[#56E0CB] text-xs text-[#FFF0D7] outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="feedback-suggested"
                className="block text-[11px] font-bold uppercase text-[#FFF0D7]/75 mb-1"
              >
                Suggested Improvement (Optional)
              </label>
              <textarea
                id="feedback-suggested"
                rows={2}
                maxLength={FEEDBACK_LIMITS.detailFieldMax}
                value={suggestedImprovement}
                onChange={(e) => setSuggestedImprovement(e.target.value)}
                placeholder="What would you love to see?"
                className="w-full px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] focus:border-[#56E0CB] text-xs text-[#FFF0D7] outline-none"
              />
            </div>
          </div>
        )}

        {/* Text-Only Notice & Safe Telemetry Disclosure */}
        <div className="p-3 rounded-xl bg-[#171329] border border-[#2E264A] flex items-start gap-2 text-[11px] text-[#FFF0D7]/65">
          <Info className="w-4 h-4 text-[#56E0CB] shrink-0 mt-0.5" />
          <span>
            This form is currently text-only (image attachments are not supported at this time). Basic non-sensitive technical info (browser, screen size, app version) is included automatically to help reproduce bugs.
          </span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isLoadingAuth}
          data-testid="feedback-submit-btn"
          className="w-full py-3 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Submitting…</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Submit Report</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

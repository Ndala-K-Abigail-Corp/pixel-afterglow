/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Sparkles, Calendar, ShieldCheck, Wrench, Zap, ArrowLeft } from 'lucide-react';
import {
  acknowledgeLatestRelease,
  getPublishedReleases,
  type ReleaseItemCategory,
} from '../../data/releases';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';

export interface WhatsNewViewProps {
  onBack?: () => void;
  onAcknowledged?: () => void;
}

function getCategoryStyle(category: ReleaseItemCategory): {
  bg: string;
  text: string;
  border: string;
  Icon: React.FC<{ className?: string }>;
} {
  switch (category) {
    case 'New Feature':
      return {
        bg: 'bg-[#56E0CB]/15',
        text: 'text-[#56E0CB]',
        border: 'border-[#56E0CB]/50',
        Icon: Sparkles,
      };
    case 'Improvement':
      return {
        bg: 'bg-[#FFC66D]/15',
        text: 'text-[#FFC66D]',
        border: 'border-[#FFC66D]/50',
        Icon: Zap,
      };
    case 'Security':
      return {
        bg: 'bg-[#8B5CF6]/15',
        text: 'text-[#C4B5FD]',
        border: 'border-[#8B5CF6]/50',
        Icon: ShieldCheck,
      };
    default:
      return {
        bg: 'bg-[#FF776E]/15',
        text: 'text-[#FF776E]',
        border: 'border-[#FF776E]/50',
        Icon: Wrench,
      };
  }
}

export const WhatsNewView: React.FC<WhatsNewViewProps> = ({ onBack, onAcknowledged }) => {
  const { uid } = useAuth();
  const { playClick } = useAudio();
  const releases = getPublishedReleases();

  useEffect(() => {
    acknowledgeLatestRelease(uid);
    onAcknowledged?.();
  }, [uid, onAcknowledged]);

  return (
    <div
      className="max-w-4xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-6"
      data-testid="whats-new-view"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#FFC66D] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#56E0CB] shrink-0" />
            <span>WHAT&apos;S NEW</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/70 mt-1.5">
            Latest Pixel Afterglow games, platform improvements, and arcade updates.
          </p>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={() => {
              playClick();
              onBack();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        )}
      </div>

      {releases.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#201A36] border border-[#3D345F] text-center text-xs text-[#FFF0D7]/70">
          No release announcements published yet. Check back soon!
        </div>
      ) : (
        <div className="space-y-5">
          {releases.map((release, idx) => (
            <article
              key={release.id}
              data-testid={`release-card-${release.id}`}
              className={`p-5 sm:p-6 rounded-2xl bg-[#201A36] border-2 space-y-4 ${
                idx === 0 ? 'border-[#56E0CB]/60' : 'border-[#3D345F]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#56E0CB]/20 border border-[#56E0CB]/60 text-[10px] font-bold font-mono text-[#56E0CB]">
                      {release.version}
                    </span>
                    {idx === 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#FFC66D]/20 border border-[#FFC66D]/60 text-[10px] font-bold uppercase text-[#FFC66D]">
                        Latest
                      </span>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#FFF0D7]">
                    {release.title}
                  </h2>
                </div>

                <span className="inline-flex items-center gap-1 text-xs text-[#FFF0D7]/60 font-mono shrink-0">
                  <Calendar className="w-3.5 h-3.5" />
                  {release.publishedAt}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#FFF0D7]/80 leading-relaxed">
                {release.intro}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {release.highlights.map((item) => {
                  const style = getCategoryStyle(item.category);
                  const Icon = style.Icon;
                  return (
                    <div
                      key={`${release.id}-${item.title}`}
                      className="p-3.5 rounded-xl bg-[#171329] border border-[#2E264A] space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${style.bg} ${style.text} ${style.border}`}
                        >
                          <Icon className="w-3 h-3" />
                          {item.category}
                        </span>
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#FFF0D7]">
                        {item.title}
                      </h3>
                      <ul className="space-y-1 text-xs text-[#FFF0D7]/75 list-disc list-inside">
                        {item.details.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

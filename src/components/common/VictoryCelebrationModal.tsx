/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Trophy, AlertTriangle, Sparkles, RotateCcw, ArrowLeft, Eye, X, Star, SlidersHorizontal } from 'lucide-react';
import { fireVictoryConfetti, fireStarRecordConfetti } from '../../utils/confetti';
import { useAudio } from '../../context/AudioContext';

export interface VictoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
  onBackToArcade: () => void;
  onChangeSettings?: () => void;
  changeSettingsLabel?: string;
  variant?: 'win' | 'loss';
  gameTitle: string;
  headline: string;
  subheadline: string;
  isNewRecord?: boolean;
  stats?: Array<{ label: string; value: string | number; accent?: string }>;
}

export const VictoryCelebrationModal: React.FC<VictoryModalProps> = ({
  isOpen,
  onClose,
  onPlayAgain,
  onBackToArcade,
  onChangeSettings,
  changeSettingsLabel = 'Change Mode / Difficulty',
  variant = 'win',
  gameTitle,
  headline,
  subheadline,
  isNewRecord = false,
  stats = [],
}) => {
  const { playClick } = useAudio();
  const isWin = variant === 'win';

  useEffect(() => {
    if (isOpen && isWin) {
      if (isNewRecord) {
        fireStarRecordConfetti();
      } else {
        fireVictoryConfetti();
      }
    }
  }, [isOpen, isWin, isNewRecord]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const borderAccentClass = isWin ? 'border-[#FFC66D] retro-box-gold' : 'border-[#FF776E] retro-box-coral';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className={`relative w-full max-w-md max-h-[92dvh] overflow-x-hidden overflow-y-auto bg-[#201A36] border-2 ${borderAccentClass} rounded-2xl p-4 sm:p-7 shadow-2xl text-[#FFF0D7] text-center animate-in zoom-in-95 duration-200`}
      >
        {/* Clipped Ambient Glow Wrapper so negative offsets never cause scrollbars */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-12 -left-12 w-36 h-36 bg-[#FFC66D]/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -right-12 w-36 h-36 bg-[#56E0CB]/15 rounded-full blur-3xl" />
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            playClick();
            onClose();
          }}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2 text-[#FFF0D7]/60 hover:text-[#FF776E] hover:bg-[#292342] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#FF776E]"
          aria-label="Close result dialog and inspect board"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Game Badge */}
        <div className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#171329] border border-[#3D345F] text-[9px] sm:text-[10px] font-pixel text-[#56E0CB] uppercase tracking-wider mb-3">
          <Sparkles className="w-3 h-3 text-[#FFC66D] shrink-0" />
          <span>{gameTitle}</span>
        </div>

        {/* Icon Badge (Trophy for Win, Alert for Loss) */}
        <div className="relative z-10 w-14 h-14 sm:w-18 sm:h-18 mx-auto mb-3 flex items-center justify-center">
          {isWin ? (
            <>
              <div className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl bg-[#292342] border-2 border-[#FFC66D] flex items-center justify-center shadow-lg retro-box-gold">
                <Trophy className="w-7 h-7 sm:w-9 sm:h-9 text-[#FFC66D] motion-safe:animate-bounce" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#FF776E] rotate-45 motion-safe:animate-ping" />
            </>
          ) : (
            <div className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl bg-[#292342] border-2 border-[#FF776E] flex items-center justify-center shadow-lg retro-box-coral">
              <AlertTriangle className="w-7 h-7 sm:w-9 sm:h-9 text-[#FF776E]" />
            </div>
          )}
        </div>

        {/* Headline & Subheadline */}
        <h2
          id="victory-modal-title"
          className="relative z-10 font-pixel text-xs sm:text-base md:text-lg text-[#FFF0D7] tracking-tight mb-1.5 leading-relaxed px-2"
        >
          {headline}
        </h2>
        <p className="relative z-10 text-xs sm:text-sm text-[#FFC66D] font-sans font-medium mb-4 sm:mb-5 px-1 leading-relaxed">
          {subheadline}
        </p>

        {/* New Record Banner if applicable */}
        {isWin && isNewRecord && (
          <div className="relative z-10 mb-4 py-1.5 px-3 rounded-xl bg-[#FFC66D]/20 border border-[#FFC66D] flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#FFC66D]">
            <Star className="w-3.5 h-3.5 fill-[#FFC66D] shrink-0" />
            <span>NEW PERSONAL BEST RECORD!</span>
            <Star className="w-3.5 h-3.5 fill-[#FFC66D] shrink-0" />
          </div>
        )}

        {/* Stats Grid */}
        {stats.length > 0 && (
          <div
            className={`relative z-10 grid gap-2 mb-4 sm:mb-5 ${
              stats.length === 2
                ? 'grid-cols-2'
                : stats.length === 3
                ? 'grid-cols-3'
                : stats.length === 4
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-2'
            }`}
          >
            {stats.map((stat, i) => (
              <div
                key={i}
                className="bg-[#171329] px-2 py-2.5 sm:p-3 rounded-xl border border-[#3D345F] text-center min-w-0 flex flex-col justify-center"
              >
                <div className="text-[8px] sm:text-[9px] font-pixel text-[#FFF0D7]/60 uppercase tracking-wider mb-1 leading-tight">
                  {stat.label}
                </div>
                <div
                  className="font-sans font-bold text-sm sm:text-base md:text-lg leading-tight break-words"
                  style={{ color: stat.accent || '#56E0CB' }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="relative z-10 space-y-2 pt-1">
          {/* Primary Action: Play Again */}
          <button
            type="button"
            onClick={() => {
              playClick();
              onPlayAgain();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#FF776E] hover:bg-[#ff8f87] text-[#171329] font-bold text-xs sm:text-sm uppercase tracking-wider font-sans retro-btn retro-box-coral focus-visible:ring-2 focus-visible:ring-[#FFF0D7] transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Play Again</span>
          </button>

          {/* Optional Change Mode / Difficulty Button */}
          {onChangeSettings && (
            <button
              type="button"
              onClick={() => {
                playClick();
                onChangeSettings();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#56E0CB] border border-[#56E0CB]/50 hover:border-[#56E0CB] text-xs font-semibold transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>{changeSettingsLabel}</span>
            </button>
          )}

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                playClick();
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7]/85 hover:text-[#56E0CB] border border-[#3D345F] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#56E0CB] shrink-0" />
              <span>Inspect Board</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playClick();
                onBackToArcade();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7]/85 hover:text-[#FF776E] border border-[#3D345F] text-xs font-semibold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FF776E] shrink-0" />
              <span>Arcade Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

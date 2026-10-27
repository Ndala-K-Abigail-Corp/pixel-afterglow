/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Trophy, Sparkles, RotateCcw, ArrowLeft, Eye, X, Star } from 'lucide-react';
import { fireVictoryConfetti, fireStarRecordConfetti } from '../../utils/confetti';
import { useAudio } from '../../context/AudioContext';

export interface VictoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
  onBackToArcade: () => void;
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
  gameTitle,
  headline,
  subheadline,
  isNewRecord = false,
  stats = [],
}) => {
  const { playClick } = useAudio();

  useEffect(() => {
    if (isOpen) {
      if (isNewRecord) {
        fireStarRecordConfetti();
      } else {
        fireVictoryConfetti();
      }
    }
  }, [isOpen, isNewRecord]);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-[#201A36] border-2 border-[#FFC66D] rounded-2xl p-6 sm:p-8 shadow-2xl retro-box-gold text-[#FFF0D7] text-center overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={() => {
            playClick();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-[#FFF0D7]/60 hover:text-[#FF776E] hover:bg-[#292342] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[#FF776E]"
          aria-label="Close victory celebration modal and inspect board"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Floating Background Ambient Glow */}
        <div
          aria-hidden="true"
          className="absolute -top-12 -left-12 w-40 h-40 bg-[#FFC66D]/15 rounded-full blur-3xl pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-12 -right-12 w-40 h-40 bg-[#56E0CB]/15 rounded-full blur-3xl pointer-events-none"
        />

        {/* Game Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#171329] border border-[#3D345F] text-[10px] font-pixel text-[#56E0CB] uppercase tracking-wider mb-4">
          <Sparkles className="w-3 h-3 text-[#FFC66D]" />
          <span>{gameTitle}</span>
        </div>

        {/* Animated Trophy Art */}
        <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-[#292342] border-2 border-[#FFC66D] flex items-center justify-center shadow-lg retro-box-gold">
            <Trophy className="w-10 h-10 text-[#FFC66D] animate-bounce" />
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF776E] rotate-45 animate-ping" />
        </div>

        {/* Headline & Subheadline */}
        <h2
          id="victory-modal-title"
          className="font-pixel text-lg sm:text-xl text-[#FFF0D7] tracking-tight mb-2 leading-snug"
        >
          {headline}
        </h2>
        <p className="text-xs sm:text-sm text-[#FFC66D] font-mono mb-6">
          {subheadline}
        </p>

        {/* New Record Banner if applicable */}
        {isNewRecord && (
          <div className="mb-5 py-2 px-3 rounded-xl bg-[#FFC66D]/20 border border-[#FFC66D] flex items-center justify-center gap-2 text-xs font-bold text-[#FFC66D]">
            <Star className="w-4 h-4 fill-[#FFC66D]" />
            <span>NEW PERSONAL BEST RECORD!</span>
            <Star className="w-4 h-4 fill-[#FFC66D]" />
          </div>
        )}

        {/* Stats Grid */}
        {stats.length > 0 && (
          <div
            className={`grid gap-2.5 mb-6 ${
              stats.length === 2 ? 'grid-cols-2' : stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {stats.map((stat, i) => (
              <div
                key={i}
                className="bg-[#171329] p-3 rounded-xl border border-[#3D345F] text-center"
              >
                <div className="text-[10px] font-pixel text-[#FFF0D7]/60 uppercase tracking-wider mb-1">
                  {stat.label}
                </div>
                <div
                  className="font-pixel text-base sm:text-lg"
                  style={{ color: stat.accent || '#56E0CB' }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="space-y-2.5 pt-2">
          {/* Primary Action: Play Again / Next Round */}
          <button
            onClick={() => {
              playClick();
              onPlayAgain();
            }}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-[#FF776E] hover:bg-[#ff8f87] text-[#171329] font-bold text-xs uppercase tracking-wider font-pixel retro-btn retro-box-coral focus-visible:ring-2 focus-visible:ring-[#FFF0D7] transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>PLAY AGAIN</span>
          </button>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                playClick();
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7]/85 hover:text-[#56E0CB] border border-[#3D345F] text-xs font-semibold transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-[#56E0CB]" />
              <span>Inspect Board</span>
            </button>

            <button
              onClick={() => {
                playClick();
                onBackToArcade();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7]/85 hover:text-[#FF776E] border border-[#3D345F] text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FF776E]" />
              <span>Arcade Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

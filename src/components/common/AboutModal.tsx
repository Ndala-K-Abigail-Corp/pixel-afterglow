/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X, Sparkles, Terminal, ShieldCheck, Heart } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-[#201A36] border-2 border-[#56E0CB] rounded-2xl p-6 md:p-8 shadow-2xl retro-box-teal text-[#FFF0D7] max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[#FFF0D7]/70 hover:text-[#FF776E] hover:bg-[#292342] rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[#FF776E]"
          aria-label="Close About dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#292342] border border-[#56E0CB] flex items-center justify-center text-[#56E0CB]">
            <Sparkles className="w-5 h-5 text-[#FFC66D]" />
          </div>
          <div>
            <h2 id="about-modal-title" className="font-pixel text-sm md:text-base text-[#FFF0D7] tracking-tight">
              ABOUT PIXEL AFTERGLOW
            </h2>
            <p className="text-xs text-[#56E0CB] font-medium">
              Old-school joy. New ways to play.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 text-xs md:text-sm text-[#FFF0D7]/85 leading-relaxed">
          <div className="bg-[#171329] p-4 rounded-xl border border-[#3D345F]">
            <h3 className="font-semibold text-[#FFC66D] mb-1 flex items-center gap-1.5">
              <span>🕹️</span> Origin &amp; Creative Vision
            </h3>
            <p>
              <strong>Pixel Afterglow</strong> is a personal game-development project born from warm childhood memories of 1990s arcade culture, living room consoles, pixel art, and the simple thrill of discovering approachable games.
            </p>
          </div>

          <div className="bg-[#171329] p-4 rounded-xl border border-[#3D345F]">
            <h3 className="font-semibold text-[#56E0CB] mb-1 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-[#56E0CB]" /> Technical Foundation
            </h3>
            <ul className="space-y-1.5 text-xs text-[#FFF0D7]/75 list-disc list-inside">
              <li><strong>Playable Cartridges:</strong> Tic-Tac-Toe (Local 2P &amp; Minimax AI) and Memory Match (8 paired retro sprites, timer, and move counter).</li>
              <li><strong>Progressive Web App:</strong> Installable on desktop, Android, and iOS with full offline gameplay support.</li>
              <li><strong>Zero Cloud Bloat:</strong> No mandatory accounts, telemetry trackers, or external database queries.</li>
              <li><strong>Persistent Local State:</strong> Match results and personal records saved in browser <code className="text-[#FFC66D]">localStorage</code>.</li>
              <li><strong>Retro Sound Synthesis:</strong> Web Audio API oscillators producing 8-bit blips and victory fanfares (muted by default).</li>
            </ul>
          </div>

          <div className="bg-[#171329] p-4 rounded-xl border border-[#3D345F]">
            <h3 className="font-semibold text-[#FF776E] mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#FF776E]" /> Accessibility &amp; Standards
            </h3>
            <p className="text-xs text-[#FFF0D7]/75">
              Built with responsive CSS, semantic HTML5, high-contrast WCAG AA colors, visible focus rings, touch targets, and full keyboard navigation support.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-[#3D345F] flex items-center justify-between">
          <span className="text-[11px] text-[#FFF0D7]/60 flex items-center gap-1">
            Built for learners &amp; players <Heart className="w-3 h-3 text-[#FF776E] inline" />
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#FF776E] hover:bg-[#ff8f87] text-[#171329] font-bold text-xs uppercase tracking-wider rounded-lg transition-colors retro-btn"
          >
            Back to Arcade
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Github, Heart } from 'lucide-react';

interface FooterProps {
  onOpenAbout: () => void;
  // Easily configurable repository URL for developer
  githubRepoUrl?: string;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAbout,
  githubRepoUrl = 'https://github.com/Ndala-K-Abigail-Corp/pixel-afterglow',
}) => {
  return (
    <footer className="mt-20 border-t border-[#292342] bg-[#171329] text-[#FFF0D7] py-12 px-4 md:px-8">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        {/* Brand Info */}
        <div className="max-w-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-pixel text-sm text-[#FFF0D7] tracking-tight">PIXEL AFTERGLOW</span>
            <span className="text-xs px-2 py-0.5 rounded bg-[#292342] text-[#FFC66D] font-mono border border-[#3D345F]">
              MVP v1.0
            </span>
          </div>
          <p className="text-xs text-[#56E0CB] font-medium mb-3">
            Old-school joy. New ways to play.
          </p>
          <p className="text-xs text-[#FFF0D7]/70 leading-relaxed">
            A personal game-development project inspired by childhood gaming, 1990s arcade culture, classic consoles, pixel art and the joy of discovering simple games.
          </p>
        </div>

        {/* Links & Attribution */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 text-xs text-[#FFF0D7]/80">
          <button
            onClick={onOpenAbout}
            className="hover:text-[#56E0CB] transition-colors underline underline-offset-4"
          >
            About Pixel Afterglow
          </button>

          {/* Configurable GitHub repo link */}
          <a
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] border border-[#3D345F] hover:border-[#56E0CB] transition-colors"
            title="View project source code on GitHub"
          >
            <Github className="w-4 h-4 text-[#56E0CB]" />
            <span>GitHub Repository</span>
          </a>

          <div className="flex items-center gap-1.5 text-[11px] text-[#FFF0D7]/60">
            <span>Crafted with</span>
            <Heart className="w-3.5 h-3.5 text-[#FF776E] fill-[#FF776E]" />
            <span>&amp; Pixels</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

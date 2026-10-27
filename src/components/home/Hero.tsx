/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Play, Sparkles, ChevronDown } from 'lucide-react';
import { HeroPixelScene } from '../pixel-art/HeroPixelScene';
import { useAudio } from '../../context/AudioContext';

interface HeroProps {
  onLetsPlay: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onLetsPlay }) => {
  const { playClick } = useAudio();

  const handlePlayClick = () => {
    playClick();
    onLetsPlay();
  };

  return (
    <section className="relative pt-8 pb-16 md:py-20 px-4 md:px-8 max-w-6xl mx-auto overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* Left Column: Brand Copy & Actions */}
        <div className="lg:col-span-6 flex flex-col items-start z-10">
          {/* Nostalgic kicker */}
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="w-2 h-2 bg-[#56E0CB] rounded-none rotate-45" />
            <span className="font-pixel text-[11px] md:text-xs text-[#56E0CB] tracking-wider uppercase">
              OLD-SCHOOL JOY · NEW WAYS TO PLAY
            </span>
          </div>

          {/* Primary Headline */}
          <h1 className="font-pixel text-2xl sm:text-3xl md:text-4xl lg:text-[40px] text-[#FFF0D7] tracking-tight leading-[1.3] mb-5">
            A LITTLE PIXEL MAGIC.
          </h1>

          {/* Supporting Copy */}
          <p className="text-base sm:text-lg text-[#FFF0D7]/85 font-normal leading-relaxed mb-8 max-w-xl">
            Your next favourite game is just a click away.
            <span className="block text-sm text-[#FFC66D] mt-2 font-mono">
              Pure gameplay, zero downloads, zero microtransactions.
            </span>
          </p>

          {/* Action Button & Quick Info */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
            <button
              onClick={handlePlayClick}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-[#FF776E] hover:bg-[#ff8f87] text-[#171329] font-bold text-sm md:text-base uppercase tracking-wider rounded-xl font-pixel cursor-pointer retro-btn retro-box-coral focus-visible:ring-4 focus-visible:ring-[#FFF0D7] transition-all"
              aria-label="Let's Play - Explore game collection"
            >
              <Play className="w-4 h-4 fill-[#171329]" />
              <span>LET'S PLAY</span>
            </button>

            <a
              href="#game-collection"
              className="flex items-center justify-center gap-2 px-6 py-4 bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] border border-[#3D345F] hover:border-[#56E0CB] text-xs font-semibold rounded-xl transition-colors"
            >
              <span>Explore Collection</span>
              <ChevronDown className="w-4 h-4 text-[#56E0CB]" />
            </a>
          </div>

          {/* Retro Micro Stats */}
          <div className="mt-10 pt-6 border-t border-[#292342] w-full grid grid-cols-3 gap-4 text-left">
            <div>
              <div className="font-pixel text-xs text-[#FFC66D]">2 GAMES</div>
              <div className="text-[11px] text-[#FFF0D7]/60 mt-0.5 font-sans">Playable Now</div>
            </div>
            <div>
              <div className="font-pixel text-xs text-[#56E0CB]">OFFLINE</div>
              <div className="text-[11px] text-[#FFF0D7]/60 mt-0.5 font-sans">PWA Ready</div>
            </div>
            <div>
              <div className="font-pixel text-xs text-[#FF776E]">0 SEC</div>
              <div className="text-[11px] text-[#FFF0D7]/60 mt-0.5 font-sans">Instant Load</div>
            </div>
          </div>
        </div>

        {/* Right Column: Arcade Cabinet Pixel Art Visual */}
        <div className="lg:col-span-6 w-full flex justify-center">
          <HeroPixelScene />
        </div>
      </div>
    </section>
  );
};

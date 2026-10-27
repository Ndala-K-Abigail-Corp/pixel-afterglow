/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Zap, Shield, RotateCcw } from 'lucide-react';

export const BrandPersonality: React.FC = () => {
  return (
    <section className="py-12 px-4 md:px-8 max-w-6xl mx-auto">
      <div className="bg-[#201A36] border-2 border-[#292342] rounded-2xl p-6 sm:p-10 relative overflow-hidden">
        {/* Decorative corner pixel crosses */}
        <div className="absolute top-3 left-3 text-[#56E0CB]/40 font-pixel text-xs">+</div>
        <div className="absolute top-3 right-3 text-[#FF776E]/40 font-pixel text-xs">+</div>
        <div className="absolute bottom-3 left-3 text-[#FFC66D]/40 font-pixel text-xs">+</div>
        <div className="absolute bottom-3 right-3 text-[#56E0CB]/40 font-pixel text-xs">+</div>

        <div className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-[#FFC66D] tracking-widest uppercase mb-3">
            RETRO PHILOSOPHY
          </p>
          <h2 className="font-pixel text-lg sm:text-xl md:text-2xl text-[#FFF0D7] tracking-tight leading-snug mb-4">
            NO DOWNLOADS. NO DRAMA.<br className="hidden sm:inline" /> JUST ONE MORE ROUND.
          </h2>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/75 leading-relaxed mb-8">
            Remember picking up a controller with a friend on a Saturday afternoon? No account signups, no notifications, no updates to install. Just instant, tactile gameplay.
          </p>

          {/* 3 Playful Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-4 border-t border-[#292342]">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#171329]/60 border border-[#292342]">
              <div className="p-2 rounded-lg bg-[#FF776E]/20 text-[#FF776E] shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-xs text-[#FFF0D7] mb-0.5">Instant Boot</h3>
                <p className="text-[11px] text-[#FFF0D7]/60 leading-normal">Loads in milliseconds on mobile, tablet or PC.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#171329]/60 border border-[#292342]">
              <div className="p-2 rounded-lg bg-[#56E0CB]/20 text-[#56E0CB] shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-xs text-[#FFF0D7] mb-0.5">Pure Privacy</h3>
                <p className="text-[11px] text-[#FFF0D7]/60 leading-normal">Scores stay strictly in your browser storage.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#171329]/60 border border-[#292342]">
              <div className="p-2 rounded-lg bg-[#FFC66D]/20 text-[#FFC66D] shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-xs text-[#FFF0D7] mb-0.5">Instant Rematch</h3>
                <p className="text-[11px] text-[#FFF0D7]/60 leading-normal">Reset with a single tap and settle the score.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

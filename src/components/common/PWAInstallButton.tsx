/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Share, X, CheckCircle, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../../utils/usePWAInstall';
import { useAudio } from '../../context/AudioContext';

export const PWAInstallButton: React.FC = () => {
  const { canInstall, hasNativePrompt, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const { playClick } = useAudio();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Suppress completely if already running in standalone mode
  if (isInstalled || !canInstall) {
    return null;
  }

  const handleClick = async () => {
    playClick();
    if (hasNativePrompt) {
      await triggerInstall();
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292342] hover:bg-[#322B50] text-[#56E0CB] border border-[#56E0CB]/40 hover:border-[#56E0CB] transition-all focus-visible:ring-2 focus-visible:ring-[#56E0CB]"
        title="Install Pixel Afterglow for offline arcade play"
        aria-label="Install Pixel Afterglow application"
      >
        <Download className="w-3.5 h-3.5 text-[#56E0CB]" />
        <span className="hidden sm:inline font-mono">INSTALL APP</span>
      </button>

      {/* iOS Safari Guided Installation Modal */}
      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-sm bg-[#201A36] border-2 border-[#56E0CB] rounded-2xl p-6 shadow-2xl text-[#FFF0D7]">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-1.5 text-[#FFF0D7]/60 hover:text-[#FF776E] rounded-lg"
              aria-label="Close installation guide"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#292342] border border-[#56E0CB] text-[#56E0CB]">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-pixel text-xs text-[#FFF0D7]">INSTALL ON IOS</h3>
                <p className="text-[11px] text-[#56E0CB]">Add to your home screen</p>
              </div>
            </div>

            <ol className="space-y-3 text-xs text-[#FFF0D7]/85 my-4">
              <li className="flex items-start gap-2.5">
                <span className="font-pixel text-[10px] text-[#FFC66D] bg-[#292342] px-2 py-0.5 rounded">1</span>
                <span>Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline mx-1 text-[#56E0CB]" /> in Safari's bottom toolbar.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-pixel text-[10px] text-[#FFC66D] bg-[#292342] px-2 py-0.5 rounded">2</span>
                <span>Scroll down and select <strong>"Add to Home Screen"</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-pixel text-[10px] text-[#FFC66D] bg-[#292342] px-2 py-0.5 rounded">3</span>
                <span>Tap <strong>Add</strong> in the top right to install!</span>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-[#56E0CB] text-[#171329] font-bold text-xs uppercase tracking-wider rounded-xl transition-colors retro-btn font-pixel"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </>
  );
};

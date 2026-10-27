/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { soundManager } from '../utils/soundEffects';

export interface AudioContextType {
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  playMove: (player: 'X' | 'O') => void;
  playWin: () => void;
  playDraw: () => void;
  playClick: () => void;
  playReset: () => void;
  playFlip: () => void;
  playMatch: () => void;
  playMismatch: () => void;
  playBeep: (freq?: number, type?: OscillatorType, duration?: number, volume?: number) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export interface AudioProviderProps {
  children: React.ReactNode;
}

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
  const [isMuted, setIsMutedState] = useState<boolean>(() => soundManager.getIsMuted());

  // Keep state in sync with localStorage and soundManager
  const setMuted = useCallback((muted: boolean) => {
    soundManager.setMuted(muted);
    setIsMutedState(muted);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !soundManager.getIsMuted();
    soundManager.setMuted(next);
    setIsMutedState(next);
  }, []);

  // Sync with cross-tab storage changes if needed
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'pixel_afterglow_sound_muted' && e.newValue !== null) {
        const val = e.newValue === 'true';
        soundManager.setMuted(val);
        setIsMutedState(val);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const playMove = useCallback((player: 'X' | 'O') => {
    soundManager.playMove(player);
  }, []);

  const playWin = useCallback(() => {
    soundManager.playWin();
  }, []);

  const playDraw = useCallback(() => {
    soundManager.playDraw();
  }, []);

  const playClick = useCallback(() => {
    soundManager.playClick();
  }, []);

  const playReset = useCallback(() => {
    soundManager.playReset();
  }, []);

  const playFlip = useCallback(() => {
    soundManager.playFlip();
  }, []);

  const playMatch = useCallback(() => {
    soundManager.playMatch();
  }, []);

  const playMismatch = useCallback(() => {
    soundManager.playMismatch();
  }, []);

  const playBeep = useCallback(
    (freq = 440, type: OscillatorType = 'square', duration = 0.08, volume = 0.08) => {
      soundManager.playBeep(freq, type, duration, volume);
    },
    []
  );

  const value: AudioContextType = {
    isMuted,
    toggleMute,
    setMuted,
    playMove,
    playWin,
    playDraw,
    playClick,
    playReset,
    playFlip,
    playMatch,
    playMismatch,
    playBeep,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

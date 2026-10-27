/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Web Audio API Retro 8-bit sound generator
class SoundController {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pixel_afterglow_sound_muted');
      // Default to muted as specified by requirements
      this.isMuted = stored === null ? true : stored === 'true';
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('pixel_afterglow_sound_muted', String(muted));
    }
    if (!muted) {
      this.playBeep(440, 'square', 0.08, 0.06);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume = 0.08, rampToFreq?: number) {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (rampToFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, rampToFreq), ctx.currentTime + duration);
      }

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // AudioContext might be blocked or inactive
    }
  }

  public playMove(player: 'X' | 'O') {
    if (this.isMuted) return;
    if (player === 'X') {
      // Higher arcade crisp ping
      this.playTone(523.25, 'square', 0.09, 0.08, 659.25);
    } else {
      // Warm retro boop
      this.playTone(392.00, 'square', 0.09, 0.08, 493.88);
    }
  }

  public playWin() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Victorious 4-note retro arpeggio: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.22, 0.12);
      }, i * 90);
    });
  }

  public playDraw() {
    if (this.isMuted) return;
    // Downward gentle slide
    this.playTone(330, 'sawtooth', 0.25, 0.06, 165);
  }

  public playClick() {
    if (this.isMuted) return;
    this.playTone(800, 'square', 0.04, 0.04);
  }

  public playReset() {
    if (this.isMuted) return;
    this.playTone(220, 'square', 0.15, 0.08, 440);
  }

  public playFlip() {
    if (this.isMuted) return;
    this.playTone(480, 'sine', 0.05, 0.06, 620);
  }

  public playMatch() {
    if (this.isMuted) return;
    // Cheerful ascending two-tone jingle: E5 -> A5
    this.playTone(659.25, 'triangle', 0.12, 0.09);
    setTimeout(() => {
      this.playTone(880.00, 'triangle', 0.18, 0.10);
    }, 80);
  }

  public playMismatch() {
    if (this.isMuted) return;
    // Gentle low buzz
    this.playTone(240, 'sawtooth', 0.15, 0.05, 180);
  }

  public playBeep(freq = 440, type: OscillatorType = 'square', duration = 0.08, volume = 0.08) {
    this.playTone(freq, type, duration, volume);
  }
}

export const soundManager = new SoundController();

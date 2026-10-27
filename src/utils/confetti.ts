/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import confetti from 'canvas-confetti';

const AFTERGLOW_PALETTE = ['#FF776E', '#56E0CB', '#FFC66D', '#FFF0D7', '#B388FF'];

/**
 * Fires a dual-cannon retro arcade celebratory confetti burst.
 */
export function fireVictoryConfetti() {
  if (typeof window === 'undefined') return;

  // Center burst
  confetti({
    particleCount: 70,
    spread: 100,
    origin: { y: 0.6 },
    colors: AFTERGLOW_PALETTE,
    shapes: ['square', 'circle'],
    scalar: 1.2,
    disableForReducedMotion: true,
  });

  // Left cannon
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.7 },
      colors: AFTERGLOW_PALETTE,
      shapes: ['square'],
      disableForReducedMotion: true,
    });
  }, 150);

  // Right cannon
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.7 },
      colors: AFTERGLOW_PALETTE,
      shapes: ['square'],
      disableForReducedMotion: true,
    });
  }, 250);
}

/**
 * Fires star shower confetti for high scores / new records.
 */
export function fireStarRecordConfetti() {
  if (typeof window === 'undefined') return;

  const duration = 1800;
  const animationEnd = Date.now() + duration;

  const interval: ReturnType<typeof setInterval> = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    confetti({
      particleCount: 15,
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      origin: {
        x: Math.random(),
        y: Math.random() * 0.4,
      },
      colors: AFTERGLOW_PALETTE,
      shapes: ['star', 'square'],
      scalar: 1.1,
      disableForReducedMotion: true,
    });
  }, 200);
}

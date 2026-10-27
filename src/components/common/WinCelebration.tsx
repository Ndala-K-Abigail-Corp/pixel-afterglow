/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Player } from '../../types/game';

interface WinCelebrationProps {
  winner: Player | null;
  isDraw: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
}

export const WinCelebration: React.FC<WinCelebrationProps> = ({ winner, isDraw }) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate retro square confetti particles
    const colors = ['#FF776E', '#56E0CB', '#FFC66D', '#FFF0D7'];
    const count = winner ? 36 : 14;
    const items: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() * 40 - 20),
      y: 50 + (Math.random() * 20 - 10),
      color: colors[i % colors.length],
      size: Math.floor(Math.random() * 6) + 6,
      vx: (Math.random() - 0.5) * 80,
      vy: -Math.random() * 60 - 20,
    }));
    setParticles(items);

    const timer = setTimeout(() => {
      setParticles([]);
    }, 2800);
    return () => clearTimeout(timer);
  }, [winner, isDraw]);

  if (particles.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute animate-bounce"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            boxShadow: `0 0 6px ${p.color}`,
            transform: `translate(${p.vx}px, ${p.vy}px)`,
            transition: 'all 2.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        />
      ))}
    </div>
  );
};

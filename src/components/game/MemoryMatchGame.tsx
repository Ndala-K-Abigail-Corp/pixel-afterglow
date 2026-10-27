/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Trophy,
  Clock,
  Sparkles,
  Zap,
  CheckCircle2,
  Medal,
} from 'lucide-react';
import { MemoryCard, MemoryStats } from '../../types/game';
import {
  initializeMemoryGame,
  isPairMatch,
  formatSeconds,
  loadMemoryStats,
  saveMemoryRecord,
  clearMemoryStats,
} from '../../logic/memoryMatch';
import { WinCelebration } from '../common/WinCelebration';
import { VictoryCelebrationModal } from '../common/VictoryCelebrationModal';
import { useAudio } from '../../context/AudioContext';

interface MemoryMatchGameProps {
  onBackToHome: () => void;
}

/**
 * Render custom cohesive retro pixel SVG icons for each symbol
 */
const MemorySymbolIcon: React.FC<{ symbolId: string; color: string; className?: string }> = ({
  symbolId,
  color,
  className = 'w-9 h-9',
}) => {
  switch (symbolId) {
    case 'heart':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h3v2H3z M10 2h3v2h-3z M2 4h12v3H2z M3 7h10v2H3z M4 9h8v2H4z M5 11h6v2H5z M7 13h2v2H7z" />
          <rect x="4" y="4" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
        </svg>
      );
    case 'gem':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 2h6v2H5z M3 4h10v2H3z M2 6h12v2H2z M3 8h10v2H3z M5 10h6v2H5z M7 12h2v2H7z" />
          <rect x="5" y="4" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M7 1h2v3H7z M3 5h10v2H3z M5 7h6v2H5z M4 9h8v2H4z M2 11h4v2H2z M10 11h4v2h-4z M1 13h3v2H1z M12 13h3v2h-3z" />
          <rect x="7" y="5" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    case 'potion':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M6 1h4v2H6z M7 3h2v3H7z M4 6h8v2H4z M3 8h10v6H3z M5 14h6v2H5z" />
          <rect x="5" y="9" width="2" height="2" fill="#FFF0D7" opacity="0.8" />
          <rect x="8" y="11" width="2" height="2" fill="#FFF0D7" opacity="0.6" />
        </svg>
      );
    case 'gamepad':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 4h12v8H2z M1 5h1v6H1z M14 5h1v6h-1z" />
          {/* D-pad cutout */}
          <rect x="4" y="6" width="3" height="1" fill="#171329" />
          <rect x="5" y="5" width="1" height="3" fill="#171329" />
          {/* Action buttons cutout */}
          <rect x="10" y="6" width="1" height="1" fill="#171329" />
          <rect x="12" y="7" width="1" height="1" fill="#171329" />
        </svg>
      );
    case 'ghost':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 1h6v2H5z M3 3h10v9H3z M2 5h12v7H2z M3 14h2v1H3z M7 14h2v1H7z M11 14h2v1h-2z" />
          {/* Eyes */}
          <rect x="5" y="6" width="2" height="2" fill="#171329" />
          <rect x="9" y="6" width="2" height="2" fill="#171329" />
        </svg>
      );
    case 'key':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M10 2h4v4h-4z M11 3h2v2h-2z M7 5h4v2H7z M3 7h5v2H3z M4 9h2v2H4z M7 9h2v2H7z" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M8 1h3v4H8z M6 5h5v2H6z M4 7h6v2H4z M2 9h6v2H2z M4 11h3v2H4z M5 13h2v2H5z" />
          <rect x="7" y="6" width="2" height="2" fill="#FFF0D7" />
        </svg>
      );
    default:
      return null;
  }
};

export const MemoryMatchGame: React.FC<MemoryMatchGameProps> = ({ onBackToHome }) => {
  const { playFlip, playMatch, playMismatch, playWin, playReset, playClick } = useAudio();

  const [cards, setCards] = useState<MemoryCard[]>(() => initializeMemoryGame());
  const [firstFlippedIndex, setFirstFlippedIndex] = useState<number | null>(null);
  const [secondFlippedIndex, setSecondFlippedIndex] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [moves, setMoves] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [stats, setStats] = useState<MemoryStats>(() => loadMemoryStats());
  const [isGameCompleted, setIsGameCompleted] = useState<boolean>(false);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const matchedPairsCount = cards.filter((c) => c.isMatched).length / 2;
  const totalPairs = cards.length / 2;

  // Active game timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isTimerRunning && !isGameCompleted) {
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isTimerRunning, isGameCompleted]);

  // Restart game
  const handleRestart = useCallback(() => {
    setIsModalOpen(false);
    playReset();
    setCards(initializeMemoryGame());
    setFirstFlippedIndex(null);
    setSecondFlippedIndex(null);
    setIsLocked(false);
    setMoves(0);
    setElapsedTime(0);
    setIsTimerRunning(false);
    setIsGameCompleted(false);
    setIsNewRecord(false);
  }, [playReset]);

  // Handle card click
  const handleCardClick = useCallback(
    (index: number) => {
      const card = cards[index];

      // Guard: already flipped, already matched, board locked, or game complete
      if (isLocked || card.isFlipped || card.isMatched || isGameCompleted) {
        return;
      }

      // Start timer on first interaction
      if (!isTimerRunning && moves === 0 && firstFlippedIndex === null) {
        setIsTimerRunning(true);
      }

      playFlip();

      // Case 1: First card of the pair
      if (firstFlippedIndex === null) {
        setFirstFlippedIndex(index);
        setCards((prev) =>
          prev.map((c, i) => (i === index ? { ...c, isFlipped: true } : c))
        );
        return;
      }

      // Case 2: Second card of the pair
      setSecondFlippedIndex(index);
      setCards((prev) =>
        prev.map((c, i) => (i === index ? { ...c, isFlipped: true } : c))
      );
      setMoves((m) => m + 1);

      const firstCard = cards[firstFlippedIndex];
      const secondCard = card;

      if (isPairMatch(firstCard, secondCard)) {
        // MATCH!
        playMatch();
        setCards((prev) =>
          prev.map((c, i) =>
            i === firstFlippedIndex || i === index
              ? { ...c, isFlipped: true, isMatched: true }
              : c
          )
        );
        setFirstFlippedIndex(null);
        setSecondFlippedIndex(null);

        // Check if all pairs are now matched
        const updatedMatchedCount = matchedPairsCount + 1;
        if (updatedMatchedCount === totalPairs) {
          setIsGameCompleted(true);
          setIsTimerRunning(false);
          playWin();

          // Check for personal record
          const finalTime = elapsedTime;
          const finalMoves = moves + 1;
          const wasRecord =
            stats.bestTime === null ||
            finalTime < stats.bestTime ||
            finalMoves < (stats.bestMoves ?? Infinity);
          setIsNewRecord(wasRecord);

          const updated = saveMemoryRecord(finalTime, finalMoves);
          setStats(updated);

          setTimeout(() => {
            setIsModalOpen(true);
          }, 350);
        }
      } else {
        // MISMATCH: Lock board briefly so user can memorize the cards, then flip back
        setIsLocked(true);
        setTimeout(() => {
          playMismatch();
          setCards((prev) =>
            prev.map((c, i) =>
              i === firstFlippedIndex || i === index
                ? { ...c, isFlipped: false }
                : c
            )
          );
          setFirstFlippedIndex(null);
          setSecondFlippedIndex(null);
          setIsLocked(false);
        }, 850);
      }
    },
    [
      cards,
      firstFlippedIndex,
      isLocked,
      isGameCompleted,
      isTimerRunning,
      moves,
      matchedPairsCount,
      totalPairs,
      elapsedTime,
      stats,
      playFlip,
      playMatch,
      playMismatch,
      playWin,
    ]
  );

  return (
    <div className="py-6 px-4 md:px-8 max-w-4xl mx-auto min-h-[calc(100vh-140px)] flex flex-col justify-between">
      {/* Victory Celebration Particles */}
      {isGameCompleted && <WinCelebration winner="X" isDraw={false} />}

      {/* Top Header & Breadcrumb */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={() => {
              playClick();
              onBackToHome();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] hover:text-[#56E0CB] border border-[#3D345F] transition-colors text-xs font-semibold focus-visible:ring-2 focus-visible:ring-[#56E0CB]"
            aria-label="Return to arcade collection"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Arcade</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="font-pixel text-[10px] text-[#56E0CB] uppercase tracking-wider">
              CARTRIDGE #02
            </span>
            <span className="w-2 h-2 rounded-full bg-[#56E0CB] animate-pulse" />
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="text-center mb-6">
          <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#FFF0D7] tracking-tight mb-2">
            MEMORY MATCH
          </h1>
          <p className="text-xs sm:text-sm text-[#FFC66D] font-mono">
            Uncover the Paired Pixel Sprites · Train Your Visual Recall
          </p>
        </div>

        {/* Live HUD Dashboard: Progress, Moves, Elapsed Time & Best Records */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto mb-6">
          {/* Pairs Matched */}
          <div className="p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center">
            <div className="text-[10px] font-pixel text-[#56E0CB] uppercase tracking-wider mb-1">
              PAIRS
            </div>
            <div className="font-pixel text-lg sm:text-xl text-[#FFF0D7]">
              {matchedPairsCount} / {totalPairs}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-1">FOUND</div>
          </div>

          {/* Moves Count */}
          <div className="p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center">
            <div className="text-[10px] font-pixel text-[#FF776E] uppercase tracking-wider mb-1">
              MOVES
            </div>
            <div className="font-pixel text-lg sm:text-xl text-[#FFF0D7]">
              {moves}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-1">ATTEMPTS</div>
          </div>

          {/* Live Timer */}
          <div className="p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center">
            <div className="text-[10px] font-pixel text-[#FFC66D] uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3 text-[#FFC66D]" />
              <span>TIME</span>
            </div>
            <div className="font-pixel text-lg sm:text-xl text-[#FFF0D7] font-mono">
              {formatSeconds(elapsedTime)}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-1">ELAPSED</div>
          </div>

          {/* Best Record */}
          <div className="p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center">
            <div className="text-[10px] font-pixel text-[#FFF0D7]/75 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
              <Medal className="w-3 h-3 text-[#FFC66D]" />
              <span>RECORD</span>
            </div>
            <div className="text-xs sm:text-sm font-semibold text-[#FFC66D] mt-1 font-mono">
              {stats.bestTime !== null ? `${formatSeconds(stats.bestTime)}` : '—'}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-0.5 font-mono">
              {stats.bestMoves !== null ? `${stats.bestMoves} moves` : 'No wins yet'}
            </div>
          </div>
        </div>

        {/* Completion Banner */}
        {isGameCompleted && (
          <div
            className="max-w-xl mx-auto mb-6 p-4 rounded-xl bg-[#56E0CB]/15 border-2 border-[#56E0CB] text-[#56E0CB] text-center animate-pulse"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-2 font-pixel text-sm sm:text-base text-[#FFF0D7] mb-1">
              <Trophy className="w-5 h-5 text-[#FFC66D]" />
              <span>STAGE CLEARED! ALL PAIRS FOUND!</span>
              <Sparkles className="w-5 h-5 text-[#FFC66D]" />
            </div>
            <p className="text-xs text-[#FFF0D7]/85 font-mono">
              Finished in {formatSeconds(elapsedTime)} with {moves} moves.
              {isNewRecord && (
                <span className="block text-[#FFC66D] font-bold mt-1">
                  ★ NEW PERSONAL RECORD ACHIEVED! ★
                </span>
              )}
            </p>
          </div>
        )}

        {/* 4x4 Responsive Card Grid */}
        <div
          className="grid grid-cols-4 gap-2.5 sm:gap-3.5 max-w-[420px] sm:max-w-[480px] mx-auto select-none"
          role="grid"
          aria-label="Memory match 4 by 4 card grid"
        >
          {cards.map((card, index) => {
            const isRevealed = card.isFlipped || card.isMatched;

            return (
              <button
                key={card.id}
                role="gridcell"
                type="button"
                onClick={() => handleCardClick(index)}
                disabled={card.isMatched || isLocked || card.isFlipped}
                aria-label={`Card ${index + 1}: ${
                  isRevealed
                    ? `${card.name}${card.isMatched ? ', matched' : ''}`
                    : 'face down'
                }`}
                className={`relative aspect-[3/4] rounded-xl flex flex-col items-center justify-center p-2 transition-all duration-200 outline-none ${
                  card.isMatched
                    ? 'bg-[#171329] border-2 border-[#56E0CB] opacity-90 scale-[0.98] shadow-inner'
                    : card.isFlipped
                    ? 'bg-[#201A36] border-2 border-[#FFC66D] shadow-lg scale-100'
                    : 'bg-[#292342] hover:bg-[#322B50] border-2 border-[#3D345F] hover:border-[#56E0CB] cursor-pointer hover:-translate-y-0.5 retro-box-purple'
                } focus-visible:ring-4 focus-visible:ring-[#56E0CB]`}
              >
                {isRevealed ? (
                  // Card Face-Up Content
                  <div className="flex flex-col items-center justify-center gap-1.5 animate-in zoom-in-75 duration-150">
                    <MemorySymbolIcon symbolId={card.symbolId} color={card.color} className="w-8 h-8 sm:w-10 sm:h-10" />
                    <span
                      className="text-[9px] sm:text-[10px] font-semibold text-[#FFF0D7]/90 text-center leading-none tracking-tight hidden sm:block truncate max-w-full"
                    >
                      {card.name}
                    </span>
                    {card.isMatched && (
                      <CheckCircle2 className="w-3 h-3 text-[#56E0CB] absolute top-1.5 right-1.5" />
                    )}
                  </div>
                ) : (
                  // Card Face-Down Back Artwork
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-6 h-6 rounded-md bg-[#201A36] border border-[#3D345F] flex items-center justify-center opacity-80">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#56E0CB]" fill="currentColor">
                        <rect x="7" y="2" width="2" height="3" />
                        <rect x="7" y="11" width="2" height="3" />
                        <rect x="2" y="7" width="3" height="2" />
                        <rect x="11" y="7" width="3" height="2" />
                        <rect x="6" y="6" width="4" height="4" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="max-w-md mx-auto w-full mt-8 pt-4 border-t border-[#292342] flex items-center justify-between gap-3">
        <button
          onClick={handleRestart}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#56E0CB] hover:bg-[#68e9d5] text-[#171329] font-bold text-xs uppercase tracking-wider font-pixel retro-btn retro-box-teal focus-visible:ring-2 focus-visible:ring-[#FFF0D7] transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{isGameCompleted ? 'PLAY AGAIN' : 'SHUFFLE &amp; RESTART'}</span>
        </button>
      </div>

      {/* Victory Celebration Modal */}
      <VictoryCelebrationModal
        isOpen={isModalOpen && isGameCompleted}
        onClose={() => setIsModalOpen(false)}
        onPlayAgain={handleRestart}
        onBackToArcade={onBackToHome}
        gameTitle="MEMORY MATCH"
        headline={isNewRecord ? 'NEW RECORD SET!' : 'STAGE CLEARED!'}
        subheadline="All 8 paired pixel sprites successfully matched!"
        isNewRecord={isNewRecord}
        stats={[
          { label: 'TIME', value: formatSeconds(elapsedTime), accent: '#FFC66D' },
          { label: 'MOVES', value: moves, accent: '#56E0CB' },
          { label: 'PAIRS', value: '8 / 8', accent: '#FF776E' },
        ]}
      />
    </div>
  );
};

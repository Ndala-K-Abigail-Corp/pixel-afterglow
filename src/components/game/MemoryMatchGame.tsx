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
  CheckCircle2,
  Play,
  SlidersHorizontal,
  Crosshair,
  AlertTriangle,
  Layers,
  Timer,
} from 'lucide-react';
import {
  MemoryCard,
  MemoryDifficulty,
  MemoryGameMode,
  MemoryGameOutcome,
  MemoryStats,
} from '../../types/game';
import {
  MEMORY_DIFFICULTY_CONFIGS,
  getDifficultyConfig,
  initializeMemoryGame,
  isPairMatch,
  evaluateMemoryOutcome,
  formatSeconds,
  loadMemoryStats,
  saveMemoryRecord,
} from '../../logic/memoryMatch';
import { WinCelebration } from '../common/WinCelebration';
import { VictoryCelebrationModal } from '../common/VictoryCelebrationModal';
import { useAudio } from '../../context/AudioContext';

interface MemoryMatchGameProps {
  onBackToHome: () => void;
}

/**
 * Render custom cohesive retro pixel SVG icons for all 10 card symbols
 */
const MemorySymbolIcon: React.FC<{ symbolId: string; color: string; className?: string }> = ({
  symbolId,
  color,
  className = 'w-8 h-8',
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
          <rect x="4" y="6" width="3" height="1" fill="#171329" />
          <rect x="5" y="5" width="1" height="3" fill="#171329" />
          <rect x="10" y="6" width="1" height="1" fill="#171329" />
          <rect x="12" y="7" width="1" height="1" fill="#171329" />
        </svg>
      );
    case 'ghost':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M5 1h6v2H5z M3 3h10v9H3z M2 5h12v7H2z M3 14h2v1H3z M7 14h2v1H7z M11 14h2v1h-2z" />
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
    case 'crown':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M2 4h2v3h2V4h4v3h2V4h2v8H2z M3 13h10v1H3z" />
          <rect x="4" y="8" width="2" height="2" fill="#FF776E" />
          <rect x="7" y="7" width="2" height="2" fill="#56E0CB" />
          <rect x="10" y="8" width="2" height="2" fill="#FF776E" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 16 16" className={className} fill={color} aria-hidden="true">
          <path d="M3 2h10v6H3z M4 8h8v3H4z M6 11h4v2H6z M7 13h2v2H7z" />
          <rect x="7" y="4" width="2" height="7" fill="#FFF0D7" opacity="0.85" />
          <rect x="5" y="6" width="6" height="2" fill="#FFF0D7" opacity="0.85" />
        </svg>
      );
    default:
      return null;
  }
};

export const MemoryMatchGame: React.FC<MemoryMatchGameProps> = ({ onBackToHome }) => {
  const { playFlip, playMatch, playMismatch, playWin, playDraw, playReset, playClick } = useAudio();

  // Screen phase: 'setup' lets user pick Mode & Difficulty; 'playing' renders the active board
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [mode, setMode] = useState<MemoryGameMode>('time-challenge');
  const [difficulty, setDifficulty] = useState<MemoryDifficulty>('medium');

  const config = getDifficultyConfig(difficulty);

  // Active game state
  const [cards, setCards] = useState<MemoryCard[]>(() => initializeMemoryGame('medium'));
  const [firstFlippedIndex, setFirstFlippedIndex] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [attemptsUsed, setAttemptsUsed] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(config.timeLimitSeconds);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<MemoryGameOutcome>('playing');
  const [stats, setStats] = useState<MemoryStats>(() => loadMemoryStats());
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [confirmExitTarget, setConfirmExitTarget] = useState<'setup' | 'home' | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Refs to prevent stale callbacks, duplicate timers, or multiple game-ending triggers
  const sessionIdRef = useRef<number>(0);
  const mismatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameEndedRef = useRef<boolean>(false);

  const matchedPairsCount = cards.filter((c) => c.isMatched).length / 2;
  const totalPairs = config.pairs;
  const attemptsRemaining = Math.max(0, config.maxAttempts - attemptsUsed);
  const hasProgressInCurrentGame =
    phase === 'playing' &&
    outcome === 'playing' &&
    (attemptsUsed > 0 || firstFlippedIndex !== null || isTimerRunning);

  // Helper to clear all active timers & timeouts safely
  const clearAllAsyncTimers = useCallback(() => {
    if (mismatchTimeoutRef.current) {
      clearTimeout(mismatchTimeoutRef.current);
      mismatchTimeoutRef.current = null;
    }
    if (modalTimeoutRef.current) {
      clearTimeout(modalTimeoutRef.current);
      modalTimeoutRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllAsyncTimers();
    };
  }, [clearAllAsyncTimers]);

  // Reset and start a fresh board for given mode and difficulty
  const startFreshGame = useCallback(
    (targetMode: MemoryGameMode, targetDifficulty: MemoryDifficulty, playSound = true) => {
      sessionIdRef.current += 1;
      gameEndedRef.current = false;
      clearAllAsyncTimers();

      if (playSound) {
        playReset();
      }

      const targetConfig = getDifficultyConfig(targetDifficulty);
      setMode(targetMode);
      setDifficulty(targetDifficulty);
      setCards(initializeMemoryGame(targetDifficulty));
      setFirstFlippedIndex(null);
      setIsLocked(false);
      setAttemptsUsed(0);
      setRemainingSeconds(targetConfig.timeLimitSeconds);
      setIsTimerRunning(false);
      setOutcome('playing');
      setIsNewRecord(false);
      setIsModalOpen(false);
      setConfirmExitTarget(null);
      setLiveAnnouncement(
        `Started ${targetMode === 'time-challenge' ? 'Time Challenge' : 'Limited Moves'} on ${
          targetConfig.label
        } difficulty with ${targetConfig.pairs} pairs.`
      );
      setPhase('playing');
    },
    [clearAllAsyncTimers, playReset]
  );

  // Trigger game over due to timer expiration in Time Challenge mode
  const handleTimeExpired = useCallback(() => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    clearAllAsyncTimers();
    setIsTimerRunning(false);
    setIsLocked(false);
    setOutcome('lost-time');
    playDraw();
    setLiveAnnouncement('Game over! Time ran out before all pairs were matched.');
    modalTimeoutRef.current = setTimeout(() => {
      setIsModalOpen(true);
    }, 250);
  }, [clearAllAsyncTimers, playDraw]);

  // Manage single countdown interval for Time Challenge mode
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (phase !== 'playing' || mode !== 'time-challenge' || !isTimerRunning || outcome !== 'playing') {
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [phase, mode, isTimerRunning, outcome, handleTimeExpired]);

  // Handle card selection
  const handleCardClick = useCallback(
    (index: number) => {
      const card = cards[index];

      // Guard: prevent selection if locked, already flipped, already matched, or game over
      if (
        phase !== 'playing' ||
        isLocked ||
        !card ||
        card.isFlipped ||
        card.isMatched ||
        outcome !== 'playing' ||
        gameEndedRef.current
      ) {
        return;
      }

      // Start countdown on first flip in Time Challenge mode
      if (mode === 'time-challenge' && !isTimerRunning && attemptsUsed === 0 && firstFlippedIndex === null) {
        setIsTimerRunning(true);
      }

      playFlip();

      // First card of the pair
      if (firstFlippedIndex === null) {
        setFirstFlippedIndex(index);
        setCards((prev) => prev.map((c, i) => (i === index ? { ...c, isFlipped: true } : c)));
        return;
      }

      // Guard against clicking the exact same card twice
      if (firstFlippedIndex === index) {
        return;
      }

      const currentSessionId = sessionIdRef.current;
      const firstCard = cards[firstFlippedIndex];
      const secondCard = card;
      const nextAttemptsUsed = attemptsUsed + 1;
      const nextAttemptsRemaining = Math.max(0, config.maxAttempts - nextAttemptsUsed);

      // Reveal second card and count 1 attempt for the two-card selection
      setCards((prev) => prev.map((c, i) => (i === index ? { ...c, isFlipped: true } : c)));
      setAttemptsUsed(nextAttemptsUsed);

      if (isPairMatch(firstCard, secondCard)) {
        // MATCH!
        playMatch();
        const updatedMatchedPairs = matchedPairsCount + 1;

        setCards((prev) =>
          prev.map((c, i) =>
            i === firstFlippedIndex || i === index
              ? { ...c, isFlipped: true, isMatched: true }
              : c
          )
        );
        setFirstFlippedIndex(null);

        const nextOutcome = evaluateMemoryOutcome({
          mode,
          matchedPairs: updatedMatchedPairs,
          totalPairs,
          remainingSeconds,
          attemptsUsed: nextAttemptsUsed,
          maxAttempts: config.maxAttempts,
        });

        if (nextOutcome === 'won' && !gameEndedRef.current) {
          gameEndedRef.current = true;
          clearAllAsyncTimers();
          setIsTimerRunning(false);
          setOutcome('won');
          playWin();

          const timeTaken =
            mode === 'time-challenge'
              ? Math.max(1, config.timeLimitSeconds - remainingSeconds)
              : 0;

          const wasRecord =
            (mode === 'time-challenge' &&
              (stats.bestTime === null || timeTaken < stats.bestTime)) ||
            stats.bestMoves === null ||
            nextAttemptsUsed < stats.bestMoves;

          setIsNewRecord(wasRecord);
          const updatedStats = saveMemoryRecord(
            mode === 'time-challenge' ? timeTaken : stats.bestTime ?? timeTaken,
            nextAttemptsUsed
          );
          setStats(updatedStats);
          setLiveAnnouncement(
            `Matched ${secondCard.name}! All ${totalPairs} pairs matched! You win!`
          );

          modalTimeoutRef.current = setTimeout(() => {
            if (sessionIdRef.current === currentSessionId) {
              setIsModalOpen(true);
            }
          }, 300);
        } else {
          setLiveAnnouncement(
            `Matched ${secondCard.name}! ${updatedMatchedPairs} of ${totalPairs} pairs found.`
          );
        }
      } else {
        // MISMATCH
        setIsLocked(true);

        // Check if Limited Moves just ran out of attempts on this mismatch
        const nextOutcome = evaluateMemoryOutcome({
          mode,
          matchedPairs: matchedPairsCount,
          totalPairs,
          remainingSeconds,
          attemptsUsed: nextAttemptsUsed,
          maxAttempts: config.maxAttempts,
        });

        if (nextOutcome === 'lost-moves') {
          setLiveAnnouncement(
            `No match between ${firstCard.name} and ${secondCard.name}. Zero attempts remaining.`
          );
        } else if (mode === 'limited-moves') {
          setLiveAnnouncement(
            `No match. ${nextAttemptsRemaining} ${
              nextAttemptsRemaining === 1 ? 'attempt' : 'attempts'
            } remaining.`
          );
        } else {
          setLiveAnnouncement(`No match between ${firstCard.name} and ${secondCard.name}.`);
        }

        mismatchTimeoutRef.current = setTimeout(() => {
          if (sessionIdRef.current !== currentSessionId) return;

          playMismatch();
          setCards((prev) =>
            prev.map((c, i) =>
              i === firstFlippedIndex || i === index ? { ...c, isFlipped: false } : c
            )
          );
          setFirstFlippedIndex(null);
          setIsLocked(false);

          if (nextOutcome === 'lost-moves' && !gameEndedRef.current) {
            gameEndedRef.current = true;
            clearAllAsyncTimers();
            setIsTimerRunning(false);
            setOutcome('lost-moves');
            playDraw();
            setLiveAnnouncement('Game over! You ran out of attempts before matching all pairs.');
            modalTimeoutRef.current = setTimeout(() => {
              if (sessionIdRef.current === currentSessionId) {
                setIsModalOpen(true);
              }
            }, 200);
          }
        }, 750);
      }
    },
    [
      cards,
      phase,
      isLocked,
      outcome,
      mode,
      isTimerRunning,
      attemptsUsed,
      firstFlippedIndex,
      config.maxAttempts,
      config.timeLimitSeconds,
      matchedPairsCount,
      totalPairs,
      remainingSeconds,
      stats.bestTime,
      stats.bestMoves,
      playFlip,
      playMatch,
      playMismatch,
      playWin,
      playDraw,
      clearAllAsyncTimers,
    ]
  );

  // Request navigation to Setup or Arcade Home (with confirmation if game is in progress)
  const handleRequestExit = (target: 'setup' | 'home') => {
    playClick();
    if (hasProgressInCurrentGame) {
      setConfirmExitTarget(target);
      return;
    }
    sessionIdRef.current += 1;
    clearAllAsyncTimers();
    setIsTimerRunning(false);
    if (target === 'setup') {
      setPhase('setup');
    } else {
      onBackToHome();
    }
  };

  const confirmExit = () => {
    const target = confirmExitTarget;
    setConfirmExitTarget(null);
    sessionIdRef.current += 1;
    clearAllAsyncTimers();
    setIsTimerRunning(false);
    playClick();
    if (target === 'setup') {
      setPhase('setup');
    } else if (target === 'home') {
      onBackToHome();
    }
  };

  // Determine responsive grid classes based on difficulty (6, 8, or 10 pairs)
  const getGridLayoutClasses = () => {
    if (difficulty === 'easy') {
      // 12 cards: 3x4 on mobile, 4x3 on tablet/desktop
      return 'grid-cols-3 sm:grid-cols-4 max-w-[330px] sm:max-w-[440px]';
    }
    if (difficulty === 'hard') {
      // 20 cards: 4x5 on mobile (comfortable touch targets), 5x4 on tablet/desktop
      return 'grid-cols-4 sm:grid-cols-5 max-w-[360px] sm:max-w-[540px]';
    }
    // 16 cards (medium): 4x4 on all viewports
    return 'grid-cols-4 max-w-[350px] sm:max-w-[460px]';
  };

  // Build stats and messaging for Win / Loss modal
  const timeUsedSeconds = Math.max(0, config.timeLimitSeconds - remainingSeconds);
  const modalStats =
    mode === 'time-challenge'
      ? outcome === 'won'
        ? [
            { label: 'TIME USED', value: formatSeconds(timeUsedSeconds), accent: '#56E0CB' },
            { label: 'TIME LEFT', value: formatSeconds(remainingSeconds), accent: '#FFC66D' },
            { label: 'ATTEMPTS', value: attemptsUsed, accent: '#FF776E' },
          ]
        : [
            { label: 'TIME LEFT', value: '00:00', accent: '#FF776E' },
            { label: 'PAIRS FOUND', value: `${matchedPairsCount} / ${totalPairs}`, accent: '#56E0CB' },
            { label: 'ATTEMPTS', value: attemptsUsed, accent: '#FFC66D' },
          ]
      : outcome === 'won'
      ? [
          { label: 'USED', value: `${attemptsUsed} / ${config.maxAttempts}`, accent: '#56E0CB' },
          { label: 'REMAINING', value: attemptsRemaining, accent: '#FFC66D' },
          { label: 'PAIRS', value: `${totalPairs} / ${totalPairs}`, accent: '#FF776E' },
        ]
      : [
          { label: 'USED', value: `${attemptsUsed} / ${config.maxAttempts}`, accent: '#FF776E' },
          { label: 'REMAINING', value: 0, accent: '#FFC66D' },
          { label: 'PAIRS FOUND', value: `${matchedPairsCount} / ${totalPairs}`, accent: '#56E0CB' },
        ];

  const modalHeadline =
    outcome === 'won'
      ? isNewRecord
        ? 'NEW RECORD SET!'
        : 'STAGE CLEARED!'
      : outcome === 'lost-time'
      ? "TIME'S UP!"
      : 'OUT OF MOVES!';

  const modalSubheadline =
    outcome === 'won'
      ? mode === 'time-challenge'
        ? `Matched all ${totalPairs} pairs in ${formatSeconds(timeUsedSeconds)} with ${formatSeconds(
            remainingSeconds
          )} to spare!`
        : `Matched all ${totalPairs} pairs using ${attemptsUsed} of ${config.maxAttempts} attempts (${attemptsRemaining} remaining)!`
      : outcome === 'lost-time'
      ? `The ${formatSeconds(config.timeLimitSeconds)} countdown expired with ${
          totalPairs - matchedPairsCount
        } ${totalPairs - matchedPairsCount === 1 ? 'pair' : 'pairs'} still hidden.`
      : `All ${config.maxAttempts} allowed attempts were used with ${
          totalPairs - matchedPairsCount
        } ${totalPairs - matchedPairsCount === 1 ? 'pair' : 'pairs'} still unmatched.`;

  // ============================================================================
  // RENDER 1: SETUP SCREEN (Mode & Difficulty Selection)
  // ============================================================================
  if (phase === 'setup') {
    return (
      <div className="py-4 sm:py-8 px-3 sm:px-6 md:px-8 max-w-4xl mx-auto">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between gap-2 mb-5 sm:mb-8">
          <button
            type="button"
            onClick={() => {
              playClick();
              onBackToHome();
            }}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] hover:text-[#56E0CB] border border-[#3D345F] transition-colors text-xs font-semibold cursor-pointer"
            aria-label="Return to arcade collection"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to Arcade</span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-pixel text-[9px] sm:text-[10px] text-[#56E0CB] uppercase tracking-wider">
              CARTRIDGE #02
            </span>
            <span className="w-2 h-2 rounded-full bg-[#56E0CB] motion-safe:animate-pulse" />
          </div>
        </div>

        {/* Game Title & Intro */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="font-pixel text-lg sm:text-2xl md:text-3xl text-[#FFF0D7] tracking-tight mb-2">
            MEMORY MATCH
          </h1>
          <p className="text-xs sm:text-sm text-[#FFF0D7]/80 max-w-lg mx-auto leading-relaxed">
            Flip retro arcade cards two at a time to uncover matching pixel pairs. Choose your challenge mode and board size below.
          </p>
        </div>

        {/* Step 1: Select Game Mode */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-pixel text-[10px] sm:text-xs text-[#56E0CB] uppercase tracking-wider">
              1. SELECT GAME MODE
            </h2>
            <span className="text-[11px] text-[#FFF0D7]/60 font-sans">
              Active: <strong className="text-[#FFC66D]">{mode === 'time-challenge' ? 'Time Challenge' : 'Limited Moves'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" role="radiogroup" aria-label="Game Mode">
            {/* Mode A: Time Challenge */}
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'time-challenge'}
              onClick={() => {
                playClick();
                setMode('time-challenge');
              }}
              className={`text-left p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                mode === 'time-challenge'
                  ? 'bg-[#292342] border-[#56E0CB] retro-box-teal'
                  : 'bg-[#201A36] border-[#3D345F] hover:border-[#56E0CB]/60 opacity-85 hover:opacity-100'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="inline-flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-[#171329] border border-[#56E0CB]/50 text-[#56E0CB]">
                      <Timer className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="font-sans font-bold text-base sm:text-lg text-[#FFF0D7]">
                      Time Challenge
                    </span>
                  </div>
                  <span
                    className={`text-[9px] font-pixel px-2 py-1 rounded-md border ${
                      mode === 'time-challenge'
                        ? 'bg-[#56E0CB] text-[#171329] border-[#56E0CB]'
                        : 'bg-[#171329] text-[#FFF0D7]/60 border-[#3D345F]'
                    }`}
                  >
                    {mode === 'time-challenge' ? 'SELECTED' : 'MODE A'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#FFF0D7]/80 leading-relaxed mb-3">
                  Match every pair before the countdown reaches zero. The clock starts on your first card flip.
                </p>
              </div>
              <div className="pt-2.5 border-t border-[#3D345F]/80 flex items-center justify-between text-xs text-[#56E0CB] font-medium">
                <span>Countdown Limit</span>
                <span className="font-bold">{config.timeLimitSeconds} Seconds ({formatSeconds(config.timeLimitSeconds)})</span>
              </div>
            </button>

            {/* Mode B: Limited Moves */}
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'limited-moves'}
              onClick={() => {
                playClick();
                setMode('limited-moves');
              }}
              className={`text-left p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                mode === 'limited-moves'
                  ? 'bg-[#292342] border-[#FF776E] retro-box-coral'
                  : 'bg-[#201A36] border-[#3D345F] hover:border-[#FF776E]/60 opacity-85 hover:opacity-100'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="inline-flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-[#171329] border border-[#FF776E]/50 text-[#FF776E]">
                      <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="font-sans font-bold text-base sm:text-lg text-[#FFF0D7]">
                      Limited Moves
                    </span>
                  </div>
                  <span
                    className={`text-[9px] font-pixel px-2 py-1 rounded-md border ${
                      mode === 'limited-moves'
                        ? 'bg-[#FF776E] text-[#171329] border-[#FF776E]'
                        : 'bg-[#171329] text-[#FFF0D7]/60 border-[#3D345F]'
                    }`}
                  >
                    {mode === 'limited-moves' ? 'SELECTED' : 'MODE B'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#FFF0D7]/80 leading-relaxed mb-3">
                  No time limit! Match all pairs within the allowed number of two-card attempts. Every pair revealed counts as 1 attempt.
                </p>
              </div>
              <div className="pt-2.5 border-t border-[#3D345F]/80 flex items-center justify-between text-xs text-[#FF776E] font-medium">
                <span>Attempt Allowance</span>
                <span className="font-bold">{config.maxAttempts} Attempts</span>
              </div>
            </button>
          </div>
        </div>

        {/* Step 2: Select Difficulty */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-pixel text-[10px] sm:text-xs text-[#FFC66D] uppercase tracking-wider">
              2. SELECT DIFFICULTY
            </h2>
            <span className="text-[11px] text-[#FFF0D7]/60 font-sans">
              Board: <strong className="text-[#56E0CB]">{config.pairs} Pairs ({config.totalCards} Cards)</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Difficulty Level">
            {(['easy', 'medium', 'hard'] as MemoryDifficulty[]).map((level) => {
              const lvlConfig = MEMORY_DIFFICULTY_CONFIGS[level];
              const isSelected = difficulty === level;

              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    playClick();
                    setDifficulty(level);
                  }}
                  className={`text-left p-3.5 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#292342] border-[#FFC66D] retro-box-gold'
                      : 'bg-[#201A36] border-[#3D345F] hover:border-[#FFC66D]/60 opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-sans font-bold text-sm sm:text-base text-[#FFF0D7]">
                      {lvlConfig.label}
                    </span>
                    <span className="font-pixel text-[9px] text-[#FFC66D] bg-[#171329] px-2 py-0.5 rounded border border-[#3D345F]">
                      {lvlConfig.pairs} PAIRS
                    </span>
                  </div>
                  <p className="text-xs text-[#FFF0D7]/70 mb-2.5">{lvlConfig.totalCards} cards total</p>
                  <div className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#171329] border border-[#292342] flex items-center justify-between">
                    <span className="text-[#FFF0D7]/65">
                      {mode === 'time-challenge' ? 'Time Limit:' : 'Max Attempts:'}
                    </span>
                    <span className={mode === 'time-challenge' ? 'text-[#56E0CB] font-bold' : 'text-[#FF776E] font-bold'}>
                      {mode === 'time-challenge'
                        ? `${lvlConfig.timeLimitSeconds}s`
                        : `${lvlConfig.maxAttempts} moves`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Rules Summary & Start Action */}
        <div className="bg-[#201A36] border-2 border-[#3D345F] rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#FFC66D]">
              <Layers className="w-4 h-4 text-[#56E0CB]" />
              <span>
                Ready: {mode === 'time-challenge' ? 'Time Challenge' : 'Limited Moves'} · {config.label} ({config.pairs} Pairs)
              </span>
            </div>
            <p className="text-xs text-[#FFF0D7]/75 leading-relaxed">
              {mode === 'time-challenge'
                ? `Match all ${config.pairs} pairs (${config.totalCards} cards) within ${config.timeLimitSeconds} seconds. Timer starts when you flip your first card.`
                : `Match all ${config.pairs} pairs (${config.totalCards} cards) in at most ${config.maxAttempts} two-card attempts. Each pair revealed uses 1 attempt.`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => startFreshGame(mode, difficulty, true)}
            className="shrink-0 flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#56E0CB] hover:bg-[#68e9d5] text-[#171329] font-bold text-sm uppercase tracking-wider font-sans retro-btn retro-box-teal focus-visible:ring-4 focus-visible:ring-[#FFF0D7] transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-[#171329] shrink-0" />
            <span>Start Game</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER 2: ACTIVE GAMEPLAY SCREEN
  // ============================================================================
  const isLowTime = mode === 'time-challenge' && remainingSeconds <= 15 && outcome === 'playing';
  const isLowMoves = mode === 'limited-moves' && attemptsRemaining <= 3 && outcome === 'playing';

  return (
    <div className="py-3 sm:py-6 px-3 sm:px-6 md:px-8 max-w-4xl mx-auto min-h-[calc(100vh-140px)] flex flex-col justify-between">
      {/* Victory Celebration Particles */}
      {outcome === 'won' && <WinCelebration winner="X" isDraw={false} />}

      {/* Screen Reader Live Status Announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Top Section: Header, HUD, and Card Grid */}
      <div>
        {/* Compact Game Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-5">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => handleRequestExit('home')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] hover:text-[#56E0CB] border border-[#3D345F] transition-colors text-xs font-semibold cursor-pointer"
              aria-label="Return to arcade collection"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Arcade</span>
            </button>

            <button
              type="button"
              onClick={() => handleRequestExit('setup')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#201A36] hover:bg-[#292342] text-[#FFC66D] border border-[#3D345F] hover:border-[#FFC66D] transition-colors text-xs font-semibold cursor-pointer"
              aria-label="Change mode or difficulty"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>Mode / Setup</span>
            </button>
          </div>

          {/* Active Mode & Difficulty Pill */}
          <div className="flex items-center gap-1.5 bg-[#201A36] border border-[#3D345F] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold">
            <span className={mode === 'time-challenge' ? 'text-[#56E0CB]' : 'text-[#FF776E]'}>
              {mode === 'time-challenge' ? 'Time Challenge' : 'Limited Moves'}
            </span>
            <span className="text-[#FFF0D7]/40">·</span>
            <span className="text-[#FFC66D]">{config.label} ({config.pairs}P)</span>
          </div>
        </div>

        {/* Confirmation Banner when leaving an active in-progress game */}
        {confirmExitTarget && (
          <div
            role="alertdialog"
            aria-labelledby="confirm-exit-title"
            className="max-w-xl mx-auto mb-4 p-3.5 sm:p-4 rounded-xl bg-[#292342] border-2 border-[#FFC66D] text-[#FFF0D7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg"
          >
            <div className="text-xs sm:text-sm">
              <p id="confirm-exit-title" className="font-bold text-[#FFC66D] mb-0.5">
                Leave current game?
              </p>
              <p className="text-[#FFF0D7]/80 text-xs">
                Your current board progress will be reset.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={() => setConfirmExitTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-[#201A36] hover:bg-[#171329] text-xs font-semibold text-[#FFF0D7] border border-[#3D345F] cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="px-3 py-1.5 rounded-lg bg-[#FF776E] hover:bg-[#ff8f87] text-xs font-bold text-[#171329] cursor-pointer"
              >
                Leave Game
              </button>
            </div>
          </div>
        )}

        {/* Prominent Live HUD Dashboard */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-xl mx-auto mb-3 sm:mb-5">
          {mode === 'time-challenge' ? (
            <>
              {/* Prominent Countdown Timer */}
              <div
                className={`p-2 sm:p-3 rounded-xl border-2 text-center min-w-0 transition-colors ${
                  isLowTime
                    ? 'bg-[#FF776E]/15 border-[#FF776E] text-[#FF776E] motion-safe:animate-pulse'
                    : 'bg-[#292342] border-[#56E0CB] retro-box-teal'
                }`}
              >
                <div className="text-[8px] sm:text-[10px] font-pixel text-[#FFC66D] uppercase tracking-wider mb-0.5 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>TIME LEFT</span>
                </div>
                <div
                  className={`font-sans font-bold text-lg sm:text-2xl leading-tight ${
                    isLowTime ? 'text-[#FF776E]' : 'text-[#FFF0D7]'
                  }`}
                  aria-label={`Remaining time ${formatSeconds(remainingSeconds)}`}
                >
                  {formatSeconds(remainingSeconds)}
                </div>
                <div className="text-[10px] text-[#FFF0D7]/60 mt-0.5 truncate">
                  {isTimerRunning ? 'Counting down' : outcome === 'playing' ? 'Flip to start' : 'Stopped'}
                </div>
              </div>

              {/* Pairs Matched */}
              <div className="p-2 sm:p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center min-w-0 flex flex-col justify-center">
                <div className="text-[8px] sm:text-[10px] font-pixel text-[#56E0CB] uppercase tracking-wider mb-0.5">
                  PAIRS
                </div>
                <div className="font-sans font-bold text-lg sm:text-2xl text-[#FFF0D7] leading-tight">
                  {matchedPairsCount} / {totalPairs}
                </div>
                <div className="text-[10px] text-[#FFF0D7]/50 mt-0.5">MATCHED</div>
              </div>

              {/* Attempts Used */}
              <div className="p-2 sm:p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center min-w-0 flex flex-col justify-center">
                <div className="text-[8px] sm:text-[10px] font-pixel text-[#FF776E] uppercase tracking-wider mb-0.5">
                  ATTEMPTS
                </div>
                <div className="font-sans font-bold text-lg sm:text-2xl text-[#FFF0D7] leading-tight">
                  {attemptsUsed}
                </div>
                <div className="text-[10px] text-[#FFF0D7]/50 mt-0.5">PAIRS FLIPPED</div>
              </div>
            </>
          ) : (
            <>
              {/* Prominent Attempts Remaining */}
              <div
                className={`p-2 sm:p-3 rounded-xl border-2 text-center min-w-0 transition-colors ${
                  isLowMoves
                    ? 'bg-[#FF776E]/15 border-[#FF776E] text-[#FF776E] motion-safe:animate-pulse'
                    : 'bg-[#292342] border-[#FF776E] retro-box-coral'
                }`}
              >
                <div className="text-[8px] sm:text-[10px] font-pixel text-[#FFC66D] uppercase tracking-wider mb-0.5">
                  LEFT
                </div>
                <div
                  className={`font-sans font-bold text-lg sm:text-2xl leading-tight ${
                    isLowMoves ? 'text-[#FF776E]' : 'text-[#FFF0D7]'
                  }`}
                  aria-label={`${attemptsRemaining} attempts remaining`}
                >
                  {attemptsRemaining}
                </div>
                <div className="text-[10px] text-[#FFF0D7]/60 mt-0.5 truncate">ATTEMPTS LEFT</div>
              </div>

              {/* Attempts Used */}
              <div className="p-2 sm:p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center min-w-0 flex flex-col justify-center">
                <div className="text-[8px] sm:text-[10px] font-pixel text-[#FF776E] uppercase tracking-wider mb-0.5">
                  USED
                </div>
                <div className="font-sans font-bold text-lg sm:text-2xl text-[#FFF0D7] leading-tight">
                  {attemptsUsed} / {config.maxAttempts}
                </div>
                <div className="text-[10px] text-[#FFF0D7]/50 mt-0.5">ATTEMPTS</div>
              </div>

              {/* Pairs Matched */}
              <div className="p-2 sm:p-3 rounded-xl bg-[#201A36] border border-[#3D345F] text-center min-w-0 flex flex-col justify-center">
                <div className="text-[8px] sm:text-[10px] font-pixel text-[#56E0CB] uppercase tracking-wider mb-0.5">
                  PAIRS
                </div>
                <div className="font-sans font-bold text-lg sm:text-2xl text-[#FFF0D7] leading-tight">
                  {matchedPairsCount} / {totalPairs}
                </div>
                <div className="text-[10px] text-[#FFF0D7]/50 mt-0.5">MATCHED</div>
              </div>
            </>
          )}
        </div>

        {/* Inline Win / Loss Banner when inspecting the board */}
        {outcome !== 'playing' && (
          <div
            className={`max-w-xl mx-auto mb-4 p-3 sm:p-4 rounded-xl border-2 text-center ${
              outcome === 'won'
                ? 'bg-[#56E0CB]/15 border-[#56E0CB] text-[#56E0CB]'
                : 'bg-[#FF776E]/15 border-[#FF776E] text-[#FF776E]'
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-2 font-pixel text-xs sm:text-sm text-[#FFF0D7] mb-1">
              {outcome === 'won' ? (
                <>
                  <Trophy className="w-4 h-4 text-[#FFC66D] shrink-0" />
                  <span>STAGE CLEARED! ALL PAIRS MATCHED!</span>
                  <Sparkles className="w-4 h-4 text-[#FFC66D] shrink-0" />
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
                  <span>{outcome === 'lost-time' ? "TIME'S UP! GAME OVER" : 'OUT OF MOVES! GAME OVER'}</span>
                </>
              )}
            </div>
            <p className="text-xs text-[#FFF0D7]/85 font-sans">{modalSubheadline}</p>
          </div>
        )}

        {/* Responsive Card Grid */}
        <div
          className={`grid ${getGridLayoutClasses()} gap-2 sm:gap-3 mx-auto select-none`}
          role="grid"
          aria-label={`Memory Match ${config.label} card grid with ${config.totalCards} cards`}
        >
          {cards.map((card, index) => {
            const isRevealed = card.isFlipped || card.isMatched;
            const isDisabled =
              card.isMatched || isLocked || card.isFlipped || outcome !== 'playing';

            return (
              <button
                key={card.id}
                role="gridcell"
                type="button"
                onClick={() => handleCardClick(index)}
                disabled={isDisabled}
                aria-label={`Card ${index + 1} of ${cards.length}: ${
                  isRevealed
                    ? `${card.name}${card.isMatched ? ', matched pair' : ', revealed'}`
                    : 'face down'
                }`}
                aria-pressed={isRevealed}
                className={`relative aspect-square sm:aspect-[4/4] min-h-[64px] sm:min-h-[82px] rounded-xl flex flex-col items-center justify-center p-1.5 sm:p-2 transition-all duration-150 outline-none ${
                  card.isMatched
                    ? 'bg-[#171329] border-2 border-[#56E0CB] opacity-95 shadow-inner cursor-default'
                    : card.isFlipped
                    ? 'bg-[#201A36] border-2 border-[#FFC66D] shadow-lg cursor-default'
                    : outcome !== 'playing'
                    ? 'bg-[#292342]/60 border-2 border-[#3D345F]/50 opacity-75 cursor-not-allowed'
                    : 'bg-[#292342] hover:bg-[#322B50] active:scale-95 border-2 border-[#3D345F] hover:border-[#56E0CB] cursor-pointer retro-box-purple'
                } focus-visible:ring-4 focus-visible:ring-[#56E0CB]`}
              >
                {isRevealed ? (
                  <div className="flex flex-col items-center justify-center gap-1 w-full">
                    <MemorySymbolIcon
                      symbolId={card.symbolId}
                      color={card.color}
                      className={
                        difficulty === 'hard'
                          ? 'w-6 h-6 sm:w-8 sm:h-8'
                          : 'w-7 h-7 sm:w-9 sm:h-9'
                      }
                    />
                    <span className="text-[9px] sm:text-[10px] font-semibold text-[#FFF0D7]/90 text-center leading-tight truncate max-w-full px-0.5">
                      {card.name.split(' ')[1] || card.name}
                    </span>
                    {card.isMatched && (
                      <span
                        className="absolute top-1 right-1 bg-[#171329]/90 rounded-full p-0.5"
                        title="Matched"
                      >
                        <CheckCircle2 className="w-3 h-3 text-[#56E0CB]" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#201A36] border border-[#3D345F] flex items-center justify-center opacity-85">
                      <svg
                        viewBox="0 0 16 16"
                        className="w-3.5 h-3.5 text-[#56E0CB]"
                        fill="currentColor"
                        aria-hidden="true"
                      >
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
      <div className="max-w-md mx-auto w-full mt-5 sm:mt-7 pt-3.5 border-t border-[#292342] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => startFreshGame(mode, difficulty, true)}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#56E0CB] hover:bg-[#68e9d5] text-[#171329] font-bold text-xs sm:text-sm uppercase tracking-wider font-sans retro-btn retro-box-teal focus-visible:ring-2 focus-visible:ring-[#FFF0D7] transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>{outcome !== 'playing' ? 'Play Again' : 'Restart & Shuffle'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleRequestExit('setup')}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#201A36] hover:bg-[#292342] text-[#FFF0D7]/85 hover:text-[#FFC66D] border border-[#3D345F] hover:border-[#FFC66D] text-xs font-semibold transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#FFC66D] shrink-0" />
          <span>Change Mode / Difficulty</span>
        </button>
      </div>

      {/* Win / Loss Result Modal */}
      <VictoryCelebrationModal
        isOpen={isModalOpen && outcome !== 'playing'}
        variant={outcome === 'won' ? 'win' : 'loss'}
        onClose={() => setIsModalOpen(false)}
        onPlayAgain={() => startFreshGame(mode, difficulty, true)}
        onChangeSettings={() => {
          setIsModalOpen(false);
          sessionIdRef.current += 1;
          clearAllAsyncTimers();
          setIsTimerRunning(false);
          setPhase('setup');
        }}
        changeSettingsLabel="Change Mode / Difficulty"
        onBackToArcade={() => {
          setIsModalOpen(false);
          sessionIdRef.current += 1;
          clearAllAsyncTimers();
          setIsTimerRunning(false);
          onBackToHome();
        }}
        gameTitle={`MEMORY MATCH · ${config.label.toUpperCase()}`}
        headline={modalHeadline}
        subheadline={modalSubheadline}
        isNewRecord={outcome === 'won' && isNewRecord}
        stats={modalStats}
      />
    </div>
  );
};

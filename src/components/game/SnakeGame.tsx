/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Trophy,
  Globe,
  User,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Zap,
  ShieldAlert,
  Clock,
  Apple,
} from 'lucide-react';
import {
  SNAKE_DIFFICULTY_CONFIGS,
  SNAKE_SPEED_CONFIGS,
  createInitialSinglePlayerSnakeState,
  loadLocalSnakeRecord,
  pointKey,
  queueSinglePlayerDirection,
  saveLocalSnakeRecord,
  stepSinglePlayerSnake,
  type LocalSnakeBestRecord,
  type SinglePlayerSnakeState,
  type SnakeDifficultyLevel,
  type SnakeDirection,
  type SnakeSpeedMode,
} from '../../logic/snake';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import {
  buildGameResultId,
  recordPrivateSinglePlayerCompletion,
} from '../../logic/gameHistory';
import { SnakeMultiplayerView } from './SnakeMultiplayerView';
import { PixelAppleIcon } from './PixelAppleIcon';
import { SnakeHeadSprite, SnakeBodySprite } from './SnakeCharacterSprites';
import {
  hasRoomInvitationInUrl,
  loadActiveRoomSession,
} from '../../logic/multiplayerRoom';

export interface SnakeGameProps {
  onBackToHome: () => void;
}

export const SnakeGame: React.FC<SnakeGameProps> = ({ onBackToHome }) => {
  const { playClick, playMatch, playWin, playMismatch, playReset } = useAudio();
  const { uid, isSignedInAccount } = useAuth();

  const [isOnlineMultiplayer, setIsOnlineMultiplayer] = useState<boolean>(() =>
    Boolean(loadActiveRoomSession('snake') || hasRoomInvitationInUrl('snake'))
  );
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [speed, setSpeed] = useState<SnakeSpeedMode>('fast');
  const [difficulty, setDifficulty] = useState<SnakeDifficultyLevel>('easy');
  const [gameState, setGameState] = useState<SinglePlayerSnakeState>(() =>
    createInitialSinglePlayerSnakeState({ speed: 'fast', difficulty: 'easy' })
  );
  const [localRecord, setLocalRecord] = useState<LocalSnakeBestRecord>(() =>
    loadLocalSnakeRecord()
  );
  const [isNewHighScore, setIsNewHighScore] = useState<boolean>(false);
  const [visualTick, setVisualTick] = useState<number>(0);
  const [eatAnimTicks, setEatAnimTicks] = useState<number>(0);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const recordedGameOverRef = useRef<boolean>(false);
  const sessionCounterRef = useRef<number>(1);
  const prevScoreRef = useRef<number>(0);

  const startFreshGame = useCallback(
    (nextSpeed: SnakeSpeedMode, nextDiff: SnakeDifficultyLevel) => {
      playReset();
      sessionCounterRef.current += 1;
      recordedGameOverRef.current = false;
      prevScoreRef.current = 0;
      setIsNewHighScore(false);
      setVisualTick(0);
      setEatAnimTicks(0);
      setSpeed(nextSpeed);
      setDifficulty(nextDiff);
      setGameState({
        ...createInitialSinglePlayerSnakeState({
          speed: nextSpeed,
          difficulty: nextDiff,
        }),
        startedAtMs: Date.now(),
      });
      setPhase('playing');
    },
    [playReset]
  );

  // Movement tick loop (interval strictly driven by selected independent speed mode)
  useEffect(() => {
    if (isOnlineMultiplayer || phase !== 'playing' || gameState.isGameOver || gameState.isPaused) {
      return;
    }

    const intervalMs = SNAKE_SPEED_CONFIGS[gameState.speed].tickMs;
    const timer = setInterval(() => {
      setGameState((prev) => stepSinglePlayerSnake(prev));
      setVisualTick((t) => t + 1);
      setEatAnimTicks((e) => (e > 0 ? e - 1 : 0));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isOnlineMultiplayer, phase, gameState.speed, gameState.isGameOver, gameState.isPaused]);

  // Survival seconds timer
  useEffect(() => {
    if (isOnlineMultiplayer || phase !== 'playing' || gameState.isGameOver || gameState.isPaused) {
      return;
    }
    const secTimer = setInterval(() => {
      setGameState((prev) =>
        prev.isGameOver || prev.isPaused
          ? prev
          : { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }
      );
    }, 1000);
    return () => clearInterval(secTimer);
  }, [isOnlineMultiplayer, phase, gameState.isGameOver, gameState.isPaused]);

  // Sound & brief visual eating reaction on apple collection
  useEffect(() => {
    if (gameState.score > prevScoreRef.current) {
      playMatch();
      setEatAnimTicks(2);
      prevScoreRef.current = gameState.score;
    }
  }, [gameState.score, playMatch]);

  // Persist private single-player record on game over
  useEffect(() => {
    if (!gameState.isGameOver || recordedGameOverRef.current) return;
    recordedGameOverRef.current = true;

    if (gameState.gameOverReason === 'victory') {
      playWin();
    } else {
      playMismatch();
    }

    const { record, isNewHighScore: beatBest } = saveLocalSnakeRecord({
      score: gameState.score,
      applesCollected: gameState.applesCollected,
      snakeLength: gameState.snake.length,
      survivalSeconds: gameState.elapsedSeconds,
    });
    setLocalRecord(record);
    setIsNewHighScore(beatBest);

    if (isSignedInAccount && uid) {
      const completedAt = Date.now();
      void recordPrivateSinglePlayerCompletion(uid, {
        resultId: buildGameResultId({
          gameId: 'snake',
          mode: 'single-player',
          sessionId: `sp_snake_${completedAt}_${sessionCounterRef.current}`,
          playerUid: uid,
        }),
        gameId: 'snake',
        sessionId: `sp_snake_${completedAt}_${sessionCounterRef.current}`,
        playerUid: uid,
        completedAt,
        mode: 'single-player',
        outcome: gameState.gameOverReason === 'victory' ? 'win' : 'loss',
        score: gameState.score,
        durationSeconds: gameState.elapsedSeconds,
        validated: true,
        metrics: {
          difficulty: `${gameState.speed}-${gameState.difficulty}`,
          survivalSeconds: gameState.elapsedSeconds,
          snakeLength: gameState.snake.length,
        },
      });
    }
  }, [
    gameState.isGameOver,
    gameState.gameOverReason,
    gameState.score,
    gameState.applesCollected,
    gameState.snake.length,
    gameState.elapsedSeconds,
    gameState.speed,
    gameState.difficulty,
    isSignedInAccount,
    uid,
    playWin,
    playMismatch,
  ]);

  const handleDirectionInput = useCallback((dir: SnakeDirection) => {
    setGameState((prev) => queueSinglePlayerDirection(prev, dir));
  }, []);

  const handleTogglePause = useCallback(() => {
    playClick();
    setGameState((prev) =>
      prev.isGameOver ? prev : { ...prev, isPaused: !prev.isPaused }
    );
  }, [playClick]);

  // Keyboard controls (Arrow keys, WASD, Space/P to pause)
  useEffect(() => {
    if (isOnlineMultiplayer || phase !== 'playing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleDirectionInput('up');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleDirectionInput('down');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleDirectionInput('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleDirectionInput('right');
      } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOnlineMultiplayer, phase, handleDirectionInput, handleTogglePause]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const end = e.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      handleDirectionInput(dx > 0 ? 'right' : 'left');
    } else {
      handleDirectionInput(dy > 0 ? 'down' : 'up');
    }
  };

  const snakeHeadKey = pointKey(gameState.snake[0]);
  const snakeTailKey =
    gameState.snake.length > 1
      ? pointKey(gameState.snake[gameState.snake.length - 1])
      : '';
  const snakeBodySet = new Set(gameState.snake.slice(1).map(pointKey));
  const obstacleSet = new Set(gameState.obstacles.map(pointKey));
  const foodKey = pointKey(gameState.food);
  const showHeadTongue =
    !gameState.isGameOver && !gameState.isPaused && visualTick > 0 && visualTick % 9 === 0;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4" data-testid="snake-game-root">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            playClick();
            onBackToHome();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] border border-[#3D345F] text-xs font-semibold text-[#FFF0D7] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        {/* Solo vs Online Multiplayer Switch */}
        <div className="inline-flex rounded-xl bg-[#201A36] border border-[#3D345F] p-1">
          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOnlineMultiplayer(false);
            }}
            data-testid="snake-mode-solo-btn"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              !isOnlineMultiplayer
                ? 'bg-[#56E0CB] text-[#171329]'
                : 'text-[#FFF0D7]/75 hover:text-[#FFF0D7]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Single-Player</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOnlineMultiplayer(true);
            }}
            data-testid="snake-mode-multiplayer-btn"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              isOnlineMultiplayer
                ? 'bg-[#FF776E] text-[#171329]'
                : 'text-[#FFF0D7]/75 hover:text-[#FFF0D7]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Online (2–10P)</span>
          </button>
        </div>
      </div>

      {isOnlineMultiplayer ? (
        <SnakeMultiplayerView onBackToHome={onBackToHome} />
      ) : phase === 'setup' ? (
        /* Pre-Game Independent Speed & Difficulty Configuration */
        <div
          className="max-w-2xl mx-auto p-5 sm:p-6 rounded-2xl bg-[#201A36] border-2 border-[#3D345F] space-y-6"
          data-testid="snake-setup-panel"
        >
          <div className="text-center space-y-1.5">
            <h1 className="font-['Press_Start_2P'] text-base sm:text-xl text-[#FFC66D]">
              NEON SNAKE
            </h1>
            <p className="text-xs sm:text-sm text-[#FFF0D7]/75">
              Choose your Speed and Difficulty independently — mix any combination to suit your style.
            </p>
          </div>

          {/* Independent Speed Selector */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 font-['Press_Start_2P'] text-[10px] text-[#56E0CB] uppercase">
              <Zap className="w-3.5 h-3.5" />
              <span>1. Speed Mode</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(['slow', 'fast', 'flash'] as SnakeSpeedMode[]).map((sKey) => {
                const cfg = SNAKE_SPEED_CONFIGS[sKey];
                const active = speed === sKey;
                return (
                  <button
                    key={sKey}
                    type="button"
                    onClick={() => {
                      playClick();
                      setSpeed(sKey);
                    }}
                    data-testid={`snake-speed-${sKey}`}
                    aria-pressed={active}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-[#292342] border-[#56E0CB]'
                        : 'bg-[#171329] border-[#3D345F] hover:border-[#56E0CB]/50'
                    }`}
                  >
                    <p className="font-bold text-sm text-[#FFF0D7]">{cfg.label}</p>
                    <p className="text-[11px] text-[#FFF0D7]/65 mt-0.5">{cfg.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Independent Difficulty Selector */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 font-['Press_Start_2P'] text-[10px] text-[#FFC66D] uppercase">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>2. Difficulty (Obstacles)</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(['easy', 'hard', 'difficult'] as SnakeDifficultyLevel[]).map((dKey) => {
                const cfg = SNAKE_DIFFICULTY_CONFIGS[dKey];
                const active = difficulty === dKey;
                return (
                  <button
                    key={dKey}
                    type="button"
                    onClick={() => {
                      playClick();
                      setDifficulty(dKey);
                    }}
                    data-testid={`snake-difficulty-${dKey}`}
                    aria-pressed={active}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-[#292342] border-[#FFC66D]'
                        : 'bg-[#171329] border-[#3D345F] hover:border-[#FFC66D]/50'
                    }`}
                  >
                    <p className="font-bold text-sm text-[#FFF0D7]">{cfg.label}</p>
                    <p className="text-[11px] text-[#FFF0D7]/65 mt-0.5">{cfg.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personal Best Strip */}
          {localRecord.gamesPlayed > 0 && (
            <div className="p-3 rounded-xl bg-[#171329] border border-[#3D345F] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#FFC66D] font-bold inline-flex items-center gap-1.5">
                <Trophy className="w-4 h-4" /> Personal Best: {localRecord.highestScore} pts
              </span>
              <span className="text-[#FFF0D7]/70">
                Longest: {localRecord.longestSnakeLength} · Best Time: {localRecord.bestSurvivalTimeSeconds}s
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => startFreshGame(speed, difficulty)}
            data-testid="snake-start-btn"
            className="w-full py-3.5 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-xs uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(86,224,203,0.3)]"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              Start ({SNAKE_SPEED_CONFIGS[speed].label} · {SNAKE_DIFFICULTY_CONFIGS[difficulty].label})
            </span>
          </button>
        </div>
      ) : (
        /* Active Single-Player Arena */
        <div className="max-w-xl mx-auto space-y-3" data-testid="snake-active-arena">
          {/* HUD */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[10px] uppercase text-[#FFF0D7]/60">Score</p>
              <p className="font-['Press_Start_2P'] text-sm text-[#56E0CB] mt-1" data-testid="snake-score">
                {gameState.score}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[10px] uppercase text-[#FFF0D7]/60 inline-flex items-center gap-1">
                <Apple className="w-3 h-3 text-[#FF776E]" /> Food
              </p>
              <p className="font-['Press_Start_2P'] text-sm text-[#FF776E] mt-1">
                {gameState.applesCollected}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[10px] uppercase text-[#FFF0D7]/60">Length</p>
              <p className="font-['Press_Start_2P'] text-sm text-[#FFC66D] mt-1">
                {gameState.snake.length}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#201A36] border border-[#3D345F]">
              <p className="text-[10px] uppercase text-[#FFF0D7]/60 inline-flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#56E0CB]" /> Time
              </p>
              <p className="font-['Press_Start_2P'] text-sm text-[#FFF0D7] mt-1">
                {gameState.elapsedSeconds}s
              </p>
            </div>
          </div>

          {/* Controls Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1">
            <span className="text-[#FFF0D7]/75">
              Mode:{' '}
              <strong className="text-[#56E0CB]">{SNAKE_SPEED_CONFIGS[gameState.speed].label}</strong>
              {' · '}
              <strong className="text-[#FFC66D]">
                {SNAKE_DIFFICULTY_CONFIGS[gameState.difficulty].label}
              </strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePause}
                disabled={gameState.isGameOver}
                data-testid="snake-pause-btn"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#292342] border border-[#3D345F] text-[#FFF0D7] font-semibold cursor-pointer disabled:opacity-45"
              >
                {gameState.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{gameState.isPaused ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                type="button"
                onClick={() => startFreshGame(speed, difficulty)}
                data-testid="snake-restart-btn"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#292342] border border-[#3D345F] text-[#FFC66D] font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="px-2.5 py-1.5 rounded-lg bg-[#171329] border border-[#3D345F] text-[#FFF0D7]/75 hover:text-[#FFF0D7] cursor-pointer"
              >
                Setup
              </button>
            </div>
          </div>

          {/* 20x20 Neon Grid */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative aspect-square w-full max-w-[460px] mx-auto rounded-2xl bg-[#120E24] border-2 border-[#56E0CB]/60 p-1.5 touch-none select-none overflow-hidden"
            data-testid="snake-grid"
          >
            <div
              className="grid w-full h-full gap-[1px]"
              style={{
                gridTemplateColumns: `repeat(${gameState.gridSize}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gameState.gridSize}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: gameState.gridSize * gameState.gridSize }).map((_, idx) => {
                const x = idx % gameState.gridSize;
                const y = Math.floor(idx / gameState.gridSize);
                const key = `${x},${y}`;
                const isHead = key === snakeHeadKey;
                const isBody = snakeBodySet.has(key);
                const isFood = key === foodKey;
                const isObstacle = obstacleSet.has(key);

                if (isHead) {
                  return (
                    <div
                      key={key}
                      className="relative bg-[#1A1533] flex items-center justify-center overflow-visible z-10"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(86, 224, 203, 0.7))' }}
                    >
                      <SnakeHeadSprite
                        color="#56E0CB"
                        direction={gameState.direction}
                        showTongue={showHeadTongue}
                        isEating={eatAnimTicks > 0}
                      />
                    </div>
                  );
                }
                if (isBody) {
                  return (
                    <div key={key} className="bg-[#1A1533] flex items-center justify-center">
                      <SnakeBodySprite color="#34B8A5" isTail={key === snakeTailKey} />
                    </div>
                  );
                }
                if (isFood) {
                  return (
                    <div key={key} className="bg-[#1A1533] flex items-center justify-center p-[1px]">
                      <PixelAppleIcon className="w-full h-full" />
                    </div>
                  );
                }

                let cellClass = 'bg-[#1A1533]';
                if (isObstacle) cellClass = 'bg-[#6B5B95] border border-[#FFC66D]/50 rounded-[2px]';

                return <div key={key} className={cellClass} />;
              })}
            </div>

            {/* Paused Overlay */}
            {gameState.isPaused && !gameState.isGameOver && (
              <div className="absolute inset-0 bg-[#171329]/80 flex flex-col items-center justify-center gap-3 p-4">
                <p className="font-['Press_Start_2P'] text-sm text-[#FFC66D]">PAUSED</p>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="px-5 py-2.5 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer"
                >
                  Resume Game
                </button>
              </div>
            )}

            {/* Game Over Results Overlay */}
            {gameState.isGameOver && (
              <div
                className="absolute inset-0 bg-[#171329]/90 flex flex-col items-center justify-center p-5 text-center space-y-3"
                data-testid="snake-gameover-overlay"
              >
                <p className="font-['Press_Start_2P'] text-sm text-[#FF776E]">
                  {gameState.gameOverReason === 'victory' ? 'ARENA CLEARED!' : 'GAME OVER'}
                </p>
                {isNewHighScore && (
                  <span className="px-2.5 py-1 rounded-full bg-[#FFC66D]/20 border border-[#FFC66D] text-[#FFC66D] text-[11px] font-bold">
                    NEW PERSONAL BEST!
                  </span>
                )}
                <div className="grid grid-cols-2 gap-2 w-full max-w-xs text-xs">
                  <div className="p-2 rounded-lg bg-[#201A36] border border-[#3D345F]">
                    <span className="text-[#FFF0D7]/60 block">Final Score</span>
                    <strong className="text-[#56E0CB]">{gameState.score}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#201A36] border border-[#3D345F]">
                    <span className="text-[#FFF0D7]/60 block">Food Collected</span>
                    <strong className="text-[#FF776E]">{gameState.applesCollected}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#201A36] border border-[#3D345F]">
                    <span className="text-[#FFF0D7]/60 block">Final Length</span>
                    <strong className="text-[#FFC66D]">{gameState.snake.length}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#201A36] border border-[#3D345F]">
                    <span className="text-[#FFF0D7]/60 block">Survival Time</span>
                    <strong className="text-[#FFF0D7]">{gameState.elapsedSeconds}s</strong>
                  </div>
                </div>
                <p className="text-[11px] text-[#FFF0D7]/65">
                  {SNAKE_SPEED_CONFIGS[gameState.speed].label} ·{' '}
                  {SNAKE_DIFFICULTY_CONFIGS[gameState.difficulty].label} · Best:{' '}
                  {localRecord.highestScore} pts
                </p>
                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => startFreshGame(speed, difficulty)}
                    className="px-4 py-2.5 rounded-xl bg-[#56E0CB] text-[#171329] font-bold text-xs cursor-pointer"
                  >
                    Play Again
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('setup')}
                    className="px-4 py-2.5 rounded-xl bg-[#292342] border border-[#3D345F] text-[#FFF0D7] font-semibold text-xs cursor-pointer"
                  >
                    Change Mode
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Touch-Friendly D-Pad */}
          <div className="sm:hidden flex flex-col items-center gap-1.5 pt-1" aria-label="Touch directional controls">
            <button
              type="button"
              onClick={() => handleDirectionInput('up')}
              aria-label="Move up"
              className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB] active:bg-[#56E0CB] active:text-[#171329] touch-manipulation"
            >
              <ChevronUp className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => handleDirectionInput('left')}
                aria-label="Move left"
                className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB] active:bg-[#56E0CB] active:text-[#171329] touch-manipulation"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => handleDirectionInput('right')}
                aria-label="Move right"
                className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB] active:bg-[#56E0CB] active:text-[#171329] touch-manipulation"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleDirectionInput('down')}
              aria-label="Move down"
              className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB] active:bg-[#56E0CB] active:text-[#171329] touch-manipulation"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

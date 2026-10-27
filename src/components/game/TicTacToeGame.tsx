/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, RotateCcw, Trash2, Trophy, Minus, Sparkles, Users, Bot, Cpu } from 'lucide-react';
import { Player, BoardState, TicTacToeScores, TicTacToeMode } from '../../types/game';
import {
  createEmptyBoard,
  isValidMove,
  makeMove,
  evaluateBoard,
  getNextPlayer,
  getComputerMove,
  loadScores,
  saveScores,
  clearStoredScores,
} from '../../logic/ticTacToe';
import { WinCelebration } from '../common/WinCelebration';
import { VictoryCelebrationModal } from '../common/VictoryCelebrationModal';
import { useAudio } from '../../context/AudioContext';

interface TicTacToeGameProps {
  onBackToHome: () => void;
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({ onBackToHome }) => {
  const { playMove, playWin, playDraw, playReset, playClick } = useAudio();
  const [mode, setMode] = useState<TicTacToeMode>('pvc'); // Player vs Computer by default or PvP
  const [board, setBoard] = useState<BoardState>(createEmptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [scores, setScores] = useState<TicTacToeScores>(() => loadScores('pvc'));
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [isCelebrationOpen, setIsCelebrationOpen] = useState<boolean>(false);

  // Round ID reference to guarantee restarting or switching mode cancels any stale AI moves
  const roundIdRef = useRef<number>(0);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Evaluate game state from pure board logic
  const status = evaluateBoard(board);

  // Save scores to localStorage whenever scores or mode changes
  useEffect(() => {
    saveScores(scores, mode);
  }, [scores, mode]);

  // Clean up any pending AI timeout on unmount
  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, []);

  // Computer AI move trigger
  useEffect(() => {
    if (mode !== 'pvc' || currentPlayer !== 'O' || status.isOver) {
      setIsAiThinking(false);
      return;
    }

    setIsAiThinking(true);
    const thisRoundId = roundIdRef.current;

    aiTimeoutRef.current = setTimeout(() => {
      // Stale check: guarantee round wasn't restarted or changed
      if (roundIdRef.current !== thisRoundId) {
        setIsAiThinking(false);
        return;
      }

      const computerMoveIndex = getComputerMove(board, 'unbeatable');
      if (computerMoveIndex === -1 || !isValidMove(board, computerMoveIndex, status.isOver)) {
        setIsAiThinking(false);
        return;
      }

      playMove('O');
      const nextBoard = makeMove(board, computerMoveIndex, 'O');
      const nextStatus = evaluateBoard(nextBoard);

      setBoard(nextBoard);
      setIsAiThinking(false);

      if (nextStatus.isOver) {
        if (nextStatus.winner) {
          playWin();
          setScores((prev) => ({
            ...prev,
            oWins: prev.oWins + 1,
          }));
          setTimeout(() => {
            setIsCelebrationOpen(true);
          }, 300);
        } else if (nextStatus.isDraw) {
          playDraw();
          setScores((prev) => ({
            ...prev,
            draws: prev.draws + 1,
          }));
        }
      } else {
        setCurrentPlayer('X');
      }
    }, 400); // 400ms natural thinking pause

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, [mode, currentPlayer, status.isOver, board, playMove, playWin, playDraw]);

  // Handle cell click (Human move)
  const handleCellClick = useCallback(
    (index: number) => {
      // Disallow moves if cell is invalid, game is over, or AI is currently thinking
      if (!isValidMove(board, index, status.isOver) || (mode === 'pvc' && (currentPlayer === 'O' || isAiThinking))) {
        return;
      }

      // Play move sound
      playMove(currentPlayer);

      const nextBoard = makeMove(board, index, currentPlayer);
      const nextStatus = evaluateBoard(nextBoard);

      setBoard(nextBoard);

      if (nextStatus.isOver) {
        if (nextStatus.winner) {
          playWin();
          setScores((prev) => ({
            ...prev,
            [nextStatus.winner === 'X' ? 'xWins' : 'oWins']:
              prev[nextStatus.winner === 'X' ? 'xWins' : 'oWins'] + 1,
          }));
          setTimeout(() => {
            setIsCelebrationOpen(true);
          }, 300);
        } else if (nextStatus.isDraw) {
          playDraw();
          setScores((prev) => ({
            ...prev,
            draws: prev.draws + 1,
          }));
        }
      } else {
        setCurrentPlayer(getNextPlayer(currentPlayer));
      }
    },
    [board, currentPlayer, status.isOver, mode, isAiThinking, playMove, playWin, playDraw]
  );

  // Restart current round (increments roundId to cancel any pending AI actions)
  const handleRestartRound = useCallback(() => {
    setIsCelebrationOpen(false);
    roundIdRef.current += 1;
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    setIsAiThinking(false);
    playReset();
    setBoard(createEmptyBoard());

    if (mode === 'pvc') {
      setCurrentPlayer('X'); // Human always starts as X in PvC mode per brief
    } else {
      // Alternates starting player in PvP mode
      setCurrentPlayer((prev) => (status.winner ? status.winner : getNextPlayer(prev)));
    }
  }, [status.winner, mode, playReset]);

  // Switch game mode
  const handleModeChange = (newMode: TicTacToeMode) => {
    if (newMode === mode) return;
    setIsCelebrationOpen(false);
    playClick();
    roundIdRef.current += 1;
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    setIsAiThinking(false);
    setMode(newMode);
    setBoard(createEmptyBoard());
    setCurrentPlayer('X');
    setScores(loadScores(newMode));
  };

  // Reset stored scores for current mode
  const handleResetScores = useCallback(() => {
    playReset();
    clearStoredScores(mode);
    setScores({ xWins: 0, oWins: 0, draws: 0 });
  }, [mode, playReset]);

  const winningIndices: number[] = status.winningLine ? status.winningLine.indices : [];

  return (
    <div className="py-6 px-4 md:px-8 max-w-4xl mx-auto min-h-[calc(100vh-140px)] flex flex-col justify-between">
      {/* Win celebration particles */}
      {status.isOver && (
        <WinCelebration winner={status.winner} isDraw={status.isDraw} />
      )}

      {/* Top Navigation & Breadcrumb */}
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
              CARTRIDGE #01
            </span>
            <span className="w-2 h-2 rounded-full bg-[#FF776E] animate-pulse" />
          </div>
        </div>

        {/* Game Title & Header */}
        <div className="text-center mb-5">
          <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#FFF0D7] tracking-tight mb-2">
            TIC-TAC-TOE
          </h1>
          <p className="text-xs sm:text-sm text-[#FFC66D] font-mono">
            {mode === 'pvc'
              ? 'Player vs Computer · Minimax Strategic AI'
              : 'Player vs Player · Local 2-Player Pass & Play'}
          </p>
        </div>

        {/* Game Mode Selector */}
        <div className="flex items-center justify-center mb-6">
          <div className="bg-[#201A36] border border-[#3D345F] p-1 rounded-xl flex items-center gap-1 shadow-md">
            <button
              type="button"
              onClick={() => handleModeChange('pvc')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'pvc'
                  ? 'bg-[#FF776E] text-[#171329] shadow-sm font-bold'
                  : 'text-[#FFF0D7]/75 hover:text-[#FFF0D7] hover:bg-[#292342]'
              }`}
              aria-pressed={mode === 'pvc'}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>vs Computer</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('pvp')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'pvp'
                  ? 'bg-[#56E0CB] text-[#171329] shadow-sm font-bold'
                  : 'text-[#FFF0D7]/75 hover:text-[#FFF0D7] hover:bg-[#292342]'
              }`}
              aria-pressed={mode === 'pvp'}
            >
              <Users className="w-3.5 h-3.5" />
              <span>2-Player Local</span>
            </button>
          </div>
        </div>

        {/* Scoreboard Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-lg mx-auto mb-6">
          {/* Player X Score */}
          <div
            className={`p-3 sm:p-4 rounded-xl text-center border-2 transition-all ${
              currentPlayer === 'X' && !status.isOver
                ? 'bg-[#292342] border-[#FF776E] retro-box-coral scale-105'
                : 'bg-[#201A36] border-[#3D345F]'
            }`}
          >
            <div className="text-[10px] font-pixel text-[#FF776E] tracking-wider mb-1">
              {mode === 'pvc' ? 'YOU (X)' : 'PLAYER X'}
            </div>
            <div className="font-pixel text-xl sm:text-2xl text-[#FFF0D7]">
              {scores.xWins}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-1">WINS</div>
          </div>

          {/* Draws Score */}
          <div className="p-3 sm:p-4 rounded-xl text-center bg-[#201A36] border border-[#3D345F]">
            <div className="text-[10px] font-pixel text-[#FFC66D] tracking-wider mb-1 flex items-center justify-center gap-1">
              <Minus className="w-3 h-3 text-[#FFC66D]" />
              <span>DRAWS</span>
            </div>
            <div className="font-pixel text-xl sm:text-2xl text-[#FFF0D7]">
              {scores.draws}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-1">TIES</div>
          </div>

          {/* Player O Score */}
          <div
            className={`p-3 sm:p-4 rounded-xl text-center border-2 transition-all ${
              currentPlayer === 'O' && !status.isOver
                ? 'bg-[#292342] border-[#56E0CB] retro-box-teal scale-105'
                : 'bg-[#201A36] border-[#3D345F]'
            }`}
          >
            <div className="text-[10px] font-pixel text-[#56E0CB] tracking-wider mb-1">
              {mode === 'pvc' ? 'CPU (O)' : 'PLAYER O'}
            </div>
            <div className="font-pixel text-xl sm:text-2xl text-[#FFF0D7]">
              {scores.oWins}
            </div>
            <div className="text-[10px] text-[#FFF0D7]/50 mt-1">WINS</div>
          </div>
        </div>

        {/* Turn & Match Status Banner */}
        <div className="max-w-md mx-auto mb-6 text-center">
          {status.isOver ? (
            status.winner ? (
              <div
                className={`py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 animate-pulse ${
                  status.winner === 'X'
                    ? 'bg-[#FF776E]/15 border-[#FF776E] text-[#FF776E]'
                    : 'bg-[#56E0CB]/15 border-[#56E0CB] text-[#56E0CB]'
                }`}
                role="status"
                aria-live="polite"
              >
                <Trophy className="w-4 h-4" />
                <span className="font-pixel text-xs sm:text-sm">
                  {mode === 'pvc'
                    ? status.winner === 'X'
                      ? 'YOU DEFEATED THE COMPUTER!'
                      : 'COMPUTER WINS THIS ROUND!'
                    : `PLAYER ${status.winner} WINS THE ROUND!`}
                </span>
                <Sparkles className="w-4 h-4" />
              </div>
            ) : (
              <div
                className="py-3 px-4 rounded-xl border-2 bg-[#FFC66D]/15 border-[#FFC66D] text-[#FFC66D] flex items-center justify-center gap-2"
                role="status"
                aria-live="polite"
              >
                <span className="font-pixel text-xs sm:text-sm">
                  IT'S A DRAW! CAT'S GAME!
                </span>
              </div>
            )
          ) : isAiThinking ? (
            <div
              className="py-2.5 px-4 rounded-xl border bg-[#292342] border-[#56E0CB]/80 text-[#56E0CB] flex items-center justify-center gap-2"
              role="status"
              aria-live="polite"
            >
              <Cpu className="w-4 h-4 animate-spin text-[#56E0CB]" />
              <span className="text-xs font-semibold">Computer is calculating next move...</span>
            </div>
          ) : (
            <div
              className={`py-2.5 px-4 rounded-xl border text-center transition-colors ${
                currentPlayer === 'X'
                  ? 'bg-[#292342] border-[#FF776E]/60 text-[#FF776E]'
                  : 'bg-[#292342] border-[#56E0CB]/60 text-[#56E0CB]'
              }`}
              role="status"
              aria-live="polite"
            >
              <span className="text-xs font-semibold mr-2 text-[#FFF0D7]/75">Current Turn:</span>
              <span className="font-pixel text-xs sm:text-sm uppercase tracking-wide">
                {mode === 'pvc'
                  ? currentPlayer === 'X'
                    ? 'Your Turn (X)'
                    : 'Computer (O)'
                  : `Player ${currentPlayer}`}
              </span>
            </div>
          )}
        </div>

        {/* Responsive 3x3 Board */}
        <div className="w-full max-w-[340px] sm:max-w-[380px] aspect-square mx-auto bg-[#201A36] border-4 border-[#292342] rounded-2xl p-3 shadow-2xl relative">
          {/* Subtle CRT Scanline Layer */}
          <div className="absolute inset-0 crt-subtle-overlay rounded-2xl pointer-events-none opacity-40" />

          {/* 3x3 Grid of Accessible Buttons */}
          <div
            className="grid grid-cols-3 grid-rows-3 gap-2.5 w-full h-full"
            role="grid"
            aria-label="3 by 3 Tic-Tac-Toe Game Board"
          >
            {board.map((cell, index) => {
              const isWinningCell = winningIndices.includes(index);
              const row = Math.floor(index / 3) + 1;
              const col = (index % 3) + 1;
              const isOccupied = cell !== null;
              const canClick = isValidMove(board, index, status.isOver) && !(mode === 'pvc' && (currentPlayer === 'O' || isAiThinking));

              return (
                <button
                  key={index}
                  role="gridcell"
                  type="button"
                  onClick={() => handleCellClick(index)}
                  onMouseEnter={() => setHoveredCell(index)}
                  onMouseLeave={() => setHoveredCell(null)}
                  disabled={!canClick}
                  aria-label={`Row ${row}, Column ${col}: ${cell ? `Player ${cell}` : 'Empty cell'}`}
                  className={`relative flex items-center justify-center rounded-xl font-pixel transition-all select-none ${
                    isWinningCell
                      ? 'bg-[#FFC66D]/30 border-2 border-[#FFC66D] shadow-lg scale-[1.02] z-10'
                      : isOccupied
                      ? 'bg-[#171329] border border-[#3D345F] cursor-default'
                      : canClick
                      ? 'bg-[#292342] hover:bg-[#322B50] active:scale-95 border border-[#3D345F] hover:border-[#56E0CB] cursor-pointer'
                      : 'bg-[#292342]/70 border border-[#3D345F]/50 cursor-not-allowed opacity-80'
                  } focus-visible:ring-4 focus-visible:ring-[#56E0CB] focus-visible:outline-none`}
                >
                  {/* Placed Token */}
                  {cell === 'X' && (
                    <span
                      className={`text-3xl sm:text-4xl md:text-5xl font-pixel tracking-tighter ${
                        isWinningCell ? 'text-[#FFC66D] scale-110 drop-shadow-[0_0_8px_#FFC66D]' : 'text-[#FF776E]'
                      }`}
                    >
                      X
                    </span>
                  )}
                  {cell === 'O' && (
                    <span
                      className={`text-3xl sm:text-4xl md:text-5xl font-pixel tracking-tighter ${
                        isWinningCell ? 'text-[#FFC66D] scale-110 drop-shadow-[0_0_8px_#FFC66D]' : 'text-[#56E0CB]'
                      }`}
                    >
                      O
                    </span>
                  )}

                  {/* Empty Cell Preview Ghost on Hover for Tactile Feedback */}
                  {!isOccupied && !status.isOver && canClick && hoveredCell === index && (
                    <span
                      className={`text-3xl sm:text-4xl md:text-5xl font-pixel opacity-25 pointer-events-none ${
                        currentPlayer === 'X' ? 'text-[#FF776E]' : 'text-[#56E0CB]'
                      }`}
                    >
                      {currentPlayer}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Controls & Match Tools */}
      <div className="max-w-md mx-auto w-full mt-8 pt-4 border-t border-[#292342] flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Restart Round Button */}
        <button
          onClick={handleRestartRound}
          className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FF776E] hover:bg-[#ff8f87] text-[#171329] font-bold text-xs uppercase tracking-wider font-pixel retro-btn retro-box-coral focus-visible:ring-2 focus-visible:ring-[#FFF0D7] transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{status.isOver ? 'PLAY AGAIN' : 'RESTART ROUND'}</span>
        </button>

        {/* Reset Stored Scores Button */}
        <button
          onClick={handleResetScores}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#201A36] hover:bg-[#292342] text-[#FFF0D7]/75 hover:text-[#FF776E] border border-[#3D345F] hover:border-[#FF776E] text-xs font-medium transition-colors"
          title={`Reset ${mode === 'pvc' ? 'vs Computer' : '2-Player'} scores`}
        >
          <Trash2 className="w-3.5 h-3.5 text-[#FF776E]" />
          <span>Reset Scores</span>
        </button>
      </div>

      {/* Victory Celebration Modal */}
      <VictoryCelebrationModal
        isOpen={isCelebrationOpen && status.isOver && status.winner !== null}
        onClose={() => setIsCelebrationOpen(false)}
        onPlayAgain={() => {
          setIsCelebrationOpen(false);
          handleRestartRound();
        }}
        onBackToArcade={() => {
          setIsCelebrationOpen(false);
          onBackToHome();
        }}
        gameTitle="TIC-TAC-TOE"
        headline={
          mode === 'pvc'
            ? status.winner === 'X'
              ? 'YOU DEFEATED THE COMPUTER!'
              : 'COMPUTER WON THIS ROUND!'
            : `PLAYER ${status.winner} WINS!`
        }
        subheadline={
          mode === 'pvc'
            ? status.winner === 'X'
              ? 'Tactical genius broke the Minimax machine!'
              : 'The Minimax engine found the winning line!'
            : 'Three-in-a-row claimed the arcade crown!'
        }
        stats={[
          { label: 'MODE', value: mode === 'pvc' ? 'vs CPU' : '2-Player', accent: '#FFC66D' },
          { label: 'X WINS', value: scores.xWins, accent: '#FF776E' },
          { label: 'O WINS', value: scores.oWins, accent: '#56E0CB' },
        ]}
      />
    </div>
  );
};

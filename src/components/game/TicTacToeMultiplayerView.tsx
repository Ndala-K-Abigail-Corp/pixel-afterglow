/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Trophy,
  Minus,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Copy,
  Check,
  LogOut,
  XCircle,
  AlertTriangle,
  Crown,
} from 'lucide-react';
import { useMultiplayerRoom } from '../../hooks/useMultiplayerRoom';
import { MultiplayerLobbyAndWaitingRoom } from '../multiplayer/MultiplayerLobbyAndWaitingRoom';
import {
  startTicTacToeMultiplayerGame,
  makeTicTacToeMultiplayerMove,
  voteTicTacToeRematch,
  startTicTacToeRematch,
} from '../../logic/ticTacToeMultiplayer';
import { isPlayerEffectivelyConnected } from '../../logic/multiplayerRoom';
import { formatFirebaseError } from '../../lib/firebase';
import { WinCelebration } from '../common/WinCelebration';
import { VictoryCelebrationModal } from '../common/VictoryCelebrationModal';
import { useAudio } from '../../context/AudioContext';

interface TicTacToeMultiplayerViewProps {
  onBackToHome: () => void;
}

export const TicTacToeMultiplayerView: React.FC<TicTacToeMultiplayerViewProps> = ({
  onBackToHome,
}) => {
  const { playMove, playWin, playDraw, playReset, playClick } = useAudio();
  const {
    room,
    uid,
    isHost,
    isLoading,
    isReconnecting,
    error,
    preferredNickname,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    clearError,
  } = useMultiplayerRoom('tic-tac-toe', true);

  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingMove, setIsSubmittingMove] = useState<boolean>(false);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [isCelebrationOpen, setIsCelebrationOpen] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const prevRoundRef = useRef<number>(0);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Trigger sound and celebration modal when game transitions to completed
  useEffect(() => {
    if (!room || !room.ticTacToeState) return;
    const ttt = room.ticTacToeState;

    if (
      room.status === 'completed' &&
      (prevStatusRef.current !== 'completed' || prevRoundRef.current !== ttt.roundNumber)
    ) {
      prevStatusRef.current = 'completed';
      prevRoundRef.current = ttt.roundNumber;

      if (ttt.winnerSymbol) {
        playWin();
        setTimeout(() => {
          setIsCelebrationOpen(true);
        }, 300);
      } else if (ttt.isDraw) {
        playDraw();
      }
    } else if (room.status === 'in_progress') {
      if (prevStatusRef.current === 'completed') {
        playReset();
        setIsCelebrationOpen(false);
      }
      prevStatusRef.current = 'in_progress';
      prevRoundRef.current = ttt.roundNumber;
    }
  }, [room, playWin, playDraw, playReset]);

  const handleStartGame = async () => {
    if (!room) return;
    setActionError(null);
    try {
      await startTicTacToeMultiplayerGame(room.roomCode);
    } catch (err) {
      setActionError(formatFirebaseError(err).formatted);
    }
  };

  const handleCellClick = async (cellIndex: number) => {
    if (!room || !room.ticTacToeState || !uid || isSubmittingMove) return;
    const ttt = room.ticTacToeState;

    if (
      room.status !== 'in_progress' ||
      room.currentTurnUid !== uid ||
      ttt.board[cellIndex] !== null
    ) {
      return;
    }

    setActionError(null);
    setIsSubmittingMove(true);
    playMove(ttt.currentTurnSymbol);

    try {
      await makeTicTacToeMultiplayerMove(room.roomCode, cellIndex);
    } catch (err) {
      setActionError(formatFirebaseError(err).formatted);
    } finally {
      setIsSubmittingMove(false);
    }
  };

  const handleVoteRematch = async () => {
    if (!room) return;
    playClick();
    setActionError(null);
    try {
      await voteTicTacToeRematch(room.roomCode);
    } catch (err) {
      setActionError(formatFirebaseError(err).formatted);
    }
  };

  const handleStartRematch = async () => {
    if (!room) return;
    playClick();
    setActionError(null);
    try {
      await startTicTacToeRematch(room.roomCode);
    } catch (err) {
      setActionError(formatFirebaseError(err).formatted);
    }
  };

  const handleCopyCode = async () => {
    if (!room) return;
    playClick();
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
    }
  };

  // Render Lobby or Waiting Room if not yet in active/completed game
  if (!room || room.status === 'waiting' || !room.ticTacToeState) {
    return (
      <MultiplayerLobbyAndWaitingRoom
        gameType="tic-tac-toe"
        gameTitle="Tic-Tac-Toe"
        room={room}
        uid={uid}
        isHost={isHost}
        isLoading={isLoading}
        isReconnecting={isReconnecting}
        error={actionError || error}
        preferredNickname={preferredNickname}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onStartGame={handleStartGame}
        onLeaveRoom={leaveRoom}
        onCloseRoom={closeRoom}
        onClearError={() => {
          setActionError(null);
          clearError();
        }}
      />
    );
  }

  const ttt = room.ticTacToeState;
  const playerX = room.players[ttt.playerXUid];
  const playerO = room.players[ttt.playerOUid];
  const playerXConnected = playerX
    ? isPlayerEffectivelyConnected(playerX, nowMs)
    : false;
  const playerOConnected = playerO
    ? isPlayerEffectivelyConnected(playerO, nowMs)
    : false;

  const myPlayer = uid ? room.players[uid] : null;
  const myConnected = myPlayer ? isPlayerEffectivelyConnected(myPlayer, nowMs) : false;
  const isMyTurn =
    room.status === 'in_progress' && room.currentTurnUid === uid && myConnected;

  const isGameOver = room.status === 'completed';
  const winningIndices: number[] = ttt.winningLine ? ttt.winningLine.indices : [];

  const winnerPlayer = ttt.winnerUid ? room.players[ttt.winnerUid] : null;
  const bothAgreedToRematch = Boolean(
    playerX?.rematchAccepted && playerO?.rematchAccepted
  );
  const guestAgreedToRematch = Boolean(playerO?.rematchAccepted);

  return (
    <div data-testid="tictactoe-multiplayer-active">
      {isGameOver && (
        <WinCelebration winner={ttt.winnerSymbol} isDraw={ttt.isDraw} />
      )}

      {/* Top Room Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#201A36] border border-[#3D345F] rounded-xl px-3.5 py-2.5 mb-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-['Press_Start_2P'] text-[#FFC66D]">
            ROOM {room.roomCode}
          </span>
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#292342] hover:bg-[#56E0CB]/20 text-[#56E0CB] text-[10px] font-bold border border-[#56E0CB]/30 cursor-pointer"
          >
            {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copiedCode ? 'Copied' : 'Copy'}
          </button>
          <span className="text-xs text-[#FFF0D7]/60 font-mono">
            · Round {ttt.roundNumber}
          </span>
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={() => {
              playClick();
              void closeRoom();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF776E]/15 hover:bg-[#FF776E]/25 text-[#FF776E] border border-[#FF776E]/40 text-xs font-semibold cursor-pointer"
            data-testid="mp-close-room-btn"
          >
            <XCircle className="w-3.5 h-3.5" />
            Close Room
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              playClick();
              void leaveRoom();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#292342] hover:bg-[#FF776E]/20 text-[#FFF0D7]/80 border border-[#FFF0D7]/20 text-xs font-semibold cursor-pointer"
            data-testid="mp-leave-room-btn"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave
          </button>
        )}
      </div>

      {/* Error Banner */}
      {(actionError || error) && (
        <div
          role="alert"
          className="max-w-lg mx-auto mb-4 p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-[#FFF0D7] text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{actionError || error}</span>
        </div>
      )}

      {/* Scoreboard & Player Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto mb-4 sm:mb-6">
        {/* Player X (Host) */}
        <div
          className={`p-2.5 sm:p-3.5 rounded-xl text-center border-2 transition-all min-w-0 ${
            ttt.currentTurnSymbol === 'X' && !isGameOver
              ? 'bg-[#292342] border-[#FF776E] retro-box-coral sm:scale-105'
              : 'bg-[#201A36] border-[#3D345F]'
          }`}
          data-testid="mp-player-x-card"
        >
          <div className="flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-['Press_Start_2P'] text-[#FF776E] truncate mb-1">
            <Crown className="w-3 h-3 text-[#FFC66D] shrink-0" />
            <span className="truncate">{playerX?.nickname || 'Player X'} (X)</span>
          </div>
          <div className="font-['Press_Start_2P'] text-lg sm:text-2xl text-[#FFF0D7]">
            {ttt.scores.xWins}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            {ttt.playerXUid === uid && (
              <span className="px-1.5 py-0.2 rounded bg-[#FF776E]/20 text-[#FF776E] text-[9px] font-bold">
                YOU
              </span>
            )}
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
                playerXConnected ? 'text-[#56E0CB]' : 'text-[#FF776E]'
              }`}
            >
              {playerXConnected ? (
                <Wifi className="w-2.5 h-2.5" />
              ) : (
                <WifiOff className="w-2.5 h-2.5" />
              )}
              {playerXConnected ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Draws */}
        <div className="p-2.5 sm:p-3.5 rounded-xl text-center bg-[#201A36] border border-[#3D345F] min-w-0 flex flex-col justify-center">
          <div className="text-[9px] sm:text-[10px] font-['Press_Start_2P'] text-[#FFC66D] tracking-wider mb-1 flex items-center justify-center gap-1">
            <Minus className="w-3 h-3 text-[#FFC66D] shrink-0" />
            <span>DRAWS</span>
          </div>
          <div className="font-['Press_Start_2P'] text-lg sm:text-2xl text-[#FFF0D7]">
            {ttt.scores.draws}
          </div>
          <div className="text-[10px] text-[#FFF0D7]/50 mt-0.5">TIES</div>
        </div>

        {/* Player O (Guest) */}
        <div
          className={`p-2.5 sm:p-3.5 rounded-xl text-center border-2 transition-all min-w-0 ${
            ttt.currentTurnSymbol === 'O' && !isGameOver
              ? 'bg-[#292342] border-[#56E0CB] retro-box-teal sm:scale-105'
              : 'bg-[#201A36] border-[#3D345F]'
          }`}
          data-testid="mp-player-o-card"
        >
          <div className="text-[9px] sm:text-[10px] font-['Press_Start_2P'] text-[#56E0CB] truncate mb-1">
            {playerO?.nickname || 'Player O'} (O)
          </div>
          <div className="font-['Press_Start_2P'] text-lg sm:text-2xl text-[#FFF0D7]">
            {ttt.scores.oWins}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            {ttt.playerOUid === uid && (
              <span className="px-1.5 py-0.2 rounded bg-[#56E0CB]/20 text-[#56E0CB] text-[9px] font-bold">
                YOU
              </span>
            )}
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
                playerOConnected ? 'text-[#56E0CB]' : 'text-[#FF776E]'
              }`}
            >
              {playerOConnected ? (
                <Wifi className="w-2.5 h-2.5" />
              ) : (
                <WifiOff className="w-2.5 h-2.5" />
              )}
              {playerOConnected ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Turn & Match Status Banner */}
      <div className="max-w-md mx-auto mb-4 sm:mb-6 text-center">
        {isGameOver ? (
          ttt.winnerSymbol ? (
            <div
              className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl border-2 flex items-center justify-center gap-2 ${
                ttt.winnerSymbol === 'X'
                  ? 'bg-[#FF776E]/15 border-[#FF776E] text-[#FF776E]'
                  : 'bg-[#56E0CB]/15 border-[#56E0CB] text-[#56E0CB]'
              }`}
              role="status"
              data-testid="mp-winner-banner"
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span className="font-['Press_Start_2P'] text-[10px] sm:text-xs leading-snug">
                {winnerPlayer?.nickname || `PLAYER ${ttt.winnerSymbol}`} ({ttt.winnerSymbol}) WINS!
              </span>
              <Sparkles className="w-4 h-4 shrink-0" />
            </div>
          ) : (
            <div
              className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl border-2 bg-[#FFC66D]/15 border-[#FFC66D] text-[#FFC66D] flex items-center justify-center gap-2"
              role="status"
              data-testid="mp-draw-banner"
            >
              <span className="font-['Press_Start_2P'] text-[10px] sm:text-xs">
                IT&apos;S A DRAW! CAT&apos;S GAME!
              </span>
            </div>
          )
        ) : (
          <div
            className={`py-2.5 px-4 rounded-xl border text-center transition-colors ${
              ttt.currentTurnSymbol === 'X'
                ? 'bg-[#292342] border-[#FF776E]/60 text-[#FF776E]'
                : 'bg-[#292342] border-[#56E0CB]/60 text-[#56E0CB]'
            }`}
            role="status"
            data-testid="mp-turn-banner"
          >
            <span className="text-xs font-semibold mr-2 text-[#FFF0D7]/75">
              Current Turn:
            </span>
            <span className="font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wide">
              {isMyTurn
                ? `YOUR TURN (${ttt.currentTurnSymbol})`
                : `${
                    ttt.currentTurnSymbol === 'X'
                      ? playerX?.nickname || 'Player X'
                      : playerO?.nickname || 'Player O'
                  } (${ttt.currentTurnSymbol})`}
            </span>
          </div>
        )}
      </div>

      {/* Synchronized 3x3 Board */}
      <div className="w-full max-w-[320px] sm:max-w-[380px] aspect-square mx-auto bg-[#201A36] border-4 border-[#292342] rounded-2xl p-2.5 sm:p-3 shadow-2xl relative">
        <div className="absolute inset-0 crt-subtle-overlay rounded-2xl pointer-events-none opacity-40" />

        <div
          className="grid grid-cols-3 grid-rows-3 gap-2 sm:gap-2.5 w-full h-full"
          role="grid"
          aria-label="Multiplayer 3 by 3 Tic-Tac-Toe Board"
        >
          {ttt.board.map((cell, index) => {
            const isWinningCell = winningIndices.includes(index);
            const row = Math.floor(index / 3) + 1;
            const col = (index % 3) + 1;
            const isOccupied = cell !== null;
            const canClick = !isGameOver && isMyTurn && !isOccupied && !isSubmittingMove;

            return (
              <button
                key={index}
                role="gridcell"
                type="button"
                onClick={() => void handleCellClick(index)}
                onMouseEnter={() => setHoveredCell(index)}
                onMouseLeave={() => setHoveredCell(null)}
                disabled={!canClick}
                aria-label={`Row ${row}, Column ${col}: ${
                  cell ? `Player ${cell}` : 'Empty cell'
                }`}
                data-testid={`mp-ttt-cell-${index}`}
                className={`relative flex items-center justify-center rounded-xl font-['Press_Start_2P'] transition-all select-none ${
                  isWinningCell
                    ? 'bg-[#FFC66D]/30 border-2 border-[#FFC66D] shadow-lg scale-[1.02] z-10'
                    : isOccupied
                    ? 'bg-[#171329] border border-[#3D345F] cursor-default'
                    : canClick
                    ? 'bg-[#292342] hover:bg-[#322B50] active:scale-95 border border-[#3D345F] hover:border-[#56E0CB] cursor-pointer'
                    : 'bg-[#292342]/70 border border-[#3D345F]/50 cursor-not-allowed opacity-80'
                }`}
              >
                {cell === 'X' && (
                  <span
                    className={`text-2xl sm:text-4xl md:text-5xl font-['Press_Start_2P'] ${
                      isWinningCell
                        ? 'text-[#FFC66D] scale-110 drop-shadow-[0_0_8px_#FFC66D]'
                        : 'text-[#FF776E]'
                    }`}
                  >
                    X
                  </span>
                )}
                {cell === 'O' && (
                  <span
                    className={`text-2xl sm:text-4xl md:text-5xl font-['Press_Start_2P'] ${
                      isWinningCell
                        ? 'text-[#FFC66D] scale-110 drop-shadow-[0_0_8px_#FFC66D]'
                        : 'text-[#56E0CB]'
                    }`}
                  >
                    O
                  </span>
                )}

                {!isOccupied && canClick && hoveredCell === index && (
                  <span
                    className={`text-2xl sm:text-4xl md:text-5xl font-['Press_Start_2P'] opacity-25 pointer-events-none ${
                      ttt.currentTurnSymbol === 'X' ? 'text-[#FF776E]' : 'text-[#56E0CB]'
                    }`}
                  >
                    {ttt.currentTurnSymbol}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Consensual Rematch Panel after game completion */}
      {isGameOver && (
        <div
          className="max-w-md mx-auto w-full mt-6 p-4 rounded-2xl bg-[#201A36] border-2 border-[#3D345F]"
          data-testid="mp-rematch-panel"
        >
          <div className="text-center mb-3">
            <h3 className="font-['Press_Start_2P'] text-xs text-[#FFC66D] uppercase mb-1">
              Rematch Consensus
            </h3>
            <p className="text-xs text-[#FFF0D7]/70">
              Both players must agree to play another round, then the host starts the rematch.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="p-2.5 rounded-xl bg-[#171329] border border-[#FFF0D7]/15 flex items-center justify-between text-xs">
              <span className="font-bold text-[#FF776E] truncate">
                {playerX?.nickname || 'Player X'}
              </span>
              {playerX?.rematchAccepted ? (
                <span className="inline-flex items-center gap-1 text-[#56E0CB] font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[#FFF0D7]/50">
                  <Clock className="w-3.5 h-3.5" />
                  Waiting
                </span>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-[#171329] border border-[#FFF0D7]/15 flex items-center justify-between text-xs">
              <span className="font-bold text-[#56E0CB] truncate">
                {playerO?.nickname || 'Player O'}
              </span>
              {playerO?.rematchAccepted ? (
                <span className="inline-flex items-center gap-1 text-[#56E0CB] font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[#FFF0D7]/50">
                  <Clock className="w-3.5 h-3.5" />
                  Waiting
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            {!myPlayer?.rematchAccepted && (
              <button
                type="button"
                onClick={() => void handleVoteRematch()}
                className="flex-1 py-3 px-4 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[11px] uppercase flex items-center justify-center gap-2 cursor-pointer transition-all"
                data-testid="mp-vote-rematch-btn"
              >
                <CheckCircle2 className="w-4 h-4" />
                Agree to Rematch
              </button>
            )}

            {isHost && (
              <button
                type="button"
                onClick={() => void handleStartRematch()}
                disabled={!bothAgreedToRematch && !guestAgreedToRematch}
                className={`flex-1 py-3 px-4 rounded-xl font-['Press_Start_2P'] text-[11px] uppercase flex items-center justify-center gap-2 transition-all ${
                  bothAgreedToRematch || guestAgreedToRematch
                    ? 'bg-[#FF776E] hover:bg-[#ff8f87] text-[#171329] cursor-pointer shadow-[0_0_15px_rgba(255,119,110,0.4)]'
                    : 'bg-[#171329] border border-[#FFF0D7]/20 text-[#FFF0D7]/40 cursor-not-allowed'
                }`}
                data-testid="mp-start-rematch-btn"
              >
                <RotateCcw className="w-4 h-4" />
                Start Rematch
              </button>
            )}
          </div>
        </div>
      )}

      {/* Victory Celebration Modal */}
      <VictoryCelebrationModal
        isOpen={isCelebrationOpen && isGameOver && ttt.winnerSymbol !== null}
        onClose={() => setIsCelebrationOpen(false)}
        onPlayAgain={() => {
          setIsCelebrationOpen(false);
          if (!myPlayer?.rematchAccepted) {
            void handleVoteRematch();
          }
        }}
        onBackToArcade={() => {
          setIsCelebrationOpen(false);
          onBackToHome();
        }}
        gameTitle="TIC-TAC-TOE ONLINE"
        headline={`${
          winnerPlayer?.nickname?.toUpperCase() || `PLAYER ${ttt.winnerSymbol}`
        } WINS!`}
        subheadline={
          ttt.winnerUid === uid
            ? 'You claimed victory in this online arcade duel!'
            : `${winnerPlayer?.nickname || 'Your opponent'} claimed the winning line!`
        }
        stats={[
          { label: 'ROOM', value: room.roomCode, accent: '#FFC66D' },
          {
            label: `${playerX?.nickname || 'X'} WINS`,
            value: ttt.scores.xWins,
            accent: '#FF776E',
          },
          {
            label: `${playerO?.nickname || 'O'} WINS`,
            value: ttt.scores.oWins,
            accent: '#56E0CB',
          },
        ]}
      />
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Trophy,
  Sparkles,
  Wifi,
  WifiOff,
  Copy,
  Check,
  LogOut,
  XCircle,
  AlertTriangle,
  Crown,
  Layers,
} from 'lucide-react';
import { useMultiplayerRoom } from '../../hooks/useMultiplayerRoom';
import { MultiplayerLobbyAndWaitingRoom } from '../multiplayer/MultiplayerLobbyAndWaitingRoom';
import {
  startMemoryMatchMultiplayerGame,
  selectMemoryMatchMultiplayerCard,
  resolveMemoryMatchMultiplayerMismatch,
  getMemoryPlayerColor,
  getMatchedCardOwnerColor,
  startMemoryMatchRematch,
} from '../../logic/memoryMatchMultiplayer';
import {
  isPlayerEffectivelyConnected,
  getUserFriendlyMultiplayerError,
} from '../../logic/multiplayerRoom';
import { MemorySymbolIcon } from './MemorySymbolIcon';
import { WinCelebration } from '../common/WinCelebration';
import { VictoryCelebrationModal } from '../common/VictoryCelebrationModal';
import { useAudio } from '../../context/AudioContext';

interface MemoryMatchMultiplayerViewProps {
  onBackToHome: () => void;
}

export const MemoryMatchMultiplayerView: React.FC<
  MemoryMatchMultiplayerViewProps
> = ({ onBackToHome }) => {
  const { playFlip, playMatch, playMismatch, playWin, playDraw, playClick } =
    useAudio();
  const {
    room,
    uid,
    isHost,
    isLoading,
    isReconnecting,
    isSynchronizing,
    isConnected,
    error,
    preferredNickname,
    invitedRoomCode,
    invitationStatus,
    invitationRoomInfo,
    dismissInvitation,
    createRoom,
    joinRoom,
    syncRoom,
    leaveRoom,
    closeRoom,
    clearError,
  } = useMultiplayerRoom('memory-match', true);

  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingCard, setIsSubmittingCard] = useState<boolean>(false);
  const [isSubmittingRematch, setIsSubmittingRematch] = useState<boolean>(false);
  const [isCelebrationOpen, setIsCelebrationOpen] = useState<boolean>(false);
  const [roundTransitionText, setRoundTransitionText] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const prevStatusRef = useRef<string | null>(null);
  const prevMatchedPairsRef = useRef<number>(0);
  const prevRoundNumberRef = useRef<number>(1);
  const roundTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => {
      clearInterval(timer);
      if (roundTransitionTimerRef.current) {
        clearTimeout(roundTransitionTimerRef.current);
      }
    };
  }, []);

  // Automatically resolve a mismatched pair after MISMATCH_REVEAL_DELAY_MS so cards turn face down.
  // Scoped by roundNumber so a timer from an older round can never affect a newly started round.
  const pendingResetAt = room?.memoryMatchState?.pendingResetAt ?? null;
  const activeRoomCode = room?.roomCode ?? null;
  const currentTurnUid = room?.currentTurnUid ?? null;
  const currentRoundNumber = room?.memoryMatchState?.roundNumber ?? 1;

  useEffect(() => {
    if (!activeRoomCode || pendingResetAt === null || !uid) {
      return;
    }

    const isTurnOwner = currentTurnUid === uid;
    const extraFallbackMs = isTurnOwner ? 50 : isHost ? 900 : 1800;
    const delayMs = Math.max(150, pendingResetAt - Date.now() + extraFallbackMs);
    const timeout = setTimeout(() => {
      void resolveMemoryMatchMultiplayerMismatch(activeRoomCode, currentRoundNumber)
        .then((updatedRoom) => {
          if (updatedRoom) {
            syncRoom?.(updatedRoom);
          }
        })
        .catch(() => {});
    }, delayMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [activeRoomCode, pendingResetAt, currentTurnUid, currentRoundNumber, uid, isHost, syncRoom]);

  // Sound, modal & round-transition effects on match/completion/rematch transitions
  useEffect(() => {
    if (!room || !room.memoryMatchState) return;
    const mm = room.memoryMatchState;
    const currentRound = mm.roundNumber ?? 1;

    if (currentRound > prevRoundNumberRef.current && room.status === 'in_progress') {
      prevRoundNumberRef.current = currentRound;
      prevMatchedPairsRef.current = 0;
      prevStatusRef.current = 'in_progress';
      setIsCelebrationOpen(false);
      setActionError(null);
      setRoundTransitionText(`GET READY – ROUND ${currentRound}!`);

      if (roundTransitionTimerRef.current) {
        clearTimeout(roundTransitionTimerRef.current);
      }
      roundTransitionTimerRef.current = setTimeout(() => {
        setRoundTransitionText(null);
        roundTransitionTimerRef.current = null;
      }, 2200);
    } else if (currentRound < prevRoundNumberRef.current) {
      prevRoundNumberRef.current = currentRound;
    }

    if (mm.matchedPairs > prevMatchedPairsRef.current) {
      prevMatchedPairsRef.current = mm.matchedPairs;
      playMatch();
    } else if (mm.matchedPairs < prevMatchedPairsRef.current) {
      // A new round started: re-sync so the first match of the new round plays its sound
      prevMatchedPairsRef.current = mm.matchedPairs;
    }

    if (room.status === 'completed' && prevStatusRef.current !== 'completed') {
      prevStatusRef.current = 'completed';
      if (mm.isTie) {
        playDraw();
      } else {
        playWin();
      }
      setTimeout(() => {
        setIsCelebrationOpen(true);
      }, 300);
    } else if (room.status === 'in_progress') {
      prevStatusRef.current = 'in_progress';
    }
  }, [room, playMatch, playWin, playDraw]);

  const handleStartGame = async () => {
    if (!room) return;
    setActionError(null);
    try {
      prevMatchedPairsRef.current = 0;
      const startedRoom = await startMemoryMatchMultiplayerGame(room.roomCode);
      syncRoom?.(startedRoom);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'start-game'));
    }
  };

  const handleCardClick = async (cardId: number) => {
    if (!room || !room.memoryMatchState || !uid || isSubmittingCard) return;
    const mm = room.memoryMatchState;

    if (
      room.status !== 'in_progress' ||
      room.currentTurnUid !== uid ||
      mm.pendingResetAt !== null ||
      mm.flippedCardIds.length >= 2
    ) {
      return;
    }

    const target = mm.cards.find((c) => c.id === cardId);
    if (!target || target.isMatched || target.isFlipped) {
      return;
    }

    setActionError(null);
    setIsSubmittingCard(true);
    playFlip();

    try {
      const result = await selectMemoryMatchMultiplayerCard(room.roomCode, cardId);
      syncRoom?.(result.room);
      if (result.turnOutcome === 'mismatch') {
        playMismatch();
      }
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'game-action'));
    } finally {
      setIsSubmittingCard(false);
    }
  };

  const handleStartNextRound = async () => {
    if (!room || isSubmittingRematch) return;
    setActionError(null);
    setIsSubmittingRematch(true);
    playClick();
    try {
      prevMatchedPairsRef.current = 0;
      setIsCelebrationOpen(false);
      const nextRoundRoom = await startMemoryMatchRematch(room.roomCode);
      syncRoom?.(nextRoundRoom);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'rematch'));
    } finally {
      setIsSubmittingRematch(false);
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
  if (!room || room.status === 'waiting' || !room.memoryMatchState) {
    return (
      <MultiplayerLobbyAndWaitingRoom
        gameType="memory-match"
        gameTitle="Memory Match"
        room={room}
        uid={uid}
        isHost={isHost}
        isLoading={isLoading}
        isReconnecting={isReconnecting}
        isSynchronizing={isSynchronizing}
        isConnected={isConnected}
        error={actionError || error}
        preferredNickname={preferredNickname}
        invitedRoomCode={invitedRoomCode}
        invitationStatus={invitationStatus}
        invitationRoomInfo={invitationRoomInfo}
        onDismissInvitation={dismissInvitation}
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

  const mm = room.memoryMatchState;
  const totalCards = mm.cards.length;
  const isGameOver = room.status === 'completed';

  const myPlayer = uid ? room.players[uid] : null;
  const myConnected = myPlayer
    ? isPlayerEffectivelyConnected(myPlayer, nowMs)
    : false;
  const isMyTurn =
    room.status === 'in_progress' &&
    room.currentTurnUid === uid &&
    myConnected &&
    mm.pendingResetAt === null;

  const activeTurnPlayer = room.currentTurnUid
    ? room.players[room.currentTurnUid]
    : null;

  const orderedPlayers = mm.turnOrderUids
    .map((playerUid) => room.players[playerUid])
    .filter(Boolean);

  const winnerNicknames = mm.winnerUids
    .map((wUid) => room.players[wUid]?.nickname || 'Player')
    .join(' & ');

  // Responsive grid layout for 20, 40, 60, or 100 cards:
  // - Desktop: 5x4 (20), 8x5 (40), 10x6 (60), 10x10 (100)
  // - Mobile: 4-5 columns so cards remain large enough to tap comfortably and icons stay legible with vertical scrolling
  const gridClasses =
    totalCards <= 20
      ? 'grid-cols-4 sm:grid-cols-5 max-w-[380px] sm:max-w-[540px] gap-2 sm:gap-2.5'
      : totalCards <= 40
      ? 'grid-cols-5 sm:grid-cols-8 max-w-[440px] sm:max-w-[740px] gap-1.5 sm:gap-2'
      : totalCards <= 60
      ? 'grid-cols-5 sm:grid-cols-10 max-w-[460px] sm:max-w-[880px] gap-1.5 sm:gap-1.5'
      : 'grid-cols-5 sm:grid-cols-10 max-w-[460px] sm:max-w-[920px] gap-1.5 sm:gap-1.5';

  const iconSizeClass =
    totalCards <= 20
      ? 'w-7 h-7 sm:w-9 sm:h-9'
      : totalCards <= 40
      ? 'w-5 h-5 sm:w-7 sm:h-7'
      : 'w-5 h-5 sm:w-6 sm:h-6';

  return (
    <div data-testid="memory-multiplayer-active">
      {isGameOver && (
        <WinCelebration winner={mm.isTie ? null : 'X'} isDraw={mm.isTie} />
      )}

      {/* Top Room Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#201A36] border border-[#3D345F] rounded-xl px-3.5 py-2.5 mb-4 max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center gap-2">
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
          <span className="inline-flex items-center gap-1 text-xs text-[#56E0CB] font-semibold">
            <Layers className="w-3.5 h-3.5" />
            Pairs: {mm.matchedPairs} / {mm.totalPairs}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-['Press_Start_2P'] text-[#FFC66D]"
            data-testid="mp-memory-round-indicator"
          >
            ROUND {mm.roundNumber ?? 1}
          </span>
          {(isSynchronizing || isConnected === false) && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFC66D]/15 border border-[#FFC66D]/40 text-[#FFC66D] text-[10px] font-semibold animate-pulse"
              data-testid="mp-memory-sync-indicator"
            >
              {isConnected === false ? 'Reconnecting...' : 'Syncing...'}
            </span>
          )}
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={() => {
              playClick();
              void closeRoom();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF776E]/15 hover:bg-[#FF776E]/25 text-[#FF776E] border border-[#FF776E]/40 text-xs font-semibold cursor-pointer"
            data-testid="mp-memory-close-room-btn"
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
            data-testid="mp-memory-leave-room-btn"
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
          className="max-w-3xl mx-auto mb-4 p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-[#FFF0D7] text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{actionError || error}</span>
        </div>
      )}

      {/* Multi-Player Shared Scoreboard (2–8 Players) */}
      <div
        className={`grid gap-2 sm:gap-2.5 max-w-4xl mx-auto mb-3 ${
          orderedPlayers.length === 2
            ? 'grid-cols-2'
            : orderedPlayers.length === 3
            ? 'grid-cols-3'
            : orderedPlayers.length === 5 || orderedPlayers.length === 6
            ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-4'
        }`}
        data-testid="mp-memory-scoreboard"
      >
        {orderedPlayers.map((player, idx) => {
          const isTurn = !isGameOver && room.currentTurnUid === player.uid;
          const connected = isPlayerEffectivelyConnected(player, nowMs);
          const isWinner = isGameOver && mm.winnerUids.includes(player.uid);
          const playerColor = getMemoryPlayerColor(player.uid, mm.turnOrderUids);
          const accentHex = playerColor?.hex ?? '#3B82F6';
          const glowRgba = playerColor?.glowRgba ?? 'rgba(59, 130, 246, 0.38)';
          const tintRgba = playerColor?.tintRgba ?? 'rgba(59, 130, 246, 0.16)';
          const badgeBgRgba = playerColor?.badgeBgRgba ?? 'rgba(59, 130, 246, 0.22)';

          return (
            <div
              key={player.uid}
              className="relative overflow-hidden p-2.5 sm:p-3 rounded-xl border-2 transition-all min-w-0 bg-[#201A36]"
              style={{
                borderColor: isWinner ? '#FFC66D' : accentHex,
                backgroundImage: `linear-gradient(135deg, ${tintRgba} 0%, rgba(32, 26, 54, 0.95) 100%)`,
                boxShadow: isWinner
                  ? '0 0 20px rgba(255, 198, 109, 0.3)'
                  : isTurn
                  ? `0 0 16px ${glowRgba}`
                  : 'none',
              }}
              data-testid={`mp-memory-player-${idx}`}
              data-player-color={accentHex}
            >
              {/* Top player colour bar */}
              <div
                className="
                  absolute top-0 left-0 right-0 h-1
                "
                style={{ backgroundColor: accentHex }}
                aria-hidden="true"
              />

              <div className="flex items-center justify-between gap-1 mb-1 mt-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-['Press_Start_2P'] shrink-0 border"
                    style={{
                      color: accentHex,
                      borderColor: accentHex,
                      backgroundColor: badgeBgRgba,
                    }}
                    data-testid={`mp-memory-player-badge-${idx}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: accentHex }}
                    />
                    {playerColor?.label ?? `P${idx + 1}`}
                  </span>
                  {player.isHost && (
                    <Crown className="w-3 h-3 text-[#FFC66D] shrink-0" />
                  )}
                  <span className="font-bold text-xs sm:text-sm text-[#FFF0D7] truncate">
                    {player.nickname}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isTurn && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[8px] font-['Press_Start_2P'] uppercase shrink-0"
                      style={{
                        color: '#171329',
                        backgroundColor: accentHex,
                      }}
                    >
                      TURN
                    </span>
                  )}
                  {player.uid === uid && (
                    <span className="px-1.5 py-0.5 rounded bg-[#56E0CB]/20 text-[#56E0CB] text-[9px] font-bold shrink-0">
                      YOU
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-baseline justify-between mt-1.5">
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-['Press_Start_2P'] text-base sm:text-xl"
                    style={{ color: accentHex }}
                    data-testid={`mp-memory-score-${idx}`}
                  >
                    {player.score}
                  </span>
                  <span className="text-[10px] text-[#FFF0D7]/70">
                    {player.score === 1 ? 'PAIR' : 'PAIRS'}
                  </span>
                </div>

                <span
                  className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
                    connected ? 'text-[#56E0CB]' : 'text-[#FF776E]'
                  }`}
                >
                  {connected ? (
                    <Wifi className="w-2.5 h-2.5" />
                  ) : (
                    <WifiOff className="w-2.5 h-2.5" />
                  )}
                  {connected ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact Player Colour Legend */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 max-w-3xl mx-auto mb-3 px-3 py-1.5 rounded-lg bg-[#201A36]/80 border border-[#3D345F]/70 text-[11px]"
        data-testid="mp-memory-color-legend"
        aria-label="Matched card player colour legend"
      >
        <span className="text-[#FFF0D7]/60 font-semibold uppercase tracking-wider text-[10px]">
          Matched Card Colours:
        </span>
        {orderedPlayers.map((player, idx) => {
          const playerColor = getMemoryPlayerColor(player.uid, mm.turnOrderUids);
          const hex = playerColor?.hex ?? '#3B82F6';
          const tint = playerColor?.tintRgba ?? 'rgba(59, 130, 246, 0.16)';
          return (
            <span
              key={player.uid}
              className="inline-flex items-center gap-1.5 text-[#FFF0D7]/90 font-medium"
              data-testid={`mp-memory-legend-item-${idx}`}
            >
              <span
                className="w-3 h-3 rounded-sm border-2 inline-block shrink-0"
                style={{
                  borderColor: hex,
                  backgroundColor: tint,
                  boxShadow: `0 0 6px ${playerColor?.glowRgba ?? 'transparent'}`,
                }}
                aria-hidden="true"
              />
              <span className="font-bold" style={{ color: hex }}>
                {playerColor?.label ?? `P${idx + 1}`}
              </span>
              <span className="truncate max-w-[95px]">{player.nickname}</span>
            </span>
          );
        })}
      </div>

      {/* New Round Transition Banner */}
      {roundTransitionText && (
        <div
          className="max-w-xl mx-auto mb-3 py-2.5 px-4 rounded-xl bg-[#FFC66D]/20 border-2 border-[#FFC66D] text-[#FFC66D] text-center shadow-[0_0_20px_rgba(255,198,109,0.28)] animate-pulse"
          role="status"
          data-testid="mp-memory-round-transition"
        >
          <span className="font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wider">
            {roundTransitionText}
          </span>
        </div>
      )}

      {/* Turn & Match Status Banner */}
      <div className="max-w-xl mx-auto mb-4 text-center">
        {isGameOver ? (
          <div
            className={`py-2.5 sm:py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 ${
              mm.isTie
                ? 'bg-[#FFC66D]/15 border-[#FFC66D] text-[#FFC66D]'
                : 'bg-[#56E0CB]/15 border-[#56E0CB] text-[#56E0CB]'
            }`}
            role="status"
            data-testid="mp-memory-result-banner"
          >
            <Trophy className="w-4 h-4 shrink-0" />
            <span className="font-['Press_Start_2P'] text-[10px] sm:text-xs leading-snug">
              {mm.isTie
                ? `TIE GAME! ${winnerNicknames.toUpperCase()} TIED!`
                : `${winnerNicknames.toUpperCase()} WINS THE MATCH!`}
            </span>
            <Sparkles className="w-4 h-4 shrink-0" />
          </div>
        ) : (
          <div
            className={`py-2.5 px-4 rounded-xl border text-center transition-colors ${
              isMyTurn
                ? 'bg-[#292342] border-[#56E0CB] text-[#56E0CB]'
                : 'bg-[#201A36] border-[#FFC66D]/50 text-[#FFC66D]'
            }`}
            role="status"
            data-testid="mp-memory-turn-banner"
          >
            <span className="text-xs font-semibold mr-2 text-[#FFF0D7]/75">
              {mm.pendingResetAt !== null ? 'Revealing Pair:' : 'Current Turn:'}
            </span>
            <span className="font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase">
              {mm.pendingResetAt !== null
                ? 'No Match! Turning Face Down...'
                : isMyTurn
                ? `YOUR TURN (Pick ${2 - mm.flippedCardIds.length} Card${
                    2 - mm.flippedCardIds.length === 1 ? '' : 's'
                  })`
                : `${activeTurnPlayer?.nickname || 'Player'}'s Turn`}
            </span>
          </div>
        )}
      </div>

      {/* Shared Memory Match Card Grid */}
      <div
        className={`grid ${gridClasses} mx-auto bg-[#201A36] border-4 border-[#292342] rounded-2xl p-2.5 sm:p-4 shadow-2xl`}
        role="grid"
        aria-label={`Multiplayer Memory Match Board with ${totalCards} cards`}
      >
        {mm.cards.map((card, index) => {
          const isFaceUp = card.isFlipped || card.isMatched;
          const canSelect =
            !isGameOver &&
            isMyTurn &&
            !isFaceUp &&
            !isSubmittingCard &&
            mm.flippedCardIds.length < 2;

          const matchedOwnerColor = getMatchedCardOwnerColor(
            card,
            mm.turnOrderUids,
            mm.matchedByPairKey
          );
          const resolvedOwnerUid =
            (card.isMatched &&
              (mm.matchedByPairKey?.[card.symbolId] ||
                mm.matchedByPairKey?.[card.pairKey])) ||
            card.matchedByUid;
          const matchedOwnerPlayer =
            card.isMatched && resolvedOwnerUid
              ? room.players[resolvedOwnerUid]
              : null;

          const matchedCardStyle: React.CSSProperties | undefined =
            card.isMatched && matchedOwnerColor
              ? {
                  borderColor: matchedOwnerColor.hex,
                  backgroundColor: '#171329',
                  backgroundImage: `linear-gradient(135deg, ${matchedOwnerColor.tintRgba} 0%, rgba(23, 19, 41, 0.92) 100%)`,
                  boxShadow: `0 0 12px ${matchedOwnerColor.glowRgba}, inset 0 0 8px ${matchedOwnerColor.tintRgba}`,
                }
              : undefined;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => void handleCardClick(card.id)}
              disabled={!canSelect}
              aria-label={
                isFaceUp
                  ? `Card ${index + 1}: ${card.name}${
                      card.isMatched
                        ? ` (Matched by ${
                            matchedOwnerPlayer?.nickname ||
                            matchedOwnerColor?.label ||
                            'Player'
                          })`
                        : ''
                    }`
                  : `Card ${index + 1}: Face down`
              }
              data-testid={`mp-memory-card-${card.id}`}
              data-matched-by={card.isMatched && resolvedOwnerUid ? resolvedOwnerUid : undefined}
              data-matched-color={
                card.isMatched && matchedOwnerColor ? matchedOwnerColor.hex : undefined
              }
              style={matchedCardStyle}
              className={`relative aspect-square rounded-lg sm:rounded-xl flex flex-col items-center justify-center transition-all select-none ${
                card.isMatched
                  ? 'bg-[#171329]/90 border-2'
                  : card.isFlipped
                  ? 'bg-[#292342] border-2 border-[#FFC66D] scale-[1.02]'
                  : canSelect
                  ? 'bg-[#292342] hover:bg-[#332B54] border border-[#3D345F] hover:border-[#56E0CB] active:scale-95 cursor-pointer'
                  : 'bg-[#292342]/75 border border-[#3D345F]/60 cursor-not-allowed opacity-85'
              }`}
            >
              {isFaceUp ? (
                <>
                  <MemorySymbolIcon
                    symbolId={card.symbolId}
                    color={card.color}
                    className={iconSizeClass}
                  />
                  {card.isMatched && matchedOwnerColor && (
                    <span
                      className="absolute bottom-0.5 left-1 font-['Press_Start_2P'] text-[6px] sm:text-[7px] px-1 py-0.2 rounded leading-tight"
                      style={{
                        color: matchedOwnerColor.hex,
                        backgroundColor: 'rgba(23, 19, 41, 0.88)',
                      }}
                      data-testid={`mp-memory-card-owner-tag-${card.id}`}
                    >
                      {matchedOwnerColor.label}
                    </span>
                  )}
                </>
              ) : (
                <span className="font-['Press_Start_2P'] text-[9px] sm:text-xs text-[#FFF0D7]/30">
                  ?
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Play Again / Next Round Panel */}
      {isGameOver && (
        <div
          className="max-w-3xl mx-auto mt-4 p-3.5 sm:p-4 rounded-xl bg-[#201A36] border-2 border-[#FFC66D]/60"
          data-testid="mp-memory-rematch-panel"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] mb-1.5">
                ROUND {mm.roundNumber ?? 1} COMPLETE
              </h3>
              <p className="text-xs text-[#FFF0D7]/75" data-testid="mp-memory-rematch-status">
                {isHost
                  ? `Click Play Again to immediately deal a fresh shuffled board for Round ${(mm.roundNumber ?? 1) + 1}!`
                  : `Waiting for the host to start Round ${(mm.roundNumber ?? 1) + 1}...`}
              </p>
            </div>

            {isHost && (
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleStartNextRound()}
                  disabled={isSubmittingRematch}
                  className="px-5 py-3 rounded-xl font-['Press_Start_2P'] text-xs uppercase tracking-wider bg-[#FF776E] hover:bg-[#ff8d85] text-[#171329] shadow-[0_0_20px_rgba(255,119,110,0.4)] transition-all cursor-pointer disabled:opacity-60"
                  data-testid="mp-memory-play-again-btn"
                >
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Victory Celebration Modal */}
      <VictoryCelebrationModal
        isOpen={isCelebrationOpen && isGameOver}
        onClose={() => setIsCelebrationOpen(false)}
        onPlayAgain={() => {
          setIsCelebrationOpen(false);
          if (isHost) {
            void handleStartNextRound();
          }
        }}
        onBackToArcade={() => {
          setIsCelebrationOpen(false);
          onBackToHome();
        }}
        gameTitle="MEMORY MATCH ONLINE"
        headline={
          mm.isTie
            ? `IT'S A TIE!`
            : `${winnerNicknames.toUpperCase()} WINS!`
        }
        subheadline={
          mm.isTie
            ? `${winnerNicknames} tied with the highest score on the ${totalCards}-card board!`
            : `${winnerNicknames} found the most pairs on the ${totalCards}-card board!`
        }
        stats={orderedPlayers.map((p) => ({
          label: p.nickname.toUpperCase(),
          value: `${p.score} ${p.score === 1 ? 'PAIR' : 'PAIRS'}`,
          accent: getMemoryPlayerColor(p.uid, mm.turnOrderUids)?.hex ?? '#3B82F6',
        }))}
      />
    </div>
  );
};

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
  Lock,
  SkipForward,
  RefreshCw,
} from 'lucide-react';
import { useMultiplayerRoom } from '../../hooks/useMultiplayerRoom';
import { MultiplayerLobbyAndWaitingRoom } from '../multiplayer/MultiplayerLobbyAndWaitingRoom';
import {
  MemoryRoomSettingsPanel,
  LargeBoardNotice,
} from '../multiplayer/MemoryRoomSettingsPanel';
import { RoomSocialBar } from '../multiplayer/RoomSocialBar';
import {
  getRoomMemorySettings,
  getMemoryPairCount,
  isLargeMemoryBoard,
  type MemoryRoomSettings,
} from '../../types/multiplayer';
import {
  startMemoryMatchMultiplayerGame,
  selectMemoryMatchMultiplayerCard,
  resolveMemoryMatchMultiplayerMismatch,
  skipMemoryMatchMultiplayerTurn,
  canSkipCurrentMemoryMatchTurn,
  MISMATCH_REVEAL_DELAY_MS,
  getMemoryPlayerColor,
  getMatchedCardOwnerColor,
} from '../../logic/memoryMatchMultiplayer';
import {
  isPlayerEffectivelyConnected,
  getUserFriendlyMultiplayerError,
  returnRoomToWaiting,
  togglePlayerReady,
} from '../../logic/multiplayerRoom';
import { MemorySymbolIcon } from './MemorySymbolIcon';
import { WinCelebration } from '../common/WinCelebration';
import { VictoryCelebrationModal } from '../common/VictoryCelebrationModal';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import { recordVerifiedMultiplayerMatchForPlayer } from '../../logic/matchRecording';

interface MemoryMatchMultiplayerViewProps {
  onBackToHome: () => void;
  onActiveGameChange?: (isActive: boolean) => void;
}

export const MemoryMatchMultiplayerView: React.FC<
  MemoryMatchMultiplayerViewProps
> = ({ onBackToHome, onActiveGameChange }) => {
  const { playFlip, playMatch, playMismatch, playWin, playDraw, playClick } =
    useAudio();
  const { profile, isSignedInAccount } = useAuth();
  const recordedMemoryRoundRef = useRef<string | null>(null);
  const {
    room,
    uid,
    isHost,
    isLoading,
    isReconnecting,
    isSynchronizing,
    isConnected,
    connectionState,
    failedReconnectRoomCode,
    retryReconnect,
    error,
    preferredNickname,
    invitedRoomCode,
    invitationStatus,
    invitationRoomInfo,
    dismissInvitation,
    createRoom,
    joinRoom,
    updateRoomSettings,
    refreshRoom,
    syncRoom,
    leaveRoom,
    closeRoom,
    clearError,
  } = useMultiplayerRoom('memory-match', true);

  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingCard, setIsSubmittingCard] = useState<boolean>(false);
  const [isSubmittingRematch, setIsSubmittingRematch] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [isConfirmingSkip, setIsConfirmingSkip] = useState<boolean>(false);
  const [isSkippingTurn, setIsSkippingTurn] = useState<boolean>(false);
  const [skipNoticeText, setSkipNoticeText] = useState<string | null>(null);
  const [isCelebrationOpen, setIsCelebrationOpen] = useState<boolean>(false);
  const [roundTransitionText, setRoundTransitionText] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const prevStatusRef = useRef<string | null>(null);
  const prevMatchedPairsRef = useRef<number>(0);
  const prevRoundNumberRef = useRef<number>(1);
  const prevSkippedAtRef = useRef<number>(0);
  const isSubmittingCardRef = useRef<boolean>(false);
  const roundTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBoardActive = Boolean(room && room.status !== 'waiting' && room.memoryMatchState);
  useEffect(() => {
    onActiveGameChange?.(isBoardActive);
    return () => {
      onActiveGameChange?.(false);
    };
  }, [isBoardActive, onActiveGameChange]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => {
      clearInterval(timer);
      if (roundTransitionTimerRef.current) {
        clearTimeout(roundTransitionTimerRef.current);
      }
      if (skipNoticeTimerRef.current) {
        clearTimeout(skipNoticeTimerRef.current);
      }
    };
  }, []);

  // Automatically resolve a mismatched pair after MISMATCH_REVEAL_DELAY_MS so cards turn face down.
  // Clamps delay so cross-device clock skew can never freeze a game waiting for mismatch reset.
  const pendingResetAt = room?.memoryMatchState?.pendingResetAt ?? null;
  const activeRoomCode = room?.roomCode ?? null;
  const currentTurnUid = room?.currentTurnUid ?? null;
  const currentRoundNumber = room?.memoryMatchState?.roundNumber ?? 1;
  const currentTurnSequence = room?.memoryMatchState?.turnSequence ?? 1;

  // Reset confirmation dialog whenever the turn or round advances
  useEffect(() => {
    setIsConfirmingSkip(false);
    isSubmittingCardRef.current = false;
    setIsSubmittingCard(false);
  }, [currentTurnUid, currentRoundNumber, currentTurnSequence]);

  // Show a brief notification to all players whenever a turn is skipped
  const lastSkippedTurn = room?.memoryMatchState?.lastSkippedTurn ?? null;
  useEffect(() => {
    if (!lastSkippedTurn || lastSkippedTurn.skippedAt <= prevSkippedAtRef.current) {
      return;
    }
    prevSkippedAtRef.current = lastSkippedTurn.skippedAt;
    setSkipNoticeText(
      `${lastSkippedTurn.skippedNickname}'s inactive turn was skipped by ${lastSkippedTurn.skippedByNickname}.`
    );
    if (skipNoticeTimerRef.current) {
      clearTimeout(skipNoticeTimerRef.current);
    }
    skipNoticeTimerRef.current = setTimeout(() => {
      setSkipNoticeText(null);
      skipNoticeTimerRef.current = null;
    }, 5000);
  }, [lastSkippedTurn]);

  useEffect(() => {
    if (!activeRoomCode || pendingResetAt === null || !uid) {
      return;
    }

    const isTurnOwner = currentTurnUid === uid;
    const extraFallbackMs = isTurnOwner ? 50 : isHost ? 900 : 1800;
    const rawDelayMs = pendingResetAt - Date.now() + extraFallbackMs;
    const maxSafeDelayMs = MISMATCH_REVEAL_DELAY_MS + extraFallbackMs + 500;
    const delayMs = Math.min(maxSafeDelayMs, Math.max(150, rawDelayMs));
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

      const roundKey = `${room.roomCode}_r${mm.roundNumber}`;
      if (uid && isSignedInAccount && profile && recordedMemoryRoundRef.current !== roundKey) {
        recordedMemoryRoundRef.current = roundKey;
        const myOutcome = mm.isTie
          ? 'draw'
          : mm.winnerUids.includes(uid)
            ? 'win'
            : 'loss';
        void recordVerifiedMultiplayerMatchForPlayer({
          roomCode: room.roomCode,
          gameId: 'memory-match',
          roundNumber: mm.roundNumber,
          playerUid: uid,
          profile,
          isRegisteredAccount: isSignedInAccount,
          outcome: myOutcome,
          score: room.players[uid]?.score ?? 0,
          opponentUids: room.playerOrder.filter((id) => id !== uid),
          metrics: {
            pairsMatched: room.players[uid]?.score ?? 0,
            totalPairs: mm.totalPairs,
            cardCount: mm.cards.length,
          },
        });
      }
    } else if (room.status === 'in_progress') {
      prevStatusRef.current = 'in_progress';
    }
  }, [room, uid, profile, isSignedInAccount, playMatch, playWin, playDraw]);

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
    if (!room || !room.memoryMatchState || !uid || isSubmittingCard || isSubmittingCardRef.current) return;
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
    isSubmittingCardRef.current = true;
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
      isSubmittingCardRef.current = false;
      setIsSubmittingCard(false);
    }
  };

  const handleConfirmSkipTurn = async () => {
    if (!room || !room.memoryMatchState || !room.currentTurnUid || isSkippingTurn) return;
    setActionError(null);
    setIsSkippingTurn(true);
    playClick();
    try {
      const updated = await skipMemoryMatchMultiplayerTurn({
        roomCode: room.roomCode,
        expectedRoundNumber: room.memoryMatchState.roundNumber ?? 1,
        expectedTurnUid: room.currentTurnUid,
        expectedTurnSequence: room.memoryMatchState.turnSequence ?? 1,
      });
      syncRoom?.(updated);
      setIsConfirmingSkip(false);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'game-action'));
    } finally {
      setIsSkippingTurn(false);
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
      const waitingRoom = await returnRoomToWaiting(room.roomCode);
      syncRoom?.(waitingRoom);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'rematch'));
    } finally {
      setIsSubmittingRematch(false);
    }
  };

  const handleToggleReady = async (nextReady: boolean) => {
    if (!room) return;
    setActionError(null);
    try {
      const updated = await togglePlayerReady(room.roomCode, nextReady);
      syncRoom?.(updated);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'game-action'));
    }
  };

  const handleUpdateNextRoundSettings = async (nextSettings: MemoryRoomSettings) => {
    if (!room || !isHost || isSavingSettings || room.status !== 'completed') return;
    setActionError(null);
    setIsSavingSettings(true);
    try {
      await updateRoomSettings(nextSettings);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'update-settings'));
    } finally {
      setIsSavingSettings(false);
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

  // Recovery state if the match is in_progress/completed but board cards are still hydrating
  if (
    room &&
    (room.status === 'in_progress' || room.status === 'completed') &&
    (!room.memoryMatchState || !Array.isArray(room.memoryMatchState.cards) || room.memoryMatchState.cards.length === 0)
  ) {
    return (
      <div
        className="max-w-lg mx-auto bg-[#201A36] border-2 border-[#56E0CB]/50 rounded-2xl p-6 text-center space-y-3"
        data-testid="mp-memory-board-recovery"
      >
        <p className="font-['Press_Start_2P'] text-xs text-[#56E0CB] uppercase">
          Syncing Game Board...
        </p>
        <p className="text-xs text-[#FFF0D7]/75">
          Waiting for the shared board state from Firestore. You don&apos;t need to refresh the page.
        </p>
        <button
          type="button"
          onClick={() => void refreshRoom?.()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#56E0CB] text-[#171329] text-xs font-bold cursor-pointer"
          data-testid="mp-memory-refresh-board-btn"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync Board Now
        </button>
      </div>
    );
  }

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
        failedReconnectRoomCode={failedReconnectRoomCode}
        onRetryReconnect={retryReconnect}
        error={actionError || error}
        preferredNickname={preferredNickname}
        invitedRoomCode={invitedRoomCode}
        invitationStatus={invitationStatus}
        invitationRoomInfo={invitationRoomInfo}
        onDismissInvitation={dismissInvitation}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onUpdateRoomSettings={updateRoomSettings}
        onToggleReady={handleToggleReady}
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
  const roomSettings = getRoomMemorySettings(room);
  const activeMatchSettings = mm.matchSettings ?? {
    cardCount: totalCards,
    minPlayers: roomSettings.minPlayers,
    maxPlayers: roomSettings.maxPlayers,
  };

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

  const skipEligibility = canSkipCurrentMemoryMatchTurn(room, uid, nowMs);

  const orderedPlayers = mm.turnOrderUids
    .map((playerUid) => room.players[playerUid])
    .filter(Boolean);

  const winnerNicknames = mm.winnerUids
    .map((wUid) => room.players[wUid]?.nickname || 'Player')
    .join(' & ');

  // Responsive grid layout for any even card count from 10 to 100:
  // - Small mobile (<640px): 4 cols (10–20 cards) or 5 cols (22–100 cards) dynamically filling viewport width
  // - Tablet (640px–767px): 5 cols (<=20) or 8 cols (22–100) for comfortable touch targets
  // - Tablet/Desktop (>=768px): 5 cols (<=20), 8 cols (22–40), 10 cols (42–100, preserving 10x10 for 100)
  const gridClasses =
    totalCards <= 20
      ? 'grid-cols-4 sm:grid-cols-5 w-full max-w-[380px] sm:max-w-[540px] gap-1.5 sm:gap-2.5'
      : totalCards <= 40
      ? 'grid-cols-5 sm:grid-cols-8 w-full max-w-[460px] sm:max-w-[740px] gap-1 sm:gap-2'
      : totalCards <= 60
      ? 'grid-cols-5 sm:grid-cols-8 md:grid-cols-10 w-full sm:max-w-[740px] md:max-w-[880px] gap-1 sm:gap-1.5'
      : 'grid-cols-5 sm:grid-cols-8 md:grid-cols-10 w-full sm:max-w-[760px] md:max-w-[920px] gap-1 sm:gap-1.5 lg:gap-2';

  const cardAspectClass =
    totalCards <= 20
      ? 'aspect-square rounded-lg sm:rounded-xl'
      : totalCards <= 40
      ? 'aspect-[5/4] min-h-[42px] sm:min-h-0 sm:aspect-square rounded-lg sm:rounded-xl'
      : 'aspect-[4/3] min-h-[42px] sm:min-h-0 sm:aspect-square rounded-md sm:rounded-xl';

  const iconSizeClass =
    totalCards <= 20
      ? 'w-8 h-8 sm:w-10 sm:h-10'
      : totalCards <= 40
      ? 'w-6 h-6 sm:w-8 sm:h-8'
      : 'w-6 h-6 sm:w-7 sm:h-7';

  const scoreboardGridCols =
    orderedPlayers.length === 2
      ? 'grid-cols-2'
      : orderedPlayers.length === 3
      ? 'grid-cols-3'
      : orderedPlayers.length === 4
      ? 'grid-cols-4'
      : orderedPlayers.length <= 6
      ? 'grid-cols-3'
      : 'grid-cols-4';

  return (
    <div data-testid="memory-multiplayer-active" className="pb-4 sm:pb-6">
      {isGameOver && (
        <WinCelebration winner={mm.isTie ? null : 'X'} isDraw={mm.isTie} />
      )}

      {/* Top Room Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 bg-[#201A36] border border-[#3D345F] rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 mb-2 sm:mb-3 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-[9px] sm:text-[10px] font-['Press_Start_2P'] text-[#FFC66D]">
            ROOM {room.roomCode}
          </span>
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-[#292342] hover:bg-[#56E0CB]/20 text-[#56E0CB] text-[10px] font-bold border border-[#56E0CB]/30 cursor-pointer"
          >
            {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span className="hidden sm:inline">{copiedCode ? 'Copied' : 'Copy'}</span>
          </button>
          <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-[#56E0CB] font-semibold">
            <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span>
              <span className="hidden sm:inline">Pairs: </span>
              {mm.matchedPairs}/{mm.totalPairs}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-['Press_Start_2P'] text-[#FFC66D]"
            data-testid="mp-memory-round-indicator"
          >
            ROUND {mm.roundNumber ?? 1}
          </span>
          {!isGameOver && (
            <span
              className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#171329] border border-[#3D345F] text-[10px] text-[#FFF0D7]/75 font-semibold"
              data-testid="mp-memory-active-config-badge"
              title="Settings are locked while a match is in progress"
            >
              <Lock className="w-2.5 h-2.5 text-[#56E0CB]" />
              {activeMatchSettings.cardCount} Cards · {activeMatchSettings.minPlayers}–
              {activeMatchSettings.maxPlayers}P
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
              connectionState === 'disconnected'
                ? 'bg-[#FF776E]/15 border-[#FF776E]/50 text-[#FF776E] animate-pulse'
                : connectionState === 'reconnecting' || connectionState === 'connecting'
                ? 'bg-[#FFC66D]/15 border-[#FFC66D]/40 text-[#FFC66D] animate-pulse'
                : 'bg-[#56E0CB]/12 border-[#56E0CB]/35 text-[#56E0CB]'
            }`}
            data-testid="mp-memory-sync-indicator"
          >
            {connectionState === 'disconnected'
              ? 'Connection lost'
              : connectionState === 'reconnecting'
              ? 'Reconnecting...'
              : connectionState === 'connecting'
              ? 'Connecting...'
              : 'Connected'}
          </span>
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={() => {
              playClick();
              void closeRoom();
            }}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-[#FF776E]/15 hover:bg-[#FF776E]/25 text-[#FF776E] border border-[#FF776E]/40 text-[11px] sm:text-xs font-semibold cursor-pointer shrink-0"
            data-testid="mp-memory-close-room-btn"
          >
            <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Close</span>
            <span className="hidden sm:inline">Room</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              playClick();
              void leaveRoom();
            }}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-[#292342] hover:bg-[#FF776E]/20 text-[#FFF0D7]/80 border border-[#FFF0D7]/20 text-[11px] sm:text-xs font-semibold cursor-pointer shrink-0"
            data-testid="mp-memory-leave-room-btn"
          >
            <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Leave</span>
          </button>
        )}
      </div>

      {/* Error Banner */}
      {(actionError || error) && (
        <div
          role="alert"
          className="max-w-4xl mx-auto mb-2 sm:mb-3 p-2.5 sm:p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-[#FFF0D7] text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{actionError || error}</span>
        </div>
      )}

      {/* Multi-Player Shared Scoreboard (2–8 Players, max 2 compact rows on mobile) */}
      <div
        className={`grid gap-1 sm:gap-2.5 max-w-4xl mx-auto mb-1.5 sm:mb-3 ${scoreboardGridCols}`}
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
              className={`relative overflow-hidden px-1.5 py-1.5 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl border sm:border-2 transition-all min-w-0 bg-[#201A36] ${
                !connected ? 'opacity-65' : ''
              }`}
              style={{
                borderColor: isWinner ? '#FFC66D' : accentHex,
                borderWidth: isTurn || isWinner ? '2px' : undefined,
                backgroundImage: `linear-gradient(135deg, ${tintRgba} 0%, rgba(32, 26, 54, 0.95) 100%)`,
                boxShadow: isWinner
                  ? '0 0 18px rgba(255, 198, 109, 0.32)'
                  : isTurn
                  ? `0 0 14px ${glowRgba}`
                  : 'none',
              }}
              data-testid={`mp-memory-player-${idx}`}
              data-player-color={accentHex}
            >
              {/* Top player colour bar */}
              <div
                className="absolute top-0 left-0 right-0 h-[3px] sm:h-1"
                style={{ backgroundColor: accentHex }}
                aria-hidden="true"
              />

              {/* Row 1: Player badge, crown, desktop nickname, active TURN / YOU indicators */}
              <div className="flex items-center justify-between gap-0.5 sm:gap-1 mt-0.5 mb-0.5 sm:mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[7px] sm:text-[9px] font-['Press_Start_2P'] shrink-0 border leading-none"
                    style={{
                      color: accentHex,
                      borderColor: accentHex,
                      backgroundColor: badgeBgRgba,
                    }}
                    data-testid={`mp-memory-player-badge-${idx}`}
                  >
                    <span
                      className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0"
                      style={{ backgroundColor: accentHex }}
                    />
                    {playerColor?.label ?? `P${idx + 1}`}
                  </span>
                  {player.isHost && (
                    <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#FFC66D] shrink-0" />
                  )}
                  <span className="hidden sm:inline font-bold text-xs sm:text-sm text-[#FFF0D7] truncate">
                    {player.nickname}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  {isTurn && (
                    <span
                      className="px-1 sm:px-1.5 py-0.5 rounded text-[6px] sm:text-[8px] font-['Press_Start_2P'] uppercase shrink-0 leading-none"
                      style={{
                        color: '#171329',
                        backgroundColor: accentHex,
                      }}
                    >
                      TURN
                    </span>
                  )}
                  {player.uid === uid && (
                    <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-[#56E0CB]/20 text-[#56E0CB] text-[9px] font-bold shrink-0">
                      YOU
                    </span>
                  )}
                </div>
              </div>

              {/* Row 2: Mobile truncated nickname + score; Desktop score + Online status */}
              <div className="flex items-baseline justify-between gap-1 mt-0.5 sm:mt-1.5">
                <span className="sm:hidden text-[10px] font-semibold text-[#FFF0D7]/95 truncate min-w-0">
                  {player.nickname}
                </span>

                <div className="flex items-baseline gap-1 shrink-0">
                  <span
                    className="font-['Press_Start_2P'] text-[11px] sm:text-xl leading-none"
                    style={{ color: accentHex }}
                    data-testid={`mp-memory-score-${idx}`}
                  >
                    {player.score}
                  </span>
                  <span className="hidden sm:inline text-[10px] text-[#FFF0D7]/70">
                    {player.score === 1 ? 'PAIR' : 'PAIRS'}
                  </span>
                </div>

                <span
                  className={`hidden sm:inline-flex items-center gap-0.5 text-[9px] font-semibold ${
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

      {/* New Round Transition Banner */}
      {roundTransitionText && (
        <div
          className="max-w-xl mx-auto mb-2 sm:mb-3 py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl bg-[#FFC66D]/20 border-2 border-[#FFC66D] text-[#FFC66D] text-center shadow-[0_0_20px_rgba(255,198,109,0.28)] animate-pulse"
          role="status"
          data-testid="mp-memory-round-transition"
        >
          <span className="font-['Press_Start_2P'] text-[9px] sm:text-xs uppercase tracking-wider">
            {roundTransitionText}
          </span>
        </div>
      )}

      {/* Compact Sticky Turn & Match Status Banner on mobile, static on desktop */}
      <div className="sticky top-[52px] sm:static z-30 max-w-4xl mx-auto mb-2 sm:mb-4 bg-[#171329]/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none py-1 sm:py-0 rounded-xl">
        {isGameOver ? (
          <div
            className={`max-w-xl mx-auto py-2 sm:py-3 px-3 sm:px-4 rounded-xl border-2 flex items-center justify-center gap-2 ${
              mm.isTie
                ? 'bg-[#FFC66D]/15 border-[#FFC66D] text-[#FFC66D]'
                : 'bg-[#56E0CB]/15 border-[#56E0CB] text-[#56E0CB]'
            }`}
            role="status"
            data-testid="mp-memory-result-banner"
          >
            <Trophy className="w-4 h-4 shrink-0" />
            <span className="font-['Press_Start_2P'] text-[9px] sm:text-xs leading-snug text-center">
              {mm.isTie
                ? `TIE GAME! ${winnerNicknames.toUpperCase()} TIED!`
                : `${winnerNicknames.toUpperCase()} WINS THE MATCH!`}
            </span>
            <Sparkles className="w-4 h-4 shrink-0" />
          </div>
        ) : (
          <div
            className={`max-w-xl mx-auto py-1.5 sm:py-2.5 px-3 sm:px-4 rounded-xl border flex items-center justify-between sm:justify-center gap-2 transition-colors ${
              isMyTurn
                ? 'bg-[#292342] border-[#56E0CB] text-[#56E0CB]'
                : 'bg-[#201A36] border-[#FFC66D]/50 text-[#FFC66D]'
            }`}
            role="status"
            data-testid="mp-memory-turn-banner"
          >
            <div className="min-w-0 truncate">
              <span className="hidden sm:inline text-xs font-semibold mr-2 text-[#FFF0D7]/75">
                {mm.pendingResetAt !== null ? 'Revealing Pair:' : 'Current Turn:'}
              </span>
              <span className="font-['Press_Start_2P'] text-[9px] sm:text-xs uppercase">
                {mm.pendingResetAt !== null
                  ? 'No Match! Flipping Back...'
                  : isMyTurn
                  ? `YOUR TURN (Pick ${2 - mm.flippedCardIds.length})`
                  : `${activeTurnPlayer?.nickname || 'Player'}'s Turn`}
              </span>
            </div>

            <span className="sm:hidden shrink-0 px-1.5 py-0.5 rounded bg-[#171329]/80 border border-current/30 text-[9px] font-bold">
              {mm.matchedPairs}/{mm.totalPairs}
            </span>

            {skipEligibility.eligible && !isConfirmingSkip && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsConfirmingSkip(true);
                }}
                data-testid="mp-memory-skip-turn-btn"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FF776E]/20 hover:bg-[#FF776E]/30 border border-[#FF776E]/50 text-[#FF776E] text-[10px] font-bold shrink-0 cursor-pointer"
              >
                <SkipForward className="w-3 h-3" />
                <span>Skip Turn</span>
              </button>
            )}
          </div>
        )}

        {/* Skip Turn Confirmation Bar */}
        {isConfirmingSkip && !isGameOver && activeTurnPlayer && (
          <div
            role="alertdialog"
            aria-label="Confirm skip inactive turn"
            data-testid="mp-memory-skip-confirm"
            className="max-w-xl mx-auto mt-1.5 px-3 py-2 rounded-xl bg-[#201A36] border border-[#FF776E] flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="text-[#FFF0D7]">
              Skip <strong className="text-[#FFC66D]">{activeTurnPlayer.nickname}</strong>&apos;s inactive turn? No points will be awarded.
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfirmingSkip(false)}
                disabled={isSkippingTurn}
                className="px-2.5 py-1 rounded-lg bg-[#292342] text-[#FFF0D7]/80 text-[11px] font-semibold cursor-pointer"
                data-testid="mp-memory-skip-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSkipTurn()}
                disabled={isSkippingTurn}
                className="px-2.5 py-1 rounded-lg bg-[#FF776E] text-[#171329] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                data-testid="mp-memory-skip-confirm-btn"
              >
                {isSkippingTurn ? 'Skipping...' : 'Confirm Skip'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Turn Skipped Live Notification */}
      {skipNoticeText && (
        <div
          role="status"
          data-testid="mp-memory-skip-notice"
          className="max-w-xl mx-auto mb-2 px-3 py-1.5 rounded-lg bg-[#FFC66D]/15 border border-[#FFC66D]/50 text-[#FFC66D] text-xs text-center font-semibold"
        >
          {skipNoticeText}
        </div>
      )}

      {/* Large-Board Notification during active match (dismissible, never blocks mobile play) */}
      {!isGameOver && isLargeMemoryBoard(totalCards) && (
        <div className="max-w-4xl mx-auto mb-2 sm:mb-3">
          <LargeBoardNotice cardCount={totalCards} />
        </div>
      )}

      {/* Play Again / Next Round Panel (rendered above board when finished so mobile users don't scroll past 100 cards) */}
      {isGameOver && (
        <div
          className="max-w-3xl mx-auto mb-2.5 sm:mb-4 p-3 sm:p-4 rounded-xl bg-[#201A36] border-2 border-[#FFC66D]/60 space-y-3"
          data-testid="mp-memory-rematch-panel"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0">
              <h3 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] mb-1">
                ROUND {mm.roundNumber ?? 1} COMPLETE
              </h3>
              <p className="text-xs text-[#FFF0D7]/75" data-testid="mp-memory-rematch-status">
                {isHost
                  ? `Return everyone to the waiting room to ready up and let new players join before Round ${(mm.roundNumber ?? 1) + 1} (${roomSettings.cardCount} cards · ${getMemoryPairCount(roomSettings.cardCount)} pairs).`
                  : `Waiting for the host to return the room to the waiting area for Round ${(mm.roundNumber ?? 1) + 1}...`}
              </p>
            </div>

            {isHost && (
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleStartNextRound()}
                  disabled={isSubmittingRematch || isSavingSettings}
                  className="w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wider bg-[#FF776E] hover:bg-[#ff8d85] text-[#171329] shadow-[0_0_20px_rgba(255,119,110,0.4)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  data-testid="mp-memory-play-again-btn"
                >
                  Return to Waiting Room
                </button>
              </div>
            )}
          </div>

          {/* Host-editable / Guest read-only settings for the upcoming round */}
          <MemoryRoomSettingsPanel
            settings={roomSettings}
            canEdit={isHost}
            heading={isHost ? 'Next Round Settings' : 'Upcoming Round Settings'}
            lockedReason="Host Controlled"
            joinedPlayerCount={room.playerOrder.length}
            isSaving={isSavingSettings}
            onChange={(next) => void handleUpdateNextRoundSettings(next)}
            showLargeBoardNotice={true}
            compact={true}
          />
        </div>
      )}

      {/* Shared Memory Match Card Grid + Docked Board-Anchored Reaction Toolbar */}
      <div className="relative w-full" data-testid="memory-board-and-reactions">
        <div
          className={`grid ${gridClasses} mx-auto bg-[#201A36] border-2 sm:border-4 border-[#292342] rounded-xl sm:rounded-2xl p-1.5 sm:p-3 md:p-4 shadow-2xl`}
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
                  boxShadow: `0 0 10px ${matchedOwnerColor.glowRgba}, inset 0 0 6px ${matchedOwnerColor.tintRgba}`,
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
              className={`relative ${cardAspectClass} w-full flex flex-col items-center justify-center transition-all select-none touch-manipulation ${
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
                      className="absolute bottom-0.5 left-0.5 sm:bottom-0.5 sm:left-1 font-['Press_Start_2P'] text-[5px] sm:text-[7px] px-0.5 sm:px-1 py-0.5 rounded leading-none pointer-events-none"
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

        {/* Board-Docked Reaction Toolbar & Compact Floating Chat */}
        <RoomSocialBar room={room} uid={uid} isHost={isHost} compact={true} anchorMode="board" />
      </div>

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

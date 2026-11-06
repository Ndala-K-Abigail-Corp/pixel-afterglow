/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Share2,
  Crown,
  Users,
  Play,
  XCircle,
  LogOut,
  Wifi,
  WifiOff,
  Loader2,
  AlertTriangle,
  PlusCircle,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import {
  MultiplayerGameType,
  MultiplayerRoomDocument,
  MemoryMultiplayerPlayerCount,
  MEMORY_MULTIPLAYER_CONFIGS,
} from '../../types/multiplayer';
import {
  isPlayerEffectivelyConnected,
  normalizeRoomCode,
  sanitizeNickname,
  isValidNickname,
  isValidRoomCodeFormat,
} from '../../logic/multiplayerRoom';
import { useAudio } from '../../context/AudioContext';

export interface MultiplayerLobbyAndWaitingRoomProps {
  gameType: MultiplayerGameType;
  gameTitle: string;
  room: MultiplayerRoomDocument | null;
  uid: string | null;
  isHost: boolean;
  isLoading: boolean;
  isReconnecting: boolean;
  error: string | null;
  preferredNickname: string;
  onCreateRoom: (params: {
    nickname: string;
    maxPlayers?: MemoryMultiplayerPlayerCount;
  }) => Promise<MultiplayerRoomDocument | null>;
  onJoinRoom: (params: {
    roomCode: string;
    nickname: string;
  }) => Promise<MultiplayerRoomDocument | null>;
  onStartGame: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onCloseRoom: () => Promise<void>;
  onClearError: () => void;
}

export const MultiplayerLobbyAndWaitingRoom: React.FC<
  MultiplayerLobbyAndWaitingRoomProps
> = ({
  gameType,
  gameTitle,
  room,
  uid,
  isHost,
  isLoading,
  isReconnecting,
  error,
  preferredNickname,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onLeaveRoom,
  onCloseRoom,
  onClearError,
}) => {
  const { playClick } = useAudio();
  const [lobbyTab, setLobbyTab] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState<string>(preferredNickname || '');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [selectedMaxPlayers, setSelectedMaxPlayers] =
    useState<MemoryMultiplayerPlayerCount>(2);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [sharedFeedback, setSharedFeedback] = useState<boolean>(false);
  const [localValidationError, setLocalValidationError] = useState<string | null>(
    null
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (preferredNickname && !nickname) {
      setNickname(preferredNickname);
    }
  }, [preferredNickname, nickname]);

  // Refresh clock periodically in waiting room to reflect live connection status
  useEffect(() => {
    if (!room) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [room]);

  const handleCopyRoomCode = async () => {
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

  const handleShareRoom = async () => {
    if (!room) return;
    playClick();
    const shareText = `Join my ${gameTitle} room on Pixel Afterglow! Room Code: ${room.roomCode}`;
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Pixel Afterglow – ${gameTitle}`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard if user cancels or share fails
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`.trim());
      setSharedFeedback(true);
      setTimeout(() => setSharedFeedback(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    onClearError();
    setLocalValidationError(null);

    const cleanedNickname = sanitizeNickname(nickname);
    if (!isValidNickname(cleanedNickname)) {
      setLocalValidationError('Please enter a nickname between 2 and 16 characters.');
      return;
    }

    await onCreateRoom({
      nickname: cleanedNickname,
      maxPlayers: gameType === 'memory-match' ? selectedMaxPlayers : 2,
    });
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    onClearError();
    setLocalValidationError(null);

    const cleanedNickname = sanitizeNickname(nickname);
    if (!isValidNickname(cleanedNickname)) {
      setLocalValidationError('Please enter a nickname between 2 and 16 characters.');
      return;
    }

    const normalizedCode = normalizeRoomCode(roomCodeInput);
    if (!isValidRoomCodeFormat(normalizedCode)) {
      setLocalValidationError('Please enter a valid 6-character room code.');
      return;
    }

    await onJoinRoom({
      roomCode: normalizedCode,
      nickname: cleanedNickname,
    });
  };

  if (isReconnecting) {
    return (
      <div className="bg-[#292342]/90 border-2 border-[#56E0CB]/40 rounded-2xl p-6 sm:p-8 text-center max-w-xl mx-auto shadow-[0_0_30px_rgba(86,224,203,0.12)]">
        <Loader2 className="w-8 h-8 text-[#56E0CB] animate-spin mx-auto mb-3" />
        <p className="font-['Press_Start_2P'] text-xs text-[#56E0CB] uppercase tracking-wider mb-2">
          Reconnecting Room...
        </p>
        <p className="text-sm text-[#FFF0D7]/70">
          Restoring your active multiplayer session and player slot.
        </p>
      </div>
    );
  }

  // WAITING ROOM VIEW
  if (room && room.status === 'waiting') {
    const joinedPlayers = room.playerOrder
      .map((playerUid) => room.players[playerUid])
      .filter(Boolean);
    const joinedCount = joinedPlayers.length;
    const requiredCount = room.maxPlayers;
    const isRoomFull = joinedCount >= requiredCount;
    const allPlayersConnected = joinedPlayers.every((p) =>
      isPlayerEffectivelyConnected(p, nowMs)
    );
    const canHostStart = isHost && isRoomFull && allPlayersConnected && !isLoading;

    const emptySlotsCount = Math.max(0, requiredCount - joinedCount);
    const memoryConfig =
      gameType === 'memory-match'
        ? MEMORY_MULTIPLAYER_CONFIGS[
            room.maxPlayers as MemoryMultiplayerPlayerCount
          ]
        : null;

    return (
      <div
        className="bg-[#292342]/90 border-2 border-[#56E0CB]/40 rounded-2xl p-4 sm:p-6 max-w-2xl mx-auto shadow-[0_0_35px_rgba(86,224,203,0.12)]"
        data-testid="multiplayer-waiting-room"
      >
        {/* Top Banner: Game & Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-[#FFF0D7]/10">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#56E0CB]/15 border border-[#56E0CB]/40 text-[#56E0CB] font-['Press_Start_2P'] text-[9px] uppercase">
              <Sparkles className="w-3 h-3" />
              {gameTitle} Lobby
            </span>
            {memoryConfig && (
              <span className="px-2.5 py-1 rounded-full bg-[#FFC66D]/15 border border-[#FFC66D]/40 text-[#FFC66D] text-xs font-semibold">
                {memoryConfig.maxPlayers}P · {memoryConfig.totalCards} Cards (
                {memoryConfig.matchingPairs} Pairs)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FFF0D7]/80">
            <Users className="w-4 h-4 text-[#56E0CB]" />
            <span data-testid="waiting-room-player-count">
              {joinedCount} / {requiredCount} Players Joined
            </span>
          </div>
        </div>

        {/* Error Banner */}
        {(error || localValidationError) && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-[#FFF0D7] text-xs sm:text-sm flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0 mt-0.5" />
            <span>{error || localValidationError}</span>
          </div>
        )}

        {/* Room Code Box */}
        <div className="bg-[#171329] border-2 border-[#FFC66D]/50 rounded-xl p-4 sm:p-5 mb-5 text-center">
          <p className="text-[10px] font-['Press_Start_2P'] text-[#FFC66D] uppercase tracking-widest mb-2">
            Room Access Code
          </p>
          <div
            className="font-['Press_Start_2P'] text-2xl sm:text-3xl text-[#FFF0D7] tracking-[0.25em] select-all py-1"
            data-testid="waiting-room-code"
          >
            {room.roomCode}
          </div>
          <p className="text-xs text-[#FFF0D7]/60 mt-1 mb-4">
            Share this code with your {requiredCount === 2 ? 'opponent' : 'friends'} to join the match
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyRoomCode}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#292342] hover:bg-[#56E0CB]/20 border border-[#56E0CB]/50 text-[#56E0CB] text-xs font-bold transition-all cursor-pointer"
              data-testid="copy-room-code-btn"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#56E0CB]" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Code
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareRoom}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#292342] hover:bg-[#FFC66D]/20 border border-[#FFC66D]/50 text-[#FFC66D] text-xs font-bold transition-all cursor-pointer"
              data-testid="share-room-btn"
            >
              {sharedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#FFC66D]" />
                  Invite Copied!
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  Share Room
                </>
              )}
            </button>
          </div>
        </div>

        {/* Joined Players List */}
        <div className="mb-6">
          <h3 className="font-['Press_Start_2P'] text-[10px] text-[#FFF0D7]/70 uppercase tracking-wider mb-3">
            Arcade Roster ({joinedCount}/{requiredCount})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {joinedPlayers.map((player, index) => {
              const connected = isPlayerEffectivelyConnected(player, nowMs);
              const isMe = player.uid === uid;

              return (
                <div
                  key={player.uid}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    isMe
                      ? 'bg-[#171329] border-[#56E0CB]/60'
                      : 'bg-[#171329]/70 border-[#FFF0D7]/15'
                  }`}
                  data-testid={`waiting-player-${index}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-['Press_Start_2P'] text-xs shrink-0 ${
                        index === 0
                          ? 'bg-[#FF776E]/20 text-[#FF776E] border border-[#FF776E]/40'
                          : index === 1
                          ? 'bg-[#56E0CB]/20 text-[#56E0CB] border border-[#56E0CB]/40'
                          : index === 2
                          ? 'bg-[#FFC66D]/20 text-[#FFC66D] border border-[#FFC66D]/40'
                          : 'bg-[#B388FF]/20 text-[#B388FF] border border-[#B388FF]/40'
                      }`}
                    >
                      {player.symbol ?? `P${index + 1}`}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-[#FFF0D7] truncate">
                          {player.nickname}
                        </span>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded bg-[#56E0CB]/20 text-[#56E0CB] text-[10px] font-bold">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {player.isHost && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#FFC66D] font-semibold">
                            <Crown className="w-3 h-3" />
                            HOST
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Connection Status Pill */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                      connected
                        ? 'bg-[#56E0CB]/15 text-[#56E0CB] border border-[#56E0CB]/30'
                        : 'bg-[#FF776E]/15 text-[#FF776E] border border-[#FF776E]/30'
                    }`}
                  >
                    {connected ? (
                      <>
                        <Wifi className="w-3 h-3" />
                        Online
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3 h-3" />
                        Offline
                      </>
                    )}
                  </span>
                </div>
              );
            })}

            {/* Empty Player Slots */}
            {Array.from({ length: emptySlotsCount }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="flex items-center justify-between p-3 rounded-xl border border-dashed border-[#FFF0D7]/20 bg-[#171329]/30 text-[#FFF0D7]/40"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg border border-dashed border-[#FFF0D7]/20 flex items-center justify-center font-['Press_Start_2P'] text-[10px]">
                    ?
                  </div>
                  <span className="text-xs font-medium italic">
                    Waiting for player...
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Host & Guest Actions */}
        {isHost ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-[#FFF0D7]/10">
            <button
              type="button"
              onClick={() => {
                playClick();
                void onCloseRoom();
              }}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#171329] hover:bg-[#FF776E]/20 border border-[#FF776E]/50 text-[#FF776E] text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              data-testid="host-close-room-btn"
            >
              <XCircle className="w-4 h-4" />
              Close Room
            </button>

            <button
              type="button"
              onClick={() => {
                playClick();
                void onStartGame();
              }}
              disabled={!canHostStart}
              className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-['Press_Start_2P'] text-xs uppercase transition-all ${
                canHostStart
                  ? 'bg-[#FF776E] hover:bg-[#ff8d85] text-[#171329] shadow-[0_0_20px_rgba(255,119,110,0.4)] cursor-pointer'
                  : 'bg-[#171329] border border-[#FFF0D7]/20 text-[#FFF0D7]/40 cursor-not-allowed'
              }`}
              data-testid="host-start-game-btn"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {isRoomFull ? 'Start Match' : `Need ${requiredCount - joinedCount} More`}
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-[#FFF0D7]/10">
            <div className="flex items-center gap-2 text-xs text-[#FFC66D]">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>
                {isRoomFull
                  ? 'All players ready! Waiting for the host to start the match...'
                  : `Waiting for ${requiredCount - joinedCount} more player(s) to join...`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                playClick();
                void onLeaveRoom();
              }}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#171329] hover:bg-[#FF776E]/20 border border-[#FFF0D7]/25 text-[#FFF0D7]/80 text-xs font-bold transition-all cursor-pointer"
              data-testid="guest-leave-room-btn"
            >
              <LogOut className="w-4 h-4" />
              Leave Room
            </button>
          </div>
        )}
      </div>
    );
  }

  // LOBBY ENTRY VIEW (Create or Join Room)
  return (
    <div
      className="bg-[#292342]/90 border-2 border-[#56E0CB]/30 rounded-2xl p-4 sm:p-6 max-w-xl mx-auto shadow-[0_0_30px_rgba(23,19,41,0.6)]"
      data-testid="multiplayer-lobby-entry"
    >
      {/* Create vs Join Toggle */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#171329] rounded-xl border border-[#FFF0D7]/10 mb-5">
        <button
          type="button"
          onClick={() => {
            playClick();
            setLobbyTab('create');
            setLocalValidationError(null);
            onClearError();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            lobbyTab === 'create'
              ? 'bg-[#FF776E] text-[#171329] shadow-[0_0_15px_rgba(255,119,110,0.35)]'
              : 'text-[#FFF0D7]/70 hover:text-[#FFF0D7]'
          }`}
          data-testid="tab-create-room"
        >
          <PlusCircle className="w-4 h-4" />
          Create Room
        </button>

        <button
          type="button"
          onClick={() => {
            playClick();
            setLobbyTab('join');
            setLocalValidationError(null);
            onClearError();
          }}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            lobbyTab === 'join'
              ? 'bg-[#56E0CB] text-[#171329] shadow-[0_0_15px_rgba(86,224,203,0.35)]'
              : 'text-[#FFF0D7]/70 hover:text-[#FFF0D7]'
          }`}
          data-testid="tab-join-room"
        >
          <KeyRound className="w-4 h-4" />
          Join with Code
        </button>
      </div>

      {/* Error Display */}
      {(error || localValidationError) && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-[#FFF0D7] text-xs sm:text-sm flex items-start gap-2.5"
          data-testid="multiplayer-error-banner"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0 mt-0.5" />
          <span>{error || localValidationError}</span>
        </div>
      )}

      {lobbyTab === 'create' ? (
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="mp-create-nickname"
              className="block font-['Press_Start_2P'] text-[10px] text-[#FFF0D7]/80 uppercase tracking-wider mb-2"
            >
              Your Arcade Nickname
            </label>
            <input
              id="mp-create-nickname"
              type="text"
              maxLength={16}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. PIXEL_ACE"
              className="w-full px-4 py-3 rounded-xl bg-[#171329] border-2 border-[#FFF0D7]/20 focus:border-[#FF776E] text-[#FFF0D7] text-sm font-semibold outline-none transition-colors"
              data-testid="input-nickname"
            />
          </div>

          {/* Player Count Selector for Memory Match */}
          {gameType === 'memory-match' && (
            <div>
              <label className="block font-['Press_Start_2P'] text-[10px] text-[#FFC66D] uppercase tracking-wider mb-2">
                Select Number of Players
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {([2, 3, 4] as MemoryMultiplayerPlayerCount[]).map((count) => {
                  const cfg = MEMORY_MULTIPLAYER_CONFIGS[count];
                  const isSelected = selectedMaxPlayers === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        playClick();
                        setSelectedMaxPlayers(count);
                      }}
                      className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#171329] border-[#FFC66D] shadow-[0_0_15px_rgba(255,198,109,0.2)]'
                          : 'bg-[#171329]/60 border-[#FFF0D7]/15 hover:border-[#FFF0D7]/35'
                      }`}
                      data-testid={`select-players-${count}`}
                    >
                      <div className="font-['Press_Start_2P'] text-xs text-[#FFF0D7] mb-1">
                        {count}P
                      </div>
                      <div className="text-[11px] font-bold text-[#56E0CB]">
                        {cfg.totalCards} Cards
                      </div>
                      <div className="text-[10px] text-[#FFF0D7]/60">
                        {cfg.matchingPairs} Pairs
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-5 rounded-xl bg-[#FF776E] hover:bg-[#ff8d85] text-[#171329] font-['Press_Start_2P'] text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-[0_0_20px_rgba(255,119,110,0.35)] transition-all cursor-pointer disabled:opacity-50"
            data-testid="submit-create-room"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlusCircle className="w-4 h-4" />
            )}
            Create Multiplayer Room
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoinSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="mp-join-nickname"
              className="block font-['Press_Start_2P'] text-[10px] text-[#FFF0D7]/80 uppercase tracking-wider mb-2"
            >
              Your Arcade Nickname
            </label>
            <input
              id="mp-join-nickname"
              type="text"
              maxLength={16}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. RETRO_STAR"
              className="w-full px-4 py-3 rounded-xl bg-[#171329] border-2 border-[#FFF0D7]/20 focus:border-[#56E0CB] text-[#FFF0D7] text-sm font-semibold outline-none transition-colors"
              data-testid="input-nickname"
            />
          </div>

          <div>
            <label
              htmlFor="mp-join-code"
              className="block font-['Press_Start_2P'] text-[10px] text-[#56E0CB] uppercase tracking-wider mb-2"
            >
              6-Character Room Code
            </label>
            <input
              id="mp-join-code"
              type="text"
              maxLength={8}
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="ABC234"
              className="w-full px-4 py-3 rounded-xl bg-[#171329] border-2 border-[#FFF0D7]/20 focus:border-[#56E0CB] text-[#FFF0D7] font-['Press_Start_2P'] text-base uppercase tracking-[0.2em] outline-none transition-colors"
              data-testid="input-room-code"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-5 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-[0_0_20px_rgba(86,224,203,0.35)] transition-all cursor-pointer disabled:opacity-50"
            data-testid="submit-join-room"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            Join Room
          </button>
        </form>
      )}
    </div>
  );
};

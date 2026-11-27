/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trophy,
  RotateCcw,
  Crown,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Skull,
  ShieldCheck,
} from 'lucide-react';
import { useMultiplayerRoom } from '../../hooks/useMultiplayerRoom';
import { MultiplayerLobbyAndWaitingRoom } from '../multiplayer/MultiplayerLobbyAndWaitingRoom';
import { RoomSocialBar } from '../multiplayer/RoomSocialBar';
import {
  getUserFriendlyMultiplayerError,
  returnRoomToWaiting,
  togglePlayerReady,
} from '../../logic/multiplayerRoom';
import {
  createMultiplayerSnakeArena,
  MP_SNAKE_TICK_MS,
  queueMultiplayerSnakeDirection,
  stepMultiplayerSnakeTick,
  type MultiplayerSnakeArenaState,
} from '../../backend/snakeRealtimeEngine';
import { pointKey, type SnakeDirection } from '../../logic/snake';
import { PixelAppleIcon } from './PixelAppleIcon';
import { SnakeHeadSprite, SnakeBodySprite } from './SnakeCharacterSprites';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import {
  completeSnakeMultiplayerRoom,
  recordVerifiedMultiplayerMatchForPlayer,
  startSnakeMultiplayerRoom,
} from '../../logic/matchRecording';

export interface SnakeMultiplayerViewProps {
  onBackToHome: () => void;
}

/**
 * Multiplayer Snake (2–10 Players) integrated with the universal waiting-room lifecycle.
 *
 * Control Plane: Firestore (`rooms/{roomCode}`) handles room creation, 2–10 player
 * invitations, ready status, host start, room chat, reactions, and post-round return
 * to the waiting room.
 * High-Frequency Data Plane: Uses `snakeRealtimeEngine` authoritative tick state
 * (never writes per-tick movement into Firestore).
 */
export const SnakeMultiplayerView: React.FC<SnakeMultiplayerViewProps> = () => {
  const { playClick, playWin } = useAudio();
  const { profile, isSignedInAccount } = useAuth();
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
    leaveRoom,
    closeRoom,
    syncRoom,
    clearError,
  } = useMultiplayerRoom('snake', true);

  const [actionError, setActionError] = useState<string | null>(null);
  const [arena, setArena] = useState<MultiplayerSnakeArenaState | null>(null);
  const [isReturningToWaiting, setIsReturningToWaiting] = useState<boolean>(false);
  const prevApplesByUidRef = useRef<Record<string, number>>({});
  const eatingUntilTickRef = useRef<Record<string, number>>({});
  const recordedSnakeSessionRef = useRef<string | null>(null);

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

  const handleStartGame = async () => {
    if (!room || !isHost) return;
    if (room.playerOrder.length < 2) {
      setActionError('At least 2 players are required to start Multiplayer Snake.');
      return;
    }
    playClick();
    setActionError(null);

    const players = room.playerOrder.map((pUid) => ({
      uid: pUid,
      username: room.players[pUid]?.nickname ?? 'Player',
    }));

    try {
      const started = await startSnakeMultiplayerRoom(room.roomCode);
      if (started) syncRoom?.(started);
    } catch {
      // Non-fatal if offline/test; arena still starts locally
    }

    recordedSnakeSessionRef.current = null;
    const freshArena = createMultiplayerSnakeArena({
      sessionId: `snake_${room.roomCode}_r${room.roundNumber ?? 1}_${Date.now()}`,
      roundNumber: room.roundNumber ?? 1,
      players,
    });
    setArena(freshArena);
  };

  const handleReturnToWaiting = async () => {
    if (!room || !isHost) {
      setArena(null);
      return;
    }
    playClick();
    setIsReturningToWaiting(true);
    setActionError(null);
    try {
      if (room.status === 'completed') {
        const waiting = await returnRoomToWaiting(room.roomCode);
        syncRoom?.(waiting);
      }
      setArena(null);
    } catch (err) {
      setActionError(getUserFriendlyMultiplayerError(err, 'rematch'));
    } finally {
      setIsReturningToWaiting(false);
    }
  };

  // Persist completed Snake match to Firestore room & verified player stats/leaderboard
  useEffect(() => {
    if (!arena || arena.status !== 'completed' || !room || !uid) return;
    if (recordedSnakeSessionRef.current === arena.sessionId) return;
    recordedSnakeSessionRef.current = arena.sessionId;

    const completedAt = Date.now();
    const scores: Record<string, number> = {};
    for (const pUid of arena.playerOrder) {
      scores[pUid] = arena.snakes[pUid]?.score ?? 0;
    }

    const persist = async () => {
      if (isHost) {
        try {
          const completedRoom = await completeSnakeMultiplayerRoom(room.roomCode, {
            sessionId: arena.sessionId,
            roundNumber: arena.roundNumber,
            winnerUids: arena.winnerUids,
            isDraw: arena.isDraw,
            scores,
            completedAt,
          });
          if (completedRoom) syncRoom?.(completedRoom);
        } catch {
          // Ignore room persistence failure if offline
        }
      }

      if (isSignedInAccount && profile) {
        const myOutcome = arena.isDraw
          ? 'draw'
          : arena.winnerUids.includes(uid)
            ? 'win'
            : 'loss';
        await recordVerifiedMultiplayerMatchForPlayer({
          roomCode: room.roomCode,
          gameId: 'snake',
          roundNumber: arena.roundNumber,
          playerUid: uid,
          profile,
          isRegisteredAccount: isSignedInAccount,
          outcome: myOutcome,
          score: arena.snakes[uid]?.score ?? 0,
          opponentUids: arena.playerOrder.filter((id) => id !== uid),
          completedAt,
          metrics: {
            snakeLength: arena.snakes[uid]?.segments.length ?? 0,
          },
        });
      }
    };

    void persist();
  }, [arena, room, uid, isHost, isSignedInAccount, profile, syncRoom]);

  // Authoritative tick loop while arena is active
  useEffect(() => {
    if (!arena || arena.status !== 'in_progress') return;
    const interval = setInterval(() => {
      setArena((prev) => {
        if (!prev || prev.status !== 'in_progress') return prev;
        const next = stepMultiplayerSnakeTick(prev);
        if (next.status === 'completed') {
          playWin();
        }
        return next;
      });
    }, MP_SNAKE_TICK_MS);
    return () => clearInterval(interval);
  }, [arena, playWin]);

  const sendDirection = useCallback(
    (dir: SnakeDirection) => {
      if (!uid) return;
      setArena((prev) => (prev ? queueMultiplayerSnakeDirection(prev, uid, dir) : prev));
    },
    [uid]
  );

  useEffect(() => {
    if (!arena || arena.status !== 'in_progress') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        sendDirection('up');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        sendDirection('down');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        sendDirection('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        sendDirection('right');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [arena, sendDirection]);

  // Waiting room or lobby when no active arena
  if (!room || !arena) {
    return (
      <div className="space-y-3" data-testid="snake-multiplayer-lobby">
        <div className="max-w-xl mx-auto p-3 rounded-xl bg-[#201A36] border border-[#56E0CB]/40 text-xs text-[#FFF0D7]/80 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#56E0CB] shrink-0 mt-0.5" />
          <span>
            <strong className="text-[#56E0CB]">Multiplayer Snake (2–10 Players):</strong> Arena edges wrap around to the opposite side! Larger snakes eat smaller snakes on collision. Last snake standing wins.
          </span>
        </div>

        <MultiplayerLobbyAndWaitingRoom
          gameType="snake"
          gameTitle="Neon Snake"
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
          onCreateRoom={(params) =>
            createRoom({ ...params, maxPlayers: 10 as never })
          }
          onJoinRoom={joinRoom}
          onToggleReady={handleToggleReady}
          onStartGame={handleStartGame}
          onLeaveRoom={leaveRoom}
          onCloseRoom={closeRoom}
          onClearError={() => {
            setActionError(null);
            clearError();
          }}
        />
      </div>
    );
  }

  const appleSet = new Set(arena.apples.map(pointKey));
  const obstacleSet = new Set(arena.obstacles.map(pointKey));
  const cellToSnakeSegment = new Map<
    string,
    {
      color: string;
      isHead: boolean;
      isTail: boolean;
      direction: SnakeDirection;
      showTongue: boolean;
      isEating: boolean;
    }
  >();

  arena.playerOrder.forEach((pUid, playerIndex) => {
    const s = arena.snakes[pUid];
    if (!s || !s.alive) return;
    const prevApples = prevApplesByUidRef.current[pUid] ?? 0;
    if (s.applesCollected > prevApples) {
      eatingUntilTickRef.current[pUid] = arena.tick + 2;
    }
    prevApplesByUidRef.current[pUid] = s.applesCollected;
    const isEating = arena.tick <= (eatingUntilTickRef.current[pUid] ?? -1);
    const showTongue =
      arena.status === 'in_progress' &&
      arena.tick > 0 &&
      (arena.tick + playerIndex * 3) % 10 === 0;

    s.segments.forEach((seg, i) => {
      cellToSnakeSegment.set(pointKey(seg), {
        color: s.color,
        isHead: i === 0,
        isTail: i > 0 && i === s.segments.length - 1,
        direction: s.direction,
        showTongue,
        isEating,
      });
    });
  });

  const mySnake = uid ? arena.snakes[uid] : null;
  const rankedSnakes = [...arena.playerOrder]
    .map((u) => arena.snakes[u])
    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || b.score - a.score);

  return (
    <div className="max-w-4xl mx-auto space-y-4" data-testid="snake-multiplayer-active">
      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Live 2–10 Player Scoreboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {rankedSnakes.map((s) => (
          <div
            key={s.uid}
            className={`p-2.5 rounded-xl bg-[#201A36] border text-xs ${
              s.alive ? 'border-[#3D345F]' : 'border-[#FF776E]/40 opacity-65'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#FFF0D7] truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.username}</span>
              </span>
              {!s.alive && <Skull className="w-3.5 h-3.5 text-[#FF776E] shrink-0" />}
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1 font-mono">
              <span style={{ color: s.color }}>{s.score} pts</span>
              <span className="text-[#FFF0D7]/65">Len {s.segments.length}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Elimination Feedback for Current Player */}
      {mySnake && !mySnake.alive && arena.status === 'in_progress' && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] text-center"
        >
          <strong className="text-[#FF776E]">You were eliminated!</strong>{' '}
          {mySnake.eliminationReason} — Final Score: {mySnake.score} pts (Rank #{mySnake.placement})
        </div>
      )}

      {/* Shared 26x26 Multiplayer Arena */}
      <div className="relative aspect-square w-full max-w-[520px] mx-auto rounded-2xl bg-[#120E24] border-2 border-[#56E0CB]/70 p-1.5 touch-none select-none overflow-hidden">
        <div
          className="grid w-full h-full gap-[1px]"
          style={{
            gridTemplateColumns: `repeat(${arena.gridSize}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${arena.gridSize}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: arena.gridSize * arena.gridSize }).map((_, idx) => {
            const x = idx % arena.gridSize;
            const y = Math.floor(idx / arena.gridSize);
            const key = `${x},${y}`;
            const snakeCell = cellToSnakeSegment.get(key);
            const isApple = appleSet.has(key);
            const isObstacle = obstacleSet.has(key);

            if (snakeCell) {
              if (snakeCell.isHead) {
                return (
                  <div
                    key={key}
                    className="relative bg-[#1A1533] flex items-center justify-center overflow-visible z-10"
                    style={{ filter: `drop-shadow(0 0 4px ${snakeCell.color})` }}
                  >
                    <SnakeHeadSprite
                      color={snakeCell.color}
                      direction={snakeCell.direction}
                      showTongue={snakeCell.showTongue}
                      isEating={snakeCell.isEating}
                    />
                  </div>
                );
              }
              return (
                <div key={key} className="bg-[#1A1533] flex items-center justify-center">
                  <SnakeBodySprite color={snakeCell.color} isTail={snakeCell.isTail} />
                </div>
              );
            }
            if (isApple) {
              return (
                <div key={key} className="bg-[#1A1533] flex items-center justify-center p-[1px]">
                  <PixelAppleIcon className="w-full h-full" />
                </div>
              );
            }
            if (isObstacle) {
              return <div key={key} className="bg-[#6B5B95] border border-[#FFC66D]/50 rounded-[1px]" />;
            }
            return <div key={key} className="bg-[#1A1533]" />;
          })}
        </div>

        {/* Completed Results Overlay -> Universal Return to Waiting Room */}
        {arena.status === 'completed' && (
          <div
            className="absolute inset-0 bg-[#171329]/92 p-5 flex flex-col items-center justify-center text-center space-y-3"
            data-testid="snake-mp-results-overlay"
          >
            <Trophy className="w-8 h-8 text-[#FFC66D]" />
            <h2 className="font-['Press_Start_2P'] text-xs sm:text-sm text-[#FFC66D]">
              {arena.isDraw
                ? 'DRAW MATCH!'
                : `${arena.winnerUids
                    .map((w) => arena.snakes[w]?.username ?? 'Player')
                    .join(' & ')
                    .toUpperCase()} WINS!`}
            </h2>

            <div className="w-full max-w-xs space-y-1.5 text-xs">
              {rankedSnakes.slice(0, 5).map((s) => (
                <div
                  key={s.uid}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#201A36] border border-[#3D345F]"
                >
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#FFF0D7] truncate">
                    {s.placement === 1 && <Crown className="w-3.5 h-3.5 text-[#FFC66D]" />}
                    <span>#{s.placement ?? '-'}</span>
                    <span className="truncate">{s.username}</span>
                  </span>
                  <span className="font-mono text-[#56E0CB]">
                    {s.score} pts · Len {s.segments.length}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleReturnToWaiting()}
              disabled={isReturningToWaiting}
              data-testid="snake-mp-return-waiting-btn"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#56E0CB] text-[#171329] font-['Press_Start_2P'] text-[10px] uppercase cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Return to Waiting Room</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile D-Pad */}
      <div className="sm:hidden flex flex-col items-center gap-1.5" aria-label="Multiplayer Snake touch controls">
        <button
          type="button"
          onClick={() => sendDirection('up')}
          className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB]"
          aria-label="Move up"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => sendDirection('left')}
            className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB]"
            aria-label="Move left"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => sendDirection('right')}
            className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB]"
            aria-label="Move right"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => sendDirection('down')}
          className="w-12 h-12 rounded-xl bg-[#292342] border border-[#56E0CB]/60 flex items-center justify-center text-[#56E0CB]"
          aria-label="Move down"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>

      <RoomSocialBar room={room} uid={uid} isHost={isHost} compact={true} anchorMode="board" />
    </div>
  );
};

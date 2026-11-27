/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  X,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  ARCADE_REACTION_CATALOG,
  CHAT_MESSAGE_MAX_LENGTH,
  MultiplayerRoomDocument,
  ReactionEmoji,
} from '../../types/multiplayer';
import { useRoomSocial } from '../../hooks/useRoomSocial';
import { getMemoryPlayerColor } from '../../logic/memoryMatchMultiplayer';
import { useAudio } from '../../context/AudioContext';
import { ArcadeReactionIcon } from './ArcadeReactionIcon';

export interface RoomSocialBarProps {
  room: MultiplayerRoomDocument;
  uid: string | null;
  isHost: boolean;
  compact?: boolean;
  /**
   * When 'board' (default), reaction animations are anchored to the enclosing
   * relative game-board wrapper instead of the corners of the entire viewport.
   */
  anchorMode?: 'board' | 'viewport';
}

function formatMessageTime(timestampMs: number): string {
  try {
    return new Date(timestampMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const REACTION_META_BY_EMOJI = new Map(
  ARCADE_REACTION_CATALOG.map((item) => [item.emoji, item])
);

/**
 * Pixel Afterglow multiplayer social controls:
 * - Directly underneath the game board: docked arcade reaction toolbar with 9 custom
 *   pixel-art SVG illustrations (including Angry 😡).
 * - Board-anchored non-blocking floating reaction stage centered just above the toolbar
 *   so reactions feel connected to gameplay without obscuring cards, scores, or controls.
 * - Compact floating corner chat icon that opens a smaller floating chat panel on desktop
 *   (leaving the game board visible) and a compact bottom sheet on mobile.
 */
export const RoomSocialBar: React.FC<RoomSocialBarProps> = ({
  room,
  uid,
  isHost,
  compact = false,
  anchorMode = 'board',
}) => {
  const { playClick } = useAudio();
  const {
    activeReactions,
    messages,
    isLoadingChat,
    isSendingMessage,
    socialError,
    clearSocialError,
    sendReaction,
    sendMessage,
    deleteMessage,
  } = useRoomSocial(room, uid);

  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [justSentEmoji, setJustSentEmoji] = useState<ReactionEmoji | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [lastSeenCount, setLastSeenCount] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = isChatOpen ? 0 : Math.max(0, messages.length - lastSeenCount);

  useEffect(() => {
    if (isChatOpen) {
      setLastSeenCount(messages.length);
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [isChatOpen, messages.length]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  const handleToggleChat = () => {
    playClick();
    clearSocialError();
    setIsChatOpen((prev) => {
      const next = !prev;
      if (next) {
        setLastSeenCount(messages.length);
      }
      return next;
    });
  };

  const handleSendReaction = async (emoji: ReactionEmoji) => {
    playClick();
    setJustSentEmoji(emoji);
    if (pulseTimerRef.current) {
      clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = setTimeout(() => {
      setJustSentEmoji(null);
      pulseTimerRef.current = null;
    }, 450);
    await sendReaction(emoji);
  };

  const handleSubmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingMessage || !draft.trim()) return;
    playClick();
    const ok = await sendMessage(draft);
    if (ok) {
      setDraft('');
      inputRef.current?.focus();
    }
  };

  const orderedUids = room.memoryMatchState?.turnOrderUids ?? room.playerOrder;

  const overlayPositionClasses =
    anchorMode === 'board'
      ? 'absolute -top-16 sm:-top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-end justify-center gap-2 sm:gap-2.5 flex-wrap w-full max-w-[94%] px-2'
      : 'fixed bottom-16 sm:bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-end justify-center gap-2 sm:gap-2.5 flex-wrap max-w-[92vw]';

  return (
    <div
      className={`relative w-full max-w-4xl mx-auto ${compact ? 'mt-2 sm:mt-3' : 'mt-3 sm:mt-4'}`}
      data-testid="room-social-bar"
    >
      {/* Board-Anchored Non-Blocking Arcade Reaction Overlay */}
      {activeReactions.length > 0 && (
        <div
          className={overlayPositionClasses}
          aria-live="polite"
          data-testid="room-reactions-overlay"
          data-anchor-mode={anchorMode}
        >
          {activeReactions.map((r) => {
            const meta = REACTION_META_BY_EMOJI.get(r.emoji);
            const pColor =
              getMemoryPlayerColor(r.uid, orderedUids)?.hex ?? meta?.accentHex ?? '#56E0CB';
            const badgeBorder = meta?.accentHex ?? pColor;
            const badgeGlow = meta?.glowRgba ?? `${pColor}66`;

            return (
              <div
                key={r.id}
                className="animate-arcade-reaction flex flex-col items-center gap-1"
                data-testid={`room-reaction-toast-${r.id}`}
              >
                <div
                  className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#171329]/95 border-2 flex items-center justify-center"
                  style={{
                    borderColor: badgeBorder,
                    boxShadow: `3px 3px 0px 0px ${badgeBorder}, 0 0 18px ${badgeGlow}`,
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-1 h-1"
                    style={{ backgroundColor: badgeBorder }}
                    aria-hidden="true"
                  />
                  <span
                    className="absolute top-0.5 right-0.5 w-1 h-1"
                    style={{ backgroundColor: badgeBorder }}
                    aria-hidden="true"
                  />
                  <ArcadeReactionIcon
                    emoji={r.emoji}
                    className="w-8 h-8 sm:w-9 sm:h-9"
                  />
                  <span className="sr-only">
                    {meta?.label ?? r.emoji} ({r.emoji})
                  </span>
                </div>
                <span
                  className="px-2 py-0.5 rounded bg-[#171329]/95 border text-[10px] font-bold truncate max-w-[110px] shadow"
                  style={{
                    color: pColor,
                    borderColor: `${pColor}88`,
                  }}
                >
                  {r.nickname}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Docked Arcade Reaction Toolbar directly underneath the game board */}
      <div
        className="bg-[#201A36]/95 border-2 border-[#3D345F] rounded-xl px-2 py-2 sm:px-3 sm:py-2.5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2"
        data-testid="board-reaction-toolbar"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFC66D]" aria-hidden="true" />
          <span className="font-['Press_Start_2P'] text-[8px] sm:text-[9px] text-[#FFC66D] uppercase tracking-wider">
            REACT
          </span>
        </div>

        <div
          className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap"
          data-testid="room-reaction-buttons"
        >
          {ARCADE_REACTION_CATALOG.map((item) => {
            const isPulsing = justSentEmoji === item.emoji;
            return (
              <button
                key={item.emoji}
                type="button"
                onClick={() => void handleSendReaction(item.emoji)}
                title={item.label}
                aria-label={`Send ${item.label} (${item.emoji}) reaction`}
                data-testid={`reaction-btn-${item.emoji}`}
                style={{
                  borderColor: isPulsing ? item.accentHex : undefined,
                  boxShadow: isPulsing ? `0 0 12px ${item.glowRgba}` : undefined,
                }}
                className={`group relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#171329] hover:bg-[#292342] border-2 border-[#3D345F] hover:border-[#FFC66D] flex items-center justify-center transition-all cursor-pointer touch-manipulation ${
                  isPulsing ? 'scale-110' : 'active:scale-90'
                }`}
              >
                <ArcadeReactionIcon
                  emoji={item.emoji}
                  className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline Social Rate-Limit / Validation Notice */}
      {socialError && !isChatOpen && (
        <div
          role="alert"
          className="mt-1.5 px-3 py-1.5 rounded-lg bg-[#FF776E]/15 border border-[#FF776E]/60 text-[#FFF0D7] text-[11px] flex items-center justify-between gap-2"
          data-testid="room-social-error"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#FF776E] shrink-0" />
            {socialError}
          </span>
          <button
            type="button"
            onClick={clearSocialError}
            className="text-[#FFF0D7]/70 hover:text-[#FFF0D7] cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact Floating Corner Chat Button */}
      <button
        type="button"
        onClick={handleToggleChat}
        aria-expanded={isChatOpen}
        aria-label={isChatOpen ? 'Close room chat' : 'Open room chat'}
        data-testid="room-chat-toggle"
        className={`fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-40 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full border-2 text-xs font-bold shadow-[0_6px_24px_rgba(14,10,30,0.75)] transition-all cursor-pointer ${
          isChatOpen
            ? 'bg-[#56E0CB] text-[#171329] border-[#56E0CB]'
            : 'bg-[#201A36] hover:bg-[#292342] text-[#56E0CB] border-[#56E0CB]/70'
        }`}
      >
        <MessageSquare className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">Chat</span>
        {unreadCount > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-full bg-[#FF776E] text-[#171329] text-[10px] font-extrabold leading-none"
            data-testid="room-chat-unread-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Compact Floating Chat Panel (Desktop) / Compact Bottom Sheet (Mobile) */}
      {isChatOpen && (
        <>
          <div
            className="sm:hidden fixed inset-0 bg-black/50 z-40"
            onClick={handleToggleChat}
            aria-hidden="true"
          />

          <section
            aria-label="Room Chat"
            data-testid="room-chat-panel"
            className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:bottom-16 sm:right-4 sm:w-[320px] sm:h-[380px] sm:max-h-[58vh] bg-[#171329] border-t-2 sm:border-2 border-[#56E0CB]/70 rounded-t-2xl sm:rounded-2xl shadow-[0_12px_36px_rgba(10,6,24,0.88)] flex flex-col max-h-[54dvh]"
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#3D345F] bg-[#201A36] rounded-t-2xl shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-[#56E0CB] shrink-0" />
                <span className="font-['Press_Start_2P'] text-[9px] text-[#56E0CB] uppercase tracking-wider truncate">
                  Chat · {room.roomCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleChat}
                aria-label="Close room chat"
                data-testid="room-chat-close"
                className="p-1 rounded-lg hover:bg-[#292342] text-[#FFF0D7]/75 hover:text-[#FFF0D7] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Error */}
            {socialError && (
              <div
                role="alert"
                className="mx-2.5 mt-2 px-2.5 py-1.5 rounded-lg bg-[#FF776E]/15 border border-[#FF776E]/60 text-[#FFF0D7] text-[11px] flex items-center gap-1.5 shrink-0"
                data-testid="room-chat-error"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[#FF776E] shrink-0" />
                <span>{socialError}</span>
              </div>
            )}

            {/* Scrollable Compact Message Bubbles */}
            <div
              className="flex-1 overflow-y-auto arcade-scrollbar px-2.5 py-2.5 space-y-2 min-h-[120px]"
              data-testid="room-chat-messages"
            >
              {isLoadingChat ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#FFF0D7]/60">
                  <Loader2 className="w-4 h-4 animate-spin text-[#56E0CB]" />
                  <span>Loading chat...</span>
                </div>
              ) : messages.length === 0 ? (
                <p
                  className="text-center py-6 text-xs text-[#FFF0D7]/55 italic"
                  data-testid="room-chat-empty"
                >
                  No messages yet — say hi!
                </p>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.uid === uid;
                  const canDelete = isHost || isMine;
                  const senderColor =
                    getMemoryPlayerColor(msg.uid, orderedUids)?.hex ?? '#56E0CB';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      data-testid={`room-chat-message-${msg.id}`}
                    >
                      <div
                        className={`max-w-[86%] rounded-xl px-2.5 py-1.5 border text-xs shadow-sm ${
                          isMine
                            ? 'bg-[#56E0CB]/15 border-[#56E0CB]/55 rounded-br-sm'
                            : 'bg-[#201A36] border-[#3D345F] rounded-bl-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className="font-bold text-[10px] truncate"
                              style={{ color: isMine ? '#56E0CB' : senderColor }}
                            >
                              {msg.nickname}
                            </span>
                            {isMine && (
                              <span className="px-1 py-0.2 rounded bg-[#56E0CB]/25 text-[#56E0CB] text-[8px] font-bold">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[9px] text-[#FFF0D7]/45">
                              {formatMessageTime(msg.createdAt)}
                            </span>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void deleteMessage(msg.id)}
                                aria-label={`Delete message from ${msg.nickname}`}
                                data-testid={`delete-chat-message-${msg.id}`}
                                className="p-0.5 rounded text-[#FFF0D7]/40 hover:text-[#FF776E] cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[#FFF0D7] break-words leading-snug text-[11px]">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compact Composer */}
            <form
              onSubmit={(e) => void handleSubmitMessage(e)}
              className="p-2 border-t border-[#3D345F] bg-[#201A36] sm:rounded-b-2xl flex items-center gap-1.5 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message room..."
                aria-label="Room chat message"
                data-testid="room-chat-input"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#171329] border border-[#3D345F] focus:border-[#56E0CB] text-[#FFF0D7] text-xs outline-none"
              />
              <span className="text-[9px] text-[#FFF0D7]/45 shrink-0">
                {draft.length}/{CHAT_MESSAGE_MAX_LENGTH}
              </span>
              <button
                type="submit"
                disabled={isSendingMessage || !draft.trim()}
                aria-label="Send chat message"
                data-testid="room-chat-send"
                className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] text-xs font-bold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
              >
                {isSendingMessage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
};

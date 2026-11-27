/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MultiplayerRoomDocument,
  ReactionEmoji,
  RoomReaction,
  RoomChatMessage,
} from '../types/multiplayer';
import {
  sendRoomReaction,
  subscribeToRoomReactions,
  sendRoomChatMessage,
  deleteRoomChatMessage,
  subscribeToRoomChat,
} from '../logic/roomSocial';
import { getUserFriendlyMultiplayerError } from '../logic/multiplayerRoom';

const REACTION_DISPLAY_DURATION_MS = 3400;

export interface UseRoomSocialResult {
  activeReactions: RoomReaction[];
  messages: RoomChatMessage[];
  isLoadingChat: boolean;
  isSendingMessage: boolean;
  socialError: string | null;
  clearSocialError: () => void;
  sendReaction: (emoji: ReactionEmoji) => Promise<void>;
  sendMessage: (text: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<void>;
}

/**
 * Manages real-time reactions and persistent room chat subscriptions for an active multiplayer room.
 * Automatically cleans up Firestore listeners when leaving the room or unmounting.
 */
export function useRoomSocial(
  room: MultiplayerRoomDocument | null,
  uid: string | null
): UseRoomSocialResult {
  const [activeReactions, setActiveReactions] = useState<RoomReaction[]>([]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [socialError, setSocialError] = useState<string | null>(null);

  const roomRef = useRef<MultiplayerRoomDocument | null>(room);
  roomRef.current = room;
  const seenReactionIdsRef = useRef<Set<string>>(new Set());
  const mountedAtRef = useRef<number>(Date.now());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const roomCode = room?.roomCode ?? null;
  const isMember = Boolean(room && uid && uid in room.players);

  const clearSocialError = useCallback(() => {
    setSocialError(null);
  }, []);

  // Subscribe to real-time reactions & chat when user is a member of an active room
  useEffect(() => {
    if (!roomCode || !isMember) {
      setActiveReactions([]);
      setMessages([]);
      setIsLoadingChat(false);
      seenReactionIdsRef.current.clear();
      return;
    }

    mountedAtRef.current = Date.now();
    seenReactionIdsRef.current.clear();
    setIsLoadingChat(true);

    const activeTimers = timersRef.current;

    const unsubReactions = subscribeToRoomReactions(roomCode, {
      onReactions: (incoming) => {
        const now = Date.now();
        const freshlyArrived: RoomReaction[] = [];

        for (const r of incoming) {
          if (seenReactionIdsRef.current.has(r.id)) continue;
          seenReactionIdsRef.current.add(r.id);

          // Only display reactions sent around/after joining so old history doesn't burst on screen
          if (now - r.createdAt <= REACTION_DISPLAY_DURATION_MS + 1500 && r.createdAt >= mountedAtRef.current - 2500) {
            freshlyArrived.push(r);
          }
        }

        if (freshlyArrived.length > 0) {
          setActiveReactions((prev) => [...prev, ...freshlyArrived].slice(-6));
          for (const reaction of freshlyArrived) {
            const timer = setTimeout(() => {
              setActiveReactions((prev) => prev.filter((item) => item.id !== reaction.id));
              activeTimers.delete(reaction.id);
            }, REACTION_DISPLAY_DURATION_MS);
            activeTimers.set(reaction.id, timer);
          }
        }
      },
      onError: () => {
        // Non-fatal: gameplay continues unaffected if reaction stream hiccups
      },
    });

    const unsubChat = subscribeToRoomChat(roomCode, {
      onMessages: (incomingMessages) => {
        setMessages(incomingMessages);
        setIsLoadingChat(false);
      },
      onError: (err) => {
        setIsLoadingChat(false);
        setSocialError(getUserFriendlyMultiplayerError(err, 'subscription'));
      },
    });

    return () => {
      unsubReactions();
      unsubChat();
      for (const timer of activeTimers.values()) {
        clearTimeout(timer);
      }
      activeTimers.clear();
    };
  }, [roomCode, isMember]);

  const sendReaction = useCallback(async (emoji: ReactionEmoji) => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return;
    setSocialError(null);
    try {
      await sendRoomReaction({ room: currentRoom, emoji });
    } catch (err) {
      setSocialError(
        err instanceof Error && err.message
          ? err.message
          : getUserFriendlyMultiplayerError(err, 'game-action')
      );
    }
  }, []);

  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return false;
    setSocialError(null);
    setIsSendingMessage(true);
    try {
      await sendRoomChatMessage({ room: currentRoom, text });
      return true;
    } catch (err) {
      setSocialError(
        err instanceof Error && err.message
          ? err.message
          : getUserFriendlyMultiplayerError(err, 'game-action')
      );
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  }, []);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!roomCode) return;
      setSocialError(null);
      try {
        await deleteRoomChatMessage({ roomCode, messageId });
      } catch (err) {
        setSocialError(getUserFriendlyMultiplayerError(err, 'game-action'));
      }
    },
    [roomCode]
  );

  return {
    activeReactions,
    messages,
    isLoadingChat,
    isSendingMessage,
    socialError,
    clearSocialError,
    sendReaction,
    sendMessage,
    deleteMessage,
  };
}

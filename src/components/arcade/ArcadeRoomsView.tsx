/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  DoorOpen,
  Crown,
  Shield,
  Users,
  Copy,
  Check,
  Link2,
  Settings,
  Trash2,
  Play,
  XCircle,
  Sparkles,
  AlertTriangle,
  Gamepad2,
  Layers,
  UserMinus,
  Clock,
  Lock,
  Globe,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import { ensureAnonymousSession } from '../../lib/auth';
import {
  ARCADE_GAME_CATALOG,
  isArcadeRoomManager,
  isArcadeRoomOwner,
  type ArcadeGameId,
  type ArcadeGameSession,
  type ArcadeRoomMember,
  type ArcadeRoomVisibility,
  type PersistentArcadeRoom,
} from '../../types/arcadeRoom';
import {
  MEMORY_MAX_CARD_COUNT,
  MEMORY_MIN_CARD_COUNT,
  MEMORY_CARD_COUNT_STEP,
  type MultiplayerGameType,
} from '../../types/multiplayer';
import {
  buildArcadeRoomInvitationUrl,
  createPersistentArcadeRoom,
  deletePersistentArcadeRoom,
  finishArcadeRoomGameSession,
  joinPersistentArcadeRoomByCode,
  removeArcadeRoomMember,
  setArcadeMemberRole,
  startArcadeRoomGameSession,
  subscribeToArcadeRoom,
  subscribeToArcadeRoomMembers,
  subscribeToArcadeRoomSessions,
  subscribeToUserArcadeRooms,
  updatePersistentArcadeRoomSettings,
} from '../../logic/arcadeRooms';
import { saveActiveRoomSession, normalizeRoomCode } from '../../logic/multiplayerRoom';
import { getCountryByCode } from '../../data/countries';
import { formatUserError } from '../../utils/userErrorFormatter';

export interface ActiveArcadeLaunchContext {
  arcadeRoomId: string;
  arcadeRoomName: string;
  sessionId: string;
  roomCode: string;
  gameType: MultiplayerGameType;
}

export interface ArcadeRoomsViewProps {
  onBackToHome: () => void;
  onOpenAuth: () => void;
  onPlayTemporaryGame: (gameType: MultiplayerGameType) => void;
  onLaunchGameSession: (context: ActiveArcadeLaunchContext) => void;
  initialInviteCode?: string | null;
  initialOpenRoomId?: string | null;
  onClearInviteCode?: () => void;
}

export const ArcadeRoomsView: React.FC<ArcadeRoomsViewProps> = ({
  onBackToHome,
  onOpenAuth,
  onPlayTemporaryGame,
  onLaunchGameSession,
  initialInviteCode = null,
  initialOpenRoomId = null,
  onClearInviteCode,
}) => {
  const { playClick } = useAudio();
  const { uid, profile, isSignedInAccount } = useAuth();

  const [rooms, setRooms] = useState<PersistentArcadeRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialOpenRoomId);
  const [selectedRoom, setSelectedRoom] = useState<PersistentArcadeRoom | null>(null);
  const [members, setMembers] = useState<ArcadeRoomMember[]>([]);
  const [sessions, setSessions] = useState<ArcadeGameSession[]>([]);

  // Create room state (simplified: Room Name + Access Setting only; game config happens inside the room)
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newVisibility, setNewVisibility] = useState<ArcadeRoomVisibility>('invite-only');

  // Join by code state
  const [joinCode, setJoinCode] = useState<string>(initialInviteCode ?? '');

  // Edit settings state
  const [isEditingSettings, setIsEditingSettings] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editGames, setEditGames] = useState<ArcadeGameId[]>(['memory-match', 'tic-tac-toe']);
  const [editVisibility, setEditVisibility] = useState<ArcadeRoomVisibility>('invite-only');
  const [editCardCount, setEditCardCount] = useState<number>(20);

  // Session launch card count override
  const [sessionCardCount, setSessionCardCount] = useState<number>(20);

  // UI feedback state
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  useEffect(() => {
    if (initialInviteCode) {
      setJoinCode(initialInviteCode);
    }
  }, [initialInviteCode]);

  useEffect(() => {
    if (initialOpenRoomId) {
      setSelectedRoomId(initialOpenRoomId);
    }
  }, [initialOpenRoomId]);

  // Subscribe to all persistent arcade rooms the user belongs to
  useEffect(() => {
    if (!uid) {
      setRooms([]);
      return;
    }
    const unsub = subscribeToUserArcadeRooms(uid, {
      onData: (list) => setRooms(list),
      onError: (err) => setErrorMsg(err.message),
    });
    return () => unsub();
  }, [uid]);

  // Subscribe to currently opened persistent arcade room + members + sessions
  useEffect(() => {
    if (!selectedRoomId) {
      setSelectedRoom(null);
      setMembers([]);
      setSessions([]);
      setIsEditingSettings(false);
      setConfirmDelete(false);
      return;
    }

    const unsubRoom = subscribeToArcadeRoom(selectedRoomId, {
      onData: (roomDoc) => {
        setSelectedRoom(roomDoc);
        if (roomDoc) {
          setEditName(roomDoc.name);
          setEditGames(roomDoc.availableGames);
          setEditVisibility(roomDoc.visibility);
          setEditCardCount(roomDoc.defaultMemoryCardCount);
          setSessionCardCount(roomDoc.defaultMemoryCardCount);
        }
      },
      onError: (err) => setErrorMsg(err.message),
    });
    const unsubMembers = subscribeToArcadeRoomMembers(selectedRoomId, {
      onData: (list) => setMembers(list),
    });
    const unsubSessions = subscribeToArcadeRoomSessions(selectedRoomId, {
      onData: (list) => setSessions(list),
    });

    return () => {
      unsubRoom();
      unsubMembers();
      unsubSessions();
    };
  }, [selectedRoomId]);

  const toggleGameSelection = (
    list: ArcadeGameId[],
    setter: React.Dispatch<React.SetStateAction<ArcadeGameId[]>>,
    gameId: ArcadeGameId
  ) => {
    playClick();
    if (list.includes(gameId)) {
      if (list.length <= 1) return;
      setter(list.filter((g) => g !== gameId));
    } else {
      setter([...list, gameId]);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setIsBusy(true);
    try {
      const created = await createPersistentArcadeRoom({
        name: newName,
        availableGames: ['memory-match', 'tic-tac-toe', 'snake'],
        visibility: newVisibility,
        defaultMemoryCardCount: 20,
        ownerUsername: profile?.username || 'Player',
        countryCode: profile?.countryCode,
        avatarId: profile?.avatarId,
      });
      setNewName('');
      setShowCreateForm(false);
      setSelectedRoomId(created.id);
      setInfoMsg(`Created persistent arcade room "${created.name}"!`);
    } catch (err) {
      setErrorMsg(formatUserError(err, 'Could not create arcade room.'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setIsBusy(true);
    try {
      if (!uid) {
        await ensureAnonymousSession();
      }
      const joined = await joinPersistentArcadeRoomByCode({
        inviteCode: joinCode,
        username: profile?.username || 'Guest Player',
        countryCode: profile?.countryCode,
        avatarId: profile?.avatarId,
      });
      setJoinCode('');
      onClearInviteCode?.();
      setSelectedRoomId(joined.id);
      setInfoMsg(`Joined "${joined.name}"!`);
    } catch (err) {
      setErrorMsg(formatUserError(err, 'Could not join arcade room.'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setIsBusy(true);
    try {
      await updatePersistentArcadeRoomSettings(selectedRoom.id, {
        name: editName,
        availableGames: editGames,
        visibility: editVisibility,
        defaultMemoryCardCount: editCardCount,
      });
      setIsEditingSettings(false);
      setInfoMsg('Arcade room settings updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save room settings.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!selectedRoom) return;
    playClick();
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const deletedName = selectedRoom.name;
      await deletePersistentArcadeRoom(selectedRoom.id);
      setSelectedRoomId(null);
      setConfirmDelete(false);
      setInfoMsg(`Deleted arcade room "${deletedName}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete arcade room.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartSession = async (gameType: MultiplayerGameType) => {
    if (!selectedRoom) return;
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setIsBusy(true);
    try {
      const { session, roomCode } = await startArcadeRoomGameSession({
        arcadeRoomId: selectedRoom.id,
        gameType,
        cardCount: gameType === 'memory-match' ? sessionCardCount : undefined,
        hostNickname: profile?.username || 'Player',
      });
      onLaunchGameSession({
        arcadeRoomId: selectedRoom.id,
        arcadeRoomName: selectedRoom.name,
        sessionId: session.sessionId,
        roomCode,
        gameType,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start game session.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinActiveSession = () => {
    if (
      !selectedRoom ||
      !selectedRoom.activeSessionId ||
      !selectedRoom.activeSessionRoomCode ||
      !selectedRoom.activeSessionGameType
    ) {
      return;
    }
    playClick();
    saveActiveRoomSession(
      selectedRoom.activeSessionGameType,
      selectedRoom.activeSessionRoomCode
    );
    onLaunchGameSession({
      arcadeRoomId: selectedRoom.id,
      arcadeRoomName: selectedRoom.name,
      sessionId: selectedRoom.activeSessionId,
      roomCode: selectedRoom.activeSessionRoomCode,
      gameType: selectedRoom.activeSessionGameType,
    });
  };

  const handleEndActiveSession = async () => {
    if (!selectedRoom || !selectedRoom.activeSessionId) return;
    playClick();
    setErrorMsg(null);
    setIsBusy(true);
    try {
      await finishArcadeRoomGameSession({
        arcadeRoomId: selectedRoom.id,
        sessionId: selectedRoom.activeSessionId,
        status: 'cancelled',
      });
      setInfoMsg('Active game session ended. You can start a new session anytime.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not end active session.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopy = async (kind: 'code' | 'link', text: string) => {
    playClick();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(kind);
      setTimeout(() => setCopiedTarget(null), 2000);
    } catch {
      setCopiedTarget(null);
    }
  };

  // ============================================================================
  // VIEW 1: SPECIFIC PERSISTENT ARCADE ROOM HUB
  // ============================================================================
  if (selectedRoom) {
    const isOwner = isArcadeRoomOwner(selectedRoom, uid);
    const isManager = isArcadeRoomManager(selectedRoom, uid);
    const inviteUrl = buildArcadeRoomInvitationUrl(selectedRoom.inviteCode);
    const hasActiveSession = Boolean(
      selectedRoom.activeSessionId &&
        selectedRoom.activeSessionRoomCode &&
        selectedRoom.activeSessionGameType
    );

    return (
      <div
        className="py-4 sm:py-6 px-3 sm:px-6 md:px-8 max-w-5xl mx-auto space-y-4 sm:space-y-5"
        data-testid="arcade-room-hub"
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              playClick();
              setSelectedRoomId(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] hover:text-[#56E0CB] border border-[#3D345F] text-xs font-semibold cursor-pointer"
            data-testid="arcade-back-to-list"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Arcade Rooms</span>
          </button>

          <div className="flex items-center gap-1.5 flex-wrap">
            {isManager && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsEditingSettings((prev) => !prev);
                }}
                data-testid="arcade-edit-settings-btn"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#201A36] hover:bg-[#292342] text-[#FFC66D] border border-[#FFC66D]/45 text-xs font-semibold cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setConfirmDelete((prev) => !prev);
                }}
                data-testid="arcade-delete-room-btn"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF776E]/15 hover:bg-[#FF776E]/25 text-[#FF776E] border border-[#FF776E]/45 text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div
            role="alert"
            data-testid="arcade-room-error"
            className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {infoMsg && (
          <div
            role="status"
            data-testid="arcade-room-info"
            className="p-3 rounded-xl bg-[#56E0CB]/15 border border-[#56E0CB] text-xs text-[#56E0CB]"
          >
            {infoMsg}
          </div>
        )}

        {/* Delete Confirmation */}
        {confirmDelete && isOwner && (
          <div
            className="p-4 rounded-2xl bg-[#201A36] border-2 border-[#FF776E] space-y-3"
            data-testid="arcade-delete-confirm"
          >
            <p className="text-xs sm:text-sm text-[#FFF0D7]">
              Permanently delete <strong className="text-[#FF776E]">{selectedRoom.name}</strong>?
              This removes the persistent room, member list, and session history.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteRoom()}
                disabled={isBusy}
                data-testid="arcade-delete-confirm-btn"
                className="px-4 py-2 rounded-xl bg-[#FF776E] text-[#171329] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isBusy ? 'Deleting...' : 'Yes, Delete Room'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-xl bg-[#292342] text-[#FFF0D7]/80 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Room Identity & Invite Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border-2 border-[#56E0CB]/50 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DoorOpen className="w-5 h-5 text-[#56E0CB] shrink-0" />
                <h1 className="font-['Press_Start_2P'] text-sm sm:text-base text-[#FFF0D7] truncate">
                  {selectedRoom.name}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#171329] border border-[#3D345F] text-[10px] text-[#56E0CB] font-semibold">
                  {selectedRoom.visibility === 'private' ? (
                    <Lock className="w-2.5 h-2.5" />
                  ) : (
                    <Globe className="w-2.5 h-2.5" />
                  )}
                  {selectedRoom.visibility === 'private' ? 'Private' : 'Invite Only'}
                </span>
              </div>
              <p className="text-xs text-[#FFF0D7]/65 mt-1">
                Owned by <strong className="text-[#FFC66D]">{selectedRoom.ownerUsername}</strong> ·{' '}
                {selectedRoom.memberUids.length} member
                {selectedRoom.memberUids.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1.5 rounded-xl bg-[#171329] border border-[#3D345F] text-xs font-mono text-[#FFC66D]">
                CODE: <strong>{selectedRoom.inviteCode}</strong>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('code', selectedRoom.inviteCode)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#56E0CB] border border-[#56E0CB]/40 text-xs font-semibold cursor-pointer"
              >
                {copiedTarget === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTarget === 'code' ? 'Copied' : 'Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('link', inviteUrl)}
                data-testid="arcade-copy-invite-link"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] text-xs font-bold cursor-pointer"
              >
                {copiedTarget === 'link' ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                <span>{copiedTarget === 'link' ? 'Link Copied' : 'Invite Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Owner / Manager Settings Form */}
        {isEditingSettings && isManager && (
          <form
            onSubmit={(e) => void handleSaveSettings(e)}
            className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border-2 border-[#FFC66D]/50 space-y-4"
            data-testid="arcade-settings-form"
          >
            <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] uppercase">
              Room Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[#FFF0D7]/75 mb-1">
                  Room Name
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  data-testid="arcade-edit-name-input"
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-[#FFF0D7]/75 mb-1">
                  Room Access
                </label>
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as ArcadeRoomVisibility)}
                  className="w-full px-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
                >
                  <option value="invite-only">Invite Code & Link</option>
                  <option value="private">Private (Members Only)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-[#FFF0D7]/75 mb-1.5">
                Available Games
              </label>
              <div className="flex flex-wrap gap-2">
                {ARCADE_GAME_CATALOG.map((g) => {
                  const checked = editGames.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGameSelection(editGames, setEditGames, g.id)}
                      className={`px-3 py-1.5 rounded-xl border-2 text-xs font-semibold cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#56E0CB]/20 border-[#56E0CB] text-[#56E0CB]'
                          : 'bg-[#171329] border-[#3D345F] text-[#FFF0D7]/65'
                      }`}
                    >
                      {g.title} {!g.playable && '(Soon)'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-[#FFF0D7]/75 mb-1">
                Default Memory Match Cards: <strong className="text-[#56E0CB]">{editCardCount}</strong>
              </label>
              <input
                type="range"
                min={MEMORY_MIN_CARD_COUNT}
                max={MEMORY_MAX_CARD_COUNT}
                step={MEMORY_CARD_COUNT_STEP}
                value={editCardCount}
                onChange={(e) => setEditCardCount(Number(e.target.value))}
                className="w-full accent-[#56E0CB]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isBusy}
                data-testid="arcade-save-settings-btn"
                className="px-4 py-2 rounded-xl bg-[#56E0CB] text-[#171329] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsEditingSettings(false)}
                className="px-4 py-2 rounded-xl bg-[#292342] text-[#FFF0D7]/80 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Active Game Session Banner (Single Active Session Enforcement) */}
        {hasActiveSession && (
          <div
            className="p-4 rounded-2xl bg-[#56E0CB]/12 border-2 border-[#56E0CB] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            data-testid="arcade-active-session-banner"
          >
            <div>
              <div className="flex items-center gap-2 text-[#56E0CB] font-['Press_Start_2P'] text-[10px] uppercase">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Active Game Session Live</span>
              </div>
              <p className="text-xs text-[#FFF0D7]/85 mt-1">
                {selectedRoom.activeSessionGameType === 'memory-match'
                  ? 'Memory Match'
                  : 'Tic-Tac-Toe'}{' '}
                · Session Code <strong className="text-[#FFC66D]">{selectedRoom.activeSessionRoomCode}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleJoinActiveSession}
                data-testid="arcade-join-active-session-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] text-xs font-bold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Enter Session</span>
              </button>
              {isManager && (
                <button
                  type="button"
                  onClick={() => void handleEndActiveSession()}
                  disabled={isBusy}
                  data-testid="arcade-end-active-session-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF776E]/20 hover:bg-[#FF776E]/30 text-[#FF776E] border border-[#FF776E]/45 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>End Session</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Two-Column Main Hub: Game Sessions Launcher + Members */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Level 2: Start a Game Session */}
          <div className="lg:col-span-2 space-y-3">
            <div className="p-4 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#56E0CB] uppercase">
                  Start a Game Session
                </h2>
                <span className="text-[11px] text-[#FFF0D7]/55">
                  Player limits auto-enforced
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ARCADE_GAME_CATALOG.filter((g) =>
                  selectedRoom.availableGames.includes(g.id)
                ).map((game) => (
                  <div
                    key={game.id}
                    className="p-3.5 rounded-xl bg-[#171329] border border-[#3D345F] flex flex-col justify-between gap-3"
                    data-testid={`arcade-game-card-${game.id}`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-['Press_Start_2P'] text-[10px] uppercase"
                          style={{ color: game.accentHex }}
                        >
                          {game.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#201A36] border border-[#3D345F] text-[#FFF0D7]/75">
                          {game.minPlayers === game.maxPlayers
                            ? `${game.maxPlayers}P Auto`
                            : `${game.minPlayers}–${game.maxPlayers}P Auto`}
                        </span>
                      </div>
                      <p className="text-xs text-[#FFF0D7]/70 mt-1.5 leading-relaxed">
                        {game.description}
                      </p>

                      {game.id === 'memory-match' && (
                        <div className="mt-2.5 pt-2.5 border-t border-[#3D345F]/70">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-[#FFF0D7]/75 inline-flex items-center gap-1">
                              <Layers className="w-3 h-3 text-[#56E0CB]" />
                              Board Size
                            </span>
                            <span className="font-bold text-[#56E0CB]">
                              {sessionCardCount} Cards ({sessionCardCount / 2} Pairs)
                            </span>
                          </div>
                          <input
                            type="range"
                            min={MEMORY_MIN_CARD_COUNT}
                            max={MEMORY_MAX_CARD_COUNT}
                            step={MEMORY_CARD_COUNT_STEP}
                            value={sessionCardCount}
                            onChange={(e) => setSessionCardCount(Number(e.target.value))}
                            disabled={hasActiveSession}
                            aria-label="Session Memory Match card count"
                            className="w-full accent-[#56E0CB]"
                          />
                        </div>
                      )}
                    </div>

                    {game.playable ? (
                      <button
                        type="button"
                        disabled={hasActiveSession || isBusy}
                        onClick={() => void handleStartSession(game.id as MultiplayerGameType)}
                        data-testid={`arcade-start-${game.id}`}
                        className="w-full py-2.5 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[9px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{hasActiveSession ? 'Session Active' : 'Start Session'}</span>
                      </button>
                    ) : (
                      <div className="w-full py-2 rounded-xl bg-[#292342]/70 text-[#FFC66D]/80 text-[10px] font-bold text-center border border-[#3D345F]">
                        Coming Soon
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Session History */}
            <div className="p-4 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-2.5">
              <h3 className="font-['Press_Start_2P'] text-[10px] text-[#FFC66D] uppercase flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Recent Game Sessions</span>
              </h3>
              {sessions.length === 0 ? (
                <p className="text-xs text-[#FFF0D7]/55 italic">
                  No sessions played in this arcade room yet. Pick a game above to start one!
                </p>
              ) : (
                <div className="space-y-1.5">
                  {sessions.slice(0, 8).map((s) => (
                    <div
                      key={s.sessionId}
                      className="px-3 py-2 rounded-xl bg-[#171329] border border-[#3D345F] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Gamepad2 className="w-3.5 h-3.5 text-[#56E0CB]" />
                        <span className="font-semibold text-[#FFF0D7]">
                          {s.gameType === 'memory-match' ? 'Memory Match' : 'Tic-Tac-Toe'}
                        </span>
                        {s.cardCount && (
                          <span className="text-[10px] text-[#56E0CB]">
                            ({s.cardCount} cards)
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-[#FFF0D7]/50">
                          #{s.roomCode}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          s.status === 'completed'
                            ? 'bg-[#56E0CB]/15 text-[#56E0CB]'
                            : s.status === 'cancelled'
                            ? 'bg-[#FF776E]/15 text-[#FF776E]'
                            : 'bg-[#FFC66D]/15 text-[#FFC66D]'
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Room Members Panel */}
          <div className="p-4 rounded-2xl bg-[#201A36] border border-[#3D345F] space-y-3 h-fit">
            <h2 className="font-['Press_Start_2P'] text-[10px] text-[#FFC66D] uppercase flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>Members ({members.length || selectedRoom.memberUids.length})</span>
            </h2>

            <div className="space-y-2">
              {members.map((m) => {
                const country = m.countryCode ? getCountryByCode(m.countryCode) : null;
                const canManageMember =
                  m.uid !== selectedRoom.ownerUid &&
                  (isOwner || (isManager && m.role === 'member'));

                return (
                  <div
                    key={m.uid}
                    className="p-2.5 rounded-xl bg-[#171329] border border-[#3D345F] flex items-center justify-between gap-2"
                    data-testid={`arcade-member-${m.uid}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {country && <span aria-hidden="true">{country.flag}</span>}
                        <span className="text-xs font-bold text-[#FFF0D7] truncate">
                          {m.username}
                        </span>
                        {m.uid === uid && (
                          <span className="text-[9px] px-1 rounded bg-[#56E0CB]/20 text-[#56E0CB] font-bold">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] mt-0.5">
                        {m.role === 'owner' ? (
                          <span className="inline-flex items-center gap-0.5 text-[#FFC66D] font-semibold">
                            <Crown className="w-3 h-3" /> Owner
                          </span>
                        ) : m.role === 'manager' ? (
                          <span className="inline-flex items-center gap-0.5 text-[#56E0CB] font-semibold">
                            <Shield className="w-3 h-3" /> Manager
                          </span>
                        ) : (
                          <span className="text-[#FFF0D7]/55">Member</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isOwner && m.uid !== selectedRoom.ownerUid && (
                        <button
                          type="button"
                          onClick={() =>
                            void setArcadeMemberRole(
                              selectedRoom.id,
                              m.uid,
                              m.role === 'manager' ? 'member' : 'manager'
                            )
                          }
                          title={
                            m.role === 'manager' ? 'Demote to Member' : 'Promote to Manager'
                          }
                          className="p-1.5 rounded-lg bg-[#292342] hover:bg-[#322B50] text-[#56E0CB] cursor-pointer"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(canManageMember || (m.uid === uid && !isOwner)) && (
                        <button
                          type="button"
                          onClick={() => void removeArcadeRoomMember(selectedRoom.id, m.uid)}
                          title={m.uid === uid ? 'Leave room' : `Remove ${m.username}`}
                          data-testid={`remove-member-${m.uid}`}
                          className="p-1.5 rounded-lg bg-[#292342] hover:bg-[#FF776E]/25 text-[#FF776E] cursor-pointer"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: PERSISTENT ARCADE ROOMS DIRECTORY
  // ============================================================================
  return (
    <div
      className="py-4 sm:py-6 px-3 sm:px-6 md:px-8 max-w-5xl mx-auto space-y-5"
      data-testid="arcade-rooms-directory"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            playClick();
            onBackToHome();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#292342] hover:bg-[#322B50] text-[#FFF0D7] hover:text-[#56E0CB] border border-[#3D345F] text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>

        {isSignedInAccount && (
          <button
            type="button"
            onClick={() => {
              playClick();
              setShowCreateForm((prev) => !prev);
              setErrorMsg(null);
            }}
            data-testid="arcade-open-create-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[9px] sm:text-[10px] uppercase cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Room</span>
          </button>
        )}
      </div>

      <div className="text-center space-y-1.5">
        <h1 className="font-['Press_Start_2P'] text-base sm:text-xl text-[#FFF0D7]">
          ARCADE ROOMS
        </h1>
        <p className="text-xs sm:text-sm text-[#FFF0D7]/75 max-w-xl mx-auto">
          Create your own permanent retro gaming space, invite friends once, and launch Memory
          Match or Tic-Tac-Toe sessions whenever you return.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          data-testid="arcade-directory-error"
          className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {infoMsg && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[#56E0CB]/15 border border-[#56E0CB] text-xs text-[#56E0CB]"
        >
          {infoMsg}
        </div>
      )}

      {/* Guest / Unauthenticated Notice + Temporary Rooms Path */}
      {!isSignedInAccount && (
        <div
          className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border-2 border-[#FFC66D]/55 space-y-3"
          data-testid="arcade-guest-notice"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] uppercase">
                Sign In to Own Persistent Arcade Rooms
              </h2>
              <p className="text-xs text-[#FFF0D7]/80 mt-1.5 leading-relaxed">
                Registered players can create named arcade rooms that stay saved across visits.
                Guest players can still join by invite code or launch temporary multiplayer rooms
                below!
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                playClick();
                onOpenAuth();
              }}
              data-testid="arcade-guest-signin-btn"
              className="shrink-0 px-4 py-2.5 rounded-xl bg-[#FFC66D] hover:bg-[#ffd285] text-[#171329] font-['Press_Start_2P'] text-[9px] sm:text-[10px] uppercase cursor-pointer"
            >
              Sign In / Register
            </button>
          </div>

          <div className="pt-3 border-t border-[#3D345F] flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#FFF0D7]/65 mr-1">Play Guest Temporary Room:</span>
            <button
              type="button"
              onClick={() => onPlayTemporaryGame('memory-match')}
              className="px-3 py-1.5 rounded-lg bg-[#171329] hover:bg-[#292342] border border-[#56E0CB]/50 text-[#56E0CB] text-xs font-semibold cursor-pointer"
            >
              Memory Match (Temp)
            </button>
            <button
              type="button"
              onClick={() => onPlayTemporaryGame('tic-tac-toe')}
              className="px-3 py-1.5 rounded-lg bg-[#171329] hover:bg-[#292342] border border-[#FF776E]/50 text-[#FF776E] text-xs font-semibold cursor-pointer"
            >
              Tic-Tac-Toe (Temp)
            </button>
          </div>
        </div>
      )}

      {/* Create Persistent Arcade Room Form (Registered Users Only) */}
      {isSignedInAccount && showCreateForm && (
        <form
          onSubmit={(e) => void handleCreateRoom(e)}
          className="p-4 sm:p-5 rounded-2xl bg-[#201A36] border-2 border-[#56E0CB]/60 space-y-4"
          data-testid="arcade-create-form"
        >
          <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#56E0CB] uppercase">
            New Persistent Arcade Room
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#FFF0D7]/75 mb-1">
                Room Name *
              </label>
              <input
                type="text"
                maxLength={40}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Friday Night Arcade"
                data-testid="arcade-create-name-input"
                className="w-full px-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-[#FFF0D7]/75 mb-1">
                Access Setting
              </label>
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value as ArcadeRoomVisibility)}
                className="w-full px-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
              >
                <option value="invite-only">Invite Code & Link</option>
                <option value="private">Private (Members Only)</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-[#FFF0D7]/70">
            Your Virtual Arcade Room is a permanent space for friends. Choose a game and configure game settings after opening the room.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isBusy}
              data-testid="arcade-create-submit"
              className="px-4 py-2.5 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[10px] uppercase cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Arcade Room</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2.5 rounded-xl bg-[#292342] text-[#FFF0D7]/80 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Join a Persistent Arcade Room by Invite Code */}
      <form
        onSubmit={(e) => void handleJoinByCode(e)}
        className="p-3.5 sm:p-4 rounded-2xl bg-[#201A36] border border-[#3D345F] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        data-testid="arcade-join-form"
      >
        <input
          type="text"
          maxLength={6}
          value={joinCode}
          onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
          placeholder="Enter 6-character Arcade Room invite code..."
          aria-label="Arcade room invite code"
          data-testid="arcade-join-code-input"
          className="flex-1 px-3.5 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#FFC66D] text-xs sm:text-sm font-mono uppercase tracking-widest text-[#FFF0D7] outline-none"
        />
        <button
          type="submit"
          disabled={isBusy || joinCode.length < 6}
          data-testid="arcade-join-submit"
          className="px-4 py-2 rounded-xl bg-[#FF776E] hover:bg-[#ff8d85] text-[#171329] font-['Press_Start_2P'] text-[10px] uppercase cursor-pointer disabled:opacity-45 shrink-0"
        >
          Join Room
        </button>
      </form>

      {/* Owned & Joined Persistent Rooms Grid */}
      {isSignedInAccount && (
        <div className="space-y-3">
          <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFC66D] uppercase">
            Your Persistent Rooms ({rooms.length})
          </h2>

          {rooms.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#201A36] border border-dashed border-[#3D345F] text-center space-y-2">
              <DoorOpen className="w-8 h-8 text-[#56E0CB]/60 mx-auto" />
              <p className="text-sm font-semibold text-[#FFF0D7]">No persistent rooms yet</p>
              <p className="text-xs text-[#FFF0D7]/65 max-w-md mx-auto">
                Create your first arcade room (like &ldquo;Friday Night Arcade&rdquo;) to invite
                friends and launch matches anytime.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rooms.map((r) => {
                const owner = r.ownerUid === uid;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setSelectedRoomId(r.id);
                    }}
                    data-testid={`arcade-room-card-${r.id}`}
                    className="text-left p-4 rounded-2xl bg-[#201A36] hover:bg-[#292342] border-2 border-[#3D345F] hover:border-[#56E0CB] transition-all cursor-pointer flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-['Press_Start_2P'] text-[10px] text-[#FFF0D7] truncate">
                          {r.name}
                        </span>
                        {owner && <Crown className="w-3.5 h-3.5 text-[#FFC66D] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-[#FFF0D7]/60 font-mono">
                        Code: {r.inviteCode} · {r.memberUids.length} member
                        {r.memberUids.length === 1 ? '' : 's'}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.availableGames.map((gid) => (
                          <span
                            key={gid}
                            className="px-2 py-0.5 rounded bg-[#171329] border border-[#3D345F] text-[10px] text-[#56E0CB]"
                          >
                            {gid === 'memory-match'
                              ? 'Memory Match'
                              : gid === 'tic-tac-toe'
                              ? 'Tic-Tac-Toe'
                              : 'Snake'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#3D345F]/70 flex items-center justify-between text-[11px]">
                      <span
                        className={
                          r.activeSessionId
                            ? 'text-[#56E0CB] font-bold'
                            : 'text-[#FFF0D7]/55'
                        }
                      >
                        {r.activeSessionId ? '● Session Active' : 'Ready to play'}
                      </span>
                      <span className="text-[#FFC66D] font-bold">Open →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

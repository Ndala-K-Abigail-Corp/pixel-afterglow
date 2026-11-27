/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, Lock, Users, Layers, MonitorSmartphone, X, Minus, Plus } from 'lucide-react';
import {
  MemoryRoomSettings,
  MEMORY_MIN_CARD_COUNT,
  MEMORY_MAX_CARD_COUNT,
  MEMORY_CARD_COUNT_STEP,
  MEMORY_MIN_PLAYER_LIMIT,
  MEMORY_MAX_PLAYER_LIMIT,
  getMemoryPairCount,
  isLargeMemoryBoard,
  isLargeBoardNoticeAcknowledged,
  acknowledgeLargeBoardNotice,
} from '../../types/multiplayer';

export interface LargeBoardNoticeProps {
  cardCount: number;
  className?: string;
}

/**
 * Friendly, dismissible retro-arcade notification shown when a board has 60+ cards.
 * Never blocks mobile users from playing, and remembers acknowledgement for the session.
 */
export const LargeBoardNotice: React.FC<LargeBoardNoticeProps> = ({
  cardCount,
  className = '',
}) => {
  const [acknowledged, setAcknowledged] = useState<boolean>(() =>
    isLargeBoardNoticeAcknowledged()
  );

  if (!isLargeMemoryBoard(cardCount) || acknowledged) {
    return null;
  }

  const handleDismiss = () => {
    acknowledgeLargeBoardNotice();
    setAcknowledged(true);
  };

  return (
    <div
      role="status"
      data-testid="large-board-notice"
      className={`rounded-xl bg-[#FFC66D]/12 border-2 border-[#FFC66D]/60 p-3 sm:p-3.5 text-left shadow-[0_0_16px_rgba(255,198,109,0.14)] ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#FFC66D]/20 border border-[#FFC66D]/40 text-[#FFC66D] shrink-0 mt-0.5">
            <MonitorSmartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-['Press_Start_2P'] text-[9px] sm:text-[10px] text-[#FFC66D] uppercase tracking-wider mb-1">
              Large game board
            </p>
            <p className="text-xs text-[#FFF0D7]/90 leading-relaxed">
              This game has a large number of cards. For the best playing experience, we recommend
              using a desktop or tablet.
            </p>
            <p className="text-xs text-[#FFF0D7]/75 leading-relaxed mt-1">
              You can still play on your mobile device. The board will be optimized for smaller
              screens and can be navigated through vertical scrolling.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Acknowledge large game board notice"
          data-testid="dismiss-large-board-notice"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#171329] hover:bg-[#292342] border border-[#FFC66D]/40 text-[#FFC66D] text-[10px] font-bold shrink-0 cursor-pointer transition-colors"
        >
          <span>Got it</span>
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

function getBoardSizeTier(cardCount: number): {
  label: string;
  color: string;
} {
  if (cardCount <= 24) return { label: 'Compact', color: '#56E0CB' };
  if (cardCount <= 48) return { label: 'Standard', color: '#3B82F6' };
  if (cardCount < 80) return { label: 'Large', color: '#FFC66D' };
  return { label: 'Mega', color: '#FF776E' };
}

const CARD_COUNT_PRESETS = [10, 20, 40, 60, 100] as const;
const PLAYER_LIMIT_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export interface MemoryRoomSettingsPanelProps {
  settings: MemoryRoomSettings;
  canEdit: boolean;
  lockedReason?: string;
  heading?: string;
  joinedPlayerCount?: number;
  isSaving?: boolean;
  onChange?: (nextSettings: MemoryRoomSettings) => void;
  showLargeBoardNotice?: boolean;
  showPlayerLimits?: boolean;
  compact?: boolean;
}

/**
 * Flexible host-controlled room configuration for Multiplayer Memory Match.
 * Focuses on board card count (10–100, step 2). Game-specific player limits (2–8)
 * are enforced automatically without requiring manual host configuration.
 */
export const MemoryRoomSettingsPanel: React.FC<MemoryRoomSettingsPanelProps> = ({
  settings,
  canEdit,
  lockedReason,
  heading = 'Match Settings',
  joinedPlayerCount = 0,
  isSaving = false,
  onChange,
  showLargeBoardNotice = true,
  showPlayerLimits = false,
  compact = false,
}) => {
  const pairCount = getMemoryPairCount(settings.cardCount);
  const sizeTier = getBoardSizeTier(settings.cardCount);
  const sizePercent = Math.round(
    ((settings.cardCount - MEMORY_MIN_CARD_COUNT) /
      (MEMORY_MAX_CARD_COUNT - MEMORY_MIN_CARD_COUNT)) *
      100
  );
  const minAllowedMaxPlayers = Math.max(MEMORY_MIN_PLAYER_LIMIT, joinedPlayerCount);

  const emitChange = (next: MemoryRoomSettings) => {
    if (!canEdit || !onChange) return;
    // Always enforce even card count 10..100 and minPlayers <= maxPlayers
    const clampedCards = Math.max(
      MEMORY_MIN_CARD_COUNT,
      Math.min(
        MEMORY_MAX_CARD_COUNT,
        Math.round(next.cardCount / MEMORY_CARD_COUNT_STEP) * MEMORY_CARD_COUNT_STEP
      )
    );
    const clampedMax = Math.max(
      minAllowedMaxPlayers,
      Math.min(MEMORY_MAX_PLAYER_LIMIT, Math.round(next.maxPlayers))
    );
    const clampedMin = Math.max(
      MEMORY_MIN_PLAYER_LIMIT,
      Math.min(clampedMax, Math.round(next.minPlayers))
    );
    onChange({
      cardCount: clampedCards,
      minPlayers: clampedMin,
      maxPlayers: clampedMax,
    });
  };

  const handleCardCountChange = (rawValue: number) => {
    emitChange({ ...settings, cardCount: rawValue });
  };

  const handleMinPlayersChange = (nextMin: number) => {
    const nextMax = Math.max(settings.maxPlayers, nextMin);
    emitChange({
      ...settings,
      minPlayers: nextMin,
      maxPlayers: nextMax,
    });
  };

  const handleMaxPlayersChange = (nextMax: number) => {
    const safeMax = Math.max(minAllowedMaxPlayers, nextMax);
    const nextMin = Math.min(settings.minPlayers, safeMax);
    emitChange({
      ...settings,
      minPlayers: nextMin,
      maxPlayers: safeMax,
    });
  };

  return (
    <div
      className={`rounded-xl bg-[#171329]/85 border border-[#3D345F] ${
        compact ? 'p-3' : 'p-3.5 sm:p-4'
      }`}
      data-testid="memory-room-settings-panel"
      data-editable={canEdit ? 'true' : 'false'}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          {canEdit ? (
            <Sliders className="w-3.5 h-3.5 text-[#FFC66D]" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-[#56E0CB]" />
          )}
          <span className="font-['Press_Start_2P'] text-[9px] sm:text-[10px] text-[#FFC66D] uppercase tracking-wider">
            {heading}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isSaving && (
            <span className="text-[10px] font-semibold text-[#56E0CB] animate-pulse">
              Saving...
            </span>
          )}
          {!canEdit && (
            <span
              className="px-2 py-0.5 rounded-full bg-[#292342] border border-[#3D345F] text-[10px] font-semibold text-[#FFF0D7]/70"
              data-testid="settings-readonly-badge"
            >
              {lockedReason || 'Host Controlled'}
            </span>
          )}
        </div>
      </div>

      {/* Card Count & Board Size Section */}
      <div className="space-y-2.5 mb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FFF0D7]/85">
            <Layers className="w-3.5 h-3.5 text-[#56E0CB]" />
            <span>Board Size</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#56E0CB]"
              data-testid="settings-card-count-display"
            >
              {settings.cardCount} Cards
            </span>
            <span
              className="text-xs font-semibold text-[#FFF0D7]/75"
              data-testid="settings-pair-count-display"
            >
              ({pairCount} {pairCount === 1 ? 'Pair' : 'Pairs'})
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border"
              style={{
                color: sizeTier.color,
                borderColor: `${sizeTier.color}66`,
                backgroundColor: `${sizeTier.color}1A`,
              }}
              data-testid="settings-board-size-tier"
            >
              {sizeTier.label}
            </span>
          </div>
        </div>

        {/* Visual Board-Size Scale Indicator */}
        <div
          className="h-2 w-full rounded-full bg-[#292342] overflow-hidden border border-[#3D345F]/70"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${Math.max(8, sizePercent)}%`,
              backgroundColor: sizeTier.color,
            }}
          />
        </div>

        {canEdit && (
          <>
            {/* Slider + +/-2 Steppers */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCardCountChange(settings.cardCount - MEMORY_CARD_COUNT_STEP)}
                disabled={settings.cardCount <= MEMORY_MIN_CARD_COUNT || isSaving}
                aria-label="Decrease card count by 2"
                data-testid="settings-cards-dec"
                className="p-1.5 rounded-lg bg-[#292342] hover:bg-[#332B54] border border-[#3D345F] text-[#FFF0D7] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={MEMORY_MIN_CARD_COUNT}
                max={MEMORY_MAX_CARD_COUNT}
                step={MEMORY_CARD_COUNT_STEP}
                value={settings.cardCount}
                onChange={(e) => handleCardCountChange(Number(e.target.value))}
                disabled={isSaving}
                aria-label="Select total number of cards"
                data-testid="settings-card-count-slider"
                className="flex-1 accent-[#56E0CB] cursor-pointer h-2"
              />

              <button
                type="button"
                onClick={() => handleCardCountChange(settings.cardCount + MEMORY_CARD_COUNT_STEP)}
                disabled={settings.cardCount >= MEMORY_MAX_CARD_COUNT || isSaving}
                aria-label="Increase card count by 2"
                data-testid="settings-cards-inc"
                className="p-1.5 rounded-lg bg-[#292342] hover:bg-[#332B54] border border-[#3D345F] text-[#FFF0D7] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Even Presets */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[10px] text-[#FFF0D7]/55">
                Even counts only (10–100, step 2)
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {CARD_COUNT_PRESETS.map((preset) => {
                  const isActive = settings.cardCount === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleCardCountChange(preset)}
                      disabled={isSaving}
                      data-testid={`settings-card-preset-${preset}`}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#56E0CB] text-[#171329] border-[#56E0CB]'
                          : 'bg-[#292342] text-[#FFF0D7]/80 border-[#3D345F] hover:border-[#56E0CB]/60'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Player Limits Section: automatically enforced by game (2–8P); selectors hidden by default */}
      <div className="pt-3 border-t border-[#FFF0D7]/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FFF0D7]/85">
            <Users className="w-3.5 h-3.5 text-[#FFC66D]" />
            <span>Supported Players</span>
          </div>
          <span
            className="text-xs font-semibold text-[#FFC66D]"
            data-testid="settings-player-limits-display"
          >
            {settings.minPlayers}–{settings.maxPlayers} Players (Auto)
          </span>
        </div>

        {showPlayerLimits && canEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
            <div>
              <label
                htmlFor="mp-settings-min-players"
                className="block text-[10px] uppercase tracking-wider text-[#FFF0D7]/65 font-semibold mb-1"
              >
                Minimum Players to Start
              </label>
              <select
                id="mp-settings-min-players"
                value={settings.minPlayers}
                onChange={(e) => handleMinPlayersChange(Number(e.target.value))}
                disabled={isSaving}
                data-testid="settings-min-players-select"
                className="w-full px-3 py-2 rounded-lg bg-[#292342] border border-[#3D345F] focus:border-[#FFC66D] text-[#FFF0D7] text-xs font-semibold outline-none cursor-pointer"
              >
                {PLAYER_LIMIT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} Players
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="mp-settings-max-players"
                className="block text-[10px] uppercase tracking-wider text-[#FFF0D7]/65 font-semibold mb-1"
              >
                Maximum Room Capacity
              </label>
              <select
                id="mp-settings-max-players"
                value={settings.maxPlayers}
                onChange={(e) => handleMaxPlayersChange(Number(e.target.value))}
                disabled={isSaving}
                data-testid="settings-max-players-select"
                className="w-full px-3 py-2 rounded-lg bg-[#292342] border border-[#3D345F] focus:border-[#FFC66D] text-[#FFF0D7] text-xs font-semibold outline-none cursor-pointer"
              >
                {PLAYER_LIMIT_OPTIONS.map((count) => (
                  <option
                    key={count}
                    value={count}
                    disabled={count < minAllowedMaxPlayers}
                  >
                    {count} Players
                    {count < minAllowedMaxPlayers ? ' (joined exceeds)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Large-Board Notification (60+ cards) */}
      {showLargeBoardNotice && isLargeMemoryBoard(settings.cardCount) && (
        <LargeBoardNotice cardCount={settings.cardCount} className="mt-3" />
      )}
    </div>
  );
};

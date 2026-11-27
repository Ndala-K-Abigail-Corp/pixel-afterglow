/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, Globe } from 'lucide-react';
import {
  ALL_COUNTRIES,
  getCountryByCode,
  searchCountries,
} from '../../data/countries';

export interface CountrySelectorProps {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

interface DropdownCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
}

/**
 * Custom Pixel Afterglow searchable ISO 3166-1 alpha-2 country selector.
 * - Displays flag + country name + ISO code (e.g. 🇿🇲 Zambia · ZM).
 * - Renders via a viewport-aware portal so parent modals/scroll containers never clip it.
 * - Full keyboard navigation (ArrowDown/ArrowUp/Home/End/Enter/Escape).
 */
export const CountrySelector: React.FC<CountrySelectorProps> = ({
  value,
  onChange,
  disabled = false,
  required = true,
  id = 'profile-country-selector',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [coords, setCoords] = useState<DropdownCoords | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => getCountryByCode(value), [value]);
  const filtered = useMemo(() => searchCountries(query), [query]);

  const computeCoords = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setCoords(null);
      return;
    }

    const viewportH = window.innerHeight || 700;
    const spaceBelow = viewportH - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 230 && spaceAbove > spaceBelow;
    const available = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(160, Math.min(270, available));

    setCoords({
      top: openUpward ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, (window.innerWidth || 1024) - rect.width - 8)),
      width: rect.width,
      maxHeight,
      openUpward,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      computeCoords();
      const selectedIdx = selected
        ? filtered.findIndex((c) => c.code === selected.code)
        : 0;
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
      const timer = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
    setQuery('');
    return undefined;
  }, [isOpen, computeCoords, selected, filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleReposition = () => computeCoords();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, computeCoords]);

  const handleSelectCountry = useCallback(
    (code: string) => {
      onChange(code);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : (prev + 1) % filtered.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length
      );
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      handleSelectCountry(filtered[activeIndex].code);
    }
  };

  const listboxId = `${id}-listbox`;
  const activeOptionId = filtered[activeIndex]
    ? `${id}-option-${filtered[activeIndex].code}`
    : undefined;

  const dropdownContent = isOpen ? (
    <div
      ref={dropdownRef}
      style={
        coords
          ? {
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
            }
          : undefined
      }
      onKeyDown={handleKeyDown}
      className={`${
        coords ? 'z-[70]' : 'absolute left-0 right-0 mt-1.5 z-[70]'
      } bg-[#171329] border-2 border-[#56E0CB]/75 rounded-xl shadow-[0_14px_38px_rgba(9,6,22,0.92)] flex flex-col overflow-hidden`}
      data-testid="country-selector-dropdown"
    >
      <div className="p-2 border-b border-[#3D345F] flex items-center gap-2 bg-[#201A36] shrink-0">
        <Search className="w-3.5 h-3.5 text-[#56E0CB] shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ALL_COUNTRIES.length} countries...`}
          aria-label="Search countries"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          data-testid="country-search-input"
          className="w-full bg-transparent text-xs text-[#FFF0D7] placeholder:text-[#FFF0D7]/45 outline-none"
        />
      </div>

      <ul
        id={listboxId}
        role="listbox"
        aria-label="Countries"
        className="flex-1 overflow-y-auto arcade-scrollbar py-1 max-h-56"
        data-testid="country-options-list"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-[#FFF0D7]/55 text-center">
            No matching countries found.
          </li>
        ) : (
          filtered.map((country, idx) => {
            const isSelected = selected?.code === country.code;
            const isFocused = idx === activeIndex;
            return (
              <li
                key={country.code}
                id={`${id}-option-${country.code}`}
                role="option"
                aria-selected={isSelected}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelectCountry(country.code)}
                  data-testid={`country-option-${country.code}`}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#56E0CB]/20 text-[#56E0CB] font-bold'
                      : isFocused
                      ? 'bg-[#292342] text-[#FFF0D7]'
                      : 'text-[#FFF0D7]/90 hover:bg-[#292342]'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base leading-none shrink-0" aria-hidden="true">
                      {country.flag}
                    </span>
                    <span className="truncate">{country.name}</span>
                    <span className="text-[10px] font-mono text-[#56E0CB]/80 shrink-0">
                      {country.code}
                    </span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#56E0CB] shrink-0" />}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative" data-testid="country-selector">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-required={required}
        data-testid="country-selector-trigger"
        className={`w-full px-3 py-2 rounded-xl bg-[#171329] border-2 text-left flex items-center justify-between gap-2 text-xs sm:text-sm text-[#FFF0D7] transition-all cursor-pointer disabled:opacity-50 outline-none ${
          isOpen
            ? 'border-[#56E0CB] shadow-[0_0_0_3px_rgba(86,224,203,0.16)]'
            : 'border-[#3D345F] hover:border-[#56E0CB]/60 focus:border-[#56E0CB]'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {selected ? (
            <>
              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {selected.flag}
              </span>
              <span className="font-semibold truncate">{selected.name}</span>
              <span className="text-[10px] font-mono text-[#56E0CB] shrink-0">
                {selected.code}
              </span>
            </>
          ) : (
            <>
              <Globe className="w-4 h-4 text-[#56E0CB]/60 shrink-0" />
              <span className="text-[#FFF0D7]/55">Select your country...</span>
            </>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#56E0CB]/80 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {dropdownContent &&
        (coords && typeof document !== 'undefined'
          ? createPortal(dropdownContent, document.body)
          : dropdownContent)}
    </div>
  );
};

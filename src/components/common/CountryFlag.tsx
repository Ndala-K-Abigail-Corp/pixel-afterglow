/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { getCountryByCode } from '../../data/countries';

export interface CountryFlagProps {
  code?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * Renders a real visual country flag image (ISO 3166-1 alpha-2) across all operating systems,
 * including Windows browsers where Unicode flag emojis render as plain 2-letter text.
 * Falls back gracefully to the flag emoji/code badge if offline.
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  code,
  name,
  size = 'sm',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const normalized = code?.trim().toUpperCase() ?? '';
  const isValidIso = /^[A-Z]{2}$/.test(normalized);

  const dims =
    size === 'xs'
      ? 'w-4 h-3'
      : size === 'md'
        ? 'w-6 h-[18px]'
        : 'w-5 h-[15px]';

  if (!isValidIso) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center ${dims} rounded-[3px] bg-[#292342] border border-[#3D345F] text-[9px] leading-none shrink-0 ${className}`}
      >
        🌍
      </span>
    );
  }

  if (imgFailed) {
    return (
      <span
        aria-hidden="true"
        title={name ?? normalized}
        className={`inline-flex items-center justify-center ${dims} rounded-[3px] bg-[#292342] border border-[#3D345F] text-[10px] font-mono leading-none shrink-0 ${className}`}
      >
        {getCountryByCode(normalized)?.flag ?? normalized}
      </span>
    );
  }

  const lower = normalized.toLowerCase();

  return (
    <img
      src={`https://flagcdn.com/w40/${lower}.png`}
      srcSet={`https://flagcdn.com/w80/${lower}.png 2x`}
      alt={name ? `${name} flag` : `${normalized} flag`}
      loading="lazy"
      decoding="async"
      onError={() => setImgFailed(true)}
      className={`inline-block ${dims} object-cover rounded-[3px] border border-white/15 shrink-0 ${className}`}
    />
  );
};

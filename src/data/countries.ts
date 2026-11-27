/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CountryOption {
  code: string; // ISO 3166-1 alpha-2 (e.g. "ZM")
  name: string; // Official English country/territory name (e.g. "Zambia")
  flag: string; // Regional indicator flag emoji (e.g. "🇿🇲")
}

/**
 * Complete ISO 3166-1 alpha-2 officially assigned country & territory codes (249 entries).
 * Uses `Intl.DisplayNames` for accurate localized English names without bloating bundle size.
 */
export const ISO_3166_ALPHA2_CODES: ReadonlyArray<string> = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ',
  'VA','VC','VE','VG','VI','VN','VU',
  'WF','WS',
  'YE','YT',
  'ZA','ZM','ZW',
] as const;

export const ISO_COUNTRY_CODE_SET: ReadonlySet<string> = new Set(ISO_3166_ALPHA2_CODES);

/**
 * Converts an ISO 3166-1 alpha-2 code (e.g. "ZM") into its Unicode flag emoji ("🇿🇲").
 */
export function countryCodeToFlag(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🏳️';
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65
  );
}

const FALLBACK_NAMES: Record<string, string> = {
  ZM: 'Zambia',
  ZA: 'South Africa',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  JP: 'Japan',
  DE: 'Germany',
  FR: 'France',
  BR: 'Brazil',
  IN: 'India',
  NG: 'Nigeria',
  KE: 'Kenya',
  GH: 'Ghana',
  ZW: 'Zimbabwe',
  BW: 'Botswana',
  NA: 'Namibia',
  MW: 'Malawi',
  TZ: 'Tanzania',
};

function resolveCountryName(code: string, displayNames: Intl.DisplayNames | null): string {
  if (displayNames) {
    try {
      const resolved = displayNames.of(code);
      if (resolved && resolved !== code) {
        return resolved;
      }
    } catch {
      // fall through
    }
  }
  return FALLBACK_NAMES[code] ?? code;
}

const regionDisplayNames: Intl.DisplayNames | null = (() => {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      return new Intl.DisplayNames(['en'], { type: 'region' });
    }
  } catch {
    // ignore in minimal environments
  }
  return null;
})();

export const ALL_COUNTRIES: ReadonlyArray<CountryOption> = ISO_3166_ALPHA2_CODES.map((code) => ({
  code,
  name: resolveCountryName(code, regionDisplayNames),
  flag: countryCodeToFlag(code),
})).sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_BY_CODE = new Map<string, CountryOption>(
  ALL_COUNTRIES.map((c) => [c.code, c])
);

export function isValidCountryCode(code: unknown): code is string {
  return typeof code === 'string' && ISO_COUNTRY_CODE_SET.has(code.trim().toUpperCase());
}

export function getCountryByCode(code: string | null | undefined): CountryOption | null {
  if (!code) return null;
  return COUNTRY_BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

export function searchCountries(query: string): CountryOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...ALL_COUNTRIES];
  return ALL_COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  );
}

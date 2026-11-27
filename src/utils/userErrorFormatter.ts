/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZodError } from 'zod';

/**
 * Centralised, player-friendly error formatter.
 * Never exposes raw Zod JSON arrays, stack traces, or internal Firebase codes in the UI,
 * while preserving developer diagnostics in console.warn during non-test execution.
 */
export function formatUserError(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.'
): string {
  if (!error) return fallbackMessage;

  // 1. Direct ZodError instance
  if (error instanceof ZodError) {
    const first = error.issues[0];
    if (first?.message) {
      return mapTechnicalMessage(first.message);
    }
    return fallbackMessage;
  }

  // 2. Error-like object with Firebase code or message
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';

  if (rawCode === 'permission-denied') {
    return 'You do not have permission to perform this action. Please sign in with an authorised account and try again.';
  }
  if (rawCode === 'unavailable' || rawCode === 'network-request-failed') {
    return 'Network connection interrupted. Please check your connection and try again.';
  }
  if (rawCode === 'deadline-exceeded') {
    return 'The request timed out. Please try again.';
  }
  if (rawCode === 'not-found') {
    return 'The requested room or session could not be found.';
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  if (!rawMessage) return fallbackMessage;

  // 3. Serialised Zod JSON array string (e.g. `[{"code":"too_small",...}]`)
  const trimmed = rawMessage.trim();
  if (trimmed.startsWith('[{') && trimmed.endsWith('}]')) {
    try {
      const parsed = JSON.parse(trimmed) as Array<{ message?: string }>;
      if (Array.isArray(parsed) && parsed[0]?.message) {
        return mapTechnicalMessage(parsed[0].message);
      }
    } catch {
      // Fall through to generic mapping
    }
    return fallbackMessage;
  }

  // 4. Never leak raw Firebase prefixes or technical JSON
  if (rawMessage.includes('FirebaseError:') || rawMessage.includes('Missing or insufficient permissions')) {
    return 'You do not have permission to perform this action. Please sign in and try again.';
  }

  return mapTechnicalMessage(rawMessage);
}

function mapTechnicalMessage(message: string): string {
  if (/invalid option: expected one of/i.test(message)) {
    return 'This game option is not supported. Please choose an available game.';
  }
  if (/expected string, received undefined/i.test(message)) {
    return 'Please fill in all required fields.';
  }
  return message;
}

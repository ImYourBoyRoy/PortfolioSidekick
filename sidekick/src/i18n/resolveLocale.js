// ./sidekick/src/i18n/resolveLocale.js
/**
 * Resolve active UI locale: saved preference → device language → en-US.
 */
import { toBcp47Tag } from './bcp47.js';
import {
  FALLBACK_LOCALE,
  LOCALE_ALIASES,
  SUPPORTED_LOCALE_CODES,
  SYSTEM_LOCALE_PREFERENCE,
} from './locales.js';

/**
 * @param {string | null | undefined} tag
 * @returns {string | null}
 */
export function normalizeLocaleTag(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const cleaned = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!cleaned) return null;

  if (LOCALE_ALIASES[cleaned]) return LOCALE_ALIASES[cleaned];

  const canonical = toBcp47Tag(cleaned);
  if (SUPPORTED_LOCALE_CODES.has(canonical)) return canonical;

  const base = cleaned.split('-')[0];
  if (LOCALE_ALIASES[base]) return LOCALE_ALIASES[base];
  if (SUPPORTED_LOCALE_CODES.has(base)) return base;

  return null;
}

/**
 * @returns {string[]}
 */
export function getDeviceLocaleCandidates() {
  const tags = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) tags.push(...navigator.languages);
    if (navigator.language) tags.push(navigator.language);
  }
  return tags;
}

/**
 * @returns {string}
 */
export function detectDeviceLocale() {
  for (const tag of getDeviceLocaleCandidates()) {
    const normalized = normalizeLocaleTag(tag);
    if (normalized) return normalized;
  }
  return FALLBACK_LOCALE;
}

/**
 * @param {{ preference?: string | null, deviceTags?: string[] }} [options]
 * @returns {string}
 */
export function resolveAppLocale(options = {}) {
  const { preference, deviceTags } = options;
  if (preference && preference !== SYSTEM_LOCALE_PREFERENCE) {
    const saved = normalizeLocaleTag(preference);
    if (saved) return saved;
  }

  const tags = deviceTags ?? getDeviceLocaleCandidates();
  for (const tag of tags) {
    const normalized = normalizeLocaleTag(tag);
    if (normalized) return normalized;
  }

  return FALLBACK_LOCALE;
}

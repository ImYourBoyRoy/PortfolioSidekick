// ./sidekick/src/i18n/translator.js
/**
 * Simple ICU-ish {var} interpolation with English fallback per key.
 */
import { FALLBACK_LOCALE } from './locales.js';
import { MESSAGE_CATALOG } from './messages/index.js';

/**
 * @param {string} template
 * @param {Record<string, string | number | undefined | null>} [vars]
 */
export function interpolate(template, vars = {}) {
  if (!vars || typeof vars !== 'object') return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

/**
 * @param {string} locale
 * @returns {(key: string, vars?: Record<string, string | number | undefined | null>) => string}
 */
export function createTranslator(locale) {
  const active = MESSAGE_CATALOG[locale] ?? MESSAGE_CATALOG[FALLBACK_LOCALE];
  const fallback = MESSAGE_CATALOG[FALLBACK_LOCALE];

  return function t(key, vars) {
    const template = active[key] ?? fallback[key] ?? key;
    return interpolate(template, vars);
  };
}

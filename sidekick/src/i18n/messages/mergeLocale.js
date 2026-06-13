// ./sidekick/src/i18n/messages/mergeLocale.js
/**
 * Merge locale-specific overrides onto the English catalog (runtime fallback stays in translator).
 */
import { enUS } from './en-US.js';

/**
 * @param {Partial<typeof enUS>} overrides
 * @returns {typeof enUS}
 */
export function mergeLocale(overrides) {
  return { ...enUS, ...overrides };
}

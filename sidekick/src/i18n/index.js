// ./sidekick/src/i18n/index.js
export { I18nProvider } from './I18nProvider.jsx';
export { useI18n } from './useI18n.js';
export {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  SYSTEM_LOCALE_PREFERENCE,
  getLocaleMeta,
} from './locales.js';
export {
  detectDeviceLocale,
  normalizeLocaleTag,
  resolveAppLocale,
} from './resolveLocale.js';
export { createTranslator } from './translator.js';

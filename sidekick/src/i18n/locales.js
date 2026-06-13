// ./sidekick/src/i18n/locales.js
/**
 * Supported UI locales (BCP 47) — top languages spoken at home in the US, en-US fallback.
 */
import { toBcp47Tag } from './bcp47.js';

export const FALLBACK_LOCALE = 'en-US';

/** @typedef {{ code: string, name: string, nativeName: string, rtl?: boolean }} LocaleMeta */

/** @type {LocaleMeta[]} */
export const SUPPORTED_LOCALES = [
  { code: 'en-US', name: 'English (United States)', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'vi-VN', name: 'Vietnamese (Vietnam)', nativeName: 'Tiếng Việt' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

export const SUPPORTED_LOCALE_CODES = new Set(SUPPORTED_LOCALES.map((l) => l.code));

/**
 * Maps device / legacy tags (lowercase) → canonical supported BCP 47 code.
 * Language-only tags are used when we do not ship regional variants (es, ar, fr, …).
 */
export const LOCALE_ALIASES = {
  en: 'en-US',
  'en-us': 'en-US',
  'en-gb': 'en-US',
  es: 'es',
  'es-us': 'es',
  'es-mx': 'es',
  'es-es': 'es',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-tw': 'zh-CN',
  'zh-hant': 'zh-CN',
  'zh-hk': 'zh-CN',
  tl: 'tl',
  fil: 'tl',
  'tl-ph': 'tl',
  vi: 'vi-VN',
  'vi-vn': 'vi-VN',
  ar: 'ar',
  'ar-sa': 'ar',
  fr: 'fr',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  ko: 'ko',
  'ko-kr': 'ko',
  ru: 'ru',
  'ru-ru': 'ru',
  pt: 'pt-BR',
  'pt-br': 'pt-BR',
  'pt-pt': 'pt-BR',
  de: 'de',
  'de-de': 'de',
  hi: 'hi',
  'hi-in': 'hi',
};

export const SYSTEM_LOCALE_PREFERENCE = 'system';

export function getLocaleMeta(code) {
  const canonical = toBcp47Tag(code);
  return SUPPORTED_LOCALES.find((l) => l.code === canonical)
    ?? SUPPORTED_LOCALES.find((l) => l.code === code)
    ?? SUPPORTED_LOCALES[0];
}

export function isRtlLocale(code) {
  return Boolean(getLocaleMeta(code).rtl);
}

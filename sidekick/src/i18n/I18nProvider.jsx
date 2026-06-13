// ./sidekick/src/i18n/I18nProvider.jsx
/**
 * React context for locale detection, persistence, and shell translations.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { localDb } from '../serverless/database.js';
import { I18nContext } from './I18nContext.js';
import {
  SYSTEM_LOCALE_PREFERENCE,
  SUPPORTED_LOCALES,
  getLocaleMeta,
  isRtlLocale,
} from './locales.js';
import { detectDeviceLocale, normalizeLocaleTag, resolveAppLocale } from './resolveLocale.js';
import { createTranslator } from './translator.js';

/** @typedef {{ locale: string, preference: string, deviceLocale: string, rtl: boolean, t: ReturnType<typeof createTranslator>, setLocalePreference: (pref: string) => void, supportedLocales: typeof SUPPORTED_LOCALES, getLocaleMeta: typeof getLocaleMeta }} I18nContextValue */

function readSavedPreference() {
  try {
    const raw = localDb.getSettings().localePreference ?? SYSTEM_LOCALE_PREFERENCE;
    if (raw === SYSTEM_LOCALE_PREFERENCE) return raw;
    const normalized = normalizeLocaleTag(raw);
    if (normalized && normalized !== raw) {
      localDb.saveSettings({ localePreference: normalized });
    }
    return normalized ?? SYSTEM_LOCALE_PREFERENCE;
  } catch {
    return SYSTEM_LOCALE_PREFERENCE;
  }
}

export function I18nProvider({ children }) {
  const [preference, setPreference] = useState(readSavedPreference);
  const [deviceLocale, setDeviceLocale] = useState(detectDeviceLocale);

  useEffect(() => {
    const refresh = () => setDeviceLocale(detectDeviceLocale());
    window.addEventListener('languagechange', refresh);
    return () => window.removeEventListener('languagechange', refresh);
  }, []);

  const locale = useMemo(
    () => resolveAppLocale({ preference, deviceTags: [deviceLocale] }),
    [preference, deviceLocale],
  );

  const t = useMemo(() => createTranslator(locale), [locale]);
  const rtl = isRtlLocale(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = rtl ? 'rtl' : 'ltr';
  }, [locale, rtl]);

  const setLocalePreference = useCallback((pref) => {
    const next = pref || SYSTEM_LOCALE_PREFERENCE;
    const stored = next === SYSTEM_LOCALE_PREFERENCE ? next : (normalizeLocaleTag(next) ?? SYSTEM_LOCALE_PREFERENCE);
    setPreference(stored);
    localDb.saveSettings({ localePreference: stored });
  }, []);

  const value = useMemo(() => ({
    locale,
    preference,
    deviceLocale,
    rtl,
    t,
    setLocalePreference,
    supportedLocales: SUPPORTED_LOCALES,
    getLocaleMeta,
  }), [locale, preference, deviceLocale, rtl, t, setLocalePreference]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

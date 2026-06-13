// ./sidekick/src/i18n/resolveLocale.test.js
import { describe, expect, it } from 'vitest';
import {
  detectDeviceLocale,
  normalizeLocaleTag,
  resolveAppLocale,
} from './resolveLocale.js';
import { FALLBACK_LOCALE, SYSTEM_LOCALE_PREFERENCE } from './locales.js';

describe('normalizeLocaleTag', () => {
  it('canonicalizes en-US from device tags', () => {
    expect(normalizeLocaleTag('en-US')).toBe('en-US');
    expect(normalizeLocaleTag('en-us')).toBe('en-US');
    expect(normalizeLocaleTag('en')).toBe('en-US');
  });

  it('maps Spanish regional tags to es', () => {
    expect(normalizeLocaleTag('es-MX')).toBe('es');
    expect(normalizeLocaleTag('es_US')).toBe('es');
  });

  it('maps Chinese variants to zh-CN', () => {
    expect(normalizeLocaleTag('zh-CN')).toBe('zh-CN');
    expect(normalizeLocaleTag('zh-TW')).toBe('zh-CN');
    expect(normalizeLocaleTag('zh')).toBe('zh-CN');
  });

  it('maps Filipino alias fil to tl', () => {
    expect(normalizeLocaleTag('fil-PH')).toBe('tl');
  });

  it('maps Vietnamese tags to vi-VN', () => {
    expect(normalizeLocaleTag('vi-VN')).toBe('vi-VN');
    expect(normalizeLocaleTag('vi')).toBe('vi-VN');
  });

  it('maps Portuguese tags to pt-BR', () => {
    expect(normalizeLocaleTag('pt-BR')).toBe('pt-BR');
    expect(normalizeLocaleTag('pt')).toBe('pt-BR');
  });

  it('returns null for unsupported languages', () => {
    expect(normalizeLocaleTag('ja-JP')).toBeNull();
  });
});

describe('resolveAppLocale', () => {
  it('falls back to en-US when device language is unsupported', () => {
    expect(resolveAppLocale({ deviceTags: ['ja-JP'] })).toBe(FALLBACK_LOCALE);
    expect(FALLBACK_LOCALE).toBe('en-US');
  });

  it('uses saved preference when set', () => {
    expect(resolveAppLocale({ preference: 'vi-VN', deviceTags: ['en-US'] })).toBe('vi-VN');
    expect(resolveAppLocale({ preference: 'vi', deviceTags: ['en-US'] })).toBe('vi-VN');
  });

  it('ignores invalid saved preference and uses device', () => {
    expect(resolveAppLocale({ preference: 'ja', deviceTags: ['fr-CA'] })).toBe('fr');
  });

  it('follows device when preference is system', () => {
    expect(resolveAppLocale({
      preference: SYSTEM_LOCALE_PREFERENCE,
      deviceTags: ['ko-KR'],
    })).toBe('ko');
  });
});

describe('detectDeviceLocale', () => {
  it('returns a supported BCP 47 locale string', () => {
    const locale = detectDeviceLocale();
    expect(typeof locale).toBe('string');
    expect(locale.length).toBeGreaterThan(0);
  });
});

// ./sidekick/src/i18n/translator.test.js
import { describe, expect, it } from 'vitest';
import { createTranslator, interpolate } from './translator.js';

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('Hello {name}', { name: 'Roy' })).toBe('Hello Roy');
  });
});

describe('createTranslator', () => {
  it('returns Spanish tab labels for es locale', () => {
    const t = createTranslator('es');
    expect(t('tabs.settings')).toBe('Ajustes');
  });

  it('falls back to English for missing keys', () => {
    const t = createTranslator('es');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('falls back to English strings for partial locales', () => {
    const t = createTranslator('tl');
    expect(t('sync.step0')).toContain('Robinhood');
  });

  it('returns full Vietnamese shell strings', () => {
    const t = createTranslator('vi-VN');
    expect(t('sync.step0')).toContain('Robinhood');
    expect(t('settings.languageSelectLabel')).toBe('Ngôn ngữ hiển thị');
  });
});

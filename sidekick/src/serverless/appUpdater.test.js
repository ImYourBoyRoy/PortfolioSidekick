// ./sidekick/src/serverless/appUpdater.test.js
import { describe, expect, it } from 'vitest';
import { canSelfInstallUpdate, sanitizeUpdateFilename } from './appUpdater.js';

describe('appUpdater', () => {
  it('canSelfInstallUpdate covers all release platforms', () => {
    expect(canSelfInstallUpdate('windows')).toBe(true);
    expect(canSelfInstallUpdate('macos')).toBe(true);
    expect(canSelfInstallUpdate('linux')).toBe(true);
    expect(canSelfInstallUpdate('android')).toBe(true);
    expect(canSelfInstallUpdate('unknown')).toBe(false);
  });

  it('sanitizeUpdateFilename strips unsafe characters', () => {
    expect(sanitizeUpdateFilename('PortfolioSidekick-Windows.exe')).toBe('PortfolioSidekick-Windows.exe');
    expect(sanitizeUpdateFilename('bad name!.apk')).toBe('bad_name_.apk');
  });
});

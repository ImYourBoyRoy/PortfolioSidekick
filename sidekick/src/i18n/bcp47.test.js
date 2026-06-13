// ./sidekick/src/i18n/bcp47.test.js
import { describe, expect, it } from 'vitest';
import { toBcp47Tag } from './bcp47.js';

describe('toBcp47Tag', () => {
  it('formats language-region tags', () => {
    expect(toBcp47Tag('en-us')).toBe('en-US');
    expect(toBcp47Tag('vi-vn')).toBe('vi-VN');
    expect(toBcp47Tag('pt-br')).toBe('pt-BR');
  });

  it('formats script subtags', () => {
    expect(toBcp47Tag('zh-hans-cn')).toBe('zh-Hans-CN');
  });
});

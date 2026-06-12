// ./sidekick/src/serverless/nativeHttp.test.js
import { describe, expect, it } from 'vitest';
import { coerceHttpBodyToText, parseHttpJsonBody } from './nativeHttp.js';

describe('nativeHttp JSON coercion', () => {
  it('parseHttpJsonBody accepts pre-parsed Capacitor objects', () => {
    const release = { tag_name: 'v1.7.32', assets: [{ name: 'PortfolioSidekick-Android.apk' }] };
    expect(parseHttpJsonBody(release)).toEqual(release);
  });

  it('parseHttpJsonBody parses JSON strings', () => {
    expect(parseHttpJsonBody('{"tag_name":"v1.7.32"}')).toEqual({ tag_name: 'v1.7.32' });
  });

  it('coerceHttpBodyToText stringifies objects instead of [object Object]', () => {
    const text = coerceHttpBodyToText({ tag_name: 'v1.7.32' });
    expect(text).toBe('{"tag_name":"v1.7.32"}');
    expect(text).not.toContain('[object Object]');
  });

  it('parseHttpJsonBody returns null for invalid JSON text', () => {
    expect(parseHttpJsonBody('{bad')).toBeNull();
    expect(parseHttpJsonBody('')).toBeNull();
  });
});

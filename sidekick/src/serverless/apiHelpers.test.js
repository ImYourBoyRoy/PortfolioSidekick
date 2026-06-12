// ./sidekick/src/serverless/apiHelpers.test.js
import { describe, expect, it } from 'vitest';
import { parseJsonBody, badJsonResponse, notFoundResponse } from './apiHelpers.js';

describe('apiHelpers', () => {
  it('parseJsonBody accepts valid JSON objects', () => {
    expect(parseJsonBody('{"profile_id":1}')).toEqual({ profile_id: 1 });
    expect(parseJsonBody('')).toEqual({});
  });

  it('parseJsonBody returns null for invalid JSON', () => {
    expect(parseJsonBody('{bad')).toBeNull();
  });

  it('badJsonResponse returns 400', async () => {
    const res = badJsonResponse();
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: 'Invalid JSON body' });
  });

  it('notFoundResponse returns 404', async () => {
    const res = notFoundResponse('GET', '/api/missing');
    expect(res.status).toBe(404);
    expect((await res.json()).detail).toContain('GET');
  });
});

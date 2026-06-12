// ./sidekick/src/serverless/apiHelpers.js
/**
 * Shared helpers for the embedded serverless API router.
 *
 * Created by: Roy Dawson IV
 */

/** @returns {object|null} Parsed object, or null when body is invalid JSON. */
export function parseJsonBody(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

export function badJsonResponse() {
  return { ok: false, status: 400, json: async () => ({ detail: 'Invalid JSON body' }) };
}

export function notFoundResponse(method, path) {
  return {
    ok: false,
    status: 404,
    json: async () => ({ detail: `Route not found: ${method} ${path}` }),
  };
}

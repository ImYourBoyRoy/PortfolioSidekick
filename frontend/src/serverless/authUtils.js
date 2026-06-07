// ./frontend/src/serverless/authUtils.js
/**
 * Shared Robinhood auth helpers used by robinhood.js and robinhoodAuth.js.
 *
 * Created by: Roy Dawson IV
 */

export function isSandboxUsername(username) {
  const u = (username || '').toLowerCase();
  return u === 'sandbox' || u === 'example' || u.includes('test');
}

// ./frontend/src/serverless/robinhoodAuthCore.js
/**
 * Embedded Robinhood HTTP primitives ported from the open-source robin_stocks package
 * (MIT, jmfernandes/robin_stocks). Used on all platforms via fetch / Capacitor native
 * HTTP — no PyPI robin_stocks dependency at runtime.
 *
 * Created by: Roy Dawson IV
 */

export const RH_CLIENT_ID = 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS';

export const RH_URLS = {
  login: 'https://api.robinhood.com/oauth2/token/',
  pathfinder: 'https://api.robinhood.com/pathfinder/user_machine/',
  challengeRespond: (id) => `https://api.robinhood.com/challenge/${id}/respond/`,
  inquiries: (machineId) => `https://api.robinhood.com/pathfinder/inquiries/${machineId}/user_view/`,
  pushStatus: (id) => `https://api.robinhood.com/push/${id}/get_prompts_status/`,
  positions: 'https://api.robinhood.com/positions/?nonzero=true',
  instruments: 'https://api.robinhood.com/instruments/',
  quotes: (symbol) => `https://api.robinhood.com/quotes/${symbol}/`,
};

/** Mirrors robin_stocks.robinhood.authentication.generate_device_token */
export function generateDeviceToken() {
  const rands = new Uint8Array(16);
  crypto.getRandomValues(rands);
  const hexa = Array.from({ length: 256 }, (_, i) => ((i + 256).toString(16)).slice(1));
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += hexa[rands[i]];
    if ([3, 5, 7, 9].includes(i)) token += '-';
  }
  return token;
}

const FETCH_TIMEOUT_MS = 45000;

const BASE_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'gzip,deflate,br',
  'Accept-Language': 'en-US,en;q=1',
  'X-Robinhood-API-Version': '1.431.4',
  Connection: 'keep-alive',
  'User-Agent': 'PortfolioSidekick/1.7.0',
};

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function formEncodeValue(value) {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function toFormBody(payload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    params.append(key, formEncodeValue(value));
  }
  return params.toString();
}

async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Mirrors robin_stocks helper.request_get for jsonify_data=true */
export async function requestGet(url, auth = null) {
  const headers = { ...BASE_HEADERS };
  if (auth) headers.Authorization = auth;
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!res.ok) return null;
    return parseJsonResponse(res);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Robinhood request timed out. Check your internet connection and try again.', { cause: err });
    }
    return null;
  }
}

/**
 * Mirrors robin_stocks helper.request_post.
 * @param {string} url
 * @param {object} payload
 * @param {{ json?: boolean, auth?: string }} options
 */
export async function requestPost(url, payload, options = {}) {
  const { json = false, auth = null } = options;
  const headers = { ...BASE_HEADERS };
  if (auth) headers.Authorization = auth;

  let body;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
    body = toFormBody(payload);
  }

  try {
    const res = await fetchWithTimeout(url, { method: 'POST', headers, body });
    if (![200, 201, 202, 204, 301, 302, 303, 304, 307, 400, 401, 402, 403].includes(res.status)) {
      return null;
    }
    return parseJsonResponse(res);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Robinhood request timed out. Check your internet connection and try again.', { cause: err });
    }
    return null;
  }
}

export function buildLoginPayload(username, password, deviceToken) {
  return {
    client_id: RH_CLIENT_ID,
    expires_in: 86400,
    grant_type: 'password',
    password,
    scope: 'internal',
    username,
    device_token: deviceToken,
    try_passkeys: false,
    token_request_path: '/login',
    create_read_only_secondary_token: true,
  };
}

export function buildRefreshPayload(refreshToken, deviceToken) {
  return {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'internal',
    client_id: RH_CLIENT_ID,
    expires_in: 86400,
    device_token: deviceToken,
  };
}

export function authHeader(session) {
  const tokenType = session?.token_type || 'Bearer';
  return `${tokenType} ${session.access_token}`;
}

export function sessionPayload(data, deviceToken) {
  return {
    token_type: data.token_type || 'Bearer',
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    device_token: deviceToken,
  };
}

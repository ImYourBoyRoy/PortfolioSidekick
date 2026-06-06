// ./frontend/src/serverless/robinhoodAuthCore.js
/**
 * Robinhood HTTP primitives aligned with robin_stocks helper.py + globals.py.
 * Uses native HTTP per platform (Tauri reqwest, Capacitor native, Vite dev proxy).
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const RH_CLIENT_ID = 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS';

/** robin_stocks helper.request_post default timeout */
const RH_POST_TIMEOUT_MS = 16000;
const RH_GET_TIMEOUT_MS = 16000;

/** robin_stocks SESSION.headers from globals.py */
const BASE_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'gzip,deflate,br',
  'Accept-Language': 'en-US,en;q=1',
  'X-Robinhood-API-Version': '1.431.4',
  Connection: 'keep-alive',
  'User-Agent': '*',
};

let cachedTransport = null;

async function isTauriRuntime() {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

/** Dev browser uses Vite proxy to avoid CORS blocks against api.robinhood.com */
async function resolveApiBase() {
  if (await isTauriRuntime()) return 'https://api.robinhood.com';
  if (Capacitor.isNativePlatform()) return 'https://api.robinhood.com';
  if (import.meta.env?.DEV) return '/robinhood-api';
  return 'https://api.robinhood.com';
}

let apiBasePromise = null;
export async function getRobinhoodApiBase() {
  if (!apiBasePromise) apiBasePromise = resolveApiBase();
  return apiBasePromise;
}

export async function buildRhUrls() {
  const base = await getRobinhoodApiBase();
  return {
    login: `${base}/oauth2/token/`,
    pathfinder: `${base}/pathfinder/user_machine/`,
    challengeRespond: (id) => `${base}/challenge/${id}/respond/`,
    inquiries: (machineId) => `${base}/pathfinder/inquiries/${machineId}/user_view/`,
    pushStatus: (id) => `${base}/push/${id}/get_prompts_status/`,
    positions: `${base}/positions/?nonzero=true`,
    instruments: `${base}/instruments/`,
    quotes: (symbol) => `${base}/quotes/${symbol}/`,
  };
}

/** Legacy sync accessors — prefer buildRhUrls() in async auth paths */
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

/**
 * robin_stocks passes dict payloads to requests.post(data=payload).
 * Booleans become "True"/"False" strings in form bodies.
 */
export function toFormObject(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') out[key] = value ? 'True' : 'False';
    else out[key] = String(value);
  }
  return out;
}

async function resolveTransport() {
  if (cachedTransport) return cachedTransport;
  if (await isTauriRuntime()) {
    cachedTransport = 'tauri';
    return cachedTransport;
  }
  if (Capacitor.isNativePlatform()) {
    cachedTransport = 'capacitor';
    return cachedTransport;
  }
  cachedTransport = 'fetch';
  return cachedTransport;
}

export async function getAuthTransport() {
  return resolveTransport();
}

async function appendAuthLog(line) {
  const entry = `${new Date().toISOString()} ${line}\n`;
  console.info(`[RobinhoodAuth] ${line}`);
  try {
    if (await isTauriRuntime()) {
      const { readStorageFile, writeStorageFile } = await import('./storagePaths.js');
      const existing = await readStorageFile('auth.log');
      const prev = existing ? new TextDecoder().decode(existing) : '';
      const payload = new TextEncoder().encode(prev + entry);
      if (payload.length > 128000) {
        await writeStorageFile('auth.log', new TextEncoder().encode(entry));
      } else {
        await writeStorageFile('auth.log', payload);
      }
    }
  } catch {
    // Logging must never break auth.
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check your internet connection and try again.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function httpRequest(
  method,
  url,
  { headers = {}, body = null, jsonPayload = null, formPayload = null, timeoutMs = RH_POST_TIMEOUT_MS } = {}
) {
  const transport = await resolveTransport();
  const mergedHeaders = { ...BASE_HEADERS, ...headers };
  await appendAuthLog(`${method} ${url} via ${transport}`);

  if (transport === 'tauri') {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const init = {
      method,
      headers: mergedHeaders,
      connectTimeout: timeoutMs,
    };
    if (body !== null) init.body = body;
    const res = await withTimeout(tauriFetch(url, init), timeoutMs + 2000, method);
    const text = await res.text().catch(() => '');
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data, text };
  }

  if (transport === 'capacitor') {
    const options = {
      url,
      method,
      headers: mergedHeaders,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'json',
    };
    if (jsonPayload !== null) {
      options.data = jsonPayload;
    } else if (formPayload !== null) {
      options.data = toFormObject(formPayload);
    }
    const res = await withTimeout(CapacitorHttp.request(options), timeoutMs + 2000, method);
    let data = res.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    const ok = RH_ALLOWED_POST_STATUSES.has(res.status) || (res.status >= 200 && res.status < 300);
    return { ok, status: res.status, data, text: '' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: mergedHeaders,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

const RH_ALLOWED_POST_STATUSES = new Set([200, 201, 202, 204, 301, 302, 303, 304, 307, 400, 401, 402, 403]);

/** Mirrors robin_stocks helper.request_get for jsonify_data=true */
export async function requestGet(url, auth = null) {
  const headers = {};
  if (auth) headers.Authorization = auth;
  try {
    const res = await httpRequest('GET', url, { headers, timeoutMs: RH_GET_TIMEOUT_MS });
    if (!res.ok) {
      await appendAuthLog(`GET ${url} → HTTP ${res.status}`);
      return null;
    }
    return res.data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Robinhood request timed out. Check your internet connection and try again.', { cause: err });
    }
    await appendAuthLog(`GET ${url} failed: ${err?.message || err}`);
    throw err;
  }
}

/** Mirrors robin_stocks helper.request_post (16s timeout, allows 4xx bodies) */
export async function requestPost(url, payload, options = {}) {
  const { json = false, auth = null } = options;
  const headers = {};
  if (auth) headers.Authorization = auth;

  let body;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
    body = new URLSearchParams(toFormObject(payload)).toString();
  }

  try {
    const res = await httpRequest('POST', url, {
      headers,
      body,
      jsonPayload: json ? payload : null,
      formPayload: json ? null : payload,
      timeoutMs: RH_POST_TIMEOUT_MS,
    });
    if (!RH_ALLOWED_POST_STATUSES.has(res.status)) {
      await appendAuthLog(`POST ${url} → HTTP ${res.status}`);
      return null;
    }
    return res.data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Robinhood request timed out. Check your internet connection and try again.', { cause: err });
    }
    await appendAuthLog(`POST ${url} failed: ${err?.message || err}`);
    throw err;
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

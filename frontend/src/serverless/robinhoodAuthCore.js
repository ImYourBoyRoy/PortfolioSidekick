// ./frontend/src/serverless/robinhoodAuthCore.js
/**
 * Robinhood HTTP session aligned with robin_stocks globals.SESSION (requests.Session).
 * Keeps cookies across login → pathfinder → inquiries → push/challenge calls.
 * Uses Tauri native HTTP, CapacitorHttp, or Vite dev proxy.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { isTauriShellSync, readStorageFile, writeStorageFile } from './storagePaths.js';

export const RH_CLIENT_ID = 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS';

const RH_POST_TIMEOUT_MS = 16000;
const RH_GET_TIMEOUT_MS = 16000;

const RH_ALLOWED_STATUSES = new Set([200, 201, 202, 204, 301, 302, 303, 304, 307, 400, 401, 402, 403]);

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

/**
 * Mirrors requests.Session cookie jar — Robinhood ties workflow to session cookies.
 */
class RobinhoodHttpSession {
  constructor() {
    this.cookies = new Map();
  }

  reset() {
    this.cookies.clear();
  }

  ingestSetCookie(raw) {
    if (!raw) return;
    const first = String(raw).split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) return;
    this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }

  ingestHeaders(headers) {
    if (!headers) return;
    if (typeof headers.getSetCookie === 'function') {
      for (const cookie of headers.getSetCookie()) this.ingestSetCookie(cookie);
      return;
    }
    if (typeof headers.forEach === 'function') {
      headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') this.ingestSetCookie(value);
      });
      return;
    }
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (String(key).toLowerCase() === 'set-cookie') this.ingestSetCookie(value);
      }
      return;
    }
    if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'set-cookie') this.ingestSetCookie(value);
      }
    }
  }

  cookieHeader() {
    if (this.cookies.size === 0) return '';
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

let rhHttpSession = new RobinhoodHttpSession();

/** Reset session cookies on fresh credential login (robin_stocks starts a new Session). */
export function resetAuthHttpSession() {
  rhHttpSession.reset();
  cachedTransport = null;
  if (isTauriShellSync()) {
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke('rh_http_reset')).catch(() => {});
  }
}

async function isTauriRuntime() {
  if (isTauriShellSync()) return true;
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    return isTauri();
  } catch {
    return false;
  }
}

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
    accounts: `${base}/accounts/?default_to_all_accounts=true`,
    portfolios: `${base}/portfolios/`,
    instruments: `${base}/instruments/`,
    quotes: (symbol) => `${base}/quotes/${symbol}/`,
    quotesBatch: (symbols) => `${base}/quotes/?symbols=${symbols.join(',')}`,
    portfolioByAccount: (accountNumber) => `${base}/portfolios/${accountNumber}/`,
    dividends: `${base}/dividends/`,
  };
}

export const RH_URLS = {
  login: 'https://api.robinhood.com/oauth2/token/',
  pathfinder: 'https://api.robinhood.com/pathfinder/user_machine/',
  challengeRespond: (id) => `https://api.robinhood.com/challenge/${id}/respond/`,
  inquiries: (machineId) => `https://api.robinhood.com/pathfinder/inquiries/${machineId}/user_view/`,
  pushStatus: (id) => `https://api.robinhood.com/push/${id}/get_prompts_status/`,
  positions: 'https://api.robinhood.com/positions/?nonzero=true',
  accounts: 'https://api.robinhood.com/accounts/?default_to_all_accounts=true',
  portfolios: 'https://api.robinhood.com/portfolios/',
  instruments: 'https://api.robinhood.com/instruments/',
  quotes: (symbol) => `https://api.robinhood.com/quotes/${symbol}/`,
  quotesBatch: (symbols) => `https://api.robinhood.com/quotes/?symbols=${symbols.join(',')}`,
  portfolioByAccount: (accountNumber) => `https://api.robinhood.com/portfolios/${accountNumber}/`,
  dividends: 'https://api.robinhood.com/dividends/',
};

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

/** robin_stocks: requests.post(url, data=payload) — bools encode as True/False */
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
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    if ((await invoke('rh_desktop_ready')) === true) {
      cachedTransport = 'tauri-rust';
      return cachedTransport;
    }
  } catch {
    // Not Tauri desktop — fall through.
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

export function appendAuthLog(line) {
  const entry = `${new Date().toISOString()} ${line}\n`;
  console.info(`[RobinhoodAuth] ${line}`);
  if (!isTauriShellSync()) return;
  void (async () => {
    try {
      const existing = await readStorageFile('auth.log');
      const prev = existing ? new TextDecoder().decode(existing) : '';
      const payload = new TextEncoder().encode(prev + entry);
      if (payload.length > 128000) {
        await writeStorageFile('auth.log', new TextEncoder().encode(entry));
      } else {
        await writeStorageFile('auth.log', payload);
      }
    } catch {
      // Best effort — never block Robinhood HTTP on log I/O.
    }
  })();
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

function parseJsonText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function httpRequest(
  method,
  url,
  { headers = {}, body = null, jsonPayload = null, formPayload = null, timeoutMs = RH_POST_TIMEOUT_MS } = {}
) {
  const transport = await resolveTransport();
  const mergedHeaders = { ...BASE_HEADERS, ...headers };
  const useManualCookies = transport !== 'tauri-rust';
  if (useManualCookies) {
    const cookie = rhHttpSession.cookieHeader();
    if (cookie) mergedHeaders.Cookie = cookie;
  }

  await appendAuthLog(`${method} ${url} via ${transport}`);

  if (transport === 'tauri-rust') {
    const { invoke } = await import('@tauri-apps/api/core');
    const headerObj = {};
    for (const [key, value] of Object.entries(mergedHeaders)) {
      if (key.toLowerCase() === 'cookie') continue;
      headerObj[key] = value;
    }
    const result = await withTimeout(
      invoke('rh_http_request', {
        method,
        url,
        headers: headerObj,
        body: jsonPayload === null ? body : null,
        jsonBody: jsonPayload,
      }),
      timeoutMs + 2000,
      method
    );
    const text = result?.body || '';
    const data = parseJsonText(text);
    const status = result?.status || 0;
    const ok = RH_ALLOWED_STATUSES.has(status) || (status >= 200 && status < 300);
    return { ok, status, data, text, transport };
  }

  if (transport === 'capacitor') {
    const options = {
      url,
      method,
      headers: mergedHeaders,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'json',
      shouldEncodeUrlParams: true,
    };
    if (jsonPayload !== null) options.data = jsonPayload;
    else if (formPayload !== null) options.data = toFormObject(formPayload);

    const res = await withTimeout(CapacitorHttp.request(options), timeoutMs + 3000, method);
    if (useManualCookies) rhHttpSession.ingestHeaders(res.headers);
    let data = res.data;
    if (typeof data === 'string') data = parseJsonText(data);
    const ok = RH_ALLOWED_STATUSES.has(res.status) || (res.status >= 200 && res.status < 300);
    return { ok, status: res.status, data, text: '', transport };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers: mergedHeaders, body, signal: controller.signal });
    if (useManualCookies) rhHttpSession.ingestHeaders(res.headers);
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: parseJsonText(text), text, transport };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestGet(url, auth = null) {
  const headers = {};
  if (auth) headers.Authorization = auth;
  try {
    const res = await httpRequest('GET', url, { headers, timeoutMs: RH_GET_TIMEOUT_MS });
    if (!res.ok && res.status !== 400) {
      await appendAuthLog(`GET ${url} → HTTP ${res.status}`);
      return null;
    }
    return res.data;
  } catch (err) {
    await appendAuthLog(`GET ${url} failed: ${err?.message || err}`);
    throw err;
  }
}

/** Mirrors robin_stocks helper.request_post */
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
    if (!RH_ALLOWED_STATUSES.has(res.status)) {
      await appendAuthLog(`POST ${url} → HTTP ${res.status} body=${res.text?.slice(0, 200) || ''}`);
      return null;
    }
    await appendAuthLog(`POST ${url} → HTTP ${res.status} via ${res.transport}`);
    return res.data;
  } catch (err) {
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

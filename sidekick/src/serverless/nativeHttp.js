// ./sidekick/src/serverless/nativeHttp.js
/**
 * Cross-platform HTTPS for public APIs (GET/POST, text, JSON, binary).
 * Uses CapacitorHttp on Android (bypasses WebView CORS) and fetch elsewhere.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseJsonText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function encodeFormBody(data) {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function absorbSetCookie(headers, jar) {
  if (!headers || !jar) return;
  const raw = headers['set-cookie'] || headers['Set-Cookie'];
  if (!raw) return;
  const parts = Array.isArray(raw) ? raw : [raw];
  for (const line of parts) {
    const segment = String(line).split(';')[0];
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    jar.set(segment.slice(0, eq).trim(), segment.slice(eq + 1).trim());
  }
}

function cookieHeader(jar) {
  if (!jar || jar.size === 0) return '';
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function nativeRequest(method, url, { timeoutMs = 45000, headers = {}, body, responseType = 'text', jar } = {}) {
  const merged = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': DEFAULT_UA,
    ...headers,
  };
  const cookies = cookieHeader(jar);
  if (cookies) merged.Cookie = cookies;

  if (Capacitor.isNativePlatform()) {
    const req = {
      url,
      method,
      headers: merged,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType,
    };
    if (body != null) req.data = body;
    const res = await withTimeout(CapacitorHttp.request(req), timeoutMs + 5000, method);
    absorbSetCookie(res.headers, jar);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init = { method, headers: merged, signal: controller.signal, credentials: 'include' };
    if (body != null) init.body = body;
    const res = await fetch(url, init);
    absorbSetCookie(
      {
        'set-cookie': res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie'),
      },
      jar
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    if (responseType === 'arraybuffer') return { status: res.status, data: await res.arrayBuffer(), headers: res.headers };
    return { status: res.status, data: await res.text(), headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight cookie jar for multi-step government form flows (e.g. Senate eFD). */
export class NativeHttpSession {
  constructor() {
    /** @type {Map<string, string>} */
    this.jar = new Map();
  }

  /**
   * @param {string} url
   * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [options]
   */
  async getText(url, options = {}) {
    const res = await nativeRequest('GET', url, { ...options, jar: this.jar, responseType: 'text' });
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  }

  /**
   * @param {string} url
   * @param {Record<string, string>} formData
   * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [options]
   */
  async postForm(url, formData, options = {}) {
    const body = encodeFormBody(formData);
    const res = await nativeRequest('POST', url, {
      ...options,
      jar: this.jar,
      body,
      responseType: 'text',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    });
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  }

  getCookie(name) {
    return this.jar.get(name) || '';
  }
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [options]
 */
export async function nativeHttpGetText(url, { timeoutMs = 45000, headers = {} } = {}) {
  const res = await nativeRequest('GET', url, { timeoutMs, headers, responseType: 'text' });
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [options]
 */
export async function nativeHttpGetArrayBuffer(url, { timeoutMs = 45000, headers = {} } = {}) {
  const res = await nativeRequest('GET', url, { timeoutMs, headers, responseType: 'arraybuffer' });
  if (res.data instanceof ArrayBuffer) return res.data;
  if (typeof res.data === 'string') return base64ToArrayBuffer(res.data);
  return new ArrayBuffer(0);
}

/**
 * @param {string} url
 * @param {Record<string, string>} formData
 * @param {{ timeoutMs?: number, headers?: Record<string,string>, cookies?: string }} [options]
 */
export async function nativeHttpPostForm(url, formData, { timeoutMs = 45000, headers = {}, cookies } = {}) {
  const body = encodeFormBody(formData);
  const merged = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (cookies) merged.Cookie = cookies;

  const res = await nativeRequest('POST', url, {
    timeoutMs,
    headers: merged,
    body,
    responseType: 'text',
  });
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, headers?: Record<string,string> }} [options]
 */
export async function nativeHttpGet(url, { timeoutMs = 45000, headers = {} } = {}) {
  const text = await nativeHttpGetText(url, { timeoutMs, headers });
  const data = parseJsonText(text);
  if (data === null) throw new Error(`Invalid JSON from ${url}`);
  return data;
}

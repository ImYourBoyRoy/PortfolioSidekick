// ./frontend/src/sidekickClient.js
/**
 * Unified platform transport for Portfolio Sidekick.
 * All platforms route /api/* through the embedded serverless layer (JS).
 * Python FastAPI + robin_stocks are no longer used at runtime.
 *
 * Desktop production runs inside Tauri 2 (Rust shell);
 * Android uses Capacitor; dev uses Vite directly — no backend server required.
 */

import { Capacitor } from '@capacitor/core';
import { serverlessApiFetch } from './serverless/apiRouter';
import { ensureDatabaseReady } from './serverless/database';

function isTauriShell() {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

export function getRuntimeMode() {
  if (isTauriShell()) {
    return 'desktop-shell';
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return 'android-native';
  }
  return 'dev';
}

export function isAndroidNative() {
  return getRuntimeMode() === 'android-native';
}

/** Tauri 2 desktop shell. */
export function isDesktopShell() {
  return getRuntimeMode() === 'desktop-shell';
}

/** User-facing label for Robinhood HTTP transport during login. */
export function robinhoodTransportLabel() {
  if (isDesktopShell()) return 'native Rust HTTP';
  if (isAndroidNative()) return 'secure mobile HTTP';
  return 'embedded HTTP';
}

/** Short hint when Robinhood login stalls or times out. */
export function robinhoodLoginDebugHint() {
  if (isDesktopShell()) {
    return ' Open <exe>/data/auth.log and share the last 5 lines.';
  }
  if (isAndroidNative()) {
    return ' Try again on Wi‑Fi, approve MFA in the Robinhood app, or reinstall the latest APK from GitHub Releases.';
  }
  return '';
}

/**
 * Drop-in fetch replacement for App.jsx API calls.
 * Path should be like `/profiles` or `/portfolio/holdings?profile_id=1` (with or without /api prefix).
 */
export async function sidekickFetch(path, options = {}) {
  await ensureDatabaseReady();
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  return serverlessApiFetch(normalized, options);
}

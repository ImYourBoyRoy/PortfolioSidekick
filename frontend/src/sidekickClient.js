// ./frontend/src/sidekickClient.js
/**
 * Unified platform transport for Portfolio Sidekick.
 * All platforms route /api/* through the embedded serverless layer (JS).
 * Python FastAPI + robin_stocks are no longer used at runtime.
 *
 * Desktop production still loads inside pywebview for the native window shell;
 * Android uses Capacitor; dev uses Vite directly — no backend server required.
 */

import { Capacitor } from '@capacitor/core';
import { serverlessApiFetch } from './serverless/apiRouter';

export function getRuntimeMode() {
  if (typeof window !== 'undefined' && window.pywebview?.api?.api_call) {
    return 'desktop-shell';
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return 'android-native';
  }
  return 'dev';
}

/** True when the app uses the embedded JS backend (all current runtimes). */
export function isServerlessBackend() {
  return true;
}

export function isAndroidNative() {
  return getRuntimeMode() === 'android-native';
}

/** Desktop pywebview window shell (Python API no longer invoked). */
export function isDesktopShell() {
  return getRuntimeMode() === 'desktop-shell';
}

/** @deprecated Use isDesktopShell — kept for callers that check pywebview presence. */
export function isDesktopIpc() {
  return isDesktopShell();
}

/**
 * Drop-in fetch replacement for App.jsx API calls.
 * Path should be like `/profiles` or `/portfolio/holdings?profile_id=1` (with or without /api prefix).
 */
export async function sidekickFetch(path, options = {}) {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  return serverlessApiFetch(normalized, options);
}

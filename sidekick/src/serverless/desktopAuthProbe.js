// ./sidekick/src/serverless/desktopAuthProbe.js
/**
 * Probes auth shell readiness at startup — Tauri desktop vs Capacitor Android vs dev browser.
 * Surfaces platform-appropriate status in the Robinhood login modal.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '../lib/appVersion';
import { isAndroidNative, isDesktopShell } from '../lib/sidekickClient';
import { isTauriShellSync } from './storagePaths';

/**
 * @returns {Promise<{
 *   version: string,
 *   platform: 'desktop' | 'android' | 'dev',
 *   isTauri: boolean,
 *   rustAuth: boolean,
 *   vaultReady: boolean,
 *   dataPath: string | null,
 *   authLogExists: boolean,
 * }>}
 */
export async function probeDesktopAuth() {
  const base = {
    version: APP_VERSION,
    platform: 'dev',
    isTauri: false,
    rustAuth: false,
    vaultReady: false,
    dataPath: null,
    authLogExists: false,
  };

  if (isAndroidNative()) {
    let vaultReady = false;
    try {
      vaultReady = Capacitor.isPluginAvailable('RobinhoodSession');
    } catch {
      // Plugin probe failed.
    }
    return {
      ...base,
      platform: 'android',
      vaultReady,
    };
  }

  if (!isDesktopShell() || !isTauriShellSync()) {
    return base;
  }

  const result = {
    ...base,
    platform: 'desktop',
    isTauri: true,
  };

  try {
    const { invoke } = await import('@tauri-apps/api/core');

    try {
      result.dataPath = await invoke('portable_data_path');
    } catch {
      // Portable path command unavailable.
    }

    try {
      result.rustAuth = (await invoke('rh_desktop_ready')) === true;
    } catch {
      // Native auth commands blocked or missing from this build.
    }

    if (result.dataPath) {
      try {
        result.authLogExists = (await invoke('portable_file_exists', { filename: 'auth.log' })) === true;
      } catch {
        // Best effort.
      }
    }

    try {
      await invoke('auth_log_append', {
        line: `js probe v${APP_VERSION} rust=${result.rustAuth} authLog=${result.authLogExists}`,
      });
    } catch {
      // Best effort.
    }
  } catch {
    result.isTauri = false;
    result.platform = 'dev';
  }

  return result;
}

/** @param {Awaited<ReturnType<typeof probeDesktopAuth>> | null | undefined} probe */
export function authShellIsReady(probe) {
  if (!probe) return false;
  if (probe.platform === 'android') return probe.vaultReady === true;
  if (probe.platform === 'desktop') return probe.rustAuth === true && probe.authLogExists === true;
  return false;
}

export function desktopAuthReadyMessage(probe) {
  if (!probe) return '';

  if (probe.platform === 'android') {
    if (probe.vaultReady) {
      return `Android · v${probe.version} · encrypted on-device vault · sessions stay on this phone (not synced to desktop)`;
    }
    return `Android secure vault unavailable — reinstall PortfolioSidekick-Android.apk v${probe.version}+ from GitHub Releases.`;
  }

  if (probe.platform === 'dev') {
    return 'Robinhood login requires the Tauri desktop app or Android APK — not the browser dev server alone.';
  }

  if (probe.rustAuth && probe.authLogExists) {
    return `Native auth ready · v${probe.version} · encrypted vault · ${probe.dataPath}`;
  }
  if (probe.rustAuth && !probe.authLogExists) {
    return `Native auth loaded but auth.log missing — restart after rebuilding v${probe.version}. Data: ${probe.dataPath}`;
  }
  return `Wrong build — rebuild with scripts/build-windows.ps1, run target/release/portfolio-sidekick.exe v${probe.version}. Data: ${probe.dataPath || '<exe>/data'}`;
}
